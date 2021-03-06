//_group, _print, _keep
var curfile;
var oldContext;
var curGroupedPath;
var fs = require('fs');
var path = require('path');
var iconv = require('iconv-lite');
var ENV = process.env;
var pwd = process.cwd();
var util = require('../lib/util4go');
var conf = util.conf;
var log = util.log;
var vc = util.vc;
var projectJson = util.projectJson;
var $$ = require('../lib/bowlder');
var Store = require('../lib/store');
var project = ENV.GO_PIPELINE_NAME;
var stage = ENV.GO_STAGE_NAME;
var execSync = util.execSync;
var uniqueProject = {lib: 1}; //合并时不添加版本号
var RESFILES = util.RESFILES;
RESFILES.packFiles = util.readFromLog(util.logfiles.packFiles, util.logfmts.packFiles);
var groupedPaths = {};
global.packjscss = {};

var packDb = new Store(`${conf.cacheDir}/info/jspack.db`, "CREATE TABLE js(name, ver, list, ctime);CREATE INDEX js_name on js(name);CREATE INDEX js_ver on js(ver);CREATE TABLE css(name, ver, list, ctime);CREATE INDEX css_name on css(name);CREATE INDEX css_ver on css(ver);");
var stmts = {
    cssCount: packDb.prepare('select count(*) as CN from css where name=?'),
    jsCount: packDb.prepare('select count(*) as CN from css where name=?'),
    addJs: packDb.prepare('insert into js values (?,?,?,?)'),
    addCss: packDb.prepare('insert into css values (?,?,?,?)')
};

exports.parseRes = async function(dir){
    log(`ParseRes ${dir}`, 2, 1);
    var promise = Promise.resolve();
    util.lsr(dir).forEach(file => {promise = promise.then(async function(){
        file = file.trim();
        if(util.binaryReg.test(file)){
            return;
        }
        if(fs.existsSync(file)){
            if(util.isPreserved(file)){
                return;
            }
            var html = util.readWork(file);
            log(`parseResInHtml ${file}:\n`);
            util.stack("出错文件: "+file);
            //对于非ssi碎片，改变fulldir时所用的相对路径
            var fileFromRoot = file.replace(new RegExp(util.distDir + '/.*?/'), '');
            if(~fileFromRoot.indexOf('/') && /<html|#header/i.test(html)){
                global.VCPATH = path.dirname(path.resolve(vc.path, fileFromRoot));
            }
            curfile = file;
            if(/\.(s?html|vm)$/.test(file)){
                html = await parseResInHtml(html, file);
            }else if(/\.json$/.test(file)){
                html = await parseResInJson(html, file);
            }
            log(`parseResInHtml ${file} done.\n`);
            util.writeTmp(file, html);
            global.VCPATH = vc.path;
            util.stack([]);
        }
    })});
    await promise;
    console.log(`ParseRes ${dir} done.`);
}

var parseResInJson = exports.parseResInJson = async function(str, name){
    name = name.replace(/(\S+\/|\.json$)/g, '');
    log(`处理JSON配置: ${name}\n`);
    if(!str) return;
    var garbage = '';
    str = util.uniformStaticAddr(str).replace(/(;\s*)$/, all=>{
        garbage = all;
        return "";
    });
    var config;
    if (/^package|gulpfile/.test(name)) {
        try{
            config = JSON.parse(str);
        }catch(e){
            
        };
        if (config) {
            await groupByJson(config, name);
            str = JSON.stringify(config);
        } else {
            global.exitERR("JSON文件解析出错：$name");
        }
    }
    return util.quoteAddr2Cdn(str) + garbage;
}

async function groupByJson(config, group){
    log(`合并JSON配置中的静态资源: ${group}\n`);
    if($$.isObject(config)){
        for(var _group in config){
            await groupByJson(config[_group], _group);
        }
    }else if($$.isArray(config)){
        var groups = {
            js: {},
            css: {}
        };
        var tmparr = [];
        $$.each(config, (src, i) => {
            if(/^[\w\/\-\.]*?\.(js|css)/.test(src)){
                src = util.fulldir(src);
            }
            if(/^https?:.*?\.(js|css)$/.test(src)){
                var fileType = RegExp.$1;
                if(!groups[fileType][group]){
                    groups[fileType][group] = [];
                }
                groups[fileType][group].push(src);
            }else{
                tmparr.push(src);
            }
        });
        if(tmparr.length != config.length){
            config.splice(0);
            if (groups.css[group]) {
                var packedCss = await csspack(groups.css[group], group, 1);
                config.push(packedCss);
            }
            if (groups.js[group]) {
                var packedJs = await jspack(groups.js[group], group, 1);
                config.push(packedJs);
            }
        }
    }
}

var parseResInHtml = exports.parseResInHtml = async function(html, file){
    if(!html) {
        return html;
    }
    curGroupedPath = {
        js: {},
        css: {}
    }
    if(/\/(inc\/\S+)/.test(file)){
        groupedPaths[RegExp.$1] = curGroupedPath;
    }
    //忽略注释里的资源
    html = html.replace(/<!--\s*<?(link|script) [^\*\(]*?-->\s*/ig, "");
    var groups = {
        js: {},
        css: {},
        parsedJs: {},
        parsedCss: {}
    };
    html = util.uniformStaticAddr(html);
    html = html.replace(/<script([\s\S]*?)>/ig, (all, tmp) => {
        if (/ _drop\s*=\s*(['"])\s*(\S+?)\s*\1/i.test(tmp)) {
            return all;
        }
        var src = '';
        var print;
        if (/src\s*=\s*(['"])\s*(\S+?)\s*\1/i.test(tmp)) {
            src = RegExp.$2;
        }
        if (src) {
            if (!/(https?:)\/\//i.test(src)) {
                src = util.fulldir(src);
            }
            if (/_print\s*=\s*(['"])\s*(\S+?)\s*\1/i.test(tmp)) {
                print = RegExp.$2;
                if (print) {
                    return all;
                }
            }
            if (/_group\s*=\s*(['"])(\S+?)\1/i.test(tmp)) { //未去重
                var group = RegExp.$2;
                if(!groups.js[group]) groups.js[group] = [];
                groups.js[group].push(src);
            }
        }
        return all;
    });
    html = html.replace(/<link([\s\S]*?)>/ig, (all, tmp) => {
        if (/ _drop\s*=\s*(['"])(\S+?)\1/i.test(tmp)) {
            return '';
        }
        var src = '';
        var print;
        if (/href\s*=\s*(['"])\s*(\S+?)\s*\1/i.test(tmp)) {
            src = RegExp.$2;
        }
        if (/\.css/.test(src)) {
            if (!/(https?:)\/\//i.test(src)) {
                src = util.fulldir(src);
            }
            if (/_print\s*=\s*(['"])\s*(\S+?)\s*\1/i.test(tmp)) {
                print = RegExp.$2;
                if (print) {
                    return all;
                }
            }
            if (/_group\s*=\s*(['"])(\S+?)\1/.test(tmp)) { //未去重
                var group = RegExp.$2;
                if(!groups.css[group]){
                    groups.css[group] = [];
                }
                groups.css[group].push(src);
            }
        }
        return all;
    });
    html = await util.replaceAsync(html, /<script([^>]*?)>\s*<\/script>(\s*)/ig, (all, m1, m2) => parseJsAddr(m1,m2,groups));
    html = await util.replaceAsync(html, /<link([\s\S]*?)>(\s*)/ig, (all, m1, m2) => parseCssAddr(m1,m2,groups));
    html = html.replace(/<img\s+([\s\S]*?)>/ig, (all, m1) => procImg(m1));
    return util.quoteAddr2Cdn(html);
}

function procImg(tmp){
    var start_time = +new Date;
    if (/src=(['"])\s*(\S+?)\s*\1/i.test(tmp)) {
        var sep = RegExp.$1;
        var src = RegExp.$2;
        var osrc = util.quotemeta(src);
        //[图片链接]  ${imgurl}
        if (/[\s\+'"\{\$]/.test(src)) {
            return `<img ${tmp}>`;
        }
        var url = util.cdnImgPath(src, '.');
        if(src != url){
            log(`  procImg: ${src} => ${url}\n`);
            tmp = tmp.replace(new RegExp(`src\\s*=\\s*${sep}\\s*${osrc}\\s*${sep}`, 'i'), "src="+sep+url+sep);
        }
    }
    return `<img ${tmp}>`;
}

var parseCssAddr = async function(tmp, spaces, groups) { //多个link合并时，将第一个link替换为合并后的css，其余删除
    var print = '';
    var group = '';
    var csscount = 0;
    if(/href\s*=\s*(['"])\s*(\S+)\s*\1/.test(tmp)){
        var sep = RegExp.$1;
        var src = RegExp.$2;
        var osrc = util.quotemeta(src);
        if (!/(https?:)\/\//i.test(src)) {
            src = util.fulldir(src);
        }
        var url = src;
        if (/rel=(['"])stylesheet/.test(tmp)){
            if (/_print\s*=\s*(['"])(\S+?)\1/i.test(tmp)) {
                print = RegExp.$2;
            } else if(!/ (_group|_drop)/.test(tmp)){ //_keep时如遇到skipRes也打印代码
                if (ENV.PRINT_CSS ||
                    (projectJson.skipRes && !/analysis/.test(url))){
                    print = 1;
                }
            }
            if(ENV.GO_TEST && ~url.indexOf(`/dist/${project}/collect/`)){
                print = 0;
            }
            if (print) {
                var content = await util.fetchUrl(url);
                if (content) {
                    content = content.replace(util.UTF8BOM, '');
                    //css压缩
                    var compress = 1;
                    if (/_compress\s*=\s*(['"])(\S+?)\1/i.test(tmp)) {
                        compress = RegExp.$2;
                    }
                    //替换相对路径
                    [content, csscount] = await preCssPack(content, url, compress);
                    content = util.toAscii(content);
                    return `<style>\n${content}</style>${spaces}\n`;
                }
            } else if (/_group\s*=\s*(['"])(\S+?)\1/i.test(tmp)) {
                group = RegExp.$2;
                if (groups.parsedCss[group]) { //多个css合并，第二个以后的位置清空
                    return "";
                }
            }
            if (group != '') {
                groups.parsedCss[group] = 1;
                var packedCss = await csspack(groups.css[group], group);
                return `<link href="${packedCss}" rel="stylesheet" type="text/css" />${spaces}`;
            }
        }
        url = util.cdnpath(url);
        if (url) {
            tmp = tmp.replace(new RegExp(`href\\s*=\\s*${sep}\\s*${osrc}\\s*${sep}`), "href="+sep+url+sep);
            tmp = tmp.replace("stylesheet/less", "stylesheet");
        }
        if (/\.less['"]/.test(tmp)) {
            parseERR("less文件未处理：$tmp\n");
        }
    }
    return `<link${tmp}>${spaces}`;
}

var parseJsAddr = async function(tmp, spaces, groups) {
    //多个script合并时，将第一个script替换为合并后的script，其余删除
    var group = '';
    var print = '';
    var packedJs;
    if (/ _drop\s*=\s*(['"])\s*(\S+?)\s*\1/i.test(tmp)) {
        return "";
    }
    if (/ _keep="2"/i.test(tmp)) {
        return `<script${tmp}></script>${spaces}`;
    }

    if(/src=(['"])\s*(\S+?)\s*\1/i.test(tmp)){
        var sep = RegExp.$1;
        var src = RegExp.$2;
        var osrc = util.quotemeta(src);
        if (!/(https?:)\/\//i.test(src)) {
            src = util.fulldir(src);
        }
        var url = src;
        if (/_print\s*=\s*(['"])(\S+?)\1/i.test(tmp)) {
            print = RegExp.$2.toLowerCase();
        } else if(!/ (_group|_drop|_keep)/.test(tmp)){
            //PRINT_JS 可强制要求将页面所有js内联输出
            if (ENV.PRINT_JS ||
                (projectJson.skipRes && !/analysis/.test(url))) {
                print = 1;
            }
        }
        if(ENV.GO_TEST && ~url.indexOf(`/dist/${project}/collect/`)){
            print = 0;
        }
        if (print) {   //js打印成<script>
            var compressed = '';
            var isGBK = /charset\s*=\s*(['"]?)(gbk|gb2312)\1/i.test(tmp);
            var content = await util.fetchUrl(url, isGBK);
            if (content) {
                content = util.quoteAddr2Cdn(util.uniformStaticAddr(content));
                //script打印到页面
                var compress = 2;  //默认混淆压缩，否则cms容易报错
                if (/_compress\s*=\s*(['"])(\S+?)\1/i.test(tmp)) {
                    compress = RegExp.$2;
                }
                var options = {
                    fromString: true,
                    mangle: false
                };
                if (compress > 1) {
                    options.mangle = true;
                }
                if (compress) {
                    content = util.compressJs(content, null, options);
                }
                content = content.replace(/<\/script(>.*?)(['"])/ig, "</script$2+$2$1$2");
                return `<script>${content}</script>${spaces}\n`;
            } else {
                return '';
            }
        }else if (/_group\s*=\s*(['"])(\S+?)\1/i.test(tmp)) {
            group = RegExp.$2;
            if (groups.parsedJs[group]) {
                return "";
            }
        } else {
            url = util.cdnpath(url);
            if(url){
                tmp = tmp.replace(new RegExp(`src=${sep}\s*${osrc}\s*${sep}`), "src="+sep+url+sep);
            }
        }
    }

    if(group == ''){
        return `<script${tmp}></script>${spaces}`;
    }else{
        groups.parsedJs[group] = 1;
        packedJs = await jspack(groups.js[group], group);
        return `<script src="${packedJs}"></script>${spaces}`;
    }
}

async function jspack(arr, group, force){
    var count = arr ? arr.length : 0;
    if(count == 0) return '';
    // 单独文件不作合并
    if(!force && !projectJson.skipRes && count == 1){
        var singlepath = util.cdnpath(arr[0]);
        if(!conf.devHost || singlepath.indexOf(conf.devHost) == -1){
            return singlepath;
        }
    }
    var nsize, osize;  //共计合并的js数，新旧文件大小
    var files = arr.join(" ");
    var packDir = `/js`;

    //js文件合并
    var content = '';
    var filenames = [];
    for(var i = 0; i < arr.length; i ++){
        content += (await util.fetchUrl(arr[i])) + ";\n";
    }
    content = util.quoteAddr2Cdn(util.uniformStaticAddr(content));

    var shortid = group;

    if(!uniqueProject[project]){  //短名
        var longid = arr.join("");
        var md5 = util.getMd5(longid, 1);
        shortid += "."+md5;
    }
    var shortname = `${vc.path}${packDir}/${shortid}`;

    var jsVer = (await stmts.jsCount.get(shortname)).CN || 0;
    var packedJsUrl;
    var fullmd5 = util.getMd5(content);
    if(!RESFILES.packFiles[shortname]){
        RESFILES.packFiles[shortname] = {};
    }
    if(uniqueProject[project]
       || (ENV.HTTPS_CDN && !/https:/.test(RESFILES.packFiles[shortname].cdnurl))
       || fullmd5 != RESFILES.packFiles[shortname].md5){
        jsVer ++;

        var output, jsDir = util.getFolder(util.distStaticDirs[0]+packDir);
        if (uniqueProject[project]) { //短名
            output = shortid+".js";
        } else {
            output = `${shortid}.${jsVer}.js`;
        }
        if (!conf.compress.js) {
            util.writeTmp(`${jsDir}/${output}`, content);
        } else {
            util.compressJs(content, `${jsDir}/${output}`, {
                fromString: true
            });
        }
        osize = content.length;
        nsize = fs.statSync(`${jsDir}/${output}`).size;

        stmts.addJs.run(shortname, jsVer, files, +new Date);
        global.cdnCount ++;
        packedJsUrl = `${vc.cdnBase}${packDir}/${output}`;
        console.log("Add: " + packedJsUrl, vc.cdnBase, output);

        RESFILES.packFiles[shortname].cdnurl = packedJsUrl;
        RESFILES.packFiles[shortname].md5 = fullmd5;

        if(uniqueProject[project]){  //短名
            global.diffiles[packedJsUrl] = 1;
        }
    }else{
        //没有变化
        var output = `${shortid}.${jsVer}.js`;
        console.log(output + "没有变化");
        packedJsUrl = `${vc.cdnBase}/${output}`;
    }
    curGroupedPath.js[group] = packedJsUrl;
    postPacked(`${packedJsUrl}`, files, nsize, osize, count);
    return packedJsUrl;
}


async function csspack(arr, group, force){
    var count = arr ? arr.length : 0;
    if(count == 0) return;
    // 单独文件不作合并
    if(!force && !projectJson.skipRes && count == 1){
        var singlepath = util.cdnpath(arr[0]);
        if(!conf.devHost || singlepath.indexOf(conf.devHost) == -1){
            return singlepath;
        }
    }
    var nsize, osize;        //共计引用的css数，新旧文件大小
    var files = arr.join(" ");

    var packDir = `/css`;

    //css文件合并
    var content = '';
    for(var url of arr){
        //追加css文件
        var tmp = await util.fetchUrl(url);
        tmp = tmp.replace(/\/\*.*?\*\//g, ''); //注释如果为gbk，后面的decode('utf-8') 会有问题
        tmp = tmp.replace(util.UTF8BOM, '');
        //替换相对路径
        var [csscontent, csscount] = await preCssPack(tmp, url);
        content += csscontent + "\n";
        count += csscount - 1;
    };
    if(global.VCPATH && conf.firm == 'netease'){
        var cdn_base = "http://img[1-6].cache.netease.com/f2e/"+vc.cdnfix+global.VCPATH;
        content = content.replace(new RegExp(cdn_base+"/css/", "g"), "") //相对于css/pack.xxxxx.d.css
            .replace(new RegExp(cdn_base+"/", "g"), "../"); //相对于css/pack.xxxxx.d.css
    }

    var longid = arr.join("");
    var md5 = util.getMd5(longid, 1);
    var shortid = `${group}.${md5}`;
    var shortname = `${vc.path}${packDir}/${shortid}`;

    var cssVer = (await stmts.cssCount.get(shortname)).CN || 0;
    content = util.toAscii(content);
    var cssPackedUrl;
    var fullmd5 = util.getMd5(content);
    if(!RESFILES.packFiles[shortname]){
        RESFILES.packFiles[shortname] = {};
    }
    if((ENV.HTTPS_CDN && !/https:/.test(RESFILES.packFiles[shortname].cdnurl))|| fullmd5 != RESFILES.packFiles[shortname].md5){
        cssVer ++;
        var cssDir = util.getFolder(util.distStaticDirs[0]+packDir);
        var output = `${shortid}.${cssVer}.css`;
        util.compressCss(content, `${cssDir}/${output}`);
        osize = content.length;
        nsize = fs.statSync(`${cssDir}/${output}`).size;
        stmts.addCss.run(shortname, cssVer, files, +new Date);
        //$files: static.f2e下文件列表

        global.cdnCount ++;
        cssPackedUrl = `${vc.cdnBase}${packDir}/${output}`;
        console.log("Add: "+cssPackedUrl);

        RESFILES.packFiles[shortname].cdnurl = cssPackedUrl;
        RESFILES.packFiles[shortname].md5 = fullmd5;
    }else{
        var output = `${shortid}.${cssVer}.css`;
        console.log(output+"没有变化");
        cssPackedUrl = util.distStaticDirs[0] + `/${vc.cdnfix}${packDir}/${output}`;
    }

    curGroupedPath.css[group] = cssPackedUrl;
    postPacked(cssPackedUrl, files, nsize, osize, count);
    return cssPackedUrl;
}

function postPacked(output, list, nsize, osize, count){
    var msg = `${output}: ${list},${nsize},${osize},${count}`;
    console.log(msg);
    if (nsize) {
        list = list.replace(/\s+/g, '<br>');
        global.packjscss[output] = list;
    }
}

function parseERR(err){
    global.exitERR("[pack.base] $curfile出错: $err。");
}

async function preCssPack(tmp, url, compress){
    var count = 1;
    util.stack("出错文件: "+url);

    var cssDir = path.dirname(url);
    [,,count, tmp] = await util.procSingleCss(undefined, compress, tmp, cssDir);
    //将css内的相对url转成绝对地址
    tmp = tmp.replace(/\burl\s*\(\s*['"]?(\S+?)['"]?\s*\)/g, (all, m1) => util.cdnImgPath(m1, null, cssDir));
    
    util.stack([]);
    return [tmp, count];
}
