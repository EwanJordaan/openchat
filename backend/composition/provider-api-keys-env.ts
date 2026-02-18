import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ENV_FILE_PATH = path.join(process.cwd(), ".env");

const API_KEY_ENV_NAMES = {
  openrouterApiKey: "OPENROUTER_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  anthropicApiKey: "ANTHROPIC_API_KEY",
  geminiApiKey: "GOOGLE_API_KEY",
} as const;

export interface ProviderApiKeysStatus {
  openrouterConfigured: boolean;
  openaiConfigured: boolean;
  anthropicConfigured: boolean;
  geminiConfigured: boolean;
}

export interface ProviderApiKeysUpdate {
  openrouterApiKey?: string | null;
  openaiApiKey?: string | null;
  anthropicApiKey?: string | null;
  geminiApiKey?: string | null;
}

export function getProviderApiKeysStatusFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderApiKeysStatus {
  return {
    openrouterConfigured: Boolean(env.OPENROUTER_API_KEY?.trim()),
    openaiConfigured: Boolean(env.OPENAI_API_KEY?.trim()),
    anthropicConfigured: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    geminiConfigured: Boolean(env.GOOGLE_API_KEY?.trim()),
  };
}

export async function updateProviderApiKeysEnv(input: ProviderApiKeysUpdate): Promise<{ filePath: string }> {
  const nextValues = new Map<string, string | null>();

  for (const [field, envName] of Object.entries(API_KEY_ENV_NAMES) as Array<
    [keyof ProviderApiKeysUpdate, (typeof API_KEY_ENV_NAMES)[keyof typeof API_KEY_ENV_NAMES]]
  >) {
    if (input[field] === undefined) {
      continue;
    }

    if (input[field] === null) {
      nextValues.set(envName, null);
      continue;
    }

    nextValues.set(envName, serializeEnvValue((input[field] as string).trim()));
  }

  if (nextValues.size === 0) {
    return {
      filePath: ENV_FILE_PATH,
    };
  }

  const existingRaw = existsSync(ENV_FILE_PATH) ? await readFile(ENV_FILE_PATH, "utf8") : "";
  const newline = existingRaw.includes("\r\n") ? "\r\n" : "\n";
  const lines = existingRaw.length > 0 ? existingRaw.split(/\r?\n/) : [];
  const seenKeys = new Set<string>();
  const nextLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      nextLines.push(line);
      continue;
    }

    const key = match[1];
    if (!nextValues.has(key)) {
      nextLines.push(line);
      continue;
    }

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    const nextValue = nextValues.get(key);
    if (nextValue === null) {
      continue;
    }

    nextLines.push(`${key}=${nextValue}`);
  }

  for (const [key, serializedValue] of nextValues) {
    if (!seenKeys.has(key) && serializedValue !== null) {
      nextLines.push(`${key}=${serializedValue}`);
    }
  }

  const sanitizedLines = trimTrailingEmptyLines(nextLines);
  const nextRaw = `${sanitizedLines.join(newline)}${newline}`;
  await writeFile(ENV_FILE_PATH, nextRaw, "utf8");

  return {
    filePath: ENV_FILE_PATH,
  };
}

function serializeEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@$-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function trimTrailingEmptyLines(lines: string[]): string[] {
  let endIndex = lines.length;
  while (endIndex > 0 && lines[endIndex - 1].trim().length === 0) {
    endIndex -= 1;
  }

  if (endIndex === 0) {
    return [];
  }

  return lines.slice(0, endIndex);
}
