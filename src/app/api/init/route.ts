import { NextResponse } from 'next/server';
import { loadAndEmbedDocument, getEmbeddingStatus } from '@/lib/docLoader';

export async function GET() {
  try {
    const status = getEmbeddingStatus();

    if (status.ready) {
      return NextResponse.json({
        success: true,
        totalChunks: status.totalChunks,
        message: `✅ Đã sẵn sàng: ${status.totalChunks} chunks`,
      });
    }

    const result = await loadAndEmbedDocument();

    return NextResponse.json({
      success: true,
      totalChunks: result.totalChunks,
      message: `✅ Đã tải & embedding ${result.totalChunks} đoạn từ Sổ Tay Nhân Viên`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Init API]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
