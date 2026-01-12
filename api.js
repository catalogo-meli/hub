// api.js — HUB Catálogo
// Wrapper para Netlify Function "/.netlify/functions/gas"
// Inyecta token automáticamente y expone helpers para todas las actions.

const API = (() => {
  const BASE = "/.netlify/functions/gas";

  let _token = null;

  function getToken() {
    if (_token) return _token;

    // Intentos razonables (sin romper nada si no existen)
    // 1) window.__HUB_TOKEN__
    if (typeof window !== "undefined" && window.__HUB_TOKEN__) return window.__HUB_TOKEN__;

    // 2) localStorage keys comunes
    try {
      const t1 = localStorage.getItem("hub_token");
      if (t1) return t1;
      const t2 = localStorage.getItem("HUB_TOKEN");
      if (t2) return t2;
      const t3 = localStorage.getItem("api_token");
      if (t3) return t3;
    } catch (_) {}

    return null;
  }

  function setToken(token) {
    _token = String(token || "").trim() || null;
    try {
      if (_token) localStorage.setItem("hub_token", _token);
    } catch (_) {}
  }

  async function request(action, { method = "GET", query = {}, body = {} } = {}) {
    const token = getToken();
    if (!token) {
      throw new Error(
        "Falta token. Llamá API.setToken("hub_2026_catálogo_9f3a7c1d8b2e4a6d") al iniciar, o guardalo en localStorage como 'hub_token'."
      );
    }

    const m = String(method || "GET").toUpperCase();

    if (m === "GET") {
      const qs = new URLSearchParams();
      qs.set("action", action);
      qs.set("token", token);

      Object.entries(query || {}).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        qs.set(k, String(v));
      });

      const resp = await fetch(`${BASE}?${qs.toString()}`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });

      const json = await safeJson_(resp);
      if (!json?.ok) throw new Error(json?.error || `Error en ${action}`);
      return json.data;
    }

    // POST
    const payload = { ...(body || {}), action, token };

    const resp = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await safeJson_(resp);
    if (!json?.ok) throw new Error(json?.error || `Error en ${action}`);
    return json.data;
  }

  async function safeJson_(resp) {
    const txt = await resp.text();
    try {
      return JSON.parse(txt);
    } catch (_) {
      // Si GAS devolvió HTML/error, esto te lo muestra claro.
      throw new Error(`Respuesta no-JSON (${resp.status}): ${txt.slice(0, 300)}`);
    }
  }

  // =========================
  // Public API
  // =========================
  return {
    setToken,

    // Health
    health: () => request("health"),

    // Colaboradores / Canales / Flujos
    colaboradoresList: () => request("colaboradores.list"),
    canalesList: () => request("canales.list"),
    flujosList: () => request("flujos.list"),
    flujosUpsert: (flujo, perfiles_requeridos, channel_id) =>
      request("flujos.upsert", { method: "POST", body: { flujo, perfiles_requeridos, channel_id } }),
    flujosDelete: (flujo) =>
      request("flujos.delete", { method: "POST", body: { flujo } }),

    // Habilitaciones
    habilitacionesList: () => request("habilitaciones.list"),
    habilitacionesSet: (idMeli, flujo, habilitado, fijo) =>
      request("habilitaciones.set", { method: "POST", body: { idMeli, flujo, habilitado, fijo } }),

    // Presentismo
    presentismoWeek: (date /* yyyy-mm-dd */) =>
      request("presentismo.week", { query: { date } }),
    presentismoStats: (date /* yyyy-mm-dd */) =>
      request("presentismo.stats", { query: { date } }),
    presentismoLicenciasSet: (idMeli, desde, hasta, tipo) =>
      request("presentismo.licencias.set", { method: "POST", body: { idMeli, desde, hasta, tipo } }),

    // Planificación
    planificacionList: () => request("planificacion.list"),
    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),

    // Slack Outbox
    slackOutboxList: () => request("slack.outbox.list"),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxUpdate: (row, canal, channel_id, mensaje) =>
      request("slack.outbox.update", { method: "POST", body: { row, canal, channel_id, mensaje } }),
    slackOutboxAppend: (fechaISO, tipo, canal, channel_id, mensaje, estado) =>
      request("slack.outbox.append", { method: "POST", body: { fechaISO, tipo, canal, channel_id, mensaje, estado } }),

    // Netlify Slack Direct helpers
    slackOutboxGetRow: (row) =>
      request("slack.outbox.getRow", { method: "POST", body: { row } }),
    slackOutboxSetStatus: (row, estado) =>
      request("slack.outbox.setStatus", { method: "POST", body: { row, estado } }),

    // ✅ Programar / Desprogramar (Sheets)
    slackOutboxProgramar: (row, programado_para /* YYYY-MM-DDTHH:mm */) =>
      request("slack.outbox.programar", { method: "POST", body: { row, programado_para } }),
    slackOutboxDesprogramar: (row) =>
      request("slack.outbox.desprogramar", { method: "POST", body: { row } }),

    // Scheduler pull
    slackOutboxListDue: () =>
      request("slack.outbox.listDue", { method: "POST" }),

    // Compat (Apps Script manda a Slack)
    slackOutboxEnviar: (row) =>
      request("slack.outbox.enviar", { method: "POST", body: { row } }),
  };
})();

// Compat si tu app.js espera window.API
try { window.API = API; } catch (_) {}

export default API;
