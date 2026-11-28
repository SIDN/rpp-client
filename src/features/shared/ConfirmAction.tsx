import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { t } from "@/i18n";

/**
 * An action that cannot be taken back asks first, naming what it acts on. With `expected`, the person types that name,
 * so that a click on the wrong row cannot do it.
 */
export function ConfirmAction({
  trigger,
  title,
  children,
  confirmLabel,
  onConfirm,
  expected,
  pending = false,
  destructive = false,
  disabled = false,
  startOpen = false,
  onCancel,
}: {
  trigger: string;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  onConfirm(): void;
  /** Text that has to be typed before the action can be confirmed. */
  expected?: string;
  pending?: boolean;
  destructive?: boolean;
  /** The trigger is shown but cannot be used, for example while there is nothing yet to act on. */
  disabled?: boolean;
  /** Asks at once, for an action already chosen elsewhere, such as a Delete button in a table row. */
  startOpen?: boolean;
  onCancel?(): void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [typed, setTyped] = useState("");
  const id = useId();

  if (!open) {
    return (
      <Button variant={destructive ? "destructive" : "secondary"} disabled={pending || disabled} onClick={() => setOpen(true)}>
        {trigger}
      </Button>
    );
  }

  const close = () => {
    setOpen(false);
    setTyped("");
  };

  return (
    <div role="group" aria-labelledby={`${id}-title`} className="flex max-w-xl flex-col gap-3 rounded-md border-2 border-danger p-4">
      <h4 id={`${id}-title`} className="font-semibold">
        {title}
      </h4>
      {children && <div className="text-sm">{children}</div>}
      {expected !== undefined && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-typed`} className="text-sm font-medium">
            {t("shared.confirm.typePrefix")} <code>{expected}</code> {t("shared.confirm.typeSuffix")}
          </label>
          <Input id={`${id}-typed`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} className="max-w-96 font-mono" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={destructive ? "destructive" : "primary"}
          disabled={pending || (expected !== undefined && typed.trim() !== expected)}
          onClick={() => {
            close();
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            close();
            onCancel?.();
          }}
        >
          {t("shared.confirm.cancel")}
        </Button>
      </div>
    </div>
  );
}
