/**
 * Re-embed: parse DOCX → chunk → API embedding → save JSON
 * Dùng khi admin upload file sổ tay mới
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

function chunkText(fullText: string): string[] {
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
    if (full.length <= CHUNK_MAX_SIZE) { chunks.push(full); continue; }
    const paras = body.split(/\n{2,}/).filter(p => p.trim().length > 10);
    let buf = prefix;
    for (const p of paras) {
      const c = buf + (buf === prefix ? '' : '\n\n') + p;
      if (c.length >= CHUNK_MAX_SIZE && buf !== prefix) { chunks.push(buf.trim()); buf = prefix + buf.split(/\s+/).slice(-Math.ceil(CHUNK_OVERLAP / 5)).join(' ') + '\n\n' + p; }
      else buf = c;
    }
    if (buf.trim() && buf.trim() !== prefix.trim()) chunks.push(buf.trim());
  }
  const seen = new Set<string>();
  return chunks.filter(c => c.trim().length > 30).filter(c => { const k = c.substring(0, 50); if (seen.has(k)) return false; seen.add(k); return true; });
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

export async function reembedFromDocx(docxPath: string): Promise<ReembedResult> {
  const cfg = getConfig();
  const apiBase = cfg.apiBase || process.env.EMBED_API_BASE || 'http://mbasic8.pikamc.vn:25246/v1';
  const apiKey = cfg.apiKey || process.env.EMBED_API_KEY || 'sk-987312a0a1689afc-m1wrjj-666571e0';
  const embedModel = cfg.embedModel || process.env.EMBED_MODEL || 'openrouter/openai/text-embedding-3-large';

  console.log('[Reembed] Parsing DOCX...');
  const mammoth = require('mammoth');
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
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n)))
    .replace(/(\|\s*){3,}/g, ' | ').replace(/\|\s*\n/g, '\n')
    .replace(/\n\s*\|\s*\n/g, '\n').replace(/[ \t]+/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n').trim();

  const rawChunks = chunkText(text);
  console.log(`[Reembed] ${rawChunks.length} chunks`);

  console.log('[Reembed] Embedding via API...');
  const vectors = await embedChunks(rawChunks, apiBase, apiKey, embedModel);

  const embedded = rawChunks.map((content, i) => ({
    id: i,
    content,
    source: 'SoTayNhanVien_TDConsulting',
    embedding: vectors[i],
    embeddingType: 'neural' as const,
  }));

  const outPath = path.join(process.cwd(), 'public', 'embeddings-data.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(embedded), 'utf-8');

  console.log(`[Reembed] ✅ Saved ${embedded.length} chunks -> ${outPath}`);

  return {
    chunks: embedded.length,
    dim: vectors[0]?.length || 0,
    file: outPath,
  };
}
