'use client';

import { createBrowserSupabaseClient, createWalkInSupabaseClient } from '@odyssey/supabase-client';
import { useEffect, useState, type FormEvent } from 'react';

const organizationId = '10000000-0000-0000-0000-000000000001';

export default function Home() {
  const [email, setEmail] = useState('patient@synthetic.odyssey.test');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('Sign in as a registered patient, or use a walk-in ID and PIN.');
  const [records, setRecords] = useState<Record<string, unknown[]> | null>(null);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);

  useEffect(() => { void createBrowserSupabaseClient().auth.getUser().then(({ data }) => setSignedInAs(data.user?.email ?? null)); }, []);

  async function loadRegisteredRecords() {
    const supabase = createBrowserSupabaseClient();
    const [patients, appointments, encounters, observations] = await Promise.all([
      supabase.from('patients').select('id, name, walk_in_id'),
      supabase.from('appointments').select('id, status, start_at'),
      supabase.from('encounters').select('id, status, period_start'),
      supabase.from('observations').select('id, code, status, value'),
    ]);
    const error = [patients, appointments, encounters, observations].find((result) => result.error)?.error;
    if (error) return setStatus(`Record query failed: ${error.message}`);
    setRecords({ patients: patients.data ?? [], appointments: appointments.data ?? [], encounters: encounters.data ?? [], observations: observations.data ?? [] });
    setStatus('Registered-patient RLS query completed. Only your records should appear below.');
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { data, error } = await createBrowserSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) return setStatus(`Sign-in failed: ${error.message}`);
    setSignedInAs(data.user.email ?? email);
    await loadRegisteredRecords();
  }

  async function sendMagicLink() {
    const { error } = await createBrowserSupabaseClient().auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setStatus(error ? `Magic-link request failed: ${error.message}` : 'Magic link requested. Check the inbox for this address.');
  }

  async function useWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const { data, error } = await createBrowserSupabaseClient().functions.invoke('issue-walk-in-token', { body: {
      organization_id: organizationId, walk_in_id: String(fields.get('walkInId')), pin: String(fields.get('pin')),
    } });
    if (error || !data?.access_token) return setStatus(`Walk-in sign-in failed: ${error?.message ?? 'No access token returned.'}`);
    const walkIn = createWalkInSupabaseClient(data.access_token);
    const [patients, encounters, observations] = await Promise.all([
      walkIn.from('patients').select('id, name, walk_in_id'),
      walkIn.from('encounters').select('id, status, period_start'),
      walkIn.from('observations').select('id, code, status, value'),
    ]);
    const queryError = [patients, encounters, observations].find((result) => result.error)?.error;
    if (queryError) return setStatus(`Walk-in RLS query failed: ${queryError.message}`);
    setRecords({ patients: patients.data ?? [], encounters: encounters.data ?? [], observations: observations.data ?? [] });
    setStatus('Walk-in token accepted. The records below must belong only to this walk-in patient.');
  }

  async function claimWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const { error } = await createBrowserSupabaseClient().rpc('claim_walk_in_patient', {
      p_organization_id: organizationId, p_walk_in_id: String(fields.get('claimWalkInId')), p_pin: String(fields.get('claimPin')),
    });
    setStatus(error ? `Claim failed: ${error.message}` : 'Record claimed. This account is now linked to the original patient row.');
  }

  async function signOut() { await createBrowserSupabaseClient().auth.signOut(); setSignedInAs(null); setRecords(null); setStatus('Signed out.'); }

  return <main>
    <p className="eyebrow">Phase 2 test console</p><h1>Patient access</h1>
    <section><h2>Registered patient</h2>{!signedInAs ? <form onSubmit={signIn} className="stack">
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
      <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
      <button type="submit">Sign in and verify my records</button><button type="button" className="secondary" onClick={sendMagicLink}>Send magic link</button>
    </form> : <div className="session"><span>Signed in as {signedInAs}</span><span><button onClick={loadRegisteredRecords}>Refresh records</button> <button className="secondary" onClick={signOut}>Sign out</button></span></div>}</section>
    <section><h2>Walk-in patient</h2><form onSubmit={useWalkIn} className="stack"><label>Walk-in ID<input name="walkInId" pattern="WK-\\d{4}-\\d{6}" placeholder="WK-2026-000001" required /></label><label>4-digit PIN<input name="pin" inputMode="numeric" pattern="\\d{4}" required /></label><button type="submit">Use walk-in credentials</button></form></section>
    {signedInAs && <section><h2>Claim a walk-in record</h2><form onSubmit={claimWalkIn} className="stack"><label>Walk-in ID<input name="claimWalkInId" required /></label><label>PIN<input name="claimPin" inputMode="numeric" pattern="\\d{4}" required /></label><button type="submit">Claim existing record</button></form></section>}
    <p role="status">{status}</p>{records && <pre aria-label="RLS query results">{JSON.stringify(records, null, 2)}</pre>}
  </main>;
}
