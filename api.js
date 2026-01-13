// api.js (ESM) — Contrato estable para app.js
// Usa el proxy Netlify: /.netlify/functions/gas
// Requiere token en window.CONFIG.API_TOKEN (o window.APP_CONFIG.API_TOKEN)

export const API = (() => {
  const BASE = "/.netlify/functions/gas";

  function getToken() {
    return (
      window?.CONFIG?.API_TOKEN ||
      window?.APP_CONFIG?.API_TOKEN ||
      window?.config?.API_TOKEN ||
      ""
    );
  }

  function assertOkJson(j) {
    if (!j || typeof j !== "object") throw new Error("Respuesta inválida del servidor");
    if (j.ok === false) throw new Error(j.error || "Error");
    // contrato: { ok:true, data: ... }
    return j.data;
  }

  async function request(action, { method = "GET", query = {}, body } = {}) {
    const token = getToken();
    if (!token) throw new Error("Falta API_TOKEN en config.js (window.CONFIG.API_TOKEN)");

    if (!action) throw new Error("Falta action");

    if (method === "GET") {
      const qs = new URLSearchParams({ action, token, ...query });
      const resp = await fetch(`${BASE}?${qs.toString()}`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      const j = await resp.json().catch(() => null);
      return assertOkJson(j);
    }

    // POST
    const payload = { action, token, ...(body || {}) };
    const resp = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await resp.json().catch(() => null);
    return assertOkJson(j);
  }

  // ========= GETs =========
  const colaboradoresList = () => request("colaboradores.list", { method: "GET" });
  const canalesList = () => request("canales.list", { method: "GET" });
  const flujosList = () => request("flujos.list", { method: "GET" });
  const habilitacionesList = () => request("habilitaciones.list", { method: "GET" });

  const presentismoWeek = (date) =>
    request("presentismo.week", { method: "GET", query: { date: String(date || "") } });

  const presentismoStats = (date) =>
    request("presentismo.stats", { method: "GET", query: { date: String(date || "") } });

  const planificacionList = () => request("planificacion.list", { method: "GET" });
  const slackOutboxList = () => request("slack.outbox.list", { method: "GET" });

  // ========= POSTs =========
  const flujosUpsert = (flujo, perfiles_requeridos, channel_id) =>
    request("flujos.upsert", {
      method: "POST",
      body: { flujo, perfiles_requeridos, channel_id },
    });

  const flujosDelete = (flujo) =>
    request("flujos.delete", { method: "POST", body: { flujo } });

  const habilitacionesSet = (idMeli, flujo, habilitado, fijo) =>
    request("habilitaciones.set", {
      method: "POST",
      body: { idMeli, flujo, habilitado, fijo },
    });

  const planificacionGenerar = () =>
    request("planificacion.generar", { method: "POST", body: {} });

  const slackOutboxGenerar = () =>
    request("slack.outbox.generar", { method: "POST", body: {} });

  const slackOutboxUpdate = (row, canal, channel_id, mensaje) =>
    request("slack.outbox.update", {
      method: "POST",
      body: { row, canal, channel_id, mensaje },
    });

  const slackOutboxAppend = (fechaISO, tipo, canal, channel_id, mensaje, estado) =>
    request("slack.outbox.append", {
      method: "POST",
      body: { fechaISO, tipo, canal, channel_id, mensaje, estado },
    });

  // scheduling (Sheets)
  const slackOutboxProgramar = (row, programado_para) =>
    request("slack.outbox.programar", {
      method: "POST",
      body: { row, programado_para },
    });

  const slackOutboxDesprogramar = (row) =>
    request("slack.outbox.desprogramar", { method: "POST", body: { row } });

  // Envío (vía Apps Script, mantiene compatibilidad)
  const slackSendRow = (row) =>
    request("slack.outbox.enviar", { method: "POST", body: { row } });

  // Licencias
  const presentismoSetLicencia = (idMeli, desde, hasta, tipo) =>
    request("presentismo.licencias.set", {
      method: "POST",
      body: { idMeli, desde, hasta, tipo },
    });

  return {
    request,

    colaboradoresList,
    canalesList,
    flujosList,
    habilitacionesList,
    presentismoWeek,
    presentismoStats,
    planificacionList,
    slackOutboxList,

    flujosUpsert,
    flujosDelete,
    habilitacionesSet,
    planificacionGenerar,

    slackOutboxGenerar,
    slackOutboxUpdate,
    slackOutboxAppend,

    slackOutboxProgramar,
    slackOutboxDesprogramar,

    slackSendRow,
    presentismoSetLicencia,
  };
})();

// compat opcional (por si algo viejo lo usa global)
window.API = API;

export default API;

