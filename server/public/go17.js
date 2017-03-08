// customization for go 17.2
// shellchine@163.com

(function($){
    $.async = function(gen){
        var fn = gen();
        return new Promise(resolve => {
            var step = function(val){
                var result = fn.next(val);
                if(result.done){
                    resolve(result.value);
                }else{
                    var p = result.value;
                    if(typeof p == 'function') p(step);
                    else{
                        if(!p || typeof p.then != 'function') p = Promise.resolve(p);
                        p.then(step);
                    }
                }
            }
            step();
        });
    }
    var host = location.origin.replace(/:\d+|$/, ":8990");
    $("head").append(`<link type="text/css" rel="stylesheet" href="${host}/gohtml/go17.css" />`);

    var stagePath, pipename, pageType = (function(){ //当前页面类型: index/overview/history
        var url = location.href;
        if(/\/go\/pipelines\/(.*)/i.test(url)){
            stagePath = RegExp.$1;
            return 'overview';
        }
        if(/\/pipeline\/history\/([A-z_\-\.0-9]+)/i.test(url)){
            pipename = RegExp.$1;
            return 'history';
        }
        if(/admin\/pipelines/.test(url)) return 'admin';
        return 'index';
    })();
    
    $.async(function*(){ //各类页面初始化
        yield $.getScript(host + "/gohtml/utils.js");
        yield $.getScript(host + "/gohtml/goconf.js");
        var scope = window.goConf;
        scope.groups.forEach(group => {
            group.dir2dest = {};
            var list = [];
            $.each(group.list, function(key, info){
                var arr = info.split(/,/);
                for(var i = 1; i < arr.length; i ++){
                    group.dir2dest[arr[i]] = key;
                }
                list.push({label: arr[0], value: key});
            });
            group.list = list;
        });
        scope.msg = {};
        var user = trim($(".current_user_name").html());

        switch(pageType){
        case 'overview':
            initReport();
            break;
        case 'history':
            initPartners();
            break;
        case 'admin':
            initAdmin();
            break;
        case 'index':
            initGroups();
            break;
        }
        initChgPwd();
        
        function initReport(){ //在Overview页显示html报表
            var $build_cause = $(".build_cause");
            if($build_cause.length > 0){
                var jobName = trim($(".job a").html());
                var jobReport = ({
                    "publish2live": "live.html",
                    "publish2cms": "live.html",
                    "publish2cdn": "live.html",
                    "publish2static": "dev.html",
                    "rollback": "rollback.html"
                })[jobName];
                if(jobReport){
                    var url = `/go/files/${stagePath}/${jobName}/gohtml/${jobReport}`;
                    var $iframe = $(`<iframe frameborder=0 class="html_report" src="${url}"></iframe>`).appendTo($build_cause);
                    $iframe.load(function(){
                        $iframe.css({
                            overflow: "hidden",
                            height: this.contentDocument.body.scrollHeight + 15
                        });
                    });
                }
            }
        }

        function initAddUser(){ //首页页: 添加用户
            var $addUser = $(`<li class="change-pwd">
                <a go-click="showAddUser()">添加用户</a>
                <form class="go-change-pwd-form">
                <div><label>ID：</label><input /></div>
                <div><label>姓名：</label><input /></div>
                <a class="submit" go-click="addUser()">提交</a>
                <div class="status" go-html="msg.addUser" go-class="addSuccess?'success':''"></div></form></li>`).compile(scope);
            $addUser.click(function(){return false}).prependTo($("#header .user"));
            var $inputs = $addUser.find("input");
            $("body").click(function(e){
                $addUser.removeClass("on");
            });
            scope.showAddUser = function(){
                $addUser.addClass("on");
                $inputs.val('');
                scope.msg.addUser = '';
                scope.addSuccess = false;
            };
            scope.addUser = function(){
                scope.msg.addUser = '';
                var id = $inputs[0].value.trim();
                var name = $inputs[1].value.trim();
                if(id === ''){
                    scope.msg.addUser = "ID不能为空";
                }else if(!name){
                    scope.msg.addUser = "姓名不能为空";
                }else{
                    $.post(`${host}/go/user/add`, {
                        id : id,
                        name : name
                    }, function(json){
                        if(json.status == 'success'){
                            scope.msg.addUser = `用户${id}(${name})添加成功`;
                            scope.addSuccess = true;
                            setTimeout(function(){
                                $addUser.removeClass("on");
                            }, 1200);
                        }else if(json.msg){
                            scope.msg.addUser = json.msg;
                        }
                        $addUser.$refresh();
                    });
                }
            };
        }
        
        function initChgPwd(){ //详情页: 修改密码
            var $chgPwd = $(`<li class="change-pwd">
                <a go-click="showChgPwd()">修改密码</a>
                <form class="go-change-pwd-form">
                <div><label>旧密码：</label><input type="password" /></div>
                <div><label>新密码：</label><input type="password" /></div>
                <div><label>确认密码：</label><input type="password" /></div>
                <a class="submit" go-click="chgPwd()">提交</a>
                <div class="status" go-html="msg.chgPwd" go-class="chgSuccess?'success':''"></div></form></li>`).compile(scope);
            $chgPwd.click(function(){return false}).prependTo($("#header .user"));
            var $inputs = $chgPwd.find("input");
            $("body").click(function(e){
                $chgPwd.removeClass("on");
            });
            scope.showChgPwd = function(){
                $chgPwd.addClass("on");
                $inputs.val('');
                scope.msg.chgPwd = '';
                scope.chgSuccess = false;
            };
            scope.chgPwd = function(){
                scope.msg.chgPwd = '';
                if($inputs[0].value === ''){
                    scope.msg.chgPwd = "旧密码不能为空";
                }else if($inputs[1].value.length < 6){
                    scope.msg.chgPwd = "新密码不能少于6位";
                }else if($inputs[1].value != $inputs[2].value){
                    scope.msg.chgPwd = "新密码前后不一致";
                }else{
                    $.post(`${host}/go/user/chpwd`, {
                        user : user,
                        oldpw : $.b64_sha1($inputs[0].value),
                        newpw : $.b64_sha1($inputs[1].value)
                    }, function(json){
                        if(json.status == 'success'){
                            scope.msg.chgPwd = "密码更新成功";
                            scope.chgSuccess = true;
                            setTimeout(function(){
                                $chgPwd.removeClass("on");
                            }, 1200);
                        }else if(json.msg){
                            scope.msg.chgPwd = json.msg;
                        }
                        $chgPwd.$refresh();
                    });
                }
            };
        }

        function initPartners(){ //历史页：添加合作者
            if($("#tab-content-of-pipeline-groups").length) return;

            $.async(function*(){
                scope.addPartner = function(){
                    var newPartner = (scope.newPartner || "").trim();
                    if(!newPartner){
                        alert("请选择合作者。");
                        return;
                    }
                    scope.msg.partner = '<img src="http://img2.cache.netease.com/auto/projects/club/v1.1/default/images/loadings.gif">';
                    $.post(`${host}/go/addpartner/${pipename}`, {
                        newpartner: newPartner
                    },function(json){
                        if(json['status'] == 'success'){
                            scope.msg.partner = json.msg || '合作者添加成功。';
                        }else if(json.msg){
                            scope.msg.partner = json.msg;
                        }
                        $wrapper.$refresh();
                    });
                }
                scope.partners = yield $.getJSON(`${host}/go/partners/${pipename}`);
                scope.showPartners = false;
                var $wrapper = $(`<div class="f2e-tools-wrap"><div class="pipeline-edit-addon">
              <a class="new-manager-btn" go-show="!showPartners" go-click="showPartners=!showPartners">添加合作者</a>
              <div class="new-manager-form" style="display:none" go-show="showPartners" go-click="addPartner()">
                <span go-html="msg.partner"></span>
                <select go-options="partners" go-model="newPartner"><option value="">请选择合作者</option></select>
                <input type="button" value="确定" class="submit">
                <input type="button" value="取消" class="cancel">
              </div></div></div>`).compile(scope).appendTo($(".header"));
            });
        }

        function getInfo(cb){
            $.async(function*(){
                var json = yield $.getJSON(host + "/go/list");
                $.extend(scope, json);
                if(json.admins[user]) {
                    //显示管理入口
                    $("#cruise-header-tab-admin").show();
                    $("div.pipelines_selector").show();
                }
                cb();
            });
        }
        
        function initAdmin(){ //隐藏无权修改的项目
            getInfo(function(){
                var pipelines = scope.pipelines;
                $("tr.pipeline").each(function(){
                    var $pipeline = $(this);
                    var id = trim($pipeline.find("td.name a").html() || "");
                    var item = pipelines[id];
                    if(!item) return;
                    var manager = {};
                    item.manager.split(/\s*,\s*/).forEach(user=>manager[user] = 1);
                    if(scope.admins[user] || manager[user]){
                        $pipeline.show();
                    }
                });
            });
        }
        
        function initGroups(){ //首页项目分组
            var $groups, $content = $("#pipeline_groups_container").hide();
            if($content.length == 0) return;
            getInfo(function(){
                scope.admins[user] && initAddUser();
                var pipelines = scope.pipelines;
                var divHtmls = scope.divHtmls = {};
                $content.find(".pipeline").each(function(){
                    var $pipeline = $(this);
                    var pipeId = $pipeline.attr("id").replace(/^pipeline_/, '').replace(/_panel/, '');
                    var item = pipelines[pipeId] || {group:'common', manager:'f2e'};
                    if(!item) return; //当前用户无权限
                    var groupId = item.group;
                    var manager = {};
                    item.manager.split(/\s*,\s*/).forEach(user=>manager[user] = 1);
                    if(!divHtmls[groupId]) divHtmls[groupId] = '';
                    if(scope.admins[user] || manager[user]){
                        divHtmls[groupId] += $pipeline[0].outerHTML + '<div class="divider"></div>';
                    }
                });
                
                $groups = $($.template.parse(`<%groups.forEach(function(group,i){%>
                    <div><div class="pipeline_bundle">
                      <div class="pipelines"><div class="content_wrapper_outer">
                        <div class="content_wrapper_inner">
                          <h2 class="entity_title"><%=group.name||group.type%>
                            <span class="quickadd-link" go-show="!groups[<%=i%>].show" go-click="groups[<%=i%>].show=!groups[<%=i%>].show">新建项目</span>
                            <div class="quickadd-form" go-show="groups[<%=i%>].show">代码路径: <input class="vcpath" go-blur="pathBlur(<%=i%>)" go-model="groups[<%=i%>].vcpath"/>
                              <select go-options="groups[<%=i%>].list" go-model="groups[<%=i%>].dest"><option value=""><%=group.label%></option></select> &nbsp;
                              <input type="submit" class="quickadd-btn" value="新增" go-click="createProject(<%=i%>)" go-show="!groups[<%=i%>].lock">
                              <input type="button" value="取消" class="cancel" go-click="groups[<%=i%>].show=false">
                              <span class="quickadd-msg" go-html="groups[<%=i%>].msg"></span>
                            </div>
                          </h2>
                          <%=divHtmls[group.type]%>
                        </div>
                      </div></div>
                    </div></div>
                    <%})%>`, scope)).compile(scope);
                $content.before($groups);
            });
            scope.pathBlur = function(i){
                var e = scope.$event, input = e.target;
                var dir = input.value.trim().replace(/\\/g, '/').replace(/^\/?(frontend)?\/?/, '');
                var _dest = scope.groups[i].dir2dest[dir]; //根据仓库目录自动设定发布目标
                if(_dest){
                    $(input).next("select").val(_dest);
                }
            };
            
            scope.createProject = function(i){
                var group = scope.groups[i];
                var url = `${host}/go/create/${group.type}`;
                
                var vcpath = (group.vcpath || '').trim().replace(/\\/g, '/').replace(/^\/?(frontend)?\/?/, '');
                if(!vcpath){
                    return alert("代码路径不能为空");
                }
                if(!group.dest){
                    return alert("请选择发布目标");
                }
                
                group.msg = '<img src="http://img2.cache.netease.com/auto/projects/club/v1.1/default/images/loadings.gif">';
                group.lock = true;
                $.post(url, {
                    user: user,
                    vcpath: vcpath,
                    dest: group.dest
                }, function(json){
                    if(json['status'] == 'success'){
                        var name = json['name'];
                        group.msg = '项目' + name + '创建成功';
                        location.href = "/go/tab/pipeline/history/" + name;
                    }else if(json.msg){
                        group.msg = '';
                        alert(json.msg.replace(/<br>/g, "\n"));
                        group.lock = false;
                    }
                    $groups.$refresh();
                });
                $groups.$refresh();
            }
        }
        
    });
    
    function trim(str){
        return (str || '').replace(/<.*?>/g,'').trim();
    }

})(jQuery);
