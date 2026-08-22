-- 001_agentic_core.sql — agentic rebuild baseline
-- Generated via Drizzle bootstrap; this file documents the pgvector + pg_trgm setup.
-- The authoritative schema is applied at runtime by lib/db/bootstrap.ts (ensureDatabase).
-- Apply with: psql $DATABASE_URL -f supabase/migrations/001_agentic_core.sql
-- Or let the app create tables on first boot, or: bunx drizzle-kit push

-- Required extensions
create extension if not exists vector;
create extension if not exists pg_trgm;

-- Projects — logical workspace folders that own documents/chats
create table if not exists projects (
  id text primary key,
  owner_user_id text references users(id) on delete set null,
  title text not null,
  description text,
  visibility text not null default 'private',
  created_at text not null,
  updated_at text not null
);

create table if not exists project_members (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null,
  created_at text not null,
  unique (project_id, user_id)
);

-- Documents (source of truth for ingested files/urls/text)
create table if not exists documents (
  id text primary key,
  project_id text references projects(id) on delete set null,
  owner_user_id text references users(id) on delete set null,
  guest_id text,
  title text not null,
  source_type text not null, -- upload | url | text
  source_url text,
  mime_type text,
  storage_key text,
  sha256 text,
  page_count integer,
  token_count integer,
  status text not null default 'pending', -- pending | parsing | chunking | embedding | ready | failed
  error text,
  created_at text not null,
  updated_at text not null
);

-- Chunks — per-section slices with optional embeddings + tsv
create table if not exists document_chunks (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  project_id text references projects(id) on delete set null,
  ordinal integer not null,
  heading text,
  page integer,
  char_offset integer,
  content text not null,
  tsv tsvector,
  embedding vector(1536),
  token_count integer
);

create index if not exists idx_doc_chunks_doc on document_chunks(document_id, ordinal);
create index if not exists idx_doc_chunks_project on document_chunks(project_id);
create index if not exists idx_documents_project on documents(project_id, updated_at);
create index if not exists idx_documents_owner on documents(owner_user_id, updated_at);
create index if not exists idx_documents_guest on documents(guest_id, updated_at);
create index if not exists idx_doc_chunks_embedding_hnsw on document_chunks using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
create index if not exists idx_doc_chunks_tsv_gin on document_chunks using gin (tsv);

-- Chats / messages / tool events (agentic extensions)
create table if not exists chats (
  id text primary key,
  project_id text references projects(id) on delete set null,
  user_id text references users(id) on delete cascade,
  guest_id text,
  title text not null,
  model_id text not null,
  agent_preset text,
  archived integer not null default 0,
  is_pinned integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists messages (
  id text primary key,
  chat_id text not null references chats(id) on delete cascade,
  role text not null, -- user | assistant | system | tool
  content text not null,
  model_id text not null,
  attachments_json text not null default '[]',
  tool_calls text,
  tool_call_id text,
  citations text,
  token_count integer,
  created_at text not null
);

create table if not exists tool_events (
  id text primary key,
  chat_id text not null references chats(id) on delete cascade,
  message_id text references messages(id) on delete set null,
  tool_name text not null,
  input text not null,
  output text,
  status text not null,
  latency_ms integer,
  created_at text not null
);

-- Auth / app tables are created alongside by bootstrap.ts — omitted for brevity.
-- See lib/db/bootstrap.ts -> postgresBootstrapStatements for the full set.
