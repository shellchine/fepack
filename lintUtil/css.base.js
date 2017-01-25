module.exports = function(content, util){
    var errs = [],
        warns = [];
    if(/zoom\s*:\s*1\s*px/i.test(content)){
        errs.push("zoom:1px");
    }
    return [errs, warns];
}
