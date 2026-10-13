// A plain GET page with no side effects — safe for link-preview bots (WhatsApp,
// iMessage, etc.) to fetch without burning the single-use invite token. The
// actual token verification only happens when the person clicks the button,
// which POSTs to /auth/confirm.
export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;

  if (!token_hash || !type) {
    return (
      <div className="login-wrap">
        <div className="panel login-card">
          <h1>Invalid link</h1>
          <p>This invite link is missing required information. Ask your admin for a fresh one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="panel login-card" action="/auth/confirm" method="post">
        <h1>You&rsquo;ve been invited</h1>
        <p>Click below to continue and set up your account.</p>
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next ?? "/set-password"} />
        <button className="btn" type="submit">
          Accept invitation
        </button>
      </form>
    </div>
  );
}
