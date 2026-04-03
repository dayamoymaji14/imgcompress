declare module "pako" {
  export interface DeflateOptions {
    level?: number;
  }

  export function deflate(data: Uint8Array, options?: DeflateOptions): Uint8Array;
}

declare module "upng-js" {
  interface UpngDecodedImage {
    width: number;
    height: number;
  }

  const UPNG: {
    decode: (buffer: ArrayBuffer) => UpngDecodedImage;
    toRGBA8: (image: UpngDecodedImage) => ArrayBuffer[];
    encode: (
      buffers: ArrayBuffer[],
      width: number,
      height: number,
      colors?: number,
      delays?: number[]
    ) => ArrayBuffer;
  };

  export default UPNG;
}
