import { Search } from "lucide-react";
import { t } from "@/i18n";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useDiscoveryState } from "@/app/discovery-context";
import { objectSupport } from "@/application/capability";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input, Label } from "@/components/ui/field";
import { ContactDetails } from "../contacts/ContactDetails";
import { useContactStore, useContactWorkflows } from "../contacts/contactHooks";
import { OperationOutcome } from "./OperationOutcome";
import { useOperation } from "./useOperation";

function LookupDialog({ title, onSelect, onClose }: { title: string; onSelect(id: string): void; onClose(): void }) {
  const workflows = useContactWorkflows();
  const store = useContactStore();
  const [id, setId] = useState("");
  const titleId = useId();
  const inputId = useId();
  const search = useOperation(
    (value: string, signal) => workflows.info(value, { signal }),
    (result, value) => {
      if (result.data) store.remember(value, result.data);
    },
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const found = search.result?.data;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="mt-12 flex w-full max-w-2xl flex-col gap-4 rounded-md border bg-background p-6 shadow-lg">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <Callout tone="info" title={t("shared.contactLookup.identifierOnly")}>
          {t("shared.contactLookup.identifierOnlyHelp")}
        </Callout>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={inputId}>{t("shared.contactLookup.identifier")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={inputId}
              value={id}
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="max-w-64 font-mono"
              onChange={(event) => setId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  search.start(id);
                }
              }}
            />
            <Button variant="primary" disabled={search.pending} aria-busy={search.pending} onClick={() => search.start(id)}>
              {search.pending ? t("shared.waitingForRegistry") : t("shared.contactLookup.search")}
            </Button>
          </div>
        </div>
        <OperationOutcome operation={search} success={t("shared.contactLookup.found", { contact: search.variables ?? t("common.theContact") })}>
          {(contact) => <ContactDetails contact={contact} />}
        </OperationOutcome>
        <div className="flex flex-wrap gap-2">
          {found && (
            <Button
              variant="primary"
              onClick={() => {
                onSelect(found.id);
                onClose();
              }}
            >
              {t("shared.contactLookup.use", { id: found.id })}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A button that opens the contact search; the identifier of the contact found goes to `onSelect`. */
export function ContactLookup({ label, onSelect }: { label: string; onSelect(id: string): void }) {
  const discovery = useDiscoveryState();
  const [open, setOpen] = useState(false);
  const offered = objectSupport(discovery, "contact") === "offered";
  return (
    <>
      <Button variant="secondary" size="sm" disabled={!offered} title={offered ? undefined : t("shared.contactLookup.notOffered")} aria-label={label} onClick={() => setOpen(true)}>
        <Search aria-hidden />
        {t("shared.contactLookup.lookUp")}
      </Button>
      {open && <LookupDialog title={label} onSelect={onSelect} onClose={() => setOpen(false)} />}
    </>
  );
}
