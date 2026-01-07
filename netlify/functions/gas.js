export async function handler(event) {
  const GAS_URL = process.env.GAS_URL;
  const API_TOKEN = process.env.API_TOKEN;

  if (!GAS_URL) return resp(500, { ok: false, error: "Missing GAS_URL env var" });
  if (!API_TOKEN) return resp(500, { ok: false, error: "Missing API_TOKEN env var" });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }

  try {
    if (event.httpMethod === "GET") {
      const qs = event.queryStringParameters || {};
      const url = new URL(GAS_URL);
      url.search = new URLSearchParams({ ...qs, token: API_TOKEN }).toString();

      const r = await fetch(url.toString(), { method: "GET" });
      const txt = await r.text();

      return {
        statusCode: r.status,
        headers: { ...cors(), "content-type": r.headers.get("content-type") || "application/json" },
        body: txt,
      };
    }

    if (event.httpMethod === "POST") {
      let bodyIn = {};
      if (event.body) {
        try {
          bodyIn = JSON.parse(event.body);
        } catch {
          return resp(400, { ok: false, error: "Invalid JSON body" });
        }
      }

      const bodyOut = { ...bodyIn, token: API_TOKEN };

      const r = await fetch(GAS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyOut),
      });

      const txt = await r.text();

      return {
        statusCode: r.status,
        headers: { ...cors(), "content-type": r.headers.get("content-type") || "application/json" },
        body: txt,
      };
    }

    return resp(405, { ok: false, error: `Method not allowed: ${event.httpMethod}` });
  } catch (err) {
    return resp(500, { ok: false, error: err?.message || String(err) });
  }
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

function resp(code, obj) {
  return { statusCode: code, headers: { ...cors(), "content-type": "application/json" }, body: JSON.stringify(obj) };
}
