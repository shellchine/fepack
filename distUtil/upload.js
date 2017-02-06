//将HTML通过ftp上传到后端服务器

var fs = require('fs');
var ftp = require('../lib/ftp');
var util = require("../lib/util4go");
var vc = util.vc;
var htmlDir = util.distHtmlDir;
var ENV = process.env;
var log = util.log;
var ftpHost = "";

var upload = {
    
}

upload.publish = function(){
    var remoteDir = `/f2e/${vc.path}`;
    var command = `lcd ${htmlDir}\nmkdir -p ${remoteDir}\ncd ${remoteDir}\nmirror -v -R . .`;
    log(`上传HTML到后端服务器`, 2, 1);
    ftp.publish(ftpHost, command);
}

module.exports = upload;

