import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getWritableDir } from '@/lib/file-store';

export async function POST(req: NextRequest) {
  if (req.cookies.get('cfg_token')?.value !== 'authenticated') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ success: false, error: 'Chỉ hỗ trợ file .pdf' }, { status: 400 });
    }

    const pdfPath = path.join(getWritableDir(), 'sotaynhanvien.pdf');
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(pdfPath, buffer);

    try {
      const publicPdf = path.join(process.cwd(), 'public', 'sotaynhanvien.pdf');
      fs.writeFileSync(publicPdf, buffer);
    } catch { /* ignore on vercel */ }

    return NextResponse.json({ success: true, message: 'Đã cập nhật file PDF hiển thị' });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
