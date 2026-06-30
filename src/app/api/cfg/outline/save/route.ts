import { NextRequest, NextResponse } from 'next/server';
import { saveOutlineItems } from '@/lib/outline-store';
import { checkAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!await checkAuth(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ success: false, error: 'Invalid items format' }, { status: 400 });
    }

    // ✅ Schema validation — chặn injection và dữ liệu rác
    for (const item of body.items) {
      if (typeof item.id !== 'string' || item.id.length > 50) {
        return NextResponse.json({ success: false, error: 'id không hợp lệ' }, { status: 400 });
      }
      if (typeof item.text !== 'string' || item.text.length > 500) {
        return NextResponse.json({ success: false, error: 'text quá dài (max 500)' }, { status: 400 });
      }
      const page = Number(item.page);
      if (!Number.isInteger(page) || page < 1 || page > 9999) {
        return NextResponse.json({ success: false, error: 'page phải từ 1-9999' }, { status: 400 });
      }
      const level = Number(item.level);
      if (!Number.isInteger(level) || level < 1 || level > 6) {
        return NextResponse.json({ success: false, error: 'level phải từ 1-6' }, { status: 400 });
      }
      // Sanitize page value
      item.page = page;
      item.level = level;
    }

    if (body.items.length > 500) {
      return NextResponse.json({ success: false, error: 'Quá nhiều items (max 500)' }, { status: 400 });
    }

    await saveOutlineItems(body.items);

    return NextResponse.json({ success: true, message: 'Đã lưu cấu hình trang thành công!' });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
