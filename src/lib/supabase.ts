import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  // Bỏ qua cảnh báo lúc build time
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    console.warn('[Supabase] Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
  }
}

// Khởi tạo Supabase client với Service Role Key để thao tác bypass RLS.
// Chỉ sử dụng instance này trên môi trường Server (Node.js/Next.js API route), KHÔNG ĐƯỢC dùng ở Frontend.
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://missing-url.supabase.co', 
  supabaseServiceKey || 'missing-key', 
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
