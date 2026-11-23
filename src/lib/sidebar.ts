import { useState } from "react";

const STORAGE_KEY = "rpp-client.sidebar-collapsed";

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Whether the sidebar shows only its icons on a wide screen; the choice is remembered in this browser. */
export function useSidebarCollapsed(): [collapsed: boolean, toggle: () => void] {
  const [collapsed, setCollapsed] = useState(readStored);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // The choice still holds for this page view.
    }
  };
  return [collapsed, toggle];
}
