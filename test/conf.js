var ENV = process.env;
var program = require('commander');
var mkdirp = require('mkdirp');
var fs = require('fs');
var pipeDir = "/var/lib/go-agent/pipelines";
if(!fs.existsSync(pipeDir)){
    mkdirp.sync(pipeDir);
}

program
    .option('-p, --path [path]', 'Specify the project path relative to SVN root', parseInt)
    .parse(process.argv);

var projectDir = program.path || "tie/yun/admin";
projectDir = projectDir.replace(/\\/g, '/').replace(/^\/|\/$/g, '');
var projectName = projectDir.replace(/\//g, '_');
var workDir = `${pipeDir}/${projectName}`;

var env = {
    GO_PIPELINE_COUNTER: 1,
    GO_PIPELINE_LABEL: 3,
    GO_STAGE_COUNTER: 1,
    GO_REVISION: 674499,
    GO_TO_REVISION: 674499,
    GO_FROM_REVISION: 674499,
    GO_CONFIG: "conf",
    CSS_COMPRESS: 1,
    JS_COMPRESS: 2,
    GO_SYNC_TO: 0,
    omadDev: 1,
    omadLive: 1,
    CMS_CHANNEL: "0025",
    GO_PIPELINE_NAME: projectName,
    VCPATH: projectDir,
    CDNFIX: "",  //CDNFIX='z/' 表示处理的不是/frontend目录下的项目
    GO_TEST: 1
}
for(var key in env){
    ENV[key] = env[key];
}

module.exports = {
    vcRoot: "/var/frontend",
    workDir: workDir,
    projectDir: projectDir,
    projectName: projectName,
    chWorkDir: function(dir){ //切换到工作目录
        dir = dir || workDir;
        if(!fs.existsSync(dir)){
            throw(`工作目录不存在：${dir}\n`);
            process.exit(1);
        }
        console.log(`Chdir: ${dir}`);
        process.chdir(dir);
    }
};
