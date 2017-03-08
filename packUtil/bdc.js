//bowlder collector
/* 收集步骤
   1. 根据project.json中packModuleDir参数，收集逐个模块依赖，收集后的js随主页面一起发布
   2. 遍历项目页面文件，找到所有使用bowlder.js的主文件
   3. 逐个文件收集
      - 内联所有ssi碎片，inc/*和cms项目中的线上碎片除外
      - 解析ne-alias指令，将别名存储到bowlderAlias
      - (new Collector).init();
      - 收集普通js，将headScript放置到<head>里，_keep标识的script保持不动
        codes: {js: 模块定义, purejs: 非amd脚本, headScript, commonJS, commonLink, commonJSFirst}
      - 收集bowlder模块和插件
      - collectedCss => codes.css
      - codes.purejs+codes.js+skinDefine
      - 生成collect/head~${md5css}.css和inc/head~file.html
      - 生成collect/foot~${md5js}.js和inc/foot~file.html
      - 如果有first收集器，生成collect/first~${md5first}.js和inc/first~file.html
   4. 测试页面: http://127.0.0.1:8990/dist/${project}/html4dev/file.html
               http://127.0.0.1:8990/dist/${project}/html/file.html
  */
var fs = require('fs');
var path = require('path');
var ENV = process.env;
var pwd = process.cwd();
var util = require('../lib/util4go');
var conf = util.conf;
var log = util.log;
var vc = util.vc;
var projectJson = util.projectJson;
if(!projectJson.depends){
    projectJson.depends = {};
}
var $$ = require('../lib/bowlder');
var queryCmsPath = require('../distUtil/cmspath');
var project = ENV.GO_PIPELINE_NAME;
var stage = ENV.GO_STAGE_NAME;
var execSync = util.execSync;
var writeTmp = util.writeTmp;
var readWork = util.readWork;
var writeWork = util.writeWork;
var vcver = ENV.GO_REVISION || 1;  //代码仓库版本
var headScriptMap = {
    'http://img1.cache.netease.com/cnews/js/ntes_jslib_1.x.js': 1,
    'http://img1.cache.netease.com/f2e/lib/js/ne.js': 1
};
var cdnDefines = {
    '/modules/echarts/lib/echarts.js': 'http://img1.cache.netease.com/f2e/modules/echarts/lib/echarts.js'
};
var firstCollector = '<!--!include collector="first"-->';
var collectComments = [];
var js2first = 'js';

function cdnDefine(file){
    return (projectJson.excludeAMD && projectJson.excludeAMD[file]) || cdnDefines[file];
}
var tmpDir = util.tmpDir;
var bdDir = {
    res: util.getFolder(`${util.distDir}/collect`, 1) //收集后的js/css
};
var logfiles = util.logfiles, logfmts = util.logfmts;
var collectorRex = /<!--!include\s+collector=|<script\s.*?bowlder[\-\d\.]*?\.js/;
var state; //单个页面收集过程中的状态变量

function collectFiles(htmlDir){ //找到需要处理的文件列表
    var files = [];
    util.lsr(htmlDir, /\.s?html?$/).forEach(file => {
        var html = util.readTmp(file);
        var base = file.replace(htmlDir + '/', '');
        if(projectJson.collectHtmls && projectJson.collectHtmls[base] || collectorRex.test(html)){
            files.push(file);
        }
    });
    return files;
}

function DevCollector(){ //测试阶段收集器
    this.parentHtmls = {}; //已经收集过的主页面
    this.defined = {}; //收集过的module js
    this.predefined = {};  //和defined形成补充，用于避免死循环
    this.collectedCss = [];
    this.skins = {};
    this.css = [];  //@import语法，供第一阶段测试，包含_drop="true"的内容
    this.codes = {js:'', css:'', commonLink:'', headScript:'', first:'', commonJSFirst:'', commonJS:'', purejs:''};
}
DevCollector.prototype = {
    init: async function(html, htmlfile, isSub){
        var bdc = this;
        bdc.urlRoot = `${conf.devHost}/${vc.cdnfix}` + global.VCPATH;
        state.commonCode = "commonJSFirst";
        var reg = new RegExp(`([^<>]*?)\\sne-module\\s*=\\s*(['"])([^'"<]*?)\\2((>|[\\s\\S]*?[^\\%]>)[\\s\\S]*?<[^!])|${firstCollector}`, 'ig');
        html = await util.replaceAsync(html, reg, async function(all, m1, m2, m3, m4){
            return await bdc.procModule(m1, m3, m4, all)
        });
        if(!isSub){
            bdc.codes.purejs += bdc.codes.js; //此处缓存为了避免procPlugin时，碰到firstCollector便把所有js均放到codes.first内
            bdc.codes.js = '';
        }
        state.commonCode = "commonJSFirst";
        html = html.replace(new RegExp(`([^<>]*?)\\sne-plugin\\s*=\\s*(['"])([^'"<]*?)\\2|${firstCollector}`, 'g'), function(all, m1, m2, m3){
            return bdc.procPlugin(m1, m3, all);
        });
        //project.json里指定的打包内容
        var depends = projectJson.depends[htmlfile];
        var dependsExclude = projectJson.dependsExclude && projectJson.dependsExclude[htmlfile];
        if(depends){
            log(`打包额外的模块: ${depends}\n`);
            depends = depends.replace(/(^| )\//g, `$1${vc.localhost}/`);
            var excludes = {};
            if (dependsExclude) {
                dependsExclude = dependsExclude.replace(/(^| )\//g, `$1${vc.localhost}/`);
                util.lsr('.', dependsExclude).forEach(function(file){
                    excludes[file] = 1;
                });
            }
            await $$.reducePromise(util.lsr('.', depends), async function(file){//额外模块
                if(!fs.existsSync(file) || excludes[file]){
                    return;
                }
                var moduleid = util.fulldir(file, "/" + vc.cdnfix + vc.path);
                moduleid = moduleid.replace(vc.localhost, '');
                if(/\.html$/.test(file)){
                    log(`Skin: ${file}\n`);
                    util.stack(`出错文件: ${file}`);
                    var tmp = readWork(file);
                    if(/<\/html>\s*$/i.test(tmp)){ //不把完整的demo页面作为皮肤
                        return;
                    }
                    var modulePath = moduleid.replace(/[^/]*$/, '');
                    var moduleHost = '/';
                    if(~moduleid.indexOf('//')){
                        moduleHost = moduleid;
                        moduleHost = moduleHost.replace(/(\/\/.*?\/).*/, '$1');
                    }
                    //fix @ path
                    tmp = tmp.replace(/((href|ne-module|ne-plugin|ne-extend)=['"])\@\//g, `$1${moduleHost}`);
                    tmp = tmp.replace(/((href|ne-module|ne-plugin|ne-extend)=['"])\@/g, `$1${modulePath}`);
                    bdc.skins[moduleid] = bdc.fixSkin(tmp);
                    moduleid = moduleid.replace(/\.html$/, '.js');
                    if(!fs.existsSync(`${vc.localhost}${moduleid}`)){
                        moduleid = moduleid.replace(/\.\w+\.js$/, '.js');
                    }
                    util.stack([]);
                }
                if(/\/\w+$/.test(moduleid)){
                    moduleid += ".js";
                }
                if(/\.js/.test(moduleid) && fs.existsSync(`${vc.localhost}${moduleid}`)){
                    await bdc.procModule("", moduleid, "");
                }
            });
        }
        return html;
    },  
    fixSkin: async function (tmp){
        var bdc = this;
        tmp = await (new DevCollector).init(tmp, '', 1);
        tmp = tmp.replace(/<link ([\s\S]*?)>/ig, function(all, m1){
            return bdc.moduleLink(m1);
        });
        tmp = tmp.replace(/<img([^>]*?)>/ig, function(all, m1){
            return util.expandIMGPath(m1);
        });
        tmp = tmp.replace(/\t/g, ' ');
        return tmp;
    },
    addCss: function (file){
        var bdc = this;
        if(bdc.collectedCss.indexOf(file) != -1){
            return;
        }
        bdc.collectedCss.push(file);
    },
    moduleLink: function (attr){
        var bdc = this;
        if (/href\s*=\s*(['"])\s*(\S+)\s*\1/.test(attr)){
            bdc.addCss(RegExp.$2);
            return "";
        }
        return `<link ${attr}>`;
    },
    addJs: async function (file, referURL){ //普通js依赖(!*.js)
        var bdc = this;
        //为正式版收集js
        var revert;
        await $$.reducePromise(file.split(/\s*;\s*/), async function(src){
            var bowlderSrc = 0;
            src = util.fulldir(src, referURL);
            var gbk = 0;
            src = src.replace(/\@([\w\-]+)$/, function(all, m1){
                var charset = m1;
                if (/gb/i.test(charset)) {
                    gbk = 1;
                }
            });
            if (!bdc.defined["!"+src]) {
                if (headScriptMap[src]) {
                    bdc.codes.headScript += `<script src="${src}"></script>\n`;
                } else if (/\.com\/(common|libs)\//.test(src)) {
                    bdc.codes[state.commonCode] += `<script src="${src}"></script>\n`;
                } else if (/\.com\/(modules\/bowlder\-[\d\.]+?\.js([\#\?].*)?)/.test(src)) {
                    bdc.codes.commonJSFirst += `<script src="${vc.resRoot}/${RegExp.$1}"></script>\n`;
                } else {
                    global.jscount ++;
                }
                bdc.defined[`!${src}`] = 1;
            }
        });
    },
    procExtend: function (filestr){ //收集extend中的模块
        var bdc = this;
        var files = [];
        filestr.split(/\s*;\s*/).forEach(function(file){
            if (!/^\%/.test(file)) {
                if(!/{{.*?}}/.test(file)){
                    file = util.fulldir(file, bdc.urlRoot);
                }
            }
            files.push(file);
        });
        var fileStr = files.join("\n;");
        return ` ne-extend="${fileStr}"`;
    },
    procText: function (fileURL){ //收集text类型define
        var bdc = this;
        if (!bdc.defined[`text!${fileURL}`]) {
            var text = util.fetchUrl(fileURL)
                .replace(/\n/g, '\\n')
                .replace(/"/g, '\\"');
            var safename = fileURL.replace(/^http:\/\/.*?\//, '/');
            bdc.codes.js += `bowlder.define("${safename}","${text}");\n`;
            bdc.defined[`text!${fileURL}`] = 1;
        }
    },
    procDefine: async function (fileURL, avoidLock){ //收集各种define
        var bdc = this;
        var jstmp = '';
        if(/\%/.test(fileURL) || (avoidLock && bdc.predefined[fileURL])){
            return;
        }else if(!/reg\.163\.com/.test(fileURL)){  //不打包常用类库或urs库
            bdc.predefined[fileURL] = 1;
            if (!bdc.defined[fileURL]) {
                bdc.defined[fileURL] = 1;
            } else {
                jstmp = bdc.defined[fileURL];
            }
        }
        return jstmp;
    },
    procPlugin: function (pre, basenames, match){
        var bdc = this;
        if(match == firstCollector){
            state.commonCode = "commonJS";
            bdc.codes.first += bdc.codes.js;
            bdc.codes.js = '';
            return match;
        }
        log(`Plugin: ${basenames}\n`);
        var filearr = [];
        basenames.split(/\s*;\s*/).forEach(function(basename){
            var file = util.fulldir(basename, bdc.urlRoot);
            if(file){
                filearr.push(file);
            }
        });
        var filenames = filearr.join(";");
        if(filenames){
            var pluginAttr = `ne-plugin="${filenames}"`;
            return pre+' '+pluginAttr;
        }else{
            return pre;
        }
    },
    procModule: async function (pre, basename, content, match){
        var bdc = this;
        if(match == firstCollector){
            state.commonCode = "commonJS";
            bdc.codes.first += bdc.codes.js;
            bdc.codes.js = '';
            return match;
        }
        log(`Module: ${basename}\n`);
        var file =  util.fulldir(basename, bdc.urlRoot);
        if(/\/\w+$/.test(file)){
            file += ".js";
        }
        var format = path.extname(file);

        var moduleAttr = 'ne-module=""'; //html文件的ne-module值置空
        if(format != 'html') {
            var safename = file;
            moduleAttr = `ne-module="${safename}"`;
        }
        pre = pre.replace(/\s*ne-props=(['"]).*?\1/, '');
        content = content.replace(/\s*ne-props=(['"]).*?\1/, '');

        var result = `${pre} ${moduleAttr}${content}`;
        result = result.replace(/^([^>]*?)\s+ne-extend\s*=\s*(['"])\s*(\S+?)\s*\2/, function(all, m1, m2, m3){
            return m1+bdc.procExtend(m3);
        });
        return result;
    },
    parseDeps: async function (arrStr, referURL){         //js define中的依赖
        var bdc = this;
        arrStr = arrStr.replace(/^\[\s*,\s*/, '[');
        var deps = JSON.parse(arrStr);
        var newdeps = [];
        await $$.reducePromise(deps, async function(file){
            util.stack(`来源文件: ${referURL}`);
            log(`depends: ${file}, ${referURL}\n`);
            if (/\.css/.test(file)) {
                file = util.fulldir(file, referURL);
                bdc.addCss(file);
            } else if (file.substr(0,1)=='!') { //不符amd规范的js
                file = file.substr(1);
                await bdc.addJs(file, referURL);
            } else {    //递归收集，期望别死循环..
                var cdnDefine = cdnDefine(file);
                if(cdnDefine){
                    newdeps.push(cdnDefine);
                }else{
                    newdeps.push(file);
                    if (!/\%/.test(file) && file != 'exports' && file != 'require') {
                        file = file.replace(/(.*?)\!/, ''); //去掉plugin!前缀
                        var depType = RegExp.$1;
                        file = util.fulldir(file, referURL);
                        if (depType == 'text') {
                            bdc.procText(file);
                        }
                    }
                }
                util.stack([]);
            }
        });
        arrStr = JSON.stringify(newdeps);
        return `define(${arrStr}`;
    },
    renderWithProp: function (html, props){
        var bdc = this;
        html = html.replace(/{{(.*?)}}/g, function(all, m1){
            return evalWithProp(m1);
        });
        function evalWithProp(model){
            if(!/props\./.test(model)){
                return `{{${model}}}`;
            }
            return $$.expr(model, props);
        }
        return html;
    },
    collectJs: async function (html){
        var bdc = this;
        var reg = new RegExp(`<script([^\\*\\[\\(\\+]*?)>\\n*([\\s\\S]*?)\\s*</script>|${firstCollector}`, 'ig');
        var result;
        while ((result = reg.exec(html))){
            var attr = result[1];
            var script = result[2];
            var match = result[0];
            if(match == firstCollector){
                state.commonCode = "commonJS";
                bdc.codes.first += bdc.codes.js + "\n";
                bdc.codes.js = '';
                continue;
            }
            if ((!/text\/template/i.test(attr) || / id="/.test(attr))
                && !/ ne-(?!alias)|\/\/(g|analytics)\.163\.com|wrating\.js/.test(attr)
                && !/ _keep=\S+?( |\/|$)/.test(attr)
                && !/document\.write|vjTrack|neteaseTracker/.test(script)) {
                if (/src=(['"])\s*(\S+?)\s*\1/i.test(attr)) {
                    var src = RegExp.$2;
                    var jsurl_root = `${conf.devHost}/${vc.cdnfix}` + global.VCPATH;
                    if (!/https?:\/\//i.test(src)) {
                        src = util.fulldir(src, jsurl_root);
                        if(!/https?:\/\//.test(src)){
                            continue;
                        }
                    }
                    //print "收集js: $src\n";
                    if (!bdc.defined[`!${src}`]) {
                        if(!/ _drop(=| |$)/.test(attr)){
                            var charset = '';
                            if (/charset\s*=\s*(['"]?)(gbk|gb2312)\1/i.test(attr)) {
                                charset = '@gbk';
                            }
                            if (headScriptMap[src]) {
                                bdc.codes.headScript += `<script src="${src}"></script>\n`;
                                bdc.defined[`!${src}`] = 1;
                            } else {
                                await bdc.addJs(src+charset);
                                attr = attr.replace(/src=(['"])\s*(\S+?)\s*\1/i, `src="${src}"`)
                                    .replace(/charset\s*=\s*(['"])\S+\1/i, '');
                                bdc.codes.js += `<script${attr} charset="utf-8"></script>\n`;
                            }
                        }
                    }
                } else {
                    if(!/ _drop(=| |$)/.test(attr)){  //不收集标记_drop的片断
                        if(/type=/.test(attr) && !/text\/javascript/i.test(attr)){
                            bdc.codes[state.commonCode] += `<script${attr}>\n${script}\n</script>\n`;
                        }else{
                            bdc.codes.js += `${script};\n`;
                        }
                    }
                    bdc.codes.js += `<script${attr}>\n${script}\n</script>\n`;
                }
            }
        }
    },
    collectCss: async function (html){
        var bdc = this;
        var file2cssid = {}; //用于css文件去重
        var reg = /(<link\s[^\*\[\(\+]*?>|<style[^\*\[\(\+]*?>[\s\S]*?<\/style>)/ig;
        var result;
        while((result = reg.exec(html))){
            var tmp = result[1];
            if(/<link(\s[\s\S]*?)>/i.test(tmp)){
                var attr = RegExp.$1;
                var cssurlRoot = `${conf.devHost}/${vc.cdnfix}`+global.VCPATH;
                if(!/['"]stylesheet/i.test(attr)){
                    if (/href=(['"])\s*(\S+?)\s*\1/i.test(attr)) {
                        var src = RegExp.$2;
                        if (!/(https?:)\/\//i.test(src)) {
                            src = util.fulldir(src, cssurlRoot);
                            if (!/https?:\/\//.test(src)) {
                                continue;
                            }
                        }
                        attr = attr.replace(/href=(['"])\s*(\S+?)\s*\1/i, `href="${src}"`);
                    }
                    bdc.codes.commonLink += `<link${attr}>`;
                    continue;
                }
                if (!/ ne-/.test(attr) && !/ _keep=\S+?( |\/|$)/.test(attr)) {
                    if (/href=(['"])\s*(\S+?)\s*\1/.test(attr)) {
                        var src = RegExp.$2;
                        if (!/(https?:)\/\//i.test(src)) {
                            src = util.fulldir(src, cssurlRoot);
                        }
                        var oldid = file2cssid[src];
                        util.stack(`出错文件: ${src}`);
                        if (oldid) { //去重
                            bdc.css.push(bdc.css[oldid]);
                            bdc.css[oldid] = '';
                        } else {
                            attr = attr.replace(/href=(['"])\s*(\S+?)\s*\1/, `href="${src}"`);
                            bdc.css.push(`<link${attr}>`);
                        }
                        util.stack([]);
                        file2cssid[src] = bdc.css.length;
                    }
                }
            } else if (/<style([\s\S]*?)>\s*([\s\S]*?)\s*<\/style>/i.test(tmp)) {
                var attr = RegExp.$1;
                var style = RegExp.$2;
                style = style.replace(/url\s*\(\s*(.*?)\s*\)/g, function(all, m1){
                    return bdc.procss(m1);
                });
                if(!/ _keep=\S+?( |\/|$)/.test(attr)){
                    bdc.css.push(`<style${attr}>\n${style}\n</style>`);
                }
            }
        }
    },
    procss: function (src, cssroot){
        var bdc = this;
        var quote = "";
        src = src.replace(/^\s*(['"])(.*?)\s*\1$/, function(all, m1, m2){
            quote = m1;
            return m2;
        }).trim();

        if (!/(https?:)\/\//i.test(src)) {
            src = util.fulldir(src, cssroot);
        }

        return `url(${quote}${src}${quote})`;
    }
}


function LiveCollector(){  //正式阶段收集器
    this.parentHtmls = {}; //已经收集过的主页面
    this.defined = {}; //收集过的module js
    this.predefined = {};  //和defined形成补充，用于避免死循环
    this.collectedCss = [];
    this.skins = {};
    this.css = [];   //具体style，供下一阶段压缩
    this.codes = {js:'', css:'', commonLink:'', headScript:'', first:'', commonJSFirst:'', commonJS:'', purejs:''};
}
LiveCollector.prototype = {
    init: async function(html, htmlfile, isSub){
        var bdc = this;
        bdc.urlRoot = `${conf.devHost}/${vc.cdnfix}` + global.VCPATH;
        state.commonCode = "commonJSFirst";
        var reg = new RegExp(`([^<>]*?)\\sne-module\\s*=\\s*(['"])([^'"<]*?)\\2((>|[\\s\\S]*?[^\\%]>)[\\s\\S]*?<[^!])|${firstCollector}`, 'ig');
        html = await util.replaceAsync(html, reg, async function(all, m1, m2, m3, m4){
            return await bdc.procModule(m1, m3, m4, all)
        });
        if(!isSub){
            bdc.codes.purejs += bdc.codes.js; //此处缓存为了避免procPlugin时，碰到firstCollector便把所有js均放到codes.first内
            bdc.codes.js = '';
        }
        state.commonCode = "commonJSFirst";
        html = html.replace(new RegExp(`([^<>]*?)\\sne-plugin\\s*=\\s*(['"])([^'"<]*?)\\2|${firstCollector}`, 'g'), function(all, m1, m2, m3){
            return bdc.procPlugin(m1, m3, all);
        });
        //project.json里指定的打包内容
        var depends = projectJson.depends[htmlfile];
        var dependsExclude = projectJson.dependsExclude && projectJson.dependsExclude[htmlfile];
        if(depends){
            log(`打包额外的模块: ${depends}\n`);
            depends = depends.replace(/(^| )\//g, `$1${vc.localhost}/`);
            var excludes = {};
            if (dependsExclude) {
                dependsExclude = dependsExclude.replace(/(^| )\//g, `$1${vc.localhost}/`);
                util.lsr('.', dependsExclude).forEach(function(file){
                    excludes[file] = 1;
                });
            }
            await $$.reducePromise(util.lsr('.', depends), async function(file){//额外模块
                if(!fs.existsSync(file) || excludes[file]){
                    return;
                }
                var moduleid = util.fulldir(file, "/" + vc.cdnfix + vc.path);
                moduleid = moduleid.replace(vc.localhost, '');
                if(/\.html$/.test(file)){
                    log(`Skin: ${file}\n`);
                    util.stack(`出错文件: ${file}`);
                    var tmp = readWork(file);
                    if(/<\/html>\s*$/i.test(tmp)){ //不把完整的demo页面作为皮肤
                        return;
                    }
                    var modulePath = moduleid.replace(/[^/]*$/, '');
                    var moduleHost = '/';
                    if(~moduleid.indexOf('//')){
                        moduleHost = moduleid;
                        moduleHost = moduleHost.replace(/(\/\/.*?\/).*/, '$1');
                    }
                    //fix @ path
                    tmp = tmp.replace(/((href|ne-module|ne-plugin|ne-extend)=['"])\@\//g, `$1${moduleHost}`);
                    tmp = tmp.replace(/((href|ne-module|ne-plugin|ne-extend)=['"])\@/g, `$1${modulePath}`);
                    bdc.skins[moduleid] = bdc.fixSkin(tmp);
                    moduleid = moduleid.replace(/\.html$/, '.js');
                    if(!fs.existsSync(`${vc.localhost}${moduleid}`)){
                        moduleid = moduleid.replace(/\.\w+\.js$/, '.js');
                    }
                    util.stack([]);
                }
                if(/\/\w+$/.test(moduleid)){
                    moduleid += ".js";
                }
                if(/\.js/.test(moduleid) && fs.existsSync(`${vc.localhost}${moduleid}`)){
                    await procModule("", moduleid, "");
                }
            });
        }
        return html;
    },  
    fixSkin: async function (tmp){
        var bdc = this;
        tmp = await (new DevCollector).init(tmp, '', 1);
        tmp = tmp.replace(/<link ([\s\S]*?)>/ig, function(all, m1){
            return bdc.moduleLink(m1);
        });
        tmp = tmp.replace(/<img([^>]*?)>/ig, function(all, m1){
            return util.expandIMGPath(m1);
        });
        tmp = tmp.replace(/\t/g, ' ');
        return tmp;
    },
    addCss: function (file){
        var bdc = this;
        if(bdc.collectedCss.indexOf(file) != -1){
            return;
        }
        bdc.collectedCss.push(file);
    },
    moduleLink: function (attr){
        var bdc = this;
        if (/href\s*=\s*(['"])\s*(\S+)\s*\1/.test(attr)){
            bdc.addCss(RegExp.$2);
            return "";
        }
        return `<link ${attr}>`;
    },
    addJs: async function (file, referURL){ //普通js依赖(!*.js)
        var bdc = this;
        //为正式版收集js
        var revert;
        await $$.reducePromise(file.split(/\s*;\s*/), async function(src){
            var bowlderSrc = 0;
            src = util.fulldir(src, referURL);
            var gbk = 0;
            src = src.replace(/\@([\w\-]+)$/, function(all, m1){
                var charset = m1;
                if (/gb/i.test(charset)) {
                    gbk = 1;
                }
            });
            if (!bdc.defined["!"+src]) {
                if (headScriptMap[src]) {
                    bdc.codes.headScript += `<script src="${src}"></script>\n`;
                } else if (/\.com\/(common|libs)\//.test(src)) {
                    bdc.codes[state.commonCode] += `<script src="${src}"></script>\n`;
                } else if (/\.com\/(modules\/bowlder\-[\d\.]+?\.js([\#\?].*)?)/.test(src)) {
                    bdc.codes.commonJSFirst += `<script src="${vc.resRoot}/${RegExp.$1}"></script>\n`;
                } else {
                    var tmp = await util.fetchUrl(src, gbk);
                    if(/\/bowlder[\-\d\.]*?\.js$/.test(src)){ //确保bowlder.js放在first收集器
                        bowlderSrc = 1;
                        if(bdc.codes.first){
                            js2first = 'first';
                            revert = 1;
                        }
                    }
                    bdc.codes[js2first] +=  `${tmp}\n;`;
                    global.jscount ++;
                }
                bdc.defined[`!${src}`] = 1;
                if(bowlderSrc){
                    if (state.alias) {
                        bdc.procModule("", state.alias, "");
                        bdc.codes[js2first] += `bowlder.run("${state.alias}").then(function(json){bowlder.conf({alias:json})});`;
                    }
                }
                if(revert){
                    js2first = 'js';
                }
            }
        });
    },
    procExtend: function (filestr){ //收集extend中的模块
        var bdc = this;
        var files = [];
        filestr.split(/\s*;\s*/).forEach(function(file){
            if (!/^\%/.test(file)) {
                if(!/{{.*?}}/.test(file)){
                    file = util.fulldir(file, bdc.urlRoot);
                    bdc.procDefine(file);
                }
            }
            files.push(file);
        });
        var fileStr = files.join("\n;");
        return ` ne-extend="${fileStr}"`;
    },
    procText: function (fileURL){ //收集text类型define
        var bdc = this;
        if (!bdc.defined[`text!${fileURL}`]) {
            var text = util.fetchUrl(fileURL)
                .replace(/\n/g, '\\n')
                .replace(/"/g, '\\"');
            var safename = fileURL.replace(/^http:\/\/.*?\//, '/');
            bdc.codes.js += `bowlder.define("${safename}","${text}");\n`;
            bdc.defined[`text!${fileURL}`] = 1;
        }
    },
    procDefine: async function (fileURL, avoidLock){ //收集各种define
        var bdc = this;
        var jstmp = '';
        if(/\%/.test(fileURL) || (avoidLock && bdc.predefined[fileURL])){
            return;
        }else if(!/reg\.163\.com/.test(fileURL)){  //不打包常用类库或urs库
            bdc.predefined[fileURL] = 1;
            if (!bdc.defined[fileURL]) {
                jstmp = util.fetchUrl[fileURL];
                if(/^http:\/\/img\d\.cache\.netease\.com/.test(fileURL)){
                    log(`CDN depend: ${fileURL}\n`);
                }else if(jstmp){
                    log(`pack depend: ${fileURL}\n`);
                    var safename = fileURL.replace(/^http:\/\/.*?\//, '/');
                    jstmp = jstmp.replace(/\n\s*?\/\/.*/g, '\n')
                        .replace(/\(\s*?\/\/[^\n]*/g, '(')
                        .replace(/\(\s*?\/\*.*?\*\//g, '(')
                        .replace(/(^|[^\w\.])(bowlder\.)?define\s*\(\s*([^\s"'\)])/, `$1bowlder.define("${safename}", $3`);
                    jstmp = await util.replaceAsync(jstmp, /define\s*\(\s*(\[.*?\])/, async function(all, m1){
                        return await bdc.parseDeps(m1, fileURL);
                    });
                    bdc.codes[js2first] += jstmp+"\n;\n";
                }
                bdc.defined[fileURL] = jstmp;
            } else {
                jstmp = bdc.defined[fileURL];
            }
        }
        return jstmp;
    },
    procPlugin: function (pre, basenames, match){
        var bdc = this;
        if(match == firstCollector){
            state.commonCode = "commonJS";
            bdc.codes.first += bdc.codes.js;
            bdc.codes.js = '';
            return match;
        }
        log(`Plugin: ${basenames}\n`);
        var filearr = [];
        basenames.split(/\s*;\s*/).forEach(function(basename){
            var file = util.fulldir(basename, bdc.urlRoot);
            bdc.procDefine(file);
            if(file){
                filearr.push(file);
            }
        });
        var filenames = filearr.join(";");
        if(filenames){
            var pluginAttr = `ne-plugin="${filenames}"`;
            return pre+' '+pluginAttr;
        }else{
            return pre;
        }
    },
    procModule: async function (pre, basename, content, match){
        var bdc = this;
        if(match == firstCollector){
            state.commonCode = "commonJS";
            bdc.codes.first += bdc.codes.js;
            bdc.codes.js = '';
            return match;
        }
        log(`Module: ${basename}\n`);
        var file =  util.fulldir(basename, bdc.urlRoot);
        if(/\/\w+$/.test(file)){
            file += ".js";
        }
        var format = path.extname(file);
        var jstmp = '';
        if (format == '.js') {
            jstmp = bdc.procDefine(file);
        }
        var htmltmp = '';
        if (/<\/$/.test(content) && />\s*</.test(content) && !/>\s*<!--#include\s+(file|virtual)/.test(content)) { //需要填充模块html
            if (!/\.html\s*=/.test(jstmp)) {                //js内无html定义
                var props = parseProp(pre+content);
                var htmlfile = file;
                if(props.skin && props.skin.substr(0,1)=='/'){
                    htmlfile = props.skin;
                }else{
                    var postfix = props.skin ? `.${props.skin}.html` : '.html';
                    htmlfile = htmlfile.replace(/\.js$/, postfix);
                }
                if(!bdc.parentHtmls[htmlfile]){
                    //htmlfile:
                    //http://127.0.0.1:8990/tie/yun/sitegov/modules/header/header.html
                    bdc.parentHtmls[htmlfile] = 1;
                    htmltmp = await fetchCollectHtml(htmlfile);
                    htmltmp = htmltmp.replace(/<meta\s+name\s*=\s*"cms_id".*?>\s*/ig, '');
                    htmltmp = htmltmp.replace(/<link ([\s\S]*?)>/g, function(all, m1){
                        return bdc.moduleLink(m1);
                    });
                    htmltmp = await (new DevCollector).init(htmltmp, '', 1);
                    htmltmp = bdc.renderWithProp(htmltmp, props);
                    await bdc.collectJs(htmltmp);
                    content = content.replace(/>\s*</, `>${htmltmp}<`);
                    delete bdc.parentHtmls[htmlfile];
                }
            }
        }

        var moduleAttr = 'ne-module=""'; //html文件的ne-module值置空
        if(format != 'html') {
            var safename = file;
            moduleAttr = `ne-module="${safename}"`;
        }
        pre = pre.replace(/\s*ne-props=(['"]).*?\1/, '');
        content = content.replace(/\s*ne-props=(['"]).*?\1/, '');

        var result = `${pre} ${moduleAttr}${content}`;
        result = result.replace(/^([^>]*?)\s+ne-extend\s*=\s*(['"])\s*(\S+?)\s*\2/, function(all, m1, m2, m3){
            return m1+bdc.procExtend(m3);
        });
        return result;
    },
    parseDeps: async function (arrStr, referURL){         //js define中的依赖
        var bdc = this;
        arrStr = arrStr.replace(/^\[\s*,\s*/, '[');
        var deps = JSON.parse(arrStr);
        var newdeps = [];
        await $$.reducePromise(deps, async function(file){
            util.stack(`来源文件: ${referURL}`);
            log(`depends: ${file}, ${referURL}\n`);
            if (/\.css/.test(file)) {
                file = util.fulldir(file, referURL);
                bdc.addCss(file);
            } else if (file.substr(0,1)=='!') { //不符amd规范的js
                file = file.substr(1);
                await bdc.addJs(file, referURL);
            } else {    //递归收集，期望别死循环..
                var cdnDefine = cdnDefine(file);
                if(cdnDefine){
                    newdeps.push(cdnDefine);
                }else{
                    newdeps.push(file);
                    if (!/\%/.test(file) && file != 'exports' && file != 'require') {
                        file = file.replace(/(.*?)\!/, ''); //去掉plugin!前缀
                        var depType = RegExp.$1;
                        file = util.fulldir(file, referURL);
                        if (depType == 'text') {
                            bdc.procText(file);
                        } else {
                            if(/\/\w+$/.test(file)){
                                file += ".js";
                            }
                            bdc.procDefine(file, 1);
                        }
                    }
                }
                util.stack([]);
            }
        });
        arrStr = JSON.stringify(newdeps);
        return `define(${arrStr}`;
    },
    renderWithProp: function (html, props){
        var bdc = this;
        html = html.replace(/{{(.*?)}}/g, function(all, m1){
            return evalWithProp(m1);
        });
        function evalWithProp(model){
            if(!/props\./.test(model)){
                return `{{${model}}}`;
            }
            return $$.expr(model, props);
        }
        return html;
    },
    collectJs: async function (html){
        var bdc = this;
        var reg = new RegExp(`<script([^\\*\\[\\(\\+]*?)>\\n*([\\s\\S]*?)\\s*</script>|${firstCollector}`, 'ig');
        var result;
        while ((result = reg.exec(html))){
            var attr = result[1];
            var script = result[2];
            var match = result[0];
            if(match == firstCollector){
                state.commonCode = "commonJS";
                bdc.codes.first += bdc.codes.js;
                bdc.codes.js = '';
                continue;
            }
            if ((!/text\/template/i.test(attr) || / id="/.test(attr))
                && !/ ne-(?!alias)|\/\/(g|analytics)\.163\.com|wrating\.js/.test(attr)
                && !/ _keep=\S+?( |\/|$)/.test(attr)
                && !/document\.write|vjTrack|neteaseTracker/.test(script)) {
                if (/src=(['"])\s*(\S+?)\s*\1/i.test(attr)) {
                    var src = RegExp.$2;
                    var jsurl_root = `${conf.devHost}/${vc.cdnfix}` + global.VCPATH;
                    if (!/https?:\/\//i.test(src)) {
                        src = util.fulldir(src, jsurl_root);
                        if(!/https?:\/\//.test(src)){
                            continue;
                        }
                    }
                    //print "收集js: $src\n";
                    if (!bdc.defined[`!${src}`]) {
                        if(!/ _drop(=| |$)/.test(attr)){
                            var charset = '';
                            if (/charset\s*=\s*(['"]?)(gbk|gb2312)\1/i.test(attr)) {
                                charset = '@gbk';
                            }
                            if (headScriptMap[src]) {
                                bdc.codes.headScript += `<script src="${src}"></script>\n`;
                                bdc.defined[`!${src}`] = 1;
                            } else {
                                await bdc.addJs(src+charset);
                                attr = attr.replace(/src=(['"])\s*(\S+?)\s*\1/i, `src="${src}"`)
                                    .replace(/charset\s*=\s*(['"])\S+\1/i, '');
                            }
                        }
                    }
                } else {
                    if(!/ _drop(=| |$)/.test(attr)){  //不收集标记_drop的片断
                        if(/type=/.test(attr) && !/text\/javascript/i.test(attr)){
                            bdc.codes[state.commonCode] += `<script${attr}>\n${script}\n</script>\n`;
                        }else{
                            bdc.codes.js += `${script};\n`;
                        }
                    }
                }
            }
        }
    },
    collectCss: async function (html){
        var bdc = this;
        var file2cssid = {}; //用于css文件去重
        var reg = /(<link\s[^\*\[\(\+]*?>|<style[^\*\[\(\+]*?>[\s\S]*?<\/style>)/ig;
        var result;
        while((result = reg.exec(html))){
            var tmp = result[1];
            if(/<link(\s[\s\S]*?)>/i.test(tmp)){
                var attr = RegExp.$1;
                var cssurlRoot = `${conf.devHost}/${vc.cdnfix}`+global.VCPATH;
                if(!/['"]stylesheet/i.test(attr)){
                    if (/href=(['"])\s*(\S+?)\s*\1/i.test(attr)) {
                        var src = RegExp.$2;
                        if (!/(https?:)\/\//i.test(src)) {
                            src = util.fulldir(src, cssurlRoot);
                            if (!/https?:\/\//.test(src)) {
                                continue;
                            }
                        }
                        attr = attr.replace(/href=(['"])\s*(\S+?)\s*\1/i, `href="${src}"`);
                    }
                    bdc.codes.commonLink += `<link${attr}>`;
                    continue;
                }
                if (!/ ne-/.test(attr) && !/ _keep=\S+?( |\/|$)/.test(attr)) {
                    if (/href=(['"])\s*(\S+?)\s*\1/.test(attr)) {
                        var src = RegExp.$2;
                        if (!/(https?:)\/\//i.test(src)) {
                            src = util.fulldir(src, cssurlRoot);
                        }
                        var oldid = file2cssid[src];
                        util.stack(`出错文件: ${src}`);
                        if (oldid) { //去重
                            bdc.css.push(bdc.css[oldid]);
                            bdc.css[oldid] = '';
                        } else {
                            if(!/ _drop(=| |$)/.test(attr)){
                                global.csscount ++;
                                var tmpCss = await getCssFile(src);
                                bdc.css.push(tmpCss);
                            }
                            attr = attr.replace(/href=(['"])\s*(\S+?)\s*\1/, `href="${src}"`);
                            bdc.css.push(`<link${attr}>`);
                        }
                        util.stack([]);
                        file2cssid[src] = bdc.css.length;
                    }
                }
            } else if (/<style([\s\S]*?)>\s*([\s\S]*?)\s*<\/style>/i.test(tmp)) {
                var attr = RegExp.$1;
                var style = RegExp.$2;
                style = style.replace(/url\s*\(\s*(.*?)\s*\)/g, function(all, m1){
                    return bdc.procss(m1);
                });
                if(!/ _keep=\S+?( |\/|$)/.test(attr)){
                    bdc.css.push(`<style${attr}>\n${style}\n</style>`);
                }
            }
        }
    },
    procss: function (src, cssroot){
        var bdc = this;
        var quote = "";
        src = src.replace(/^\s*(['"])(.*?)\s*\1$/, function(all, m1, m2){
            quote = m1;
            return m2;
        }).trim();

        if (!/(https?:)\/\//i.test(src)) {
            src = util.fulldir(src, cssroot);
        }

        return `url(${quote}${src}${quote})`;
    }
}

function procComment(tmp){
    if(/<(link|style|script)/i.test(tmp)){
        if(/\[endif\]/.test(tmp)){
            var cursor = collectComments;
            collectComments.push(tmp);
            return `<!--\$collectComments[${cursor}]-->`;
        }
        return '';
    }
    return tmp;
}

exports.dev = async function(htmlDir){
    bdDir.inc = util.getFolder(`${htmlDir}/inc`);
    var vcpath = global.VCPATH;
    function parseAlias(quote, alias){
        state.alias = util.fulldir(alias, `/${vc.cdnfix}${vc.path}`);
        state.bowlderAlias = util.parseJson(`${vc.localhost}/${state.alias}`);
        log(`Alias: ${state.alias}\n`);
        return `ne-alias=${quote}${conf.devHost}${state.alias}${quote}`;
    }

    //将packModuleDir中的js所需依赖全部收集，与html共同发布(便于动态加载)
    //sports/rio_data_live
    var dirs = projectJson.packModuleDir || '';
    await $$.reducePromise(dirs.split(/\s+/), async function(dir){
        if(dir && util.isDir(dir)){
            await $$.reducePromise(util.lsr(dir, /\.js$/), async function(file){
                var htmlfile = file;
                htmlfile = htmlfile.replace(/\.js/, '.html');
                projectJson.depends[file] = htmlfile;
                var bdc = new DevCollector();
                await bdc.init('', file);
                await $$.reducePromise(bdc.collectedCss, async function(cssFile){
                    bdc.codes.css += await getCssFile(util.fulldir(cssFile, vc.devpath));
                });
                bdc.codes.css = bdc.codes.css.trim();
                if (bdc.codes.css) {
                    $$.each(bdc.skins, function(skin, html){ //此处仅一个皮肤
                        bdc.skins[skin] = `<style>${bdc.codes.css}</style>${html}`;
                    });
                }
                bdc.codes.js = `${bdc.codes.purejs}${bdc.codes.js}`;
                var skinDefine = JSON.stringify(bdc.skins);
                if (skinDefine.length > 2) {
                    bdc.codes.js = `define.skin(${skinDefine});${bdc.codes.js}`;
                }
                var outputfile = `${htmlDir}/${file}`;
                util.checkFolder(outputfile);
                writeTmp(outputfile, util.uniformStaticAddr(bdc.codes.js));
            });
        }
    });
    await $$.reducePromise(collectFiles(htmlDir), async function(file){
        var reqCollector = {"head": 1, "foot": 1};
        collectComments = [];
        state = {commonCode: "commonJSFirst"};
        global.jscount = global.csscount = 0;
        //stripe /var/fepack/dist/tie_yun_sitegov/html4dev
        var vm = file.replace(util.distDir+'/', '').replace(/^[^\/]*/, ''); 
        var url = vc.devpath + vm; //http://127.0.0.1:8990/tie/yun/sitegov/info.html
        log(`\n开始收集 ${file}: `, 2, 1);
        var html = await fetchCollectHtml(file);
        // 未收集的html源码
        if (html) {
            var bdc = new DevCollector();
            bdc.parentHtmls[url] = 1;
            html = html.replace(/ne-alias=(['"])(\S+?)\1/g, function(all, m1, m2){
                return parseAlias(m1,m2);
            });
            if(!state.bowlderAlias){
                if(/\/common2015\/\w+nav/.test(html)){
                    state.bowlderAlias = util.parseJson(`${vc.localhost}/include/2015/alias.js`);
                }else{
                    state.bowlderAlias = {};
                }
            }
            var hasBowlder = 0;
            log(`获取 ${file} 成功。\n`);
            if (/:\/\/.*?\/(z\/)?(\S+)\//.test(url)) {
                global.VCPATH = RegExp.$2;
            }
            if (!/<!--!include\s+collector=(['"])head\1/.test(html)) {
                html = html.replace(/((<script.*?>\s*)*(<\/head>|<body))/i, '<!--!include collector="head"-->\n$1');
            }
            html = html.replace(/<!--[^#\!][\s\S]*?-->/g, function(all){
                return procComment(all);
            });
            if (/<script\s.*?bowlder[\-\d\.]*?\.js/i.test(html)) {
                hasBowlder = 1;
            }
            if (/<body/i.test(html) && !/<!--!include\s+collector=(['"])foot\1/.test(html)){
                html = html.replace(/(<script\s[^>]*?bowlder[\-\d\.]*?\.js['"].*?<\/script>|<\/body>)/i, `<!--!include collector="foot"-->\n$1`);
            }
            html = html.replace(/\burl\((\S+?)\)/ig, function(all, m1){
                return bdc.procss(m1);
            });

            log("收集普通js ...\n");
            state.commonCode = "commonJSFirst";
            await bdc.collectJs(html);
            bdc.codes.purejs = bdc.codes.js;
            bdc.codes.js = '';
            log(`收集bowlder模块 ...\n`);
            html = await bdc.init(html, file);
            bdc.collectedCss.forEach(function(cssFile){ //将<link>收集到一起，由collectCss方法合并
                var link = `<link href="${cssFile}" rel="stylesheet" />`;
                html = html.replace(/(<!--!include\s+collector="head"|$)/i, `${link}\n$1`);
            });

            log("收集css ...\n");
            await bdc.collectCss(html);
            bdc.codes.css = bdc.css.join("\n");
            bdc.codes.js = util.uniformStaticAddr(`${bdc.codes.purejs}${bdc.codes.js}`);
            if(bdc.codes.first){
                bdc.codes.first += `<script>bowlder.debug='${conf.devHost}';bowlder.rootWidget.compile()</script>`;
            } else {
                bdc.codes.js += `<script>if(window.bowlder)bowlder.debug='${conf.devHost}'</script>\n`;
            }
            bdc.codes.css = util.uniformStaticAddr(bdc.codes.css);
            var skinDefine = JSON.stringify(bdc.skins);
            if(skinDefine.length > 2){
                skinDefine = skinDefine.replace(/<\/script>/ig, '</"+"script>');
                bdc.codes.js += `<script>bowlder.define.skin(${skinDefine})</script>\n`;
            }

            file = file.replace(htmlDir + '/', '');
            var devIncFootFile = getCollectFileName(`${bdDir.inc}/${file}`, "foot");
            var devIncHeadFile = getCollectFileName(`${bdDir.inc}/${file}`, "head");
            if (!util.checkFolder(devIncFootFile)) {
                global.exitERR(`无法创建 ${devIncFootFile} 所在目录。`);
            }
            //对于收集结果为空者，不再显示
            var liveIncFootFile = devIncFootFile;
            if (!util.checkFolder(liveIncFootFile)) {
                global.exitERR(`无法创建 ${liveIncFootFile} 所在目录。`);
            }

            html = util.uniformStaticAddr(clearCollectTags(html));

            if(bdc.codes.first){
                html = html.replace(/<!--!include collector="(first)"-->/i, function(all, m1){
                    var devIncFirstFile = `${bdDir.inc}/${file}`;
                    devIncFirstFile = util.getCollectFileName(devIncFirstFile, "first");
                    //测试环境: inc/first~name.shtml
                    writeTmp(devIncFirstFile, bdc.codes.first);
                    return `<!--#include virtual="inc/${getCollectFileName(file,m1)}"-->`;
                });
            }else{
                bdc.codes.commonJS = `${bdc.codes.commonJSFirst}${bdc.codes.commonJS}`;
            }

            if(bdc.codes.commonLink){
                bdc.codes.commonLink += "\n";
            }
            if(bdc.codes.headScript){
                bdc.codes.headScript = "\n"+bdc.codes.headScript;
            }
            var headContent = `${bdc.codes.commonLink}${bdc.codes.css}${bdc.codes.headScript}`;
            if(headContent){
                var hasHead = 0;
                html = html.replace(/<!--!include collector="(head)"\s*-->/i, function(all, m1){
                    hasHead = 1;
                    //测试环境: inc/head~name.shtml
                    writeTmp(devIncHeadFile, headContent);
                    return `<!--#include virtual="inc/${getCollectFileName(file, m1)}"-->`;
                });
                if(!hasHead){
                    //将收集样式内联放到页面开头
                    html = `${bdc.codes.commonLink}${bdc.codes.css}${bdc.codes.headScript}`+html;
                }
            }

            //inc/foot~name.html
            if (bdc.codes.js) {
                var hasFoot = 0;
                html = html.replace(/<!--!include collector="(foot)"\s*-->/, function(all, m1){
                    hasFoot = 1;
                    //测试环境: inc/foot~name.shtml
                    writeTmp(devIncFootFile, bdc.codes.js);
                    return `<!--#include virtual="inc/${getCollectFileName(file, m1)}"-->`;
                });
                if(!hasFoot){
                    html += bdc.codes.js;
                }
            }

            var htmlFile = path.resolve(htmlDir, file);
            util.checkFolder(htmlFile);
            writeTmp(htmlFile, util.expandFullPath(html)); //测试环境
            log(`收集结束: ${htmlFile}\n`);
            global.VCPATH = vcpath;
            //process.exit(1);
        }
    });
}

async function fetchCollectHtml(file){
    log(`生成收集用的html(${file}) ..\n`);
    var html = await util.fetchUrl(file);
    var abspath = path.dirname(file.replace(conf.devHost, vc.localhost));
    var modulePath = (abspath + '/').replace(vc.localhost, '').replace(util.distHtmlDir +'/', `/${vc.cdnfix}${vc.path}/`);
    //fix @ path
    html = html.replace(/((href|ne-module|ne-plugin|ne-extend)=['"])\@/g, '$1'+modulePath)
        .replace(/<!--#include\s+(file|virtual)=(['"])(.*?)\2\s*-->/ig, function(all, m1, m2, m3){
            return fetchSSI(m3, abspath, m1);
        });
    return html;
}

function fetchSSI(ssi, abspath, ssikey){
    if(ssikey){
        ssikey = "virtual";
    }
    var aliasMatch;
    for(var alias in util.homeMap){
        ssi = ssi.replace(new RegExp(`(\\.com|^)/?${alias}/`), util.homeMap[alias] + '/');
        if (aliasMatch){
            break;
        }
    }
    var file = util.expandSSIPath(ssi, abspath);
    ssi = file.replace(vc.localhost + '/', '/');
    //最好用绝对路径~
    var result = `<!--#include ${ssikey}="${ssi}"-->`;

    global.indent += 2;
    var ssitype = util.ssiType(file);
    if (ssitype == -1) { //mods4lua
        ssi = ssi.replace(/.*?\/mods\//, '');
        result = '@@' + ssi + '@@';
        log(`本项目Mods(${file}) .. \n`);
    }else if (ssitype == 0) {  //外部SSI
        log(`外部SSI(${file}) .. \n`);
        if (ENV.CMS_CHANNEL && getCmspath(file)) {
            log("   保持SSI\n");
        } else if(fs.existsSync(file)){
            log("   内联替换\n");
            result = inlineSSI(file) || result;
        } else {
            log("   保持未知SSI\n");
        }
    }
    //极光不适用!!
    else if (ssitype == 1) { //inc/内容，不收集
        ssi = ssi.replace(/.*?\/inc\//, `inc/`);
        result = `<!--#include ${ssikey}="${ssi}"-->`;
        log(`本项目INC(${file}) .. \n`);
    }
    else {  //本项目普通SSI
        log(`本项目普通SSI(${file}) ..\n`);
        if (fs.existsSync(file)) {
            if (ENV.CMS_CHANNEL && isCmsPage(file)) {
                log("   保持SSI\n");
            } else {
                log("   内联替换\n");
                result = inlineSSI(file) || result;
            }
        } else {
            log(`  : ${file}不存在.\n`);
        }
    }
    global.indent -= 2;

    return result;
}
function inlineSSI(file){  //输出内联ssi
    if (!fs.existsSync(file)) {
        global.exitERR("", `找不到SSI文件：${file}.`);
        return "";
    }
    var absdir = path.dirname(file);
    var content = readWork(file).replace(/\s*<meta\s+name="cms_id"[\s\S]*?>\s*/ig, '');
    content = content.replace(/\s*<!--!include\s*collector=.*?-->\s*/ig, '')
        .replace(/<!--#include\s+(file|virtual)=(['"])(.*?)\2\s*-->/ig, function(all, m1, m2, m3){
            return util.fetchSSI(m3, absdir, m1);
        });
    return content;
}

async function getCssFile(src){
    util.stack("出错文件: "+src);
    var [,,, tmp] = await util.procSingleCss(src);
    var cssDir = path.dirname(src);
    //将css内的相对url转成绝对地址
    tmp = tmp.replace(/\burl\s*\(\s*['"]?(\S+?)['"]?\s*\)/g, (all, m1) => util.cdnImgPath(m1, null, cssDir));
    util.stack([]);
    return tmp;
}

function getCollectFileName(tmp, collector){
    var [, dir, file] = /(.*\/)?(.*)/.exec(tmp);
    file = `${collector}~${file}`;
    if(projectJson.collectors && projectJson.collectors[file]){
        file = projectJson.collectors[file];
    }
    return (dir || '') + file;
}

function parseProp(tag){
    var props = {};
    tag = tag.replace(/<\%.*?\%>/g, '');
    if(/^[^>]*?ne-props\s*=\s*(['"])([\s\S]*?)\1/.test(tag)){
        var tmp = RegExp.$2, result;
        var tester = /([^;\s]+?)\s*[\:\=]\s*([^;\s]*)/g;
        while((result = tester.exec(tmp))){
            props[result[1]] = result[2];
        }
    }
    return props;
}

function isCmsPage(file){ //本项目普通SSI是否有对应cms片断
    var content = readWork(file);
    content = content.replace(/<!--\s*<meta\s+name="cms_id".*?-->/ig, '');
    if (/<meta\s+name="skip"/.test(content) && getCmspath(file)){
        return 1;
    } else if (/<meta\s+name="cms_id"\s+content=".*?"/i.test(content)){
        return 1;
    } else{
        return 0;
    }
}

function getCmspath(file){
    file = file.replace(vc.localpath+"/", "").replace(vc.localhost+"/", "");
    var channel = ENV.CMS_CHANNEL;
    var pattern = `${file}|${channel}`;
    return queryCmsPath(channel, util.findProject(file));
}

function clearCollectTags(html){           //必须在替换cdn路径之前使用
    html = html.replace(/(\s*)(<script[^\*\[\(\+]*?>)([\s\S]*?<\/script>)/ig, function(all, m1, m2, m3){
        return clearCollectTag(m1, m2, m3);
    })
    .replace(/(\s*)(<style[^\*\[\(\+]*?>)([\s\S]*?<\/style>)/ig, function(all, m1, m2, m3){
        return clearCollectTag(m1, m2, m3);
    })
    .replace(/(\s*)(<link\s[^\*\[\(\+]*?>)/ig, function(all, m1, m2){
        return clearCollectTag(m1, m2);
    });
    collectComments.forEach(function(tmp){
        html = html.replace(/<!--\$collectComments\[\d+\]-->/, tmp);
    });
    return html;
}

function clearCollectTag(spaces, attr, cont){
    cont = cont || '';
    if (/ _drop(=| |\/|>)/i.test(attr)) {
        return "";
    }
    if ((!/text\/template/i.test(attr) || / id="/.test(attr))
        && !/ ne-(?!alias)|\/\/(g|analytics)\.163\.com|wrating\.js/.test(attr)
        && !/ _keep=\S+?( |\/|>)/i.test(attr)
        && !/document\.write|vjTrack|neteaseTracker/.test(cont)) {
        if (/(src|href)=(['"])\s*(\S+?)\s*\1/i.test(attr)) {
            // 无法收集的url格式
            var src = RegExp.$3;
            if(src != util.fulldir(src)){
                return spaces+attr+cont;
            }
        }
        return "";
    }
    if (/^<link/i.test(attr) && /['"]stylesheet/i.test(attr)) {
        return spaces+attr+cont;
    } else {
        attr = attr.replace(/ _keep=[1"'A-z]+?( |\/|>)/, '$1');
        return spaces+attr+cont;
    }
}

exports.live = async function(htmlDir){
    bdDir.inc = util.getFolder(`${htmlDir}/inc`);
    var vcpath = global.VCPATH;
    var resBase = `${conf.devHost}/dist/${project}/collect`;
    var colInfo = { //收集结果，包括html->inc->js/css之间的影射
        inc: util.readFromLog(logfiles.collectinc, logfmts.collectinc),
        jscss: util.readFromLog(logfiles.collectres, logfmts.collectres)
    };
    
    function parseAlias(quote, alias){
        state.alias = util.fulldir(alias, `/${vc.cdnfix}${vc.path}`);
        state.bowlderAlias = util.parseJson(`${vc.localhost}/${state.alias}`);
        log(`Alias: ${state.alias}\n`);
        return `ne-alias=${quote}${conf.devHost}${state.alias}${quote}`;
    }
    
    //将packModuleDir中的js所需依赖全部收集，与html共同发布(便于动态加载)
    //sports/rio_data_live
    var dirs = projectJson.packModuleDir || '';
    await $$.reducePromise(dirs.split(/\s+/), async function(dir){
        if(dir && util.isDir(dir)){
            await $$.reducePromise(util.lsr(dir, /\.js$/), async function(file){
                var htmlfile = file;
                htmlfile = htmlfile.replace(/\.js/, '.html');
                projectJson.depends[file] = htmlfile;
                var bdc = new LiveCollector();
                await bdc.init('', file);
                await $$.reducePromise(bdc.collectedCss, async function(cssFile){
                    bdc.codes.css += await getCssFile(util.fulldir(cssFile, vc.devpath));
                });
                bdc.codes.css = bdc.codes.css.trim();
                if (bdc.codes.css) {
                    $$.each(bdc.skins, function(skin, html){ //此处仅一个皮肤
                        bdc.skins[skin] = `<style>${bdc.codes.css}</style>${html}`;
                    });
                }
                bdc.codes.js = `${bdc.codes.purejs}${bdc.codes.js}`;
                var skinDefine = JSON.stringify(bdc.skins);
                if (skinDefine.length > 2) {
                    bdc.codes.js = `define.skin(${skinDefine});${bdc.codes.js}`;
                }
                var outputfile = `${htmlDir}/${file}`;
                util.checkFolder(outputfile);
                writeTmp(outputfile, util.uniformStaticAddr(bdc.codes.js));
            });
        }
    });
    await $$.reducePromise(collectFiles(htmlDir), async function(file){
        var reqCollector = {"head": 1, "foot": 1};
        collectComments = [];
        state = {commonCode: "commonJSFirst"};
        global.jscount = global.csscount = 0;
        //stripe /var/fepack/dist/tie_yun_sitegov/html
        var vm = file.replace(util.distDir+'/', '').replace(/^[^\/]*/, ''); 
        var url = vc.devpath + vm; //http://127.0.0.1:8990/tie/yun/sitegov/info.html
        log(`\n开始收集 ${file}: `, 2, 1);
        var html = await fetchCollectHtml(file);
        // 未收集的html源码
        if (html) {
            var bdc = new LiveCollector();
            bdc.parentHtmls[url] = 1;
            html = html.replace(/ne-alias=(['"])(\S+?)\1/g, function(all, m1, m2){
                return parseAlias(m1,m2);
            });
            if(!state.bowlderAlias){
                if(/\/common2015\/\w+nav/.test(html)){
                    state.bowlderAlias = util.parseJson(`${vc.localhost}/include/2015/alias.js`);
                }else{
                    state.bowlderAlias = {};
                }
            }
            var hasBowlder = 0;
            log(`获取 ${file} 成功。\n`);
            if (/:\/\/.*?\/(z\/)?(\S+)\//.test(url)) {
                global.VCPATH = RegExp.$2;
            }
            if (!/<!--!include\s+collector=(['"])head\1/.test(html)) {
                html = html.replace(/((<script.*?>\s*)*(<\/head>|<body))/i, '<!--!include collector="head"-->\n$1');
            }
            html = html.replace(/<!--[^#\!][\s\S]*?-->/g, function(all){
                return procComment(all);
            });
            if (/<script\s.*?bowlder[\-\d\.]*?\.js/i.test(html)) {
                hasBowlder = 1;
            }
            if (/<body/i.test(html) && !/<!--!include\s+collector=(['"])foot\1/.test(html)){
                html = html.replace(/(<script\s[^>]*?bowlder[\-\d\.]*?\.js['"].*?<\/script>|<\/body>)/i, `<!--!include collector="foot"-->\n$1`);
            }
            html = html.replace(/\burl\((\S+?)\)/ig, function(all, m1){
                return bdc.procss(m1);
            });

            log("收集普通js ...\n");
            state.commonCode = "commonJSFirst";
            await bdc.collectJs(html);
            bdc.codes.purejs = bdc.codes.js;
            bdc.codes.js = '';
            log(`收集bowlder模块 ...\n`);
            html = await bdc.init(html, file);
            bdc.collectedCss.forEach(function(cssFile){ //将<link>收集到一起，由collectCss方法合并
                var link = `<link href="${cssFile}" rel="stylesheet" />`;
                html = html.replace(/(<!--!include\s+collector="head"|$)/i, `${link}\n$1`);
            });

            log("收集css ...\n");
            await bdc.collectCss(html);
            bdc.codes.css = bdc.css.join("\n");
            bdc.codes.js = util.uniformStaticAddr(`${bdc.codes.purejs}${bdc.codes.js}`);
            if(bdc.codes.first){
                bdc.codes.first += "bowlder.rootWidget.compile();";
            }
            bdc.codes.css = util.uniformStaticAddr(bdc.codes.css);
            var skinDefine = JSON.stringify(bdc.skins);
            if(skinDefine.length > 2){
                bdc.codes.js += `bowlder.define.skin(${skinDefine});\n`;
                skinDefine = skinDefine.replace(/<\/script>/ig, '</"+"script>');
            }

            var md5js = util.getMd5(bdc.codes.js, 1);
            var md5css = util.getMd5(bdc.codes.css, 1);
            var md5jsname = `foot~${md5js}.js`;
            var md5cssname = `head~${md5css}.css`;
            var liveJsFile = `${bdDir.res}/${md5jsname}`;
            var liveCssFile = `${bdDir.res}/${md5cssname}`;

            file = file.replace(htmlDir + '/', '');
            var liveIncFootFile = getCollectFileName(`${bdDir.inc}/${file}`, "foot");
            var liveIncHeadFile = getCollectFileName(`${bdDir.inc}/${file}`, "head");
            //对于收集结果为空者，不再显示
            var collectedScriptTag = bdc.codes.js ? `<script src="${resBase}/${md5jsname}" charset="utf-8"></script>\n` : "";
            var collectedCssTag = bdc.codes.css ? `<link href="${resBase}/${md5cssname}" rel="stylesheet" />` : "";
            if (!util.checkFolder(liveIncFootFile)) {
                global.exitERR(`无法创建 ${liveIncFootFile} 所在目录。`);
            }

            if(bdc.codes.js){
                colInfo.jscss[liveJsFile] = {
                    valid: 1,
                    vms: {},
                    svnver: vcver,
                    fcount: global.jscount
                };
                colInfo.jscss[liveJsFile].vms[vm] = 1;
                log(`生成 ${liveJsFile}\n`);
                writeTmp(liveJsFile, bdc.codes.js);
            }

            if(bdc.codes.css){
                colInfo.jscss[liveCssFile] = {
                    valid: 1,
                    vms: {},
                    svnver: vcver,
                    fcount: global.csscount
                };
                colInfo.jscss[liveCssFile].vms[vm] = 1;
                log(`生成 ${liveCssFile}\n`);
                writeTmp(liveCssFile, bdc.codes.css);
            }

            html = util.uniformStaticAddr(clearCollectTags(html));

            //正式环境: inc/first~name.html
            if(bdc.codes.first){
                var md5first = util.getMd5(bdc.codes.first, 1);
                var md5firstname = `first~${md5first}.js`;
                var liveFirstFile = `${bdDir.res}/${md5firstname}`;
                colInfo.jscss[liveFirstFile] = {
                    valid: 1,
                    vms: {},
                    svnver: vcver,
                    fcount: global.jscount
                };
                colInfo.jscss[liveFirstFile].vms[vm] = 1;
                log(`生成 ${liveFirstFile}\n`);
                writeTmp(liveFirstFile, bdc.codes.first);
                html = html.replace(/<!--!include collector="(first)"-->/i, function(all, m1){
                    var liveIncFirstFile = util.getCollectFileName(`${bdDir.inc}/${file}`, "first");
                    //正式环境: inc/first~name.shtml
                    writeTmp(liveIncFirstFile, `${bdc.codes.commonJSFirst}<script src="${resBase}/${md5firstname}" charset="utf-8"></script>`);
                    if(!colInfo.inc[liveIncFirstFile]) colInfo.inc[liveIncFirstFile] = {};
                    if(colInfo.inc[liveIncFirstFile].jscss != liveCssFile){
                        colInfo.inc[liveIncFirstFile].ver ++;
                        colInfo.inc[liveIncFirstFile].vm = url;
                        colInfo.inc[liveIncFirstFile].jscss = liveCssFile;
                    }
                    return `<!--#include virtual="inc/${getCollectFileName(file,m1)}"-->`;
                });
            }else{
                bdc.codes.commonJS = `${bdc.codes.commonJSFirst}${bdc.codes.commonJS}`;
            }

            //正式环境: inc/head~name.html
            if(bdc.codes.commonLink){
                bdc.codes.commonLink += "\n";
            }
            if(bdc.codes.headScript){
                bdc.codes.headScript = "\n"+bdc.codes.headScript;
            }
            var headContent = `${bdc.codes.commonLink}${collectedCssTag}${bdc.codes.headScript}`;
            if(headContent){
                var hasHead = 0;
                html = html.replace(/<!--!include collector="(head)"\s*-->/i, function(all, m1){
                    hasHead = 1;
                    //正式环境: inc/head~name.shtml
                    writeTmp(liveIncHeadFile, headContent);
                    if(!colInfo.inc[liveIncHeadFile]){
                        colInfo.inc[liveIncHeadFile] = {};
                    }
                    if (colInfo.inc[liveIncHeadFile].jscss != liveCssFile) {
                        colInfo.inc[liveIncHeadFile].ver ++;
                        colInfo.inc[liveIncHeadFile].vm = url;
                        colInfo.inc[liveIncHeadFile].jscss = liveCssFile;
                    }
                    return `<!--#include virtual="inc/${getCollectFileName(file, m1)}"-->`;
                });
                if(!hasHead){
                    //将收集样式内联放到页面开头
                    delete colInfo.inc[liveIncHeadFile];
                    html = `${bdc.codes.commonLink}<style>\n${bdc.codes.css}</style>${bdc.codes.headScript}`+html;
                }
            }

            //正式环境: inc/foot~name.html
            var footContent = `${bdc.codes.commonJS}${collectedScriptTag}`;
            if (footContent) {
                var hasFoot = 0;
                html = html.replace(/<!--!include collector="(foot)"\s*-->/i, function(all, m1, m2){
                    hasFoot = 1;
                    //正式环境: inc/foot~name.shtml
                    writeTmp(liveIncFootFile, footContent);
                    if(!colInfo.inc[liveIncFootFile]) colInfo.inc[liveIncFootFile] = {};
                    if (colInfo.inc[liveIncFootFile].jscss != liveJsFile) {
                        colInfo.inc[liveIncFootFile].ver ++;
                        colInfo.inc[liveIncFootFile].vm = url;
                        colInfo.inc[liveIncFootFile].jscss = liveJsFile;
                    }
                    return `<!--#include virtual="inc/${getCollectFileName(file, m1)}"-->`;
                });
                if(!hasFoot){
                    delete colInfo.inc[liveIncFootFile];
                    collectedScriptTag = collectedScriptTag.replace('>', ' _print="2">');
                    html = html.replace(/(<\/body>|$)/i, hasBowlder ? footContent : bdc.codes.commonJS+collectedScriptTag+'$1');  //无bowlder.js的纯组件使用_print="2"
                }
            }


            var htmlFile = path.resolve(htmlDir, file);
            util.checkFolder(htmlFile);
            writeTmp(htmlFile, cleanColPath(html)); //正式环境
            log(`收集结束: ${htmlFile}\n`);
            global.VCPATH = vcpath;
        }
    });
    util.writeToLog(logfiles.collectinc, colInfo.inc, logfmts.collectinc);
    for(var key in colInfo.jscss){
        if(!colInfo.jscss[key].valid){
            delete(colInfo.jscss[key]);
        }else{
            colInfo.jscss[key].vm = Object.keys(colInfo.jscss[key].vms).join(',');
        }
    }
    util.writeToLog(logfiles.collectres, colInfo.jscss, logfmts.collectres);

    //压缩、上传
    //collect/* => static/*

    //在html中替换cdn地址

    function cleanHttpPath(str){
        str = str.replace(/(^|;)http:\/\/.*?\//g, '$1/');
        for(var key in state.bowlderAlias){
            if(state.bowlderAlias[key] == str){
                str = key;
                break;
            }
        }
        return str;
    }

    function cleanColPath(html){
        html = html.replace(/(ne-(extend|module|plugin)=")(.*?)"/g, function(all, m1, m2, m3){
            return m1+cleanHttpPath(m3)+'"';
        });
        html = html.replace(/\s+ne-alias=(['"]).*?\1/g, '');
        return html;
    }
}
