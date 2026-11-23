import { Button } from "@/components/ui/button";

/** The button that sends a form; it says so while the registry has not answered. */
export function SubmitButton({ pending, children, variant = "primary", disabled }: { pending: boolean; children: string; variant?: "primary" | "destructive"; disabled?: boolean }) {
  return (
    <Button type="submit" variant={variant} disabled={pending || disabled} aria-busy={pending}>
      {pending ? "Waiting for the registry" : children}
    </Button>
  );
}
