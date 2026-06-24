import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getWritableDir } from '@/lib/file-store';

export async function GET() {
  const filePath = path.join(getWritableDir(), 'sotaynhanvien.pdf');
  
  if (!fs.existsSync(filePath)) {
    // Fallback to public folder
    const fallbackPath = path.join(process.cwd(), 'public', 'sotaynhanvien.pdf');
    if (!fs.existsSync(fallbackPath)) {
      return new NextResponse('PDF not found', { status: 404 });
    }
    const buffer = fs.readFileSync(fallbackPath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="sotaynhanvien.pdf"',
      },
    });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="sotaynhanvien.pdf"',
    },
  });
}
