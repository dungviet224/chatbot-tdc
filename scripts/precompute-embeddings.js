/**
 * Build-time script: extract DOCX → chunk → call API embedding → insert to Supabase pgvector
 * Output: Postgres `document_chunks` table
 * Run: node scripts/precompute-embeddings.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Bắt buộc nạp biến môi trường nếu chạy local
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const ROOT = path.resolve(__dirname, '..'); // project root

const API_BASE = process.env.EMBED_API_BASE || 'http://mbasic8.pikamc.vn:25246/v1';
const API_KEY = process.env.EMBED_API_KEY || 'sk-987312a0a1689afc-m1wrjj-666571e0';
const EMBED_MODEL = process.env.EMBED_MODEL || 'openrouter/openai/text-embedding-3-large';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

/** === CHUNK TEXT with section tracking === */
function chunkText(fullText, maxSize = 450, overlap = 80) {
  const lines = fullText.split('\n').map(s => s.trimEnd());
  const sections = [];
  let h = '', cl = [], sids = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const markerMatch = t.match(/⸻SECTION:([^⸻]+)⸻/);
    if (markerMatch) {
      if (cl.length > 0) { sections.push({ heading: h, content: cl, sectionIds: [...sids] }); cl = []; }
      sids.push(markerMatch[1]);
      h = sids.map(s => s.replace('section-', '#')).join(', ');
      continue;
    }
    const isH = /^###/.test(t) || /^PHẦN\s+\d+/i.test(t) || /^\d+\.\d+[\.\s]/.test(t)
      || /^[A-ZĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬ\s]{10,}$/.test(t);
    if (isH && cl.length > 0) { sections.push({ heading: h, content: cl, sectionIds: [...sids] }); cl = []; h = t.replace(/^###\s*/, '').replace(/\s*###$/, '').trim(); }
    else if (isH) { h = t.replace(/^###\s*/, '').replace(/\s*###$/, '').trim(); }
    else cl.push(t);
  }
  if (cl.length > 0) sections.push({ heading: h, content: cl, sectionIds: [...sids] });

  const result = [];
  for (const s of sections) {
    const prefix = s.heading ? `[${s.heading}]\n` : '';
    const body = s.content.join('\n').trim();
    if (!body) continue;
    const full = (prefix + body).trim();
    if (full.length <= maxSize) { result.push({ chunk: full, sectionIds: s.sectionIds }); continue; }
    const paras = body.split(/\n{2,}/).filter(p => p.trim().length > 10);
    let buf = prefix;
    for (const p of paras) {
      const c = buf + (buf === prefix ? '' : '\n\n') + p;
      if (c.length >= maxSize && buf !== prefix) { result.push({ chunk: buf.trim(), sectionIds: s.sectionIds }); buf = prefix + buf.split(/\s+/).slice(-Math.ceil(overlap / 5)).join(' ') + '\n\n' + p; }
      else buf = c;
    }
    if (buf.trim() && buf.trim() !== prefix.trim()) result.push({ chunk: buf.trim(), sectionIds: s.sectionIds });
  }
  const seen = new Set();
  return result.filter(c => c.chunk.trim().length > 30).filter(c => { const k = c.chunk.substring(0, 50); if (seen.has(k)) return false; seen.add(k); return true; });
}

function extractSectionMap(html) {
  const map = new Map();
  const regex = /<h([1-6])([^>]*)id="(section-\d+)"([^>]*)>(.*?)<\/h[1-6]>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const rawText = match[5];
    const cleanText = rawText.replace(/<[^>]+>/g, '').trim();
    map.set(match[3], cleanText);
  }
  return map;
}

(async () => {
  console.log('[Precompute] Extracting DOCX...');
  const mammoth = require('mammoth');

  const filePath = path.join(ROOT, 'public', 'sotaynhanvien.docx');
  if (!fs.existsSync(filePath)) {
    console.error('File public/sotaynhanvien.docx not found');
    process.exit(1);
  }

  const { value: html } = await mammoth.convertToHtml({ path: filePath });

  let sectionIndex = 0;
  const annotatedHtml = html.replace(
    /<(h[1-6])([^>]*)>/gi,
    (match, tag, attrs) => {
      const id = `section-${sectionIndex++}`;
      if (/id=/.test(attrs)) return match;
      return `<${tag}${attrs} id="${id}">`;
    }
  );

  const sectionMap = extractSectionMap(annotatedHtml);

  let sectionedHtml = annotatedHtml.replace(
    /<h([1-6])([^>]*)id="(section-\d+)"([^>]*)>/gi,
    (match, _tag, _before, id, _after) => {
      return `⸻SECTION:${id}⸻\n${match}`;
    }
  );

  const text = sectionedHtml
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

  const rawChunks = chunkText(text, 450, 80);
  console.log(`[Precompute] ${rawChunks.length} chunks`);

  console.log('[Precompute] Embedding via API...');
  const dbRows = [];
  
  for (let i = 0; i < rawChunks.length; i += BATCH_SIZE) {
    const batch = rawChunks.slice(i, i + BATCH_SIZE);
    const batchTexts = batch.map(c => c.chunk);
    const vecs = await callEmbedAPI(batchTexts);
    
    for (let j = 0; j < batch.length; j++) {
      const item = rawChunks[i + j];
      const lastSectionId = item.sectionIds[item.sectionIds.length - 1] || '';
      const sectionName = lastSectionId ? (sectionMap.get(lastSectionId) || '') : '';
      
      dbRows.push({
        content: item.chunk,
        source: 'SoTayNhanVien_TDConsulting',
        embedding: `[${vecs[j].join(',')}]`,
        embedding_type: 'neural',
        section_id: lastSectionId || null,
        section_name: sectionName || null,
      });
    }
    console.log(`[Precompute] Batch ${Math.min(i + BATCH_SIZE, rawChunks.length)}/${rawChunks.length}`);
  }

  console.log('[Precompute] Deleting old chunks from Database...');
  await supabase.from('document_chunks').delete().neq('id', -1);

  console.log('[Precompute] Inserting new chunks to Database...');
  const BATCH_INSERT = 100;
  for (let i = 0; i < dbRows.length; i += BATCH_INSERT) {
    const batch = dbRows.slice(i, i + BATCH_INSERT);
    const { error } = await supabase.from('document_chunks').insert(batch);
    if (error) {
      console.error('Insert Error:', error);
    }
  }

  console.log(`[Precompute] ✅ Done. Inserted ${dbRows.length} chunks.`);
})();
