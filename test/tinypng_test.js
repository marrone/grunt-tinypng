'use strict';

var grunt = require('grunt'),
    fs = require("fs"),
    crypto = require("crypto");

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

exports.tinypng = {
  setUp: function(done) {
    // setup here if necessary
    done();
  },
  test_single: function(test) {
    test.expect(6);

    var sigPath = '/tmp/file_sigs.json',
        origImgPath = 'test/fixtures/large.png',
        minImgPath = '/tmp/large.min.png',
        doneStats = false,
        doneSigs = false;

    fs.stat(origImgPath, function(err, origStats) { 
        if(err) {
            throw err;
            test.done();
            return;
        }

        fs.stat(minImgPath, function(err, minStats) { 
            if(err) {
                throw err;
                test.done();
                return;
            }

            test.ok(minStats.size > 0, "should be greater than 0 bytes");
            test.ok(minStats.size < origStats.size / 2, "minified bytes should be less than half the original");
            doneStats = true;
            if(doneStats && doneSigs) {
                test.done();
            }
        });
    });

    fs.stat(sigPath, function(err, stats) {
        if(err) {
            throw err;
            test.done();
            return;
        }

        fs.readFile(sigPath, function(err, data) {
            if(err) {
                throw err;
                test.done();
                return;
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
                doneSigs = true;
                if(doneStats && doneSigs) {
                    test.done();
                }
            });
        });
    });
  }
};
