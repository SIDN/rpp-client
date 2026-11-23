import { useState } from "react";
import { RouterProvider } from "react-router-dom";
import { ConnectionProvider } from "./ConnectionProvider";
import { Providers } from "./providers";
import { createAppRouter } from "./router";
import { SettingsProvider } from "./SettingsProvider";

export default function App() {
  const [router] = useState(createAppRouter);
  return (
    <Providers>
      <SettingsProvider>
        <ConnectionProvider>
          <RouterProvider router={router} />
        </ConnectionProvider>
      </SettingsProvider>
    </Providers>
  );
}
