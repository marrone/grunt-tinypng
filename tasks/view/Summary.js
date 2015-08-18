var pluralize = require("../util/pluralize"),
    humanize = require("humanize");


function SummaryView() {
}

SummaryView.prototype = {

    render: function(grunt, data) {
        var completedImages = data.completedImages,
            skipCount = data.skippedCount,
            compressCount = 0,
            failedCount = 0,
            inputBytes = 0,
            outputBytes = 0;

        completedImages.forEach(function(img) {
            if(!img.isFailed) {
                compressCount++;
                inputBytes += img.fileSize;
                if(img.downloadComplete) {
                    outputBytes += img.compressionStats.output.size;
                }
                else {
                    img.outputBytes += img.fileSize;
                }
            }
            else {
                failedCount++;
            }
        });

        var summary = "Skipped: " + skipCount + pluralize(" image", skipCount) + ", " +
                      "Compressed: " + compressCount + pluralize(" image", compressCount) + ", " +
                      (failedCount ? "Failed: " + failedCount + pluralize(" image", failedCount) + ", " : "") +
                      "Savings: " + humanize.filesize(inputBytes - outputBytes) +
                      " (ratio: " + (inputBytes ? Math.round(outputBytes / inputBytes * 10000) / 10000 : 0) + ')';
        grunt.log.writeln(summary);

    }

};


module.exports = SummaryView;
