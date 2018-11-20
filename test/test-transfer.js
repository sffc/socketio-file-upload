/* eslint linebreak-style: ["error", "windows"] */
/* eslint-disable no-console */
/* eslint-env node */

var test = require("tape");
var setup = require("./setup-server.js");
var chrome = require("chrome-location");
var cp = require("child_process");
var http = require("http");
var fs = require("fs");
var ecstatic = require("ecstatic");
var bufferEquals = require("buffer-equals");
var path = require("path");
var phantomRunner = require("./browser-phantom");

function evtos(ev) {
	return ev.file ? "[ev file=" + ev.file.name + "]" : "[ev]";
}

var mandrillContent = fs.readFileSync(path.join(__dirname, "assets", "mandrill.png"));
var sonnet18Content = fs.readFileSync(path.join(__dirname, "assets", "sonnet18.txt"));

test("test setup function", function (t) {
	var requestHandler = ecstatic({
		root: __dirname + "/serve",
		cache: 0
	});
	var server = http.createServer(requestHandler);
	setup.listen(server, function(port){
		return function(){
			var startFired = 0;
			var completeFired = 0;
			var savedFired = 0;
			var numSubmitted = -1;

			var uploader = setup.setup(server, function(socket) {
				socket.once("numSubmitted", function(_numSubmitted) {
					numSubmitted = _numSubmitted;
					startFired = 0;
					completeFired = 0;
					savedFired = 0;
					t.ok(numSubmitted, "user submitted " + numSubmitted + " files");
				});
			});
			t.ok(uploader, "uploader is not null/undefined");
			t.equal(typeof uploader, "object", "uploader is an object");

			uploader.on("start", function (ev) {
				t.ok(!!ev.file, "file not in start event object " + evtos(ev));
				startFired++;
			});

			var progressContent = {};
			uploader.on("progress", function (ev) {
				if (!progressContent[ev.file.id]) progressContent[ev.file.id] = new Buffer([]);
				progressContent[ev.file.id] = Buffer.concat([progressContent[ev.file.id], ev.buffer]);
				t.ok(ev.buffer.length <= ev.file.size, "'progress' event " + evtos(ev));
			});

			uploader.on("complete", function (ev) {
				t.ok(++completeFired <= startFired, "'complete' event has not fired too many times " + evtos(ev));

				t.ok(ev.file.success, "Successful upload " + evtos(ev));
			});

			// Currently the test hangs right here!

			uploader.on("saved", function (ev) {
				t.ok(++savedFired <= startFired, "'saved' event has not fired too many times " + evtos(ev));
				t.ok(ev.file.success, "Successful save " + evtos(ev));

				// Client-to-Server Metadata
				t.equal(ev.file.meta.bar, "from-client", "client-to-server metadata correct " + evtos(ev));

				// Server-to-Client Metadata
				ev.file.clientDetail.foo = "from-server";

				// Check for file equality
				fs.readFile(ev.file.pathName, function(err, content){
					t.error(err, "reading saved file " + evtos(ev));

					if (!bufferEquals(progressContent[ev.file.id], content)) {
						t.fail("Saved file content is not the same as progress buffer " + evtos(ev));
					} else {
						t.pass("Saved file content is same as progress buffer " + evtos(ev));
					}

					var fileContent = ev.file.name === "mandrill.png" ? mandrillContent : sonnet18Content;
					if (!bufferEquals(fileContent, content)) {
						t.fail("Saved file content is not the same as original file buffer " + evtos(ev));
					} else {
						t.pass("Saved file content is same as original file buffer " + evtos(ev));
					}

					// Clean up
					fs.unlink(ev.file.pathName, function() {
						if (numSubmitted > 0 && savedFired >= numSubmitted) {
							t.equal(completeFired, startFired, "'complete' event fired the right number of times " + evtos(ev));
							t.equal(savedFired, startFired, "'saved' event fired the right number of times " + evtos(ev));
						}
					});
				});
			});

			uploader.on("error", function (ev) {
				t.fail("Error: " + ev.error + " " + evtos(ev));
			});

			if (process.env["X_USE_PHANTOM"]) {
				// Headless test
				phantomRunner(port, function(err) {
					if (err) {
						t.fail("Error: " + err);
					}

					// No more tests
					server.close();
					t.end();
				});
			} else {
				// Manual test
				var child = cp.spawn(chrome, [ "http://127.0.0.1:" + port ]);
				child.on("close", function() {
					// No more tests
					server.close();
					t.end();
				});
			}
		};
	});
});
