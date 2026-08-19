export type EvidenceStamp = { personName: string; subject: string; latitude: number; longitude: number; accuracy: number | null };

const maxSide = 1280;
const maxBytes = 850 * 1024;

function stampText(stamp: EvidenceStamp) {
  const when = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
  const gps = `${stamp.latitude.toFixed(6)}, ${stamp.longitude.toFixed(6)}${stamp.accuracy ? ` (±${Math.round(stamp.accuracy)}m)` : ''}`;
  return [`${stamp.subject} · ${stamp.personName}`, when, `GPS: ${gps}`];
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode(); return image;
  } finally { URL.revokeObjectURL(url); }
}

/** Compresses and visibly stamps an evidence image in the browser before upload. */
export async function prepareEvidencePhoto(file: File, stamp: EvidenceStamp): Promise<File> {
  const image = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale)); const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Thiết bị không hỗ trợ xử lý ảnh.');
  context.drawImage(image, 0, 0, width, height);
  const lines = stampText(stamp); const fontSize = Math.max(15, Math.round(width / 48)); const padding = Math.round(fontSize * 0.7); const lineHeight = Math.round(fontSize * 1.35); const boxHeight = padding * 2 + lines.length * lineHeight;
  context.fillStyle = 'rgba(0, 0, 0, 0.67)'; context.fillRect(0, height - boxHeight, width, boxHeight);
  context.font = `600 ${fontSize}px Arial, sans-serif`; context.fillStyle = '#ffffff'; context.textBaseline = 'top';
  lines.forEach((line, index) => context.fillText(line, padding, height - boxHeight + padding + index * lineHeight));
  let quality = 0.75; let blob: Blob | null = null;
  while (quality >= 0.45) { blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality)); if (blob && blob.size <= maxBytes) break; quality -= 0.1; }
  if (!blob) throw new Error('Không thể nén ảnh.');
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp', lastModified: Date.now() });
}

export async function prepareEvidencePhotos(files: File[], stamp: EvidenceStamp) { return Promise.all(files.map((file) => prepareEvidencePhoto(file, stamp))); }
