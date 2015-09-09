var test = require("tape")
var SocketIOFileUpload = require("../server.js");
var http = require("http");
var fs = require("fs");
var path = require("path");
var concatStream = require("concat-stream");

function servesClientJs(t, server) {
	server.listen(80, function () {
		http.get({ path: "/siofu/client.js" }, function (res) {
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
	});
}

test("Can be constructed using SIOFU.listen()", function (t) {
	var server = http.createServer();
	SocketIOFileUpload.listen(server);

	servesClientJs(t, server);
});

test("Can be constructed using SIOFU.router", function (t) {
	var server = http.createServer(SocketIOFileUpload.router);

	servesClientJs(t, server);
});
