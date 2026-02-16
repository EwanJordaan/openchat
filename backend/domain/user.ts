export interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarMimeType: string | null;
  avatarUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}
