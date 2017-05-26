var fs = require('fs');
var path = require('path');
var proc = require('child_process');
var ENV = process.env;
var tmpDir = "/tmp";
var $$ = require('./bowlder');
var writeTmp = (file, str) => fs.writeFileSync(path.resolve(tmpDir, file), str);
var readTmp = (file) => fs.readFileSync(path.resolve(tmpDir, file)).toString();
var execSync = exports.execSync = function(command, options){
    return proc.execSync(command, $$.extend({encoding: "utf-8"}, options));
}

var ftp = {};

ftp.publish = function(host, command, noCheck){
    //host格式： user:pass@host
    var cmdFile = "." + (+new Date);
    var logFile = cmdFile + ".log";

    if(ENV.GO_TEST){
        console.log(command);
        return;
    }

    writeTmp(cmdFile, `set ssl:verify-certificate no\nopen ${host}\n${command}\nbye`);

    var lftpMsg = execSync(`cd ${tmpDir};lftp -f ${cmdFile} 2>${logFile}`);
    console.log(readTmp(logFile)); //出错信息，一般为空
    
    fs.unlink(`${tmpDir}/${logFile}`);
    fs.unlink(`${tmpDir}/${cmdFile}`);
    
    if(lftpMsg){
        console.log("lftpMsg:", lftpMsg);
    }else if(!noCheck){
        global.exitERR(`FTP Fail(${command})\n${lftpMsg}`);
    }
    
}

module.exports = ftp;
