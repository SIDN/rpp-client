import { useState, type ReactNode } from "react";
import { objectSupport } from "@/application/capability";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { PageHeader } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { WorkflowTabs } from "@/components/common/WorkflowTabs";
import { Callout } from "@/components/ui/callout";
import { ChangePanel } from "./ChangePanel";
import { CreatePanel } from "./CreatePanel";
import { DeletePanel } from "./DeletePanel";
import { InfoPanel } from "./InfoPanel";
import { UserChangePanel } from "./UserChangePanel";
import { UserCreatePanel } from "./UserCreatePanel";
import { UserDeletePanel } from "./UserDeletePanel";
import { UserInfoPanel } from "./UserInfoPanel";

const ORGANISATION_WORKFLOWS = [
  { id: "info", label: "Info" },
  { id: "create", label: "Create" },
  { id: "change", label: "Change" },
  { id: "delete", label: "Delete" },
] as const;

const USER_WORKFLOWS = [
  { id: "userInfo", label: "User info" },
  { id: "userCreate", label: "Create user" },
  { id: "userChange", label: "Change user" },
  { id: "userDelete", label: "Delete user" },
] as const;

type WorkflowId = (typeof ORGANISATION_WORKFLOWS)[number]["id"] | (typeof USER_WORKFLOWS)[number]["id"];

const DESCRIPTIONS: Record<WorkflowId, string> = {
  info: "Get organisation details.",
  create: "Create an organisation",
  change: "Modify the organisation details.",
  delete: "Delete an organisation, after checking for users that are still linked to it.",
  userInfo: "Get the details of a user of an organisation.",
  userCreate: "Create a user in an organisation. The identifier has to be unique within that organisation.",
  userChange: "Change the details, description or status of a user of an organisation.",
  userDelete: "Delete one user of an organisation, leaving the organisation and its other users.",
};

export function OrganisationsPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const support = objectSupport(discovery, "organisation");
  const usersOffered = objectSupport(discovery, "user") === "offered";
  const [workflow, setWorkflow] = useState<WorkflowId>("info");
  const [organisationId, setOrganisationId] = useState("");
  const [userId, setUserId] = useState("");

  const header = <PageHeader title="Organisations" description="Manage organisations and their users." />;

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
        <Callout tone="warning" title={discovery.status === "failed" ? "The capabilities of the server could not be read" : support !== "offered" ? "This server does not offer organisations" : "There is no connection"}>
          {discovery.status === "failed"
            ? discovery.error.message
            : support !== "offered"
              ? "Its discovery document does not list organisation. Nothing on this screen can work against it."
              : "Set up a connection first."}
        </Callout>
      </>
    );
  }

  const panelProps = { organisationId, onOrganisationChange: setOrganisationId, userId, onUserChange: setUserId };
  const panels: Record<WorkflowId, ReactNode> = {
    info: <InfoPanel {...panelProps} />,
    create: <CreatePanel {...panelProps} />,
    change: <ChangePanel {...panelProps} />,
    delete: <DeletePanel {...panelProps} />,
    userInfo: <UserInfoPanel {...panelProps} />,
    userCreate: <UserCreatePanel {...panelProps} />,
    userChange: <UserChangePanel {...panelProps} />,
    userDelete: <UserDeletePanel {...panelProps} />,
  };
  const workflows = usersOffered ? [...ORGANISATION_WORKFLOWS, ...USER_WORKFLOWS] : ORGANISATION_WORKFLOWS;

  return (
    <>
      {header}
      <WorkflowTabs
        label="What to do with an organisation or its users"
        workflows={workflows}
        descriptions={DESCRIPTIONS}
        panels={panels}
        selected={workflow}
        onSelect={setWorkflow}
      />
    </>
  );
}
