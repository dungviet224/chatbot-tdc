/**
 * Config store — save/load app config từ Supabase
 */
import { supabaseAdmin } from './supabase';

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

// In-memory cache chỉ được dùng cho một request flow ngắn, nhưng trên môi trường
// Serverless chúng ta luôn phải fetch lại để đảm bảo tính nhất quán qua các instance.
// Tuy nhiên ta có thể tận dụng React cache hoặc caching native của Next.js (fetch with cache).
// Ở đây dùng query trực tiếp qua Supabase client.

export async function getConfig(): Promise<AppConfig> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) {
      return {};
    }

    return {
      apiBase: data.api_base,
      apiKey: data.api_key,
      embedModel: data.embed_model,
      chatModel: data.chat_model,
      rules: data.rules,
      updatedAt: data.updated_at,
      docFile: data.doc_file,
      docUpdatedAt: data.doc_updated_at,
    };
  } catch (e) {
    console.error('[Config] Lỗi lấy config:', e);
    return {};
  }
}

export async function saveConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  const current = await getConfig();
  const next = { ...current, ...partial, updatedAt: new Date().toISOString() };
  
  // Bảo vệ không ghi đè apiKey bằng chuỗi bị che "••••••"
  if (next.apiKey === '••••••') {
    next.apiKey = current.apiKey;
  }

  try {
    const { error } = await supabaseAdmin
      .from('app_config')
      .upsert({
        id: 1,
        api_base: next.apiBase,
        api_key: next.apiKey,
        embed_model: next.embedModel,
        chat_model: next.chatModel,
        rules: next.rules,
        updated_at: next.updatedAt,
        doc_file: next.docFile,
        doc_updated_at: next.docUpdatedAt,
      }, { onConflict: 'id' });

    if (error) {
      throw new Error(`Lỗi lưu config vào Supabase: ${error.message}`);
    }
    
    return next;
  } catch (e) {
    console.error('[Config] Lỗi lưu config:', e);
    throw e;
  }
}
