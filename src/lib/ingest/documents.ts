import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const MAX_UPLOAD = 20 * 1024 * 1024;
const ALLOWED: Record<string, string> = { 'application/pdf': 'pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'text/plain': 'txt' };

/** Validates type by magic bytes (not just extension), stores privately outside /public, returns extracted text. */
export async function storeAndExtract(file: File) {
  if (file.size > MAX_UPLOAD) throw new Error('File too large (max 20 MB)');
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = buf.subarray(0, 5).toString() === '%PDF-' ? 'pdf' : buf[0] === 0x50 && buf[1] === 0x4b ? 'docx' : ALLOWED[file.type] === 'txt' || /\.txt$/i.test(file.name) ? 'txt' : null;
  if (!kind) throw new Error('Unsupported file type. Use PDF, DOCX or TXT.');
  const dir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const stored = path.join(dir, `${randomUUID()}.${kind}`);
  await writeFile(stored, buf, { mode: 0o600 });
  let text = '';
  if (kind === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const p = new PDFParse({ data: buf });
    text = (await p.getText()).text ?? '';
    await p.destroy?.();
  } else if (kind === 'docx') {
    const mammoth = await import('mammoth');
    text = (await mammoth.extractRawText({ buffer: buf })).value;
  } else text = buf.toString('utf8');
  text = text.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  // Virus scanning: if clamd is configured (CLAMAV_HOST), scan here. Not available by default — documented in README.
  return { stored, kind, text, scanned: kind === 'pdf' && text.length < 200 };
}
