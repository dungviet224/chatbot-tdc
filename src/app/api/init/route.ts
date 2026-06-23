import { NextResponse } from 'next/server';
import { loadAndEmbedDocument, getEmbeddingStatus } from '@/lib/docLoader';

export async function GET() {
  try {
    const status = getEmbeddingStatus();

    // Nếu đã load rồi thì trả kết quả ngay
    if (status.ready) {
      return NextResponse.json({
        success: true,
        totalChunks: status.totalChunks,
        embeddingType: status.embeddingType,
        message: `✅ Đã sẵn sàng: ${status.totalChunks} chunks (${status.embeddingType === 'neural' ? 'Vector Embedding thực sự' : 'TF-IDF Embedding'})`,
      });
    }

    // Chưa load → bắt đầu load và embed
    const result = await loadAndEmbedDocument();

    return NextResponse.json({
      success: true,
      totalChunks: result.totalChunks,
      embeddingType: result.embeddingType,
      message: `✅ Đã tải & embedding ${result.totalChunks} đoạn từ Sổ Tay Nhân Viên (${
        result.embeddingType === 'neural'
          ? '🧠 Neural Vector Embedding'
          : '📊 TF-IDF Vector Embedding'
      })`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Init API]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
