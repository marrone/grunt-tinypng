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
        crypto = require("crypto");

    grunt.registerMultiTask('tinypng', 'image optimization via tinypng service', function() {

        // Merge task-specific and/or target-specific options with these defaults.
        var options = this.options({
            apiKey: '',
            checkSigs: false,
            sigFile: ''
        });

        if(options.checkSigs && !options.sigFile) {
            grunt.log.error("sigFile option required when specifying checkSigs option");
        }

        var done = this.async(),
            fileCount = 0,
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
            fileSigs = options.checkSigs && grunt.file.exists(options.sigFile) && grunt.file.readJSON(options.sigFile) || {};

        function checkDone() {
            if(fileCount <= 0) {
                if(options.checkSigs) {
                    grunt.file.write(options.sigFile, JSON.stringify(fileSigs));
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

            https.get(urlInfo, function(imageRes) {
                grunt.verbose.writeln("minified image request response status code is " + imageRes.statusCode);

                if(imageRes.statusCode >= 300) {
                    grunt.log.error("got bad status code " + imageRes.statusCode);
                }

                imageRes.on("end", function() { 
                    grunt.log.writeln("wrote minified image to " + dest);
                    fileCount--;
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
            grunt.verbose.writeln("API RESPONSE STATUS: " + res.statusCode);
            grunt.verbose.writeln("HEADERS: " + JSON.stringify(res.headers));

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
                handleAPIResponse(res, dest, filepath); 
            });

            req.on("error", function(e) {
                grunt.log.error("problem with request: " + e.message);
            });

            // stream the image data as the request POST body
            var stream = fs.createReadStream(filepath);
            stream.on("end", function() {
                req.end();
            });
            stream.pipe(req);
        }

        // Iterate over all specified file groups.
        this.files.forEach(function(f) {
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
                            fileCount--;
                            grunt.verbose.writeln("file sig matches, skipping minification of file at " + filepath);
                        }
                    });
                }
                else {
                    processImage(filepath, f.dest);
                }

                fileCount++;
            }); 
        });
    });

};
