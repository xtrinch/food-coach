const TARGET_PHOTO_TYPE = "image/jpeg";
const TARGET_PHOTO_QUALITY = 0.8;
const MAX_PHOTO_DIMENSION = 1200;

const hasDomSupport =
  typeof document !== "undefined" &&
  typeof document.createElement === "function" &&
  typeof Image !== "undefined";

export async function fileToDataUrl(file: File): Promise<string> {
  if (typeof FileReader === "undefined") {
    throw new Error("FileReader not available");
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unsupported image format"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

const loadImageElement = async (src: string): Promise<HTMLImageElement> => {
  if (!hasDomSupport) {
    throw new Error("Image decoding not supported in this environment");
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
};

const getScaledDimensions = (width: number, height: number) => {
  const largestSide = Math.max(width, height);
  if (largestSide <= MAX_PHOTO_DIMENSION) {
    return { width, height };
  }
  const scale = MAX_PHOTO_DIMENSION / largestSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const renderToCanvasDataUrl = (img: HTMLImageElement, width: number, height: number) => {
  if (!hasDomSupport) {
    throw new Error("Canvas not supported in this environment");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable");
  }
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL(TARGET_PHOTO_TYPE, TARGET_PHOTO_QUALITY);
};

export async function compressImageFile(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  return await compressImageDataUrl(dataUrl);
}

export async function compressImageDataUrl(dataUrl: string): Promise<string> {
  if (!hasDomSupport) {
    return dataUrl;
  }
  const img = await loadImageElement(dataUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error("Invalid image dimensions");
  }
  const needsResize = Math.max(width, height) > MAX_PHOTO_DIMENSION;
  const needsFormat = !dataUrl.startsWith(`data:${TARGET_PHOTO_TYPE}`);
  if (!needsResize && !needsFormat) {
    return dataUrl;
  }
  const scaled = getScaledDimensions(width, height);
  return renderToCanvasDataUrl(img, scaled.width, scaled.height);
}

export const imageCompressionConfig = {
  TARGET_PHOTO_TYPE,
  TARGET_PHOTO_QUALITY,
  MAX_PHOTO_DIMENSION,
};
