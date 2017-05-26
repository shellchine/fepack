//将HTML通过ftp上传到后端服务器

var fs = require('fs');
var pathUtil = require('path');
var util = require("../lib/util4go");
var vc = util.vc;
var htmlDir = util.distHtmlDir;
var resDir = util.distStaticDirs[0];
var log = util.log;

exports.publish = function(json){
    var [host,remoteDir] = json.base.replace(/\/+$/, '').split(/:/);
    if(!host || !remoteDir) return;
    var command = `scp -r ${htmlDir} ${json.base};`;//scp -r ${resDir} ${json.base}`;
    console.log(command);
//    util.execSync(command);
    log(`SCP到后端服务器`, 2, 1);
}


