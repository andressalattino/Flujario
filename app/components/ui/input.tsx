import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-11 w-full border border-input bg-background px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
