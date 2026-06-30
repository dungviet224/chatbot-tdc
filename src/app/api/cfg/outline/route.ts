import { NextRequest, NextResponse } from 'next/server';
import { loadOutlineItems } from '@/lib/outline-store';
import { checkAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!await checkAuth(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const items = await loadOutlineItems();
    return NextResponse.json({ success: true, items });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
