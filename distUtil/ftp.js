//将HTML通过ftp上传到后端服务器

var fs = require('fs');
var pathUtil = require('path');
var ftp = require('../lib/ftp');
var util = require("../lib/util4go");
var vc = util.vc;
var htmlDir = util.distHtmlDir;
var resDir = util.distStaticDirs[0];
var ENV = process.env;
var log = util.log;
var infoDir = `${global.cacheDir}/info`;
var project = ENV.GO_PIPELINE_NAME;

exports.publish = function(json){
    var authFile = pathUtil.resolve(infoDir, json.authFile || '.ftpaccess');
    if(!fs.existsSync(authFile)){
	console.log(`${authFile} not exist.`); return;
    }
    var auth = fs.readFileSync(authFile).toString().trim();
    json.base = json.base.replace(/.*?:\/\//, '');
    var ftpHost = json.base.replace(/\/.*/, ''); 
    var remoteDir = json.base.replace(/\/+$/, '').replace(/.*?\//, '');// + "/"+project;
    var command = `lcd ${htmlDir}\nmkdir -p ${remoteDir}\ncd ${remoteDir}\nmirror -v -R . .\n`;
    //command += `lcd ${resDir}\nmirror -v -R . .`;
    console.log(command);
    log(`FTP到后端服务器.`, 2, 1);

    ftp.publish(`${auth}@${ftpHost}`, command);
}


