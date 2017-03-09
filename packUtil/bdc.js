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
util.headScriptMap = {
    'http://img1.cache.netease.com/cnews/js/ntes_jslib_1.x.js': 1,
    'http://img1.cache.netease.com/f2e/lib/js/ne.js': 1
};
var bdDir = {
    res: util.getFolder(`${util.distDir}/collect`, 1) //收集后的js/css
};
var logfiles = util.logfiles, logfmts = util.logfmts;
var collectorRex = /<!--!include\s+collector=|<script\s.*?bowlder[\-\d\.]*?\.js/;

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

var fetchCollectHtml = util.fetchCollectHtml = async function (file){
    log(`生成收集用的html(${file}) ..\n`);
    var html = await util.fetchUrl(file);
    var abspath = path.dirname(file.replace(conf.devHost, vc.localhost));
    var modulePath = (abspath + '/')
        .replace(vc.localhost, '')
        .replace(util.distHtmlDir +'/', `/${vc.cdnfix}${vc.path}/`);
    //fix @ path
    html = html.replace(/((href|ne-module|ne-plugin|ne-extend)=['"])\@/g, '$1'+modulePath)
        .replace(/<!--#include\s+(file|virtual)=(['"])(.*?)\2\s*-->/ig, function(all, m1, m2, m3){
            return fetchSSI(m3, abspath, m1);
        });
    return html;
}
var DevCollector = require('./_bdc_dev');
var LiveCollector = require('./_bdc_live');

exports.dev = async function(htmlDir){
    bdDir.inc = util.getFolder(`${htmlDir}/inc`);
    var vcpath = global.VCPATH;
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
                    bdc.codes.css += await util.procCssAndExpand(util.fulldir(cssFile, vc.devpath));
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
        global.jscount = global.csscount = 0;
        //stripe /var/fepack/dist/tie_yun_sitegov/html4dev
        var vm = file.replace(util.distDir+'/', '').replace(/^[^\/]*/, ''); //相对项目根目录的路径
        var url = vc.devpath + vm; //"http://127.0.0.1:8990/tie/yun/sitegov" + "/info.html"
        log(`\n开始收集 ${file}: `, 2, 1);
        var html = await fetchCollectHtml(file);
        // 未收集的html源码
        if (html) {
            var bdc = new DevCollector();
            bdc.parentHtmls[url] = 1;
            var hasBowlder = 0;
            log(`获取 ${file} 成功。\n`);
            if (/:\/\/.*?\/(z\/)?(\S+)\//.test(url)) {
                global.VCPATH = RegExp.$2;
            }
            if (!/<!--!include\s+collector=(['"])head\1/.test(html)) {
                html = html.replace(/((<script.*?>\s*)*(<\/head>|<body))/i, '<!--!include collector="head"-->\n$1');
            }
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

            html = util.uniformStaticAddr(clearCollectTags(html, bdc));

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
            return fetchSSI(m3, absdir, m1);
        });
    return content;
}

function getCollectFileName(tmp, collector){
    var [, dir, file] = /(.*\/)?(.*)/.exec(tmp);
    file = `${collector}~${file}`;
    if(projectJson.collectors && projectJson.collectors[file]){
        file = projectJson.collectors[file];
    }
    return (dir || '') + file;
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

function clearCollectTags(html, bdc){           //必须在替换cdn路径之前使用
    html = html.replace(/(\s*)(<script[^\*\[\(\+]*?>)([\s\S]*?<\/script>)/ig, function(all, m1, m2, m3){
        return clearCollectTag(m1, m2, m3);
    })
    .replace(/(\s*)(<style[^\*\[\(\+]*?>)([\s\S]*?<\/style>)/ig, function(all, m1, m2, m3){
        return clearCollectTag(m1, m2, m3);
    })
    .replace(/(\s*)(<link\s[^\*\[\(\+]*?>)/ig, function(all, m1, m2){
        return clearCollectTag(m1, m2);
    });
    bdc.collectComments.forEach(function(tmp){
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
                    bdc.codes.css += await util.procCssAndExpand(util.fulldir(cssFile, vc.devpath));
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
            var hasBowlder = 0;
            log(`获取 ${file} 成功。\n`);
            if (/:\/\/.*?\/(z\/)?(\S+)\//.test(url)) {
                global.VCPATH = RegExp.$2;
            }
            if (!/<!--!include\s+collector=(['"])head\1/.test(html)) {
                html = html.replace(/((<script.*?>\s*)*(<\/head>|<body))/i, '<!--!include collector="head"-->\n$1');
            }
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
            bdc.commonCode = "commonJSFirst";
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

            html = util.uniformStaticAddr(clearCollectTags(html, bdc));

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
            writeTmp(htmlFile, bdc.postCollect(html)); //正式环境
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
    util.lsr(bdDir.res).forEach(function(file){
        var fmt = path.extname(file);
        var outfile = file.replace('/collect/', '/static/collect/');
        if(fmt == '.js'){
            util.compressJs(file, outfile);
        }else if(fmt == '.css'){
            util.compressCss([file], outfile);
        }
    });
}
