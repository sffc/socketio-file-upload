/*
 *                 Copyright (C) 2015 Shane Carr and others
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

// Do not check function indentation because this is intentionally ignored in order to preserve history in git.
/* eslint-disable indent */

/*
 * A client-side JavaScript object to handle file uploads to a Node.JS server
 * via Socket.IO.
 * @implements EventTarget
 * @param {SocketIO} socket The current Socket.IO connection.
 */
(function (scope, name, factory) {
	/* eslint-disable no-undef */
	if (typeof define === "function" && define.amd) {
		define([], factory);
	}
	else if (typeof module === "object" && module.exports) {
		module.exports = factory();
	}
	else {
		scope[name] = factory();
	}
	/* eslint-enable no-undef */
}(this, "SocketIOFileUpload", function () {
 return function (socket, options) {
	"use strict";

	var self = this; // avoids context issues

	// Check for compatibility
	if (!window.File || !window.FileReader) {
		throw new Error("Socket.IO File Upload: Browser Not Supported");
	}

	if ( !window.siofu_global ) {
		window.siofu_global = {
			instances: 0,
			downloads: 0
		};
	}

	// Private and Public Variables
	var callbacks = {},
		uploadedFiles = {},
		chunkCallbacks = {},
		readyCallbacks = {},
		communicators = {};

	var _getOption = function (key, defaultValue) {
		if(!options) {
			return defaultValue;
		}
		return options[key] || defaultValue;
	};

	self.fileInputElementId = "siofu_input_"+window.siofu_global.instances++;
	self.resetFileInputs = true;
	self.useText = _getOption("useText", false);
	self.serializedOctets = _getOption("serializedOctets", false);
	self.useBuffer = _getOption("useBuffer", true);
	self.chunkSize = _getOption("chunkSize", 1024 * 100); // 100kb default chunk size
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
	 * This is used if you specified wrapOptions on the client side and have to manually bind message to callback.
	 */
	self.exposePrivateFunction = _getOption("exposePrivateFunction", false);

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

	/**
	 * Private method to dispatch a custom event on the instance.
	 * @param  {string} eventName  Name for which listeners can listen.
	 * @param  {object} properties An object literal with additional properties
	 *                             to be attached to the event object.
	 * @return {boolean} false if any callback returned false; true otherwise
	 */
	var _dispatch = function (eventName, properties) {
		var evnt = document.createEvent("Event");
		evnt.initEvent(eventName, false, false);
		for (var prop in properties) {
			if (properties.hasOwnProperty(prop)) {
				evnt[prop] = properties[prop];
			}
		}
		return self.dispatchEvent(evnt);
	};

	/**
	 * Private method to bind an event listener.  Useful to ensure that all
	 * events have been unbound.  Inspired by Backbone.js.
	 */
	var _listenedReferences = [];
	var _listenTo = function (object, eventName, callback, bubble) {
		object.addEventListener(eventName, callback, bubble);
		_listenedReferences.push(arguments);
	};
	var _stopListeningTo = function (object, eventName, callback, bubble) {
		if (object.removeEventListener) {
			object.removeEventListener(eventName, callback, bubble);
		}
	};
	var _stopListening = function () {
		for (var i = _listenedReferences.length - 1; i >= 0; i--) {
			_stopListeningTo.apply(this, _listenedReferences[i]);
		}
		_listenedReferences = [];
	};

	/**
	 * Private closure for the _load function.
	 * @param  {File} file A W3C File object
	 * @return {void}
	 */
	var _loadOne = function (file) {
		// First check for file size
		if (self.maxFileSize !== null && file.size > self.maxFileSize) {
			_dispatch("error", {
				file: file,
				message: "Attempt by client to upload file exceeding the maximum file size",
				code: 1
			});
			return;
		}

		// Dispatch an event to listeners and stop now if they don't want
		// this file to be uploaded.
		var evntResult = _dispatch("start", {
			file: file
		});
		if (!evntResult) return;

		// Scope variables
		var reader = new FileReader(),
			id = window.siofu_global.downloads++,
			uploadComplete = false,
			useText = self.useText,
			offset = 0,
			newName;
		if (reader._realReader) reader = reader._realReader; // Support Android Crosswalk
		uploadedFiles[id] = file;

		// An object for the outside to use to communicate with us
		var communicator = { id: id };

		// Calculate chunk size
		var chunkSize = self.chunkSize;
		if (chunkSize >= file.size || chunkSize <= 0) chunkSize = file.size;

		// Private function to handle transmission of file data
		var transmitPart = function (start, end, content) {
			var isBase64 = false;
			if (!useText) {
				try {
					var uintArr = new Uint8Array(content);

					// Support the transmission of serialized ArrayBuffers
					// for experimental purposes, but default to encoding the
					// transmission in Base 64.
					if (self.serializedOctets) {
						content = uintArr;
					}
					else if (self.useBuffer) {
						content = uintArr.buffer;
					}
					else {
						isBase64 = true;
						content = _uint8ArrayToBase64(uintArr);
					}
				}
				catch (error) {
					socket.emit(_getTopicName("_done"), _wrapData({
						id: id,
						interrupt: true
					}, "done"));
					return;
				}
			}

			// TODO override the send data
			socket.emit(_getTopicName("_progress"), _wrapData({
				id: id,
				size: file.size,
				start: start,
				end: end,
				content: content,
				base64: isBase64
			}, "progress"));
		};

		// Callback when tranmission is complete.
		var transmitDone = function () {
			socket.emit(_getTopicName("_done"), _wrapData({
				id: id
			}, "done"));
		};

		// Load a "chunk" of the file from offset to offset+chunkSize.
		//
		// Note that FileReader has its own "progress" event.  However,
		// it has not proven to be reliable enough for production. See
		// Stack Overflow question #16713386.
		//
		// To compensate, we will manually load the file in chunks of a
		// size specified by the user in the uploader.chunkSize property.
		var processChunk = function () {
			// Abort if we are told to do so.
			if (communicator.abort) return;

			var chunk = file.slice(offset, Math.min(offset+chunkSize, file.size));
			if (useText) {
				reader.readAsText(chunk);
			}
			else {
				reader.readAsArrayBuffer(chunk);
			}
		};

		// Callback for when the reader has completed a load event.
		var loadCb = function (event) {
			// Abort if we are told to do so.
			if (communicator.abort) return;

			// Transmit the newly loaded data to the server and emit a client event
			var bytesLoaded = Math.min(offset+chunkSize, file.size);
			transmitPart(offset, bytesLoaded, event.target.result);
			_dispatch("progress", {
				file: file,
				bytesLoaded: bytesLoaded,
				name: newName
			});

			// Get ready to send the next chunk
			offset += chunkSize;
			if (offset >= file.size) {
				// All done!
				transmitDone();
				_dispatch("load", {
					file: file,
					reader: reader,
					name: newName
				});
				uploadComplete = true;
			}
		};
		_listenTo(reader, "load", loadCb);

		// Listen for an "error" event.  Stop the transmission if one is received.
		_listenTo(reader, "error", function () {
			socket.emit(_getTopicName("_done"), _wrapData({
				id: id,
				interrupt: true
			}, "done"));
			_stopListeningTo(reader, "load", loadCb);
		});

		// Do the same for the "abort" event.
		_listenTo(reader, "abort", function () {
			socket.emit(_getTopicName("_done"), _wrapData({
				id: id,
				interrupt: true
			}, "done"));
			_stopListeningTo(reader, "load", loadCb);
		});

		// Transmit the "start" message to the server.
		socket.emit(_getTopicName("_start"), _wrapData({
			name: file.name,
			mtime: file.lastModified,
			meta: file.meta,
			size: file.size,
			encoding: useText ? "text" : "octet",
			id: id
		}, "start"));

		// To avoid a race condition, we don't want to start transmitting to the
		// server until the server says it is ready.
		var readyCallback = function (_newName) {
			newName = _newName;
			processChunk();
		};
		var chunkCallback = function(){
			if ( !uploadComplete )
				processChunk();
		};
		readyCallbacks[id] = readyCallback;
		chunkCallbacks[id] = chunkCallback;

		return communicator;
	};

	/**
	 * Private function to load the file into memory using the HTML5 FileReader object
	 * and then transmit that file through Socket.IO.
	 *
	 * @param  {FileList} files An array of files
	 * @return {void}
	 */
	var _load = function (files) {
		// Iterate through the array of files.
		for (var i = 0; i < files.length; i++) {
			// Evaluate each file in a closure, because we will need a new
			// instance of FileReader for each file.
			var communicator = _loadOne(files[i]);
			communicators[communicator.id] = communicator;
		}
	};

	/**
	 * Private function to fetch an HTMLInputElement instance that can be used
	 * during the file selection process.
	 * @return {void}
	 */
	var _getInputElement = function () {
		var inpt = document.getElementById(self.fileInputElementId);
		if (!inpt) {
			inpt = document.createElement("input");
			inpt.setAttribute("type", "file");
			inpt.setAttribute("id", self.fileInputElementId);
			inpt.style.display = "none";
			document.body.appendChild(inpt);
		}
		return inpt;
	};

	/**
	 * Private function to remove an HTMLInputElement created by this instance
	 * of SIOFU.
	 *
	 * @return {void}
	 */
	var _removeInputElement = function () {
		var inpt = document.getElementById(self.fileInputElementId);
		if (inpt) {
			inpt.parentNode.removeChild(inpt);
		}
	};

	var _baseFileSelectCallback = function (files) {
		if (files.length === 0) return;

		// Ensure existence of meta property on each file
		for (var i = 0; i < files.length; i++) {
			if(!files[i].meta) files[i].meta = {};
		}

		// Dispatch the "choose" event
		var evntResult = _dispatch("choose", {
			files: files
		});

		// If the callback didn't return false, continue with the upload
		if (evntResult) {
			_load(files);
		}
	};

	/**
	 * Private function that serves as a callback on file input.
	 * @param  {Event} event The file input change event
	 * @return {void}
	 */
	var _fileSelectCallback = function (event) {
		var files = event.target.files || event.dataTransfer.files;
		event.preventDefault();
		_baseFileSelectCallback(files);

		if (self.resetFileInputs) {
			try {
				event.target.value = ""; //for IE11, latest Chrome/Firefox/Opera...
			} catch(err) {
				// ignore
			}
			if (event.target.value) { //for IE5 ~ IE10
				var form = document.createElement("form"),
				parentNode = event.target.parentNode, ref = event.target.nextSibling;
				form.appendChild(event.target);
				form.reset();
				parentNode.insertBefore(event.target, ref);
			}
		}
	};


	/**
	 * Submit files at arbitrary time
	 * @param {FileList} files Files received form the input element.
	 * @return {void}
	 */
	this.submitFiles = function (files) {
		if (files) {
			_baseFileSelectCallback(files);
		}
	};

	/**
	 * Use a submitButton to upload files from the field given
	 * @param {HTMLInputElement} submitButton the button that the user has to
	 *                           click to start the upload
	 * @param {HTMLInputElement} input the field with the data to upload
	 *
	 * @return {void}
	 */
	this.listenOnSubmit = function (submitButton, input) {
		if (!input.files) return;
		_listenTo(submitButton, "click", function () {
			_baseFileSelectCallback(input.files);
		}, false);
	};

	/**
	 * Use a submitButton to upload files from the field given
	 * @param {HTMLInputElement} submitButton the button that the user has to
	 *                           click to start the upload
	 * @param {Array} array an array of fields with the files to upload
	 *
	 * @return {void}
	 */
	this.listenOnArraySubmit = function (submitButton, array) {
		for (var index in array) {
			this.listenOnSubmit(submitButton, array[index]);
		}
	};

	/**
	 * Use a file input to activate this instance of the file uploader.
	 * @param  {HTMLInputElement} inpt The input element (e.g., as returned by
	 *                                 document.getElementById("yourId"))
	 * @return {void}
	 */
	this.listenOnInput = function (inpt) {
		if (!inpt.files) return;
		_listenTo(inpt, "change", _fileSelectCallback, false);
	};

	/**
	 * Accept files dropped on an element and upload them using this instance
	 * of the file uploader.
	 * @param  {HTMLELement} div Any HTML element.  When the user drags a file
	 *                           or files onto this element, those files will
	 *                           be processed by the instance.
	 * @return {void}
	 */
	this.listenOnDrop = function (div) {
		// We need to preventDefault on the dragover event in order for the
		// drag-and-drop operation to work.
		_listenTo(div, "dragover", function (event) {
			event.preventDefault();
		}, false);

		_listenTo(div, "drop", _fileSelectCallback);
	};

	/**
	 * Display a dialog box for the user to select a file.  The file will then
	 * be uploaded using this instance of SocketIOFileUpload.
	 *
	 * This method works in all current browsers except Firefox, though Opera
	 * requires that the input element be visible.
	 *
	 * @return {void}
	 */
	this.prompt = function () {
		var inpt = _getInputElement();

		// Listen for the "change" event on the file input element.
		_listenTo(inpt, "change", _fileSelectCallback, false);

		// Fire a click event on the input element.  Firefox does not allow
		// programatic clicks on input elements, but the other browsers do.
		// Note that Opera requires that the element be visible when "clicked".
		var evnt = document.createEvent("MouseEvents");
		evnt.initMouseEvent("click", true, true, window,
			0, 0, 0, 0, 0, false, false, false, false, 0, null);
		inpt.dispatchEvent(evnt);
	};

	/**
	 * Destroy an instance of Socket.IO file upload (i.e., unbind events and
	 * relieve memory).
	 *
	 * IMPORTANT: To finish the memory relief process, set all external
	 * references to this instance of SIOFU (including the reference used to
	 * call this destroy function) to null.
	 *
	 * @return {void}
	 */
	this.destroy = function () {
		_stopListening();
		_removeInputElement();
		for (var id in communicators) {
			if (communicators.hasOwnProperty(id)) {
				communicators[id].abort = true;
			}
		}
		callbacks = null, uploadedFiles = null, readyCallbacks = null, communicators = null;
	};

	/**
	 * Registers an event listener.  If the callback function returns false,
	 * the file uploader will stop uploading the current file.
	 * @param  {string}   eventName Type of event for which to listen.
	 * @param  {Function} callback  Listener function.  Will be passed the
	 *                              event as an argument when the event occurs.
	 * @return {void}
	 */
	this.addEventListener = function (eventName, callback) {
		if (!callbacks[eventName]) callbacks[eventName] = [];
		callbacks[eventName].push(callback);
	};

	/**
	 * Removes an event listener.
	 * @param  {string}   eventName Type of event.
	 * @param  {Function} callback  Listener function to remove.
	 * @return {boolean}            true if callback removed; false otherwise
	 */
	this.removeEventListener = function (eventName, callback) {
		if (!callbacks[eventName]) return false;
		for (var i = 0; i < callbacks[eventName].length; i++) {
			if (callbacks[eventName][i] === callback) {
				callbacks[eventName].splice(i, 1);
				return true;
			}
		}
		return false;
	};

	/**
	 * Dispatches an event into this instance's event model.
	 * @param  {Event} evnt The event to dispatch.
	 * @return {boolean} false if any callback returned false; true otherwise
	 */
	this.dispatchEvent = function (evnt) {
		var eventCallbacks = callbacks[evnt.type];
		if (!eventCallbacks) return true;
		var retVal = true;
		for (var i = 0; i < eventCallbacks.length; i++) {
			var callbackResult = eventCallbacks[i](evnt);
			if (callbackResult === false) {
				retVal = false;
			}
		}
		return retVal;
	};

	// OTHER LIBRARIES
	/*
	 * base64-arraybuffer
	 * https://github.com/niklasvh/base64-arraybuffer
	 *
	 * Copyright (c) 2012 Niklas von Hertzen
	 * Licensed under the MIT license.
	 *
	 * Adapted for SocketIOFileUpload.
	 */
	var _uint8ArrayToBase64 = function (bytes) {
		var i, len = bytes.buffer.byteLength, base64 = "",
			chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

		for (i = 0; i < len; i += 3) {
			base64 += chars[bytes[i] >> 2];
			base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
			base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
			base64 += chars[bytes[i + 2] & 63];
		}

		if ((len % 3) === 2) {
			base64 = base64.substring(0, base64.length - 1) + "=";
		}
		else if (len % 3 === 1) {
			base64 = base64.substring(0, base64.length - 2) + "==";
		}

		return base64;
	};
	// END OTHER LIBRARIES
	var _chunckCallback = function(data) {
		if ( chunkCallbacks[data.id] )
			chunkCallbacks[data.id]();
	};

	var _readyCallback = function (data) {
		if (readyCallbacks[data.id])
			readyCallbacks[data.id](data.name);
	};

	var _completCallback = function (data) {
		if (uploadedFiles[data.id]) {
			_dispatch("complete", {
				file: uploadedFiles[data.id],
				detail: data.detail,
				success: data.success
			});
		}
	};

	var _errorCallback = function (data) {
		if ( uploadedFiles[data.id] ) {
			_dispatch("error", {
				file: uploadedFiles[data.id],
				message: data.message,
				code: 0
			});
			if (communicators) communicators[data.id].abort = true;
		}
	};

	// CONSTRUCTOR: Listen to the "complete", "ready", and "error" messages
	// on the socket.
	if (_isWrapDataWellConfigured() && self.wrapData) {
		var mapActionToCallback = {
			chunk: _chunckCallback,
			ready: _readyCallback,
			complete: _completCallback,
			error: _errorCallback
		};

		_listenTo(socket, _getTopicName(), function (message) {
			if (typeof message !== "object") {
				console.log("SocketIOFileUploadClient Error: You choose to wrap your data so the message from the server need to be an object"); // eslint-disable-line no-console
				return;
			}
			var actionKey = self.wrapData.unwrapKey && typeof self.wrapData.unwrapKey.action === "string" ? self.wrapData.unwrapKey.action : "action";
			var messageKey = self.wrapData.unwrapKey && typeof self.wrapData.unwrapKey.message === "string" ? self.wrapData.unwrapKey.message : "message";

			var action = message[actionKey];
			var data = message[messageKey];
			if (!action || !data || !mapActionToCallback[action]) {
				console.log("SocketIOFileUploadClient Error: You choose to wrap your data but the message from the server is wrong configured. Check the message and your wrapData option"); // eslint-disable-line no-console
				return;
			}
			mapActionToCallback[action](data);
		});
	} else {
		_listenTo(socket, _getTopicName("_chunk"), _chunckCallback);
		_listenTo(socket, _getTopicName("_ready"), _readyCallback);
		_listenTo(socket, _getTopicName("_complete"), _completCallback);
		_listenTo(socket, _getTopicName("_error"), _errorCallback);
	}

	if (this.exposePrivateFunction) {
		this.chunckCallback = _chunckCallback;
		this.readyCallback = _readyCallback;
		this.completCallback = _completCallback;
		this.errorCallback = _errorCallback;
	}
 };
}));
