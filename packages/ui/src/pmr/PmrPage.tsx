import React from "react";
import type { PmrPageSize } from "@odyssey/types";

export interface PmrPageProps {
  pageSize?: PmrPageSize;
  children: React.ReactNode;
  className?: string;
}

export function PmrPage({ pageSize = "A4", children, className = "" }: PmrPageProps) {
  const sizeClass = pageSize === "Letter" ? "size-letter" : "size-a4";
  return (
    <div className={`pmr-document-container ${sizeClass} ${className}`.trim()} role="document">
      {children}
    </div>
  );
}
