// netlify/functions/slack_scheduler.js
// Netlify Scheduled Function: envía mensajes vencidos del Slack_Outbox.
// Requiere env vars: GAS_URL, API_TOKEN, SLACK_BOT_TOKEN

exports.schedule = "*/1 * * * *"; // cada 1 minuto

exports.handler = async (event, context) => {
  const GAS_URL = process.env.GAS_URL;
  const API_TOKEN = process.env.API_TOKEN;
  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

  if (!GAS_URL || !API_TOKEN || !SLACK_BOT_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: "Missing env vars",
        missing: {
          GAS_URL: !GAS_URL,
          API_TOKEN: !API_TOKEN,
          SLACK_BOT_TOKEN: !SLACK_BOT_TOKEN,
        },
      }),
    };
  }

  // POST helper a GAS (Apps Script WebApp)
  const gasPost = async (payload) => {
    const r = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, token: API_TOKEN }),
    });

    const t = await r.text();
    let j;
    try {
      j = JSON.parse(t);
    } catch (e) {
      throw new Error(`GAS invalid JSON. HTTP ${r.status}. Body: ${t?.slice(0, 400)}`);
    }

    if (!r.ok || j.ok === false) throw new Error(j.error || `GAS error HTTP ${r.status}`);
    return j.data;
  };

  // 1) Pide a GAS los mensajes vencidos
  const due = await gasPost({ action: "slack.outbox.listDue" });
  const items = Array.isArray(due) ? due : [];

  let sent = 0,
    failed = 0;

  for (const it of items) {
    const row = Number(it?.row);
    const channel = String(it?.channel_id || "").trim();
    const text = String(it?.mensaje || "");

    if (!row) continue;

    if (!channel) {
      await gasPost({ action: "slack.outbox.setStatus", row, estado: "ERROR ❌ - SIN CANAL" });
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

    const stamp = new Date().toISOString();

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

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, processed: items.length, sent, failed }),
  };
};
