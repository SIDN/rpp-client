import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { objectSupport } from "@/application/capability";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { PageHeader } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { WorkflowTabs } from "@/components/common/WorkflowTabs";
import { Callout } from "@/components/ui/callout";
import { ChangePanel } from "./ChangePanel";
import { CheckPanel } from "./CheckPanel";
import { CreatePanel } from "./CreatePanel";
import { DeletePanel } from "./DeletePanel";
import { InfoPanel } from "./InfoPanel";

const WORKFLOWS = [
  { id: "info", label: "Info" },
  { id: "check", label: "Check" },
  { id: "create", label: "Create" },
  { id: "change", label: "Change" },
  { id: "delete", label: "Delete" },
] as const;

type WorkflowId = (typeof WORKFLOWS)[number]["id"];

const DESCRIPTIONS: Record<WorkflowId, string> = {
  info: "Get host details.",
  check: "Find out whether a host name is free.",
  create: "Create a host, with its IP addresses when it is below a domain of this registry.",
  change: "Modify host details.",
  delete: "Remove a host from the registry.",
};

export function HostsPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const support = objectSupport(discovery, "host");
  const [params] = useSearchParams();
  const [workflow, setWorkflow] = useState<WorkflowId>(() => WORKFLOWS.find((entry) => entry.id === params.get("tab"))?.id ?? "info");
  const [name, setName] = useState(() => params.get("name") ?? "");
  const [lookUpAtOnce] = useState(() => params.get("run") === "1");

  const header = <PageHeader title="Hosts" description="Manage name servers and their addresses." />;

  if (discovery.status === "not-started") {
    return (
      <>
        {header}
        <NotConnected />
      </>
    );
  }
  if (discovery.status === "loading") {
    return (
      <>
        {header}
        <Callout tone="info" title="Reading the capabilities of the server" />
      </>
    );
  }
  if (support !== "offered" || !session) {
    return (
      <>
        {header}
        <Callout tone="warning" title={discovery.status === "failed" ? "The capabilities of the server could not be read" : support !== "offered" ? "This server does not offer hosts" : "There is no connection"}>
          {discovery.status === "failed"
            ? discovery.error.message
            : support !== "offered"
              ? "Its discovery document does not list host. Nothing on this screen can work against it."
              : "Set up a connection first."}
        </Callout>
      </>
    );
  }

  const panelProps = { name, onNameChange: setName };
  const panels: Record<WorkflowId, ReactNode> = {
    info: <InfoPanel {...panelProps} startNow={lookUpAtOnce} />,
    check: <CheckPanel {...panelProps} onCreate={() => setWorkflow("create")} />,
    create: <CreatePanel {...panelProps} />,
    change: <ChangePanel {...panelProps} />,
    delete: <DeletePanel {...panelProps} />,
  };

  return (
    <>
      {header}
      <WorkflowTabs label="What to do with a host" workflows={WORKFLOWS} descriptions={DESCRIPTIONS} panels={panels} selected={workflow} onSelect={setWorkflow} />
    </>
  );
}
