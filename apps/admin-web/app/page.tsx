"use client";

import {
  createBrowserSupabaseClient,
  createWalkInPatient,
  getCurrentUserEmail,
  signInWithPassword,
  signOut,
} from "@odyssey/supabase-client";
import type { WalkInCredentials } from "@odyssey/types";
import { Button, Field, Input } from "@odyssey/ui";
import { useEffect, useState, type FormEvent } from "react";

const organizationId = "10000000-0000-0000-0000-000000000001";

export default function Home() {
  const [email, setEmail] = useState("frontdesk@odc.com");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [status, setStatus] = useState(
    "Sign in as front desk or admin to register a walk-in patient.",
  );
  const [issuedCredentials, setIssuedCredentials] =
    useState<WalkInCredentials | null>(null);

  useEffect(() => {
    void getCurrentUserEmail(createBrowserSupabaseClient()).then((result) => {
      if (!result.error) setSignedInAs(result.data);
    });
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await signInWithPassword(
      createBrowserSupabaseClient(),
      email,
      password,
    );
    if (result.error)
      return setStatus(`Sign-in failed: ${result.error.message}`);
    setSignedInAs(result.data);
    setStatus(
      "Signed in. You can now create a walk-in patient if this account has a front_desk or admin role.",
    );
  }

  async function createWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIssuedCredentials(null);
    const fields = new FormData(form);
    const name = String(fields.get("name") ?? "").trim();
    if (!name) return setStatus("Enter the patient name.");
    const result = await createWalkInPatient(createBrowserSupabaseClient(), {
      organizationId,
      name,
      birthDate: String(fields.get("birthDate") ?? "") || null,
      gender: String(fields.get("gender") ?? "") || null,
    });
    if (result.error)
      return setStatus(`Walk-in creation failed: ${result.error.message}`);
    setIssuedCredentials(result.data);
    setStatus(
      "Walk-in created. Record these credentials now; the PIN is never stored in readable form.",
    );
    form.reset();
  }

  async function handleSignOut() {
    const result = await signOut(createBrowserSupabaseClient());
    if (result.error)
      return setStatus(`Sign-out failed: ${result.error.message}`);
    setSignedInAs(null);
    setIssuedCredentials(null);
    setStatus("Signed out.");
  }

  return (
    <main>
      <p className="eyebrow">Phase 2 test console</p>
      <h1>Front desk access</h1>
      {!signedInAs ? (
        <form onSubmit={signIn} className="stack">
          <Field label="Email">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
            />
          </Field>
          <Field label="Password">
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
            />
          </Field>
          <Button type="submit">Sign in</Button>
          <p className="hint">
            For a local reset only: use LocalOnly-2026!. Hosted test users need
            a unique staging password.
          </p>
        </form>
      ) : (
        <>
          <div className="session">
            <span>Signed in as {signedInAs}</span>
            <Button onClick={handleSignOut} variant="secondary">
              Sign out
            </Button>
          </div>
          <h2>Create a walk-in patient</h2>
          <form onSubmit={createWalkIn} className="stack">
            <Field label="Patient name">
              <Input name="name" required placeholder="Test walk-in patient" />
            </Field>
            <Field label="Date of birth">
              <Input name="birthDate" type="date" />
            </Field>
            <Field label="Gender">
              <Input name="gender" placeholder="optional" />
            </Field>
            <Button type="submit">Generate walk-in ID and PIN</Button>
          </form>
        </>
      )}
      {issuedCredentials && (
        <section className="credential" aria-live="polite">
          <strong>Give these to the patient now</strong>
          <code>{issuedCredentials.walkInId}</code>
          <code>PIN: {issuedCredentials.pin}</code>
        </section>
      )}
      <p role="status">{status}</p>
    </main>
  );
}
