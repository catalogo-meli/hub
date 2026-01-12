// netlify/functions/gas.js
// Proxy a Google Apps Script + Slack sender (direct from Netlify)
exports.handler = async (event) => {
  try {
    const GAS_URL = process.env.GAS_URL;
    const API_TOKEN = process.env.API_TOKEN;
    const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN; // Netlify env var

    if (!GAS_URL) return json(500, { ok: false, error: "Missing GAS_URL env var" });
    if (!API_TOKEN) return json(500, { ok: false, error: "Missing API_TOKEN env var" });

    const method = event.httpMethod || "GET";

    if (method === "GET") {
      const qs = event.queryStringParameters || {};
      const url = new URL(GAS_URL);
      Object.entries(qs).forEach(([k, v]) => url.searchParams.set(k, v));
      url.searchParams.set("token", API_TOKEN);

      const resp = await fetch(url.toString(), { method: "GET" });
      const text = await resp.text();
      return { statusCode: resp.status, headers: cors(), body: text };
    }

    if (method === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const action = String(body?.action || "");

      // ===== Slack direct (no UrlFetch in Apps Script) =====
      if (action === "slack.sendRow" || action === "slack.sendDue") {
        if (!SLACK_BOT_TOKEN) return json(500, { ok: false, error: "Missing SLACK_BOT_TOKEN env var" });

        // helper to call GAS
        const gasPost = async (payload) => {
          payload.token = API_TOKEN;
          const resp = await fetch(GAS_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
          });
          const text = await resp.text();
          let parsed;
          try { parsed = JSON.parse(text); } catch { parsed = null; }
          if (!resp.ok) throw new Error(`GAS error (${resp.status})`);
          if (!parsed || parsed.ok === false) throw new Error(parsed?.error || "GAS error");
          return parsed.data;
        };

        if (action === "slack.sendRow") {
          const row = Number(body?.row);
          if (!row) return json(400, { ok: false, error: "row requerido" });

          const item = await gasPost({ action: "slack.outbox.getRow", row });
          const { channel_id, mensaje } = item || {};
          if (!channel_id) {
            await gasPost({ action: "slack.outbox.setStatus", row, estado: `ERROR ❌ - SIN CANAL` });
            return json(200, { ok: true, data: { row, ok: false, error: "SIN CANAL" } });
          }

          const slackResp = await postToSlack(SLACK_BOT_TOKEN, channel_id, String(mensaje || ""));
          const stamp = new Date().toISOString();
          if (slackResp.ok) {
            await gasPost({ action: "slack.outbox.setStatus", row, estado: `ENVIADO ✅ ${stamp}` });
            return json(200, { ok: true, data: { row, slack: slackResp } });
          }
          await gasPost({ action: "slack.outbox.setStatus", row, estado: `ERROR ❌ ${stamp} - ${slackResp.error || "desconocido"}` });
          return json(200, { ok: false, error: slackResp.error || "slack_error" });
        }

        // slack.sendDue
        const due = await gasPost({ action: "slack.outbox.listDue" });
        const items = Array.isArray(due) ? due : (due?.items || []);
        let sent = 0, failed = 0;

        for (const it of items) {
          const row = Number(it?.row);
          const channel_id = String(it?.channel_id || "").trim();
          const mensaje = String(it?.mensaje || "");
          if (!row) continue;

          if (!channel_id) {
            await gasPost({ action: "slack.outbox.setStatus", row, estado: `ERROR ❌ - SIN CANAL` });
            failed++;
            continue;
          }

          const slackResp = await postToSlack(SLACK_BOT_TOKEN, channel_id, mensaje);
          const stamp = new Date().toISOString();
          if (slackResp.ok) {
            await gasPost({ action: "slack.outbox.setStatus", row, estado: `ENVIADO ✅ ${stamp}` });
            sent++;
          } else {
            await gasPost({ action: "slack.outbox.setStatus", row, estado: `ERROR ❌ ${stamp} - ${slackResp.error || "desconocido"}` });
            failed++;
          }
        }
        return json(200, { ok: true, data: { processed: items.length, sent, failed } });
      }

      // ===== Default: proxy to GAS =====
      body.token = API_TOKEN;

      const resp = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
      });

      const text = await resp.text();
      return { statusCode: resp.status, headers: cors(), body: text };
    }

    return json(405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    return json(500, { ok: false, error: e.message || String(e) });
  }
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
function json(statusCode, obj) {
  return { statusCode, headers: { ...cors(), "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

async function postToSlack(token, channel, text) {
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

