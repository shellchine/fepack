var $$ = {ver: '1.0'};
var toString = Object.prototype.toString;
var slice = [].slice;
$$.map = function(arr, fn, context){
    if(!arr) return arr;
    var result = isArrayLike(arr) ? [] : {};
    forEach(arr, function(item, i){
        var val = isFunction(fn) ? fn.call(context, item, i, result) : item;
        if(isDefined(val)) result[i] = val;
    });
    return result;
}
var forEach = $$.each = function(obj, iterator, context, exitOnFalse) {
    var key, typ = typeof obj;
    if(obj){
        if(typeof context == 'boolean'){
            exitOnFalse = context;
            context = undefined;
        }
        if(typ == 'function'){
            for(key in obj) {
                if(key != 'prototype' && key != 'length' && key != 'name' && (!obj.hasOwnProperty || obj.hasOwnProperty(key))){
                    if(iterator.call(context, obj[key], key) === false && exitOnFalse) return false;
                }
            }
        }else if(isArrayLike(obj)){
            for(key = 0; key < obj.length; key++){
                if(isDefined(obj[key])){
                    if(iterator.call(context, obj[key], key) === false && exitOnFalse) return false;
                }
            }
        }else if(typ == 'object'){
            for(key in obj){
                if(obj.hasOwnProperty(key)){
                    if(iterator.call(context, obj[key], key) === false && exitOnFalse) return false;
                }
            }
        }
    }
    return exitOnFalse || obj;
}
var isDefined = $$.isDefined = function(value){return typeof value !== 'undefined';}
var isObject = $$.isObject = function(value){return value != null && toString.call(value) === '[object Object]' && !isDefined(value.nodeType);}
var isNumber = $$.isNumber = function(value){return typeof value === 'number' && !isNaN(value);}
var isFunction = $$.isFunction = function(val){return toString.call(val) === '[object Function]'};
var isArray = $$.isArray = function(val){return toString.call(val) === '[object Array]'};
var isString = $$.isString = function(val){return toString.call(val) === '[object String]'};
forEach('RegExp Boolean'.split(/ /), function(name){
    $$['is'+name] = function(val){
        return toString.call(val) === '[object '+name+']'
    };
});
var extend = $$.extend = function() {
    var args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    var deep = false;
    if(typeof args[0] == 'boolean') deep = args.shift();
    var obj, dst = args.shift();
    if(dst && typeof dst == 'object') while(args.length){
        obj = args.shift();
        if(obj && obj !== dst){
            if(isFunction(obj.then) && isFunction(obj["catch"])){ //Promise
                return obj.then(function(res){
                    args.unshift(isFunction(obj.success) ? res.data : res);
                    args.unshift(dst);
                    args.unshift(deep);
                    return extend.apply(this, args);
                });
            }
            forEach(obj, function(value, key){
                if(deep && isObject(value) && !value._isStream){
                    extend(deep, (dst.hasOwnProperty(key) ? dst[key] : (dst[key] = {})), value);
                }else{
                    dst[key] = deep && isArray(value) ? slice.call(value, 0) : value;
                }
            });
        }
    };
    return dst;
}
var lowercase = function(string){return isString(string) ? string.toLowerCase() : string;}
var uppercase = function(string){return isString(string) ? string.toUpperCase() : string;}
function encodeUriQuery(val) {
    return encodeURIComponent(val).
        replace(/%3A/gi, ':').
        replace(/%24/g, '$').
        replace(/%2C/gi, ',');
}
function isArrayLike(obj) {
    if(obj == null) return false;
    var length = obj.length;
    if(obj.nodeType === 1 && length) return true;
    return isString(obj) || isArray(obj) || length === 0 ||
        typeof length === 'number' && length > 0 && (length - 1) in obj;
}
//消息处理
var _msgCenter = {};
$$.on = function(ev, callback, useCache) {
    var that = this, binds = isObject(ev) ? ev : {},
        msgCenter = that.hasOwnProperty('$msg') ? that.$msg : _msgCenter;
    if(isString(ev)){
        forEach(ev.split(/\s+/), function(name){binds[name] = callback;})
    }
    forEach(binds, function(callback, name){
        if(!msgCenter[name]) msgCenter[name] = [];
        msgCenter[name].push(callback);
        if(useCache && msgCenter[name].cache){
            callback.apply(that, msgCenter[name].cache);
        }
    });
    return that;
};
$$.once = function(ev, callback, useCache) {
    if(isObject(ev)){
        forEach(ev, function(fn){if(isFunction(fn)) fn.once = true});
    }else if(isFunction(callback)){
        callback.once = true;
    }
    return $$.on.call(this, ev, callback, useCache);
};
$$.off = function(ev, callback) {
    var that = this;
    if(isObject(ev)){
        forEach(ev, function(name, callback){
            $$.off.call(that, name, callback)
        });
        return this;
    }
    var msgCenter = this.hasOwnProperty('$msg') ? this.$msg : _msgCenter;
    if(msgCenter && isString(ev)){
        forEach(ev.split(/\s+/), function(name){
            var list = msgCenter[name];
            if(!list) return;
            if(!callback){
                delete msgCenter[name];
                return;
            }
            for(var i = 0, len = list.length; i < len; i ++){
                if(list[i] == callback){
                    list.splice(i, 1);
                    break;
                }
            }
        });
    }
    return this;
};
$$.emit = function() {
    var args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    var ev = args.shift();
    if(!isString(ev)) return;
    var that = this, callback;
    var msgCenter = that.hasOwnProperty('$msg') ? that.$msg : _msgCenter;
    if(msgCenter) forEach(ev.split(/\s+/), function(name){
        var list = msgCenter[name] || (msgCenter[name] = []);
        list.cache = args;
        for(var i = 0; i < list.length; i++) {
            callback = list[i];
            if(callback.once) list.splice(i--, 1);
            if(callback.apply(that, args) === false) break;
        }
    });
};
var any = $$.any = function(arr, f){
    return !forEach(arr, function(item, i){
        return !f(item, i);
    }, true);
}
var all = $$.all = function(arr, f){
    return forEach(arr, function(item, i){
        return f(item, i);
    }, true);
}
var filter = $$.filter = function(arr, fn, context){
    if(!arr) return arr;
    var _isarr = isArrayLike(arr), result = _isarr ? [] : {};
    forEach(arr, function(item, i){
        var key;
        if(isFunction(fn)){
            if(!fn.call(context, item, i, result)) return;
        }else if(fn){
            var match = false;
            if(isString(item)) match = isMatch(item, fn);
            else if(isObject(item)){
                match = isObject(fn) ? $$.all(fn, function(val, key){
                    var _val = item[key];
                    return val === _val;
                }) : any(item, function(val){
                    return isMatch(val, fn);
                });
            }
            if(!match) return;
        }
        _isarr ? result.push(item) : (result[i] = item);
    });
    return result;
}
function isMatch(item, tester, strict){
    if($$.isRegExp(tester)){
        return tester.test(item);
    }else{
        return strict ? item === tester : item.indexOf && item.indexOf(tester) > -1
    }
}
var isStrict, fnCache = {};
var safeRegExp = /(^|\s|[\(,;])([\w\.\[\]]+)\?(?=$|\s*[\),;])/g, safeExpr = function(expr){
    return expr.replace(safeRegExp, "$1(typeof $2=='undefined'?null:$2)");
}
var genFunc = function(expr){
    return new Function('obj', 'with(obj)return ' + expr);
}
var withFunc = $$.expr = function(expr, obj, debug, val){
    try{
        if(!fnCache[expr]) fnCache[expr] = genFunc(safeExpr(expr));
    }catch(e){ throw('invalid expression: ' + safeExpr(expr) + '\n' + e); }
    try{
        val = fnCache[expr](obj||window);
    }catch(e){ if(debug || isStrict) throw(e); }
    return val;
}
var getDefaultVal = function(defaultval, match){
    return defaultval != null ? defaultval : (match.substr(1,1) == '!' ? '' : match);
};
var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
};
$$.throttle = function(func, wait, immediate) {
    if(isNaN(wait) || wait <= 0) return func;
    var context, args, result;
    var timeout = null;
    var previous = 0;
    var later = function() {
        previous = immediate === false ? 0 : (+new Date);
        timeout = null;
        result = func.apply(context, args);
        if(!timeout) context = args = null;
    };
    return function(){
        var now = +new Date;
        if(!previous && immediate === false) previous = now;
        var remaining = wait - (now - previous);
        context = this;
        args = arguments;
        if(remaining <= 0 || remaining > wait){
            if(timeout){
                clearTimeout(timeout);
                timeout = null;
            }
            previous = now;
            result = func.apply(context, args);
            if(!timeout) context = args = null;
        }else if(!timeout){
            timeout = setTimeout(later, remaining);
        }
        return result;
    };
};
$$.debounce = function(func, wait, immediate) {
    if(!wait) return func;
    var timeout, args, context, timestamp, result;
    var later = function() {
        var last = (+new Date) - timestamp;
        if (last < wait && last >= 0) {
            timeout = setTimeout(later, wait - last);
        } else {
            timeout = null;
            if (!immediate) {
                result = func.apply(context, args);
                if (!timeout) context = args = null;
            }
        }
    };

    return function() {
        context = this;
        args = arguments;
        timestamp = +new Date;
        var callNow = immediate && !timeout;
        if (!timeout) timeout = setTimeout(later, wait);
        if (callNow) {
            result = func.apply(context, args);
            context = args = null;
        }
        return result;
    };
};

var escapeMatch = /\\|'|\r|\n|\t|\u2028|\u2029/g,
    escaper = function(match) { return '\\' + escapes[match]; };
var template = $$.template = {
    replace: function(temp, data, regexp, defaultval, filter){
        if(!isDefined(data)) return temp;
        if(!isArray(data)) data = [data];
        var ret = [];
        forEach(data, function(item){
            ret.push(replaceAction(item));
        });
        return ret.join("");
        function replaceAction(object){
            return temp.replace(regexp || (/\{\!?\{([^}]+)\}\}/g), function(match, name){
                if(filter && !filter.test(match)) return match;
                var result = withFunc(name, object, isStrict);
                return result != null ? result : getDefaultVal(defaultval, match);
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

module.exports = $$;
