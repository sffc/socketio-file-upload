#!/usr/bin/env node
// Automation for the browser side of the test using PhantomJS.

/* eslint-disable no-console */

"use strict";

const phantom = require("phantom");
const path = require("path");
const sleep = require("util").promisify(setTimeout);

async function run(port) {
	// Return value: first error on the client
	let clientError = null;

	// Page will alert when done or failure
	let clientFailure = null;
	let clientDone = false;

	const instance = await phantom.create();
	const page = await instance.createPage();
	await page.on("onResourceRequested", (requestData) => {
		console.info("requesting:", requestData.url);
	});
	await page.on("onConsoleMessage", (message) => {
		console.log("browser:", message);
	});
	await page.on("onError", (message, trace) => {
		if (!clientError) {
			let traceString = "";
			for (let i=0; i<trace.length; i++) {
				traceString += JSON.stringify(trace[i]);
			}
			clientError = new Error(message + "\n\n" + traceString + "\n\n");
		}
	});
	await page.on("onAlert", (message) => {
		if (message.substr(0, 5) === "done:") {
			clientDone = true;
		} else if (!clientFailure) {
			clientFailure = message;
		}
	});

	const status = await page.open("http://127.0.0.1:" + port);
	if (status !== "success") {
		await instance.exit();
		return new Error("Not able to load test page: " + status);
	}
	await page.uploadFile("#file-picker", [
		path.join(__dirname, "assets", "mandrill.png"),
		path.join(__dirname, "assets", "sonnet18.txt")
	]);

	console.info("Waiting 5 seconds before testing wrap data");
	setTimeout(async () => {
		await page.uploadFile("#file-picker-wrap-data", [
			path.join(__dirname, "assets", "mandrill.png"),
			path.join(__dirname, "assets", "sonnet18.txt")
		]);
	}, 5000);



	while (true) { // eslint-disable-line no-constant-condition
		await sleep(500);
		if (clientError || clientDone) {
			break;
		}
	}

	await instance.exit();
	return clientError || clientFailure;
}

module.exports = function(port, callback) {
	run(port).then(callback);
};

// Standalone endpoint for testing
async function main() {
	if (!process.argv[2]) {
		console.error("Error: Pass port number as first argument");
		process.exit(1);
	}
	console.log("Attaching on port:", process.argv[2]);
	const clientError = await run(process.argv[2]);
	if (clientError) {
		console.error("Error from client:");
		console.error(clientError);
		process.exit(1);
	} else {
		console.info("Client closed successfully");
		process.exit(0);
	}
}
if (require.main === module) {
	main();
}
