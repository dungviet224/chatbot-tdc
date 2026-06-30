/**
 * File storage utility — Supabase Storage
 */
import { supabaseAdmin } from './supabase';

const BUCKET_NAME = 'documents';

// Khởi tạo bucket (có thể bỏ qua nếu đã tạo thủ công)
export async function initBucket() {
  const { data, error } = await supabaseAdmin.storage.getBucket(BUCKET_NAME);
  if (error && error.message.includes('not found')) {
    await supabaseAdmin.storage.createBucket(BUCKET_NAME, { public: true });
  }
}

// Lấy public URL của file (ví dụ file PDF hiển thị)
export function getDocViewerUrl(): string {
  // Trả về trực tiếp endpoint API của ứng dụng để fetch stream từ Supabase
  return `/api/doc/serve-pdf`;
}

export function getSupabasePublicUrl(filename: string): string {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${filename}`;
}

// Upload file lên Supabase Storage
export async function uploadFileToSupabase(filename: string, buffer: Buffer, contentType: string) {
  await initBucket();
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(filename, buffer, {
      contentType,
      upsert: true,
    });
  
  if (error) {
    throw new Error(`Upload lỗi: ${error.message}`);
  }
}

export async function downloadFileFromSupabase(filename: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .download(filename);
    
  if (error || !data) {
    throw new Error(`Download lỗi: ${error?.message}`);
  }
  return data;
}

export async function deleteFileFromSupabase(filename: string) {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .remove([filename]);
    
  if (error) {
    console.error(`Lỗi xóa file cũ: ${error.message}`);
  }
}

// Trả về luồng dữ liệu (Stream) thay vì buffer cục bộ
export async function getFileStreamFromSupabase(filename: string): Promise<ReadableStream | null> {
  // Chuyển sang download blob, Supabase js chưa hỗ trợ createReadStream thuần, ta fetch trực tiếp
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  
  const url = `${supabaseUrl}/storage/v1/object/${BUCKET_NAME}/${filename}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceKey}`
    }
  });
  
  if (!res.ok) return null;
  return res.body;
}

// Legacy helpers cho các đoạn code cũ chờ refactor
export function getDocxPath(): string {
  return ''; // Không còn dùng local path
}

export function getOutlineJsonPath(): string {
  return '';
}

export function getEmbeddingsJsonPath(): string {
  return ''; 
}
