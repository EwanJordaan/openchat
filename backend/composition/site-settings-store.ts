import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { OPENCHAT_MODEL_PROVIDER_IDS } from "@/shared/model-providers";
import { OPENCHAT_THEME_IDS } from "@/shared/themes";
import { openChatConfig, type OpenChatConfig } from "@/openchat.config";

const siteSettingsConfigSchema = z
  .object({
    backend: z.object({
      database: z.object({
        defaultAdapter: z.enum(["postgres", "convex"]),
      }),
      auth: z.object({
        requireAuthenticationForSavedChats: z.boolean(),
      }),
    }),
    features: z.object({
      allowGuestResponses: z.boolean(),
    }),
    ai: z.object({
      defaultModelProvider: z.enum(OPENCHAT_MODEL_PROVIDER_IDS),
    }),
    ui: z.object({
      defaultTheme: z.enum(OPENCHAT_THEME_IDS),
    }),
  })
  .strict();

const siteSettingsOverridesSchema = z
  .object({
    backend: z
      .object({
        database: z
          .object({
            defaultAdapter: z.enum(["postgres", "convex"]).optional(),
          })
          .optional(),
        auth: z
          .object({
            requireAuthenticationForSavedChats: z.boolean().optional(),
          })
          .optional(),
      })
      .optional(),
    features: z
      .object({
        allowGuestResponses: z.boolean().optional(),
      })
      .optional(),
    ai: z
      .object({
        defaultModelProvider: z.enum(OPENCHAT_MODEL_PROVIDER_IDS).optional(),
      })
      .optional(),
    ui: z
      .object({
        defaultTheme: z.enum(OPENCHAT_THEME_IDS).optional(),
      })
      .optional(),
  })
  .strict();

export type SiteSettingsOverrides = z.infer<typeof siteSettingsOverridesSchema>;

export interface SiteSettingsSnapshot {
  filePath: string;
  usingDefaults: boolean;
  overrides: SiteSettingsOverrides;
  config: OpenChatConfig;
}

const SITE_SETTINGS_FILE_PATH = path.join(process.cwd(), "data", "site-settings.json");

export function getSiteSettingsFilePath(): string {
  return SITE_SETTINGS_FILE_PATH;
}

export function getEffectiveOpenChatConfigSync(): OpenChatConfig {
  const overrides = readSiteSettingsOverridesSync();
  return applySiteSettingsOverrides(openChatConfig, overrides);
}

export async function getSiteSettingsSnapshot(): Promise<SiteSettingsSnapshot> {
  const overrides = await readSiteSettingsOverrides();

  return {
    filePath: SITE_SETTINGS_FILE_PATH,
    usingDefaults: isEmptyOverrides(overrides),
    overrides,
    config: applySiteSettingsOverrides(openChatConfig, overrides),
  };
}

export async function saveSiteSettingsConfig(input: OpenChatConfig): Promise<SiteSettingsSnapshot> {
  const nextConfig = siteSettingsConfigSchema.parse(input);
  const overrides = deriveSiteSettingsOverrides(nextConfig, openChatConfig);

  await mkdir(path.dirname(SITE_SETTINGS_FILE_PATH), { recursive: true });
  await writeFile(SITE_SETTINGS_FILE_PATH, `${JSON.stringify(overrides, null, 2)}\n`, "utf8");

  return {
    filePath: SITE_SETTINGS_FILE_PATH,
    usingDefaults: isEmptyOverrides(overrides),
    overrides,
    config: applySiteSettingsOverrides(openChatConfig, overrides),
  };
}

export { siteSettingsConfigSchema };

function readSiteSettingsOverridesSync(): SiteSettingsOverrides {
  if (!existsSync(SITE_SETTINGS_FILE_PATH)) {
    return {};
  }

  const raw = readFileSync(SITE_SETTINGS_FILE_PATH, "utf8");
  return parseSiteSettingsOverrides(raw);
}

async function readSiteSettingsOverrides(): Promise<SiteSettingsOverrides> {
  try {
    const raw = await readFile(SITE_SETTINGS_FILE_PATH, "utf8");
    return parseSiteSettingsOverrides(raw);
  } catch (error) {
    if (isMissingFileError(error)) {
      return {};
    }

    throw error;
  }
}

function parseSiteSettingsOverrides(raw: string): SiteSettingsOverrides {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("data/site-settings.json must be valid JSON");
  }

  return siteSettingsOverridesSchema.parse(parsed);
}

function applySiteSettingsOverrides(
  baseConfig: OpenChatConfig,
  overrides: SiteSettingsOverrides,
): OpenChatConfig {
  return {
    backend: {
      database: {
        defaultAdapter:
          overrides.backend?.database?.defaultAdapter ?? baseConfig.backend.database.defaultAdapter,
      },
      auth: {
        requireAuthenticationForSavedChats:
          overrides.backend?.auth?.requireAuthenticationForSavedChats ??
          baseConfig.backend.auth.requireAuthenticationForSavedChats,
      },
    },
    features: {
      allowGuestResponses:
        overrides.features?.allowGuestResponses ?? baseConfig.features.allowGuestResponses,
    },
    ai: {
      defaultModelProvider:
        overrides.ai?.defaultModelProvider ?? baseConfig.ai.defaultModelProvider,
    },
    ui: {
      defaultTheme: overrides.ui?.defaultTheme ?? baseConfig.ui.defaultTheme,
    },
  };
}

function deriveSiteSettingsOverrides(
  nextConfig: OpenChatConfig,
  baseConfig: OpenChatConfig,
): SiteSettingsOverrides {
  const overrides: SiteSettingsOverrides = {};

  if (nextConfig.backend.database.defaultAdapter !== baseConfig.backend.database.defaultAdapter) {
    overrides.backend = {
      ...overrides.backend,
      database: {
        defaultAdapter: nextConfig.backend.database.defaultAdapter,
      },
    };
  }

  if (
    nextConfig.backend.auth.requireAuthenticationForSavedChats !==
    baseConfig.backend.auth.requireAuthenticationForSavedChats
  ) {
    overrides.backend = {
      ...overrides.backend,
      auth: {
        requireAuthenticationForSavedChats:
          nextConfig.backend.auth.requireAuthenticationForSavedChats,
      },
    };
  }

  if (nextConfig.features.allowGuestResponses !== baseConfig.features.allowGuestResponses) {
    overrides.features = {
      allowGuestResponses: nextConfig.features.allowGuestResponses,
    };
  }

  if (nextConfig.ai.defaultModelProvider !== baseConfig.ai.defaultModelProvider) {
    overrides.ai = {
      defaultModelProvider: nextConfig.ai.defaultModelProvider,
    };
  }

  if (nextConfig.ui.defaultTheme !== baseConfig.ui.defaultTheme) {
    overrides.ui = {
      defaultTheme: nextConfig.ui.defaultTheme,
    };
  }

  return overrides;
}

function isEmptyOverrides(overrides: SiteSettingsOverrides): boolean {
  return Object.keys(overrides).length === 0;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as NodeJS.ErrnoException;
  return maybeError.code === "ENOENT";
}
