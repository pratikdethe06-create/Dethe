// Transactional email via Resend's HTTP API (server-side only, optional).

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false };
  const from = process.env.EMAIL_FROM || "DetheAi <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Email provider error (HTTP ${res.status}) ${detail.slice(0, 200)}`);
  }
  return { sent: true };
}

export function passwordResetEmail(name: string, link: string) {
  const first = name.split(" ")[0] || "there";
  const text = `Hi ${first},\n\nWe received a request to reset your DetheAi password. Open the link below within 30 minutes:\n\n${link}\n\nIf you didn't request this, you can safely ignore this email.\n\n— DetheAi`;
  const html = `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#fffaf2;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #eadfd2;border-radius:20px;padding:32px">
      <p style="margin:0;font-size:12px;letter-spacing:.18em;text-transform:uppercase;font-weight:800;color:#1b7d5d">DetheAi</p>
      <h1 style="margin:12px 0 8px;font-size:24px;color:#17231f">Reset your password</h1>
      <p style="margin:0 0 20px;color:#776f66;line-height:1.6">Hi ${first}, we received a request to reset your DetheAi password. This link is valid for 30 minutes.</p>
      <a href="${link}" style="display:inline-block;background:#1b7d5d;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Choose a new password</a>
      <p style="margin:24px 0 0;font-size:12px;color:#a09488;line-height:1.6">If you didn't request this, you can safely ignore this email.<br/>Or paste this link into your browser:<br/><span style="color:#5f574f">${link}</span></p>
    </div>
  </div>`;
  return { subject: "Reset your DetheAi password", html, text };
}
