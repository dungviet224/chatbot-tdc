import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const { getDocxPath } = await import('@/lib/file-store');
  const docxPath = getDocxPath();

  // Thử đọc file docx trong writable dir
  if (fs.existsSync(docxPath)) {
    const buffer = fs.readFileSync(docxPath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'inline; filename="sotaynhanvien.docx"',
      },
    });
  }

  // Fallback đọc file trong public/
  const publicPath = path.join(process.cwd(), 'public', 'sotaynhanvien.docx');
  if (fs.existsSync(publicPath)) {
    const buffer = fs.readFileSync(publicPath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'inline; filename="sotaynhanvien.docx"',
      },
    });
  }

  return new NextResponse('Không tìm thấy file .docx', { status: 404 });
}
