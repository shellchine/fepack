var fs = require('fs');
var path = require('path');
var proc = require('child_process');
var ENV = process.env;

module.exports = function(svn){
    var authFile = global.cacheDir + "/info/.svnauth";
    if(!fs.existsSync(authFile)){
        var msg = "svn认证文件异常。";
        if(global.exitERR){
            global.exitERR(msg);
        }else{
            throw(msg);
        }
    }
    svn.auth = fs.readFileSync(authFile).toString().trim();
    svn.auth += " --no-auth-cache --non-interactive --trust-server-cert";
    svn.cdnfix = "";
    svn.path = ENV.VCPATH;  //前后不带/
    svn.host = svn.host.replace(/\/$/, '');
    if(!ENV.GO_TEST){
        var tmp = proc.execSync(`svn info ${svn.auth}`, {encoding: "utf-8"});
        if (new RegExp(`${svn.host}/(\\S+)`).test(tmp)) {
            svn.path = RegExp.$1;
        } else{
            svn.host = svn.host.replace(/\/[^\.:]*?$/, '');
            if (new RegExp(`${svn.host}/(\\S+)`).test(tmp)) {
                svn.path = RegExp.$1;
                svn.cdnfix = "z/";
            } else {
                global.exitERR("tmp\n未发现SVN路径。");
            }
        }
        if(/作者:\s*(\S+)/.test(tmp)){
            svn.writer = RegExp.$1;
            console.log(`Writer: ${svn.writer}`);
        }
    }
    svn.localpath = path.resolve(svn.localhost, svn.cdnfix+svn.path);  //本地仓库目录

    svn.publish = {
        dev: function(ver, dir){ //发布未压缩版
            console.log("同步到前端测试机");
            if(ENV.GO_TEST){
                return;
            }
            var url = `http://tools.f2e.netease.com/cgi-bin/svn.cgi?ver=${ver}&dir=${dir}`;
            proc.exec(`wget "${url}"`);
        },
        qa: function(){ //发布仿真版，与live一致

        },
        live: function(){ //发布线上版

        }
    }

    svn.read = function(file){ //跨项目读取文件
        file = path.join(svn.localhost, file);
        if(fs.existsSync(file)){
            return fs.readFileSync(file).toString();
        }
        return '';
        /*if(svn.cdnfix){
          file = file.replace("/" + svn.cdnfix, "/");
          }
          return proc.execSync(`svn cat ${svn.host}${file} ${svn.auth}`, {encoding: "utf-8"});*/
    }

    svn.upload = function(file, ftpPublish){
        console.log(`[svn.upload]: ${file}`);
        var tmpdir = fs.mkdtempSync("/tmp/svnup-");
        var realSvnPath = file.replace(svn.cdnfix, '');
        var msg = proc.execSync(`cd ${tmpdir}; svn export ${svn.host}/${realSvnPath} ${svn.auth} 2>&1`, {encoding: "utf-8"});
        if (/^svn: /.test(msg)) {
            global.exitERR(`[svn2cdn] ${msg}(请检查svn文件有否提交：${file})`);
        }

        var ftpDir = "/f2e/" + path.dirname(file);
        var basename = path.basename(file); //不含路径的文件名

        var ftpCommand = `lcd ${tmpdir}\nmkdir -p ${ftpDir}\ncd ${ftpDir}\nput ${basename}`;
        ftpPublish(ftpCommand, 1);
        proc.execSync(`rm -r ${tmpdir}`);
    }

    svn.exist = function(file){
        if(file.indexOf("/"+svn.cdnfix+svn.path+"/") == 0){
            file = file.replace("/"+svn.cdnfix+svn.path+"/", "");
            return fs.existsSync(file);
        }
        return fs.existsSync(path.join(svn.localhost, file));
    }

}
