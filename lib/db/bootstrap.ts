import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { adminSeedEmail, adminSeedPassword } from "@/lib/env";
import { createId, nowIso } from "@/lib/utils";

let bootstrapPromise: Promise<void> | null = null;

const defaultModels = [
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    provider: "openai",
    description: "Fast, lightweight model for most tasks",
    isDefault: 1,
    isGuestAllowed: 1,
    maxOutputTokens: 2048,
  },
  {
    id: "gpt-4.1-mini",
    displayName: "GPT-4.1 mini",
    provider: "openai",
    description: "Balanced quality and speed",
    isDefault: 0,
    isGuestAllowed: 1,
    maxOutputTokens: 4096,
  },
  {
    id: "gpt-4.1",
    displayName: "GPT-4.1",
    provider: "openai",
    description: "Higher quality for deeper reasoning",
    isDefault: 0,
    isGuestAllowed: 0,
    maxOutputTokens: 4096,
  },
];

const defaultRoleLimits = [
  { role: "guest", dailyMessageLimit: 10000, maxAttachmentCount: 2, maxAttachmentMb: 8 },
  { role: "user", dailyMessageLimit: 800, maxAttachmentCount: 5, maxAttachmentMb: 12 },
  { role: "admin", dailyMessageLimit: 5000, maxAttachmentCount: 10, maxAttachmentMb: 20 },
] as const;

export async function ensureDatabase() {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap();
  }
  await bootstrapPromise;
}

async function runBootstrap() {
  const { provider, query } = getDb();

  const statements =
    provider === "mysql"
      ? mysqlBootstrapStatements
      : postgresBootstrapStatements;

  for (const statement of statements) {
    try {
      await query(sql.raw(statement));
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const safeToIgnore =
        message.includes("already exists") ||
        message.includes("duplicate key") ||
        message.includes("duplicate index") ||
        message.includes("errno 1061");

      if (!safeToIgnore) {
        throw error;
      }
    }
  }

  const now = nowIso();

  if (provider === "mysql") {
    await query(sql`
      insert ignore into provider_credentials (id, provider, base_url, encrypted_api_key, is_enabled, updated_at)
      values (${createId("prv")}, ${"openai"}, ${"https://api.openai.com/v1"}, ${""}, ${1}, ${now})
    `);

    for (const model of defaultModels) {
      await query(sql`
        insert ignore into models (id, provider, display_name, description, is_enabled, is_default, is_guest_allowed, max_output_tokens, created_at, updated_at)
        values (
          ${model.id},
          ${model.provider},
          ${model.displayName},
          ${model.description},
          ${1},
          ${model.isDefault},
          ${model.isGuestAllowed},
          ${model.maxOutputTokens},
          ${now},
          ${now}
        )
      `);
    }

    for (const role of defaultRoleLimits) {
      await query(sql`
        insert ignore into role_limits (id, role, daily_message_limit, max_attachment_count, max_attachment_mb, updated_at)
        values (
          ${createId("rlm")},
          ${role.role},
          ${role.dailyMessageLimit},
          ${role.maxAttachmentCount},
          ${role.maxAttachmentMb},
          ${now}
        )
      `);
    }

    await query(sql`
      insert ignore into app_settings (setting_key, value_json, updated_at)
      values
        (${"guest_enabled"}, ${JSON.stringify(true)}, ${now}),
        (${"guest_allowed_models"}, ${JSON.stringify(defaultModels.filter((m) => m.isGuestAllowed).map((m) => m.id))}, ${now}),
        (${"default_model_id"}, ${JSON.stringify("gpt-4o-mini")}, ${now})
    `);

    return;
  }

  await query(sql`
    insert into provider_credentials (id, provider, base_url, encrypted_api_key, is_enabled, updated_at)
    values (${createId("prv")}, ${"openai"}, ${"https://api.openai.com/v1"}, ${""}, ${1}, ${now})
    on conflict (provider) do nothing
  `);

  for (const model of defaultModels) {
    await query(sql`
      insert into models (id, provider, display_name, description, is_enabled, is_default, is_guest_allowed, max_output_tokens, created_at, updated_at)
      values (
        ${model.id},
        ${model.provider},
        ${model.displayName},
        ${model.description},
        ${1},
        ${model.isDefault},
        ${model.isGuestAllowed},
        ${model.maxOutputTokens},
        ${now},
        ${now}
      )
      on conflict (id) do nothing
    `);
  }

  for (const role of defaultRoleLimits) {
    await query(sql`
      insert into role_limits (id, role, daily_message_limit, max_attachment_count, max_attachment_mb, updated_at)
      values (
        ${createId("rlm")},
        ${role.role},
        ${role.dailyMessageLimit},
        ${role.maxAttachmentCount},
        ${role.maxAttachmentMb},
        ${now}
      )
      on conflict (role) do nothing
    `);
  }

  await query(sql`
    insert into app_settings (setting_key, value_json, updated_at)
    values
      (${"guest_enabled"}, ${JSON.stringify(true)}, ${now}),
      (${"guest_allowed_models"}, ${JSON.stringify(defaultModels.filter((m) => m.isGuestAllowed).map((m) => m.id))}, ${now}),
      (${"default_model_id"}, ${JSON.stringify("gpt-4o-mini")}, ${now})
    on conflict (setting_key) do nothing
  `);

  await seedAdminUser(provider, query);
}

async function seedAdminUser(
  provider: "postgres" | "supabase" | "neon" | "mysql",
  query: ReturnType<typeof getDb>["query"],
) {
  if (!adminSeedPassword) return;

  const existing = await query<{ id: string }>(
    sql`select id from users where lower(email) = ${adminSeedEmail} limit 1`,
  );

  const now = nowIso();
  const userId = existing[0]?.id || createId("usr");
  const passwordHash = await hashPassword(adminSeedPassword);

  if (existing[0]) {
    await query(sql`
      update users
      set password_hash = ${passwordHash}, name = ${"Admin"}, is_active = ${1}, updated_at = ${now}
      where id = ${userId}
    `);
  } else {
    await query(sql`
      insert into users (id, email, password_hash, name, image_url, is_active, created_at, updated_at)
      values (${userId}, ${adminSeedEmail}, ${passwordHash}, ${"Admin"}, ${null}, ${1}, ${now}, ${now})
    `);
  }

  if (provider === "mysql") {
    await query(
      sql`insert ignore into user_roles (id, user_id, role, created_at) values (${createId("url")}, ${userId}, ${"user"}, ${now})`,
    );
    await query(
      sql`insert ignore into user_roles (id, user_id, role, created_at) values (${createId("url")}, ${userId}, ${"admin"}, ${now})`,
    );
    return;
  }

  await query(
    sql`insert into user_roles (id, user_id, role, created_at)
        values (${createId("url")}, ${userId}, ${"user"}, ${now})
        on conflict (user_id, role) do nothing`,
  );
  await query(
    sql`insert into user_roles (id, user_id, role, created_at)
        values (${createId("url")}, ${userId}, ${"admin"}, ${now})
        on conflict (user_id, role) do nothing`,
  );
}

const postgresBootstrapStatements = [
  `
  create table if not exists users (
    id text primary key,
    email text not null unique,
    password_hash text not null,
    name text not null,
    image_url text,
    is_active integer not null default 1,
    created_at text not null,
    updated_at text not null
  )
  `,
  `
  create table if not exists user_roles (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    role text not null,
    created_at text not null,
    unique (user_id, role)
  )
  `,
  `
  create table if not exists sessions (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    token_hash text not null unique,
    expires_at text not null,
    created_at text not null
  )
  `,
  `
  create table if not exists chats (
    id text primary key,
    user_id text references users(id) on delete cascade,
    guest_id text,
    title text not null,
    model_id text not null,
    archived integer not null default 0,
    created_at text not null,
    updated_at text not null
  )
  `,
  `
  create table if not exists messages (
    id text primary key,
    chat_id text not null references chats(id) on delete cascade,
    role text not null,
    content text not null,
    model_id text not null,
    attachments_json text not null,
    created_at text not null
  )
  `,
  `
  create table if not exists files (
    id text primary key,
    owner_user_id text references users(id) on delete set null,
    guest_id text,
    chat_id text references chats(id) on delete set null,
    file_name text not null,
    mime_type text not null,
    size_bytes integer not null,
    storage_path text not null,
    created_at text not null
  )
  `,
  `
  create table if not exists app_settings (
    setting_key text primary key,
    value_json text not null,
    updated_at text not null
  )
  `,
  `
  create table if not exists provider_credentials (
    id text primary key,
    provider text not null unique,
    base_url text not null,
    encrypted_api_key text,
    is_enabled integer not null default 1,
    updated_at text not null
  )
  `,
  `
  create table if not exists models (
    id text primary key,
    provider text not null,
    display_name text not null,
    description text not null,
    is_enabled integer not null default 1,
    is_default integer not null default 0,
    is_guest_allowed integer not null default 0,
    max_output_tokens integer not null default 2048,
    created_at text not null,
    updated_at text not null
  )
  `,
  `
  create table if not exists role_limits (
    id text primary key,
    role text not null unique,
    daily_message_limit integer not null,
    max_attachment_count integer not null,
    max_attachment_mb integer not null,
    updated_at text not null
  )
  `,
  `
  create table if not exists user_settings (
    user_id text primary key references users(id) on delete cascade,
    theme text not null,
    compact_mode integer not null,
    enter_to_send integer not null,
    show_tokens integer not null,
    timezone text not null,
    language text not null,
    auto_title_chats integer not null,
    updated_at text not null
  )
  `,
  `
  create table if not exists usage_counters (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    date_key text not null,
    message_count integer not null,
    token_count integer not null,
    updated_at text not null,
    unique (user_id, date_key)
  )
  `,
  `
  create table if not exists audit_logs (
    id text primary key,
    actor_user_id text references users(id) on delete set null,
    action text not null,
    target_type text not null,
    target_id text,
    payload_json text not null,
    created_at text not null
  )
  `,
  `create index if not exists idx_chats_user on chats(user_id, updated_at)`,
  `create index if not exists idx_chats_guest on chats(guest_id, updated_at)`,
  `create index if not exists idx_messages_chat on messages(chat_id, created_at)`,
  `create index if not exists idx_sessions_user on sessions(user_id, expires_at)`,
  `create index if not exists idx_usage_user_day on usage_counters(user_id, date_key)`,
];

const mysqlBootstrapStatements = [
  `
  create table if not exists users (
    id varchar(191) primary key,
    email varchar(255) not null unique,
    password_hash text not null,
    name varchar(255) not null,
    image_url text,
    is_active tinyint not null default 1,
    created_at varchar(40) not null,
    updated_at varchar(40) not null
  )
  `,
  `
  create table if not exists user_roles (
    id varchar(191) primary key,
    user_id varchar(191) not null,
    role varchar(50) not null,
    created_at varchar(40) not null,
    unique key uniq_user_role (user_id, role),
    constraint fk_user_roles_user foreign key (user_id) references users(id) on delete cascade
  )
  `,
  `
  create table if not exists sessions (
    id varchar(191) primary key,
    user_id varchar(191) not null,
    token_hash varchar(255) not null unique,
    expires_at varchar(40) not null,
    created_at varchar(40) not null,
    constraint fk_sessions_user foreign key (user_id) references users(id) on delete cascade
  )
  `,
  `
  create table if not exists chats (
    id varchar(191) primary key,
    user_id varchar(191),
    guest_id varchar(191),
    title text not null,
    model_id varchar(191) not null,
    archived tinyint not null default 0,
    created_at varchar(40) not null,
    updated_at varchar(40) not null,
    constraint fk_chats_user foreign key (user_id) references users(id) on delete cascade
  )
  `,
  `
  create table if not exists messages (
    id varchar(191) primary key,
    chat_id varchar(191) not null,
    role varchar(40) not null,
    content longtext not null,
    model_id varchar(191) not null,
    attachments_json longtext not null,
    created_at varchar(40) not null,
    constraint fk_messages_chat foreign key (chat_id) references chats(id) on delete cascade
  )
  `,
  `
  create table if not exists files (
    id varchar(191) primary key,
    owner_user_id varchar(191),
    guest_id varchar(191),
    chat_id varchar(191),
    file_name text not null,
    mime_type varchar(191) not null,
    size_bytes int not null,
    storage_path text not null,
    created_at varchar(40) not null,
    constraint fk_files_user foreign key (owner_user_id) references users(id) on delete set null,
    constraint fk_files_chat foreign key (chat_id) references chats(id) on delete set null
  )
  `,
  `
  create table if not exists app_settings (
    setting_key varchar(191) primary key,
    value_json longtext not null,
    updated_at varchar(40) not null
  )
  `,
  `
  create table if not exists provider_credentials (
    id varchar(191) primary key,
    provider varchar(191) not null unique,
    base_url text not null,
    encrypted_api_key longtext,
    is_enabled tinyint not null default 1,
    updated_at varchar(40) not null
  )
  `,
  `
  create table if not exists models (
    id varchar(191) primary key,
    provider varchar(191) not null,
    display_name varchar(255) not null,
    description text not null,
    is_enabled tinyint not null default 1,
    is_default tinyint not null default 0,
    is_guest_allowed tinyint not null default 0,
    max_output_tokens int not null default 2048,
    created_at varchar(40) not null,
    updated_at varchar(40) not null
  )
  `,
  `
  create table if not exists role_limits (
    id varchar(191) primary key,
    role varchar(50) not null unique,
    daily_message_limit int not null,
    max_attachment_count int not null,
    max_attachment_mb int not null,
    updated_at varchar(40) not null
  )
  `,
  `
  create table if not exists user_settings (
    user_id varchar(191) primary key,
    theme varchar(20) not null,
    compact_mode tinyint not null,
    enter_to_send tinyint not null,
    show_tokens tinyint not null,
    timezone varchar(120) not null,
    language varchar(20) not null,
    auto_title_chats tinyint not null,
    updated_at varchar(40) not null,
    constraint fk_user_settings_user foreign key (user_id) references users(id) on delete cascade
  )
  `,
  `
  create table if not exists usage_counters (
    id varchar(191) primary key,
    user_id varchar(191) not null,
    date_key varchar(20) not null,
    message_count int not null,
    token_count int not null,
    updated_at varchar(40) not null,
    unique key uniq_usage_user_date (user_id, date_key),
    constraint fk_usage_user foreign key (user_id) references users(id) on delete cascade
  )
  `,
  `
  create table if not exists audit_logs (
    id varchar(191) primary key,
    actor_user_id varchar(191),
    action varchar(191) not null,
    target_type varchar(191) not null,
    target_id varchar(191),
    payload_json longtext not null,
    created_at varchar(40) not null,
    constraint fk_audit_user foreign key (actor_user_id) references users(id) on delete set null
  )
  `,
  `create index idx_chats_user on chats(user_id, updated_at)`,
  `create index idx_chats_guest on chats(guest_id, updated_at)`,
  `create index idx_messages_chat on messages(chat_id, created_at)`,
  `create index idx_sessions_user on sessions(user_id, expires_at)`,
  `create index idx_usage_user_day on usage_counters(user_id, date_key)`,
];
