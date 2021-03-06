#!/usr/local/bin/node --harmony

var program = require('commander');
var http = require('http');
var express = require('express');
var logger = require('morgan');
var bodyParser = require('body-parser');
var conf = require('../package.json');
var depack = require('./depack');

program
    .version(conf.version)
    .option('-p, --port [port]', 'Specify the port nproxy will listen on(8990 by default)', parseInt)
    .parse(process.argv);

var expressPort = program.port || 8990;

var app = express();
app.use(logger('combined'));
app.use('/gohtml', express.static(__dirname + '/public'));
app.use('/modules', express.static(__dirname + '/public/modules'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.all('/go/*', function(req, res, next) {  
    res.header("Access-Control-Allow-Origin", "*");  
    res.header("Access-Control-Allow-Headers", "X-Requested-With");  
    res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
    next();
});

require('./go')(app);

app.get('/nproxy', function(req, res) {
    
    (async function(){
        try{
            var html = await depack(decodeURIComponent(req.query.url));
        }catch(e){
            return Promise.reject(e);
        }
        return res.end(html);
    })().catch(e => {
        console.log(e);
        res.jsonp({
            code: 404,
            msg: e.toString()
        });
    });
    
});

http.createServer(app).listen(expressPort, function() {
    console.log("[INFO] Express started on", expressPort);
});
