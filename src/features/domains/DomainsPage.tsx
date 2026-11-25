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
import { DeletePanel } from "./DeletePanel";
import { InfoPanel } from "./InfoPanel";
import { RegisterPanel } from "./RegisterPanel";
import { RenewPanel } from "./RenewPanel";
import { RestorePanel } from "./RestorePanel";
import { TransferPanel } from "./TransferPanel";

const WORKFLOWS = [
  { id: "info", label: "Info" },
  { id: "check", label: "Check" },
  { id: "register", label: "Register" },
  { id: "change", label: "Change" },
  { id: "renew", label: "Renew" },
  { id: "restore", label: "Restore" },
  { id: "transfer", label: "Transfer" },
  { id: "delete", label: "Delete" },
] as const;

type WorkflowId = (typeof WORKFLOWS)[number]["id"];

const DESCRIPTIONS: Record<WorkflowId, string> = {
  info: "Get domain name details.",
  check: "Find out whether a name can be registered.",
  register: "Register a new domain name.",
  change: "Change the contacts, name servers, locks or transfer password of a domain.",
  renew: "Extend the registration of a domain.",
  restore: "Get a deleted domain back during its redemption period.",
  transfer: "Move a domain between registrars: ask for it, and answer a request for yours.",
  delete: "Remove a domain from the registry.",
};

export function DomainsPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const support = objectSupport(discovery, "domainName");
  const [params] = useSearchParams();
  const [workflow, setWorkflow] = useState<WorkflowId>(() => WORKFLOWS.find((entry) => entry.id === params.get("tab"))?.id ?? "info");
  const [name, setName] = useState(() => params.get("name") ?? "");

  const header = <PageHeader title="Domain names" description="Manage domain names" />;

  if (!session || discovery.status === "not-started") {
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
  if (support !== "offered") {
    return (
      <>
        {header}
        <Callout tone="warning" title={discovery.status === "failed" ? "The capabilities of the server could not be read" : "This server does not offer domain names"}>
          {discovery.status === "failed" ? discovery.error.message : "Its discovery document does not list domainName. Nothing on this screen can work against it."}
        </Callout>
      </>
    );
  }

  const panelProps = { name, onNameChange: setName };
  const panels: Record<WorkflowId, ReactNode> = {
    info: <InfoPanel {...panelProps} />,
    check: <CheckPanel {...panelProps} onRegister={() => setWorkflow("register")} />,
    register: <RegisterPanel {...panelProps} />,
    change: <ChangePanel {...panelProps} />,
    renew: <RenewPanel {...panelProps} />,
    restore: <RestorePanel {...panelProps} />,
    transfer: <TransferPanel {...panelProps} />,
    delete: <DeletePanel {...panelProps} />,
  };

  return (
    <>
      {header}
      <WorkflowTabs label="What to do with a domain name" workflows={WORKFLOWS} descriptions={DESCRIPTIONS} panels={panels} selected={workflow} onSelect={setWorkflow} />
    </>
  );
}
