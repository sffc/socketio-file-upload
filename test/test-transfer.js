var test = require("tape");
var setup = require("./setup-server.js")
var chrome = require("chrome-location");
var cp = require("child_process");
var http = require("http");
var ecstatic = require("ecstatic");

test("test setup function", function (t) {
	var requestHandler = ecstatic({
		root: __dirname + "/serve",
		cache: 0
	})
	var server = http.createServer(requestHandler);
	server.listen(3000)

	var startFired = 0;
	var completeFired = 0;
	var savedFired = 0;

	var uploader = setup(server)
	t.ok(uploader, "uploader is not null/undefined");
	t.equal(typeof uploader, "object", "uploader is an object");

	uploader.on("start", function (ev) {
		startFired++;
	})

	uploader.on("progress", function (ev) {
		t.ok(ev.buffer.length < ev.file.size, "'progress' event");
	});

	uploader.on("complete", function (ev) {
		t.ok(++completeFired <= startFired, "'complete' event has not fired too many times");

		t.ok(ev.file.success, "Successful upload");
	});

	// Currently the test hangs right here!

	uploader.on("saved", function (ev) {
		t.ok(++savedFired <= startFired, "'saved' event has not fired too many times");

		t.ok(ev.file.success, "Successful save");

		if (savedFired >= startFired) {
			t.equal(completeFired, startFired, "'complete' event fired the right number of times");
			t.equal(savedFired, startFired, "'saved' event fired the right number of times");

			client.destroy();
			t.end();
		}
	});

	uploader.on("error", function (ev) {
		t.fail("Error: " + ev.error);
		t.end();
	});


	cp.spawn(chrome, [ "http://localhost:3000" ])
});
