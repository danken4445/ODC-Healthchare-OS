"use client";

import { CheckCircle2, RefreshCw, Users } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useAdminData } from "../../components/admin-data-context";
import { getWaitingRoomQueue } from "@odyssey/supabase-client";
import type { WaitingRoomQueueItem } from "@odyssey/types";

export default function QueuePage() {
  const { client, organization } = useAdminData();
  const [queue, setQueue] = useState<WaitingRoomQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadQueue = async () => {
    if (!organization) return;
    setLoading(true);
    const result = await getWaitingRoomQueue(client, organization.id);
    if (!result.error && result.data) {
      setQueue(result.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadQueue();
  }, [organization]);

  return (
    <div className="vesper-page-container">
      <div className="vesper-header-row">
        <div>
          <h1 className="vesper-h1">Patient Queue</h1>
          <p className="vesper-header-subcopy">
            Live outpatient clinic waiting room and triage queue.
          </p>
        </div>
        <button
          type="button"
          className="vesper-btn-outline"
          onClick={() => void loadQueue()}
        >
          <RefreshCw size={14} /> Refresh Queue
        </button>
      </div>

      <div className="vesper-card" style={{ marginTop: "24px" }}>
        <div className="vesper-card__header">
          <div>
            <h2 className="vesper-card__title">Current Waiting Room</h2>
            <p className="vesper-card__subtitle">
              {queue.length} patient{queue.length === 1 ? "" : "s"} waiting for triage or consultation
            </p>
          </div>
        </div>

        <div className="vesper-table-container">
          <table className="vesper-table">
            <thead>
              <tr>
                <th>Queue #</th>
                <th>Service Name</th>
                <th>Scheduled At</th>
                <th>Stage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {queue.length > 0 ? (
                queue.map((item) => (
                  <tr key={item.appointment_id}>
                    <td>
                      <strong className="vesper-bed-number">
                        Q-{String(item.queue_number).padStart(3, "0")}
                      </strong>
                    </td>
                    <td>{item.service_name}</td>
                    <td>{new Date(item.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td>
                      <span className="vesper-alert-pill vesper-alert-pill--amber">
                        {item.stage}
                      </span>
                    </td>
                    <td>
                      <span className="vesper-status-dot vesper-status-dot--active" /> Waiting
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="table-empty">
                    {loading ? "Loading live clinic queue..." : "No patients are currently in the waiting room."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
