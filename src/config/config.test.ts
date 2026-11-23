import { describe, expect, it } from "vitest";
import { readEnv } from "./env";
import {
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
  baseUrl: "https://rpp.example.test/rpp",
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
    expect(messages(form({ baseUrl: "" }))).toHaveProperty("baseUrl", "Enter the address of the RPP server");
    expect(messages(form({ baseUrl: "rpp.example.test" })).baseUrl).toContain("https://");
    expect(messages(form({ baseUrl: "ftp://rpp.example.test" })).baseUrl).toContain("https://");
    expect(messages(form({ baseUrl: "http://rpp.example.test" })).baseUrl).toContain("Plain HTTP");
    expect(messages(form({ baseUrl: "https://user:pw@rpp.example.test" })).baseUrl).toContain("user name or password");
    expect(messages(form({ baseUrl: "https://rpp.example.test/rpp?x=1" })).baseUrl).toContain("query");
  });

  it("allows plain HTTP only when asked for", () => {
    expect(messages(form({ baseUrl: "http://localhost:8000", allowInsecureHttp: true }))).toEqual({});
  });

  it("requires a usable user name and a password for Basic", () => {
    expect(messages(form({ authType: "basic" }))).toEqual({ username: "Enter the user name", password: "Enter the password" });
    expect(messages(form({ authType: "basic", username: "a:b", password: "x" })).username).toContain("colon");
    expect(messages(form({ authType: "basic", username: "ok", password: "x" }))).toEqual({});
    expect(messages(form({ username: "", password: "" }))).toEqual({});
  });

  it("separates what may be stored from the password", () => {
    expect(toConnection(form({ baseUrl: " https://rpp.example.test/rpp/ ", authType: "basic", username: "u", password: "secret" }))).toEqual({
      profile: { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "basic", username: "u" }, preset: DEFAULT_PRESET_SETTINGS },
      credentials: { password: "secret" },
    });
    expect(toConnection(form({ baseUrl: "https://rpp.example.test" }))).toEqual({
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
    expect(toFormValues(undefined, "https://dev.example.test").baseUrl).toBe("https://dev.example.test");
    expect(toFormValues(undefined).baseUrl).toBe("");
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
