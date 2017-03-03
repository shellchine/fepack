var conf = require('./conf');
var ENV = process.env;
ENV["GO_STAGE_NAME"] = "liveStage";

conf.chWorkDir();
require('../publish2live');
