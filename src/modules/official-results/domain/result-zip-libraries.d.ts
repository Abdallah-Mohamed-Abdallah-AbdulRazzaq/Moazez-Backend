declare module 'yazl' {
  import type { Readable } from 'node:stream';
  export class ZipFile {
    readonly outputStream: Readable;
    addBuffer(
      bytes: Buffer,
      path: string,
      options?: { mtime?: Date; compress?: boolean },
    ): void;
    end(): void;
  }
}

declare module 'yauzl' {
  import type { Readable } from 'node:stream';
  export interface Entry {
    fileName: string;
    generalPurposeBitFlag: number;
    crc32: number;
    compressedSize: number;
    uncompressedSize: number;
    compressionMethod: number;
  }
  export interface ZipFile {
    entryCount: number;
    readEntry(): void;
    close(): void;
    on(event: 'entry', callback: (entry: Entry) => void): ZipFile;
    once(event: 'end' | 'error', callback: () => void): ZipFile;
    openReadStream(
      entry: Entry,
      callback: (error: Error | null, stream?: Readable) => void,
    ): void;
  }
  export function fromBuffer(
    bytes: Buffer,
    options: {
      lazyEntries: true;
      validateEntrySizes: true;
      strictFileNames: true;
    },
    callback: (error: Error | null, archive?: ZipFile) => void,
  ): void;
}
