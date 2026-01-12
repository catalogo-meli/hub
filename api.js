// api.js
// Wrapper de llamadas a Netlify Function (proxy a Apps Script)

const BASE = "/.netlify/functions/gas";

async function request(path, { method = "GET", query, body } = {}) {
  let url = BASE;

  // GET: action por querystring
  if (method === "GET") {
    const qs = new URLSearchParams();
    if (query) Object.entries(query).forEach(([k, v]) => v != null && qs.set(k, String(v)));
    qs.set("action", path);
    url = `${BASE}?${qs.toString()}`;
  }

  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };

  // POST: action + payload en body
  if (method === "POST") {
    opts.body = JSON.stringify({ action: path, ...(body || {}) });
  }

  const res = await fetch(url, opts);

  // Si Netlify devuelve HTML/errores raros, esto te lo deja claro.
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    throw new Error(`Respuesta no-JSON desde backend (${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok || !j?.ok) {
    throw new Error(j?.error || `HTTP ${res.status}`);
  }
  return j.data;
}

function get(action, query) {
  return request(action, { method: "GET", query });
}

function post(action, body) {
  return request(action, { method: "POST", body });
}

// ✅ EXPORT NOMBRADO (lo que tu app.js necesita)
export const API = {
  health: () => get("health"),

  colaboradoresList: () => get("colaboradores.list"),
  canalesList: () => get("canales.list"),
  flujosList: () => get("flujos.list"),

  flujosUpsert: (flujo, perfiles_requeridos, channel_id) =>
    post("flujos.upsert", { flujo, perfiles_requeridos, channel_id }),
  flujosDelete: (flujo) => post("flujos.delete", { flujo }),

  habilitacionesList: () => get("habilitaciones.list"),
  habilitacionesSet: (idMeli, flujo, habilitado, fijo) =>
    post("habilitaciones.set", { idMeli, flujo, habilitado, fijo }),

  planificacionGenerar: () => post("planificacion.generar", {}),
  planificacionList: () => get("planificacion.list"),

  slackOutboxGenerar: () => post("slack.outbox.generar", {}),
  slackOutboxList: () => get("slack.outbox.list"),
  slackOutboxUpdate: (row, canal, channel_id, mensaje) =>
    post("slack.outbox.update", { row, canal, channel_id, mensaje }),
  slackOutboxAppend: (fechaISO, tipo, canal, channel_id, mensaje, estado) =>
    post("slack.outbox.append", { fechaISO, tipo, canal, channel_id, mensaje, estado }),
  slackOutboxEnviar: (row) => post("slack.outbox.enviar", row ? { row } : {}),

  // ✅ scheduling (ya lo agregaste en Code.gs)
  slackOutboxProgramar: (row, programado_para) =>
    post("slack.outbox.programar", { row, programado_para }),
  slackOutboxDesprogramar: (row) =>
    post("slack.outbox.desprogramar", { row }),
  slackOutboxListDue: () => post("slack.outbox.listDue", {}),

  presentismoWeek: (dateYMD) => get("presentismo.week", { date: dateYMD }),
  presentismoStats: (dateYMD) => get("presentismo.stats", { date: dateYMD }),
  presentismoSetLicencia: (idMeli, desdeYMD, hastaYMD, tipo) =>
    post("presentismo.licencias.set", { idMeli, desde: desdeYMD, hasta: hastaYMD, tipo }),
};

// (Opcional) export default por compatibilidad si en algún lado lo usabas así.
export default API;
