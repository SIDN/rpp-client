import { useForm } from "react-hook-form";
import { HOSTS_FILTERS, type HostsFilter } from "@/application/domains/domainWorkflows";
import { Choice } from "@/components/ui/choice";
import { Field, Select } from "@/components/ui/field";
import { useDomainStore } from "./domainCache";
import { DomainDetails } from "./DomainDetails";
import { OperationOutcome } from "../shared/OperationOutcome";
import { NameField, type PanelProps } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";

export function InfoPanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const { register, handleSubmit } = useForm<{ authInfo: boolean; hostsFilter: HostsFilter | "" }>({ defaultValues: { authInfo: false, hostsFilter: "" } });
  const info = useOperation(
    (variables: { name: string; authInfo: boolean; hostsFilter?: HostsFilter }, signal) =>
      workflows.info(variables.name, { authInfo: variables.authInfo, hostsFilter: variables.hostsFilter, signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.name, result.data);
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit((values) => info.start({ name, authInfo: values.authInfo, hostsFilter: values.hostsFilter || undefined }))} className="flex max-w-xl flex-col gap-5">
        <NameField name={name} onNameChange={onNameChange} />
        <Field label="Hosts filter" hint="Which host information the registry returns: all hosts, the delegated ones (del), the subordinate ones (sub) or none.">
          {(control) => (
            <Select {...control} className="max-w-48" {...register("hostsFilter")}>
              <option value="">Not sent (server default)</option>
              {HOSTS_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {filter}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Choice
          type="checkbox"
          label="Include the transfer password"
          hint="Only the sponsoring registrar is given it, and only if the registry can show it."
          {...register("authInfo")}
        />
        <div>
          <SubmitButton pending={info.pending}>Get info</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={info} success={`Found ${info.variables?.name ?? "the domain"}`}>
        {(domain) => <DomainDetails domain={domain} />}
      </OperationOutcome>
    </div>
  );
}
