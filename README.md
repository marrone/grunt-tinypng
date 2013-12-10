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

Whether or not to compare existing dest file md5 signatures against those found in the `options.sigFile` json data.
When the signatures match, the file is skipped from being minified again, allowing you to better stay within your API request limits.
You can pass --force as a command line option to force the image to be minified whether or not the signatures match.
When an image is minified, and `options.checkSigs` is true, the md5 signature is determined and written to the file at `options.sigFile`.
Signatures are based off the unminified source image, so that when the source changes it will be re-minified and re-written to the destination file.

#### options.sigFile
Type: `String`
Default value: `''`

The file location to write the minified image md5 signatures to when using the `options.checkSigs` option

### Usage Examples

```js
grunt.initConfig({
  tinypng: {
    options: {
        apiKey: "YOUR API KEY HERE",
        checkSigs: true,
        sigFile: 'dest/file_sigs.json'
    },
    files: {
      'dest/foo.min.png': 'src/foo.png'
    },
  },
});
```

## Release History
_(Nothing yet)_
