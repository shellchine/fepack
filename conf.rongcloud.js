module.exports = {
    firm: "rongcloud",
    cacheDir: "/var/fepack",
    devHost: "http://dev.rongcontent.com",
    //devHost2: "http://192.168.171.10:8990",
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
    cdns: [
        {
        base: "//f2e.rongcontent.com",
        suffix: "jpg jpeg png bmp gif svg ico js css cur eot ttf woff woff2 mp3",
        ftp: "120.92.93.202",
        ftpBase: "",
        authFile: ".ftpauth"
        }
    ],
    serverBase: "/",
    syncs: [
        {type: "cp", base: "/var/f2e_inc"},
        {type: "rsync", base: "fcloud@192.168.171.4:/data/web_deploy"},
        {type: "scp", base: "fcloud@192.168.171.7:/data/web_deploy"}
    ]
}
