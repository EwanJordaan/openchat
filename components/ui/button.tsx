"use client";

import * as React from "react";

type Variant = "default" | "primary" | "ghost";
type Size = "sm" | "md" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "default", size = "md", className, ...props }: ButtonProps) {
  const base = "btn" + (variant === "primary" ? " primary" : variant === "ghost" ? " ghost" : "");
  const sz = size === "sm" ? " btn-sm" : size === "icon" ? " btn-icon" : "";
  return <button className={base + sz + (className ? ` ${className}` : "")} {...props} />;
}
