import type { AuthorizationContext } from "../client/RppTransport";

export type AuthenticationState =
  | { status: "unauthenticated" }
  /** Basic is stateless: the server checks the credentials on each request, so they are supplied, not verified. */
  | { status: "credentials-supplied"; method: "basic"; principal: string };

/** One authentication mechanism. The transport asks it for headers; screens read only `state`. */
export interface AuthenticationProvider {
  readonly id: "none" | "basic";
  readonly state: AuthenticationState;
  getAuthorizationHeaders(context: AuthorizationContext): Promise<Readonly<Record<string, string>>>;
  /** Forgets the credentials. Later requests through this provider fail instead of going out unauthenticated. */
  clearSession(): void;
}
