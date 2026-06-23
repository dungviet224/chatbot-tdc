/**
 * Re-embed: parse DOCX → chunk → API embedding → save JSON + HTML
 * Khi upload file mới, sinh file HTML công khai có anchor theo section
 */

import path from 'path';
import fs from 'fs';
import { getConfig } from './cfg-store';

const BATCH_SIZE = 20;
const CHUNK_MAX_SIZE = 450;
const CHUNK_OVERLAP = 80;

async function callEmbedAPI(texts: string[], apiBase: string, apiKey: string, model: string): Promise<number[][] | null> {
  try {
    const res = await fetch(`${apiBase}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts.map(t => t.slice(0, 8000)),
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const embeddings: number[][] = data?.data
      ?.sort((a: any, b: any) => a.index - b.index)
      .map((d: any) => d.embedding);
    if (Array.isArray(embeddings) && embeddings.length === texts.length) return embeddings;
    return null;
  } catch {
    return null;
  }
}

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

async function embedChunks(chunks: string[], apiBase: string, apiKey: string, model: string): Promise<number[][]> {
  const embedded: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const vecs = await callEmbedAPI(batch, apiBase, apiKey, model);
    if (!vecs) throw new Error(`Embedding batch ${Math.floor(i / BATCH_SIZE)} fail`);
    embedded.push(...vecs);
    console.log(`[Reembed] Batch ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}`);
  }
  return embedded;
}

export interface ReembedResult {
  chunks: number;
  dim: number;
  file: string;
}

// Map sectionId → sectionName từ HTML headings
function extractSectionMap(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const regex = /<h([1-6])([^>]*)id="(section-\d+)"([^>]*)>([^<]+)<\/h[1-6]>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    map.set(match[3], match[5].trim());
  }
  return map;
}

export interface SectionMeta {
  id: string;
  name: string;
}

// Style cho HTML công khai
const HTML_STYLE = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
.highlight {
  animation: hl-fade 3s ease-out forwards;
  background: linear-gradient(120deg, rgba(212,34,123,0.12) 0%, transparent 100%);
  border-radius: 4px; padding: 0 4px; margin: 0 -4px;
}
@keyframes hl-fade {
  0% { background: linear-gradient(120deg, rgba(212,34,123,0.25) 0%, transparent 100%); }
  100% { background: linear-gradient(120deg, rgba(212,34,123,0.06) 0%, transparent 100%); }
}
`;

export async function reembedFromDocx(docxPath: string): Promise<ReembedResult> {
  const cfg = getConfig();
  const apiBase = cfg.apiBase || process.env.EMBED_API_BASE || 'http://mbasic8.pikamc.vn:25246/v1';
  const apiKey = cfg.apiKey || process.env.EMBED_API_KEY || 'sk-987312a0a1689afc-m1wrjj-666571e0';
  const embedModel = cfg.embedModel || process.env.EMBED_MODEL || 'openrouter/openai/text-embedding-3-large';

  console.log('[Reembed] Parsing DOCX...');
  const mammoth = require('mammoth');
  const { value: html } = await mammoth.convertToHtml({ path: docxPath });

  // Thêm id="section-N" vào các thẻ heading
  let sectionIndex = 0;
  const annotatedHtml = html.replace(
    /<(h[1-6])([^>]*)>/gi,
    (match: string, tag: string, attrs: string) => {
      const id = `section-${sectionIndex++}`;
      // Nếu đã có id thì ko thay
      if (/id=/.test(attrs)) return match;
      return `<${tag}${attrs} id="${id}">`;
    }
  );

  // Lưu section map
  const sectionMap = extractSectionMap(annotatedHtml);

  // Ghi file HTML công khai
  const htmlPath = path.join(process.cwd(), 'public', 'sotaynhanvien.html');
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
// Highlight section nếu URL có hash
if (location.hash) {
  setTimeout(() => {
    const el = document.querySelector(location.hash);
    if (el) {
      el.classList.add('highlight');
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 300);
}
</script>
</body>
</html>`;
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, fullHtml, 'utf-8');
  console.log(`[Reembed] ✅ Saved HTML -> ${htmlPath}`);

  // Chèn marker section vào text trước khi strip HTML
  let sectionedHtml = annotatedHtml;
  // Thay heading có id bằng marker
  sectionedHtml = sectionedHtml.replace(
    /<h([1-6])([^>]*)id="(section-\d+)"([^>]*)>/gi,
    (match: string, _tag: string, _before: string, id: string, _after: string) => {
      return `⸻SECTION:${id}⸻\n${match}`;
    }
  );

  // Strip HTML tags → text
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
  const vectors = await embedChunks(chunkTexts, apiBase, apiKey, embedModel);

  const embedded = rawChunks.map((item, i) => {
    // Lấy sectionId đầu tiên của chunk
    const firstSectionId = item.sectionIds[0] || '';
    const sectionName = firstSectionId ? (sectionMap.get(firstSectionId) || '') : '';
    return {
      id: i,
      content: item.chunk,
      source: 'SoTayNhanVien_TDConsulting',
      embedding: vectors[i],
      embeddingType: 'neural' as const,
      sectionId: firstSectionId || undefined,
      sectionName: sectionName || undefined,
    };
  });

  const outPath = path.join(process.cwd(), 'public', 'embeddings-data.json');
  fs.writeFileSync(outPath, JSON.stringify(embedded), 'utf-8');

  console.log(`[Reembed] ✅ Saved ${embedded.length} chunks -> ${outPath}`);

  return {
    chunks: embedded.length,
    dim: vectors[0]?.length || 0,
    file: outPath,
  };
}
