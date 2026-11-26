import { describe, expect, it } from 'vitest';
import { ocrAvailable, ocrPdf } from '@/lib/ingest/ocr';
import { extractTender } from '@/lib/engine/tender';

const has = await ocrAvailable();
describe.skipIf(!has)('OCR for scanned Arabic tenders (needs tesseract + ara)', () => {
  it('reads an image-only Arabic tender and extracts key fields', async () => {
    const o = await ocrPdf('tests/fixtures/scanned-tender-ar.pdf');
    expect(o!.text).toContain('مركز اتصال');
    const f = extractTender(o!.text);
    expect(f.submission_deadline.value).toBe('15/01/2027');
    expect(f.local_content.value).toBeTruthy();
    expect(f.channels.value).toContain('whatsapp');
  }, 60_000);
});
