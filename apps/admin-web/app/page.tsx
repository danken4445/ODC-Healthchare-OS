'use client';

import { createBrowserSupabaseClient } from '@odyssey/supabase-client';
import { useEffect, useState, type FormEvent } from 'react';

const organizationId = '10000000-0000-0000-0000-000000000001';

export default function Home() {
  const [email, setEmail] = useState('frontdesk@odc.com');
  const [password, setPassword] = useState('');
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [status, setStatus] = useState('Sign in as front desk or admin to register a walk-in patient.');
  const [issuedCredentials, setIssuedCredentials] = useState<{ walkInId: string; pin: string } | null>(null);

  useEffect(() => {
    void createBrowserSupabaseClient().auth.getUser().then(({ data }) =>
      setSignedInAs(data.user?.email ?? null),
    );
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { error, data } = await createBrowserSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) return setStatus(`Sign-in failed: ${error.message}`);
    setSignedInAs(data.user.email ?? email);
    setStatus('Signed in. You can now create a walk-in patient if this account has a front_desk or admin role.');
  }

  async function createWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIssuedCredentials(null);
    const fields = new FormData(form);
    const name = String(fields.get('name') ?? '').trim();
    if (!name) return setStatus('Enter the patient name.');
    const { data, error } = await createBrowserSupabaseClient().rpc('create_walk_in_patient', {
      p_organization_id: organizationId,
      p_name: { text: name },
      p_telecom: [],
      p_birth_date: String(fields.get('birthDate') ?? '') || null,
      p_gender: String(fields.get('gender') ?? '') || null,
    });
    if (error || !data?.[0]) return setStatus(`Walk-in creation failed: ${error?.message ?? 'No credentials returned.'}`);
    setIssuedCredentials({ walkInId: data[0].walk_in_id, pin: data[0].pin });
    setStatus('Walk-in created. Record these credentials now; the PIN is never stored in readable form.');
    form.reset();
  }

  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    setSignedInAs(null);
    setIssuedCredentials(null);
    setStatus('Signed out.');
  }

  return <main>
    <p className="eyebrow">Phase 2 test console</p>
    <h1>Front desk access</h1>
    {!signedInAs ? <form onSubmit={signIn} className="stack">
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
      <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
      <button type="submit">Sign in</button>
      <p className="hint">For a local reset only: use LocalOnly-2026!. Hosted test users need a unique staging password.</p>
    </form> : <>
      <div className="session"><span>Signed in as {signedInAs}</span><button onClick={signOut} className="secondary">Sign out</button></div>
      <h2>Create a walk-in patient</h2>
      <form onSubmit={createWalkIn} className="stack">
        <label>Patient name<input name="name" required placeholder="Test walk-in patient" /></label>
        <label>Date of birth <input name="birthDate" type="date" /></label>
        <label>Gender <input name="gender" placeholder="optional" /></label>
        <button type="submit">Generate walk-in ID and PIN</button>
      </form>
    </>}
    {issuedCredentials && <section className="credential" aria-live="polite"><strong>Give these to the patient now</strong><code>{issuedCredentials.walkInId}</code><code>PIN: {issuedCredentials.pin}</code></section>}
    <p role="status">{status}</p>
  </main>;
}
