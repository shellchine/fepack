#!/usr/bin/env node

var program = require('commander');
var nproxy = require('nproxy');
var http = require('http');
var express = require('express');
var conf = require('../package.json');
var depack = require('./depack');

program
    .version(conf.version)
    .option('-l, --list [list]', 'Specify the replace rule file')
    .option('-p, --port [port]', 'Specify the port nproxy will listen on(8989 by default)', parseInt)
    .option('-d, --debug', 'Enable debug mode')
    .parse(process.argv);


nproxy(program.port, {
    "responderListFilePath": program.list,
    "debug": !!program.debug
});

var app = express();
var expressPort = program.port + 1;
//app.use(express.static(__dirname + '/public'));

app.get('/nproxy/:url', function(req, res) {
    
    (async function(){
        try{
            var html = await depack(req.params.url);
        }catch(e){
            return Promise.reject(e);
        }
        var data = await promise;
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
    console.log("Proxy started on port ", expressPort);
});
