import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        outline: "border border-foreground/25 bg-transparent text-foreground",
        ghost: "text-foreground",
      },
      size: { default: "h-11 px-5", sm: "h-10 px-3", icon: "size-10" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
