var fs = require("graceful-fs"),
    crypto = require("crypto");

function SigFile(filePath, sigs, formatSpace) {
    this.filePath = filePath;
    this.fileSigs = sigs;
    this.fileSpace = formatSpace;
}

SigFile.prototype = {
    save: function(grunt) { 
        grunt.file.write(this.filePath, JSON.stringify(this.fileSigs, null, this.fileSpace));
        return this;
    },
    set: function(srcpath, hash) {
        this.fileSigs[srcpath] = hash;
        return this;
    },
    get: function(srcpath) {
        return this.fileSigs[srcpath];
    }
};

SigFile.getFileHash = function(filepath, callback) {
    var md5 = crypto.createHash("md5"),
        stream = fs.ReadStream(filepath);
    stream.on("data", function(d) { md5.update(d); });
    stream.on("end", function() {
        callback(filepath, md5.digest("hex"));
    });
};
SigFile.compareFileHash = function(filepath, expectedHash, callback) {
    if(!expectedHash) {
        callback(filepath, false);
    }
    else {
        SigFile.getFileHash(filepath, function(fp, hash) {
            callback(filepath, hash === expectedHash);
        });
    }
};


module.exports = SigFile;
