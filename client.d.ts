import { Router }      from 'express';
import { WriteStream } from 'fs';
import { Socket }      from 'socket.io-client';

export type SocketIOFileUploadClientOptions =
{
  /**
   * Define if data should be sent as a string or as a buffer.
   * (`false` reads files as an octet array)
   * @default false
   */
  useText: boolean

  /**
   * Set to `true` transmits binary files as Base 64 data, `false` transmit the data as a serialized octet array (not recommended).
   * @experimental this method is experimental, and has been deprecated in `Socket.IO` File Upload as of version 0.3 in favor of instance.useBuffer
   * @warning this option is not supported by Firefox.
   * @default false
   */
  serializedOctets: boolean

  /**
   * Set to `true` to send using buffer and `false` to transmits files a base 64-encoded strings.
   * @default true
   */
  useBuffer: boolean

  /**
   * The size of the file "chunks" to be loaded at a time.
   *
   * Setting this parameter to 0 disables chunking of files.
   * @default 102400 (100kb)
   */
  chunkSize: number

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
  wrapData: boolean

	/**
	 * Allow user to access to some private function to customize message reception.
	 * This is used if you specified wrapOptions on the client side and have to manually bind message to callback.
   * @default false
	 */
  exposePrivateFunction: boolean
}

export type SocketIOFileUploadClientChoose =
{
  files: FileList
}

export type SocketIOFileUploadClientStart<Metadata> =
{
  file: File & {
    meta: Metadata
  }
}

export type SocketIOFileUploadClientProgress<Metadata> =
{
  file: SocketIOFileUploadClientStart<Metadata>

  /**
   * The number of bytes that have been loaded into memory.
   */
  bytesLoaded: number

  /**
   * The filename to which the server saved the file.
   */
  name: string
}

export type SocketIOFileUploadClientLoad<Metadata> =
{
  file: SocketIOFileUploadClientStart<Metadata>

  /**
   * An instance of a W3C FileReader object.
   */
  reader: FileReader

  /**
   * The filename to which the server saved the file.
   */
  name: string
}

export type SocketIOFileUploadClientComplete<Metadata> =
{
  file: SocketIOFileUploadClientStart<Metadata>

  /**
   * `true` if the server-side implementation ran without error; `false` otherwise.
   */
  success: boolean

  /**
   * The value of file.clientDetail on the server side. Properties may be added to this object literal during any event on the server side.
   */
  detail: Metadata
}

export type SocketIOFileUploadClientError<Metadata> =
{
  file: SocketIOFileUploadClientStart<Metadata>

  /**
   * The error message.
   */
  message: string

  /**
   * The error code, if available.
   */
  code: string
}

export declare interface SocketIOFileUploadClient<Metadata>
{
  addEventListener(type: string, callback: EventListenerOrEventListenerObject|null, options?: boolean|AddEventListenerOptions): void;

  /**
   * The user has chosen files to upload, through any of the channels you have implemented. If you want to cancel the upload, make your callback return `false`.
   * @param event
   * @param listener
   * @param options
   */
  addEventListener(type: 'choose', callback: (event: SocketIOFileUploadClientChoose) => void|boolean, options?: boolean|AddEventListenerOptions): void;
  // addEventListener(type: string, callback: ((event: any) => void)|null, options?: boolean|AddEventListenerOptions): void
  /**
   * This event is fired immediately following the choose event, but once per file. If you want to cancel the upload for this individual file, make your callback return `false`.
   * @param event
   * @param listener
   * @param options
   */
  addEventListener(type: 'start', callback: (event: SocketIOFileUploadClientStart<Metadata>) => void|boolean, options?: AddEventListenerOptions|boolean): void;

  /**
   * Part of the file has been loaded from the file system and ready to be transmitted via `Socket.IO`. This event can be used to make an upload progress bar.
   * @param event
   * @param listener
   * @param options
   */
  addEventListener(type: 'progress', callback: (event: SocketIOFileUploadClientProgress<Metadata>) => void, options?: AddEventListenerOptions|boolean): void;

  /**
   * A file has been loaded into an instance of the HTML5 `FileReader` object and has been transmitted through `Socket.IO`. We are awaiting a response from the server about whether the upload was successful; when we receive this response, a `complete` event will be dispatched.
   * @param event
   * @param listener
   * @param options
   */
  addEventListener(type: 'load', callback: (event: SocketIOFileUploadClientLoad<Metadata>) => void, options?: AddEventListenerOptions|boolean): void;

  /**
   * The server has received our file.
   * @param event
   * @param listener
   * @param options
   */
  addEventListener(type: 'complete', callback: (event: SocketIOFileUploadClientComplete<Metadata>) => void, options?: AddEventListenerOptions|boolean): void;

  /**
   * The server encountered an error.
   * @param event
   * @param listener
   * @param options
   */
  addEventListener(type: 'error', callback: (event: SocketIOFileUploadClientError<Metadata>) => void, options?: AddEventListenerOptions|boolean): void;
}

export class SocketIOFileUploadClient<Metadata = unknown> implements EventTarget
{
  constructor(socket: Socket, options?: SocketIOFileUploadClientOptions);

  /**
   * Resets file input elements to their empty state after the user selects a file. If you do not reset the file input elements, if the user selects a file with the same name as the previous file, then the second file may not be uploaded.
   * @default true
   */
  resetFileInputs: boolean

  /**
   * The maximum size of a file that can be uploaded, in bytes.
   * @default null
   */
  maxFileSize: number|null

  /**
   * Use a file input to activate this instance of the file uploader.
   * @param element
   * @returns void
   */
  listenOnInput(inpt: HTMLInputElement): void

  /**
   * Accept files dropped on an element and upload them using this instance of the file uploader.
   * @param element
   * @returns void
   */
  listenOnDrop(div: HTMLElement): void

  /**
   * Use a submitButton to upload files from the field given.
   * @param submitButton the button that the user has to click to start the upload.
   * @param input the field with the data to upload.
   * @returns void
   */
  listenOnSubmit(submitButton: HTMLButtonElement, input: HTMLInputElement): void

  /**
   * Use a submitButton to upload files from the fields given.
   * @param submitButton the button that the user has to click to start the upload.
   * @param array list of fields with the files to upload.
   * @returns void
   */
  listenOnArraySubmit(submitButton: HTMLButtonElement, array: HTMLInputElement[]): void

	/**
	 * Display a dialog box for the user to select a file.  The file will then
	 * be uploaded using this instance of SocketIOFileUpload.
	 *
	 * This method works in all current browsers except Firefox, though Opera
	 * requires that the input element be visible.
	 */
  prompt(): void

  /**
   * Submit files at arbitrary time.
   * @param files
   */
  submitFiles(files: FileList|File[]): void

  /**
	 * Destroy an instance of Socket.IO file upload (i.e., unbind events and
	 * relieve memory).
	 *
	 * IMPORTANT: To finish the memory relief process, set all external
	 * references to this instance of SIOFU (including the reference used to
	 * call this destroy function) to null.
   */
  destroy(): void

  //------------------------------------
  // NOTE Implementation of EventTarget
  //------------------------------------
  dispatchEvent(event: Event): boolean
  removeEventListener(type: 'choose' | 'start' | 'progress' | 'load' | 'complete' | 'error', callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions | undefined): void
}

export default SocketIOFileUploadClient;