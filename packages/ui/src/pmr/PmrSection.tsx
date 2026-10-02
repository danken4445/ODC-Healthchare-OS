import React from "react";

export interface PmrSectionProps {
  id?: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function PmrSection({ id, title, children, className = "" }: PmrSectionProps) {
  return (
    <section id={id} className={`pmr-section ${className}`.trim()} aria-label={title}>
      <h2 className="pmr-section-header">{title}</h2>
      <div className="pmr-section-content">{children}</div>
    </section>
  );
}
