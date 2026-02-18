export interface CurrentUserData {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatarMimeType: string | null;
    avatarUpdatedAt: string | null;
    hasAvatar: boolean;
    createdAt: string;
    updatedAt: string;
    lastSeenAt: string;
  };
  principal: {
    subject: string;
    issuer: string;
    providerName?: string;
    authMethod?: "oidc";
    orgId?: string;
    roles: string[];
    permissions: string[];
  };
}

interface CurrentUserApiResponse {
  data?: CurrentUserData;
}

const CURRENT_USER_CACHE_TTL_MS = 30 * 60 * 1000;
const CURRENT_USER_CACHE_STORAGE_KEY = "openchat_current_user_cache_v1";

interface CurrentUserCacheEntry {
  value: CurrentUserData | null;
  expiresAt: number;
}

let currentUserCache: CurrentUserCacheEntry | null = null;
let currentUserInFlightRequest: Promise<CurrentUserData | null> | null = null;

export async function fetchCurrentUser(_signal?: AbortSignal): Promise<CurrentUserData | null> {
  const cached = getCachedCurrentUser();
  if (cached !== undefined) {
    return cached;
  }

  if (currentUserInFlightRequest) {
    return currentUserInFlightRequest;
  }

  const request = requestCurrentUser(_signal);
  currentUserInFlightRequest = request;

  try {
    const user = await request;
    setCurrentUserCache(user);
    return user;
  } finally {
    if (currentUserInFlightRequest === request) {
      currentUserInFlightRequest = null;
    }
  }
}

export function getCachedCurrentUser(): CurrentUserData | null | undefined {
  const memoryValue = getMemoryCachedCurrentUser();
  if (memoryValue !== undefined) {
    return cloneCurrentUserData(memoryValue);
  }

  const persisted = readPersistedCurrentUser();
  if (!persisted) {
    return undefined;
  }

  if (persisted.expiresAt <= Date.now()) {
    clearPersistedCurrentUser();
    return undefined;
  }

  currentUserCache = {
    value: cloneCurrentUserData(persisted.value),
    expiresAt: persisted.expiresAt,
  };

  return cloneCurrentUserData(persisted.value);
}

export function setCurrentUserCache(value: CurrentUserData | null): void {
  if (!value) {
    currentUserCache = null;
    clearPersistedCurrentUser();
    return;
  }

  const snapshot = cloneCurrentUserData(value);

  currentUserCache = {
    value: snapshot,
    expiresAt: Date.now() + CURRENT_USER_CACHE_TTL_MS,
  };

  writePersistedCurrentUser(currentUserCache);
}

export function clearCurrentUserCache(): void {
  currentUserCache = null;
  currentUserInFlightRequest = null;
  clearPersistedCurrentUser();
}

async function requestCurrentUser(signal?: AbortSignal): Promise<CurrentUserData | null> {
  const response = await fetch("/api/v1/me", {
    credentials: "include",
    cache: "no-store",
    signal,
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to load current user (${response.status})`);
  }

  const payload = (await response.json()) as CurrentUserApiResponse;
  if (!payload.data) {
    throw new Error("Current user response did not include data");
  }

  return payload.data;
}

function getMemoryCachedCurrentUser(): CurrentUserData | null | undefined {
  if (!currentUserCache) {
    return undefined;
  }

  if (currentUserCache.expiresAt <= Date.now()) {
    currentUserCache = null;
    return undefined;
  }

  if (!currentUserCache.value) {
    currentUserCache = null;
    return undefined;
  }

  return currentUserCache.value;
}

function cloneCurrentUserData(value: CurrentUserData | null): CurrentUserData | null {
  if (!value) {
    return null;
  }

  return {
    user: {
      ...value.user,
    },
    principal: {
      ...value.principal,
      roles: [...value.principal.roles],
      permissions: [...value.principal.permissions],
    },
  };
}

function hasDom(): boolean {
  return typeof window !== "undefined";
}

function readPersistedCurrentUser(): CurrentUserCacheEntry | null {
  if (!hasDom()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CURRENT_USER_CACHE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CurrentUserCacheEntry;
    if (!parsed || typeof parsed.expiresAt !== "number") {
      return null;
    }

    if (!parsed.value) {
      clearPersistedCurrentUser();
      return null;
    }

    return {
      value: cloneCurrentUserData(parsed.value),
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function writePersistedCurrentUser(entry: CurrentUserCacheEntry): void {
  if (!hasDom()) {
    return;
  }

  try {
    window.localStorage.setItem(CURRENT_USER_CACHE_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage write failures.
  }
}

function clearPersistedCurrentUser(): void {
  if (!hasDom()) {
    return;
  }

  try {
    window.localStorage.removeItem(CURRENT_USER_CACHE_STORAGE_KEY);
  } catch {
    // Ignore storage removal failures.
  }
}

export function getDisplayName(name: string | null | undefined, email: string | null | undefined): string {
  if (name && name.trim().length > 0) {
    return name.trim();
  }

  if (email && email.trim().length > 0) {
    return email.trim();
  }

  return "Anonymous";
}

export function getAvatarInitial(name: string | null | undefined, email: string | null | undefined): string {
  const label = getDisplayName(name, email).trim();
  if (label.length === 0) {
    return "?";
  }

  return label[0].toUpperCase();
}
