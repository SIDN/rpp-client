import { cn } from "@/lib/utils";

/**
 * The mark of the app: a globe between code braces, the RPP protocol over the web. The braces follow the text colour, the
 * globe the accent colour. `public/logo.svg` is the same drawing with fixed colours, for the browser tab.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 32 32"
      fill="none"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      <g stroke="currentColor">
        <path d="M9 5h-.5Q6 5 6 7.5v5Q6 16 3.5 16 6 16 6 19.5v5Q6 27 8.5 27H9" />
        <path d="M23 5h.5Q26 5 26 7.5v5Q26 16 28.5 16 26 16 26 19.5v5Q26 27 23.5 27H23" />
      </g>
      <g className="stroke-accent">
        <circle cx="16" cy="16" r="6.5" />
        <ellipse cx="16" cy="16" rx="2.9" ry="6.5" />
        <path d="M9.5 16h13" />
      </g>
    </svg>
  );
}
