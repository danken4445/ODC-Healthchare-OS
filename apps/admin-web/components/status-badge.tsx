import { Circle } from "lucide-react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const tones: Record<string, Tone> = {
  Active: "success", Paid: "success", Approved: "success", Completed: "success", Enabled: "success",
  Pending: "warning", Review: "warning", Submitted: "warning", Processing: "warning", "Needs review": "warning",
  Failed: "danger", Denied: "danger", Overdue: "danger", Revoked: "danger", Critical: "danger",
  Draft: "neutral", Disabled: "neutral", Archived: "neutral", Scheduled: "info", Issued: "info", Open: "info",
};

export function StatusBadge({ label }: { label: string }) {
  const tone = tones[label] ?? "neutral";
  return <span className={`status-badge status-badge--${tone}`}><Circle aria-hidden="true" fill="currentColor" size={7} />{label}</span>;
}
