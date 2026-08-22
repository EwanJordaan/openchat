import * as React from "react";
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={className}
      style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", padding: 12 }}
      {...props}
    />
  );
}
