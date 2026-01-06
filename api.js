// api.js (ESM)
const HUB = (() => {
  const BASE = "/.netlify/functions/gas";

  async function request(action, { method = "GET", query, body } = {}) {
    if (method === "GET") {
      const qs = new URLSearchParams();
      if (action) qs.set("action", action);
      if (query) {
        Object.entries(query).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        });
      }
      const url = `${BASE}?${qs.toString()}`;
      const r = await fetch(url, { method: "GET" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "API error");
      return j.data;
    }

    const payload = { action, ...(body || {}) };
    const r = await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "API error");
    return j.data;
  }

  return {
    // health
    health: () => request("health"),

    // lists
    colaboradoresList: () => request("colaboradores.list"),
    flujosList: () => request("flujos.list"),
    canalesList: () => request("canales.list"),
    habilitacionesList: () => request("habilitaciones.list"),
    planificacionList: () => request("planificacion.list"),
    slackOutboxList: () => request("slack.outbox.list"),

    // flujos CRUD (autosave)
    flujosUpsert: ({ flujo, perfiles_requeridos, slack_channel }) =>
      request("flujos.upsert", { method: "POST", body: { flujo, perfiles_requeridos, slack_channel } }),
    flujosDelete: ({ flujo }) =>
      request("flujos.delete", { method: "POST", body: { flujo } }),

    // habilitaciones
    habilitacionesSet: ({ idMeli, flujo, habilitado, fijo }) =>
      request("habilitaciones.set", { method: "POST", body: { idMeli, flujo, habilitado, fijo } }),

    // operativa diaria
    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxEnviarAll: () => request("slack.outbox.enviar", { method: "POST", body: { all: true } }),
    slackOutboxEnviarRow: (row) => request("slack.outbox.enviar", { method: "POST", body: { row } }),

    // presentismo
    presentismoWeek: (dateYMD = "") => request("presentismo.week", { query: dateYMD ? { date: dateYMD } : {} }),
    presentismoStats: (dateYMD = "") => request("presentismo.stats", { query: dateYMD ? { date: dateYMD } : {} }),
    presentismoLicenciasSet: ({ idMeli, desde, hasta, tipo }) =>
      request("presentismo.licencias.set", { method: "POST", body: { idMeli, desde, hasta, tipo } }),
  };
})();

export { HUB };
export default HUB;
