/*
 * grunt-tinypng
 * https://github.com/marrone/grunt-tinypng
 *
 * Copyright (c) 2013 Mike M
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

  var path = require("path");

  // Project configuration.
  grunt.initConfig({
      jshint: {
          all: [
              'Gruntfile.js',
              'tasks/*.js',
              '<%= nodeunit.tests %>'
          ],
          options: {
              jshintrc: '.jshintrc'
          }
      },

      // Before generating any new files, remove any previously-created files.
      clean: {
          tests: ['tmp']
      },

      // Configuration to be run (and then tested).
      tinypng: {
          options: {
              apiKey: '',
              checkSigs: true,
              sigFile: '/tmp/file_sigs.json'
          },
          test_single_png: {
              files: {
                  '/tmp/large.min.png': 'test/fixtures/large.png'
              }
          },
          test_single_jpg: {
              files: {
                  '/tmp/wrestling.min.jpg': 'test/fixtures/wrestling.jpg'
              }
          },
          test_dynamic: {
              expand: true, src: 'test/fixtures/{horse-ranch,pettirosso_2,large}.png', dest: '/tmp/'
          },
          test_dynamic2: {
              options: {
                  checkSigs: false
              },
              src: ['{horse-ranch-small,large,}.png', '!*.min.png'],
              cwd: 'test/fixtures/',
              dest: '/tmp/',
              expand: true,
              rename: function(dest, src) { 
                  var parts = src.split('/'),
                      fname = path.basename(parts.pop(), ".png");
                  return path.join(dest, fname + '.min.png');
              }
          },
          test_dynamic3: {
              expand: true, src: 'test/fixtures/{ninja,jeffreed1,horse-ranch-small}.{png,jpg,gif}', dest: '/tmp/',
              options: { summarizeOnError: true }
          },
          test_dynamic4: {
              options: {
                  stopOnImageError: false
              },
              expand: true, src: 'test/fixtures/{large,jeffreed1,horse-ranch-small}.{png,jpg}', dest: '/tmp/',
              ext: '.min.png'
          },
          test_smaller: {
              options: {
                showProgress: false,
                checkSigs: false
              },
              expand: true,
              cwd: "test/fixtures/",
              src: '{horse-ranch-small,large.min}.png', 
              ext: ".min.png",
              dest: '/tmp/'
          },
          test_throttle: {
              options: {
                showProgress: true,
                summarize: true,
                checkSigs: false,
                sigFile: '/tmp/q_file_sigs.json',
              },
              expand: true,
              cwd: "test/fixtures/",
              src: '{1,2,3,4,5,6,7,8,9,10}.png', 
              ext: ".min.png",
              dest: '/tmp/'
          },
          test_pretty_sigs: {
              files: {
                  '/tmp/large.min.png': 'test/fixtures/large.png',
                  '/tmp/wrestling.min.jpg': 'test/fixtures/wrestling.jpg'
              },
              options: {
                  checkSigs: true,
                  sigFile: '/tmp/file_sigs.json',
                  sigFileSpace: 4,
                  showProgress: true,
                  summarize: true
              }
          }
      },

      // Unit tests.
      nodeunit: {
          tests: ['test/*_test.js']
      }

  });

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks');

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  grunt.registerTask('test', ['clean', 'tinypng:test_single_png', 'tinypng:test_single_jpg', 'nodeunit']);

  grunt.registerTask("testerrors", ["clean", "tinypng:test_dynamic3", "jshint"]);
  grunt.registerTask("testerrors2", ["clean", "tinypng:test_dynamic4", "jshint"]);
  grunt.registerTask("testq", ["clean", "tinypng:test_throttle"]);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['jshint', 'test']);

};
