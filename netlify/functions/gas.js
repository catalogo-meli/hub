// netlify/functions/gas.js

export async function handler(event) {
  try {
    const GAS_URL = process.env.GAS_URL;
    const API_TOKEN = process.env.API_TOKEN;

    if (!GAS_URL) return json(500, { ok: false, error: "Missing env GAS_URL" });
    if (!API_TOKEN) return json(500, { ok: false, error: "Missing env API_TOKEN" });

    // CORS
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders(), body: "" };
    }

    const url = new URL(GAS_URL);

    if (event.httpMethod === "GET") {
      const qs = new URLSearchParams(event.queryStringParameters || {});
      qs.set("token", API_TOKEN);
      for (const [k, v] of qs.entries()) url.searchParams.set(k, v);

      const resp = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const text = await resp.text();
      return {
        statusCode: resp.status,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: text,
      };
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return json(400, { ok: false, error: "Invalid JSON body" });
      }

      body.token = API_TOKEN;

      const resp = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      const text = await resp.text();
      return {
        statusCode: resp.status,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: text,
      };
    }

    return json(405, { ok: false, error: `Method not allowed: ${event.httpMethod}` });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}
