//正式阶段收集器

var fs = require('fs');
var path = require('path');
var util = require('../lib/util4go');
var conf = util.conf;
var log = util.log;
var vc = util.vc;
var projectJson = util.projectJson;
var $$ = require('../lib/bowlder');
var cdnDefines = {
    '/modules/echarts/lib/echarts.js': 'http://img1.cache.netease.com/f2e/modules/echarts/lib/echarts.js'
};
function cdnDefine(file){
    return (projectJson.excludeAMD && projectJson.excludeAMD[file]) || cdnDefines[file];
}

var firstCollector = '<!--!include collector="first"-->';

function LiveCollector(){  //正式阶段收集器
    this.firstOrElse = 'js'; //当前收集器为first还是其它
    this.parentHtmls = {}; //已经收集过的主页面
    this.defined = {}; //收集过的module js
    this.predefined = {};  //和defined形成补充，用于避免死循环
    this.collectedCss = [];
    this.collectComments = [];
    this.skins = {};
    this.css = [];   //具体style，供下一阶段压缩
    this.codes = {js:'', css:'', commonLink:'', headScript:'', first:'', commonJSFirst:'', commonJS:'', purejs:''};
}
LiveCollector.prototype = {
    procComment: function(tmp){
        var bdc = this;
        if(/<(link|style|script)/i.test(tmp)){
            if(/\[endif\]/.test(tmp)){
                var cursor = bdc.collectComments.length;
                bdc.collectComments.push(tmp);
                return `<!--\$collectComments[${cursor}]-->`;
            }
            return '';
        }
        return tmp;
    },
    parseAlias: function(quote, alias){
        var bdc = this;
        bdc.alias = util.fulldir(alias, `/${vc.cdnfix}${vc.path}`);
        bdc.bowlderAlias = util.parseJson(`${vc.localhost}/${bdc.alias}`);
        log(`Alias: ${bdc.alias}\n`);
        return `ne-alias=${quote}${conf.devHost}${bdc.alias}${quote}`;
    },
    init: async function(html, htmlfile, isSub){
        var bdc = this;
        html = html.replace(/ne-alias=(['"])(\S+?)\1/g, function(all, m1, m2){
            return bdc.parseAlias(m1,m2);
        }).replace(/<!--[^#\!][\s\S]*?-->/g, function(all){
            return bdc.procComment(all);
        });
        if(!bdc.bowlderAlias){
            if(/\/common2015\/\w+nav/.test(html)){
                bdc.bowlderAlias = util.parseJson(`${vc.localhost}/include/2015/alias.js`);
            }else{
                bdc.bowlderAlias = {};
            }
        }
        bdc.urlRoot = `${conf.devHost}/${vc.cdnfix}` + global.VCPATH;
        var reg = new RegExp(`([^<>]*?)\\sne-module\\s*=\\s*(['"])([^'"<]*?)\\2((>|[\\s\\S]*?[^\\%]>)[\\s\\S]*?<[^!])|${firstCollector}`, 'ig');
        html = await util.replaceAsync(html, reg, async function(all, m1, m2, m3, m4){
            return await bdc.procModule(m1, m3, m4, all)
        });
        if(!isSub){
            bdc.codes.purejs += bdc.codes.js; //此处缓存为了避免procPlugin时，碰到firstCollector便把所有js均放到codes.first内
            bdc.codes.js = '';
        }
        bdc.commonCode = "commonJSFirst";
        html = await util.replaceAsync(html, new RegExp(`([^<>]*?)\\sne-plugin\\s*=\\s*(['"])([^'"<]*?)\\2|${firstCollector}`, 'g'), async function(all, m1, m2, m3){
            return await bdc.procPlugin(m1, m3, all);
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
                    var tmp = util.readWork(file);
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
        tmp = await (new LiveCollector).init(tmp, '', 1);
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
                if (util.headScriptMap[src]) {
                    bdc.codes.headScript += `<script src="${src}"></script>\n`;
                } else if (/\.com\/(common|libs)\//.test(src)) {
                    bdc.codes[bdc.commonCode] += `<script src="${src}"></script>\n`;
                } else if (/\.com\/(modules\/bowlder\-[\d\.]+?\.js([\#\?].*)?)/.test(src)) {
                    bdc.codes.commonJSFirst += `<script src="${vc.resRoot}/${RegExp.$1}"></script>\n`;
                } else {
                    var tmp = await util.fetchUrl(src, gbk);
                    if(/\/bowlder[\-\d\.]*?\.js$/.test(src)){ //确保bowlder.js放在first收集器
                        bowlderSrc = 1;
                        if(bdc.codes.first){
                            bdc.firstOrElse = 'first';
                            revert = 1;
                        }
                    }
                    bdc.codes[bdc.firstOrElse] +=  `${tmp}\n;`;
                    global.jscount ++;
                }
                bdc.defined["!"+src] = 1;
                if(bowlderSrc){
                    if (bdc.alias) {
                        bdc.procModule("", bdc.alias, "");
                        bdc.codes[bdc.firstOrElse] += `bowlder.run("${bdc.alias}").then(function(json){bowlder.conf({alias:json})});`;
                    }
                }
                if(revert){
                    bdc.firstOrElse = 'js';
                }
            }
        });
    },
    procExtend: async function(filestr){ //收集extend中的模块
        var bdc = this;
        var files = [];
        await $$.reducePromise(filestr.split(/\s*;\s*/), async function(file){
            if (!/^\%/.test(file)) {
                if(!/{{.*?}}/.test(file)){
                    file = util.fulldir(file, bdc.urlRoot);
                    await bdc.procDefine(file);
                }
            }
            files.push(file);
        });
        var fileStr = files.join("\n;");
        return ` ne-extend="${fileStr}"`;
    },
    procText: async function(fileURL){ //收集text类型define
        var bdc = this;
        if (!bdc.defined[`text!${fileURL}`]) {
            var text = (await util.fetchUrl(fileURL))
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
                jstmp = await util.fetchUrl(fileURL);
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
                    bdc.codes[bdc.firstOrElse] += jstmp+"\n;\n";
                }
                bdc.defined[fileURL] = jstmp;
            } else {
                jstmp = bdc.defined[fileURL];
            }
        }
        return jstmp;
    },
    procPlugin: async function(pre, basenames, match){
        var bdc = this;
        if(match == firstCollector){
            bdc.commonCode = "commonJS";
            bdc.codes.first += bdc.codes.js;
            bdc.codes.js = '';
            return match;
        }
        log(`Plugin: ${basenames}\n`);
        var filearr = [];
        await $$.reducePromise(basenames.split(/\s*;\s*/), async function(basename){
            var file = util.fulldir(basename, bdc.urlRoot);
            await bdc.procDefine(file);
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
            bdc.commonCode = "commonJS";
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
            jstmp = await bdc.procDefine(file);
        }
        var htmltmp = '';
        //按需填充模块html
        //1. 定义scope.html的模块不用收集
        if (/<\/$/.test(content) && />\s*</.test(content) && !/>\s*<!--#include\s+(file|virtual)/.test(content)) {
            if (!/\.html\s*=/.test(jstmp)) {                //js内无html定义
                var props = parseProp(pre + content);
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
                    htmltmp = await util.fetchCollectHtml(htmlfile);
                    htmltmp = htmltmp.replace(/<meta\s+name\s*=\s*"cms_id".*?>\s*/ig, '');
                    htmltmp = htmltmp.replace(/<link ([\s\S]*?)>/g, function(all, m1){
                        return bdc.moduleLink(m1);
                    });
                    htmltmp = await (new LiveCollector).init(htmltmp, '', 1);
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
        result = await util.replaceAsync(result, /^([^>]*?)\s+ne-extend\s*=\s*(['"])\s*(\S+?)\s*\2/, async function(all, m1, m2, m3){
            return m1 + (await bdc.procExtend(m3));
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
                            await bdc.procText(file);
                        } else {
                            if(/\/\w+$/.test(file)){
                                file += ".js";
                            }
                            await bdc.procDefine(file, 1);
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
                bdc.commonCode = "commonJS";
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
                            if (util.headScriptMap[src]) {
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
                            bdc.codes[bdc.commonCode] += `<script${attr}>\n${script}\n</script>\n`;
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
                                var tmpCss = await util.procCssAndExpand(src);
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
    },
    cleanHttpPath: function(str){
        var bdc = this;
        str = str.replace(/(^|;)http:\/\/.*?\//g, '$1/');
        for(var key in bdc.bowlderAlias){
            if(bdc.bowlderAlias[key] == str){
                str = key;
                break;
            }
        }
        return str;
    },
    postCollect: function(html){
        //收集完毕，清理html
        var bdc = this;
        html = html.replace(/(ne-(extend|module|plugin)=")(.*?)"/g, function(all, m1, m2, m3){
            return m1+bdc.cleanHttpPath(m3)+'"';
        }).replace(/\s+ne-alias=(['"]).*?\1/g, '');
        return html;
    }
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

module.exports = LiveCollector;
