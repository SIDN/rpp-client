// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { getThemePreference, initTheme, isDark, setThemePreference } from "./theme";

type Listener = () => void;

function mockSystem(dark: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches: dark,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", () => query);
  return {
    change(next: boolean) {
      query.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const isDocumentDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  setThemePreference("system");
});

afterEach(() => vi.unstubAllGlobals());

describe("theme", () => {
  it("resolves the preference against the system setting", () => {
    expect(isDark("dark", false)).toBe(true);
    expect(isDark("light", true)).toBe(false);
    expect(isDark("system", true)).toBe(true);
    expect(isDark("system", false)).toBe(false);
  });

  it("follows the system while the preference is system, and stops when a choice is made", () => {
    const system = mockSystem(true);
    initTheme();
    expect(isDocumentDark()).toBe(true);
    system.change(false);
    expect(isDocumentDark()).toBe(false);

    setThemePreference("dark");
    system.change(false);
    expect(isDocumentDark()).toBe(true);
    setThemePreference("light");
    system.change(true);
    expect(isDocumentDark()).toBe(false);
  });

  it("remembers the choice", () => {
    mockSystem(false);
    setThemePreference("dark");
    expect(localStorage.getItem("rpp-client.theme")).toBe("dark");
    expect(getThemePreference()).toBe("dark");
  });
});

describe("ThemeToggle", () => {
  it("shows the current choice and changes the page", () => {
    mockSystem(false);
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Match system" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Match system" })).toHaveAttribute("aria-pressed", "false");
    expect(isDocumentDark()).toBe(true);
    act(() => setThemePreference("light"));
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    expect(isDocumentDark()).toBe(false);
  });
});
