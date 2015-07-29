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
	"use strict";

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
	 * Maximum file size, in bytes, when saving files.  An "error" event will
	 * be emitted when this size is exceeded, and the data will not be written
	 * to the disk.  null = allow any file size
	 */
	self.maxFileSize = null;

	var files = [];

	/**
	 * Private function to emit the "siofu_complete" message on the socket.
	 * @param  {Number} id      The file ID as passed on the siofu_upload.
	 * @param  {boolean} success
	 * @return {void}
	 */
	var _emitComplete = function (socket, id, success) {
		var fileInfo = files[id];
		socket.emit("siofu_complete", {
			id: id,
			success: success,
			detail: fileInfo.clientDetail
		});
	};

	/**
	 * Private function to recursively find a file name by incrementing "inc" until
	 * an empty file is found.
	 * @param  {String}   ext   File extension
	 * @param  {String}   base  File base name
	 * @param  {Date}     mtime File modified time
	 * @param  {Number}   inc   Current number to suffix the base name.  Pass -1
	 *                          to not suffix a number to the base name.
	 * @param  {Function} next  Callback function when the save is complete.
	 *                          Will be passed a possible error as well as the
	 *                          final base name.
	 * @return {void}
	 */
	var _findFileNameWorker = function (ext, base, inc, next) {
		var newBase = (inc === -1) ? base : base + "-" + inc;
		var pathName = path.join(self.dir, newBase + ext);
		fs.exists(pathName, function (exists) {
			if (exists) {
				_findFileNameWorker(ext, base, inc + 1, next);
			}
			else {
				fs.open(pathName, "w", self.mode, function (err, fd) {
					if (err) {
						// Oops!  Pass an error to the callback function.
						next(err);
						return;
					}
					// Pass the file handler and the new name to the callback.
					next(null, newBase, pathName, fd);
				});
			}
		});
	};

	/**
	 * Private function to save an uploaded file.
	 * @param  {Object} fileInfo Object containing file name, modified time, and
	 *                           text content.
	 * @return {void}
	 */
	var _findFileName = function (fileInfo, next) {
		// Strip dangerous characters from the file name
		var filesafeName = fileInfo.name
		.replace(/[\/\?<>\\:\*\|":]|[\x00-\x1f\x80-\x9f]|^\.+$/g, "_");

		var ext = path.extname(filesafeName);
		var base = path.basename(filesafeName, ext);

		// Use a recursive function to save the file under the first available filename.
		_findFileNameWorker(ext, base, -1, function (err, newBase, pathName, fd) {
			if (err) {
				next(err);
				return;
			}
			fs.close(fd, function (err) {
				if (err) {
					next(err);
					return;
				}
				next(null, newBase, pathName);
			});
		});
	};

	var _uploadDone = function (socket) {
		return function (data) {
			var fileInfo = files[data.id];
			try {
				if (fileInfo.writeStream) {
					fileInfo.writeStream.end();

					// Update the file modified time.  This doesn't seem to work; I'm not
					// sure if it's my error or a bug in Node.
					fs.utimes(fileInfo.pathName, new Date(), fileInfo.mtime, function (err) {
						// I'm not sure what arguments the futimes callback is passed.
						// Based on node_file.cc, it looks like it is passed zero
						// arguments (version 0.10.6 line 140), but the docs say that
						// "the first argument is always reserved for an exception".
						if (err) {
							fileInfo.success = false;
							_emitComplete(socket, data.id, fileInfo.success);
							console.log("SocketIOFileUploadServer Error (_uploadDone fs.utimes):");
							console.log(err);
						}

						// Emit the "saved" event to the server-side listeners
						self.emit("saved", {
							file: fileInfo
						});
						_emitComplete(socket, data.id, fileInfo.success);
					});
				}
				else {
					_emitComplete(socket, data.id, fileInfo.success);
				}
			}
			catch (err) {
				console.log("SocketIOFileUploadServer Error (_uploadDone):");
				console.log(err);
			}

			// Emit the "complete" event to the server-side listeners
			self.emit("complete", {
				file: fileInfo,
				interrupt: !!data.interrupt
			});
		};
	};

	var _uploadProgress = function (socket) {
		//jshint unused:false
		return function (data) {
			var fileInfo = files[data.id], buffer;
			try {
				if (data.base64) {
					buffer = new Buffer(data.content, "base64");
				}
				else {
					buffer = new Buffer(data.content);
				}

				fileInfo.size = data.size;
				fileInfo.bytesLoaded += buffer.length;
				if (self.maxFileSize !== null
				 && fileInfo.bytesLoaded > self.maxFileSize) {
					fileInfo.success = false;
					socket.emit("siofu_error", {
						id: data.id,
						message: "Max allowed file size exceeded"
					});
					self.emit("error", {
						file: fileInfo,
						error: new Error("Max allowed file size exceeded"),
						memo: "self-thrown from progress event"
					});
				}
				else {
					if (fileInfo.writeStream) {
						fileInfo.writeStream.write(buffer);
					}
				}

				self.emit("progress", {
					file: fileInfo,
					buffer: buffer
				});
			}
			catch (err) {
				console.log("SocketIOFileUploadServer Error (_uploadProgress):");
				console.log(err);
			}
		};
	};

	/**
	 * Private function to handle the start of a file upload.
	 * @param  {Socket} socket The socket on which the listener is bound
	 * @return {Function} A function compatible with a Socket.IO callback
	 */
	var _uploadStart = function (socket) {
		return function (data) {
			// Save the file information
			var fileInfo = {
				name: data.name,
				mtime: new Date(data.mtime),
				encoding: data.encoding,
				clientDetail: {},
				meta: data.meta || {},
				id: data.id,
				size: data.size,
				bytesLoaded: 0,
				success: true
			};
			files[data.id] = fileInfo;

			// Dispatch event to listeners on the server side
			self.emit("start", {
				file: fileInfo
			});

			// If we're not saving the file, we are ready to start receiving data now.
			if (!self.dir) {
				socket.emit("siofu_ready", {
					id: data.id,
					name: null
				});
			}
			else {
				// Find a filename and get the handler.  Then tell the client that
				// we're ready to start receiving data.
				_findFileName(fileInfo, function (err, newBase, pathName) {
					if (err) {
						_emitComplete(socket, data.id, false);
						self.emit("error", {
							file: fileInfo,
							error: err,
							memo: "computing file name"
						});
						return;
					}

					files[data.id].base = newBase;
					files[data.id].pathName = pathName;

					// Create a write stream.
					try {
						var writeStream = fs.createWriteStream(pathName, {
							mode: self.mode
						});
						writeStream.on("open", function () {
							socket.emit("siofu_ready", {
								id: data.id,
								name: newBase
							});
						});
						writeStream.on("error", function (err) {
							_emitComplete(socket, data.id, false);
							self.emit("error", {
								file: fileInfo,
								error: err,
								memo: "from within write stream"
							});
						});
						files[data.id].writeStream = writeStream;
					}
					catch (err) {
						_emitComplete(socket, data.id, false);
						self.emit("error", {
							file: fileInfo,
							error: err,
							memo: "creating write stream"
						});
						return;
					}
				});
			}
		};
	};

	/**
	 * Public method.  Listen to a Socket.IO socket for a file upload event
	 * emitted from the client-side library.
	 *
	 * @param  {Socket} socket The socket on which to listen
	 * @return {void}
	 */
	this.listen = function (socket) {
		socket.on("siofu_start", _uploadStart(socket));
		socket.on("siofu_progress", _uploadProgress(socket));
		socket.on("siofu_done", _uploadDone(socket));
	};
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
var _serve = function (res) {
	"use strict";

	fs.readFile(__dirname + "/client.min.js", function (err, data) {
		if (err) throw err;
		res.writeHead(200, {
			"Content-Type": "text/javascript"
		});
		res.write(data);
		res.end();
	});
};

/**
 * Transmit the static client file on a vanilla HTTP server.
 * @param  {HTTPServer} app Your HTTP server
 * @return {void}
 */
SocketIOFileUploadServer.listen = function (app) {
	"use strict";

	app.on("request", function (req, res) {
		if (req.url === SocketIOFileUploadServer.clientPath) {
			_serve(res);
		}
	});
};

/**
 * Router to serve the static client file on the Connect middleware, including
 * the Express.JS web framework.  Pass this function to your application like
 * this:
 *
 *    app.use(SocketIOFileUploadServer.router)
 *
 * You should not need to ever call this function.
 */
SocketIOFileUploadServer.router = function (req, res, next) {
	"use strict";

	if (req.url === SocketIOFileUploadServer.clientPath) {
		_serve(res);
	}
	else {
		next();
	}
};

// Export the object.
module.exports = SocketIOFileUploadServer;
