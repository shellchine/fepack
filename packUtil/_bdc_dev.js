//测试阶段收集器

var fs = require('fs');
var path = require('path');
var util = require('../lib/util4go');
var conf = util.conf;
var log = util.log;
var vc = util.vc;
var projectJson = util.projectJson;
var $$ = require('../lib/bowlder');

var firstCollector = '<!--!include collector="first"-->';
var collectComments = [];
function DevCollector(){ //测试阶段收集器
    this.commonCode = "commonJSFirst";
    this.parentHtmls = {}; //已经收集过的主页面
    this.defined = {}; //收集过的module js
    this.predefined = {};  //和defined形成补充，用于避免死循环
    this.collectedCss = [];
    this.collectComments = [];
    this.skins = {};
    this.css = [];  //@import语法，供第一阶段测试，包含_drop="true"的内容
    this.codes = {js:'', css:'', commonLink:'', headScript:'', first:'', commonJSFirst:'', commonJS:'', purejs:''};
}
DevCollector.prototype = {
    /*
    * 如果不包含 link、style、script标签，直接返回。
    * 如果包含link、style、script，且包含[endif] 则push到bdc.collectComments,返回<!--$collectComments[idnex]-->
    * 否则返回空
    * */
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
    /*
    * set: bdc.alias, bdc.bowlderAlias
    * @return {string} 返回完整ne-alias="url"
    * */
    parseAlias: function(quote, alias){
        var bdc = this;
        bdc.alias = util.fulldir(alias, `/${vc.cdnfix}${vc.path}`);
        bdc.bowlderAlias = util.parseJson(`${vc.localhost}/${bdc.alias}`);
        log(`Alias: ${bdc.alias}\n`);
        return `ne-alias=${quote}${conf.devHost}${bdc.alias}${quote}`;
    },
    /*
    *
    * @param html {string} 文件内容
    * @param htmlfile {string} 文件路径 /var/.../html4dev/...
    * @isSub
    * */
    init: async function(html, htmlfile, isSub){
        var bdc = this;

        //处理ne-alias和注释
        html = html.replace(/ne-alias=(['"])(\S+?)\1/g, function(all, m1, m2){
            //ne-alias="#2"
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
        bdc.commonCode = "commonJSFirst";
        var reg = new RegExp(`([^<>]*?)\\sne-module\\s*=\\s*(['"])([^'"<]*?)\\2((>|[\\s\\S]*?[^\\%]>)[\\s\\S]*?<[^!])|${firstCollector}`, 'ig');
        html = await util.replaceAsync(html, reg, async function(all, m1, m2, m3, m4){
            return await bdc.procModule(m1, m3, m4, all)
        });
        if(!isSub){
            bdc.codes.purejs += bdc.codes.js; //此处缓存为了避免procPlugin时，碰到firstCollector便把所有js均放到codes.first内
            bdc.codes.js = '';
        }
        bdc.commonCode = "commonJSFirst";
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
    /*
    * 添加js
    * @param file {string} 格式：src@charset;src@charset ...
    * @param referURL {string}
    *
    * 添加 bdc.defined[!src]=1; 并且：
    * util.headScriptMap指定的js,添加到 bdc.codes.headScript
    * .com/common 、 .com/libs/  添加到  bdc.codes[bdc.commonCode]
    * .com/modules/bowlder-xxx.js bdc.codes.commonJSFirst
    *
    * */
    addJs: async function (file, referURL){ //普通js依赖(!*.js)
        var bdc = this;
        //为正式版收集js
        var revert;
        await $$.reducePromise(file.split(/\s*;\s*/), async function(src){
            var bowlderSrc = 0;
            src = util.fulldir(src, referURL);
            var gbk = 0;
            //src@#1   src@gbk
            src = src.replace(/\@([\w\-]+)$/, function(all, m1){
                var charset = m1;
                if (/gb/i.test(charset)) {
                    gbk = 1;
                }
            });
            if (!bdc.defined["!"+src]) {
                if (util.headScriptMap[src]) {
                    bdc.codes.headScript += `<script src="${src}"></script>\n`;
                } else if (/\.com\/(common|libs)\//.test(src)) {    //.com/common  .com/libs/
                    bdc.codes[bdc.commonCode] += `<script src="${src}"></script>\n`;
                } else if (/\.com\/(modules\/bowlder\-[\d\.]+?\.js([\#\?].*)?)/.test(src)) {
                    //.com/modules/bowlder-xxx.js
                    bdc.codes.commonJSFirst += `<script src="${vc.resRoot}/${RegExp.$1}"></script>\n`;
                } else {
                    global.jscount ++;
                }
                bdc.defined["!"+src] = 1;
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
    procPlugin: function (pre, basenames, match){
        var bdc = this;
        if(match == firstCollector){
            bdc.commonCode = "commonJS";
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
    /*
    * 收集script标签
    * @param html {string} 分析的内容。
    *
    * 如果有src属性:
    * 1.分析所有script标签,扩展src为完整url路径。 conf.devHost
    * 2.添加bcd.defined[!src]=1;
    * 3.并且:
    *   if util.headScriptMap指定的js,添加到 bdc.codes.headScript
    *   else
    *       添加到 bdc.codes.js
    *       com/common 、 .com/libs/  添加到  bdc.codes[bdc.commonCode]
    *       .com/modules/bowlder-xxx.js bdc.codes.commonJSFirst
    *
    * 如果没有src属性，比如内联的script代码:
    *   if 包含_drop标签 添加到 bdc.codes.js
    *   else
    *       if 显示指定type不是text/template 添加到 bdc.codes[bdc.commonCode]
    *       else 添加到 bdc.codes.js
    * */
    collectJs: async function (html){
        var bdc = this;
        //<script #1 > #2 </script>
        //<!--!include collector="first"-->
        var reg = new RegExp(`<script([^\\*\\[\\(\\+]*?)>\\n*([\\s\\S]*?)\\s*</script>|${firstCollector}`, 'ig');
        var result;
        while ((result = reg.exec(html))){
            var attr = result[1];
            var script = result[2];
            var match = result[0];
            if(match == firstCollector){
                bdc.commonCode = "commonJS";
                bdc.codes.first += bdc.codes.js + "\n";
                bdc.codes.js = '';
                continue;
            }
            /*
            * 以下条件 && 操作
            *  不包含 text/template || 包含 id="
            *  不包含 ne-alias || 不包含//g.163.com || 不包含//analytics.163.com || 不包含wrating.js
            *  不包含 document.write || 不包含vJTrack ||  不包含neteaseTracker
            * */
            if ((!/text\/template/i.test(attr) || / id="/.test(attr))
                && !/ ne-(?!alias)|\/\/(g|analytics)\.163\.com|wrating\.js/.test(attr)
                && !/ _keep=\S+?( |\/|$)/.test(attr)
                && !/document\.write|vjTrack|neteaseTracker/.test(script)) {
                // scr="#2"
                if (/src=(['"])\s*(\S+?)\s*\1/i.test(attr)) {
                    var src = RegExp.$2;
                    var jsurl_root = `${conf.devHost}/${vc.cdnfix}` + global.VCPATH;

                    //扩展src为完整url
                    if (!/https?:\/\//i.test(src)) {
                        src = util.fulldir(src, jsurl_root);
                        if(!/https?:\/\//.test(src)){
                            continue;
                        }
                    }

                    //print "收集js: $src\n";
                    if (!bdc.defined[`!${src}`]) {
                        if(!/ _drop(=| |$)/.test(attr)){ //不包含_drop标签
                            var charset = '';
                            //charset='gbk' charset='gb2312'
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
                                bdc.codes.js += `<script${attr} charset="utf-8"></script>\n`;
                            }
                        }
                    }
                }
                else {
                    if(!/ _drop(=| |$)/.test(attr)){  //不收集标记_drop的片断
                        if(/type=/.test(attr) && !/text\/javascript/i.test(attr)){
                            bdc.codes[bdc.commonCode] += `<script${attr}>\n${script}\n</script>\n`;
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
    /*
    * 处理url()中的链接。
    * 如果是http(s)://开头，则fulldir()替换。
    * 否则直接返回.
    * @param src {string} 有可能包含引号
    * @param cssroot
    * */
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
};
module.exports = DevCollector;
