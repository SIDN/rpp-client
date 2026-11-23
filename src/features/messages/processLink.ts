import type { ProcessView } from "@/application/messages/process";

const SCREENS: Record<string, { path: string; label: string; tabs: readonly string[] }> = {
  domainName: { path: "/domains", label: "Domain names", tabs: ["transfer", "renew", "restore"] },
  contact: { path: "/contacts", label: "Contacts", tabs: ["transfer"] },
  host: { path: "/hosts", label: "Hosts", tabs: [] },
};

/** The screen of the object a process belongs to, on the tab of the process when that screen has one; none for an object this client has no screen for. */
export function processLink(objectType: string, objectId: string, kind: ProcessView["kind"]): { to: string; label: string } | undefined {
  const screen = SCREENS[objectType];
  if (!screen || objectId === "") return undefined;
  const tab = kind !== undefined && screen.tabs.includes(kind) ? kind : "info";
  return { to: `${screen.path}?name=${encodeURIComponent(objectId)}&tab=${tab}`, label: screen.label };
}
