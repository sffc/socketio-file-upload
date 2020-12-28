Socket.IO File Upload
=====================

This module provides functionality to upload files from a browser to a Node.JS server that runs Socket.IO.  Throughout the process, if their browser supports WebSockets, the user will not submit a single HTTP request.  Supports Socket.IO 0.9 and higher.

The intended audience are single-page web apps, but other types of Node.JS projects may benefit from this library.

Since version 0.4, this module also supports monitoring file upload progress.

The module is released under the X11 open-source license.

[![Node.js CI](https://github.com/sffc/socketio-file-upload/workflows/Node.js%20CI/badge.svg)](https://github.com/sffc/socketio-file-upload/actions)
[![Known Vulnerabilities](https://snyk.io/test/github/sffc/socketio-file-upload/badge.svg)](https://snyk.io/test/github/sffc/socketio-file-upload)
[![npm version](http://img.shields.io/npm/v/socketio-file-upload.svg?style=flat)](https://npmjs.org/package/socketio-file-upload "View this project on npm")


## Quick Start

Navigate to your project directory and run:

    $ npm install --save socketio-file-upload

In your Express app, add the router like this (if you don't use Express, read the docs below):

```javascript
var siofu = require("socketio-file-upload");
var app = express()
    .use(siofu.router)
    .listen(8000);
```

On a server-side socket connection, do this:

```javascript
io.on("connection", function(socket){
    var uploader = new siofu();
    uploader.dir = "/path/to/save/uploads";
    uploader.listen(socket);
});
```

The client-side script is served at `/siofu/client.js`.  Include it like this:

```html
<script src="/siofu/client.js"></script>
```

If you use browserify, just require it like this:

```javascript
var SocketIOFileUpload = require('socketio-file-upload');
```

The module also supports AMD; see the docs below for more information.

Then, in your client side app, with this HTML:

```html
<input type="file" id="siofu_input" />
```

Just do this in JavaScript:

```javascript
var socket = io.connect();
var uploader = new SocketIOFileUpload(socket);
uploader.listenOnInput(document.getElementById("siofu_input"));
```

That's all you need to get started.  For the detailed API, continue reading below.  A longer example is available at the bottom of the readme.

## Table of Contents

- [Client-Side API](#client-side-api)
    - [instance.listenOnInput(input)](#instancelistenoninputinput)
    - [instance.listenOnDrop(element)](#instancelistenondropelement)
    - [instance.listenOnSubmit(submitButton, input)](#instancelistenonsubmitsubmitbutton-input)
    - [instance.listenOnArraySubmit(submitButton, input[])](#instancelistenonarraysubmitsubmitbutton-input)
    - [instance.prompt()](#instanceprompt)
    - [instance.submitFiles(files)](#instancesubmitfilesfiles)
    - [instance.destroy()](#instancedestroy)
    - [instance.resetFileInputs = true](#instanceresetFileInputs--true)
    - [instance.maxFileSize = null](#instancemaxfilesize--null)
    - [instance.chunkSize = 100 KiB](#instancechunksize--100-kib)
    - [instance.useText = false](#instanceusetext--false)
    - [instance.useBuffer = true](#instanceusebuffer--true)
    - [instance.serializeOctets = false](#instanceserializeoctets--false)
    - [instance.topicName = "siofu"](#instancetopicname--siofu)
    - [instance.wrapData = false](#instancewrapdata--false)
    - [instance.exposePrivateFunction = false](#instanceexposeprivatefunction--false)
- [Client-Side Events](#events)
    - [choose](#choose)
    - [start](#start)
    - [progress](#progress)
    - [load](#load)
    - [complete](#complete)
    - [error](#error)
- [Server-Side API](#server-side-api)
    - [SocketIOFileUpload.listen(app)](#socketiofileuploadlistenapp)
    - [SocketIOFileUpload.router](#socketiofileuploadrouter)
    - [instance.listen(socket)](#instancelistensocket)
    - [instance.abort(id, socket)](#instanceabortid-socket)
    - [instance.dir = "/path/to/upload/directory"](#instancedir--pathtouploaddirectory)
    - [instance.mode = "0666"](#instancemode--0666)
    - [instance.maxFileSize = null](#instancemaxfilesize--null-1)
    - [instance.emitChunkFail = false](#instanceemitchunkfail--false)
    - [instance.uploadValidator(event, callback)](#instanceuploadvalidatorevent-callback)
    - instance.topicName = "siofu" (see [client](#instancetopicname--siofu))
    - instance.wrapData = false (see [client](#instancewrapdata--false))
    - instance.exposePrivateFunction = false (see [client](#instanceexposeprivatefunction--false))
- [Server-Side Events](#events-1)
    - [start](#start-1)
    - [progress](#progress-1)
    - [complete](#complete-1)
    - [saved](#saved)
    - [error](#error)
- [Adding Meta Data](#adding-meta-data)
    - [Client to Server](#client-to-server-meta-data)
    - [Server to Client](#server-to-client-meta-data)
- [Example](#example)

## Client-Side API

The client-side interface is inside the `SocketIOFileUpload` namespace.  Include it with:

```html
<script src="/siofu/client.js"></script>
```

If you're awesome and you use AMD/RequireJS, set up your paths config like this:

```javascript
requirejs.config({
    paths: {
        "SocketIOFileUpload": "/siofu/client",
        // ...
    }
});
```

and then include it in your app like this:

```javascript
define("app", ["SocketIOFileUpload"], function(SocketIOFileUpload){
    // ...
});
```

When instantiating an instance of the `SocketIOFileUpload`, pass a reference to your socket.

```javascript
var instance = new SocketIOFileUpload(socket);
```

### Public Properties and Methods

Each public property can be set up in an object passing at second parameter of the Siofu constructor:

```javascript
var instance = new SocketIOFileUpload(socket);
instance.chunkSize = 1024 * 1000
// is the same that
var instance = new SocketIOFileUpload(socket, {
	chunkSize: 1024 * 1000
});
```


#### instance.listenOnInput(input)

When the user selects a file or files in the specified HTML Input Element, the library will begin to upload that file or those files.

JavaScript:

```javascript
instance.listenOnInput(document.getElementById("file_input"));
```

HTML:

```html
<label>Upload File: <input type="file" id="file_input" /></label>
```

All browsers tested support this method.

#### instance.listenOnDrop(element)

When the user drags and drops a file or files onto the specified HTML Element, the library will begin to upload that file or those files.

JavaScript:

```javascript
instance.listenOnDrop(document.getElementById("file_drop"));
```

HTML:

```html
<div id="file_drop">Drop Files Here</div>
```

In order to work, this method requires a browser that supports the HTML5 drag-and-drop interface.

#### instance.listenOnSubmit(submitButton, input)

Like `instance.listenOnInput(input)`, except instead of listening for the "change" event on the input element, listen for the "click" event of a button.

JavaScript:

```javascript
instance.listenOnSubmit(document.getElementById("my_button"), document.getElementById("file_input"));
```

HTML:

```html
<label>Upload File: <input type="file" id="file_input" /></label>
<button id="my_button">Upload File</button>
```

#### instance.listenOnArraySubmit(submitButton, input[])

A shorthand for running `instance.listenOnSubmit(submitButton, input)` repeatedly over multiple file input elements.  Accepts an array of file input elements as the second argument.

#### instance.prompt()

When this method is called, the user will be prompted to choose a file to upload.

JavaScript:

```javascript
document.getElementById("file_button").addEventListener("click", instance.prompt, false);
```

HTML:

```html
<button id="file_button">Upload File</button>
```

Unfortunately, this method does not work in Firefox for security reasons.  Read the code comments for more information.

#### instance.submitFiles(files)

Call this method to manually submit an array of files.  The argument can be either a [FileList](https://developer.mozilla.org/en-US/docs/Web/API/FileList) or an array of [File](https://developer.mozilla.org/en-US/docs/Web/API/File) objects.

#### instance.destroy()

Unbinds all events and DOM elements created by this instance of SIOFU.

**Important Memory Note:** In order to remove the instance of SIOFU from memory, you need to do at least three things:

1. Remove all `siofu.prompt` event listeners *and then*
2. Call this function *and then*
3. Set this reference (and all references) to the instance to `null`

For example, if you created an instance like this:

```javascript
// ...
var instance = new SocketIOFileUpload(socket);
myBtn.addEventListener("click", instance.prompt, false);
// ...
```

then you can remove it from memory like this:

```javascript
myBtn.removeEventListener("click", instance.prompt, false);
instance.destroy();
instance = null;
```

#### instance.resetFileInputs = true

Defaults to `true`, which resets file input elements to their empty state after the user selects a file.  If you do not reset the file input elements, if the user selects a file with the same name as the previous file, then the second file may not be uploaded.

#### instance.maxFileSize = null

Will cancel any attempt by the user to upload a file larger than this number of bytes.  An "error" event with code 1 will be emitted if such an attempt is made.  Defaults to a value of `null`, which does not enforce a file size limit.

To tell the client when they have tried to upload a file that is too large, you can use the following code:

```javascript
siofu.addEventListener("error", function(data){
    if (data.code === 1) {
        alert("Don't upload such a big file");
    }
});
```

For maximum security, if you set a maximum file size on the client side, you should also do so on the server side.

#### instance.chunkSize = 100 KiB

The size of the file "chunks" to be loaded at a time.  This enables you to monitor the upload progress with a progress bar and the "progress" event (see below).

The default value is 100 KiB, which is specified as

`instance.chunkSize = 1024 * 100;`

Setting this parameter to 0 disables chunking of files.

#### instance.useText = false

Defaults to `false`, which reads files as an octet array.  This is necessary for binary-type files, like images.

Set to `true` to read and transmit files as plain text instead.  This will save bandwidth if you expect to transmit only text files.  If you choose this option, it is recommended that you perform a filter by returning `false` to a `start` event if the file does not have a desired extension.

#### instance.useBuffer = true

Starting with Socket.IO 1.0, binary data may now be transmitted through the Web Socket.  Begining with SIOFU version 0.3.2 (December 17, 2014), this option is enabled by default.  To support older versions of Socket.IO (e.g. version 0.9.x), set this option to `false`, which transmits files as base 64-encoded strings.

Advantages of enabling this option:

- Less overhead in the socket, since base 64 increases overhead by approximately 33%.
- No serialization and deserialization into and out of base 64 is required on the client and server side.

Disadvantages of enabling this option:

- Transmitting buffer types through a WebSocket is not supported in older browsers.
- This option is relatively new in both Socket.IO and Socket.IO File Upload and has not been rigorously tested.

As you use this option, [please leave feedback](https://github.com/vote539/socketio-file-upload/issues/16).

#### instance.serializeOctets = false

*This method is experimental, and has been deprecated in Socket.IO File Upload as of version 0.3 in favor of instance.useBuffer.*

Defaults to `false`, which transmits binary files as Base 64 data (with a 33% overhead).

Set to `true` to instead transmit the data as a serialized octet array.  This will result in an overhead of over 1000% (not recommended for production applications).

*Note:* This option is not supported by Firefox.

#### instance.topicName = "siofu"

Customize the name of the topic where Siofu emit message. Need to be the same that the one specified in the server options.

Can be used in team with instance.wrapData and instance.exposePrivateFunction to use a topic already used for something else.

#### instance.wrapData = false

By default Siofu client sends data the server on a different topic depending of the progress of the upload:

```
siofu_start
siofu_progress
siofu_done
```

And events received from the server to the client:

```
siofu_ready
siofu_chunk
siofu_complete
siofu_error
```

If wrapData is set to true, Siofu will use only one topic specified by instance.topicName and wrap the data into a parent message.

The following examples are example settings for the client. :warning: IF YOU USE `wrapData` ON THE CLIENT, YOU MUST ALSO USE IT ON THE SERVER. :warning:

ex:

```javascript
// wrapData false:
{
	id: id,
	success: success,
	detail: fileInfo.clientDetail
}
// wrapData true
{
	action: 'complete',
	message: {
		id: id,
		success: success,
		detail: fileInfo.clientDetail
	}
}
```

You can personalise the 'action' and 'message' key by passing a object to wrapData instance. The settings on the server should be the inverse of the settings on the client. For example, if the client has wrapData.wrapKey.message = "data", then the server should have wrapData.unwrapKey.message = "data".

```javascript
instance.wrapData = {
	wrapKey: {
		action: 'actionType',
		message: 'data'
	},
	unwrapKey: {
		action: 'actionType',
		message: 'message'
	}
}
// Send a message like this:
{
	actionType: 'complete',
	data: {
		id: id,
		success: success,
		detail: fileInfo.clientDetail
	}
}
// Expect message like this from the server:
{
	actionType: 'complete',
	message: {
		id: id,
		success: success,
		detail: fileInfo.clientDetail
	}
}
```

It's also possible to add additional data (for strongly typed topic or secure pipeline or acknowledgement):
```javascript
instance.wrapData = {
	adtionalData: {
		userId: '123456',
	},
}
// Send a message like this:
{
	userId: '123456',
	action: 'complete',
	message: {
		id: id,
		success: success,
		detail: fileInfo.clientDetail
	}
}
```

#### instance.exposePrivateFunction = false

If true this will expose some functions used in intern to personalize action on the topic. This is used alongside with wrapData to add custom check or logic before process the file upload.
If true you will have access to: 
```
instance.chunckCallback
instance.readyCallback
instance.completCallback
instance.errorCallback
```

### Events

Instances of the `SocketIOFileUpload` object implement the [W3C `EventTarget` interface](http://www.w3.org/wiki/DOM/domcore/EventTarget).  This means that you can do:

* `instance.addEventListener("type", callback)`
* `instance.removeEventListener("type", callback)`
* `instance.dispatchEvent(event)`

The events are documented below.

#### choose

The user has chosen files to upload, through any of the channels you have implemented.  If you want to cancel the upload, make your callback return `false`.

##### Event Properties

* `event.files` an instance of a W3C FileList object

#### start

This event is fired immediately following the `choose` event, but once per file.  If you want to cancel the upload for this individual file, make your callback return `false`.

##### Event Properties

* `event.file` an instance of a W3C File object

#### progress

Part of the file has been loaded from the file system and ready to be transmitted via Socket.IO.  This event can be used to make an upload progress bar.

You can compute the percent progress via `event.bytesLoaded / event.file.size`

##### Event Properties

* `event.file` an instance of a W3C File object
* `event.bytesLoaded` the number of bytes that have been loaded into memory
* `event.name` the filename to which the server saved the file

#### load

A file has been loaded into an instance of the HTML5 FileReader object and has been transmitted through Socket.IO.  We are awaiting a response from the server about whether the upload was successful; when we receive this response, a `complete` event will be dispatched.

##### Event Properties

* `event.file` an instance of a W3C File object
* `event.reader` an instance of a W3C FileReader object
* `event.name` the filename to which the server saved the file

#### complete

The server has received our file.

##### Event Properties

* `event.file` an instance of a W3C File object
* `event.success` true if the server-side implementation ran without error; false otherwise
* `event.detail` The value of `file.clientDetail` on the server side.  Properties may be added to this object literal during any event on the server side.

#### error

The server encountered an error.

##### Event Properties

* `event.file` an instance of a W3C File object
* `event.message` the error message
* `event.code` the error code, if available

## Server-Side API

The server-side interface is contained within an NPM module.  Require it with:

```javascript
var SocketIOFileUpload = require("socketio-file-upload");
```

### Static Properties and Methods

#### SocketIOFileUpload.listen(app)

If you are using an HTTP server in Node, pass it into this method in order for the client-side JavaScript file to be served.

```javascript
var app = http.createServer( /* your configurations here */ ).listen(80);
SocketIOFileUpload.listen(app);
```

#### SocketIOFileUpload.router

If you are using Connect-based middleware like Express, pass this value into the middleware.

```javascript
var app = express()
            .use(SocketIOFileUpload.router)
            .use( /* your other middleware here */ )
            .listen(80);
```

### Public Properties and Methods

#### instance.listen(socket)

Listen for uploads occuring on this Socket.IO socket.

```javascript
io.sockets.on("connection", function(socket){
    var uploader = new SocketIOFileUpload();
    uploader.listen(socket);
});
```

#### instance.abort(id, socket)

Aborts an upload that is in progress.  Example use case:

```javascript
uploader.on("start", function(event){
    if (/\.exe$/.test(event.file.name)) {
        uploader.abort(event.file.id, socket);
    }
});
```

#### instance.dir = "/path/to/upload/directory"

If specified, the module will attempt to save uploaded files in this directory.  The module will intelligently suffix numbers to the uploaded filenames until name conflicts are resolved.  It will also sanitize the filename to help prevent attacks.

The last-modified time of the file might be retained from the upload.  If this is of high importance to you, I recommend performing some tests, and if it does not meet your needs, submit an issue or a pull request.

#### instance.mode = "0666"

Use these UNIX permissions when saving the uploaded file.  Defaults to `0666`.

#### instance.maxFileSize = null

The maximum file size, in bytes, to write to the disk.  If file data is received from the client that exceeds this bound, the data will not be written to the disk and an "error" event will be thrown.  Defaults to `null`, in which no maximum file size is enforced.

Note that the other events like "progress", "complete", and "saved" will still be emitted even if the file's maximum allowed size had been exceeded.  However, in those events, `event.file.success` will be false.

#### instance.emitChunkFail = false

Whether or not to emit an error event if a progress chunk fails to finish writing.  In most cases, the failure is a harmless notification that the file is larger than the internal buffer size, but it could also mean that the file upload triggered an ENOSPC error.  It may be useful to enable this error event if you are concerned about uploads running out of space.

#### instance.uploadValidator(event, callback)

Can be overridden to enable async validation and preparing.

```javascript
uploader.uploadValidator = function(event, callback){
    // asynchronous operations allowed here; when done,
    if (/* success */) {
        callback(true);
    } else {
        callback(false);
    }
};
```

### Events

Instances of `SocketIOFileUpload` implement [Node's `EventEmitter` interface](http://nodejs.org/api/events.html#events_class_events_eventemitter).  This means that you can do:

* `instance.on("type", callback)`
* `instance.removeListener("type", callback)`
* `instance.emit("type", event)`
* et cetera.

The events are documented below.

#### start

The client has started the upload process, and the server is now processing the request.

##### Event Properties

* `event.file` An object containing the file's `name`, `mtime`, `encoding`, `meta`, `success`, `bytesLoaded`, and `id`.
    *Note:* `encoding` is either "text" if the file is being transmitted as plain text or "octet" if it is being transmitted using an ArrayBuffer.  *Note:* In the "progress", "complete", "saved", and "error" events, if you are letting the module save the file for you, the file object will contain two additional properties: `base`, the new base name given to the file, and `pathName`, the full path at which the uploaded file was saved.

#### progress

Data has been received from the client.

##### Event Properties

* `event.file` The same file object that would have been passed during the `start` event earlier.
* `event.buffer` A buffer containing the data received from the client

#### complete

The transmission of a file is complete.

##### Event Properties

* `event.file` The same file object that would have been passed during the `start` event earlier.
* `event.interrupt` true if the client said that the data was interrupted (not completely sent); false otherwise

#### saved

A file has been saved.  It is recommended that you check `event.file.success` to tell whether or not the file was saved without errors.

In this event, you can safely move the saved file to a new location.

##### Event Properties

* `event.file` The same file object that would have been passed during the `start` event earlier.

#### error

An error was encountered in the saving of the file.

##### Event Properties

* `event.file` The same file object that would have been passed during the `start` event earlier.
* `event.error` The I/O error that was encountered.

## Adding Meta Data

It is sometimes useful to add metadata to a file prior to uploading the file.  You may add metadata to a file on the client side by setting the `file.meta` property on the File object during the "choose" or "start" events.  You may also add metadata to a file on the server side by setting the `file.clientDetail` property on the fileInfo object during any of the server-side events.

### Client to Server Meta Data

To add meta data to an individual file, you can listen on the "start" event as shown below.

```javascript
// client side
siofu.addEventListener("start", function(event){
    event.file.meta.hello = "world";
});
```

The data is then available on the server side as follows.

```javascript
// server side
uploader.on("saved", function(event){
    console.log(event.file.meta.hello);
});
```

You can also refer back to your meta data at any time on the client side by referencing the same `event.file.meta` object literal.

### Server to Client Meta Data

You can add meta data on the server.  The meta data will be available to the client on the "complete" event on the client as shown below.

```javascript
// server side
siofuServer.on("saved", function(event){
    event.file.clientDetail.hello = "world";
});
```

The information saved in `event.file.clientDetail` will be available in `event.detail` on the client side.

```javascript
// client side
siofu.addEventListener("complete", function(event){
    console.log(event.detail.hello);
});
```

## Example

This example assumes that you are running your application via the Connect middleware, including Express.  If you are using a middleware that is not Connect-based or Node-HTTP-based, download the `client.js` file from the project repository and serve it on the path `/siofu/client.js`.  Alternatively, you may contribute an adapter for your middleware to this project and submit a pull request.

### Server Code: app.js

```javascript
// Require the libraries:
var SocketIOFileUpload = require('socketio-file-upload'),
    socketio = require('socket.io'),
    express = require('express');

// Make your Express server:
var app = express()
    .use(SocketIOFileUpload.router)
    .use(express.static(__dirname + "/public"))
    .listen(80);

// Start up Socket.IO:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){

    // Make an instance of SocketIOFileUpload and listen on this socket:
    var uploader = new SocketIOFileUpload();
    uploader.dir = "/srv/uploads";
    uploader.listen(socket);

    // Do something when a file is saved:
    uploader.on("saved", function(event){
        console.log(event.file);
    });

    // Error handler:
    uploader.on("error", function(event){
        console.log("Error from uploader", event);
    });
});
```

### Client Code: public/index.html

```html
<!DOCTYPE html>
<html>
<head>
<title>Upload Files</title>
<script src="/siofu/client.js"></script>
<script src="/socket.io/socket.io.js"></script>

<script type="text/javascript">
document.addEventListener("DOMContentLoaded", function(){

    // Initialize instances:
    var socket = io.connect();
    var siofu = new SocketIOFileUpload(socket);

    // Configure the three ways that SocketIOFileUpload can read files:
    document.getElementById("upload_btn").addEventListener("click", siofu.prompt, false);
    siofu.listenOnInput(document.getElementById("upload_input"));
    siofu.listenOnDrop(document.getElementById("file_drop"));

    // Do something on upload progress:
    siofu.addEventListener("progress", function(event){
        var percent = event.bytesLoaded / event.file.size * 100;
        console.log("File is", percent.toFixed(2), "percent loaded");
    });

    // Do something when a file is uploaded:
    siofu.addEventListener("complete", function(event){
        console.log(event.success);
        console.log(event.file);
    });

}, false);
</script>

</head>
<body>

<p><button id="upload_btn">Prompt for File</button></p>
<p><label>Choose File: <input type="file" id="upload_input"/></label></p>
<div id="file_drop" dropzone="copy" title="drop files for upload">Drop File</div>

</body>
</html>
```

## Future Work

First, I'm aware that this module currently lacks unit tests (mocha, etc).  This is a problem that should be solved.  I'm willing to accept PRs that add unit tests, or else one of these days when I have extra time I'll see if I can add them myself.

In addition, the following features would be useful for the module to support.

1. Allow input of a file URL rather than uploading a file from your computer or mobile device.

As always PRs are welcome.
