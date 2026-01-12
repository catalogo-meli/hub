// app.js (ESM)
import * as apiModule from "/api.js";

// Compat: soporta api.js como named export {API}, default export, o window.API
const API = (() => {
  const v = apiModule?.API ?? apiModule?.default ?? globalThis?.API;
  return (typeof v === "function") ? v() : v;
})();

/**
 * app.js
 * UI HUB Catálogo — Equipo & Planificación
 * (sin frameworks; Tailwind + fetch a Netlify Functions)
 */

/* =========================
   Utils
========================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const fmt = {
  ymd(d) {
    if (!(d instanceof Date)) d = new Date(d);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  },
  humanDate(d) {
    if (!(d instanceof Date)) d = new Date(d);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  },
  safe(s) {
    return String(s ?? "");
  },
};

function toast(msg, type = "info") {
  const box = $("#toast");
  if (!box) {
    console[type === "error" ? "error" : "log"](msg);
    return;
  }
  box.textContent = msg;
  box.classList.remove("hidden");
  box.dataset.type = type;
  clearTimeout(box._t);
  box._t = setTimeout(() => box.classList.add("hidden"), 3500);
}

function setLoading(on) {
  const el = $("#loading");
  if (!el) return;
  el.classList.toggle("hidden", !on);
}

/* =========================
   State
========================= */
const S = {
  tab: "dashboard",
  colabs: [],
  canales: [],
  flujos: [],
  hab: null,
  presentismo: null,
  planificacion: [],
  outbox: [],
  selectedDateYMD: fmt.ymd(new Date()),
};

/* =========================
   Rendering: Tabs
========================= */
function setActiveTab(tab) {
  S.tab = tab;
  $$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".tab-pane").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${tab}`));
}

function bindTabs() {
  $$(".tab-btn").forEach((b) => {
    b.addEventListener("click", () => setActiveTab(b.dataset.tab));
  });
}

/* =========================
   Dashboard (simple)
========================= */
function renderDashboard() {
  // Placeholder: el dashboard real lo tenías ya armado con tus cards.
  // No toco nada “de negocio” acá.
}

/* =========================
   Flujos (Operativa diaria)
========================= */
function renderFlujos() {
  const tbody = $("#flujos-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  S.flujos.forEach((f) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2 font-medium">${fmt.safe(f.flujo)}</td>
      <td class="px-3 py-2 text-right">${Number(f.perfiles_requeridos || 0)}</td>
      <td class="px-3 py-2">${fmt.safe(f.channel_id || "")}</td>
      <td class="px-3 py-2 text-right">
        <button class="btn btn-sm" data-act="del" data-flujo="${encodeURIComponent(f.flujo)}">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // acciones
  $$("button[data-act='del']", tbody).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const flujo = decodeURIComponent(btn.dataset.flujo || "");
      if (!flujo) return;
      if (!confirm(`Eliminar flujo "${flujo}"?`)) return;
      try {
        setLoading(true);
        await API.flujosDelete(flujo);
        await refreshAll();
        toast("Flujo eliminado", "info");
      } catch (e) {
        toast(e.message || String(e), "error");
      } finally {
        setLoading(false);
      }
    });
  });
}

async function onAddFlujo() {
  const inFlujo = $("#new-flujo");
  const inReq = $("#new-req");
  const inChan = $("#new-chan");
  const flujo = fmt.safe(inFlujo?.value).trim();
  const req = Number(inReq?.value || 0);
  const chan = fmt.safe(inChan?.value).trim();

  if (!flujo) return toast("Flujo requerido", "error");

  try {
    setLoading(true);
    await API.flujosUpsert(flujo, req, chan);
    if (inFlujo) inFlujo.value = "";
    if (inReq) inReq.value = "";
    if (inChan) inChan.value = "";
    await refreshAll();
    toast("Flujo guardado", "info");
  } catch (e) {
    toast(e.message || String(e), "error");
  } finally {
    setLoading(false);
  }
}

/* =========================
   Colaboradores
========================= */
function renderColaboradores() {
  const tbody = $("#colabs-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  S.colabs.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2">${fmt.safe(c.ID_MELI || c.id_meli || "")}</td>
      <td class="px-3 py-2">${fmt.safe(c.Nombre || c.nombre || "")}</td>
      <td class="px-3 py-2">${fmt.safe(c.Rol || c.rol || "")}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* =========================
   Habilitaciones
========================= */
function renderHabilitaciones() {
  const wrap = $("#hab-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!S.hab) {
    wrap.innerHTML = `<div class="muted">Sin datos.</div>`;
    return;
  }

  const { flujos, rows } = S.hab;

  const table = document.createElement("table");
  table.className = "table w-full";
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  trh.innerHTML = `<th class="px-3 py-2">ID_MELI</th>` + flujos.map((f) => `<th class="px-3 py-2">${fmt.safe(f)}</th>`).join("");
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    const tds = [];
    tds.push(`<td class="px-3 py-2 font-medium">${fmt.safe(r.id_meli)}</td>`);
    flujos.forEach((f) => {
      const hKey = `H_${f}`;
      const fKey = `F_${f}`;
      const hVal = !!r[hKey];
      const fVal = !!r[fKey];

      tds.push(`
        <td class="px-3 py-2">
          <div class="flex items-center gap-2">
            <label class="inline-flex items-center gap-1">
              <input type="checkbox" data-hab="1" data-id="${encodeURIComponent(r.id_meli)}" data-flujo="${encodeURIComponent(f)}" ${hVal ? "checked" : ""}/>
              <span class="text-xs">Hab</span>
            </label>
            <label class="inline-flex items-center gap-1">
              <input type="checkbox" data-fijo="1" data-id="${encodeURIComponent(r.id_meli)}" data-flujo="${encodeURIComponent(f)}" ${fVal ? "checked" : ""} ${hVal ? "" : "disabled"}/>
              <span class="text-xs">Fijo</span>
            </label>
          </div>
        </td>
      `);
    });
    tr.innerHTML = tds.join("");
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  // listeners
  $$("input[data-hab='1']", wrap).forEach((ch) => {
    ch.addEventListener("change", onHabChange);
  });
  $$("input[data-fijo='1']", wrap).forEach((ch) => {
    ch.addEventListener("change", onFijoChange);
  });
}

async function onHabChange(e) {
  const el = e.target;
  const id = decodeURIComponent(el.dataset.id || "");
  const flujo = decodeURIComponent(el.dataset.flujo || "");
  const habilitado = !!el.checked;

  const fijoEl = $(`input[data-fijo='1'][data-id="${CSS.escape(encodeURIComponent(id))}"][data-flujo="${CSS.escape(encodeURIComponent(flujo))}"]`);
  const fijo = fijoEl ? !!fijoEl.checked : false;

  try {
    setLoading(true);
    await API.habilitacionesSet(id, flujo, habilitado, habilitado ? fijo : false);
    await refreshHabilitacionesOnly();
  } catch (err) {
    toast(err.message || String(err), "error");
  } finally {
    setLoading(false);
  }
}

async function onFijoChange(e) {
  const el = e.target;
  const id = decodeURIComponent(el.dataset.id || "");
  const flujo = decodeURIComponent(el.dataset.flujo || "");
  const fijo = !!el.checked;

  const habEl = $(`input[data-hab='1'][data-id="${CSS.escape(encodeURIComponent(id))}"][data-flujo="${CSS.escape(encodeURIComponent(flujo))}"]`);
  const habilitado = habEl ? !!habEl.checked : false;

  try {
    setLoading(true);
    await API.habilitacionesSet(id, flujo, habilitado, fijo);
    await refreshHabilitacionesOnly();
  } catch (err) {
    toast(err.message || String(err), "error");
  } finally {
    setLoading(false);
  }
}

async function refreshHabilitacionesOnly() {
  S.hab = await API.habilitacionesList();
  renderHabilitaciones();
}

/* =========================
   Presentismo
========================= */
function renderPresentismo() {
  const inDate = $("#pres-date");
  if (inDate) inDate.value = S.selectedDateYMD;

  const wrap = $("#pres-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!S.presentismo) {
    wrap.innerHTML = `<div class="muted">Sin datos.</div>`;
    return;
  }

  const { days, rows } = S.presentismo;

  const table = document.createElement("table");
  table.className = "table w-full";
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  trh.innerHTML =
    `<th class="px-3 py-2">ID</th><th class="px-3 py-2">Nombre</th>` +
    days.map((d) => `<th class="px-3 py-2">${fmt.safe(d.label)}</th>`).join("");
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    const tds = [];
    tds.push(`<td class="px-3 py-2 font-medium">${fmt.safe(r.id_meli)}</td>`);
    tds.push(`<td class="px-3 py-2">${fmt.safe(r.nombre || "")}</td>`);
    days.forEach((d) => {
      const v = r.vals?.[d.key] ?? "";
      tds.push(`<td class="px-3 py-2 text-center">${fmt.safe(v)}</td>`);
    });
    tr.innerHTML = tds.join("");
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}

async function onPresRefresh() {
  try {
    setLoading(true);
    S.presentismo = await API.presentismoWeek(S.selectedDateYMD);
    renderPresentismo();
  } catch (e) {
    toast(e.message || String(e), "error");
  } finally {
    setLoading(false);
  }
}

/* =========================
   Planificación
========================= */
function renderPlanificacion() {
  const tbody = $("#plan-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  S.planificacion.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2">${fmt.safe(r.fecha)}</td>
      <td class="px-3 py-2 font-medium">${fmt.safe(r.flujo)}</td>
      <td class="px-3 py-2">${fmt.safe(r.id_meli)}</td>
      <td class="px-3 py-2">${fmt.safe(r.nombre)}</td>
      <td class="px-3 py-2">${fmt.safe(r.es_fijo)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function onGenerarPlanificacion() {
  try {
    setLoading(true);
    await API.planificacionGenerar();
    await refreshPlanificacionOnly();
    toast("Planificación generada", "info");
  } catch (e) {
    toast(e.message || String(e), "error");
  } finally {
    setLoading(false);
  }
}

async function refreshPlanificacionOnly() {
  S.planificacion = await API.planificacionList();
  renderPlanificacion();
}

/* =========================
   Slack Outbox
========================= */
function renderOutbox() {
  const tbody = $("#outbox-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  S.outbox.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2">${Number(r.row)}</td>
      <td class="px-3 py-2">${fmt.safe(r.fecha)}</td>
      <td class="px-3 py-2">${fmt.safe(r.canal)}</td>
      <td class="px-3 py-2">${fmt.safe(r.channel_id)}</td>
      <td class="px-3 py-2 whitespace-pre-wrap">${fmt.safe(r.mensaje)}</td>
      <td class="px-3 py-2">${fmt.safe(r.estado)}</td>
      <td class="px-3 py-2">
        <div class="flex flex-col gap-2">
          <button class="btn btn-sm" data-act="send" data-row="${r.row}">Enviar</button>
          <button class="btn btn-sm" data-act="programar" data-row="${r.row}">Programar</button>
          <button class="btn btn-sm" data-act="desprogramar" data-row="${r.row}">Desprogramar</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  $$("button[data-act='send']", tbody).forEach((b) => b.addEventListener("click", () => onOutboxSend(Number(b.dataset.row))));
  $$("button[data-act='programar']", tbody).forEach((b) => b.addEventListener("click", () => onOutboxProgramar(Number(b.dataset.row))));
  $$("button[data-act='desprogramar']", tbody).forEach((b) => b.addEventListener("click", () => onOutboxDesprogramar(Number(b.dataset.row))));
}

async function refreshOutboxOnly() {
  S.outbox = await API.slackOutboxList();
  renderOutbox();
}

async function onGenerarOutbox() {
  try {
    setLoading(true);
    await API.slackOutboxGenerar();
    await refreshOutboxOnly();
    toast("Outbox generado", "info");
  } catch (e) {
    toast(e.message || String(e), "error");
  } finally {
    setLoading(false);
  }
}

async function onOutboxSend(row) {
  try {
    setLoading(true);
    // Si tu Netlify function expone slack.sendRow, perfecto.
    // Si no existe, esto va a tirar error y lo verás en toast (no “congela”).
    if (typeof API.slackSendRow === "function") {
      await API.slackSendRow(row);
    } else {
      // fallback legacy
      await API.slackOutboxEnviar(row);
    }
    await refreshOutboxOnly();
    toast(`Enviado row ${row}`, "info");
  } catch (e) {
    toast(e.message || String(e), "error");
  } finally {
    setLoading(false);
  }
}

async function onOutboxProgramar(row) {
  const when = prompt("Programar para (YYYY-MM-DDTHH:mm):");
  if (!when) return;

  try {
    setLoading(true);
    await API.slackOutboxProgramar(row, when);
    await refreshOutboxOnly();
    toast(`Programado row ${row}`, "info");
  } catch (e) {
    toast(e.message || String(e), "error");
  } finally {
    setLoading(false);
  }
}

async function onOutboxDesprogramar(row) {
  try {
    setLoading(true);
    await API.slackOutboxDesprogramar(row);
    await refreshOutboxOnly();
    toast(`Desprogramado row ${row}`, "info");
  } catch (e) {
    toast(e.message || String(e), "error");
  } finally {
    setLoading(false);
  }
}

/* =========================
   Refresh / Init
========================= */
async function refreshAll() {
  // Nota: orden importa (habilitaciones depende de flujos)
  S.colabs = await API.colaboradoresList();
  S.canales = await API.canalesList();
  S.flujos = await API.flujosList();
  S.hab = await API.habilitacionesList();
  S.planificacion = await API.planificacionList();
  S.outbox = await API.slackOutboxList();

  renderDashboard();
  renderColaboradores();
  renderFlujos();
  renderHabilitaciones();
  renderPlanificacion();
  renderOutbox();

  // presentismo por fecha actual
  S.presentismo = await API.presentismoWeek(S.selectedDateYMD);
  renderPresentismo();
}

async function main() {
  // Guard rail: si API no existe, no “congeles” toda la app
  if (!API || typeof API.health !== "function") {
    console.error("API no disponible o mal importada:", API);
    toast("API no disponible (revisá api.js / imports)", "error");
    return;
  }

  bindTabs();
  setActiveTab("dashboard");

  $("#btn-refresh")?.addEventListener("click", async () => {
    try {
      setLoading(true);
      await refreshAll();
      toast("Actualizado", "info");
    } catch (e) {
      toast(e.message || String(e), "error");
    } finally {
      setLoading(false);
    }
  });

  $("#btn-add-flujo")?.addEventListener("click", onAddFlujo);
  $("#btn-planif-gen")?.addEventListener("click", onGenerarPlanificacion);
  $("#btn-outbox-gen")?.addEventListener("click", onGenerarOutbox);

  $("#pres-date")?.addEventListener("change", async (e) => {
    S.selectedDateYMD = e.target.value || fmt.ymd(new Date());
    await onPresRefresh();
  });
  $("#btn-pres-refresh")?.addEventListener("click", onPresRefresh);

  try {
    setLoading(true);
    await API.health(); // sanity check rápido
    await refreshAll();
  } catch (e) {
    toast(e.message || String(e), "error");
  } finally {
    setLoading(false);
  }
}

document.addEventListener("DOMContentLoaded", main);
