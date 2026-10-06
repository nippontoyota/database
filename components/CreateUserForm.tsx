"use client";

import { useState } from "react";

export default function CreateUserForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(body?.error ?? "Could not create the user.");
      setBusy(false);
      return;
    }

    setSuccess(`Created ${body.email}. They can sign in with the password you set.`);
    setEmail("");
    setPassword("");
    setBusy(false);
  }

  return (
    <form className="panel admin-form" onSubmit={onSubmit}>
      <h2>Create user</h2>
      <p className="lead">Adds a login directly — no sign-up email is sent.</p>

      <label htmlFor="new-email">Email</label>
      <input
        id="new-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <label htmlFor="new-password">Password</label>
      <input
        id="new-password"
        type="text"
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create user"}
      </button>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {success && <div className="success">{success}</div>}
    </form>
  );
}
