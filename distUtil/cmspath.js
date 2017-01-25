//根据频道id和svn文件路径查找线上的cms ssi路径
var fs = require('fs');
var path = require('path');
var conf = require('../conf');
var request = require('request');
var ENV = process.env;

var cache = {};
var cacheDir = conf.cacheDir || "/tmp/fepack";

//所有项目路径
var allPaths = {};
var tmp = fs.readFileSync("/var/www/go/path.conf").toString();
tmp.split(/\n/).forEach(line => {
    if(/(\S+)\s+(\S+)/.test(line)){
        allPaths[RegExp.$1] = RegExp.$2;
    }
});

module.exports = function(channel, file){
    file = file.replace(new RegExp(`^(${conf.devHost})?/+`), "");
    var projectName = path.dirname(file);
    var arr = file.split('/');
    for(var i = 1; i < arr.length; i ++){
        var subdir = arr.slice(0, -i).join('/');
        if(allPaths[subdir]){
            projectName = allPaths[subdir];
            file = arr.slice(-i).join("/");
            break;
        }
    }
    projectName = projectName.replace(/\//g, '_');

    var config = `${cacheDir}/info/${projectName}/.cms.addrs`;
    if (!fs.existsSync(config)) {
        return '';
    }
    var tmp = fs.readFileSync(config).toString();

    var cmsPath = channel => {
        var pathFix = /0034/.test(channel) ? '/ntes' : '';
        var key = `${file}\\|${channel}`;
        if(typeof cache[key] == 'string') return cache[key];
        var result = '';
        if(new RegExp(`(^|\n)${key}.*?\\s+(.*)`).test(tmp)) {
            var params = RegExp.$2.split(/\t/);
            var url = params[1];
            result = params[0];
            !ENV.GO_TEST && request(url, function(err, res, html){ //发布历史有，但访问不了，应该报个错
                if (err || !html || html.indexOf("location.href='http://temp.163.com/special/special.html'") != -1) {
                    global.exitERR && global.exitERR(`[cmsPath] ${url} 访问异常。`);
                }
            });
        }
        if(result && pathFix && result.indexOf(pathFix) == -1){
            result = pathFix + result;
        }
        return (cache[key] = result);
    }

    if (file) {
        return cmsPath(channel) || cmsPath("0080");
    }

}



