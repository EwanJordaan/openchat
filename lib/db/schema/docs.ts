import { int as mysqlInt, mysqlTable, text as mysqlText, varchar as mysqlVarchar } from "drizzle-orm/mysql-core";
import { customType, integer as pgInteger, pgTable, text as pgText } from "drizzle-orm/pg-core";

// pgvector custom type — stores embedding as JSON string vector(1536) in postgres
export const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    const dims = config?.dimensions ?? 1536;
    return `vector(${dims})`;
  },
  toDriver(value: number[]) {
    // drizzle expects string for vector; pgvector expects "[1,2,3]" literal
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string) {
    const str = String(value).trim();
    if (str.startsWith("[") && str.endsWith("]")) {
      const inner = str.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(",").map((s) => Number(s.trim()));
    }
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed as number[];
    } catch {
      // fall through
    }
    return [] as number[];
  },
});

export const pgDocuments = pgTable("documents", {
  id: pgText("id").primaryKey(),
  project_id: pgText("project_id"),
  owner_user_id: pgText("owner_user_id"),
  guest_id: pgText("guest_id"),
  title: pgText("title").notNull(),
  source_type: pgText("source_type").notNull(),
  source_url: pgText("source_url"),
  mime_type: pgText("mime_type"),
  storage_key: pgText("storage_key"),
  sha256: pgText("sha256"),
  page_count: pgInteger("page_count"),
  token_count: pgInteger("token_count"),
  status: pgText("status").notNull().default("pending"),
  error: pgText("error"),
  created_at: pgText("created_at").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const pgDocumentChunks = pgTable("document_chunks", {
  id: pgText("id").primaryKey(),
  document_id: pgText("document_id").notNull(),
  project_id: pgText("project_id"),
  ordinal: pgInteger("ordinal").notNull(),
  heading: pgText("heading"),
  page: pgInteger("page"),
  char_offset: pgInteger("char_offset"),
  content: pgText("content").notNull(),
  tsv: pgText("tsv"),
  embedding: vector("embedding", { dimensions: 1536 }),
  token_count: pgInteger("token_count"),
});

export const mysqlDocuments = mysqlTable("documents", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  project_id: mysqlVarchar("project_id", { length: 191 }),
  owner_user_id: mysqlVarchar("owner_user_id", { length: 191 }),
  guest_id: mysqlVarchar("guest_id", { length: 191 }),
  title: mysqlText("title").notNull(),
  source_type: mysqlVarchar("source_type", { length: 20 }).notNull(),
  source_url: mysqlText("source_url"),
  mime_type: mysqlVarchar("mime_type", { length: 191 }),
  storage_key: mysqlText("storage_key"),
  sha256: mysqlVarchar("sha256", { length: 128 }),
  page_count: mysqlInt("page_count"),
  token_count: mysqlInt("token_count"),
  status: mysqlVarchar("status", { length: 20 }).notNull().default("pending"),
  error: mysqlText("error"),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlDocumentChunks = mysqlTable("document_chunks", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  document_id: mysqlVarchar("document_id", { length: 191 }).notNull(),
  project_id: mysqlVarchar("project_id", { length: 191 }),
  ordinal: mysqlInt("ordinal").notNull(),
  heading: mysqlText("heading"),
  page: mysqlInt("page"),
  char_offset: mysqlInt("char_offset"),
  content: mysqlText("content").notNull(),
  tsv: mysqlText("tsv"),
  embedding: mysqlText("embedding"),
  token_count: mysqlInt("token_count"),
});
