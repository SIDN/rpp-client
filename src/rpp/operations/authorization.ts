import { TransportError } from "../errors/TransportError";
import type { ObjectAuthorization } from "./types";

function toBase64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** `authinfo value=<base64>[, roid=<roid>]` (core §6.1). */
export function authorizationHeaderValue(authorization: ObjectAuthorization): string {
  if (authorization.value === "") {
    throw new TransportError("invalid-request", "Object authorisation information is empty");
  }
  if (authorization.roid !== undefined && !/^[\x21-\x2b\x2d-\x7e]+$/.test(authorization.roid)) {
    throw new TransportError("invalid-request", "The roid of the authorisation information is not printable ASCII without comma");
  }
  const roid = authorization.roid === undefined ? "" : `, roid=${authorization.roid}`;
  return `authinfo value=${toBase64(authorization.value)}${roid}`;
}
