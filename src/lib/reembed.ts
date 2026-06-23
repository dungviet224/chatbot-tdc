/**
 * Re-embed: parse PDF → chunk → API embedding → save JSON
 * Khi upload file mới, sinh embeddings từ PDF
 */

import path from 'path';
import fs from 'fs';
import { getConfig } from './cfg-store';
import { getEmbeddingsJsonPath, getPdfPath } from './file-store';

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

function chunkText(fullText: string): string[] {
  const paras = fullText.split(/\n{2,}/).filter(p => p.trim().length > 10);
  const chunks: string[] = [];
  let buf = '';
  for (const p of paras) {
    const c = buf + (buf ? '\n\n' : '') + p;
    if (c.length >= CHUNK_MAX_SIZE && buf) {
      chunks.push(buf.trim());
      // overlap: lấy từ cuối buf
      const words = buf.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(CHUNK_OVERLAP / 5)).join(' ');
      buf = overlapWords + '\n\n' + p;
    } else {
      buf = c;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  const seen = new Set<string>();
  return chunks.filter(c => c.length > 30).filter(c => {
    const k = c.substring(0, 50);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function parsePdfPages(pdfPath: string): Promise<{ text: string; pageNum: number }[]> {
  const pdf = require('pdf-parse');
  const buf = fs.readFileSync(pdfPath);
  const data = await pdf(buf);
  const pages = data.text.split('\f').filter((p: string) => p.trim().length > 0);
  return pages.map((text: string, i: number) => ({ text: text.trim(), pageNum: i + 1 }));
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

export async function reembedFromPdf(pdfPath: string): Promise<ReembedResult> {
  const cfg = getConfig();
  const apiBase = cfg.apiBase || process.env.EMBED_API_BASE || 'http://mbasic8.pikamc.vn:25246/v1';
  const apiKey = cfg.apiKey || process.env.EMBED_API_KEY || 'sk-987312a0a1689afc-m1wrjj-666571e0';
  const embedModel = cfg.embedModel || process.env.EMBED_MODEL || 'openrouter/openai/text-embedding-3-large';

  console.log('[Reembed] Parsing PDF...');
  const pages = await parsePdfPages(pdfPath);
  console.log(`[Reembed] ${pages.length} pages`);

  // Chunk mỗi page riêng rẽ, map pageNum → chunks
  const allChunks: { chunk: string; pageNum: number }[] = [];
  for (const page of pages) {
    const pageChunks = chunkText(page.text);
    for (const c of pageChunks) {
      allChunks.push({ chunk: c, pageNum: page.pageNum });
    }
  }
  console.log(`[Reembed] ${allChunks.length} chunks`);

  if (allChunks.length === 0) {
    throw new Error('PDF không có nội dung để chunk');
  }

  console.log('[Reembed] Embedding via API...');
  const chunkTexts = allChunks.map(c => c.chunk);
  const vectors = await embedChunks(chunkTexts, apiBase, apiKey, embedModel);

  const embedded = allChunks.map((item, i) => ({
    id: i,
    content: item.chunk,
    source: 'SoTayNhanVien_TDConsulting',
    embedding: vectors[i],
    embeddingType: 'neural' as const,
    sourcePage: item.pageNum,
  }));

  const outPath = getEmbeddingsJsonPath();
  fs.writeFileSync(outPath, JSON.stringify(embedded), 'utf-8');

  // Copy sang public/ để persist
  try {
    const publicJson = path.join(process.cwd(), 'public', 'embeddings-data.json');
    fs.writeFileSync(publicJson, JSON.stringify(embedded), 'utf-8');
  } catch { /* Vercel read-only */ }

  console.log(`[Reembed] ✅ Saved ${embedded.length} chunks, dim=${vectors[0]?.length || 0} -> ${outPath}`);

  return {
    chunks: embedded.length,
    dim: vectors[0]?.length || 0,
    file: outPath,
  };
}
