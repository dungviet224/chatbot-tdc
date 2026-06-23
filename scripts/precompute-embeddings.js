/**
 * Build-time script: extract DOCX → chunk → call API embedding → save JSON
 * Output: public/embeddings-data.json (commit to git, Vercel reads it)
 * Chạy: node scripts/precompute-embeddings.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.resolve(__dirname, '..'); // project root (chatbot-tdc/)

const API_BASE = process.env.EMBED_API_BASE || 'http://mbasic8.pikamc.vn:25246/v1';
const API_KEY = process.env.EMBED_API_KEY || 'sk-987312a0a1689afc-m1wrjj-666571e0';
const EMBED_MODEL = process.env.EMBED_MODEL || 'openrouter/openai/text-embedding-3-large';
const BATCH_SIZE = 20;

function fetchJSON(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? https : http;
    const body = JSON.stringify(data);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      timeout: 120000,
    };
    const req = mod.request(options, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callEmbedAPI(texts) {
  const data = await fetchJSON(`${API_BASE}/embeddings`, {
    model: EMBED_MODEL,
    input: texts.map(t => t.slice(0, 8000)),
  });
  if (!data?.data) throw new Error('Embedding API trả về null');
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

(async () => {
  console.log('[Precompute] Extracting DOCX...');
  const mammoth = require('mammoth');

  const filePath = path.join(ROOT, 'public', 'sotaynhanvien.docx');
  const { value: html } = await mammoth.convertToHtml({ path: filePath });

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

  console.log(`[Precompute] Extracted ${text.length} chars`);

  // Chunk
  function chunkText(fullText, maxSize = 450, overlap = 80) {
    const lines = fullText.split('\n').map(s => s.trimEnd());
    const sections = [];
    let h = '', cl = [];
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

    const chunks = [];
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
    const seen = new Set();
    return chunks.filter(c => c.trim().length > 30).filter(c => { const k = c.substring(0, 50); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  const rawChunks = chunkText(text, 450, 80);
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
