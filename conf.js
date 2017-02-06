module.exports = {
    firm: "netease",
    cacheDir: "/var/fepack",
    devHost: "http://static.f2e.netease.com",
    devHost2: "http://qa.developer.163.com",
    devHttpsHost: "https://qa.developer.163.com",
    vc: "git",
    lint: {
        css: ["css.base"],
        js: ["js.base"],
        html: ["html.base"]
    },
    pack: ["base"],
    devDist: ["omad"],
    dist: ["cms", "omad", "rsync"],
    cdns: [
        {
            base: "http://img2.cache.netease.com/f2e",
            suffix: "jpg jpeg png bmp gif svg ico js css cur eot ttf woff woff2 mp3",
            ftp: "61.135.251.132:16321",
            authFile: ".ftpauth"
        },
        {
            base: "http://file.ws.126.net/f2e",
            suffix: "swf pdf fnt htc apk ipa plist gltf",
            ftp: "61.135.251.56:16321",
            authFile: ".ftpauth"
        }
    ],
    cdnRootDir: "/f2e"
}
