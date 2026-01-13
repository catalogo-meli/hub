// api.js (ESM) — FIX: incluye token en GET/POST y usa GAS_URL si existe

const CFG = (typeof window !== "undefined" && window.APP_CONFIG) ? window.APP_CONFIG : {};

// Si definís GAS_URL en config.js, se usa eso.
// Si no, cae al proxy de Netlify.
const BASE = CFG.GAS_URL || "/.netlify/functions/gas";
const TOKEN = CFG.API_TOKEN || "";

/** Lee JSON seguro aunque el backend devuelva texto */
async function safeJson(resp) {
  const text = await resp.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, error: `Non-JSON response (${resp.status}): ${text.slice(0, 200)}` }; }
}

function withTokenParams(params = {}) {
  // doGet espera token por querystring: ?token=...
  return TOKEN ? { ...params, token: TOKEN } : params;
}

function withTokenBody(payload = {}) {
  // doPost espera token dentro del JSON: { token: "...", ... }
  return TOKEN ? { ...payload, token: TOKEN } : payload;
}

async function get(action, params = {}) {
  const qs = new URLSearchParams({ action, ...withTokenParams(params) });
  const resp = await fetch(`${BASE}?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const data = await safeJson(resp);
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.error || `GET ${action} failed (${resp.status})`);
  }
  return data.data;
}

async function post(action, payload = {}) {
  const resp = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(withTokenBody({ action, ...payload })),
  });

  const data = await safeJson(resp);
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.error || `POST ${action} failed (${resp.status})`);
  }
  return data.data;
}

export const API = {
  health: () => get("health"),

  colaboradoresList: () => get("colaboradores.list"),
  canalesList: () => get("canales.list"),

  flujosList: () => get("flujos.list"),
  flujosUpsert: (flujo, perfiles_requeridos, channel_id = "") =>
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

  // scheduling (si tu Code.gs ya lo tiene)
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
