//将静态资源文件(images/js/css/swf..)上传到cdn
var fs = require('fs');
var path = require('path');
var request = require('request');
var proc = require('child_process');
var ENV = process.env;
var isDir = (dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory();
var tmpDir = "/tmp";
var writeTmp = (dir, file, str) => fs.writeFileSync(path.resolve(tmpDir, file), str);
var readTmp = (dir, file) => fs.readFileSync(path.resolve(tmpDir, file)).toString();
var execSync = exports.execSync = function(command, options){
    return proc.execSync(command, $$.extend({encoding: "utf-8"}, options));
}

var cdn = {};

function lsr(_dir, reg){ //筛选名为*.*的目录
    var dir, list = [], dirs = [_dir];
    while((dir = dirs.pop())){
        if(isDir(dir)) fs.readdirSync(dir).forEach(function(_file){
            if(_file.substr(0,1) == '.' || _file == '_backup') return;
            var file = dir + '/' + _file;
            if(isDir(file)){
                dirs.push(file);
                if(file.indexOf('.') > 0){
                    list.push(file);
                }
            }
        });
    }
    return list;
}

function mirrorDottedDir(ldir, rdir){  //处理带.的文件夹
    var commands = [];
    lsr(ldir).forEach(dir => {
        var remoteDir = path.resolve(dir.replace(ldir, rdir));
        commands.push(`lcd ${dir}\nmkdir -p ${remoteDir}\ncd ${remoteDir}\nmirror -v -R . .`);
    });
    if(commands.length < 0){
        commands.push("mkdir -p "+rdir);
    }
    return commands.join("\n");
}

cdn.mirrorCommand = function(ldir, rdir){
    var mkdirs = mirrorDottedDir(ldir, rdir);
    return `${mkdirs}\nlcd ${ldir}\ncd ${rdir}\nmirror -v -R . .`;
}

cdn.clearCache = function(urls, count){
    var list = [];
    count = parseInt(count) || 10;
    urls.forEach(url => {
        url = url.trim();
        if(/^https?:/.test(url)){
            if(/img\d\./.test(url)){
                list.push(url);
            }else{
                url.replace(/http:\/\/img(\*|\[(\d)\-(\d)\])(.*)/, (all, m1, m2 ,m3, m4) => {
                    var start = m2 || 1;
                    var end = m3 || 6;
                    for(var i = start; i <= end; i ++){
                        list.push(`http://img${i}${m4}`);
                    }
                });
            }
        }
    });
    list.forEach(function(url){
        console.log(`Clearing cdn cache: ${url}`);
        for(var i = 0; i < count; i ++){
            request(`http://61.135.251.132:81/upimage/cleanmain.php?url=${url}`, function(err, body){
                if(err){
                    console.log(`${url}: clearCache failed.`);
                }
            });
        }
    });
}


module.exports = cdn;
