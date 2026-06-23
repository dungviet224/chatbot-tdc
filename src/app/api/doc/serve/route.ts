/**
 * Serve file HTML công khai từ writable dir
 * Trên Vercel: /tmp, ko serve được static từ public/
 */
import { NextResponse } from 'next/server';
import { getDocHtmlPath } from '@/lib/file-store';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const htmlPath = getDocHtmlPath();
    
    // Nếu file ko tồn tries fallback public/
    if (!fs.existsSync(htmlPath)) {
      const publicPath = path.join(process.cwd(), 'public', 'sotaynhanvien.html');
      if (fs.existsSync(publicPath)) {
        const html = fs.readFileSync(publicPath, 'utf-8');
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return NextResponse.json({ error: 'No document HTML found' }, { status: 404 });
    }

    const html = fs.readFileSync(htmlPath, 'utf-8');
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to serve document' }, { status: 500 });
  }
}
