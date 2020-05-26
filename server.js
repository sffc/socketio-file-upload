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

/* eslint-env node */

// Require Libraries
var util = require("util"),
	EventEmitter = require("events").EventEmitter,
	path = require("path"),
	fs = require("fs");


function SocketIOFileUploadServer(options) {
	"use strict";

	EventEmitter.call(this);
	var self = this; // avoids context issues

	var _getOption = function (key, defaultValue) {
		if(!options) {
			return defaultValue;
		}
		return options[key] || defaultValue;
	};

	/**
	 * Directory in which to save uploaded files.  null = do not save files
	 * @type {String}
	 */
	self.dir = _getOption("dir", null);

	/**
	 * What mode (UNIX permissions) in which to save uploaded files
	 * @type {Number}
	 */
	self.mode = _getOption("mode", "0666");

	/**
	 * Maximum file size, in bytes, when saving files.  An "error" event will
	 * be emitted when this size is exceeded, and the data will not be written
	 * to the disk.  null = allow any file size
	 */
	self.maxFileSize = _getOption("maxFileSize", null);

	/**
	 * Whether or not to emit an error event if a progress chunk fails to
	 * finish writing.  The failure could be a harmless notification that the
	 * file is larger than the internal buffer size, or it could mean that the
	 * file upload triggered an ENOSPC error.
	 */
	self.emitChunkFail = _getOption("emitChunkFail", false);

	/**
	 * Specify the topic to listen on.
	 * Need to be the same that the one specified in the client.
	 */
	self.topicName = _getOption("topicName", "siofu");

	/**
	 * WrapData allow you to wrap the Siofu messages into a predefined format.
	 * You can then easily use Siofu packages even in strongly typed topic.
	 * wrapData can be a boolean or an object. It is false by default.
	 * If wrapData is true it will allow you to send all the messages to only one topic by wrapping the siofu actions and messages.
	 *
	 * ex:
	 {
		 action: 'complete',
		 message: {
			id: id,
			success: success,
			detail: fileInfo.clientDetail
		 }
	 }
	 *
	 * If wrapData is an object constituted of two mandatory key and one optional:
	 * wrapKey and unwrapKey (mandatory): Corresponding to the key used to wrap the siofu data and message
	 * additionalData (optional): Corresponding to the data to send along with file data
	 *
	 * ex:
	 * if wrapData = {
		  wrapKey: {
		    action: 'actionType',
		    message: 'data'
		  },
		  unwrapKey: {
		    action: 'actionType',
		    message: 'message'
		  },
		  additionalData: {
		    acknowledgement: true
		  }
		}
	 * When Siofu will send for example a complete message this will send:
	 *
	 {
		 acknowledgement: true,
		 actionType: 'complete',
		 data: {
			id: id,
			success: success,
			detail: fileInfo.clientDetail
		 }
	 }
	 * and it's waiting from client data formatted like this:
	 *
	 {
		 actionType: '...',
		 message: {...}
	 }
	 * /!\ If wrapData is wrong configured is interpreted as false /!\
	 */
	self.wrapData = _getOption("wrapData", false);

	var _isWrapDataWellConfigured = function () {
		if (typeof self.wrapData === "boolean") {
			return true;
		}
		if (typeof self.wrapData !== "object" || Array.isArray(self.wrapData)) {
			return false;
		}

		if(!self.wrapData.wrapKey || typeof self.wrapData.wrapKey.action !== "string" || typeof self.wrapData.wrapKey.message !== "string" ||
			!self.wrapData.unwrapKey || typeof self.wrapData.unwrapKey.action !== "string" || typeof self.wrapData.unwrapKey.message !== "string") {
			return false;
		}

		return true;
	};

	/**
	 * Allow user to access to some private function to customize message reception.
	 * This is used if you specified wrapData on the client side and have to manually bind message to callback.
	 */
	self.exposePrivateFunction = _getOption("exposePrivateFunction", false);

	/**
	 * Default validator.
	 * @param  {Object} event   Contains { file: fileInfo }
	 * @param  {function} callback   Call it with true to start upload, false to abort
	 */
	self.uploadValidator = function(event, callback){
		callback(true);
	};

	var _getTopicName = function (topicExtension) {
		if (self.wrapData) {
			return self.topicName;
		}

		return self.topicName + topicExtension;
	};

	var _wrapData = function (data, action) {
		if(!_isWrapDataWellConfigured() || !self.wrapData) {
			return data;
		}
		var dataWrapped = {};
		if(self.wrapData.additionalData) {
			Object.assign(dataWrapped, self.wrapData.additionalData);
		}

		var actionKey = self.wrapData.wrapKey && typeof self.wrapData.wrapKey.action === "string" ? self.wrapData.wrapKey.action : "action";
		var messageKey = self.wrapData.wrapKey && typeof self.wrapData.wrapKey.message === "string" ? self.wrapData.wrapKey.message : "message";

		dataWrapped[actionKey] = action;
		dataWrapped[messageKey] = data;
		return dataWrapped;
	};

	var files = [];

	/**
	 * Private function to emit the "_complete" message on the socket.
	 * @param  {Number} id      The file ID as passed on the siofu_upload.
	 * @param  {boolean} success
	 * @return {void}
	 */
	var _emitComplete = function (socket, id, success) {
		var fileInfo = files[id];

		// Check if the upload was aborted
		if (!fileInfo) {
			return;
		}

		socket.emit(_getTopicName("_complete"), _wrapData({
			id: id,
			success: success,
			detail: fileInfo.clientDetail
		}, "complete"));
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
			.replace(/[\/\?<>\\:\*\|":]|[\x00-\x1f\x80-\x9f]|^\.+$/g, "_"); // eslint-disable-line no-control-regex, no-useless-escape

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

			// Check if the upload was aborted
			if (!fileInfo) {
				return;
			}

			try {
				if (fileInfo.writeStream) {
					// Update the file modified time.  This doesn't seem to work; I'm not
					// sure if it's my error or a bug in Node.
					fs.utimes(fileInfo.pathName, new Date(), fileInfo.mtime, function (err) {
						// Check if the upload was aborted
						if (!files[data.id]) {
							return;
						}

						// I'm not sure what arguments the futimes callback is passed.
						// Based on node_file.cc, it looks like it is passed zero
						// arguments (version 0.10.6 line 140), but the docs say that
						// "the first argument is always reserved for an exception".
						if (err) {
							fileInfo.success = false;
							_emitComplete(socket, data.id, fileInfo.success);
							// TODO: We should probably propagate the error out to the user here.
							console.log("SocketIOFileUploadServer Error (_uploadDone fs.utimes):"); // eslint-disable-line no-console
							console.log(err); // eslint-disable-line no-console
							_cleanupFile(data.id);
							return;
						}

						// The order here matters:
						// _cleanupFile1 needs to be before server-side "saved" event such that the "saved" event can move the file (see #62)
						// The server-side "saved" event needs to be before _emitComplete so that clientDetail can be edited (see #82)
						// _emitComplete needs to happen before _cleanupFile2 so that the file info object is still valid
						_cleanupFile1(data.id);
						self.emit("saved", {
							file: fileInfo
						});
						_emitComplete(socket, data.id, fileInfo.success);
						_cleanupFile2(data.id);
					});
				}
				else {
					_emitComplete(socket, data.id, fileInfo.success);
					_cleanupFile(data.id);
				}
			}
			catch (err) {
				// TODO: We should probably propagate the error out to the user here.
				console.log("SocketIOFileUploadServer Error (_uploadDone):"); // eslint-disable-line no-console
				console.log(err); // eslint-disable-line no-console
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

			// Check if the upload was aborted
			if (!fileInfo) {
				return;
			}

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
					socket.emit(_getTopicName("_error"), _wrapData({
						id: data.id,
						message: "Max allowed file size exceeded"
					}, "error"));
					self.emit("error", {
						file: fileInfo,
						error: new Error("Max allowed file size exceeded"),
						memo: "self-thrown from progress event"
					});
					_cleanupFile(data.id);
				}
				else {
					if (fileInfo.writeStream) {
						if (!fileInfo.writeStream.write(buffer) && self.emitChunkFail) {
							self.emit("error", {
								file: fileInfo,
								error: new Error("Write of chunk failed (ENOSPC?)"),
								memo: "self-thrown from progress event"
							});
						}
					}
				}
				// Emit that the chunk has been received, so client starts sending the next chunk
				socket.emit(_getTopicName("_chunk"), _wrapData({ id: data.id }, "chunk"));
				self.emit("progress", {
					file: fileInfo,
					buffer: buffer
				});
			}
			catch (err) {
				// TODO: We should probably propagate the error out to the user here.
				console.log("SocketIOFileUploadServer Error (_uploadProgress):"); // eslint-disable-line no-console
				console.log(err); // eslint-disable-line no-console
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

			// Abort right now if the "start" event aborted the file upload.
			if (!files[data.id]) {
				return;
			}

			self.uploadValidator({ file: fileInfo }, function( isValid ){
				if ( !isValid ) {
					self.abort( data.id, socket );
				} else {
					// If we're not saving the file, we are ready to start receiving data now.
					if (!self.dir) {
						socket.emit(_getTopicName("_ready"), _wrapData({
							id: data.id,
							name: null
						}, "ready"));
					} else {
						_serverReady(socket, data, fileInfo);
					}
				}
			});
		};
	};

	// The indentation got messed up here, but changing it would make git history less useful.
	/* eslint-disable indent */
		var _serverReady = function(socket, data, fileInfo){
				// Find a filename and get the handler.  Then tell the client that
				// we're ready to start receiving data.
				_findFileName(fileInfo, function (err, newBase, pathName) {
					// Check if the upload was aborted
					if (!files[data.id]) {
						return;
					}

					if (err) {
						_emitComplete(socket, data.id, false);
						self.emit("error", {
							file: fileInfo,
							error: err,
							memo: "computing file name"
						});
						_cleanupFile(data.id);
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
							// Check if the upload was aborted
							if (!files[data.id]) {
								return;
							}

							socket.emit(_getTopicName("_ready"), _wrapData({
								id: data.id,
								name: newBase
							}, "ready"));
						});
						writeStream.on("error", function (err) {
							// Check if the upload was aborted
							if (!files[data.id]) {
								return;
							}

							_emitComplete(socket, data.id, false);
							self.emit("error", {
								file: fileInfo,
								error: err,
								memo: "from within write stream"
							});
							_cleanupFile(data.id);
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
						_cleanupFile(data.id);
						return;
					}
				});
	};
	/* eslint-enable indent */

	var _cleanupFile = function (id) {
		var fileInfo = files[id];
		if (fileInfo.writeStream) {
			fileInfo.writeStream.end();
		}
		delete files[id];
	};

	// _cleanupFile1() followed by _cleanupFile2() is equivalent to _cleanupFile()
	var _cleanupFile1 = function (id) {
		var fileInfo = files[id];
		if (fileInfo.writeStream) {
			fileInfo.writeStream.end();
		}
	};
	var _cleanupFile2 = function (id) {
		delete files[id];
	};

	/**
	 * Private function to handle a client disconnect event.
	 * @param  {Socket} socket The socket on which the listener is bound
	 * @return {Function} A function compatible with a Socket.IO callback
	 */
	var _onDisconnect = function (socket) { // eslint-disable-line no-unused-vars
		return function () {
			for (var id in files) {
				if (files.hasOwnProperty(id)) {
					var fileInfo = files[id];
					self.emit("error", {
						file: fileInfo,
						error: new Error("Client disconnected in the middle of an upload"),
						memo: "disconnect during upload"
					});
					_cleanupFile(id);
					return;
				}
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
		if(_isWrapDataWellConfigured() && self.wrapData) {
			var actionToMethods = {
				start: _uploadStart(socket),
				progress: _uploadProgress(socket),
				done: _uploadDone(socket)
			};
			socket.on(self.topicName, function(message) {
				if (typeof message !== "object") {
					console.log("SocketIOFileUploadServer Error: You choose to wrap your data so the message from the client need to be an object"); // eslint-disable-line no-console
					return;
				}


				var actionKey = self.wrapData.unwrapKey && typeof self.wrapData.unwrapKey.action === "string" ? self.wrapData.unwrapKey.action : "action";
				var messageKey = self.wrapData.unwrapKey && typeof self.wrapData.unwrapKey.message === "string" ? self.wrapData.unwrapKey.message : "message";

				var action = message[actionKey];
				var data = message[messageKey];
				if(!action || !data || !actionToMethods[action]) {
					console.log("SocketIOFileUploadServer Error: You choose to wrap your data but the message from the client is wrong configured. Please check the message and your wrapData option"); // eslint-disable-line no-console
					return;
				}
				actionToMethods[action](data);
			});
		} else {
			socket.on(self.topicName + "_start", _uploadStart(socket));
			socket.on(self.topicName + "_progress", _uploadProgress(socket));
			socket.on(self.topicName + "_done", _uploadDone(socket));
		}

		socket.on("disconnect", _onDisconnect(socket));
	};

	/**
	 * Public method.  Abort an upload that may be in progress.  Throws an
	 * exception if the specified file upload is not in progress.
	 *
	 * @param  {String} id     The ID of the file upload to abort.
	 * @param  {Socket} socket The socket that this instance is connected to.
	 * @return {void}
	 */
	this.abort = function (id, socket) {
		if (!socket) {
			throw new Error("Please pass the socket instance as the second argument to abort()");
		}

		var fileInfo = files[id];
		if (!fileInfo) {
			throw new Error("File with specified ID does not exist: " + id);
		}

		fileInfo.success = false;
		socket.emit(_getTopicName("_error"), _wrapData({
			id: id,
			message: "File upload aborted by server"
		}, "error"));
		_cleanupFile(id);
	};

	if (this.exposePrivateFunction) {
		this.uploadStart = function (socket, data) {
			return _uploadStart(socket)(data);
		};
		this.uploadProgress = function (socket, data) {
			return _uploadProgress(socket)(data);
		};
		this.uploadDone = function (socket, data) {
			return _uploadDone(socket)(data);
		};
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
