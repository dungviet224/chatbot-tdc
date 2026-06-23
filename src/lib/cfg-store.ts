/**
 * Config store — save/load app config từ JSON file
 * File: config/app-config.json (project root)
 * Chỉ dùng được ở self-host, Vercel dùng env vars
 */

import path from 'path';
import fs from 'fs';

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

const CONFIG_DIR = path.join(process.cwd(), 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'app-config.json');

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

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
  ensureDir();
  const current = getConfig();
  const next = { ...current, ...partial, updatedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}
