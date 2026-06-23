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

export function getPdfPath(): string {
  return path.join(getWritableDir(), 'sotaynhanvien.pdf');
}

export function getEmbeddingsJsonPath(): string {
  return path.join(getWritableDir(), 'embeddings-data.json');
}

export function getDocxServeUrl(): string {
  return '/api/doc/serve-pdf';
}

export function getDocViewerUrl(baseUrl: string): string {
  const pdfUrl = `${baseUrl}/api/doc/serve-pdf`;
  return `https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`;
}

export function getPdfUrl(baseUrl: string): string {
  return `${baseUrl}/api/doc/serve-pdf`;
}
