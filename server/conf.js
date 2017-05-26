module.exports = {
    port: 8989,
    cdnPattern: "https?://.*?\/",
    devHost: "http://127.0.0.1",
    cacheDir: "/var/fepack",
    authFile: ".goauth",
    vcDir: "/var/frontend",
    vc: {
        type: "git",
        host: "http://gitlab.rongcloud.net",
        localhost: "/var/frontend",
        materials: `<git url="git@gitlab.rongcloud.net:{{vcpath}}" branch="{{branch}}"/>`
    }
}
