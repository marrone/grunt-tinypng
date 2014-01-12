# grunt-tinypng

> image optimization via tinypng service

## Getting Started
This plugin requires Grunt `~0.4.2`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-tinypng --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-tinypng');
```

## The "tinypng" task

### Overview
In your project's Gruntfile, add a section named `tinypng` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  tinypng: {
    options: {
      // Task-specific options go here.
    },
    your_target: {
      // Target-specific file lists and/or options go here.
    },
  },
});
```

### Options

#### options.apiKey
Type: `String`
Default value: `''`

Your required api key. Get one at https://tinypng.com/developers

#### options.checkSigs
Type: `Boolean`
Default value: `false`

Whether or not to compare existing source file md5 signatures against those found in the `options.sigFile` json data.
When the signatures match, the file is skipped from being minified again, allowing you to better stay within your API request limits.
You can pass `--force` as a command line option to force the image to be minified whether or not the signatures match.
When an image is minified, and `options.checkSigs` is true, the md5 signature is determined from the unminified source image and written to the file at `options.sigFile` (a suggested location would be somewhere under your source control).

Signatures are based off the unminified source image, so that when the source changes it will be re-minified and re-written to the destination file.

#### options.sigFile
Type: `String`
Default value: `''`

The file location to write the source image md5 signatures to when using the `options.checkSigs` option

#### options.summarize
Type: `Boolean`
Default value: `false`

If True, will print a stats summary of number of images skipped, number compressed and the bytes saved, e.g.)
`Skipped: 1 image, Compressed: 1 image, Savings: 153.86 KB (ratio: 0.1999)`

#### options.showProgress
Type: `Boolean`
Default value: `false`

If True, will print upload/download progress bars while images are being processed through the tinypng API. 
Progress bars use the [multimeter](https://github.com/substack/node-multimeter) module

#### options.stopOnImageError
Type: `Boolean`
Default value: `true`

If True, will failures to process an image will result in a grunt error and abort further task execution (unless --force is specified).
If False, failures to process images will simply be logged as warnings.

####
### Usage Examples

```js
grunt.initConfig({
  tinypng: {
    options: {
        apiKey: "YOUR API KEY HERE",
        checkSigs: true,
        sigFile: 'dest/file_sigs.json',
        summarize: true,
        showProgress: true,
        stopOnImageError: true
    },
    compress: {
        files: {
          'dest/foo.min.png': 'src/foo.png'
        }
    },
    compress2: {
        expand: true, 
        src: 'src/{foo,bar,baz}.png', 
        dest: 'dest/',
        ext: '.min.png'
    },
    compress3: {
        src: ['{foo,bar,baz}.png', '!*.min.png'],
        cwd: 'src/',
        dest: 'dest/',
        expand: true,
        rename: function(dest, src) { 
            var parts = src.split('/'),
            fname = path.basename(parts.pop(), ".png");
            return path.join(dest, fname + '.min.png');
        }
    }
  }
});
```
### Debugging
Pass the `--verbose` command line option to see the API requests that are being made and those images that are skipped due to matching file signatures (`options.checkSigs`)

## Release History
_(Nothing yet)_
