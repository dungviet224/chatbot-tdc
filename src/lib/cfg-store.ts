/**
 * Config store — save/load app config từ JSON file
 * Lưu trong writable dir (tự động /tmp trên Vercel)
 */

import path from 'path';
import fs from 'fs';
import { getWritableDir } from './file-store';

export interface AppConfig {
  // API
  apiBase?: string;
  apiKey?: string;
  embedModel?: string;
  chatModel?: string;
  // Rules
  rules?: string;
  // Metadata
  updatedAt?: string;
  docFile?: string;
  docUpdatedAt?: string;
}

function getConfigDir(): string {
  return getWritableDir();
}

const CONFIG_FILE = path.join(getWritableDir(), 'app-config.json');

export function getConfig(): AppConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveConfig(partial: Partial<AppConfig>): AppConfig {
  const current = getConfig();
  const next = { ...current, ...partial, updatedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}
