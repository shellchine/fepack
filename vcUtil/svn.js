var fs = require('fs');
var path = require('path');
var proc = require('child_process');
var ENV = process.env;


/*
*
* ori:
    type: "svn",
    host: "https://svn.ws.netease.com/frontend",
    localhost: "/var/frontend"
*
* mixin:
*
* auth          {string}    svn登录验证信息
* writer        {string}    svn Last Changed Author
* read          {function}  @param file.  跨项目读取文件。      读取 svn.localhost/file 文件内容。 ==> "/var/frontend"+file
* upload        {function}  function(file {string} ,ftpPublish {function} )     下载svn.host/file文件。拼接好ftp上传命令，传递给ftpPublish
* exist         {function}  检查指定的文件在本地是否存在
* publish.dev   {function} wget http://tools.f2e.netease.com/cgi-bin/svn.cgi?ver=${ver}&dir=${dir}
*                       通过页面打开可查看。 把static服务器的代码同步到指定版本
*                       如果GO_TEST，则跳过.
* publish.qa    {function}
* publish.live  {function}
*
*
 svn.ws.netease.com/frontend/下的项目:
 * host          {string}    https://svn.ws.netease.com/frontend
 * path          {string}    项目路径，sports/testgo   前面不带/
 * cdnfix        {string}    ''
 *
 svn.ws.netease.com/下的项目
 * host          {string}    https://svn.ws.netease.com
 * path          {string}    host之后的路径。 前面不带/
 * cdnfix        {string}    'z/'
 *
 *
 util4go下的mixin:
 * resRoot      {string}    conf.cdns[0].base,  http://img2.cache.netease.com/f2e
 * cdnBase      {string}    cdn基准目录     resRoot/cdnfix+path
 * base         {string}    项目远端仓库地址    host+path
 * localpath    {string}    项目本地仓库地址    localhost/ cdnfix + path
 * devpath      {string}    devHost上的本项目目录  conf.devHost / cdnfix + path
 *

* */
module.exports = function(svn){
    // /var/fepack/info/.svnauth
    // --username web --password 4web#163
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
    svn.host = svn.host.replace(/\/$/, ''); //去除结尾的/
    if(!ENV.GO_TEST){
        var tmp = proc.execSync(`svn info ${svn.auth}`, {encoding: "utf-8"});
        if (new RegExp(`${svn.host}/(\\S+)`).test(tmp)) {
            svn.path = RegExp.$1;
        } else{
            svn.host = svn.host.replace(/\/[^\.:]*?$/, ''); //去除结尾的  /xxxx    xx=> .和:除外的字符
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
    };

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
    };

    /*
    *
    * 下载svn下该file文件。拼接好ftp上传cmd,调用ftpPublish
    *
    * @param file {string} 需要操作的路径名
    * @param ftpPublish {function} function(ftpCmd,1) 传入ftp命令
    * */
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
    };

    /*
    * 检查svn.localhost/file是否存在。
    * 如果file以 /svn.cdnFix+svn.path/开头，则删除该段字符串，检查删除后的路径。
    * */
    svn.exist = function(file){
        if(file.indexOf("/"+svn.cdnfix+svn.path+"/") == 0){
            file = file.replace("/"+svn.cdnfix+svn.path+"/", "");
            return fs.existsSync(file);
        }
        return fs.existsSync(path.join(svn.localhost, file));
    }

};
