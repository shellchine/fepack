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
var project = ENV.GO_PIPELINE_NAME;

exports.publish = function(json){
    json.base = json.base.replace(/.*?:\/\//, '');
    
    var command = `lcd ${htmlDir}\nrsync -r . ${json.base}\n`;
    log(`Rsync to Server:`, 2, 1);
    console.log(command);
    util.execSync(command);
}


