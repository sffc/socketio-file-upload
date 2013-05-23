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

/**
 * A client-side JavaScript object to handle file uploads to a Node.JS server
 * via Socket.IO.
 * @implements EventTarget
 * @param {SocketIO} socket The current Socket.IO connection.
 */
function SocketIOFileUpload(socket){
	var self = this; // avoids context issues

	// Check for compatibility
	if(!window.File || !window.FileReader){
		throw new Error("Socket.IO File Upload: Browser Not Supported");
	}

	// Private and Public Variables
	var callbacks = {}, inpt, uploadedFiles = [];
	self.fileInputElementId = "siofu_input";
	self.useText = false;

	/**
	 * Private method to dispatch a custom event on the instance.
	 * @param  {string} eventName  Name for which listeners can listen.
	 * @param  {object} properties An object literal with additional properties
	 *                             to be attached to the event object.
	 * @return {boolean} false if any callback returned false; true otherwise
	 */
	var _dispatch = function(eventName, properties){
		var evnt = document.createEvent("Event");
		evnt.initEvent(eventName, false, false);
		for(var prop in properties){
			if(properties.hasOwnProperty(prop)){
				evnt[prop] = properties[prop];
			}
		}
		return self.dispatchEvent(evnt);
	}

	/**
	 * Private function to transmit a file that has already been loaded to
	 * the Node.JS server via Socket.IO.
	 * @param  {File} file   The file being transmitted
	 * @param  {FileReader} reader A loaded FileReader object
	 * @return {void}
	 */
	var _sendToServer = function(file, reader){
		try{
			var useText = (typeof reader.result === "string");
			socket.emit("siofu_upload", {
				name: file.name,
				lastModifiedDate: file.lastModifiedDate,
				content: reader.result,
				encoding: useText ? "text" : "octet",
				id: uploadedFiles.length
			});
			uploadedFiles.push(file);
		}catch(err){
			throw err;
		}
	}

	/**
	 * Private function to load the file into memory using the HTML5
	 * FileReader object.
	 * @param  {FileList} files An array of files
	 * @return {void}
	 */
	var _load = function(files){
		// Iterate through the array of files.
		for(var i=0; i<files.length; i++){
			// Evaluate each file in a closure, because we will need a new
			// instance of FileReader for each file.
			(function(file){
				var reader = new FileReader();
				reader.addEventListener("load", function(event){
					var evntResult = _dispatch("load", {
						file: file,
						reader: event.target
					});
					if(evntResult){
						_sendToServer(file, event.target);
					}
				});
				if(self.useText){
					reader.readAsText(files[i]);
				}else{
					reader.readAsArrayBuffer(files[i]);
				}
			})(files[i]);
		}
	}

	/**
	 * Private function to fetch an HTMLInputElement instance that can be used
	 * during the file selection process.
	 * @return {void}
	 */
	var _getInputElement = function(){
		var inpt = document.getElementById(self.fileInputElementId);
		if(!inpt){
			inpt = document.createElement("input");
			inpt.setAttribute("type", "file");
			inpt.setAttribute("id", self.fileInputElementId);
			inpt.style.display = "none";
			document.body.appendChild(inpt);
		}
		return inpt;
	}

	/**
	 * Private function that serves as a callback on file input.
	 * @param  {Event} event The file input change event
	 * @return {void}
	 */
	var _fileSelectCallback = function(event){
		var files = event.target.files || event.dataTransfer.files;
		event.preventDefault();
		if(files.length > 0){
			var evntResult = _dispatch("choose", {
				files: files
			});
			if(evntResult){
				_load(files);
			}
		}
	}

	/**
	 * Use a file input to activate this instance of the file uploader.
	 * @param  {HTMLInputElement} inpt The input element (e.g., as returned by
	 *                                 document.getElementById("yourId") )
	 * @return {void}
	 */
	this.listenOnInput = function(inpt){
		if(!inpt.files) return;
		inpt.addEventListener("change", _fileSelectCallback, false);
	}

	/**
	 * Accept files dropped on an element and upload them using this instance
	 * of the file uploader.
	 * @param  {HTMLELement} div Any HTML element.  When the user drags a file
	 *                           or files onto this element, those files will
	 *                           be processed by the instance.
	 * @return {void}
	 */
	this.listenOnDrop = function(div){
		// We need to preventDefault on the dragover event in order for the
		// drag-and-drop operation to work.
		div.addEventListener("dragover", function(event){
			event.preventDefault();
		}, false);

		div.addEventListener("drop", _fileSelectCallback);
	}

	/**
	 * Display a dialog box for the user to select a file.  The file will then
	 * be uploaded using this instance of SocketIOFileUpload.
	 *
	 * This method works in all current browsers except Firefox, though Opera
	 * requires that the input element be visible.
	 * 
	 * @return {void}
	 */
	this.prompt = function(){
		var inpt = _getInputElement();

		// Listen for the "change" event on the file input element.
		inpt.addEventListener("change", _fileSelectCallback, false);

		// Fire a click event on the input element.  Firefox does not allow
		// programatic clicks on input elements, but the other browsers do.
		// Note that Opera requires that the element be visible when "clicked".
		var evnt = document.createEvent("MouseEvents");
		evnt.initMouseEvent("click", true, true, window,
			0, 0, 0, 0, 0, false, false, false, false, 0, null);
		inpt.dispatchEvent(evnt);
	}

	/**
	 * Registers an event listener.  If the callback function returns false,
	 * the file uploader will stop uploading the current file.
	 * @param  {string}   eventName Type of event for which to listen.
	 * @param  {Function} callback  Listener function.  Will be passed the
	 *                              event as an argument when the event occurs.
	 * @return {void}
	 */
	this.addEventListener = function(eventName, callback){
		if(!callbacks[eventName]) callbacks[eventName] = [];
		callbacks[eventName].push(callback);
	}

	/**
	 * Removes an event listener.
	 * @param  {string}   eventName Type of event.
	 * @param  {Function} callback  Listener function to remove.
	 * @return {boolean}            true if callback removed; false otherwise
	 */
	this.removeEventListener = function(eventName, callback){
		if(!callbacks[eventName]) return false;
		for(var i=0; i<callbacks[eventName].length; i++){
			if(callbacks[eventName][i] == callback){
				callbacks[eventName].splice(i, 1);
				return true;
			}
		}
		return false;
	}

	/**
	 * Dispatches an event into this instance's event model.
	 * @param  {Event} evnt The event to dispatch.
	 * @return {boolean} false if any callback returned false; true otherwise
	 */
	this.dispatchEvent = function(evnt){
		var eventCallbacks = callbacks[evnt.type];
		if(!eventCallbacks) return true;
		var retVal = true;
		for(var i=0; i<eventCallbacks.length; i++){
			var callbackResult = eventCallbacks[i](evnt);
			if(callbackResult === false){
				retVal = false;
			}
		}
		return retVal;
	}

	// CONSTRUCTOR: Listen to the "complete" message on the socket.
	socket.on("siofu_complete", function(data){
		_dispatch("complete", {
			file: uploadedFiles[data.id],
			success: data.success
		});
	});
}
