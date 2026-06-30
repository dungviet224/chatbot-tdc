import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/cfg-store';
import { getEmbeddingStatus } from '@/lib/docLoader';
import { supabaseAdmin } from '@/lib/supabase';
import { checkAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!await checkAuth(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const config = await getConfig();
  const embedStatus = await getEmbeddingStatus();

  // Lấy thông tin file PDF từ Storage
  const { data: files } = await supabaseAdmin.storage.from('documents').list();
  const pdfFileObj = files?.find(f => f.name.toLowerCase().endsWith('.pdf'));
  const pdfFileName = pdfFileObj?.name || null;
  
  // Tên file hiển thị: ưu tiên PDF, nếu không có thì dùng DOCX
  const displayFileName = pdfFileName || config.docFile || null;
  
  // Lấy dung lượng của file đang được hiển thị
  const displayFileObj = files?.find(f => f.name === displayFileName);
  const fileSize = displayFileObj?.metadata?.size || 0;

  const fileUrl = displayFileName ? `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${encodeURIComponent(displayFileName)}` : null;
  
  let finalDocUrl = fileUrl;
  if (fileUrl && displayFileName?.toLowerCase().endsWith('.docx')) {
    finalDocUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`;
  }
  
  const docUrl = embedStatus.ready ? finalDocUrl : null;

  return NextResponse.json({
    success: true,
    config: {
      apiBase: config.apiBase || '',
      apiKey: config.apiKey ? '••••••' : '',
      embedModel: config.embedModel || '',
      chatModel: config.chatModel || '',
      rules: config.rules || '',
    },
    embed: {
      ready: embedStatus.ready,
      totalChunks: embedStatus.totalChunks,
      docUpdatedAt: config.docUpdatedAt || null,
      fileSize: fileSize,
      docFile: pdfFileName || config.docFile || null, // Trả về tên file PDF để hiển thị đúng tên
      docUrl,
    },
  });
}
