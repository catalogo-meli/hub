// api.js
const API = (() => {
  const BASE = "/.netlify/functions/gas";

  async function request(path, { method = "GET", query, body } = {}) {
    let url = BASE;
    const qs = new URLSearchParams();

    if (method === "GET") {
      if (path) qs.set("action", path);
      if (query) Object.entries(query).forEach(([k, v]) => (v != null) && qs.set(k, String(v)));
      const q = qs.toString();
      if (q) url += `?${q}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Error");
      return data.data;
    }

    // POST
    const payload = { action: path, ...(body || {}) };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || "Error");
    return data.data;
  }

  return {
    // GET
    health: () => request("health"),
    colaboradoresList: () => request("colaboradores.list"),
    canalesList: () => request("canales.list"),
    flujosList: () => request("flujos.list"),
    habilitacionesList: () => request("habilitaciones.list"),
    presentismoWeek: (date) => request("presentismo.week", { query: { date } }),
    presentismoStats: (date) => request("presentismo.stats", { query: { date } }),
    planificacionList: () => request("planificacion.list"),
    slackOutboxList: () => request("slack.outbox.list"),

    // POST
    flujosUpsert: (payload) => request("flujos.upsert", { method: "POST", body: payload }),
    flujosDelete: (payload) => request("flujos.delete", { method: "POST", body: payload }),
    habilitacionesSet: (payload) => request("habilitaciones.set", { method: "POST", body: payload }),
    planificacionGenerar: () => request("planificacion.generar", { method: "POST", body: {} }),

    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST", body: {} }),
    slackOutboxUpdate: (payload) => request("slack.outbox.update", { method: "POST", body: payload }),
    slackOutboxAppend: (payload) => request("slack.outbox.append", { method: "POST", body: payload }),

    slackOutboxGetRow: (payload) => request("slack.outbox.getRow", { method: "POST", body: payload }),
    slackOutboxSetStatus: (payload) => request("slack.outbox.setStatus", { method: "POST", body: payload }),

    slackOutboxProgramar: (payload) => request("slack.outbox.programar", { method: "POST", body: payload }),
    slackOutboxDesprogramar: (payload) => request("slack.outbox.desprogramar", { method: "POST", body: payload }),

    slackOutboxListDue: () => request("slack.outbox.listDue", { method: "POST", body: {} }),
  };
})();

export { API };
