/* eslint linebreak-style: ["error", "windows"] */
/* eslint-disable no-console */
/* eslint-env node */

import test from "tape";
import * as setup from "./setup-server";
import chrome from "chrome-location";
import cp from "child_process";
import http from "http";
import fs from "fs";
import path from "path";
import phantomRunner from "./browser-phantom";
import SocketIOFileUploadServer from '../server'
import { FileInfo } from '../server'
import { FileUploadSavedEvent } from '../server'

type Metadata = { bar: string}
type ClientDetail = { foo: string }
type testUploaderCallback = (startFired: number, completeFired: number, savedFired: number, event: FileUploadSavedEvent<Metadata, ClientDetail>) => void


function evtos(ev: {file: FileInfo<Metadata, ClientDetail>}) {
	return ev.file ? "[ev file=" + ev.file.name + "]" : "[ev]";
}

const mandrillContent = fs.readFileSync(path.join(__dirname, "assets", "mandrill.png"));
const sonnet18Content = fs.readFileSync(path.join(__dirname, "assets", "sonnet18.txt"));

function _testUploader(t: test.Test, uploader: SocketIOFileUploadServer<Metadata, ClientDetail>, callbackFileSavedAndUnlink: testUploaderCallback) {
	let startFired = 0;
	let completeFired = 0;
	let savedFired = 0;

	t.ok(uploader, "uploader is not null/undefined");
	t.equal(typeof uploader, "object", "uploader is an object");

	uploader.on("start", (ev) => {
		t.ok(!!ev.file, "file not in start event object " + evtos(ev));
		startFired++;
	});

	let progressContent: Record<number, Buffer> = {};
	uploader.on("progress", (ev) => {
		if (!progressContent[ev.file.id]) progressContent[ev.file.id] = Buffer.from([]);
		progressContent[ev.file.id] = Buffer.concat([progressContent[ev.file.id], ev.buffer]);
		t.ok(ev.buffer.length <= ev.file.size, "'progress' event " + evtos(ev));
	});

	uploader.on("complete", (ev) => {
		t.ok(++completeFired <= startFired, "'complete' event has not fired too many times " + evtos(ev));

		t.ok(ev.file.success, "Successful upload " + evtos(ev));
	});

	uploader.on("saved", (ev) => {
		t.ok(++savedFired <= startFired, "'saved' event has not fired too many times " + evtos(ev));
		t.ok(ev.file.success, "Successful save " + evtos(ev));

		// Client-to-Server Metadata
		t.equal(ev.file.meta.bar, "from-client", "client-to-server metadata correct " + evtos(ev));
		// Server-to-Client Metadata
		ev.file.clientDetail.foo = "from-server";

		// Check for file equality
		fs.readFile(ev.file.pathName, (err, content) => {
			t.error(err, "reading saved file " + evtos(ev));

			if (!content.equals(progressContent[ev.file.id])) {
				t.fail("Saved file content is not the same as progress buffer " + evtos(ev));
			} else {
				t.pass("Saved file content is same as progress buffer " + evtos(ev));
			}

			let fileContent = ev.file.name === "mandrill.png" ? mandrillContent : sonnet18Content;
			if (!content.equals(fileContent)) {
				t.fail("Saved file content is not the same as original file buffer " + evtos(ev));
			} else {
				t.pass("Saved file content is same as original file buffer " + evtos(ev));
			}

			// Clean up
			fs.unlink(ev.file.pathName, () => {
				callbackFileSavedAndUnlink(startFired, completeFired, savedFired, ev);
			});
		});
	});

	uploader.on("error", (ev) => {
		t.fail("Error: " + ev.error + " " + evtos(ev));
	});

}

test("test setup function", (t) => {
	const requestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const path = __dirname + "/serve" + (req.url == '/' ? '/index.html' : req.url);
    fs.readFile(path, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('404: File not found');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
  };

	const server = http.createServer(requestHandler);

	setup.listen(server).then(async (port) => {

		if (process.env["X_USE_PHANTOM"]) {
			// Headless test
			phantomRunner(port, (err: never) => {
				if (err) {
					t.fail("Error: " + err);
				}

				// No more tests
				server.close();
				t.end();
			});
		} else if(chrome) {
			// Manual test
			const child = cp.spawn(chrome, [ "http://127.0.0.1:" + port ]);
			child.on("close", () => {
				// No more tests
				server.close();
				t.end();
			});
		} else {
      t.error(new Error("No browser found"));
    }

		const socket = await setup.setupSocketIo(server);
		let numSubmitted = -1;
		let numSubmittedWrap = -1;

		socket.once("numSubmitted", (_numSubmitted) => {
			numSubmitted = _numSubmitted;
			t.ok(numSubmitted, "user submitted " + numSubmitted + " files");
		});

		socket.once("numSubmittedWrap", (_numSubmittedWrap) => {
			numSubmittedWrap = _numSubmittedWrap;
			t.ok(numSubmittedWrap, "user submitted " + numSubmittedWrap + " files with data wrapped");
		});

		const uploaderOptions = {
			dir: "/tmp",
		};
		const uploaderWrapDataOptions = {
			dir: "/tmp",
			topicName: "siofu_only_topic",
			wrapData: {
				wrapKey: {
					action: "action",
					message: "message"
				},
				unwrapKey: {
					action: "action",
					message: "data"
				}
			}
		};

		const uploader = setup.getUploader<Metadata, ClientDetail>(uploaderOptions, socket);
		const uploaderWrapData = setup.getUploader<Metadata, ClientDetail>(uploaderWrapDataOptions, socket);

		_testUploader(t, uploader, (startFired, completeFired, savedFired, ev) => {
			if (numSubmitted > 0 && savedFired >= numSubmitted) {
				t.equal(completeFired, startFired, "wrapData=false: 'complete' event fired the right number of times " + evtos(ev));
				t.equal(savedFired, startFired, "wrapData=false: 'saved' event fired the right number of times " + evtos(ev));
			}
		});

		_testUploader(t, uploaderWrapData, (startFired, completeFired, savedFired, ev) => {
			if (numSubmitted > 0 && savedFired >= numSubmitted) {
				t.equal(completeFired, startFired, "wrapData=true: 'complete' event fired the right number of times " + evtos(ev));
				t.equal(savedFired, startFired, "wrapData=true: 'saved' event fired the right number of times " + evtos(ev));
			}
		});
	});
});
