import {
  ArrowLeftRight,
  Braces,
  Building2,
  Cable,
  Globe,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Radar,
  Server,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ResourceType } from "@/rpp/core/types/resources";
import { env } from "@/config/env";

export const APP_TITLE: string = env.appTitle;

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** The object type the server has to offer for this screen to work. */
  requires?: ResourceType;
  /** What the screen is for, shown while it is not built yet. */
  purpose: string;
}

export interface NavGroup {
  id: string;
  /** Undefined for the group that has no heading. */
  label?: string;
  items: readonly NavItem[];
}

export const NAVIGATION: readonly NavGroup[] = [
  {
    id: "overview",
    items: [
      {
        to: "/",
        label: "Overview",
        icon: LayoutDashboard,
        purpose: "The state of the connection and where to start.",
      },
    ],
  },
  {
    id: "registry",
    label: "Registry",
    items: [
      { to: "/domains", label: "Domain names", icon: Globe, requires: "domainName", purpose: "Manage domain names." },
      { to: "/contacts", label: "Contacts", icon: UserRound, requires: "contact", purpose: "Manage contacts." },
      { to: "/hosts", label: "Hosts", icon: Server, requires: "host", purpose: "Manage name servers." },
      { to: "/organisations", label: "Organisations", icon: Building2, requires: "organisation", purpose: "Manage organisations and users." },
      { to: "/messages", label: "Messages", icon: Inbox, requires: "message", purpose: "Read and acknowledge message." },
      { to: "/processes", label: "Processes", icon: ListChecks, purpose: "Transfers, restores and other processes of the objects you have worked with." },
    ],
  },
  {
    id: "developer",
    label: "Developer",
    items: [
      { to: "/developer/capabilities", label: "Capabilities", icon: Radar, purpose: "The discovery document of the server: versions, presets, extensions and profiles." },
      { to: "/developer/exchanges", label: "Exchanges", icon: ArrowLeftRight, purpose: "Every request and response of this session, with secrets removed." },
      { to: "/developer/schemas", label: "Schemas", icon: Braces, purpose: "The JSON Schema of each preset, as a tree you can search and as the raw schema." },
      { to: "/developer/settings", label: "Settings", icon: Settings, purpose: "How this client behaves, such as showing synthesized data instead of asking the server." },
    ],
  },
];

export const CONNECTION_ITEM: NavItem = {
  to: "/connection",
  label: "Connection",
  icon: Cable,
  purpose: "Choose the server to work against and how to sign in.",
};

export const ALL_ITEMS: readonly NavItem[] = [...NAVIGATION.flatMap((group) => group.items), CONNECTION_ITEM];
