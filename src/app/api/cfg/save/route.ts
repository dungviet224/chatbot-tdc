import { NextRequest, NextResponse } from 'next/server';
import { saveConfig, getConfig } from '@/lib/cfg-store';

function checkAuth(req: NextRequest): boolean {
  return req.cookies.get('cfg_token')?.value === 'authenticated';
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const saved = saveConfig(body);
    return NextResponse.json({
      success: true,
      config: {
        apiBase: saved.apiBase || '',
        apiKey: saved.apiKey ? '••••••' : '',
        embedModel: saved.embedModel || '',
        chatModel: saved.chatModel || '',
        rules: saved.rules || '',
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
