module.exports = {
    port: 8989,
    cdnPattern: "https?://img\d.cache.netease.com/f2e/",
    devHost: "http://dev.f2e.163.com",
    cacheDir: "/var/fepack",
    vcDir: "/var/frontend",
    authFile: ".goauth",
    vc: {
        type: "svn",
        host: "https://svn.ws.netease.com/frontend",
        localhost: "/var/frontend",
        materials: `<svn url="https://svn.ws.netease.com/frontend/{{vcpath}}" username="web" encryptedPassword="0554GP5PdngKqsh3YbHJhw==" autoUpdate="false" />`
    }

}
