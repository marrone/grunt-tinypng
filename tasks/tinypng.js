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
        multimeter = require("multimeter");

    grunt.registerMultiTask('tinypng', 'image optimization via tinypng service', function() {

        // Merge task-specific and/or target-specific options with these defaults.
        var options = this.options({
            apiKey: '',
            summarize: false,
            showProgress: false,
            checkSigs: false,
            sigFile: ''
        });

        if(options.checkSigs && !options.sigFile) {
            grunt.log.error("sigFile option required when specifying checkSigs option");
        }

        var done = this.async(),
            fileCount = 0,
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
            downProgress;

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

                var countPendingStr = " waiting on API";
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
            if(fileCount <= 0) {
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

        function handleAPIResponseSuccess(res, dest, srcpath) {
            var imageLocation = res.headers.location;
            grunt.verbose.writeln("making request to get image at " + imageLocation);

            var urlInfo = url.parse(imageLocation);
            urlInfo.accepts = '*/*';
            urlInfo.rejectUnauthorized = false;
            urlInfo.requestCert = true;

            compressCount++;
            if(options.summarize || options.showProgress) {
                var resStats = "";
                res.on("data", function(chunk) { resStats += chunk; });
                res.on("end", function() { 
                    var statsObj = JSON.parse(resStats);
                    outputBytes += statsObj.output.size;
                    if(options.showProgress) { 
                        downProgress.addImage(statsObj.output.size).render();
                    }
                });
            }

            https.get(urlInfo, function(imageRes) {
                grunt.verbose.writeln("minified image request response status code is " + imageRes.statusCode);

                if(imageRes.statusCode >= 300) {
                    grunt.log.error("got bad status code " + imageRes.statusCode);
                }

                if(options.showProgress) { 
                    imageRes.on('data', function(chunk){
                        downProgress.addProgress(chunk.length).render();
                    });
                }

                imageRes.on("end", function() { 
                    grunt.verbose.writeln("wrote minified image to " + dest);
                    fileCount--;
                    if(options.showProgress) { 
                        downProgress.addComplete().render();
                    }
                    if(options.checkSigs) {
                        getFileHash(srcpath, function(fp, hash) {
                            updateFileSigs(srcpath, hash);
                            checkDone();
                        });
                    }
                    else {
                        checkDone();
                    }
                });
                grunt.file.mkdir(path.dirname(dest));
                imageRes.pipe(fs.createWriteStream(dest));

            }).on("error", function(e) {
                grunt.log.error("got error, " + e.message + ", making request for minified image at " + imageLocation);
            });
        }

        function handleAPIResponseError(res) {
            var message = "";
            res.on("data", function(chunk) { 
                message += chunk;
            });
            res.on("end", function() { 
                grunt.log.error("got error response from api: " + message);
            });
        }

        function handleAPIResponse(res, dest, srcpath) {
            if(res.statusCode === 201 && !!res.headers.location) {
                handleAPIResponseSuccess(res, dest, srcpath);
            }
            else {
                handleAPIResponseError(res);
            }
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
            grunt.verbose.writeln("Processing image at " + filepath);

            var req = https.request(reqOpts, function(res) { 
                if(options.showProgress) { 
                    downProgress.removePending().render();
                }
                handleAPIResponse(res, dest, filepath); 
            });

            req.on("error", function(e) {
                grunt.log.error("problem with request: " + e.message);
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

            if(options.summarize || options.showProgress) { 
                var fileSize = fs.statSync(filepath).size;
                inputBytes += fileSize;
                if(options.showProgress) { 
                    upProgress.addImage(fileSize).render();
                    readStream.on('data', function(chunk){
                        upProgress.addProgress(chunk.length).render();
                    });
                }
            }
        }

        // START
        var that = this;
        function init() { 
            // Iterate over all specified file groups.
            that.files.forEach(function(f) {
                f.src.forEach(function(filepath) {
                    // Warn on and remove invalid source files (if nonull was set).
                    if(!grunt.file.exists(filepath)) {
                        grunt.log.warn('Source file "' + filepath + '" not found.');
                        return;
                    }

                    if(!grunt.option("force") && options.checkSigs && grunt.file.exists(f.dest)) {
                        grunt.verbose.writeln("comparing hash of image at " + filepath);
                        compareFileHash(filepath, fileSigs[filepath], function(fp, matches) {
                            if(!matches) { 
                                processImage(filepath, f.dest);
                            }
                            else {
                                grunt.verbose.writeln("file sig matches, skipping minification of file at " + filepath);
                                fileCount--;
                                skipCount++;
                                checkDone();
                            }
                        });
                    }
                    else {
                        processImage(filepath, f.dest);
                    }

                    fileCount++;
                }); 
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
