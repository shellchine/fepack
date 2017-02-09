var fs = require('fs');
var path = require('path');
var request = require('request');
var Store = require('../lib/store');
var $$ = require('../lib/bowlder');
var confFile = path.resolve(__dirname, 'conf');
if(!fs.existsSync(confFile)){
    confFile = path.resolve(__dirname, 'conf.sample');
}
var conf = require(confFile);

var host = "http://127.0.0.1:8153";

module.exports = function(app){
    var infoDir = `${conf.cacheDir}/info`;
    var goDb = new Store(`${infoDir}/go.db`, "CREATE TABLE pipelines(name, vcpath, manager, creator, gid);CREATE TABLE users(name, fullname, role);");
    var stmts = {
        pipelines: goDb.prepare("select * from pipelines"),
        admins: goDb.prepare("select * from users where role='1'"),
        getPartners: goDb.prepare("select manager from pipelines where name=?"),
        setPartners: goDb.prepare("update pipelines set manager=? where name=?"),
        delProject: goDb.prepare("delete from pipelines where name=?"),
        addProject: goDb.prepare("insert into pipelines values(?, ?, ?, ?, ?)")
    }

    app.get('/go/list', function(req, res) { //获取概览信息
        (async function(){
            var pipelines = {};
            $$.each(await stmts.pipelines.all(), item=>{
                pipelines[item.name] = {
                    group: item.gid,
                    manager: item.manager
                }
            });
            var admins = {};
            $$.each(await stmts.admins.all(), item=>{
                admins[item.name] = 1;
            });
            
            res.jsonp({
                pipelines: pipelines,
                admins: admins
            });
        })();
    });

    app.get('/go/partners/:project', function(req, res) { //获取项目开发者列表
        var project = req.params.project;
        var partners = {};
        (async function(){
            var tmp = await stmts.getPartners.get(project);
            $$.each(tmp.manager.split(/,/, item=>{
                partners[item.name] = 1;
            }));
            res.jsonp(partners);
        })();
    });

    app.post('/go/create/:type', async function(req, res) { //创建项目
        var type = req.params.type;
        var user = req.query.user;
        var vcpath = req.query.vcpath;
        var dest = req.query.dest;
        var authFile = path.resolve(__dirname, conf.authFile);
        if(!fs.existsSync(authFile)){
            res.jsonp({
                status: "fail",
                msg: "找不到认证文件"
            });
            return;
        }
        var auth = fs.readFileSync(authFile).trim().split(/:/);
        var pipelineFile = `templates/pipeline.${type}.xml`;
        if(!fs.existsSync(pipelineFile)){
            res.jsonp({
                status: "fail",
                msg: `${pipelineFile}不存在`
            });
            return;
        }
        var project = vcpath.replace(/\//g, '_');
        var pipelineXml = $$.template.replace(fs.readFileSync(pipelineFile), {
            name: project,
            vcpath: vcpath,
            dest: dest,
            omad: ''
        }, null, '');

        await post(`${host}/go/auth/security_check`, {
            j_password: auth[1],
            j_username: auth[0]
        });
        var [conf, xml] = getXmlConf(await get(`${host}/go/admin/config_xml/edit`));
        if(xml.indexOf(`<pipeline name="${project}">`) != -1){
            res.jsonp({
                "msg":`已存在项目名 ${project}`,
                "status":"failed"
            });
        }else{
            conf["go_config[content]"] = xml.replace(/(?:\s*<\/pipelines>)/, "\n"+pipelineXml);
        }
        await post(`${host}/go/admin/config_xml`, conf);
        await stmts.delProject.run(project);
        await stmts.addProject.run(project, vcpath, user, user, type);
        res.jsonp({
            status: "success",
            msg: "添加项目成功"
        });
    });

    app.post('/go/user/chpwd', function(req, res) { //修改密码
        var user = req.query.user;
        var oldpw = req.query.oldpw;
        var newpw = req.query.newpw;
        var file = `${infoDir}/.goaccess`;
        if(!fs.existsSync(file)){
            res.jsonp({
                status: "fail",
                msg: "密码设置出错(服务器错误)"
            });
            return;
        }
        var tmp = fs.readFileSync(file);
        oldpw = `${user}:{SHA}${oldpw}=`;

        if(tmp.indexOf(oldpw) == -1){
            res.jsonp({
                status: "fail",
                msg: "旧密码不正确"
            });
        }else{
            tmp = tmp.replace(oldpw, `${user}:{SHA}${newpw}=`);
            fs.writeFileSync(file, tmp);
            res.jsonp({
                status: "success",
                msg: "更新成功"
            });
        }
    });
    
    app.post('/go/addpartner/:project', function(req, res) { //添加项目开发者
        var project = req.params.project;
        var user = req.query.newpartner;
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

function post(url, conf){
    conf = $$.extend({jar: true}, conf);
    return new Promise((resolve, reject) => {
        request.post(url, conf, function(err, res, body){
            if(err){
                reject(err);
            }else{
                resolve(body);
            }
        })
    });
}


function get(url, conf){
    conf = $$.extend({jar: true}, conf);
    return new Promise((resolve, reject) => {
        request.get(url, conf, function(err, res, body){
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
