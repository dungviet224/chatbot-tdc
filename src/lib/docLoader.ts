/**
 * Document loader + chunker + embedding pipeline
 * Đọc SoTayNhanVien.docx → extract → chunk → embed (API) → cache
 */

import mammoth from 'mammoth';
import path from 'path';
import fs from 'fs';
import {
  EmbeddedChunk,
  getNeuralEmbedding,
  getNeuralEmbeddingBatch,
  retrieveByEmbedding,
} from './embeddings';

export type { EmbeddedChunk };

// In-memory cache
let cachedEmbeddedChunks: EmbeddedChunk[] | null = null;
let isEmbedding = false;

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

// Extract text từ DOCX
async function extractDocxText(): Promise<string> {
  const filePath = path.join(process.cwd(), 'public', 'sotaynhanvien.docx');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Không tìm thấy file: ${filePath}`);
  }

  const { value: html } = await mammoth.convertToHtml({ path: filePath });

  const text = html
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/tr>/gi, '')
    .replace(/<t[dh][^>]*>/gi, '')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<h([1-6])[^>]*>/gi, '\n\n### ')
    .replace(/<\/h[1-6]>/gi, ' ###\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<strong[^>]*>/gi, '**')
    .replace(/<\/strong>/gi, '**')
    .replace(/<em[^>]*>/gi, '')
    .replace(/<\/em>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/(\|\s*){3,}/g, ' | ')
    .replace(/\|\s*\n/g, '\n')
    .replace(/\n\s*\|\s*\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  return text;
}

// Chunk text theo sections
function chunkTextBySections(fullText: string, maxChunkSize = 450, overlap = 80): string[] {
  const lines = fullText.split('\n').map(s => s.trimEnd());
  const sections: { heading: string; content: string[] }[] = [];
  let currentHeading = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isHeading =
      /^###/.test(trimmed) ||
      /^PHẦN\s+\d+/i.test(trimmed) ||
      /^\d+\.\d+[\.\s]/.test(trimmed) ||
      /^[A-ZĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬ\s]{10,}$/.test(trimmed);

    if (isHeading && currentLines.length > 0) {
      sections.push({ heading: currentHeading, content: currentLines });
      currentLines = [];
      currentHeading = trimmed.replace(/^###\s*/, '').replace(/\s*###$/, '').trim();
    } else if (isHeading) {
      currentHeading = trimmed.replace(/^###\s*/, '').replace(/\s*###$/, '').trim();
    } else {
      currentLines.push(trimmed);
    }
  }
  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, content: currentLines });
  }

  const chunks: string[] = [];

  for (const section of sections) {
    const sectionPrefix = section.heading ? `[${section.heading}]\n` : '';
    const bodyText = section.content.join('\n').trim();
    if (!bodyText) continue;

    const fullChunk = (sectionPrefix + bodyText).trim();
    if (fullChunk.length <= maxChunkSize) {
      chunks.push(fullChunk);
      continue;
    }

    const paragraphs = bodyText.split(/\n{2,}/).filter(p => p.trim().length > 10);
    let buffer = sectionPrefix;

    for (const para of paragraphs) {
      const candidate = buffer + (buffer === sectionPrefix ? '' : '\n\n') + para;
      if (candidate.length >= maxChunkSize && buffer !== sectionPrefix) {
        chunks.push(buffer.trim());
        const lastWords = buffer.split(/\s+/).slice(-Math.ceil(overlap / 5)).join(' ');
        buffer = sectionPrefix + lastWords + '\n\n' + para;
      } else {
        buffer = candidate;
      }
    }

    if (buffer.trim() && buffer.trim() !== sectionPrefix.trim()) {
      chunks.push(buffer.trim());
    }
  }

  const seen = new Set<string>();
  return chunks
    .filter(c => c.trim().length > 30)
    .filter(c => {
      const key = c.substring(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Main: Load + Embed (API)
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

  if (isEmbedding) {
    while (isEmbedding) {
      await new Promise((r) => setTimeout(r, 200));
    }
    return {
      chunks: cachedEmbeddedChunks!,
      embeddingType: 'neural',
      totalChunks: cachedEmbeddedChunks!.length,
    };
  }

  isEmbedding = true;
  console.log('[DocLoader] Bắt đầu đọc và embedding Sổ Tay Nhân Viên...');

  try {
    const fullText = await extractDocxText();
    console.log(`[DocLoader] Extracted: ${fullText.length} ký tự`);

    const rawChunks = chunkTextBySections(fullText, 450, 80);
    console.log(`[DocLoader] Tạo được ${rawChunks.length} chunks`);
    rawChunks.forEach((c, i) => {
      console.log(`  Chunk ${i + 1} (${c.length} chars): ${c.substring(0, 60).replace(/\n/g, ' ')}...`);
    });

    // Embed via API (batch, text-embedding-3-large)
    console.log('[DocLoader] Embedding via API (batch)...');
    const embedded: EmbeddedChunk[] = [];

    // Tạo mảng index gốc + text để batch
    const embedInputs = rawChunks.map((c) => c);
    const vectors = await getNeuralEmbeddingBatch(embedInputs);

    for (let i = 0; i < rawChunks.length; i++) {
      const vec = vectors[i];
      if (!vec) {
        throw new Error(`Embedding failed at chunk ${i}`);
      }
      embedded.push({
        id: i,
        content: rawChunks[i],
        source: 'SoTayNhanVien_TDConsulting',
        embedding: vec,
        embeddingType: 'neural',
      });
    }

    cachedEmbeddedChunks = embedded;
    console.log(`[DocLoader] ✅ Xong! ${embedded.length} chunks, dim=${embedded[0]?.embedding.length ?? 0}`);

    return {
      chunks: cachedEmbeddedChunks,
      embeddingType: 'neural',
      totalChunks: cachedEmbeddedChunks.length,
    };
  } finally {
    isEmbedding = false;
  }
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
