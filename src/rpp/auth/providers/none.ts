import type { AuthenticationProvider } from "../AuthenticationProvider";

/** No credentials: requests carry no Authorization header. */
export function noAuthentication(): AuthenticationProvider {
  return {
    id: "none",
    state: { status: "unauthenticated" },
    getAuthorizationHeaders: async () => ({}),
    clearSession() {},
  };
}
