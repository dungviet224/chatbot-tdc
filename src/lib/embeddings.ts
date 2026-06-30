/**
 * Embedding engine cho TDConsulting AI
 * Gọi API /v1/embeddings batch với model openrouter/openai/text-embedding-3-large
 */

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
//  Embedding via API (timeout 12s, có retry)
// ========================
async function callEmbedAPI(texts: string[]): Promise<number[][] | null> {
  const API_BASE = process.env.EMBED_API_BASE || 'http://mbasic8.pikamc.vn:25246/v1';
  const API_KEY = process.env.EMBED_API_KEY;
  const EMBED_MODEL = process.env.EMBED_MODEL || 'openrouter/openai/text-embedding-3-large';

  if (!API_KEY) {
    console.warn('[Embedding] Thiếu EMBED_API_KEY trong biến môi trường');
    return null;
  }

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
      signal: AbortSignal.timeout(12000), // 12s timeout
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

/** Gọi API với retry + exponential backoff (tối đa 2 lần thử lại) */
async function callEmbedAPIWithRetry(texts: string[], retries = 2): Promise<number[][] | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await callEmbedAPI(texts);
    if (result) return result;
    if (attempt < retries) {
      const delay = 500 * (attempt + 1); // 500ms, 1000ms
      console.warn(`[Embedding] Retry ${attempt + 1}/${retries} sau ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return null;
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  const result = await callEmbedAPIWithRetry([text]);
  return result?.[0] ?? null;
}

export async function getEmbeddingBatch(texts: string[]): Promise<(number[] | null)[]> {
  const result: (number[] | null)[] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await callEmbedAPIWithRetry(batch);
    if (embeddings) {
      result.push(...embeddings);
    } else {
      console.warn('[Embedding] Batch fail, fallback sequential');
      for (const t of batch) {
        const v = await callEmbedAPIWithRetry([t]);
        result.push(v?.[0] ?? null);
      }
    }
    console.log(`[Embedding] Batch ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length}`);
  }

  return result;
}
