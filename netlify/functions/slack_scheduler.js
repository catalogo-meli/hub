// netlify/functions/slack_scheduler.js
// Netlify Scheduled Function: envía mensajes vencidos del Slack_Outbox.
// Requiere env vars: GAS_URL, API_TOKEN, SLACK_BOT_TOKEN
// Depende de que tu Code.gs implemente: slack.outbox.listDue y slack.outbox.setStatus

exports.handler = async () => {
  try {
    const GAS_URL = process.env.GAS_URL;
    const API_TOKEN = process.env.API_TOKEN;
    const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

    if (!GAS_URL) return json(500, { ok: false, error: "Missing GAS_URL env var" });
    if (!API_TOKEN) return json(500, { ok: false, error: "Missing API_TOKEN env var" });
    if (!SLACK_BOT_TOKEN) return json(500, { ok: false, error: "Missing SLACK_BOT_TOKEN env var" });

    // helper to call GAS
    const gasPost = async (payload) => {
      payload.token = API_TOKEN;
      const r = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });

      const t = await r.text();
      let j;
      try { j = JSON.parse(t); } catch { j = null; }

      if (!r.ok) throw new Error(`GAS error (${r.status})`);
      if (!j || j.ok === false) throw new Error(j?.error || "GAS error");
      return j.data;
    };

    // 1) pedir mensajes vencidos
    const due = await gasPost({ action: "slack.outbox.listDue" });
    const items = Array.isArray(due) ? due : (due?.items || []);

    let sent = 0, failed = 0;

    for (const it of items) {
      const row = Number(it?.row);
      const channel = String(it?.channel_id || "").trim();
      const text = String(it?.mensaje || "");

      if (!row) continue;

      if (!channel) {
        await gasPost({ action: "slack.outbox.setStatus", row, estado: `ERROR ❌ ${formatStampAR_(new Date())} - SIN CANAL` });
        failed++;
        continue;
      }

      const slack = await postToSlack_(SLACK_BOT_TOKEN, channel, text);
      const stamp = formatStampAR_(new Date());

      if (slack && slack.ok) {
        await gasPost({ action: "slack.outbox.setStatus", row, estado: `ENVIADO ✅ ${stamp}` });
        sent++;
      } else {
        await gasPost({
          action: "slack.outbox.setStatus",
          row,
          estado: `ERROR ❌ ${stamp} - ${slack?.error || "desconocido"}`,
        });
        failed++;
      }
    }

    return json(200, { ok: true, processed: items.length, sent, failed });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || String(e) });
  }
};

// ✅ Netlify Scheduled Function config (cada 1 minuto)
exports.config = {
  schedule: "*/1 * * * *",
};

function formatStampAR_(d) {
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
}

async function postToSlack_(token, channel, text) {
  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text }),
  });

  const data = await resp.json().catch(() => null);
  if (!data) return { ok: false, error: "invalid_json" };
  return data;
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(obj),
  };
}
