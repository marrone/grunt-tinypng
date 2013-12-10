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
          test_single: {
              files: {
                  '/tmp/large.min.png': 'test/fixtures/large.png'
              }
          },
          test_dynamic: {
              expand: true, src: 'test/fixtures/{horse-ranch,pettirosso_2,large}.png', dest: '/tmp/',
              ext: '.min.png'
          },
          test_dynamic2: {
              src: ['{large,}.png', '!*.min.png'],
              cwd: 'test/fixtures/',
              dest: '/tmp/',
              expand: true,
              rename: function(dest, src) { 
                  var parts = src.split('/'),
                      fname = path.basename(parts.pop(), ".png");
                  return path.join(dest, fname + '.min.png');
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
  grunt.registerTask('test', ['clean', 'tinypng:test_single', 'nodeunit']);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['jshint', 'test']);

};
