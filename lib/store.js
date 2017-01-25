var fs = require('fs');
var sqlite3 = require('sqlite3').verbose();
var Store = function(file, initSQL){
    var needInit = !fs.existsSync(file);
    if(needInit && !initSQL){
        throw(file + " is not existed.");
    }
    this.db = new sqlite3.Database(file);
    if(needInit){
        this.db.exec(initSQL);
    }
}
var slice = [].slice;
Store.prototype = {
    close: function(){
        this.db.close();
    },
    run: function(sql){
        var db = this.db;
        var args = slice.call(arguments);
        return new Promise((resolve, reject) => {
            db.run.apply(db, args.concat(function(err){
                if(err) reject(err);
                else resolve();            
            }));
        });
    },
    exec: function(sql){
        var db = this.db;
        var args = slice.call(arguments);
        return new Promise((resolve, reject) => {
            db.exec.apply(db, args.concat(function(err){
                if(err) reject(err);
                else resolve();            
            }));
        });
    },
    prepare: function(sql){
        return new Statement(sql, this.db);
    },
    get: function(){
        var db = this.db;
        var args = slice.call(arguments);
        return new Promise((resolve, reject) => {
            db.get.apply(db, args.concat(function(err, row){
                if(err){
                    reject(err);
                }else{
                    resolve(row);
                }
            }));
        });
    },
    all: function(){
        var db = this.db;
        var args = slice.call(arguments);
        return new Promise((resolve, reject) => {
            db.all.apply(db, args.concat(function(err, data){
                if(err){
                    reject(err);
                }else{
                    resolve(data);
                }
            }));
        });
    }
}
function Statement(sql, db){
    this.stmt = db.prepare(sql);
}
Statement.prototype = {
    finalize: function(){
        this.stmt.finalize();
    },
    run: function(sql){
        var stmt = this.stmt;
        var args = slice.call(arguments);
        return new Promise((resolve, reject) => {
            stmt.run.apply(stmt, args.concat(function(err){
                if(err) reject(err);
                else resolve();            
            }));
        });
    },
    get: function(){
        var stmt = this.stmt;
        var args = slice.call(arguments);
        return new Promise((resolve, reject) => {
            stmt.get.apply(stmt, args.concat(function(err, row){
                if(err){
                    reject(err);
                }else{
                    resolve(row);
                }
            }));
        });
    },
    all: function(){
        var stmt = this.stmt;
        var args = slice.call(arguments);
        return new Promise((resolve, reject) => {
            stmt.all.apply(stmt, args.concat(function(err, data){
                if(err){
                    reject(err);
                }else{
                    resolve(data);
                }
            }));
        });
    }
}

module.exports = Store;
