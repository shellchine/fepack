var ENV = process.env;
var program = require('commander');
var proc = require('child_process');
ENV["GO_STAGE_NAME"] = "liveStage";
program
    .option('-p, --path [path]', 'Specify the project path relative to SVN root')
    .parse(process.argv);

global.projectDir = program.path || "tie/yun/admin";
var conf = require('./conf');

conf.chWorkDir();
require('../publish2live');
