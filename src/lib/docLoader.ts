import path from 'path';
import fs from 'fs';
import {
  EmbeddedChunk,
  getEmbedding,
  retrieveByEmbedding,
} from './embeddings';
import { getEmbeddingsJsonPath } from './file-store';

export type { EmbeddedChunk };

// In-memory cache
let cachedEmbeddedChunks: EmbeddedChunk[] | null = null;

// Precomputed data path (use writable dir)
const DATA_FILE = getEmbeddingsJsonPath();

export function getCachedChunks(): EmbeddedChunk[] | null {
  return cachedEmbeddedChunks;
}

export function getEmbeddingStatus() {
  if (!cachedEmbeddedChunks) return { ready: false, totalChunks: 0 };
  return {
    ready: true,
    totalChunks: cachedEmbeddedChunks.length,
  };
}

// Cập nhật cache — gọi sau khi admin upload file mới
export function updateCache(chunks: EmbeddedChunk[]) {
  cachedEmbeddedChunks = chunks;
  console.log(`[DocLoader] Cache updated: ${chunks.length} chunks`);
}

// Load embedding data từ file JSON (đã precompute)
function loadEmbeddingData(): EmbeddedChunk[] | null {
  try {
    // Ưu tiên writable dir (/tmp trên Vercel)
    const writablePath = getEmbeddingsJsonPath();
    if (fs.existsSync(writablePath)) {
      const raw = fs.readFileSync(writablePath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0 && data[0].embedding) {
        console.log(`[DocLoader] ✅ Loaded ${data.length} chunks from writable dir`);
        return data;
      }
    }

    // Fallback public/ (committed trong git, tồn tại sau deploy)
    const publicPath = path.join(process.cwd(), 'public', 'embeddings-data.json');
    if (fs.existsSync(publicPath)) {
      const raw = fs.readFileSync(publicPath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0 && data[0].embedding) {
        console.log(`[DocLoader] ✅ Loaded ${data.length} chunks from public/`);
        return data;
      }
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
  totalChunks: number;
}> {
  if (cachedEmbeddedChunks) {
    return {
      chunks: cachedEmbeddedChunks,
      totalChunks: cachedEmbeddedChunks.length,
    };
  }

  const precomputed = loadEmbeddingData();
  if (precomputed) {
    cachedEmbeddedChunks = precomputed;
    return {
      chunks: cachedEmbeddedChunks,
      totalChunks: cachedEmbeddedChunks.length,
    };
  }

  throw new Error('Không tìm thấy file embeddings-data.json. Chạy `node scripts/precompute-embeddings.js` trước.');
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

  const queryVec = await getEmbedding(query);
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
