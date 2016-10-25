var SocketIo = require("socket.io");
var SiofuServer = require("../server.js");

module.exports = {
	setup: function(httpServer, connectionCb) {
		var io = new SocketIo(httpServer);
		var uploader = new SiofuServer();

		io.on("connection", function (socket) {
			uploader.listen(socket);
			connectionCb(socket);
		});

		uploader.dir = "/tmp";

		return uploader;
	},
	listen: function(server, cb) {
		// Try the first time
		var port = Math.floor(Math.random() * 65535);
		console.log("Attempting connection on port", port);
		server.listen(port, "127.0.0.1", cb(port));

		server.on("error", function(err){
			// Try again
			port = Math.floor(Math.random() * 65535);
			console.log("Attempt failed. Attempting connection on port", port);
			server.listen(port, "127.0.0.1", cb(port));
		});
	}
};
