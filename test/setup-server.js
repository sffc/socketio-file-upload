/* eslint linebreak-style: ["error", "windows"] */
/* eslint-disable no-console */
/* eslint-env node */

const SocketIo = require("socket.io");
const SiofuServer = require("../server.js");

module.exports = {
	setupSocketIo(httpServer) {
		return new Promise((resolve) => {
			const io = new SocketIo(httpServer);

			io.on("connection", (socket) => {
				resolve(socket);
			});
		});
	},
	getUploader(siofuOptions, socket) {
		const uploader = new SiofuServer(siofuOptions);

		uploader.listen(socket);

		uploader.uploadValidator = (event, next) => {
			console.log("Passing upload validator for " + event.file.name);
			next(true);
		};

		return uploader;
	},
	listen(server) {
		return new Promise((resolve) => {
			// Try the first time
			let port = Math.floor(Math.random() * 63535 + 2000);
			console.log("Attempting connection on port", port);
			server.listen(port, "127.0.0.1", () => {
				resolve(port);
			});

			server.on("error", (err) => {
				// Try again
				port = Math.floor(Math.random() * 63535 + 2000);
				console.log("Attempt failed. Attempting connection on port", port);
				console.log("Error was:", err);
				server.listen(port, "127.0.0.1", () => {
					resolve(port);
				});
			});
		});
	}
};
