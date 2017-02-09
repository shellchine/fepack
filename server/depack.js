var request = require('request');
var conf = require('./conf.js');
var Store = require('../lib/store');
var devHost = (conf.devHost || 'http://127.0.0.1').replace(/\/+$/, '/');
var packDb = new Store(`${conf.cacheDir}/info/jspack.db`, "CREATE TABLE js(name, ver, list, ctime);CREATE INDEX js_name on js(name);CREATE INDEX js_ver on js(ver);CREATE TABLE css(name, ver, list, ctime);CREATE INDEX css_name on css(name);CREATE INDEX css_ver on css(ver);");
var stmts = {
    findJs: packDb.prepare("select list from js where name=? and ver=?"),
    findCss: packDb.prepare("select list from css where name=? and ver=?")
}

async function depackJs(file){
    if(/(.*?)\.\d+\.js$/.test(file)){
        file = devHost + RegExp.$1 + ".js";
        return `document.write("<script src='${file}' charset='utf-8'></script>");`
    }else if(/(.+?)\.(\d{1,5})\.js$/.test(file)){
        var result = await stmts.findJs.get(RegExp.$1, RegExp.$2);
        if(result && result.list){
            return $$.map(result.list.split(/\s+/), js=>{
                js = devHost + js.replace(/^(http:\/\/.*?\/|\/)/, '');
                return `document.write("<script src='${js}' charset='utf-8'></script>");`
            }).join("\n");
        }
    }
    return '';
}

async function depackCss(file){
    if(/(.*?)\.\d+\.css$/.test(file)){
        file = devHost + RegExp.$1 + ".css";
        return `@import url(${file});`
    }else if(/(.+?)\.(\d{1,5})\.css$/.test(file)){
        var result = await stmts.findCss.get(RegExp.$1, RegExp.$2);
        if(result && result.list){
            return $$.map(result.list.split(/\s+/), css=>{
                css = devHost + css.replace(/^(http:\/\/.*?\/|\/)/, '');
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
        return await get(file);
    }
}

function get(url, conf){
    return new Promise((resolve, reject) => {
        request.get(url, conf, function(err, res, body){
            if(err){
                reject(err);
            }else{
                resolve(body);
            }
        })
    });
}
