/** Builds tests/fixtures/scanned-tender-ar.pdf: an image-only (no text layer) Arabic tender page, to test OCR. Fictional content. */
import { chromium } from 'playwright';
const html = `<html dir="rtl"><body style="font-family:'Noto Naskh Arabic','DejaVu Sans',sans-serif;font-size:30px;padding:60px;width:1100px;line-height:1.9">
<h2>كراسة الشروط — خدمات مركز الاتصال</h2>
<p>الجهة المتعاقدة: هيئة الخدمات الصحية الخيالية</p>
<p>نطاق العمل: تشغيل مركز اتصال للمتعاملين باللغتين العربية والإنجليزية عبر الهاتف والبريد الإلكتروني وواتساب.</p>
<p>مستوى الخدمة: الرد على 80% من المكالمات خلال 20 ثانية.</p>
<p>التوطين: يلتزم المزود بنسب التوطين المعتمدة.</p>
<p>مدة العقد: ثلاث سنوات.</p>
<p>آخر موعد لتقديم العروض: 15/01/2027</p></body></html>`;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1240, height: 1754 } });
await p.setContent(html);
const png = await p.screenshot({ fullPage: true });
const p2 = await b.newPage();
await p2.setContent(`<html><body style="margin:0"><img src="data:image/png;base64,${png.toString('base64')}" style="width:100%"></body></html>`);
await p2.pdf({ path: 'tests/fixtures/scanned-tender-ar.pdf', format: 'A4', printBackground: true });
await b.close();
console.log('✔ tests/fixtures/scanned-tender-ar.pdf');
