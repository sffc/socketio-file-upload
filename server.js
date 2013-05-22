/*
 *                      Copyright (C) 2013 Shane Carr
 *                               X11 License
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions: 
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software. 
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 * 
 * Except as contained in this notice, the names of the authors or copyright
 * holders shall not be used in advertising or otherwise to promote the sale,
 * use or other dealings in this Software without prior written authorization
 * from the authors or copyright holders.
 */

// Require Libraries
var util = require("util"),
	EventEmitter = require("events").EventEmitter,
	path = require("path"),
	fs = require("fs");


function SocketIOFileUploadServer() {
	EventEmitter.call(this);
	var self = this; // avoids context issues

	/**
	 * Directory in which to save uploaded files.  null = do not save files
	 * @type {String}
	 */
	self.dir = null;

	/**
	 * What mode (UNIX permissions) in which to save uploaded files
	 * @type {Number}
	 */
	self.mode = "0666";

	/**
	 * Private function to emit the "siofu_complete" message on the socket.
	 * @param  {Number} id      The file ID as passed on the siofu_upload.
	 * @param  {boolean} success
	 * @return {void}
	 */
	var _emitComplete = function(socket, id, success){
		socket.emit("siofu_complete", {
			id: id,
			success: success
		});
	}

	/**
	 * Private function to recursively save the file by incrementing "inc" until
	 * an empty file is found.
	 * @param  {String}   ext   File extension
	 * @param  {String}   base  File base name
	 * @param  {Date}     mtime File modified time
	 * @param  {String}   cntnt File content
	 * @param  {Number}   inc   Current number to suffix the base name.  Pass -1
	 *                          to not suffix a number to the base name.
	 * @param  {Function} next  Callback function when the save is complete.
	 *                          Will be passed a possible error as well as the
	 *                          final base name.
	 * @return {void}
	 */
	var _saveUploadWorker = function(ext, base, cntnt, mtime, inc, next){
		var newBase = (inc === -1) ? base : base + "-" + inc;
		var pathName = path.join(self.dir, newBase + ext);
		fs.exists(pathName, function(exists){
			if(exists){
				_saveUploadWorker(ext, base, cntnt, mtime, inc+1, next);
			}else{
				fs.open(pathName, "w", self.mode, function(err, fd){
					if(err){
						// Oops!  Pass an error to the callback function.
						next(err);
						return;
					}
					// Update the file modified time
					fs.futimes(fd, new Date(), mtime, function(err){
						// I'm not sure what arguments the futimes callback is passed.
						// Based on node_file.cc, it looks like it is passed zero
						// arguments (version 0.10.6 line 140), but the docs say that
						// "the first argument is always reserved for an exception". 
						if(err){
							next(err);
							return;
						}
						// We're ready to write the file.
						var buffer = new Buffer(cntnt);
						fs.write(fd, buffer, 0, buffer.length, null, function(err, bytes){
							if(err){
								next(err);
								return;
							}
							// Close the file
							fs.close(fd, function(err){
								if(err){
									next(err);
									return;
								}
								// We're finished!
								next(null, newBase);
							});
						});
					});
				});
			}
		});
	}

	/**
	 * Private function to save an uploaded file.
	 * @param  {Object} fileInfo Object containing file name, modified time, and
	 *                           text content.
	 * @return {void}
	 */
	var _saveUpload = function(socket, fileInfo, id){
		// Strip dangerous characters from the file name
		var filesafeName = fileInfo.name.replace(/[^\w\-\.]/g, "_");
		var ext = path.extname(filesafeName);
		var base = path.basename(filesafeName, ext);
		var mtime = fileInfo.lastModifiedDate;
		var cntnt = fileInfo.content;

		// Use a recursive function to save the file under the first available
		// filename.
		_saveUploadWorker(ext, base, cntnt, mtime, -1, function(err, newBase){
			if(!err){
				// File saved successfully!
				var newName = newBase + ext;
				self.emit("saved", {
					file: fileInfo,
					newName: newName
				});
				_emitComplete(socket, id, true);
			}else{
				// File did NOT save successfully!
				self.emit("error", {
					file: fileInfo,
					error: err
				});
				_emitComplete(socket, id, false);
			}
		});
	}

	/**
	 * Private function to emit the "upload" event.
	 * @param  {Socket} socket The socket on which the listener is bound
	 * @return {Function} A function compatible with a Socket.IO callback
	 */
	var _processUpload = function(socket){
		return function(data){
			var fileInfo = {
				name: data.name,
				lastModifiedDate: new Date(data.lastModifiedDate),
				content: data.content
			};

			// Dispatch event to listeners on the server side
			self.emit("upload", {
				file: fileInfo
			});

			// Save the file if necessary; otherwise, dispatch event to
			// listeners on the client side
			if(!self.dir){
				_emitComplete(socket, data.id, true);
			}else{
				_saveUpload(socket, fileInfo, data.id);
			}
		}
	};

	/**
	 * Public method.  Listen to a Socket.IO socket for a file upload event
	 * emitted from the client-side library.
	 * 
	 * @param  {Socket} socket The socket on which to listen
	 * @return {void}
	 */
	this.listen = function(socket) {
		socket.on("siofu_upload", _processUpload(socket));
	}
}
util.inherits(SocketIOFileUploadServer, EventEmitter);

/**
 * Path at which to serve the client JavaScript file.
 * @type {String}
 */
SocketIOFileUploadServer.clientPath = "/siofu/client.js";

/**
 * Private function to serve the static client file.
 * @param  {ServerResponse} res The server response
 * @return {void}
 */
var _serve = function(res){
	fs.readFile(__dirname + "/client.js", function(err, data){
		if(err) throw err;
		res.writeHead(200, {
			"Content-Type": "text/javascript"
		});
		res.write(data);
		res.end();
	});
}

/**
 * Transmit the static client file on a vanilla HTTP server.
 * @param  {HTTPServer} app Your HTTP server
 * @return {void}
 */
SocketIOFileUploadServer.listen = function(app){
	app.on("request", function(req, res){
		if(req.url === SocketIOFileUploadServer.clientPath){
			_serve(res);
		}
	})
}

/**
 * Router to serve the static client file on the Connect middleware, including
 * the Express.JS web framework.  Pass this function to your application like
 * this:
 *
 *    app.use(SocketIOFileUploadServer.router)
 *
 * You should not need to ever call this function.
 */
SocketIOFileUploadServer.router = function(req, res, next){
	if(req.url === SocketIOFileUploadServer.clientPath){
		_serve(res);
	}else{
		next();
	}
}

// Export the object.
module.exports = SocketIOFileUploadServer;
