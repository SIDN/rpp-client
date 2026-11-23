import { describe, expect, it } from "vitest";
import { readEnv } from "./env";
import {
  buildBaseUrl,
  connectionFormSchema,
  DEFAULT_PRESET_SETTINGS,
  loadProfile,
  saveProfile,
  toConnection,
  toFormValues,
  type ConnectionFormValues,
  type ConnectionProfile,
} from "./connectionProfile";

const form = (overrides: Partial<ConnectionFormValues> = {}): ConnectionFormValues => ({
  host: "rpp.example.test",
  port: "443",
  allowInsecureHttp: false,
  authType: "none",
  username: "",
  password: "",
  ...overrides,
});

const messages = (values: ConnectionFormValues) => {
  const result = connectionFormSchema.safeParse(values);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
};

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    value: () => value,
  };
}

describe("connection form", () => {
  it("accepts an https address without authentication", () => {
    expect(messages(form())).toEqual({});
  });

  it("explains each way an address can be wrong", () => {
    expect(messages(form({ host: "" }))).toHaveProperty("host", "Enter the host name of the RPP server");
    expect(messages(form({ host: "https://rpp.example.test" })).host).toContain("only the host name");
    expect(messages(form({ host: "rpp.example.test:8443" })).host).toContain("only the host name");
    expect(messages(form({ host: "user:pw@rpp.example.test" })).host).toContain("only the host name");
    expect(messages(form({ host: "rpp.example.test/rpp" })).host).toContain("only the host name");
    expect(messages(form({ port: "" }))).toHaveProperty("port");
    expect(messages(form({ port: "70000" })).port).toContain("between 1 and 65535");
  });

  it("builds the URL from host and port, with https unless plain HTTP is allowed", () => {
    expect(buildBaseUrl("rpp.example.test", "8443", false)).toBe("https://rpp.example.test:8443");
    expect(buildBaseUrl("localhost", "8000", true)).toBe("http://localhost:8000");
  });

  it("allows plain HTTP only when asked for", () => {
    expect(messages(form({ host: "localhost", port: "8000", allowInsecureHttp: true }))).toEqual({});
  });

  it("requires a usable user name and a password for Basic", () => {
    expect(messages(form({ authType: "basic" }))).toEqual({ username: "Enter the user name", password: "Enter the password" });
    expect(messages(form({ authType: "basic", username: "a:b", password: "x" })).username).toContain("colon");
    expect(messages(form({ authType: "basic", username: "ok", password: "x" }))).toEqual({});
    expect(messages(form({ username: "", password: "" }))).toEqual({});
  });

  it("separates what may be stored from the password", () => {
    expect(toConnection(form({ host: "rpp.example.test", port: "8443", authType: "basic", username: "u", password: "secret" }))).toEqual({
      profile: { baseUrl: "https://rpp.example.test:8443", allowInsecureHttp: false, auth: { type: "basic", username: "u" }, preset: DEFAULT_PRESET_SETTINGS },
      credentials: { password: "secret" },
    });
    expect(toConnection(form({ host: "rpp.example.test" }))).toEqual({
      profile: { baseUrl: "https://rpp.example.test", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS },
      credentials: undefined,
    });
  });
});

describe("stored profile", () => {
  const profile: ConnectionProfile = { baseUrl: "https://rpp.example.test", allowInsecureHttp: false, auth: { type: "basic", username: "u" }, preset: DEFAULT_PRESET_SETTINGS };

  it("round-trips without any password", () => {
    const storage = memoryStorage();
    saveProfile(profile, storage);
    expect(storage.value()).not.toContain("password");
    expect(loadProfile(storage)).toEqual(profile);
    expect(toFormValues(profile).password).toBe("");
  });

  it("gives a profile saved before presets existed the default preset settings", () => {
    const { preset: _preset, ...old } = profile;
    expect(loadProfile(memoryStorage(JSON.stringify(old)))).toEqual({ ...old, preset: DEFAULT_PRESET_SETTINGS });
    const chosen = { signalling: "media-type", selection: { id: "p", version: "1.0" } };
    expect(loadProfile(memoryStorage(JSON.stringify({ ...profile, preset: chosen })))?.preset).toEqual(chosen);
    expect(loadProfile(memoryStorage(JSON.stringify({ ...profile, preset: { signalling: "x", selection: "default" } })))).toBeUndefined();
  });

  it("ignores anything that is not a valid profile", () => {
    expect(loadProfile(memoryStorage())).toBeUndefined();
    expect(loadProfile(memoryStorage("not json"))).toBeUndefined();
    expect(loadProfile(memoryStorage(JSON.stringify({ baseUrl: 1 })))).toBeUndefined();
    expect(loadProfile(memoryStorage(JSON.stringify({ ...profile, baseUrl: "http://plain.test" })))).toBeUndefined();
    expect(loadProfile(memoryStorage(JSON.stringify({ ...profile, auth: { type: "bearer", token: "x" } })))).toBeUndefined();
  });

  it("falls back to the default address of the environment", () => {
    expect(toFormValues(undefined, "https://dev.example.test")).toMatchObject({ host: "dev.example.test", port: "443" });
    expect(toFormValues(undefined).host).toBe("");
  });
});

describe("environment", () => {
  it("reads the public variables with defaults", () => {
    expect(readEnv({})).toEqual({ appTitle: "RPP Client", defaultBaseUrl: undefined });
    expect(readEnv({ VITE_APP_TITLE: "Registrar", VITE_RPP_BASE_URL: "https://rpp.example.test" })).toEqual({
      appTitle: "Registrar",
      defaultBaseUrl: "https://rpp.example.test",
    });
    expect(readEnv({ VITE_RPP_BASE_URL: "" }).defaultBaseUrl).toBeUndefined();
  });

  it("fails at startup and names the variable", () => {
    expect(() => readEnv({ VITE_RPP_BASE_URL: "nope" })).toThrow(/VITE_RPP_BASE_URL/);
  });
});
