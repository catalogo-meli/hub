// api.js
const API_BASE = "/.netlify/functions/gas";

async function apiGet(action, params = {}) {
  const url = new URL(API_BASE, window.location.origin);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });

  const r = await fetch(url.toString(), { method: "GET" });
  const txt = await r.text();

  let data;
  try { data = JSON.parse(txt); } catch { data = txt; }

  if (!r.ok) throw new Error(`GET ${action} failed (${r.status}): ${typeof data === "string" ? data : (data.error || txt)}`);
  if (data && data.ok === false) throw new Error(data.error || `GET ${action} ok=false`);
  return data?.data ?? data;
}

async function apiPost(action, body = {}) {
  const r = await fetch(API_BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...body })
  });

  const txt = await r.text();

  let data;
  try { data = JSON.parse(txt); } catch { data = txt; }

  if (!r.ok) throw new Error(`POST ${action} failed (${r.status}): ${typeof data === "string" ? data : (data.error || txt)}`);
  if (data && data.ok === false) throw new Error(data.error || `POST ${action} ok=false`);
  return data?.data ?? data;
}

// 3 funciones “limpias” para tu app (lo que me pediste)
export const HubAPI = {
  health: () => apiGet("health"),
  listarAusencias: (from, to) => apiGet("presentismo.ausencias.list", { from, to }),
  crearAusencia: (payload) => apiPost("presentismo.ausencias.create", payload), // si tu Code.gs usa otro action, lo cambiamos acá
};
