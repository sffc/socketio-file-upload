var http = require('http'),
	url = require('url'),
	path = require('path'),
	mime = require('mime'),
	path = require('path'),
	fs = require('fs'),
	SocketIOFileUploadServer = require('../server'),
	socketio = require('socket.io'),
	express = require('express');
 
// Simple Static File Server.  Used under the terms of the BSD license.
//   http://classes.engineering.wustl.edu/cse330/index.php/Node.JS
var app = http.createServer(function(req, resp){
	var filename = path.join(__dirname, "public_html", url.parse(req.url).pathname);
	(fs.exists || path.exists)(filename, function(exists){
		if (exists) {
			fs.readFile(filename, function(err, data){
				if (err) {
					// File exists but is not readable (permissions issue?)
					resp.writeHead(500, {
						"Content-Type": "text/plain"
					});
					resp.write("Internal server error: could not read file");
					resp.end();
					return;
				}
 
				// File exists and is readable
				var mimetype = mime.lookup(filename);
				resp.writeHead(200, {
					"Content-Type": mimetype
				});
				resp.write(data);
				resp.end();
				return;
			});
		}
	});
});
//app.listen(3456);
//io = socketio.listen(app);
//SocketIOFileUploadServer.listen(app);

var app = express()
	.use(SocketIOFileUploadServer.router)
	.use(express.static(__dirname + "/out"))
	.use(express.static(__dirname + "/public_html"))
	.listen(4567);
var io = socketio.listen(app);
console.log("Listening on port 4567");

io.sockets.on("connection", function(socket){
	var siofuServer = new SocketIOFileUploadServer();
	siofuServer.on("saved", function(event){
		console.log(event.file);
		event.file.clientDetail.base = event.file.base;
	});
	siofuServer.on("error", function(data){
		console.log("Error: "+data.memo);
		console.log(data.error);
	});
	siofuServer.on("start", function(event){
		if (/\.exe$/.test(event.file.name)) {
			console.log("Aborting: " + event.file.id);
			siofuServer.abort(event.file.id, socket);
		}
	});
	siofuServer.dir = "uploads";
	siofuServer.maxFileSize = 20000;
	siofuServer.listen(socket);
})
