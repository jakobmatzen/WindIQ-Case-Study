"use client";
import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

export type ChartTipProps = {
  /** Accessible name of the mark, e.g. "P50 am 18.11., 21:09". */
  label: string;
  /** What the tip shows. */
  content: React.ReactNode;
  /** The visible mark; the trigger around it is the (larger) hit area. */
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Tooltip for a chart mark. Opens at once on hover and on tap, so it also works on the phone,
 * where a plain tooltip never opens. Children can style themselves on `group-data-[popup-open]`
 * and `group-hover` for the hover state.
 */
export function ChartTip({ label, content, children, className, style }: ChartTipProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={0}
        closeDelay={0}
        aria-label={label}
        className={cn(
          "group cursor-default rounded-sm outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        style={style}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={8} collisionPadding={8} className="z-50">
          <Popover.Popup
            className={cn(
              "origin-(--transform-origin) rounded-md bg-navy px-2.5 py-1.5 text-xs text-white shadow-[0_4px_12px_rgb(18_36_62/0.18),0_1px_2px_rgb(18_36_62/0.12)] outline-none",
              "transition-[opacity,scale] duration-150 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0",
              "motion-safe:data-ending-style:scale-[0.97] motion-safe:data-starting-style:scale-[0.97]",
            )}
          >
            {content}
            <Popover.Arrow className="data-[side=bottom]:top-[-4px] data-[side=top]:bottom-[-4px]">
              <span className="block size-2 rotate-45 rounded-[1px] bg-navy" />
            </Popover.Arrow>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
