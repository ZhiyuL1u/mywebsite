const WebpackAliyunOssPlugin = require('./oss');

module.exports = {
    outputDir: 'dist',
    productionSourceMap: false,

    css: {
        sourceMap: true
    },

    configureWebpack: {
        plugins: [
            new WebpackAliyunOssPlugin({
                enable: false
            })
        ]
    },

    publicPath: '/'
};
