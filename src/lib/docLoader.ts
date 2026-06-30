import { EmbeddedChunk, getEmbedding } from './embeddings';
import { supabaseAdmin } from './supabase';

export type { EmbeddedChunk };

export async function getEmbeddingStatus() {
  try {
    // Đếm tổng số chunks trong database
    const { count, error } = await supabaseAdmin
      .from('document_chunks')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    return {
      ready: (count || 0) > 0,
      totalChunks: count || 0,
    };
  } catch (e) {
    console.error('[DocLoader] Lỗi lấy status:', e);
    return { ready: false, totalChunks: 0 };
  }
}

// Hàm này hiện tại không cần nữa do không dùng in-memory cache
export function updateCache(chunks: EmbeddedChunk[]) {
  console.log(`[DocLoader] Cache update ignored (using Supabase pgvector now)`);
}

// Retrieve bằng semantic embedding qua pgvector RPC
export async function retrieveRelevantChunks(
  query: string,
  topK = 8
): Promise<EmbeddedChunk[]> {
  const queryVec = await getEmbedding(query);
  
  if (!queryVec) {
    console.warn('[Retrieval] Không embed được query, trả về rỗng');
    // Nếu không có query vector, fallback lấy đại vài dòng đầu (chống lỗi)
    const { data } = await supabaseAdmin.from('document_chunks').select('*').limit(3);
    return data || [];
  }

  // Chuyển vector thành format chuỗi `[0.1, 0.2, ...]` để truyền vào RPC
  const vectorStr = `[${queryVec.join(',')}]`;

  let { data: results, error } = await supabaseAdmin.rpc('match_document_chunks', {
    query_embedding: vectorStr,
    match_threshold: 0.3,
    match_count: topK
  });

  if (error) {
    console.error('[Retrieval] Lỗi query pgvector:', error);
    return [];
  }

  if (!results || results.length < 3) {
    console.log('[Retrieval] Low results, retry threshold 0.15');
    const { data: fallbackResults } = await supabaseAdmin.rpc('match_document_chunks', {
      query_embedding: vectorStr,
      match_threshold: 0.15,
      match_count: topK
    });
    results = fallbackResults || results || [];
  }

  console.log(`[Retrieval] ${results.length} chunks cho: "${query.substring(0, 40)}"`);

  // Map lại cấu trúc cho khớp với code cũ
  return results.map((r: any) => ({
    id: r.id,
    content: r.content,
    source: r.source,
    embedding: [], // không cần trả về vector thật cho frontend/AI đỡ tốn băng thông
    embeddingType: 'neural',
    sectionId: r.section_id,
    sectionName: r.section_name
  }));
}
