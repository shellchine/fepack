var fs = require('fs');
var path = require('path');
var proc = require('child_process');
var ENV = process.env;
var project = ENV.GO_PIPELINE_NAME;

module.exports = function(git){

    /*var authFile = global.cacheDir + "/info/.gitauth";
      if(!fs.existsSync(authFile)){
      var msg = "git认证文件异常。";
      if(global.exitERR){
      global.exitERR(msg);
      }else{
      throw(msg);
      }
      }
      git.auth = fs.readFileSync(authFile).toString().trim();*/
    git.auth = "";
    git.cdnfix = "";
    git.path = ENV.VCPATH || "";
    git.host = git.host.replace(/\/$/, '');
    if(!ENV.GO_TEST){
        var tmp = proc.execSync(`git remote -v`, {encoding: "utf-8"});
        if (new RegExp(`${git.host}/(\\S+)`).test(tmp)) {
            git.path = RegExp.$1;
            git.path = git.path.replace(/\.git$/, '');
        }
        tmp = proc.execSync(`git log --max-count=1`, {encoding: "utf-8"});
        if(/Author:\s*(\S+)/.test(tmp)){
            git.writer = RegExp.$1;
            console.log(`Writer: ${git.writer}`);
        }
    }
    git.path = project;
    git.path = git.path.replace(/\./g, '-');
    git.localpath = path.resolve(git.localhost, git.cdnfix+git.path);  //本地仓库目录
    git.publish = {
        dev: function(ver, dir){ //发布未压缩版
            console.log("同步到前端测试机");
            if(ENV.GO_TEST){
                return;
            }
            //var url = ``;
            //proc.exec(`wget "${url}"`);
        },
        qa: function(){ //发布仿真版，与live一致

        },
        live: function(){ //发布线上版

        }
    }
    git.read = function(file){ //跨项目读取文件
        file = path.join(git.localhost, file);
        if(fs.existsSync(file)){
            return fs.readFileSync(file).toString();
        }
        return '';
    }

}
