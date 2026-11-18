import { cn } from "@/lib/utils";

/** Small uppercase label above a figure or section, as in the WindIQ app. */
export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** White card with a hairline ring and a soft shadow, the main surface on the grey canvas. */
export function Card({ children, className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-xl bg-card shadow-[0_1px_2px_rgb(18_36_62/0.06)] ring-1 ring-border",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
