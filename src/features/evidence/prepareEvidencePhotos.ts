export type EvidenceStamp = { personName: string; subject: string; latitude: number; longitude: number; accuracy: number | null };
const maxSide = 1024; const maxBytes = 700 * 1024;
const stampText = (stamp: EvidenceStamp) => { const when = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(new Date()); const gps = `${stamp.latitude.toFixed(6)}, ${stamp.longitude.toFixed(6)}${stamp.accuracy ? ` (±${Math.round(stamp.accuracy)}m)` : ''}`; return [`${stamp.subject} · ${stamp.personName}`, when, `GPS: ${gps}`]; };
const encode = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));

async function bitmap(file: File) {
  if ('createImageBitmap' in window) return createImageBitmap(file);
  const url = URL.createObjectURL(file); try { const image = new Image(); image.src = url; await image.decode(); return image; } finally { URL.revokeObjectURL(url); }
}

/** One normal encode and at most one fallback encode; old code could encode each image four times. */
export async function prepareEvidencePhoto(file: File, stamp: EvidenceStamp): Promise<File> {
  const image = await bitmap(file); const sourceWidth = 'naturalWidth' in image ? image.naturalWidth : image.width; const sourceHeight = 'naturalHeight' in image ? image.naturalHeight : image.height; const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(sourceWidth * scale)); canvas.height = Math.max(1, Math.round(sourceHeight * scale)); const context = canvas.getContext('2d', { alpha: false }); if (!context) throw new Error('Thiết bị không hỗ trợ xử lý ảnh.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height); if ('close' in image && typeof image.close === 'function') image.close();
  const lines = stampText(stamp); const fontSize = Math.max(14, Math.round(canvas.width / 48)); const padding = Math.round(fontSize * .7); const lineHeight = Math.round(fontSize * 1.35); const boxHeight = padding * 2 + lines.length * lineHeight; context.fillStyle = 'rgba(0,0,0,.67)'; context.fillRect(0, canvas.height - boxHeight, canvas.width, boxHeight); context.font = `600 ${fontSize}px Arial,sans-serif`; context.fillStyle = '#fff'; context.textBaseline = 'top'; lines.forEach((line, index) => context.fillText(line, padding, canvas.height - boxHeight + padding + index * lineHeight));
  let blob = await encode(canvas, .7); if (blob && blob.size > maxBytes) blob = await encode(canvas, .52); if (!blob) throw new Error('Không thể nén ảnh.'); return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp', lastModified: Date.now() });
}

export async function prepareEvidencePhotos(files: File[], stamp: EvidenceStamp) { const results: File[] = []; for (const file of files) { results.push(await prepareEvidencePhoto(file, stamp)); await new Promise<void>((resolve) => window.setTimeout(resolve, 0)); } return results; }
