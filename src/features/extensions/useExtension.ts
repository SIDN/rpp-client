import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { extensionActivation, extensionObjectSupport, type ServerSupport } from "@/application/capability";
import type { RppExtensionModule } from "@/rpp/extensions/ExtensionModule";
import type { ExtensionActivation } from "@/rpp/extensions/ExtensionRegistry";

/** The preset requests are made under, when one is chosen; the server's default applies otherwise. */
function usePresetInEffect() {
  const connection = useConnection();
  // `resolvedPreset` is absent in a partial connection (tests); the default preset applies then.
  return connection.resolvedPreset?.chosen;
}

/** Whether the extension may be used with the connected server; undefined while discovery has not been read. */
export function useExtensionActivation(module: RppExtensionModule): ExtensionActivation | undefined {
  const discovery = useDiscoveryState();
  return extensionActivation(discovery, module, usePresetInEffect());
}

/** True only when the server confirms the extension under the preset in effect. */
export function useExtensionActive(module: RppExtensionModule): boolean {
  return useExtensionActivation(module)?.status === "active";
}

export function useExtensionObjectSupport(module: RppExtensionModule, type: string): ServerSupport {
  const discovery = useDiscoveryState();
  return extensionObjectSupport(discovery, module, type, usePresetInEffect());
}
