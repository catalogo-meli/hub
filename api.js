// api.js (ESM)
const BASE = "/.netlify/functions/gas";

async function safeJson(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `Non-JSON response (${resp.status}): ${text.slice(0, 200)}` };
  }
}

async function get(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const resp = await fetch(`${BASE}?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await safeJson(resp);
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `GET ${action} failed (${resp.status})`);
  return data.data;
}

async function post(action, payload = {}) {
  const resp = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await safeJson(resp);
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `POST ${action} failed (${resp.status})`);
  return data.data;
}

export const API = {
  health: () => get("health"),
  dashboard: () => get("dashboard.get"),

  colaboradoresList: () => get("colaboradores.list"),
  canalesList: () => get("canales.list"),

  flujosList: () => get("flujos.list"),
  flujosUpsert: (flujo, perfiles_requeridos, channel_id) =>
    post("flujos.upsert", { flujo, perfiles_requeridos, channel_id }),
  flujosDelete: (flujo) => post("flujos.delete", { flujo }),

  habilitacionesList: () => get("habilitaciones.list"),
  habilitacionesSet: (idMeli, flujo, habilitado, fijo) =>
    post("habilitaciones.set", { idMeli, flujo, habilitado, fijo }),

  presentismoHoy: () => get("presentismo.hoy"),
  presentismoSetRango: (idMeli, desde, hasta, tipo) =>
    post("presentismo.setRango", { idMeli, desde, hasta, tipo }),

  planificacionGenerar: () => post("planificacion.generar", {}),
  planificacionList: () => get("planificacion.list"),

  slackOutboxGenerar: () => post("slack.outbox.generar", {}),
  slackOutboxList: () => get("slack.outbox.list"),
  slackOutboxUpdate: (row, canal, channel_id, mensaje) =>
    post("slack.outbox.update", { row, canal, channel_id, mensaje }),
  slackOutboxEnviar: (row) =>
    post("slack.outbox.enviar", row ? { row } : {}),

  calidadPmList: () => get("calidad.pm.list"),
};
