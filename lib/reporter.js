var fs = require('fs');
var path = require('path');
var $$ = require('./bowlder');
var pwd = process.cwd();    //进程目录
/*
* 读取 /lib/templates/下的文件内容
* */
var read = file => fs.readFileSync(path.resolve(__dirname, 'templates', file)).toString();


/*
* @class Reporter
*
* 替换/lib/templates/name，保存至 process.cwd()/cruise-output/file
*
*
* @param name {string} /lib/templates/下的文件名
* @param file
*
*
* #tmpl {function} name指定的文件的模板函数
* #file {string} 进程目录/cruise-output/file
* #data.$$ bowlder
* #data.aLink   {function} 生成一个a标签
* #data.head    {string}  /lib/templates/head.html内容
* #data.foot    {string}  /lib/templates/foot.html内容
* */
module.exports = class {
    constructor(name, file){
        var tmp = read(`${name}.html`);
        this.tmpl = $$.template.parse(tmp);
        this.file = path.resolve(pwd, "cruise-output", file);
        this.data = Object.create({
            '$$': $$,
            aLink: link=>`<a href="${link}" target="_blank">${link}</a>`
        });
        this.data.head = read("head.html");
        this.data.foot = read("foot.html");
    }

    /*
    * 在#data上设置属性值。
    * @param filed {string} key1.kye2|key[] 属性名称
    * @param val    {any}
    * */
    set(field, val){
        var tmp = this.data, key;
        field.split(".").forEach(_key => {
            if(key){
                tmp = tmp[key] || (tmp[key] = {});
            }
            key = _key;
        });
        if(/\[\]$/.test(key)){
            key = key.slice(0, -2);
            if(!tmp[key]){
                tmp[key] = [];
            }
            tmp[key].push(val);
        }else{
            tmp[key] = val;
        }
    }

    /*
    * 保存#tmpl(#data)到#file
    * */
    save(){
        //console.log(JSON.stringify(this.data, null, '    '));
        if(this.file && fs.existsSync(path.dirname(this.file))){
            fs.writeFileSync(this.file, this.tmpl(this.data));
        }
    }
}
