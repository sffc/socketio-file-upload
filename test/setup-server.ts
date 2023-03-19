/* eslint linebreak-style: ["error", "windows"] */
/* eslint-disable no-console */
/* eslint-env node */

import socket from "socket.io";
import http from "http";
import SiofuServer from '../server';
import { SocketIOFileUploadServer } from '../server';
import { SocketIOFileUploadServerProps } from '../server';


export async function setupSocketIo(httpServer: http.Server): Promise<socket.Socket>
{
  return new Promise<socket.Socket>((resolve) =>
  {
    const io = new socket.Server(httpServer);
    io.on("connection", (socket) => {
      resolve(socket);
    });
  });
}

export function getUploader<Metadata, CLientInfo>(options: Partial<SocketIOFileUploadServerProps>, socket: socket.Socket): SocketIOFileUploadServer<Metadata, CLientInfo>
{
  const uploader = new SiofuServer<Metadata, CLientInfo>(options);
  uploader.listen(socket);

  uploader.uploadValidator = (event, next) =>
  {
    console.log("Passing upload validator for " + event.file.name);
    next(true);
  };

  return uploader;
}

export async function listen(server: http.Server): Promise<number>
{
  return new Promise<number>((resolve) => {
    // Try the first time
    let port = Math.floor(Math.random() * 63535 + 2000);
    console.log("Attempting connection on port", port);
    server.listen(port, "127.0.0.1", () => {
      return resolve(port);
    });

    server.on("error", (err) => {
      // Try again
      port = Math.floor(Math.random() * 63535 + 2000);
      console.log("Attempt failed. Attempting connection on port", port);
      console.log("Error was:", err);
      server.listen(port, "127.0.0.1", () => {
        return resolve(port);
      });
    });
  });
}
