import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ENV_FILE_PATH = path.join(process.cwd(), ".env");

export interface AdminAuthEnvUpdate {
  passwordHash: string;
}

export async function updateAdminAuthEnv(input: AdminAuthEnvUpdate): Promise<{ filePath: string }> {
  const nextValues = new Map<string, string>([
    ["BACKEND_ADMIN_PASSWORD_HASH", serializeEnvValue(input.passwordHash)],
  ]);

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
    const nextValue = nextValues.get(key);
    if (!nextValue) {
      nextLines.push(line);
      continue;
    }

    if (seenKeys.has(key)) {
      continue;
    }

    nextLines.push(`${key}=${nextValue}`);
    seenKeys.add(key);
  }

  for (const [key, serializedValue] of nextValues) {
    if (!seenKeys.has(key)) {
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
