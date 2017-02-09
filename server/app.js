#!/usr/local/bin/node --harmony

var program = require('commander');
var nproxy = require('nproxy');
var http = require('http');
var express = require('express');
var conf = require('../package.json');
var depack = require('./depack');

program
    .version(conf.version)
    .option('-c, --conf [conf]', 'Specify the express config file')
    .option('-l, --list [list]', 'Specify the replace rule file')
    .option('-p, --port [port]', 'Specify the port nproxy will listen on(8989 by default)', parseInt)
    .option('-d, --debug', 'Enable debug mode')
    .parse(process.argv);

var port = program.port || 8989;

nproxy(port, {
    "responderListFilePath": program.list,
    "debug": !!program.debug
});

var app = express();
var expressPort = port + 1;
app.use(express.static(__dirname + '/public'));

app.all('/go/*', function(req, res, next) {  
    res.header("Access-Control-Allow-Origin", "*");  
    res.header("Access-Control-Allow-Headers", "X-Requested-With");  
    res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
    next();  
});  

require('./go')(app, program.conf);

app.get('/nproxy/:url', function(req, res) {
    
    (async function(){
        try{
            var html = await depack(req.params.url);
        }catch(e){
            return Promise.reject(e);
        }
        return res.html(html);
    })().catch(e => {
        console.log(e);
        res.jsonp({
            code: 404,
            msg: e.toString()
        });
    });
    
});

http.createServer(app).listen(expressPort, function() {
    console.log("Express started on port ", expressPort);
});
