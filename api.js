// api.js
const HUB = (() => {
  const BASE = "/.netlify/functions/gas";

  async function request(path, { method = "GET", query, body } = {}) {
    let url = BASE;

    if (method === "GET") {
      const qs = new URLSearchParams();
      if (path) qs.set("action", path);
      if (query) {
        Object.entries(query).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        });
      }
      url += "?" + qs.toString();
    }

    const opts =
      method === "GET"
        ? { method: "GET" }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: path, ...(body || {}) }),
          };

    const r = await fetch(url, opts);
    const txt = await r.text();

    let j;
    try {
      j = JSON.parse(txt);
    } catch {
      console.error("API devolvió NO-JSON:", { url, status: r.status, txt });
      throw new Error("Respuesta inválida del backend (no JSON).");
    }

    if (!j.ok) {
      console.error("API error payload:", j);
      throw new Error(j.error || "API error");
    }

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

    planificacionGet: () => request("planificacion.get"),
    slackOutboxList: () => request("slack.outbox.list"),

    // Escrituras
    flujosSetPerfiles: (flujo, perfiles_requeridos) =>
      request("flujos.setPerfiles", { method: "POST", body: { flujo, perfiles_requeridos } }),

    habilitacionesSetField: (idMeli, flujo, field, value) =>
      request("habilitaciones.set", { method: "POST", body: { idMeli, flujo, field, value } }),

    habilitacionesSet: (idMeli, flujo, { habilitado, fijo } = {}) =>
      request("habilitaciones.set", { method: "POST", body: { idMeli, flujo, habilitado, fijo } }),

    // Acciones
    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxEnviar: () => request("slack.outbox.enviar", { method: "POST" }),
  };
})();

export { HUB };
export default HUB;
