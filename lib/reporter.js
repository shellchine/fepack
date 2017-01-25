var fs = require('fs');
var path = require('path');
var $$ = require('./bowlder');
var read = file => fs.readFileSync(path.resolve(__dirname, 'templates', file)).toString();

module.exports = class {
    constructor(name, file){
        var tmp = read(`${name}.html`);
        this.tmpl = $$.template.parse(tmp);
        this.file = file;
        this.data = Object.create({
            '$$': $$,
            aLink: link=>`<a href="${link}" target="_blank">${link}</a>`
        });
        this.data.head = read("head.html");
        this.data.foot = read("foot.html");
    }

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

    save(){
        //console.log(JSON.stringify(this.data, null, '    '));
        if(this.file && fs.existsSync(path.dirname(this.file))){
            fs.writeFileSync(this.file, this.tmpl(this.data));
        }
    }
}
