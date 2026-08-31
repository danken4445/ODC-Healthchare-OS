'use client';

import { createBrowserSupabaseClient } from '@odyssey/supabase-client';
import { useEffect, useState, type FormEvent } from 'react';

export default function Home() {
  const [email, setEmail] = useState('doctor@odc.com');
  const [password, setPassword] = useState('');
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [status, setStatus] = useState('Sign in as a doctor, nurse, or lab staff member to verify organization-scoped access.');
  const [results, setResults] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { void createBrowserSupabaseClient().auth.getUser().then(({ data }) => setSignedInAs(data.user?.email ?? null)); }, []);

  async function verifyRls() {
    const supabase = createBrowserSupabaseClient();
    const [encounters, observations, medicationRequests] = await Promise.all([
      supabase.from('encounters').select('id, patient_id, status, period_start'),
      supabase.from('observations').select('id, patient_id, code, status'),
      supabase.from('medication_requests').select('id, patient_id, status'),
    ]);
    const error = [encounters, observations, medicationRequests].find((result) => result.error)?.error;
    if (error) return setStatus(`RLS query failed: ${error.message}`);
    setResults({ encounters: encounters.data ?? [], observations: observations.data ?? [], medicationRequests: medicationRequests.data ?? [] });
    setStatus('Staff RLS query completed. No records from Synthetic Other Clinic should appear.');
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { data, error } = await createBrowserSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) return setStatus(`Sign-in failed: ${error.message}`);
    setSignedInAs(data.user.email ?? email);
    await verifyRls();
  }

  async function signOut() { await createBrowserSupabaseClient().auth.signOut(); setSignedInAs(null); setResults(null); setStatus('Signed out.'); }

  return <main><p className="eyebrow">Phase 2 test console</p><h1>Provider access</h1>
    {!signedInAs ? <form onSubmit={signIn} className="stack"><label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label><button type="submit">Sign in and verify organization access</button><p className="hint">Try doctor@odc.com, nurse@odc.com, or lab@odc.com. Local reset password: LocalOnly-2026!.</p></form> : <div className="session"><span>Signed in as {signedInAs}</span><span><button onClick={verifyRls}>Refresh records</button> <button className="secondary" onClick={signOut}>Sign out</button></span></div>}
    <p role="status">{status}</p>{results && <pre aria-label="Staff RLS query results">{JSON.stringify(results, null, 2)}</pre>}
  </main>;
}
