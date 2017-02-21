var ENV = process.env;
var project = ENV.GO_PIPELINE_NAME;
if(!project){console.log("No project!"); process.exit(1);}
var pwd = process.cwd();
var fs = require('fs');
var request = require('request');
var iconv = require('iconv-lite');
var uglifyjs = require("uglify-js"); //https://github.com/mishoo/UglifyJS2
var uglifycss = require('uglifycss');
var path = require('path');
var mkdirp = require('mkdirp');
var proc = require('child_process');
var crypto = require('crypto');
var $$ = require('./bowlder');
var conf = exports.conf = require('../' + (ENV.GO_CONFIG || 'conf'));
var cacheDir = global.cacheDir = conf.cacheDir || "/tmp/fepack";
var ftp = require('./ftp');
var vc = exports.vc = require('../vcUtil/' + conf.vc.type); //version control utils
var isDir = exports.isDir = (dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory();
getFolder(path.resolve(pwd, "cruise-output"));

//项目配置
var projectJson = exports.projectJson = fs.existsSync("project.json") ?
    JSON.parse(fs.readFileSync("project.json").toString().replace(/\\\s*?(\r|\n)+/g, '').replace(/(^|\n)\s*\/\*[\s\S]*?\*\//g, '').replace(/\t+/g, '').replace(/(^|\n)\s*\/\/.*/g, ''))
    : {};
if(projectJson.chdir){
    if(isDir(projectJson.chdir)){
        console.log(`Chdir: ${projectJson.chdir}`);
        process.chdir(projectJson.chdir);
        pwd = process.cwd();
    }
}

var vcver = ENV.GO_REVISION || 1;  //代码仓库版本
var stage = ENV.GO_STAGE_NAME;
var label = ENV.GO_PIPELINE_LABEL || 0; //go发布次数
conf.devHost2 = conf.devHost2 || conf.devHost;
var quotemeta = exports.quotemeta = s => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
var binaryReg = exports.binaryReg = /\.(jpe?g|png|bmp|svg|swf|mp3|gif|ico|ttf|otf|eot|apk|ipa|plist|woff\d?|gltf)$/i;
if(!conf.compress){
    conf.compress = {
        js: ENV.JS_COMPRESS,
        css: ENV.CSS_COMPRESS
    }
}
if(conf.compress.js == 0) conf.compress.js = false;
if(conf.compress.css == 0) conf.compress.css = false;

global.cdnCount = 0;
global.diffiles = {};  //需要刷cdn缓存的文件
global.indent = 0;
global.context = "";
global.VCPATH = vc.path;
global.storeErrs = [];

console.log(`开始处理: (${JSON.stringify(conf.vc)})`);

var read = exports.read = (dir, file) => {
    file = path.resolve(dir || __dirname, file);
    if(!fs.existsSync(file)){
        throw(`文件不存在: ${file}`);
        return "";
    }
    return fs.readFileSync(file).toString();
}
var cpFile = exports.cpFile = function(a, b){
    if(isDir(b)){
        b = path.resolve(b, path.basename(a));
    }
    fs.writeFileSync(b, fs.readFileSync(a));
}
var write = exports.write = (dir, file, str) => fs.writeFileSync(path.resolve(dir || __dirname, file), str.replace(/\r/g, ''));
var execSync = exports.execSync = function(command, options){
    return proc.execSync(command, $$.extend({
        encoding: "utf-8",
        killSignal: "SIGPIPE"
    }, options));
}
var skipFiles = {};

$$.each(conf.cdns, cdn=>{
    if(ENV.HTTPS_CDN){
        cdn.base = cdn.base.replace("http://", "https://");
    }
    if(cdn.ftp){
        var authFile = path.resolve(global.cacheDir + "/info", cdn.authFile);
        if(!fs.existsSync(authFile)){
            global.exitERR(cdn.ftp + "认证文件异常。");
        }
        cdn.ftp = fs.readFileSync(authFile).toString().trim() + '@' + cdn.ftp;
    }
});
conf.serverBase = conf.serverBase.replace(/\/*$/, '');

// 静态资源不使用单独cdn时，将上传到conf.serverBase下
var resRoot = conf.cdns && conf.cdns[0] && conf.cdns[0].base || '';
// 本荐静态资源在CDN上的基准目录
vc.cdnBase = resRoot ? resRoot + "/" + vc.cdnfix + vc.path : $$.template.replace(conf.serverBase, vc);
vc.base = conf.vc.host + "/" + vc.path;  //仓库地址

var infoDir = exports.infoDir = getFolder(cacheDir + `/info/${project}`); //已发布文件信息
var backupDir = exports.backupDir = getFolder(cacheDir + `/backup/${project}`); //可rollbak的历史文件
var tmpDir = exports.tmpDir = getFolder(cacheDir + `/tmp/${project}`); //中间文件
var distDir = exports.distDir = getFolder(cacheDir + `/dist/${project}`);  //处理过的html/js/css/images，按发布目标分开
//var colHtmlDir = exports.colHtmlDir = tmpDir + "/html4col";
var distCmsDir = exports.distCmsDir = distDir + "/html4cms";  //cms
var distHtmlDir = exports.distHtmlDir = getFolder(distDir + "/html"); //backend
var distStaticDirs = exports.distStaticDirs = [
    getFolder(distDir + "/static", true), //img*
    getFolder(distDir + "/file", true) //file.ws
];
var UTF8BOM = exports.UTF8BOM = /^\xef\xbb\xbf/;
var sTime = +new Date;
var readInfo = exports.readInfo = read.bind(null, infoDir);
var readTmp = exports.readTmp = read.bind(null, tmpDir);
var readDist = exports.readDist = read.bind(null, distDir);
var writeInfo = exports.writeInfo = write.bind(null, infoDir);
var writeTmp = exports.writeTmp = write.bind(null, tmpDir);
var writeDist = exports.writeDist = write.bind(null, distDir);
var writeBackup = exports.writeDist = write.bind(null, backupDir);
var readWork = exports.readWork = function(file){
    if(vc.localpath && file.indexOf(vc.localpath) == 0){
        file = file.replace(vc.localpath+"/", "");
    }else{
        file = file.replace(new RegExp(`^/${vc.cdnfix}${vc.path}/`), "");
    }
    return read(pwd, file);
}
var writeWork = exports.writeWork = write.bind(null, pwd);

//所有项目路径
var Store = require('../lib/store');
var goDb = new Store(`${cacheDir}/info/go.db`, "CREATE TABLE pipelines(name, vcpath, manager, creator, gid);CREATE TABLE users(name, fullname, role);");
var allPaths = {};
exports.promise = (async function(){
    var tmp = await goDb.prepare("select name,vcpath from pipelines").all();
    tmp.forEach(item=>allPaths[item.vcpath] = item.name);
})();

var timers = {};
var logfiles = exports.logfiles = {
    "resfiles": ".curfiles", //静态资源js/css/swf/pic
    "cmsaddrs": ".cms.addrs",
    "incaddrs": ".inc.addrs",
    "packFiles": ".packfiles",
    "collectinc": ".collect.inc",
    "collectres": ".collect.res"
};
var logfmts = exports.logfmts = {
    "resfiles": ['cdnurl', 'md5'],
    "cmsaddrs": ["cmspath", "url", "md5"],
    "packFiles": ['cdnurl', 'md5'],
    "collectinc": ["vm", "jscss", "ver"],
    "collectres": ["url", "vm", "vcver", "fcount"]
}
var RESFILES = exports.RESFILES = {
    update: {},
    uploadCount: {1:0, 2:0, 10:0}
};
var rsyncParent = projectJson.parentProject || '';
if(rsyncParent) rsyncParent.replace(/\/+$/, '/');
var projectDir = projectJson.projectDir || project;

var syncTo = exports.syncTo = conf.syncs[parseInt(ENV.GO_SYNC_TO)];
if (syncTo) {
    if(!fs.existsSync(syncTo.base)){
        syncTo = exports.syncTo = null;
    } else {
        $$.extend(syncTo, {
            static: `${syncTo.base}/dev/${rsyncParent}${projectDir}`,
            live: `${syncTo.base}/` + (syncTo.devOnly ? 'dev' : 'live') + `/${rsyncParent}${projectDir}`,
            backup: `${syncTo.base}/backup/${rsyncParent}${project}/`
        });
    }
}

var noSuffixFiles = {};
if(projectJson.noSuffix){
    var files = glob(pwd, projectJson.noSuffix);
    files.forEach(file => noSuffixFiles[file] = 1);
    console.log("[noSuffix] ". files.join("; "));
}
function noSuffix(file){
    return projectJson.noSuffix == '*' || noSuffixFiles[file] || isPreserved(file);
}

//无视skipRes，仍然上传cdn的文件列表
var resWhitelist = {};
if(projectJson.resWhitelist){
    var files = glob(pwd, projectJson.resWhitelist);
    files.forEach(file => resWhitelist[file] = 1);
    console.log("[resWhitelist] ". files.join("; "));
}

//inline所有碎片
var inlineSSIFiles = {};
if(projectJson.inlineSSI){
    var files = glob(pwd, projectJson.inlineSSI);
    files.forEach(file => inlineSSIFiles[file] = 1);
    console.log("[inlineSSIFiles] ". files.join("; "));
}

//忽略的文件列表
var skipFileNames = {'gulpfile.js': 1};
if(projectJson.skipFileNames){
    projectJson.skipFileNames.split(/[,\s]+/).forEach(file => {
        skipFileNames[file] = 1;
    });
}

//homeMap, 用于branches, tags的发布
var homeMap = {'~': vc.cdnfix + vc.path};

$$.each(conf.cdns, function(cdn){
    var arr = cdn.suffix.split(/\s+/);
    cdn.suffix = {};
    arr.forEach(fmt => cdn.suffix[fmt] = 1);
});
//需添加版本号的文件后缀
var VERSIONPOSTFIX = /\.(js|css|swf|htc|apk|ipa|plist)$/;
var errStack = [];
var existImgs = {};  //检查过存在的图片
var stack = exports.stack = function(arr){
    if($$.isArray(arr)){
        errStack = arr;
    }else{
        errStack.push(arr);
    }
    return errStack;
}
exports.exec = function(command){
    return new Promise((resolve, reject) => {
        proc.exec(command, function(err, stdout, stderr){
            if(err){
                reject(err);
            }else{
                resolve(stdout);
            }
        });
    });
}
var readFromLog = exports.readFromLog = function(file, conf){
    var data = {};
    if(fs.existsSync(file)){
        var tmp = read(infoDir, file);
        tmp.split("\n").forEach(file => {
            file = file.trim();
            var arr = file.split(/\t/);
            var id = arr[0];
            if(!id) return;
            if(!conf){
                data[id] = arr[1];
            }else{
                data[id] = {};
                for(var i = 1; i < arr.length; i ++){
                    data[id][conf[i-1]] = arr[i];
                }
            }
        });
    }
    return data;
}
var writeToLog = exports.writeToLog = function(file, data, conf){
    var len = $$.isArray(conf) ? conf.length : 0;
    var arr = [];
    $$.each(data, (val, id) => {
        if(!id) return;
        var tmp = [id];
        if(len <= 0){
            tmp.push(val);
        }else{
            for(var i = 0; i < len; i ++){
                tmp.push(val[conf[i]]);
            }
        }
        arr.push(tmp.join("\t"));
    });
    write(infoDir, file, arr.join("\n"));
}

var log = exports.log = function(msg, indent, logTime){
    if(msg){
        if(logTime){
            console.log(msg +": "+printTime('', true));
        }else{
            var prefix = times("　", global.indent) + global.context;
            process.stdout.write(prefix + msg);
        }
    }
    if(indent){
        global.context = times(" ", indent);
    }
}

function expandSSIPath(ssi, dir){
    //返回ssi的本地全路径
    //dir为相对于工作目录的相对路径
    if (/^\//.test(ssi)) {
        return `${vc.localhost}${ssi}`;
    }
    var file = path.resolve(dir, ssi);
    if (!/^\//.test(file)) {
        file = fulldir(file, vc.localpath);
    }
    return file;
}
exports.expandSSIPath = expandSSIPath;

function ssiType(file){
    var base = vc.localpath;
    if (file.indexOf(base + "/inc/") == 0) {  //本项目inc
        return 1;
    } else if (file.indexOf(base) == 0) { //本项目其它文件
        return 2;
    } else {
        return 0;
    }
}
exports.ssiType = ssiType;

function uniformStaticAddr(html){
    if(!conf.devHost){
        return html;
    }
    return html.replace(/http:\/\/dev\.f2e\.(163|netease)\.com/g, conf.devHost)
        .replace(new RegExp(conf.devHost2, "g"), conf.devHost);
}

// 默认扩展为 ${devHost}/${vcPath}/${file}
function fulldir(file, dir){
    if(file.length > 300 || /^(data|about):|[\s\+'"]/i.test(file) || !/^[\w\.\/\~]/.test(file) || file == 'null' || (/[\{\$]/.test(file) && !/^(\/|image)/.test(file))) { //表达式或base64地址
        return file;
    }
    if(file.indexOf("//") == 0 || ~file.indexOf("://")){ //uri
        return file;
    }
    $$.each(homeMap, (val, alias) => {
        file = file.replace(new RegExp(`(\.com|^)/?${alias}/+`), "$1/" + val + "/");
    });
    var host = '';
    if(!dir){
        host = conf.devHost;
        dir = '/' + global.VCPATH;
    }else{
        dir = dir.replace(/[^\s\/]+\.(jpg|jpeg|png|bmp|gif|js|pdf|css|eot|ttf|fnt|ico)$/, '');
    }
    dir = dir.replace(/(^|.*?:)\/\/.*?(?=\/)/, all => {
        host = all;
        return '';
    });
    if(dir.indexOf("//") == 0 || ~dir.indexOf("://")){        //uri地址
        return file;
    }
    file = dir.indexOf('/')==0 ? path.resolve(dir, file) : path.resolve('/'+dir, file).substr(1);
    return host + file;
}

function fulldir2(file, dir){
    if(conf.devHost){
        dir = dir.replace(conf.devHost, "http://img2.cache.netease.com/f2e");
    }
    file = file.replace(/['"\s]/g, '');
    return "url(" + fulldir(file, dir) + ")";
}

function cdnpath(file){
    if(/\.(jpe?g|png|gif|bmp|svg|ico|js|pdf|css|htc|swf|mp3|apk|ipa|plist|woff\d?|ttf|eot|gltf)$/.test(file)){
        file = fulldir(file);
        if (!VERSIONPOSTFIX.test(file)){  //直接替换本项目图片
            var match = false;
            file = file.replace(new RegExp(`${conf.devHost}/${vc.path}`), all=>{
                match = true;
                return vc.cdnBase;
            });
            if(match){
                return file;
            }
        }
    }
    file = uniformStaticAddr(file);
    if (file.indexOf(conf.devHost) == -1) {
        return file;
    } else {  //替换目录
        var dir = file.replace(conf.devHost, vc.localhost);
        if(isDir(dir)){  //纯目录url
            dir = dir.replace(vc.localhost, resRoot);
            return dir;
        }
    }
    var params = '';
    file.replace(/[\#\?].*/, all => {
        params = all;
        return '';
    });
    var cdnpath = getCdnPath(file);
    if (!cdnpath) {
        cdnpath = file;
    } else if (params) {
        cdnpath = cdnpath + params;
    }
    if(ENV.HTTPS_CDN){
        cdnpath.replace("http://", "https://");
    }else if(ENV.HTTPS_CDN === '0'){
        cdnpath.replace("https://", "http://");
    }
    return cdnpath;
}

var findProject = exports.findProject = function(file){ //根据文件定位所属项目
    file = file.replace(new RegExp(`^(${conf.devHost})?/+`), "");
    
    var projectName = "";
    if(file.indexOf(vc.path) == 0){
        projectName = project;
        file = file.replace(vc.path + "/", "");
    }else if(!projectName){
        var arr = file.split('/');
        for(var i = 1; i < arr.length; i ++){
            var subdir = arr.slice(0, -i).join('/');
            if(allPaths[subdir] || subdir == vc.path){
                projectName = allPaths[subdir] || vc.path;
                file = arr.slice(-i).join("/");
                break;
            }
        }
        projectName = projectName.replace(/\//g, '_');
    }
    return [projectName, file];
}

function getCdnPath(file){
    var projectName, url = '';
    [projectName, file] = findProject(file);
    if (conf.firm == 'netease' && /^(common|libs)\//.test(file)) {
        return resRoot + "/" + file;
    }
    if(projectName == project){ //本项目
        url = (RESFILES.current[file] && RESFILES.current[file].cdnurl) || '';
    }
    if(!url){
        var curFilesName = cacheDir + `/info/${projectName}/.curfiles`;
        if (fs.existsSync(curFilesName)) {
            var tmp = readTmp(curFilesName);
            if (new RegExp(`(^|\n)(\.\/)?${file}\t(http\\S+)`).test(tmp)) {
                url = RegExp.$3;
            }
        }
    }
    return url;
}

function cdnImgPath(origPath, quote, cssDir){
    //将相对地址替换为全路径
    //如果图片不存在，则尝试从代码仓库上传到cdn(参数是url)
    //如果非图片文件不存在，则报错退出
    var url = origPath;
    var slash = "";
    url = url.replace(/(\\)$/, (all, m1)=>{ //in script: \"path\"
        slash = m1;
        return '';
    });
    url = fulldir(url, cssDir);    //cssDir为图片源css所在目录
    
    if(conf.devHost){
        var match = false, urlPath = url.replace(conf.devHost + "/", all=>{
            match = true;
            return "";
        });
        if(match && /(jpg|jpeg|gif|png|bmp|svg|cur|ico|ttf|eot)(\?|#|$)/i.test(urlPath)){
            //替换static中的图片
            if(!/['"\{\$\[]/.test(urlPath)){
                urlPath = urlPath.replace(/([\?\#].*)/, '');
                vc2cdn(urlPath);  //检查并确保url上线
            }
            url = url.replace(conf.devHost, resRoot);
        } else if (/^https?:/.test(url)) {
            //替换static中的非图片文件
            url = cdnpath(url);
            if (~url.indexOf(conf.devHost)) {
                if(new RegExp(`${conf.devHost}/${vc.cdnfix}${vc.path}/(.*)\\.(js|css)$`).test(url)){
                    //替换时，发现从未发布过的本项目js/css
                    var tmpfile = RegExp.$1;
                    var extname = RegExp.$2;
                    var workfile = tmpfile+"."+extname;
                    if(fs.existsSync(workfile)){
                        if(noSuffix(workfile)){
                            url = vc.cdnBase+"/"+workfile;
                        }else{
                            url = vc.cdnBase+"/"+tmpfile+"."+vcver+"."+extname;
                        }
                    }
                    log(`发现未发布的本项目文件: ${workfile} => ${url}\n`);
                }
                if (~url.indexOf(conf.devHost)) {
                    global.exitERR(`${url} 没有对应的cdn地址...`);
                }
            }
        }
    }

    if (quote) {
        if(quote == '.') quote = '';
        return quote+url+slash+quote;
    } else {
        return `url(${url})`;
    }
}

function expandFullPath(html){
    if(!conf.devHost){
        return html;
    }
    return uniformStaticAddr(html).replace(/<img([^>]*?)>/ig, (all, m1)=>expandIMGPath(m1))
        .replace(/\burl\s*\(\s*(['"]?)([^\s'"]+?)\1\s*\)/g, (all, m1, m2)=>expandURLPath(all, m2))
        .replace(/<script([^>]*?)>\s*<\/script>/ig, (all, m1)=>expandJSPath(m1))
        .replace(/<link([^>]*?)>/ig, (all, m1)=>expandCSSPath(m1));
}
exports.expandFullPath = expandFullPath;

function expandURLPath(entir, src){
    if(!/^[\w\.\/]/.test(src) || /^data:/i.test(src)){
        return entir;
    }
    if (!/(https?:)\/\//i.test(src)) {
        src = fulldir(src);
    }
    return `url(${src})`;
}

function expandIMGPath(tmp){
    tmp = tmp.replace(/\/\s*$/, '');
    if (/src\s*=\s*(['"]?)\s*(\S+?)\s*\1(\s|$)/i.test(tmp)) {
        var sep = RegExp.$1;
        var src = RegExp.$2;
        var osrc = quotemeta(src);
        if (!/(https?:)\/\//i.test(src)) {
            src = fulldir(src);
            tmp = tmp.replace(new RegExp(`src\\s*=\\s*${sep}\\s*${osrc}\\s*${sep}`), "src="+sep+src+sep);
        }
    }    
    return `<img ${tmp}>`;
}

function expandJSPath(tmp){
    tmp = tmp.replace(/\/\s*$/, '');
    if(/ _keep="2"/i.test(tmp)){
        return `<script${tmp}></script>`;
    }

    if (/src=(['"]?)\s*(\S+?)\s*\1(\s|$)/i.test(tmp)) {
        var sep = RegExp.$1;
        var src = RegExp.$2;
        var osrc = quotemeta(src);
        if (!/(https?:)\/\//i.test(src)) {
            src = fulldir(src);
            tmp = tmp.replace(new RegExp(`src=${sep}\\s*${osrc}\\s*${sep}`), "src="+sep+src+sep);
        }
    }

    if (~tmp.indexOf(conf.devHost)) { //utf-8
        var match = false;
        tmp = tmp.replace(/charset=.*?(\s|$)/, function(all, m1){
            match = true;
            return `charset="utf-8"${m1}`;
        });
        if(!match){
            tmp = `${tmp} charset="utf-8"`;
        }
    }
    return `<script${tmp}></script>`;
}

function expandCSSPath(tmp){
    tmp = tmp.replace(/\/\s*$/, '');
    if (/href\s*=\s*(['"]?)\s*(\S+?)\s*\1(\s|$)/i.test(tmp)) {
        var sep = RegExp.$1;
        var src = RegExp.$2;
        var osrc = quotemeta(src);
        if (!/(https?:)\/\//i.test(src)) {
            src = fulldir(src);
            tmp = tmp.replace(new RegExp(`href\\s*=\\s*${sep}\\s*${osrc}\\s*${sep}`, 'i'), "href="+sep+src+sep);
        }
    }
    return `<link${tmp} />`;
}

function clearStaticPathInJS(file){
    if(!conf.devHost){
        return;
    }
    if(fs.existsSync(file)){
        var content = uniformStaticAddr(read(pwd, file))
                .replace(new RegExp(`ne-(module|plugin|alias|extend)=\\"${conf.devHost}/`, 'g'), 'ne-$1=\\"/#');
        write(pwd, file, quoteAddr2Cdn(content));
    }
}

var procSingleCss = exports.procSingleCss = async function(f, compress, content, cssDir){
    var nsize, osize;  //共计引用的css数，新旧文件大小
    var start_time = +new Date;
    global.csscount = 1;

    if(f) content = readTmp(f);
    osize = 0;
    content = content.replace(UTF8BOM, "").replace(/\/\*.*?\*\/|\r/g, '');
    content = await replaceAsync(content, /\@import\s+url\((.+?)\)\s*;*\s*/ig, async function(all, m1){
        return await getcss(m1, cssDir)
    });
    content = await replaceAsync(content, /\@import\s*(['"])(.+?)\1\s*;*\s*/ig, async function(all, m1, m2){
        return await getcss(m2, cssDir)
    });
    content = quoteAddr2Cdn(content);

    osize = content.length;           //压缩前的文件大小
    content = exports.toAscii(content);

    if (compress) {
        nsize = compressCss(content, f, {maxLineLen: 80}).length;  //压缩后的文件大小
    }

    errStack = [];
    timers.procSingleCss += +new Date - start_time;
    return [nsize, osize, global.csscount, content];
}

var fetchCache = {};
function wget(url, charset){
    return new Promise((resolve, reject) => {
        var start_time = +new Date;
        if(!timers.wget) timers.wget = 0;
        request(url, function(err, res, body){
            timers.wget += +new Date - start_time;
            if(err){
                reject(err);
                global.exitERR(`无法访问远程url: ${url}。`);
                return;
            }
            if(charset && charset.toLowerCase() == 'gbk'){
                body = iconv.encode(iconv.decode(body, 'gbk'), 'utf-8');
            }
            resolve(body);
        })
    });
}
exports.wget = wget;
exports.wpost = function(url, params, charset){
    var timeOut = 40; //40s超时
    return new Promise((resolve, reject) => {
        var start_time = +new Date;
        if(!timers.wget) timers.wget = 0;
        var _tm = setTimeout(function(){
            global.exitERR(`${url}请求超时(>${timeOut}s)。`);
        }, timeOut*1000);
        request.post(url, params, function(err, res, body){
            clearTimeout(_tm);
            if(err){
                reject(err);
                global.exitERR(`无法保存到 ${url}。`);
                return;
            }
            if(charset.toLowerCase() == 'gbk'){
                body = iconv.encode(iconv.decode(body, 'gbk'), 'utf-8');
            }
            resolve(body);
        });
    });

}
async function fetchUrl(url, gbk, ignoreErr){
    var content;
    if(new RegExp(`^${conf.devHost}/(.*?\\.(js|css|json|s?html))$`).test(url)){
        var file = RegExp.$1;
        if(new RegExp(`${vc.path}/(.*)`).test(file) && fs.existsSync(RegExp.$1)){ //本项目文件
            file = RegExp.$1;
            content = readWork(file);
        }else{
            if(!fs.existsSync(file)){
                file = path.resolve(vc.localhost, file);
            }
            if(!fs.existsSync(file)){
                if(ignoreErr){
                    log(`${url} not exists.`);
                }else{
                    global.exitERR(`fetchUrl failed: ${file}(${vc.path})。`);
                }
            }else{
                content = readWork(file);
            }
        }
    }else{
        content = fetchCache[url];
        if(!content){
            content = fetchCache[url] = await wget(url, gbk);
        }
    }
    if(!gbk && /\.css/.test(url)){
        content = content.replace(/\@charset\s+"gb(2312|k)";/i, all => {
            gbk = true;
            return '';
        });
        if(gbk){
            content = iconv.encode(iconv.decode(content, 'gbk'), 'utf-8');
        }
    }
    return content;
}
exports.fetchUrl = fetchUrl;

async function getcss(url, cssDir){
    var dir = '';  //css所在目录
    url = url.replace(/['"\s]/g, '').replace(/^\//, "http://");
    url = uniformStaticAddr(url);
    if(!/:\/\//.test(url)){
        url = fulldir(url, cssDir);
    }
    if(/(.*)\//.test(url)){
        dir = RegExp.$1;
    }
    var content = await fetchUrl(url);
    global.csscount ++;
    content = content.replace(/\/\*.*?\*\//g, '').relace(UTF8BOM, '');
    content = await replaceAsync(content, /\@import\s+url\((.+?)\)\s*;*\s*/ig, async function(all, m1){
        return await getcss(fulldir(m1, dir), cssDir)
    });
    content = await replaceAsync(content, /\@import\s*(['"])(.+?)\1\s*;*\s*/ig, async function(all, m1, m2){
        return await getcss(fulldir(m1, m2), cssDir)
    });
    content = await replaceAsync(content, /url\s*\(['"\s]*(.*?)['"\s]*\)/g, async function(all, m1){
        return await fulldir2(m1, dir)
    });

    return content + "\n";
}

function quoteAddr2Cdn(content){
    if(!conf.devHost){
        return content;
    }
    //将 /path/to/png 转为 /f2e/path/to/png 或 $host/f2e/path/to/png
    //将 ./png 转为 /f2e/path/png 或 $host/f2e/path/png
    return content.replace(new RegExp(`(\\\\?['"])\\s*(${conf.devHost}\\S*?)\\s*\\1`, 'ig'), (all, m1, m2) => cdnImgPath(m2, m1))
        .replace(new RegExp(`\\burl\\s*\\(\\s*(['"]?)\\s*((${conf.devHost}|\.)?/\\S+?)\\s*\\1\\s*\\)`, 'ig'), (all, m1, m2) => cdnImgPath(m2));
}

var isPreserved = exports.isPreserved = function(file){ //file不带路径
    if(conf.files && conf.files.preserve && conf.files.preserve.test(file)){
        return true;
    }
    return false;
}

function isValidFile(file){ //file不带路径
    if (/^(gulpfile\.|webpack\.config)/.test(file) || skipFiles[file]) {
        return 0;
    } else if (!/^\./.test(file) && /\.([A-z\d]+)$/.test(file)) { //忽略隐藏文件
        var ext = RegExp.$1;
        if($$.isArray(conf.cdns)){
            for(var i = 0; i < conf.cdns.length; i ++){
                if(conf.cdns[i].suffix[ext]){ //可上传cdn的文件后缀
                    return i+1;
                }
            }
        }
        
        if (/\.(s?html?|xml|php|jsp|asp|vm|md|manifest)$/.test(file)) { //html, shtml
            return 9;
        } else if (/robots\.txt$/.test(file)) {
            return 9;
        } else if (/\.json$/.test(file)) { //json
            return /^(bower|dir|project|module|package|gulpfile).json/.test(file) ? 0 : 9;
        } else {
            if(conf.files && conf.files.exclude && conf.files.exclude.test(file)){
                return 0;
            }
        }
        return 10;
    } else {
        return 0;
    }
}
exports.isValidFile = isValidFile;

function isResDir(dir, level){
    dir = dir.replace(/\/$/, '');
    var skipdir = {
        "inc": 1,
        "seajs": 1,
        "goscript": 1,
        "cruise-output": 1
    };
    return !skipdir[dir] && isValidDir(dir);
}
exports.isResDir = isResDir;

function isValidDir(dir){
    dir = dir.replace(/\/$/, '');
    if (fs.existsSync(`${dir}/skip.txt`)) {
        return 0;
    }
    if (/\.svn|node_modules/.test(dir)) {
        return 0;
    }
    return 1;    
}
exports.isValidDir = isValidDir;

function getMd5(str, short){
    var md5sum = crypto.createHash('md5');
    md5sum.update(str);
    str = md5sum.digest('hex');
    if (short) {
        str.replace(/[^A-z0-9]/, '');
        str = str.substr(0, 12);
    }
    return str;
}
exports.getMd5 = getMd5;

function toAscii(str){
    return str.replace(/([^\x00-\xFF])/g, function(match, char){
        return "\\u" + char.charCodeAt(0).toString(16);
    })
}
exports.toAscii = toAscii;

function compressJs(input, output, options){
    try{
        var result = uglifyjs.minify(input, $$.extend({
            output: {
                "ascii_only": true
            }
        }, options));
        if(output){
            writeTmp(output, result.code);
        }
        return result.code;
    }catch(e){
        var err = e.message;
        if(e.filename){
            e.code = execSync(`head -n ${e.line} a.js|tail -1`).trim();
            e.spaces = times(" ", e.col);
            err = $$.template.replace(`{{filename}}(L{{line}}, C{{col}}): \n{{code}}\n{{spaces}}^ {{message}}`, e);
        }
        global.exitERR(err);
    }
}
exports.compressJs = compressJs;

function compressCss(input, output, options){
    try{
        var result = uglifycss[$$.isArray(input) ? 'processFiles' : 'processString'](input, $$.extend({
            debug: true,
            maxLineLen: 400
        }, options));
        result = result.replace(/,SizingMethod=/ig, ", SizingMethod=");
        if(output) writeTmp(output, result);
        return result;
    }catch(e){
        global.exitERR(JSON.stringify(e));
    }
}
exports.compressCss = compressCss;

function printTime(msg, quiet){
    var interval = Math.round((+new Date - sTime)/100)/10;
    msg = (msg||'') + `[+${interval}s]`;
    if(!quiet) console.log(msg);
    return msg;
}
function times(char, count){
    var tmp = '';
    for(var i = 0; i < count; i ++){
        tmp += char;
    }
    return tmp;
}
function checkFolder(file){
    var dir = path.dirname(file);
    if(!dir) return false;
    if(!fs.existsSync(dir)){
        mkdirp.sync(dir);
    }
    return fs.statSync(dir).isDirectory();
}
function getFolder(dir, clear){
    if(!dir){
        global.exitERR(`getFolder目录不能为空。`);
    }else if(!fs.existsSync(dir)){
        mkdirp.sync(dir);
    }else if(!fs.statSync(dir).isDirectory()){
        global.exitERR(`${dir} 不是目录。`);
    }else if(clear){
        clearFolder(dir);
    }
    return dir;
}
function clearFolder(dir){
    if(!isDir(dir)) return;
    (fs.readdirSync(dir)).forEach(function(_file){
        if(_file.substr(0,1) == '.') return;
        execSync(`rm -r ${dir}/${_file}`);
    });
}

function glob(dir, patt){
    var result = [];
    patt = patt.trim();
    if(dir && patt){
        execSync(`cd ${dir};ls ${patt}`).split("\n").forEach(f => {
            f = f.trim();
            if(f.substr(0,1) == '.' || !f) return;
            result.push(f);
        });
    }
    return result;
}

var wander = exports.wander = async function(dirProc, fileProc, exlcudeRe){
    if(!exlcudeRe){
        exlcudeRe = /^(__|\.|_backup|goscript|cruise-output)/;
    }
    var dir, dirs = ['.'];
    var promise = Promise.resolve();
    while((dir = dirs.pop())){
        fs.readdirSync(dir).forEach(function(_file){
            if(exlcudeRe.test(_file)) return;
            var file = dir + '/' + _file;
            if(isDir(file)){
                if(dirProc(file, _file)){
                    dirs.push(file);
                }
            }else{
                promise = promise.then(p=>fileProc(file, _file)); //可能需要读取远程ssi
            }
        });
    }
    await promise;
}

function lsr(_dir, reg){
    var dir, list = [], dirs = [_dir];
    while((dir = dirs.pop())){
        if(isDir(dir)) fs.readdirSync(dir).forEach(function(_file){
            if(_file.substr(0,1) == '.' || _file == '_backup') return;
            var file = dir + '/' + _file;
            if(fs.statSync(file).isFile()){
                if(!reg || reg.test(file)){
                    list.push(file);
                }
            }else{
                dirs.push(file);
            }
        });
    }
    return list;
}

function checkNoStatic(dir){
    if(!conf.devHost){
        return;
    }
    lsr(dir).forEach(file => {
        var ext = path.extname(file);
        var content = readWork(file);
        if(ext == '.js'){
            content = uglifyjs.minify(content, {
                mangle: false,
                fromString: true,
                compress: {
                    unused: false
                }
            }).code;
        }else if(ext == '.css'){
            content = uglifycss.processString(content, {
                maxLineLen: 50
            });
        }else{
            content = content.replace(/<!--[\s\S]*?-->/g, '');
        }
        if(~content.indexOf(conf.devHost) || ~content.indexOf(conf.devHost2)){
            global.exitERR(`请确保${file}中不要使用带测试域名的html路径`);
        }
    });
}

//确保所引用的文件在cdn中存在
//如果cdn中不存在则尝试从版本库读取并上传cdn
//如果版本库也不存在，报错
function vc2cdn(vcFile){
    if(existImgs[vcFile]) return;
    existImgs[vcFile] = 1;
    log(`[vc2cdn] ${vcFile}: `);
    var cdnFile = `${resRoot}/${vcFile}`;
    if (vcFile.indexOf(vc.path) == 0){
        vcFile = vcFile.replace(vc.path, '');
        if(fs.existsSync(vcFile)) { //本项目文件
            console.log("存在于本项目");
            return;
        }
    }else{
        var tmp = wget(cdnFile);
        if(tmp){
            console.log("存在于CDN");
            return;
        }else{
            if(vc.upload && conf.cdns[0]){ //尝试从版本库读取并上传cdn
                if(vc.upload(vcFile, ftp.publish.bind(ftp, conf.cdns[0].ftp))) return;
            }
        }
    }
    console.log("不存在");
    global.exitERR(`${cdnFile} 不存在且无法从版本库上传`);
}

var sync2backend = exports.sync2backend = function(distHtmlDir, rDir){ //通过rsync、scp等同步
    if (rDir) {
        var syncCmd = syncTo.type || 'cp';
        log(`[syncTo] ${syncCmd} to ${rDir}\n`);
        getFolder(rDir);
        if (!/devQA/i.test(stage)) {
            try{
                execSync(`${syncCmd} -r ${distHtmlDir}/* ${rDir}/`);
                if(!global.distUtils.cdn){
                    execSync(`${syncCmd} -r ${distStaticDirs[0]}/* ${rDir}/ 2>/dev/null`);
                }
            }catch(e){
            }
        }
    }
}

exports.proc4backend = function(distHtmlDir, rDir){
    log(`同步html到后端(${rDir}, ${JSON.stringify(syncTo)})`, 2, 1);
    $$.each(projectJson.distDir, (globstr, subdir) => {
        if (globstr) {
            subdir = `${distHtmlDir}/${subdir}`;
            getFolder(subdir);
            execSync(`cd ${distHtmlDir}/;mv ${globstr} ${subdir} 2>/dev/null`);
        }
    });
    $$.each(projectJson.distFiles, (target, file) => {
        if (target) {
            target = `${distHtmlDir}/${target}`;
            checkFolder(target);
            execSync(`cd ${distHtmlDir}/;mv ${file} ${target} 2>/dev/null`);
        }
    });
    //自定义inc目录名称
    if(isDir(`${distHtmlDir}/inc`)){
        var incname = projectJson.distInc;
        if(incname && incname != "inc"){
            getFolder(`${distHtmlDir}/${incname}`);
            execSync(`cd ${distHtmlDir}; mv inc/* ${incname}/; rm -r inc`);
        }
    }
    fixIncPath(distHtmlDir);
    if(!/dev|qa/i.test(stage)){
        checkNoStatic(distHtmlDir);
    }
    sync2backend(distHtmlDir, rDir);
}

function procSSI4backend(file, relroot, ssitype){
    var ssifile = path.resolve(relroot, file);
    if(new RegExp(`/${vc.cdnfix}${vc.path}(/inc/.*)`).test(ssifile)){
        file = RegExp.$1;
    }
    return `<!--#include ${ssitype}="${file}"-->`;

}

function fixIncPath(dir){
    log(dir + ":\n");
    lsr(dir).forEach(filename => {
        if(isPreserved(filename)){
            return;
        }
        log(`fixIncPath ${filename}\n`);
        var file = `${dir}/${filename}`;
        if (fs.existsSync(file) && !binaryReg.test(file)) {
            var distinc = projectJson.distInc;
            if (!distinc) {
                distinc = "inc";
            }
            var html = readTmp(file);
            var subdir = path.dirname(filename);
            var oVCPATH = global.VCPATH;
            if (subdir) {
                global.VCPATH = `${oVCPATH}/${subdir}`;
            }
            if(/dev/i.test(stage)){
                //扩充相对路径，分别基于每个html所在目录
                html = expandFullPath(html);
            }
            global.VCPATH = oVCPATH;
            html = html.replace(/\s*<meta\s+name="cms_id".*?>\s*/ig, "\n");
            if(inlineSSIFiles[filename]){   //内联ssi
                html = html.replace(/<!--#include\s+(file|virtual)\s*=\s*"(\S+)"\s*-->/ig, (all, m1, m2) => inlineFinalSSI(m2, all));
            }else{
                //todo: inc/下应替换为相对路径
                var relroot = path.dirname(file);
                relroot = relroot.replace(new RegExp(`${tmpDir}/.*?/`), `/${vc.cdnfix}${vc.path}`);
                html = html.replace(/<!--#include\s+(file|virtual)\s*=\s*(["'])((inc\/|\/|\.\.\/)\S*?)\2\s*-->/ig, (all, m1, m2, m3) => procSSI4backend(m3, relroot, m1));
                if ((projectJson.parentProject && !projectJson.distInc) || projectJson.relativeInc) {
                    //汽车、有parentProject的项目inc不在服务器根目录
                    html = html.replace(/"\/?inc\//ig, `"${distinc}/`);
                } else {
                    html = html.replace(/"\/?inc\//ig, `"/${distinc}/`);
                }
                var distssi = projectJson.distSsi;
                if (distssi == 'file') {
                    html = html.replace(/<!--#include virtual="/ig, '<!--#include file="');
                } else if (distssi == 'virtual') {
                    html = html.replace(/<!--#include file="/ig, '<!--#include virtual="');
                }
                if (/^vm\//.test(filename)) {
                    html = html.replace(/<!--#include /g, "<!--\\#include /");
                }
            }

            if(ENV.HTTPS_CDN){
                if(/^dev/i.test(stage) && conf.devHost){ //测试环境手动替换https域名
                    if(!projectJson.httpDev){
                        html = html.replace(new RegExp(conf.devHost, 'g'), conf.devHttpsHost);
                    }
                }
            }
            writeTmp(file, html);
        }
    });
}

function inlineFinalSSI(ssi, result, relpath){
    var file = path.resolve(relpath||distHtmlDir, ssi);
    if(fs.existsSync(file)){
        result = readWork(file);
        result = result.trim();
    }else{
        result = "";
    }
    result = result.replace(/<!--#include\s+(file|virtual)\s*=\s*"(\S+)"\s*-->/ig, (all, m1, m2) => inlineFinalSSI(m2, all, "inc"));
    return result;
}

var filesizes = {};            //文件压缩前后的大小变化
RESFILES.current = readFromLog(logfiles.resfiles, logfmts.resfiles);

exports.cpRes = async function(workfile, base, flag){
    workfile = workfile.replace(/^\.\//, '');
    var dir = path.dirname(workfile);
    var status;
    if(/\.(css|js)$/.test(base)){
        //只收集，不单独发布
        if (projectJson.skipRes) {
            if(!resWhitelist[workfile] && !/iframe|hotNEShare|analysis/.test(base)){
                //resWhitelist的文件和统计、分享代码仍将单独发布
                return;
            }
        }
    }
    var obase = base;           //处理后的文件
    stack("出错文件: " + workfile);
    //staticDir: 静态资源发布预处理目录
    var staticDir = getFolder(path.resolve(distStaticDirs[flag-1] || distStaticDirs[0], dir));
    var copyOnly = isPreserved(base);
    
    if (!copyOnly && VERSIONPOSTFIX.test(obase) && !noSuffix(workfile)) {
        //发布所用文件名(name.$ver.js)
        obase = obase.replace(/\.([A-z]+)$/, `.${vcver}.$1`);
    }
    var outputFile = path.resolve(staticDir, obase);

    var cdnBase = conf.cdns[flag-1] ? conf.cdns[flag-1].base + "/" + vc.cdnfix + vc.path : "";
    var nsize, osize, count;

    cpFile(workfile, outputFile);

    if(copyOnly){
        log(`cpRes ${workfile} .. \n`);
    }else{
        //预处理当前版本文件
        if (/\.css$/.test(base)) {
            //内联 @import
            var cssDir = conf.devHost + path.resolve(`/${vc.path}`, dir);
            log(`cpRes ${workfile} (${cssDir}) .. `);
            [nsize, osize, count] = await procSingleCss(outputFile, conf.compress.css, '', cssDir);
            status = "done";
        } else if(/\.js$/.test(base)) {
            log(`cpRes ${workfile} .. `);
            clearStaticPathInJS(outputFile);
            status = "done";
        }
    }
    var filecontent = readTmp(outputFile);

    var pathRelProject = dir == '.' ? base : workfile;
    var md5 = getMd5(filecontent);
    var fileInfo = RESFILES.current[pathRelProject] || (RESFILES.current[pathRelProject] = {});
    var oMd5 = fileInfo.md5;
    var cdnurl = fileInfo.cdnurl;
    if (noSuffix(workfile) && new RegExp(`${base}$`).test(cdnurl)) { //上次带版本号，本次不带，强制重发
        oMd5 = '';
    }else if(VERSIONPOSTFIX.test(obase) && !noSuffix(workfile) && new RegExp(`${base}$`).test(cdnurl)) { //上次不带版本号，本次带，强制重发
        oMd5 = '';
    }
    if (ENV.GO_TEST || md5 != oMd5) {
        //文件新增或有所变更
        if (oMd5 && (!VERSIONPOSTFIX.test(obase) || noSuffix(workfile))) {
            //旧图片有更新
            var cdndir = "http://img[1-2].cache.netease.com" + path.resolve("/", `${vc.cdnBase}/${dir}`);
            global.diffiles[`${cdndir}/${base}`] = 1;
        }

        if (/\.js$/.test(obase) && conf.compress.js) {  //js
            var tmp = filecontent.split("\n");
            if($$.all(tmp.slice(0,5).concat(tmp.slice(-5)), line=>line.length<180)){ //未被压缩过
                compressJs(outputFile, outputFile);
                status = "compressed";
            }
        }

        var rfile = cdnBase + path.resolve("/", `${dir}/${obase}`);
        RESFILES.update[rfile] = 1;
        RESFILES.uploadCount[flag] ++; //改变文件数
        RESFILES.current[pathRelProject].cdnurl = rfile;
        RESFILES.current[pathRelProject].md5 = md5;
        status = `${pathRelProject} => ${rfile}`;

        /*if (/\.js$/.test(obase)) {
            osize = fs.statSync(workfile).size;
            nsize = fs.statSync(outputFile).size;
        }
        pushFileSize(rfile, nsize, osize, count);*/
    }else if(fs.existsSync(outputFile)){
        status = "nochange";
        fs.unlinkSync(outputFile);
    }
    stack([]);
    if(status){
        console.log(status);
    }
}

var replaceAsync = exports.replaceAsync = async function(str, reg, replacer){
    var promise = Promise.resolve(), result;
    var datas = [];
    while((result = reg.exec(str))){
        promise = promise.then((function(result){
            return replacer.apply(null, result).then(data => datas.push(data));
        }).bind(null, result));
    }
    await promise;
    return str.replace(reg, function(){
        return datas.shift();
    });
}

exports.lsr = lsr;
exports.checkFolder = checkFolder;
exports.clearFolder = clearFolder;
exports.getFolder = getFolder;
exports.printTime = printTime;
exports.fulldir = fulldir;
exports.cdnpath = cdnpath;
exports.checkNoStatic = checkNoStatic;   
exports.uniformStaticAddr = uniformStaticAddr;
exports.quoteAddr2Cdn = quoteAddr2Cdn;
exports.cdnImgPath = cdnImgPath;
