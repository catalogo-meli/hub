// api.js (ESM)
const BASE = "/.netlify/functions/gas";

async function safeJson(resp) {
  const text = await resp.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, error: `Non-JSON response (${resp.status}): ${text.slice(0, 200)}` }; }
}

async function get(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const resp = await fetch(`${BASE}?${qs.toString()}`, { method: "GET", headers: { Accept: "application/json" } });
  const data = await safeJson(resp);
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `GET ${action} failed (${resp.status})`);
  return data.data;
}

async function post(action, body = {}) {
  const resp = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await safeJson(resp);
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `POST ${action} failed (${resp.status})`);
  return data.data;
}

const API = {
  colaboradoresList: () => get("colaboradores.list"),
  canalesList: () => get("canales.list"),
  flujosList: () => get("flujos.list"),
  flujosUpsert: (flujo, perfiles_requeridos, comentario) => post("flujos.upsert", { flujo, perfiles_requeridos, comentario }),
  flujosDelete: (flujo) => post("flujos.delete", { flujo }),

  habilitacionesList: () => get("habilitaciones.list"),
  habilitacionesSet: (idMeli, habilitado, fijo) => post("habilitaciones.set", { idMeli, habilitado, fijo }),

  planificacionList: () => get("planificacion.list"),
  planificacionGenerar: () => post("planificacion.generar", {}),

  slackOutboxGenerar: () => post("slack.outbox.generar", {}),
  slackOutboxList: () => get("slack.outbox.list"),
  slackOutboxUpdate: (row, canal, channel_id, mensaje, programado_para = "") =>
    post("slack.outbox.update", { row, canal, channel_id, mensaje, programado_para }),
  slackOutboxAppend: (fechaISO, tipo, canal, channel_id, mensaje, estado, programado_para = "") =>
    post("slack.outbox.append", { fechaISO, tipo, canal, channel_id, mensaje, estado, programado_para }),
  slackOutboxEnviar: (row, force = false) => post("slack.outbox.enviar", row ? { row, force } : { force }),
  slackOutboxEnviarProgramados: () => post("slack.outbox.enviarProgramados", {}),

  presentismoWeek: (dateYMD) => get("presentismo.week", { date: dateYMD }),
  presentismoStats: (dateYMD) => get("presentismo.stats", { date: dateYMD }),
  presentismoSetLicencia: (idMeli, desdeYMD, hastaYMD, tipo) =>
    post("presentismo.licencias.set", { idMeli, desde: desdeYMD, hasta: hastaYMD, tipo }),
};
