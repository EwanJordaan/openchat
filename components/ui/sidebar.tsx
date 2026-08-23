"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Minimal stub matching intern3's sidebar API, without radix/shadcn complexity.
// Provides Sidebar* primitives with correct Tailwind classNames verbatim.

export function useSidebar() {
  return {
    // intern3 uses setOpenMobile(false) to close mobile sheet
    setOpenMobile: (_open: boolean) => {
      void _open;
    },
    setOpen: (_open: boolean) => {
      void _open;
    },
    open: true,
    openMobile: false,
    isMobile: false,
    state: "expanded" as const,
  };
}

export function Sidebar({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="sidebar" {...props}>
      {children}
    </div>
  );
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-header" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto", className)}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  className,
  asChild: _asChild,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }) {
  void _asChild;
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupAction({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      data-slot="sidebar-group-action"
      className={cn(
        "absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-group-content" className={cn("w-full text-sm", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul data-slot="sidebar-menu" className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li data-slot="sidebar-menu-item" className={cn("group/menu-item relative", className)} {...props} />;
}

export function SidebarMenuButton({
  className,
  asChild,
  isActive: _isActive,
  ...props
}: React.HTMLAttributes<HTMLElement> & { asChild?: boolean; isActive?: boolean }) {
  void _isActive;
  // asChild true means render a Slot-like div; we just render a div container for Link
  if (asChild) {
    return (
      <div
        data-slot="sidebar-menu-button"
        className={cn(
          "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <button
      data-slot="sidebar-menu-button"
      className={cn(
        "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuAction({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      data-slot="sidebar-menu-action"
      className={cn(
        "absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuBadge({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      className={cn(
        "absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuSkeleton(props: React.HTMLAttributes<HTMLDivElement> & { showIcon?: boolean }) {
  return <div data-slot="sidebar-menu-skeleton" {...props} />;
}

export function SidebarRail({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button data-slot="sidebar-rail" className={cn("hidden", className)} {...props} />;
}

export function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-inset" className={cn("flex min-h-0 flex-1 flex-col", className)} {...props} />;
}

export function SidebarInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input data-slot="sidebar-input" className={cn("h-8 w-full bg-background", className)} {...props} />;
}

export function SidebarSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-separator" className={cn("mx-2 w-auto bg-sidebar-border", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-footer" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarTrigger({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button data-slot="sidebar-trigger" className={cn("h-7 w-7", className)} {...props} />;
}
