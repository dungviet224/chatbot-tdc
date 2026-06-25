import fs from 'fs';
import { getOutlineJsonPath } from './file-store';
import { OUTLINE_ITEMS as DEFAULT_OUTLINE } from './document-outline';

export interface OutlineItem {
  id: string;
  text: string;
  level: number;
  page: number;
}

export function loadOutlineItems(): OutlineItem[] {
  const p = getOutlineJsonPath();
  if (fs.existsSync(p)) {
    try {
      const data = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as OutlineItem[];
      }
    } catch (e) {
      console.warn('[OutlineStore] Failed to parse page-mapping.json', e);
    }
  }
  return DEFAULT_OUTLINE;
}

export function saveOutlineItems(items: OutlineItem[]) {
  const p = getOutlineJsonPath();
  fs.writeFileSync(p, JSON.stringify(items, null, 2), 'utf-8');
}
