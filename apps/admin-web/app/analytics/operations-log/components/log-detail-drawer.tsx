"use client";

import type { ClinicOperationsLogEntry } from "@odyssey/supabase-client";
import { Check, Copy, ExternalLink, ShieldAlert, User, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../../components/ui/button";
import { formatDatePst } from "../../../../hooks/use-operations-logs";

interface LogDetailDrawerProps {
  log: ClinicOperationsLogEntry | null;
  onClose: () => void;
}

export function LogDetailDrawer({ log, onClose }: LogDetailDrawerProps) {
  const [copied, setCopied] = useState(false);

  if (!log) return null;

  const copyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(log.metadata, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasMetadata =
    log.metadata &&
    typeof log.metadata === "object" &&
    Object.keys(log.metadata).length > 0;

  return (
    <div className="log-drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <aside className="log-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <header className="log-drawer-header">
          <div>
            <span className={`badge badge--${log.module}`}>{log.module.toUpperCase()}</span>
            <span className={`badge badge--action-${log.action}`}>{log.action.toUpperCase()}</span>
            <h2 id="drawer-title">{log.description}</h2>
            <p className="log-drawer-time">{formatDatePst(log.occurredAt)}</p>
          </div>
          <button type="button" className="drawer-close-btn" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </header>

        <div className="log-drawer-body">
          {/* Operator Information */}
          <section className="drawer-section">
            <h3>Operator & Session</h3>
            <div className="drawer-grid">
              <div className="drawer-item">
                <span className="drawer-label">Actor Name</span>
                <span className="drawer-value font-medium flex items-center gap-1.5">
                  <User size={14} className="text-muted" />
                  {log.actorName}
                </span>
              </div>
              <div className="drawer-item">
                <span className="drawer-label">Actor Type</span>
                <span className="drawer-value capitalize">{log.actorType.replace("_", " ")}</span>
              </div>
              <div className="drawer-item full-width">
                <span className="drawer-label">Actor Account UUID</span>
                <code className="drawer-code">{log.actorId ?? "System / None"}</code>
              </div>
            </div>
          </section>

          {/* Target Resource Information */}
          <section className="drawer-section">
            <h3>Target Resource</h3>
            <div className="drawer-grid">
              <div className="drawer-item">
                <span className="drawer-label">Database Table</span>
                <span className="drawer-value font-mono">{log.tableName}</span>
              </div>
              <div className="drawer-item">
                <span className="drawer-label">Operation Log ID</span>
                <span className="drawer-value font-mono">#{log.id}</span>
              </div>
              <div className="drawer-item full-width">
                <span className="drawer-label">Target Record UUID</span>
                <code className="drawer-code">{log.recordId ?? "N/A"}</code>
              </div>
            </div>
          </section>

          {/* Audit Metadata & Changes */}
          <section className="drawer-section">
            <div className="flex items-center justify-between mb-2">
              <h3>Movement Metadata & Payload</h3>
              {hasMetadata && (
                <Button size="sm" variant="outline" onClick={copyPayload} className="copy-payload-btn">
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  <span>{copied ? "Copied" : "Copy JSON"}</span>
                </Button>
              )}
            </div>

            {hasMetadata ? (
              <pre className="log-json-viewer">
                <code>{JSON.stringify(log.metadata, null, 2)}</code>
              </pre>
            ) : (
              <div className="empty-payload-notice">
                <ShieldAlert size={16} />
                <span>No custom changes payload attached to this audit trigger.</span>
              </div>
            )}
          </section>
        </div>

        <footer className="log-drawer-footer">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Inspector
          </Button>
        </footer>
      </aside>
    </div>
  );
}
