import { deflate } from "pako";
import UPNG from "upng-js";

import type {
  CompressionOptions,
  CompressionResult,
  SupportedMimeType
} from "./types";

const PNG_MIME_TYPE = "image/png";
const JPEG_MIME_TYPE = "image/jpeg";
const WEBP_MIME_TYPE = "image/webp";
const PNG_SAMPLE_SIZE = 64 * 1024;

interface LoadedImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

type CanvasSurface = HTMLCanvasElement | OffscreenCanvas;

export async function compressFile(
  file: File,
  options: CompressionOptions
): Promise<CompressionResult> {
  switch (options.mimeType) {
    case PNG_MIME_TYPE:
      return compressPng(file, options.quality);
    case JPEG_MIME_TYPE:
    case WEBP_MIME_TYPE:
      return compressCanvasImage(file, options.mimeType, options.quality);
    default:
      throw new Error("Unsupported file type.");
  }
}

export function resolveSupportedMimeType(
  file: Pick<File, "type" | "name">
): SupportedMimeType | null {
  const normalizedType = file.type.toLowerCase();

  if (
    normalizedType === PNG_MIME_TYPE ||
    normalizedType === JPEG_MIME_TYPE ||
    normalizedType === WEBP_MIME_TYPE
  ) {
    return normalizedType;
  }

  const normalizedName = file.name.toLowerCase();

  if (normalizedName.endsWith(".png")) {
    return PNG_MIME_TYPE;
  }

  if (normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) {
    return JPEG_MIME_TYPE;
  }

  if (normalizedName.endsWith(".webp")) {
    return WEBP_MIME_TYPE;
  }

  return null;
}

async function compressPng(
  file: File,
  quality: number
): Promise<CompressionResult> {
  const sourceBuffer = await file.arrayBuffer();

  try {
    const decodedImage = UPNG.decode(sourceBuffer);
    const rgbaFrames = UPNG.toRGBA8(decodedImage);
    const firstFrame = rgbaFrames[0];

    if (!firstFrame) {
      throw new Error("This PNG file does not contain image data.");
    }

    const rgba = new Uint8Array(firstFrame);
    const colors = mapQualityToPaletteSize(quality, rgba);

    await yieldToTask();

    const encodedBuffer = UPNG.encode(
      [sliceToArrayBuffer(rgba)],
      decodedImage.width,
      decodedImage.height,
      colors
    );
    const blob = new Blob([encodedBuffer], { type: PNG_MIME_TYPE });

    return buildCompressionResult(file, blob);
  } catch (error) {
    if (error instanceof Error && error.message === "This PNG file does not contain image data.") {
      throw error;
    }

    throw new Error("This PNG file could not be decoded.");
  }
}

async function compressCanvasImage(
  file: File,
  mimeType: SupportedMimeType,
  quality: number
): Promise<CompressionResult> {
  const imageSource = await loadImageSource(file);
  const surface = createCanvasSurface(imageSource.width, imageSource.height);

  try {
    const context = surface.getContext("2d");

    if (!context) {
      throw new Error("Canvas rendering is unavailable in this browser.");
    }

    context.drawImage(imageSource.source, 0, 0, imageSource.width, imageSource.height);

    await yieldToTask();

    const blob = await canvasSurfaceToBlob(surface, mimeType, normalizeQuality(quality));

    if (blob.type && blob.type !== mimeType) {
      throw new Error(`This browser cannot export ${formatLabelForMimeType(mimeType)} images.`);
    }

    return buildCompressionResult(file, blob);
  } finally {
    imageSource.dispose();
    destroyCanvasSurface(surface);
  }
}

async function loadImageSource(file: File): Promise<LoadedImageSource> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image"
      });

      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close()
      };
    } catch {
      // Fall through to the HTMLImageElement path for broader browser coverage.
    }
  }

  return loadImageElement(file);
}

function loadImageElement(file: File): Promise<LoadedImageSource> {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = (): void => {
      URL.revokeObjectURL(imageUrl);
    };

    image.decoding = "async";
    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: cleanup
      });
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("This image file could not be decoded."));
    };
    image.src = imageUrl;
  });
}

function createCanvasSurface(width: number, height: number): CanvasSurface {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function destroyCanvasSurface(surface: CanvasSurface): void {
  if (isOffscreenCanvas(surface)) {
    return;
  }

  surface.width = 0;
  surface.height = 0;
}

function canvasSurfaceToBlob(
  surface: CanvasSurface,
  mimeType: string,
  quality: number
): Promise<Blob> {
  if (isOffscreenCanvas(surface)) {
    return surface.convertToBlob({
      type: mimeType,
      quality
    });
  }

  return new Promise((resolve, reject) => {
    surface.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("The browser could not export this image."));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

function isOffscreenCanvas(surface: CanvasSurface): surface is OffscreenCanvas {
  return typeof OffscreenCanvas !== "undefined" && surface instanceof OffscreenCanvas;
}

function buildCompressionResult(file: File, blob: Blob): CompressionResult {
  if (blob.size >= file.size) {
    return {
      blob: file,
      compressedSize: file.size,
      reductionPercent: 0,
      note: "Already optimized"
    };
  }

  const reductionPercent = ((file.size - blob.size) / file.size) * 100;

  return {
    blob,
    compressedSize: blob.size,
    reductionPercent
  };
}

function normalizeQuality(quality: number): number {
  return Math.min(1, Math.max(0.01, quality / 100));
}

function mapQualityToPaletteSize(quality: number, rgba: Uint8Array): number {
  const baseColors = Math.round(16 + (240 * quality) / 100);
  const sample = rgba.subarray(0, Math.min(rgba.byteLength, PNG_SAMPLE_SIZE));
  const entropyRatio = deflate(sample, { level: 6 }).byteLength / Math.max(sample.byteLength, 1);

  if (entropyRatio < 0.16) {
    return Math.max(16, Math.round(baseColors * 0.5));
  }

  if (entropyRatio < 0.3) {
    return Math.max(24, Math.round(baseColors * 0.7));
  }

  return Math.min(256, baseColors);
}

function sliceToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function formatLabelForMimeType(mimeType: SupportedMimeType): string {
  switch (mimeType) {
    case PNG_MIME_TYPE:
      return "PNG";
    case JPEG_MIME_TYPE:
      return "JPEG";
    case WEBP_MIME_TYPE:
      return "WebP";
  }
}

function yieldToTask(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}
