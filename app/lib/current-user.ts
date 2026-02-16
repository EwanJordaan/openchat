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
    orgId?: string;
    roles: string[];
    permissions: string[];
  };
}

interface CurrentUserApiResponse {
  data?: CurrentUserData;
}

export async function fetchCurrentUser(signal?: AbortSignal): Promise<CurrentUserData | null> {
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
