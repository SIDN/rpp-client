import { useState, useSyncExternalStore } from "react";
import { RouterProvider } from "react-router-dom";
import { getLocale, subscribeToLocale } from "@/i18n";
import { ConnectionProvider } from "./ConnectionProvider";
import { Providers } from "./providers";
import { createAppRouter } from "./router";
import { SettingsProvider } from "./SettingsProvider";

export default function App() {
  const [router] = useState(createAppRouter);
  const locale = useSyncExternalStore(subscribeToLocale, getLocale, () => "en" as const);
  return (
    <Providers>
      <SettingsProvider>
        <ConnectionProvider>
          {/* Screens remount on a change of language, so every text is read again; the connection lives outside. */}
          <RouterProvider key={locale} router={router} />
        </ConnectionProvider>
      </SettingsProvider>
    </Providers>
  );
}
