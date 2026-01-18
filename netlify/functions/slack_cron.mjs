// netlify/functions/slack_cron.mjs
// Scheduled Function (cron) real: envía mensajes vencidos del Slack_Outbox.
// Requiere env vars: GAS_URL, API_TOKEN, SLACK_BOT_TOKEN

export default async (req) => {
  const GAS_URL = process.env.GAS_URL;
  const API_TOKEN = process.env.API_TOKEN;
  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

  if (!GAS_URL || !API_TOKEN || !SLACK_BOT_TOKEN) {
    console.error("Missing env vars", { GAS_URL: !!GAS_URL, API_TOKEN: !!API_TOKEN, SLACK_BOT_TOKEN: !!SLACK_BOT_TOKEN });
    return new Response("Missing env vars", { status: 500 });
  }

  const formatStampAR = (d) => {
    const fmt = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return fmt.format(d).replace(",", "");
  };

  const gasPost = async (payload) => {
    const resp = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, token: API_TOKEN }),
    });

    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`GAS invalid JSON. HTTP ${resp.status}. Body (first 400): ${String(text || "").slice(0, 400)}`);
    }

    if (!resp.ok || json.ok === false) throw new Error(json.error || `GAS error HTTP ${resp.status}`);
    return json.data;
  };

  let processed = 0;
  let claimed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // 1) listar vencidos
    const due = await gasPost({ action: "slack.outbox.listDue" });
    const items = Array.isArray(due) ? due : [];

    for (const it of items) {
      processed++;
      const row = Number(it?.row);
      if (!row) {
        skipped++;
        continue;
      }

      // 2) claim atómico
      const claim = await gasPost({ action: "slack.outbox.claimDue", row }).catch(() => null);
      if (!claim?.claimed) {
        skipped++;
        continue;
      }
      claimed++;

      // 3) get row
      const item = await gasPost({ action: "slack.outbox.getRow", row });
      const channel = String(item?.channel_id || "").trim();
      const text = String(item?.mensaje || "").trim();
      const stamp = formatStampAR(new Date());

      if (!channel) {
        await gasPost({ action: "slack.outbox.setStatus", row, estado: `ERROR ❌ ${stamp} - SIN CANAL` });
        failed++;
        continue;
      }
      if (!text) {
        await gasPost({ action: "slack.outbox.setStatus", row, estado: `ERROR ❌ ${stamp} - SIN MENSAJE` });
        failed++;
        continue;
      }

      const slackResp = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        },
        body: JSON.stringify({ channel, text }),
      })
        .then((r) => r.json())
        .catch(() => null);

      if (slackResp && slackResp.ok) {
        await gasPost({ action: "slack.outbox.setStatus", row, estado: `ENVIADO ✅ ${stamp}` });
        sent++;
      } else {
        await gasPost({
          action: "slack.outbox.setStatus",
          row,
          estado: `ERROR ❌ ${stamp} - ${slackResp?.error || "desconocido"}`,
        });
        failed++;
      }
    }

    console.log(JSON.stringify({ ok: true, processed, claimed, sent, failed, skipped }));
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("slack_cron failed", { message: e?.message || String(e), processed, claimed, sent, failed, skipped });
    return new Response("error", { status: 500 });
  }
};

export const config = {
  // Cron en UTC. Cada 1 minuto.
  schedule: "*/1 * * * *",
};
