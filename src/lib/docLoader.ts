/**
 * Document loader — load precomputed embeddings từ JSON file
 * Được sinh bởi `scripts/precompute-embeddings.js` lúc build
 * Không cần parse DOCX hay gọi API embedding ở runtime
 */

import path from 'path';
import fs from 'fs';
import {
  EmbeddedChunk,
  getNeuralEmbedding,
  retrieveByEmbedding,
} from './embeddings';

export type { EmbeddedChunk };

// In-memory cache
let cachedEmbeddedChunks: EmbeddedChunk[] | null = null;

// Precomputed data path
const DATA_FILE = path.join(process.cwd(), 'public', 'embeddings-data.json');

export function getCachedChunks(): EmbeddedChunk[] | null {
  return cachedEmbeddedChunks;
}

export function getEmbeddingStatus() {
  if (!cachedEmbeddedChunks) return { ready: false, totalChunks: 0, embeddingType: 'none' };
  return {
    ready: true,
    totalChunks: cachedEmbeddedChunks.length,
    embeddingType: 'neural',
  };
}

// Load embedding data từ file JSON (đã precompute)
function loadEmbeddingData(): EmbeddedChunk[] | null {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);
    // Validate
    if (Array.isArray(data) && data.length > 0 && data[0].embedding) {
      console.log(`[DocLoader] ✅ Loaded ${data.length} precomputed chunks, dim=${data[0].embedding.length}`);
      return data;
    }
    return null;
  } catch (e) {
    console.warn('[DocLoader] Load precomputed data fail:', e);
    return null;
  }
}

// Main: Load từ JSON (cực nhanh, ko gọi API)
export async function loadAndEmbedDocument(): Promise<{
  chunks: EmbeddedChunk[];
  embeddingType: 'neural';
  totalChunks: number;
}> {
  if (cachedEmbeddedChunks) {
    return {
      chunks: cachedEmbeddedChunks,
      embeddingType: 'neural',
      totalChunks: cachedEmbeddedChunks.length,
    };
  }

  // Try load precomputed
  const precomputed = loadEmbeddingData();
  if (precomputed) {
    cachedEmbeddedChunks = precomputed;
    return {
      chunks: cachedEmbeddedChunks,
      embeddingType: 'neural',
      totalChunks: cachedEmbeddedChunks.length,
    };
  }

  // Fallback: nếu ko có file precompute (dev), parse DOCX + gọi API
  const { default: mammoth } = await import('mammoth');
  console.log('[DocLoader] No precomputed data, parsing DOCX + API embedding...');

  const docxPath = path.join(process.cwd(), 'public', 'sotaynhanvien.docx');
  const { value: html } = await mammoth.convertToHtml({ path: docxPath });

  const text = html
    .replace(/<tr[^>]*>/gi, '\n').replace(/<\/tr>/gi, '')
    .replace(/<t[dh][^>]*>/gi, '').replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<h([1-6])[^>]*>/gi, '\n\n### ').replace(/<\/h[1-6]>/gi, ' ###\n')
    .replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<strong[^>]*>/gi, '**').replace(/<\/strong>/gi, '**')
    .replace(/<em[^>]*>/gi, '').replace(/<\/em>/gi, '')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/(\|\s*){3,}/g, ' | ').replace(/\|\s*\n/g, '\n')
    .replace(/\n\s*\|\s*\n/g, '\n').replace(/[ \t]+/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n').trim();

  function chunkText(fullText: string, maxSize = 450, overlap = 80): string[] {
    const lines = fullText.split('\n').map(s => s.trimEnd());
    const sections: { heading: string; content: string[] }[] = [];
    let h = '', cl: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      const isH = /^###/.test(t) || /^PHẦN\s+\d+/i.test(t) || /^\d+\.\d+[\.\s]/.test(t)
        || /^[A-ZĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬ\s]{10,}$/.test(t);
      if (isH && cl.length > 0) { sections.push({ heading: h, content: cl }); cl = []; h = t.replace(/^###\s*/, '').replace(/\s*###$/, '').trim(); }
      else if (isH) { h = t.replace(/^###\s*/, '').replace(/\s*###$/, '').trim(); }
      else cl.push(t);
    }
    if (cl.length > 0) sections.push({ heading: h, content: cl });

    const chunks: string[] = [];
    for (const s of sections) {
      const prefix = s.heading ? `[${s.heading}]\n` : '';
      const body = s.content.join('\n').trim();
      if (!body) continue;
      const full = (prefix + body).trim();
      if (full.length <= maxSize) { chunks.push(full); continue; }
      const paras = body.split(/\n{2,}/).filter(p => p.trim().length > 10);
      let buf = prefix;
      for (const p of paras) {
        const c = buf + (buf === prefix ? '' : '\n\n') + p;
        if (c.length >= maxSize && buf !== prefix) { chunks.push(buf.trim()); buf = prefix + buf.split(/\s+/).slice(-Math.ceil(overlap / 5)).join(' ') + '\n\n' + p; }
        else buf = c;
      }
      if (buf.trim() && buf.trim() !== prefix.trim()) chunks.push(buf.trim());
    }
    const seen = new Set<string>();
    return chunks.filter(c => c.trim().length > 30).filter(c => { const k = c.substring(0, 50); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  const rawChunks = chunkText(text, 450, 80);
  console.log(`[DocLoader] ${rawChunks.length} chunks`);

  // Embed via API
  const { getNeuralEmbeddingBatch: batchEmbed } = await import('./embeddings');
  const vectors = await batchEmbed(rawChunks);
  const embedded: EmbeddedChunk[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    if (!vectors[i]) throw new Error(`Embedding failed at chunk ${i}`);
    embedded.push({ id: i, content: rawChunks[i], source: 'SoTayNhanVien_TDConsulting', embedding: vectors[i]!, embeddingType: 'neural' });
  }

  cachedEmbeddedChunks = embedded;
  console.log(`[DocLoader] ✅ ${embedded.length} chunks, dim=${embedded[0]?.embedding.length}`);
  return { chunks: cachedEmbeddedChunks, embeddingType: 'neural', totalChunks: cachedEmbeddedChunks.length };
}

// Retrieve bằng semantic embedding
export async function retrieveRelevantChunks(
  query: string,
  topK = 8
): Promise<EmbeddedChunk[]> {
  if (!cachedEmbeddedChunks || cachedEmbeddedChunks.length === 0) {
    await loadAndEmbedDocument();
  }

  const chunks = cachedEmbeddedChunks!;

  const queryVec = await getNeuralEmbedding(query);
  if (!queryVec) {
    console.warn('[Retrieval] Không embed được query, trả top 3 default');
    return chunks.slice(0, 3);
  }

  let results = retrieveByEmbedding(queryVec, chunks, topK, 0.3);

  if (results.length < 3) {
    console.log('[Retrieval] Low results, retry threshold 0.15');
    results = retrieveByEmbedding(queryVec, chunks, topK, 0.15);
  }

  if (results.length === 0) {
    console.log('[Retrieval] Không tìm thấy, dùng top 3');
    return chunks.slice(0, 3);
  }

  console.log(`[Retrieval] ${results.length} chunks cho: "${query.substring(0, 40)}"`);
  return results;
}
