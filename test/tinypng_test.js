'use strict';

var grunt = require('grunt'),
    fs = require("fs");

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
  default_options: function(test) {
    test.expect(2);

    fs.stat('test/fixtures/large.png', function(err, origStats) { 
        if(err) {
            test.done();
            return;
        }

        fs.stat('/tmp/large.min.png', function(err, minStats) { 
            if(err) {
                test.done();
                return;
            }

            test.ok(minStats.size > 0, "should be greater than 0 bytes");
            test.ok(minStats.size < origStats.size / 2, "minified bytes should be less than half the original");
            test.done();
        });

    });
  }
};
