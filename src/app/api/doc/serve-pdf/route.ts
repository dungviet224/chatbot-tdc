/**
 * Serve file PDF công khai
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPdfPath } from '@/lib/file-store';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const pdfPath = getPdfPath();

    // Fallback public/
    if (!fs.existsSync(pdfPath)) {
      const publicPath = path.join(process.cwd(), 'public', 'sotaynhanvien.pdf');
      if (fs.existsSync(publicPath)) {
        const buf = fs.readFileSync(publicPath);
        return new Response(buf, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="sotaynhanvien.pdf"',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return NextResponse.json({ error: 'No document found' }, { status: 404 });
    }

    const buf = fs.readFileSync(pdfPath);
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="sotaynhanvien.pdf"',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to serve document' }, { status: 500 });
  }
}
