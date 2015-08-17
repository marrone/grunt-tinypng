'use strict';

var grunt = require('grunt'),
    fs = require("fs"),
    crypto = require("crypto");

var sigPath = '/tmp/file_sigs.json';

/*
  ======== A Handy Little Nodeunit Reference ========
  https://github.com/caolan/nodeunit

  Test methods:
    test.expect(numAssertions)
    test.done()
  Test assertions:
    test.ok(value, [message])
    test.equal(actual, expected, [message])
    test.notEqual(actual, expected, [message])
    test.deepEqual(actual, expected, [message])
    test.notDeepEqual(actual, expected, [message])
    test.strictEqual(actual, expected, [message])
    test.notStrictEqual(actual, expected, [message])
    test.throws(block, [error], [message])
    test.doesNotThrow(block, [error], [message])
    test.ifError(value)
*/

function testImageCompress(test, origImgPath, minImgPath, doneCallback) {
    fs.stat(origImgPath, function(err, origStats) { 
        if(err) {
            throw err;
            //test.done();
            //return;
        }

        fs.stat(minImgPath, function(err, minStats) { 
            if(err) {
                throw err;
                //test.done();
                //return;
            }

            test.ok(minStats.size > 0, "should be greater than 0 bytes");
            test.ok(minStats.size < origStats.size / 2, "minified bytes should be less than half the original");

            doneCallback();
        });
    });
}

function testImageSig(test, sigPath, origImgPath, doneCallback) {
    fs.stat(sigPath, function(err, stats) {
        if(err) {
            throw err;
            //test.done();
            //return;
        }

        fs.readFile(sigPath, function(err, data) {
            if(err) {
                throw err;
                //test.done();
                //return;
            }

            var sigs = JSON.parse(data);
            test.equal(typeof data, 'object');
            test.ok(origImgPath in sigs);
            test.equal(sigs[origImgPath].length, 32);

            var md5 = crypto.createHash("md5"),
                stream = fs.ReadStream(origImgPath);
            stream.on("data", function(d) { md5.update(d); });
            stream.on("end", function() {
                test.equal(md5.digest("hex"), sigs[origImgPath]);
                doneCallback();
            });
        });
    });
}

exports.tinypng = {
  setUp: function(done) {
    // setup here if necessary
    done();
  },

  test_single_png: function(test) {
    test.expect(6);

    var origImgPath = 'test/fixtures/large.png',
        minImgPath = '/tmp/large.min.png',
        doneStats = false,
        doneSigs = false;

    function tryDone() {
        if(doneStats && doneSigs) {
            test.done();
        }
    }

    testImageCompress(test, origImgPath, minImgPath, function() { 
        doneStats = true;
        tryDone();
    });
    testImageSig(test, sigPath, origImgPath, function() {
        doneSigs = true;
        tryDone();
    });
  },


  test_single_jpg: function(test) {
    test.expect(6);

    var origImgPath = 'test/fixtures/wrestling.jpg',
        minImgPath = '/tmp/wrestling.min.jpg',
        doneStats = false,
        doneSigs = false;

    function tryDone() {
        if(doneStats && doneSigs) {
            test.done();
        }
    }

    testImageCompress(test, origImgPath, minImgPath, function() { 
        doneStats = true;
        tryDone();
    });
    testImageSig(test, sigPath, origImgPath, function() {
        doneSigs = true;
        tryDone();
    });
  }
};
