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

    var fs = require("graceful-fs"),
        path = require("path"),
        humanize = require("humanize"),
        multimeter = require("multimeter"),
        async = require("async"),
        Promise = require("promise"),
        Progress = require("./model/Progress"),
        SigFile = require("./model/SigFile"),
        ImageProcess = require("./model/ImageProcess"),
        pluralize = require("./util/pluralize");

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
            multi,
            maxBarLen = 13,
            upProgress,
            downProgress,
            maxDownloads = 5,
            downloadQueue,
            maxUploads = 5,
            uploadQueue,
            completedImages = [];


        function createProgressBars(callback) {
            if(!multi) {
                return;
            }

            var colors = ["red","blue"];
            function createBar(barCount, callback) {
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

            multi.write("↑ Upload:");
            createBar(0, function(bar) {
                downProgress = new Progress(bar);
                multi.write("\n↓ Download:");
                createBar(1, function(bar) {
                    upProgress = new Progress(bar);
                    multi.write("\n");
                    callback();
                });
            });
        }

        function summarize() {
            var compressCount = 0,
                inputBytes = 0,
                outputBytes = 0;

            completedImages.forEach(function(img) {
                if(!img.isFailed) {
                    compressCount++;
                    inputBytes += img.fileSize;
                    if(img.downloadComplete) {
                        outputBytes += img.compressionStats.output.size;
                    }
                    else {
                        img.outputBytes += img.fileSize;
                    }
                }
            });

            var summary = "Skipped: " + skipCount + pluralize(" image", skipCount) + ", " +
                          "Compressed: " + compressCount + pluralize(" image", compressCount) + ", " +
                          "Savings: " + humanize.filesize(inputBytes - outputBytes) +
                          " (ratio: " + (inputBytes ? Math.round(outputBytes / inputBytes * 10000) / 10000 : 0) + ')';
            grunt.log.writeln(summary);
        }

        function checkDone() {
            if(uploadQueue.running() === 0 && uploadQueue.idle() === 0 && downloadQueue.running() === 0 && downloadQueue.idle() === 0) { 
                if(options.checkSigs) {
                    fileSigs.save(grunt);
                }
                if(multi) {
                    multi.write("\n");
                    multi.destroy();
                }
                if(options.summarize) {
                    summarize();
                }
                done();
            }
        }

        function handleDownloadError(img, msg) {
            handleImageError(img, msg);
        }

        function handleUploadError(img, msg) {
            handleImageError(img, msg);
        }

        function handleImageError(img, msg) {
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
                grunt.warn(msg);
            }
        }

        function handleUploadStart(img) {
            grunt.verbose.writeln("Processing image at " + img.srcpath);
            if(options.showProgress) {
                upProgress.removePending().addImage(img.fileSize).render();
            }
        }

        function handleUploadProgress(img, chunk) {
            upProgress.addProgress(chunk.length).render();
        }

        function handleUploadComplete(img) {
            if(img.compressionStats.output.size < img.compressionStats.input.size) {
                if(options.showProgress) {
                    downProgress.addPending().render();
                }
                downloadQueue.push(img);
            }
            else {
                grunt.verbose.writeln("output image is larger than source image, copying src " + img.srcpath + " to dest " + img.destpath);
                grunt.file.copy(img.srcpath, img.destpath);
                handleImageProcessComplete(img);
            }
            if(options.showProgress) {
                upProgress.addComplete().render();
            }
        }

        function handleDownloadStart(img) {
            grunt.verbose.writeln("making request to get image at " + img.compressedImageUrl);
            if(options.showProgress) {
                downProgress.removePending().addImage(img.compressionStats.output.size).render();
            }
        }

        function handleDownloadProgress(img, chunk) {
            downProgress.addProgress(chunk.length).render();
        }

        function handleDownloadComplete(img) {
            grunt.verbose.writeln("wrote minified image to " + img.destpath);
            handleImageProcessComplete(img.srcpath);
            if(options.showProgress) {
                downProgress.addComplete().render();
            }
        }

        function createImageProcess(srcpath, destpath) {
            if(options.showProgress) {
                upProgress.addPending();
            }
            return new ImageProcess(srcpath, destpath, options.apiKey, {
                onUploadStart: handleUploadStart,
                onUploadProgress: handleUploadProgress,
                onUploadComplete: handleUploadComplete,
                onUploadError: handleUploadError,
                onDownloadStart: handleDownloadStart,
                onDownloadProgress: handleDownloadProgress,
                onDownloadComplete: handleDownloadComplete,
                onDownloadError: handleDownloadError,
                trackProgress: options.showProgress
            });
        }

        function uploadImage(img, callback) {
            img.process(callback);
        }

        function downloadImage(img, callback) {
            img.downloadImage(grunt, callback);
        }

        function handleImageProcessComplete(img) {
            completedImages.push(img);
            var p = new Promise(function(resolve) {
                if(options.checkSigs) {
                    SigFile.getFileHash(img.srcpath, function(fp, hash) {
                        fileSigs.set(img.srcpath, hash).save(grunt);
                        resolve(img.srcpath);
                    });
                }
                else {
                    resolve(img.srcpath);
                }
            });
            return p;
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
            multi = multimeter(process);
            createProgressBars(init);
        }
        else {
            init();
        }

    });

};
