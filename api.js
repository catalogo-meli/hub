// api.js
const API = (() => {
  const BASE = "/.netlify/functions/gas";

  async function request(path, { method = "GET", query, body } = {}) {
    let url = BASE;
    const qs = new URLSearchParams();

    if (method === "GET") {
      if (path) qs.set("action", path);
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
    const payload = { action: path, ...(body || {}) };
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

    // Lecturas
    colaboradoresList: () => request("colaboradores.list"),
    flujosList: () => request("flujos.list"),
    feriadosList: () => request("feriados.list"),

    habilitacionesList: () => request("habilitaciones.list"),
    habilitacionesGet: (idMeli) => request("habilitaciones.get", { query: { idMeli } }),

    // === EDITS ===

    // A) Flujos: set Perfiles_requeridos en Config_Flujos
    flujosSetPerfiles: (flujo, perfiles_requeridos) =>
      request("flujos.setPerfiles", {
        method: "POST",
        body: { flujo, perfiles_requeridos },
      }),

    // B1) Habilitaciones (modo legacy): toggle por field/value (tu implementación vieja)
    habilitacionesSetField: (idMeli, flujo, field, value) =>
      request("habilitaciones.set", {
        method: "POST",
        body: { idMeli, flujo, field, value },
      }),

    // B2) Habilitaciones (modo nuevo): set habilitado/fijo juntos
    habilitacionesSet: (idMeli, flujo, { habilitado, fijo } = {}) =>
      request("habilitaciones.set", {
        method: "POST",
        body: { idMeli, flujo, habilitado, fijo },
      }),

    // Acciones
    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxEnviar: () => request("slack.outbox.enviar", { method: "POST" }),
  };
})();
