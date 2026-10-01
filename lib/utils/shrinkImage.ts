// Browser-only. Phone photos are several MB, but server actions cap request bodies (and Vercel caps
// a function request at about 4.5MB), so photos are shrunk before they're sent or uploaded: longest
// edge 1600px, JPEG. Plenty for progress photos, meal photos and chat.
export const MAX_PHOTO_EDGE = 1600;

export async function shrinkImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that photo'))), 'image/jpeg', 0.82)
  );
}

// For a File going into a FormData: returns a smaller JPEG File, or the original if it can't be
// decoded (the server still accepts anything small enough).
export async function shrinkImageFile(file: File): Promise<File> {
  try {
    const blob = await shrinkImage(file);
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
