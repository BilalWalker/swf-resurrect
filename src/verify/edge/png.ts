/** PNG decode/encode over the pngjs sync API (design: edge). */
import { PNG } from 'pngjs';
import type { RgbaImage } from '../core/pixelDiff';

/** Decodes a PNG buffer to RGBA8. Throws if the buffer is not a valid PNG. */
export function decodePng(buffer: Buffer): RgbaImage {
  const png = PNG.sync.read(buffer);
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length),
  };
}

/** Encodes an RGBA8 image as a PNG buffer. */
export function encodePng(image: RgbaImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.length);
  return PNG.sync.write(png);
}
