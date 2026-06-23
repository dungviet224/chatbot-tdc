/**
 * Serve DOCX file công khai để Google Docs Viewer đọc được
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDocxPath } from '@/lib/file-store';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const docxPath = getDocxPath();

    // Fallback public/
    if (!fs.existsSync(docxPath)) {
      const publicPath = path.join(process.cwd(), 'public', 'sotaynhanvien.docx');
      if (fs.existsSync(publicPath)) {
        const buf = fs.readFileSync(publicPath);
        return new Response(buf, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': 'inline; filename="sotaynhanvien.docx"',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return NextResponse.json({ error: 'No document found' }, { status: 404 });
    }

    const buf = fs.readFileSync(docxPath);
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'inline; filename="sotaynhanvien.docx"',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to serve document' }, { status: 500 });
  }
}
