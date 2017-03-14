var fs = require('fs');
var path = require('path');
var request = require('request');
var proc = require('child_process');
var util = require("../lib/util4go");
var $$ = require("../lib/bowlder");
var Store = require('../lib/store');
var conf = util.conf;
var ENV = process.env;
var project = ENV.GO_PIPELINE_NAME;
var label = ENV.GO_PIPELINE_LABEL || 0; //go发布次数
var stage = ENV.GO_STAGE_NAME;
var log = util.log;
//杭研云部署
var tries = 0;
var server = "http://omad.hz.netease.com/api";
var tokenFile = util.tmpDir + "/.oamdtoken";
var token = "";
    
var omadList;  //productIds->envIds
var moduleList = {};
var moduleNames = {};
(async function(){
    if(ENV.GO_TEST) return;
    if(fs.existsSync(tokenFile)){
        token = util.readTmp(tokenFile);
    }else{
        await omadLogin();
    }
    try{
        omadList = JSON.parse(getOmadList());
    }catch(e){

    }
    if(!omadList){
        global.exitERR("云部署平台获取列表失败。\n");
    }
    omadList.forEach(prod => {
        prod.modules.forEach(module => {
            moduleList[module.moduleId] = module.envs;
            moduleNames[module.moduleId] = module.moduleDesc || module.moduleName;
        });
    });
})();

var projectJson = util.projectJson;
var cloudRoot = "/var/cloud/go";
var cloudSVNRoot = "https://static.f2e.netease.com/go";
var rsyncParent = projectJson.parentProject||'';
var omad = {}

omad.publish = function(){
    var cloudEnv = global.cloudEnv;
    if (!util.isDir(cloudRoot)) {
        global.exitERR(`找不到云部署SVN根目录: ${cloudRoot}`);
        return;
    }
    if (projectJson[cloudEnv] || ENV[cloudEnv]) {
        log(`\n[publish2cloud(${cloudEnv})] ${project} v${label}`, 2, 1);
        var cloudDir = cloudEnv.replace(/omad/, '').toLowerCase();
        var _path = path.resolve(`/${cloudDir}/${rsyncParent}`, project);
        var cDir = cloudRoot + _path;
        var cSVNDir = cloudSVNRoot + _path;
        util.getFolder(cDir);
        log(`cp -r ${util.distHtmlDir}/* ${cDir}/\n`);
        util.execSync(`cp -r ${util.distHtmlDir}/* ${cDir}/`);
        if(!ENV.GO_TEST){ //提交svn并在云端部署
            log("Update svn for cloud deploy:\n");
            var svnMsg = util.execSync(`cd ${cDir};svn add * --parents --force;svn ci -m "${project}(${stage}) v${label}"`);
            console.log(svnMsg);
            var svnVer = svnMsg.replace(/.*?\s(\d+)。.*/, "$1");
            util.reporter.set("omad.svn", {ver: svnVer, localDir: cloudDir, remoteDir: cSVNDir});
            log("omadBatch:\n");
            omadBatch(projectJson[cloudEnv]);
        }
    }
}

function omadBatch(arr){
    if (arr.length > -1) {
        log("[omad] Deploy", 2, 1);
        arr.forEach(omadDeploy);
    }
}

function getEnvInfo(params){
    var envs = moduleList[params.moduleId];
    for(var i = 0;i<envs.length;i++){
        var env = envs[i];
        if(env.envId == params.envId){
            env.moduleName = moduleNames[params.moduleId];
            return env;
        }
    };
}

async function getOmadList(){
    if(!token){
        global.exitERR("云部署失败：无法获得token.");
        return '';
    }
    var url = server+"/cli/ls";
    var str = await util.wpost(url, {token: token});
    if(/Exception|403 Forbidden/.test(str)){
        if(tries++ < 2){
            omadLogin();
            return getOmadList();
        } else {
            global.exitERR("云部署失败：API登录异常.\n");
        }
    }
    return str;
}

function getSvnVer(paramJson){
    var svnver = {};
    var env = getEnvInfo(paramJson);
    if(env){
        var svnpath = env.vcPath;
        svnver.old = env.currentVersion;
        svnver.desc = env.moduleName + ' - ' + env.envName;
        if (/svn.ws.netease.com/.test(svnpath)) { //java项目
            var svnauth = "--username web --password 4web#163";
            var tmp = util.execSync(`svn info ${svnpath} ${svnauth} --xml --no-auth-cache --non-interactive --trust-server-cert`);
            if (/commit\s+revision="(\d+)"/.test(tmp)) {
                svnver.new = RegExp.$1;
            }
        }
    }
    return svnver;
}

async function omadDeploy(params){
    if(!token){
        global.exitERR("云部署失败：无法获得token.");
        return;
    }
    var svnver = getSvnVer(params);
    var paramStr = $$.map(params, v=>`${v}=${params[v]}`).join("&");
    if(svnver.new && svnver.new == svnver.old){
        util.reporter.set("omad.results[]", {desc: svnver.desc, paramStr: paramStr, svnver: svnver.new, msg: "无更新"});
        log(`[omadDeploy] 发布代码版本无更新(${svnver.new})\n`);
        return;
    }
    var url = server+"/cli/deploy";
    params.token = token;
    //提交请求
    var startTime = +new Date;
    var str = await util.wpost(url, params);
    if(/Exception|403 Forbidden/.test(str)){
        if(tries++ < 2){
            omadLogin();
            omadDeploy(params);
            return;
        } else {
            util.reporter.set("omad.results[]", {desc: svnver.desc, paramStr: paramStr, svnver: svnver.new, msg: "失败"});
            global.exitERR("云部署失败：API登录异常($paramStr可能无权限).\n");
        }
    }
    var during = +new Date - startTime;
    var newver = svnver.new || "HEAD";
    util.reporter.set("omad.results[]", {desc: svnver.desc, paramStr: paramStr, svnver: svnver.new, msg: `成功(${during} s)`});
    console.log(`[omadDeploy] ${svnver.desc} (${paramStr}): ${str}(${during} s)`);
}

async function omadLogin(){
    var str = await util.wpost(server + "/cli/login", {
        appId: "20ac0712d9bd45c2bbc6b40e082f5bae",
        appSecret: "f8766f28bf7e49abba564eace5a75b32"
    });
    if(/"token":"(\S+?)"/.test(str)){
        var token = RegExp.$1;
        util.writeTmp(tokenFile, token);
        console.log("Get omad token");
    }else{
        console.log(str);
    }
}

module.exports = omad;
