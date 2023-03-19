/* eslint linebreak-style: ["error", "windows"] */
/* eslint-disable no-console */
/* eslint-env node */


import test from "tape";
import * as setup from "./setup-server";
import http from "http";
import fs from "fs";
import path from "path";
import SocketIOFileUpload from '../server'
import concatStream from "concat-stream";

function serveClientCb(t: test.Test, server: http.Server, port: number) {
	http.get({
		host: "127.0.0.1",
		port: port,
		path: "/siofu/client.js"
	}, (res) => {
		const clientJsPath = path.join(__dirname, "../client.min.js");
		const clientJsStr = fs.readFileSync(clientJsPath, { encoding: "utf8" });
		res.pipe(concatStream({ encoding: "string" }, (resString) => {
			t.equal(clientJsStr, resString, "client.min.js is being served");
			server.close( (err) => {
				t.notOk(err, "no error");
				t.end();
			});
		}));
		res.on("error", (err) => {
			t.fail("error: " + err.message);
		});
	});
}

test("Can be constructed using SIOFU.listen()", (t) => {
	const server = http.createServer();
	SocketIOFileUpload.listen(server);

	setup.listen(server).then((port) => {
		serveClientCb(t, server, port);
	});
});

test("Can be constructed using SIOFU.router", (t) => {
	const server = http.createServer(SocketIOFileUpload.router);

	setup.listen(server).then((port) => {
		serveClientCb(t, server, port);
	});
});
