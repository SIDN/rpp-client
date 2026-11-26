import { t } from "@/i18n";
import type { ProcessView } from "@/application/messages/process";

const SCREENS: Record<string, { path: string; labelKey: string; tabs: readonly string[] }> = {
  domainName: { path: "/domains", labelKey: "processes.object.domainNames", tabs: ["transfer", "renew", "restore"] },
  contact: { path: "/contacts", labelKey: "processes.object.contacts", tabs: ["transfer"] },
  host: { path: "/hosts", labelKey: "processes.object.hosts", tabs: [] },
};

/** The screen of the object a process belongs to, on the tab of the process when that screen has one; none for an object this client has no screen for. */
export function processLink(objectType: string, objectId: string, kind: ProcessView["kind"]): { to: string; label: string } | undefined {
  const screen = SCREENS[objectType];
  if (!screen || objectId === "") return undefined;
  const tab = kind !== undefined && screen.tabs.includes(kind) ? kind : "info";
  const label = objectType === "domainName" ? t("processes.object.domainNames") : objectType === "contact" ? t("processes.object.contacts") : t("processes.object.hosts");
  return { to: `${screen.path}?name=${encodeURIComponent(objectId)}&tab=${tab}`, label };
}
