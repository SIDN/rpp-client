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

  it("has one Synthesize data option, on to begin with and with a warning", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: /Synthesize/ })).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /Synthesize data/ })).toBeChecked();
    expect(screen.getByText("Synthesized data is on")).toBeInTheDocument();
  });

  it("turns it off, keeps that for the next visit, and turns it on again", () => {
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole("checkbox", { name: /Synthesize data/ }));
    expect(screen.getByRole("checkbox", { name: /Synthesize data/ })).not.toBeChecked();
    expect(screen.queryByText("Synthesized data is on")).toBeNull();
    expect(JSON.parse(localStorage.getItem("rpp-client.settings") ?? "{}")).toMatchObject({ synthesizeData: false });
    unmount();

    renderPage();
    expect(screen.getByRole("checkbox", { name: /Synthesize data/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Synthesize data/ }));
    expect(JSON.parse(localStorage.getItem("rpp-client.settings") ?? "{}")).toMatchObject({ synthesizeData: true });
    expect(screen.getByText("Synthesized data is on")).toBeInTheDocument();
  });
});
