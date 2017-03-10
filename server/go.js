var fs = require('fs');
var path = require('path');
var request = require('request').defaults({jar: true});
var Store = require('../lib/store');
var $$ = require('../lib/bowlder');
var proc = require('child_process');
var express = require('express');
var connectSSI = require('connect-ssi')
var confFile = path.resolve(__dirname, 'conf.js');
if(!fs.existsSync(confFile)){
    confFile = path.resolve(__dirname, 'conf.sample');
}
var conf = require(confFile);

var host = "http://127.0.0.1:8153";

module.exports = function(app){
    var distDir = `${conf.cacheDir}/dist`;
    app.use(connectSSI({
	    ext: '.html',
        baseDir: conf.cacheDir
    }));
    app.use(connectSSI({
	    ext: '.shtml',
        baseDir: conf.cacheDir
    }));
    app.use('/dist', express.static(distDir));
    app.use(express.static(conf.vcDir));
    var infoDir = `${conf.cacheDir}/info`;
    var pwFile = `${infoDir}/.goaccess`;
    if(!fs.existsSync(pwFile)){
        console.log(`找不到帐号配置文件。`);
        return;
    }
    var goDb = new Store(`${infoDir}/go.db`, "CREATE TABLE pipelines(name, vcpath, manager, creator, gid);CREATE TABLE users(name, fullname, role);");
    var stmts = {
        pipelines: goDb.prepare("select * from pipelines"),
        admins: goDb.prepare("select * from users where role='1'"),
        getPartners: goDb.prepare("select manager from pipelines where name=?"),
        setPartners: goDb.prepare("update pipelines set manager=? where name=?"),
        delProject: goDb.prepare("delete from pipelines where name=?"),
        addProject: goDb.prepare("insert into pipelines values(?, ?, ?, ?, ?)"),
        addUser: goDb.prepare("insert into users values(?, ?, '2')"),
        findUser: goDb.prepare("select name from users where name=?")
    }

    app.get('/go/list', function(req, res) { //获取概览信息
        (async function(){
            var pipelines = {};
            $$.each(await stmts.pipelines.all(), item=>{    //select * from pipelines //name, vcpath, manager, creator, gid
                pipelines[item.name] = {
                    group: item.gid,
                    manager: item.manager
                }
            });
            var admins = {};
            $$.each(await stmts.admins.all(), item=>{       //select * from users where role='1' //name, fullname, role
                admins[item.name] = 1;
            });
            
            res.jsonp({
                pipelines: pipelines,
                admins: admins
            });
        })();
    });

    app.get('/go/svnup/:project', function(req, res) { //更新本地SVN目录
        var project = req.params.project;
        var ver = req.query.ver || 'HEAD';
        var partners = {};
        (async function(){
            proc.execSync(`svn up`);
            res.jsonp({

            });
        })();
    });

    app.get('/go/partners/:project', function(req, res) { //获取项目开发者列表
        var project = req.params.project;
        var partners = {};
        (async function(){
            var tmp = await stmts.getPartners.get(project);
            if(tmp) $$.each(tmp.manager.split(/,/, item=>{
                partners[item.name] = 1;
            }));
            res.jsonp(partners);
        })();
    });

    app.post('/go/create/:type', function(req, res) { //创建项目
        var type = req.params.type;
        var user = req.body.user;
        var vcpath = req.body.vcpath;
        var dest = req.body.dest;       //public/goconf.js 里的group.list里的key
        var authFile = path.resolve(__dirname, conf.authFile);
        if(!fs.existsSync(authFile)){
            res.jsonp({
                status: "fail",
                msg: "找不到认证文件"
            });
            return;
        }
        var auth = fs.readFileSync(authFile).toString().trim().split(/:/);
        var pipelineFile = `templates/pipeline.${type}.xml`;
        if(!fs.existsSync(pipelineFile)){
            res.jsonp({
                status: "fail",
                msg: `${pipelineFile}不存在`
            });
            return;
        }
        var project = vcpath.replace(/\//g, '_');   //svn路径替换: / => _
        var pipelineXml = $$.template.replace(fs.readFileSync(pipelineFile).toString(), {
            name: project,
            vcpath: vcpath,
            dest: dest,
            omad: '',
            materials: $$.template.replace(conf.vc.materials, {vcpath:vcpath})
        }, null, '');
        
        (async function(){
            try{
                await post(`${host}/go/auth/security_check`, {
                    j_password: auth[1],
                    j_username: auth[0]
                });
                var [postConf, xml] = getXmlConf(await get(`${host}/go/admin/config_xml/edit`));
                if(xml.indexOf(`<pipeline name="${project}">`) != -1){
                    res.jsonp({
                        "msg":`已存在项目名 ${project}`,
                        "status":"failed"
                    });
                }else{
                    postConf["go_config[content]"] = xml.replace(/(?=\s*<\/pipelines>)/, "\n"+pipelineXml);
                }
                console.log(postConf);
                await post(`${host}/go/admin/config_xml`, postConf);
                await stmts.delProject.run(project);
                await stmts.addProject.run(project, vcpath, user, user, type);
                res.jsonp({
                    status: "success",
                    msg: "添加项目成功",
                    name:project
                });
            }catch(e){
                res.jsonp({
                    status: "fail",
                    msg: JSON.stringify(e)
                });
            }
        })();
    });

    app.post('/go/user/add', function(req, res) { //添加用户
        var id = req.body.id;
        var name = req.body.name;
        
        (async function(){
            try{
                var item = await stmts.findUser.get(id);
                if(item){
                    res.jsonp({
                        status: "fail",
                        msg: `用户${id}已存在`
                    });
                    return;
                }
                var newpw = `${id}:{SHA}iYwBq/SLfDm81KBe4iiqEBZqXyA=`;
                var tmp = fs.readFileSync(pwFile).toString();
                if(!(new RegExp(`(^|\n)${id}:`)).test(tmp)){
                    tmp = `${newpw}\n${tmp}`;
                    fs.writeFileSync(pwFile, tmp);
                }
                await stmts.addUser.run(id, name);
                res.jsonp({
                    status: "success",
                    msg: `添加用户${id}成功`
                });
            }catch(e){
                res.jsonp({
                    status: "fail",
                    msg: JSON.stringify(e)
                });
            }
        })();

    });
    
    app.post('/go/user/chpwd', function(req, res) { //修改密码
        var user = req.body.user;
        var oldpw = req.body.oldpw;
        var newpw = req.body.newpw;
        var tmp = fs.readFileSync(pwFile).toString();
        oldpw = `${user}:{SHA}${oldpw}=`;

        if(tmp.indexOf(oldpw) == -1){
            res.jsonp({
                status: "fail",
                msg: "旧密码不正确"
            });
        }else{
            tmp = tmp.replace(oldpw, `${user}:{SHA}${newpw}=`);
            fs.writeFileSync(pwFile, tmp);
            res.jsonp({
                status: "success",
                msg: "更新成功"
            });
        }
    });
    
    app.post('/go/addpartner/:project', function(req, res) { //添加项目开发者  追加manage,逗号分隔
        var project = req.params.project;
        var user = req.body.newpartner;
        (async function(){
            var tmp = await stmts.getPartners.get(project);
            var manager = tmp.manager + "," + user;
            await stmts.setPartners.run(manager, project);
            res.jsonp({
                status: "success",
                msg: "添加合作者成功。"
            });
        })();
    });

}

function post(url, data){
    return new Promise((resolve, reject) => {
        request.post(url, {form: data}, function(err, res, body){
            console.log('post:',url,'error:',!!err);
            if(err){
                reject(err);
            }else{
                resolve(body);
            }
        })
    });
}


function get(url){
    return new Promise((resolve, reject) => {
        request.get(url, function(err, res, body){
            if(err){
                reject(err);
            }else{
                resolve(body);
            }
        })
    });
}

function getXmlConf(content){
    var md5, xml, token;
    if(/"go_config\[md5\]".*?value="(.*?)"/.test(content)){
        md5 = RegExp.$1;
    }
    if(/"go_config\[content\]".*?>\s*([\s\S]*?)<\/textarea>/.test(content)){
        xml = RegExp.$1.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    }
    if(/"authenticity_token".*?value="(.*?)"/.test(content)){
        token = RegExp.$1;
    }
    return [{
        _method: "put",
        authenticity_token: token,
        ommit: "SAVE",
        active: "configuration",
        "go_config[md5]": md5
    }, xml];
}
