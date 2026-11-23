import { z } from "zod";

export type AuthChoice = "none" | "basic";

/** How requests name their preset: the `RPP-Preset` header, media type parameters, or not at all. */
export type PresetSignallingChoice = "header" | "media-type" | "none";

/** `default` follows the preset the server marks as default. */
export type PresetSelection = "default" | { id: string; version: string };

export interface PresetSettings {
  signalling: PresetSignallingChoice;
  selection: PresetSelection;
}

// The proxy's default signalling method; the server does not say which it supports, so this is a choice.
export const DEFAULT_PRESET_SETTINGS: PresetSettings = { signalling: "header", selection: "default" };

export interface ConnectionProfile {
  /** The RPP base URL: https, or http in development mode. */
  baseUrl: string;
  allowInsecureHttp: boolean;
  auth: { type: "none" } | { type: "basic"; username: string };
  preset: PresetSettings;
}

/** What a session needs beyond the profile. Never stored. */
export interface Credentials {
  password: string;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

function checkAddress(baseUrl: string, allowInsecureHttp: boolean, ctx: z.RefinementCtx, path: (string | number)[]) {
  const issue = (message: string) => ctx.addIssue({ code: "custom", path, message });
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return issue("Enter the full address, starting with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return issue("The address must start with https://");
  if (url.protocol === "http:" && !allowInsecureHttp) {
    return issue("Plain HTTP sends everything readable. Use https://, or allow plain HTTP for development.");
  }
  if (url.username !== "" || url.password !== "") return issue("Do not put a user name or password in the address");
  if (url.search !== "" || url.hash !== "") return issue("The address cannot have a query or a fragment");
}

export const connectionFormSchema = z
  .object({
    baseUrl: z.string().trim().min(1, "Enter the address of the RPP server"),
    allowInsecureHttp: z.boolean(),
    authType: z.enum(["none", "basic"]),
    username: z.string(),
    password: z.string(),
  })
  .superRefine((form, ctx) => {
    if (form.baseUrl) checkAddress(form.baseUrl, form.allowInsecureHttp, ctx, ["baseUrl"]);
    if (form.authType !== "basic") return;
    if (form.username === "") ctx.addIssue({ code: "custom", path: ["username"], message: "Enter the user name" });
    else if (form.username.includes(":")) ctx.addIssue({ code: "custom", path: ["username"], message: "A user name cannot contain a colon" });
    else if (CONTROL.test(form.username)) ctx.addIssue({ code: "custom", path: ["username"], message: "Remove the control characters" });
    if (form.password === "") ctx.addIssue({ code: "custom", path: ["password"], message: "Enter the password" });
    else if (CONTROL.test(form.password)) ctx.addIssue({ code: "custom", path: ["password"], message: "Remove the control characters" });
  });

export type ConnectionFormValues = z.infer<typeof connectionFormSchema>;

/** Splits validated form values into what may be stored and what may not. */
export function toConnection(
  form: ConnectionFormValues,
  preset: PresetSettings = DEFAULT_PRESET_SETTINGS,
): { profile: ConnectionProfile; credentials: Credentials | undefined } {
  const baseUrl = new URL(form.baseUrl.trim()).href.replace(/\/+$/, "");
  if (form.authType === "basic") {
    return {
      profile: { baseUrl, allowInsecureHttp: form.allowInsecureHttp, auth: { type: "basic", username: form.username }, preset },
      credentials: { password: form.password },
    };
  }
  return { profile: { baseUrl, allowInsecureHttp: form.allowInsecureHttp, auth: { type: "none" }, preset }, credentials: undefined };
}

export function toFormValues(profile: ConnectionProfile | undefined, defaultBaseUrl?: string): ConnectionFormValues {
  return {
    baseUrl: profile?.baseUrl ?? defaultBaseUrl ?? "",
    allowInsecureHttp: profile?.allowInsecureHttp ?? false,
    authType: profile?.auth.type ?? "none",
    username: profile?.auth.type === "basic" ? profile.auth.username : "",
    password: "",
  };
}

const storedProfileSchema = z.object({
  baseUrl: z.string(),
  allowInsecureHttp: z.boolean(),
  auth: z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("basic"), username: z.string().min(1) }),
  ]),
  // Profiles saved before presets existed have none.
  preset: z
    .object({
      signalling: z.enum(["header", "media-type", "none"]),
      selection: z.union([z.literal("default"), z.object({ id: z.string().min(1), version: z.string().min(1) })]),
    })
    .default(DEFAULT_PRESET_SETTINGS),
});

const STORAGE_KEY = "rpp-client.connection";

/** A stored profile if it is one and passes the checks of the form; anything else is ignored. */
export function parseProfile(value: unknown): ConnectionProfile | undefined {
  const parsed = storedProfileSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const check = connectionFormSchema.safeParse({ ...toFormValues(parsed.data), password: "x" });
  return check.success ? parsed.data : undefined;
}

/** The last profile, without credentials. Anything that does not validate as a profile is ignored. */
export function loadProfile(storage: Pick<Storage, "getItem"> = localStorage): ConnectionProfile | undefined {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw === null ? undefined : parseProfile(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function saveProfile(profile: ConnectionProfile, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage can be unavailable or full; the connection still works for this session.
  }
}
