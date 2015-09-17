var https = require("https"),
    path = require("path"),
    fs = require("graceful-fs"),
    url = require("url"),
    EventEmitter = require('events').EventEmitter;

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
    this.fileSize = null;
    this.trackProgress = !!opts.trackProgress;
    this.events = new EventEmitter();
}

var EVENTS = {
    UPLOAD_START: "uploadStart",
    UPLOAD_PROGRESS: "uploadProgress",
    UPLOAD_COMPLETE: "uploadComplete",
    UPLOAD_FAILED: "uploadFailed",
    DOWNLOAD_START: "downloadStart",
    DOWNLOAD_PROGRESS: "downloadProgress",
    DOWNLOAD_COMPLETE: "downloadComplete",
    DOWNLOAD_FAILED: "downloadFailed"
};
ImageProcess.EVENTS = EVENTS;

ImageProcess.prototype = {

    uploadImage: function(callback) {
        this.isUploading = true;
        this.events.emit(EVENTS.UPLOAD_START, this);

        // make upload image request
        reqOpts.auth = 'api:' + this.apiKey;
        var req = https.request(reqOpts, function(res) {
            this.isUploading = false;
            this.handleUploadResponse(res, callback);
        }.bind(this));

        // upload fail
        req.on("error", function(e) {
            this.isUploading = false;
            this.isFailed = true;
            var errMessage = "problem with request: " + e.message;
            callback(errMessage);
            this.events.emit(EVENTS.UPLOAD_FAILED, this, errMessage);
        }.bind(this));

        // stream the image data as the request POST body
        var readStream = fs.createReadStream(this.srcpath);

        if(this.trackProgress) { 
            readStream.on('data', function(chunk) { 
                this.events.emit(EVENTS.UPLOAD_PROGRESS, this, chunk); 
            }.bind(this));
        }

        readStream.on("end", function() { req.end(); });
        readStream.pipe(req);
    },

    downloadImage: function(grunt, callback) {
        this.isDownloading = true;
        this.events.emit(EVENTS.DOWNLOAD_START, this);

        var urlInfo = url.parse(this.compressedImageUrl);
        urlInfo.accepts = '*/*';
        urlInfo.rejectUnauthorized = false;
        urlInfo.requestCert = true;

        https.get(urlInfo, function(imageRes) {
            if(imageRes.statusCode >= 300) {
                this.isDownloading = false;
                this.isFailed = true;
                var errMessage = "got bad status code " + imageRes.statusCode;
                callback(errMessage);
                this.events.emit(EVENTS.DOWNLOAD_FAILED, this, errMessage);
                return;
            }

            if(this.trackProgress) { 
                imageRes.on('data', function(chunk){
                    this.events.emit(EVENTS.DOWNLOAD_PROGRESS, this, chunk);
                }.bind(this));
            }

            grunt.file.mkdir(path.dirname(this.destpath));
            var writeStream = fs.createWriteStream(this.destpath);
            writeStream.on('finish', function() {
                this.isDownloading = false;
                this.downloadComplete = true;
                this.isCompleted = true;
                callback();
                this.events.emit(EVENTS.DOWNLOAD_COMPLETE, this);
            }.bind(this));
            imageRes.on("end", function() {
                writeStream.end();
            }.bind(this));

            imageRes.pipe(writeStream);

        }.bind(this)).on("error", function(e) {
            this.isDownloading = false;
            this.isFailed = true;
            var errMessage = "got error, " + e.message + ", making request for minified image at " + this.compressedImageUrl;
            callback(errMessage);
            this.events.emit(EVENTS.DOWNLOAD_FAILED, this, errMessage);
        }.bind(this));
    },

    getCompressionStats: function(res, callback) {
        var resStats = "";
        res.on("data", function(chunk) { resStats += chunk; });
        res.on("end", function() {
            this.compressionStats = JSON.parse(resStats);
            callback(this.compressionStats);
        }.bind(this));
    },

    shouldDownload: function() {
        return this.compressionStats && this.compressionStats.output.size < this.compressionStats.input.size;
    },

    handleUploadResponse: function(res, callback) {
        if(res.statusCode === 201 && !!res.headers.location) {
            this.compressedImageUrl = res.headers.location;
            this.getCompressionStats(res, function() {
                this.uploadComplete = true;
                callback();
                this.events.emit(EVENTS.UPLOAD_COMPLETE, this);
            }.bind(this));
        }
        else {
            var message = "";
            res.on("data", function(chunk) { message += chunk; });
            res.on("end", function() {
                this.isFailed = true;
                var errMessage = "got error response from api: " + message;
                callback(errMessage);
                this.events.emit(EVENTS.UPLOAD_FAILED, this, errMessage);
            }.bind(this));
        }
    },

    getSourceFileSize: function(callback) {
        if(this.fileSize === null) {
            fs.stat(this.srcpath, function(err, stat) {
                this.fileSize = stat ? stat.size : 0;
                callback(this.fileSize);
            }.bind(this));
        }
        else { 
            callback(this.fileSize);
        }
    },

    process: function(callback) {
        this.isStarted = true;
        this.getSourceFileSize(function() {
            this.uploadImage(callback);
        }.bind(this));
    }

};


module.exports = ImageProcess;
