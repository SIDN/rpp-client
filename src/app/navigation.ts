import {
  ArrowLeftRight,
  Braces,
  Building2,
  Cable,
  Globe,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Radar,
  Server,
  Settings,
  Terminal,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ResourceType } from "@/rpp/core/types/resources";
import type { RppExtensionModule } from "@/rpp/extensions/ExtensionModule";
import { DENIC_RRI } from "@/rpp/extensions/modules/denicRri";
import { env } from "@/config/env";

export const APP_TITLE: string = env.appTitle;

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** The object type the server has to offer for this screen to work. */
  requires?: ResourceType;
  /** What the screen is for, shown while it is not built yet. */
  purposeKey: string;
  /**
   * The extension that defines the object of this screen, and that object. The item is only listed while the server
   * advertises the extension, and marked as offered while the extension is active and the object listed.
   */
  extension?: { module: RppExtensionModule; object: string };
}

export interface NavGroup {
  id: string;
  /** Undefined for the group that has no heading. */
  labelKey?: string;
  items: readonly NavItem[];
}

export const NAVIGATION: readonly NavGroup[] = [
  {
    id: "overview",
    items: [
      {
        to: "/",
        labelKey: "nav.overview.label",
        icon: LayoutDashboard,
        purposeKey: "nav.overview.purpose",
      },
    ],
  },
  {
    id: "registry",
    labelKey: "nav.group.registry",
    items: [
      { to: "/domains", labelKey: "nav.domainNames.label", icon: Globe, requires: "domainName", purposeKey: "nav.domainNames.purpose" },
      { to: "/contacts", labelKey: "nav.contacts.label", icon: UserRound, requires: "contact", purposeKey: "nav.contacts.purpose" },
      { to: "/hosts", labelKey: "nav.hosts.label", icon: Server, requires: "host", purposeKey: "nav.hosts.purpose" },
      {
        to: "/request-contacts",
        labelKey: "nav.requestContacts.label",
        icon: Megaphone,
        purposeKey: "nav.requestContacts.purpose",
        extension: { module: DENIC_RRI, object: "requestContact" },
      },
      { to: "/organisations", labelKey: "nav.organisations.label", icon: Building2, requires: "organisation", purposeKey: "nav.organisations.purpose" },
      { to: "/messages", labelKey: "nav.messages.label", icon: Inbox, requires: "message", purposeKey: "nav.messages.purpose" },
      { to: "/processes", labelKey: "nav.processes.label", icon: ListChecks, purposeKey: "nav.processes.purpose" },
    ],
  },
  {
    id: "developer",
    labelKey: "nav.group.developer",
    items: [
      { to: "/developer/capabilities", labelKey: "nav.capabilities.label", icon: Radar, purposeKey: "nav.capabilities.purpose" },
      { to: "/developer/exchanges", labelKey: "nav.exchanges.label", icon: ArrowLeftRight, purposeKey: "nav.exchanges.purpose" },
      { to: "/developer/requests", labelKey: "nav.rawRequest.label", icon: Terminal, purposeKey: "nav.rawRequest.purpose" },
      { to: "/developer/schemas", labelKey: "nav.schemas.label", icon: Braces, purposeKey: "nav.schemas.purpose" },
      { to: "/developer/settings", labelKey: "nav.settings.label", icon: Settings, purposeKey: "nav.settings.purpose" },
    ],
  },
];

export const CONNECTION_ITEM: NavItem = {
  to: "/connection",
  labelKey: "nav.connection.label",
  icon: Cable,
  purposeKey: "nav.connection.purpose",
};

export const ALL_ITEMS: readonly NavItem[] = [...NAVIGATION.flatMap((group) => group.items), CONNECTION_ITEM];
