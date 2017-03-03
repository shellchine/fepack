var conf = require('./conf');
var ENV = process.env;
var proc = require('child_process');
ENV["GO_STAGE_NAME"] = "devStage";

proc.execSync(`cp -r ${conf.vcRoot}/${conf.projectDir} ${conf.workDir}`);
conf.chWorkDir();
require('../publish2static');
