// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsProvider } from "@/app/SettingsProvider";
import { SettingsPage } from "./SettingsPage";

const renderPage = () =>
  render(
    <SettingsProvider>
      <SettingsPage />
    </SettingsProvider>,
  );

describe("settings screen", () => {
  beforeEach(() => localStorage.clear());

  it("has Synthesize data, off to begin with", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Synthesize data/ })).not.toBeChecked();
    expect(screen.queryByText("Synthesized data is on")).toBeNull();
  });

  it("turns it on with a warning, keeps it for the next visit, and turns it off again", () => {
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole("checkbox", { name: /Synthesize data/ }));
    expect(screen.getByRole("checkbox", { name: /Synthesize data/ })).toBeChecked();
    expect(screen.getByText("Synthesized data is on")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("rpp-client.settings") ?? "{}")).toMatchObject({ synthesizeData: true });
    unmount();

    renderPage();
    expect(screen.getByRole("checkbox", { name: /Synthesize data/ })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Synthesize data/ }));
    expect(JSON.parse(localStorage.getItem("rpp-client.settings") ?? "{}")).toMatchObject({ synthesizeData: false });
    expect(screen.queryByText("Synthesized data is on")).toBeNull();
  });
});
