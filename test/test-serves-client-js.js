var test = require("tape")
var SocketIOFileUpload = require("../server.js");
var http = require("http");
var fs = require("fs");
var path = require("path");
var concatStream = require("concat-stream");
var setup = require("./setup-server");

function serveClientCb(t, server) {
	return function (port) {
		return function() {
			http.get({
				host: "127.0.0.1",
				port: port,
				path: "/siofu/client.js"
			}, function (res) {
				var clientJsPath = path.join(__dirname, "../client.min.js");
				var clientJsStr = fs.readFileSync(clientJsPath, { encoding: 'utf8' });
				res.pipe(concatStream({ encoding: "string" }, function (resString) {
					t.equal(clientJsStr, resString, "client.min.js is being served");
					server.close(function (err) {
						t.notOk(err, "no error");
						t.end();
					});
				}));
				res.on("error", function (err) {
					t.fail("error: " + err.message);
				});
			});
		};
	};
}

test("Can be constructed using SIOFU.listen()", function (t) {
	var server = http.createServer();
	SocketIOFileUpload.listen(server);

	setup.listen(server, serveClientCb(t, server));
});

test("Can be constructed using SIOFU.router", function (t) {
	var server = http.createServer(SocketIOFileUpload.router);

	setup.listen(server, serveClientCb(t, server));
});
