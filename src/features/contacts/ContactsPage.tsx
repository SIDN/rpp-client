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
import { TransferPanel } from "./TransferPanel";

const WORKFLOWS = [
  { id: "info", label: "Info" },
  { id: "check", label: "Check" },
  { id: "create", label: "Create" },
  { id: "change", label: "Change" },
  { id: "transfer", label: "Transfer" },
  { id: "delete", label: "Delete" },
] as const;

type WorkflowId = (typeof WORKFLOWS)[number]["id"];

const DESCRIPTIONS: Record<WorkflowId, string> = {
  info: "Get contact details.",
  check: "Find out whether a contact identifier is free.",
  create: "Create a contact that domain names can refer to.",
  change: "Change the name, address, phone, email, locks or transfer password of a contact.",
  transfer: "Move a contact between registrars: ask for it, and answer a request for yours.",
  delete: "Remove a contact from the registry.",
};

export function ContactsPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const support = objectSupport(discovery, "contact");
  const [params] = useSearchParams();
  const [workflow, setWorkflow] = useState<WorkflowId>(() => WORKFLOWS.find((entry) => entry.id === params.get("tab"))?.id ?? "info");
  const [id, setId] = useState(() => params.get("name") ?? "");
  const [lookUpAtOnce] = useState(() => params.get("run") === "1");

  const header = <PageHeader title="Contacts" description="Manage contacts." />;

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
        <Callout tone="warning" title={discovery.status === "failed" ? "The capabilities of the server could not be read" : support !== "offered" ? "This server does not offer contacts" : "There is no connection"}>
          {discovery.status === "failed"
            ? discovery.error.message
            : support !== "offered"
              ? "Its discovery document does not list contact. Nothing on this screen can work against it."
              : "Set up a connection first."}
        </Callout>
      </>
    );
  }

  const panelProps = { id, onIdChange: setId };
  const panels: Record<WorkflowId, ReactNode> = {
    info: <InfoPanel {...panelProps} startNow={lookUpAtOnce} />,
    check: <CheckPanel {...panelProps} onCreate={() => setWorkflow("create")} />,
    create: <CreatePanel {...panelProps} />,
    change: <ChangePanel {...panelProps} />,
    transfer: <TransferPanel {...panelProps} />,
    delete: <DeletePanel {...panelProps} />,
  };

  return (
    <>
      {header}
      <WorkflowTabs label="What to do with a contact" workflows={WORKFLOWS} descriptions={DESCRIPTIONS} panels={panels} selected={workflow} onSelect={setWorkflow} />
    </>
  );
}
