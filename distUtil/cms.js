var fs = require('fs');
var path = require('path');
var util = require("../lib/util4go");
var conf = util.conf;
var iconv = require('iconv-lite');
var $$ = require("../lib/bowlder");
var Store = require('../lib/store');
var basePack = require("../packUtil/base");
var queryCmsPath = require('./cmspath');
var ENV = process.env;
var stage = ENV.GO_STAGE_NAME;
var label = ENV.GO_PIPELINE_LABEL || 0;
var project = ENV.GO_PIPELINE_NAME;
var log = util.log;
var vc = util.vc;
var cms_channel = ENV.CMS_CHANNEL;
var CMSRESULT = global.CMSRESULT = {};
var uniqueaddrs = {}; //用来替换旧的cmsid
global.parsedFile = {};
CMSRESULT.page = util.readFromLog(util.logfiles.cmsaddrs, util.logfmts.cmsaddrs);
CMSRESULT.inc = util.readFromLog(util.logfiles.incaddrs, util.logfmts.cmsaddrs);
$$.each(CMSRESULT.page, (json, filekey) => {
    if(/\|(\d+)/.test(filekey)){
        var cid = RegExp.$1;
        var cmspath = json.cmspath;
        uniqueaddrs[`${cmspath}|${cid}`] = filekey;
    }
});
var incDir = `${util.distHtmlDir}/inc`;
var pages4verify = [];
var cms_topicids = {
    '0001': '00014PV9',
    '0003': '00034RN3',
    '0004': '0004659I',
    '0005': '000509IN',
    '0006': '00064KVI',
    '0007': '00074MMR',
    '0008': '0008520I',
    '0009': '00094NMT',
    '0010': '00104LK4',
    '0011': '001166PB',
    '0012': '00126414',
    '0015': '00154J65',
    '0016': '001667GF',
    '0023': '00234JNM',
    '0025': '00254SDF',
    '0026': '00264MLQ',
    '0029': '00294LPP',
    '0030': '00304IIN',
    '0031': '00314PSH',
    '0034': '003414UC',
    '0036': '00364MLQ',
    '0037': '0037001C',
    '0038': '0038000B',
    '0039': '0039000E',
    '0040': '0040000C',
    '0041': '0041000F',
    '0042': '0042001J',
    '0075': '00754KS9',
    '0076': '007663GC',
    '0077': '00774ISQ',
    '0080': '00804JUC',
    '9999': '00804KMH',
    '0082': '00824IGV',
    '0085': '008567TI',
    '0087': '00874MGP',
    '0091': '009163HJ',
    '0092': '00924K1R',
    '0093': '00936469',
    '0095': '009563B8',
    '0096': '00964MLI',
    '0324': '03240LCF',
    '0353': '035318HE'
};

var authFile = conf.cacheDir + "/info/.cmsauth";
if(!fs.existsSync(authFile)){
    var msg = "CMS认证文件异常。";
    if(global.exitERR){
        global.exitERR(msg);
    }else{
        throw(msg);
    }
}
var cmsauth = fs.readFileSync(authFile).toString().trim();

var cmsidDb = new Store(`${conf.cacheDir}/info/cmsid.db`, "CREATE TABLE cmsid(id, project);CREATE INDEX c_id on cmsid(id);");
var stmts = {
    find: cmsidDb.prepare("select project from cmsid where id=?"),
    save: cmsidDb.prepare(`insert into cmsid values (?,'${project}')`)
}
var distCmsDir = util.distCmsDir;
var topicid = cms_topicids[cms_channel]; //CMS栏目
if(cms_channel == '9999'){
    cms_channel = '0080';
}
var publishedID = {};

exports.publishInc = async function(quiet){
    if(!util.isDir(incDir)) return;
    log(`Inc2CMS(${incDir})`, 2, 1);
    await Promise.all(util.lsr(incDir).map(async function(file){
        file = file.trim().replace(/\.\//, '').replace(incDir+"/", "");
        util.stack("出错文件: "+file);
        var relpath = "inc/" + path.dirname(file);
        var content = util.read(incDir, file);
        var filekey = `inc/${file}|${cms_channel}`;
        var modelid;
        var modelname;
        if (/\s*<meta\s+name\s*=\s*"cms_id"\s+content="\d{4}\S+?"/i.test(content)) {
            var dir = path.dirname(file);
            var odir = util.getFolder(`${distCmsDir}/${dir}`);
            util.cpFile(`${incDir}/${file}`, odir);
        }

        modelid = getIncName(file);
        modelname = modelid.substr(-40);
        modelid = `${cms_channel}${modelid}`;
        log(`正在发布inc文件 ${modelid}(${file}):\n`);
        content = await content4cms(modelid, content, relpath);
        util.write(incDir, file, content);

        //发布到静态文件目录(如果没有对应模板，将自动创建)
        if (/simu/i.test(stage)) {
            modelid += "_test";
            modelname += "_test";
        }
        var url = await publish2cms(modelid, content, topicid, modelname);
        if (url) {
            //未根据url获取cmspath!!!
            if(!CMSRESULT.inc[filekey]) CMSRESULT.inc[filekey] = {};
            CMSRESULT.inc[filekey].cmspath = getCmsPath4Inc(modelname);
            CMSRESULT.inc[filekey].url = url;
            CMSRESULT.inc[filekey].md5 = util.getMd5(content);
            CMSRESULT.inc[filekey].ssi = cmsurl2ssi(url);
        }
        util.stack([]);
    })).catch(e=>{
        console.log(e);
    });
    util.writeToLog(util.logfiles.incaddrs, CMSRESULT.inc, util.logfmts.cmsaddrs);
}

exports.publishMain = async function(){
    log(`Main2CMS(${distCmsDir})`, 2, 1);
    await Promise.all(util.lsr(distCmsDir, /\.s?html/).map(async function(file){
        if(~file.indexOf("/inc/")){
            return;
        }
        file = file.trim();
        util.stack("出错文件: "+file);
        log(`处理${file}\n`);
        await publishPage(file);
        util.stack([]);
    }));
    util.writeToLog(util.logfiles.cmsaddrs, CMSRESULT.page, util.logfmts.cmsaddrs);
    global.channel = '';
}

async function publishPage(file){
    file = path.resolve(distCmsDir, file);
    if(global.parsedFile[file] || !fs.existsSync(file)){
        return;
    }
    global.parsedFile[file] = 1;
    var content = util.readWork(file);
    var relpath = path.dirname(file.replace(distCmsDir + "/", ""));
    if(relpath == '.'){
        relpath = "";
    }
    content = content.replace(/<!--meta .*?-->/ig, '');
    content = content.replace(/\s*<!--\s*<meta\s+name\s*=\s*"cms_id".*?-->\s*/ig, "\n");
    var content2 = content;

    var publishPromises = [];
    content = content.replace(/\s*<meta\s+name\s*=\s*"cms_id"\s+content="(\d{4})(\S+?)"(.*?)>\s*/ig, function(all, channelid, modelid, attrs){
        var cmsid = channelid + modelid;
        var nocheck = attrs && /nocheck/.test(attrs);
        publishPromises.push((async function(){
            if(!await validCMSID(cmsid, file)){
                return;
            }
            global.channel = channelid;
            content2 = await content4cms(file, content, relpath);
            var md5 = util.getMd5(content2);
            log(`正在发布 ${cmsid}(${file})\n`);

            var filekey = `${file}|${cmsid}`;
            var thisCmspath;
            var url;
            if(!CMSRESULT.page[filekey]){
                CMSRESULT.page[filekey] = {};
            }
            if (!/#parse/.test(content2) && md5 == CMSRESULT.page[filekey].md5) { //无更新
                url = CMSRESULT.page[filekey].url;
                thisCmspath = CMSRESULT.page[filekey].cmspath;
                CMSRESULT.page[filekey].update = 0;
                log(url + " 无更新.\n");
            } else {
                url = await publish2cms(cmsid, content2);
                if (!url) {
                    global.exitERR(`发布 ${cmsid}(${file}) 失败!`);
                }
                thisCmspath = cmsurl2ssi(url);
                CMSRESULT.page[filekey].cmspath = thisCmspath;
                CMSRESULT.page[filekey].url = url;
                CMSRESULT.page[filekey].md5 = md5;
                CMSRESULT.page[filekey].update = 1;
            }
            if (!nocheck) {        //检查页面
                pages4verify.push(url);
            }

            //覆盖同一cmsid时，删除旧记录
            var uniqueaddr = thisCmspath + "|" + channelid;
            var oldkey = uniqueaddrs[uniqueaddr];
            if (oldkey && (oldkey != filekey)) {
                delete CMSRESULT.page[oldkey];
            }
            uniqueaddrs[uniqueaddr] = filekey;
        })());
        return '';
    });
    await Promise.all(publishPromises).catch(e => console.log(e));
    content2 = content2.replace(/.*?(<!DOCTYPE HTML>)/i, "$1")
        .replace(/<!--#include /ig, "<!--\\#include ");
    util.writeTmp(file, content2);
}

async function validCMSID(cmsid, file){
    var valid = 1;
    if(publishedID[cmsid]){
        valid = 0;
        storeERR(`项目里多次使用同一CMSID: ${cmsid} [${file}, ${publishedID}{${cmsid}]`);
    }else{ //检查其它项目是否已占用此CMSID
        var result = await stmts.find.get(cmsid);
        if(result && result.project != project){
            valid = 0;
            storeERR(`跳过已被${result.project}项目占用的CMSID: ${cmsid}`);
        }
        if(valid){
            publishedID[cmsid] = file;
            if(!result || result.project != project){  //第一次占用该cmsid并入库
                stmts.save.run(cmsid);
            }
        }
    }
    return valid;
}

function getIncName(name){
    name = name.replace(vc.localpath+"/", "");
    name = project + '_' + name.replace(/\//g, '_').replace(/\..*/, '');
    //0034频道对模板字数有更严格要求
    name = name.substr(cms_channel == '0034' ? -46 : -96);

    return name;
}

async function content4cms(file, content, relpath){
    content = content.replace(util.UTF8BOM, '')  //去bom头
        .replace(/<meta\s+name\s*=\s*"cms_id".*?>\s*/ig, '')
        .replace(/<!--\s*<?(link|script) [^\*\n]*?-->\s*/ig, '');

    if(~content.indexOf(conf.devHost)){
        global.exitERR(`[content4cms] ${file} 存在未处理的测试机路径。`);
    }
    if (/^\s*$/.test(content)) {
        content = `<!-- ${file} -->`;
    } else {
        content = await util.replaceAsync(content, /<!--#include\s+(file|virtual)=(['"])(.*?)\2\s*-->/ig, (all, m1, m2, m3) => parseSSI4CMS(m3, relpath));

        //除0034、0040频道外，一律要转成gbk编码
        if(!/0034|0040/.test(cms_channel)){
            content = content.replace(/content="text\/html;\s*charset=utf\-?8"/i, 'content="text/html; charset=gbk"');
            content = content.replace(/(<meta.*?charset)="utf\-?8"/i, '$1="gbk"');
        }
        content = content.replace(/<!--!(include\s+virtual.*?)-->/g, '<!--#$1-->'); //cms include
    }
    return content;
}

async function parseSSI4CMS(ssi, relpath){
    ssi = ssi.replace(/^\.\//, '')
        .replace(new RegExp(util.tmpDir + "/.*?/"), `/${vc.cdnfix}${vc.path}/`);  
    var result = `<!--#include virtual="${ssi}"-->`;
        global.indent += 2;
    var abspath = /^\//.test(relpath) ? relpath
            : path.resolve(vc.localpath, relpath);
    var file = util.expandSSIPath(ssi, abspath);
    var ssitype = util.ssiType(file);
    if(ssitype == 0){
        log(`外部SSI(${file}) .. \n`);
        var cmspath = getCmspath(file);
        if (cmspath) {
            log(`   替换为${cmspath}\n`);
            result = `<!--#include virtual="${cmspath}"-->`;
        } else {
            if (fs.existsSync(file)) {
                log("   内联替换\n");
                result = await inlineSSI4CMS(file) || result;
            } else {
                log("   保持不变\n");
            }
        }
    }else if(ssitype == 1 && ENV.CMS_CHANNEL){
        log(`本项目INC(${file}) .. \n`);
        var modelname = getIncName(file);
        var cmspath = getCmsPath4Inc(modelname);
        log(`   替换为${cmspath}\n`);
        result = `<!--#include virtual="${cmspath}"-->`;
    }else{
        log(`本项目普通SSI(${file}) ..\n`);
        if (fs.existsSync(file)) {
            var content = util.readWork(file);
            var cmspath;
            if (!/<meta\s+name="skip"/i.test(content)) { //不跳过发布
                global.indent += 2;
                await publishPage(file);
                global.indent -= 2;
            }
            cmspath = getCmspath(file);
            if (cmspath) {
                log(`   替换为${cmspath}\n`);
                result = `<!--#include virtual="${cmspath}"-->`;
            } else {
                log(`   碎片不发布，需内联替换\n`);
                if (fs.existsSync(file)) {
                    result = await inlineSSI4CMS(file) || result;
                }
            }
        } else {
            log(`  : ${file}不存在.\n`);
        }
    }
    global.indent -= 2;

    return result;
}

async function publish2cms(modelid, content, topicid, modelname){
    if(!modelid){
        log("cms_id为空!\n");
        return 0;
    }
    if(!content){
        log(modelid+" 模板内容为空!\n");
        return 0;
    }

    if(ENV.GO_TEST) {
        log(`modelid: ${modelid}, topicid: ${topicid}\n`);
        if(topicid){
            var ssi = getCmsPath4Inc(modelname);
            log(`inctest: ${ssi}\n`);
            var rsyncCmsFile = `${util.distHtmlDir}${ssi}`;
            util.checkFolder(rsyncCmsFile);
            util.writeTmp(rsyncCmsFile, content);
        }
        return `http://go.163.com/special/${modelid}/`;
    }
    
    var [user, pass] = cmsauth.split(':');
    pass = escape(pass);
    var channelID = modelid.replace(/.*?(\d{4}).*/, '$1');
    var extCMS = channelID > '0100' && channelID < '1000';  //房产外包
    if (!extCMS) {
        content = iconv.encode(iconv.decode(content, 'utf-8'), 'gbk');
    }

    var api = extCMS ? 'http://housecms.ws.netease.com/servlet/publishspecial.do' : 'https://cms.ws.netease.com/servlet/webservice.do';
    if(/0034/.test(channelID)){ //3g
        api = "https://3gcms.ws.netease.com/cms/model/updateContent.do";
    }
    if(extCMS){
        user = 'xqwei&isUnCheckIp=true';
        pass = '*0C41009C77A42A88B7240F1330DF4500B7BB6B1F';
    }
    var params = {
        target: "model",
        extname: ".html",
        userid: user,
        password: pass,
        modelid: modelid,
        content: content,
        writer: global.writer+"~"
    }
    //发布到SVN静态目录(自动创建文件)
    if(topicid){
        //在topicid目录下创建模板页
        if(!modelname){
            modelname = modelid.substr(-40);
        }
        params.topicid = topicid;
        params.modelname = modelname;
        params.freq = 0;
    }
    var str = await util.wpost(api, params, extCMS ? 'utf-8' : 'gbk');
    if(/<error>([\s\S]*?)<\/error>/.test(str)){
        var error = RegExp.$1;
        util.writeTmp("cmserr.html", content);

        global.exitERR(`发布 ${modelid}(topicid:${topicid}, modelname:${modelname}) 失败，以下为CMS报错: \n${error}`);
    }else if(/<url>(.*?)<\/url>/.test(str) || /"url":"(.*?)"/.test(str)){
        var url = RegExp.$1;
        url = url.replace(/\?.*/, '');
        var ssi = cmsurl2ssi(url);
        log(`${url} done.\n`);
        var rsyncCmsFile = `${conf.distHtmlDir}${ssi}`;
        util.checkFolder(rsyncCmsFile);
        util.writeTmp(rsyncCmsFile, content);
        //upload2ImgCdn(); //及时将合并资源上传
        return url;
    }else{
        util.writeTmp("cmsto.html", content);
        global.exitERR(`发布 ${modelid}(topicid:${topicid}, modelname:${modelname}) 异常，以下为CMS返回信息: \n${str}`);
    }
    return '';
}

function cmsurl2ssi(url){
    var channel = global.channel || cms_channel;
    var pathFix = /0034/.test(channel) ? '/ntes' : ''; //wap
    var topicid, modelname;
    if(/\/special\/([^\/]*?)\/([^\/]*)/.test(url)){
        topicid = RegExp.$1;
        modelname = RegExp.$2;
    }
    if (!modelname) {
        modelname = topicid;
        topicid = "sp";
    }
    modelname = modelname.replace(/\.html$/, '');
    return `${pathFix}/special/${topicid}/${modelname}.html`;
}

async function inlineSSI4CMS(file){ //输出内联ssi
    var absdir = path.dirname(file);
    var html = util.readWork(file);
    if(/\.json$/.test(file)){
        html = await basePack.parseResInJson(html, file); //group, $file只用于取group名
    }else{
        html = html.replace(/<meta\s+name\s*=\s*"cms_id".*?>\s*/ig, '')
        html = await basePack.parseResInHtml(html);
    }
    html = await util.replaceAsync(html, /<!--#include\s+(file|virtual)=(['"])(.*?)\2\s*-->/ig, (all, m1, m2, m3) => parseSSI4CMS(m3, absdir));
    return html;
}

function getCmspath(file){
    file = file.replace(vc.localpath+"/", "").replace(vc.localhost+"/", "");
    var channel = global.channel || cms_channel;
    var pattern = `${file}|${channel}`;
    var cmspath;
    //从本项目发布记录中查找
    $$.each(CMSRESULT.page, (data, filekey) => {
        if (filekey.indexOf(pattern) == 0) {
            cmspath = data.cmspath;
        }
    });
    //注：不存在的ssi直接返回''
    return cmspath || queryCmsPath(channel, util.findProject(file));
}

function getCmsPath4Inc(modelname){
    var channel = ENV.CMS_CHANNEL;
    var pathFix = /0034/.test(channel) ? '/ntes' : ''; //wap
    var nof2e = {'0012':1, '0077':1, '0082':1, '0015':1, '0034':1};
    if (/simu/i.test(stage)) {
        modelname += "_test";
    }
    if (channel == '9999') { //全站通用
        return `${pathFix}/special/ntes_common_model/${modelname}.html`;
    } else if (nof2e[channel] || channel > '0100') { //无法设置/f2e/目录名
        return `${pathFix}/special/${topicid}/${modelname}.html`;
    } else {
        return `${pathFix}/special/f2e/${modelname}.html`;
    }
}

function storeERR(err){
    console.log(err);
    global.storeErrs.push(err);
}
