const RESEND_URL = "https://api.resend.com/emails";

export async function notifyOwner(subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const owner = Deno.env.get("OWNER_EMAIL");
  if (!apiKey || !owner) return;

  try {
    await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "Contratta-AI/1.0",
      },
      body: JSON.stringify({
        from: "Contratta AI <onboarding@resend.dev>",
        to: [owner],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Notificações são auxiliares: nunca devem quebrar o fluxo principal.
  }
}

export function ownerEmailShell(title: string, rows: Array<[string, string]>) {
  const list = rows.map(([label, value]) => `<tr><td style="padding:6px 10px;color:#64748b;font-size:12px">${label}</td><td style="padding:6px 10px;color:#0f172a;font-size:13px;font-weight:600">${value}</td></tr>`).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#2563eb;color:#fff;padding:16px 20px;font-size:18px;font-weight:700">Contratta AI · ${title}</div><table style="width:100%;border-collapse:collapse;padding:12px">${list}</table><div style="padding:12px 20px;color:#94a3b8;font-size:11px">Notificação automática do sistema.</div></div>`;
}
