"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type DropdownContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DropdownContext = React.createContext<DropdownContextValue | null>(null);

export function DropdownMenu({
  children,
  onOpenChange,
}: {
  children: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const setOpenWrapped = React.useCallback(
    (v: boolean) => {
      setOpen(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  const value = React.useMemo(() => ({ open, setOpen: setOpenWrapped }), [open, setOpenWrapped]);
  return <DropdownContext.Provider value={value}>{children}</DropdownContext.Provider>;
}

export function DropdownMenuPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function DropdownMenuTrigger({
  children,
  asChild,
  ...props
}: {
  children: React.ReactNode;
  asChild?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(DropdownContext);
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
    return React.cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e);
        ctx?.setOpen(!ctx.open);
      },
    } as never);
  }
  return (
    <button
      data-slot="dropdown-menu-trigger"
      onClick={() => ctx?.setOpen(!ctx.open)}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  className,
  sideOffset: _sideOffset = 4,
  align: _align = "end",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { sideOffset?: number; align?: string }) {
  void _sideOffset;
  void _align;
  const ctx = React.useContext(DropdownContext);
  if (!ctx?.open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => ctx.setOpen(false)} aria-hidden />
      <div
        data-slot="dropdown-menu-content"
        className={cn(
          "bg-popover text-popover-foreground z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-md absolute right-0 top-full mt-1",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </>
  );
}

export function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  onClick,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  inset?: boolean;
  variant?: "default" | "destructive";
  onClick?: (e: React.MouseEvent) => void;
}) {
  const ctx = React.useContext(DropdownContext);
  return (
    <button
      type="button"
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      onClick={(e) => {
        onClick?.(e);
        // close after click (allow onClick to handle logic)
        setTimeout(() => ctx?.setOpen(false), 0);
      }}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}

export function DropdownMenuGroup({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dropdown-menu-group" {...props}>{children}</div>;
}

export function DropdownMenuLabel({ className, inset, ...props }: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn("px-2 py-1.5 text-sm font-medium data-[inset]:pl-8", className)}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { checked?: boolean }) {
  return <div data-slot="dropdown-menu-checkbox-item" {...props}>{children}</div>;
}

export function DropdownMenuRadioGroup({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dropdown-menu-radio-group" {...props}>{children}</div>;
}

export function DropdownMenuRadioItem({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dropdown-menu-radio-item" {...props}>{children}</div>;
}

export function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dropdown-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

export function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("text-muted-foreground ml-auto text-xs tracking-widest", className)}
      {...props}
    />
  );
}

export function DropdownMenuSub({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function DropdownMenuSubTrigger({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      data-slot="dropdown-menu-sub-trigger"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSubContent({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "bg-popover text-popover-foreground z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-lg",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
