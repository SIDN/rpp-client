import type { AuthenticationProvider, AuthenticationState } from "../AuthenticationProvider";

// RFC 7617: the user-id cannot contain a colon, and control characters are not allowed in either part.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

function base64OfUtf8(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** HTTP Basic (RFC 7617; core §19). Only safe over HTTPS, which the transport enforces outside development mode. */
export function basicAuthentication(credentials: { username: string; password: string }): AuthenticationProvider {
  const { username, password } = credentials;
  if (username === "" || username.includes(":") || CONTROL.test(username)) {
    throw new TypeError("A Basic user name must be non-empty and contain no colon or control character");
  }
  if (CONTROL.test(password)) throw new TypeError("A Basic password must not contain control characters");

  let header: string | undefined = `Basic ${base64OfUtf8(`${username}:${password}`)}`;
  const state: AuthenticationState = { status: "credentials-supplied", method: "basic", principal: username };

  return {
    id: "basic",
    state,
    async getAuthorizationHeaders() {
      if (header === undefined) throw new Error("The credentials of this session were cleared");
      return { Authorization: header };
    },
    clearSession() {
      header = undefined;
    },
  };
}
