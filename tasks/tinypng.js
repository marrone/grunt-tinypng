/*
 * grunt-tinypng
 * https://github.com/marrone/grunt-tinypng
 *
 * Copyright (c) 2013 Mike M
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

    // Please see the Grunt documentation for more information regarding task
    // creation: http://gruntjs.com/creating-tasks

    var fs = require("fs"),
        https = require("https"),
        url = require("url");

    grunt.registerMultiTask('tinypng', 'image optimization via tinypng service', function() {

        // Merge task-specific and/or target-specific options with these defaults.
        var options = this.options({
            apiKey: ''
        });

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
            };

        function handleAPIResponseSuccess(res, dest) {
            var imageLocation = res.headers.location;
            grunt.verbose.writeln("making request to get image at " + imageLocation);

            var urlInfo = url.parse(imageLocation);
            urlInfo.accepts = '*/*';
            urlInfo.rejectUnauthorized = false;
            urlInfo.requestCert = true;

            https.get(urlInfo, function(imageRes) {
                grunt.verbose.writeln("minified image request response status code is " + imageRes.statusCode);

                if(imageRes.statusCode >= 200 && imageRes.statusCode < 300) { 
                    imageRes.on("end", function() { 
                        if(--fileCount <= 0) { 
                            grunt.log.writeln("wrote minified image to " + dest);
                            done();
                        }
                    });
                    imageRes.pipe(fs.createWriteStream(dest));
                }
                else {
                    grunt.log.error("got bad status code " + imageRes.statusCode);
                }
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

        function handleAPIResponse(res, dest) {
            grunt.verbose.writeln("API RESPONSE STATUS: " + res.statusCode);
            grunt.verbose.writeln("HEADERS: " + JSON.stringify(res.headers));

            if(res.statusCode === 201 && !!res.headers.location) {
                handleAPIResponseSuccess(res, dest);
            }
            else {
                handleAPIResponseError(res);
            }
        }

        // Iterate over all specified file groups.
        this.files.forEach(function(f) {
            f.src.forEach(function(filepath) {
                // Warn on and remove invalid source files (if nonull was set).
                if(!grunt.file.exists(filepath)) {
                    grunt.log.warn('Source file "' + filepath + '" not found.');
                    return;
                }

                grunt.verbose.writeln("Processing image at " + filepath);

                var req = https.request(reqOpts, function(res) { 
                    handleAPIResponse(res, f.dest); 
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

                fileCount++;
            }); 
        });
    });

};
