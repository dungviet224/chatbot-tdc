import { NextRequest, NextResponse } from 'next/server';
import { loadOutlineItems } from '@/lib/outline-store';

function checkAuth(req: NextRequest): boolean {
  return req.cookies.get('cfg_token')?.value === 'authenticated';
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const items = loadOutlineItems();
    return NextResponse.json({ success: true, items });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
