var ENV = process.env;
var program = require('commander');
var proc = require('child_process');
ENV["GO_STAGE_NAME"] = "liveStage";
program
    .option('-p, --path [path]', 'Specify the project path relative to SVN root')
    .parse(process.argv);

global.projectDir = program.path || "desktop-client";
var conf = require('./conf');

//proc.execSync(`cp -r ${conf.vcRoot}/${conf.projectDir}/* ${conf.workDir}/`);
conf.chWorkDir();
require('../publish2live');
