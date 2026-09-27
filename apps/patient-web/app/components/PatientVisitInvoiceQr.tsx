"use client";

import { createBrowserSupabaseClient, getVisitInvoiceQr } from "@odyssey/supabase-client";
import { Button, PatientQrCode } from "@odyssey/ui";
import { useState } from "react";

export function PatientVisitInvoiceQr({ invoiceId }: { invoiceId: string }) {
  const [client] = useState(() => createBrowserSupabaseClient());
  const [payload, setPayload] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    const result = await getVisitInvoiceQr(client, invoiceId);
    if (result.error) setError(result.error.message);
    else {
      setPayload(result.data.payload);
      setExpiresAt(result.data.expires_at);
    }
    setLoading(false);
  };

  return <div className="patient-visit-qr">
    {payload ? <>
      <PatientQrCode payload={payload} size={176} />
      <strong>Visit invoice QR</strong>
      <p>Show this code only to authorized billing staff. It is not your patient identity QR or an e-wallet payment code.</p>
      {expiresAt ? <small>Expires {new Date(expiresAt).toLocaleString()}</small> : null}
      <Button variant="outline" onClick={() => void generate()} disabled={loading}>Rotate code</Button>
    </> : <>
      <strong>Need billing assistance?</strong>
      <p>Generate a short-lived visit code for the clinic billing desk.</p>
      <Button variant="outline" onClick={() => void generate()} disabled={loading}>{loading ? "Generating…" : "Generate visit QR"}</Button>
    </>}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
