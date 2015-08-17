var multimeter = require("multimeter"),
    ProgressBar = require("./ProgressBar"),
    ImageEvents = require("../model/ImageProcess").EVENTS;

var maxBarLen = 13;
var colors = ["green","blue"];

function ProgressView() {
    this.multi = null;
    this.upProgress = null;
    this.downProgress = null;
}

function createBar(multi, barCount, callback) {
    callback(multi.rel(maxBarLen, (barCount + 1), {
        width: 20,
        solid: {
            text: '|',
            foreground: 'white',
            background: colors[barCount]
        },
        empty: {text: ' '}
    }));
}

function createProgressBars(callback) {
    if(!this.multi) { return; }

    this.multi.write("↑ Upload:");
    createBar(this.multi, 0, function(bar) {
        this.downProgress = new ProgressBar(bar);
        this.multi.write("\n↓ Download:");
        createBar(this.multi, 1, function(bar) {
            this.upProgress = new ProgressBar(bar);
            this.multi.write("\n");
            callback();
        }.bind(this));
    }.bind(this));
}

function handleUploadStart(img) {
    this.upProgress.removePending().render();
}

function handleUploadProgress(img, chunk) {
    this.upProgress.addProgress(chunk.length).render();
}

function handleUploadComplete(img) {
    if(img.shouldDownload()) {
        this.downProgress.addPending().render();
    }
    this.upProgress.addComplete().render();
}

function handleDownloadStart(img) {
    this.downProgress.removePending().addImage(img.compressionStats.output.size).render();
}

function handleDownloadProgress(img, chunk) {
    this.downProgress.addProgress(chunk.length).render();
}

function handleDownloadComplete(img) {
    this.downProgress.addComplete().render();
}

ProgressView.prototype = {

    init: function(callback) {
        this.multi = multimeter(process);
        createProgressBars.call(this, callback);
    },

    addImage: function(imgProc) {
        this.upProgress.addPending();
        imgProc.getSourceFileSize(function(size) { 
            this.upProgress.addImage(size);
        }.bind(this));
        imgProc.events.on(ImageEvents.UPLOAD_START, handleUploadStart.bind(this));
        imgProc.events.on(ImageEvents.UPLOAD_PROGRESS, handleUploadProgress.bind(this));
        imgProc.events.on(ImageEvents.UPLOAD_COMPLETE, handleUploadComplete.bind(this));
        imgProc.events.on(ImageEvents.DOWNLOAD_START, handleDownloadStart.bind(this));
        imgProc.events.on(ImageEvents.DOWNLOAD_PROGRESS, handleDownloadProgress.bind(this));
        imgProc.events.on(ImageEvents.DOWNLOAD_COMPLETE, handleDownloadComplete.bind(this));
    },
    
    renderDone: function() {
        if(this.multi) {
            this.multi.write("\n");
            this.multi.destroy();
        }
    }
};


module.exports = ProgressView;
