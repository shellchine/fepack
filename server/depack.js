var pathUtil = require('path');
var conf = require('./conf.js');
var Store = require('../lib/store');
var packDb = new Store(`${conf.cacheDir}/info/jspack.db`);
var stmts = {
    findJs: packDb.prepare("select list from js where name=? and ver=?"),
    findCss: packDb.prepare("select list from css where name=? and ver=?")
}

async function depackJs(file){
    if(/(.*?)\.\d+\.min\.js$/.test(file)){
        file = "http://dev.f2e.163.com/" + RegExp.$1 + ".js";
        return `document.write("<script src='${file}' charset='utf-8'></script>");`
    }else if(/(.+?)\.(\d{1,5})\.js$/.test(file)){
        var result = await stmts.findJs.get(RegExp.$1, RegExp.$2);
        if(result && result.list){
            return $$.map(result.list.split(/\s+/), js=>{
                js = js.replace("static.f2e.netease.com", "dev.f2e.163.com");
                return `document.write("<script src='${js}' charset='utf-8'></script>");`
            }).join("\n");
        }
    }
    return '';
}

async function depackCss(file){
    if(/(.*?)\.\d+\.css$/.test(file)){
        file = "http://dev.f2e.163.com/" + RegExp.$1 + ".css";
        return `@import url(${file});`
    }else if(/(.+?)\.(\d{1,5})\.css$/.test(file)){
        var result = await stmts.findCss.get(RegExp.$1, RegExp.$2);
        if(result && result.list){
            return $$.map(result.list.split(/\s+/), css=>{
                css = css.replace("static.f2e.netease.com", "dev.f2e.163.com");
                return `@import url(${css});`
            }).join("\n");
        }
    }
    return '';
}

module.exports = async function(file){
    var ext = file.extname(file);
    if(ext == '.js'){
        return await depackJs(file);
    }else if(ext == '.css'){
        return await depackCss(file);
    }else{
        return file;
    }
}
