var fs = require('fs');
var request = require('request');
var conf = require('./conf');
var Store = require('../lib/store');
var $$ = require('./lib/bowlder');
var infoDir = `${conf.cacheDir}/info`;
var goDb = new Store(`${infoDir}/go.db`, "CREATE TABLE pipelines(name, vcpath, manager, creator, gid);CREATE TABLE users(name, fullname, role);");
var stmts = {
    pipelines: goDb.prepare("select * from pipelines"),
    admins: goDb.prepare("select * from users where role='1'"),
    getPartners: goDb.prepare("select manager from pipelines where name=?"),
    setPartners: goDb.prepare("update pipelines set manager=? where name=?"),
    delProject: goDb.prepare("delete from pipelines where name=?"),
    addProject: goDb.prepare("insert into pipelines values(?, ?, ?, ?)")
}

var host = "http://127.0.0.1:8153";

module.exports = function(app){

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

    app.post('/go/create/:type', function(req, res) { //创建项目
        var type = req.params.type;
        var user = req.query.user;
        var vcpath = req.query.vcpath;
        var dest = req.query.dest;
        var project = vcpath.replace(/\//g, '_');
        var pipelineFile = `templates/pipeline.${type}.xml`;
        if(!fs.existsSync(pipelineFile)){
            res.jsonp({
                status: "fail",
                msg: `${pipelineFile}不存在`
            });
            return;
        }
        var pipelineXml = $$.template.replace(fs.readFileSync(pipelineFile), {
            name: project,
            vcpath: vcpath,
            dest: dest,
            omad: ''
        }, null, '');

        (async function(){
            await stmts.delProject.run(project);
            await stmts.addProject.run(project, vcpath, user, user, type);
            res.jsonp({
                status: "success",
                msg: "添加项目成功"
            });
        })();
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
