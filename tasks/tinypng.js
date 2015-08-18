/*global require:true, process:true */

/*
 * grunt-tinypng
 * https://github.com/marrone/grunt-tinypng
 *
 * Copyright (c) 2013 Mike M
 * Licensed under the MIT license.
 */

module.exports = function(grunt) {

    'use strict';

    // Please see the Grunt documentation for more information regarding task
    // creation: http://gruntjs.com/creating-tasks

    var async = require("async"),
        Promise = require("promise"),
        SigFile = require("./model/SigFile"),
        ImageProcess = require("./model/ImageProcess"),
        ProgressView = require("./view/Progress"),
        SummaryView = require("./view/Summary");

    grunt.registerMultiTask('tinypng', 'image optimization via tinypng service', function() {

        // Merge task-specific and/or target-specific options with these defaults.
        var options = this.options({
            apiKey: '',
            summarize: false,
            summarizeOnError: false,
            showProgress: false,
            stopOnImageError: true,
            checkSigs: false,
            sigFile: '',
            sigFileSpace: 0
        });

        if(options.checkSigs && !options.sigFile) {
            grunt.log.error("sigFile option required when specifying checkSigs option");
        }

        var done = this.async(),
            skipCount = 0,
            fileSigs = new SigFile(options.sigFile, options.checkSigs && grunt.file.exists(options.sigFile) && grunt.file.readJSON(options.sigFile) || {}, options.sigFileSpace),
            progressView = options.showProgress ? new ProgressView() : null,
            maxDownloads = 5,
            downloadQueue,
            maxUploads = 5,
            uploadQueue,
            completedImages = [];


        function summarize() {
            var summaryView = new SummaryView();
            summaryView.render(grunt, {
                skippedCount: skipCount,
                completedImages: completedImages
            });
        }

        function checkDone() {
            if(uploadQueue.running() === 0 && uploadQueue.length() === 0 && downloadQueue.running() === 0 && downloadQueue.length() === 0) { 
                async.nextTick(function() {
                    if(options.checkSigs) {
                        fileSigs.save(grunt);
                    }
                    if(progressView) {
                        progressView.renderDone();
                    }
                    if(options.summarize) {
                        summarize();
                    }
                    done();
                });
            }
        }

        function handleDownloadError(img, msg) {
            handleImageError(img, msg);
        }

        function handleUploadError(img, msg) {
            handleImageError(img, msg);
        }

        function handleImageError(img, msg) {
            completedImages.push(img);
            if(options.stopOnImageError) {
                if(options.summarizeOnError) {
                    summarize();
                }
                grunt.log.error(msg);
                uploadQueue.kill();
                downloadQueue.kill();
                done(false);
            }
            else {
                grunt.verbose.writeln(msg);
                checkDone();
            }
        }

        function handleUploadStart(img) {
            grunt.verbose.writeln("Processing image at " + img.srcpath);
        }

        function handleUploadComplete(img) {
            if(img.shouldDownload()) {
                downloadQueue.push(img);
            }
            else {
                grunt.verbose.writeln("output image is larger than source image, copying src " + img.srcpath + " to dest " + img.destpath);
                grunt.file.copy(img.srcpath, img.destpath);
                handleImageProcessComplete(img);
            }
        }

        function handleDownloadStart(img) {
            grunt.verbose.writeln("making request to get image at " + img.compressedImageUrl);
        }

        function handleDownloadComplete(img) {
            grunt.verbose.writeln("wrote minified image to " + img.destpath);
            handleImageProcessComplete(img);
        }

        function createImageProcess(srcpath, destpath) {
            var img = new ImageProcess(srcpath, destpath, options.apiKey, {trackProgress: options.showProgress});
            img.events.on(ImageProcess.EVENTS.UPLOAD_START, handleUploadStart);
            img.events.on(ImageProcess.EVENTS.UPLOAD_COMPLETE, handleUploadComplete);
            img.events.on(ImageProcess.EVENTS.UPLOAD_FAILED, handleUploadError);
            img.events.on(ImageProcess.EVENTS.DOWNLOAD_START, handleDownloadStart);
            img.events.on(ImageProcess.EVENTS.DOWNLOAD_COMPLETE, handleDownloadComplete);
            img.events.on(ImageProcess.EVENTS.DOWNLOAD_FAILED, handleDownloadError);
            if(options.showProgress) {
                progressView.addImage(img);
            }
            return img;
        }

        function uploadImage(img, callback) {
            img.process(callback);
        }

        function downloadImage(img, callback) {
            img.downloadImage(grunt, callback);
        }

        function handleImageProcessComplete(img) {
            completedImages.push(img);
            if(options.checkSigs) {
                SigFile.getFileHash(img.srcpath, function(fp, hash) {
                    fileSigs.set(img.srcpath, hash).save(grunt);
                    checkDone();
                });
            }
            else {
                checkDone();
            }
        }


        // START
        var that = this;
        function init() {
            downloadQueue = async.queue(downloadImage, maxDownloads);
            uploadQueue = async.queue(uploadImage, maxUploads);
            uploadQueue.pause();

            var filesReady = [];

            // Iterate over all specified file groups.
            that.files.forEach(function(f) {
                f.src.forEach(function(filepath) {
                    filesReady.push(new Promise(function(resolve, reject) {
                        // Warn on and remove invalid source files (if nonull was set).
                        if(!grunt.file.exists(filepath)) {
                            var errMsg = 'Source file "' + filepath + '" not found.';
                            grunt.log.warn(errMsg);
                            reject(errMsg);
                            return;
                        }

                        if(!grunt.option("force") && options.checkSigs && grunt.file.exists(f.dest)) {
                            grunt.verbose.writeln("comparing hash of image at " + filepath);
                            SigFile.compareFileHash(filepath, fileSigs.get(filepath), function(fp, matches) {
                                if(!matches) {
                                    uploadQueue.push(createImageProcess(filepath, f.dest));
                                }
                                else {
                                    grunt.verbose.writeln("file sig matches, skipping minification of file at " + filepath);
                                    skipCount++;
                                }
                                resolve();
                            });
                        }
                        else {
                            uploadQueue.push(createImageProcess(filepath, f.dest));
                            resolve();
                        }
                    }));
                });
            });

            Promise.all(filesReady).then(function() {
                uploadQueue.resume();
                checkDone();
            });
        }

        if(options.showProgress) {
            progressView.init(init);
        }
        else {
            init();
        }

    });

};
