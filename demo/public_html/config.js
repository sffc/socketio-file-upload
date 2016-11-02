requirejs.config({
	paths: {
		"SocketIOFileUpload": "/siofu/client",
		"socket.io": "/socket.io/socket.io"
	}
});

require(["socket.io", "SocketIOFileUpload"], function (io, SocketIOFileUpload) {
	// jQuery version
	function flash(message){
		(function(message){
			var flsh = $("<div></div>");
			flsh.addClass("flash");
			flsh.text(message);
			flsh.appendTo(document.body);
			setTimeout(function(){
				flsh.slideUp(500, function(){
					flsh.remove();
				});
			}, 2000);
		})(message);
	}

	// non-jQuery version
	function flash(message){
		(function(message){
			var flsh = document.createElement("div");
			flsh.setAttribute("class", "flash");
			flsh.textContent = message;
			document.body.appendChild(flsh);
			setTimeout(function(){
				document.body.removeChild(flsh);
			}, 2000);
		})(message);
	}

	var socket = io.connect();
	var uploader = new SocketIOFileUpload(socket);
	uploader.addEventListener("complete", function(event){
		console.log(event);
		flash("Upload Complete: "+event.file.name);
	});
	uploader.addEventListener("choose", function(event){
		flash("Files Chosen: "+event.files);
	});
	uploader.addEventListener("start", function(event){
		event.file.meta.hello = "World";
	});
	uploader.addEventListener("progress", function(event){
		console.log(event);
		console.log("File is", event.bytesLoaded/event.file.size*100, "percent loaded");
	});
	uploader.addEventListener("load", function(event){
		flash("File Loaded: "+event.file.name);
		console.log(event);
	});
	uploader.addEventListener("error", function(event){
		flash("Error: "+event.message);
		console.log(event.message);
		if (event.code === 1) {
			alert("Don't upload such a big file");
		}
	});
	uploader.maxFileSize = 20000;
	uploader.useBuffer = true;
	uploader.chunkSize = 1024;
	//uploader.useText = true;
	//uploader.serializedOctets = true;
	document.getElementById("ul_btn").addEventListener("click", function(){
		uploader.prompt();
	}, false);
	uploader.listenOnInput(document.getElementById("plain_input_element"));
	uploader.listenOnDrop(document.getElementById("file_drop"));

	window.uploader = uploader;
});