import type { Principal } from "@/backend/domain/principal";

export interface AuthContextProvider {
  getPrincipal(authorizationHeader: string | null): Promise<Principal | null>;
}
