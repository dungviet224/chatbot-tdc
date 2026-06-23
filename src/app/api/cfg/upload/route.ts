import { NextRequest, NextResponse } from 'next/server';
import { saveConfig } from '@/lib/cfg-store';
import { reembedFromPdf } from '@/lib/reembed';
import { updateCache } from '@/lib/docLoader';
import { getPdfPath, getEmbeddingsJsonPath } from '@/lib/file-store';
import path from 'path';
import fs from 'fs';

function checkAuth(req: NextRequest): boolean {
  return req.cookies.get('cfg_token')?.value === 'authenticated';
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'Không có file' }, { status: 400 });
    }

    // Validate .pdf
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ success: false, error: 'Chỉ hỗ trợ file .pdf' }, { status: 400 });
    }

    // Save file to writable directory
    const pdfPath = getPdfPath();
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(pdfPath, buffer);

    // Also copy to public/ để persist (trên local dev)
    try {
      const publicPdf = path.join(process.cwd(), 'public', 'sotaynhanvien.pdf');
      fs.writeFileSync(publicPdf, buffer);
    } catch { /* Vercel read-only, bỏ qua */ }

    // Re-embed
    const result = await reembedFromPdf(pdfPath);

    // Update doc metadata in config
    saveConfig({
      docFile: file.name,
      docUpdatedAt: new Date().toISOString(),
    });

    // Đọc file JSON vừa ghi và cập nhật in-memory cache
    const raw = fs.readFileSync(getEmbeddingsJsonPath(), 'utf-8');
    const freshChunks = JSON.parse(raw);
    updateCache(freshChunks);

    return NextResponse.json({
      success: true,
      chunks: result.chunks,
      dim: result.dim,
      message: `✅ Đã xử lý ${result.chunks} chunks, dim=${result.dim}`,
    });
  } catch (e) {
    console.error('[Upload]', e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
