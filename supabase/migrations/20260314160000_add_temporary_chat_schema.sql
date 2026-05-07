create table if not exists public.temporary_chats (
  id text primary key,
  owner_user_id text references public.users(id) on delete cascade,
  guest_id text not null,
  model_id text not null,
  messages_json text not null,
  file_ids_json text not null,
  created_at text not null,
  updated_at text not null,
  expires_at text not null
);

create index if not exists idx_temporary_chats_user
  on public.temporary_chats(owner_user_id, updated_at);

create index if not exists idx_temporary_chats_guest
  on public.temporary_chats(guest_id, updated_at);

create index if not exists idx_temporary_chats_expires
  on public.temporary_chats(expires_at);
