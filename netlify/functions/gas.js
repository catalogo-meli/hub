// netlify/functions/gas.js
exports.handler = async (event) => {
  try {
    const GAS_URL = process.env.GAS_URL;
    const API_TOKEN = process.env.API_TOKEN;

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
