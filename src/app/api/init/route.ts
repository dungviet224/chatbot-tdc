import { NextResponse } from 'next/server';
import { getEmbeddingStatus } from '@/lib/docLoader';

export async function GET() {
  try {
    const status = await getEmbeddingStatus();

    if (status.ready) {
      const cfg = await import('@/lib/cfg-store').then(m => m.getConfig());
      const { supabaseAdmin } = await import('@/lib/supabase');
      const { data: files } = await supabaseAdmin.storage.from('documents').list();
      const pdfFileName = files?.find(f => f.name.toLowerCase().endsWith('.pdf'))?.name || null;
      const displayFileName = pdfFileName || cfg.docFile || 'sotaynhanvien.docx';
      
      const fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${encodeURIComponent(displayFileName)}`;
      let docViewerUrl = fileUrl;
      if (displayFileName?.toLowerCase().endsWith('.docx')) {
        docViewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`;
      }

      return NextResponse.json({
        success: true,
        totalChunks: status.totalChunks,
        message: `✅ Đã sẵn sàng: ${status.totalChunks} chunks`,
        docViewerUrl,
      });
    }

    return NextResponse.json({
      success: false,
      totalChunks: 0,
      message: `❌ Chưa có dữ liệu embeddings trong Supabase. Vui lòng chạy script precompute.`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Init API]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
