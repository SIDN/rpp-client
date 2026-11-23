import { useFormContext } from "react-hook-form";
import { PHONE_PATTERN } from "@/application/contacts/contactCard";
import { Field, Input } from "@/components/ui/field";
import { StatusLabel } from "@/components/protocol/protocol-badges";
import type { StatusType } from "@/rpp/core/status/statuses";
import { Timestamp } from "../shared/objectParts";

/** What every workflow panel receives: the organisation and the user being worked on, which the panels share. */
export interface PanelProps {
  organisationId: string;
  onOrganisationChange(id: string): void;
  userId: string;
  onUserChange(id: string): void;
}

export function OrganisationField({ organisationId, onOrganisationChange, hint }: Pick<PanelProps, "organisationId" | "onOrganisationChange"> & { hint?: string }) {
  return (
    <Field label="Organisation identifier" hint={hint}>
      {(control) => (
        <Input
          {...control}
          value={organisationId}
          onChange={(event) => onOrganisationChange(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="max-w-96 font-mono"
        />
      )}
    </Field>
  );
}

export function UserField({ userId, onUserChange, hint }: Pick<PanelProps, "userId" | "onUserChange"> & { hint?: string }) {
  return (
    <Field label="User identifier" hint={hint}>
      {(control) => (
        <Input
          {...control}
          value={userId}
          onChange={(event) => onUserChange(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="max-w-96 font-mono"
        />
      )}
    </Field>
  );
}

export interface CardValues {
  name: string;
  email: string;
  voice: string;
}

const phoneRule = (value: string) => value.trim() === "" || PHONE_PATTERN.test(value.trim()) || "Use +CC.number, like +31.201234567";

/** The name, email address and phone number of a Card; the form it sits in has these three members. */
export function CardFields({ legend, nameLabel }: { legend: string; nameLabel: string }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<CardValues>();
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 font-medium">{legend}</legend>
      <Field label={nameLabel} error={errors.name?.message}>
        {(control) => <Input {...control} autoComplete="off" {...register("name")} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" error={errors.email?.message}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="off"
              spellCheck={false}
              {...register("email", { validate: (email) => email.trim() === "" || /^[^\s@]+@[^\s@]+$/.test(email.trim()) || "Enter an email address" })}
            />
          )}
        </Field>
        <Field label="Phone" hint="As +CC.number, with xEXT for an extension." error={errors.voice?.message}>
          {(control) => <Input {...control} type="tel" autoComplete="off" spellCheck={false} className="font-mono" {...register("voice", { validate: phoneRule })} />}
        </Field>
      </div>
    </fieldset>
  );
}

export function StatusList({ type, statuses }: { type: StatusType; statuses: readonly { label: string; reason?: string; due?: string }[] }) {
  return (
    <ul aria-label="Status" className="flex flex-wrap gap-2">
      {statuses.length === 0 && <li className="text-muted-foreground">No status listed</li>}
      {statuses.map((status, index) => (
        <li key={`${status.label}-${index}`} className="flex flex-col gap-0.5">
          <StatusLabel type={type} label={status.label} />
          {(status.reason || status.due) && (
            <span className="text-xs text-muted-foreground">
              {status.reason}
              {status.reason && status.due ? ", " : ""}
              {status.due && <>due <Timestamp value={status.due} /></>}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

