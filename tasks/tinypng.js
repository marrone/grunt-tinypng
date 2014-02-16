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

    var fs = require("fs"),
        path = require("path"),
        https = require("https"),
        url = require("url"),
        crypto = require("crypto"),
        humanize = require("humanize"),
        multimeter = require("multimeter"),
        Promise = require("promise");

    grunt.registerMultiTask('tinypng', 'image optimization via tinypng service', function() {

        // Merge task-specific and/or target-specific options with these defaults.
        var options = this.options({
            apiKey: '',
            summarize: false,
            showProgress: false,
            stopOnImageError: true,
            checkSigs: false,
            sigFile: ''
        });

        if(options.checkSigs && !options.sigFile) {
            grunt.log.error("sigFile option required when specifying checkSigs option");
        }

        var done = this.async(),
            skipCount = 0,
            compressCount = 0,
            inputBytes = 0,
            outputBytes = 0,
            reqOpts = {
                host: 'api.tinypng.com',
                port: 443,
                path: '/shrink',
                method: 'POST',
                accepts: '*/*',
                rejectUnauthorized: false,
                requestCert: true,
                agent: false,
                auth: 'api:' + options.apiKey
            },
            fileSigs = options.checkSigs && grunt.file.exists(options.sigFile) && grunt.file.readJSON(options.sigFile) || {},
            multi,
            maxBarLen = 13,
            upProgress,
            downProgress,
            imageUploadQueue = [],
            requestQueue = [],
            activeRequests = 0,
            maxRequests = 5;

        function pluralize(text, num) {
            return text + (num === 1 ? "" : "s");
        }

        function Progress(bar) {
            this.bar = bar;
            this.totalImages = 0;
            this.completeImages = 0;
            this.pendingImages = 0;
            this.totalBytes = 0;
            this.progressBytes = 0;
        }
        Progress.prototype = {
            addImage: function(fileSize) {
                this.totalImages++;
                this.addBytes(fileSize);
                return this;
            },
            addBytes: function(bytes) {
                this.totalBytes += bytes || 0;
                return this;
            },
            addProgress: function(fileSize) {
                this.progressBytes += fileSize;
                return this;
            },
            addComplete: function() {
                this.completeImages++;
                return this;
            },
            addPending: function() {
                this.pendingImages++;
                return this;
            },
            removePending: function() {
                this.pendingImages--;
                return this;
            },
            formatPerc: function(prog, total) {
                return this.totalBytes ? Math.round(this.progressBytes / this.totalBytes * 100) : 0;
            },
            toString: function() {
                var perc = this.formatPerc(),
                    percStr = perc;
                if(perc < 10) { percStr = "  " + percStr; }
                else if(perc < 100) { percStr = " " + percStr; }

                var countPendingStr = " pending";
                var blankPendingStr = "                    "; // hacky way to clear the multimeter trailing text
                var out = percStr + "% (" +
                          this.completeImages + "/" + this.totalImages + 
                          pluralize(" image", this.totalImages) +
                          (this.pendingImages ? ", " + this.pendingImages + countPendingStr + ")" : ") " + blankPendingStr);
                return out;
            },
            render: function() {
                var perc = this.formatPerc();
                var msg = this.toString();
                this.bar.percent(perc, msg);
                return this;
            }
        };

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

        function writeFileSigs() {
            grunt.file.write(options.sigFile, JSON.stringify(fileSigs));
        }

        function updateFileSigs(srcpath, hash) {
            fileSigs[srcpath] = hash;
            writeFileSigs();
        }

        function checkDone() {
            if(imageUploadQueue.length === 0 && activeRequests === 0 && requestQueue.length === 0) { 
                if(options.checkSigs) {
                    writeFileSigs();
                }
                if(multi) {
                    multi.write("\n");
                    multi.destroy();
                }
                if(options.summarize) {
                    var summary = "Skipped: " + skipCount + pluralize(" image", skipCount) + ", " +
                                  "Compressed: " + compressCount + pluralize(" image", compressCount) + ", " +
                                  "Savings: " + humanize.filesize(inputBytes - outputBytes) + 
                                  " (ratio: " + (inputBytes ? Math.round(outputBytes / inputBytes * 10000) / 10000 : 0) + ')';
                    grunt.log.writeln(summary);
                }
                done();
            }
        }

        function handleImageError(msg) {
            if(options.stopOnImageError) {
                grunt.log.error(msg);
                done(false);
            }
            else {
                grunt.log.warn(msg);
            }
        }

        function handleImageCompressComplete(srcpath) {
            var p = new Promise(function(resolve) { 
                if(options.checkSigs) {
                    getFileHash(srcpath, function(fp, hash) {
                        updateFileSigs(srcpath, hash);
                        resolve(srcpath);
                    });
                }
                else {
                    resolve(srcpath);
                }
            });
            return p;
        }

        function downloadOutputImage(imageLocation, dest, srcpath) {
            var p = new Promise(function(resolve, reject) { 
                var urlInfo = url.parse(imageLocation);
                urlInfo.accepts = '*/*';
                urlInfo.rejectUnauthorized = false;
                urlInfo.requestCert = true;

                https.get(urlInfo, function(imageRes) {
                    grunt.verbose.writeln("minified image request response status code is " + imageRes.statusCode);

                    if(imageRes.statusCode >= 300) {
                        handleImageError("got bad status code " + imageRes.statusCode);
                    }

                    if(options.showProgress) { 
                        imageRes.on('data', function(chunk){
                            downProgress.addProgress(chunk.length).render();
                        });
                    }

                    imageRes.on("end", function() { 
                        grunt.verbose.writeln("wrote minified image to " + dest);
                        handleImageCompressComplete(srcpath).done(resolve, reject);
                        if(options.showProgress) { 
                            downProgress.addComplete().render();
                        }
                    });
                    grunt.file.mkdir(path.dirname(dest));
                    imageRes.pipe(fs.createWriteStream(dest));

                }).on("error", function(e) {
                    handleImageError("got error, " + e.message + ", making request for minified image at " + imageLocation);
                    reject(e.message);
                });
            });
            return p;
        }

        function handleAPIResponseSuccess(res, dest, srcpath) {
            var p = new Promise(function(resolve, reject) { 
                var imageLocation = res.headers.location;
                grunt.verbose.writeln("making request to get image at " + imageLocation);

                compressCount++;
                var resStats = "";
                res.on("data", function(chunk) { resStats += chunk; });
                res.on("end", function() { 
                    var statsObj = JSON.parse(resStats);

                    if(options.summarize) { 
                        outputBytes += statsObj.output.size;
                    }

                    // only download the output image if it resulted in a smaller file size
                    // (sometimes tinypng's service results in larger files)
                    if(statsObj.output.size < statsObj.input.size) {
                        if(options.showProgress) { 
                            downProgress.addImage(statsObj.output.size).render();
                        }
                        downloadOutputImage(imageLocation, dest, srcpath).done(resolve, reject);
                    }
                    else {
                        grunt.verbose.writeln("output image is larger than source image, copying src " + srcpath + " to dest " + dest);
                        grunt.file.copy(srcpath, dest);
                        handleImageCompressComplete(srcpath).done(resolve, reject);
                    }
                });
            });
            return p;
        }

        function handleAPIResponseError(res) {
            var p = new Promise(function(resolve, reject) { 
                var message = "";
                res.on("data", function(chunk) { 
                    message += chunk;
                });
                res.on("end", function() { 
                    handleImageError("got error response from api: " + message);
                    reject(message);
                });
            });
            return p;
        }

        function handleAPIResponse(res, dest, srcpath) {
            requestQueue.push(function() { 
                if(res.statusCode === 201 && !!res.headers.location) {
                    return handleAPIResponseSuccess(res, dest, srcpath);
                }
                else {
                    return handleAPIResponseError(res);
                }
            });
            queueNextUploadImageRequest();
        }

        function getFileHash(filepath, callback) {
            var md5 = crypto.createHash("md5"),
                stream = fs.ReadStream(filepath);
            stream.on("data", function(d) { md5.update(d); });
            stream.on("end", function() {
                callback(filepath, md5.digest("hex"));
            });
        }

        function compareFileHash(filepath, expectedHash, callback) {
            if(!expectedHash) {
                callback(filepath, false);
            }
            else { 
                getFileHash(filepath, function(fp, hash) {
                    callback(filepath, hash === expectedHash);
                });
            }
        }

        function processImage(filepath, dest) { 
            var p = new Promise(function(resolve, reject) { 
                grunt.verbose.writeln("Processing image at " + filepath);
                // make upload image request
                var req = https.request(reqOpts, function(res) { 
                    if(options.showProgress) { 
                        downProgress.removePending().render();
                    }
                    // upload complete, get the result image response from the api
                    handleAPIResponse(res, dest, filepath); 
                    resolve(res);
                });

                // upload fail
                req.on("error", function(e) {
                    handleImageError("problem with request: " + e.message);
                    reject(e.message);
                    queueNextUploadImageRequest();
                });

                // stream the image data as the request POST body
                var readStream = fs.createReadStream(filepath);
                readStream.on("end", function() {
                    if(options.showProgress) { 
                        downProgress.addPending().render();
                        upProgress.addComplete().render();
                    }
                    req.end();
                });
                readStream.pipe(req);

                // summary output to console
                if(options.summarize || options.showProgress) { 
                    var fileSize = fs.statSync(filepath).size;
                    inputBytes += fileSize;
                    if(options.showProgress) { 
                        upProgress.removePending().addImage(fileSize).render();
                        readStream.on('data', function(chunk){
                            upProgress.addProgress(chunk.length).render();
                        });
                    }
                }
            });
            return p;
        }

        function onQueuedRequestDone() {
            activeRequests--;
            checkDone();
            processQueue();
        }
        function processQueue() {
            while(requestQueue.length > 0 && activeRequests < maxRequests) {
                activeRequests++;
                requestQueue.shift()().done(onQueuedRequestDone, onQueuedRequestDone);
            }
        }
        function queueNextUploadImageRequest(srcpath, dest) {
            if(imageUploadQueue.length > 0) {
                var nextImageData = imageUploadQueue.shift();
                requestQueue.push(function() {
                    return processImage.apply(null, nextImageData);
                });
            }
        }

        // START
        var that = this;
        var filesReady = [];
        function init() { 
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
                            compareFileHash(filepath, fileSigs[filepath], function(fp, matches) {
                                if(!matches) { 
                                    imageUploadQueue.push([filepath, f.dest]);
                                    if(options.showProgress) { 
                                        upProgress.addPending();
                                    }
                                }
                                else {
                                    grunt.verbose.writeln("file sig matches, skipping minification of file at " + filepath);
                                    skipCount++;
                                }
                                resolve();
                            });
                        }
                        else {
                            imageUploadQueue.push([filepath, f.dest]);
                            if(options.showProgress) { 
                                upProgress.addPending();
                            }
                            resolve();
                        }
                    }));
                }); 
            });

            Promise.all(filesReady).then(function() { 
                while(imageUploadQueue.length > 0 && requestQueue.length < maxRequests) {
                    queueNextUploadImageRequest();
                }
                processQueue();
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
