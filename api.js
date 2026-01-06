// api.js
const HUB = (() => {
  const BASE = "/.netlify/functions/gas";

  async function request(action, { method = "GET", query, body } = {}) {
    let url = BASE;

    if (method === "GET") {
      const qs = new URLSearchParams();
      if (action) qs.set("action", action);
      if (query) {
        Object.entries(query).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        });
      }
      url += "?" + qs.toString();
      const r = await fetch(url, { method: "GET" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "API error");
      return j.data;
    }

    // POST
    const payload = { action, ...(body || {}) };
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "API error");
    return j.data;
  }

  return {
    // Health
    health: () => request("health"),

    // Lists
    colaboradoresList: () => request("colaboradores.list"),
    flujosList: () => request("flujos.list"),
    canalesList: () => request("canales.list"),
    habilitacionesList: () => request("habilitaciones.list"),

    // Presentismo
    presentismoWeek: (date) => request("presentismo.week", { query: date ? { date } : undefined }),
    presentismoStats: (date) => request("presentismo.stats", { query: date ? { date } : undefined }),
    presentismoLicenciasSet: (payload) => request("presentismo.licencias.set", { method: "POST", body: payload }),

    // Flujos autosave
    flujosUpsert: (payload) => request("flujos.upsert", { method: "POST", body: payload }),
    flujosDelete: (payload) => request("flujos.delete", { method: "POST", body: payload }),

    // Habilitaciones
    habilitacionesSet: (payload) => request("habilitaciones.set", { method: "POST", body: payload }),

    // Operativa diaria
    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),
    planificacionList: () => request("planificacion.list"),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxList: () => request("slack.outbox.list"),
    slackOutboxEnviar: (payload) => request("slack.outbox.enviar", { method: "POST", body: payload }),
  };
})();

export { HUB };
export default HUB;
