var conf = require('./conf');
var ENV = process.env;
ENV["GO_STAGE_NAME"] = "rollback";

conf.chWorkDir();
require('../rollback');
