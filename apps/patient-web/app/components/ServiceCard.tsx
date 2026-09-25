import type { ReactNode } from "react";
import { Card } from "@odyssey/ui";

interface ServiceCardProps {
  description: string;
  duration: number;
  icon?: ReactNode;
  name: string;
}

export function ServiceCard({ description, duration, icon, name }: ServiceCardProps) {
  return (
    <Card className="service-card">
      <span className="service-card__icon" aria-hidden="true">{icon ?? "✦"}</span>
      <div>
        <h3>{name}</h3>
        <p>{description}</p>
        <p className="service-card__meta">About {duration} minutes</p>
      </div>
    </Card>
  );
}
