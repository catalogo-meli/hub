// app.js (ESM)
import { API } from "/api.js";

const ROLES_BUCKETS = ["Analista PM", "Líderes", "Analista KV", "Analista QA"];

const EQUIPOS_PRESET = [
  "Celeste Cignoli",
  "José Puentes",
  "Matías López",
  "Matías Minczuk",
];

const $ = (id) => document.getElementById(id);

/***********************
 * CACHE CLIENTE (TTL)
 * Evita re-fetches innecesarios al navegar entre tabs
 ***********************/
const CACHE_VERSION = "v7"; // incrementar si cambia el formato de los datos
const CACHE = {
  _store: {},
  _ss: typeof sessionStorage !== "undefined" ? sessionStorage : null,
  _sk: (k) => "hub_cache_" + CACHE_VERSION + "_" + k,

  set(key, data, ttlMs = 60_000) {
    const exp = Date.now() + ttlMs;
    this._store[key] = { data, exp };
    // Persistir en sessionStorage para sobrevivir F5
    if (this._ss) {
      try {
        this._ss.setItem(this._sk(key), JSON.stringify({ data, exp }));
      } catch (_) {} // quota exceeded — silencioso
    }
  },

  get(key) {
    // 1. Primero memoria (más rápido)
    const m = this._store[key];
    if (m && Date.now() <= m.exp) return m.data;
    // 2. Fallback a sessionStorage (sobrevive F5)
    if (this._ss) {
      try {
        const raw = this._ss.getItem(this._sk(key));
        if (raw) {
          const e = JSON.parse(raw);
          if (e && Date.now() <= e.exp) {
            this._store[key] = e; // repoblar memoria
            return e.data;
          }
          this._ss.removeItem(this._sk(key));
        }
      } catch (_) {}
    }
    return null;
  },

  invalidate(key) {
    delete this._store[key];
    if (this._ss) try { this._ss.removeItem(this._sk(key)); } catch (_) {}
  },

  invalidateAll() {
    this._store = {};
    if (this._ss) {
      try {
        Object.keys(this._ss)
          .filter(k => k.startsWith("hub_cache_"))
          .forEach(k => this._ss.removeItem(k));
      } catch (_) {}
    }
  },
};

/***********************
 * SKELETON LOADING
 ***********************/
function showTableSkeleton(tableId, rows = 5) {
  const el = document.getElementById(tableId);
  if (!el) return;
  // Detecta columnas del thead si existe, fallback a 4
  const cols = el.querySelector("thead tr")?.children?.length || 4;
  const tbody = el.querySelector("tbody") || el;
  const target = el.tagName === "TABLE" ? (el.querySelector("tbody") || el) : el;
  target.innerHTML = Array.from({ length: rows }, () =>
    `<tr>${Array.from({ length: cols }, () =>
      `<td><div class="skeleton"></div></td>`).join("")}</tr>`
  ).join("");
}

function toast(t1, t2 = "", type = "") {
  const box = $("toast");
  if (!box) return;
  $("toastT1").textContent = t1;
  $("toastT2").textContent = t2;
  box.classList.remove("toast-ok", "toast-err");
  if (type === "ok")  box.classList.add("toast-ok");
  if (type === "err") box.classList.add("toast-err");
  box.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { box.classList.remove("show", "toast-ok", "toast-err"); }, 3200);
}

function setErr(msg = "") {
  const el = $("errBar");
  if (!el) return;
  if (!msg) {
    el.classList.remove("show");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.add("show");
}

/* ========= Feedback visual (estado) ========= */
function setBusy(t1, t2 = "") {
  const el = $("busy");
  if (!el) return;
  const a = $("busyT1");
  const b = $("busyT2");
  if (a) a.textContent = t1;
  if (b) b.textContent = t2;
  el.classList.add("show");
}

function clearBusy() {
  const el = $("busy");
  if (!el) return;
  el.classList.remove("show");
}

function fmtDateDMY(isoYMD) {
  if (!isoYMD) return "";
  const [y, m, d] = isoYMD.split("-").map(Number);
  if (!y || !m || !d) return isoYMD;
  return `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`;
}

function fmtDDMM_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

// ISO week (lunes) start date for a given ISO year + week number
function isoWeekMonday_(isoYear, weekNum) {
  const jan4 = new Date(isoYear, 0, 4); // always in ISO week 1
  const day = jan4.getDay() || 7; // 1..7 (Mon..Sun), with Sun=7
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setDate(jan4.getDate() - (day - 1));
  const monday = new Date(mondayWeek1);
  monday.setDate(mondayWeek1.getDate() + (weekNum - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function presWeekLabelWithRange_(weekKey, anchorYear) {
  const raw = String(weekKey || "").trim();
  if (!raw) return raw;

  // Accept "W1" or "2026-W1" / "2026W1"
  let y = Number(anchorYear) || new Date().getFullYear();
  let w = null;

  let m = raw.match(/^(\d{4})\s*-\s*W(\d{1,2})$/i) || raw.match(/^(\d{4})\s*W(\d{1,2})$/i);
  if (m) {
    y = Number(m[1]);
    w = Number(m[2]);
  } else {
    m = raw.match(/^W(\d{1,2})$/i);
    if (m) w = Number(m[1]);
  }

  if (!w || w < 1 || w > 53) return raw;

  const mon = isoWeekMonday_(y, w);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);

  return `W${w} ${fmtDDMM_(mon)} - ${fmtDDMM_(fri)}`;
}


function fmtDateAny(val) {
  const ts = parseDateAnyToTs_(val);
  if (!Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

// Normaliza múltiples formatos de fecha a timestamp (ms). Devuelve NaN si es inválido.
function parseDateAnyToTs_(val) {
  if (val == null || val === "") return NaN;
  if (val instanceof Date) {
    const t = val.getTime();
    return Number.isFinite(t) ? t : NaN;
  }
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : NaN;
  }

  const s = String(val).trim();
  if (!s) return NaN;

  // ISO completo (con T/Z) o variantes parseables
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;

  // yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    const t = dt.getTime();
    return Number.isFinite(t) ? t : NaN;
  }

  // dd/mm/yyyy o dd-mm-yyyy
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    const t = dt.getTime();
    return Number.isFinite(t) ? t : NaN;
  }

  return NaN;
}

function parseEstadoStampToDate(estado) {
  const s = String(estado || "");
  // Busca dd/mm/yyyy hh:mm (formato usado por scheduler)
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d, hh || 0, mm || 0, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Clasificación de rol más estricta para evitar delirios en el dashboard */
function roleBucket(raw) {
  const r = norm(raw);
  if (r.includes("qa")) return "Analista QA";
  if (r.includes("kv")) return "Analista KV";
  if (r.includes("team leader") || r === "tl" || r.includes(" tl") || r.includes("coordin") || r.includes("cp") || r.includes("project manager") || r.includes("pm lider") || r.includes("pm líder") || r.includes("lider")) {
    return "Líderes";
  }
  return "Analista PM";
}

function copyToClipboard(text) {
  const t = String(text ?? "");
  if (!t) return;
  navigator.clipboard?.writeText(t).then(
    () => toast("Copiado", t),
    () => toast("No se pudo copiar", t)
  );
}

function debounce(fn, ms = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function mountTableSort_(tableId, sortState, onChange) {
  const tbl = $(tableId);
  if (!tbl) return;

  const key = sortState?.key || "";
  const dir = sortState?.dir || 1;

  // indicators
  tbl.querySelectorAll("th.sortable").forEach((th) => {
    const k = th.getAttribute("data-sort");
    const srt = th.querySelector(".srt");
    if (srt) {
      if (k === key) srt.textContent = dir === 1 ? "▲" : "▼";
      else srt.textContent = "";
    }
    th.onclick = () => {
      const nextKey = k;
      const nextDir = (nextKey === key) ? (dir * -1) : 1;
      onChange?.({ key: nextKey, dir: nextDir });
    };
  });
}

/* ========= MultiSelect ========= */
function mountMultiSelect(targetId, { title, items, onChange }) {
  const host = $(targetId);
  if (!host) return null;

  host.className = "ms";
  host.innerHTML = `
    <div class="ms-btn">
      <div>
        <div class="label">${title}</div>
        <div class="value" data-ms-value>Todos</div>
      </div>
      <div class="muted">▾</div>
    </div>
    <div class="ms-panel">
      <div data-ms-list></div>
      <div class="ms-actions">
        <button class="btn ghost" type="button" data-ms-clear>Limpiar</button>
      </div>
    </div>
  `;

  const state = { selected: new Set() };

  const btn = host.querySelector(".ms-btn");
  const panel = host.querySelector(".ms-panel");
  const list = host.querySelector("[data-ms-list]");
  const value = host.querySelector("[data-ms-value]");
  const bClear = host.querySelector("[data-ms-clear]");

  function renderList() {
    list.innerHTML = items
      .map(
        (it) => `
      <label class="ms-item">
        <input type="checkbox" value="${String(it).replace(/"/g, "&quot;")}" />
        <div>${it}</div>
      </label>`
      )
      .join("");

    list.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.checked = state.selected.has(cb.value);
      cb.addEventListener("change", () => {
        if (cb.checked) state.selected.add(cb.value);
        else state.selected.delete(cb.value);
        renderValue();
        onChange?.(new Set(state.selected));
      });
    });
  }

  function renderValue() {
    if (state.selected.size === 0) value.textContent = "Todos";
    else if (state.selected.size === 1) value.textContent = [...state.selected][0];
    else value.textContent = `${state.selected.size} seleccionados`;
  }

  function close() { host.classList.remove("open"); }
  btn.addEventListener("click", (e) => { e.stopPropagation(); host.classList.toggle("open"); });
  document.addEventListener("click", () => close());
  panel.addEventListener("click", (e) => e.stopPropagation());

  // Limpiar => vuelve a "Todos" (sin filtros)
  bClear.addEventListener("click", () => {
    state.selected.clear();
    renderList(); renderValue();
    onChange?.(new Set(state.selected));
  });

  renderList();
  renderValue();

  return {
    clear: () => {
      state.selected.clear();
      renderList(); renderValue();
      onChange?.(new Set(state.selected));
    },
    updateItems: (newItems) => {
      if (JSON.stringify(items) === JSON.stringify(newItems)) return;
      items.length = 0;
      newItems.forEach(it => items.push(it));
      // Limpiar selecciones que ya no existen
      for (const v of [...state.selected]) {
        if (!items.includes(v)) state.selected.delete(v);
      }
      renderList(); renderValue();
    },
    _state: state,  // para lectura externa (acciones masivas)
  };
}

/**
 * Single-select con el mismo estilo visual de mountMultiSelect.
 * onChange recibe el valor seleccionado (string) o "" si se limpió.
 * Expone updateItems(newItems) para repoblar sin re-montar.
 */
function mountMultiSelectSingle(targetId, { title, items, onChange }) {
  const host = $(targetId);
  if (!host) return null;

  host.className = "ms";
  host.innerHTML = `
    <div class="ms-btn">
      <div>
        <div class="label">${title}</div>
        <div class="value" data-ms-value>Todos</div>
      </div>
      <div class="muted">▾</div>
    </div>
    <div class="ms-panel">
      <div data-ms-list></div>
      <div class="ms-actions">
        <button class="btn ghost" type="button" data-ms-clear>Limpiar</button>
      </div>
    </div>
  `;

  const state = { selected: "", items: items.slice() };
  const btn  = host.querySelector(".ms-btn");
  const panel = host.querySelector(".ms-panel");
  const list  = host.querySelector("[data-ms-list]");
  const value = host.querySelector("[data-ms-value]");
  const bClear = host.querySelector("[data-ms-clear]");

  function renderList() {
    list.innerHTML = state.items.map((it) =>
      `<label class="ms-item">
        <input type="checkbox" value="${String(it).replace(/"/g, "&quot;")}" ${state.selected === String(it) ? "checked" : ""} />
        <div>${it}</div>
      </label>`
    ).join("");

    list.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        // Single: seleccionar este deselecciona los demás
        state.selected = cb.checked ? cb.value : "";
        renderList();
        renderValue();
        onChange?.(state.selected);
      });
    });
  }

  function renderValue() {
    value.textContent = state.selected ? state.selected : "Todos";
  }

  function close() { host.classList.remove("open"); }
  btn.addEventListener("click", (e) => { e.stopPropagation(); host.classList.toggle("open"); });
  document.addEventListener("click", () => close());
  panel.addEventListener("click", (e) => e.stopPropagation());

  bClear.addEventListener("click", () => {
    state.selected = "";
    renderList(); renderValue();
    onChange?.("");
  });

  renderList();
  renderValue();

  return {
    clear: () => {
      state.selected = "";
      renderList(); renderValue();
      onChange?.("");
    },
    updateItems: (newItems) => {
      if (JSON.stringify(state.items) === JSON.stringify(newItems)) return; // sin cambios
      state.items = newItems.slice();
      // Si el valor seleccionado ya no existe, limpiar
      if (state.selected && !state.items.includes(state.selected)) {
        state.selected = "";
        onChange?.("");
      }
      renderList();
      renderValue();
    },
    _state: state,  // expuesto para lectura en acciones masivas
  };
}

function mountSearch(inputId, wrapId, clearId, onChange) {
  const inp = $(inputId);
  const wrap = $(wrapId);
  const clr = $(clearId);
  if (!inp || !wrap || !clr) return;

  function sync() {
    const v = inp.value || "";
    if (v.length) wrap.classList.add("has");
    else wrap.classList.remove("has");
    onChange?.(v);
  }
  inp.addEventListener("input", sync);
  clr.addEventListener("click", () => { inp.value = ""; sync(); inp.focus(); });
  sync();
}

/* ========= State ========= */
const S = {
  theme: localStorage.getItem("hub_theme") || "dark",

  colabs: [],
  canales: [],
  flujos: [],
  habil: null,
  plan: [],
  outbox: [],
  presWeek: null,
  presStats: null,
  presSemanas: [],
  presSemanaSel: "",

  fColabs: { roles: new Set(), equipos: new Set(), q: "" },
  fHabil: { roles: new Set(), equipos: new Set(), q: "", flujos: new Set() },
  fPres: { roles: new Set(), equipos: new Set(), q: "" },

  // Selección + sorters
  selColabs: new Set(),
  sort: {
    colabs: { key: "nombre", dir: 1 },
    habil: { key: "", dir: 1 },
    pres: { key: "nombre", dir: 1 },
    dashRoles: { key: "rol", dir: 1 },
  },

  // Dirty flags: qué secciones necesitan re-render al activar tab
  _dirty: new Set(),
  sentCollapsed: true,  // Enviados colapsado por defecto
  _habilSel: new Set(),  // IDs seleccionados para acción masiva
  agenda: [],            // items de la agenda
  agendaHistCollapsed: true, // historial colapsado por defecto
};

/* ========= Theme ========= */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", S.theme);
  localStorage.setItem("hub_theme", S.theme);
  const btn = $("btnTheme");
  if (btn) btn.textContent = S.theme === "dark" ? "☾" : "☀";
}

/* ========= Tabs ========= */
function mountTabs() {
  const tabs = $("tabs");
  if (!tabs) return;

  // Tracks which tabs have been loaded at least once (lazy load)
  const loaded = new Set(["dashboard", "daily"]); // estos cargan en loadCore

  function activateTab(key) {
    tabs.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    const activeTab = tabs.querySelector(`[data-tab="${key}"]`);
    if (activeTab) activeTab.classList.add("active");

    ["dashboard", "daily", "agenda", "colabs", "habil", "pres"].forEach((k) => {
      const sec = $(`tab_${k}`);
      if (sec) sec.style.display = k === key ? "" : "none";
    });
    // Detener auto-refresh de agenda si se sale del tab
    if (key !== "agenda") _stopAgendaAutoRefresh_();

    // Render inmediato con datos ya cargados
    if (key === "dashboard") renderDashboard();
    if (key === "daily") { renderFlujos(); renderPlan(); renderOutbox(); }
    if (key === "colabs") renderColabs();
    if (key === "habil") renderHabil();
    if (key === "pres") renderPresentismo();

    // Lazy load: carga datos del backend solo la primera vez que se visita el tab
    if (!loaded.has(key)) {
      loaded.add(key);
      lazyLoadTab_(key);
    }
  }

  tabs.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => activateTab(t.dataset.tab));
  });
}

async function lazyLoadTab_(name) {
  setBusy("Cargando", name + "...");
  try {
    if (name === "colabs") {
      if (!CACHE.get("colabs")) {
        S.colabs = await API.colaboradoresList();
        CACHE.set("colabs", S.colabs, 5 * 60_000);
      }
      renderColabs();
      renderDashboard();
    }
    if (name === "habil") {
      if (!S.habil) await refreshHabil();
      renderHabil();
    }
    if (name === "agenda") {
      if (!S.agenda || !S.agenda.length) {
        const ca = CACHE.get("agenda");
        if (ca && ca.length) {
          S.agenda = ca;
          renderAgenda();
        } else {
          // Sin cache — fetch con indicador pequeño (no bloquea la UI)
          renderAgenda(); // mostrar estado vacío primero
          S.agenda = await API.agendaList().catch(() => []);
          if (S.agenda.length) CACHE.set("agenda", S.agenda, 5 * 60_000);
        }
      }
      renderAgenda();
      _startAgendaAutoRefresh_();
      _updateKpiAgenda_();
    }
    if (name === "pres") {
      CACHE.invalidate("pres_week");
      CACHE.invalidate("pres_stats");
      await refreshPresentismo();
      mountPresentismoSelect();
      renderPresentismo();
      renderDashboard();
    }
  } catch (e) {
    setErr(`Error cargando ${name}: ${e.message || e}`);
  } finally {
    clearBusy();
  }
}

/* ========= Helpers: data mapping ========= */
function getField(obj, keys) {
  if (!obj) return "";
  // Búsqueda exacta primero (rápida)
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== "") return obj[k];
  }
  // Fallback: buscar ignorando espacios en las keys del objeto
  // (necesario cuando el header del Sheets tiene espacios al final)
  const objKeysNorm = Object.keys(obj).map(k => ({ orig: k, norm: k.trim() }));
  for (const k of keys) {
    const match = objKeysNorm.find(ok => ok.norm === k.trim());
    if (match && obj[match.orig] != null && obj[match.orig] !== "") return obj[match.orig];
  }
  return "";
}

function colabRowView(c) {
  const id = String(getField(c, ["ID_MELI", "id_meli", "Id_Meli"]) || "").trim();
  const nombre = getField(c, ["Nombre", "nombre"]);
  const rol = getField(c, ["Rol", "rol"]);
  const equipo = getField(c, ["Equipo", "equipo"]);
  const ubic = getField(c, ["Ubicación", "Ubicacion", "ubicacion"]);
  const slackId = getField(c, ["Slack_ID", "slack_id", "SlackId"]);
  // FIX: headers exactos
  const mailProd = getField(c, ["Mail Productora", "Mail_Productora", "Mail productora", "mail_productora"]);
  const mailExt = getField(c, ["Mail Externo", "Mail_Externo", "Mail externo", "mail_externo"]);
  const ingreso = getField(c, ["Fecha Ingreso", "Fecha_Ingreso", "Fecha ingreso", "fecha_ingreso", "Ingreso"]);
  return { id, nombre, rol, equipo, ubic, slackId, mailProd, mailExt, ingreso };
}

function applySectionFilter(list, f) {
  const q = norm(f.q);
  const rolesSel = f.roles;
  const equiposSel = f.equipos;

  return list.filter((x) => {
    const v = colabRowView(x);
    const rb = roleBucket(v.rol);
    const rolRaw = String(v.rol || "").trim();

    // Filtrar por rol raw (exacto) — no usar bucket para que "Analista Soporte" no matchee "Analista PM"
    if (rolesSel.size > 0 && !rolesSel.has(rolRaw)) return false;
    if (equiposSel.size > 0 && !equiposSel.has(v.equipo)) return false;

    if (q) {
      const hay =
        norm(v.id).includes(q) ||
        norm(v.nombre).includes(q) ||
        norm(v.rol).includes(q) ||
        norm(v.equipo).includes(q) ||
        norm(v.mailProd).includes(q) ||
        norm(v.mailExt).includes(q);
      if (!hay) return false;
    }
    return true;
  });
}

/* ========= Data load ========= */

// Referencias globales a los multiselects de roles para poder actualizarlos
let _msRolesCol_ = null;
let _msRolesHab_ = null;
let _msRolesPres_ = null;

function _refreshRoleFilters_() {
  const roles = [...new Set((S.colabs || []).map(c => colabRowView(c).rol).filter(Boolean))].sort();
  if (roles.length === 0) return;
  _msRolesCol_?.updateItems(roles);
  _msRolesHab_?.updateItems(roles);
  _msRolesPres_?.updateItems(roles);
}

async function loadCore() {
  setErr("");
  try {
    setBusy("Cargando", "Sincronizando datos...");

    showTableSkeleton("tblColabs", 6);
    showTableSkeleton("tblHabil", 6);
    showTableSkeleton("tblPresWeek", 5);

    // ── PERF: un solo request a GAS en lugar de 5 requests separados ──
    // hub.init devuelve colabs+canales+flujos+plan+outbox en una sola ejecución.
    // Si algún dato está en cache de cliente, lo usamos directamente sin ir a GAS.
    const cColabs  = CACHE.get("colabs");
    const cCanales = CACHE.get("canales");
    const cFlujos  = CACHE.get("flujos");
    const cPres    = CACHE.get("presWeek");
    const cStats   = CACHE.get("presStats");
    const cHabil   = CACHE.get("habil");
    const allCached = cColabs && cCanales && cFlujos;

    const cPlan   = CACHE.get("plan");
    const cOutbox = CACHE.get("outbox");
    const fullyCached = allCached && cPlan && cOutbox;

    if (allCached) {
      // Cache fresco: render inmediato, cero requests bloqueantes
      S.colabs    = cColabs;
      S.canales   = cCanales;
      S.flujos    = cFlujos;
      if (cPres)   S.presWeek  = cPres;
      if (cStats)  S.presStats = cStats;
      if (cHabil)  S.habil     = cHabil;
      if (cPlan)   S.plan      = cPlan;
      if (cOutbox) S.outbox    = cOutbox;

      // Plan+outbox vencidos o no cacheados: refrescar en background
      if (!fullyCached) refreshPlanAndOutbox().then(() => { renderPlan(); renderOutbox(); }).catch(() => {});
    } else {
      // Cold: un solo request que trae todo
      const init = await API.hubInit();
      S.colabs    = init.colabs    || [];
      S.canales   = init.canales   || [];
      S.flujos    = init.flujos    || [];
      S.plan      = init.plan      || [];
      S.outbox    = init.outbox    || [];
      S.presWeek  = init.presWeek  || null;
      S.presStats = init.presStats || null;
      S.habil     = init.habil     || null;
      // agenda carga lazy al primer click en el tab
      // Poblar cache de cliente
      CACHE.set("colabs",    S.colabs,    5 * 60_000);
      CACHE.set("canales",   S.canales,   10 * 60_000);
      CACHE.set("flujos",    S.flujos,    2 * 60_000);
      if (S.presWeek)  CACHE.set("presWeek",  S.presWeek,  3 * 60_000);
      if (S.presStats) CACHE.set("presStats", S.presStats, 3 * 60_000);
      if (S.habil)     CACHE.set("habil",     S.habil,     10 * 60_000);
    }

    renderDashboard();
    renderFlujos();
    renderPlan();
    renderOutbox();

    // Actualizar multiselects de roles con los datos reales de colabs
    _refreshRoleFilters_();

    toast("Listo", "Datos cargados");
  } catch (e) {
    setErr(`Error: ${e.message || e}`);
  } finally {
    clearBusy();
  }

  // Todo viene del hubInit en cold start.
  // En cache hit (allCached), habil y presWeek no vienen → refreshear en background.
  if (!S.habil) refreshHabil().catch(() => {});

  // Actualizar filtros de roles con datos frescos (por si vinieron del cache)
  _refreshRoleFilters_();

  if (S.presWeek) {
    mountPresentismoSelect();
    renderDashboard();
  } else {
    refreshPresentismo().then(() => {
      mountPresentismoSelect();
      renderDashboard();
    }).catch(() => {});
  }
  // Pre-cachear agenda en background — siempre actualizar badge y card
  const cAgenda = CACHE.get("agenda");
  if (cAgenda && cAgenda.length) {
    // Hay agenda en sessionStorage — usar inmediatamente
    S.agenda = cAgenda;
    _updateAgendaBadge_();
    _updateKpiAgenda_();
  } else {
    // Fetch en background
    API.agendaList().then(d => {
      if (d?.length) {
        S.agenda = d;
        CACHE.set("agenda", d, 5 * 60_000);
        _updateAgendaBadge_();
        _updateKpiAgenda_();
      }
    }).catch(() => {});
  }
}

async function refreshPlanAndOutbox() {
  const [plan, outbox] = await Promise.all([API.planificacionList(), API.slackOutboxList()]);
  S.plan   = plan   || [];
  S.outbox = outbox || [];
  CACHE.set("plan",   S.plan,   30_000);
  CACHE.set("outbox", S.outbox, 30_000);
}

async function refreshHabil() {
  try { S.habil = await API.habilitacionesList(); }
  catch (e) { setErr(`Habilitaciones: ${e.message || e}`); S.habil = null; }
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


// ── Modal de confirmación propio ────────────────────────────
// Reemplaza el confirm() nativo del browser.
// Uso: if (!await hubConfirm_("¿Seguro?", "Sí, eliminar")) return;
function hubConfirm_(mensaje, labelConfirmar = "Confirmar", labelCancelar = "Cancelar") {
  return new Promise(resolve => {
    let overlay = document.getElementById("_hubConfirmOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "_hubConfirmOverlay";
      overlay.style.cssText = [
        "position:fixed", "inset:0", "z-index:99999",
        "background:rgba(0,0,0,.55)", "display:flex",
        "align-items:center", "justify-content:center", "padding:16px"
      ].join(";");
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--brd-2);border-radius:12px;
        padding:24px 28px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.4)">
        <div style="font-size:14px;font-weight:600;color:var(--text-1);margin-bottom:10px">
          Confirmá la acción
        </div>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:22px;line-height:1.6">
          ${mensaje}
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="_hubConfirmCancel" class="btn ghost" style="min-width:90px">
            ${labelCancelar}
          </button>
          <button id="_hubConfirmOk" class="btn"
            style="min-width:90px;background:var(--err,#e5534b);border-color:var(--err,#e5534b);color:#fff;font-weight:600">
            ${labelConfirmar}
          </button>
        </div>
      </div>`;
    overlay.style.display = "flex";

    const close = (result) => {
      overlay.style.display = "none";
      resolve(result);
    };

    document.getElementById("_hubConfirmOk").onclick    = () => close(true);
    document.getElementById("_hubConfirmCancel").onclick = () => close(false);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };

    // Escape cierra
    const onKey = (e) => {
      if (e.key === "Escape") { close(false); document.removeEventListener("keydown", onKey); }
      if (e.key === "Enter")  { close(true);  document.removeEventListener("keydown", onKey); }
    };
    document.addEventListener("keydown", onKey);

    // Foco en botón cancelar por seguridad (evita Enter accidental)
    setTimeout(() => document.getElementById("_hubConfirmCancel")?.focus(), 50);
  });
}

async function refreshPresentismo() {
  // Siempre carga la semana en curso. Lanza week + stats en paralelo.
  try {
    const d = todayYMD();
    const [weekResult, statsResult] = await Promise.allSettled([
      API.presentismoWeek(d),
      API.presentismoStats(d),
    ]);
    if (weekResult.status === "fulfilled") {
      S.presWeek = weekResult.value;
    } else {
      setErr(`Presentismo: ${weekResult.reason?.message || weekResult.reason}`);
      S.presWeek = null;
    }
    S.presStats = statsResult.status === "fulfilled" ? statsResult.value : null;
  } catch (e) {
    setErr(`Presentismo: ${e.message || e}`);
    S.presWeek = null;
    S.presStats = null;
  }
}



/* ========= Operativa diaria: Flujos autosave (OPTIMIZADO) ========= */
// Guardado optimista: actualiza S.flujos localmente SIN re-render del DOM,
// luego persiste en background. El TL puede seguir escribiendo sin perder el foco.
const _flujoSaveQueue = new Map();

function saveFlujoOptimistic(flujo, perfiles, channel_id) {
  // 1) Actualizar cache local inmediatamente (sin tocar DOM)
  const idx = (S.flujos || []).findIndex(f => String(f.flujo) === String(flujo));
  if (idx >= 0) {
    S.flujos[idx].perfiles_requeridos = perfiles;
    if (channel_id !== undefined) S.flujos[idx].channel_id = channel_id;
  }
  // Actualizar solo la píldora de estado (liviano, no re-renderiza la tabla)
  _updateDailyStatusPill_();

  // 2) Cancelar timer previo del mismo flujo y programar guardado real
  const prev = _flujoSaveQueue.get(flujo);
  if (prev?.timer) clearTimeout(prev.timer);

  const timer = setTimeout(async () => {
    _flujoSaveQueue.delete(flujo);
    const el = $("dailyStatus");
    if (el) el.textContent = "Guardando...";
    setErr("");
    try {
      await API.flujosUpsert(flujo, perfiles, channel_id || "");
      if (el) el.textContent = "✓ Guardado";
      setTimeout(() => { if (el && el.textContent === "✓ Guardado") el.textContent = "Listo"; }, 1500);
    } catch (e) {
      setErr(`Error al guardar ${flujo}: ${e.message || e}`);
      if (el) el.textContent = "Error";
      // Revertir valor local al fallar
      const flujos = await API.flujosList().catch(() => null);
      if (flujos) {
        S.flujos = flujos;
        renderFlujos();
        // Sincronizar Asignaciones con la nueva lista de flujos
        if (typeof _syncBulkFlujoItems_ === "function") _syncBulkFlujoItems_();
        renderHabil();
      }
    }
  }, 600);

  _flujoSaveQueue.set(flujo, { perfiles, channel_id, timer });
}

// Alias para compatibilidad con código que llama saveFlujoDebounced
const saveFlujoDebounced = (flujo, perfiles, channel_id) => saveFlujoOptimistic(flujo, perfiles, channel_id);

function _updateDailyStatusPill_() {
  const alertEl = $("dailyAssignAlert");
  if (!alertEl) return;
  const rows = (S.flujos || []);
  const disponibles = countAnalistasDisponiblesHoy_();
  const requeridos = rows.reduce((acc, f) => acc + (Number(f.perfiles_requeridos ?? f.cantidad ?? 0) || 0), 0);
  const diff = disponibles - requeridos;
  let cls = "", msg = "";
  if (diff > 0) {
    cls = "warn";
    msg = `Hay ${diff} perfil${diff > 1 ? "es" : ""} sin asignar · ${disponibles} presentes / ${requeridos} asignados`;
  } else if (diff < 0) {
    const faltan = Math.abs(diff);
    cls = "bad";
    msg = `${faltan > 1 ? "Faltan" : "Falta"} ${faltan} perfil${faltan > 1 ? "es" : ""} · ${disponibles} presentes / ${requeridos} asignados`;
  } else {
    cls = "ok";
    msg = `Equipo completo · ${disponibles} presentes / ${requeridos} asignados`;
  }
  alertEl.className = `pill ${cls}`;
  alertEl.innerHTML = escapeHtml(msg);
}

function resolveChannelByIdOrName_(val) {
  const raw = String(val || "").trim();
  if (!raw) return { channel_id: "", canal: "" };
  const canales = S.canales || [];
  // match by id
  let c = canales.find((x) => String(x.channel_id || "").trim() === raw);
  if (c) return { channel_id: String(c.channel_id || "").trim(), canal: String(c.canal || "").trim() };
  // match by name (#canal)
  c = canales.find((x) => String(x.canal || "").trim() === raw);
  if (c) return { channel_id: String(c.channel_id || "").trim(), canal: String(c.canal || "").trim() };
  // unknown: keep raw as display
  return { channel_id: raw, canal: raw };
}

function validateFlujosSlackConfig_(rows) {
  const list = rows || (S.flujos || []);
  const missing = list
    .filter((f) => {
      const incluir = !(f.incluir_en_mensaje === false || ["FALSE", "NO", "0"].includes(String(f.incluir_en_mensaje ?? "").toUpperCase()));
      if (!incluir) return false;
      const ch = String(f.channel_id || "").trim();
      return !ch;
    })
    .map((f) => String(f.flujo || "").trim())
    .filter(Boolean);
  const hasSlack = list.some((f) => !(f.incluir_en_mensaje === false || ["FALSE", "NO", "0"].includes(String(f.incluir_en_mensaje ?? "").toUpperCase())));
  return { hasSlack, missing };
}

async function onFlujoDelete(flujo) {
  setErr("");

  // ── Optimistic: quitar flujo de S.flujos y S.habil inmediatamente ──
  const prevFlujos = S.flujos ? [...S.flujos] : [];
  const prevHabil  = S.habil  ? { ...S.habil, flujos: [...(S.habil.flujos||[])], rows: S.habil.rows } : null;

  S.flujos = (S.flujos || []).filter(f => String(f.flujo || f).trim() !== flujo);
  if (S.habil?.flujos) S.habil = { ...S.habil, flujos: S.habil.flujos.filter(f => f !== flujo) };
  // Limpiar filtro activo si era ese flujo
  if (S.fHabil?.flujos?.has(flujo)) S.fHabil.flujos.delete(flujo);

  // Invalidar caches del frontend para forzar fetch fresco
  CACHE.invalidate("flujos");
  CACHE.invalidate("habil");

  // Re-render inmediato con los datos optimistas
  renderFlujos();
  renderHabil();

  try {
    $("dailyStatus") && ($("dailyStatus").textContent = "Eliminando...");
    await API.flujosDelete(flujo);

    // Confirmar con datos reales de GAS (ya sin cache por la invalidación)
    const [fl, hab] = await Promise.all([
      API.flujosList(),
      API.habilitacionesList(),
    ]);
    if (fl)  { S.flujos = fl;  CACHE.set("flujos", fl,  2  * 60_000); }
    if (hab) { S.habil  = hab; CACHE.set("habil",  hab, 10 * 60_000); }

    renderFlujos();
    renderHabil();
    toast("Operativa diaria", `✓ Flujo "${flujo}" eliminado.`);
  } catch (e) {
    // Revertir si falló
    S.flujos = prevFlujos;
    S.habil  = prevHabil;
    renderFlujos();
    renderHabil();
    setErr("No se pudo eliminar el flujo. Intentá de nuevo.");
  } finally {
    $("dailyStatus") && ($("dailyStatus").textContent = "Listo");
  }
}

function renderFlujos() {
  const tb = $("tblFlujos")?.querySelector("tbody");
  if (!tb) return;

  const canales = S.canales || [];
  const canalById = new Map(canales.map((c) => [String(c.channel_id || "").trim(), c]));
  const idByCanal = new Map(canales.map((c) => [String(c.canal || "").trim(), String(c.channel_id || "").trim()]));

  const resolveChannel_ = (raw) => {
    const v = String(raw || "").trim();
    if (!v) return { channel_id: "", canal: "" };
    if (canalById.has(v)) {
      const c = canalById.get(v);
      return { channel_id: String(c.channel_id || "").trim(), canal: String(c.canal || "").trim() };
    }
    // si vino como nombre (#canal)
    if (idByCanal.has(v)) {
      const id = idByCanal.get(v);
      const c = canalById.get(id);
      return { channel_id: id, canal: String(c?.canal || v) };
    }
    // fallback: muestro lo que haya, pero no lo tomo como id válido
    return { channel_id: "", canal: v };
  };

  const rows = (S.flujos || []).slice().sort((a, b) => String(a.flujo).localeCompare(String(b.flujo)));
  tb.innerHTML = rows
    .map((f) => {
      const name = f.flujo ?? "";
      const req = Number(f.perfiles_requeridos ?? f.cantidad ?? 0) || 0;
      const incluir = !(f.incluir_en_mensaje === false || ["FALSE","NO","0"].includes(String(f.incluir_en_mensaje ?? "").toUpperCase()));
      const ch = resolveChannel_(f.channel_id);
      const invalid = incluir && !ch.channel_id;
      return `
        <tr data-flujo="${escapeAttr(name)}" data-channel-id="${escapeAttr(ch.channel_id || "")}">
          <td><b>${escapeHtml(name)}</b></td>
          <td style="text-align:center;min-width:140px">
            <input type="checkbox" data-inc-msg ${incluir ? "checked" : ""} />
          </td>
          <td style="min-width:240px">
            <div class="flow-channel ${invalid ? "invalid" : ""}" data-ch-wrap>
              <input class="input" data-ch-inp placeholder="Seleccionar canal..." value="${escapeAttr(ch.canal || "")}" ${incluir ? "" : "disabled"} />
              <div class="dd" data-ch-dd></div>
              <div class="err">Seleccioná un canal.</div>
            </div>
          </td>
          <td class="right nowrap" style="min-width:140px">
            <input class="input smallnum" type="number" min="0" step="1" value="${req}" data-req />
          </td>
          <td class="right nowrap">
            <button class="xbtn" title="Eliminar flujo" data-del>×</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tb.querySelectorAll("tr").forEach((tr) => {
    const flujo = tr.getAttribute("data-flujo");
    const inp = tr.querySelector("[data-req]");
    const chWrap = tr.querySelector("[data-ch-wrap]");
    const chInp = tr.querySelector("[data-ch-inp]");
    const chDd = tr.querySelector("[data-ch-dd]");
    const getChannelId = () => String(tr.getAttribute("data-channel-id") || "").trim();
    const setChannelId = (id) => tr.setAttribute("data-channel-id", String(id || ""));
    // Incluir / Excluir en mensaje GENERAL (persistido en Config_Flujos)
    const chk = tr.querySelector("[data-inc-msg]");
    chk?.addEventListener("change", async () => {
      const value = !!chk.checked;
      try {
        await API.configFlujosSetIncluirMensaje(unescapeAttr(flujo), value);
        // Si se desactiva Slack, se limpia el canal (no se exige)
        if (!value) {
          // UX: ocultar el valor cuando está deshabilitado, pero NO borrar el canal guardado.
          // Esto permite que, al volver a activar Slack, el canal vuelva por defecto.
          if (chInp) { chInp.value = ""; chInp.disabled = true; }
          chWrap?.classList.remove("invalid");
        } else {
          if (chInp) { chInp.disabled = false; chInp.focus(); }
          // si ya había canal guardado, mostrarlo por defecto
          const existing = getChannelId();
          if (existing) {
            const ch = resolveChannel_(existing);
            chInp.value = ch ? ch.name : existing;
            chWrap?.classList.remove("invalid");
          } else {
            // si no hay canal, marcar error
            chWrap?.classList.add("invalid");
          }
        }
        // actualizar cache local si existe
        const idx = (S.flujos || []).findIndex((x) => String(x.flujo) === String(unescapeAttr(flujo)));
        if (idx >= 0) S.flujos[idx].incluir_en_mensaje = value;
        toast("Flujos", value ? "Incluido en mensaje" : "Excluido del mensaje");
      } catch (e) {
        setErr(e?.message || String(e));
        chk.checked = !value; // rollback visual
      }
      updateDailyGenerateDisabled_();
    });

    // autosave on input (debounced) + blur (for mobile)
    inp.addEventListener("input", () => {
      const perfiles = Number(inp.value || 0) || 0;
      saveFlujoDebounced(unescapeAttr(flujo), perfiles, getChannelId());
    });
    inp.addEventListener("blur", () => {
      const perfiles = Number(inp.value || 0) || 0;
      saveFlujoDebounced(unescapeAttr(flujo), perfiles, getChannelId());
    });

    // Canal Slack combo (búsqueda, dropdown absoluto)
    if (chInp && chDd && chWrap) {
      const close = () => chWrap.classList.remove("open");
      const open = () => chWrap.classList.add("open");

      const renderDd = (q) => {
        const qq = norm(q || "");
        const list = (S.canales || [])
          .filter((c) => {
            const name = String(c.canal || "");
            return !qq || norm(name).includes(qq);
          })
          .slice(0, 10);

        if (!list.length) {
          chDd.innerHTML = `<div class="it"><span class="muted">Sin resultados</span></div>`;
          return;
        }

        chDd.innerHTML = list
          .map((c) => {
            const name = String(c.canal || "");
            const id = String(c.channel_id || "");
            return `<div class="it" data-pick="${escapeAttr(id)}"><span>${escapeHtml(name)}</span><span class="muted">${escapeHtml(id)}</span></div>`;
          })
          .join("");

        chDd.querySelectorAll("[data-pick]").forEach((it) => {
          it.addEventListener("mousedown", (ev) => {
            ev.preventDefault(); // evita blur antes de seleccionar
            const id = it.getAttribute("data-pick");
            const c = (S.canales || []).find((x) => String(x.channel_id || "") === String(id));
            const canal = String(c?.canal || "").trim();
            setChannelId(id);
            chInp.value = canal;
            chWrap.classList.remove("invalid");
            close();
            const perfiles = Number(inp?.value || 0) || 0;
            saveFlujoDebounced(unescapeAttr(flujo), perfiles, id);
            updateDailyGenerateDisabled_();
          });
        });
      };

      chInp.addEventListener("focus", () => {
        if (chInp.disabled) return;
        renderDd(chInp.value);
        open();
      });
      chInp.addEventListener("input", () => {
        if (chInp.disabled) return;
        renderDd(chInp.value);
        open();
        // si escribe, invalido hasta que seleccione un canal válido
        if (!getChannelId()) chWrap.classList.add("invalid");
        updateDailyGenerateDisabled_();
      });

      document.addEventListener("mousedown", (ev) => {
        if (!chWrap.contains(ev.target)) close();
      });
    }

    tr.querySelector("[data-del]")?.addEventListener("click", async () => {
      if (!await hubConfirm_(`¿Eliminás el flujo "${unescapeAttr(flujo)}"? Se quitará de Operativa y de Asignaciones. No se puede deshacer.`, "Sí, eliminar")) return;
      await onFlujoDelete(unescapeAttr(flujo));
    });
  });

  updateDailyGenerateDisabled_();

  // Actualizar píldora de estado (centralizado en _updateDailyStatusPill_)
  _updateDailyStatusPill_();

}

function updateDailyGenerateDisabled_() {
  const btn = $("btnGenerarPlan");
  if (!btn) return;

  const trs = Array.from(document.querySelectorAll("#tblFlujos tbody tr"));
  let anySlack = false;
  let missing = false;
  for (const tr of trs) {
    const chk = tr.querySelector("[data-inc-msg]");
    const on = !!chk?.checked;
    if (on) {
      anySlack = true;
      const ch = String(tr.getAttribute("data-channel-id") || "").trim();
      if (!ch) missing = true;
    }
  }
  btn.disabled = anySlack && missing;
}

/* ========= Planificación: columnas + generar mensaje por flujo ========= */
function renderPlan() {
  const host = $("planGrid");
  if (!host) return;

  // UI state (solo para esta sección)
  S._planUI = S._planUI || { q: "", sort: "alpha", expanded: new Set() };
  mountPlanControls_();

  const plan = (S.plan || []).filter((r) => r?.flujo);
  if (!plan.length) {
    host.innerHTML = emptyState_(
      "Sin planificación generada para hoy.",
      "📋",
      "Generar planificación",
      "emptyStateBtnGenerar"
    );
    host.querySelector("#emptyStateBtnGenerar")?.addEventListener("click", onGenerarPlanificacionYOutbox_);
    return;
  }

  // Index
  const by = {};
  for (const r of plan) {
    const f = String(r.flujo || "").trim();
    if (!f) continue;
    by[f] = by[f] || [];
    by[f].push(r);
  }

  // filters
  const q = norm(S._planUI.q);
  let flujos = Object.keys(by);
  if (q) flujos = flujos.filter((f) => norm(f).includes(q));

  // sort
  const reqMap = new Map((S.flujos || []).map((x) => [String(x.flujo || "").trim(), Number(x.perfiles_requeridos ?? x.cantidad ?? 0) || 0]));
  if (S._planUI.sort === "load") {
    flujos.sort((a, b) => {
      const ai = (by[a] || []).filter((x) => x?.id_meli && x.id_meli !== "SIN PERFILES DISPONIBLES").length;
      const bi = (by[b] || []).filter((x) => x?.id_meli && x.id_meli !== "SIN PERFILES DISPONIBLES").length;
      const ar = reqMap.get(a) || 0;
      const br = reqMap.get(b) || 0;
      const aRatio = ar ? ai / ar : ai ? 99 : 0;
      const bRatio = br ? bi / br : bi ? 99 : 0;
      return bRatio - aRatio || a.localeCompare(b);
    });
  } else {
    flujos.sort((a, b) => a.localeCompare(b));
  }

  host.innerHTML = flujos
    .map((f) => {
      const itemsRaw = (by[f] || []).filter((x) => x?.id_meli && x.id_meli !== "SIN PERFILES DISPONIBLES");
      const items = itemsRaw.slice().sort((a, b) => String(a.nombre || a.id_meli || "").localeCompare(String(b.nombre || b.id_meli || "")));
      const assigned = items.length;
      const req = reqMap.get(f) || 0;
      const ratio = req ? assigned / req : assigned ? 99 : 0;
      const loadCls = ratio > 1 ? "bad" : ratio >= 0.8 ? "warn" : "ok";

      const status = flowMsgStatus_(f);
      const expanded = S._planUI.expanded.has(f);
      const maxPeek = 5;
      const peekNames = items.slice(0, maxPeek).map((x) => {
        const fijo = x.es_fijo === "SI" ? " <b>F</b>" : "";
        const name = escapeHtml(x.nombre || x.id_meli || "");
        return `${name}${fijo}`;
      }).join(" · ");
      const remaining = Math.max(0, assigned - maxPeek);

      const lis = expanded
        ? items
            .map((x) => {
              const fijo = x.es_fijo === "SI" ? " <b>F</b>" : "";
              const name = x.nombre || x.id_meli || "";
              return `<li>${escapeHtml(name)}${fijo}</li>`;
            })
            .join("")
        : "";

      const toggleLabel = expanded ? "Colapsar" : (remaining > 0 ? `+${remaining} más` : "Ver");
      const canToggle = assigned > maxPeek;

      return `
        <div class="flow-col" data-flow="${escapeAttr(f)}">
          <div class="flow-head">
            <div class="flow-head-top">
              <div class="flow-name">${escapeHtml(f)}</div>
              <button class="btn ghost" style="padding:8px 10px;border-radius:12px" data-genmsg>Generar mensaje</button>
            </div>
            <div class="flow-meta">
              <span class="chip ${loadCls}" title="Asignados / Requeridos"><span class="dot"></span>${assigned} / ${req || "—"}</span>
              <span class="chip ${status.cls}" title="Estado del mensaje"><span class="dot"></span>${escapeHtml(status.label)}</span>
              ${canToggle ? `<button class="linkbtn" type="button" data-toggle>${escapeHtml(toggleLabel)}</button>` : ``}
            </div>
          </div>

          <div class="flow-peek">
            ${peekNames || `<span class="muted">—</span>`}
            ${(!expanded && remaining > 0) ? ` · <button class="linkbtn" type="button" data-toggle>+${remaining} más</button>` : ``}
          </div>

          ${expanded ? `<ul class="flow-list">${lis}</ul>` : ``}
        </div>
      `;
    })
    .join("");

  host.querySelectorAll("[data-genmsg]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const flow = btn.closest("[data-flow]")?.getAttribute("data-flow");
      if (!flow) return;
      await generarMensajePorFlujo_(unescapeAttr(flow), btn);
    });
  });

  host.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const flow = btn.closest("[data-flow]")?.getAttribute("data-flow");
      if (!flow) return;
      const f = unescapeAttr(flow);
      if (S._planUI.expanded.has(f)) S._planUI.expanded.delete(f);
      else S._planUI.expanded.add(f);
      renderPlan();
    });
  });
}

function mountPlanControls_() {
  if (mountPlanControls_._mounted) return;
  const inp = $("planSearch");
  const clr = $("planSearchClear");
  const sel = $("planSort");
  if (!inp || !sel) return; // no está en la vista

  mountPlanControls_._mounted = true;

  inp.value = S._planUI?.q || "";
  sel.value = S._planUI?.sort || "alpha";
  const wrap = inp.closest(".search");
  if (wrap) wrap.classList.toggle("has", !!inp.value);

  inp.addEventListener("input", debounce(() => {
    S._planUI.q = inp.value || "";
    if (wrap) wrap.classList.toggle("has", !!inp.value);
    renderPlan();
  }, 180));

  clr?.addEventListener("click", () => {
    inp.value = "";
    S._planUI.q = "";
    if (wrap) wrap.classList.remove("has");
    renderPlan();
  });

  sel.addEventListener("change", () => {
    S._planUI.sort = sel.value || "alpha";
    renderPlan();
  });
}

function flowMsgStatus_(flow) {
  const today = todayYMD();
  const out = (S.outbox || []).slice();
  // POR_FLUJO guarda el nombre del flujo en el campo "canal"
  const rows = out.filter((r) => String(r?.tipo || "").toUpperCase() === "POR_FLUJO" && String(r?.canal || "") === String(flow) && String(r?.fecha || "") === String(today));
  if (!rows.length) return { label: "Mensaje: —", cls: "" };
  // tomamos la última por row (mayor)
  rows.sort((a, b) => Number(b.row || 0) - Number(a.row || 0));
  const estado = String(rows[0].estado || "").toUpperCase();
  if (estado.includes("ENVIADO")) return { label: "Mensaje: enviado", cls: "ok" };
  if (estado.includes("ERROR")) return { label: "Mensaje: error", cls: "bad" };
  if (estado.includes("PROGRAMADO")) return { label: "Mensaje: programado", cls: "warn" };
  return { label: "Mensaje: pendiente", cls: "warn" };
}

async function generarMensajePorFlujo_(flujo, btn = null) {
  setErr("");
  try {
    // feedback inmediato y seguro (evita doble click)
    const prevTxt = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generando...";
    }

    const items = (S.plan || []).filter((x) => x?.flujo === flujo && x?.id_meli && x.id_meli !== "SIN PERFILES DISPONIBLES");
    if (!items.length) return toast("Mensaje", "No hay perfiles asignados");

    // map slack ids
    const map = new Map((S.colabs || []).map((c) => {
      const v = colabRowView(c);
      return [v.id, v.slackId];
    }));

    const mentions = items.map((x) => {
      const slackId = map.get(x.id_meli);
      return slackId ? `<@${slackId}>` : x.nombre || x.id_meli;
    }).join(" - ");

    const msg = `*${flujo}*\n${mentions}`;

    const fechaISO = todayYMD();
    await API.slackOutboxAppend(fechaISO, "POR_FLUJO", flujo, "", msg, "PENDIENTE - SIN CANAL");
    S.outbox = await API.slackOutboxList();
    renderOutbox();
    renderPlan();
    toast("Outbox", `Mensaje generado: ${flujo} · ${items.length} perfiles`);
  } catch (e) {
    setErr(`Mensaje por flujo: ${e.message || e}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Generar mensaje";
    }
  }
}

/* ========= Slack Outbox: autosave ========= */
/* ========= Outbox: patch optimista ========= */
// Actualiza el estado de una fila en S.outbox de forma inmediata (sin roundtrip)
// y dispara un re-fetch silencioso en background para sincronizar.
function patchOutbox_(row, changes) {
  const idx = (S.outbox || []).findIndex((x) => Number(x.row) === Number(row));
  if (idx >= 0) {
    Object.assign(S.outbox[idx], changes);
  }
  renderOutbox();
  // Sync silencioso en background (no bloquea UI)
  API.slackOutboxList()
    .then((d) => { S.outbox = d || []; S._dirty.add("outbox"); renderOutbox(); })
    .catch(() => {});
}

function channelOptionsHtml(selectedId = "") {
  const opts = [`<option value="">—</option>`].concat(
    (S.canales || []).map((c) => {
      const id = c.channel_id || "";
      const name = c.canal || "";
      const sel = id === selectedId ? "selected" : "";
      return `<option value="${escapeAttr(id)}" ${sel}>${escapeHtml(name)} (${escapeHtml(id)})</option>`;
    })
  );
  return opts.join("");
}

const outboxAutosave = debounce(async (row, channel_id, mensaje) => {
  setErr("");
  try {
    const canal = (S.canales || []).find((c) => c.channel_id === channel_id)?.canal || "";
    await API.slackOutboxUpdate(row, canal, channel_id, mensaje);
    // no refresco todo para no “parpadear”; solo toast
    toast("Outbox", "Guardado");
  } catch (e) {
    setErr(`Outbox: ${e.message || e}`);
  }
}, 500);

function renderOutbox() {
  const tbDrafts = $("tblDrafts")?.querySelector("tbody");
  const tbScheduled = $("tblScheduled")?.querySelector("tbody");
  const tbSent = $("tblSent")?.querySelector("tbody");
  const btnRefreshSent = $("btnRefreshSent");
  if (!tbDrafts || !tbScheduled || !tbSent) {
    // fallback a versiones viejas
    const tbLegacy = $("tblOutbox")?.querySelector("tbody");
    if (!tbLegacy) return;
    tbLegacy.innerHTML = `<tr><td colspan="5" class="muted">Actualizá el hub para ver el nuevo compose.</td></tr>`;
    return;
  }

  const out = (S.outbox || []).slice().sort((a, b) => (b.row || 0) - (a.row || 0));

  const isSent_ = (estado) => String(estado || "").toUpperCase().includes("ENVIADO");
  const isProg_ = (estado) => String(estado || "").toUpperCase().includes("PROGRAMADO");

  const drafts = out.filter((r) => !isSent_(r.estado) && !isProg_(r.estado));
  const scheduled = out.filter((r) => !isSent_(r.estado) && isProg_(r.estado));

  // Enviados: mostrar últimos 14 días (por estado timestamp; fallback a fecha)
  const now = new Date();
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sentAll = out.filter((r) => isSent_(r.estado));
  const sent = sentAll.filter((r) => {
    const dt = parseEstadoStampToDate(r.estado) || (r.fecha ? parseEstadoStampToDate(String(r.fecha)) : null);
    // si no hay timestamp, lo mostramos igual pero al final; es mejor ver algo que nada
    if (!dt) return true;
    return dt >= cutoff;
  }).slice(0, 50); // limitar a 50 más recientes para evitar renders pesados

  const formatEstado = (estado) => {
    const s = String(estado || "");
    const m = s.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/);
    if (!m) return s;
    const d = new Date(m[1]);
    if (isNaN(d.getTime())) return s;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const HH = String(d.getHours()).padStart(2, "0");
    const MM = String(d.getMinutes()).padStart(2, "0");
    return s.replace(m[1], `${dd}/${mm}/${yyyy} ${HH}:${MM}`);
  };

  const rowHtml = (r, { mode }) => {
    const rawEstado = r.estado || "";
    const estUp = String(rawEstado || "").toUpperCase();
    const isErr = estUp.includes("ERROR");
    const isSent = estUp.includes("ENVIADO");
    const isProg = estUp.includes("PROGRAMADO");

    const badge = isErr ? "badge bad" : isSent ? "badge ok" : "badge";
    const date = r.fecha || "";
    const chId = r.channel_id || "";
    const msg = r.mensaje || "";
    const row = r.row;

    const actions = (() => {
      // Drafts: enviar / programar + eliminar
      if (mode === "draft") {
        return `
          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
            <input class="input" type="datetime-local" data-when value="${escapeAttr(r.programado_para || "")}" style="max-width:220px" />
            <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">
              <button class="xbtn" data-del title="Eliminar">×</button>
              <button class="btn ghost" data-prog>Programar</button>
              <button class="btn primary" data-send>Enviar</button>
            </div>
          </div>
        `;
      }

      // Scheduled: mostrar canal como texto + botón desprogramar + eliminar
      const canalNombre = (S.canales || []).find(c => c.channel_id === chId)?.canal || chId || "—";
      return `
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
          <div style="font-size:12px;color:var(--text-2)">Canal: <b>${escapeHtml(canalNombre)}</b></div>
          <input class="input" type="datetime-local" data-when value="${escapeAttr(r.programado_para || "")}" style="max-width:220px" disabled />
          <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">
            <button class="xbtn" data-del title="Eliminar">×</button>
            <button class="btn ghost" data-desch style="font-size:11px;padding:3px 8px">Desprogramar</button>
          </div>
        </div>
      `;
    })();

    const disableEdits = mode !== "draft";

    return `
      <tr data-row="${row}" data-mode="${mode}">
        <td class="nowrap">${escapeHtml(date)}</td>
        <td>
          <select data-ch ${disableEdits ? "disabled" : ""}>${channelOptionsHtml(chId)}</select>
        </td>
        <td>
          <textarea data-msg ${disableEdits ? "disabled" : ""}>${escapeHtml(msg)}</textarea>
        </td>
        <td class="nowrap"><span class="${badge}">${escapeHtml(formatEstado(rawEstado))}</span></td>
        <td class="right nowrap">${actions}</td>
      </tr>
    `;
  };

  tbDrafts.innerHTML = drafts.length
    ? drafts.map((r) => rowHtml(r, { mode: "draft" })).join("")
    : `<tr><td colspan="5" class="muted">Sin borradores.</td></tr>`;

  tbScheduled.innerHTML = scheduled.length
    ? scheduled.map((r) => rowHtml(r, { mode: "scheduled" })).join("")
    : `<tr><td colspan="5" class="muted">Sin mensajes programados.</td></tr>`;

  // Sent (read-only)
  const sentRowHtml = (r) => {
    const rawEstado = r.estado || "";
    const estUp = String(rawEstado || "").toUpperCase();
    const isErr = estUp.includes("ERROR");
    const badge = isErr ? "badge bad" : "badge ok";
    const date = r.fecha || "";
    const canalTxt = r.canal || "";
    const chId = r.channel_id || "";
    const msg = r.mensaje || "";
    const chLabel = canalTxt ? `${canalTxt}${chId ? ` · ${chId}` : ""}` : (chId || "");
    return `
      <tr>
        <td class="nowrap">${escapeHtml(date)}</td>
        <td>${escapeHtml(chLabel)}</td>
        <td><div style="max-width:720px;white-space:pre-wrap">${escapeHtml(msg)}</div></td>
        <td class="nowrap"><span class="${badge}">${escapeHtml(formatEstado(rawEstado))}</span></td>
      </tr>
    `;
  };

  // Sección enviados colapsable
  const sentSection = $("sentSection");
  const sentToggleBtn = $("btnToggleSent");
  if (sentSection) sentSection.style.display = S.sentCollapsed ? "none" : "";
  if (sentToggleBtn) {
    sentToggleBtn.textContent = S.sentCollapsed ? "▶ Mostrar" : "▼ Ocultar";
    if (!sentToggleBtn._bound) {
      sentToggleBtn._bound = true;
      sentToggleBtn.addEventListener("click", () => {
        S.sentCollapsed = !S.sentCollapsed;
        sentToggleBtn.textContent = S.sentCollapsed ? "▶ Mostrar" : "▼ Ocultar";
        if (sentSection) sentSection.style.display = S.sentCollapsed ? "none" : "";
        if (!S.sentCollapsed) {
          tbSent.innerHTML = sent.length
            ? sent.map(sentRowHtml).join("")
            : `<tr><td colspan="4" class="muted">Sin mensajes enviados en las últimas 2 semanas.</td></tr>`;
        }
      });
    }
  }

  if (!S.sentCollapsed) {
    tbSent.innerHTML = sent.length
      ? sent.map(sentRowHtml).join("")
      : `<tr><td colspan="4" class="muted">Sin mensajes enviados en las últimas 2 semanas.</td></tr>`;
  } else {
    tbSent.innerHTML = "";
  }

  if (btnRefreshSent && !btnRefreshSent._bound) {
    btnRefreshSent._bound = true;
    btnRefreshSent.addEventListener("click", async () => {
      try {
        setErr("");
        S.outbox = await API.slackOutboxList();
        renderOutbox();
        toast("Outbox", "Actualizado");
      } catch (e) {
        setErr(`Outbox: ${e.message || e}`);
      }
    });
  }

  // listeners: drafts (autosave, programar, enviar, eliminar)
  const bindTable = (root) => {
    root.querySelectorAll("tr[data-row]").forEach((tr) => {
      const row = Number(tr.getAttribute("data-row"));
      const mode = tr.getAttribute("data-mode");
      const sel = tr.querySelector("[data-ch]");
      const txt = tr.querySelector("[data-msg]");
      const when = tr.querySelector("[data-when]");

      tr.querySelector("[data-del]")?.addEventListener("click", async () => {
        setErr("");
        try {
          if (!await hubConfirm_("¿Eliminás este mensaje? No se puede recuperar.", "Sí, eliminar")) return;
          await API.slackOutboxDelete(row);
          // Patch optimista: eliminar localmente sin esperar re-fetch
          S.outbox = (S.outbox || []).filter((x) => Number(x.row) !== Number(row));
          renderOutbox();
          toast("Outbox", "Eliminado");
          // Sync background
          API.slackOutboxList().then((d) => { S.outbox = d || []; renderOutbox(); }).catch(() => {});
        } catch (e) {
          setErr(`Eliminar: ${e.message || e}`);
        }
      });

      if (mode !== "draft") return;

      const triggerSave = () => outboxAutosave(row, sel.value, txt.value);
      sel?.addEventListener("change", triggerSave);
      txt?.addEventListener("input", triggerSave);
      txt?.addEventListener("blur", triggerSave);

      tr.querySelector("[data-prog]")?.addEventListener("click", async () => {
        setErr("");
        try {
          const v = (when?.value || "").trim();
          if (!v) throw new Error("Elegí fecha y hora para programar.");
          // guardo antes de programar
          const canal = (S.canales || []).find((c) => c.channel_id === sel.value)?.canal || "";
          await API.slackOutboxUpdate(row, canal, sel.value, txt.value);
          await API.slackOutboxProgramar(row, v);
          // Patch optimista: marcar como PROGRAMADO localmente
          patchOutbox_(row, { estado: `PROGRAMADO ${v}`, channel_id: sel.value, canal, mensaje: txt.value });
          toast("Outbox", "Programado");
        } catch (e) {
          setErr(`Programar: ${e.message || e}`);
        }
      });

      // Desprogramar (solo en filas programadas)
      tr.querySelector("[data-desch]")?.addEventListener("click", async () => {
        try {
          await API.slackOutboxDesprogramar(row);
          patchOutbox_(row, { estado: "BORRADOR", programado_para: "" });
          toast("Outbox", "Mensaje desprogramado");
        } catch (e) { setErr(`Outbox: ${e.message || e}`); }
      });

      tr.querySelector("[data-send]")?.addEventListener("click", async () => {
        setErr("");
        try {
          // guardo antes de enviar
          const canal = (S.canales || []).find((c) => c.channel_id === sel.value)?.canal || "";
          await API.slackOutboxUpdate(row, canal, sel.value, txt.value);
          await onOutboxSend(row);
        } catch (e) {
          setErr(`Enviar: ${e.message || e}`);
        }
      });
    });
  };

  bindTable(tbDrafts);
  bindTable(tbScheduled);

  // Vista rápida de borradores generados desde Operativa diaria (por canal)
  renderDailyDrafts_();
}

function renderDailyDrafts_() {
  const wrap = $("dailyDraftsWrap");
  const host = $("dailyDrafts");
  const meta = $("dailyDraftsMeta");
  if (!wrap || !host) return;

  const pad2 = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const today = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;

  const items = (S.outbox || [])
    .filter((r) => String(r.estado || "").toUpperCase().includes("PLANNING"))
    .filter((r) => String(r.fecha || "") === today)
    .slice()
    .sort((a, b) => (b.row || 0) - (a.row || 0));

  if (!items.length) {
    wrap.style.display = "none";
    host.innerHTML = "";
    if (meta) meta.textContent = "";
    return;
  }

  // Agrupar por canal
  const byCh = new Map();
  for (const r of items) {
    const key = String(r.channel_id || r.canal || "").trim() || "SIN_CANAL";
    if (!byCh.has(key)) byCh.set(key, []);
    byCh.get(key).push(r);
  }

  const groups = Array.from(byCh.entries()).map(([k, list]) => {
    // mostramos el más reciente por canal
    const r = list[0];
    const label = r.canal ? `${r.canal}${r.channel_id ? ` · ${r.channel_id}` : ""}` : (r.channel_id || "");
    return { key: k, row: r.row, label, msg: r.mensaje || "" };
  });

  wrap.style.display = "block";
  if (meta) meta.textContent = `${groups.length} canal${groups.length !== 1 ? "es" : ""}`;

  host.innerHTML = groups
    .map((g) => {
      return `
        <div class="card" style="padding:12px">
          <div class="row" style="margin-bottom:8px">
            <div class="pill">${escapeHtml(g.label || "(sin canal)")}</div>
            <div class="spacer"></div>
            <button class="btn ghost" data-copy="${g.row}">Copiar</button>
            <button class="btn ghost" data-del="${g.row}">Eliminar borrador</button>
          </div>
          <div style="white-space:pre-wrap">${escapeHtml(g.msg)}</div>
        </div>
      `;
    })
    .join("");

  host.querySelectorAll("[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      const row = Number(b.getAttribute("data-copy"));
      const r = (S.outbox || []).find((x) => Number(x.row) === row);
      if (!r) return;
      try {
        await navigator.clipboard.writeText(String(r.mensaje || ""));
        toast("Copiado", "Mensaje en portapapeles");
      } catch {
        // fallback: selecciono texto
        toast("Copiar", "No se pudo copiar automáticamente");
      }
    });
  });

  host.querySelectorAll("[data-del]").forEach((b) => {
    b.addEventListener("click", async () => {
      const row = Number(b.getAttribute("data-del"));
      if (!row) return;
      if (!await hubConfirm_("¿Eliminás este borrador? No se puede recuperar.", "Sí, eliminar")) return;
      try {
        await API.slackOutboxDelete(row);
        S.outbox = await API.slackOutboxList();
        renderOutbox();
        toast("Outbox", "Eliminado");
      } catch (e) {
        setErr(`Eliminar borrador: ${e.message || e}`);
      }
    });
  });
}

// ===== Compose (siempre disponible) =====
let _slackComposeMounted = false;
function mountSlackCompose_() {
  if (_slackComposeMounted) return;
  _slackComposeMounted = true;

  const selCh = $("slackComposeChannel");
  const ta = $("slackComposeMsg");
  const when = $("slackComposeWhen");
  // v9.5_patch: se elimina confirmación extra para programación
  const btnClear = $("btnComposeClear");
  const btnDraft = $("btnSaveDraft");
  const btnSendNow = $("btnSendNow");
  const btnSched = $("btnSchedule");
  const btnEmoji = $("btnEmoji");
  const emojiModal = $("emojiModal");
  const emojiGroups = $("emojiGroups");
  const emojiSearch = $("emojiSearch");
  const emojiSearchClear = $("emojiSearchClear");
  const btnEmojiClose = $("btnEmojiClose");
  

  const mentionSearch = $("slackMentionSearch");
  const mentionResults = $("slackMentionResults");
  const mentionPills = $("slackMentionPills");

  if (!selCh || !ta || !when || !btnClear || !btnDraft || !btnSched || !btnSendNow) return;

  // canales
  const refreshChannels = () => {
    selCh.innerHTML = channelOptionsHtml("");
  };
  refreshChannels();

  // Programar: validación simple (fecha/hora requerida)

  // menciones (buscador + píldoras)
  // Fuente de menciones = colaboradores + notificaciones masivas + canales (link)
  const massMentions = [
    // Decisión de producto: unificamos notificación de canal en @canal (evita confusión semántica)
    { id: "__mass_canal", nombre: "@canal", mailProd: "Notifica al canal", slackId: "", token: "<!channel>" },
    { id: "__mass_here", nombre: "@here", mailProd: "Notifica a activos", slackId: "", token: "<!here>" },
    { id: "__mass_everyone", nombre: "@everyone", mailProd: "Notifica a todos", slackId: "", token: "<!everyone>" },
  ];

  const colabMentions = (S.colabs || [])
    .map(colabRowView)
    .filter((v) => v.nombre || v.mailProd)
    .map((v) => {
      const label = `${v.nombre || v.id}${v.mailProd ? ` · ${v.mailProd}` : ""}`;
      const hay = norm(`${v.nombre || ""} ${v.mailProd || ""} ${v.id || ""}`);
      return {
        id: v.id,
        nombre: v.nombre || v.id,
        mailProd: v.mailProd || "",
        label,
        hay,
        slackId: v.slackId || "",
        token: v.slackId ? `<@${v.slackId}>` : "",
      };
    })
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")));

  const channelMentions = (S.canales || [])
    .filter((c) => c?.channel_id && c?.canal)
    .map((c) => {
      const nombre = `#${c.canal}`;
      return {
        id: `__ch_${c.channel_id}`,
        nombre,
        mailProd: "Link a canal",
        label: nombre,
        hay: norm(`${c.canal} ${nombre}`),
        slackId: "",
        token: `<#${c.channel_id}|${c.canal}>`,
      };
    });

  const allMentions = [...massMentions, ...colabMentions, ...channelMentions].map((x) => {
    const hay = x.hay || norm(`${x.nombre || ""} ${x.mailProd || ""}`);
    return { ...x, hay };
  });

  const selMentions = new Map(); // id -> item

  const renderPills = () => {
    if (!mentionPills) return;
    const items = [...selMentions.values()];
    mentionPills.innerHTML = items.length
      ? items
          .map(
            (x) => `
        <span class="pill" style="display:inline-flex;gap:6px;align-items:center">
          <span>${escapeHtml(x.nombre)}</span>
          <button class="xbtn" data-rm="${escapeAttr(x.id)}" title="Quitar">×</button>
        </span>`
          )
          .join("")
      : `<span class="muted" style="font-size:12px">Sin menciones.</span>`;

    mentionPills.querySelectorAll("[data-rm]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = unescapeAttr(b.getAttribute("data-rm"));
        selMentions.delete(id);
        renderPills();
      });
    });
  };

  const closeMentionResults = () => {
    if (!mentionResults) return;
    mentionResults.style.display = "none";
    mentionResults.innerHTML = "";
  };

  // Posicionar el panel de menciones con position:fixed para escapar de overflow
  const posMentionPanel = () => {
    if (!mentionSearch || !mentionResults) return;
    const r = mentionSearch.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const panelH = Math.min(320, Math.max(spaceBelow, spaceAbove));
    // Preferir abajo, si no hay espacio abrir arriba
    if (spaceBelow >= 120 || spaceBelow >= spaceAbove) {
      mentionResults.style.top  = (r.bottom + 4) + "px";
      mentionResults.style.bottom = "auto";
    } else {
      mentionResults.style.bottom = (window.innerHeight - r.top + 4) + "px";
      mentionResults.style.top = "auto";
    }
    mentionResults.style.left  = r.left + "px";
    mentionResults.style.width = Math.max(320, r.width) + "px";
    mentionResults.style.maxHeight = panelH + "px";
  };

  const renderMentionResults = (q) => {
    if (!mentionResults) return;
    const nq = norm(q);
    if (!nq) return closeMentionResults();
    const hits = allMentions.filter((x) => x.hay.includes(nq)).slice(0, 15); // hasta 15
    if (!hits.length) {
      posMentionPanel();
      mentionResults.style.display = "block";
      mentionResults.innerHTML = `<div class="muted" style="font-size:12px;padding:6px">Sin resultados.</div>`;
      return;
    }
    posMentionPanel();
    mentionResults.style.display = "block";
    mentionResults.innerHTML = hits
      .map((x) => {
        const disabled = selMentions.has(x.id) ? "disabled" : "";
        return `
          <button class="btn ghost" data-pick="${escapeAttr(x.id)}" ${disabled} style="width:100%;justify-content:flex-start;gap:10px;padding:8px">
            <span style="font-weight:600">${escapeHtml(x.nombre)}</span>
            <span class="muted" style="font-size:12px">${escapeHtml(x.mailProd)}</span>
          </button>
        `;
      })
      .join("");

    mentionResults.querySelectorAll("[data-pick]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = unescapeAttr(b.getAttribute("data-pick"));
        const it = allMentions.find((x) => x.id === id);
        if (!it) return;
        selMentions.set(it.id, it);
        renderPills();
        if (mentionSearch) mentionSearch.value = "";
        closeMentionResults();
        ta.focus();
      });
    });
  };

  mentionSearch?.addEventListener("input", debounce(() => {
    renderMentionResults(mentionSearch.value);
  }, 120));

  document.addEventListener("click", (e) => {
    if (!mentionResults || !mentionSearch) return;
    const t = e.target;
    if (mentionResults.contains(t) || mentionSearch.contains(t)) return;
    closeMentionResults();
  });

  const getSelectedMentions = () => {
    const picked = [...selMentions.values()];
    const tokens = picked.map((x) => x.token || "").filter(Boolean);
    return { tokens, picked };
  };

  // Inserta menciones al FINAL del mensaje (no al inicio).
  // - No duplica si el token ya está en el texto.
  // - Para notificaciones masivas, chequea también @alias (por si el user lo escribió).
  const buildMessageWithMentions = (raw) => {
    // Normaliza menciones masivas a tokens Slack para que realmente notifiquen
    // (Slack API no siempre linkea @channel/@here/@everyone si no se setea link_names).
    const normalized = String(raw || "")
      .replace(/\B@canal\b/gi, "<!channel>")
      .replace(/\B@channel\b/gi, "<!channel>")
      .replace(/\B@here\b/gi, "<!here>")
      .replace(/\B@everyone\b/gi, "<!everyone>")
      .trim();

    const base = normalized;
    const { tokens, picked } = getSelectedMentions();
    if (!tokens.length) return base;

    const existing = base;

    const toAdd = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const p = picked[i];
      if (!tok) continue;

      // Mass mentions: si el usuario ya escribió @channel/@canal/etc, no lo repetimos.
      if (tok === "<!channel>") {
        const has = /<\!channel>|\B@channel\b|\B@canal\b/i.test(existing);
        if (!has) toAdd.push(tok);
        continue;
      }
      if (tok === "<!here>") {
        const has = /<\!here>|\B@here\b/i.test(existing);
        if (!has) toAdd.push(tok);
        continue;
      }
      if (tok === "<!everyone>") {
        const has = /<\!everyone>|\B@everyone\b/i.test(existing);
        if (!has) toAdd.push(tok);
        continue;
      }

      if (existing.includes(tok)) continue;
      toAdd.push(tok);
    }

    if (!toAdd.length) return base;
    return base ? `${base}\n\n${toAdd.join(" ")}` : toAdd.join(" ");
  };

  const insertAtCursor = (textarea, text) => {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const v = textarea.value || "";
    textarea.value = v.slice(0, start) + text + v.slice(end);
    const pos = start + text.length;
    textarea.setSelectionRange(pos, pos);
    textarea.focus();
  };

  const clearCompose = () => {
    selCh.value = "";
    ta.value = "";
    when.value = "";
    selMentions.clear();
    renderPills();
    if (mentionSearch) mentionSearch.value = "";
    closeMentionResults();
    toast("Compose", "Listo");
  };

  btnClear.addEventListener("click", clearCompose);

  btnDraft.addEventListener("click", async () => {
    setErr("");
    try {
      const channel_id = String(selCh.value || "").trim();
      const mensaje = buildMessageWithMentions(ta.value);
      if (!mensaje) throw new Error("Escribí un mensaje.");

      const canal = (S.canales || []).find((c) => c.channel_id === channel_id)?.canal || "";
      await API.slackOutboxAppend(todayYMD(), "COMPOSE", canal, channel_id, mensaje, "BORRADOR");
      clearCompose();
      toast("Outbox", "Borrador guardado");
      // Sync en background
      API.slackOutboxList().then((d) => { S.outbox = d || []; renderOutbox(); }).catch(() => {});
    } catch (e) {
      setErr(`Borrador: ${e.message || e}`);
    }
  });

  btnSendNow.addEventListener("click", async () => {
    setErr("");
    try {
      const channel_id = String(selCh.value || "").trim();
      const mensaje = buildMessageWithMentions(ta.value);
      if (!mensaje) throw new Error("Escribí un mensaje.");

      const canal = (S.canales || []).find((c) => c.channel_id === channel_id)?.canal || "";
      // 1) append
      await API.slackOutboxAppend(todayYMD(), "COMPOSE", canal, channel_id, mensaje, "BORRADOR");
      // fetch una sola vez para obtener la fila creada
      S.outbox = await API.slackOutboxList();
      const newest = (S.outbox || []).slice().sort((a, b) => (b.row || 0) - (a.row || 0))[0];
      if (!newest?.row) throw new Error("No se pudo obtener la fila creada.");

      // 2) send
      await API.slackSendRow(newest.row);
      clearCompose();
      toast("Slack", "Enviado");
      // Sync background
      API.slackOutboxList().then((d) => { S.outbox = d || []; renderOutbox(); }).catch(() => {});
    } catch (e) {
      setErr(`Enviar: ${e.message || e}`);
    }
  });

  btnSched.addEventListener("click", async () => {
    setErr("");
    try {
      const channel_id = String(selCh.value || "").trim();
      const mensaje = buildMessageWithMentions(ta.value);
      const v = String(when.value || "").trim();
      if (!mensaje) throw new Error("Escribí un mensaje.");
      if (!v) throw new Error("Elegí fecha y hora para programar.");

      const canal = (S.canales || []).find((c) => c.channel_id === channel_id)?.canal || "";
      // 1) crear fila como borrador
      await API.slackOutboxAppend(todayYMD(), "COMPOSE", canal, channel_id, mensaje, "BORRADOR");
      // fetch una sola vez para obtener la fila creada
      S.outbox = await API.slackOutboxList();
      const newest = (S.outbox || []).slice().sort((a,b)=>(b.row||0)-(a.row||0))[0];
      if (!newest?.row) throw new Error("No se pudo obtener la fila creada.");

      // 2) programar
      await API.slackOutboxProgramar(newest.row, v);
      clearCompose();
      toast("Outbox", "Mensaje programado");
      // Sync background
      API.slackOutboxList().then((d) => { S.outbox = d || []; renderOutbox(); }).catch(() => {});
    } catch (e) {
      setErr(`Programar: ${e.message || e}`);
    }
  });
  // Emojis: paleta operativa (vista unificada).
  // - Sin tabs ni categorías visibles.
  // - Orden implícito por grupos (sin títulos) según especificación.
  // - Inserción 1 click, mantiene foco del textarea, no altera contenido existente.

  const EMOJI_GROUPS = [
    { k: "urgencia accion", items: ["🚨","❗️","‼️","⚠️","🔔","⏰","⏱️","📢","👀","👆","👇","👉","👈","🆘","🔥","🚩"] },
    { k: "estado progreso", items: ["✅","☑️","✔️","❌","✖️","⛔️","🛑","🚫","🔄","♻️","⏳","⌛️","🟢","🟡","🔴","⚪️","⚫️","📍","📌"] },
    { k: "bloqueos riesgos", items: ["🧨","💥","🚧","🐞","🐛","🧱","❓"] },
    { k: "tiempo fechas", items: ["📅","🗓️","🕘","🕙","🕚","🕛","⏱️","⌛️","🔜","🔚","📆"] },
    { k: "operativo procesos", items: ["📊","📈","📉","🗂️","🗃️","🗄️","⚙️","🛠️","🔧","🧰","🧪","🔬","📦","🏷️"] },
    { k: "info contexto", items: ["ℹ️","💡","📝","✍️","📎","🔗","🔍","🔎","🧩","📚"] },
    { k: "objetivos prioridad", items: ["🎯","⭐️","🌟","🔝","⬆️","⬇️","🥇","🥈","🥉","🧭","🚀"] },
    { k: "personas comunicacion", items: ["👤","👥","👪","🧑‍💻","👨‍💻","👩‍💻","🙋‍♂️","🙋‍♀️","🤝","👋","👂"] },
    { k: "feedback cierre", items: ["💬","🗣️","👍","👎","👌","👏","🙌","🙏","🤔"] },
    { k: "orden limpieza", items: ["🧹","🧼","🗑️","🔄","🧯","📤","📥"] },
  ];

  const EMOJI_INDEX = (() => {
    const out = [];
    for (let gi = 0; gi < EMOJI_GROUPS.length; gi++) {
      const g = EMOJI_GROUPS[gi];
      for (let ii = 0; ii < g.items.length; ii++) {
        const e = g.items[ii];
        // "hay" permite búsqueda sin mostrar categorías.
        out.push({ e, hay: norm(`${g.k} ${e}`) });
      }
    }
    return out;
  })();

const renderEmojiPanel = () => {
    if (!emojiGroups) return;
    const q = norm(String(emojiSearch?.value || ""));

    const items = q ? EMOJI_INDEX.filter((x) => x.hay.includes(q)) : EMOJI_INDEX;

    emojiGroups.innerHTML = `
      <div class="emoji-grid">${items.map((x) => `<button type="button" class="emoji-btn" data-e="${escapeAttr(x.e)}">${escapeHtml(x.e)}</button>`).join("")}</div>
      ${q && !items.length ? `<div class="muted" style="font-size:12px;margin-top:10px">Sin resultados.</div>` : ""}
    `;

    emojiGroups.querySelectorAll("[data-e]").forEach((b) => {
      b.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        insertAtCursor(ta, b.getAttribute("data-e") + " ");
      });
    });
  };

  const openEmoji = () => { if (emojiModal) emojiModal.style.display = "block"; };
  const closeEmoji = () => { if (emojiModal) emojiModal.style.display = "none"; };

  btnEmoji?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!emojiModal) return;
    emojiModal.style.display = emojiModal.style.display === "none" ? "block" : "none";
  });

  btnEmojiClose?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeEmoji();
  });

  emojiSearch?.addEventListener("input", debounce(() => {
    // mostrar/ocultar X de limpieza (mismo patrón que otros search del hub)
    try {
      const wrap = emojiSearch?.closest?.(".search");
      if (wrap) wrap.classList.toggle("has", !!String(emojiSearch.value || "").trim());
    } catch (_) {}
    renderEmojiPanel();
  }, 80));

  emojiSearchClear?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!emojiSearch) return;
    emojiSearch.value = "";
    try {
      const wrap = emojiSearch.closest?.(".search");
      if (wrap) wrap.classList.remove("has");
    } catch (_) {}
    renderEmojiPanel();
    emojiSearch.focus();
  });

  document.addEventListener("click", (e) => {
    if (!emojiModal || !btnEmoji) return;
    const t = e.target;
    if (emojiModal.contains(t) || btnEmoji.contains(t)) return;
    closeEmoji();
  });

  // init emojis
  renderEmojiPanel();

  // estado inicial
  renderPills();
}

async function onOutboxSend(row) {
  setErr("");
  try {
    setBusy("Slack", "Enviando mensaje...");
    await API.slackSendRow(row);
    // Patch optimista: marcar como ENVIADO localmente
    const stamp = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    patchOutbox_(row, { estado: `ENVIADO ✅ ${stamp}` });
    toast("Slack", "Enviado");
  } catch (e) {
    setErr(`Slack: ${e.message || e}`);
  } finally {
    clearBusy();
  }
}

/* ========= Colaboradores ========= */
function renderColabs() {
  const tb = $("tblColabs")?.querySelector("tbody");
  if (!tb) return;

  const filtered = applySectionFilter(S.colabs || [], S.fColabs).map(colabRowView);

  // sort
  const { key, dir } = S.sort.colabs || { key: "", dir: 1 };
  const sorted = filtered.slice().sort((a, b) => {
    const av = a?.[key] ?? "";
    const bv = b?.[key] ?? "";
    // ingreso: keep correct chronological sort while rendering dd-mm-yyyy
    if (key === "ingreso") {
      const ta = parseDateAnyToTs_(av);
      const tb = parseDateAnyToTs_(bv);
      const na = Number.isFinite(ta) ? ta : -Infinity;
      const nb = Number.isFinite(tb) ? tb : -Infinity;
      if (na === nb) return 0;
      return dir * (na - nb);
    }
    return dir * String(av).localeCompare(String(bv));
  });

  // selection pill
  const pill = $("colabsSelPill");
  if (pill) pill.innerHTML = `<b>Seleccionados</b> ${S.selColabs.size}`;

  // select-all checkbox reflects filtered selection state
  const selAll = $("colabsSelectAll");
  if (selAll) {
    const allIds = sorted.map((x) => x.id).filter(Boolean);
    const allSelected = allIds.length > 0 && allIds.every((id) => S.selColabs.has(id));
    selAll.checked = allSelected;
    selAll.indeterminate = !allSelected && allIds.some((id) => S.selColabs.has(id));
  }

  if (!sorted.length) {
    tb.innerHTML = `<tr><td colspan="9" class="muted">Sin resultados.</td></tr>`;
    return;
  }

  // Mostrar/ocultar botón Eliminar según selección
  const btnElim = $("btnColabEliminar");
  if (btnElim) btnElim.style.display = S.selColabs.size > 0 ? "" : "none";

  tb.innerHTML = sorted
    .map((v) => {
      const checked = S.selColabs.has(v.id) ? "checked" : "";
      return `
        <tr data-id="${escapeAttr(v.id)}">
          <td class="nowrap"><input type="checkbox" data-sel ${checked} /></td>
          <td class="copyable" data-copy="${escapeAttr(v.id)}">${escapeHtml(v.id)}</td>
          <td>${escapeHtml(v.nombre)}</td>
          <td>${escapeHtml(v.rol)}</td>
          <td>${escapeHtml(v.equipo)}</td>
          <td>${escapeHtml(v.ubic)}</td>
          <td class="copyable" data-copy="${escapeAttr(v.mailProd)}">${escapeHtml(v.mailProd)}</td>
          <td class="copyable" data-copy="${escapeAttr(v.mailExt)}">${escapeHtml(v.mailExt)}</td>
          <td class="nowrap">${escapeHtml(fmtDateAny(v.ingreso))}</td>
          <td class="nowrap">
            <button class="btn ghost" data-colab-edit="${escapeAttr(v.id)}" style="font-size:11px;padding:3px 8px" title="Editar">✏️</button>
          </td>
        </tr>
      `;
    })
    .join("");

  // single-cell copy
  tb.querySelectorAll("[data-copy]").forEach((el) => {
    el.addEventListener("click", () => copyToClipboard(el.getAttribute("data-copy")));
  });

  // row selection
  tb.querySelectorAll("input[data-sel]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.closest("tr")?.getAttribute("data-id");
      if (!id) return;
      if (cb.checked) S.selColabs.add(unescapeAttr(id));
      else S.selColabs.delete(unescapeAttr(id));
      renderColabs(); // refresh pill + indeterminate
    });
  });

  // Botón editar por fila
  tb.querySelectorAll("[data-colab-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = unescapeAttr(btn.getAttribute("data-colab-edit"));
      openColabModal_(id);
    });
  });

  // sortable headers + indicators
  mountTableSort_("tblColabs", S.sort.colabs, (next) => {
    S.sort.colabs = next;
    renderColabs();
  });
}


/* ========= Colaboradores CRUD ========= */

let _colabModalMode_ = "add"; // "add" | "edit"
let _colabEditId_    = null;

async function openColabModal_(editId = null) {
  _colabModalMode_ = editId ? "edit" : "add";
  _colabEditId_    = editId || null;

  const modal = $("colabModal");
  const title = $("colabModalTitle");
  if (!modal) return;

  title.textContent = editId ? "Editar colaborador" : "Agregar colaborador";

  // Poblar datalists de Rol y Equipo
  const roles   = [...new Set((S.colabs || []).map(c => colabRowView(c).rol).filter(Boolean))].sort();
  const equipos = [...new Set((S.colabs || []).map(c => colabRowView(c).equipo).filter(Boolean))].sort();

  // Poblar selects de Rol y Equipo con opciones dinámicas
  const rolSel = $("cmRol");
  const eqSel  = $("cmEquipo");
  if (rolSel) {
    const curRol = rolSel.value;
    rolSel.innerHTML = `<option value="">— Seleccioná un rol —</option>` +
      roles.map(r => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join("");
    if (curRol) rolSel.value = curRol;
  }
  if (eqSel) {
    const curEq = eqSel.value;
    eqSel.innerHTML = `<option value="">— Seleccioná un equipo —</option>` +
      equipos.map(e => `<option value="${escapeAttr(e)}">${escapeHtml(e)}</option>`).join("");
    if (curEq) eqSel.value = curEq;
  }

  // Limpiar / poblar campos
  const campos = ["cmIdMeli","cmNombre","cmRol","cmEquipo","cmFechaIngreso","cmMailProd","cmMailExt","cmTag"];
  campos.forEach(id => { const el = $(id); if (el) el.value = ""; });
  if ($("cmUbic")) $("cmUbic").value = "";
  if ($("cmUbicOtra")) { $("cmUbicOtra").value = ""; $("cmUbicOtra").style.display = "none"; }

  if (editId) {
    const v = colabRowView((S.colabs || []).find(c => {
      const cv = colabRowView(c);
      return cv.id === editId;
    }));
    if (v) {
      const set_ = (id, val) => { const el = $(id); if (el && val) el.value = val; };
      set_("cmIdMeli",       v.id);
      set_("cmNombre",       v.nombre);
      // Rol y Equipo: primero poblar el select, luego seleccionar el valor
      if ($("cmRol") && v.rol) $("cmRol").value = v.rol;
      if ($("cmEquipo") && v.equipo) $("cmEquipo").value = v.equipo;
      // Ubicación: si es valor conocido, seleccionar; sino mostrar input libre
      if ($("cmUbic")) {
        const knownUbic = ["AMBA", "MDP", "TANDIL"];
        if (knownUbic.includes(v.ubic)) {
          $("cmUbic").value = v.ubic;
          if ($("cmUbicOtra")) $("cmUbicOtra").style.display = "none";
        } else if (v.ubic) {
          $("cmUbic").value = "__otra__";
          if ($("cmUbicOtra")) { $("cmUbicOtra").style.display = ""; $("cmUbicOtra").value = v.ubic; }
        }
      }
      set_("cmMailProd",     v.mailProd);
      set_("cmMailExt",      v.mailExt);
      // Fecha ingreso: convertir a yyyy-MM-dd para input type=date
      if (v.ingreso) {
        const iso = _fechaToISO_(v.ingreso) || (v.ingreso instanceof Date ? v.ingreso.toISOString().slice(0,10) : "");
        if (iso && $("cmFechaIngreso")) $("cmFechaIngreso").value = iso;
      }
      // TAG desde el objeto raw
      const raw = (S.colabs || []).find(c => colabRowView(c).id === editId);
      const tag = raw?.TAG || raw?.tag || "";
      if (tag && $("cmTag")) $("cmTag").value = tag;
      // ID no editable en modo edit
      if ($("cmIdMeli")) $("cmIdMeli").disabled = true;
    }
  } else {
    if ($("cmIdMeli")) $("cmIdMeli").disabled = false;
    // Fecha por defecto: hoy
    if ($("cmFechaIngreso")) $("cmFechaIngreso").value = new Date().toISOString().slice(0,10);
  }

  modal.style.display = "block";
  setTimeout(() => $("cmIdMeli")?.focus(), 50);
}

function closeColabModal_() {
  const modal = $("colabModal");
  if (modal) modal.style.display = "none";
  if ($("cmIdMeli")) $("cmIdMeli").disabled = false;
}

async function saveColabModal_() {
  const id_meli       = $("cmIdMeli")?.value?.trim() || "";
  const nombre        = $("cmNombre")?.value?.trim() || "";
  const rol           = $("cmRol")?.value?.trim() || "";
  const equipo        = $("cmEquipo")?.value?.trim() || "";
  const ubicSel = $("cmUbic")?.value || "";
  const ubicacion = ubicSel === "__otra__"
    ? ($("cmUbicOtra")?.value?.trim() || "")
    : ubicSel.trim();
  const fecha_ingreso = $("cmFechaIngreso")?.value || "";
  const mail_prod     = $("cmMailProd")?.value?.trim() || "";
  const mail_ext      = $("cmMailExt")?.value?.trim() || "";
  const tag           = $("cmTag")?.value?.trim() || "";

  // Validar obligatorios
  const faltantes = [];
  if (!id_meli)       faltantes.push("ID_MELI");
  if (!nombre)        faltantes.push("Nombre");
  if (!rol)           faltantes.push("Rol");
  if (!equipo)        faltantes.push("Equipo");
  if (!ubicacion)     faltantes.push("Ubicación");
  if (!fecha_ingreso) faltantes.push("Fecha Ingreso");
  if (!mail_prod)     faltantes.push("Mail Productora");
  if (!mail_ext)      faltantes.push("Mail Externo");

  if (faltantes.length) {
    setErr("Campos obligatorios: " + faltantes.join(", "));
    return;
  }

  setErr("");
  try {
    setBusy("Colaboradores", _colabModalMode_ === "add" ? "Agregando..." : "Guardando...");

    const payload = { id_meli, nombre, rol, equipo, ubicacion, mail_prod, mail_ext, fecha_ingreso, tag };

    if (_colabModalMode_ === "add") {
      await API.colaboradoresAdd(payload);
      toast("Colaboradores", `✓ ${nombre} agregado`);
    } else {
      await API.colaboradoresUpdate({ ...payload, id_meli: _colabEditId_ || id_meli });
      toast("Colaboradores", `✓ ${nombre} actualizado`);
    }

    // Recargar colabs y cerrar modal
    S.colabs = await API.colaboradoresList();
    CACHE.invalidate("colabs");
    CACHE.set("colabs", S.colabs, 5 * 60_000);
    _refreshRoleFilters_();
    renderColabs();
    renderDashboard();
    closeColabModal_();
  } catch (e) {
    setErr(`Colaboradores: ${e.message || e}`);
  } finally {
    clearBusy();
  }
}

async function deleteColabsConfirm_() {
  const ids = [...S.selColabs];
  if (!ids.length) return;

  // Mostrar modal de confirmación con nombres
  const modal = $("colabDeleteModal");
  const list  = $("colabDeleteList");
  if (!modal || !list) return;

  const nombres = ids.map(id => {
    const v = colabRowView((S.colabs || []).find(c => colabRowView(c).id === id) || {});
    return v.nombre || id;
  });

  list.innerHTML = nombres.map(n => `<div class="pill bad" style="margin:3px;display:inline-block">${escapeHtml(n)}</div>`).join("");
  modal.style.display = "block";
}

function closeDeleteModal_() {
  const modal = $("colabDeleteModal");
  if (modal) modal.style.display = "none";
}

async function deleteColabsExecute_() {
  const ids = [...S.selColabs];
  closeDeleteModal_();
  try {
    setBusy("Colaboradores", "Eliminando...");
    await API.colaboradoresDelete(ids);
    S.selColabs.clear();
    S.colabs = await API.colaboradoresList();
    CACHE.invalidate("colabs");
    CACHE.set("colabs", S.colabs, 5 * 60_000);
    _refreshRoleFilters_();
    renderColabs();
    renderDashboard();
    toast("Colaboradores", `✓ ${ids.length} colaborador${ids.length > 1 ? "es" : ""} eliminado${ids.length > 1 ? "s" : ""}`);
  } catch (e) {
    setErr(`Colaboradores: ${e.message || e}`);
  } finally {
    clearBusy();
  }
}

// Instancia del mountMultiSelect del filtro de flujo en Habilitaciones
let _habilFlujoMs = null;

/* ========= Habilitaciones ========= */
function renderHabil() {
  const head = $("tblHabilHead");
  const body = $("tblHabilBody");
  if (!head || !body) return;

  if (!S.habil || !S.habil.flujos || !S.habil.rows) {
    head.innerHTML = `<tr><th>Estado</th></tr>`;
    body.innerHTML = `<tr><td class="muted">No se pudo cargar. Actualizá la página.</td></tr>`;
    return;
  }

  // Fuente única: S.flujos (Operativa) + S.habil.flujos como fallback
  // Garantiza que flujos nuevos/eliminados desde Operativa se reflejen acá
  const flujosFuente = (S.flujos || []).map(f => String(f.flujo || f)).filter(Boolean);
  const flujos = flujosFuente.length
    ? flujosFuente.slice().sort((a, b) => a.localeCompare(b))
    : (S.habil.flujos || []).slice().sort((a, b) => a.localeCompare(b));

  // Sincronizar multiselects con la lista de flujos actualizada
  if (_habilFlujoMs && typeof _habilFlujoMs.updateItems === "function") {
    _habilFlujoMs.updateItems(flujos);
  }

  // ── Chips de resumen: count de habilitados por flujo ──────
  const chipsWrap = $("habilResumenChips");
  if (chipsWrap) {
    const activeFlujoFilter = S.fHabil?.flujos?.size > 0 ? [...S.fHabil.flujos][0] : null;
    const chipsHtml = flujos.map(f => {
      const total = (S.habil.rows || []).filter(r => r[`H_${f}`]).length;
      const isActive = activeFlujoFilter === f;
      return `<span style="display:inline-flex;align-items:center;border-radius:var(--r-full);
          border:1px solid ${isActive ? "var(--pri)" : "var(--brd)"};
          background:${isActive ? "var(--pri-dim)" : "var(--surface-2)"};
          transition:var(--t)">
        <button type="button" data-chip-flujo="${escapeAttr(f)}"
          style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px 3px 10px;
            background:transparent;border:none;
            color:${isActive ? "var(--pri)" : "var(--text-2)"};
            font-size:11px;cursor:pointer;transition:var(--t);white-space:nowrap" title="Filtrar por ${escapeAttr(f)}">
          <span style="font-weight:600">${escapeHtml(f)}</span>
          <span style="background:${isActive ? "var(--pri)" : "var(--surface)"};color:${isActive ? "#fff" : "var(--text-3)"};
            padding:1px 6px;border-radius:99px;font-size:10px">${total}</span>
        </button>
        <button type="button" data-chip-del-flujo="${escapeAttr(f)}"
          style="padding:4px 8px 4px 4px;background:transparent;border:none;
            border-left:1px solid ${isActive ? "var(--pri-brd)" : "var(--brd-2)"};
            color:var(--text-3);cursor:pointer;font-size:12px;line-height:1;
            transition:color .1s;flex-shrink:0"
          title="Eliminar flujo ${escapeAttr(f)}"
          onmouseover="this.style.color='var(--err-txt,#f47067)'"
          onmouseout="this.style.color='var(--text-3)'">×</button>
      </span>`;
    }).join("");

    // Input inline para nuevo flujo — mismo estilo que los chips
    const inputChip = `
      <span style="display:inline-flex;align-items:center;gap:0;border-radius:var(--r-full);
        border:1px dashed var(--brd-2);overflow:hidden;">
        <input id="habilNuevoFlujoInput" type="text" placeholder="+ Nuevo flujo..."
          style="background:transparent;border:none;outline:none;padding:3px 10px;
            font-size:11px;color:var(--text-2);width:130px;font-family:inherit"
          maxlength="40"/>
        <button id="habilNuevoFlujoBtn" type="button"
          style="background:transparent;border:none;border-left:1px dashed var(--brd-2);
            padding:3px 10px;cursor:pointer;font-size:13px;color:var(--text-3);
            transition:var(--t);line-height:1"
          title="Crear flujo">+</button>
      </span>`;

    chipsWrap.innerHTML = chipsHtml + inputChip;

    // Delegación en chipsWrap — un solo listener, sobrevive a re-renders
    // Listeners directos — se registran en cada render porque chipsWrap se reconstruye
    chipsWrap.querySelectorAll("[data-chip-del-flujo]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const f = btn.getAttribute("data-chip-del-flujo");
        const total = (S.habil?.rows || []).filter(r => r[`H_${f}`]).length;
        const advertencia = total > 0
          ? ` Hay ${total} colaborador${total !== 1 ? "es" : ""} habilitado${total !== 1 ? "s" : ""} en este flujo.`
          : "";
        const ok = await hubConfirm_(
          `¿Eliminás el flujo "${f}"?${advertencia}

Se quitará de Operativa diaria y de Asignaciones. Esta acción no se puede deshacer.`,
          "Sí, eliminar"
        );
        if (!ok) return;
        await onFlujoDelete(f);
      });
    });

    chipsWrap.querySelectorAll("[data-chip-flujo]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const f = btn.getAttribute("data-chip-flujo");
        if (!S.fHabil.flujos) S.fHabil.flujos = new Set();
        if (S.fHabil.flujos.has(f)) {
          S.fHabil.flujos.delete(f);
          if (_habilFlujoMs?.clear) _habilFlujoMs.clear();
        } else {
          S.fHabil.flujos.clear();
          S.fHabil.flujos.add(f);
          if (_habilFlujoMs?.setSelected) _habilFlujoMs.setSelected(new Set([f]));
        }
        renderHabil();
      });
    });

    // Input inline para agregar nuevo flujo
    const inputNuevo = chipsWrap.querySelector("#habilNuevoFlujoInput");
    const btnNuevo   = chipsWrap.querySelector("#habilNuevoFlujoBtn");

    if (inputNuevo && btnNuevo) {
      const doAdd = async () => {
        const nombre = inputNuevo.value.trim();
        if (!nombre) { inputNuevo.focus(); return; }
        if ((S.flujos || []).some(f => String(f.flujo || f).trim().toLowerCase() === nombre.toLowerCase())) {
          setErr(`Ya existe un flujo con ese nombre. Elegí otro.`);
          return;
        }
        setErr("");

        // ── Optimistic: agregar a S.flujos y S.habil inmediatamente ──
        const nuevoFlujoObj = { flujo: nombre, perfiles_requeridos: 0, channel_id: "" };
        S.flujos = [...(S.flujos || []), nuevoFlujoObj];
        if (S.habil) {
          S.habil = {
            ...S.habil,
            flujos: [...(S.habil.flujos || []), nombre],
            rows: (S.habil.rows || []).map(r => ({
              ...r,
              [`H_${nombre}`]: false,
              [`F_${nombre}`]: false,
            })),
          };
        }
        CACHE.invalidate("flujos");
        CACHE.invalidate("habil");

        // Limpiar input y re-render inmediato
        inputNuevo.value = "";
        renderFlujos();
        renderHabil();

        // Scroll al chip nuevo
        requestAnimationFrame(() => {
          const newChip = chipsWrap.querySelector(`[data-chip-flujo="${CSS.escape(nombre)}"]`);
          if (newChip) newChip.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });

        // Feedback en botón — indica que está guardando en GAS
        btnNuevo.disabled = true;
        btnNuevo.textContent = "✓";
        btnNuevo.style.color = "var(--ok-txt)";
        inputNuevo.disabled = true;

        try {
          // Guardar en GAS
          await API.flujosUpsert(nombre, 0, "");

          // Confirmar con datos reales — GAS ya tiene cache invalidado
          const [fl, hab] = await Promise.all([
            API.flujosList(),
            API.habilitacionesList(),
          ]);
          if (fl)  { S.flujos = fl;  CACHE.set("flujos", fl,  2  * 60_000); }
          if (hab) { S.habil  = hab; CACHE.set("habil",  hab, 10 * 60_000); }

          renderFlujos();
          renderHabil();
          toast("Asignaciones", `✓ Flujo "${nombre}" creado. Habilitá colaboradores desde la tabla.`);
        } catch (e) {
          // Revertir optimistic si GAS falla
          S.flujos = (S.flujos || []).filter(f => String(f.flujo || f).trim() !== nombre);
          if (S.habil?.flujos) {
            S.habil = {
              ...S.habil,
              flujos: S.habil.flujos.filter(f => f !== nombre),
              rows: (S.habil.rows || []).map(r => {
                const clean = { ...r };
                delete clean[`H_${nombre}`];
                delete clean[`F_${nombre}`];
                return clean;
              }),
            };
          }
          renderFlujos();
          renderHabil();
          setErr("No se pudo crear el flujo. Intentá de nuevo.");
        } finally {
          btnNuevo.disabled = false;
          btnNuevo.textContent = "+";
          btnNuevo.style.color = "";
          inputNuevo.disabled = false;
        }
      };

      if (!btnNuevo._bound) {
        btnNuevo._bound = true;
        btnNuevo.addEventListener("click", doAdd);
        inputNuevo.addEventListener("keydown", e => {
          if (e.key === "Enter") { e.preventDefault(); doAdd(); }
          if (e.key === "Escape") { inputNuevo.value = ""; inputNuevo.blur(); }
        });
      }
    }
  }

  // Header: select-all + colaborador + columnas de flujos con tooltip
  head.innerHTML = `
    <tr>
      <th style="width:32px;padding:4px 8px">
        <input type="checkbox" id="habilSelectAll" title="Seleccionar todos" />
      </th>
      <th style="min-width:220px">Colaborador</th>
      ${flujos.map((f) => `
        <th class="nowrap" style="text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.05em">
          ${escapeHtml(f)}
          <div style="display:flex;gap:6px;justify-content:center;margin-top:5px">
            <span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:var(--ok-txt);opacity:.8"
              title="Habilitado — indica si la persona puede operar este flujo">HAB.</span>
            <span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:var(--pri);opacity:.8"
              title="Fijo — la asignación no varía día a día">FIJO</span>
          </div>
        </th>`).join("")}
    </tr>
  `;

  const colabsById = new Map();
  for (const c of S.colabs || []) {
    const v = colabRowView(c);
    if (v.id) colabsById.set(v.id, v);
  }

  const rows = (S.habil.rows || []).map((r) => {
    const id = r.id_meli || r.ID_MELI || r.Id_Meli;
    const meta = colabsById.get(id) || { id, nombre: id, rol: "", equipo: "" };
    return { ...r, _meta: meta };
  });

  const filtered = rows.filter((r) => {
    const rolRaw = String(r._meta.rol || "").trim();
    if (S.fHabil.roles.size > 0 && !S.fHabil.roles.has(rolRaw)) return false;
    if (S.fHabil.equipos.size > 0 && !S.fHabil.equipos.has(r._meta.equipo)) return false;
    // Filtro por flujo: muestra solo quienes tienen H=true para ese flujo
    if (S.fHabil.flujos.size > 0) {
      const tieneAlguno = [...S.fHabil.flujos].some(f => r[`H_${f}`]);
      if (!tieneAlguno) return false;
    }
    const q = norm(S.fHabil.q);
    if (q) {
      const hay =
        norm(r._meta.id).includes(q) ||
        norm(r._meta.nombre).includes(q) ||
        norm(r._meta.rol).includes(q) ||
        norm(r._meta.equipo).includes(q);
      if (!hay) return false;
    }
    return true;
  });

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="${2 + flujos.length}" class="muted" style="text-align:center;padding:20px">
      No se encontraron colaboradores con ese filtro.
    </td></tr>`;
    _syncHabilBulkBar_();
    return;
  }

  // Conservar selección entre re-renders
  const prevSel = S._habilSel || new Set();

  body.innerHTML = filtered
    .map((r) => {
      const id = r.id_meli;
      const label = `${r._meta.nombre || id} (${id})`;
      const sel = prevSel.has(id);
      const cells = flujos
        .map((f) => {
          const hab  = !!r[`H_${f}`];
          const fijo = !!r[`F_${f}`];
          return `
            <td style="text-align:center;padding:6px 8px">
              <div style="display:inline-flex;gap:6px;align-items:center">
                <button type="button"
                  data-h="1" data-id="${escapeAttr(id)}" data-flujo="${escapeAttr(f)}"
                  title="${hab ? "Habilitado — click para deshabilitar" : "No habilitado — click para habilitar"}"
                  style="width:26px;height:26px;border-radius:50%;border:2px solid ${hab ? "var(--ok)" : "var(--brd-2)"};
                    background:${hab ? "var(--ok-dim)" : "transparent"};
                    color:${hab ? "var(--ok-txt)" : "var(--text-3)"};
                    cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;
                    transition:all .15s;flex-shrink:0"
                  aria-pressed="${hab}">●</button>
                <button type="button"
                  data-f="1" data-id="${escapeAttr(id)}" data-flujo="${escapeAttr(f)}"
                  title="${fijo ? "Fijo — click para desfijar" : hab ? "No fijo — click para fijar" : "Habilitá primero para poder fijar"}"
                  style="width:26px;height:26px;border-radius:50%;border:2px solid ${fijo ? "var(--pri)" : "var(--brd)"};
                    background:${fijo ? "var(--pri-dim)" : "transparent"};
                    color:${fijo ? "var(--pri)" : hab ? "var(--text-3)" : "var(--text-3)"};
                    cursor:${hab ? "pointer" : "default"};font-size:12px;display:flex;align-items:center;justify-content:center;
                    transition:all .15s;flex-shrink:0;opacity:${hab ? "1" : "0.3"}"
                  aria-pressed="${fijo}" ${!hab ? "disabled" : ""}>📌</button>
              </div>
            </td>
          `;
        })
        .join("");

      return `<tr data-habil-id="${escapeAttr(id)}" ${sel ? 'class="habil-selected"' : ""}>
        <td style="width:32px;padding:4px 8px">
          <input type="checkbox" class="habil-sel-cb" data-sel-id="${escapeAttr(id)}" ${sel ? "checked" : ""} />
        </td>
        <td>${escapeHtml(label)}</td>${cells}</tr>`;
    })
    .join("");

  // ── Select-all ──────────────────────────────────────────────
  const saChk = $("habilSelectAll");
  if (saChk) {
    saChk.checked = filtered.length > 0 && filtered.every(r => prevSel.has(r.id_meli));
    saChk.indeterminate = !saChk.checked && filtered.some(r => prevSel.has(r.id_meli));
    saChk.addEventListener("change", () => {
      if (saChk.checked) filtered.forEach(r => S._habilSel.add(r.id_meli));
      else filtered.forEach(r => S._habilSel.delete(r.id_meli));
      renderHabil();
    });
  }

  // ── Checkboxes de selección de fila ────────────────────────
  body.querySelectorAll(".habil-sel-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.getAttribute("data-sel-id");
      if (cb.checked) S._habilSel.add(id);
      else S._habilSel.delete(id);
      const tr = cb.closest("tr");
      if (tr) tr.classList.toggle("habil-selected", cb.checked);
      _syncHabilBulkBar_();
      // Actualizar estado del select-all
      if (saChk) {
        saChk.checked = filtered.every(r => S._habilSel.has(r.id_meli));
        saChk.indeterminate = !saChk.checked && filtered.some(r => S._habilSel.has(r.id_meli));
      }
    });
  });

  // ── Listeners de H y F individuales ────────────────────────
  // Listeners para botones ícono ● (hab) y 📌 (fijo)
  body.querySelectorAll("button[data-h]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idMeli  = btn.getAttribute("data-id");
      const flujo   = btn.getAttribute("data-flujo");
      const wasHab  = btn.getAttribute("aria-pressed") === "true";
      const habilitado = !wasHab;
      const fijoBtn = body.querySelector(`button[data-f][data-id="${cssEsc(idMeli)}"][data-flujo="${cssEsc(flujo)}"]`);
      const fijo    = fijoBtn ? fijoBtn.getAttribute("aria-pressed") === "true" : false;
      // Feedback visual inmediato
      btn.style.borderColor  = habilitado ? "var(--ok)"    : "var(--brd-2)";
      btn.style.background   = habilitado ? "var(--ok-dim)": "transparent";
      btn.style.color        = habilitado ? "var(--ok-txt)": "var(--text-3)";
      btn.setAttribute("aria-pressed", habilitado);
      if (!habilitado && fijoBtn) {
        fijoBtn.setAttribute("aria-pressed", "false");
        fijoBtn.style.borderColor = "var(--brd)";
        fijoBtn.style.background  = "transparent";
        fijoBtn.style.opacity     = "0.3";
        fijoBtn.disabled = true;
      } else if (habilitado && fijoBtn) {
        fijoBtn.style.opacity = "1";
        fijoBtn.disabled = false;
      }
      await setHabilitacion(idMeli, flujo, habilitado, habilitado ? fijo : false);
    });
  });

  body.querySelectorAll("button[data-f]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      const idMeli  = btn.getAttribute("data-id");
      const flujo   = btn.getAttribute("data-flujo");
      const wasFijo = btn.getAttribute("aria-pressed") === "true";
      const fijo    = !wasFijo;
      const habBtn  = body.querySelector(`button[data-h][data-id="${cssEsc(idMeli)}"][data-flujo="${cssEsc(flujo)}"]`);
      // Si se fija pero no estaba habilitado, habilitar automáticamente
      if (fijo && habBtn && habBtn.getAttribute("aria-pressed") !== "true") {
        habBtn.setAttribute("aria-pressed", "true");
        habBtn.style.borderColor = "var(--ok)";
        habBtn.style.background  = "var(--ok-dim)";
        habBtn.style.color       = "var(--ok-txt)";
      }
      // Feedback visual inmediato
      btn.style.borderColor = fijo ? "var(--pri)"  : "var(--brd)";
      btn.style.background  = fijo ? "var(--pri-dim)" : "transparent";
      btn.style.color       = fijo ? "var(--pri)"  : "var(--text-3)";
      btn.setAttribute("aria-pressed", fijo);
      await setHabilitacion(idMeli, flujo, true, fijo);
    });
  });

  _syncHabilBulkBar_();
}

// Actualiza la barra de acciones masivas según S._habilSel
function _syncHabilBulkBar_() {
  const bar = $("habilBulkBar");
  const countEl = $("habilBulkCount");
  const n = (S._habilSel || new Set()).size;
  if (bar) bar.style.display = n > 0 ? "" : "none";
  if (countEl) countEl.innerHTML = `<b>${n} seleccionado${n !== 1 ? "s" : ""}</b>`;
}

async function setHabilitacion(idMeli, flujo, habilitado, fijo) {
  setErr("");
  // Optimistic update: modificar S.habil local sin recargar la lista completa
  if (S.habil?.rows) {
    const r = S.habil.rows.find(x => (x.id_meli || x.ID_MELI || x.Id_Meli) === idMeli);
    if (r) { r[`H_${flujo}`] = !!habilitado; r[`F_${flujo}`] = !!fijo; }
  }
  try {
    await API.habilitacionesSet(idMeli, flujo, !!habilitado, !!fijo);
    CACHE.invalidate("habil");
    toast("Asignaciones", "✓ Cambio guardado");
    // Actualizar chips de resumen sin re-render completo
    const chipsWrap = $("habilResumenChips");
    if (chipsWrap && S.habil?.flujos) renderHabil();
  } catch (e) {
    setErr(`Habilitaciones: ${e.message || e}`);
    // Revertir: recargar desde el servidor
    S.habil = await API.habilitacionesList().catch(() => S.habil);
    renderHabil();
  }
}

/* ========= Presentismo ========= */
function mountPresentismoSelect() {
  const sel = $("presSelectColab");
  if (!sel) return;

  const rows = (S.colabs || [])
    .map(colabRowView)
    .filter((x) => x.id)
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

  sel.innerHTML = rows.map((x) => `<option value="${escapeAttr(x.id)}">${escapeHtml(x.nombre)} (${escapeHtml(x.id)})</option>`).join("");
}

/* ========= Presentismo: mapeo de impacto de código =========
 * Lista canónica de códigos que cuentan como "Presente parcial".
 * Agregar acá si se incorporan nuevos tipos de licencia parcial.
 */
const PRES_PARTIAL_CODES = new Set(["TM/TR", "TM", "TR", "CJ"]); // TM y TR pueden venir solos o combinados

/**
 * Dado un código de celda de Presentismo, devuelve su impacto.
 * Fuente única de verdad — usada por renderPresentismo, renderDashboard
 * y countAnalistasDisponiblesHoy_ para garantizar consistencia.
 */
function presImpactFromCode_(code) {
  const v = (code || "").toString().trim();
  if (!v)                         return { impact: "Presente",         cls: "ok",   label: "Sin carga" };
  if (v === "P")                  return { impact: "Presente",         cls: "ok",   label: "Presente" };
  if (PRES_PARTIAL_CODES.has(v))  return { impact: "Presente parcial", cls: "warn", label: "Presente parcial" };
  return                                 { impact: "Ausente",           cls: "bad",  label: "Ausente" };
}

function renderPresentismo() {
  const tbl = $("tblPresWeek");
  if (!tbl) return;

  if (!S.presWeek || !S.presWeek.days || !S.presWeek.rows) {
    tbl.querySelector("thead").innerHTML = `<tr><th>Estado</th></tr>`;
    tbl.querySelector("tbody").innerHTML = `<tr><td class="muted">No se pudo cargar.</td></tr>`;
    return;
  }

  // ---- helpers (local, to avoid global collisions) ----
  // Delegamos a la función global presImpactFromCode_ para consistencia en todo el app
  const impactFromCode = presImpactFromCode_;

  const worstImpactOfWeek = (vals, days) => {
    // Order: Ausente (0) -> Presente parcial (1) -> Presente (2)
    let k = 2; // assume ok
    for (const d of days) {
      const v = vals && vals[d.key] ? String(vals[d.key]) : "";
      const imp = impactFromCode(v);
      if (imp.cls === "bad") return 0;
      if (imp.cls === "warn") k = Math.min(k, 1);
    }
    return k;
  };

  const groupLabelFromKey = (k) => (k === 0 ? "Ausente" : k === 1 ? "Presente parcial" : "Presente");
  const groupClsFromKey = (k) => (k === 0 ? "bad" : k === 1 ? "warn" : "ok");

  const days = S.presWeek.days; // includes isFeriado
  const rows = S.presWeek.rows;

  // "Hoy" (formato YYYY-MM-DD) para resaltar la columna cuando cae dentro de la semana visible
  const todayKey = todayYMD();

  const colabsById = new Map((S.colabs || []).map((c) => {
    const v = colabRowView(c);
    return [String(v.id || "").trim(), v];
  }));

  const filtered = rows.filter((r) => {
    const meta = colabsById.get(r.id_meli) || { id: r.id_meli, nombre: r.nombre, rol: "", equipo: "" };
    const rb = roleBucket(meta.rol);
    const rolRawPres = String(meta.rol || "").trim();

    if (S.fPres.roles.size > 0 && !S.fPres.roles.has(rolRawPres)) return false;
    if (S.fPres.equipos.size > 0 && !S.fPres.equipos.has(meta.equipo)) return false;

    const q = norm(S.fPres.q);
    if (q) {
      const hay =
        norm(meta.id).includes(q) ||
        norm(meta.nombre).includes(q) ||
        norm(meta.rol).includes(q) ||
        norm(meta.equipo).includes(q);
      if (!hay) return false;
    }
    return true;
  });

  // sort (solo por colaborador por ahora)
  const sp = S.sort.pres || { key: "nombre", dir: 1 };
  filtered.sort((a, b) => {
    const am = colabsById.get(a.id_meli) || { nombre: a.nombre || a.id_meli };
    const bm = colabsById.get(b.id_meli) || { nombre: b.nombre || b.id_meli };
    return sp.dir * String(am.nombre || "").localeCompare(String(bm.nombre || ""));
  });

  const thead = tbl.querySelector("thead");
  thead.innerHTML = `
    <tr>
      <th class="sortable" data-sort="nombre" style="min-width:240px">Colaborador<span class="srt" data-srt="nombre"></span></th>
      ${days
        .map((d) => `<th class="nowrap ${d.isFeriado ? "feriado" : ""} ${d.key === todayKey ? "todaycol" : ""}">${fmtDateDMY(d.key)}</th>`)
        .join("")}
    </tr>
  `;

  mountTableSort_("tblPresWeek", S.sort.pres, (next) => { S.sort.pres = next; renderPresentismo(); });

  const tbody = tbl.querySelector("tbody");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${1 + days.length}" class="muted">Sin resultados.</td></tr>`;
    return;
  }

  // Checkbox en UI (Presentismo): "Agrupar por estado / impacto"
  const group = $("presGroupImpact") ? $("presGroupImpact").checked : false;

  const sorted = filtered.slice().sort((a, b) => {
    const ma = colabsById.get(a.id_meli) || {};
    const mb = colabsById.get(b.id_meli) || {};
    const nameA = (ma.nombre || a.nombre || "").toString().toLowerCase();
    const nameB = (mb.nombre || b.nombre || "").toString().toLowerCase();

    if (!group) return nameA.localeCompare(nameB);

    // group by WORST impact in the selected week (not "hoy")
    const ga = worstImpactOfWeek(a.vals, days);
    const gb = worstImpactOfWeek(b.vals, days);
    if (ga !== gb) return ga - gb;
    return nameA.localeCompare(nameB);
  });

  const parts = [];
  let lastGroupKey = null;

  for (const r of sorted) {
    const meta = colabsById.get(r.id_meli) || { id: r.id_meli, nombre: r.nombre, rol: "", equipo: "" };
    const label = `${meta.nombre || r.nombre} (${r.id_meli})`;

    const gKey = worstImpactOfWeek(r.vals, days);
    if (group && gKey !== lastGroupKey) {
      lastGroupKey = gKey;
      const gLabel = groupLabelFromKey(gKey);
      const gCls = groupClsFromKey(gKey);
      parts.push(
        `<tr class="pres-group-row"><td colspan="${1 + days.length}" class="${gCls}" style="font-weight:700; text-transform:none;">${escapeHtml(gLabel)}</td></tr>`
      );
    }

    const tds = days.map((d) => {
      const v = (r.vals && r.vals[d.key]) ? String(r.vals[d.key]) : "";
      const base = d.isFeriado ? "feriado" : "";
      const todayCls = d.key === todayKey ? "todaycol" : "";
      const imp = impactFromCode(v);
      // "prescell" asegura estilo consistente en todas las celdas con estado (incluye "P").
      const prescell = v && v.trim() ? "prescell" : "";
      const c2 = [base, todayCls, prescell, imp.cls].filter(Boolean).join(" ");
      return `<td class="${c2}" title="${escapeHtml(imp.label)}">${escapeHtml(v)}</td>`;
    }).join("");

    parts.push(`<tr><td>${escapeHtml(label)}</td>${tds}</tr>`);
  }

  tbody.innerHTML = parts.join("");

  const note = $("presLegendNote");
  if (note) note.textContent = group ? "Ordenado por impacto (semana) → nombre" : "Ordenado por nombre";
}

async function onSetLicencia() {
  setErr("");
  try {
    setBusy("Presentismo", "Guardando licencia...");
    const idMeli = $("presSelectColab").value;
    const tipo = $("presTipo").value;
    const desde = $("presDesde").value;
    const hasta = $("presHasta").value || desde;

    if (!idMeli) throw new Error("Seleccioná un colaborador.");
    if (!desde) throw new Error("Seleccioná fecha Desde.");

    await API.presentismoSetLicencia(idMeli, desde, hasta, tipo);
    await refreshPresentismo();
    renderPresentismo();
    renderDashboard();
    toast("Presentismo", "Licencia guardada");
  } catch (e) {
    setErr(`Presentismo: ${e.message || e}`);
  } finally {
    clearBusy();
  }
}

/* ========= Dashboard ========= */
function countAnalistasDisponiblesHoy_() {
  // usa presWeek (hoy) para no inventar
  if (!S.presWeek?.days?.length || !S.presWeek?.rows?.length) return 0;

  const today = todayYMD();
  const colabsById = new Map((S.colabs || []).map((c) => {
    const v = colabRowView(c);
    return [String(v.id || "").trim(), v];
  }));

  let n = 0;
  for (const r of S.presWeek.rows) {
    const v = String(r.vals?.[today] || "").trim();
    // Cuenta P (Presente) y códigos de Presente parcial (TM/TR, CJ, etc.)
    const imp = presImpactFromCode_(v);
    if (imp.cls === "bad") continue; // Ausente: no cuenta

    const meta = colabsById.get(r.id_meli);
    const bucket = roleBucket(meta?.rol || "");
    if (bucket === "Líderes") continue;
    n++;
  }
  return n;
}

function renderDashboard() {
  const kpi = $("dashKpis");
  const tb = $("tblDashRoles")?.querySelector("tbody");
  if (!kpi || !tb) return;

  const colabs = (S.colabs || []).map(colabRowView).filter((x) => x.id);
  const total = colabs.length;

  const normRole = (r) => String(r || "").trim() || "Sin rol";
  const counts = new Map();
  for (const c of colabs) counts.set(normRole(c.rol), (counts.get(normRole(c.rol)) || 0) + 1);

  // Mapa canónico: código Presentismo → { label, cls }
  const LICENCIA_DISPLAY = {
    "V":     { label: "Vacaciones",          cls: "bad"  },
    "M":     { label: "Licencia médica",     cls: "bad"  },
    "E":     { label: "Estudio",             cls: "bad"  },
    "TP":    { label: "Trám. prematrim.",    cls: "bad"  },
    "N":     { label: "Nacimiento",          cls: "bad"  },
    "MUD":   { label: "Mudanza",             cls: "bad"  },
    "MAT":   { label: "Maternidad",          cls: "bad"  },
    "MATR":  { label: "Matrimonio",          cls: "bad"  },
    "DUELO": { label: "Duelo familiar",      cls: "bad"  },
    "CF":    { label: "Cuidado familiar",    cls: "bad"  },
    "DS":    { label: "Donación de sangre",  cls: "bad"  },
    "MHM":   { label: "Enf. hijo menor",     cls: "bad"  },
    "TM/TR": { label: "Turno médico",        cls: "warn" },
    "CJ":    { label: "Cit. judicial",       cls: "warn" },
  };

  // presentes por rol + recolección de ausentes/parciales con nombre y rol
  const presentesPorRol = new Map();
  // ausentesPorCodigo: { codigo → [{ nombre, rolCorto }] }
  const ausentesPorCodigo = {};

  if (S.presWeek?.rows?.length) {
    const today = todayYMD();
    // Normalizar IDs con trim para evitar mismatches por espacios en el sheet
    const colabsById = new Map((S.colabs || []).map((c) => {
      const v = colabRowView(c);
      return [String(v.id || "").trim(), v];
    }));
    for (const r of S.presWeek.rows) {
      const vday = String(r.vals?.[today] || "").trim();
      const imp = presImpactFromCode_(vday);
      const idNorm = String(r.id_meli || "").trim();
      const meta = colabsById.get(idNorm);
      const role = normRole(meta?.rol || "");

      if ((imp.cls === "ok" || imp.cls === "warn") && role !== "Sin rol") {
        presentesPorRol.set(role, (presentesPorRol.get(role) || 0) + 1);
      }

      // Cards de ausencias: incluir ausentes (bad) Y parciales (warn = TM/TR, CJ)
      if ((imp.cls === "bad" || imp.cls === "warn") && vday && LICENCIA_DISPLAY[vday]) {
        const bucket = roleBucket(meta?.rol || "");
        const rolCorto = bucket === "Analista PM" ? "PM"
          : bucket === "Analista KV" ? "KV"
          : bucket === "Analista QA" ? "QA"
          : bucket === "Líderes" ? "TL" : bucket;
        if (!ausentesPorCodigo[vday]) ausentesPorCodigo[vday] = [];
        ausentesPorCodigo[vday].push({
          nombre: meta?.nombre || r.id_meli || r.nombre || "",
          rolCorto,
        });
      }
    }
  }

  // tabla de roles
  let rowsRoles = Array.from(counts.keys())
    .map((rol) => ({ rol, nomina: counts.get(rol) || 0, presentes: presentesPorRol.get(rol) || 0 }))
    .filter((r) => r.nomina > 0);
  const ss = S.sort?.dashRoles || { key: "nomina", dir: -1 };
  rowsRoles.sort((a, b) => {
    const va = a[ss.key || "rol"], vb = b[ss.key || "rol"];
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * (ss.dir || 1);
    return String(va).localeCompare(String(vb)) * (ss.dir || 1);
  });

  const pres = S.presStats?.presentes ?? 0;
  const analistasHoy = countAnalistasDisponiblesHoy_();
  const flujosActivos = (S.flujos || []).filter((f) => Number(f.perfiles_requeridos ?? f.cantidad ?? 0) >= 1).length;
  const slackPendientes = (S.outbox || []).filter((r) => !String(r.estado || "").toUpperCase().includes("ENVIADO") && !String(r.estado || "").toUpperCase().includes("PROGRAMADO")).length;

  const pct = total > 0 ? pres / total : 0;
  const statusCls = pct >= 0.85 ? "ok" : pct >= 0.65 ? "warn" : "bad";
  const statusLabel = pct >= 0.85 ? "Equipo operativo" : pct >= 0.65 ? "Capacidad reducida" : "Atención requerida";
  const statusEmoji = pct >= 0.85 ? "🟢" : pct >= 0.65 ? "🟡" : "🔴";

  // Cards de ausencias/parciales: una por tipo, solo si hay al menos 1 persona
  const absenceCards = Object.entries(ausentesPorCodigo)
    .sort(([a], [b]) => {
      // Ausentes (bad) primero, parciales (warn) después
      const ca = LICENCIA_DISPLAY[a]?.cls === "bad" ? 0 : 1;
      const cb = LICENCIA_DISPLAY[b]?.cls === "bad" ? 0 : 1;
      return ca - cb || a.localeCompare(b);
    })
    .map(([codigo, personas]) => {
      const { label, cls } = LICENCIA_DISPLAY[codigo] || { label: codigo, cls: "bad" };
      const n = personas.length;
      const titulo = `${n} ${n === 1 ? "analista" : "analistas"} · ${label}`;
      // Lista de personas: "Nombre (ROL)"
      const lista = personas
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map(p => `<div style="font-size:11px;margin-top:3px;opacity:0.85">${escapeHtml(p.nombre || "—")} <span class="muted">(${escapeHtml(p.rolCorto)})</span></div>`)
        .join("");
      return `<div class="kpi kpi-absence ${cls}" style="min-width:140px;text-align:left;padding:10px 12px">
        <div style="font-size:12px;font-weight:700;margin-bottom:4px">${escapeHtml(titulo)}</div>
        ${lista}
      </div>`;
    })
    .join("");

  kpi.innerHTML = `
    <div class="dash-status pill ${statusCls}" style="width:100%;margin-bottom:14px;padding:12px 16px;font-size:14px;border-radius:12px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px">${statusEmoji}</span>
      <span><b>${statusLabel}</b> — ${pres} de ${total} presentes hoy · ${flujosActivos} flujo${flujosActivos !== 1 ? "s" : ""} activo${flujosActivos !== 1 ? "s" : ""}${slackPendientes > 0 ? ` · <span style="color:var(--warn)">${slackPendientes} mensaje${slackPendientes !== 1 ? "s" : ""} pendiente${slackPendientes !== 1 ? "s" : ""} Slack</span>` : ""}</span>
    </div>
    <div class="kpi kpi-agenda" id="kpiAgenda" title="Ir a Agenda">
      <div class="v" style="font-size:22px" id="kpiAgendaNum">—</div>
      <div class="l" id="kpiAgendaLabel">Agenda</div>
    </div>
    <div class="kpi"><div class="v">${total}</div><div class="l">En nómina</div></div>
    <div class="kpi"><div class="v">${pres}</div><div class="l">Presentes hoy</div></div>
    <div class="kpi"><div class="v">${analistasHoy}</div><div class="l">Analistas disponibles</div></div>
    <div class="kpi"><div class="v">${flujosActivos}</div><div class="l">Flujos activos</div></div>
    ${absenceCards ? `<div style="width:100%;margin-top:10px;display:flex;flex-wrap:wrap;gap:8px">${absenceCards}</div>` : ""}
  `;

  tb.innerHTML = rowsRoles.map((r) => `<tr><td>${escapeHtml(r.rol)}</td><td class="right">${r.nomina}</td><td class="right">${r.presentes}</td></tr>`).join("");

  // Actualizar card de Agenda
  _updateKpiAgenda_();
}


/* ========= Agenda KPI card ========= */
function _updateKpiAgenda_() {
  const numEl   = $("kpiAgendaNum");
  const labelEl = $("kpiAgendaLabel");
  const card    = $("kpiAgenda");
  if (!numEl || !labelEl) return;

  const pending = (S.agenda || []).filter(r =>
    r.estado !== "Hecho" && r.estado !== "Bloqueado"
  ).length;

  numEl.textContent = pending;

  if (pending === 0) {
    labelEl.textContent = "Agenda al día ✓";
    // Sin pendientes: deshabilitar visualmente
    if (card) {
      card.style.cursor = "default";
      card.style.opacity = "0.55";
      card.style.pointerEvents = "none";
      card._agClickBound = false; // reset para si vuelven a haber pendientes
    }
  } else {
    labelEl.textContent = pending === 1 ? "Tema en agenda" : "Temas en agenda";
    // Con pendientes: habilitar y clickeable
    if (card) {
      card.style.cursor = "pointer";
      card.style.opacity = "1";
      card.style.pointerEvents = "";
    }
    // Registrar click una sola vez, reemplazar si ya existía
    if (card && !card._agClickBound) {
      card._agClickBound = true;
      card.addEventListener("click", () => {
        // 1. Navegar al tab Agenda
        document.querySelector('[data-tab="agenda"]')?.click();
        // 2. Scroll a la sección de pendientes
        setTimeout(() => {
          const pend = $("agendaPendSection");
          if (pend) pend.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150); // esperar que el tab se active y renderice
      });
    }
  }
}

/* ========= Generar planificación (también genera outbox) ========= */

/* ========= Copiar mensaje planificación ========= */

function buildMensajePlanificacion_() {
  const plan = (S.plan || []).filter((r) => r?.flujo && r?.id_meli && r.id_meli !== "SIN PERFILES DISPONIBLES");
  if (!plan.length) return null;

  // Día de la semana en español
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const hoy = new Date();
  const diaNombre = DIAS[hoy.getDay()];

  // Total de colaboradores activos hoy (presentes + parciales, excluyendo líderes)
  const totalActivos = countAnalistasDisponiblesHoy_();

  // Asignados por flujo (de S.plan)
  const porFlujo = {};
  for (const r of plan) {
    const f = String(r.flujo || "").trim();
    if (!f) continue;
    porFlujo[f] = (porFlujo[f] || 0) + 1;
  }
  const flujosSorted = Object.keys(porFlujo).sort((a, b) => a.localeCompare(b));

  // Ausentes hoy con su tipo de licencia y rol
  // Cruza S.presWeek (valores de hoy) con S.colabs (para el rol)
  const today = todayYMD();
  const ausentesInfo = [];
  if (S.presWeek?.rows?.length) {
    const colabsById = new Map((S.colabs || []).map((c) => {
      const v = colabRowView(c);
      return [v.id, v];
    }));
    for (const r of S.presWeek.rows) {
      const v = String(r.vals?.[today] || "").trim();
      const imp = presImpactFromCode_(v);
      if (imp.cls !== "bad") continue; // solo ausentes reales
      if (!v) continue; // sin carga no cuenta como ausente

      const meta = colabsById.get(r.id_meli);
      const bucket = roleBucket(meta?.rol || "");
      if (bucket === "Líderes") continue; // excluir líderes

      ausentesInfo.push({ codigo: v, rol: bucket });
    }
  }

  // Agrupar ausentes por código de licencia
  // Mapeo de código → etiqueta legible
  const LICENCIA_LABEL = {
    "V": "vacaciones", "M": "licencia médica", "E": "estudio",
    "TP": "trámites prematrimoniales", "N": "nacimiento", "MUD": "mudanza",
    "MAT": "maternidad", "MATR": "matrimonio", "DUELO": "fallecimiento familiar",
    "CF": "cuidado de familiar", "DS": "donación de sangre",
    "TM/TR": "turno médico", "CJ": "citación judicial", "MHM": "enf. hijo menor",
  };

  // Agrupar por tipo de licencia y rol
  const ausentesPorTipo = {};
  for (const { codigo, rol } of ausentesInfo) {
    const label = LICENCIA_LABEL[codigo] || codigo;
    const rolCorto = rol === "Analista PM" ? "PM" : rol === "Analista KV" ? "KV" : rol === "Analista QA" ? "QA" : rol;
    const key = `${label}|${rolCorto}`;
    ausentesPorTipo[key] = (ausentesPorTipo[key] || 0) + 1;
  }

  // Construir líneas de notas de ausentes
  const notaLineas = Object.entries(ausentesPorTipo).map(([key, count]) => {
    const [label, rol] = key.split("|");
    const txt = count === 1
      ? `*1* colab de ${label} (${rol})`
      : `*${count}* colabs de ${label} (${rol})`;
    return txt;
  });

  // Armar el mensaje completo
  // Las * * son para Slack bold
  let msg = `Hola equipo, buen ${diaNombre}!
`;
  msg += `Hoy tenemos *${totalActivos} colaboradores activos*
`;
  for (const f of flujosSorted) {
    msg += `• *${porFlujo[f]}* en ${f}
`;
  }
  if (notaLineas.length) {
    msg += `Nota:
`;
    for (const linea of notaLineas) {
      msg += `• ${linea}
`;
    }
  }

  return msg.trim();
}

async function onCopiarMensajePlan_() {
  const msg = buildMensajePlanificacion_();
  if (!msg) {
    setErr("Primero generá la planificación del día.");
    return;
  }
  try {
    await navigator.clipboard.writeText(msg);
    toast("✓ Copiado", "Mensaje listo para pegar en Slack", "ok");
  } catch (e) {
    // Fallback para entornos sin clipboard API
    const ta = document.createElement("textarea");
    ta.value = msg;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast("✓ Copiado", "Mensaje listo para pegar en Slack", "ok");
  }
}


/* ========= Agenda del equipo ========= */


// ── Markdown renderer (descripción agenda) ──────────────────
function renderMarkdown_(text) {
  if (!text) return "";
  let html = escapeHtml(text);
  // Negrita ** **
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Cursiva * *
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Subrayado __ __
  html = html.replace(/__(.+?)__/g, "<u>$1</u>");
  // Viñetas: líneas que empiezan con - 
  html = html.replace(/(^|&lt;br&gt;)- (.+?)(?=&lt;br&gt;|$)/g, "$1<li>$2</li>");
  // Listas numeradas: 1. 2.
  html = html.replace(/(^|&lt;br&gt;)\d+\. (.+?)(?=&lt;br&gt;|$)/g, "$1<li>$2</li>");
  // Saltos de línea (escapeHtml no toca \n)
  html = html.replace(/\n/g, "<br>");
  return html;
}

// ── Descripción + links helpers ─────────────────────────────
// Formato en Sheets: "texto libre\nURL1\nURL2"
// Separar texto de URLs
function parseDescLinks_(raw) {
  const parts = String(raw || "").split("\n");
  const urls = [], lines = [];
  for (const p of parts) {
    const t = p.trim();
    if (/^https?:\/\//.test(t)) urls.push(t);
    else if (t) lines.push(t);
  }
  return { text: lines.join("\n"), urls };
}
// Unir texto y URLs de vuelta al formato de Sheets
function joinDescLinks_(text, urls) {
  const parts = [text.trim(), ...urls.filter(Boolean)].filter(Boolean);
  return parts.join("\n");
}

const AGENDA_PRIO_EMOJI = { "Urgente": "🔴", "Importante": "🟡", "Normal": "🔵" };
const AGENDA_TIEMPO_OPTS = ["5", "10", "15", "20", "30", "45", "Si sobra tiempo"];
const AGENDA_OWNERS = ["Cele", "Eze", "Jose", "Mati L.", "Mati M.", "Vicky"];
const AGENDA_ESTADOS = ["Para hacer", "En progreso", "En espera", "Bloqueado", "Hecho"];
const AGENDA_ESTADO_CLS = {
  "Para hacer": "ag-todo",
  "En progreso": "ag-wip",
  "En espera":   "ag-wait",
  "Bloqueado":   "ag-blocked",
  "Hecho":       "ag-done",
  // Legacy
  "Pendiente":   "ag-todo",
  "":            "ag-todo",
};

// Convierte texto con URLs en HTML con links clickeables
function linkify_(text) {
  if (!text) return "";
  const escaped = escapeHtml(text);
  return escaped.replace(
    /https?:\/\/[^\s<>"]+/g,
    url => `<a href="${url}" target="_blank" rel="noopener" style="color:var(--pri);word-break:break-all">${url}</a>`
  );
}



// ══════════════════════════════════════════════════════════════
// WYSIWYG Editor helpers
// ══════════════════════════════════════════════════════════════

// Markdown → HTML (para mostrar en el editor contenteditable)
function mdToHtml_(md) {
  if (!md) return "";
  let h = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\*(.+?)\*/g, "<em>$1</em>");
  h = h.replace(/__(.+?)__/g, "<u>$1</u>");
  // Listas al final para no interferir con otros patrones
  h = h.replace(/^- (.+)$/gm, "<li>$1</li>");
  h = h.replace(/^\d+\. (.+)$/gm, "<li data-ol>$1</li>");
  h = h.replace(/(<li[^>]*>.*<\/li>\n?)+/gs, m => {
    const isOl = m.includes("data-ol");
    const tag = isOl ? "ol" : "ul";
    return `<${tag} style="margin:2px 0 2px 16px;padding:0">${m.replace(/ data-ol/g, "")}</${tag}>`;
  });
  h = h.replace(/\n/g, "<br>");
  return h;
}

// HTML (contenteditable) → Markdown (para guardar en Sheets)
function htmlToMd_(html) {
  if (!html) return "";
  let md = html;
  // Listas
  md = md.replace(/<li>(.*?)<\/li>/gi, (_, c) => "- " + c + "\n");
  md = md.replace(/<\/?[uo]l[^>]*>/gi, "");
  // Formato
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<u>(.*?)<\/u>/gi, "__$1__");
  // Saltos de línea
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<div>/gi, "\n").replace(/<\/div>/gi, "");
  md = md.replace(/<p>/gi, "\n").replace(/<\/p>/gi, "\n");
  // Limpiar tags restantes y entidades HTML
  md = md.replace(/<[^>]+>/g, "");
  md = md.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
  // Limpiar líneas vacías múltiples
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  return md;
}

// Montar editor WYSIWYG sobre un div contenteditable
function mountWysiwyg_(editorId, toolbarId, emojiId) {
  const editor = $(editorId);
  const toolbar = $(toolbarId);
  const emojiBtn = $(emojiId);
  if (!editor) return;

  // Auto-resize
  const resize = () => {
    editor.style.minHeight = "48px";
  };
  editor.addEventListener("input", resize);
  resize();

  // Formato con execCommand
  const fmt = (cmd, val) => {
    editor.focus();
    document.execCommand(cmd, false, val || null);
  };

  // Auto-convertir marcadores Markdown mientras se escribe
  // Detecta ** ** → bold, * * → italic, __ __ → underline, - → lista
  editor.addEventListener("keyup", (e) => {
    // Solo procesar en ciertos caracteres que cierran un marcador
    if (!["*", "_", " ", "Enter"].includes(e.key)) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent;
    const offset = range.startOffset;
    const lineText = text.slice(0, offset);

    // ** negrita **
    const boldM = lineText.match(/\*\*(.+?)\*\*$/);
    if (boldM) {
      const full = boldM[0];
      const inner = boldM[1];
      const start = offset - full.length;
      const r2 = range.cloneRange();
      r2.setStart(node, start);
      r2.setEnd(node, offset);
      r2.deleteContents();
      document.execCommand("bold", false, null);
      document.execCommand("insertText", false, inner);
      document.execCommand("bold", false, null);
      return;
    }
    // * cursiva * (no doble)
    const italicM = lineText.match(/(?<!\*)\*([^*]+?)\*$/);
    if (italicM) {
      const full = italicM[0];
      const inner = italicM[1];
      const start = offset - full.length;
      const r2 = range.cloneRange();
      r2.setStart(node, start);
      r2.setEnd(node, offset);
      r2.deleteContents();
      document.execCommand("italic", false, null);
      document.execCommand("insertText", false, inner);
      document.execCommand("italic", false, null);
      return;
    }
    // __ subrayado __
    const ulM = lineText.match(/__(.+?)__$/);
    if (ulM) {
      const full = ulM[0];
      const inner = ulM[1];
      const start = offset - full.length;
      const r2 = range.cloneRange();
      r2.setStart(node, start);
      r2.setEnd(node, offset);
      r2.deleteContents();
      document.execCommand("underline", false, null);
      document.execCommand("insertText", false, inner);
      document.execCommand("underline", false, null);
      return;
    }
  });

  // Convertir "- " al inicio de línea en viñeta al presionar espacio
  editor.addEventListener("keydown", (e) => {
    if (e.key !== " " && e.key !== "Enter") return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const lineText = node.textContent.slice(0, range.startOffset);
    // "- " → lista al presionar espacio
    if (e.key === " " && lineText === "-") {
      e.preventDefault();
      document.execCommand("insertUnorderedList", false, null);
      return;
    }
    // "1. " → lista numerada al presionar espacio
    if (e.key === " " && /^\d+\.$/.test(lineText)) {
      e.preventDefault();
      document.execCommand("insertOrderedList", false, null);
      return;
    }
  });

  if (toolbar) {
    toolbar.querySelectorAll("[data-cmd]").forEach(btn => {
      btn.addEventListener("mousedown", e => {
        e.preventDefault();
        const cmd = btn.getAttribute("data-cmd");
        if (cmd === "insertUnorderedList") fmt("insertUnorderedList");
        else if (cmd === "insertOrderedList") fmt("insertOrderedList");
        else fmt(cmd);
      });
    });
  }

  // Emoji picker
  // Emoji picker unificado — usa los mismos grupos del picker de Slack
  const AGENDA_EMOJI_GROUPS = [
    { k: "frecuentes", items: ["👍","👎","✅","❌","⚠️","🔴","🟡","🟢","🔵","⭐","🎯","🚀","💡","📌","🔔","⏰","📝","💬","👀","❓","❗"] },
    { k: "urgencia",   items: ["🚨","‼️","🔥","🚩","📢","👆","👇","👉","🆘","⏱️"] },
    { k: "estado",     items: ["☑️","✔️","✖️","⛔️","🛑","🚫","🔄","⏳","⌛️","⚪️","⚫️"] },
    { k: "operativo",  items: ["📊","📈","📉","🗂️","⚙️","🛠️","🔧","📦","🏷️","🔗","🔍","🧩","📎","✍️"] },
    { k: "personas",   items: ["👤","👥","🤝","👋","🙋‍♂️","🙋‍♀️","🧑‍💻","🙌","🙏","🤔","💪","🎉"] },
    { k: "fechas",     items: ["📅","🗓️","📆","🕘","🔜","🔚"] },
  ];
  const ALL_AGENDA_EMOJIS = AGENDA_EMOJI_GROUPS.flatMap(g => g.items);

  if (emojiBtn) {
    const picker = document.createElement("div");
    picker.style.cssText = "position:fixed;background:var(--surface);border:1px solid var(--brd-2);border-radius:8px;padding:10px;display:none;z-index:9999;box-shadow:var(--shd-lg);width:290px;max-height:320px;overflow-y:auto";

    const renderPicker = (q) => {
      const items = q ? ALL_AGENDA_EMOJIS.filter(e => e.includes(q)) : ALL_AGENDA_EMOJIS;
      picker.innerHTML = `
        <input id="_agEmojiSearch" placeholder="Buscar emoji..." style="width:100%;padding:5px 8px;border:1px solid var(--brd-2);border-radius:6px;background:var(--surface-2);color:var(--text-1);font-size:12px;margin-bottom:8px;box-sizing:border-box"/>
        <div style="display:flex;flex-wrap:wrap;gap:3px">
          ${items.map(e => `<button type="button" data-emo="${e}" style="font-size:20px;padding:4px;border:none;background:none;cursor:pointer;border-radius:4px;line-height:1" title="${e}">${e}</button>`).join("")}
        </div>
      `;
      picker.querySelector("#_agEmojiSearch")?.addEventListener("input", (ev) => renderPicker(ev.target.value));
      picker.querySelectorAll("[data-emo]").forEach(b => {
        b.addEventListener("mousedown", (ev) => ev.preventDefault()); // no perder foco
        b.addEventListener("click", () => {
          // Restaurar posición del cursor guardada antes de abrir el picker
          if (editor._savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(editor._savedRange);
            editor._savedRange = null;
          } else {
            editor.focus();
          }
          document.execCommand("insertText", false, b.getAttribute("data-emo"));
          picker.style.display = "none";
        });
      });
    };

    renderPicker("");
    document.body.appendChild(picker);

    emojiBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (picker.style.display !== "none") { picker.style.display = "none"; return; }
      // Guardar posición del cursor antes de abrir el picker
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        editor._savedRange = sel.getRangeAt(0).cloneRange();
      }
      const rect = emojiBtn.getBoundingClientRect();
      picker.style.top  = (rect.bottom + 4) + "px";
      picker.style.left = Math.min(rect.left, window.innerWidth - 300) + "px";
      picker.style.display = "block";
      renderPicker("");
      setTimeout(() => picker.querySelector("#_agEmojiSearch")?.focus(), 50);
    });
    document.addEventListener("click", (e) => {
      if (!picker.contains(e.target) && e.target !== emojiBtn) picker.style.display = "none";
    });
  }

  return {
    getValue: () => htmlToMd_(editor.innerHTML),
    setValue: (md) => { editor.innerHTML = mdToHtml_(md); resize(); },
    clear: () => { editor.innerHTML = ""; resize(); },
  };
}

// Instancia global del editor del formulario de nueva entrada
let _agDescEditor_ = null;
let _agendaAddInProgress_ = false; // previene doble-add por doble click

// ── Editor Markdown toolbar ──────────────────────────────────
function applyMdFormat_(ta, cmd) {
  if (!ta) return;
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.slice(start, end);
  const before = ta.value.slice(0, start);
  const after  = ta.value.slice(end);

  const wrap = (b, a, ph) => {
    const s = sel || ph;
    ta.value = before + b + s + a + after;
    ta.focus();
    ta.selectionStart = start + b.length;
    ta.selectionEnd   = start + b.length + s.length;
    ta.dispatchEvent(new Event("input"));
  };

  const insertPrefix = (prefix) => {
    const lineStart = before.lastIndexOf("\n") + 1;
    const lineContent = ta.value.slice(lineStart);
    if (lineContent.startsWith(prefix)) {
      ta.value = ta.value.slice(0, lineStart) + lineContent.slice(prefix.length);
    } else {
      ta.value = ta.value.slice(0, lineStart) + prefix + lineContent;
    }
    ta.focus();
    ta.dispatchEvent(new Event("input"));
  };

  if (cmd === "bold")      wrap("**", "**", "negrita");
  if (cmd === "italic")    wrap("*", "*", "cursiva");
  if (cmd === "underline") wrap("__", "__", "subrayado");
  if (cmd === "ul")        insertPrefix("- ");
  if (cmd === "ol")        insertPrefix("1. ");
}

function autoResizeTextarea_(ta) {
  if (!ta) return;
  ta.style.height = "auto";
  ta.style.height = Math.max(48, ta.scrollHeight) + "px";
}


// ── Agenda auto-refresh ──────────────────────────────────────
let _agendaRefreshTimer_ = null;

function _startAgendaAutoRefresh_() {
  _stopAgendaAutoRefresh_();
  _agendaRefreshTimer_ = setInterval(async () => {
    try {
      const fresh = await API.agendaList();
      if (!fresh) return;
      const oldPend = (S.agenda || []).filter(r => r.estado !== "Hecho").length;
      const newPend = fresh.filter(r => r.estado !== "Hecho").length;
      S.agenda = fresh;
      CACHE.set("agenda", fresh, 5 * 60_000);

      // Siempre actualizar badge y card — no dependen del DOM del formulario
      _updateAgendaBadge_();
      _updateKpiAgenda_();

      // Si el formulario tiene contenido, NO re-renderizar para no perder lo que escribe el usuario
      const formBody  = $("agFormBody");
      const temaVal   = $("agTema")?.value?.trim();
      const descVal   = $("agDesc")?.innerText?.trim();
      const formOpen  = formBody && formBody.style.display !== "none";
      const formDirty = !!(temaVal || descVal);

      if (formOpen && formDirty) {
        // Solo notificar si hubo cambios de otros usuarios, sin tocar el DOM
        if (newPend !== oldPend) {
          toast("Agenda", newPend > oldPend
            ? "🔔 +" + (newPend - oldPend) + " tema nuevo de otro usuario"
            : "🔔 Agenda actualizada por otro usuario");
        }
        return; // No re-renderizar
      }

      // Formulario vacío o cerrado: re-render normal
      renderAgenda();
      if (newPend !== oldPend) {
        toast("Agenda", newPend > oldPend
          ? "+" + (newPend - oldPend) + " tema" + (newPend - oldPend > 1 ? "s nuevos" : " nuevo")
          : "Agenda actualizada");
      }
    } catch (_) {}
  }, 60_000);
}

function _stopAgendaAutoRefresh_() {
  if (_agendaRefreshTimer_) { clearInterval(_agendaRefreshTimer_); _agendaRefreshTimer_ = null; }
}

function _updateAgendaBadge_() {
  const pending = (S.agenda || []).filter(r => r.estado !== "Hecho" && r.estado !== "Bloqueado").length;
  const tab = document.querySelector('[data-tab="agenda"]');
  if (!tab) return;
  tab.querySelector(".agenda-badge")?.remove();
  if (pending > 0) {
    const badge = document.createElement("span");
    badge.className = "agenda-badge";
    badge.textContent = pending;
    badge.style.cssText = "background:var(--pri);color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 5px;margin-left:5px;vertical-align:middle";
    tab.appendChild(badge);
  }
}


function mountAgendaOwnerMs_(wrapId) {
  const host2 = $(wrapId);
  if (!host2) return;
  const btn2   = host2.querySelector(".ms-btn");
  const panel2 = host2.querySelector(".ms-panel");
  const val2   = host2.querySelector("[data-ms-value]");
  const cbs    = host2.querySelectorAll("input[type=checkbox]");
  const bClr   = host2.querySelector("[data-ms-clear]");

  // Sincronizar el label del botón con las checkboxes seleccionadas
  const syncVal = () => {
    const checked = Array.from(cbs).filter(c => c.checked && c.value !== "Todos").map(c => c.value);
    val2.textContent = checked.length ? checked.join(", ") : "Todos";
  };

  cbs.forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.value === "Todos") {
        cbs.forEach(c => { if (c.value !== "Todos") c.checked = false; });
      } else {
        const todoCb = Array.from(cbs).find(c => c.value === "Todos");
        if (todoCb) todoCb.checked = false;
      }
      syncVal();
    });
  });

  bClr?.addEventListener("click", () => {
    cbs.forEach(c => { c.checked = c.value === "Todos"; });
    syncVal();
  });

  // Calcular posición del panel relativa a la ventana (position:fixed)
  // para escapar del overflow:hidden de la tabla
  const posPanel = () => {
    const r = btn2.getBoundingClientRect();
    const panelH = Math.min(220, window.innerHeight - r.bottom - 8);
    const top = r.bottom + 4;
    const left = Math.min(r.left, window.innerWidth - 190);
    Object.assign(panel2.style, {
      position: "fixed",
      top: top + "px",
      left: left + "px",
      width: Math.max(180, r.width) + "px",
      maxHeight: panelH + "px",
      zIndex: "9999",
      display: "block",
    });
  };

  const closePanel = () => {
    panel2.style.display = "none";
    host2.classList.remove("open");
  };

  btn2?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel2.style.display === "block") {
      closePanel();
    } else {
      // Cerrar cualquier otro panel abierto
      document.querySelectorAll("[data-agenda-panel-open]").forEach(p => {
        p.style.display = "none";
        p.removeAttribute("data-agenda-panel-open");
      });
      panel2.setAttribute("data-agenda-panel-open", "1");
      posPanel();
    }
  });

  // Clicks dentro del panel no cierran
  panel2?.addEventListener("click", (e) => e.stopPropagation());

  // Un solo listener global por instancia — guardado en el elemento para no duplicar
  if (!host2._agendaMsListener) {
    host2._agendaMsListener = (e) => {
      if (!host2.contains(e.target)) closePanel();
    };
    document.addEventListener("click", host2._agendaMsListener);
  }
}


function readOwnerFromMs(wrapId) {
  const wrap = $(wrapId + "_wrap");
  if (!wrap) return "Todos";
  const checked = Array.from(wrap.querySelectorAll("input[type=checkbox]:checked"))
    .filter(c => c.value !== "Todos").map(c => c.value);
  return checked.length ? checked.join(", ") : "Todos";
}

function renderAgenda() {
  const host = $("agendaContent");
  if (!host) return;

  // Deduplicar por row (evita duplicados por optimistic + re-fetch simultáneos)
  const seen = new Set();
  const items = (S.agenda || []).filter(r => {
    const key = String(r.row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const HISTORIAL_ESTADOS = new Set(["Hecho", "Bloqueado"]);
  const pendientes = items.filter(r => !HISTORIAL_ESTADOS.has(r.estado));
  const historial  = items.filter(r =>  HISTORIAL_ESTADOS.has(r.estado));

  // Orden: prioridad → fecha descendente (más reciente arriba)
  const priOrd = { "Urgente": 0, "Importante": 1 };
  pendientes.sort((a, b) => {
    const pa = priOrd[a.prioridad] ?? 2, pb = priOrd[b.prioridad] ?? 2;
    if (pa !== pb) return pa - pb;
    // fecha desc: más reciente arriba
    return String(b.fecha).localeCompare(String(a.fecha));
  });

  // ── Owner multiselect helper ─────────────────────────────
  // Construye el dropdown de owners con checkboxes + "Todos"
  const ownerSelectHtml = (selectedVal, idPrefix) => {
    const sel = String(selectedVal || "");
    const selected = sel === "Todos" || sel === "All" ? [] : sel.split(",").map(s => s.trim()).filter(Boolean);
    return `
      <div class="ms" id="${idPrefix}_wrap" style="min-width:130px;position:relative;overflow:visible">
        <div class="ms-btn">
          <div>
            <div class="value" data-ms-value style="font-size:13px">${escapeHtml(sel || "Todos")}</div>
          </div>
          <div class="muted">▾</div>
        </div>
        <div class="ms-panel">
          <div data-ms-list>
            <label class="ms-item"><input type="checkbox" value="Todos" ${!selected.length ? "checked" : ""}/><div>Todos</div></label>
            ${AGENDA_OWNERS.map(o => `<label class="ms-item"><input type="checkbox" value="${escapeAttr(o)}" ${selected.includes(o) ? "checked" : ""}/><div>${escapeHtml(o)}</div></label>`).join("")}
          </div>
          <div class="ms-actions"><button class="btn ghost" type="button" data-ms-clear>Limpiar</button></div>
        </div>
      </div>`;
  };

  // ── Fila editable (pendientes) ───────────────────────────
  const rowHtmlEditable = (r) => {
    const estadoNorm = (!r.estado || r.estado === "Pendiente") ? "Para hacer" : r.estado;
    const estadoCls  = AGENDA_ESTADO_CLS[estadoNorm] || "ok";
    const prioEmoji  = AGENDA_PRIO_EMOJI[r.prioridad] || "🔵";
    const ownerShort = r.owner ? String(r.owner).split(",")[0].trim().split(" ")[0] : "—";
    const tiempoShort = r.tiempo ? (r.tiempo === "Si sobra tiempo" ? "Si sobra" : r.tiempo + " min") : "—";
    const tiempoOpts = AGENDA_TIEMPO_OPTS.map(o =>
      `<option value="${escapeAttr(o)}" ${r.tiempo === o ? "selected" : ""}>${escapeHtml(o)}${o !== "Si sobra tiempo" ? " min" : ""}</option>`
    ).join("");
    const prioOpts = ["Urgente","Importante","Normal"].map(p =>
      `<option value="${p}" ${r.prioridad === p ? "selected" : ""}>${AGENDA_PRIO_EMOJI[p]} ${p}</option>`
    ).join("");
    const hasDesc = !!(parseDescLinks_(r.descripcion).text);
    const hasLinks = parseDescLinks_(r.descripcion).urls.length > 0;

    return `
      <div class="ag-card" data-agenda-row="${r.row}"
        style="border:1px solid var(--brd);border-radius:10px;margin-bottom:6px;background:var(--surface-2);overflow:hidden;transition:border-color .15s">

        <!-- MODO LECTURA: siempre visible, click expande -->
        <div class="ag-row-summary" data-ag-toggle="${r.row}"
          style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;user-select:none">
          <span style="font-size:17px;flex-shrink:0">${prioEmoji}</span>
          <span style="flex:1;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.tema)}</span>
          <span class="pill ${estadoCls}" data-ag-estado-pill="${r.row}"
            style="cursor:pointer;font-size:11px;padding:2px 9px;flex-shrink:0;white-space:nowrap" title="Cambiar estado">
            ${escapeHtml(estadoNorm)}
          </span>
          <span style="font-size:11px;color:var(--text-3);flex-shrink:0;white-space:nowrap">${escapeHtml(ownerShort)}</span>
          <span style="font-size:11px;color:var(--text-3);flex-shrink:0;white-space:nowrap">${escapeHtml(tiempoShort)}</span>
          ${hasDesc || hasLinks ? `<span style="font-size:10px;color:var(--text-3)" title="Tiene descripción">📝</span>` : ""}
          <span class="ag-expand-icon" style="font-size:11px;color:var(--text-3);flex-shrink:0">▸</span>
        </div>

        <!-- Dropdown estado (position:fixed) -->
        <div style="position:relative;display:inline-block" data-estado-wrap="${r.row}">
          <input type="hidden" data-ag-estado value="${escapeAttr(estadoNorm)}"/>
          <div data-estado-menu="${r.row}"
            style="display:none;position:fixed;background:var(--surface);border:1px solid var(--brd-2);border-radius:8px;box-shadow:var(--shd-lg);z-index:9999;min-width:150px;padding:4px 0">
            ${AGENDA_ESTADOS.map(e => `
              <div data-estado-opt="${escapeAttr(e)}" data-estado-for="${r.row}"
                style="padding:7px 14px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:8px"
                onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
                <span class="pill ${AGENDA_ESTADO_CLS[e] || "ok"}" style="font-size:10px;padding:2px 8px">${escapeHtml(e)}</span>
              </div>`).join("")}
          </div>
        </div>

        <!-- MODO EDICIÓN: se muestra al expandir -->
        <div class="ag-row-detail" data-ag-detail="${r.row}" style="display:none;padding:0 14px 14px;border-top:1px solid var(--brd)">

          <!-- Controles uniformes -->
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0 10px">
            <select class="ag-ctrl" data-ag-prio title="Prioridad" style="width:auto">
              ${prioOpts}
            </select>
            <input class="ag-ctrl" data-ag-fecha type="date" value="${escapeAttr(_fechaToISO_(r.fecha))}" style="width:140px"/>
            <div style="min-width:150px;max-width:200px">${ownerSelectHtml(r.owner, "ag_owner_" + r.row)}</div>
            <select class="ag-ctrl" data-ag-tiempo style="width:auto">${tiempoOpts}</select>
            <div style="flex:1"></div>
            <span class="ag-save-status" data-save-status="${r.row}" style="font-size:10px;color:var(--text-3)"></span>
            <button class="xbtn" data-ag-del="${r.row}" title="Eliminar">×</button>
          </div>

          <!-- Tema -->
          <input class="input" data-ag-tema value="${escapeAttr(r.tema)}"
            style="font-size:13px;font-weight:500;width:100%;margin-bottom:8px;box-sizing:border-box"/>

          <!-- Descripción WYSIWYG -->
          <div class="input wysiwyg-editor" data-ag-desc contenteditable="true"
            style="font-size:12px;width:100%;min-height:36px;font-family:inherit;line-height:1.6;padding:8px;box-sizing:border-box;cursor:text"
            data-placeholder="Descripción...">${mdToHtml_(parseDescLinks_(r.descripcion).text)}</div>

          <!-- Links -->
          <div data-ag-links-wrap
            style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:28px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--input-bg,var(--card2));margin-top:6px">
            ${parseDescLinks_(r.descripcion).urls.map(u => `<span class="pill" style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px" data-link-pill="${escapeAttr(u)}"><a href="${escapeAttr(u)}" target="_blank" rel="noopener" style="color:var(--pri);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(u.replace(/^https?:\/\//, "").slice(0,40))}${u.length > 43 ? "…" : ""}</a><span style="opacity:0.5;font-size:10px" data-rm-link="${escapeAttr(u)}">×</span></span>`).join("")}
            <input class="input" data-ag-link-input placeholder="https://..." style="border:none;background:transparent;outline:none;flex:1;min-width:120px;padding:0;font-size:11px"/>
          </div>
        </div>

      </div>`;
  };

  // ── Fila solo lectura (historial) ────────────────────────
  const rowHtmlReadOnly = (r) => {
    const emoji = AGENDA_PRIO_EMOJI[r.prioridad] || "🔵";
    const desc = linkify_(r.descripcion);
    return `
      <tr data-agenda-row="${r.row}">
        <td style="text-align:center;font-size:16px;padding:4px 8px">${emoji}</td>
        <td class="nowrap">${escapeHtml(r.fecha)}</td>
        <td>${escapeHtml(r.owner)}</td>
        <td>
          <span style="opacity:0.7">${escapeHtml(r.tema)}</span>
          ${(function() {
            const { text, urls } = parseDescLinks_(r.descripcion);
            const textHtml = text ? `<div style="font-size:11px;margin-top:2px;opacity:0.6;line-height:1.5">${renderMarkdown_(text)}</div>` : "";
            const linksHtml = urls.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px">${urls.map(u => `<a href="${escapeAttr(u)}" target="_blank" rel="noopener" class="pill" style="font-size:10px;color:var(--pri);text-decoration:none;opacity:0.8">${escapeHtml(u.replace(/^https?:\/\//, "").slice(0,40))}${u.length > 43 ? "…" : ""}</a>`).join("")}</div>` : "";
            return textHtml + linksHtml;
          })()}
        </td>
        <td class="nowrap">${escapeHtml(r.tiempo ? r.tiempo + (r.tiempo !== "Si sobra tiempo" ? " min" : "") : "—")}</td>
        <td class="nowrap" style="white-space:nowrap">
          <div style="display:flex;gap:4px">
            <button class="btn ghost" data-ag-edit-hist="${r.row}" style="font-size:11px;padding:2px 6px" title="Editar">✏️</button>
            <button class="xbtn" data-ag-del="${r.row}" title="Eliminar">×</button>
          </div>
        </td>
      </tr>`;
  };

  const pendientesHtml = pendientes.length
    ? `<div style="margin-top:10px">${pendientes.map(r => rowHtmlEditable(r)).join("")}</div>`
    : `<div class="muted" style="margin-top:12px;padding:12px">Sin pendientes. ¡Todo al día! 🎉</div>`;

  const histBtnLabel = S.agendaHistCollapsed ? `▶ Ver historial (${historial.length})` : `▼ Ocultar historial`;
  const histThead = `<thead><tr>
    <th style="width:36px"></th><th style="width:90px">Fecha</th>
    <th style="width:120px">Owner</th><th>Tema</th>
    <th style="width:80px">Tiempo</th><th style="width:80px"></th>
  </tr></thead>`;
  const histContent  = S.agendaHistCollapsed ? "" : `
    <div style="overflow-x:auto"><table class="table" style="margin-top:8px">
      ${histThead}<tbody>${historial.map(r => rowHtmlReadOnly(r)).join("")}</tbody>
    </table></div>`;

  // Formulario está en HTML estático — solo renderizar pendientes e historial
  host.innerHTML = `
    <div id="agendaPendSection" class="row" style="align-items:center;justify-content:space-between;margin-bottom:4px">
      <div class="pill"><b>${pendientes.length}</b> pendiente${pendientes.length !== 1 ? "s" : ""}</div>
      <div style="display:flex;gap:8px">
        <button class="btn ghost" id="btnAgendaCopiar" type="button">Copiar agenda</button>
      </div>
    </div>
    ${pendientesHtml}
    <div class="hr" style="margin-top:16px"></div>
    <div class="row" style="align-items:center;justify-content:space-between;margin:8px 0">
      <button class="btn ghost" id="btnAgendaHistToggle" type="button" style="font-size:12px">${histBtnLabel}</button>
    </div>
    <div id="agendaHistSection">${histContent}</div>
  `;

  // ── Activar multiselects de owner ────────────────────────
  // mountAgendaOwnerMs_ definida globalmente (ver abajo)


  // Montar ms del formulario nuevo
  // Formulario ya está en HTML estático — owner multiselect montado en wireUI
  // _agDescEditor_ ya montado en wireUI

  // mountLinkInput_ montado en wireUI

  // Montar ms, auto-resize y links de cada fila editable
  pendientes.forEach(r => {
    mountAgendaOwnerMs_("ag_owner_" + r.row + "_wrap");

    // Montar WYSIWYG en el div contenteditable de descripción de la card
    const descEl = host.querySelector('[data-agenda-row="' + r.row + '"] [data-ag-desc]');
    if (descEl) {
      // Conectar botones de toolbar inline a este editor
      const toolbarBtns = host.querySelectorAll(`[data-tb-row="${r.row}"]`);
      toolbarBtns.forEach(btn => {
        btn.addEventListener("mousedown", e => {
          e.preventDefault();
          const cmd = btn.getAttribute("data-md");
          descEl.focus();
          if (cmd === "bold")      document.execCommand("bold", false, null);
          if (cmd === "italic")    document.execCommand("italic", false, null);
          if (cmd === "underline") document.execCommand("underline", false, null);
          if (cmd === "ul")        document.execCommand("insertUnorderedList", false, null);
          if (cmd === "ol")        document.execCommand("insertOrderedList", false, null);
        });
      });
      // Auto-conversión de markdown al escribir
      descEl.addEventListener("keydown", e => {
        if (e.key === " " || e.key === "Enter") {
          const sel = window.getSelection();
          if (!sel.rangeCount) return;
          const range = sel.getRangeAt(0);
          const node = range.startContainer;
          if (node.nodeType !== Node.TEXT_NODE) return;
          const lineText = node.textContent.slice(0, range.startOffset);
          if (e.key === " " && lineText === "-") {
            e.preventDefault();
            document.execCommand("insertUnorderedList", false, null);
            return;
          }
          if (e.key === " " && /^\d+\.$/.test(lineText)) {
            e.preventDefault();
            document.execCommand("insertOrderedList", false, null);
          }
        }
      });
    }

    // Links píldoras en fila editable
    const wrap = host.querySelector(`tr[data-agenda-row="${r.row}"] [data-ag-links-wrap]`);
    const linkInp = wrap?.querySelector("[data-ag-link-input]");
    if (wrap && linkInp) {
      // Remover links existentes (× en cada píldora)
      wrap.querySelectorAll("[data-rm-link]").forEach(btn => {
        btn.addEventListener("click", () => btn.closest("[data-link-pill]")?.remove());
      });
      // Agregar nuevo link
      const addRowLink = () => {
        const url = linkInp.value.trim();
        if (!url || !/^https?:\/\//.test(url)) return;
        if (wrap.querySelector(`[data-link-pill="${CSS.escape(url)}"]`)) { linkInp.value = ""; return; }
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.setAttribute("data-link-pill", url);
        pill.style.cssText = "font-size:11px;display:flex;align-items:center;gap:4px";
        pill.innerHTML = `<a href="${url}" target="_blank" rel="noopener" style="color:var(--pri);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(url.replace(/^https?:\/\//, "").slice(0,40))}${url.length > 43 ? "…" : ""}</a><span style="opacity:0.5;font-size:10px;cursor:pointer" data-rm>×</span>`;
        pill.querySelector("[data-rm]").addEventListener("click", () => pill.remove());
        wrap.insertBefore(pill, linkInp);
        linkInp.value = "";
      };
      linkInp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addRowLink(); } });
      linkInp.addEventListener("paste", () => setTimeout(addRowLink, 50));
    }
  });

  // ── Helpers para leer owner del ms ──────────────────────
  // readOwnerFromMs es global — definida fuera de renderAgenda (ver arriba)

  // ── Botón agregar ────────────────────────────────────────
  // btnAgendaAgregar montado en wireUI

  // ── Botones guardar (edición inline) ────────────────────
  // ── Auto-save con debounce por fila ─────────────────────
  const buildPayload_ = (card, row) => {
    const owner    = readOwnerFromMs("ag_owner_" + row);
    const fechaISO = card.querySelector("[data-ag-fecha]")?.value || "";
    const fecha    = fechaISO ? fechaISO.split("-").reverse().join("/") : "";
    const agDescEl = card.querySelector("[data-ag-desc]");
    const descTxt  = agDescEl ? htmlToMd_(agDescEl.innerHTML).trim() : "";
    const rowLinks = Array.from(card.querySelectorAll("[data-ag-links-wrap] [data-link-pill]"))
      .map(el => el.getAttribute("data-link-pill")).filter(Boolean);
    return {
      row, fecha, owner,
      tema:        card.querySelector("[data-ag-tema]")?.value?.trim() || "",
      tiempo:      card.querySelector("[data-ag-tiempo]")?.value       || "",
      prioridad:   card.querySelector("[data-ag-prio]")?.value         || "",
      descripcion: joinDescLinks_(descTxt, rowLinks),
      estado:      card.querySelector("[data-ag-estado]")?.value       || "Para hacer",
    };
  };

  const saveRow_ = async (row, card) => {
    const statusEl = card.querySelector(`[data-save-status="${row}"]`);
    const payload  = buildPayload_(card, row);
    try {
      const idx = (S.agenda||[]).findIndex(r => r.row === row);
      if (idx >= 0) Object.assign(S.agenda[idx], {
        fecha: payload.fecha, owner: payload.owner, tema: payload.tema,
        tiempo: payload.tiempo, prioridad: payload.prioridad,
        descripcion: payload.descripcion, estado: payload.estado
      });
      // Mostrar "Guardando" solo si tarda más de 400ms
      const slowTimer = setTimeout(() => {
        if (statusEl) statusEl.textContent = "Guardando…";
      }, 400);
      await API.agendaUpdate(payload);
      clearTimeout(slowTimer);
      CACHE.invalidate("agenda");
      if (statusEl) {
        statusEl.textContent = "✓";
        setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 1500);
      }
      _updateAgendaBadge_();
      _updateKpiAgenda_();
    } catch (e) {
      if (statusEl) statusEl.textContent = "Error al guardar";
      setErr(`Agenda: ${e.message || e}`);
    }
  };

  // ── Pill de estado con dropdown (position:fixed) ────────
  host.querySelectorAll("[data-ag-estado-pill]").forEach(pill => {
    const rowId = Number(pill.getAttribute("data-ag-estado-pill"));
    const menu  = host.querySelector(`[data-estado-menu="${rowId}"]`);
    const hiddenInput = host.querySelector(`[data-estado-wrap="${rowId}"] [data-ag-estado]`);
    if (!menu) return;

    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      const r2 = pill.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r2.bottom - 8;
      if (spaceBelow < 200) {
        menu.style.bottom = (window.innerHeight - r2.top + 4) + "px";
        menu.style.top = "auto";
      } else {
        menu.style.top  = (r2.bottom + 4) + "px";
        menu.style.bottom = "auto";
      }
      menu.style.left = r2.left + "px";
      menu.style.display = menu.style.display === "none" ? "block" : "none";
    });
    menu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => { menu.style.display = "none"; });

    menu.querySelectorAll("[data-estado-opt]").forEach(opt => {
      opt.addEventListener("click", () => {
        const nuevoEstado = opt.getAttribute("data-estado-opt");
        menu.style.display = "none";
        // Patch optimista inmediato en S.agenda
        const idx = (S.agenda || []).findIndex(r => r.row === rowId);
        if (idx >= 0) S.agenda[idx].estado = nuevoEstado;
        CACHE.invalidate("agenda");
        // Renderizar inmediatamente — la tarjeta se mueve a historial si corresponde
        renderAgenda();
        // Guardar en GAS en background (sin bloquear UI)
        const card2 = host.querySelector(`[data-agenda-row="${rowId}"]`);
        if (card2) {
          const payload = buildPayload_(card2, rowId);
          payload.estado = nuevoEstado;
          API.agendaUpdate(payload).catch(e => setErr(`Agenda: ${e.message || e}`));
        } else {
          // La tarjeta ya no está en pendientes (se movió a historial) — guardar igual
          const item = (S.agenda || []).find(r => r.row === rowId);
          if (item) API.agendaUpdate({ row: rowId, estado: nuevoEstado }).catch(e => setErr(`Agenda: ${e.message || e}`));
        }
      });
    });
  });

  // Registrar auto-save en cada card
  pendientes.forEach(r => {
    const card = host.querySelector(`[data-agenda-row="${r.row}"]`);
    if (!card) return;
    const rowId = r.row;
    const autoSave = debounce(() => saveRow_(rowId, card), 2000);

    card.querySelectorAll("[data-ag-tema],[data-ag-tiempo],[data-ag-prio]").forEach(el => {
      el.addEventListener("input",  autoSave);
      el.addEventListener("change", autoSave);
    });
    card.querySelectorAll("[data-ag-fecha]").forEach(el => {
      el.addEventListener("change", autoSave);
    });
    const descEl = card.querySelector("[data-ag-desc]");
    if (descEl) descEl.addEventListener("input", autoSave);
    const ownerMs = host.querySelector(`#ag_owner_${rowId}_wrap`);
    if (ownerMs) ownerMs.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.addEventListener("change", autoSave);
    });
  });

  // ── Botones Hecho ────────────────────────────────────────
  host.querySelectorAll("[data-hecho]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await onAgendaSetHecho_(Number(btn.getAttribute("data-hecho")));
    });
  });

  // ── Botones eliminar (×) ─────────────────────────────────
  // Editar desde historial (abre fila editable inline)
  host.querySelectorAll("[data-ag-edit-hist]").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = Number(btn.getAttribute("data-ag-edit-hist"));
      const idx = (S.agenda || []).findIndex(r => r.row === row);
      if (idx < 0) return;
      // Mover al array de pendientes temporalmente para editar
      S.agenda[idx].estado = "Para hacer";
      S.agendaHistCollapsed = false;
      renderAgenda();
      // Scroll a la fila
      setTimeout(() => {
        const card2 = host.querySelector(`[data-agenda-row="${row}"]`);
        card2?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    });
  });

  host.querySelectorAll("[data-ag-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = Number(btn.getAttribute("data-ag-del"));
      if (!await hubConfirm_("¿Eliminás este tema de la agenda? No se puede recuperar.", "Sí, eliminar")) return;
      const idx = (S.agenda||[]).findIndex(r => r.row === row);
      if (idx >= 0) S.agenda.splice(idx, 1);
      CACHE.invalidate("agenda");
      renderAgenda();
      // Confirmar eliminación en GAS en background
      API.agendaDelete(row).catch(e => {
        setErr(`Agenda: ${e.message || e}`);
        // Si falla, recargar desde GAS
        API.agendaList().then(d => { if (d) { S.agenda = d; renderAgenda(); } }).catch(() => {});
      });
    });
  });

  // Delegación de eventos en host — sobrevive a renderAgenda() que recrea el DOM
  if (!host._agDelegated) {
    host._agDelegated = true;
    host.addEventListener("click", (e) => {
      // Toggle historial
      if (e.target.closest("#btnAgendaHistToggle")) {
        S.agendaHistCollapsed = !S.agendaHistCollapsed;
        renderAgenda();
        return;
      }
      // Copiar agenda
      if (e.target.closest("#btnAgendaCopiar")) {
        onAgendaCopiar_();
        return;
      }
      // btnAgFormToggle y btnAgendaAgregar manejados en wireUI (fuera del host)
    });
  }

  // Toggle expand/collapse de tarjetas
  host.querySelectorAll("[data-ag-toggle]").forEach(summary => {
    summary.addEventListener("click", (e) => {
      // Si el click fue en la pill de estado, no expandir la tarjeta
      if (e.target.closest("[data-ag-estado-pill]")) return;
      const rowId = summary.getAttribute("data-ag-toggle");
      const detail = host.querySelector(`[data-ag-detail="${rowId}"]`);
      const icon   = summary.querySelector(".ag-expand-icon");
      const card   = summary.closest(".ag-card");
      if (!detail) return;
      const isOpen = detail.style.display !== "none";
      detail.style.display = isOpen ? "none" : "block";
      if (icon) icon.textContent = isOpen ? "▸" : "▾";
      if (card) card.style.borderColor = isOpen ? "" : "var(--pri-brd)";
    });
  });

  // Siempre sincronizar badge y card con el estado actual
  _updateAgendaBadge_();
  _updateKpiAgenda_();
}

// Convierte "dd/MM/yyyy" → "yyyy-MM-dd" para input type=date
function _fechaToISO_(ddmmyyyy) {
  if (!ddmmyyyy) return "";
  // Si es objeto Date
  if (ddmmyyyy instanceof Date) return ddmmyyyy.toISOString().slice(0, 10);
  const s = String(ddmmyyyy).trim();
  // Ya en formato yyyy-MM-dd o ISO string
  const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoM) return `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
  // dd/MM/yyyy o dd-MM-yyyy
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return s;
}

async function onAgendaAgregar_(ownerParam) {
  if (_agendaAddInProgress_) return; // prevenir doble click
  _agendaAddInProgress_ = true;

  const fechaEl   = $("agFecha");
  const temaEl    = $("agTema");
  const tiempoEl  = $("agTiempo");
  const prioEl    = $("agPrioridad");

  const fecha     = fechaEl?.value || "";
  const owner     = ownerParam || "Todos";
  const tema      = temaEl?.value?.trim() || "";
  const tiempo    = tiempoEl?.value || "10";
  const prioridad = prioEl?.value || "Importante";
  const descText  = _agDescEditor_ ? _agDescEditor_.getValue() : ($("agDesc")?.innerText?.trim() || "");
  const linkPills = Array.from($("agLinksWrap")?.querySelectorAll("[data-link-pill]") || [])
    .map(el => el.getAttribute("data-link-pill")).filter(Boolean);
  const desc = joinDescLinks_(descText, linkPills);


  if (!tema) {
    if (temaEl) { temaEl.style.borderColor = "var(--err)"; temaEl.focus(); setTimeout(() => { temaEl.style.borderColor = ""; }, 2000); }
    setErr("El campo Tema es obligatorio.");
    _agendaAddInProgress_ = false;
    return;
  }
  setErr("");

  // Convertir fecha de yyyy-MM-dd a dd/MM/yyyy para GAS
  const fechaGAS = fecha
    ? fecha.split("-").reverse().join("/")
    : new Date().toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", year:"numeric" });

  const btnAgregar = $("btnAgendaAgregar");

  // Optimistic: mostrar item inmediatamente
  const tempRow = -Date.now();
  S.agenda = [{ row: tempRow, fecha, owner, tema, tiempo, prioridad,
    descripcion: desc, estado: "Para hacer" }, ...(S.agenda || [])];
  CACHE.invalidate("agenda");
  renderAgenda();

  // Feedback en botón
  if (btnAgregar) { btnAgregar.disabled = true; btnAgregar.textContent = "Guardando..."; }

  try {
    await API.agendaAdd({ fecha: fechaGAS, owner, tema, tiempo, prioridad, descripcion: desc });

    // Éxito — limpiar y cerrar formulario
    if ($("agTema")) $("agTema").value = "";
    if (_agDescEditor_) _agDescEditor_.clear();
    const linkWrap = $("agLinksWrap");
    if (linkWrap) linkWrap.querySelectorAll("[data-link-pill]").forEach(el => el.remove());
    const agFormBody = $("agFormBody");
    const agFormBtn  = $("btnAgFormToggle");
    if (agFormBody) agFormBody.style.display = "none";
    if (agFormBtn)  agFormBtn.textContent = "✚ Agregar tema";
    if (btnAgregar) { btnAgregar.disabled = false; btnAgregar.textContent = "Agregar"; }
    toast("Agenda", "✓ Tema agregado");
    _agendaAddInProgress_ = false;

    // Reemplazar tempRow con datos reales de Sheets
    API.agendaList().then(d => {
      if (d) { S.agenda = d; CACHE.set("agenda", d, 5 * 60_000); renderAgenda(); }
    }).catch(() => {});

  } catch (e) {
    if (btnAgregar) { btnAgregar.disabled = false; btnAgregar.textContent = "Agregar"; }
    const msg = String(e?.message || e);

    if (msg.includes("Non-JSON") || msg.includes("lock") || msg.includes("timeout")) {
      // GAS probablemente escribió la fila pero falló al responder
      // Limpiar y cerrar igual — el re-fetch traerá la fila real
      if ($("agTema")) $("agTema").value = "";
      if (_agDescEditor_) _agDescEditor_.clear();
      const agFormBody = $("agFormBody");
      const agFormBtn  = $("btnAgFormToggle");
      if (agFormBody) agFormBody.style.display = "none";
      if (agFormBtn)  agFormBtn.textContent = "✚ Agregar tema";
      toast("Agenda", "✓ Guardado");
      _agendaAddInProgress_ = false;
      // Re-fetch demorado para no competir con el lock
      setTimeout(() => {
        API.agendaList().then(d => {
          if (d) { S.agenda = d; CACHE.set("agenda", d, 5 * 60_000); renderAgenda(); }
        }).catch(() => {});
      }, 2000);
    } else {
      // Error real — revertir optimistic y reabrir formulario
      setErr("No se pudo guardar. Intentá de nuevo.");
      S.agenda = (S.agenda || []).filter(r => r.row !== tempRow);
      CACHE.invalidate("agenda");
      renderAgenda();
      const agFormBody2 = $("agFormBody");
      const agFormBtn2  = $("btnAgFormToggle");
      if (agFormBody2) agFormBody2.style.display = "block";
      if (agFormBtn2)  agFormBtn2.textContent = "✕ Cancelar";
      if ($("agTema")) $("agTema").value = tema;
      if (_agDescEditor_) _agDescEditor_.setValue(descText);
    }
  }
}

async function onAgendaSetHecho_(row, btn) {
  // Optimistic update
  const idx = (S.agenda || []).findIndex(r => r.row === row);
  if (idx >= 0) S.agenda[idx].estado = "Hecho";
  renderAgenda();
  try {
    await API.agendaSetHecho(row);
    CACHE.invalidate("agenda");
    // Sin re-fetch — patch optimista ya aplicado
    toast("Agenda", "✓ Marcado como hecho");
  } catch (e) {
    // Revertir si falla
    if (idx >= 0) S.agenda[idx].estado = "Pendiente";
    renderAgenda();
    setErr(`Agenda: ${e.message || e}`);
  }
}

function buildMensajeAgenda_() {
  const pendientes = (S.agenda || []).filter(r => r.estado !== "Hecho");
  if (!pendientes.length) return "Sin pendientes en la agenda. ¡Todo al día! 🎉";

  const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const hoy = new Date();
  const dia = DIAS[hoy.getDay()];

  let msg = `📋 Agenda del equipo · buen ${dia}!
`;
  const priOrd = { "Urgente": 0, "Importante": 1 };
  const sorted = pendientes.slice().sort((a,b) => (priOrd[a.prioridad]??2)-(priOrd[b.prioridad]??2));

  sorted.forEach(r => {
    const emoji = AGENDA_PRIO_EMOJI[r.prioridad] || "🔵";
    const tiempo = r.tiempo ? ` · ${r.tiempo}${r.tiempo !== "Si sobra tiempo" ? " min" : ""}` : "";
    const owner = r.owner && r.owner !== "All" ? ` (${r.owner})` : "";
    msg += `
${emoji} *${r.tema}*${owner}${tiempo}`;
    if (r.descripcion) msg += `
${r.descripcion}`;
  });

  return msg.trim();
}

async function onAgendaCopiar_() {
  const msg = buildMensajeAgenda_();
  try {
    await navigator.clipboard.writeText(msg);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = msg; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
  }
  toast("✓ Copiado", "Agenda lista para pegar en Slack");
}



async function onGenerarPlanificacionYOutbox_() {
  setErr("");
  try {
    setBusy("Operativa diaria", "Generando planificación...");
    $("dailyStatus").textContent = "Generando...";
    await API.planificacionGenerar();
    // Solo mensaje GENERAL (los POR_FLUJO se generan desde cada flujo)
    await API.slackOutboxGenerarGeneral();
    await refreshPlanAndOutbox();
    await refreshPresentismo();
    renderPlan();
    renderOutbox();
    renderDashboard();
    toast("OK", "Planificación + Outbox generados");
  } catch (e) {
    setErr(`Planificación/Outbox: ${e.message || e}`);
  } finally {
    ($("dailyStatus") && ($("dailyStatus").textContent = "Listo"));
    clearBusy();
  }
}

/* ========= Empty state helper ========= */
function emptyState_(message, icon = "📭", actionLabel = null, actionId = null) {
  const btn = actionLabel && actionId
    ? `<button class="btn primary" id="${escapeAttr(actionId)}" style="margin-top:12px">${escapeHtml(actionLabel)}</button>`
    : "";
  return `
    <div style="text-align:center;padding:40px 20px;color:var(--muted)">
      <div style="font-size:36px;margin-bottom:10px">${icon}</div>
      <div style="font-size:14px">${escapeHtml(message)}</div>
      ${btn}
    </div>`;
}

/* ========= Wire UI ========= */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll('"', "&quot;");
}
function unescapeAttr(s) {
  return String(s ?? "").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}
function cssEsc(s) { return String(s ?? "").replaceAll('"', '\\"'); }

async function main() {
  applyTheme();
  mountTabs();

  // Dashboard: sorting (roles)
  mountTableSort_("tblDashRoles", S.sort.dashRoles, (st) => { S.sort.dashRoles = st; renderDashboard(); });

  $("btnTheme")?.addEventListener("click", () => {
    S.theme = S.theme === "dark" ? "light" : "dark";
    applyTheme();
  });

  // Operativa
  $("btnGenerarPlan")?.addEventListener("click", onGenerarPlanificacionYOutbox_);
  $("btnCopiarPlan")?.addEventListener("click", onCopiarMensajePlan_);

  $("btnAddFlujo")?.addEventListener("click", async () => {
    const name = $("newFlujoName")?.value?.trim() || "";
    if (!name) return setErr("Escribí un nombre para el nuevo flujo.");
    if ((S.flujos || []).some(f => String(f.flujo || f).trim().toLowerCase() === name.toLowerCase())) {
      return setErr("Ya existe un flujo con ese nombre. Elegí otro.");
    }
    setErr("");

    // ── Optimistic: agregar inmediatamente ──
    const nuevoObj = { flujo: name, perfiles_requeridos: 0, channel_id: "" };
    S.flujos = [...(S.flujos || []), nuevoObj];
    if (S.habil) {
      S.habil = {
        ...S.habil,
        flujos: [...(S.habil.flujos || []), name],
        rows: (S.habil.rows || []).map(r => ({ ...r, [`H_${name}`]: false, [`F_${name}`]: false })),
      };
    }
    CACHE.invalidate("flujos");
    CACHE.invalidate("habil");
    $("newFlujoName").value = "";
    renderFlujos();

    // Scroll + foco en nueva fila
    requestAnimationFrame(() => {
      const tb = $("tblFlujos")?.querySelector("tbody");
      if (!tb) return;
      const newRow = Array.from(tb.querySelectorAll("tr")).find(tr => {
        const b = tr.querySelector("td b");
        return b && b.textContent.trim() === name;
      });
      if (newRow) {
        newRow.scrollIntoView({ behavior: "smooth", block: "center" });
        const inp = newRow.querySelector("[data-req]");
        if (inp) { inp.focus(); inp.select(); }
      }
    });

    try {
      ($("dailyStatus") && ($("dailyStatus").textContent = "Guardando..."));
      await API.flujosUpsert(name, 0, "");

      // Confirmar con datos reales
      const [fl, hab] = await Promise.all([API.flujosList(), API.habilitacionesList()]);
      if (fl)  { S.flujos = fl;  CACHE.set("flujos", fl,  2  * 60_000); }
      if (hab) { S.habil  = hab; CACHE.set("habil",  hab, 10 * 60_000); }
      renderFlujos();
      renderHabil();
      toast("Operativa diaria", `✓ Flujo "${name}" creado.`);
    } catch (e) {
      // Revertir si GAS falla
      S.flujos = (S.flujos || []).filter(f => String(f.flujo || f).trim() !== name);
      if (S.habil?.flujos) {
        S.habil = {
          ...S.habil,
          flujos: S.habil.flujos.filter(f => f !== name),
          rows: (S.habil.rows || []).map(r => {
            const c = { ...r }; delete c[`H_${name}`]; delete c[`F_${name}`]; return c;
          }),
        };
      }
      renderFlujos();
      setErr("No se pudo crear el flujo. Intentá de nuevo.");
    } finally {
      ($("dailyStatus") && ($("dailyStatus").textContent = "Listo"));
    }
  });

  // Reload buttons — invalidan cache antes de re-fetch
  $("btnReloadDash")?.addEventListener("click", async () => {
    CACHE.invalidate("plan");
    CACHE.invalidate("outbox");
    CACHE.invalidate("pres_week");
    CACHE.invalidate("pres_stats");
    CACHE.invalidate("presWeek");
    CACHE.invalidate("presStats");
    CACHE.invalidate("habil");
    await refreshPlanAndOutbox();
    await refreshPresentismo();
    renderDashboard();
    toast("Dashboard", "Actualizado");
  });
  $("btnReloadColabs")?.addEventListener("click", async () => {
    CACHE.invalidate("colabs");
    S.colabs = await API.colaboradoresList();
    CACHE.set("colabs", S.colabs, 5 * 60_000);
    renderColabs();
    renderDashboard();
    toast("Colaboradores", "Actualizado");
  });

  // CRUD colaboradores
  $("btnColabAgregar")?.addEventListener("click", () => openColabModal_());
  $("btnColabEliminar")?.addEventListener("click", () => deleteColabsConfirm_());
  $("colabModalClose")?.addEventListener("click",  closeColabModal_);
  $("colabModalCancel")?.addEventListener("click", closeColabModal_);
  $("colabModalSave")?.addEventListener("click",   saveColabModal_);

  // Mostrar/ocultar input libre de Ubicación
  $("cmUbic")?.addEventListener("change", () => {
    const otra = $("cmUbicOtra");
    if (!otra) return;
    otra.style.display = $("cmUbic").value === "__otra__" ? "" : "none";
    if ($("cmUbic").value === "__otra__") otra.focus();
  });
  $("colabModal")?.addEventListener("click", (e) => { if (e.target === $("colabModal")) closeColabModal_(); });
  $("colabDeleteCancel")?.addEventListener("click",  closeDeleteModal_);
  $("colabDeleteConfirm")?.addEventListener("click", deleteColabsExecute_);
  $("colabDeleteModal")?.addEventListener("click", (e) => { if (e.target === $("colabDeleteModal")) closeDeleteModal_(); });
  $("btnReloadHabil")?.addEventListener("click", async () => {
    S.habil = null; // forzar re-fetch
    await refreshHabil();
    renderHabil();
    toast("Habilitaciones", "Actualizado");
  });

  // ── Formulario de nueva entrada (estático, montado una sola vez) ──
  // Poblar owner multiselect estático
  (function initAgendaForm_() {
    // Poner fecha de hoy
    const agFechaEl = $("agFecha");
    if (agFechaEl && !agFechaEl.value) agFechaEl.value = new Date().toISOString().slice(0, 10);

    // Montar owner multiselect en el div estático
    const ownerWrap = $("ag_new_owner_wrap_static");
    if (ownerWrap) {
      ownerWrap.innerHTML = `
        <div class="ms ag-form-owner" id="ag_new_owner_wrap" style="min-width:140px;position:relative;overflow:visible">
          <div class="ms-btn ag-ctrl" style="display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:pointer">
            <div class="value" data-ms-value style="font-size:13px">Todos</div>
            <div style="font-size:10px;color:var(--text-3)">▾</div>
          </div>
          <div class="ms-panel">
            <div data-ms-list>
              <label class="ms-item"><input type="checkbox" value="Todos" checked/><div>Todos</div></label>
              ${(AGENDA_OWNERS || ["Cele","Eze","Jose","Mati L.","Mati M.","Vicky"]).map(o => `<label class="ms-item"><input type="checkbox" value="${escapeAttr(o)}"/><div>${escapeHtml(o)}</div></label>`).join("")}
            </div>
            <div class="ms-actions">
              <button class="btn ghost" type="button" data-ms-clear>Limpiar</button>
            </div>
          </div>
        </div>`;
      mountAgendaOwnerMs_("ag_new_owner_wrap");
    }

    // Montar WYSIWYG
    _agDescEditor_ = mountWysiwyg_("agDesc", "agDescToolbar", "agDescEmoji");

    // Link input
    (function mountLinkInput_(inputId, wrapId) {
      const inp = $(inputId);
      const wrap = $(wrapId);
      if (!inp || !wrap) return;
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const url = inp.value.trim();
        if (!url || !/^https?:\/\//.test(url)) return;
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.style.cssText = "font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px";
        pill.setAttribute("data-link-pill", url);
        pill.innerHTML = `<a href="${escapeAttr(url)}" target="_blank" rel="noopener" style="color:var(--pri);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(url.replace(/^https?:\/\//, "").slice(0,40))}${url.length > 43 ? "…" : ""}</a><span style="opacity:0.5;font-size:10px" data-rm-link="${escapeAttr(url)}">×</span>`;
        pill.querySelector("[data-rm-link]")?.addEventListener("click", () => pill.remove());
        wrap.insertBefore(pill, inp);
        inp.value = "";
      });
      inp.addEventListener("paste", (e) => {
        setTimeout(() => {
          const url = inp.value.trim();
          if (url && /^https?:\/\//.test(url)) inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }, 10);
      });
    })("agLinkInput", "agLinksWrap");

    // Toggle formulario
    $("btnAgFormToggle")?.addEventListener("click", () => {
      const body = $("agFormBody");
      const btn  = $("btnAgFormToggle");
      if (!body) return;
      const isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "block";
      if (btn) btn.textContent = isOpen ? "✚ Agregar tema" : "✕ Cancelar";
      if (!isOpen) setTimeout(() => $("agTema")?.focus(), 50);
    });

    // Botón Agregar
    $("btnAgendaAgregar")?.addEventListener("click", async () => {
      const owner = readOwnerFromMs("ag_new_owner");
      await onAgendaAgregar_(owner);
    });
  })();

  $("btnReloadAgenda")?.addEventListener("click", async () => {
    try {
      setBusy("Agenda", "Actualizando...");
      S.agenda = await API.agendaList();
      renderAgenda();
      toast("Agenda", "Actualizado");
    } catch (e) {
      setErr(`Agenda: ${e.message || e}`);
    } finally {
      clearBusy();
    }
  });
  $("btnReloadPres")?.addEventListener("click", async () => {
    CACHE.invalidate("pres_week");
    CACHE.invalidate("pres_stats");
    setBusy("Presentismo", "Actualizando...");
    await refreshPresentismo();
    mountPresentismoSelect();
    renderPresentismo();
    renderDashboard();
    clearBusy();
    toast("Presentismo", "Actualizado");
  });

  $("btnSetLicencia")?.addEventListener("click", onSetLicencia);

  // Filters
  // Roles dinámicos: extraídos de S.colabs, ordenados, únicos
  // Roles dinámicos desde S.colabs — se actualizan al cambiar colabs
  const getRolesDynamic_ = () => [...new Set((S.colabs || []).map(c => colabRowView(c).rol).filter(Boolean))].sort();
  // Habilitaciones: todos los roles (dinámico igual que Colaboradores)
  const getRolesHab_ = () => getRolesDynamic_();

  _msRolesCol_ = mountMultiSelect("msRolesColabs", { title: "Roles", items: getRolesDynamic_(), onChange: (set) => { S.fColabs.roles = set; renderColabs(); }});
  const msRolesCol = _msRolesCol_;
  const msEquipCol = mountMultiSelect("msEquiposColabs", { title: "Equipo", items: EQUIPOS_PRESET, onChange: (set) => { S.fColabs.equipos = set; renderColabs(); }});

  _msRolesHab_ = mountMultiSelect("msRolesHabil", { title: "Roles", items: getRolesHab_(), onChange: (set) => { S.fHabil.roles = set; renderHabil(); }});
  const msRolesHab = _msRolesHab_;
  const msEquipHab = mountMultiSelect("msEquiposHabil", { title: "Equipo", items: EQUIPOS_PRESET, onChange: (set) => { S.fHabil.equipos = set; renderHabil(); }});

  // Filtro de flujo: mismo componente multi-select que Roles/Equipo.
  // Selección múltiple con OR: muestra colaboradores habilitados en CUALQUIERA de los flujos elegidos.
  _habilFlujoMs = mountMultiSelect("msHabilFlujoFilter", {
    title: "Flujo",
    items: [],   // se puebla en renderHabil() con los flujos reales
    onChange: (set) => { S.fHabil.flujos = set; renderHabil(); },
  });

  // Select de flujo en la barra masiva — se puebla con S.flujos (Operativa)
  let _habilBulkFlujoMs = mountMultiSelect("msHabilBulkFlujo", {
    title: "Flujos a aplicar",
    items: (S.flujos || []).map(f => String(f.flujo || f)).filter(Boolean).sort(),
    onChange: () => {},  // no filtra — acumula selección para la acción bulk
  });

  // Poblar ms de barra masiva — fuente única: S.flujos (Operativa) con fallback a habil.flujos
  const _syncBulkFlujoItems_ = () => {
    const fromOperativa = (S.flujos || []).map(f => String(f.flujo || f)).filter(Boolean);
    const flujos = fromOperativa.length
      ? fromOperativa.slice().sort((a, b) => a.localeCompare(b))
      : (S.habil?.flujos || []).slice().sort((a, b) => a.localeCompare(b));
    if (_habilBulkFlujoMs && typeof _habilBulkFlujoMs.updateItems === "function") {
      _habilBulkFlujoMs.updateItems(flujos);
    }
    // También actualizar el filtro superior
    if (_habilFlujoMs && typeof _habilFlujoMs.updateItems === "function") {
      _habilFlujoMs.updateItems(flujos);
    }
  };

  // ── Barra de acciones masivas: botones ──────────────────────────────────
  async function _applyBulkHabil_(habilitado, fijo, soloFijo) {
    const sel = Array.from(S._habilSel || []);
    if (!sel.length) { setErr("Seleccioná al menos un colaborador."); return; }

    // Flujos seleccionados en el ms de la barra
    const flujosSel = _habilBulkFlujoMs
      ? Array.from(_habilBulkFlujoMs._state?.selected || [])
      : [];
    if (!flujosSel.length) { setErr("Elegí al menos un flujo en la barra."); return; }

    setBusy("Habilitaciones", `Aplicando a ${sel.length} colaboradores...`);
    setErr("");

    try {
      // Optimistic update local
      for (const idMeli of sel) {
        const r = (S.habil?.rows || []).find(x => (x.id_meli || x.ID_MELI || x.Id_Meli) === idMeli);
        if (!r) continue;
        for (const f of flujosSel) {
          if (soloFijo) {
            // Solo modifica F, H queda como está (si desmarca F, H no cambia)
            r[`F_${f}`] = fijo;
          } else {
            r[`H_${f}`] = habilitado;
            if (!habilitado) r[`F_${f}`] = false;  // deshabilitar limpia fijo
          }
        }
      }
      renderHabil();

      // Llamadas al backend en paralelo
      const calls = [];
      for (const idMeli of sel) {
        const r = (S.habil?.rows || []).find(x => (x.id_meli || x.ID_MELI || x.Id_Meli) === idMeli);
        if (!r) continue;
        for (const f of flujosSel) {
          const hVal = !!r[`H_${f}`];
          const fVal = !!r[`F_${f}`];
          calls.push(API.habilitacionesSet(idMeli, f, hVal, fVal));
        }
      }
      await Promise.all(calls);
      CACHE.invalidate("habil");
      toast("Asignaciones", `✓ Cambios aplicados a ${sel.length} colaborador${sel.length !== 1 ? "es" : ""} en ${flujosSel.length} flujo${flujosSel.length !== 1 ? "s" : ""}`);
    } catch (e) {
      setErr(`Habilitaciones: ${e.message || e}`);
      S.habil = await API.habilitacionesList().catch(() => S.habil);
      renderHabil();
    } finally {
      clearBusy();
    }
  }

  $("btnHabilBulkH1")?.addEventListener("click", () => _applyBulkHabil_(true, false, false));
  $("btnHabilBulkH0")?.addEventListener("click", () => _applyBulkHabil_(false, false, false));
  $("btnHabilBulkF1")?.addEventListener("click", () => _applyBulkHabil_(true, true, true));
  $("btnHabilBulkF0")?.addEventListener("click", () => _applyBulkHabil_(false, false, true));

  $("btnHabilBulkClearSel")?.addEventListener("click", () => {
    S._habilSel.clear();
    renderHabil();
  });

  // Poblar ms flujo barra cuando se carga habilitaciones
  const _origRefreshHabil = refreshHabil;
  refreshHabil = async function() {
    await _origRefreshHabil.apply(this, arguments);
    _syncBulkFlujoItems_();
  };

  _msRolesPres_ = mountMultiSelect("msRolesPres", { title: "Roles", items: getRolesDynamic_(), onChange: (set) => { S.fPres.roles = set; renderPresentismo(); }});
  const msRolesPres = _msRolesPres_;
  const msEquipPres = mountMultiSelect("msEquiposPres", { title: "Equipo", items: EQUIPOS_PRESET, onChange: (set) => { S.fPres.equipos = set; renderPresentismo(); }});

  mountSearch("searchColabs", "searchColabsWrap", "clearSearchColabs", (q) => { S.fColabs.q = q; renderColabs(); });
  mountSearch("searchHabil", "searchHabilWrap", "clearSearchHabil", (q) => { S.fHabil.q = q; renderHabil(); });


  mountSearch("searchPres", "searchPresWrap", "clearSearchPres", (q) => { S.fPres.q = q; renderPresentismo(); });

  $("btnClearColabs")?.addEventListener("click", () => {
    S.fColabs = { roles: new Set(), equipos: new Set(), q: "" };
    msRolesCol?.clear(); msEquipCol?.clear();
    $("searchColabs").value = ""; $("searchColabsWrap").classList.remove("has");
    renderColabs();
  });

  // Selección masiva (Colaboradores)
  const syncSelPill = () => { const pill = $("colabsSelPill"); if (pill) pill.innerHTML = `<b>Seleccionados</b> ${S.selColabs.size}`; };

  $("colabsSelectAll")?.addEventListener("change", (e) => {
    const checked = e.target.checked;
    const ids = applySectionFilter(S.colabs || [], S.fColabs).map(colabRowView).map((x) => x.id).filter(Boolean);
    if (checked) ids.forEach((id) => S.selColabs.add(id));
    else ids.forEach((id) => S.selColabs.delete(id));
    syncSelPill();
    renderColabs();
  });

  $("btnClearSelColabs")?.addEventListener("click", () => {
    S.selColabs.clear();
    syncSelPill();
    renderColabs();
  });

  function getSelectedColabs_() {
    const all = (S.colabs || []).map(colabRowView);
    return all.filter((x) => x.id && S.selColabs.has(x.id));
  }

  $("btnCopySelIds")?.addEventListener("click", () => {
    const rows = getSelectedColabs_();
    if (!rows.length) return toast("Copiar", "No hay seleccionados");
    copyToClipboard(rows.map((r) => r.id).join("\n"));
  });
  $("btnCopySelMailProd")?.addEventListener("click", () => {
    const rows = getSelectedColabs_().map((r) => r.mailProd).filter(Boolean);
    if (!rows.length) return toast("Copiar", "No hay mails seleccionados");
    copyToClipboard(rows.join("\n"));
  });
  $("btnCopySelMailExt")?.addEventListener("click", () => {
    const rows = getSelectedColabs_().map((r) => r.mailExt).filter(Boolean);
    if (!rows.length) return toast("Copiar", "No hay mails seleccionados");
    copyToClipboard(rows.join("\n"));
  });

  $("btnClearHabil")?.addEventListener("click", () => {
    S.fHabil = { roles: new Set(), equipos: new Set(), q: "", flujos: new Set() };
    S._habilSel.clear();
    msRolesHab?.clear(); msEquipHab?.clear();
    _habilFlujoMs?.clear();
    $("searchHabil").value = ""; $("searchHabilWrap").classList.remove("has");
    renderHabil();
  });
  $("btnClearPres")?.addEventListener("click", () => {
    S.fPres = { roles: new Set(), equipos: new Set(), q: "" };
    msRolesPres?.clear(); msEquipPres?.clear();
    $("searchPres").value = ""; $("searchPresWrap").classList.remove("has");
    renderPresentismo();
  });

  // Agrupar por estado/impacto (no persistir)
  {
    const chk = $("presGroupImpact");
    if (chk) {
      chk.checked = false;
      chk.addEventListener("change", () => renderPresentismo());
    }
  }

  await loadCore();
  mountSlackCompose_();
}


/* Inyectar estilos para habilitaciones masivas (una sola vez) */
(function() {
  if ($("_habilStyles")) return;
  const s = document.createElement("style");
  s.id = "_habilStyles";
  s.textContent = `
    tr.habil-selected td { background: rgba(var(--pri-rgb, 99,102,241), 0.08); }
    #habilBulkBar { transition: opacity 0.15s; }
  `;
  document.head.appendChild(s);
})();

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    setErr(`Error al cargar: ${e.message || e}`);
    // Botón de retry inline en la barra de error
    const errEl = $("errBar");
    if (errEl && !errEl.querySelector(".btn-retry")) {
      const btn = document.createElement("button");
      btn.textContent = "↺ Reintentar";
      btn.className = "btn btn-retry";
      btn.style.cssText = "margin-left:12px;padding:4px 10px;font-size:13px;vertical-align:middle";
      btn.onclick = () => {
        errEl.classList.remove("show");
        errEl.querySelector(".btn-retry")?.remove();
        CACHE.invalidateAll();
        main().catch((e2) => setErr(`Error: ${e2.message || e2}`));
      };
      errEl.appendChild(btn);
    }
  });
});



