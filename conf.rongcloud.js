module.exports = {
    firm: "rongcloud",
    cacheDir: "/var/fepack",
    devHost: "",
    devHost2: "http://192.168.171.10:8990",
    devHttpsHost: "https://192.168.171.10:8990",
    vc: {
        type: "git",
        host: "",
        localhost: ""
    },
    lint: {
        css: ["css.base"],
        js: ["js.base"],
        html: ["html.base"]
    },
    pack: ["base"],
    devDist: [],
    dist: ["rsync"],
    files: {
        exclude: /\.(avi|mpe?g|psd|sh|db|cgi)$/,
        preserve: /templates|\.(php|jsp|asp|xml|min\.js|min\.css)$/
    },
    cdns: [],
    serverBase: "/",
    syncs: [
        {type: "cp", base: "/var/f2e_inc"},
        {type: "scp", base: "fcloud@192.168.171.4:/data/web_deploy"},
        {type: "scp", base: "fcloud@192.168.171.7:/data/web_deploy"}
    ]
}
