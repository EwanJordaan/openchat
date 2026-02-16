export function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid date string from database: ${value}`);
    }
    return parsed.toISOString();
  }

  throw new Error("Expected database date value to be a Date or string");
}
