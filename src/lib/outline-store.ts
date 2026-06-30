import { supabaseAdmin } from './supabase';

export interface OutlineItem {
  id: string;
  text: string;
  level: number;
  page: number;
}

export async function loadOutlineItems(): Promise<OutlineItem[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('document_outline')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map(row => ({
      id: row.id,
      text: row.text,
      level: row.level,
      page: row.page
    }));
  } catch (e) {
    console.error('[OutlineStore] Failed to load from DB', e);
    return DEFAULT_OUTLINE;
  }
}

export async function saveOutlineItems(items: OutlineItem[]): Promise<void> {
  try {
    // Delete existing outline to replace completely
    const { error: delError } = await supabaseAdmin.from('document_outline').delete().not('id', 'is', null);
    if (delError) {
      console.error('[OutlineStore] Lỗi xóa outline cũ:', delError);
    }

    // Insert new items
    const rows = items.map((item, index) => ({
      id: item.id,
      text: item.text,
      level: item.level,
      page: item.page,
      sort_order: index
    }));

    const { error } = await supabaseAdmin.from('document_outline').insert(rows);
    if (error) {
      throw new Error(`DB Error: ${error.message}`);
    }
  } catch (e) {
    console.error('[OutlineStore] Error saving:', e);
    throw e;
  }
}
