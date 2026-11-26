import { z } from "zod";
import { t } from "@/i18n";

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

/**
 * How a Change screen sends its edits by default: a partial update (PATCH with the operations that differ, json §5.2)
 * or a full update (PUT with the whole update view of the object, json §5.1). Each Change screen can still switch.
 */
export type UpdateMode = "partial" | "full";

export const DEFAULT_UPDATE_MODE: UpdateMode = "partial";

export interface ConnectionProfile {
  /** The RPP base URL: https, or http in development mode. */
  baseUrl: string;
  allowInsecureHttp: boolean;
  auth: { type: "none" } | { type: "basic"; username: string };
  preset: PresetSettings;
  updateMode: UpdateMode;
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
    return issue(t("config.connection.fullAddress"));
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return issue(t("config.connection.httpsAddress"));
  if (url.protocol === "http:" && !allowInsecureHttp) {
    return issue(t("config.connection.httpWarning"));
  }
  if (url.username !== "" || url.password !== "") return issue(t("config.connection.noCredentialsInAddress"));
  if (url.search !== "" || url.hash !== "") return issue(t("config.connection.noQueryFragment"));
}

/** The URL of the server: https unless plain HTTP is allowed. */
export function buildBaseUrl(host: string, port: string, allowInsecureHttp: boolean): string {
  return `${allowInsecureHttp ? "http" : "https"}://${host.trim()}:${port.trim()}`;
}

function checkHost(host: string, ctx: z.RefinementCtx): boolean {
  let url: URL;
  try {
    url = new URL(`https://${host}`);
  } catch {
    ctx.addIssue({ code: "custom", path: ["host"], message: t("config.connection.hostExample") });
    return false;
  }
  if (url.port !== "" || url.username !== "" || url.password !== "" || url.href !== `https://${host.toLowerCase()}/`) {
    ctx.addIssue({ code: "custom", path: ["host"], message: t("config.connection.hostOnly") });
    return false;
  }
  return true;
}

export const connectionFormSchema = z
  .object({
    host: z.string().trim().min(1, { error: () => t("config.connection.hostRequired") }),
    port: z.string().trim().regex(/^\d+$/, { error: () => t("config.connection.portNumber") }).refine((value) => Number(value) >= 1 && Number(value) <= 65535, { error: () => t("config.connection.portRange") }),
    allowInsecureHttp: z.boolean(),
    authType: z.enum(["none", "basic"]),
    username: z.string(),
    password: z.string(),
    updateMode: z.enum(["partial", "full"]),
  })
  .superRefine((form, ctx) => {
    const hostOk = form.host ? checkHost(form.host, ctx) : false;
    if (hostOk && /^\d+$/.test(form.port)) checkAddress(buildBaseUrl(form.host, form.port, form.allowInsecureHttp), form.allowInsecureHttp, ctx, ["host"]);
    if (form.authType !== "basic") return;
    if (form.username === "") ctx.addIssue({ code: "custom", path: ["username"], message: t("config.connection.usernameRequired") });
    else if (form.username.includes(":")) ctx.addIssue({ code: "custom", path: ["username"], message: t("config.connection.usernameColon") });
    else if (CONTROL.test(form.username)) ctx.addIssue({ code: "custom", path: ["username"], message: t("config.connection.removeControls") });
    if (form.password === "") ctx.addIssue({ code: "custom", path: ["password"], message: t("config.connection.passwordRequired") });
    else if (CONTROL.test(form.password)) ctx.addIssue({ code: "custom", path: ["password"], message: t("config.connection.removeControls") });
  });

export type ConnectionFormValues = z.infer<typeof connectionFormSchema>;

/** Splits validated form values into what may be stored and what may not. */
export function toConnection(
  form: ConnectionFormValues,
  preset: PresetSettings = DEFAULT_PRESET_SETTINGS,
): { profile: ConnectionProfile; credentials: Credentials | undefined } {
  const baseUrl = new URL(buildBaseUrl(form.host, form.port, form.allowInsecureHttp)).origin;
  if (form.authType === "basic") {
    return {
      profile: { baseUrl, allowInsecureHttp: form.allowInsecureHttp, auth: { type: "basic", username: form.username }, preset, updateMode: form.updateMode },
      credentials: { password: form.password },
    };
  }
  return { profile: { baseUrl, allowInsecureHttp: form.allowInsecureHttp, auth: { type: "none" }, preset, updateMode: form.updateMode }, credentials: undefined };
}

export function toFormValues(profile: ConnectionProfile | undefined, defaultBaseUrl?: string): ConnectionFormValues {
  let host = "";
  let port = "443";
  const address = profile?.baseUrl ?? defaultBaseUrl;
  if (address) {
    try {
      const url = new URL(address);
      host = url.hostname;
      port = url.port || (url.protocol === "http:" ? "80" : "443");
    } catch {
      // An unreadable address leaves the fields empty.
    }
  }
  return {
    host,
    port,
    allowInsecureHttp: profile?.allowInsecureHttp ?? false,
    authType: profile?.auth.type ?? "none",
    username: profile?.auth.type === "basic" ? profile.auth.username : "",
    password: "",
    updateMode: profile?.updateMode ?? DEFAULT_UPDATE_MODE,
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
  // Profiles saved before the choice existed send partial updates, as the client did then.
  updateMode: z.enum(["partial", "full"]).default(DEFAULT_UPDATE_MODE),
});

const STORAGE_KEY = "rpp-client.connection";

/** A stored profile if it is one and passes the checks of the form; anything else is ignored. */
export function parseProfile(value: unknown): ConnectionProfile | undefined {
  const parsed = storedProfileSchema.safeParse(value);
  if (!parsed.success) return undefined;
  if (/^http:/i.test(parsed.data.baseUrl) && !parsed.data.allowInsecureHttp) return undefined;
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
