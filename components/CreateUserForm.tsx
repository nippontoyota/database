"use client";

import { useState } from "react";

export default function CreateUserForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
      body: JSON.stringify({ name, email }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(body?.error ?? "Could not invite the user.");
      setBusy(false);
      return;
    }

    setSuccess(`Invited ${body.email}. They'll get an email to set up their password.`);
    setName("");
    setEmail("");
    setBusy(false);
  }

  return (
    <form className="panel admin-form" onSubmit={onSubmit}>
      <h2>Invite user</h2>
      <p className="lead">
        Sends an email with a link to set up a password. They&rsquo;ll also set up an
        authenticator app on first sign-in.
      </p>

      <label htmlFor="new-name">Name</label>
      <input
        id="new-name"
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label htmlFor="new-email">Email</label>
      <input
        id="new-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Sending invite…" : "Send invite"}
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
