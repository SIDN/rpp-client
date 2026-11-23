import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";

/** Shown instead of a form while the schema that shapes it is read. */
export function SchemaLoading() {
  return (
    <Callout tone="info" title="Reading the preset schema">
      The form shows what the preset allows once its schema has been read.
    </Callout>
  );
}

/** Says why the schema did not shape a form, when it did not. */
export function SchemaNote({ note }: { note: string | undefined }) {
  if (!note) return null;
  return (
    <Callout tone="warning" title="The preset schema did not shape this form">
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
    <Field label="Contact identifier" hint="The identifier the registry knows the contact by, for example FO-1234">
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
