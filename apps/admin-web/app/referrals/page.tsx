"use client";

import { ArrowUpRight, CheckCircle2, Plus, RefreshCw, Share2 } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useAdminData } from "../../components/admin-data-context";

interface ReferralRecord {
  id: string;
  patientName: string;
  initials: string;
  targetSpecialty: string;
  priority: string;
  referredDate: string;
  status: string;
}

function parsePatientName(pName: any): string {
  if (!pName) return "Unnamed Patient";
  if (typeof pName === "string") return pName;
  if (Array.isArray(pName) && pName[0]?.text) return pName[0].text;
  if (typeof pName === "object" && pName?.text) return pName.text;
  if (pName?.family || pName?.given) {
    const given = Array.isArray(pName.given) ? pName.given.join(" ") : pName.given ?? "";
    return `${given} ${pName.family ?? ""}`.trim();
  }
  return "Patient";
}

function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w: string) => w[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "PT"
  );
}

export default function ReferralsPage() {
  const { client, organization } = useAdminData();
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReferrals = useCallback(async () => {
    if (!organization) return;
    try {
      setLoading(true);
      const { data, error } = await client
        .from("service_requests")
        .select(`
          id,
          category,
          status,
          priority,
          code_display,
          reason_display,
          created_at,
          patients (
            id,
            name
          )
        `)
        .eq("organization_id", organization.id)
        .eq("category", "referral")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.warn("Error fetching referrals:", error);
        setReferrals([]);
        return;
      }

      const mapped: ReferralRecord[] = (data ?? []).map((r: any) => {
        const patientRaw = Array.isArray(r.patients) ? r.patients[0] : r.patients;
        const patientName = parsePatientName(patientRaw?.name);
        const initials = getInitials(patientName);

        let referredDate = "—";
        if (r.created_at) {
          const dt = new Date(r.created_at);
          if (!isNaN(dt.getTime())) {
            referredDate = dt.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
          }
        }

        return {
          id: r.id,
          patientName,
          initials,
          targetSpecialty: r.code_display || r.reason_display || "Specialist Evaluation",
          priority: r.priority || "routine",
          referredDate,
          status: r.status || "active",
        };
      });

      setReferrals(mapped);
    } catch (err) {
      console.warn("Failed to load referrals:", err);
      setReferrals([]);
    } finally {
      setLoading(false);
    }
  }, [client, organization]);

  useEffect(() => {
    void loadReferrals();
  }, [loadReferrals]);

  return (
    <div className="vesper-page-container">
      <div className="vesper-header-row">
        <div>
          <h1 className="vesper-h1">Specialist Referrals</h1>
          <p className="vesper-header-subcopy">
            Inter-clinic and specialist referrals routed across the Odyssey provider network for {organization?.name ?? "Clinic"}.
          </p>
        </div>
        <button
          type="button"
          className="vesper-btn-outline"
          onClick={() => void loadReferrals()}
        >
          <RefreshCw size={14} /> Refresh Referrals
        </button>
      </div>

      <div className="vesper-card" style={{ marginTop: "24px" }}>
        <div className="vesper-card__header">
          <div>
            <h2 className="vesper-card__title">Active Referral Orders</h2>
            <p className="vesper-card__subtitle">
              {referrals.length} referral order{referrals.length === 1 ? "" : "s"} tracked
            </p>
          </div>
        </div>

        <div className="vesper-table-container">
          <table className="vesper-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Target Specialty</th>
                <th>Priority</th>
                <th>Referred Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {referrals.length > 0 ? (
                referrals.map((ref) => {
                  const prioLower = ref.priority.toLowerCase();
                  const prioClass =
                    prioLower === "stat"
                      ? "vesper-alert-pill--high"
                      : prioLower === "urgent"
                      ? "vesper-alert-pill--amber"
                      : "vesper-alert-pill--low";

                  return (
                    <tr key={ref.id}>
                      <td>
                        <div className="vesper-patient-cell">
                          <div className="vesper-avatar-chip">{ref.initials}</div>
                          <span className="vesper-patient-name">{ref.patientName}</span>
                        </div>
                      </td>
                      <td>{ref.targetSpecialty}</td>
                      <td>
                        <span className={`vesper-alert-pill ${prioClass}`}>
                          {ref.priority.toUpperCase()}
                        </span>
                      </td>
                      <td>{ref.referredDate}</td>
                      <td>
                        <span className="vesper-alert-pill vesper-alert-pill--amber">
                          {ref.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="vesper-table-empty">
                    {loading
                      ? "Loading active referrals..."
                      : "No active referrals available"}
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
