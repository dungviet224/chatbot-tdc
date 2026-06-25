import { NextRequest, NextResponse } from 'next/server';
import { saveOutlineItems } from '@/lib/outline-store';

function checkAuth(req: NextRequest): boolean {
  return req.cookies.get('cfg_token')?.value === 'authenticated';
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ success: false, error: 'Invalid items format' }, { status: 400 });
    }
    
    saveOutlineItems(body.items);
    
    return NextResponse.json({ success: true, message: 'Đã lưu cấu hình trang thành công!' });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
