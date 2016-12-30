var test = require("tape");
var SocketIoClient = require("socket.io-client");
var SiofuClient = require("../../client.js");


test("basic functionality", function (t) {
	var socket = new SocketIoClient();
	var client = new SiofuClient(socket);

	var numSubmitted = 0;
	var startFired = 0;
	var loadFired = 0;
	var progressFired = 0;
	var completeFired = 0;

	t.equal(typeof client.listenOnInput, "function", "instance.listenOnInput is a function");
	t.equal(typeof client.listenOnDrop, "function", "instance.listenOnDrop is a function");
	t.equal(typeof client.listenOnSubmit, "function", "instance.listenOnSubmit is a function");
	t.equal(typeof client.listenOnArraySubmit, "function", "instance.listenOnArraySubmit is a function");
	t.equal(typeof client.prompt, "function", "instance.prompt is a function");
	t.equal(typeof client.submitFiles, "function", "instance.submitFiles is a function");
	t.equal(typeof client.destroy, "function", "instance.destroy is a function");

	t.notOk(client.maxFileSize, "instance.maxFileSize defaults to null");
	t.equal(client.chunkSize, 102400, "instance.chunkSize defaults to 100 KiB");
	t.notOk(client.useText, "instance.useText defaults to false");
	t.ok(client.useBuffer, "instance.useBuffer defaults to true");
	t.notOk(client.serializeOctets, "instance.serializeOctets defaults to false");

	t.pass("");
	t.pass("SELECT FILES TO UPLOAD");

	client.listenOnInput(document.querySelector("input"));

	client.addEventListener("choose", function (ev) {
		numSubmitted = ev.files.length;
		t.ok(numSubmitted, "user just submitted " + numSubmitted + " files");
		socket.emit("numSubmitted", numSubmitted);

		t.notOk(startFired, "'start' event must not have been fired yet");
		t.notOk(loadFired, "'load' event must not have been fired yet");
		t.notOk(progressFired, "'progress' event must not have been fired yet");
		t.notOk(completeFired, "'complete' event must not have been fired yet");
	});

	client.addEventListener("start", function (ev) {
		t.ok(++startFired <= numSubmitted, "'start' event has not fired too many times");
	})

	client.addEventListener("load", function (ev) {
		t.ok(++loadFired <= numSubmitted, "'load' event has not fired too many times");
	});

	client.addEventListener("progress", function (ev) {
		t.ok(ev.bytesLoaded <= ev.file.size, "'progress' size calculation");
	});

	client.addEventListener("complete", function (ev) {
		t.ok(++completeFired <= numSubmitted, "'complete' event has not fired too many times");

		t.ok(ev.detail, "'complete' event has a 'detail' property");
		t.ok(ev.success, "'complete' event was successful");

		if (completeFired >= numSubmitted) {

			t.equal(startFired, numSubmitted, "'start' event fired the right number of times");
			t.equal(loadFired, numSubmitted, "'load' event fired the right number of times");
			t.equal(completeFired, numSubmitted, "'complete' event fired the right number of times");

			client.destroy();
			t.end();
		}
	});

	client.addEventListener("error", function (ev) {
		t.fail("Error: " + ev.file + " - " + ev.message);
		client.destroy();
		t.end();
	});
});

var windowCloseTimeout = null;
window.keepWindowOpen = function() {
	clearTimeout(windowCloseTimeout);
}
test("Print pass or fail on the screen", function (t) {
	document.write((test.getHarness()._results.fail ? "FAIL" : "PASS") + ", closing window in 5 seconds <a href='javascript:keepWindowOpen()'>(keep window open)</a>");
	t.end();
	windowCloseTimeout = setTimeout(window.close, 5000);
});
