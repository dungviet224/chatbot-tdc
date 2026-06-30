import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import { uploadFileToSupabase, deleteFileFromSupabase } from '@/lib/file-store';
import { getConfig, saveConfig } from '@/lib/cfg-store';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB cho PDF

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
        { success: false, error: 'File quá lớn (tối đa 50MB)' },
        { status: 413 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ success: false, error: 'Chỉ hỗ trợ file .pdf' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Kiểm tra magic bytes thực sự của PDF: bắt đầu bằng "%PDF-" (0x25 0x50 0x44 0x46 0x2D)
    if (buffer.length < 5 || buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46 || buffer[4] !== 0x2D) {
      return NextResponse.json(
        { success: false, error: 'File không hợp lệ (không phải file .pdf thực sự)' },
        { status: 400 }
      );
    }

    // Sanitize tên file để tránh lỗi Supabase (khoảng trắng, dấu tiếng Việt)
    const safeFileName = sanitizeFileName(file.name);

    // Lấy danh sách file và xóa tất cả file PDF cũ để đảm bảo chỉ có 1 file PDF duy nhất
    const { supabaseAdmin } = await import('@/lib/supabase');
    const { data: files } = await supabaseAdmin.storage.from('documents').list();
    const oldPdfs = files?.filter(f => f.name.toLowerCase().endsWith('.pdf')) || [];
    for (const oldPdf of oldPdfs) {
      if (oldPdf.name !== safeFileName) {
        await deleteFileFromSupabase(oldPdf.name);
      }
    }

    // Upload file gốc lên Supabase Storage với tên an toàn
    await uploadFileToSupabase(safeFileName, buffer, 'application/pdf');

    // Cập nhật lại config để lưu tên file PDF
    await saveConfig({
      docFile: safeFileName,
      docUpdatedAt: new Date().toISOString(),
    });

    // Tự động quét và đồng bộ trang Mục lục từ PDF vừa tải lên
    const { autoSyncOutlinePagesFromPdf } = await import('@/lib/pdf-outline');
    await autoSyncOutlinePagesFromPdf(buffer);

    return NextResponse.json({
      success: true,
      message: `✅ Đã upload file PDF thành công`,
    });
  } catch (e) {
    console.error('[Upload PDF]', e);
    require('fs').writeFileSync('error.log', String(e) + '\n' + (e.stack || ''), { flag: 'a' });
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
