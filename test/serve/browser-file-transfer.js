/* eslint linebreak-style: ["error", "windows"] */
/* eslint-disable no-console */
/* eslint-env node */

var test = require("tape");
var SocketIoClient = require("socket.io-client");
var SiofuClient = require("../../client.js");

function evtos(ev) {
	return ev.file ? "[ev file=" + ev.file.name + "]" : "[ev]";
}

var socket = new SocketIoClient();

test("basic functionality", function (t) {
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
	t.equal(client.topicName, "siofu", "instance.topicName defaults to siofu");
	t.notOk(client.wrapData, "instance.wrapData defaults to null");
	t.notOk(client.exposePrivateFunction, "instance.exposePrivateFunction defaults to false");

	if (window._phantom) {
		console.log("PHANTOMJS DETECTED: Disabling useBuffer now.");
		// Seems to be a bug in PhantomJS
		client.useBuffer = false;
	}

	t.pass("");
	t.pass("SELECT FILES TO UPLOAD");

	client.listenOnInput(document.getElementById("file-picker"));

	client.addEventListener("choose", function (ev) {
		numSubmitted = ev.files.length;
		t.ok(numSubmitted, "user just submitted " + numSubmitted + " files " + evtos(ev));
		socket.emit("numSubmitted", numSubmitted);

		t.notOk(startFired, "'start' event must not have been fired yet " + evtos(ev));
		t.notOk(loadFired, "'load' event must not have been fired yet " + evtos(ev));
		t.notOk(progressFired, "'progress' event must not have been fired yet " + evtos(ev));
		t.notOk(completeFired, "'complete' event must not have been fired yet " + evtos(ev));
	});

	client.addEventListener("start", function (ev) {
		t.ok(!!ev.file, "file not in start event object " + evtos(ev));
		t.ok(++startFired <= numSubmitted, "'start' event has not fired too many times " + evtos(ev));
		// Client-to-Server Metadata
		ev.file.meta.bar = "from-client";
	});

	client.addEventListener("load", function (ev) {
		t.ok(!!ev.file, "file not in load event object " + evtos(ev));
		t.ok(++loadFired <= numSubmitted, "'load' event has not fired too many times " + evtos(ev));
	});

	client.addEventListener("progress", function (ev) {
		t.ok(ev.bytesLoaded <= ev.file.size, "'progress' size calculation " + evtos(ev));
	});

	client.addEventListener("complete", function (ev) {
		t.ok(++completeFired <= numSubmitted, "'complete' event has not fired too many times " + evtos(ev));

		t.ok(ev.detail, "'complete' event has a 'detail' property " + evtos(ev));
		t.ok(ev.success, "'complete' event was successful " + evtos(ev));

		// Server-to-Client Metadata
		t.equal(ev.detail.foo, "from-server", "server-to-client metadata correct " + evtos(ev));

		if (completeFired >= numSubmitted) {

			t.equal(startFired, numSubmitted, "'start' event fired the right number of times " + evtos(ev));
			t.equal(loadFired, numSubmitted, "'load' event fired the right number of times " + evtos(ev));
			t.equal(completeFired, numSubmitted, "'complete' event fired the right number of times " + evtos(ev));

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


test("Test wrap data and sand to a single topic", function (t) {
	var client = new SiofuClient(socket, {
		topicName: "siofu_only_topic",
		wrapData: {
			wrapKey: {
				action: "action",
				message: "data",
			},
			unwrapKey: {
				action: "action",
				message: "message",
			},
		}
	});

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
	t.equal(client.topicName, "siofu_only_topic", "instance.topicName correctly set to siofu_only_topic");
	t.deepLooseEqual(client.wrapData, {
		wrapKey: {
			action: "action",
			message: "data"
		},
		unwrapKey: {
			action: "action",
			message: "message"
		}
	}, "instance.wrapData correctly formatted");

	if (window._phantom) {
		console.log("PHANTOMJS DETECTED: Disabling useBuffer now.");
		// Seems to be a bug in PhantomJS
		client.useBuffer = false;
	}

	t.pass("");
	t.pass("SELECT FILES TO UPLOAD");

	client.listenOnInput(document.getElementById("file-picker-wrap-data"));

	client.addEventListener("choose", function (ev) {
		numSubmitted = ev.files.length;
		t.ok(numSubmitted, "user just submitted " + numSubmitted + " files " + evtos(ev));
		socket.emit("numSubmittedWrap", numSubmitted);

		t.notOk(startFired, "'start' event must not have been fired yet " + evtos(ev));
		t.notOk(loadFired, "'load' event must not have been fired yet " + evtos(ev));
		t.notOk(progressFired, "'progress' event must not have been fired yet " + evtos(ev));
		t.notOk(completeFired, "'complete' event must not have been fired yet " + evtos(ev));
	});

	client.addEventListener("start", function (ev) {
		t.ok(!!ev.file, "file not in start event object " + evtos(ev));
		t.ok(++startFired <= numSubmitted, "'start' event has not fired too many times " + evtos(ev));
		// Client-to-Server Metadata
		ev.file.meta.bar = "from-client";
	});

	client.addEventListener("load", function (ev) {
		t.ok(!!ev.file, "file not in load event object " + evtos(ev));
		t.ok(++loadFired <= numSubmitted, "'load' event has not fired too many times " + evtos(ev));
	});

	client.addEventListener("progress", function (ev) {
		t.ok(ev.bytesLoaded <= ev.file.size, "'progress' size calculation " + evtos(ev));
	});

	client.addEventListener("complete", function (ev) {
		t.ok(++completeFired <= numSubmitted, "'complete' event has not fired too many times " + evtos(ev));

		t.ok(ev.detail, "'complete' event has a 'detail' property " + evtos(ev));
		t.ok(ev.success, "'complete' event was successful " + evtos(ev));

		// Server-to-Client Metadata
		t.equal(ev.detail.foo, "from-server", "server-to-client metadata correct " + evtos(ev));

		if (completeFired >= numSubmitted) {

			t.equal(startFired, numSubmitted, "'start' event fired the right number of times " + evtos(ev));
			t.equal(loadFired, numSubmitted, "'load' event fired the right number of times " + evtos(ev));
			t.equal(completeFired, numSubmitted, "'complete' event fired the right number of times " + evtos(ev));

			client.destroy();
			socket.disconnect();
			t.end();
		}
	});

	client.addEventListener("error", function (ev) {
		t.fail("Error: " + ev.file + " - " + ev.message);
		client.destroy();
		t.end();
	});
});

test.onFailure(function() {
	alert("Test failed; see log for details");
});

test.onFinish(function() {
	alert("done: Test complete; you may close your window");
});
