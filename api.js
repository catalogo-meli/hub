// api.js
const API = (() => {
  const BASE = "/.netlify/functions/gas";

  async function request(path, { method = "GET", query, body } = {}) {
    let url = BASE;
    const qs = new URLSearchParams();

    if (method === "GET") {
      if (path) qs.set("action", path);
      if (query) Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
      });
      url += "?" + qs.toString();
      const r = await fetch(url, { method });
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
    health: () => request("health"),

    colaboradoresList: () => request("colaboradores.list"),
    flujosList: () => request("flujos.list"),
    flujosSet: (flujo, patch) => request("flujos.set", { method: "POST", body: { flujo, ...patch } }),

    habilitacionesList: () => request("habilitaciones.list"),
    habilitacionesGet: (idMeli) => request("habilitaciones.get", { query: { idMeli } }),
    habilitacionesSet: (idMeli, flujo, field, value) =>
      request("habilitaciones.set", { method: "POST", body: { idMeli, flujo, field, value } }),

    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxEnviar: () => request("slack.outbox.enviar", { method: "POST" }),

    feriadosList: () => request("feriados.list"),
  };
})();
// === NUEVO ===
// Set Perfiles_requeridos en Config_Flujos
async function flujosSetPerfiles({ flujo, perfiles_requeridos }) {
  return request("flujos.setPerfiles", { flujo, perfiles_requeridos });
}

// Set habilitado/fijo en Habilitaciones (para 1 ID_MELI y 1 flujo)
async function habilitacionesSet({ idMeli, flujo, habilitado, fijo }) {
  return request("habilitaciones.set", { idMeli, flujo, habilitado, fijo });
}

// y exportalo en HUB:
export const HUB = {
  // ...lo tuyo...
  flujosSetPerfiles,
  habilitacionesSet,
};

