#!/usr/local/bin/node --harmony

var program = require('commander');
var nproxy = require('nproxy');
var conf = require('../package.json');

program
    .version(conf.version)
    .option('-l, --list [list]', 'Specify the replace rule file')
    .option('-p, --port [port]', 'Specify the port nproxy will listen on(8989 by default)', parseInt)
    .option('-d, --debug', 'Enable debug mode')
    .parse(process.argv);

var port = program.port || 8989;

nproxy(port, {
    "responderListFilePath": program.list || "proxy.conf",
    "debug": !!program.debug
});
