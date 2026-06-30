/**
 * Re-embed: parse DOCX → chunk → API embedding → save JSON + HTML
 * Cập nhật: Lưu thẳng lên Supabase Postgres (pgvector)
 */

import { getConfig } from './cfg-store';
import { loadOutlineItems, saveOutlineItems, OutlineItem } from './outline-store';
import { getEmbeddingBatch } from './embeddings';
import { supabaseAdmin } from './supabase';
import { uploadFileToSupabase } from './file-store';

const CHUNK_MAX_SIZE = 450;
const CHUNK_OVERLAP = 80;

function chunkText(fullText: string): { chunk: string; sectionIds: string[] }[] {
  const lines = fullText.split('\n').map(s => s.trimEnd());
  const sections: { heading: string; content: string[]; sectionIds: string[] }[] = [];
  let h = '', cl: string[] = [], sids: string[] = [];
  
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // Detect section marker: ⸻SECTION:section-X⸻
    const markerMatch = t.match(/⸻SECTION:([^⸻]+)⸻/);
    if (markerMatch) {
      if (cl.length > 0) { sections.push({ heading: h, content: cl, sectionIds: [...sids] }); cl = []; }
      sids.push(markerMatch[1]);
      h = sids.map(s => s.replace('section-', '#')).join(', ');
      continue;
    }
    const isH = /^###/.test(t) || /^PHẦN\s+\d+/i.test(t) || /^\d+\.\d+[\.\s]/.test(t)
      || /^[A-ZĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬ\s]{10,}$/.test(t);
    if (isH && cl.length > 0) { sections.push({ heading: h, content: cl, sectionIds: [...sids] }); cl = []; h = t.replace(/^###\s*/, '').replace(/\s*###$/, '').trim(); }
    else if (isH) { h = t.replace(/^###\s*/, '').replace(/\s*###$/, '').trim(); }
    else cl.push(t);
  }
  if (cl.length > 0) sections.push({ heading: h, content: cl, sectionIds: [...sids] });

  const result: { chunk: string; sectionIds: string[] }[] = [];
  for (const s of sections) {
    const prefix = s.heading ? `[${s.heading}]\n` : '';
    const body = s.content.join('\n').trim();
    if (!body) continue;
    const full = (prefix + body).trim();
    if (full.length <= CHUNK_MAX_SIZE) { result.push({ chunk: full, sectionIds: s.sectionIds }); continue; }
    const paras = body.split(/\n{2,}/).filter(p => p.trim().length > 10);
    let buf = prefix;
    for (const p of paras) {
      const c = buf + (buf === prefix ? '' : '\n\n') + p;
      if (c.length >= CHUNK_MAX_SIZE && buf !== prefix) { result.push({ chunk: buf.trim(), sectionIds: s.sectionIds }); buf = prefix + buf.split(/\s+/).slice(-Math.ceil(CHUNK_OVERLAP / 5)).join(' ') + '\n\n' + p; }
      else buf = c;
    }
    if (buf.trim() && buf.trim() !== prefix.trim()) result.push({ chunk: buf.trim(), sectionIds: s.sectionIds });
  }
  const seen = new Set<string>();
  return result.filter(c => c.chunk.trim().length > 30).filter(c => { const k = c.chunk.substring(0, 50); if (seen.has(k)) return false; seen.add(k); return true; });
}

export interface ReembedResult {
  chunks: number;
  dim: number;
}

// Map sectionId → sectionName từ HTML headings
function extractSectionMap(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const regex = /<h([1-6])([^>]*)id="(section-\d+)"([^>]*)>(.*?)<\/h[1-6]>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const rawText = match[5];
    const cleanText = rawText.replace(/<[^>]+>/g, '').trim();
    map.set(match[3], cleanText);
  }
  return map;
}

// Style cho HTML công khai
const HTML_STYLE = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Segoe UI Symbol', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
  font-size: 16px; line-height: 1.7;
  color: #1c0a13; background: #fcf2f7;
  max-width: 860px; margin: 0 auto; padding: 32px 20px;
}
h1, h2, h3, h4 { font-family: 'Outfit', 'Inter', sans-serif; color: #b8146a; margin-top: 32px; margin-bottom: 12px; }
h1 { font-size: 28px; border-bottom: 2px solid #f5a3cc; padding-bottom: 8px; }
h2 { font-size: 22px; }
h3 { font-size: 18px; }
p { margin-bottom: 12px; }
ul, ol { margin: 8px 0 12px 24px; }
li { margin-bottom: 4px; }
strong { color: #d4227b; }
hr { border: none; border-top: 1px solid #f5a3cc; margin: 32px 0; }
table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
th, td { border: 1px solid #d4a0b8; padding: 10px 12px; text-align: left; vertical-align: top; }
th { background: linear-gradient(135deg, #d4227b, #e8559f); color: #fff; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.3px; }
tr:nth-child(even) td { background: rgba(212, 34, 123, 0.04); }
tr:hover td { background: rgba(212, 34, 123, 0.08); }
.highlight { animation: hl-fade 3s ease-out forwards; background: linear-gradient(120deg, rgba(212,34,123,0.12) 0%, transparent 100%); border-radius: 4px; padding: 0 4px; margin: 0 -4px; }
@keyframes hl-fade { 0% { background: linear-gradient(120deg, rgba(212,34,123,0.25) 0%, transparent 100%); } 100% { background: linear-gradient(120deg, rgba(212,34,123,0.06) 0%, transparent 100%); } }
`;

export async function reembedFromDocx(buffer: Buffer, filename: string = 'sotaynhanvien.docx'): Promise<ReembedResult> {
  console.log('[Reembed] Parsing DOCX buffer...');
  const mammoth = require('mammoth');
  const { value: html } = await mammoth.convertToHtml({ buffer });

  // Thêm id="section-N" vào các thẻ heading
  let sectionIndex = 0;
  const annotatedHtml = html.replace(
    /<(h[1-6])([^>]*)>/gi,
    (match: string, tag: string, attrs: string) => {
      const id = `section-${sectionIndex++}`;
      if (/id=/.test(attrs)) return match;
      return `<${tag}${attrs} id="${id}">`;
    }
  );

  const sectionMap = extractSectionMap(annotatedHtml);

  // Lưu file HTML lên Supabase Storage (thay thế ghi đĩa)
  const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sổ Tay Nhân Viên TDConsulting</title>
<style>${HTML_STYLE}</style>
</head>
<body>
${annotatedHtml}
<script>
if (location.hash) {
  setTimeout(() => {
    const el = document.querySelector(location.hash);
    if (el) { el.classList.add('highlight'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }, 300);
}
</script>
</body>
</html>`;
  
  const htmlFilename = filename.replace(/\.docx$/i, '.html');
  await uploadFileToSupabase(htmlFilename, Buffer.from(fullHtml, 'utf-8'), 'text/html; charset=utf-8');
  console.log(`[Reembed] ✅ Uploaded HTML to Supabase Storage`);

  let sectionedHtml = annotatedHtml.replace(
    /<h([1-6])([^>]*)id="(section-\d+)"([^>]*)>/gi,
    (match: string, _tag: string, _before: string, id: string, _after: string) => {
      return `⸻SECTION:${id}⸻\n${match}`;
    }
  );

  const text = sectionedHtml
    .replace(/<tr[^>]*>/gi, '\n').replace(/<\/tr>/gi, '')
    .replace(/<t[dh][^>]*>/gi, '').replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<h([1-6])[^>]*>/gi, '\n\n### ').replace(/<\/h[1-6]>/gi, ' ###\n')
    .replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<strong[^>]*>/gi, '**').replace(/<\/strong>/gi, '**')
    .replace(/<em[^>]*>/gi, '').replace(/<\/em>/gi, '')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n)))
    .replace(/(\|\s*){3,}/g, ' | ').replace(/\|\s*\n/g, '\n')
    .replace(/\n\s*\|\s*\n/g, '\n').replace(/[ \t]+/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n').trim();

  const rawChunks = chunkText(text);
  console.log(`[Reembed] ${rawChunks.length} chunks`);

  console.log('[Reembed] Embedding via API...');
  const chunkTexts = rawChunks.map(c => c.chunk);
  const vectors = await getEmbeddingBatch(chunkTexts);

  // Lưu vào Postgres (pgvector)
  console.log('[Reembed] Lưu vào Vector Database...');
  
  // 1. Xóa toàn bộ dữ liệu cũ
  await supabaseAdmin.from('document_chunks').delete().neq('id', -1);

  // 2. Chèn dữ liệu mới (lưu ý: Postgres vector nhận chuỗi '[0.1, 0.2]')
  const dbRows = rawChunks.map((item, i) => {
    const lastSectionId = item.sectionIds[item.sectionIds.length - 1] || '';
    const sectionName = lastSectionId ? (sectionMap.get(lastSectionId) || '') : '';
    const vec = vectors[i];
    return {
      content: item.chunk,
      source: 'SoTayNhanVien_TDConsulting',
      embedding: vec ? `[${vec.join(',')}]` : null, // Chuyển vector thành chuỗi cho pgvector
      embedding_type: 'neural',
      section_id: lastSectionId || null,
      section_name: sectionName || null,
    };
  }).filter(row => row.embedding !== null); // Loại bỏ chunk lỗi

  // Delete old chunks before inserting new ones to avoid duplicate old data
  const { error: delError } = await supabaseAdmin.from('document_chunks').delete().neq('id', 0); // Delete all rows
  if (delError) {
    console.error('[Reembed] Lỗi xóa chunks cũ:', delError);
  } else {
    console.log('[Reembed] ✅ Deleted old chunks');
  }

  // Bulk insert, có thể chia nhỏ batch nếu mảng quá lớn
  const BATCH_INSERT_SIZE = 100;
  for (let i = 0; i < dbRows.length; i += BATCH_INSERT_SIZE) {
    const batch = dbRows.slice(i, i + BATCH_INSERT_SIZE);
    const { error } = await supabaseAdmin.from('document_chunks').insert(batch);
    if (error) {
      console.error('[Reembed] Lỗi chèn chunk vào DB:', error);
      throw new Error('Lỗi chèn dữ liệu vector vào database');
    }
  }

  console.log(`[Reembed] ✅ Saved ${dbRows.length} chunks to Database`);

  // -- Bóc tách Outline từ sectionMap và lưu vào Database --
  const existingOutline = await loadOutlineItems();
  const existingMap = new Map<string, OutlineItem>();
  existingOutline.forEach(item => existingMap.set(item.text.trim().toLowerCase(), item));

  const newOutline: OutlineItem[] = [];
  let secIdx = 1;
  let lastKnownPage = 1;
  
  sectionMap.forEach((name, id) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const lowerName = cleanName.toLowerCase();
    
    let page = lastKnownPage;
    if (existingMap.has(lowerName)) {
      page = existingMap.get(lowerName)!.page;
    }
    
    lastKnownPage = page;

    newOutline.push({
      id: `sec-${secIdx}`,
      text: cleanName,
      level: cleanName.startsWith('PHẦN') ? 1 : 2,
      page: page
    });
    secIdx++;
  });

  if (newOutline.length > 0) {
    await saveOutlineItems(newOutline);
    console.log(`[Reembed] ✅ Saved ${newOutline.length} items to Outline DB`);
  }

  return {
    chunks: dbRows.length,
    dim: vectors[0]?.length || 0,
  };
}
