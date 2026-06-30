export interface OutlineItem {
  id: string;
  text: string;
  level: number;
  page: number;
}

import { loadOutlineItems } from './outline-store';

// ── Cached Map để lookup O(1) thay vì O(N) loop ──────────────────────────────
let _pageMap: Map<string, number> | null = null;

async function getPageMap(): Promise<Map<string, number>> {
  if (_pageMap) return _pageMap;
  const items = await loadOutlineItems();
  _pageMap = new Map<string, number>();
  for (const item of items) {
    // Lưu cả tên đầy đủ lẫn tên đã strip prefix để tăng tỉ lệ match
    const fullKey = item.text.toLowerCase().trim();
    const strippedKey = item.text
      .toLowerCase()
      .replace(/^(phần\s+\d+[a-z]?:\s*|\d+(\.\d+)*\.\s*)/i, '')
      .trim();
    _pageMap.set(fullKey, item.page);
    if (strippedKey !== fullKey) _pageMap.set(strippedKey, item.page);
  }
  return _pageMap;
}

/** Xóa page map cache (gọi sau khi saveOutlineItems) */
export function invalidatePageMap(): void {
  _pageMap = null;
}

export async function findPageForSection(secName: string): Promise<number> {
  // Decode HTML entities
  const decoded = secName.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const cleanSearch = decoded.trim().toLowerCase();

  const map = await getPageMap();

  // 1. Tra cứu O(1) — nhanh nhất
  if (map.has(cleanSearch)) return map.get(cleanSearch)!;

  // 2. Strip prefix rồi tra cứu
  const stripped = cleanSearch
    .replace(/^(phần\s+\d+[a-z]?:\s*|\d+(\.\d+)*\.\s*)/i, '')
    .trim();
  if (stripped !== cleanSearch && map.has(stripped)) return map.get(stripped)!;

  // 3. Fallback: tìm kiếm substring trong map keys (chỉ khi cần thiết)
  for (const [key, page] of map.entries()) {
    if (cleanSearch.includes(key) || key.includes(cleanSearch)) return page;
  }

  return 1; // default nếu không tìm thấy
}

