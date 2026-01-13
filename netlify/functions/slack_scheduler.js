// netlify/functions/slack_scheduler.js
// Netlify Scheduled Function: envía mensajes vencidos del Slack_Outbox.
// Requiere env vars: GAS_URL, API_TOKEN, SLACK_BOT_TOKEN

exports.schedule = "*/1 * * * *"; // cada 1 minuto

exports.handler = async () => {
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

  // 1) Pide a GAS los mensajes vencidos (solo PROGRAMADO <= now)
  const due = await gasPost({ action: "slack.outbox.listDue" });
  const items = Array.isArray(due) ? due : [];

  let processed = 0;
  let claimed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const it of items) {
    processed++;
    const row = Number(it?.row);
    if (!row) { skipped++; continue; }

    // 2) Claim atómico: evita duplicación si hay overlap/reintentos
    const claim = await gasPost({ action: "slack.outbox.claimDue", row }).catch(() => null);
    if (!claim?.claimed) { skipped++; continue; }
    claimed++;

    // 3) Traer la fila completa (incluye resolución de canal por nombre)
    const item = await gasPost({ action: "slack.outbox.getRow", row });
    const channel = String(item?.channel_id || "").trim();
    const text = String(item?.mensaje || "");

    const stamp = formatStampAR(new Date());

    if (!channel) {
      await gasPost({ action: "slack.outbox.setStatus", row, estado: `ERROR ❌ ${stamp} - SIN CANAL` });
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

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, processed, claimed, sent, failed, skipped }),
  };
};
