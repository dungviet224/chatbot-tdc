/**
 * File storage utility — chọn thư mục writable
 * Vercel: /tmp (read-only /var/task)
 * Self-host: public/
 */

import path from 'path';
import fs from 'fs';

let _writableDir: string | null = null;

export function getWritableDir(): string {
  if (_writableDir) return _writableDir;

  // Thử public/ trước
  const publicDir = path.join(process.cwd(), 'public');
  try {
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    const testFile = path.join(publicDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    _writableDir = publicDir;
    return _writableDir;
  } catch {
    // Fallback /tmp trên Vercel
    const tmpDir = path.join(process.cwd(), '.tmp-data');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    _writableDir = tmpDir;
    return _writableDir;
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
  // Nếu dùng public/ → serve tĩnh
  if (getWritableDir() === path.join(process.cwd(), 'public')) {
    return '/sotaynhanvien.html';
  }
  // Nếu dùng tmp → serve qua API
  return '/api/doc/serve';
}
