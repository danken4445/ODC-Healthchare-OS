"use client";

import { FormEvent, useState } from "react";
import { useAdminData } from "./admin-data-context";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function AdminSignIn() {
  const { error: accessError, signIn } = useAdminData();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    setError(await signIn(String(form.get("email")), String(form.get("password"))));
    setSubmitting(false);
  }
  return <section className="auth-panel"><div><p className="page-eyebrow">Secure administration</p><h1>Sign in to continue</h1><p>{accessError}</p></div><form onSubmit={submit}><label className="field-label">Work email<Input autoComplete="username" name="email" type="email" required /></label><label className="field-label">Password<Input autoComplete="current-password" name="password" type="password" required /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={submitting} type="submit">{submitting ? "Verifying access…" : "Sign in"}</Button></form></section>;
}
