'use client';

/**
 * Convert a still image File to WebP in the browser (via canvas) before upload
 * — our own free "auto WebP", no CDN needed. Skips GIFs (to keep animation),
 * already-WebP images and non-images, and falls back to the original file if
 * conversion fails or doesn't actually shrink it.
 */
export async function imageToWebp(file: File, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/webp') {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^./\\]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp' });
  } catch {
    return file;
  }
}
