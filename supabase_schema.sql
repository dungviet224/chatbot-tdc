-- Cài đặt extension pgvector
create extension if not exists vector;

-- 1. Bảng lưu cấu hình hệ thống (Chỉ có 1 dòng duy nhất)
create table if not exists public.app_config (
  id integer primary key default 1,
  api_base text,
  api_key text,
  embed_model text,
  chat_model text,
  rules text,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  doc_file text,
  doc_updated_at timestamp with time zone
);

-- Ràng buộc để chỉ cho phép 1 dòng (id = 1)
alter table public.app_config add constraint app_config_single_row check (id = 1);
insert into public.app_config (id) values (1) on conflict do nothing;

-- 2. Bảng theo dõi đăng nhập (Brute force protection)
create table if not exists public.login_attempts (
  ip_address text primary key,
  attempts integer default 0,
  locked_until timestamp with time zone
);

-- 3. Bảng lưu sơ đồ trang (Outline)
create table if not exists public.document_outline (
  id text primary key,
  text text not null,
  level integer not null,
  page integer not null default 1,
  sort_order integer not null
);

-- 4. Bảng lưu vector (Vector Database)
create table if not exists public.document_chunks (
  id bigint primary key generated always as identity,
  content text not null,
  source text,
  embedding vector(3072), -- text-embedding-3-large mặc định là 3072 chiều. Nếu đổi model cần update chiều ở đây
  embedding_type text,
  section_id text,
  section_name text
);

-- Tạo function (RPC) để tìm kiếm Semantic Search bằng pgvector
create or replace function match_document_chunks(
  query_embedding vector(3072),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  content text,
  source text,
  section_id text,
  section_name text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    document_chunks.id,
    document_chunks.content,
    document_chunks.source,
    document_chunks.section_id,
    document_chunks.section_name,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Setup Row Level Security (RLS) để an toàn
alter table public.app_config enable row level security;
alter table public.login_attempts enable row level security;
alter table public.document_outline enable row level security;
alter table public.document_chunks enable row level security;

-- (Tùy chọn) Policy: Mặc định tắt truy cập từ trình duyệt bằng API key public
-- Mọi truy cập vào những bảng này đều sẽ đi qua Next.js Server (dùng service_role_key)
