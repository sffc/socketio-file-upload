Socket.IO File Upload
=====================

This module provides functionality to upload files from a browser to a Node.JS server that runs Socket.IO.  Throughout the process, if their browser supports WebSockets, the user will not submit a single HTTP request.

The intended audience are single-page web apps, but other types of Node.JS projects may benefit from this library.

The module is released under the X11 open-source license.

**Table of Contents**

- [Installation](#installation)
- [Client-Side Interface](#client-side-interface)
    - [instance.listenOnInput(input)](#instancelistenoninputinput)
    - [instance.listenOnDrop(element)](#instancelistenondropelement)
    - [instance.prompt()](#instanceprompt)
    - [instance.destroy()](#instancedestroy)
    - [instance.useText = false](#instanceusetext--false)
    - [instance.serializeOctets = false](#instanceserializeoctets--false)
- [Client-Side Events](#events)
    - [choose](#choose)
    - [start](#start)
    - [load](#load)
    - [complete](#complete)
- [Server-Side Interface](#server-side-interface)
    - [SocketIOFileUploadServer.listen(app)](#socketiofileuploadserverlistenapp)
    - [SocketIOFileUploadServer.router](#socketiofileuploadserverrouter)
    - [instance.listen(socket)](#instancelistensocket)
    - [instance.dir = "/path/to/upload/directory"](#instancedir--pathtouploaddirectory)
    - [instance.mode = "0666"](#instancemode--0666)
- [Server-Side Events](#events-1)
    - [start](#start-1)
    - [progress](#progress)
    - [complete](#complete-1)
    - [saved](#saved)
    - [error](#error)
- [Example](#example)

## Installation

Navigate to your project directory and run:

    $ npm install socketio-file-upload

## Client-Side Interface

The client-side interface is inside the `SocketIOFileUpload` namespace.  Include it with:

    <script src="/siofu/client.js"></script>

When instantiating an instance of the `SocketIOFileUpload`, pass a reference to your socket.  See the Examples section.

### Public Properties and Methods

#### instance.listenOnInput(input)

When the user selects a file or files in the specified HTML Input Element, the library will begin to upload that file or those files.

JavaScript:

    instance.listenOnInput(document.getElementById("file_input"));

HTML:

    <label>Upload File: <input type="file" id="file_input" /></label>

All browsers tested support this method.

#### instance.listenOnDrop(element)

When the user drags and drops a file or files onto the specified HTML Element, the library will begin to upload that file or those files.

JavaScript:

    instance.listenOnDrop(document.getElementById("file_drop"));

HTML:

    <div id="file_drop">Drop Files Here</div>

In order to work, this method requires a browser that supports the HTML5 drag-and-drop interface.

#### instance.prompt()

When this method is called, the user will be prompted to choose a file to upload.

JavaScript:

    document.getElementById("file_button").addEventListener("click", instance.prompt, false);

HTML:

    <button id="file_button">Upload File</button>

Unfortunately, this method does not work in Firefox for security reasons.  Read the code comments for more information.

#### instance.destroy()

Unbinds all events and DOM elements created by this instance of SIOFU.

**Important Memory Note:** In order to remove the instance of SIOFU from memory, you need to do at least three things:

1. Remove all `siofu.prompt` event listeners *and then*
2. Call this function *and then*
3. Set this reference (and all references) to the instance to `null`

For example, if you created an instance like this:

    // ...
    var instance = new SocketIOFileUpload(socket);
    myBtn.addEventListener("click", instance.prompt, false);
    // ...

then you can remove it from memory like this:

    myBtn.removeEventListener("click", instance.prompt, false);
    instance.destroy();
    instance = null;

#### instance.useText = false

Defaults to `false`, which reads files as an octet array.  This is necessary for binary-type files, like images.

Set to `true` to read and transmit files as plain text instead.  This will save bandwidth if you expect to transmit only text files.  If you choose this option, it is recommended that you perform a filter by returning `false` to a `start` event if the file does not have a desired extension.

#### instance.serializeOctets = false

Defaults to `false`, which transmits binary files as Base 64 data (with a 33% overhead).

Set to `true` to instead transmit the data as a serialized octet array.  This will result in an overhead of over 1000% (not recommended for production applications).

*Note:* This option is not supported by Firefox.

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

## Server-Side Interface

The server-side interface is contained within an NPM module.  Require it with:

    var SocketIOFileUploadServer = require("socketio-file-upload");

### Static Properties and Methods

#### SocketIOFileUploadServer.listen(app)

If you are using an HTTP server in Node, pass it into this method in order for the client-side JavaScript file to be served.

    var app = http.createServer( /* your configurations here */ ).listen(80);
    SocketIOFileUploadServer.listen(app);

#### SocketIOFileUploadServer.router

If you are using Connect-based middleware like Express, pass this value into the middleware.

    var app = express()
                .use(SocketIOFileUploadServer.router)
                .use( /* your other middleware here */ )
                .listen(80);

### Public Properties and Methods

#### instance.listen(socket)

Listen for uploads occuring on this Socket.IO socket.

    io.sockets.on("connection", function(socket){
        var uploader = new SocketIOFileUploadServer();
        uploader.listen(socket);
    });

#### instance.dir = "/path/to/upload/directory"

If specified, the module will attempt to save uploaded files in this directory.  The module will inteligently suffix numbers to the uploaded filenames until name conflicts are resolved.  It will also sanitize the filename to help prevent attacks.

The last-modified time of the file might be retained from the upload.  If this is of high importance to you, I recommend performing some tests, and if it does not meet your needs, submit an issue or a pull request.

#### instance.mode = "0666"

Use these UNIX permissions when saving the uploaded file.  Defaults to `0666`.

### Events

Instances of `SocketIOFileUploadServer` implement [Node's `EventEmitter` interface](http://nodejs.org/api/events.html#events_class_events_eventemitter).  This means that you can do:

* `instance.on("type", callback)`
* `instance.removeListener("type", callback)`
* `instance.emit("type", event)`
* et cetera.

The events are documented below.

#### start

The client has started the upload process.

##### Event Properties

* `event.file` An object containing the file's `name`, `mtime`, `encoding`, and `id`.
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

A file has been successfully saved.

##### Event Properties

* `event.file` The same file object that would have been passed during the `start` event earlier.

#### error

An error was encountered in the saving of the file.

##### Event Properties

* `event.file` The same file object that would have been passed during the `start` event earlier.
* `event.error` The I/O error that was encountered.

## Example

This example assumes that you are running your application via the Connect middleware, including Express.  If you are using a middleware that is not Connect-based or Node-HTTP-based, download the `client.js` file from the project repository and serve it on the path `/siofu/client.js`.  Alternatively, you may contribute an adapter for your middleware to this project and submit a pull request.

### Server Code: app.js

    // Require the libraries:
    var SocketIOFileUploadServer = require('socketio-file-upload'),
        socketio = require('socket.io'),
        express = require('express');

    // Make your Express server:
    var app = express()
        .use(SocketIOFileUploadServer.router)
        .use(express.static(__dirname + "/public"))
        .listen(80);

    // Start up Socket.IO:
    var io = socketio.listen(app);
    io.sockets.on("connection", function(socket){

        // Make an instance of SocketIOFileUploadServer and listen on this socket:
        var uploader = new SocketIOFileUploadServer();
        uploader.dir = "/srv/uploads";
        uploader.listen(socket);

        // Do something when a file is saved:
        uploader.on("saved", function(event){
            console.log(event.file);
        });
    });

### Client Code: public/index.html

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

## Future Inovations

I hope to one day see this project implement the following features.

* Upload Progress.  There are examples of this on the net, so it should be feasible to implement.
* Allow input of a file URL rather than uploading a file from your computer or mobile device.
