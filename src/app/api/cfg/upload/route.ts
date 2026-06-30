import { NextRequest, NextResponse } from 'next/server';
import { saveConfig } from '@/lib/cfg-store';
import { reembedFromDocx } from '@/lib/reembed';
import { checkAuth } from '@/lib/auth';
import { uploadFileToSupabase } from '@/lib/file-store';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function sanitizeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

export async function POST(req: NextRequest) {
  if (!await checkAuth(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'Không có file' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File quá lớn (tối đa 20MB)' },
        { status: 413 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.docx')) {
      return NextResponse.json({ success: false, error: 'Chỉ hỗ trợ file .docx' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Kiểm tra magic bytes thực sự: DOCX = ZIP = bắt đầu bằng "PK" (0x50 0x4B)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
      return NextResponse.json(
        { success: false, error: 'File không hợp lệ (không phải file .docx thực sự)' },
        { status: 400 }
      );
    }

    // Sanitize tên file để tránh lỗi Supabase
    const safeFileName = sanitizeFileName(file.name);

    // 1. Lấy danh sách file để tìm DOCX cũ cần xóa (không xóa PDF)
    const { supabaseAdmin } = await import('@/lib/supabase');
    const { data: files } = await supabaseAdmin.storage.from('documents').list();
    const oldDocxs = files?.filter(f => f.name.toLowerCase().endsWith('.docx')) || [];
    
    // 2. Upload file gốc lên Supabase Storage với tên an toàn
    const { deleteFileFromSupabase } = await import('@/lib/file-store');
    await uploadFileToSupabase(safeFileName, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    // Xóa tất cả các file DOCX cũ (và HTML tương ứng) nếu khác tên
    for (const oldDocx of oldDocxs) {
      if (oldDocx.name !== safeFileName) {
        await deleteFileFromSupabase(oldDocx.name);
        await deleteFileFromSupabase(oldDocx.name.replace(/\.docx$/i, '.html'));
      }
    }

    // 4. Re-embed (tính toán Vector, lưu HTML, lưu vào Supabase pgvector)
    const result = await reembedFromDocx(buffer, safeFileName);

    // 5. Cập nhật metadata trong config Supabase
    await saveConfig({
      docFile: safeFileName,
      docUpdatedAt: new Date().toISOString(),
    });

    // 6. Tự động đồng bộ số trang nếu hệ thống đã có file PDF
    const { runAutoSyncFromSupabasePdf } = await import('@/lib/pdf-outline');
    await runAutoSyncFromSupabasePdf();

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
