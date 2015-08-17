var https = require("https"),
    path = require("path"),
    fs = require("graceful-fs"),
    url = require("url"),
    Promise = require("promise");

var reqOpts = {
    host: 'api.tinypng.com',
    port: 443,
    path: '/shrink',
    method: 'POST',
    accepts: '*/*',
    rejectUnauthorized: false,
    requestCert: true,
    agent: false
};

var noop = function(){};


function ImageProcess(srcpath, destpath, apiKey, opts) {
    this.apiKey = apiKey;
    this.srcpath = srcpath;
    this.destpath = destpath;
    this.isUploading = false;
    this.uploadComplete = false;
    this.isDownloading = false;
    this.downloadComplete = false;
    this.isStarted = false;
    this.isCompleted = false;
    this.isFailed = false;
    this.compressedImageUrl = null;
    this.fileSize = 0;
    this.trackProgress = !!opts.trackProgress;
    this.onUploadStart = opts.onUploadStart || noop;
    this.onUploadProgress = opts.onUploadProgress || noop;
    this.onUploadComplete = opts.onUploadEnd || noop;
    this.onDownloadStart = opts.onDownloadStart || noop;
    this.onDownloadProgress = opts.onDownloadProgress || noop;
    this.onDownloadComplete = opts.onDownloadEnd || noop;
    this.onError = opts.onError || noop;
}

ImageProcess.prototype = {

    uploadImage: function() {
        var p = new Promise(function(resolve, reject) {
            this.isUploading = true;
            this.onUploadStart(this);

            // make upload image request
            reqOpts.auth = 'api:' + this.apiKey;
            var req = https.request(reqOpts, function(res) {
                this.isUploading = false;
                this.handleUploadResponse(res);
                resolve(res);
            }.bind(this));

            // upload fail
            req.on("error", function(e) {
                this.isUploading = false;
                this.isFailed = true;
                this.onError(this, "problem with request: " + e.message);
                reject(e.message);
            }.bind(this));

            // stream the image data as the request POST body
            var readStream = fs.createReadStream(this.srcpath);
            readStream.on("end", function() { req.end(); });
            if(this.trackProgress) { 
                readStream.on('data', function(chunk) { this.onUploadProgress(this, chunk); }.bind(this));
            }
            readStream.pipe(req);
        }.bind(this));
        return p;
    },

    downloadImage: function(grunt) {
        var p = new Promise(function(resolve, reject) {
            this.isDownloading = true;
            this.onDownloadStart(this);

            var urlInfo = url.parse(this.compressedImageUrl);
            urlInfo.accepts = '*/*';
            urlInfo.rejectUnauthorized = false;
            urlInfo.requestCert = true;

            https.get(urlInfo, function(imageRes) {
                if(imageRes.statusCode >= 300) {
                    this.isDownloading = false;
                    this.isFailed = true;
                    this.onError(this, "got bad status code " + imageRes.statusCode);
                    return;
                }

                if(this.trackProgress) { 
                    imageRes.on('data', function(chunk){
                        this.onDownloadProgress(this, chunk);
                    }.bind(this));
                }

                imageRes.on("end", function() {
                    this.isDownloading = false;
                    this.downloadComplete = true;
                    this.isCompleted = true;
                    this.onDownloadComplete(this);
                }.bind(this));

                grunt.file.mkdir(path.dirname(this.destpath));
                imageRes.pipe(fs.createWriteStream(this.destpath));

            }.bind(this)).on("error", function(e) {
                this.isDownloading = false;
                this.isFailed = true;
                this.onError("got error, " + e.message + ", making request for minified image at " + this.compressedImageUrl);
                reject(e.message);
            }.bind(this));
        }.bind(this));
        return p;
    },

    getCompressionStats: function(res) {
        var p = new Promise(function(resolve, reject) {
            var resStats = "";
            res.on("data", function(chunk) { resStats += chunk; });
            res.on("end", function() {
                this.compressionStats = JSON.parse(resStats);
                resolve(this.compressionStats);
            }.bind(this));
        }.bind(this));
        return p;
    },

    handleUploadResponseError: function(res) {
        var message = "";
        res.on("data", function(chunk) { message += chunk; });
        res.on("end", function() {
            this.isFailed = true;
            this.onError(this, "got error response from api: " + message);
        }.bind(this));
    },

    handleUploadResponse: function(res) {
        if(res.statusCode === 201 && !!res.headers.location) {
            this.compressedImageUrl = res.headers.location;
            this.getCompressionStats(res).done(function() {
                this.uploadComplete = true;
                this.onUploadComplete(this);
            }.bind(this));
        }
        else {
            this.handleUploadResponseError(res);
        }
    },


    process: function() {
        this.isStarted = true;
        if(this.trackProgress) {
            this.fileSize = fs.statSync(this.srcpath).size;
        }
        this.uploadImage();
    }

};


module.exports = ImageProcess;
