export declare enum TarFileType {
	/** '\0' or '0' */
	File = 0,
	/** '5' */
	Dir = 53
}

export interface ITarFileInfo {
    name: string;
    type: TarFileType;
    size: number;
    headerOffset: number;
}
export interface ITarWriteItem {
    name: string;
    type: TarFileType;
    data: ArrayBuffer | Promise<ArrayBuffer> | null;
    size: number;
    opts?: Partial<ITarWriteOptions>;
}
export interface ITarWriteOptions {
    uid: number;
    gid: number;
    mode: number;
    mtime: number;
    user: string;
    group: string;
}


export declare class TarReader {
    #private;
    fileInfos: ITarFileInfo[];
    static load(file: ArrayBuffer | Uint8Array | Blob): Promise<TarReader>;
    constructor(buffer: ArrayBuffer, fileInfos: ITarFileInfo[]);
    getTextFile(filename: string): string;
    getFileBlob(filename: string, mimetype?: string): Blob;
}
export declare function loadTarFile(buffer: ArrayBuffer): ITarFileInfo[];
export declare function readFileBlob(buffer: ArrayBuffer, offset: number, size: number, mimetype: string): Blob;
export declare function readTextFile(buffer: ArrayBuffer, offset: number, size: number): string;

export interface ITarFileInfo {
    name: string;
    type: TarFileType;
    size: number;
    headerOffset: number;
}
export interface ITarWriteItem {
    name: string;
    type: TarFileType;
    data: ArrayBuffer | Promise<ArrayBuffer> | null;
    size: number;
    opts?: Partial<ITarWriteOptions>;
}
export interface ITarWriteOptions {
    uid: number;
    gid: number;
    mode: number;
    mtime: number;
    user: string;
    group: string;
}

export declare const utf8Encode: (input: string) => Uint8Array;
export declare const utf8Decode: (input: Uint8Array) => string;
export declare function getArrayBuffer(file: string | ArrayBuffer | Uint8Array | Blob): ArrayBuffer | Promise<ArrayBuffer>;

export declare class TarWriter {
	#private;
	constructor();
	addFile(name: string, file: string | ArrayBuffer | Uint8Array | Blob, opts?: Partial<ITarWriteOptions>): void;
	addFolder(name: string, opts?: Partial<ITarWriteOptions>): void;
	write(): Promise<Blob>;
}
export declare function createBuffer(fileData: ITarWriteItem[]): ArrayBuffer;
