import { EventEmitter } from 'events';
import { Router }       from 'express';
import { WriteStream }  from 'fs';
import { Socket }       from 'socket.io';


export type FileUploadBaseEvent<Metadata> =
{
  /**
   * The file object that is being uploaded.
   */
  file: {
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
    clientDetail: Metadata

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

    /**
     * The WriteStream object that is used to write the file to the disk.
     */
    writeStream: WriteStream
  }
}

export type FileUploadExtendedEvent<Metadata> =
{
  file: FileUploadBaseEvent<Metadata>['file'] & {
    /**
     * The new basename of the file on the server.
     *
     * @param defined if you are letting the module save the file for you
     * @default undefined
     */
    base: string|undefined

    /**
     * The full path at which the uploaded file is saved.
     *
     * @param defined if you are letting the module save the file for you
     * @default undefined
     */
    pathName: string|undefined
  }
}

export type FileUploadProgressEvent<Metadata> =
{
  buffer: Buffer
  file  : FileUploadExtendedEvent<Metadata>['file']
}

export type FileUploadCompleteEvent<Metadata> =
{
  interrupt: boolean
  file: FileUploadExtendedEvent<Metadata>['file']
}

export type FileUploadSavedEvent<Metadata> =
{
  file: FileUploadExtendedEvent<Metadata>['file']
}

export type FileUploadErrorEvent<Metadata> =
{
  memo: string
  error: Error
  file : FileUploadExtendedEvent<Metadata>['file']
}

export type FileInfo<T> = {
  file: {
    name: string,
    mtime: Date,
    encoding: 'text' | 'octet',
    clientDetail: T,
    meta: T,
    id: number,
    size: number,
    bytesLoaded: number,
    success: boolean
  }
}

export declare interface SocketIOFileUploadServer<Metadata>
{
  /**
   * The client has started the upload process, and the server is now processing the request.
   * @param event
   * @param listener
   */
  on(event: 'start', listener: (event: FileUploadBaseEvent<Metadata>) => void): this;

  /**
   * Data has been received from the client.
   * @param event
   * @param listener
   */
  on(event: 'progress', listener: (error: FileUploadProgressEvent<Metadata>) => void): this;

  /**
   * The transmission of a file is complete.
   * @param event
   * @param listener
   */
  on(event: 'complete', listener: (error: FileUploadCompleteEvent<Metadata>) => void): this;

  /**
   * The file has been successfully saved to disk.
   *
   * (In this event, you can safely move the saved file to a new location)
   *
   * It is recommended that you check `event.file.success` to tell whether or not the file was saved without errors.
   * @param event
   * @param listener
   */
  on(event: 'saved', listener: (error: FileUploadSavedEvent<Metadata>) => void): this;

  /**
   * An error was encountered in the saving of the file.
   * @param event
   * @param listener
   */
  on(event: 'error', listener: (error: FileUploadErrorEvent<Metadata>) => void): this;
}

export class SocketIOFileUploadServer<Metadata = unknown> extends EventEmitter
{
  constructor(socket: Socket);

  static router: Router

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
  wrapData: boolean;

  /**
   * Allow user to access to some private function to customize message reception.
   * This is used if you specified wrapData on the client side and have to manually bind message to callback.
   * @default false
   */
  exposePrivateFunction: boolean


  /**
   * Can be overridden to enable async validation and preparing.
   *
   * @param event contains { file: fileInfo }
   * @param callback call it with true to start upload, false to abort
   */
  uploadValidator(event: { file: FileInfo }, callback: (valid: boolean) => void): void

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