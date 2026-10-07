"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function MfaEnroll() {
  const router = useRouter();
  const supabase = createClient();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      // Clear any stale unverified factor (e.g. from an abandoned enrollment)
      // before starting a new one — Supabase rejects a duplicate friendly name.
      // (This page redirects away server-side if a verified factor already
      // exists, so anything listed here is safe to drop.)
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.totp ?? []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) {
        setError(error.message);
        return;
      }
      setFactorId(data.id);
      setQrSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) {
      setError(challengeError.message);
      setBusy(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setError("That code didn't work. Check your authenticator app and try again.");
      setBusy(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  if (error && !factorId) {
    return (
      <div className="error" role="alert">
        {error}
      </div>
    );
  }

  return (
    <>
      {qrSvg && (
        <div className="mfa-qr">
          {/* eslint-disable-next-line @next/next/no-img-element -- qrSvg is a data: URI, not a static asset */}
          <img src={qrSvg} alt="Scan with your authenticator app" width={200} height={200} />
        </div>
      )}
      {secret && (
        <p className="hint">
          Can&rsquo;t scan? Enter this key manually: <code>{secret}</code>
        </p>
      )}

      <form onSubmit={onSubmit}>
        <label htmlFor="mfa-code">6-digit code</label>
        <input
          id="mfa-code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />

        <button className="btn" type="submit" disabled={busy || !factorId}>
          {busy ? "Verifying…" : "Verify & enable"}
        </button>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </form>
    </>
  );
}
