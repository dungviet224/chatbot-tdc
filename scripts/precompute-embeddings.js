/**
 * Build-time script: extract PDF → chunk → call API embedding → save JSON
 * Output: public/embeddings-data.json (commit to git, Vercel reads it)
 * Chạy: node scripts/precompute-embeddings.js
 *
 * Yêu cầu: file public/sotaynhanvien.pdf tồn tại
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const API_BASE = process.env.EMBED_API_BASE || 'http://mbasic8.pikamc.vn:25246/v1';
const API_KEY = process.env.EMBED_API_KEY || 'sk-987312a0a1689afc-m1wrjj-666571e0';
const EMBED_MODEL = process.env.EMBED_MODEL || 'openrouter/openai/text-embedding-3-large';
const BATCH_SIZE = 20;
const CHUNK_MAX_SIZE = 450;
const CHUNK_OVERLAP = 80;

async function callEmbedAPI(texts) {
  const fetch = (await import('node-fetch')).default;
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
  });
  if (!res.ok) throw new Error(`API fail: ${res.status}`);
  const data = await res.json();
  if (!data?.data) throw new Error('Embedding API trả về null');
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

function chunkText(fullText, maxSize = 450, overlap = 80) {
  const paras = fullText.split(/\n{2,}/).filter(p => p.trim().length > 10);
  const chunks = [];
  let buf = '';
  for (const p of paras) {
    const c = buf + (buf ? '\n\n' : '') + p;
    if (c.length >= maxSize && buf) {
      chunks.push(buf.trim());
      const words = buf.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(overlap / 5)).join(' ');
      buf = overlapWords + '\n\n' + p;
    } else {
      buf = c;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  const seen = new Set();
  return chunks.filter(c => c.trim().length > 30).filter(c => {
    const k = c.substring(0, 50);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

(async () => {
  const pdfPath = path.join(ROOT, 'public', 'sotaynhanvien.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ Không tìm thấy ${pdfPath}. Đặt file PDF vào public/ trước.`);
    process.exit(1);
  }

  console.log('[Precompute] Reading PDF...');
  const buf = fs.readFileSync(pdfPath);
  const pdf = require('pdf-parse');
  const data = await pdf(buf);
  const pages = data.text.split('\f').filter(p => p.trim().length > 0);
  console.log(`[Precompute] ${pages.length} pages`);

  // Chunk text from all pages
  const allText = pages.join('\n\n');
  const rawChunks = chunkText(allText, CHUNK_MAX_SIZE, CHUNK_OVERLAP);
  console.log(`[Precompute] ${rawChunks.length} chunks`);

  // Embed via API
  console.log('[Precompute] Embedding via API...');
  const embedded = [];
  for (let i = 0; i < rawChunks.length; i += BATCH_SIZE) {
    const batch = rawChunks.slice(i, i + BATCH_SIZE);
    const vecs = await callEmbedAPI(batch);
    for (let j = 0; j < batch.length; j++) {
      embedded.push({
        id: i + j,
        content: rawChunks[i + j],
        source: 'SoTayNhanVien_TDConsulting',
        embedding: vecs[j],
        embeddingType: 'neural',
      });
    }
    console.log(`[Precompute] Batch ${Math.min(i + BATCH_SIZE, rawChunks.length)}/${rawChunks.length}`);
  }

  // Save
  const outPath = path.join(ROOT, 'public', 'embeddings-data.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(embedded), 'utf-8');
  console.log(`[Precompute] ✅ Saved ${embedded.length} chunks, dim=${embedded[0]?.embedding.length} -> ${outPath}`);
})();
