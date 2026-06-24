/**
 * Embedding engine cho TDConsulting AI
 * Gọi API /v1/embeddings batch với model openrouter/openai/text-embedding-3-large
 */

const API_BASE = process.env.EMBED_API_BASE || 'http://mbasic8.pikamc.vn:25246/v1';
const API_KEY = process.env.EMBED_API_KEY || 'sk-987312a0a1689afc-m1wrjj-666571e0';
const EMBED_MODEL = process.env.EMBED_MODEL || 'openrouter/openai/text-embedding-3-large';
const BATCH_SIZE = 20;

export interface EmbeddedChunk {
  id: number;
  content: string;
  source: string;
  embedding: number[];
  embeddingType: 'neural';
  sectionId?: string;
  sectionName?: string;
}

// ========================
//  Cosine Similarity
// ========================
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ========================
//  Embedding via API
// ========================
async function callEmbedAPI(texts: string[]): Promise<number[][] | null> {
  try {
    const res = await fetch(`${API_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: texts.map(t => t.slice(0, 8000)),
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      console.warn(`[Embedding] API fail: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const embeddings: number[][] = data?.data
      ?.sort((a: any, b: any) => a.index - b.index)
      .map((d: any) => d.embedding);

    if (Array.isArray(embeddings) && embeddings.length === texts.length) {
      console.log(`[Embedding] Batch ${texts.length} texts, dim=${embeddings[0].length}`);
      return embeddings;
    }
    return null;
  } catch (e) {
    console.warn('[Embedding] error:', e);
    return null;
  }
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  const result = await callEmbedAPI([text]);
  return result?.[0] ?? null;
}

export async function getEmbeddingBatch(texts: string[]): Promise<(number[] | null)[]> {
  const result: (number[] | null)[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await callEmbedAPI(batch);
    if (embeddings) {
      result.push(...embeddings);
    } else {
      console.warn('[Embedding] Batch fail, fallback sequential');
      for (const t of batch) {
        const v = await callEmbedAPI([t]);
        result.push(v?.[0] ?? null);
      }
    }
    console.log(`[Embedding] Batch ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length}`);
  }

  return result;
}

// ========================
//  Retrieve top-K chunks
// ========================
export function retrieveByEmbedding(
  queryVec: number[],
  chunks: EmbeddedChunk[],
  topK = 5,
  minScore = 0.3
): EmbeddedChunk[] {
  const scored = chunks
    .map((c) => ({ chunk: c, score: cosineSimilarity(queryVec, c.embedding) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map((s) => s.chunk);
}
