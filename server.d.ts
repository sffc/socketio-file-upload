import { EventEmitter } from 'events';
import { Router }       from 'express';
import { WriteStream }  from 'fs';
import { Socket }       from 'socket.io';
import http             from 'http';


export type SocketIOFileUploadServerProps = typeof SocketIOFileUploadServerOptions.prototype;
export abstract class SocketIOFileUploadServerOptions
{
  /**
   * If specified, the module will attempt to save uploaded files in this directory.
   * The module will intelligently suffix numbers to the uploaded filenames
   * until name conflicts are resolved.
   * It will also sanitize the filename to help prevent attacks.
  */
  dir: string|null

  /**
   * Use these UNIX permissions when saving the uploaded file
   * @default 0666
   */
  mode: string

  /**
   * The maximum file size, in bytes, to write to the disk.
   * If file data is received from the client that exceeds this bound,
   * the data will not be written to the disk and an "error" event will be thrown.
   * Defaults to `null`, in which no maximum file size is enforced.
   * @default null
   */
  maxFileSize: number|null

  /**
   * Whether or not to emit an error event
   * if a progress chunk fails to finish writing.
   * In most cases, the failure is a harmless notification
   * that the file is larger than the internal buffer size,
   * but it could also mean that the file upload triggered an ENOSPC error.
   * It may be useful to enable this error event
   * if you are concerned about uploads running out of space.
   * @default false
   */
  emitChunkFail: boolean

  /**
   * Specify the topic to listen on.
   * Need to be the same that the one specified in the client.
   * @default siofu
   */
  topicName: string

  /**
   * WrapData allow you to wrap the Siofu messages into a predefined format.
   * You can then easily use Siofu packages even in strongly typed topic.
   * wrapData can be a boolean or an object. It is false by default.
   * If wrapData is true it will allow you to send all the messages to only one topic by wrapping the siofu actions and messages.
   *
   * ```js
   * {
   *   action: 'complete',
   *   message: {
   *     id: id,
   *     success: success,
   *     detail: fileInfo.clientDetail
   *   }
   * }
   * ```
   *
   * If wrapData is an object constituted of two mandatory key and one optional:
   * wrapKey and unwrapKey (mandatory): Corresponding to the key used to wrap the siofu data and message
   * additionalData (optional): Corresponding to the data to send along with file data
   *
   * ```js
   * if wrapData = {
   *   wrapKey: {
   *     action: 'actionType',
   *     message: 'data'
   *   },
   *   unwrapKey: {
   *     action: 'actionType',
   *     message: 'message'
   *   },
   *   additionalData: {
   *     acknowledgement: true
   *   }
   * }
   * ```
   *
   * When Siofu will send for example a complete message this will send:
   * ```js
   * {
   *   acknowledgement: true,
   *   actionType: 'complete',
   *   data: {
   *     id: id,
   *     success: success,
   *     detail: fileInfo.clientDetail
   *   }
   * }
   * ```
   *
   * and it's waiting from client data formatted like this:
   * ```js
   * {
   *   actionType: '...',
   *   message: {...}
   * }
   * ```
   * @description
   * /!\ If wrapData is wrong configured is interpreted as false /!\
   *
   * @default false
   */
  wrapData: boolean|object;

  /**
   * Allow user to access to some private function to customize message reception.
   * This is used if you specified wrapData on the client side and have to manually bind message to callback.
   * @default false
   */
  exposePrivateFunction: boolean
}

export type FileInfo<Metadata, ClientDetail> =
{
  /**
   * The name of the file as it was originally uploaded.
   */
  name: string

  /**
   * The modified time of the file as it was originally uploaded.
   */
  mtime: Date

  /**
   * The encoding of the file as it was originally uploaded.
   */
  encoding: 'text' | 'octet'

  /**
   * The meta data defined by the client.
   */
  meta: Metadata

  /**
   * The meta data defined by the server
   */
  clientDetail: ClientDetail

  /**
   * The success status of the file upload.
   */
  success: boolean

  /**
   * The number of bytes that have been uploaded.
   */
  bytesLoaded: number

  /**
   * The size of the file in bytes.
   */
  size: number

  /**
   * The ID of the file.
   */
  id: number
}

export type FileInfoExtended<Metadata, ClientDetail> =
{
  /**
   * The new basename of the file on the server.
   *
   * @param defined if you are letting the module save the file for you
   * @default undefined
   */
  base?: string

  /**
   * The full path at which the uploaded file is saved.
   *
   * @param defined if you are letting the module save the file for you
   * @default undefined
   */
  pathName?: string
}

export type FileUploadStartEvent<Metadata, ClientDetail> =
{
  /**
   * The file object that is being uploaded.
   */
  file: FileInfo<Metadata, ClientDetail>
}

export type FileUploadProgressEvent<Metadata, ClientDetail> =
{
  buffer: Buffer
  file  : FileInfo<Metadata, ClientDetail> & FileInfoExtended<Metadata, ClientDetail>
}

export type FileUploadCompleteEvent<Metadata, ClientDetail> =
{
  interrupt: boolean
  file: FileInfo<Metadata, ClientDetail> & FileInfoExtended<Metadata, ClientDetail>
}

export type FileUploadSavedEvent<Metadata, ClientDetail> =
{
  file: FileInfo<Metadata, ClientDetail> & Required<FileInfoExtended<Metadata, ClientDetail>>
}

export type FileUploadErrorEvent<Metadata, ClientDetail> =
{
  memo: string
  error: Error
  file : FileInfo<Metadata, ClientDetail> & FileInfoExtended<Metadata, ClientDetail>
}

export declare interface SocketIOFileUploadServer<Metadata = unknown, ClientDetail = unknown>
{
  /**
   * The client has started the upload process, and the server is now processing the request.
   * @param event
   * @param listener
   */
  on(event: 'start', listener: (event: FileUploadStartEvent<Metadata, ClientDetail>) => void): this;

  /**
   * Data has been received from the client.
   * @param event
   * @param listener
   */
  on(event: 'progress', listener: (error: FileUploadProgressEvent<Metadata, ClientDetail>) => void): this;

  /**
   * The transmission of a file is complete.
   * @param event
   * @param listener
   */
  on(event: 'complete', listener: (error: FileUploadCompleteEvent<Metadata, ClientDetail>) => void): this;

  /**
   * The file has been successfully saved to disk.
   *
   * (In this event, you can safely move the saved file to a new location)
   *
   * It is recommended that you check `event.file.success` to tell whether or not the file was saved without errors.
   * @param event
   * @param listener
   */
  on(event: 'saved', listener: (error: FileUploadSavedEvent<Metadata, ClientDetail>) => void): this;

  /**
   * An error was encountered in the saving of the file.
   * @param event
   * @param listener
   */
  on(event: 'error', listener: (error: FileUploadErrorEvent<Metadata, ClientDetail>) => void): this;
}

export class SocketIOFileUploadServer<Metadata = unknown, ClientDetail = unknown> extends SocketIOFileUploadServerOptions, EventEmitter
{
  static router: http.RequestListener
  static listen: (app: http.Server) => void

  constructor(options?: Partial<SocketIOFileUploadServerProps>);

  /**
   * Can be overridden to enable async validation and preparing.
   *
   * @param event contains { file: fileInfo }
   * @param callback call it with true to start upload, false to abort
   */
  uploadValidator(event: {file: FileInfo<Metadata, ClientDetail>}, callback: (valid: boolean) => void): void

  /**
   * Listen for uploads occuring on this Socket.IO socket.
   * @param socket
   */
  listen(socket: Socket): void

  /**
   * Aborts an upload that is in progress.
   * @param id
   * @param socket
   */
  abort(id: number, socket: Socket): void
}

export default SocketIOFileUploadServer;