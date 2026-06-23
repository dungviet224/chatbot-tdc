/**
 * File storage utility — chọn thư mục writable
 * Vercel: /tmp (read-only /var/task)
 * Self-host: public/
 */

import path from 'path';
import fss from 'fs';
import os from 'os';

let _writableDir: string | null = null;

export function getWritableDir(): string {
  if (_writableDir) return _writableDir;

  // Try public/ first (self-host)
  const publicDir = path.join(process.cwd(), 'public');
  try {
    if (!fss.existsSync(publicDir)) fss.mkdirSync(publicDir, { recursive: true });
    const testFile = path.join(publicDir, '.write-test');
    fss.writeFileSync(testFile, 'test');
    fss.unlinkSync(testFile);
    _writableDir = publicDir;
    console.log('[FileStore] Using public/ for writable storage');
    return _writableDir;
  } catch {
    // Fallback to /tmp (Vercel Lambda)
    try {
      const tmpDir = path.join(os.tmpdir(), 'tdc-chatbot-data');
      if (!fss.existsSync(tmpDir)) fss.mkdirSync(tmpDir, { recursive: true });
      _writableDir = tmpDir;
      console.log('[FileStore] Using /tmp for writable storage:', tmpDir);
      return _writableDir;
    } catch {
      // Last resort
      const fallbackDir = path.join(process.cwd(), '.tmp-data');
      if (!fss.existsSync(fallbackDir)) fss.mkdirSync(fallbackDir, { recursive: true });
      _writableDir = fallbackDir;
      console.log('[FileStore] Using .tmp-data for writable storage');
      return _writableDir;
    }
  }
}

export function getDocHtmlPath(): string {
  return path.join(getWritableDir(), 'sotaynhanvien.html');
}

export function getDocxPath(): string {
  return path.join(getWritableDir(), 'sotaynhanvien.docx');
}

export function getEmbeddingsJsonPath(): string {
  return path.join(getWritableDir(), 'embeddings-data.json');
}

export function getSourceUrl(): string {
  if (getWritableDir() === path.join(process.cwd(), 'public')) {
    return '/sotaynhanvien.html';
  }
  return '/api/doc/serve';
}
