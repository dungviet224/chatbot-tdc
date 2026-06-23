import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/cfg-store';
import { getEmbeddingStatus } from '@/lib/docLoader';
import path from 'path';
import fs from 'fs';

function checkAuth(req: NextRequest): boolean {
  return req.cookies.get('cfg_token')?.value === 'authenticated';
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const config = getConfig();
  const embedStatus = getEmbeddingStatus();
  const dataPath = path.join(process.cwd(), 'public', 'embeddings-data.json');
  let docUpdatedAt = config.docUpdatedAt || null;
  let fileSize = 0;
  try {
    if (fs.existsSync(dataPath)) {
      const stat = fs.statSync(dataPath);
      fileSize = stat.size;
      if (!docUpdatedAt) docUpdatedAt = stat.mtime.toISOString();
    }
  } catch {}

  return NextResponse.json({
    success: true,
    config: {
      apiBase: config.apiBase || '',
      apiKey: config.apiKey ? '••••••' : '',
      embedModel: config.embedModel || '',
      chatModel: config.chatModel || '',
      rules: config.rules || '',
    },
    embed: {
      ready: embedStatus.ready,
      totalChunks: embedStatus.totalChunks,
      docUpdatedAt,
      fileSize,
    },
  });
}
