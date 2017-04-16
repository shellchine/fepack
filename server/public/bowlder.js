/*!
 * bowlder.js v1.0
 *
 * Copyright 2015
 * Released under the MIT license
 *
 * shellchine@163.com
 */

(function(undefined){
    if(typeof bowlder == 'function') return;
    var polyfill = this.bowlder || {};
    if(!Object.create){
        Object.create = function(o) {
            var Func = function() {};
            Func.prototype = o;
            return new Func();
        };
    }
    var $$ = this.bowlder = function(q, context){
        if(!q || !isDefined(q)){
            return new BDom([]);
        }else if(isString(q)){
            return new BDom(/^\s*</.test(q) ? dom.create(q).childNodes : utils.cssQuery(q, context));
        }else if(isArray(q) || isDefined(q.nodeType) || isWindow(q)){
            return new BDom(q);
        }else if(isFunction(q)){
            $$.ready(q);
        }
        return q;
    };
    $$.ver = '1.0';
    $$.cb = { counter: 0 };
    var timeCursor = typeof performance == 'object' ? performance.timing.connectStart : +new Date, timing = {
        connectStart: timeCursor
    };
    //性能监测工具
    var benchDefers = {};
    $$.bench = {
        mark: function(name){
            var now = +new Date;
            if(name){
                if(!benchDefers[name]){
                    benchDefers[name] = $q.defer();
                }
                var result = {
                    duration: now - timing.connectStart,
                    interval: now - timeCursor,
                    stamp: now
                };
                setTimeout(function(){
                    result.lag = (+new Date - now)/100;
                    benchDefers[name].resolve(extend(result, timing), true);
                }, 100);
            }
            timeCursor = now;
            return benchDefers[name];
        },
        get: function(name){
            if(!name){
                return $$.ready().then(function(){
                    return $$.ready($$.rootWidget.find());
                }).then(function(){
                    var promises = map(benchDefers, function(d){ return d.promise });
                    return $q.all(promises);
                });
            }
            if(!benchDefers[name]) benchDefers[name] = $q.defer();
            return benchDefers[name].promise;
        }
    }
    var domId = 0;
    var toString = Object.prototype.toString;
    var hasProp = Object.prototype.hasOwnProperty;
    var slice = [].slice;
    if(!Function.prototype.bind || typeof $$.bind(this) != 'function')
        Function.prototype.bind = function(object){
            var method = this, args = slice.call(arguments, 1);
            return function() {
                return method.apply(object, args.concat(slice.call(arguments)));
            };
        };
    var forEach = $$.each = function(obj, iterator, context, exitOnFalse) {
        var key, typ = typeof obj;
        if(obj){
            if(typeof context == 'boolean'){
                exitOnFalse = context;
                context = undefined;
            }
            if(typ == 'string') obj = utils.incArray(obj);
            if(typ == 'function'){
                for(key in obj) {
                    if(key != 'prototype' && key != 'length' && key != 'name' && hasProp.call(obj, key)){
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
                    if(hasProp.call(obj, key)){
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
    forEach('File RegExp Boolean'.split(/ /), function(name){$$['is'+name] = function(val){return toString.call(val) === '[object '+name+']'};});
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
                        extend(deep, (hasProp.call(dst, key) ? dst[key] : (dst[key] = {})), value);
                    }else{
                        dst[key] = deep && isArray(value) ? slice.call(value, 0) : value;
                    }
                });
            }
        };
        return dst;
    }
    $$.async = function(gen){
        var defer = $q.defer(), fn = gen.apply(null, slice.call(arguments, 1));
        var step = function(val){
            var result = fn.next(val);
            if(result.done){
                defer.resolve(result.value);
            }else{
                var p = result.value;
                if(isFunction(p)){
                    p(step);
                }else{
                    if(!isObject(p) || !isFunction(p.then)) p = $$.Promise.resolve(p);
                    p.then(step);
                }
            }
        }
        step();
        return defer.promise;
    }
    var map = $$.map = function(arr, fn, context){
        if(!arr) return arr;
        var result = isArrayLike(arr) ? [] : {};
        forEach(arr, function(item, i){
            var val = isFunction(fn) ? fn.call(context, item, i, result) : item;
            if(isDefined(val)){
                result[i] = val;
            }
        });
        return result;
    }
    $$.reduce = function(arr, seed, fn, context){
        forEach(arr, function(item, i){
            seed = fn.call(context, seed, item, i);
        });
        return seed;
    }
    var cssNumber = {};
    forEach('fillOpacity fontWeight lineHeight opacity orphans widows zIndex zoom'.split(/ /), function(name){
        cssNumber[name] = true;
    });
    var lowercase = function(string){return isString(string) ? string.toLowerCase() : string;}
    var uppercase = function(string){return isString(string) ? string.toUpperCase() : string;}
    function isWindow(obj) { return obj && obj.document && obj.window == obj; }
    function getStyle(node, key){
        if(isWindow(node)){
            node = node.document.documentElement;
            if(/^(width|height)$/.test(key)){
                return node[camelCase("client-" + key)] || this[camelCase("inner-" + key)];
            }
        }else if(node.nodeType == 9){
            node = node.documentElement;
        }
        if(msie && /^(width|height)$/.test(key)){
            return node[camelCase("offset-" + key)];
        }
        if(msie < 9 && key == 'opacity'){
            var ofilter = getStyle(node, 'filter') || '',
                re = /opacity=(\d+)/;
            return re.test(ofilter) ? RegExp.$1 : 1;
        }
        if(supportedTransforms.test(key)){
            var _key = camelCase(transform),
            inlineTransform = node.style[_key];
            if(inlineTransform && (new RegExp(key+'\\s*\\((.*?)\\)')).test(inlineTransform)){
                return RegExp.$1;
            }
            return getStyle(node, _key);
        }
        if(node.currentStyle) {
            return node.currentStyle[key] || '';
        }else if(window.getComputedStyle) {
            return window.getComputedStyle(node , null)[key];
        }
        return '';
    }
    function setStyle(node, key, val){
        if(!isCssProp(key)){
            key = camelCase(key);
            if(!isCssProp(key)){
                node[key] = val;
                return;
            }
        }
        if(!isDefined(val) || (isNaN(val) && typeof val == 'number')) return;
        if(msie < 9 && key == 'opacity'){
            var ofilter = getStyle(node, 'filter') || '',
            re = /alpha\([^\)]*\)/;
            val = 'alpha(opacity=' + Math.round(100 * parseFloat(isNaN(val)?1:val)) + ')';
            node.style.filter = re.test(ofilter) ? ofilter.replace(re, val) : val;
            return;
        }else if(key == 'transform'){
            key = camelCase(transform);
        }
        if(supportedTransforms.test(key)){
            if(!isNaN(val) && val){
                if(key.indexOf('translate') === 0){
                    val += 'px';
                }else if(key.indexOf('rotate') === 0){
                    val += 'deg';
                }
            }
            node.style[camelCase(transform)] = key + '(' + val + ')';
            return;
        }
        if(val == "show"){
            if(getStyle(node, "display") == "none"){
                dom.show(node);
                val = getStyle(node, key);
                setStyle(node, transitionDuration, "0s");
                setStyle(node, key, 0);
                node.offsetWidth;
                setStyle(node, transitionDuration, "");
            }else{
                return;
            }
        }else if(val == "hide"){
            val = 0;
            node.style[key] = getStyle(node, key); //auto => nn px
            node.offsetWidth;
        }
        if(!isNaN(val) && val && !cssNumber[key]) //isNaN("") == false
            val = val + 'px';
        try{node.style[key] = val;}catch(e){consoleError(e);}
    }
    function handlerWrapper(fn, node){
        //attachEvent回调的context为window，故wrapper需与node关联
        var nodeId = node && node[dom._idname];
        var eventName = 'b$Event' + (nodeId || '');
        return fn[eventName] = (fn[eventName] || function(e){
            var temp = fn.call(node || this, dom._fixe(e));
            if(temp === false || temp === -1){
                e.preventDefault();
            }
            temp === -1 && e.stopPropagation();
            return temp;
        });
    }
    var isBooleanAttr = {};
    forEach('selected checked disabled readOnly readonly required open autofocus controls autoplay compact loop defer multiple'.split(' '), function(item){
        isBooleanAttr[item] = 1;
    });
    var specialAttr = {
        'class': function(node, value){
            ('className' in node) ? node.className = (value || '') : node.setAttribute('class', value);
        },
        'for': function(node, value){
            ('htmlFor' in node) ? node.htmlFor = value : node.setAttribute('for', value);
        },
        'style': function(node, value){
            (node.style) ? node.style.cssText = value : node.setAttribute('style', value);
        },
        'value': function(node, value){
            node.value = (value != null) ? value : '';
        }
    }
    var ua = lowercase(navigator.userAgent), msie = parseInt((/msie (\d+)/.exec(ua) || [])[1], 10);
    if (isNaN(msie)) { //IE 11+
        msie = parseInt((/trident\/.*; rv:(\d+)/.exec(ua) || [])[1], 10);
    }
    var rAF = window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame    ||
        window.oRequestAnimationFrame      ||
        window.msRequestAnimationFrame     ||
        function(callback) { window.setTimeout(callback, 30); }
    var utils = $$.utils = {
        msie: msie,
        rAF: rAF,
        camelCase: camelCase,
        cssQuery: polyfill.cssQuery || function(q, context){
            context = context || document;
            if(!isDefined(context.nodeType) && context[0]){
                context = context[0];
            }
            if(!isFunction(context.querySelectorAll) || !isString(q)){
                return [];
            }
            var inNode = context != document, _id;
            if(inNode){
                q = q.replace(/(^\s*|,\s*)/g, '$1#__bowlder__ ');
                _id = context.id;
                context.id = '__bowlder__';
            }else q = q.replace(/(^\s*|,\s*)>/g, '$1body>');
            var result = slice.call(context.querySelectorAll(q));
            if(inNode){
                if(_id){
                    context.id = _id;
                }else{
                    context.removeAttribute('id');
                }
            }
            return result;
        },
        incArray: function(start, end, inc){
            var result = [], tmp = "push";
            if(isString(start)){
                var arr = start.split('..'), len = arr.length;
                start = parseInt(arr[0], 10);
                end = parseInt(arr[len-1], 10);
                inc = Math.abs(len == 3 ? parseInt(arr[1], 10) : 1);
            }
            if(isNaN(inc) || !inc) inc = 1;
            if(isNaN(start) || isNaN(end)) return result;
            if(start > end){
                tmp = start;
                start = end;
                end = tmp;
                tmp = "unshift";
            }
            for(var i = start; i <= end; i += inc){
                result[tmp](i);
            }
            return result;
        }
    };
    var EVENTSPLITER = /[;\s]+/;
    var _bindEvents = {};  //已绑定事件: {nodeId : {name : [func ..]}}
    var _delgEvents = {};  //已代理事件: {nodeId : {name : [func ..]}}
    var _events = {};  //自定义事件: {name : func}
    var _eventsoff = {}; //事件卸载实例: {nodeId : {name : func}}
    var _delegateMethod = function(e, callbackMap){
        var target = e.target;
        var node = this;
        var temp, domMap = {};
        var delgIterator = function(fns, query){
            if(!domMap[query]) domMap[query] = utils.cssQuery(query, node);
            if(domMap[query].indexOf(target) > -1){
                forEach(fns, function(fn){
                    e.currentTarget = target;
                    if(temp !== false) temp = fn.call(target, e);
                });
            }
        };
        while(target && target != node){
            forEach(callbackMap, delgIterator);
            if(temp === false || temp === -1){
                e.preventDefault();
                temp === -1 && e.stopPropagation();
                break;
            }
            target = target.parentNode;
        }
    }
    var parentTag = {
        tfoot: 'table',
        thead: 'table',
        tbody: 'table',
        tr: 'tbody',
        th: 'tr',
        td: 'tr',
        option: 'select'
    };
    var dom = $$.dom = {
        _fixe: function(e){
            var params = ['clientX', 'clientY', 'pageX', 'pageY'];
            if (e.touches){
                switch (e.type) {
                case 'touchstart':
                    forEach(params, function(name){e[name] = e.touches[0][name]});
                    break;
                case 'touchend':
                case 'touchmove':
                    forEach(params, function(name){e[name] = e.changedTouches[0][name]});
                    break;
                }
            }
            return e;
        },
        _on: function(node, eventName, handler, capture){
            node.addEventListener(eventName, handler, capture || false);
        },
        _off: function(node, eventName, handler, capture){
            node.removeEventListener(eventName, handler, capture || false);
        },
        _idname: '_b$id',
        _nodeId: function(node){
            return node[dom._idname] || (node[dom._idname] = ++domId)
        },
        addClass: function(node, name){
            classList.add(node, name);
        },
        toggleClass: function(node, name){
            classList.toggle(node, name);
        },
        removeClass: function(node, name){
            classList.remove(node, name);
        },
        hasClass: function(node, name){
            return classList.contains(node, name);
        },
        hasRole: function(node, role){
            if(!node || !node.getAttribute || !role) return false;
            var roles = (node.getAttribute("bd-role") || '').split(/\s+/);
            return roles.indexOf(role) > -1;
        },
        parent: function(node, q, ancestor, allowSelf){
            var parent;
            if(q){
                var list = utils.cssQuery(q);
                node = allowSelf ? node : node.parentNode;
                while(node && node.nodeType == 1){
                    if(~list.indexOf(node)){
                        parent = node;
                        break;
                    }
                    if(!ancestor) break;
                    node = node.parentNode;
                }
            }else{
                parent = node.parentNode;
            }
            return parent;
        },
        on: function(node, eventNames, query, handler){
            if(isObject(query)){
                forEach(query, function(_handler, _query){
                    dom.on(node, eventNames, _query, _handler);
                });
            }else if(isFunction(query)){
                dom.bind(node, eventNames, query);
            }else if(isString(query)){
                var nodeId = dom._nodeId(node);
                var delgCache = _delgEvents[nodeId] ||
                    (_delgEvents[nodeId] = {});
                forEach(eventNames.split(EVENTSPLITER), function(eventName){
                    if(!eventName) return;
                    var delgFns = delgCache[eventName];
                    if(!delgFns){
                        delgFns = delgCache[eventName] = {};
                        var method = handlerWrapper(function(e){
                            _delegateMethod.call(node, e, delgFns);
                        }, msie < 9 ? node : '');
                        dom._on(node, eventName, method);
                    }
                    if(!delgFns[query]){
                        delgFns[query] = [];
                    }else{
                        if(delgFns[query].indexOf(handler) > -1) return;
                    }
                    delgFns[query].push(handler);
                });
            }else if(isFunction(handler)){
                dom.bind(node, eventNames, handler);
            }
        },
        off: function(node, eventNames, query, handler){
            if(isObject(query)){
                forEach(query, function(_handler, _query){
                    dom.off(node, eventNames, _query, _handler);
                });
            }else if(isString(query)){
                var nodeId = dom._nodeId(node);
                var delgCache = _delgEvents[nodeId] || (_delgEvents[nodeId] = {});
                forEach(eventNames.split(EVENTSPLITER), function(eventName){
                    if(!eventName) return;
                    var delgFns = delgCache[eventName];
                    if(delgFns[query]){ //不解绑定，只是清理回调列表
                        delgFns[query] = filter(delgFns[query], function(h){
                            return h != handler;
                        });
                        if(delgFns[query].length === 0) delete delgFns[query];
                    }
                });
            }else if(isFunction(query)){
                dom.unbind(node, eventNames, query);
            }else if(isFunction(handler)){
                dom.unbind(node, eventNames, handler);
            }
        },
        bind: function(node, eventNames, handler, capture){
            if(!isFunction(handler)) return;
            var nodeId = dom._nodeId(node);
            var eventCache = _bindEvents[nodeId] || (_bindEvents[nodeId] = {});
            handler = handlerWrapper(handler, msie < 9 ? node : '');
            forEach(eventNames.split(EVENTSPLITER), function(eventName){
                eventName = isString(eventName) && eventName.split('.')[0];
                if(!eventName) return;
                if(!eventCache[eventName]){
                    eventCache[eventName] = [];
                }else{
                    if(eventCache[eventName].indexOf(handler) > -1) return;
                }
                eventCache[eventName].push(handler);
                dom._on(node, eventName, handler, capture); //绑定事件
                if(_events[eventName]){ //自定义事件所需的额外绑定
                    var eventsoff = _eventsoff[nodeId] || (_eventsoff[nodeId] = {});
                    if(!eventsoff[eventName])
                        eventsoff[eventName] = _events[eventName].call(node, function(info, fireTarget){
                            dom.trigger(fireTarget||node, eventName, !!fireTarget, info);
                        }) || true;
                }
            });
        },
        unbind: function(node, eventNames, handler, capture){
            var nodeId = node[dom._idname];
            if(nodeId && isString(eventNames)){
                var eventCache = _bindEvents[nodeId];
                if(eventCache){
                    if(!handler){ //取消所有绑定
                        forEach(eventNames.split(EVENTSPLITER), function(eventName){
                            eventName = isString(eventName) && eventName.split('.')[0];
                            if(!eventName) return;
                            forEach(eventCache[eventName], function(fn){
                                dom._off(node, eventName, fn, capture);
                            });
                            delete eventCache[eventName];
                        });
                    }else{
                        handler = handlerWrapper(handler, msie < 9 ? node : '');
                        forEach(eventNames.split(EVENTSPLITER), function(eventName){
                            eventName = isString(eventName) && eventName.split('.')[0];
                            if(!eventName) return;
                            dom._off(node, eventName, handler, capture);
                            eventCache[eventName] = filter(eventCache[eventName], function(h){
                                return h != handler;
                            });
                        });
                    }
                }
            }
        },
        before: function(newNode, oldNode){
            if(isString(newNode)) newNode = dom.create(newNode);
            if(oldNode && oldNode.parentNode) oldNode.parentNode.insertBefore(newNode, oldNode);
            return newNode;
        },
        after: function(newNode, oldNode){
            if(isString(newNode)) newNode = dom.create(newNode);
            if(oldNode && oldNode.parentNode){
                var parent = oldNode.parentNode, next = oldNode.nextSibling;
                next ? parent.insertBefore(newNode, next) : parent.appendChild(newNode);
            }
            return newNode;
        },
        replace: function(newNode, oldNode){
            if(isString(newNode)) newNode = dom.create(newNode);
            if(oldNode && oldNode.parentNode)
                oldNode.parentNode.replaceChild(newNode, oldNode);
            return newNode;
        },
        trigger: function(node, eventName, canbubble, info){
            var ev = document.createEvent("MouseEvents");
            ev.initEvent(eventName, isDefined(canbubble) ? !!canbubble : true, false);//事件类型,是否冒泡,是否可以取消事件
            if(isObject(info)) extend(ev, info);
            node.dispatchEvent(ev);
        },
        show: function(node){
            node.style.display = dom.data(node, "olddisplay") || "";
            if(getStyle(node, "display") == "none") node.style.display = "block";
        },
        hide: function(node){
            var _display = dom.data(node, "olddisplay") || getStyle(node, "display");
            dom.data(node, "olddisplay", (_display == "none" || _display == "block") ? "" : _display);
            node.style.display = "none";
        },
        toggle: function(node){
            dom[dom.css(node, "display") == "none" ? "show" : "hide"](node);
        },
        css: function(node, obj, val){
            if(isString(obj)){
                var key = camelCase(obj);
                if(obj.indexOf(":") > -1){
                    node.style.cssText += ";" + obj;
                }else if(isDefined(val)){
                    setStyle(node, key, val);
                }else{
                    if(isCssProp(key)){
                        val = getStyle(node, key);
                    }else{
                        if(/scroll/.test(obj) && (isWindow(node) || node.nodeType == 9)){
                            return document.body[obj] || document.documentElement[obj];
                        }else if(node.nodeType == 9){
                            node = node.documentElement;
                        }
                        val = node[key];
                    }
                    return isDefined(val) ? val : '';
                }
            }else if(isObject(obj)){
                var transforms = {}, doTransform;
                forEach(obj, function(val, key){
                    if(supportedTransforms.test(key)){
                        if(!isNaN(val) && val){
                            if(key.indexOf('translate') === 0||key.indexOf('persipective') === 0) val += 'px';
                            else if(key.indexOf('rotate') === 0) val += 'deg';
                        }
                        doTransform = true;
                        transforms[key] = key + '(' + val + ')';
                        return;
                    }
                    key = camelCase(key);
                    if(isCssProp(key)){
                        setStyle(node, key, val);
                    }else{
                        node[key] = val;
                    }
                });
                if(doTransform){
                    var oldTransform = node.style[camelCase(transform)], result;
                    if(oldTransform){
                        var propReg = /(\S+)\s*(\(.*?\))/g;
                        while((result = propReg.exec(oldTransform)) != null) {
                            var name = result[1];
                            if(!isDefined(transforms[name])){
                                transforms[name] = name + result[2];
                            }
                        }
                    }
                    var arr = [];
                    forEach(transforms, function(val){arr.push(val)});
                    node.style[camelCase(transform)] = arr.join(" ");
                }
            }
        },
        val: function(node, val){
            if(lowercase(node.tagName) == 'input'){
                var type = lowercase(node.getAttribute('type'));
                if(type == 'checkbox'){
                    return dom.attr(node, 'checked', val);
                }else if(type == 'radio'){
                    return isDefined(val) ? (node.value = val) : node.value;
                }
            }
            var nodeWidget = $$.widget(node);
            if(nodeWidget) return nodeWidget.val(val);
            
            if(isDefined(val)){
                node.value = val;
            }else{
                return node.value;
            }
        },
        stop: function(node){
            node.startTime = 0;
        },
        pause: function(node){
            var pause = dom.data(node, "_b$pause");
            if(pause){
                dom.data(node, "_b$pause", null);
                pause();
            }
        },
        animate: function(node, properties, duration, ease, callback, delay){
            if(!node || !properties) return;
            if(isFunction(properties)){
                return properties(node).play(duration, ease).then(callback);
            }
            if(isFunction(duration)) callback = duration, ease = undefined, duration = undefined;
            if(isFunction(ease)) callback = ease, ease = undefined;
            duration = (typeof duration == 'number' ? duration :
                        (fx.speeds[duration] || fx.speeds.normal));
            if(delay) delay = parseFloat(delay) / 1000;
            
            var easeFns = $$.conf('easeFns'), easeFn = easeFns[ease] || easeFns['linear'];
            if(duration > 1) dom.pause(node); //暂停之前的动画
            var paused, cbTimeout, cssValues = {}, _cssValues = {},
            transforms, _startTime = new Date;
            var fired = false, doRAF = false, doCSS3 = false;
            if(duration === undefined) duration = fx.speeds.normal;
            if(delay === undefined) delay = 0;
            if(typeof properties == 'string'){ //css3 keyframe动画
                doCSS3 = true;
                cssValues[animationName] = properties;
                cssValues[animationDuration] = duration/1000 + 's';
                cssValues[animationDelay] = delay + 's';
                cssValues[animationTiming] = (ease || 'linear');
            }else{  //css3 transition动画
                var cssProperties = [];
                forEach(properties, function(toVal, key){
                    if(fx.off || duration <= 1 || !isCssProp(camelCase(key)) || isArray(toVal)){
                        doRAF = true;
                        _cssValues[key] = isArray(toVal) || duration <= 1 ? toVal : [dom.css(node, key), toVal];
                    }else{
                        doCSS3 = true;
                        cssValues[key] = toVal;
                        if(supportedTransforms.test(key)){
                            transforms = true;
                        }else{
                            cssProperties.push(dasherize(key));
                        }
                    }
                })
                if(doCSS3){
                    transforms && cssProperties.push(transform);
                    cssValues[transitionProperty] = cssProperties.join(', ');
                    cssValues[transitionDuration] = duration/1000 + 's';
                    cssValues[transitionDelay] = delay + 's';
                    cssValues[transitionTiming] = (ease || 'linear');
                }
            }
            var _step = function(progress){
                dom.css(node, map(_cssValues, function(_val){
                    return interpolate(_val, easeFn(progress))
                }));
            }
            var wrappedCallback = function(){
                if(fired) return;
                fired = true;
                if(!fx.off) dom.css(node, cssReset);
                if(callback) callback.call(node);
                dom.data(node, "_b$pause", null);
            }
            if(duration >= 0 && duration <= 1){ //step only
                _step(duration);
                return;
            }

            if(doRAF){  //rAF动画
                var step = function(){
                    var _passTime = (new Date) - _startTime;
                    var progress = _passTime / duration;
                    if(_passTime < duration){
                        _step(progress);
                        if(!paused) rAF(step);
                    }else{ //动画结束
                        _step(1);
                        wrappedCallback();
                    }
                };
                step();
            }else{
                cbTimeout = setTimeout(function(){
                    wrappedCallback();
                }, duration + 10);
            }

            if(doCSS3){ //css3动画
                node.clientLeft; //强制页面重绘
                dom.css(node, cssValues);
            }
            dom.data(node, "_b$pause", function(){
                paused = true;
                if(!fx.off){
                    var _passTime = (new Date) - _startTime;
                    var progress = Math.min(_passTime / duration, 1);
                    dom.css(node, cssReset);
                    dom.animate(node, properties, progress);
                }
                cbTimeout && clearTimeout(cbTimeout);
            })
        },
        fadeIn: function(node, duration, easing, callback){
            if(dom.data(node, "_b$fadeIn")) return;
            dom.data(node, "_b$fadeIn", 1);
            var _opacity = getStyle(node, "opacity");
            if(isFunction(duration)) callback = duration, duration = null;
            if(isFunction(easing)) callback = easing, easing = null;
            dom.animate(node, {opacity:'show'}, duration, easing, function(){
                dom.data(node, "_b$fadeIn", 0);
                setStyle(node, "opacity", _opacity);
                isFunction(callback) && callback();
            });
        },
        fadeOut: function(node, duration, easing, callback){
            if(dom.data(node, "_b$fadeOut")) return;
            dom.data(node, "_b$fadeOut", 1);
            var _opacity = getStyle(node, "opacity");
            if(isFunction(duration)) callback = duration, duration = null;
            if(isFunction(easing)) callback = easing, easing = null;
            dom.animate(node, {opacity:'hide'}, duration, easing, function(){
                dom.data(node, "_b$fadeOut", 0);
                setStyle(node, "opacity", _opacity);
                dom.hide(node);
                isFunction(callback) && callback();
            });
        },
        slideUp: function(node, duration, easing, callback){
            if(dom.data(node, "_b$fadeUp")) return;
            dom.data(node, "_b$fadeUp", 1);
            var reset = {
                height: node.style.height,
                paddingTop: node.style.paddingTop,
                paddingBottom: node.style.paddingBottom
            },
            props = {
                overflow: ['hidden', node.style.overflow],
                height: 'hide',
                paddingTop: 0,
                paddingBottom: 0
            };
            if(isFunction(duration)) callback = duration, duration = null;
            if(isFunction(easing)) callback = easing, easing = null;
            dom.animate(node, props, duration, easing, function(){
                dom.data(node, "_b$fadeUp", 0);
                dom.hide(node);
                dom.css(node, reset);
                isFunction(callback) && callback();
            });
        },
        slideDown: function(node, duration, easing, callback){
            if(dom.data(node, "_b$fadeDown")) return;
            dom.data(node, "_b$fadeDown", 1);
            var reset = {
                overflow: node.style.overflow,
                height: node.style.height,
                paddingTop: node.style.paddingTop,
                paddingBottom: node.style.paddingBottom
            };
            var props = {
                height: 'show',
                paddingTop: getStyle(node, 'paddingTop'),
                paddingBottom: getStyle(node, 'paddingBottom')
            };
            if(isFunction(duration)) callback = duration, duration = null;
            if(isFunction(easing)) callback = easing, easing = null;
            dom.css(node, {overflow: 'hidden', paddingTop: 0, paddingBottom: 0});
            dom.animate(node, props, duration, easing, function(){
                dom.data(node, "_b$fadeDown", 0);
                dom.css(node, reset);
                isFunction(callback) && callback();
            });
        },
        data: function(node, name, val){
            if(node && name === false){ //destroy
                if(node[dom._idname]) delete domData[node[dom._idname]];
                return;
            }
            if(!isDefined(name)){
                return node && domData(node);
            }
            if(!isDefined(val) && isString(name)){
                return node && domData(node)[name];
            }else if(node){
                return isObject(name) ? extend(domData(node), name) : (domData(node)[name] = val);
            }
        },
        attr: function(node, name, val){
            if(!node || !node.nodeType) return null;
            name = lowercase(name);
            if(isBooleanAttr[name]) {
                if(isDefined(val)){
                    if(val === 'false') val = false;
                    node[name] = !!val;
                    if(!!val){
                        node.setAttribute(name, name);
                    }else{
                        node.removeAttribute(name);
                    }
                }else{ //|| (node.attributes.getNamedItem(name)|| false).specified
                    return node[name] ? true : false;
                }
            }else if(isDefined(val)){ //设值
                if(specialAttr[name]){
                    specialAttr[name](node, val);
                }else{
                    node.setAttribute(name, val);
                }
            }else{ //取值
                if(isObject(name)){
                    forEach(name, function(v, n){
                        dom.attr(node, n, v);
                    });
                }else{
                    return node.getAttribute(name, 2);
                }
            }
        },
        _create: function(tag, str){
            var tmpEl = document.createElement(tag);
            tmpEl.innerHTML = str;
            return tmpEl;
        },
        create: function(str, strict){
            if(!strict && /^\w+$/.test(str)){
                return document.createElement(str);
            }else{
                var tmpEl;
                if(/<(\w+)/.test(str)){
                    tmpEl = dom._create(parentTag[lowercase(RegExp.$1)]||'div', str);
                }else{
                    tmpEl = testEl;
                    tmpEl.innerHTML = str;
                }
                var fragment = document.createDocumentFragment(), childNode = tmpEl.firstChild;
                while(childNode){
                    fragment.appendChild(childNode);
                    childNode = tmpEl.firstChild;
                }
                return fragment;
            }
        },
        remove: function(node){
            if(node.parentNode){
                node.parentNode.removeChild(node);
            }
        },
        offset: function(node, noRecurse){
            var pos = {left:0,top:0}, body = document.body;
            if(node && !node.nodeType){
                node = node[0];
            }
            if(!node || node.nodeType !== 1){
                return pos;
            }
            pos.left = node.offsetLeft;
            pos.top = node.offsetTop;
            if(noRecurse !== true) while( node ){
                if(dom.css(node, 'position') == 'fixed'){
                    var parent = node.offsetParent || body;
                    pos.left += parent != body ? parent.scrollLeft : (parent.scrollLeft || document.documentElement.scrollLeft);
                    pos.top += parent != body ? parent.scrollTop : (parent.scrollTop || document.documentElement.scrollTop);
                }
                node = node.offsetParent;
                if(!node || node == noRecurse) break;
                pos.left += node.offsetLeft;
                pos.top += node.offsetTop;
            }
            return pos;
        }
    }
    dom.pos = dom.offset;
    if(polyfill.dom) extend(dom, polyfill.dom);
    if(msie <= 9){
        var safeWraps = {
            'tr' : ['<table><tbody><tr>', '</tr></tbody></table>', 3],
            'tbody' : ['<table><tbody>', '</tbody></table>', 2],
            'thead' : ['<table><thead>', '</thead></table>', 2],
            'table' : ['<table>', '</table>', 1],
            'select' : ['<select>', '</select>', 1]
        }
        dom._create = function(tag, str){
            var wrapFix = safeWraps[tag];
            var tmpEl = document.createElement(wrapFix ? "div" : tag);
            tmpEl.innerHTML = (wrapFix ? wrapFix[0] : '')+str+(wrapFix ? wrapFix[1] : '');
            if(wrapFix){
                for(var i = 0; i < wrapFix[2]; i ++){
                    tmpEl = tmpEl.firstChild;
                }
            }
            return tmpEl;
        }
    }
    var EXPIRESWITHUNIT = /(.*?)([smhd])$/,
    TIMEUNITS = {s: 1, m: 60, h: 3600, d: 86400};
    $$.cookie = {
        get: function(key){
            var c = document.cookie.split(/;\s*/);
            for(var i = 0; i < c.length; i++){
                var p = c[i].split("=");
                if(key == p[0]) try {
                    return decodeURIComponent(p[1]);
                } catch (e) {
                    return "";
                }
            }
            return "";
        },
        remove: function(key, domain, path) {
            document.cookie = key + "=1; path=" + (path || "/") + (domain?"; domain="+domain:"")+";expires=Fri, 02-Jan-1970 00:00:00 GMT";
        },
        set: function(key, val, expires, domain, path, secure, unit){
            if(isString(expires) && EXPIRESWITHUNIT.test(expires)){
                expires = RegExp.$1;
                unit = RegExp.$2;
            }
            expires = (parseFloat(expires) || 365) * 1000 * (TIMEUNITS[unit] || TIMEUNITS.d);
            document.cookie =
                key + '=' + encodeURIComponent(val) +
                (expires ? '; expires=' + (new Date(+new Date+expires)).toGMTString() : '') + 
                (domain ? '; domain=' + domain : '') +
                '; path=' + (path || '/') +
                (secure ? '; secure' : '');
        }
    };
    $$.event = function(name, handle/*, remove*/){
        if(!handle) return !!_events[name];
        _events[name] = handle;
    }
    $$.param = function(params) {
        var parts = [];
        forEach(params, function(value, key) {
            if(value == null) return;
            if(!isArray(value)) value = [value];

            forEach(value, function(v) {
                if(isObject(v)) v = JSON.stringify(v);
                parts.push(encodeUriQuery(key) + '=' + encodeUriQuery(v));
            });
        });
        return parts.join('&');
    }
    var buildUrl = utils.buildUrl = function(url, params) {
        params = $$.param(params);
        return url + (params ? ((url.indexOf('?') == -1) ? '?' : '&') + params : '');
    }
    var testEl = document.createElement('div');
    var classList = $$.classList = testEl.classList ? {
        contains: function(elem, name){
            return elem.classList && elem.classList.contains(name) ? true : false;
        },
        add: function(elem, names){
            if(elem.classList && names) forEach(names.toString().split(/\s+/), function(name){
                name && elem.classList.add(name);
            });
        },
        remove: function(elem, names){
            if(elem.classList && names) forEach(names.toString().split(/\s+/), function(name){
                name && elem.classList.remove(name);
            });
        }
    } : {
        check: function(elem, name){
            if(elem.nodeType !== 1 || typeof elem.className !== "string" || typeof name == 'object' || name == null) {
                return false;
            }
            return true;
        },
        contains: function(elem, name){
            return this.check(elem, name) && (new RegExp("\\b" + name + "\\b")).test(elem.className);
        },
        add: function(elem, name){
            if(this.check(elem, name) && !this.contains(elem, name)){
                elem.className = elem.className.replace(/\s*$/, " " + name);
            }
        },
        remove: function(elem, name){
            if(this.check(elem, name) && this.contains(elem, name)){
                elem.className = elem.className.replace(new RegExp("\\b" + name + "\\b\\s*", "g"), "");
            }
        }
    };
    classList.batch = function(elem, addNames, removeNames){
        if(elem.nodeType == 1){
            if(isString(addNames)) addNames = addNames.split(/\s+/);
            removeNames = isString(removeNames) ? removeNames.split(/\s+/) : [];
            var clses = $$.reduce(elem.className.split(/\s+/), [], function(arr, name){
                if(name && removeNames.indexOf(name) == -1){
                    arr.push(name);
                }
                return arr;
            });
            forEach(addNames, function(name){
                if(name && clses.indexOf(name) == -1){
                    clses.push(name);
                }
            });
            elem.className = clses.join(" ");
        }
    };
    classList.toggle = function(elem, name){
        this[this.contains(elem, name) ? "remove" : "add"](elem, name);
    };
    function encodeUriQuery(val) {
        return encodeURIComponent(val).
            replace(/%3A/gi, ':').
            replace(/%24/g, '$').
            replace(/%2C/gi, ',');
    }
    function parseHeaders(headers) {
        var parsed = {}, key, val, i;
        if(!headers) return parsed;

        forEach(headers.split('\n'), function(line) {
            i = line.indexOf(':');
            key = lowercase(line.substr(0, i).trim());
            val = line.substr(i + 1).trim();
            if(key){
                if(parsed[key]){
                    parsed[key] += ', ' + val;
                }else{
                    parsed[key] = val;
                }
            }
        });

        return parsed;
    }
    function headersGetter(headers) {
        var headersObj = isObject(headers) ? headers : undefined;
        return function(name) {
            if(!headersObj){
                headersObj = parseHeaders(headers);
            }
            if(name){
                return headersObj[lowercase(name)] || null;
            }
            return headersObj;
        };
    }
    function isArrayLike(obj) {
        if(obj == null || isWindow(obj)) return false;
        var length = obj.length;
        if(obj.nodeType === 1 && length) return true;
        return isString(obj) || isArray(obj) || length === 0 ||
            typeof length === 'number' && length > 0 && (length - 1) in obj;
    }
    function consoleError(arg) {
        if(typeof console == 'undefined' || !isDefined(console.error)) return;
        if(!/firefox/i.test(ua) && arg instanceof Error) {
            if(arg.stack){
                var stack = arg.stack;
                arg = (arg.message && stack.indexOf(arg.message) === -1) ?
                    'Error: ' + arg.message + '\n' + stack
                    : stack;
            }else if(arg.sourceURL) {
                arg = arg.message + '\n' + arg.sourceURL + ':' + arg.line;
            }
        }
        console.error(arg);
    }
    function dasherize(str) {
        return lowercase(str.replace(/^ms([A-Z])/,"-ms-$1").replace(/(^|[a-z])([A-Z])/g, '$1-$2'))
    }
    function camelCase(str) {//IE 前缀ms
        return str.replace(/-([a-z])/g, function(match, letter){return uppercase(letter)}).replace(/^Ms([A-Z])/,"ms$1");
    }

    //样式动画
    var prefix, transform,
    supportedTransforms = /^((translate|rotate|scale)(X|Y|Z|3d)?|matrix(3d)?|perspective|skew(X|Y)?)$/i,
    transitionProperty, transitionDuration, transitionTiming, transitionDelay,
    animationName, animationDuration, animationTiming, animationDelay,
    cssReset = {};
    var fx = (function(vendors){
        forEach(vendors, function(vendor){
            if(!isDefined(prefix) && isDefined(testEl.style[camelCase(vendor + 'transition-property')])){
                prefix = vendor;
                utils.supportCSS3 = true;
            }
        });
        transform = prefix + 'transform';
        cssReset[transitionProperty = prefix + 'transition-property'] =
            cssReset[transitionDuration = prefix + 'transition-duration'] =
            cssReset[transitionDelay = prefix + 'transition-delay'] =
            cssReset[transitionTiming = prefix + 'transition-timing-function'] =
            cssReset[animationName = prefix + 'animation-name'] =
            cssReset[animationDuration = prefix + 'animation-duration'] =
            cssReset[animationDelay = prefix + 'animation-delay'] =
            cssReset[animationTiming = prefix + 'animation-timing-function'] = '';
        return {
            off: !utils.supportCSS3,
            speeds: { normal: 300, fast: 200, slow: 600 },
            cssPrefix: prefix
        };
    })(['', '-webkit-', '-o-', '-ms-']);
    function isCssProp(name) {
        return name == 'opacity' || supportedTransforms.test(name) || isDefined(testEl.style[name]);
    }
    var interpolate = utils.interpolate = function(ranges, progress){
        if(!isArray(ranges)){
            return ranges;
        }
        var len = ranges.length;
        if(progress === 0 || progress == 1){
            return ranges[progress*(len-1)];
        }
        var fromIdx = Math.floor(progress*(len-1)),
        toIdx = Math.min(fromIdx+1, len-1);
        var fromVal = ranges[fromIdx], toVal = ranges[toIdx];
        if(!/\d/.test(toVal.toString())){
            return fromVal;
        }
        progress = progress*(len-1) - fromIdx;
        var arr = fromVal.toString().match(/[\-\.\d]+/g) || [], i = 0;
        return toVal.toString().replace(/[\-\.\d]+/g, function(eNum){ //toVal通常更详细
            var oNum = parseFloat(arr[i++]) || 0;
            var _val = oNum * (1 - progress) + eNum * progress;
            return Math.abs(eNum - oNum) > 10 ? Math.round(_val) : _val;
        });
    }

    //消息处理
    var _msgCenter = {};
    $$.on = function(ev, callback, useCache) {
        var that = this, binds = isObject(ev) ? ev : {},
        msgCenter = hasProp.call(that, '$msg') ? that.$msg : _msgCenter;
        if(isString(ev)){
            forEach(ev.split(/\s+/), function(name){binds[name] = callback;})
        }
        forEach(binds, function(callback, name){
            if(!msgCenter[name]) msgCenter[name] = [];
            msgCenter[name].push(callback);
            if(useCache && msgCenter[name].cache) callback.apply(that, msgCenter[name].cache);
        });
        return that;
    };
    $$.once = function(ev, callback, useCache) {
        if(isObject(ev)){
            forEach(ev, function(fn){
                if(isFunction(fn)) fn.once = true;
            });
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
        var msgCenter = hasProp.call(this, '$msg') ? this.$msg : _msgCenter;
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
        var msgCenter = hasProp.call(that, '$msg') ? that.$msg : _msgCenter;
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

    var $q = $$.q = (function(){ //promise
        var defer = function() {
            var pending = [], value;
            var deferred = {
                resolve: function(val, force) {
                    if(pending){
                        var callbacks = pending;
                        pending = undefined;
                        value = ref(val);

                        forEach(callbacks, function(callback){
                            value.then(callback[0], callback[1], callback[2]);
                        });
                    }else if(force) value = ref(val);
                },
                reject: function(reason) {
                    deferred.resolve(reject(reason));
                },
                notify: function(progress) {
                    if(pending) forEach(pending, function(callback){
                        callback[2](progress);
                    });
                },
                promise: {
                    then: function(callback, errback, progressback) {
                        var result = defer();
                        var wrappedCallback = function(value) {
                            try {
                                result.resolve((isFunction(callback) ? callback : defaultCallback)(value));
                            } catch(e) {
                                result.reject(e);
                                consoleError(e);
                            }
                        };
                        var wrappedErrback = function(reason) {
                            try {
                                result.resolve((isFunction(errback) ? errback : defaultErrback)(reason));
                            } catch(e) {
                                result.reject(e);
                                consoleError(e);
                            }
                        };
                        var wrappedProgressback = function(progress) {
                            try {
                                result.notify((isFunction(progressback) ? progressback : defaultCallback)(progress));
                            } catch(e) {
                                consoleError(e);
                            }
                        };

                        if(pending){
                            pending.push([wrappedCallback, wrappedErrback, wrappedProgressback]);
                        }else{
                            value.then(wrappedCallback, wrappedErrback, wrappedProgressback);
                        }

                        return result.promise;
                    },
                    "catch": function(callback) {
                        return this.then(null, callback);
                    },
                    "finally": function(callback) {
                        function makePromise(value, resolved) {
                            return new Promise(function(resolve, reject){
                                resolved ? resolve(value) : reject(value);
                            });
                        }
                        function handleCallback(value, isResolved) {
                            var callbackOutput = null;
                            try {
                                callbackOutput = (callback || defaultCallback)();
                            } catch(e) {
                                return makePromise(e, false);
                            }
                            if (callbackOutput && isFunction(callbackOutput.then)) {
                                return callbackOutput.then(function() {
                                    return makePromise(value, isResolved);
                                }, function(error) {
                                    return makePromise(error, false);
                                });
                            } else {
                                return makePromise(value, isResolved);
                            }
                        }

                        return this.then(function(value) {
                            return handleCallback(value, true);
                        }, function(error) {
                            return handleCallback(error, false);
                        });
                    }
                }
            };
            return deferred;
        };
        var reject = function(reason) {
            return {
                then: function(callback, errback) {
                    var result = defer();
                    try {
                        result.resolve((isFunction(errback) ? errback : defaultErrback)(reason));
                    } catch(e) {
                        result.reject(e);
                    }
                    return result.promise;
                }
            };
        };
        var all = function(promises) {
            var deferred = defer(),
            counter = 0,
            results = isArray(promises) ? [] : {};

            forEach(promises, function(){counter++});
            forEach(promises, function(promise, key){
                ref(promise).then(function(value) {
                    if(hasProp.call(results, key)) return;
                    results[key] = value;
                    if (!(--counter)){
                        deferred.resolve(results);
                    }
                }, function(reason) {
                    if(hasProp.call(results, key)) return;
                    deferred.reject(reason);
                });
            });

            if (counter === 0) deferred.resolve(results);
            return deferred.promise;
        };
        var race = function(promises) {
            var deferred = defer(), counter = 0;
            forEach(promises, function(){counter++});
            forEach(promises, function(promise){
                ref(promise).then(function(value) {
                    deferred.resolve(value);
                }, function(reason) {
                    counter--;
                    if(counter === 0) deferred.reject(reason);
                });
            });
            if(counter === 0) deferred.resolve();
            return deferred.promise;
        };

        function ref(value) {
            if(value && isFunction(value.then)) return value;
            return {
                then: function(callback) {
                    var result = defer();
                    result.resolve(callback(value));
                    return result.promise;
                }
            };
        }
        function defaultCallback(value) {
            return value;
        }
        function defaultErrback(reason) {
            return reject(reason);
        }
        return {
            defer: defer,
            reject: reject,
            all: all,
            race: race,
            ref: ref,
            never: {then: function(){}}
        };
    })();
    var Promise = $$.Promise = function(fn){
        var deferred = $q.defer();
        if(isFunction(fn)){
            fn(deferred.resolve, deferred.reject);
        }
        return deferred.promise;
    };
    Promise.all = $q.all;
    Promise.race = $q.race;
    Promise.reject = $q.reject;
    Promise.resolve = function(val){
        var deferred = $q.defer();
        deferred.resolve(val);
        return deferred.promise;
    }
    $$.ajax = (function(){ //ajax, jsonp
        var JSON_START = /^\s*(\[|\{[^\{])/,
            JSON_END = /[\}\]]\s*$/,
            CONTENT_TYPE_APPLICATION_JSON = {'Content-Type': 'application/json;charset=utf-8'};
        var defaults = ajax.defaults = {
            transformResponse: [function(data) {
                if(isString(data) && JSON_START.test(data) && JSON_END.test(data))
                    data = JSON.parse(data, true);
                return data;
            }],
            transformRequest: [function(d) {
                return (isArray(d) || isObject(d)) && !$$.isFile(d) ? JSON.stringify(d) : d;
            }],
            headers: {
                common: {
                    'Accept': 'application/json, text/plain, */*'
                },
                post:   extend({}, CONTENT_TYPE_APPLICATION_JSON),
                put:    extend({}, CONTENT_TYPE_APPLICATION_JSON),
                patch:  extend({}, CONTENT_TYPE_APPLICATION_JSON)
            }
        };
        var ajaxBackend = createHttpBackend($$.cb);
        var shortMethods = ["GET", "REQUIRE", "JSONP"];
        function ajax(requestConfig) {
            var config = {
                transformRequest: defaults.transformRequest,
                transformResponse: defaults.transformResponse
            };
            var defHeaders = defaults.headers;
            var headers = extend({}, defHeaders.common, defHeaders[lowercase(requestConfig.method)], requestConfig.headers);

            extend(config, requestConfig);
            config.headers = headers;
            config.method = uppercase(config.method) || 'GET';
            config.url = buildUrl(config.url, config.params);
            
            var serverRequest = function(config) {
                headers = config.headers;
                var reqData = '';
                if(shortMethods.indexOf(config.method) > -1 && isObject(config.data)){
                    config.url = buildUrl(config.url, config.data);
                }else{
                    reqData = config.processData === false ? config.data : transformData(config.data, headersGetter(headers), config.transformRequest);
                }
                forEach(headers, function(value, header){
                    if(lowercase(header) === 'content-type'){
                        if(!isDefined(config.data) || !headers[header]) delete headers[header];
                    }
                });
                return sendReq(config, reqData, headers);
            };
            var promise = serverRequest(config);
            promise.success = function(fn) {
                promise.then(function(response) {
                    fn(response.data, response.status, response.headers, config);
                });
                return promise;
            };
            promise.error = function(fn) {
                promise.then(null, function(response) {
                    fn(response.data, response.status, response.headers, config);
                });
                return promise;
            };
            return promise;

            function transformData(data, headers, fns) {
                if(isFunction(fns)) return fns(data, headers);
                forEach(fns, function(fn) {
                    data = fn(data, headers);
                });
                return data;
            }
            function transformResponse(response) {
                var resp = extend(response, {
                    data: transformData(response.data, response.headers, config.transformResponse)
                });
                return (isSuccess(response.status)) ? resp : $q.reject(resp);
            }
            function sendReq(config, reqData, reqHeaders) {
                var url = config.url;
                ajax.pendingRequests.push(config);

                var timeoutId, abort = $q.defer();
                var promise = new Promise(function(resolve, reject){
                    function done(status, response, headers) {
                        if(timeoutId) clearTimeout(timeoutId);
                        status = Math.max(status, 0);
                        (isSuccess(status) ? resolve : reject)({
                            data: response,
                            status: status,
                            headers: headersGetter(headers),
                            config: config
                        });
                    }
                    ajaxBackend.call(config.win, config.method, url, reqData, done, reqHeaders, abort.promise, config.responseType);
                });
                
                function removePendingReq() {
                    var idx = ajax.pendingRequests.indexOf(config);
                    if(idx !== -1) ajax.pendingRequests.splice(idx, 1);
                }
                promise.then(removePendingReq, removePendingReq);
                promise = promise.then(transformResponse, transformResponse);
                promise.abort = function(){
                    abort.resolve();
                }
                if(isFunction(config.beforeSend)){
                    if(config.beforeSend(promise, config) === false) abort.resolve();
                }
                if(config.timeout > 0){
                    timeoutId = setTimeout(promise.abort, config.timeout);
                }
                return promise;
            }
        }
        ajax.pendingRequests = [];
        forEach(['get', 'delete', 'head', 'jsonp', 'require'], function(name) {
            ajax[name] = function(url, config) {
                return ajax(extend(isObject(config) ? config : isString(config) ? {headers: {charset:config}} : {}, {
                    win: this,
                    method: name,
                    url: url
                }));
            };
        });
        forEach(['post', 'put'], function(name) {
            ajax[name] = function(url, data, config) {
                return ajax(extend(isObject(config) ? config : {}, {
                    win: this,
                    method: name,
                    url: url,
                    data: data
                }));
            };
        });
        function isSuccess(status){ return 200 <= status && status < 300;  }
        function createXhr(method) {
            return msie <= 6 ? new this.ActiveXObject('Microsoft.XMLHTTP')
                : (msie < 10 && method === 'PATCH') ? new this.XDomainRequest : new this.XMLHttpRequest;
        }
        function createHttpBackend(callbacks) {
            var ABORTED = -1;
            return function(method, url, post, callback, headers, abort, responseType) {
                var status, xhr;
                var win = isWindow(this) ? this : window;
                if (method == 'REQUIRE') {
                    jsonpReq(url, function(code) {
                        completeRequest(callback, code || 200);
                    }, headers);
                } else if (method == 'JSONP') {
                    var callbackId = '_' + (callbacks.counter++).toString(36);
                    var globalCallback = callbacks[callbackId] = function(data) {
                        if(!globalCallback.datas) globalCallback.datas = [];
                        globalCallback.datas.push(data);
                    };
                    if(/callback=(\w+)/.test(url)){
                        var cbName = RegExp.$1;
                        if(cbName != 'CALLBACK'){
                            globalCallback = win[cbName] || (win[cbName] = callbacks[callbackId]);
                        }
                    };
                    jsonpReq(url.replace('CALLBACK', 'bowlder.cb.' + callbackId),
                             function() {
                                 var data = globalCallback.datas && globalCallback.datas.shift();
                                 completeRequest(callback, isDefined(data) ? 200 : status || -2, data);
                                 delete callbacks[callbackId];
                             }, headers);
                } else {
                    var xDomain = url.indexOf('//') != -1 && url.indexOf(location.host + '/') == -1;
                    xhr = createXhr.call(win, xDomain ? 'PATCH' : method);
                    xhr.open(method, url, true);
                    forEach(headers, function(value, key) {
                        if(key == 'withCredentials'){
                            xhr.withCredentials = value;
                        }else if(isDefined(value) && xhr.setRequestHeader){
                            xhr.setRequestHeader(key, value);
                        }
                    });
                    if(msie < 10 && xDomain){
                        xhr.onload = function(){
                            completeRequest(callback, 200, status !== ABORTED ? (xhr.response || xhr.responseText) : null, null);
                        }
                        xhr.onerror = function(){
                            completeRequest(callback, xhr.status || ABORTED, xhr.error, null);
                        }
                    }else{
                        xhr.onreadystatechange = function() {
                            if (xhr && xhr.readyState == 4) {
                                var responseHeaders = null, response = null;
                                if(status !== ABORTED){
                                    response = xhr.response || xhr.responseText;
                                    if(xhr.getAllResponseHeaders) responseHeaders = xhr.getAllResponseHeaders();
                                }
                                completeRequest(callback, status || xhr.status, response, responseHeaders);
                            }
                        };
                    }
                    if(responseType) xhr.responseType = responseType;
                    xhr.send(post || null);
                }
                abort.then(function(){
                    status = ABORTED;
                    xhr ? xhr.abort() : completeRequest(callback, status);
                });
                function completeRequest(callback, status, response, headersString) {
                    xhr = null;
                    status = (status === 0) ? (response ? 200 : 404) : status;
                    status = status == 1223 ? 204 : status;
                    callback(status, response, headersString);
                }
            };
            function jsonpReq(url, done, headers) {
                var parent = msie < 9 ? document.getElementsByTagName('head')[0] : document.body || document.head || document.getElementsByTagName('head')[0] || document.documentElement,
                script = document.createElement('script');
                function doneWrapper(code) {
                    if(done) done(isNumber(code) ? code : 200);
                    script.onreadystatechange = script.onload = script.onerror = done = null;
                    try{parent.removeChild(script);}catch(e){}
                }
                if(msie < 9){
                    script.onreadystatechange = function() {
                        if(/loaded|complete/.test(script.readyState)) doneWrapper();
                    };
                }
                script.onload = doneWrapper;
                script.onerror = function(){doneWrapper(400)};
                script.charset = (headers && headers.charset) || 'utf-8';
                script.src = url;
                parent.appendChild(script);
            }
        }
        return ajax;
    })();
    var BDom = function(nodes){ //bdom构造函数
        if(!nodes){
            nodes = [];
        }else if(nodes.nodeType === 1 || !isArrayLike(nodes)){
            nodes = [nodes];
        }
        var len = this.length = nodes.length;
        for(var i = 0; i < len; i ++){
            this[i] = nodes[i];
        }
    };
    function domData(node){
        var id = dom._nodeId(node);
        return domData[id] || (domData[id] = {
            $on: $$.on,
            $off: $$.off,
            $emit: $$.emit,
            $msg: {}
        });
    }
    $$.fn = BDom.prototype = {
        add: function(node){
            var that = this;
            if(isFunction(node.each)){
                node.each(function(){that.add(this)});
            }else{
                that[that.length++] = node;
            }
            return that;
        },
        eq: function(i){
            return this.length <= 1 ? this : new BDom(this[i]);
        },
        is: function(query){
            var nodes = utils.cssQuery(query);
            return all(this, function(node){
                return ~nodes.indexOf(node)
            });
        },
        filter: function(fn){
            if(isString(fn)){
                var nodes = utils.cssQuery(fn);
                fn = function(node){
                    return ~nodes.indexOf(node);
                }
            }
            return new BDom(isFunction(fn) ? filter(this, fn) : []);
        },
        each: function(iterator, context){
            for(var i = 0, len = this.length; i < len; i ++){
                iterator.call(context || this[i], this[i], i);
            }
            return this;
        },
        map: function(iterator, context){
            if(!isFunction(iterator)){
                iterator = isArray(iterator) ? toFieldExtractor(iterator.shift(), iterator) : toFieldExtractor(iterator);
            }
            return map(this, iterator, context);
        },
        parent: function(q){
            var parents = [];
            this.each(function(){
                var parent = dom.parent(this, q);
                if(parent && parents.indexOf(parent) == -1){
                    parents.push(parent);
                }
            });
            return $$(parents);
        },
        closest: function(q){
            var parents = [];
            q && this.each(function(){
                var parent = dom.parent(this, q, true, true);
                if(parent && parents.indexOf(parent) == -1){
                    parents.push(parent);
                }
            });
            return $$(parents);
        },
        children: function(){
            var children = [];
            this.each(function(){
                forEach(this.children, function(node){
                    children.push(node);
                });
            });
            return $$(children);
        },
        html: function(content){
            if(isDefined(content)){
                return this.each(function(){
                    this.innerHTML = content;
                });
            }else{
                return this[0] ? this[0].innerHTML : '';
            }
        },
        text: function(content){
            var type = msie<9?'innerText':'textContent';
            if(isDefined(content)){
                return this.each(function(){
                    this[type] = content;
                });
            }else{
                return this[0] ? this[0][type] : '';
            }
        },
        hasClass: function(name){
            var result = false;
            this.each(function(){
                result = result || classList.contains(this, name);
            });
            return result;
        },
        append: function(newNode, clone){
            var that = this;
            if(isString(newNode)){
                newNode = dom.create(newNode);
            }else if(isArrayLike(newNode)){
                forEach(slice.call(newNode), function(node){
                    that.append(node, clone)
                });
                return that;
            }
            return this.each(function(){
                this.appendChild(clone ? newNode.cloneNode(true) : newNode);
            });
        },
        prepend: function(newNode, clone){
            var that = this;
            if(isString(newNode)){
                newNode = dom.create(newNode);
            }else if(isArrayLike(newNode)){
                forEach(slice.call(newNode), function(node){
                    that.prepend(node, clone)
                });
                return that;
            }
            return this.each(function(){
                this.insertBefore(clone ? newNode.cloneNode(true) : newNode, this.firstChild);
            });
        },
        appendTo: function(parent){
            if(isString(parent)){
                parent = utils.cssQuery(parent)[0];
            }else if(!parent.nodeType && parent[0]){
                parent = parent[0];
            }
            if(!parent || parent.nodeType !== 1) return this;
            return this.each(function(){
                parent.appendChild(this);
            });
        },
        prependTo: function(parent){
            if(isString(parent)){
                parent = utils.cssQuery(parent)[0];
            }else if(!parent.nodeType && parent[0]){
                parent = parent[0];
            }
            if(!parent || parent.nodeType !== 1) return this;
            return this.each(function(){
                parent.insertBefore(this, parent.firstChild);
            });
        },
        attr: function(name, val){
            if(isDefined(val) || isObject(name)){
                return this.each(function(node){
                    dom.attr(node, name, val);
                });
            }else return this[0] && dom.attr(this[0], name);
        },
        offset: function(parent){
            return dom.offset(this[0], parent);
        },
        removeAttr: function(key){
            return this.each(function(){
                this.removeAttribute(key);
            });
        },
        data: function(name, val){
            if(isDefined(val) || isObject(name)){
                return this.each(function(node){
                    dom.data(node, name, val);
                });
            }else return this[0] && dom.data(this[0], name);
        },
        removeData: function(name){
            return this.each(function(){
                var data = domData(this);
                delete data[name];
            });
        },
        val: function(val){
            var node = this[0];
            if(!node) return null;
            if(isDefined(val)){
                return forEach(this, function(node){
                    dom.val(node, val);
                });
            }else{
                return dom.val(node);
            }
        },
        css: function(obj, val){
            var node = this[0];
            if(!node) return isObject(obj) || isDefined(val) ? this : null;
            var ret = dom.css(node, obj, val);
            if(isDefined(ret)) return ret;
            return this.each(function(node){
                dom.css(node, obj, val);
            })
        },
        find: function(query){
            var nodes = [];
            forEach(this, function(node){
                forEach(utils.cssQuery(query, node), function(_node){
                    if(nodes.indexOf(_node) == -1) nodes.push(_node);
                });
            });
            return $$(nodes);
        }
    };
    $$.fn.prop = $$.fn.data;
    forEach(['on', 'off', 'emit'], function(fname){
        $$.fn['$'+fname] = function(){
            var args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
            return this.each(function(){
                var widget = $$.widget(this),
                plugin = dom.plugin(this);
                if(widget) widget[fname].apply(widget, args);
                if(plugin) plugin.then(function(scope){
                    isFunction(scope['$'+fname]) && scope['$'+fname].apply(scope, args);
                });
            });
        }
    });
    forEach(["addClass", "removeClass", "toggleClass", "on", "off", "bind", "unbind", "remove", "show", "hide", "toggle", "trigger", "animate", "stop", "pause", "fadeIn", "fadeOut", "slideUp", "slideDown"], function(fname){
        $$.fn[fname] = function(){
            var args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
            return this.each(function(){
                dom[fname].apply(dom, [this].concat(args));
            });
        }
    });
    forEach(["focus", "blur", "submit"], function(fname){
        $$.fn[fname] = function(){
            return this.each(function(){this[fname]();});
        }
    });
    forEach(["width", "height", "scrollLeft", "scrollTop"], function(fname){
        $$.fn[fname] = function(val){
            var result = this.css(fname, val);
            if(!isDefined(val)) result = parseInt(result, 10) || 0;
            return result;
        }
    });
    forEach(["before", "after"], function(fname){
        $$.fn[fname] = function(node, clone){
            if(!node.nodeType && node[0]) node = node[0];
            if(node.nodeType !== 1) return this;
            clone ? this.each(function(){
                dom[fname](node.cloneNode(true), this);
            }) : dom[fname](node, this[0]);
            return this;
        }
        $$.fn[camelCase("insert-" + fname)] = function(node){//insertBefore
            if(!node.nodeType && node[0]) node = node[0];
            if(node.nodeType !== 1) return this;
            return this.each(function(){
                dom[fname](this, node);
            });
        }
    });
    var isReady, bodyReadyDefer = $q.defer();
    $$.ready = function(widgets, fn){
        var promise = bodyReadyDefer.promise;
        if(isFunction(widgets)){
            fn = widgets;
        }else if(isArray(widgets)){
            var promises = [];
            forEach(widgets, function(widget){
                promises.push(widget.ready());
            });
            promise = $q.all(promises);
        }else{
            return $$.rootWidget.defer.promise;
        }
        if(isFunction(fn)){
            promise.then(function(widgets){
                try{
                    fn.call(document, widgets);
                }catch(e){consoleError(e)}
            });
        }
        return promise;
    };
    function domReadyNow() {
        if(!isReady){
            var body = document.body;
            if(!body){
                setTimeout(domReadyNow, 13);
                return;
            }
            isReady = true;
            bodyReadyDefer.resolve();
        }
    }
    // 绑定DOMReady事件
    if("complete" === document.readyState) {
        setTimeout(domReadyNow);
    }else if(document.addEventListener){
        document.addEventListener("DOMContentLoaded", domReadyNow, false);
        window.addEventListener("load", domReadyNow, false);
    }else if(document.attachEvent) {
        var onDomReady = function() {
            if("complete" == document.readyState){
                domReadyNow();
            }
        };
        document.attachEvent("onreadystatechange", onDomReady);
        window.attachEvent("onload", onDomReady);
    }

    var nop = function(){};
    var former = function(x){ return x; };
    var remove = function(x, xs){
        var i = xs && xs.indexOf(x);
        if (i >= 0) {
            return xs.splice(i, 1);
        }
    }
    var always = function(f){
        return isFunction(f) ? f : function(){return f}
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
                    match = isObject(fn) ? all(fn, function(val, key){
                        var _val = item[key];
                        return val === (isStream(_val) ? _val.fetch() : _val);
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
    var inherit = function(child, parent) {
        var ctor = function() {};
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        return child;
    };
    var isStream = $$.isStream = function(x){ return x && x._isStream; }
    var dataAndEnd = function(markEnd, value){ var e = isObject(value) && value.data && value.status==200 ? value.data : value; return markEnd ? [e, End] : e; }
    var $s = $$.s = function(promise, abort, eTransform, instant){ //reactive
        if(promise == null){
            var stream = new Stream(new Desc(), nop);
            isDefined(abort) && stream.push(abort);
            return stream;
        }else if(isArray(promise)){
            return fromArray(promise);
        }else if(typeof promise == 'object' && isFunction(promise.then)){ //promise
            eTransform = isFunction(abort) ? abort : isString(abort) ? function(data){
                return toFieldExtractor(abort)(dataAndEnd(false, data));
            } : dataAndEnd.bind(undefined, abort);
            return withDesc(["", [promise]], $s.fromBinder(function(handler){
                promise.then(handler, function(e) {
                    return handler(new Error(e));
                });
                return function() {
                    return isFunction(promise.abort) ? promise.abort() : undefined;
                };
            }, eTransform));
        }else if(isNumber(promise)){
            if(promise === 0) return withDesc(["", [promise, abort]], $s.once(abort));
            var delay = promise, isRepeat = isFunction(abort) || eTransform;
            var eventFn = isFunction(abort) ? abort : (function(){
                var i = 0, arr = isArray(abort) ? abort : [abort];
                return function(){
                    var event = toEvent(arr[i++]);
                    if(isRepeat){
                        if(i >= arr.length) i = 0;
                    }else{
                        if(i == arr.length){
                            event = [event, End];
                        }else if(i > arr.length){
                            event = End;
                        }
                    }
                    return event;
                }
            })();
            return withDesc(["", [delay, abort, isRepeat]], $s.fromBinder(function(handler){
                var step = function(){
                    if(handler() != $s.noMore){ //handler触发的unsub中clearTimeout无效
                        id = setTimeout(step, delay);
                    }
                }
                var id = instant ? step() : setTimeout(step, delay);
                return function(){ id && clearTimeout(id); }
            }, eventFn));
        }else if(isFunction(promise)){ //callback
            return fromCallback.apply(this, arguments);
        }else if(promise instanceof BDom){ //BDom
            return promise.s(abort, eTransform);
        }else if(promise && promise.nodeType || isWindow(promise)){ //domNode
            var target = promise,
            eventName = abort;
            return dom.data(target, "_$$"+eventName) || dom.data(target, "_$$"+eventName, withDesc(["", [target, eventName]], $s.fromBinder(function(handler){
                dom.bind(target, eventName, handler);
                return function(){
                    dom.data(target, "_$$"+eventName, null);
                    return dom.unbind(target, eventName, handler);
                };
            }, eTransform)));
        }else if(toString.call(promise) == "[object WebSocket]"){
            var isReady, $$s = withDesc(["", [promise, abort]], $s(function(sink){
                promise.onopen = function(){
                    isReady = true;
                    isFunction(abort) && abort.call(promise, promise);
                }
                promise.onmessage = eTransform !== false ? function(e){
                    sink(e && e.data);
                } : sink;
                promise.onerror = function(e){ sink(new Error(e)); };
                promise.onclose = function(){ sink(End) };
            }));
            return extend($$s, {
                send: function(e){ isReady && promise.send(e) },
                close: function(){ isReady && promise.close() }
            });
        }else{
            return new Stream(new Desc(), function(sink){sink(toEvent(promise))});
        }
    }
    var sData = $$.sData = function(obj){
        return map(obj, function(val, key){
            if(isString(key) && key.indexOf('$$') == 0) return undefined;
            return isStream(val) ? val.fetch() : isObject(val) ? sData(val) : val;
        });
    }
    $$.sClass = function(defs){
        if(!$$.isObject(defs)){
            throw("Argument must be a Object.");
        }
        return function(){
            var args = slice.call(arguments);
            var s = $$.s(null, defs._init ? defs._init.apply(null, args) : null);
            if(defs._on){
                s.on(defs._on.bind.apply(defs._on, [s].concat(args)));
            }
            return s;
        }
    }
    $$.sMap = function(obj, fn){
        var onchange = isFunction(fn) && function(v){ result && fn.call(this, getData, v); };
        var getData = onchange && function(){ return sData(result); };
        var mapper = function(obj){
            return map(obj, function(val){
                if(isFunction(val) || val == null || val._isStream) return val;
                return isObject(val) ? mapper(val) : onchange ? $s(null, val).on(onchange) : $s(null, val);
            });
        }
        var result = mapper(obj);
        return result;
    }
    var UpdateBarrier = (function() {
        var rootEvent;
        var waiterObs = [];
        var waiters = {};
        var afters = [];
        var aftersIndex = 0;
        var flushed = {};
        var afterTransaction = function(f){
            return rootEvent ? afters.push(f) : f();
        };
        var whenDoneWith = function(obs, f){
            if (rootEvent) {
                var obsWaiters = waiters[obs.id];
                if (obsWaiters == null) {
                    obsWaiters = waiters[obs.id] = [f];
                    return waiterObs.push(obs);
                } else {
                    return obsWaiters.push(f);
                }
            } else {
                return f();
            }
        };
        var flush = function(){
            while(waiterObs.length > 0){
                flushWaiters(0, true);
            }
            flushed = {};
        };
        var flushWaiters = function(index, deps){
            var obs = waiterObs[index];
            var obsId = obs.id;
            var obsWaiters = waiters[obsId];
            waiterObs.splice(index, 1);
            delete waiters[obsId];
            if (deps && waiterObs.length > 0) {
                flushDepsOf(obs);
            }
            forEach(obsWaiters, function(f){f()});
        };
        var flushDepsOf = function(obs){
            if(flushed[obs.id]) return;
            forEach(obs.desc.deps(), function(dep){
                flushDepsOf(dep);
                if(waiters[dep.id]){
                    var index = waiterObs.indexOf(dep);
                    flushWaiters(index, false);
                }
            });
            flushed[obs.id] = true;
        };
        var inTransaction = function(event, context, f, args){
            if (rootEvent) {
                return f.apply(context, args);
            } else {
                rootEvent = event;
                try {
                    var result = f.apply(context, args);
                    flush();
                } finally {
                    rootEvent = undefined;
                    while(aftersIndex < afters.length){
                        afters[aftersIndex++]();
                    }
                    aftersIndex = 0;
                    afters = [];
                }
                return result;
            }
        };
        var wrappedSubscribe = function(obs, sink, instant){
            var unsubd = false;
            var shouldUnsub = false;
            var doUnsub = function(){
                shouldUnsub = true;
                return shouldUnsub;
            };
            var unsub = function(){
                unsubd = true;
                return doUnsub();
            };
            doUnsub = obs.dispatcher.subscribe(function(event){
                return afterTransaction(function() {
                    if(!unsubd && sink(event) === $s.noMore) return unsub();
                });
            }, instant);
            shouldUnsub && doUnsub();
            return unsub;
        };
        var hasWaiters = function(){
            return waiterObs.length > 0;
        };
        return { whenDoneWith: whenDoneWith, hasWaiters: hasWaiters, inTransaction: inTransaction, wrappedSubscribe: wrappedSubscribe, afterTransaction: afterTransaction };
    })();
    function Source(obs, sync, lazy, flatten) {
        this.obs = obs;
        this.sync = sync;
        this.lazy = lazy || false;
        this.queue = [];
        this.flatten = flatten;
    }
    Source.prototype = {
        _isSource: true,
        subscribe: function(sink, instant) {
            return this.obs.dispatcher.subscribe(sink, instant);
        },
        consume: function() {
            var val = this.flatten ? (this.queue.length ? this.queue[0] : this.obs.dispatcher.prevEvent) : this.queue.shift();
            return this.lazy ? { value: always(val) } : val;
        },
        push: function(x) {
            if(this.flatten) this.queue = [];
            this.queue.push(x);
            return this.flatten ? this.queue : x;
        },
        mayHave: function(c) {
            return this.flatten || !this.ended || this.queue.length >= c;
        },
        hasAtLeast: function(c) {
            return this.flatten ? this.queue.length : this.queue.length >= c;
        }
    };
    var stream2Source = function(s) {
        return s && s._isSource ? s : new Source(s, true);
    };
    var isTrigger = function(s) {
        return s != null && (s._isSource ? s.sync : s._isStream);
    };
    var findDeps = function(x){
        if(isArray(x)) return $$.reduce(x, [], function(ys, _x){
            return ys.concat(findDeps(_x));
        });
        if(isStream(x)) return [x];
        if(x && x._isSource) return [x.obs];
        return [];
    };
    function Desc(method, args, context) {
        this.method = method || "";
        this.args = this._args = args || [];
        if(context) this.context = context;
    }
    Desc.prototype.deps = function(){
        if(!this.cached){
            this.cached = findDeps([this.context].concat(this._args));
        }
        return this.cached;
    }
    Desc.prototype.toString = function(){
        return (this.context&&this.context.desc!=this?this.context.toString()+'.'+this.method:'$$.s')+'('+(this.args?map(this.args, function(o){return isFunction(o)?o.toString():JSON.stringify(o)}).join(','):'')+')';
    }
    var withDesc = function(desc, obs) {
        obs.desc.method = desc[0] || "";
        obs.desc.args = desc[1] || [];
        desc[2] ? (obs.desc.context = desc[2]) : delete obs.desc.context;
        return obs;
    };
    var withMethodCallSupport = function(wrapped){
        return function(f){
            var args = slice.call(arguments, 1);
            if (typeof f === "object" && args.length) {
                var context = f;
                var methodName = args[0];
                f = function() {
                    return context[methodName].apply(context, arguments);
                };
                args = args.slice(1);
            }
            return wrapped.apply(undefined, [f].concat(args));
        };
    };
    var toSimpleExtractor = function(args) {
        return function(key) {
            return function(value) {
                if(value == null) return;
                var fieldValue = value[key];
                return isFunction(fieldValue) ? fieldValue.apply(value, args) : fieldValue;
            };
        };
    };
    var toFieldExtractor = function(f, args) {
        var parts = f.slice(1).split(".");
        var partFuncs = map(parts, toSimpleExtractor(args));
        return function(value) {
            return $$.reduce(partFuncs, value, function(v, f){
                return f(v);
            });
        };
    };
    var isFieldKey = function(f) {
        return typeof f === "string" && f.length > 1 && f.charAt(0) === ".";
    };
    var makeFunction_ = withMethodCallSupport(function(f) {
        var args = slice.call(arguments, 1);
        if (isFunction(f)) {
            return args.length ? function(){
                return f.apply(undefined, args.concat(slice.call(arguments)))
            } : f;
        } else if (isFieldKey(f)) {
            return toFieldExtractor(f, args);
        } else {
            return always(f);
        }
    });
    var makeFunction = function(args) {
        return isArray(args) ? makeFunction_.apply(undefined, args) : isDefined(args) ? always(args) : former;
    };
    var convertArgsToFunction = function(obs, args, method) {
        return method.call(obs, makeFunction(args));
    };
    var toCombinator = function(f) {
        if (isFunction(f)) {
            return f;
        } else if (isFieldKey(f)) {
            var key = f.slice(1);
            return function(left, right) {
                return left[key](right);
            };
        } else throw new Exception("not a function or a field key: " + f);
    };
    function Some(value) {
        this.value = value;
    }
    extend(Some.prototype, {
        _isSome: true,
        get: function(){ return this.value; },
        filter: function(f){
            return f(this.value) ? new Some(this.value) : None;
        },
        forEach: function(f){ return f(this.value); },
        toString: function(){ return "Some(" + this.value + ")"; }
    });
    var None = {
        _isNone: true,
        filter: function(){ return None; },
        forEach: nop,
        toString: always("None")
    };
    var toOption = function(v){
        return v && (v._isSome || v._isNone) ? v : new Some(v);
    };
    $s.noMore = "<no-more>";
    $s.more = "<more>";

    var eventIdCounter = 0;
    function Event() {
        this.id = ++eventIdCounter;
    }
    Event.prototype = {
        _isEvent: true,
        hasValue: always(false),
        filter: always(true),
        fmap: function(){ return this },
        apply: function(){ return this }
    };
    function Next(valueF, eager) {
        Event.call(this);
        if (!eager && isFunction(valueF) || (valueF != null && valueF._isNext)) { //lazyload
            this.valueF = valueF;
            this.valueInternal = undefined;
        } else {
            this.valueF = undefined;
            this.valueInternal = valueF;
        }
    }
    inherit(Next, Event);
    Next.prototype.hasValue = always(true);
    Next.prototype.value = function() {
        var ref = this.valueF;
        if (ref != null && ref._isNext) {
            this.valueInternal = ref.value();
        } else if (ref) {
            this.valueInternal = ref();
        }
        this.valueF = undefined;
        return this.valueInternal;
    };
    Next.prototype.fmap = function(f, stream){
        var event = this;
        if (event.valueInternal) {
            return this.apply(function(){
                return f.call(stream, event.valueInternal, stream._state);
            });
        } else {
            return this.apply(function(){
                return f.call(stream, event.value(), stream._state);
            });
        }
    };
    Next.prototype.apply = function(value){ return new Next(value); };
    Next.prototype.filter = function(f){ return f(this.value()); };
    Next.prototype.toString = function(){ return this.value(); };
    Next.prototype._isNext = true;

    function Initial(valueF, eager){
        Next.call(this, valueF, eager);
    }
    inherit(Initial, Next);
    Initial.prototype._isNext = false;
    Initial.prototype._isInitial = true;
    Initial.prototype.apply = function(value) { return new Initial(value); };

    var End = $s.End = new Event;
    End._isEnd = true;
    End.toString = always("<end>");

    function Error(error) {
        this.error = error;
        Event.call(this);
    }
    inherit(Error, Event);
    Error.prototype._isError = true;
    Error.prototype.toString = function() { return "<error>" + this.error; };

    var initialEvent = function(value) { return new Initial(value, true); };
    var nextEvent = $s.Next = function(value) { return new Next(value, true); };
    var toEvent = function(x) { return (x && x._isEvent) ? x: nextEvent(x); };
    var unsubName = "_$$off";
    function Stream(desc, subscribe, handler){
        this.desc = desc;
        this.dispatcher = new Dispatcher(subscribe, handler);
    }
    Stream.prototype = {
        _isStream: true,
        spy: function(name){
            this.name = name;
            $s.spy("created", this);
            return this;
        },
        subscribe: function(sink, instant){
            return UpdateBarrier.wrappedSubscribe(this, sink, instant);
        },
        subscribeInternal: function(sink){
            return this.dispatcher.subscribe(sink);
        },
        toString: function(){ return this.desc.toString() },
        on: function(f, instant){
            var that = this;
            if(!f){
                if(this.dispatcher.subscribed()) return this;
                f = function(){};
            }
            var _f = makeFunction(f);
            f[unsubName] = this.subscribe(function(event){
                if(event.hasValue()){
                    return _f.call(that, event.value(), that._state);
                }
            }, instant);
            return this;
        },
        off: function(f){
            f[unsubName] && f[unsubName]();
            delete f[unsubName];
            return this;
        },
        onError: function(f, instant){
            this.subscribe(function(event){
                if(event._isError) return f(event.error);
            }, instant);
            return this;
        },
        onEnd: function(f, instant) {
            this.subscribe(function(event) {
                if(event._isEnd) return f();
            }, instant);
            return this;
        },
        not: function(){
            return withDesc(["not", [], this], this.map(function(x){return !x}));
        },
        combine: function(other){
            var args = argumentsToArray(arguments);
            return withDesc(["combine", args, this], combineAsArray([this].concat(args)));
        },
        between: function(start, pause){
            var stream = this, nStream = start.merge(pause.map(false)).changes().flatMapLatest(function(flag){
                return flag === false ? $$never : (nStream.state(flag), stream);
            });
            return withDesc(["between", [start, pause]], nStream);
        },
        changes: function(isEqual, prev, inited){
            isEqual = isFunction(isEqual) ? isEqual: equals;
            return withDesc(["changes", [], this], this.filter(function(value){
                var noChange = inited ? isEqual(prev, value) : false;
                prev = value;
                inited = true;
                return !noChange;
            }));
        },
        map: function(p, instant){
            var stream = this;
            instant = $$.isBoolean(instant) ? instant : true;
            return convertArgsToFunction(this, p, function(f){
                return withDesc(["map", [f], this], this.withHandler(function(event) {
                    return this.push(event.fmap(f, stream));
                }, instant));
            });
        },
        flatMap: function(f){ //f maybe stream
            return flatMap_(this, always(f));
        },
        flatMapFirst: function(f){ //f maybe stream
            return flatMap_(this, always(f), true);
        },
        flatMapLatest: function(f){
            var obs = this;
            f = always(f);
            return withDesc(["flatMapLatest", [f], obs], obs.flatMap(function(value){
                return makeStream(f(value)).until(obs);
            }));
        },
        sample: function(sampler, combinator){
            var lazy = !combinator;
            if(isNumber(sampler)) sampler = $s(sampler);
            combinator = combinator ? toCombinator(combinator) : function(f){ return f && f._isEvent ? f.value() : f; };
            var thisSource = new Source(this, false, lazy, true);
            var samplerSource = new Source(sampler, true, lazy, true);
            return withDesc(["sample", [sampler, combinator], this], $s.when([thisSource, samplerSource], combinator));
        },
        reduce: function(seed, f){
            var obs = this, reduceStream;
            f = toCombinator(f);
            var acc = toOption(seed);
            var initHandled = false;
            var subscribe = function(sink){
                var _dispatcher = this;
                var unsub = nop;
                var reply = $s.more;
                var sendInit = function(){
                    if (!initHandled) {
                        return acc.forEach(function(value){
                            initHandled = true;
                            reply = sink(new Initial(always(value)));
                            if(reply === $s.noMore){
                                unsub();
                                unsub = nop;
                            }
                            return unsub;
                        });
                    }
                };
                unsub = obs.dispatcher.subscribe(function(event){
                    if (event.hasValue()) {
                        if (initHandled && event._isInitial) {
                            return $s.more;
                        } else {
                            if(initHandled) acc = _dispatcher.prevEvent;
                            var prev = !initHandled ? seed : acc.hasValue() ? acc.value() : undefined;
                            var next = f(prev, event.value());
                            if(!event._isInitial) sendInit();
                            initHandled = true;
                            return sink(event.apply(function() {
                                return next;
                            }));
                        }
                    } else {
                        if(event._isEnd) reply = sendInit();
                        if(reply !== $s.noMore) return sink(event);
                    }
                });
                UpdateBarrier.whenDoneWith(reduceStream, sendInit);
                return unsub;
            };
            reduceStream = new Stream(new Desc("reduce", [JSON.parse(JSON.stringify(seed)), f], this), subscribe);
            return reduceStream;
        },
        skip: function(count) {
            return withDesc(["skip", [count], this], this.withHandler(function(event) {
                if (!event.hasValue()) {
                    return this.push(event);
                } else if (count > 0) {
                    count--;
                    return $s.more;
                } else {
                    return this.push(event);
                }
            }));
        },
        while: function(p){
            return convertArgsToFunction(this, p, function(f) {
                return withDesc(["takeWhile", [f], this], this.withHandler(function(event) {
                    if (event.filter(f)) {
                        return this.push(event);
                    } else {
                        this.push(End);
                        return $s.noMore;
                    }
                }));
            });
        },
        take: function(count){
            if(count <= 0) return $$never;
            return withDesc(["take", [count], this], this.withHandler(function(event) {
                if (!event.hasValue()) {
                    return this.push(event);
                } else {
                    if (--count > 0) {
                        return this.push(event);
                    } else {
                        if (count === 0) this.push(event);
                        this.push(End);
                        return $s.noMore;
                    }
                }
            }));
        },
        filter: function(p){
            return convertArgsToFunction(this, p, function(f) {
                return withDesc(["filter", [f], this], this.withHandler(function(event) {
                    return event.filter(f) ? this.push(event) : $s.more;
                }));
            });
        },
        last: function(){
            var lastEvent;
            return withDesc(["last", [], this], this.withHandler(function(event) {
                if (event._isEnd) {
                    lastEvent && this.push(lastEvent);
                    this.push(End);
                    return $s.noMore;
                }
                lastEvent = event;
            }));
        },
        push: function(e, steper){
            if(arguments.length == 0) steper = former;
            this.dispatcher.push(toEvent(isFunction(steper) ? steper(this.fetch(), this._state) : e));
        },
        withHandler: function(handler, instant){ //处理event对象, $s.fromBinder处理event值
            return new Stream(new Desc("withHandler", [handler], this), instant ? this.dispatcher.subscribe.bind(undefined, true) : this.dispatcher.subscribe, handler);
        },
        buffer: function(time, count) {
            var buffer = {
                values: [],
                flush: function(){
                    if (buffer.values.length > 0) {
                        var reply = buffer.push(nextEvent(buffer.values));
                        buffer.values = [];
                        if (buffer.end != null) {
                            return buffer.push(buffer.end);
                        } else if (reply !== $s.noMore) {
                            return flush();
                        }
                    } else {
                        if (buffer.end != null) {
                            return buffer.push(buffer.end);
                        }
                    }
                }
            };
            var flush = $$.throttle(buffer.flush, time);
            var reply = $s.more;
            return withDesc(["buffer", [], this], this.withHandler(function(event) {
                var obs = this;
                buffer.push = function(e){ return obs.push(e); };
                if (event._isError) {
                    reply = obs.push(event);
                } else if (event._isEnd) {
                    buffer.end = event;
                    flush();
                } else {
                    buffer.values.push(event.value());
                    if(!count || buffer.values.length == count){
                        flush();
                    }
                }
                return reply;
            }));
        },
        concat: function(right){
            var left = this;
            return new Stream(new Desc(left, "concat", [right]), function(sink){
                var unsubRight = nop;
                var unsubLeft = left.dispatcher.subscribe(function(e){
                    if (e._isEnd) {
                        unsubRight = right.dispatcher.subscribe(sink);
                        return unsubRight;
                    } else {
                        return sink(e);
                    }
                });
                return function() {
                    return unsubLeft(), unsubRight();
                };
            });
        },
        merge: function(right) {
            return $s.merge(this, right);
        },
        state: function(data){
            this._state = data;
            return this;
        },
        init: function(seed) {
            return withDesc(["init", [seed], this], $s.once(seed).concat(this));
        },
        throttle: function(time, count) {
            return withDesc(["throttle", [time, count], this], this.buffer(time, count).map(function(values) {
                return values[values.length - 1];
            }));
        },
        debounce: function(delay, immedia) {
            return withDesc(["debounce", [delay], this], immedia ? this.flatMapFirst(function(value){
                return $s.once(value).concat($s(delay).filter(false));
            }) : this.flatMapLatest(function(value){
                return $s(delay, [value]);
            }));
        },
        delay: function(delay) {
            return withDesc(["delay", [delay], this], this.flatMap(function(value) {
                return $s(delay, [value]);
            }));
        },
        fetch: function(){
            this.dispatcher.subscribe(nop);
            var e = this.dispatcher.prevEvent;
            return e && e.hasValue() ? e.value() : null;
        },
        slidingWindow: function(n){
            return withDesc(["slidingWindow", [n], this], this.reduce([], function (arr, value) {
                var len = parseInt(isStream(n) ? n.fetch() : n);
                return arr.concat([value]).slice(isNaN(len) ? -1 : -len);
            }));
        },
        unless: function(starter, combine){
            var stream = this;
            if(combine && !isFunction(combine)) combine = function(a, b){return [a,b]}
            return withDesc(["unless", [starter], stream], $s.fromBinder(function(handler){
                var starterValue, inited, start = function(e){
                    if(combine){
                        starterValue = e;
                    }else{
                        starter.off(start);
                    }
                    if(!inited) inited = stream.on(combine ? function(e){
                        handler(combine(e, starterValue));
                    } : handler, true);
                }
                starter.on(start, true);
                return starter.off.bind(starter, start);
            }));
        },
        until: function(stopper, instant){
            var stream = this;
            return withDesc(["until", [stopper], stream], $s.fromBinder(function(handler){
                stream.on(handler);
                stopper.on(function(){
                    handler(End);
                    stream.off(handler);
                }, instant);
                return stream.off.bind(stream, handler);
            }));
        },
        log: function(){
            var args = slice.call(arguments), dispatcher = this.dispatcher;
            dispatcher._log = function(event) {
                console.log.apply(console, args.concat([event.toString()]));
            }
            dispatcher.prevEvent && dispatcher._log(dispatcher.prevEvent);
            return this;
        }
    };

    function CompositeUnsubscribe(ss){
        this.unsubscribe = this.unsubscribe.bind(this);
        this.subscriptions = [];
        this.starting = [];
        forEach(ss, this.add.bind(this));
    }
    CompositeUnsubscribe.prototype = {
        add: function(subscription){
            var ended, that = this;
            if(this.unsubscribed) return null;
            this.starting.push(subscription);
            var unsubMe = function() {
                if(that.unsubscribed) return null;
                ended = true;
                if(remove(unsub, that.subscriptions)) unsub();
                return remove(subscription, that.starting);
            };
            var unsub = subscription(this.unsubscribe, unsubMe);
            this.unsubscribed || ended ? unsub() : this.subscriptions.push(unsub);
            remove(subscription, this.starting);
            return unsub;
        },
        unsubscribe: function(){
            if (this.unsubscribed) return;
            this.unsubscribed = true;
            forEach(this.subscriptions, function(f){ f() });
            this.subscriptions = this.starting = undefined;
        },
        count: function(){
            return this.unsubscribed ? 0
                : this.subscriptions.length + this.starting.length;
        }
    };

    function Dispatcher(_subscribe, _handleEvent){
        this._subscribe = _subscribe;
        this._handleEvent = _handleEvent;
        this.subscribe = this.subscribe.bind(this);
        this.handleEvent = this.handleEvent.bind(this);
        this.subscriptions = [];
        this.queue = [];
    }
    Dispatcher.prototype = {
        subscribed: function() {
            return this.subscriptions.length > 0;
        },
        subscribe: function(sink, instant){
            if(typeof sink == 'boolean'){
                var tmp = sink;
                sink = instant;
                instant = tmp;
            }
            if(sink == nop && this.subscriptions.length) return;
            var subscription, that = this;
            if(this.ended){
                sink(End);
                return nop;
            }else if(isFunction(sink)){
                if(instant && this.prevEvent) sink(this.prevEvent);
                subscription = {
                    sink: sink
                };
                this.subscriptions.push(subscription);
                if(this.subscriptions.length === 1){
                    this.unsubSrc = this._subscribe(this.handleEvent);
                }
                return function(){
                    that.removeSub(subscription);
                    if (!that.subscribed()) {
                        return that.unsubscribeFromSource();
                    }
                };
            }
        },
        removeSub: function(subscription) {
            return this.subscriptions = filter(this.subscriptions, function(y){return y != subscription});
        },
        push: function(event) {
            if(event._isEnd) this.ended = true;
            return UpdateBarrier.inTransaction(event, this, this.pushIt, [event]);
        },
        pushToSubscriptions: function(event) {
            try {
                var tmp = this.subscriptions, len = tmp.length;
                for (var i = 0; i < len; i++) {
                    var sub = tmp[i];
                    var reply = sub.sink(event);
                    if (reply === $s.noMore || event._isEnd) {
                        this.removeSub(sub);
                    }
                }
                this._log && this._log(event);
                if(event.hasValue()){
                    this.prevEvent = event;
                }
                return true;
            } catch (error) {
                this.pushing = false;
                this.queue = [];
                throw error;
            }
        },
        pushIt: function(event) {
            if (!this.pushing) {
                if(event === this.prevError) return;
                if(event._isError){
                    this.prevError = event;
                }
                this.pushing = true;
                this.pushToSubscriptions(event);
                this.pushing = false;
                while (this.queue.length) {
                    event = this.queue.shift();
                    this.push(event);
                }
                if (this.subscribed()) {
                    return $s.more;
                } else {
                    this.unsubscribeFromSource();
                    return $s.noMore;
                }
            } else {
                this.queue.push(event);
                return $s.more;
            }
        },
        handleEvent: function(event) {
            return this._handleEvent ? this._handleEvent(event) : this.push(event);
        },
        unsubscribeFromSource: function() {
            if(this.unsubSrc) this.unsubSrc();
            this.unsubSrc = undefined;
        }
    }
    $s.when = function() {
        if (arguments.length === 0) return $$never;
        var len = arguments.length;
        if(len % 2 !== 0) throw "when: expecting arguments in the form (Stream, function)+";
        var sources = [];
        var pats = [];
        var i = 0;
        while(i < len){
            var patSources = isArray(arguments[i]) ? arguments[i] : [arguments[i]];
            var f = always(arguments[i + 1]);
            var triggerFound = false;
            var pat = { f: f, ixs: map(patSources, function(s, i, arr){
                var index = sources.indexOf(s);
                if(!triggerFound){
                    triggerFound = isTrigger(s);
                }
                if(index < 0){
                    sources.push(s);
                    index = sources.length - 1;
                }
                forEach(arr, function(ix){
                    if(ix.index === index) ix.count++;
                });
                return { index: index, count: 1 };
            })};
            if(patSources.length){
                if(!triggerFound) throw "At least one Stream required";
                pats.push(pat);
            }
            i = i + 2;
        }
        if(!sources.length) return $$never;
        sources = map(sources, stream2Source);
        var needsBarrier = any(sources, function(s){
            return s.flatten;
        }) && containsDuplicateDeps(map(sources, function(s){
            return s.obs;
        }));

        var resultStream = new Stream(new Desc("when", slice.call(arguments)), function(sink){
            var triggers = [];
            var ends = false;
            var match = function(p){
                return all(p.ixs, function(i){
                    return sources[i.index].hasAtLeast(i.count);
                });
            };
            var cannotSync = function(source){
                return !source.sync || source.ended;
            };
            var cannotMatch = function(p){
                return any(p.ixs, function(i){
                    return !sources[i.index].mayHave(i.count)
                });
            };
            var part = function(source, i){
                return function(unsubAll) {
                    var flushLater = function(){
                        return UpdateBarrier.whenDoneWith(resultStream, flush);
                    };
                    var flushWhileTriggers = function(){
                        if(triggers.length > 0){
                            var reply = $s.more;
                            var trigger = triggers.pop();
                            for(var i1 = 0, p; i1 < pats.length; i1++){
                                p = pats[i1];
                                if(match(p)){
                                    var events = map(p.ixs, function(i){return sources[i.index].consume()});
                                    reply = sink(trigger.e.apply(function(){
                                        var values = map(events, function(event){return event.value()});
                                        return p.f.apply(p, values);
                                    }));
                                    if(triggers.length){
                                        triggers = filter(triggers, function(obs){return !obs.source.flatten});
                                    }
                                    return reply === $s.noMore ? reply : flushWhileTriggers();
                                }
                            }
                        }else{
                            return $s.more;
                        }
                    };
                    var flush = function(){
                        var reply = flushWhileTriggers();
                        if(ends){
                            if(all(sources, cannotSync) || all(pats, cannotMatch)){
                                reply = $s.noMore;
                                sink(End);
                            }
                        }
                        if(reply === $s.noMore){
                            unsubAll();
                        }
                        return reply;
                    };
                    return source.subscribe(function(e){
                        if (e._isEnd) {
                            ends = true;
                            source.ended = true;
                            flushLater();
                        } else if (e._isError) {
                            var reply = sink(e);
                        } else {
                            source.push(e);
                            if (source.sync) {
                                triggers.push({ source: source, e: e });
                                if (needsBarrier || UpdateBarrier.hasWaiters()) {
                                    flushLater();
                                } else {
                                    flush();
                                }
                            }
                        }
                        if (reply === $s.noMore) unsubAll();
                        return reply || $s.more;
                    }, !i);
                };
            };
            return new CompositeUnsubscribe(map(sources, part)).unsubscribe;
        });
        return resultStream;
    };
    var containsDuplicateDeps = function(streams, state) {
        state = isArray(state) ? state : [];
        var checkStream = function(stream) {
            if(state.indexOf(stream) != -1) return true;
            var deps = stream.desc.deps();
            state.push(stream);
            return deps.length ? any(deps, checkStream) : false;
        };
        return any(streams, checkStream);
    };
    $s.constant = function(value) {
        return new Stream(new Desc("constant", [value]), function(sink) {
            sink(initialEvent(value));
            sink(End);
        });
    };
    $s.fromBinder = function(binder, eTransform){ //binder通过传入的sink函数返回新值
        eTransform = eTransform || former;
        return new Stream(new Desc("fromBinder", [binder, eTransform]), function(sink){
            var unbound = false;
            var shouldUnbind = false;
            var unbind = function() {
                if (!unbound) {
                    if (typeof unbinder !== "undefined" && unbinder !== null) {
                        unbinder();
                        return unbound = true;
                    } else {
                        return shouldUnbind = true;
                    }
                }
            };
            var unbinder = binder(function(){
                var ref, value = eTransform.apply(this, slice.call(arguments));
                if (!(isArray(value) && (ref = value[value.length-1]) != null && ref._isEvent)) {
                    value = [value];
                }
                var reply = $s.more;
                for (var i = 0, event; i < value.length; i++) {
                    event = value[i];
                    reply = sink(event = toEvent(event));
                    if (reply === $s.noMore || event._isEnd) {
                        unbind();
                        return reply;
                    }
                }
                return reply;
            });
            if (shouldUnbind) unbind();
            return unbind;
        });
    };
    var argumentsToArray = function(args){
        return isArray(args[0]) ? args[0]: slice.call(args);
    };
    var argumentsToArrayAndFunction = function(args){
        if (isFunction(args[0])) {
            return [argumentsToArray(Array.prototype.slice.call(args, 1)), args[0]];
        } else {
            return [argumentsToArray(Array.prototype.slice.call(args, 0, args.length - 1)), args[args.length-1]];
        }
    };
    $s.once = function(value){
        return new Stream(new Desc("once", [value]), function(sink) {
            isDefined(value) && sink(toEvent(value));
            sink(End);
        });
    };
    var $$never = $s.once(), equals = function(a, b){ return a === b; };
    var makeStream = function(x){
        return isStream(x) ? x : $s.once(x);
    };
    var flatMap_ = function(root, f, firstOnly, limit) {
        var rootDep = [root];
        var childDeps = [];
        var desc = new Desc("flatMap" + (firstOnly ? "First" : ""), [f], root);
        var result = new Stream(desc, function(sink) {
            var composite = new CompositeUnsubscribe();
            var queue = [];
            var spawn = function(event) {
                var child = makeStream(f(event.value()));
                childDeps.push(child);
                return composite.add(function(unsubAll, unsubMe) {
                    return child.dispatcher.subscribe(function(event) {
                        if (event._isEnd) {
                            remove(child, childDeps);
                            checkQueue();
                            checkEnd(unsubMe);
                            return $s.noMore;
                        } else {
                            if (event && event._isInitial) {
                                event = new Next(event);
                            }
                            var reply = sink(event);
                            if (reply === $s.noMore) {
                                unsubAll();
                            }
                            return reply;
                        }
                    });
                });
            };
            var checkQueue = function() {
                var event = queue.shift();
                if(event) return spawn(event);
            };
            var checkEnd = function(unsub) {
                unsub();
                if(!composite.count()) return sink(End);
            };
            composite.add(function(__, unsubRoot) {
                return root.dispatcher.subscribe(function(event) {
                    if(event._isEnd) return checkEnd(unsubRoot);
                    if(event._isError) return sink(event);
                    if(firstOnly && composite.count() > 1) return $s.more;
                    if(composite.unsubscribed) return $s.noMore;
                    return limit && composite.count() > limit ? queue.push(event) : spawn(event);
                });
            });
            return composite.unsubscribe;
        });
        result.internalDeps = function() {
            return childDeps.length ? rootDep.concat(childDeps) : rootDep;
        };
        return result;
    };
    var fromCallback = withMethodCallSupport(function(f){
        var genStream = function(){
            var args = slice.call(arguments);
            return $s.fromBinder(function(handler){
                makeFunction(args)(handler);
            });
        }.bind(undefined, function(values, callback){
            return f.apply(undefined, values.concat([callback]));
        });
        var args = slice.call(arguments, 1);
        return withDesc(["", [f].concat(args)], combineAsArray(args).flatMap(genStream));
    });
    function fromArray(values) {
        if(!values.length) return $$never;
        var i = 0;
        return new Stream(new Desc("", [values]), function(sink){
            var unsubd = false;
            var reply = $s.more;
            var pushing = false;
            var pushNeeded = false;
            var push = function(){
                pushNeeded = true;
                if(pushing) return;
                pushing = true;
                while(pushNeeded){
                    pushNeeded = false;
                    if(reply !== $s.noMore && !unsubd){
                        var value = values[i++];
                        reply = sink(toEvent(value));
                        if(reply !== $s.noMore){
                            i === values.length ? sink(End) : UpdateBarrier.afterTransaction(push);
                        }
                    }
                }
                return pushing = false;
            };
            push();
            return function(){
                return unsubd = true;
            };
        });
    }
    function combineAsArray(){
        var streams = argumentsToArray(arguments);
        var len = streams.length, f = isFunction(streams[len-1]) ? streams.splice(len-1)[0] : function(){
            return slice.call(arguments);
        };
        if(!streams.length) return $s.constant([]);
        var sources = map(streams, function(stream){
            return stream._isSource ? stream : new Source(isStream(stream) ? stream : $s.constant(stream), true, false, true);
        });
        return $s.when(sources, f);
    }
    $$.fn.s = function(eventName, selector){
        var that = this;
        return withDesc(["domevent", [eventName], this], $s.fromBinder(function(handler) {
            that.on(eventName, selector, handler);
            return function() {
                return that.off(eventName, selector, handler);
            };
        }));
    };
    $s.merge = function(){
        var streams = argumentsToArray(arguments);
        if(!streams.length) return $$never;
        return new Stream(new Desc("merge", streams), function(sink) {
            var ends = 0;
            var smartSink = function(obs) {
                return function(unsubBoth) {
                    return obs.dispatcher.subscribe(function(event) {
                        if (event._isEnd) {
                            return ++ends === streams.length ? sink(End) : $s.more;
                        } else {
                            var reply = sink(event);
                            if (reply === $s.noMore) {
                                unsubBoth();
                            }
                            return reply;
                        }
                    });
                };
            };
            var sinks = map(streams, smartSink);
            return new CompositeUnsubscribe(sinks).unsubscribe;
        });
    };
    if(!this.$$) this.$$ = $$;
}).call(this);

(function($$, genFunc, undefined){
    if($$.expr) return;
    var isStrict, fnCache = {}, win = this;
    var hasProp = Object.prototype.hasOwnProperty;
    var lowercase = function(string){return isString(string) ? string.toLowerCase() : string;}
    var safeRegExp = /(^|\s|[\(,;])([\w\.\[\]]+)\?(?=$|\s*[\),;])/g, safeExpr = function(expr){
        return expr.replace(safeRegExp, "$1(typeof $2=='undefined'?null:$2)");
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
    var sWithFunc = function(model, obj, debug){
        return $$.reduce(model.split('^'), null, function(stream, expr, i){
            if(stream) stream = stream.fetch();
            stream = withFunc(expr, stream || obj, debug);
            return stream;
        });
    }
    var SPLITER = /\s*;\s*/,
    EXPRESSER = /(\\?)\{\!?\{(.+?)\}\}/,
    EVENTSPLITER = /[;\s]+/;
    var utils = $$.utils, rAF = utils.rAF, dom = $$.dom, msie = utils.msie, extend = $$.extend, slice = [].slice;
    var forEach = $$.each, isObject = $$.isObject, isNumber = $$.isNumber, isString = $$.isString, isArray = $$.isArray, isFunction = $$.isFunction, $q = $$.q, classList = $$.classList, isDefined = $$.isDefined, ajax = $$.ajax, Promise = $$.Promise;
    var getDefaultVal = function(defaultval, match){return defaultval != null ? defaultval : (match.substr(1,1) == '!' ? '' : match);};
    var escapes = {
        "'":      "'",
        '\\':     '\\',
        '\r':     'r',
        '\n':     'n',
        '\t':     't',
        '\u2028': 'u2028',
        '\u2029': 'u2029'
    };
    var spliceItem = function(arr, item){
        if(isArray(arr)){
            var idx = arr.indexOf(item);
            if(~idx) arr.splice(idx, 1);
        }
    }
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
    var tagLC = function(node){return node && isString(node.tagName) ? node.tagName.toLowerCase() : ''}
    function stringify(obj){return typeof obj == 'object' && obj && !obj.alert ? JSON.stringify(obj) : obj;}
    function isEmptyNode(node){
        return node.nodeType == 1 && node.innerHTML.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s+/, '') === '';
    }
    function wanderDom(wrap, fn, fn2, procWrapOrNot){
        if(wrap.nodeType !== 1 || tagLC(wrap) == 'textarea'){
            return wrap;
        }
        if(procWrapOrNot) {
            wrap = fn(wrap);  //处理<html>
            if(!wrap) return false;
        }
        var node = wrap.firstChild, _node;
        while(node){ //处理子节点
            var nodeType = node.nodeType;
            var nextNode = node.nextSibling;
            if(nodeType == 1 && fn){
                _node = fn(node);
                if(_node){ //返回false表示不处理孙节点; 返回临时空节点可用来跳过
                    if(tagLC(_node) != 'script'){
                        wanderDom(_node, fn, fn2);
                    }
                    nextNode = _node.nextSibling;
                }
            }else if(nodeType == 3 && fn2){
                fn2(node);
            }
            node = nextNode;
        }
        return wrap;
    }
    function getNodeAttrs(node){
        var attrs = {}, str = node.outerHTML;
        var result, name, val;
        if(str){
            var hits = 0;
            var attrMatcher = /((\S+?)=(['"])(.*?)\3|[^>\s]+)\s*(\/?\s*>)?/g;
            while((result = attrMatcher.exec(str))){
                name = result[2];
                val = result[4];
                if(!name){
                    var tmparr = result[1].split("=");
                    name = tmparr[0];
                    val = tmparr[1] || "";
                }
                if(hits++) attrs[name] = val.replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<');
                if(result[5]) break;
            }
        }else if(node.attributes){
            forEach(node.attributes, function(item){
                attrs[item.name] = item.value;
            });
        }
        return attrs;
    }
    var observableProto = {
        $on: $$.on,
        $off: $$.off,
        $once: $$.once,
        $emit: $$.emit,
        $extend: $extend
    };
    function observableObj(){
        var scope = Object.create(observableProto);
        scope.$msg = {};
        return scope;
    }
    function getPluginPromise(node, value, data){
        var allPromise = [];
        value = value || node.getAttribute("bd-plugin");
        if(isObject(value)){
            var scope = observableObj(), def = value;
            if(isNumber(def.depInject.exportIdx)) def.depInject[def.depInject.exportIdx] = scope;
            def.fn.apply(scope, def.depInject);
            extend(true, parseState(scope, node.getAttribute("bd-plugin-state")), data);
            scope.init && scope.init($$(node));
            allPromise.push($q.ref(scope));
        }else if(isString(value)){
            forEach(value.trim().split(SPLITER), function(file){
                file = fullName(file, null, true);
                if(/\.css$/i.test(file)){
                    amdLoader.createLink(file);
                }else{
                    var promise = amdLoader.makeDefer(file).promise;
                    allPromise.push(promise.then(function(def){
                        var scope = observableObj();
                        if(isNumber(def.depInject.exportIdx)) def.depInject[def.depInject.exportIdx] = scope;
                        def.fn.apply(scope, def.depInject);
                        extend(true, parseState(scope, node.getAttribute("bd-plugin-state")), data);
                        isFunction(scope.init) && scope.init($$(node));
                        return scope;
                    }));
                }
            });
        }
        return dom.data(node, "_b$pluginPromise", allPromise.length == 1 ? allPromise[0] : $q.all(allPromise));
    }
    dom.plugin = function(node, file, data){
        if(!isString(file) && !isObject(file)){
            return dom.data(node, "_b$pluginPromise");
        }else{
            return getPluginPromise(node, file, data);
        }
    };
    $$.fn.plugin = function(file, data){
        var defer = $q.defer(),
            that = this,
            promises = [];
        $$.ready(function(){
            forEach(that, function(node){
                promises.push(dom.plugin(node, file, data));
            });
            $q.all(promises).then(function(result){
                defer.resolve(result);
            });
        });
        return defer.promise;
    };
    var _viewDirectives = {
        'bd-show': function(node, str, scope){
            var show = function(val){
                dom[val ? "show" : "hide"](node);
            };
            return scope.$view(str, show);
        },
        'bd-hide': function(node, str, scope){
            var hide = function(val){
                dom[val ? "hide" : "show"](node);
            };
            return scope.$view(str, hide);
        },
        'bd-visible': function(node, str, scope){
            var show = function(val){
                node.style.visibility = val ? "visible" : "hidden";
            };
            return scope.$view(str, show, true);
        },
        'bd-hidden': function(node, str, scope){
            var hide = function(val){
                node.style.visibility = val ? "hidden" : "visible";
            };
            return scope.$view(str, hide, true);
        },
        'bd-value': function(node, str, scope){
            var setVal = function(val){
                dom.val(node, val);
            };
            return scope.$view(str, setVal, true);
        },
        'bd-class': function(node, str, scope){
            var toggleCls = function(val, _val){
                classList.batch(node, val, _val);
            };
            if(isString(str)){
                var exprs = [];
                str = str.replace(/[\w\-]*{{.+?}}[\w\-]*/g, function(match){
                    exprs.push(match);
                    return '';
                });
                classList.batch(node, str);
                str = exprs.join(' ');
            }
            if(str) return scope.$view(str, toggleCls);
        },
        'bd-style': function(node, str, scope){
            if(isString(str)){
                str = str.trim();
                if(!str) return null;
                var setStyle = function(val, _val){
                    node.style.cssText = node.style.cssText.replace(";"+_val, "") + ";" + val;
                };
                if(/{{(.+?)}}/.test(str)){
                    return scope.$view(str, setStyle);
                }else{
                    dom.css(node, str);
                }
            }
        }
    }
    function getTmpl(node, isScript, nullnode, html){
        if(isScript) {
            var fn = template.parse(node.innerHTML.trim());
            html = function(){ //忽略替换时的出错
                var result = '';
                try{result = fn.apply(this, arguments)}catch(e){console.error(e)};
                return result;
            }
        }else{
            dom.before(nullnode, node);
            var div = document.createElement("div");
            div.appendChild(node);
            html = div.innerHTML.replace(/&amp;/g, '&');
            dom.remove(node);
        }
        if(!nullnode.parentNode){
            dom.replace(nullnode, node);
        }
        return html;
    }
    var _directives = {
        "bd-role": function(scope, node, value){
            var widget = this,
                roles = widget.__roles;
            forEach(value.split(/\s+/), function(roleid){
                if(!roleid) return;
                if(!roles[roleid]) roles[roleid] = [];
                roles[roleid].push(node);
            });
        },
        "bd-model": function(scope, node, expr, destroys){//control->model单向绑定
            var widget = this,
            models = widget.models;
            var item = models.add(node, expr.replace(/^\s*{{(.*?)}}\s*$/, "$1"), scope);
            destroys.push(function(){
                models.remove(item);
            });
        },
        "bd-if": function(scope, node, expr, destroys){
            var widget = this;
            dom.data(node, "_b$ifed", true);
            if(isString(expr)){
                expr = expr.replace(/^\s*{{(.*?)}}\s*$/, "$1");
                if(tagLC(node) == "script"){
                    return _directives["bd-repeat"].call(widget, scope, node, "", destroys, true);
                }
                var txtNode = document.createTextNode(""),
                enable = true,
                compiled = false,
                neDestroy = dom.data(node, "bd-destroy");
                dom.after(txtNode, node);
                if(isArray(neDestroy)){
                    neDestroy.push(function(){
                        dom.remove(txtNode);
                    });
                }
                var update = function(val){
                    if(enable && !val){
                        dom.remove(node);
                        enable = false;
                    }else if(!enable && val){
                        dom.before(node, txtNode);
                        enable = true;
                    }
                    if(enable && !compiled){
                        compiled = true;
                        widget.$refresh2 = true;
                        widget.wander(node, scope, true);
                        widget.compile(node);
                    }
                }
                destroys.push(scope.$view(expr, update));
                update(scope.$parse(expr));
                return txtNode;
            }
        },
        "bd-html": function(scope, node, expr, destroys){
            var widget = this;
            if(expr){
                var update = function(val, _val){
                    if(!isDefined(val)) val = '';
                    if(msie <= 9 && /tr|thead|tbody|tfoot/.test(tagLC(node))){
                        forEach(node.children, function(child){
                            node.removeChild(child);
                        });
                        node.appendChild(dom.create(val));
                    }else{
                        node.innerHTML = val;
                    }
                    if(val && ~val.toString().indexOf('<')){
                        widget.wander(node, scope);
                        widget.compile(node);
                        widget.$refresh2 = true;
                    }
                }
                destroys.push(scope.$view(expr, update, false, $$.debug && ~expr.indexOf('(')));
            }
        },
        "bd-text": function(scope, node, expr, destroys){
            if(expr){
                var update = function(val, _val){
                    node[msie<9?'innerText':'textContent'] = isDefined(val) ? val : '';
                }
                destroys.push(scope.$view(expr, update, false, $$.debug && ~expr.indexOf('(')));
            }
        },
        "bd-state-extend": function(scope, node, expr, destroys){
            var widget = this, widgetScope = widget.scope;
            if(expr){
                node.removeAttribute("bd-state-extend");
                var update = function(val, _val){
                    var subWidget = $$.widget(node);
                    if(val && subWidget){
                        subWidget.prepared(function(){
                            extend(true, subWidget.scope.state, val);
                        });
                    }
                }
                destroys.push(scope.$view(expr, update, true, $$.debug && ~expr.indexOf('(')));
            }
        },
        "bd-on": function(scope, node, expr, destroys){
            var widget = this,
            widgetScope = widget.scope,
            result;
            var subWidget = $$.widget(node);
            if(expr && subWidget){
                while ((result = PROPSPLITER.exec(expr)) !== null) {
                    var msg = result[1];
                    var fn = (function(val){return function(){
                        var _fn = withFunc(val, widgetScope, true);
                        if(isFunction(_fn)) _fn.apply(widgetScope, arguments);
                    }})(result[2]);
                    subWidget.on(msg, fn);
                    destroys.push(function(){
                        subWidget.off(msg, fn);
                    });
                }
            }
        },
        "bd-extend": function(scope, node, expr, destroys){
            var widget = this,
            widgetScope = widget.scope;
            if(expr && /^\s*{{(.*?)}}\s*$/.test(expr)){
                node.removeAttribute("bd-extend");
                var update = function(val, _val){
                    var subWidget = $$.widget(node);
                    subWidget && subWidget.extend(false, val);
                }
                widgetScope.$watch(expr, update, scope, true);
                destroys && destroys.push(function(){
                    widgetScope.$unwatch(expr, update, scope);
                });
            }
        },
        "bd-options": function(scope, node, expr, destroys){
            var widget = this;
            node.removeAttribute("bd-options");
            if(node.options){
                var olen = node.options.length; //静态options
                var update = function(arr/*, _arr*/){
                    while(olen < node.options.length){
                        node.remove(olen);
                    }
                    createOptions(node, widget, arr);
                }
                destroys.push(scope.$view(expr, update, true));
            }
        },
        "bd-foreach": function(scope, node, value, destroys){
            var widget = this;
            node.removeAttribute('bd-foreach');
            return _directives['bd-repeat'].call(widget, scope, node, value, destroys, true);
        },
        "bd-recurse": function(scope, node, value, destroys){
            if(!hasProp.call(scope, '$recurse')) return;
            var $recurse = scope.$recurse;
            if(!value || value.indexOf($recurse.key + '.') == -1) return;
            //空节点占位
            var nullnode = document.createTextNode("");
            dom.replace(nullnode, node);
            var widget = this,
            viewItem = {
                fn: {
                    node: [nullnode],
                    key: $recurse.key,
                    attr: $recurse.attr,
                    isJoin: $recurse.isJoin
                },
                scope: scope,
                type: 'repeat',
                expr: value
            };
            destroys.push(widget.views.add(viewItem, widget.isReady));
            if(!destroys.subnode) destroys.subnode = [];
            return nullnode;
        },
        "bd-repeat": function(scope, node, value, destroys, isJoin){
            var widget = this,
            isScript = tagLC(node) == 'script';
            if(!isJoin && !value) return false;
            if(!isScript && isJoin) throw("bd-foreach should be used in script.");//deprecated: 非script标签中使用了bd-foreach
            var html, nullnode = document.createTextNode("");
            if(isArray(node)){
                dom.before(nullnode, node[0]);
                var fragment = document.createDocumentFragment();
                forEach(node, function(_node){
                    fragment.appendChild(_node);
                });
                node = fragment;
            }else{
                node.removeAttribute('bd-repeat');
            }
            var fn = {
                node: [nullnode],
                attr: getTmpl(node, isScript, nullnode),
                isJoin: isJoin,
                destroys: destroys
            };
            var viewItem = {
                fn: fn,
                scope: scope,
                type: "repeat"
            }
            if(isScript){
                var cond = node.getAttribute("bd-if");
                if(isString(cond)){
                    fn.cond = cond.replace(/^\s*{{(.*?)}}\s*$/, "$1");
                }
            }
            if(/^\s*(\S+)\s+in\s+(.*)/.test(value)){
                fn.key = RegExp.$1;
                viewItem.expr = RegExp.$2;
            }else{
                viewItem.expr = value;
            }
            var viewDestroy = widget.views.add(viewItem, widget.isReady);
            destroys.push(viewDestroy);
            dom.data(node, "_b$selfcide", function(){
                viewDestroy();
                forEach(fn.node, function(nodeList){
                    forEach(nodeList, dom.remove);
                });
            });
            if(!destroys.subnode){
                destroys.subnode = [];
            }
            return nullnode;
        },
        'bd-s': function(scope, node, str, destroys){
            var key, i = 0, nullnode = document.createTextNode("");
            var isScript = tagLC(node) == 'script';
            var tmpl = getTmpl(node, isScript, nullnode);
            if(/^\s*(\S+)\s+in\s+(\S.*)/.test(str)){
                key = RegExp.$1;
                str = RegExp.$2;
            }
            var stream = scope.$parse(str);
            if(stream && stream._isStream){
                var fn = function(obj){
                    var repeatScope = Object.create(scope);
                    if(key){
                        repeatScope[key] = obj;
                    }else{
                        extend(repeatScope, isObject(obj) ? obj : {__val: obj});
                    }
                    repeatScope.__i = i++;
                    var html = isScript ? tmpl(repeatScope)
                        : key ? tmpl : template.replace(tmpl, repeatScope);
                    var frag = dom.create(html);
                    if(scope.$widget){
                        forEach(frag.childNodes, function(node){
                            scope.$widget.wander(node, repeatScope, true);
                            if(!dom.data(node, "_b$ifed")){
                                scope.$widget.compile(node);
                            }
                        });
                        repeatScope.$view();
                        if(scope.__views) forEach(repeatScope.__views, function(v){
                            v.scope = repeatScope;
                            scope.__views.push(v);
                        });
                        delete repeatScope.__views;
                    }
                    dom.before(frag, nullnode);
                }
                stream.on(fn, true);
                destroys.push(stream.off.bind(stream, fn));
            }
            return nullnode;
        },
        "bd-repeat-start": function(scope, node, value, destroys){
            var widget = this;
            var match = false, nodes = [node];
            node.removeAttribute('bd-repeat-start');
            while((node = node.nextSibling)){
                nodes.push(node);
                if(node.getAttribute && isString(node.getAttribute("bd-repeat-end"))){
                    node.removeAttribute('bd-repeat-end');
                    match = true;
                    break;
                }
            }
            if(match){
                return _directives['bd-repeat'].call(widget, scope, nodes, value, destroys);
            }else{
                return true;
            }
        }
    };
    var directives = {};
    $$.directive = function(name, fn, fn2){  //fn.call(widget, scope, node, value)
        if(!isFunction(fn) && isFunction(fn2)){
            fn = function(scope, node, expr){
                return scope.$view(expr, fn2.bind(scope, node));
            }
        }
        if(name && isFunction(fn)) {
            directives[name] = fn;
        }else{
            return directives[name];
        }
    }
    function $extend(){
        var deep = true;
        var args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
        if(typeof args[0] == 'boolean') deep = args.shift();
        return extend.apply(this, [deep, this].concat(args));
    }
    function inheritScope(scope, value){
        return isArray(value) ? value :
            extend(Object.create(scope), isObject(value) ? value : {__val:value});
    }
    function watchRefresh(fns, debug, run){
        var that = this, orig = fns.orig || fns;
        var expr = fns.expr, withExpr, index = expr ? expr.indexOf('^') : -1;
        var __i = fns.__i || 0; //^分隔层级
        if(index > -1){
            if(/{{.*?\^/.test(expr)){
                expr = fns.expr = expr.replace(/{{\s*(\S+)\s*\^(.*?)}}/g, function(match, _expr, _withExpr){
                    that._$$ ? that._$$++ : (that._$$ = 1);
                    var value = that.$parse(_expr), key = '_$$'+that._$$;
                    if(value && value._isStream){
                        value.on(function(data){
                            that[key] = that.$parse(_withExpr, inheritScope(that, data));
                            if(fns.inited) watchRefresh.call(that, fns, debug, true);
                        }, true);
                    }else{
                        that[key] = that.$parse(_withExpr, inheritScope(that, value));
                    }
                    return "{{"+key+"}}";
                });
            }else{
                fns.withExpr = expr.substr(index+1);
                expr = fns.expr = expr.substr(0, index);
            }
        }
        var value = fns.stream ? fns.stream.fetch() : that.$parse(expr, fns.scope||that);
        if(!fns.stream && value && value._isStream){
            fns.stream && fns.stream.off(fns.binder);
            fns.stream = value;
            fns.binder = watchRefresh.bind(that, fns, debug, true);
            return value.on(fns.binder, true).off.bind(value, fns.binder);
        }
        if(run === false) return;
        if(fns.withExpr){
            index = fns.withExpr.indexOf('^');
            var scope = inheritScope(this, value);
            var _fns = orig[++__i] || (orig[__i] = {
                __i: __i,
                orig: orig
            });
            if(_fns.stream){
                _fns.stream.off(_fns.binder);
                delete _fns.stream;
            }
            if(index > -1){
                _fns.expr = fns.withExpr.substr(0, index);
                _fns.withExpr = fns.withExpr.substr(index+1);
                _fns.scope = scope;
                return watchRefresh.call(this, _fns, debug);
            }
            value = scope ? this.$parse(fns.withExpr, scope) : scope;
            if(value && value._isStream){
                if(!_fns.stream){
                    _fns.stream = value;
                    _fns.binder = watchRefresh.bind(this, _fns, debug);
                    value.on(_fns.binder, true);
                    return value.off.bind(_fns.binder);
                }
                return;
            }
        }
        if(orig.type){
            orig.fn.stream = fns.stream;
            orig.fn.withExpr = fns.withExpr;
            return updateViews[orig.type](orig, orig.scope.$widget);
        }
        var cache = stringify(value),
            _value = fns.cache;
        if(!fns.inited || cache !== _value){
            fns.cache = cache;
            fns._value = value;
            fns.inited = true;
            if(isArray(orig.fn)){
                var node = orig.fn[0], attrName = orig.fn[1];
                if(node && attrName && node.parentNode){
                    var nodeType = node.nodeType;
                    if(nodeType == 3){ //text node
                        node.nodeValue = value;
                    }else if(nodeType == 1){ //html node
                        if(value === fns.expr){
                            node.removeAttribute(attrName);
                        }else{
                            dom.attr(node, attrName, value);
                        }
                    }
                }
            }else if(orig.fn){
                orig.fn(value, _value);
            }
        }
    }
    function Scope(){}
    Scope.prototype = extend(Object.create(observableProto), {
        $reverse: function(arr){
            return extend([], arr).reverse();
        },
        $sort: function(arr, expr, reverse){
            var fn = isFunction(expr) ? expr : function(a, b){
                var flag = reverse ? -1 : 1;
                return a[expr] < b[expr] ? -flag : flag;
            }
            return arr.sort(fn);
        },
        $filter: function(arr, fn){
            return !arr || !fn ? arr : $$.filter(arr, fn);
        },
        $watch: function(expr, fn, scope, instant){
            expr = expr.replace(/^\s*{{([^}]*?)}}\s*$/, "$1");
            var widgetScope = hasProp.call(this, '$widget') ? this.$widget.scope : this;
            if(!hasProp.call(widgetScope, '__watches')){
                widgetScope.__watches = [];
            }
            if(!isArray(this.__watches) || !isFunction(fn)) return;
            var item = {
                fn: fn,
                expr: expr,
                scope: scope || this
            }
            this.__watches.push(item);
            instant && watchRefresh.call(scope, item);
        },
        $unwatch: function(expr, fn, scope){
            var i;
            expr = expr.replace(/^\s*{{([^}]*?)}}\s*$/, "$1");
            for(i = 0; i < this.__watches.length; i ++){
                var item = this.__watches[i];
                if(item.expr == expr && item.scope == scope && (!fn || item.fn == fn)){
                    this.__watches.splice(i--, 1);
                }
            }
        },
        $view: function(expr, fn, instant, debug){
            var views = hasProp.call(this, '__views') ? this.__views : (this.__views = []), scope = this;
            if(arguments.length == 0){
                forEach(views, function(item){
                    !item.stream && watchRefresh.call(scope, item);
                });
                return;
            }
            expr = expr.replace(/^\s*{{([^}]*?)}}\s*$/, "$1");
            if(!isArray(views) || !fn) return;
            var item = { fn: fn, expr: expr };
            views.push(item);
            return watchRefresh.call(this, item, debug, !!instant) || function(){
                for(var i = 0; i < views.length; i ++){
                    if(views[i] == item) views.splice(i--, 1);
                }
            }
        },
        $parse: function(expr, scope, debug){
            scope = scope || this;
            return ~expr.indexOf('}}') ? template.replace(expr, scope) : withFunc(expr, scope, debug);
        },
        $exec: function(expr, scope){
            return genFunc(expr, true)(scope || this);
        },
        $cancel: function(){ return false; },
        $refresh: function(delay){ //scope.$refresh
            var scope = this,
                widget = scope.$widget;
            if(hasProp.call(scope, '$refreshing') && scope.$refreshing){
                widget.$refresh2 = true;
                return;
            }
            scope.$refreshing = 1;
            if(hasProp.call(scope, '__watches')) forEach(scope.__watches, function(item){ //默认widget.scope
                watchRefresh.call(item.scope || scope, item);
            });
            widget.views && widget.views.refresh(); //bd-repeat ..
            if(widget.models && widget.models.items.length){
                widget.models.refresh();
            }
            scope.$view();
            forEach(widget.children, function(subwidget){
                subwidget.isReady && subwidget.refresh();
            });
            scope.$refreshing = 0;
            if(widget.$refresh2){
                widget.$refreshed = true;
                widget.$refresh2 = false;
                scope.$refresh();
                widget.isReady && widget.updateRoles();
            }else if(widget.$refreshed){ //views有更改
                widget.$refreshed = false;
                widget.emit("refreshed");
                $$.widget.spy("refreshed", widget);
            }
        }
    });
    var urlParsingNode = document.createElement('a');
    var originUrl = urlResolve(window.location.href);
    function urlResolve(url) {
        urlParsingNode.setAttribute('href', url);
        return {
            href: urlParsingNode.href,
            host: urlParsingNode.host,
            pathname: (urlParsingNode.pathname.charAt(0) === '/') ?
                urlParsingNode.pathname
                : '/' + urlParsingNode.pathname
        };
    }
    
    var UPPATH_NORM = /(^|\/)\w[^\/;,]*?\/\.\.\//;
    var UPPATH_RE = /^\.\.\/(.*)/;
    var FLOAT_RE = /^\-?([1-9][0-9]*|0)(\.[0-9]+)?$/;
    var PATH_TAIL_RE = /[^\/]+?\/?$/;
    var PROPSPLITER = /([^;\s]+?)\s*[=:]\s*([^;]*)/g;
    var MODELEXPR_RE = /(?:^|\.)(.+?)(?=\[|\.|$|\()|\[(['"]?)(.+?)\2\]/g;
    var depSrcs = {};
    function fullNames(arr, relpath){ //处理依赖列表
        forEach(arr, function(file, i){
            var depFiles = [];
            forEach(file.split(SPLITER), function(_file){
                _file = _file.indexOf("//") == -1 ? fullName(_file, relpath) : _file;
                depFiles.push(_file);
                depSrcs[_file] = relpath;
            });
            arr[i] = depFiles.join(';');
        });
    }
    function fullName(path, relpath, force){
        //相对js地址转成绝对路径
        var prefix = "";
        if(relpath && relpath.indexOf('%') === 0){
            relpath = "";
        }
        if(/^([a-z]*\!)(\S+)/.test(path)){
            prefix = RegExp.$1;
            path = RegExp.$2;
        }
        //替换别名
        if(path.substr(0,1) == '%') return prefix + path;
        if(pathAlias[path]){
            path = pathAlias[path];
        }else if(force || path.substr(0, 1) == '/'){
            for(var alias in pathAlias){
                if(/\/$/.test(alias) && path.indexOf(alias) === 0){
                    path = path.replace(alias, pathAlias[alias]);
                    break;
                }
            }
        }
        if(path == 'exports' || amdLoader._defers[path] || lazyDefines[path]) return prefix + path;
        if(!/^(\/\/|http)/.test(path)){
            if(path.indexOf("/") !== 0){ //相对路径
                var _path = relpath || originUrl.pathname; //_path以/结尾
                if(/\/[^\/]+$/.test((relpath || originUrl.href || '').replace(/[#\?].*/, ''))){
                    _path = _path.replace(PATH_TAIL_RE, '');
                }
                while(UPPATH_RE.test(path)){
                    path = RegExp.$1;
                    _path = _path.replace(PATH_TAIL_RE, '');
                }
                path = _path + path;
            }else if(isString(relpath) && /(.*\/\/\S+?)\//.test(relpath)){
                var host = RegExp.$1;
                path = host + path;
            }
        }
        //非cdn域名换成$$.debug
        if(isString($$.debug) && !/cache.netease|163.com|126.net/.test(path)){
            path = path.replace(/https?:\/\/.*?\//, "/")
                .replace(/^\//, $$.debug + "/");
        }
        if(/\/\w+$/.test(path)) path += '.js';
        return prefix + normalizePath(path);
    }
    function normalizePath(_path){
        var path = _path.replace(/\/\.\//g, '/');
        while((_path = path.replace(UPPATH_NORM, '$1'))){
            if(_path == path){
                break;
            }else{
                path = _path;
            }
        }
        return path;
    }
    function Widget(){ //组件生成函数
        this._readyDefer = $q.defer();
        this._preparedDefer = $q.defer();
        this._readyDefer.promise.then(function(widget){
            widget.isReady = true;
        });
        this.children = [];
    }
    var widgetCache = {};
    var _widgetCounter = 1;
    Widget.create = function(wrap, parent, defname){ //创建widget对象(未执行构造器函数)
        var widget;
        if(wrap){
            var widgetId;
            var nodeId = wrap[dom._idname];
            if(nodeId && widgetCache[nodeId]){
                widget = widgetCache[nodeId];
            }else{
                widget = new Widget;
                if(widgetId){
                    widgetCache['#' + widgetId] = widget;
                }
            }
            var guid = '$$' + (!defname && wrap == document.documentElement ? 0 : _widgetCounter++);
            dom.data(wrap, "bd-wguid", widget.guid = guid); //实例化完成
            widgetCache[guid] = widget;
            widget.$root = $$(wrap);
            if(parent){
                widget.parent = parent;
                parent.children.push(widget);
            }
            if(defname){
                if(!widgetCache[defname]) widgetCache[defname] = [];
                widgetCache[defname].push(widget);
            }
        }else{ //rootWidget
            widget = new Widget;
            widget.scope = $$.rootScope;
            widget.scope.$widget = widget;
            widget.views = new Views(widget);
            widget.models = new Models(widget);
            widget.update = $$.rootScope.$update = widget.models.update.bind(widget.models);
        }
        widget.__roles = {};
        widget.roles = {};
        widget.constructor = Widget;
        return widget;
    };
    Widget.shortName = function(name){
        return name.replace(/.*\//, '').replace(/\..*/, '');
    };
    function compile(rootWrap, parentWidget, destroys){
        if(!$$.debug && /\bdebug=(\S+?)($|&|#)/.test(location.href)){ //打包的模块无$$.debug前缀
            var debug = RegExp.$1;
            if(debug == 'noCompile') return;
            if(debug == 'strict') isStrict = true;
            $$.debug = debug.substr(0,4) == 'http' ? debug : true;
        }
        var moduleWraps = [];
        if(!parentWidget) parentWidget = rootWidget;
        if(!rootWrap){
            moduleWraps.push(document.documentElement);
        }else if(!dom.data(rootWrap, "bd-wguid") && isString(rootWrap.getAttribute("bd-module"))){
            moduleWraps.push(rootWrap);
        }else{
            wanderDom(rootWrap, function(node){
                var benchname = node.getAttribute("bd-benchmark");
                if(isString(benchname)){
                    node.removeAttribute("bd-benchmark");
                    ($$.widget(node) || $$).ready(function(){
                        $$.bench.mark(benchname);
                    });
                }
                if(isString(node.getAttribute("bd-module"))){
                    moduleWraps.push(node);
                    return false; //不取子模块
                }
                return node; //递归取子模块
            });
        }
        var widgets = [];
        forEach(moduleWraps, function(wrap){
            var widget;
            if(dom.data(wrap, "bd-wguid")){ //compile时跳过已组件化节点，但仍可用load加载
                widget = $$.widget(wrap);
                if(!compile.inited){
                    widget.compile();
                    if(widget.$last && widget.$last.nextSibling) widget.wander(); //wander rest content since first compiled
                }
            }else{
                widget = load(wrap.getAttribute("bd-module") || "", wrap, parentWidget);
            }
            widgets.push(widget);
            if(destroys) destroys.push(function(){widget.destroy();});
        });
        return widgets;
    }
    function load(moduleFile, wrap, parentWidget, data){
        if(!wrap || !wrap.nodeType) return null;
        if(wrap != document.documentElement && !isString(wrap.getAttribute('bd-module'))){
            wrap.setAttribute('bd-module', '');
        }
        moduleFile = moduleFile.replace(/^\s+|\s+$/g, '');
        if(moduleFile){
            if(moduleFile.substr(0, 1) == '@' && parentWidget && parentWidget.scope){ //rel to parentWidget
                var parentPath = parentWidget.scope.$moduleid;
                if(parentPath && parentPath.substr(0, 1) != '%'){
                    moduleFile = parentPath.replace(/[^\/]*?$/, '') + moduleFile.substr(1);
                }else moduleFile = moduleFile.substr(1);
            }
            moduleFile = fullName(moduleFile, null, true);
        }
        var widget = Widget.create(wrap, parentWidget, moduleFile);
        widget.scope = Object.create(parentWidget.scope);
        widget.scope.$msg = {};
        if($$.isObject(data)){
            widget.extend(data);
        }
        getPluginPromise(wrap).then(function(){
            if(!moduleFile){ //void module
                amdLoader.instantiate(null, widget);
                widget.render();
            }else if(/\.html?$/.test(moduleFile)){ //html类型
                amdLoader.instantiate(null, widget);
                loadHtml(moduleFile, widget);
            }else{ //典型组件
                amdLoader.get(moduleFile).deploy(widget, parentWidget);
            }
        });
        return widget;
    }
    function bindEvent(node, event, expr, widget, scope){ //绑定表达式事件
        var fn = function(e){
            var result;
            scope.$event = e;
            e.currentTarget = scope.$target = node;
            if(expr){
                widget.update(function(){
                    var promise = withFunc(expr, scope, true);
                    if(promise === false || promise === -1){
                        e.preventDefault();
                        promise === -1 && e.stopPropagation();
                    }
                });
            }
            return result;
        };
        if(event == 'change'){  //监听模拟元件的value变化
            var nodeWidget = $$.widget(node);
            if(nodeWidget){
                nodeWidget.watch('value', fn);
                return function(){
                    nodeWidget.unwatch('value', fn);
                }
            }
        }
        if(node.getAttribute("bd-model")) dom.unbind(node, event, widget.update); //解绑bd-model中的bind
        dom.bind(node, event, fn);
        return function(){ //事件销毁
            dom.unbind(node, event, fn);
        }
    }
    function loadHtml(file, widget){ //依赖已满足，填充html
        var wrap = widget.$root[0];
        var scope = widget.scope;
        var neTransclude = isString(wrap.getAttribute("bd-transclude"));
        if(neTransclude || isEmptyNode(wrap)){
            widget._empty = true;
            if(neTransclude) wrap.transclude = wrap.innerHTML;
        }
        if(widget._empty){
            var props = parseProps(wrap);
            var injectHtml = function(html){
                //ie9以下需要保证innerHTML开始时有实体元素，否则会丢失script/link/style
                wrap.innerHTML = (msie < 9 ? '<input style="display:none"/>' : '') + template.replace(html, {
                    props: props,  //替换{{props.*}}
                    transclude: wrap.transclude || ""
                }, null, null, /props\.|transclude/);
                if(msie < 9) wrap.removeChild(wrap.firstChild);
                if(/<script/i.test(html)){
                    var scriptPromise = $q.ref();
                    $$("script", wrap).each(function(node){
                        var type = lowercase(node.getAttribute("type"));
                        if(!type || type == 'text/javascript'){
                            var src = node.getAttribute("src");
                            if(src){
                                scriptPromise = scriptPromise.then(function(){
                                    return ajax.require(src);
                                });
                            }else{
                                var script = document.createElement("script");
                                script.innerHTML = node.innerHTML;
                                scriptPromise = scriptPromise.then(function(){
                                    return dom.replace(script, node);
                                });
                            }
                        }
                    });
                }
                widget.render();
            }
            if(hasProp.call(scope, "html")){ //通过预定义或传参获取组件html
                injectHtml(scope.html);
            }else{ //加载组件皮肤
                var skin = props.skin;
                file = /\//.test(skin) ? fullName(skin) : file.replace(/(\.[^\.]*)?$/, (skin ? "." + skin : "") + ".html") + (msie ? '?' + (+new Date) : '');
                delete props.skin;
                htmlLoader.load(utils.buildUrl(file, props), wrap).then(injectHtml);
            }
        }else{
            widget.render();
        }
    }
    var eventsMatcher = /^(click|load|dblclick|contextmenu|key\w+|mouse\w+|touch\w+)/; //可代理事件
    var undelegatableEvents = {}; //不可代理事件
    forEach(['submit', 'load', 'change', 'focus', 'blur', 'mouseenter', 'mouseleave'], function(name){
        undelegatableEvents['bd-' + name] = 1;
    });
    Widget.prototype = {
        _assure: function(fn){
            if(!this.isReady){
                throw('widget is not ready');
            }
            return fn.call(this);
        },
        lazy: function(fn){
            this._lazyPromise = new Promise(fn);
        },
        run: function(){
            var args = slice.call(arguments);
            var parentPath = this.scope.$moduleid;
            if(parentPath && parentPath.substr(0, 1) != '%'){
                $$.each(args[0], function(dep, i){
                    if(dep.substr(0,1) == '@'){
                        args[0][i] = parentPath.replace(/[^\/]*?$/, '') + dep.substr(1);
                    }
                });
            };
            $$.run.apply(null, args);            
        },
        load: function(file, wrap, data, force){
            var widget = this;
            if(wrap && isString(file)){
                if(wrap.nodeType){
                    if(force !== true && wrap.parentNode && !isEmptyNode(wrap)){
                        throw('widget cannot be loaded on existed tree');
                    }
                    return load(file, wrap, widget, data);
                }else if(wrap.length){
                    return $$.map(wrap, function(_wrap){
                        return load(file, _wrap, widget, data);
                    });;
                }
            }
            return null;
        },
        val: function(val){
            if(isDefined(val)){
                this.set('value', val);
            }else{
                return this.scope && hasProp.call(this.scope, 'value') ? this.scope.value : undefined;
            }
        },
        get: function(key){
            return this._assure(function(){
                return this.scope[key];
            });
        },
        set: function(key, val){
            var args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
            return this.ready(function(){
                if(isString(key)){
                    this.scope[key] = val;
                }else{
                    var deep = true;
                    if(typeof args[0] == 'boolean'){
                        deep = args.shift();
                    }
                    extend.apply(this, [deep, this.scope].concat(args));
                }
                this.scope.$refresh();
            });
        },
        setState: function(){
            var args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
            var deep = true;
            if(typeof args[0] == 'boolean'){
                deep = args.shift();
            }
            return this.ready(function(){
                extend.apply(this, [deep, this.scope.state].concat(args));
                this.scope.$refresh();
            });
        },
        roleDelegate: function(events, fnMap){
            var widget = this;
            if(!widget.$root) return widget;
            var wrap = widget.$root[0];
            var dlgs = widget.__roleDelegate || (widget.__roleDelegate = {});
            if(!isObject(fnMap)) return widget;
            if(isString(events)){
                events = events.trim().split(EVENTSPLITER);
            }
            forEach(events, function(event){
                if(!dlgs[event]){
                    dlgs[event] = [];
                    var delg = function(e){
                        var target = e.target, _target = target, result = true;
                        //避免处理子组件
                        while(_target && _target != wrap){
                            if(_target.getAttribute('bd-module')){
                                target = _target.parentNode;
                            }
                            _target = _target.parentNode;
                        }
                        if(_target){  //_target为空表示节点已被删除
                            var evts = [];
                            while(target){
                                var roles = (target.getAttribute("bd-role") || '').split(/\s+/);
                                forEach(dlgs[event], function(roleFn){
                                    if(~roles.indexOf(roleFn.role)){
                                        evts.push({
                                            target: target,
                                            fn: roleFn.fn
                                        });
                                    }
                                });
                                if(target == wrap) break;
                                target = target.parentNode;
                            }
                            evts.length && widget.update(function(){
                                var promise;
                                for(var i = 0; i < evts.length; i ++){
                                    promise = evts[i].fn.call(evts[i].target, e);
                                    if(promise === false || promise === -1){
                                        e.preventDefault();
                                        promise === -1 && e.stopPropagation();
                                        break;
                                    }
                                }
                                return promise;
                            });
                            evts = null;
                        }
                        return result;
                    };
                    widget.$root.bind(event, delg);
                    widget.ready(function(){
                        var neDestroy = dom.data(wrap, "bd-destroy");
                        neDestroy && neDestroy.push(function(){ //事件销毁
                            dom.unbind(wrap, event, delg);
                        });
                    });
                }
                forEach(fnMap, function(fn, role){
                    role && dlgs[event].push({
                        role: role,
                        fn: fn
                    });
                });
            });
            return widget;
        },
        updateRoles: function(cb){
            var widget = this;
            if(!widget.$root) return widget;
            var cbs = widget.__rolecbs || (widget.__rolecbs = []);
            if(isFunction(cb)){
                cbs.push(cb);
                return widget;
            }
            if(widget.isReady){
                var roles = widget.__roles = {};
                var rootWrap = widget.$root[0];
                wanderDom(rootWrap, function(node){
                    var value = node.getAttribute('bd-role');
                    if(value){
                        forEach(value.split(/\s+/), function(roleid){
                            if(!roleid) return;
                            if(!roles[roleid]) roles[roleid] = [];
                            roles[roleid].push(node);
                        });
                    }
                    if(node != rootWrap && isString(node.getAttribute('bd-module'))){
                        return false;
                    }
                    return node;
                });
                for(var key in widget.roles) delete widget.roles[key];
                for(var roleid in widget.__roles){
                    widget.roles[roleid] = $$(widget.__roles[roleid]);
                }
            }
            forEach(cbs, function(cb){
                cb(widget.roles);
            });
            return widget;
        },
        compile: function(wrap, destroys){
            var widget = this, rootWrap = widget.$root && widget.$root[0];
            destroys = destroys || dom.data(rootWrap, "bd-destroy");
            wrap = wrap || rootWrap;
            if(!wrap || wrap.nodeType){
                return compile(wrap, widget, destroys);
            }else if(wrap.length){
                var widgets = [];
                forEach(wrap, function(_wrap){
                    widgets = widgets.concat(compile(_wrap, widget, destroys));
                });
                return widgets;
            }else{
                return [];
            }
        },
        prepared: function(fn){ //依赖已满足，scope已初始化
            var promise = this._preparedDefer ? this._preparedDefer.promise : $q.never;
            if(isFunction(fn)){
                promise.then(fn.bind(this));
                return this;
            }
            return promise;
        },
        replaceWith: function(moduleid, data, clear){ //销毁当前组件，并在根容器上加载新组件
            if(isString(moduleid)){
                var widget = this,
                parent = widget.parent,
                $root = widget.$root;
                widget.destroy(clear);
                load(moduleid, $root[0], parent, data);
            }
        },
        destroy: function(clear){ //销毁组件实例
            var widget = this, scope = widget.scope,
            wrap = widget.$root[0];
            destroyNode(wrap);
            if(!isDefined(clear) || clear) wrap.innerHTML = "";
            var defname = scope.$moduleid;
            spliceItem(widgetCache[defname], widget);
            spliceItem(widget.parent.children, widget);
            scope.$msg = null;
            if(hasProp.call(scope, 'destroy') && isFunction(scope.destroy)) scope.destroy(widget);
            forEach(widget.children, function(subWidget){
                subWidget.destroy(clear);
            });
            forEach(widget, function(v, k){delete widget[k]});
        },
        ready: function(fn){ //依赖已加载, init()之后执行
            var promise = this._readyDefer ? this._readyDefer.promise : $q.never;
            if(isFunction(fn)){
                promise.then(fn.bind(this));
                return this;
            }else{
                return promise;
            }
        },
        extend: function(){
            var widget = this, deep = true;
            var args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
            if(typeof args[0] == 'boolean'){
                deep = args.shift();
            }
            forEach(args, function(arg, i){
                if(isString(arg)){
                    args[i] = amdLoader.getExport(arg) || null;
                }
            });
            widget.prepared(function(){
                extend.apply(widget, [deep, widget.scope].concat(args));
                if(widget.isReady) widget.refresh();
            });
            return widget;
        },
        find: function(moduleId){
            if(!moduleId){
                var result = [];
                forEach(this.children, function(w){
                    result.push(w);
                    forEach(w.find(), function(_w){result.push(_w)});
                });
                return result;
            }
            return $$.widget(moduleId, this);
        },
        isChildOf: function(widget){
            var parent = this.parent;
            while(parent){
                if(parent == widget) return true;
                parent = parent.parent;
            }
            return false;
        },
        render: function(){ //wander->bd-extend->init->ready
            var widget = this, inited;
            if(!widget.$root) return;
            var wrap = widget.$root[0];
            var scope = widget.scope;
            var extendPromises = [], extendFiles = [];
            var userExt = wrap.getAttribute("bd-extend") || "";
            if(!/^\s*{{(.*?)}}\s*$/.test(userExt)){
                var neExtend = userExt.split(SPLITER);
                forEach(neExtend, function(file){
                    if(file){
                        file = fullName(file, null, true);
                        extendFiles.push(file);
                        extendPromises.push(amdLoader.makeDefer(file).promise);
                    }
                });
            }
            $q.all(extendPromises).then(function(){
                if(extendPromises.length){
                    forEach(extendFiles, function(file){ //按顺序extend
                        extend(true, scope, amdLoader.getExport(file)); //bd-extend为深度复制
                    });
                }
                var doInit = function(){
                    if(!inited) inited = true; else return;
                    setTimeout(function(){
                        if(!widget.scope) return; //destroyed
                        forEach(widget.__inits, function(init){
                            init(widget);
                        });
                        if(hasProp.call(scope, 'init') && isFunction(scope.init)){
                            scope.init(widget);
                        }
                        widget.refresh();
                        widget.updateRoles();
                        widget._readyDefer.resolve(widget);
                        $$.widget.spy("inited", widget);
                    });
                };
                (widget._lazyPromise || $q.ref()).then(function(){
                    widget.wander(); //建立model->view, control->model绑定
                    widget.compile(wrap); //处理子模块
                    widget.parent.ready(doInit);
                    setTimeout(doInit, 1000);
                });
            });
        },
        refresh: function(){ //widget.refresh
            this.scope && this.scope.$refresh();
            return this;
        },
        wander: function(wrap, scope, procWrapOrNot, modelScope){ //遍历子节点，与scope关联
            var widget = this,
            isTop = !wrap && widget.parent && widget.parent.guid == '$$0';
            if(isTop && !isDefined(procWrapOrNot)) procWrapOrNot = true;
            wrap = wrap || widget.$root;
            if(wrap && !wrap.nodeType) wrap = wrap[0];
            if(!wrap) return widget;
            var widgetWrap = widget.$root ? widget.$root[0] : wrap;
            scope = scope || widget.scope;
            var eventDelgs, delgWrap = wrap;
            while(delgWrap.parentNode && delgWrap != widgetWrap){
                if(dom.data(delgWrap, "bd-destroy")) break;
                delgWrap = delgWrap.parentNode;
            }
            if(delgWrap.nodeType == 11) delgWrap = widgetWrap; //fragment
            var neDestroy = dom.data(wrap, "bd-destroy");
            if(isArray(neDestroy)){ //销毁历史绑定
                if(wrap != widgetWrap || hasProp.call(widget, 'find')){ //已初始化
                    forEach(neDestroy, function(fn){
                        fn();
                    });
                    neDestroy.splice(0);
                }
            }else if(wrap == widgetWrap){
                dom.data(wrap, "bd-destroy", []);
            }
            var destroys = dom.data(delgWrap, "bd-destroy");
            if(wrap.nodeType == 3){
                var text = wrap.nodeValue;
                destroys.push(scope.$view(text, function(val){
                    wrap.nodeValue = val;
                }));
                return widget;
            }
            if(!destroys) return widget;
            var views = widget.views;
            var props = ['bd-recurse', 'bd-repeat-start', 'bd-repeat', 'bd-foreach', 'bd-options', 'bd-role', 'bd-model', 'bd-html', 'bd-text', 'bd-state-extend', 'bd-extend', 'bd-on', 'bd-s'];//优先处理指令
            if(delgWrap == wrap){
                forEach(dom.data(delgWrap, "_b$dlDestroy"), function(fn){isFunction(fn) && fn();});
                eventDelgs = dom.data(delgWrap, "_b$dlDestroy", {});
            }else{ //在已wander过的父容器中做代理
                eventDelgs = dom.data(delgWrap, "_b$dlDestroy") || dom.data(delgWrap, "_b$dlDestroy", {});
            }
            $$('script[bd-macro]', wrap).each(function(node){ //宏模板
                var html = node.innerHTML,
                    value = node.getAttribute('bd-macro'),
                argNames = [], preDefine = '';
                if(/(.*?)\s*\(\s*(.*?)\s*\)/.test(value)){
                    value = RegExp.$1;
                    argNames = RegExp.$2.split(/\s*,\s*/);
                }
                forEach(argNames, function(arg, i){ //参数默认值
                    var tmpArr = arg.split(/\s*=\s*/);
                    if(tmpArr[1]){
                        argNames[i] = tmpArr[0];
                        preDefine += 'if('+tmpArr[0]+'==null)'+arg+';';
                    }
                });
                if(preDefine) html = '<%'+preDefine+'%>' + html;
                
                var tmpl = template.parse(html);
                saveModel(scope, value, function(){
                    var data = Object.create(this);
                    var args = arguments.length ? slice.call(arguments, 0) : [];
                    var __scopes = this.__scopes;
                    forEach(argNames, function(arg, i){
                        if(arg){
                            data[arg] = isDefined(args[i]) ? args[i] : null;
                        }
                    });
                    var hit = false, str = tmpl(data).replace(/%(\w+)%/g, function(match, name){
                        if(~argNames.indexOf(name)){
                            hit = true;
                            return '__scopes['+__scopes.length+'].' + name;
                        }else{
                            return match;
                        }
                    });
                    if(hit) __scopes[__scopes.length] = data;
                    return str;
                });
                dom.remove(node);
            });
            if(!compile.inited) widget.$last = false;
            var $last = arguments.length == 0 && widget.$last;
            wanderDom(wrap, function(node){ //从上到下遍历，见bd-module即止
                var attrs = getNodeAttrs(node), procRet;
                if(widget.guid == '$$0' && isString(attrs["bd-module"])){
                    if(node != widgetWrap) return false;
                }
                if($last){ //第二次wander，跳过之前处理过的节点
                    if($last == node) $last = undefined;
                    return node;
                }
                widget.$last = !compile.inited && node;
                if(isString(attrs['bd-if']) && !dom.data(node, "_b$ifed")){
                    return _directives['bd-if'].call(widget, scope, node, attrs['bd-if'], destroys);
                }
                var proc = function(fn, value, _scope){
                    var directiveResult = fn.call(widget, _scope||scope, node, value, destroys);
                    if(directiveResult === false){
                        return false;
                    }else if(isFunction(directiveResult)){
                        destroys.push(directiveResult);
                    }else if(directiveResult){
                        node = directiveResult;
                        if(node.nodeType == 1){
                            node.removeAttribute(prop);
                            attrs = getNodeAttrs(node);
                        }else{ //非普通节点(如空文本)
                            return node;
                        }
                    }
                };
                for(var i = 0, len = props.length; i < len; i++){ //优先处理指令
                    var prop = props[i];
                    var value = attrs[prop];
                    if(isString(value) && isFunction(_directives[prop])){
                        procRet = proc(_directives[prop], value, prop=='bd-model'?modelScope:'');
                        if(isDefined(procRet)) { //false, node..
                            return procRet;
                        }
                    }
                }
                for(var name in attrs){
                    if(_directives[name]) continue;
                    var val = attrs[name], trimName = name.substr(3);
                    if(undelegatableEvents[name] || $$.event(trimName)){ //不可代理事件 || 自定义事件
                        if(isString(val)){
                            destroys.push(bindEvent(node, trimName, val, widget, scope));
                        }
                    }else if(eventsMatcher.test(trimName)){ //事件代理
                        if(!eventDelgs[trimName]) eventDelgs[trimName] = 1;
                    }else if(/bd-(href|for|src|title|disabled|checked|selected|read[oO]nly|required)/.test(name)){ //views属性
                        name = RegExp.$1;
                        if(val){
                            if(/{{.+?}}/.test(val)){
                                destroys.push(scope.$view(val, [node, name], true));
                            }else{
                                dom.attr(node, name, val);
                            }
                        }
                    }else if(name.substr(0,3) == 'bd-' && isFunction(_viewDirectives[name])){
                        procRet = _viewDirectives[name](node, val, scope);
                        if(!$$.debug) node.removeAttribute(name);
                        isFunction(procRet) && destroys.push(procRet);
                    }else if(isFunction(directives[name])){ //自定义指令
                        proc(directives[name], val);
                    }else{
                        if(!_directives[name] && name != "bd-module" && /^{{.+?}}$/.test(val)){
                            destroys.push(scope.$view(val, [node, name], true));
                        }
                    }
                }
                if(!isString(attrs["bd-module"]) && attrs["bd-plugin"]){
                    getPluginPromise(node, attrs["bd-plugin"]);
                }
                if(isString(attrs["bd-module"])){
                    if(node != widgetWrap) return false;
                }
                return node;
            }, function(node){ //textNode处理
                widget.$last = !compile.inited && node;
                var text = node.nodeValue;
                if(EXPRESSER.test(text)){
                    if(RegExp.$1 == '\\'){
                        node.nodeValue = text.replace(/\\(\{\!?\{.*?\}\})/g, "$1");
                    }else{
                        destroys.push(scope.$view(text, function(val){
                            node.nodeValue = val;
                        }), true);
                    }
                }
            }, procWrapOrNot);
            forEach(widget.__roles, function(node, roleid){
                widget.roles[roleid] = $$(node);
            });

            forEach(eventDelgs, function(val, name){ //在wrap上绑定代理事件
                if(val !== 1) return;
                var delg = function(e){  //wrap.delegate
                    var target = e.target, _target = target, result = true;
                    //避免处理子组件或bd-repeat内节点
                    while(_target && _target != delgWrap){
                        if(dom.data(_target, "bd-destroy") || dom.data(_target, "_b$dlDestroy")){
                            target = dom.data(_target, "bd-wguid") ? _target : _target.parentNode;
                        }
                        _target = _target.parentNode;
                    }
                    if(_target){  //_target为空表示节点已被删除
                        var evts = [];
                        while(target){
                            var evtStr = target.getAttribute("bd-" + name);
                            if(evtStr){
                                evts.push({
                                    target: target,
                                    evt: evtStr
                                });
                            }
                            if(target == delgWrap) break;
                            target = target.parentNode;
                            if(!procWrapOrNot && scope == widget.scope && target == delgWrap) break;
                        }
                        evts.length && widget.update(function(){
                            scope.$event = e;
                            var promise;
                            for(var i = 0; i < evts.length; i ++){
                                e.currentTarget = scope.$target = evts[i].target;
                                var expr = evts[i].evt, inputExpr;
                                if(/(\S.*?)\s*~\s*(\S+)\s*$/.test(expr)){
                                    expr = RegExp.$2;
                                    inputExpr = RegExp.$1;
                                }
                                promise = ~expr.indexOf('^') ? sWithFunc(expr, scope, true) : withFunc(expr, scope, true);
                                if(isObject(promise) && promise._isStream){
                                    promise.push(inputExpr ? withFunc(inputExpr, inheritScope(scope, {e:e}), true) : e);
                                    return false;
                                }
                                if(promise === false || promise === -1){
                                    e.preventDefault();
                                    promise === -1 && e.stopPropagation();
                                    result = false;
                                    return; //仍然执行$refresh()
                                }
                            }
                        });
                        evts = null;
                    }
                    return result; //任何一处事件指令return false均会阻止组件容器上的同类事件
                };
                dom.bind(delgWrap, name, delg);
                destroys.push((eventDelgs[name] = function(){ //事件销毁
                    dom.unbind(delgWrap, name, delg);
                }));
            });
        }
    };
    forEach(['on', 'off', 'emit', 'watch', 'unwatch'], function(fname){
        Widget.prototype[fname] = function(){
            var args = slice.call(arguments);
            return this[fname != 'emit' ? 'prepared' : 'ready'](function(){
                var scope = this.scope;
                scope && scope['$'+fname].apply(scope, args);
            });
        }
    });
    var getParams = utils.getParams = function(str, obj){
        if(!isObject(obj)) obj = {};
        if(isString(str)){
            var result, _name, _tmp, key, val;
            while ((result = PROPSPLITER.exec(str)) !== null) {
                key = result[1];
                val = result[2].trim();
                if(val == 'false') val = false;
                else if(val == 'true') val = true;
                else if(FLOAT_RE.test(val)) val = parseFloat(val);
                _name = null;
                _tmp = obj;
                key.trim().replace(MODELEXPR_RE, function(all, name, quote, quotedName){
                    if(_name){
                        if(!_tmp[_name]) _tmp[_name] = {};
                        _tmp = _tmp[_name];
                    }
                    _name = name || quotedName;
                    return "";
                });
                _tmp[_name] = val;
            }
        }
        return obj;
    }
    function parseProps(wrap){
        return getParams(wrap.getAttribute("bd-props"));
    }
    function parseState(scope, userState){
        if(!hasProp.call(scope, 'state')) scope.state = {};
        getParams(userState, scope.state);
        return scope;
    }
    function createOptions(node, widget, arr){
        var arrNotation = isArray(arr);
        forEach(arr, function(label, value){
            if(arrNotation){
                if(isObject(label)){
                    value = label.value;
                    label = isDefined(label.label) ? label.label : label.value;
                }else value = label;
            }
            var opt = new Option(label, value);
            node.options.add(opt);
        });
    }
    function destroyNode(node){
        try{
            var selfcide = dom.data("_b$selfcide");
            isFunction(selfcide) && selfcide();
            var destroys = dom.data(node, "bd-destroy");
            if(destroys){
                dom.data(node, "bd-destroy", null);
                forEach(destroys, function(fn){
                    fn();
                });
                forEach(destroys.subnode, function(subnode){
                    destroyNode(subnode);
                });
            }
            dom.data(node, false); //delete domData
        }catch(e){}
    }
    function cachableList(nodeList){
        var result = nodeList && nodeList.length;
        if(result){
            forEach(nodeList, function(node){
                if(!node.parentNode){ //已删除节点
                    result = false;
                }
            });
        }
        return result;
    }
    function getRepeatNum(key, scope){
        var tmp = parseInt(key, 10);
        return isNaN(tmp) ? parseInt(withFunc(key, scope), 10) : tmp;
    }
    function getRepeatArr(model, scope){
        var arr = model.split('..'), len = arr.length;
        if(arr.length == 1) return withFunc(model, scope);
        var start = getRepeatNum(arr[0], scope),
            end = getRepeatNum(arr[len-1], scope),
            inc = Math.abs((len == 3) ? getRepeatNum(arr[1], scope) : 1);
        return utils.incArray(start, end, inc);
    }
    var updateViews = {
        _replace: function(_nodes, htmls){ //_nodes为旧节点列表，不能为空
            var i = 0, nodes = [],
                addNodes = function(newnode){
                    if(isArray(newnode)){
                        nodes[i] = newnode;
                    }else{
                        if(!nodes[i]){
                            nodes[i] = [];
                        }
                        nodes[i].push(newnode);
                    }
                };
            var nullnode = _nodes.pop(),
                parent = nullnode.parentNode;
            var div = document.createElement("div"),
                frag = document.createDocumentFragment(),
                fragments = [frag],
                prevReserve, poles = [],
                reserveNodes = [];
            for(; i < htmls.length; i ++){
                if(!htmls[i]) continue;
                var prevNode, reserve = isArray(htmls[i]) ? htmls[i].reserve : 0;
                if(prevReserve && reserve - prevReserve != 1){ //下一组fragments
                    poles.push(prevNode);
                    frag = document.createDocumentFragment(),
                    fragments.push(frag);
                }
                prevReserve = reserve;
                if(isArray(htmls[i])){ //复用节点
                    forEach(htmls[i], function(_node){
                        if(reserve){
                            if(!poles.length){
                                poles.push(_node);
                            }
                            prevNode = _node;
                        }else{
                            frag.appendChild(_node);
                        }
                    });
                    addNodes(htmls[i]);
                    reserveNodes.push(htmls[i]);
                }else{
                    var tmpFrag = dom.create(htmls[i], true);
                    forEach(tmpFrag.childNodes, addNodes);
                    frag.appendChild(tmpFrag);
                }
            }
            i--;
            forEach(_nodes, function(_list){ //销毁事件
                if(reserveNodes.indexOf(_list) != -1) return;
                forEach(_list, function(_node){
                    destroyNode(_node);
                    if(_node.parentNode == parent){
                        parent.removeChild(_node);
                    }
                });
            });
            div = _nodes = null;
            nodes.push(nullnode);
            nodes.fragments = fragments;
            nodes.poles = poles;
            return nodes;
        },
        repeat: function(item, widget){ //key in expr
            var fn = item.fn,
                tmpl = fn.attr,
                key = fn.key,
                isScript = isFunction(tmpl),
                isJoin = fn.isJoin,
                scope = item.scope || widget.scope,
                model = item.expr,
                destroys = fn.destroys;
            var len, html, arr, htmls = [];
            var cond = isString(fn.cond) ? withFunc(fn.cond, scope) : true;
            scope.__scopes = [];
            if(!model){  //bd-foreach=""
                html = cond ? tmpl(scope) : '';
                if(isDefined(item._value) && html == item._value){
                    return false;
                }
                item._value = html;
                htmls.push(html);
            }else{
                arr = fn.stream ? fn.stream.fetch() : cond ? getRepeatArr(model, scope) : [];
                if(fn.withExpr){
                    arr = scope.$parse(fn.withExpr, arr);
                }
                if(!isArray(arr)){
                    arr = arr != null ? [arr] : [];
                }
                len = arr.length;
                var hasChange = !item.repeatScopes || item.arrLen != len, //不能比较arr与repeatScopes的长度，因undefined值被repeatScopes忽略
                    repeatNoKeys = key ? null : item.repeatNoKeys ||
                    (item.repeatNoKeys = []); //无key的nodes缓存
                    item.arrLen = len;
                if(key && !hasChange){
                    for(var i = 0; i < len; i ++){
                        var _scope = item.repeatScopes[i];
                        if((_scope ? _scope[key] : null) !== (isDefined(arr[i]) ? arr[i] : null)){ //该项值或引用有变化
                            hasChange = true;
                            break;
                        }else if(!isScript) _scope.$view();
                    }
                    if(!isScript && !hasChange) return false;
                }
                var _oldScopes = item.repeatScopes || [];
                item.repeatScopes = [];
                forEach(arr, function(obj, i){
                    if(obj == null) return;
                    var repeatScope = Object.create(scope); //__proto指向scope
                    repeatScope.__scopes = [];
                    if(key){
                        repeatScope[key] = obj;
                        repeatScope.$recurse = {
                            key: key,
                            attr: tmpl,
                            isJoin: isJoin
                        };
                    }else{
                        extend(true, repeatScope, isObject(obj) ? obj : {__val : obj});
                    }
                    extend(repeatScope, {
                        __len: len,
                        __i: i
                    });
                    var html = isScript ? tmpl(repeatScope)
                        : key ? tmpl : template.replace(tmpl, repeatScope);
                    var _scope = _oldScopes[i]
                    if(!_scope || !hasProp.call(_scope, 'b$html') || html != _scope['b$html']){
                        hasChange = true;
                    }else _scope.$view();
                    item.repeatScopes[i] = repeatScope;
                    htmls[i] = html;
                });
                if(!hasChange){ //不需要刷新
                    item.repeatScopes = _oldScopes;
                    if(!key){
                        forEach(arr, function(obj, i){
                            extend(item.repeatScopes[i], obj);
                        });
                    }
                    return false;
                }
                var cursor = -1;
                forEach(arr, function(obj, i){
                    if(obj == null) return;
                    var html = htmls[i];
                    if(!isJoin){
                        var cacheWithoutkey = key ? null : getRepeatCacheWithoutKey(obj, repeatNoKeys, html, item.repeatScopes);
                        var _repeatScope = key ? findRepeatScope(obj, _oldScopes, key, item.repeatScopes) : cacheWithoutkey ? cacheWithoutkey.scope : null;
                        var _node = key ?
                            (_repeatScope && hasProp.call(_repeatScope, 'b$node') ? _repeatScope['b$node'] : null)
                            : (cacheWithoutkey ? cacheWithoutkey.node : null);
                        if(_repeatScope && cachableList(_node) && html == _repeatScope['b$html']){
                            if(cursor == -1 || cursor+1 <= _repeatScope.__i){
                                cursor = _repeatScope.__i;
                                _node.reserve = i+1;
                            }else{
                                _node.reserve = false;
                            }
                            if(htmls.indexOf(_node) == -1){
                                htmls[i] = _node;
                                item.repeatScopes[i] = _repeatScope;
                                if(!key){
                                    extend(item.repeatScopes[i], obj);
                                }
                            }
                        }
                    }
                    extend(item.repeatScopes[i], {
                        __len: len,
                        __i: i,
                        'b$html': html
                    });
                });
                _oldScopes = null;
            }
            if(isJoin){
                htmls = [htmls.join("")];
            }
            fn.node = updateViews._replace(fn.node, htmls);
            if(len || !model){
                //将所生成节点与repeatScope关联
                var destroySubnode = destroys && destroys.subnode;
                destroySubnode && destroySubnode.splice(0);
                forEach(fn.node, function(nodeList, i){
                    if(!nodeList || !nodeList.length) return;
                    widget.$refresh2 = true;
                    var _scope;
                    if(model && !isJoin){ //bd-foreach != "" && no join
                        _scope = item.repeatScopes[i];
                        if(_scope){
                            //将repeatScope和node关联，绑定过事件的除外
                            if(key && isArray(nodeList) && nodeList.length){
                                _scope['b$node'] = nodeList; //!: nodeList.length>1时存在覆盖
                            }else if(isString(htmls[i])){
                                saveRepeatCacheWithoutKey(arr[i], repeatNoKeys, nodeList, _scope, htmls[i]);
                            }
                        }
                    }

                    forEach(nodeList, function(node){
                        if(!dom.data(node, "bd-destroy")){ //初始化新生成的子孙节点
                            var subDestroys = dom.data(node, "bd-destroy", []);
                            if(node.nodeType == 3){ //repeat对象仅为textNode
                                widget.wander(node, _scope, true);
                            }else if(node.nodeType == 1){ //仅当!!key时才绑定bd-model
                                widget.wander(node, _scope, true, !key&&arr&&isObject(arr[i]) ? arr[i]:null);
                                if(!dom.data(node, "_b$ifed")) widget.compile(node, subDestroys); //处理子模块
                            }else{
                                return;
                            }
                            destroySubnode && destroySubnode.push(node);
                        }
                    });
                    _scope && _scope.$view();
                });
            }
            var frags = fn.node.fragments, poles = fn.node.poles;
            forEach(frags, function(frag, i){
                if(frag.childNodes.length){
                    dom[i==0?'before':'after'](frag, poles[i]||fn.node[fn.node.length-1]);
                }
            });
            fn.node.frags = fn.node.poles = null;
            return false;
        }
    }
    function getRepeatCacheWithoutKey(item, repeatNoKeys, html, usedScopes){
        for(var i = 0; i < repeatNoKeys.length; i ++){
            if(repeatNoKeys[i].item === item && usedScopes.indexOf(repeatNoKeys[i].scope) == -1){
                if(repeatNoKeys[i].string == html){//html和数组项完全相等方可重用
                    return repeatNoKeys[i];
                }else{
                    repeatNoKeys.splice(i, 1);
                    break;
                }
            }
        }
        return null;
    }
    function saveRepeatCacheWithoutKey(item, repeatNoKeys, node, scope, html){
        repeatNoKeys.push({
            node: node,
            item: item,
            string: html,
            scope: scope
        });
    }
    function findRepeatScope(item, scopes, key, usedScopes){
        for(var i = 0; i < scopes.length; i ++){
            if(scopes[i] && scopes[i][key] === item && usedScopes.indexOf(scopes[i]) == -1){
                return scopes[i];
            }
        }
        return null;
    }

    function Models(widget){ //View<->ViewModel
        this.widget = widget;
        this.items = [];
        this.cursor = 0;
    }
    function updateModel(item, _value){  //从View取值并更新到Model中
        var node = item.node,
            value = dom.val(node);
        if(!isDefined(_value)) _value = getModel(item.model, item.scope);
        if(_value && _value._isStream){
            if(_value != item.stream){
                if(item.stream) item.stream.off(item.binder);
                if(!item.binder) item.binder = refreshModel.bind(undefined, item);
                item.stream = _value.on(item.binder);
            }
            _value = _value.fetch();
            if(item.unModel){
                item.unModel();
                delete item.unModel;
            }
        }
        if(lowercase(node.tagName) == 'input' && lowercase(node.getAttribute('type')) == 'radio'){
            if(node.checked === false) return;
        }
        if(isDefined(value)){
            item.inited = true;
            if(value !== _value){
                var nodeValue = item.array && dom.attr(node, "value");
                if(item.stream){
                    if(item.array){
                        item.stream.push(null, function(arr){
                            if(!isArray(arr)){
                                arr = [];
                            }
                            var idx = arr.indexOf(nodeValue);
                            if(value && idx == -1){
                                arr.push(nodeValue);
                            }else if(!value && idx != -1){
                                arr.splice(idx, 1);
                            }
                            return arr;
                        });
                    }else{
                        item.stream.push(value);
                    }
                    return;
                }
                saveModel(item.scope, item.model, value, nodeValue); //item.model.indexOf('^') == -1
            }
        }
    }
    function saveModel(scope, model, value, nodeValue){
        var _name = null, _tmp = scope, firstKey;
        model.replace(MODELEXPR_RE, function(all, name, quote, quotedName){
            if(_name){
                if(!isDefined(_tmp[_name])){
                    _tmp[_name] = {};
                }
                _tmp = _tmp[_name];
            }
            _name = name || quotedName;
            if(!firstKey) firstKey = _name;
            return '';
        });
        if(isString(nodeValue)){ //checkbox array
            if(!isArray(_tmp[_name])){
                _tmp[_name] = [];
            }
            var idx = _tmp[_name].indexOf(nodeValue);
            if(value && idx == -1){
                _tmp[_name].push(nodeValue);
            }else if(!value && idx != -1){
                _tmp[_name].splice(idx, 1);
            }
        }else{
            _tmp[_name] = value;
        }
        return firstKey;
    }
    function getStreamModel(model, scope){
        return $$.reduce(model.split('^'), null, function(stream, expr, i){
            if(stream) stream = stream.fetch();
            stream = getModel(expr, stream || scope);
            return stream;
        });
    }
    function getModel(model, scope, fetch){
        var value;
        if(~model.indexOf('^')){
            value = getStreamModel(model, scope);
        }else{
            var arr = [];
            model.replace(MODELEXPR_RE, function(all, name, quote, quotedName){
                arr.push(name || quotedName);
                return '';
            });
            value = $$.reduce(arr, scope, function(tmp, name){
                return isDefined(tmp) ? tmp[name] : undefined;
            });
        }
        return fetch && value && value._isStream ? value.fetch() : value;
    }
    function refreshModel(item){ //将Model中取值并更新到View中，最后再从View回取值
        var node = item.node,
            value = item.stream ? item.stream.fetch() : getModel(item.model, item.scope),
            isRadio = lowercase(node.tagName) == 'input' && lowercase(node.getAttribute('type')) == 'radio',
            nodeVal = isRadio ? node.checked : dom.val(node);
        if(value && value._isStream) value = value.fetch();
        if(item.array){
            value = isArray(value) && value.indexOf(dom.attr(node, "value")) != -1;
        }
        if(value !== nodeVal){
            if(!isDefined(value) && item.inited) value = '';
            if(isDefined(value)) isRadio ? dom.attr(node, 'checked', value === node.value) : dom.val(node, value);
            updateModel(item, value);
        }
    }
    Models.prototype = {
        add: function(node, model, scope){ //models.add
            var that = this, widget = this.widget;
            scope = scope || widget.scope;
            model = model.trim();
            var item = {
                node: node,
                scope: scope
            };
            if(model.substr(-1) == '*'){ //array model for checkboxes
                item.array = true;
                model = model.substr(0, model.length-1);
            }
            item.model = model;
            //监听bd-model元素/组件变化
            var nodeWidget = $$.widget(node),
                wrap = widget.$root[0];
            var value = getModel(model, scope);
            if(isObject(value) && value._isStream){
                item.stream = value;
            }
            var update = function(){
                item.stream ? updateModel.call(that, item) : widget.update();
            }
            if(item.stream){
                item.binder = refreshModel.bind(undefined, item);
                value.on(item.binder, true);
            }else{
                item.unModel = this.remove.bind(this, model);
                this.items.push(item);
            }
            var neDestroy = dom.data(wrap, "bd-destroy");
            if(nodeWidget){
                nodeWidget.watch('value', update);
                neDestroy.push(function(){
                    nodeWidget.unwatch('value', update);
                });
            }else{
                var events = 'change';
                if(/input|textarea/.test(lowercase(node.tagName))){
                    events += ' input';
                }
                dom.bind(node, events, update);
                neDestroy.push(function(){
                    dom.unbind(node, events, update);
                });
            }
            return item;
        },
        remove: function(item){
            for(var i = 0, len = this.items.length; i < len; i ++){
                if(this.items[i] == item){
                    this.items.splice(i, 1);
                    break;
                }
            }
        },
        update: function(intercept, promise){ //models.update: view->data && refresh()
            var models = this,
                widget = models.widget,
                scope = widget.scope,
                affectWidget = widget; //model有改变的最高级组件
            if(scope && scope.$refreshing){
                setTimeout(function(){
                    models.update(intercept, promise);
                }, 50);
                return;
            }
            forEach(models.items, function(item){
                if(item.stream) return;
                var firstKey = updateModel(item);
                if(firstKey){ //如果firstKey对应父组件scope中的引用，则刷新该父组件
                    while(affectWidget.parent && isDefined(affectWidget.scope[firstKey]) && !hasProp.call(affectWidget.scope, firstKey)){
                        affectWidget = affectWidget.parent;
                    }
                }
            });
            forEach(widget.children, function(subwidget){
                if(subwidget.update) subwidget.update(null, false);
            });
            if(isFunction(intercept)) {
                promise = intercept.apply(widget.scope);
            }
            if(promise && isFunction(promise.then)){
                promise.then(function(){
                    affectWidget.refresh();
                });
            }else if(promise !== false){
                affectWidget.refresh();
            }
        },
        refresh: function(){ //models.refresh: data->view
            forEach(this.items, refreshModel);
        }
    };

    function Views(widget){ //ViewModel->View绑定
        this.widget = widget;
        this.items = [];
    }
    Views.prototype = {
        add: function(item, instant){ //views.add
            var items = this.items;
            if(item && isString(item.expr)) item.expr = item.expr.replace(/^\s*{{([^}]*?)}}\s*$/, "$1");
            items.push(item);
            if(instant){
                this.refresh(item);
            }
            return function(){
                var i = items.indexOf(item);
                if(i > -1) items.splice(i, 1);
            }
        },
        refresh: function(item){ //views.refresh : repeat..
            if(!item) return forEach(this.items, this.refresh.bind(this));
            ~item.expr.indexOf('..') ? updateViews[item.type](item, this.widget) : watchRefresh.call(this.widget.scope, item, true);
        }
    };

    var defineQueue = [], lazyDefines = function(name){
        if(!lazyDefines[name]) return false;
        amdLoader.postDefine(name, lazyDefines[name]);
        delete lazyDefines[name];
        return true;
    };
    $$.define = function(name, deps, fn){
        if(!isString(name)){
            fn = deps;
            deps = name;
            name = null;
        }
        if(!isArray(deps) || !fn){
            fn = deps;
            deps = [];
        }
        var def = {
            fn: fn,
            deps: deps
        };
        if(name){ //打包模式
            if(isString(def.fn) || amdLoader._defers[name]){ //text or required
                amdLoader.postDefine(name, def);
            }else{
                lazyDefines[name] = def;
            }
        }else{
            defineQueue.push(def);
            $$.define.amd = false; //每个外部amd文件只能定义一次不指名define
        }
        return def;
    };
    $$.define.amd = {jQuery: true};
    if(!this.define) this.define = $$.define;
    var skin = this.define.skin = function(name, html){
        if(isObject(name)){
            forEach(name, function(_html, _name){skin(_name, _html)});
            return;
        }
        htmlLoader.promises[fullName(name)] = $q.ref(html);
    }

    var htmlLoader = { //html异步加载器
        promises: {},
        load: function(url, callback){
            var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
            var promise = this.promises[url];
            if(!promise){
                promise = this.promises[url] = ajax.get(url).then(function(res){
                    var div = document.createElement("div"),
                        html = res.data;
                    var urlPath = url.replace(/[^\/]+$/, '');
                    var urlHost = url.indexOf("//") == -1 ? '/':url.replace(/(\/\/.*?\/).*/, '$1');
                    html = html.replace(/(\s(href|src|bd-module|bd-extend|bd-plugin)=["'])@(\/)?/g, function(match, pre, d, slash){
                        return pre + (slash ? urlHost : urlPath);
                    });
                    if(isString($$.debug)){
                        html = html.replace(/(<link [^>]*?href=["'])\//, "$1" + $$.debug + "/");
                    }
                    //ie bug: 开头的style被忽视
                    div.innerHTML = (msie < 9 ? '<input />' : '') + html;
                    if(msie < 9) div.removeChild(div.firstChild);
                    
                    return new Promise(function(resolve){
                        var linkCount = 0,
                            linkCache = amdLoader._loadedlink;
                        forEach(utils.cssQuery('link, style', div), function(node){
                            if(tagLC(node) == 'link'){
                                linkCount ++;
                                var href = fullName(node.getAttribute('href')),
                                    _resolve = function(){
                                        if(--linkCount === 0) resolve(html);
                                    };
                                if(linkCache[href]){
                                    dom.remove(node);
                                    node = linkCache[href];
                                    setTimeout(_resolve, 100);
                                }else{
                                    linkCache[href] = node;
                                    node.onload = node.onreadystatechange = function(){
                                        if(!node.readyState || node.readyState == 'complete'){
                                            node.onload = node.onreadystatechange = null;
                                            setTimeout(_resolve, 50);
                                        }
                                    }
                                    setTimeout(function(){
                                        if(node.onload) node.onload();
                                    }, 2000);
                                }
                            }
                            head.appendChild(node);
                        });
                        html = div.innerHTML;
                        div = null;
                        if(linkCount === 0) resolve(html);
                    });
                });
            }
            return promise;
        }
    }
    function callExtends(def, widget, scope){
        forEach(def.extends, function(_def){
            callExtends(_def, widget, scope);
            _def.fn.apply(scope, _def.depInject);
            if(hasProp.call(scope, 'init')){
                (widget.__inits || (widget.__inits = [])).push(scope.init);
                delete scope.init;
            }
        });
    }
    var amdLoader = { //js加载，含module def, common def, plain js
        _fns: {},  //defid|filename : module def  {fn: fn, depInject: []} 表明依赖已满足
        _exports: {},  //defid|filename: exported object or text content
        _loadedlink: {}, //existed link nodes
        _defers: {},  //defers for modules
        _promises: {},  //promises for deps
        makeDefer: function(name, defined, notDefine){ //defined表示模块为内联定义
            var defers = amdLoader._defers;
            var tmp = name.split('@');
            name = tmp[0];
            var charset = tmp[1] || 'utf-8';
            if(defers[name]) return defers[name];
            var loader = defers[name] = $q.defer();
            var promise = loader.promise;
            if(!notDefine) promise.deploy = function(widget, parent){ //如有需要，用来实例化组件
                var args = 3 <= arguments.length ? slice.call(arguments, 2) : [];
                promise.then(function(def){
                    if(isFunction(def.deploy)){
                        widget = def.deploy(widget, parent, args);
                    }
                });
                return widget;
            }
            if(!defined){
                var exports = amdLoader._exports;
                if(exports[name]){
                    loader.resolve(exports[name]);
                }else if(!lazyDefines(name) && name.substr(0,1) != '%'){ //%开头的组件需内联定义
                    ajax.require(name, {
                        charset: charset
                    }).success(function(){
                        amdLoader.postDefine(name, null, notDefine); //构造函数加载完成，处理依赖
                    }).error(function(){
                        amdLoader.postDefine(name, {fn: function(){}}, notDefine);
                        throw(name + " load error." + (depSrcs[name] ? "\n  => " + depSrcs[name] : ''));
                    });
                }
            }
            return loader;
        },
        get: function(name){ //加载模块并实例化
            if(!name) return $q.ref();
            name = fullName(name);
            var loader = amdLoader.makeDefer(name);
            return loader.promise;
        },
        getExport: function(file){
            var exports = amdLoader._exports, fns = amdLoader._fns, type;
            file = file.replace(/(\w)\@.*/, '$1');
            if(/^(plugin|extend)\!(.*)/.test(file)){
                type = RegExp.$1;
                file = RegExp.$2;
            }
            lazyDefines(file = fullName(file));
            var _def = fns[file];
            if(type && _def){
                return _def;
            }else if(!exports[file] && _def){
                if(isFunction(_def.fn)){
                    var scope = observableObj();
                    if(isNumber(_def.depInject.exportIdx)){
                        _def.depInject[_def.depInject.exportIdx] = scope;
                    }
                    var fnResult = _def.fn.apply(scope, _def.depInject);
                    exports[file] = isDefined(fnResult) ? fnResult : scope;
                }
            }
            return exports[file];
        },
        createLink: function(href){//加载样式表
            var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
            var link = amdLoader._loadedlink[href];
            if(!link) {
                link = amdLoader._loadedlink[href] = document.createElement("link");
                link.href = href;
                link.rel = "stylesheet";
            }
            head.appendChild(link);
        },
        depPromise: function(depfile, relpath){ //加载define所需依赖
            var that = this;
            var promises = that._promises;
            var promise = $q.ref();
            if(/^text\!/.test(depfile)){ //text!file将依赖模块作为字符串抓取
                depfile = fullName(depfile, relpath);
                var file = depfile.replace(/.*\!/, '');
                var exports = that._exports;
                if(exports[depfile]){
                    return $q.ref(exports[depfile]);
                }else{
                    promise = promises[depfile];
                    if(!promise){
                        promise = promises[depfile] = new Promise(function(resolve){
                            ajax.get(file).success(function(txt){
                                exports[depfile] = txt;
                                resolve(txt);
                            });
                        });
                    }
                    return promise;
                }
            }else{
                var notDefine = (depfile.substr(0, 1) == '!');
                forEach(depfile.split(SPLITER), function(js){ //depfile需要同步加载
                    promise = promise.then(
                        function(){
                            return that.makeDefer(fullName(js.replace(/.*\!/, ''), relpath), false, notDefine).promise
                        });
                });
                return promise;
            }
        },
        postDefine: function(file, def, notDefine){ //define函数已执行，开始处理依赖
            $$.define.amd = {jQuery: true};
            var exports = amdLoader._exports, 
                module = win.module;
            var defer = amdLoader.makeDefer(file, true); //不需要ajax.require
            if(defer.def && !def && !defineQueue.length) return; //异步加载packed module(如jQuery)
            var promises = [];
            if(!notDefine){
                if(!def){
                    if(module && module.exports){
                        def = {fn: module.exports};
                        delete module.exports;
                    }else{
                        def = defineQueue.shift();
                    }
                }
                if(!def) throw("define not found for " + file); //error

                if(isString(def.fn)){ //def.fn为文本
                    exports["text!"+file] = def.fn;
                    return;
                }else if(!isFunction(def.fn)){ //def.fn为JSON对象
                    exports[file] = def.fn || {};
                    defer.resolve(def);
                    return;
                }
            }
            (def && def.deps ? aliasPromise : $q.ref()).then(function(){
                if(!notDefine){
                    def.name = file;
                    if(isArray(def.deps)) fullNames(def.deps, file);
                    promises.push(require(def.deps).then(function(di){
                        if(di.extends) def.extends = di.extends;
                        def.depInject = di;
                        def._deps = def.deps;
                        delete def.deps;
                        amdLoader._fns[file] = def;
                    }));
                    def.deploy = function(widget, parent, args){
                        (widget._lazyPromise || $q.ref()).then(function(){
                            $$.widget.spy("created", widget);
                            amdLoader.instantiate(def, widget, args);
                        });
                        return widget;
                    };
                }
                $q.all(promises).then(function(){
                    defer.def = def;
                    defer.resolve(def, true);
                });
            });
        },
        instantiate: function(def, widget, extendArr){ //满足依赖后，逐个实例化
            if(!widget._preparedDefer) return;
            //scope原型链继承
            var parentScope = widget.parent.scope,
                scope = widget.scope;
            var models = widget.models = new Models(widget);
            widget.update = scope.$update = models.update.bind(models);
            widget.views = new Views(widget);
            scope.$widget = widget;
            scope.$root = widget.$root;
            var wrap = widget.$root[0], prepared = function(){
                parseState(scope, wrap.getAttribute('bd-state'));
                widget._preparedDefer.resolve(widget);
            }
            widget.prepared(function(){
                var parentDestroys = widget.parent.$root && dom.data(widget.parent.$root[0], "bd-destroy");
                forEach(['bd-state-extend', 'bd-extend'], function(attr){
                    var value = wrap.getAttribute(attr);
                    value && _directives[attr].call(widget.parent, parentScope, wrap, value, parentDestroys);
                });
            });
            if(def){
                scope.$moduleid = def.name;
                if(isNumber(def.depInject.exportIdx)){
                    def.depInject[def.depInject.exportIdx] = scope;
                }
                callExtends(def, widget, scope);
                def.fn.apply(scope, def.depInject);
                prepared();
                if(extendArr){
                    if(!isArray(extendArr)){
                        extendArr = [extendArr];
                    }
                    forEach(extendArr, function(obj){
                        extend(true, scope, obj);
                    });
                }
                loadHtml(def.name, widget); //htmlLoader->extendPromise
            }else{
                prepared();
            }
        }
    };
    
    var easeFns = {
        linear: function(p){return p},
        ease: function(p){return Math.sqrt(p)},
        'ease-in': function(p){return p*p}
    };
    easeFns['ease-out'] = easeFns.ease;
    var pathAlias = {},
        bConf = {
            alias: pathAlias,
            easeFns: easeFns
        };
    $$.conf = function(conf){
        if(isString(conf)){
            return bConf[conf];
        }
        extend(true, bConf, conf);
    }
    function require(deps, fn){
        var promises = [];
        var fns = amdLoader._fns, di = [];
        if(isFunction(deps)){
            fn = deps;
            deps = [];
        }else deps = deps || [];
        for(var i = 0; i < deps.length; i ++){
            if(/\.css$/i.test(deps[i])){
                amdLoader.createLink(deps[i]);
                deps.splice(i--, 1);
            }else if(!deps[i]){
                deps.splice(i--, 1);
            }else{
                if(deps[i].substr(0,1) == '!'){
                    promises.push(amdLoader.depPromise(deps[i]));
                    deps.splice(i--, 1);
                }
            }
        }
        forEach(deps, function(depfile, i){
            if(depfile == 'exports'){
                di.exportIdx = i;
            }else if(!fns[depfile]){
                promises.push(amdLoader.depPromise(depfile));
            }
        });
        return $q.all(promises).then(function(){
            forEach(deps, function(depfile){
                if(depfile.indexOf("extend!") == 0){
                    (di.extends || (di.extends = [])).push(amdLoader.getExport(depfile));
                }else{
                    di.push(depfile == 'exports' ? null : amdLoader.getExport(depfile));
                }
            });
            if(isFunction(fn)){
                fn.apply(this, di);
            }
            return di;
        });
    }
    $$.run = function(name){
        if(isArray(name)){
            fullNames(name);
        }
        if(!isString(name)){
            return require.apply($$, arguments);
        }
        return amdLoader.get(name).then(function(def){
            if(!def || !def.fn){
                return def;
            }else if(isFunction(def.fn)){
                var mod = observableObj();
                if(isNumber(def.depInject.exportIdx)){
                    def.depInject[def.depInject.exportIdx] = mod;
                }
                var fnResult = def.fn.apply(mod, def.depInject);
                return (fnResult && typeof fnResult == 'object') ? fnResult : mod;
            }else{
                return def.fn;
            }
        });
    }
    $$.defined = amdLoader.getExport;
    $$.widget = function(query, parent){
        if(isString(query)){
            var firstLetter = query.substr(0, 1);
            if(firstLetter == '#'){
                if(!widgetCache[query]) widgetCache[query] = new Widget;
            }else{
                query = fullName(query);
            }
        }else if(query){ //dom node
            if(!query.getAttribute) query = query[0];
            if(!query || !query.getAttribute) return null;
            var node = query;
            query = dom.data(node, "bd-wguid"); //$$d
            if(!query && isString(node.getAttribute("bd-module"))){ //容器未组件化
                var nodeId = dom._nodeId(node);
                var widget = widgetCache[nodeId] = widgetCache[nodeId] || new Widget;
                return widget;
            }
        }
        var cache = widgetCache[query] || null, result = [];
        if(!isArray(cache)){
            return parent && cache && !cache.isChildOf(parent) ? null : cache;
        }
        forEach(cache, function(w){
            if(!parent || w.isChildOf(parent)) result.push(w);
        });
        return result;
    }

    $$.rootScope = new Scope;
    var rootWidget = $$.rootWidget = Widget.create();
    rootWidget._preparedDefer.resolve(rootWidget);
    rootWidget._readyDefer.resolve(rootWidget);
    rootWidget.defer = $q.defer();
    var aliasConf = document.body && document.body.getAttribute("bd-alias"); //全局配置
    if(!aliasConf){
        var scripts = document.getElementsByTagName("script"), bScript = scripts[scripts.length-1];
        aliasConf = bScript && bScript.getAttribute("bd-alias");
    }
    var aliasPromise = $$.run(aliasConf).then(function(conf){
        conf && extend(true, pathAlias, $$.map(conf, function(path){
            return fullName(path, fullName(aliasConf));
        }));
    });
    if(aliasConf) rootWidget.compile = function(){
        aliasPromise.then(compile);
    };
    $$.widget.spy = $$.s.spy = function(name, obj){
        name = "_spy" + name;
        if(isFunction(obj)){
            (this[name] || (this[name] = [])).push(obj);
            name = "_" + name;
            if(this[name]){
                forEach(this[name], function(args){ obj.apply(null, args) });
                delete this[name];
            }
        }else if(this[name]){ //do callback
            var args = slice.call(arguments, 1);
            forEach(this[name], function(f){ f.apply(null, args); });
        }else{ //cache
            name = "_" + name;
            (this[name] || (this[name] = [])).push(slice.call(arguments, 1));
        }
    }
    define("require", function(){
        return $$.defined;
    });
    $$.ready(function(){
        aliasPromise.then(function(){
            compile(); //初始化组件，在compile.inited之前，可重复compile同一组件
            compile.inited = true; //不再重复compile组件
            rootWidget.defer.resolve();
        });
    });
}).call(this, this.bowlder, function(expr, noReturn){
    return new Function('obj', 'with(obj)' + (noReturn ? '{'+expr+'}' : 'return '+expr));
});

