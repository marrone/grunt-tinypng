var pluralize = require("../util/pluralize.js");

function ProgressBar(bar) {
    this.bar = bar;
    this.totalImages = 0;
    this.completeImages = 0;
    this.pendingImages = 0;
    this.totalBytes = 0;
    this.progressBytes = 0;
}
ProgressBar.prototype = {
    addImage: function(fileSize) {
        this.totalImages++;
        this.addBytes(fileSize);
        return this;
    },
    addBytes: function(bytes) {
        this.totalBytes += bytes || 0;
        return this;
    },
    addProgress: function(fileSize) {
        this.progressBytes += fileSize;
        return this;
    },
    addComplete: function() {
        this.completeImages++;
        return this;
    },
    addPending: function() {
        this.pendingImages++;
        return this;
    },
    removePending: function() {
        this.pendingImages--;
        return this;
    },
    formatPerc: function(prog, total) {
        return this.totalBytes ? Math.round(this.progressBytes / this.totalBytes * 100) : 0;
    },
    toString: function() {
        var perc = this.formatPerc(),
            percStr = perc;
        if(perc < 10) { percStr = "  " + percStr; }
        else if(perc < 100) { percStr = " " + percStr; }

        var countPendingStr = " pending";
        var blankPendingStr = "                    "; // hacky way to clear the multimeter trailing text
        var out = percStr + "% (" +
                  this.completeImages + "/" + this.totalImages +
                  pluralize(" image", this.totalImages) +
                  (this.pendingImages ? ", " + this.pendingImages + countPendingStr + ")" : ") " + blankPendingStr);
        return out;
    },
    render: function() {
        var perc = this.formatPerc();
        var msg = this.toString();
        this.bar.percent(perc, msg);
        return this;
    }
};

module.exports = ProgressBar;
