/* app.js - HUB Catálogo (Frontend) - CORREGIDO */
/* eslint-disable no-console */

import { API } from "/api.js";

// ✅ FIX: Validar que API se cargó correctamente
if (!API || typeof API.health !== "function") {
  console.error("[app.js] ERROR CRÍTICO: API no se cargó correctamente");
  alert("Error al cargar módulos. Recargá la página.");
  throw new Error("API module failed to load");
}

console.log("[app.js] API cargado OK");

/**
 * ------------------------------------------------------------
 * Estado global (simple, sin frameworks)
 * ------------------------------------------------------------
 */

const state = {
  tab: "dashboard",
  data: {
    colaboradores: [],
    canales: [],
    flujos: [],
    habilitaciones: null,
    presentismoWeek: null,
    presentismoStats: null,
    planificacion: [],
    slackOutbox: [],
  },
  ui: {
    loading: false,
    error: null,
    theme: "dark",
  },
};

// ✅ FIX: Exponer state como window.S para debug/compatibilidad
window.S = state;
console.log("[app.js] state expuesto como window.S");

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function setLoading(v) {
  state.ui.loading = !!v;
  renderLoading_();
}
function setError(msg) {
  state.ui.error = msg || null;
  renderError_();
}

function safeText_(v) {
  return (v ?? "").toString();
}

function escapeHtml_(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateDMY_(ymd) {
  if (!ymd) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(ymd)) return ymd;
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return String(ymd);
}

function toDatetimeLocal_(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}`;
}

function toast_(msg, type = "info") {
  const root = $("#toast");
  if (!root) {
    console.log(`[${type}]`, msg);
    return;
  }
  root.textContent = msg;
  root.dataset.type = type;
  root.classList.add("show");
  setTimeout(() => root.classList.remove("show"), 2500);
}

/**
 * ------------------------------------------------------------
 * Inicialización
 * ------------------------------------------------------------
 */
async function main() {
  console.log("[app.js] main() iniciando...");
  bindEvents_();
  hydrateTheme_();
  setLoading(true);
  try {
    await preload_();
    render_();
    console.log("[app.js] main() completado OK");
  } catch (e) {
    console.error("[app.js] main() ERROR:", e);
    setError(e?.message || String(e));
  } finally {
    setLoading(false);
  }
}

document.addEventListener("DOMContentLoaded", main);

/**
 * ------------------------------------------------------------
 * Preload
 * ------------------------------------------------------------
 */
async function preload_() {
  console.log("[app.js] preload_() iniciando...");
  
  // Health (opcional; si falla no rompemos)
  try {
    await API.health();
    console.log("[app.js] health OK");
  } catch (e) {
    console.warn("[app.js] health falló:", e);
  }

  // Datos base
  const [colabs, canales, flujos, hab] = await Promise.all([
    API.colaboradoresList(),
    API.canalesList(),
    API.flujosList(),
    API.habilitacionesList(),
  ]);

  state.data.colaboradores = colabs || [];
  state.data.canales = canales || [];
  state.data.flujos = flujos || [];
  state.data.habilitaciones = hab || null;

  console.log("[app.js] datos base cargados:", {
    colaboradores: state.data.colaboradores.length,
    canales: state.data.canales.length,
    flujos: state.data.flujos.length,
  });

  // Datos dinámicos iniciales
  await refreshAll_();
}

/**
 * ------------------------------------------------------------
 * Refresh por pestaña
 * ------------------------------------------------------------
 */
async function refreshAll_() {
  console.log("[app.js] refreshAll_() iniciando...");
  const tasks = [];

  tasks.push(API.planificacionList().then((x) => (state.data.planificacion = x || [])));
  tasks.push(API.slackOutboxList().then((x) => (state.data.slackOutbox = x || [])));

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const ymd = `${yyyy}-${mm}-${dd}`;

  tasks.push(
    API.presentismoStats(ymd).then((x) => {
      state.data.presentismoStats = x || null;
    })
  );

  await Promise.all(tasks);
  console.log("[app.js] refreshAll_() completado");
}

/**
 * ------------------------------------------------------------
 * Eventos UI
 * ------------------------------------------------------------
 */
function bindEvents_() {
  // Tabs
  $$(".tab").forEach((b) => {
    b.addEventListener("click", () => {
      const tab = b.dataset.tab;
      if (!tab) return;
      state.tab = tab;
      render_();
    });
  });

  // Botón actualizar global
  const btnRefresh = $("#btnRefresh");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", async () => {
      setLoading(true);
      setError(null);
      try {
        await refreshAll_();
        render_();
        toast_("Actualizado", "ok");
      } catch (e) {
        console.error(e);
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    });
  }

  // Theme toggle
  const btnTheme = $("#btnTheme");
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      state.ui.theme = state.ui.theme === "dark" ? "light" : "dark";
      persistTheme_();
      applyTheme_();
    });
  }

  // Delegación para botones dentro de tablas
  document.addEventListener("click", async (ev) => {
    const t = ev.target;

    const btnProg = t.closest?.("[data-action='outbox-programar']");
    if (btnProg) {
      ev.preventDefault();
      await onOutboxProgramar_(btnProg);
      return;
    }

    const btnDes = t.closest?.("[data-action='outbox-desprogramar']");
    if (btnDes) {
      ev.preventDefault();
      await onOutboxDesprogramar_(btnDes);
      return;
    }

    const btnSend = t.closest?.("[data-action='outbox-enviar']");
    if (btnSend) {
      ev.preventDefault();
      await onOutboxEnviar_(btnSend);
      return;
    }

    const btnHab = t.closest?.("[data-action='hab-toggle']");
    if (btnHab) {
      ev.preventDefault();
      await onHabToggle_(btnHab);
      return;
    }
  });
}

/**
 * ------------------------------------------------------------
 * Theme
 * ------------------------------------------------------------
 */
function hydrateTheme_() {
  const saved = localStorage.getItem("hub_theme");
  if (saved === "light" || saved === "dark") state.ui.theme = saved;
  applyTheme_();
}
function persistTheme_() {
  localStorage.setItem("hub_theme", state.ui.theme);
}
function applyTheme_() {
  document.documentElement.dataset.theme = state.ui.theme;
  const btnTheme = $("#btnTheme");
  if (btnTheme) btnTheme.title = state.ui.theme === "dark" ? "Modo claro" : "Modo oscuro";
}

/**
 * ------------------------------------------------------------
 * Render base
 * ------------------------------------------------------------
 */
function render_() {
  renderTabs_();
  renderError_();
  renderLoading_();

  if (state.tab === "dashboard") renderDashboard_();
  else if (state.tab === "operativa") renderOperativa_();
  else if (state.tab === "colaboradores") renderColaboradores_();
  else if (state.tab === "habilitaciones") renderHabilitaciones_();
  else if (state.tab === "presentismo") renderPresentismo_();
  else renderDashboard_();
}

function renderTabs_() {
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));
  $$(".view").forEach((v) => v.classList.toggle("hidden", v.dataset.view !== state.tab));
}

function renderError_() {
  const el = $("#errorBox");
  if (!el) return;
  if (!state.ui.error) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.classList.remove("hidden");
  el.textContent = state.ui.error;
}

function renderLoading_() {
  const el = $("#loading");
  if (!el) return;
  el.classList.toggle("hidden", !state.ui.loading);
}

/**
 * ------------------------------------------------------------
 * DASHBOARD
 * ------------------------------------------------------------
 */
function renderDashboard_() {
  const colabs = state.data.colaboradores || [];
  const plan = state.data.planificacion || [];
  const outbox = state.data.slackOutbox || [];
  const stats = state.data.presentismoStats || { presentes: 0, ausentes: 0, total: 0 };

  const byRol = {};
  for (const c of colabs) {
    const rol = safeText_(c?.Rol || c?.rol || "Sin rol").trim() || "Sin rol";
    byRol[rol] = (byRol[rol] || 0) + 1;
  }

  const tbl = $("#dashRolTableBody");
  if (tbl) {
    const rows = Object.entries(byRol)
      .sort((a, b) => b[1] - a[1])
      .map(([rol, cnt]) => {
        return `<tr>
          <td>${escapeHtml_(rol)}</td>
          <td class="num">${cnt}</td>
        </tr>`;
      })
      .join("");
    tbl.innerHTML = rows || `<tr><td colspan="2" class="muted">Sin datos</td></tr>`;
  }

  const kpiPresentes = $("#kpiPresentes");
  const kpiAusentes = $("#kpiAusentes");
  const kpiTotal = $("#kpiTotal");
  if (kpiPresentes) kpiPresentes.textContent = String(stats.presentes ?? 0);
  if (kpiAusentes) kpiAusentes.textContent = String(stats.ausentes ?? 0);
  if (kpiTotal) kpiTotal.textContent = String(stats.total ?? 0);

  const kpiPlan = $("#kpiPlan");
  if (kpiPlan) kpiPlan.textContent = String(plan.length || 0);

  const kpiOutboxPend = $("#kpiOutboxPend");
  if (kpiOutboxPend) {
    const pend = outbox.filter((x) => String(x.estado || "").toUpperCase().startsWith("PENDIENTE")).length;
    kpiOutboxPend.textContent = String(pend);
  }
}

/**
 * ------------------------------------------------------------
 * OPERATIVA DIARIA
 * ------------------------------------------------------------
 */
function renderOperativa_() {
  renderPlanificacionTable_();
  renderOutboxTable_();
}

function renderPlanificacionTable_() {
  const data = state.data.planificacion || [];
  const body = $("#planTableBody");
  if (!body) return;

  const rows = data
    .map((r) => {
      return `<tr>
        <td>${escapeHtml_(formatDateDMY_(r.fecha))}</td>
        <td>${escapeHtml_(r.flujo)}</td>
        <td>${escapeHtml_(r.id_meli)}</td>
        <td>${escapeHtml_(r.nombre || "")}</td>
        <td>${escapeHtml_(r.rol || "")}</td>
        <td>${escapeHtml_(r.es_fijo || "")}</td>
      </tr>`;
    })
    .join("");

  body.innerHTML = rows || `<tr><td colspan="6" class="muted">Sin planificación</td></tr>`;
}

function renderOutboxTable_() {
  const data = state.data.slackOutbox || [];
  const body = $("#outboxTableBody");
  if (!body) return;

  const rows = data
    .map((r) => {
      const prog = toDatetimeLocal_(r.programado_para || "");
      return `<tr>
        <td class="num">${r.row}</td>
        <td>${escapeHtml_(formatDateDMY_(r.fecha))}</td>
        <td>${escapeHtml_(r.canal || "")}</td>
        <td class="mono">${escapeHtml_(r.channel_id || "")}</td>
        <td class="msg">${escapeHtml_(r.mensaje || "")}</td>
        <td>${escapeHtml_(r.estado || "")}</td>
        <td>
          <input type="datetime-local" data-field="programado_para" data-row="${r.row}" value="${escapeHtml_(prog)}">
        </td>
        <td class="actions">
          <button class="btn small" data-action="outbox-programar" data-row="${r.row}">Programar</button>
          <button class="btn small ghost" data-action="outbox-desprogramar" data-row="${r.row}">Desprogramar</button>
        </td>
      </tr>`;
    })
    .join("");

  body.innerHTML = rows || `<tr><td colspan="8" class="muted">Sin mensajes</td></tr>`;
}

/**
 * ------------------------------------------------------------
 * COLABORADORES
 * ------------------------------------------------------------
 */
function renderColaboradores_() {
  const data = state.data.colaboradores || [];
  const body = $("#colabsTableBody");
  if (!body) return;

  const rows = data
    .map((c) => {
      const id = c?.ID_MELI ?? c?.id_meli ?? "";
      const nombre = c?.Nombre ?? c?.nombre ?? "";
      const rol = c?.Rol ?? c?.rol ?? "";
      const slack = c?.Slack_ID ?? c?.slack_id ?? "";
      return `<tr>
        <td class="mono">${escapeHtml_(id)}</td>
        <td>${escapeHtml_(nombre)}</td>
        <td>${escapeHtml_(rol)}</td>
        <td class="mono">${escapeHtml_(slack)}</td>
      </tr>`;
    })
    .join("");

  body.innerHTML = rows || `<tr><td colspan="4" class="muted">Sin colaboradores</td></tr>`;
}

/**
 * ------------------------------------------------------------
 * HABILITACIONES
 * ------------------------------------------------------------
 */
function renderHabilitaciones_() {
  const hab = state.data.habilitaciones;
  const flujos = hab?.flujos || [];
  const rows = hab?.rows || [];

  const head = $("#habTableHead");
  const body = $("#habTableBody");
  if (!head || !body) return;

  const h = [
    `<th>ID_MELI</th>`,
    ...flujos.map((f) => `<th>${escapeHtml_(f)}</th><th>Fijo</th>`),
  ].join("");
  head.innerHTML = `<tr>${h}</tr>`;

  const out = rows
    .map((r) => {
      const id = r.id_meli;
      const tds = [`<td class="mono">${escapeHtml_(id)}</td>`];
      flujos.forEach((f) => {
        const hVal = !!r[`H_${f}`];
        const fVal = !!r[`F_${f}`];
        tds.push(
          `<td>
            <button class="pill ${hVal ? "on" : "off"}" data-action="hab-toggle" data-id="${escapeHtml_(
              id
            )}" data-flujo="${escapeHtml_(f)}" data-field="habilitado">${hVal ? "SI" : "NO"}</button>
          </td>`
        );
        tds.push(
          `<td>
            <button class="pill ${fVal ? "on" : "off"} ${hVal ? "" : "disabled"}" data-action="hab-toggle" data-id="${escapeHtml_(
              id
            )}" data-flujo="${escapeHtml_(f)}" data-field="fijo">${fVal ? "SI" : "NO"}</button>
          </td>`
        );
      });
      return `<tr>${tds.join("")}</tr>`;
    })
    .join("");

  body.innerHTML = out || `<tr><td colspan="${1 + flujos.length * 2}" class="muted">Sin datos</td></tr>`;
}

/**
 * ------------------------------------------------------------
 * PRESENTISMO
 * ------------------------------------------------------------
 */
function renderPresentismo_() {
  renderPresentismoWeek_();
}

async function renderPresentismoWeek_() {
  const wrap = $("#presTableWrap");
  if (!wrap) return;

  const dateInput = $("#presDate");
  const ymd = dateInput?.value || "";
  setLoading(true);
  setError(null);

  try {
    const data = await API.presentismoWeek(ymd);
    state.data.presentismoWeek = data;

    const days = data?.days || [];
    const rows = data?.rows || [];

    const ths = [
      `<th>ID_MELI</th>`,
      `<th>Nombre</th>`,
      ...days.map((d) => `<th>${escapeHtml_(d.label || d.key)}</th>`),
    ].join("");

    const bodyRows = rows
      .map((r) => {
        const tds = [
          `<td class="mono">${escapeHtml_(r.id_meli)}</td>`,
          `<td>${escapeHtml_(r.nombre || "")}</td>`,
        ];
        days.forEach((d) => {
          const v = r.vals?.[d.key] ?? "";
          const cls = v === "P" ? "pres-p" : v ? "pres-a" : "";
          const badge = v ? escapeHtml_(v) : "";
          tds.push(`<td class="${cls}">${badge}</td>`);
        });
        return `<tr>${tds.join("")}</tr>`;
      })
      .join("");

    wrap.innerHTML = `
      <table class="table">
        <thead><tr>${ths}</tr></thead>
        <tbody>${bodyRows || `<tr><td colspan="${2 + days.length}" class="muted">Sin datos</td></tr>`}</tbody>
      </table>
    `;
  } catch (e) {
    console.error(e);
    setError(e?.message || String(e));
  } finally {
    setLoading(false);
  }
}

/**
 * ------------------------------------------------------------
 * Actions
 * ------------------------------------------------------------
 */

async function onOutboxProgramar_(btn) {
  const row = Number(btn.dataset.row);
  if (!row) return;

  const input = $(`input[data-field='programado_para'][data-row='${row}']`);
  const v = input?.value || "";

  if (!v) {
    toast_("Seleccioná fecha y hora", "warn");
    return;
  }

  setLoading(true);
  setError(null);
  try {
    await API.slackOutboxProgramar(row, v);
    await API.slackOutboxList().then((x) => (state.data.slackOutbox = x || []));
    renderOutboxTable_();
    toast_("Programado", "ok");
  } catch (e) {
    console.error(e);
    setError(e?.message || String(e));
  } finally {
    setLoading(false);
  }
}

async function onOutboxDesprogramar_(btn) {
  const row = Number(btn.dataset.row);
  if (!row) return;

  setLoading(true);
  setError(null);
  try {
    await API.slackOutboxDesprogramar(row);
    await API.slackOutboxList().then((x) => (state.data.slackOutbox = x || []));
    renderOutboxTable_();
    toast_("Desprogramado", "ok");
  } catch (e) {
    console.error(e);
    setError(e?.message || String(e));
  } finally {
    setLoading(false);
  }
}

async function onOutboxEnviar_(btn) {
  const row = Number(btn.dataset.row);
  if (!row) return;

  setLoading(true);
  setError(null);
  try {
    if (typeof API.slackOutboxEnviar !== "function") {
      toast_("Enviar no está habilitado en este front", "warn");
      return;
    }
    await API.slackOutboxEnviar(row);
    await API.slackOutboxList().then((x) => (state.data.slackOutbox = x || []));
    renderOutboxTable_();
    toast_("Enviado", "ok");
  } catch (e) {
    console.error(e);
    setError(e?.message || String(e));
  } finally {
    setLoading(false);
  }
}

async function onHabToggle_(btn) {
  const id = btn.dataset.id;
  const flujo = btn.dataset.flujo;
  const field = btn.dataset.field;
  if (!id || !flujo || !field) return;

  const hab = state.data.habilitaciones;
  const row = hab?.rows?.find((r) => r.id_meli === id);
  if (!row) return;

  const curH = !!row[`H_${flujo}`];
  const curF = !!row[`F_${flujo}`];

  let nextH = curH;
  let nextF = curF;

  if (field === "habilitado") {
    nextH = !curH;
    if (!nextH) nextF = false;
  } else if (field === "fijo") {
    if (!curH) return;
    nextF = !curF;
  }

  setLoading(true);
  setError(null);

  try {
    await API.habilitacionesSet(id, flujo, nextH, nextF);
    state.data.habilitaciones = await API.habilitacionesList();
    renderHabilitaciones_();
    toast_("Guardado", "ok");
  } catch (e) {
    console.error(e);
    setError(e?.message || String(e));
  } finally {
    setLoading(false);
  }
}
