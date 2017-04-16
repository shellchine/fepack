# GO系统安装

## 依赖程序安装

* JDK 8安装(Debian 6为例)
  - 修改/etc/apt/source.list
```xml
deb http://mirrors.163.com/debian/ wheezy main non-free contrib
deb http://mirrors.163.com/debian/ wheezy-updates main non-free contrib
deb http://mirrors.163.com/debian/ wheezy-backports main non-free contrib
deb-src http://mirrors.163.com/debian/ wheezy main non-free contrib
deb-src http://mirrors.163.com/debian/ wheezy-updates main non-free contrib
deb-src http://mirrors.163.com/debian/ wheezy-backports main non-free contrib
deb http://mirrors.163.com/debian-security/ wheezy/updates main non-free contrib
deb-src http://mirrors.163.com/debian-security/ wheezy/updates main non-free contrib
```
  - 安装Oracle Java 8
```xml
su
echo "deb http://ppa.launchpad.net/webupd8team/java/ubuntu trusty main" | tee -a /etc/apt/sources.list
echo "deb-src http://ppa.launchpad.net/webupd8team/java/ubuntu trusty main" | tee -a /etc/apt/sources.list
apt-key adv --keyserver keyserver.ubuntu.com --recv-keys EEA14886
apt-get update
apt-get install oracle-java8-installer
```
* 如果安装过程中出现依赖错误，可用`dpkg --configure -a`找到所有出错的安装包，用apt-get remove卸载。

* [nodeJS](https://nodejs.org/en/download/current/)安装: 通常选择Linux Binaries (x86/x64)，尽量安装最新版本，文档写就时的版本为7.7。

## go-server/go-agent安装

* [下载地址](https://www.gocd.io/download/)

* sudo dpkg -i go-*.deb

## 本地化定制

* 定制化js/css详见FEPack中的server/public目录
* unzip解压 /usr/share/go-server/go.jar
* unzip解压 defaultFiles/cruise.war
``sh
mkdir /dev/shm/go /dev/shm/cruise
cd /dev/shm/go
unzip /usr/share/go-server/go.jar
cd /dev/shm/cruise
unzip defaultFiles/cruise.war
``
* 主页面修改
  - 在WEB-INF/rails.new/public/assets/application-ec94bb1c80d0d0ea390d72b899223ca445147d11e85107969c8989d53ef748e2.js末尾添加
``javascript
document.write(`<script src="http://${location.hostname}:8990/gohtml/go17.js" charset="utf-8"></script>`);添加go17.js
``
  - 禁止pipeline自动刷新(否则分组后的结果会消失): 修改WEB-INF/rails.new/app/views/pipelines/index.html.erb
``javascript
  <script type="text/javascript">
  Util.on_load(function () {
    <% if !auto_refresh? %> //此处添加!
``
* 样式修改
  - vi ./WEB-INF/rails.new/public/assets/application-eb7114a376e8823f458ba87fbd6cc33830c941f845a08df91d19b5dd5594feaf.css:
``css
#pipeline_groups_container{display:none}
``
* console输出编码修改: 修改WEB-INF/web.xml，添加locale-encoding-mapping声明
```xml
<web-app xmlns="http://java.sun.com/xml/ns/javaee"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://java.sun.com/xml/ns/javaee http://java.sun.com/xml/ns/javaee/web-app_3_0.xsd"
        metadata-complete="true"
        version="3.0">
    <locale-encoding-mapping><locale>en</locale><encoding>UTF-8</encoding></locale-encoding-mapping>
    <locale-encoding-mapping><locale>en-US</locale><encoding>UTF-8</encoding></locale-encoding-mapping>
    <locale-encoding-mapping><locale>zh</locale><encoding>UTF-8</encoding></locale-encoding-mapping>
    <locale-encoding-mapping><locale>zh-CN</locale><encoding>UTF-8</encoding></locale-encoding-mapping>
```
* 修改完成后，重新压缩defaultFiles/cruise.war和/usr/share/go-server/go.jar
``sh
cd /dev/shm/cruise
zip ../go/defaultFiles/cruise.war -r *
cd ../go
zip /usr/share/go-server/go.jar -r *
``

## 自动化脚本
* 参见FEPack一文

## 启动

* 修改jdk路径
``xml
cd /home
mv jdk jdk1.6
ln -s /usr/lib/jvm/java-8-oracle jdk
``
* /etc/init.d/go-server start
* /etc/init.d/go-agent start

## pipe配置
pipeline可以在web管理后台手动创建，需要逐一添加stage及stage里的jobs(每个stage可有一到多个job)。一个完整的pipeline配置如下:
```xml
    <pipeline name="{{name}}">
      <environmentvariables>
        <variable name="GO\_SYNC\_TO">
          <value>{{dest}}</value>
        </variable>
        <variable name="GO_CONFIG">
          <value>conf.ne</value>
        </variable>{{omad}}
      </environmentvariables>
      <materials>
        <svn url="https://svn.ws.netease.com/frontend/{{vcpath}}" username="xqwei" encryptedPassword="NrXHOLXkiJgDaBQASBOUVg==" autoUpdate="false" />
      </materials>
      <stage name="devStage">
        <approval type="manual" />
        <jobs>
          <job name="publish2static">
            <tasks>
              <exec command="/var/fepack/script/publish2static" />
            </tasks>
            <tabs>
              <tab name="Lint" path="gohtml/dev.html" />
            </tabs>
            <artifacts>
              <artifact src="cruise-output/dev.html" dest="gohtml" />
            </artifacts>
          </job>
        </jobs>
      </stage>
      <stage name="publishStage">
        <approval type="manual" />
        <jobs>
          <job name="publish2live">
            <tasks>
              <exec command="/var/fepack/script/publish2live" />
            </tasks>
            <tabs>
              <tab name="Files" path="gohtml/live.html" />
            </tabs>
            <artifacts>
              <artifact src="cruise-output/live.html" dest="gohtml" />
            </artifacts>
          </job>
        </jobs>
      </stage>
      <stage name="rollback">
        <approval type="manual" />
        <jobs>
          <job name="rollback">
            <tasks>
              <exec command="/var/fepack/script/rollback" />
            </tasks>
            <tabs>
              <tab name="RollBack" path="gohtml/rollback.html" />
            </tabs>
            <artifacts>
              <artifact src="cruise-output/rollback.html" dest="gohtml" />
            </artifacts>
          </job>
        </jobs>
      </stage>
    </pipeline>
```


[FEPack文档]: ?md=md/fepack.md

