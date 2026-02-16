import type { Project } from "@/backend/domain/project";
import type { User } from "@/backend/domain/user";

export interface CreateUserInput {
  email?: string | null;
  name?: string | null;
}

export interface UpdateUserProfileInput {
  email?: string | null;
  name?: string | null;
}

export interface UserAvatar {
  mimeType: string;
  bytes: Uint8Array;
  updatedAt: string;
}

export interface SetUserAvatarInput {
  mimeType: string;
  bytes: Uint8Array;
}

export interface UserRepository {
  getById(userId: string): Promise<User | null>;
  getAvatar(userId: string): Promise<UserAvatar | null>;
  getByExternalIdentity(issuer: string, subject: string): Promise<User | null>;
  createUser(input: CreateUserInput): Promise<User>;
  updateProfile(userId: string, input: UpdateUserProfileInput): Promise<User>;
  setAvatar(userId: string, input: SetUserAvatarInput): Promise<User>;
  clearAvatar(userId: string): Promise<User>;
  touchLastSeen(userId: string, lastSeenAtIso: string): Promise<void>;
  linkExternalIdentity(userId: string, issuer: string, subject: string): Promise<void>;
}

export interface RoleRepository {
  assignRoleToUser(userId: string, roleName: string): Promise<void>;
  listRoleNamesForUser(userId: string): Promise<string[]>;
}

export interface CreateProjectInput {
  id: string;
  ownerUserId: string;
  name: string;
}

export interface ProjectRepository {
  listForUser(userId: string): Promise<Project[]>;
  getByIdForUser(projectId: string, userId: string): Promise<Project | null>;
  createProject(input: CreateProjectInput): Promise<Project>;
}

export interface RepositoryBundle {
  users: UserRepository;
  roles: RoleRepository;
  projects: ProjectRepository;
}
