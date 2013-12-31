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
            upCount = 0,
            upCountComplete = 0,
            upBytes = 0,
            upBar,
            downCount = 0,
            downCountPending = 0,
            downCountComplete = 0,
            downBytes = 0,
            downBar;

        function pluralize(text, num) {
            return text + (num === 1 ? "" : "s");
        }

        function formatPerc(prog, total) {
            return total ? Math.round(prog / total * 100) : 0;
        }

        function formatProgressMessage(perc, countComplete, countTotal, countPending) {
            var percStr = perc;
            if(perc < 10) { percStr = "  " + percStr; }
            else if(perc < 100) { percStr = " " + percStr; }

            var countPendingStr = " waiting on API";
            var blankPendingStr = "                    "; // hacky way to clear the multimeter trailing text
            var out = percStr + "% (" +
                      countComplete + "/" + countTotal + 
                      pluralize(" image", countTotal) +
                      (countPending ? ", " + countPending + countPendingStr + ")" : ") " + blankPendingStr);
            return out;
        }

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
                downBar = bar; 
                multi.write("\n↓ Download:");
                createBar(1, function(bar) {
                    upBar = bar;
                    multi.write("\n");
                    callback();
                });
            });
        }

        function checkDone() {
            if(fileCount <= 0) {
                if(options.checkSigs) {
                    grunt.file.write(options.sigFile, JSON.stringify(fileSigs));
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
                downCount++;
                var resStats = "";
                res.on("data", function(chunk) { resStats += chunk; });
                res.on("end", function() { 
                    var statsObj = JSON.parse(resStats);
                    outputBytes += statsObj.output.size;
                });
            }

            https.get(urlInfo, function(imageRes) {
                grunt.verbose.writeln("minified image request response status code is " + imageRes.statusCode);

                if(imageRes.statusCode >= 300) {
                    grunt.log.error("got bad status code " + imageRes.statusCode);
                }

                if(options.showProgress) { 
                    imageRes.on('data', function(chunk){
                        downBytes += chunk.length;
                        var perc = formatPerc(downBytes, outputBytes);
                        var msg = formatProgressMessage(perc, downCountComplete, downCount, downCountPending);
                        downBar.percent(perc, msg);
                    });
                }

                imageRes.on("end", function() { 
                    grunt.verbose.writeln("wrote minified image to " + dest);
                    fileCount--;
                    downCountComplete++;
                    var perc = formatPerc(downBytes, outputBytes);
                    downBar.percent(perc, formatProgressMessage(perc, downCountComplete, downCount, downCountPending));
                    if(options.checkSigs) {
                        getFileHash(srcpath, function(fp, hash) {
                            fileSigs[srcpath] = hash;
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
                downCountPending--;
                handleAPIResponse(res, dest, filepath); 
            });

            req.on("error", function(e) {
                grunt.log.error("problem with request: " + e.message);
            });

            // stream the image data as the request POST body
            var stream = fs.createReadStream(filepath);
            stream.on("end", function() {
                upCountComplete++;
                downCountPending++;
                var perc = formatPerc(upBytes, inputBytes);
                upBar.percent(perc, formatProgressMessage(perc, upCountComplete, upCount));
                req.end();
            });
            stream.pipe(req);

            if(options.summarize || options.showProgress) { 
                inputBytes += fs.statSync(filepath).size;
                if(options.showProgress) { 
                    upCount++;
                    stream.on('data', function(chunk){
                        upBytes += chunk.length;
                        var perc = formatPerc(upBytes, inputBytes);
                        var msg = formatProgressMessage(perc, upCountComplete, upCount);
                        upBar.percent(perc, msg);
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
