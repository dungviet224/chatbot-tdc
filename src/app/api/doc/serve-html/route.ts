import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const { getDocHtmlPath, getDocxPath } = await import('@/lib/file-store');
    const htmlPath = getDocHtmlPath();
    const docxPath = getDocxPath();

    // 1. Thử đọc file HTML trong writable dir (ví dụ: public hoặc /tmp)
    if (fs.existsSync(htmlPath)) {
      const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    // 2. Fallback đọc file HTML trong public/ (đối với môi trường deploy tĩnh)
    const publicHtmlPath = path.join(process.cwd(), 'public', 'sotaynhanvien.html');
    if (fs.existsSync(publicHtmlPath)) {
      const htmlContent = fs.readFileSync(publicHtmlPath, 'utf-8');
      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    // 3. Nếu chưa có file HTML nhưng có file DOCX, tiến hành convert on-the-fly bằng mammoth
    let sourceDocxPath = '';
    if (fs.existsSync(docxPath)) {
      sourceDocxPath = docxPath;
    } else {
      const publicDocxPath = path.join(process.cwd(), 'public', 'sotaynhanvien.docx');
      if (fs.existsSync(publicDocxPath)) {
        sourceDocxPath = publicDocxPath;
      }
    }

    if (sourceDocxPath) {
      console.log('[API Serve HTML] Converting DOCX to HTML on-the-fly from:', sourceDocxPath);
      const mammoth = require('mammoth');
      const { value: html } = await mammoth.convertToHtml({ path: sourceDocxPath });
      
      // Thêm id="section-N" vào các thẻ heading để hỗ trợ nhảy trực tiếp
      let sectionIndex = 0;
      const annotatedHtml = html.replace(
        /<(h[1-6])([^>]*)>/gi,
        (match: string, tag: string, attrs: string) => {
          const id = `section-${sectionIndex++}`;
          if (/id=/.test(attrs)) return match;
          return `<${tag}${attrs} id="${id}">`;
        }
      );

      // Định nghĩa style mặc định cho HTML
      const HTML_STYLE = `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 16px; line-height: 1.7;
          color: #1c0a13; background: #ffffff;
          max-width: 860px; margin: 0 auto; padding: 32px 20px;
        }
        h1, h2, h3, h4 { color: #b8146a; margin-top: 32px; margin-bottom: 12px; }
        h1 { font-size: 28px; border-bottom: 2px solid #f5a3cc; padding-bottom: 8px; }
        h2 { font-size: 22px; }
        h3 { font-size: 18px; }
        p { margin-bottom: 12px; }
        ul, ol { margin: 8px 0 12px 24px; }
        li { margin-bottom: 4px; }
        strong { color: #d4227b; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
        th, td { border: 1px solid #d4a0b8; padding: 10px 12px; text-align: left; vertical-align: top; }
        th { background: linear-gradient(135deg, #d4227b, #e8559f); color: #fff; font-weight: 600; }
        tr:nth-child(even) td { background: rgba(212, 34, 123, 0.04); }
      `;

      const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sổ Tay Nhân Viên TDConsulting</title>
<style>${HTML_STYLE}</style>
</head>
<body>
${annotatedHtml}
</body>
</html>`;

      // Lưu file HTML để các lần sau không cần convert lại
      try {
        fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
        fs.writeFileSync(htmlPath, fullHtml, 'utf-8');
      } catch (err) {
        console.error('[API Serve HTML] Failed to cache HTML file:', err);
      }

      return new NextResponse(fullHtml, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    return new NextResponse('Không tìm thấy tài liệu (cả file HTML lẫn DOCX đều không tồn tại)', { status: 404 });
  } catch (error: any) {
    console.error('[API Serve HTML] Error serving HTML:', error);
    return new NextResponse(`Lỗi máy chủ: ${error.message || error}`, { status: 500 });
  }
}
