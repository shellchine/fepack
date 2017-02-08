# FEPack
前端资源合并、发布工作。提供静态资源检查、优化、发布版本控制等功能。

# 全局配置
fepack配置文件放在脚本根目录，默认为conf.js。
```javascript
module.exports = {
    firm: "netease",
    cacheDir: "/var/frontend/fepack",
    devHost: "http://static.f2e.netease.com",
    devHost2: "http://qa.developer.163.com",
    devHttpsHost: "https://qa.developer.163.com",
    vc: "git",
    lint: {
        css: ["css.base"],
        js: ["js.base"],
        html: ["html.base"]
    },
    pack: ["base", "bdc"],
    devDist: ["omad"],
    dist: ["cdn", "rsync", "cms", "omad"],
    files: {
        exclude: /\.(avi|mpeg|psd)$/,
        preserve: /\.(php|jsp|asp)$/
    },
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
```

# 项目配置
单个项目


# 目录结构
每个发布阶段均会在conf.cacheDir下生成对应的临时文件，大致结构如下：
```
├── backup
│   └── finance_business
│       ├── html.3.tar.gz
│       └── info.3.tar.gz
├── dist
│   └── finance_business
│       ├── file
│       ├── html
│       │   ├── business.shtml
│       │   ├── inc
│       │   │   ├── foot_static.html
│       │   │   └── head_static.html
│       ├── html.tar.gz
│       ├── html4cms
│       │   └── business.shtml
│       ├── html4dev
│       │   └── business.shtml
│       ├── html4dev.tar.gz
│       └── static
├── info
│   ├── finance_business
│   │   ├── dev.html
│   │   ├── live.html
│   │   └── goscript
│   │       ├── dist.js
│   │       └── dist_dev.js
│   ├── cmsid.db
│   └── jspack.db
└── tmp
    └── finance_business
```
