// Saving progress photos from the browser. The photos are signed Storage URLs, fetched as blobs so the
// browser downloads them instead of navigating to them.

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not fetch the photo');
  return res.blob();
}

export async function downloadPhoto(url: string, filename: string): Promise<void> {
  triggerDownload(await fetchBlob(url), filename);
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  return createImageBitmap(await fetchBlob(url));
}

// Before and after side by side in one JPEG, each labelled with its date. Throws if the browser cannot draw
// the images (callers fall back to two separate downloads).
export async function downloadSideBySide(
  before: { url: string; label: string },
  after: { url: string; label: string },
  filename: string
): Promise<void> {
  const [a, b] = await Promise.all([loadBitmap(before.url), loadBitmap(after.url)]);
  const height = Math.min(1600, Math.max(a.height, b.height));
  const widthOf = (img: ImageBitmap) => Math.round((img.width / img.height) * height);
  const wa = widthOf(a);
  const wb = widthOf(b);
  const bar = 64;
  const canvas = document.createElement('canvas');
  canvas.width = wa + wb;
  canvas.height = height + bar;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(a, 0, bar, wa, height);
  ctx.drawImage(b, wa, bar, wb, height);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 32px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Before  ${before.label}`, 16, bar / 2);
  ctx.fillText(`After  ${after.label}`, wa + 16, bar / 2);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Could not build the image');
  triggerDownload(blob, filename);
}
