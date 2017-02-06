var fs = require('fs');
var request = require('request');
var conf = require('../conf');
var Store = require('../lib/store');
var $$ = require('./lib/bowlder');
var infoDir = `${conf.cacheDir}/info`;
var goDb = new Store(`${infoDir}/go.db`);
var stmts = {
    pipelines: goDb.prepare("select * from pipelines"),
    groups: goDb.prepare("select * from groupnames"),
    admins: goDb.prepare("select * from users where role='1'"),
    getPartners: goDb.prepare("select manager from pipelines where name=?"),
    setPartners: goDb.prepare("update pipelines set manager=? where name=?")
}

var host = "http://127.0.0.1:8153";

module.exports = function(app){

    app.get('/go/list', function(req, res) {
        (async function(){
            
            var pipelines = {};
            $$.each(await stmts.pipelines.all(), item=>{
                pipelines[item.name] = {
                    group: item.gid,
                    manager: item.manager
                }
            });
            var groupnames = {};
            $$.each(await stmts.groupnames.all(), item=>{
                groupnames[item.gid] = item.name;
            });
            var admins = {};
            $$.each(await stmts.admins.all(), item=>{
                admins[item.name] = 1;
            });
            
            res.jsonp({
                pipelines: pipelines,
                groupnames: groupnames,
                admins: admins
            });
        })();
    });

    app.get('/go/create/:project', function(req, res) {
        var project = req.params.project;
        var path = req.params.path;
        var type = req.query.type || "common";
        var pipelineFile = `templates/pipeline.${type}.xml`;
        if(!fs.existsSync(pipelineFile)){
            res.jsonp({
                status: "fail",
                msg: `${pipelineFile}不存在`,
                channel: 1,
                omad: ''
            });
            return;
        }
        var pipelineXml = $$.template.replace(fs.readFileSync(pipelineFile), {
            name: project,
            vcpath: path
        }, null, '');
        
    });

    app.get('/go/partners/:project', function(req, res) {
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

    app.get('/go/addpartner/:user', function(req, res) {
        var project = req.params.project;
        var user = req.query.newmanager;
        (async function(){
            var tmp = await stmts.getPartners.get(project);
            var manager = tmp.manager + "," + user;
            stmts.setPartners.get(manager, project);
            res.jsonp({
                status: 'success',
                msg: "添加合作者成功。"
            });
        })();
        
    });

}
