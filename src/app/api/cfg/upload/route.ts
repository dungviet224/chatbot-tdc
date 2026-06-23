import { NextRequest, NextResponse } from 'next/server';
import { saveConfig } from '@/lib/cfg-store';
import { reembedFromDocx } from '@/lib/reembed';
import { updateCache } from '@/lib/docLoader';
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

    // Validate .docx
    if (!file.name.toLowerCase().endsWith('.docx')) {
      return NextResponse.json({ success: false, error: 'Chỉ hỗ trợ file .docx' }, { status: 400 });
    }

    // Save file
    const uploadDir = path.join(process.cwd(), 'public');
    const docxPath = path.join(uploadDir, 'sotaynhanvien.docx');
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(docxPath, buffer);

    // Re-embed
    const result = await reembedFromDocx(docxPath);

    // Update doc metadata in config
    saveConfig({
      docFile: 'sotaynhanvien.docx',
      docUpdatedAt: new Date().toISOString(),
    });

    // Đọc file JSON vừa ghi và cập nhật in-memory cache
    const raw = fs.readFileSync(path.join(process.cwd(), 'public', 'embeddings-data.json'), 'utf-8');
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
