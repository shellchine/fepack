# FEPack

## 脚本安装
* 配置host: 10.100.21.137  git.f2e.163.com  //123.126.62.137
* 创建${cacheDir}(一般为/var/fepack)并下载FEPack script:
```sh
su
mkdir /var/fepack
chown -R go:go /var/fepack
su - go
cd /var/fepack
mkdir script
cd script
//ssh -T -p 16322 git@git.f2e.163.com
git clone ssh://git@git.f2e.163.com:16322/xqwei/fepack.git .
cd server
npm install
node --harmony app.js > /tmp/goapp.log &
```

## 初始配置
* 系统帐号(/var/fepack/info/)
  - .goaccess
  - .ftpaccess

## 目录结构
FEPack根目录在/var/fepack，拥有者应为go:go。

基本目录有：

 - backup: 用于打包保存回滚所需的html、配置文件
 - dist: 处理后用于发布的文件，按html/静态资源类型划分目录
 - info: 保存静态文件打包处理信息，用于调试或回滚
 - tmp: 临时文件，如lftp上传配置等
 - script: FEPack脚本

每个发布阶段均会在conf.cacheDir下生成对应的临时文件，大致结构如下：

```xml
├── backup
│   └── finance_business
│       ├── html.3.tar.gz
│       └── info.3.tar.gz
├── dist
│   └── finance_business
│       ├── file
│       ├── html
│       │   ├── business.shtml
│       │   ├── inc
│       │   │   ├── foot_static.html
│       │   │   └── head_static.html
│       ├── html.tar.gz
│       ├── html4cms
│       │   └── business.shtml
│       ├── html4dev
│       │   └── business.shtml
│       ├── html4dev.tar.gz
│       └── static
├── info
│   ├── finance_business
│   │   ├── .curfiles
│   │   ├── .cms.addrs
│   │   ├── .inc.addrs
│   │   ├── .packfiles
│   │   └── goscript
│   │       ├── dist.js
│   │       └── dist_dev.js
│   ├── .ftpauth
│   ├── .cmsauth
│   ├── .svnauth
│   ├── go.db
│   ├── cmsid.db
│   └── jspack.db
└── tmp
    └── finance_business
```

info/.*auth 文件格式均为 user:pass。

## 配置文件

* ${cacheDir}/info/.goaccess: 用户权限文件
* conf.js/conf.${firm}.js: 项目通用配置
  - firm: 机构名
  - cacheDir: FEPack文件根目录，一般为/var/fepack，所有者为go:go
  - devHost: 测试服务器域名(无vm渲染功能)，默认为"http://static.f2e.netease.com"
  - devHost2: 测试服务器域名(有vm渲染功能)，默认为"http://qa.developer.163.com"
  - devHttpsHost: https协议下的测试服务器域名
  - vc: 代码仓库配置
    - type: "svn"
    - host: "https://svn.ws.netease.com/frontend"
    - localhost: "/var/frontend"
    - materials: `<svn url="https://svn.ws.netease.com/frontend/{{vcpath}}" username="xqwei" encryptedPassword="NrXHOLXkiJgDaBQASBOUVg==" autoUpdate="false" />`
  - lint: 代码检查，在devStage中用到
  - devDist: devStage处理后的代码发布方式
  - pack: liveStage的代码打包合并方式
  - compress: js/css压缩方式
    - js: 0/1/2
    - css: 0/1
  - dist: liveStage处理后的代码发布方式
  - files: 定义需要忽略、发布但不处理的文件
    - exclude:  /\.(avi|mpeg|psd)$/,
    - preserve: /\.(php|jsp|asp|xml|min\.js|min\.css)$/
  - cdns: cdn文件发布配置
  - serverBase: cdn文件前路径
  - syncs: 后端同步方式数组，由ENV.GO\_SYNC\_TO指定选用的发布方式(index)

* server/public/goconf.js: GO系统web界面配置文件

## 启动服务
* server/app.js: 提供server/public下的文件访问以及/go/*下的所有API接口。
  -  http://127.0.0.1:8990/dist/${project}/html4dev/index.html
  -  http://127.0.0.1:8990/dist/${project}/html/index.html
  -  http://127.0.0.1:8990/gohtml/go17.css
* server/proxy.js: 提供一键调试功能。注：启动前需让运维布署防火墙以及关闭8991端口的外网访问权限。
``shell
node --harmony proxy.js > /tmp/proxy.log &
// node --harmony proxy.js -p 8990 > /tmp/proxy.log &
``

## 环境变量

* GO\_CONFIG: 表示使用conf.${GO\_CONFIG}.js作为基础配置文件
* JS\_COMPRESS: 是否进行JS压缩(0/1)，默认为0
* CSS\_COMPRESS: 是否进行CSS压缩，默认为0(不压缩)，可设为1(压缩但不混淆变量名)或2(压缩并混淆变量名)
* GO\_SYNC\_TO: 使用哪种后端部署方式(0/1/..)
* HTTPS\_CDN: 是否使用HTTPS CDN地址(0/1)
* PRINT\_CSS: 是否将项目内的样式表默认行内输出(除非设置_group, _drop)，默认为0
* PRINT\_JS:  //项目内的脚本默认行内输出(除非设置_group, _drop)，默认为0
* CMS_CHANNEL: CMS项目对应的频道ID
* omadDev: 300|4500;500|5500  //对应云测试环境的moduleId|envId
* omadLive: 300|4500;500|5500  //对应云正式环境的moduleId|envId

## 项目设置文件

* project.json: 该文件应放置在${infoDir}下, 如/var/fepack/info/desktop-client/project.json。
```javascript
{
  "parentProject": "tie",  //后端项目发布时，将要发布的项目文件归入此父项目目录下
  "syncFull": true,  //将所有页面文件同步到后端(否则只同步inc/*)
  "distInc": "v2/inc_v2",  //发布后的inc目录，默认为"inc"
  "skipRes": false,  //不发布未合并的静态资源(适合bowlder项目)
  "noSuffix": "init.js sth/*.js",    //此处指定的文件在发布时不添加版本号后缀
  "depends": {"index.shtml": "a.html b.html c.js"}, //bowlder.js中动态模块依赖，写在ne-module|ne-plugin中的模块或者模块define内的依赖无需在此定义
  "omadDev": [{"moduleId": 600, "envId": 1900}],   //云主机测试环境参数
  "omadLive": [{"moduleId": 600, "envId": 1900}]  //云主机正式环境参数
}
```

## 发布流程
### devStage
* 单元测试(可选)
* 将页面中的引用的静态资源路径替换为测试机绝对路径: dist/${projectName}/html4dev
* 发布到测试服务器

### liveStage
* 静态资源打包、压缩，添加md5戳: dist/${projectName}/static
* 将页面中的引用的静态资源路径替换为打包压缩后的cdn地址: dist/${projectName}/html
* 发布到正式服务器(rsync/scp/ftp/omad)

### rollback
* 从backup目录中找到所需版本的备份并解压
* 发布到正式服务器(rsync/scp/ftp/omad)

### 发布结果
* ${cacheDir}/dist/${projectName}/下会生成以下几个目录：
  - static: 发布到img*.cache.netease.com的图片/js/css等静态资源
  - file: 发布到file.ws.126.net的swf/pdf/mp3等多媒体文件
  - html4dev: devStage所发布的html文件，里面的静态资源引用已改成测试机地址
  - html: devStage所发布的html文件，里面的静态资源引用已改成CDN地址
* 每个阶段均会在/var/lib/go-agent/pipelines/${projectName}/cruise-output下生成html报表


## 插件开发
FEPack允许你在脚本目录下自定义处理脚本，并在基础配置文件中调用。

### vcUtil/*
* 默认提供svn.js, git.js，可根据需要扩展其它代码仓库

### packUtil/*
* 默认提供base.js, bdc.js。
* base.js进行基础的压缩合并。
* bdc.js进行bowlder收集、压缩。

### distUtil/*
* 发布脚本，需要提供exports.publish方法用于发布dist目录到后端服务器。
* 处理后的目录: ${cacheDir}/dist/${project}/html/
* 发布目标配置：FEPack根目录下的conf.js
```js
    syncs: [
        { type: "cp", base: "/var/f2e_inc" },
        { type: "scp", base: "ssh://127.0.0.1:16322/dev/shm/" }
    ]
```
* type:"cp"方法其实并没有发布操作，一般需要配合sersync来实现真正的代码分发。也就是由sersync来监听base目录的改动并同步到后端服务器。


## 测试
* 使用测试脚本
```sh
cd fepack/script/test
node --harmony static.js
node --harmony live.js
node --harmony rollback.js
//node --harmony static.js -p tie/yun/sitegov
```


[GO文档]: ?md=md/go.md

