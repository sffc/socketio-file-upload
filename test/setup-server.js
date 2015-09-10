var SocketIo = require("socket.io");
var SiofuServer = require("../server.js");

module.exports = function setup(httpServer) {
	var io = new SocketIo(httpServer);
	var uploader = new SiofuServer();

	io.on("connection", function (socket) {
		uploader.listen(socket);

		socket.on("disconnect", function () {
			console.error("FAIL socket disconnected");
			/*
			io.close();
			process.exit(1);
			*/
		});
	});
	io.on("error", function (err) {
		throw err
	});

	return uploader;
}
