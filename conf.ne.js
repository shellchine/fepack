module.exports = {
    firm: "netease",
    cacheDir: "/var/fepack",
    //devHost: "http://static.f2e.netease.com",
    devHost: "http://127.0.0.1:8990",
    devHost2: "http://qa.developer.163.com",
    devHttpsHost: "https://qa.developer.163.com",
    vc: {
        type: "svn",
        host: "https://svn.ws.netease.com/frontend",
        localhost: "/var/frontend"
    },
    lint: {
        css: ["css.base"],
        js: ["js.base"],
        html: ["html.base"]
    },
    devDist: ["omad"],
    pack: ["base", "bdc"],
    compress: {
        js: 2,
        css: 1
    },
    dist: ["cms", "omad", "scp"],
    files: {
        exclude: /\.(avi|mpeg|psd)$/,
        preserve: /\.(php|jsp|asp|xml|min\.js|min\.css)$/
    },
    cdns: [
        {
            base: "http://img2.cache.netease.com/f2e",
            suffix: "jpg jpeg png bmp gif svg ico js css cur eot ttf woff woff2 mp3",
            ftp: "61.135.251.132:16321",
            ftpBase: "/f2e",
            authFile: ".ftpauth"
        },
        {
            base: "http://file.ws.126.net/f2e",
            suffix: "swf pdf fnt htc apk ipa plist gltf",
            ftp: "61.135.251.56:16321",
            ftpBase: "/f2e",
            authFile: ".ftpauth"
        }
    ],
    serverBase: "/f2e/{{path}}",
    syncs: [
        { base: "/var/f2e_inc" },
        { base: "/var/f2e_inc", devOnly: true },
        { base: "/var/auto_inc" },
        { base: "/var/auto_inc", devOnly: true },
        { base: "/var/house_inc" },
        { base: "/var/house_inc", devOnly: true },
        { base: "/var/recm_inc" },
        { base: "/var/recm_inc", devOnly: true },
        { base: "/var/video_inc" },
        { base: "/var/money_inc" }
    ]
}
