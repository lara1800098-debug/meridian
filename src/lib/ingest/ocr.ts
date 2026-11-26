/**
 * OCR fallback for scanned PDFs (Arabic + English) using local Tesseract — nothing leaves the server.
 * Requires the `pdftoppm` (poppler-utils) and `tesseract` binaries with the `ara` language pack (installed in the Docker image).
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const MAX_OCR_PAGES = 40;

export async function ocrAvailable() {
  try { const { stdout, stderr } = await run('tesseract', ['--list-langs']); return /\bara\b/.test(stdout + stderr); } catch { return false; }
}

export async function ocrPdf(pdfPath: string): Promise<{ text: string; pages: number } | null> {
  if (!(await ocrAvailable())) return null;
  const dir = await mkdtemp(path.join(tmpdir(), 'meridian-ocr-'));
  try {
    await run('pdftoppm', ['-r', '200', '-gray', '-png', '-l', String(MAX_OCR_PAGES), pdfPath, path.join(dir, 'p')], { timeout: 180_000 });
    const pages = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort();
    const out: string[] = [];
    for (const p of pages) {
      const { stdout } = await run('tesseract', [path.join(dir, p), 'stdout', '-l', 'ara+eng', '--psm', '3'], { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
      out.push(stdout);
    }
    return { text: out.join('\n\n'), pages: pages.length };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
