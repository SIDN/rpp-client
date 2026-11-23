import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

/** A radio button or checkbox with its label; the native control keeps keyboard and screen reader behaviour. */
export function Choice({
  label,
  hint,
  className,
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type: "radio" | "checkbox";
  label: ReactNode;
  hint?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      <input ref={ref} className="mt-1 size-4 shrink-0 accent-primary" {...props} />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}
