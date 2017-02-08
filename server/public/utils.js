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
    $.fn.compile = function(scope){
        var views = [];
        scope.$refresh = function(){
            views.forEach(fn=>fn());
        }
        return this.each(function(){
            var $wrap = $(this);
            $wrap.on("click", "[go-click]", function(e){
                scope.$event = e;
                var action = this.getAttribute("go-click");
                if(action){
                    if(withFunc(action, scope) === false){
                        e.preventDefault();
                    }
                }
                scope.$refresh();
            });
            $wrap.find("[go-blur]").each(function(){
                var _val, prop = this.getAttribute("go-blur");
                $(this).blur(function(e){
                    scope.$event = e;
                    withFunc(prop, scope);
                });
            });
            $wrap.find("[go-show]").each(function(){
                var _val, prop = this.getAttribute("go-show");
                var $el = $(this);
                views.push(function(){
                    var val = withFunc(prop, scope);
                    if(val !== _val){
                        _val = val;
                        $el[val ? 'show' : 'hide']();
                    }
                });
            });
            $wrap.find("[go-html]").each(function(){
                var _val,
                    elem = this,
                    prop = elem.getAttribute("go-html");
                views.push(function(){
                    var val = withFunc(prop, scope);
                    if(val !== _val){
                        _val = val;
                        elem.innerHTML = val;
                    }
                });
            });
            $wrap.find("[go-class]").each(function(){
                var _val,
                    elem = this,
                    prop = elem.getAttribute("go-class");
                views.push(function(){
                    var val = withFunc(prop, scope);
                    if(val !== _val){
                        var addNames = val.split(/\s+/);
                        var removeNames = (_val || '').split(/\s+/);
                        var idx, clses = elem.className.split(/\s+/);
                        removeNames.forEach(function(name){
                            if(name){
                                while((idx = clses.indexOf(name)) > -1){
                                    clses.splice(idx, 1);
                                }
                            }
                        });
                        addNames.forEach(function(name){
                            if(name && clses.indexOf(name) == -1) clses.push(name);
                        });
                        elem.className = clses.join(" ");
                        _val = val;
                    }
                });
            });
            $wrap.find("[go-options]").each(function(){
                var elem = this;
                var prop = elem.getAttribute("go-options");
                var arr = withFunc(prop, scope);
                if($.isArray(arr)){
                    arr.forEach(function(item){
                        var value = item.value || item;
                        var label = item.label || value;
                        var opt = new Option(label, value);
                        elem.options.add(opt);
                    });
                }
            });
            $wrap.find("[go-model]").each(function(){
                var model = this.getAttribute("go-model");
                if(model){
                    $(this).bind("change input", function(){
                        var obj = scope;
                        var arr = model.split('.');
                        for(var i = 0; i < arr.length-1; i ++){
                            var key = arr[i], idx;
                            if(/(.*?)\[(\d+)\]/.test(key)){
                                obj = obj[RegExp.$1];
                                key = parseInt(RegExp.$2);
                            }
                            if(!obj[key]) obj[key] = {};
                            obj = obj[key];
                        }
                        obj[arr[i]] = this.value;
                    });
                }
            });
        });
    }

    var fnCache = {}, genFunc = function(expr){
        return new Function('obj', 'with(obj)return ' + expr);
    };
    var withFunc = function(expr, obj, debug, val){
        try{
            if(!fnCache[expr]) fnCache[expr] = genFunc(expr);
        }catch(e){ throw('invalid expression: ' + expr + '\n' + e); }
        try{
            val = fnCache[expr](obj||window);
        }catch(e){ if(debug) throw(e); }
        return val;
    }
    var escapes = {
        "'":      "'",
        '\\':     '\\',
        '\r':     'r',
        '\n':     'n',
        '\t':     't',
        '\u2028': 'u2028',
        '\u2029': 'u2029'
    };
    var escapeMatch = /\\|'|\r|\n|\t|\u2028|\u2029/g,
        escaper = function(match) { return '\\' + escapes[match]; };
    $.template = {
        replace: function(temp, data, regexp, defaultval, filter){
            if(!$.isArray(data)) data = [data];
            var ret = [];
            data.forEach(function(item){
                ret.push(replaceAction(item));
            });
            return ret.join("");
            function replaceAction(object){
                return temp.replace(regexp || (/\{\{([^}]+)\}\}/g), function(match, name){
                    if(filter && !filter.test(match)) return match;
                    var result = withFunc(name, object);
                    return result != null ? result : '';
                });
            }
        },
        parse: function(text, data){
            var index = 0, source = "var __t,__p='',__j=Array.prototype.join," + "print=function(){__p+=__j.call(arguments,'');};\nwith(obj||{}){__p+='";
            text.replace(/<%=([\s\S]+?)%>|<%([\s\S]+?)%>|$/g, function(match, interpolate, evaluate, offset){
                source += text.slice(index, offset).replace(escapeMatch, escaper);
                if(interpolate){
                    source += ~interpolate.indexOf('(') ? "'+\n(typeof (__t="+interpolate+") =='undefined'||__t==null?'':__t)+'"
                        : "'+\n(typeof ("+interpolate+") =='undefined'||(__t=("+interpolate+"))==null?'':__t)+'";
                }else if(evaluate){
                    source += "';\n" + evaluate + "\n__p+='";
                }
                index = offset + match.length;
                return match;
            });

            source += "';\n}return __p;";
            var fn = new Function('obj', source);
            return data ? fn(data) : fn;
        }
    }
    //sha1加密算法
    var hexcase = 0;
    var b64pad = "";
    var chrsz = 8;
    function b64_sha1(s) {
        return binb2b64(core_sha1(str2binb(s), s.length * chrsz));
    }
    $.b64_sha1 = b64_sha1;
    function core_sha1(x, len) {
        x[len >> 5] |= 0x80 << (24 - len % 32);
        x[((len + 64 >> 9) << 4) + 15] = len;

        var w = Array(80);
        var a = 1732584193;
        var b = -271733879;
        var c = -1732584194;
        var d = 271733878;
        var e = -1009589776;

        for (var i = 0; i < x.length; i += 16) {
            var olda = a;
            var oldb = b;
            var oldc = c;
            var oldd = d;
            var olde = e;

            for (var j = 0; j < 80; j++) {
                if (j < 16) w[j] = x[i + j];
                else w[j] = rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
                var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)), safe_add(safe_add(e, w[j]), sha1_kt(j)));
                e = d;
                d = c;
                c = rol(b, 30);
                b = a;
                a = t;
            }

            a = safe_add(a, olda);
            b = safe_add(b, oldb);
            c = safe_add(c, oldc);
            d = safe_add(d, oldd);
            e = safe_add(e, olde);
        }
        return Array(a, b, c, d, e);

    }
    function sha1_ft(t, b, c, d) {
        if (t < 20) return (b & c) | ((~b) & d);
        if (t < 40) return b ^ c ^ d;
        if (t < 60) return (b & c) | (b & d) | (c & d);
        return b ^ c ^ d;
    }
    function sha1_kt(t) {
        return (t < 20) ? 1518500249 : (t < 40) ? 1859775393 : (t < 60) ? -1894007588 : -899497514;
    }
    function core_hmac_sha1(key, data) {
        var bkey = str2binb(key);
        if (bkey.length > 16) bkey = core_sha1(bkey, key.length * chrsz);

        var ipad = Array(16),
            opad = Array(16);
        for (var i = 0; i < 16; i++) {
            ipad[i] = bkey[i] ^ 0x36363636;
            opad[i] = bkey[i] ^ 0x5C5C5C5C;
        }

        var hash = core_sha1(ipad.concat(str2binb(data)), 512 + data.length * chrsz);
        return core_sha1(opad.concat(hash), 512 + 160);
    }
    function safe_add(x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }
    function rol(num, cnt) {
        return (num << cnt) | (num >>> (32 - cnt));
    }
    function str2binb(str) {
        var bin = Array();
        var mask = (1 << chrsz) - 1;
        for (var i = 0; i < str.length * chrsz; i += chrsz)
            bin[i >> 5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i % 32);
        return bin;
    }
    function binb2str(bin) {
        var str = "";
        var mask = (1 << chrsz) - 1;
        for (var i = 0; i < bin.length * 32; i += chrsz)
            str += String.fromCharCode((bin[i >> 5] >>> (24 - i % 32)) & mask);
        return str;
    }
    function binb2hex(binarray) {
        var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
        var str = "";
        for (var i = 0; i < binarray.length * 4; i++) {
            str += hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8 + 4)) & 0xF) + hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8)) & 0xF);
        }
        return str;
    }
    function binb2b64(binarray) {
        var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var str = "";
        for (var i = 0; i < binarray.length * 4; i += 3) {
            var triplet = (((binarray[i >> 2] >> 8 * (3 - i % 4)) & 0xFF) << 16) | (((binarray[i + 1 >> 2] >> 8 * (3 - (i + 1) % 4)) & 0xFF) << 8) | ((binarray[i + 2 >> 2] >> 8 * (3 - (i + 2) % 4)) & 0xFF);
            for (var j = 0; j < 4; j++) {
                if (i * 8 + j * 6 > binarray.length * 32) str += b64pad;
                else str += tab.charAt((triplet >> 6 * (3 - j)) & 0x3F);
            }
        }
        return str;
    }
})(jQuery);
