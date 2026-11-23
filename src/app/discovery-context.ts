import { createContext, useContext } from "react";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";

const NOT_STARTED: DiscoveryState = { status: "not-started" };

/** The discovery state of the active server. Until a connection exists the state is `not-started`. */
export const DiscoveryContext = createContext<DiscoveryState>(NOT_STARTED);

export const useDiscoveryState = (): DiscoveryState => useContext(DiscoveryContext);
