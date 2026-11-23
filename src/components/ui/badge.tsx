import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { badgeVariants, type Tone } from "./badge-variants";

const dotColor: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** A leading dot, so that the tone is not the only carrier of meaning next to the text. */
  dot?: boolean;
}

export function Badge({ className, tone = "neutral", dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", dotColor[tone])} />}
      {children}
    </span>
  );
}
