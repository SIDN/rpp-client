import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { t } from "@/i18n";

/** Shown instead of a form while the schema that shapes it is read. */
export function SchemaLoading() {
  return (
    <Callout tone="info" title={t("contacts.form.readingSchema")}>
      {t("contacts.form.schemaLoadingDescription")}
    </Callout>
  );
}

/** Says why the schema did not shape a form, when it did not. */
export function SchemaNote({ note }: { note: string | undefined }) {
  if (!note) return null;
  return (
    <Callout tone="warning" title={t("contacts.form.schemaDidNotShape")}>
      {note}
    </Callout>
  );
}

/** What every contact workflow panel receives: the identifier being worked on, which the panels share. */
export interface PanelProps {
  id: string;
  onIdChange(id: string): void;
}

/** The contact identifier field every workflow starts with. */
export function IdField({ id, onIdChange }: PanelProps) {
  return (
    <Field label={t("contacts.form.identifier")} hint={t("contacts.form.identifierHint")}>
      {(control) => (
        <Input
          {...control}
          value={id}
          onChange={(event) => onIdChange(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="max-w-96 font-mono"
        />
      )}
    </Field>
  );
}
