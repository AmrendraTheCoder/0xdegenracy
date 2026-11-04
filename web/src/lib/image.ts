// Client-side: validate, center-crop to square, resize to 256x256, re-encode as WebP (PNG fallback).
// Re-encoding also strips EXIF (GPS etc.) from phone photos.

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const SIZE = 256;

export async function prepareImage(file: File): Promise<{ blob: Blob; previewUrl: string }> {
  if (!ACCEPTED.includes(file.type)) throw new Error("Use a PNG, JPG or WebP image");
  if (file.size > 12 * 1024 * 1024) throw new Error("That image is huge. Keep it under 12 MB");

  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();

  const blob =
    (await toBlob(canvas, "image/webp", 0.85)) ?? (await toBlob(canvas, "image/png"));
  if (!blob) throw new Error("Could not process image");
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("Processed image is over 2 MB");
  return { blob, previewUrl: URL.createObjectURL(blob) };
}

function toBlob(c: HTMLCanvasElement, type: string, q?: number) {
  return new Promise<Blob | null>((res) => c.toBlob((b) => res(b && b.type === type ? b : null), type, q));
}
