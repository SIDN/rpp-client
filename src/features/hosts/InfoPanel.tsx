import { useEffect, useRef } from "react";
import { t } from "@/i18n";
import { useOperation } from "../shared/useOperation";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { tryParseHostName } from "@/application/hosts/hostWorkflows";
import { useHostStore, useHostWorkflows } from "./hostHooks";
import { HostDetails } from "./HostDetails";
import { NameField, type PanelProps } from "./parts";

/** `startNow` asks for the info of the host name as soon as the panel is shown, as when a link leads here. */
export function InfoPanel({ name, onNameChange, startNow = false }: PanelProps & { startNow?: boolean }) {
  const workflows = useHostWorkflows();
  const store = useHostStore();
  const info = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );

  const started = useRef(false);
  const { start } = info;
  useEffect(() => {
    if (!startNow || started.current || name.trim() === "") return;
    started.current = true;
    start(name);
  }, [startNow, name, start]);

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          info.start(name);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <NameField name={name} onNameChange={onNameChange} />
        <div>
          <SubmitButton pending={info.pending}>{t("hosts.info.submit")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={info} success={t("hosts.info.success", { host: tryParseHostName(info.variables ?? "")?.name ?? "the host" })}>
        {(host) => <HostDetails host={host} />}
      </OperationOutcome>
    </div>
  );
}
