import { NextRequest, NextResponse } from 'next/server';
import { saveConfig } from '@/lib/cfg-store';
import { checkAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!await checkAuth(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const saved = await saveConfig(body);
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
