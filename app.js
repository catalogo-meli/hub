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
const CACHE = {
  _store: {},
  set(key, data, ttlMs = 60_000) {
    this._store[key] = { data, exp: Date.now() + ttlMs };
  },
  get(key) {
    const e = this._store[key];
    if (!e || Date.now() > e.exp) return null;
    return e.data;
  },
  invalidate(key) { delete this._store[key]; },
  invalidateAll() { this._store = {}; },
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
      CACHE.invalidate("habil");
      await refreshHabil();
      renderHabil();
    }
    if (name === "agenda") {
      // Solo fetchea si no hay datos todavía (no re-fetchar en cada click al tab)
      if (!S.agenda || !S.agenda.length) {
        S.agenda = await API.agendaList().catch(() => []);
      }
      renderAgenda();
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
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function colabRowView(c) {
  const id = getField(c, ["ID_MELI", "id_meli", "Id_Meli"]);
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

    if (rolesSel.size > 0 && !rolesSel.has(rb)) return false;
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
    const allCached = CACHE.get("colabs") && CACHE.get("canales") && CACHE.get("flujos");

    if (allCached) {
      // Cache fresco: usar datos locales sin tocar GAS
      S.colabs  = CACHE.get("colabs");
      S.canales = CACHE.get("canales");
      S.flujos  = CACHE.get("flujos");
      await refreshPlanAndOutbox();
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
      // agenda carga lazy al primer click en el tab
      // Poblar cache de cliente
      CACHE.set("colabs",  S.colabs,  5 * 60_000);
      CACHE.set("canales", S.canales, 10 * 60_000);
      CACHE.set("flujos",  S.flujos,  2 * 60_000);
    }

    renderDashboard();
    renderFlujos();
    renderPlan();
    renderOutbox();

    toast("Listo", "Datos cargados");
  } catch (e) {
    setErr(`Error: ${e.message || e}`);
  } finally {
    clearBusy();
  }

  // Habilitaciones en background
  refreshHabil().catch(() => {});

  // Presentismo: si ya vino del hubInit, solo montar el select y renderizar
  // Si no (cache hit de colabs pero no de presWeek), fetchear igual
  if (S.presWeek) {
    mountPresentismoSelect();
    renderDashboard(); // actualizar píldora con datos de presentismo
  } else {
    refreshPresentismo().then(() => {
      mountPresentismoSelect();
      renderDashboard();
    }).catch(() => {});
  }
}

async function refreshPlanAndOutbox() {
  const [plan, outbox] = await Promise.all([API.planificacionList(), API.slackOutboxList()]);
  S.plan = plan || [];
  S.outbox = outbox || [];
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
      if (flujos) { S.flujos = flujos; renderFlujos(); }
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
  try {
    $("dailyStatus").textContent = "Borrando...";
    await API.flujosDelete(flujo);
    S.flujos = await API.flujosList();
    renderFlujos();
    toast("Borrado", flujo);
  } catch (e) {
    setErr(`Flujos: ${e.message || e}`);
  } finally {
    $("dailyStatus").textContent = "Listo";
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
      if (!confirm(`Eliminar flujo "${unescapeAttr(flujo)}"?`)) return;
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

      // Scheduled: solo eliminar (no reprogramar acá; menos estados raros)
      return `
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
          <input class="input" type="datetime-local" data-when value="${escapeAttr(r.programado_para || "")}" style="max-width:220px" disabled />
          <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">
            <button class="xbtn" data-del title="Eliminar">×</button>
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
          if (!confirm("Eliminar este mensaje?")) return;
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
      if (!confirm("Eliminar este borrador?")) return;
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

  const renderMentionResults = (q) => {
    if (!mentionResults) return;
    const nq = norm(q);
    if (!nq) return closeMentionResults();
    const hits = allMentions.filter((x) => x.hay.includes(nq)).slice(0, 10);
    if (!hits.length) {
      mentionResults.style.display = "block";
      mentionResults.innerHTML = `<div class="muted" style="font-size:12px;padding:6px">Sin resultados.</div>`;
      return;
    }
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

  tb.innerHTML = sorted
    .map((v) => {
      const checked = S.selColabs.has(v.id) ? "checked" : "";
      return `
        <tr data-id="${escapeAttr(v.id)}">
          <td class="nowrap"><input type="checkbox" data-sel ${checked} /></td>
          <td class="copyable" data-copy="${escapeAttr(v.id)}">${escapeHtml(v.id)}</td>
          <td>${escapeHtml(v.nombre)}</td>
          <td>${escapeHtml(roleBucket(v.rol))}</td>
          <td>${escapeHtml(v.equipo)}</td>
          <td>${escapeHtml(v.ubic)}</td>
          <td class="copyable" data-copy="${escapeAttr(v.mailProd)}">${escapeHtml(v.mailProd)}</td>
          <td class="copyable" data-copy="${escapeAttr(v.mailExt)}">${escapeHtml(v.mailExt)}</td>
          <td class="nowrap">${escapeHtml(fmtDateAny(v.ingreso))}</td>
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

  // sortable headers + indicators
  mountTableSort_("tblColabs", S.sort.colabs, (next) => {
    S.sort.colabs = next;
    renderColabs();
  });
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
    body.innerHTML = `<tr><td class="muted">No se pudo cargar habilitaciones.</td></tr>`;
    return;
  }

  const flujos = (S.habil.flujos || []).slice().sort((a, b) => a.localeCompare(b));

  // Actualizar items del filtro de flujo con los flujos reales disponibles.
  // updateItems solo re-renderiza si la lista cambió (evita trabajo innecesario).
  if (_habilFlujoMs && typeof _habilFlujoMs.updateItems === "function") {
    _habilFlujoMs.updateItems(flujos);
  }

  // Header: select-all + colaborador + columnas de flujos
  head.innerHTML = `
    <tr>
      <th style="width:32px;padding:4px 8px">
        <input type="checkbox" id="habilSelectAll" title="Seleccionar todos" />
      </th>
      <th style="min-width:220px">Colaborador</th>
      ${flujos.map((f) => `<th class="nowrap">${escapeHtml(f)}<div class="muted" style="font-size:11px;margin-top:2px">H / F</div></th>`).join("")}
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
    const rb = roleBucket(r._meta.rol);
    if (S.fHabil.roles.size > 0 && !S.fHabil.roles.has(rb)) return false;
    if (S.fHabil.equipos.size > 0 && !S.fHabil.equipos.has(r._meta.equipo)) return false;
    if (S.fHabil.flujos.size > 0 && ![...S.fHabil.flujos].some(f => r[`H_${f}`])) return false;
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
    body.innerHTML = `<tr><td colspan="${2 + flujos.length}" class="muted">Sin resultados.</td></tr>`;
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
          const hab = !!r[`H_${f}`];
          const fijo = !!r[`F_${f}`];
          return `
            <td class="nowrap">
              <label class="row" style="gap:10px;margin:0">
                <input type="checkbox" data-h="1" data-id="${escapeAttr(id)}" data-flujo="${escapeAttr(f)}" ${hab ? "checked" : ""} />
                <span class="muted">H</span>
                <input type="checkbox" data-f="1" data-id="${escapeAttr(id)}" data-flujo="${escapeAttr(f)}" ${fijo ? "checked" : ""} />
                <span class="muted">F</span>
              </label>
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
  body.querySelectorAll("input[data-h]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const idMeli = cb.getAttribute("data-id");
      const flujo = cb.getAttribute("data-flujo");
      const habilitado = cb.checked;
      const fijoCb = body.querySelector(`input[data-f][data-id="${cssEsc(idMeli)}"][data-flujo="${cssEsc(flujo)}"]`);
      const fijo = fijoCb ? fijoCb.checked : false;
      if (!habilitado && fijoCb) fijoCb.checked = false;
      await setHabilitacion(idMeli, flujo, habilitado, habilitado ? fijo : false);
    });
  });

  body.querySelectorAll("input[data-f]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const idMeli = cb.getAttribute("data-id");
      const flujo = cb.getAttribute("data-flujo");
      const fijo = cb.checked;
      const habCb = body.querySelector(`input[data-h][data-id="${cssEsc(idMeli)}"][data-flujo="${cssEsc(flujo)}"]`);
      const habilitado = habCb ? habCb.checked : false;
      if (fijo && habCb && !habilitado) habCb.checked = true;
      await setHabilitacion(idMeli, flujo, fijo ? true : habilitado, fijo);
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
    toast("Habilitaciones", "✓");
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
const PRES_PARTIAL_CODES = new Set(["TM/TR", "CJ"]);

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
    return [v.id, v];
  }));

  const filtered = rows.filter((r) => {
    const meta = colabsById.get(r.id_meli) || { id: r.id_meli, nombre: r.nombre, rol: "", equipo: "" };
    const rb = roleBucket(meta.rol);

    if (S.fPres.roles.size > 0 && !S.fPres.roles.has(rb)) return false;
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
    return [v.id, v];
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
    const colabsById = new Map((S.colabs || []).map((c) => {
      const v = colabRowView(c);
      return [v.id, v];
    }));
    for (const r of S.presWeek.rows) {
      const vday = String(r.vals?.[today] || "").trim();
      const imp = presImpactFromCode_(vday);
      const meta = colabsById.get(r.id_meli);
      const role = normRole(meta?.rol || "");

      // Presente (ok) o Presente parcial (warn = TM/TR, CJ): ambos cuentan como presente
      // Solo contar si el colaborador tiene un rol conocido (evita "Sin rol" que no aparece en la tabla)
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
    <div class="kpi"><div class="v">${total}</div><div class="l">En nómina</div></div>
    <div class="kpi"><div class="v">${pres}</div><div class="l">Presentes hoy</div></div>
    <div class="kpi"><div class="v">${analistasHoy}</div><div class="l">Analistas disponibles</div></div>
    <div class="kpi"><div class="v">${flujosActivos}</div><div class="l">Flujos activos</div></div>
    ${absenceCards ? `<div style="width:100%;margin-top:10px;display:flex;flex-wrap:wrap;gap:8px">${absenceCards}</div>` : ""}
  `;

  tb.innerHTML = rowsRoles.map((r) => `<tr><td>${escapeHtml(r.rol)}</td><td class="right">${r.nomina}</td><td class="right">${r.presentes}</td></tr>`).join("");
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

// Convierte texto con URLs en HTML con links clickeables
function linkify_(text) {
  if (!text) return "";
  const escaped = escapeHtml(text);
  return escaped.replace(
    /https?:\/\/[^\s<>"]+/g,
    url => `<a href="${url}" target="_blank" rel="noopener" style="color:var(--pri);word-break:break-all">${url}</a>`
  );
}

function renderAgenda() {
  const host = $("agendaContent");
  if (!host) return;

  const items = (S.agenda || []).slice();
  const pendientes = items.filter(r => r.estado !== "Hecho");
  const historial  = items.filter(r => r.estado === "Hecho");

  const priOrd = { "Urgente": 0, "Importante": 1 };
  pendientes.sort((a, b) => {
    const pa = priOrd[a.prioridad] ?? 2, pb = priOrd[b.prioridad] ?? 2;
    if (pa !== pb) return pa - pb;
    return String(a.fecha).localeCompare(String(b.fecha));
  });

  // ── Owner multiselect helper ─────────────────────────────
  // Construye el dropdown de owners con checkboxes + "Todos"
  const ownerSelectHtml = (selectedVal, idPrefix) => {
    const sel = String(selectedVal || "");
    const selected = sel === "Todos" || sel === "All" ? [] : sel.split(",").map(s => s.trim()).filter(Boolean);
    return `
      <div class="ms" id="${idPrefix}_wrap" style="min-width:130px;position:relative">
        <div class="ms-btn">
          <div>
            <div class="label" style="font-size:10px">OWNER</div>
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
    const emoji = AGENDA_PRIO_EMOJI[r.prioridad] || "🔵";
    const desc = linkify_(r.descripcion);
    const tiempoOpts = AGENDA_TIEMPO_OPTS.map(o =>
      `<option value="${escapeAttr(o)}" ${r.tiempo === o ? "selected" : ""}>${escapeHtml(o)}${o !== "Si sobra tiempo" ? " min" : ""}</option>`
    ).join("");
    const prioOpts = ["Urgente","Importante","Normal"].map(p =>
      `<option value="${p}" ${r.prioridad === p ? "selected" : ""}>${AGENDA_PRIO_EMOJI[p]} ${p}</option>`
    ).join("");

    return `
      <tr data-agenda-row="${r.row}">
        <td style="text-align:center;padding:4px 6px">
          <select class="input" data-ag-prio style="padding:2px 4px;font-size:13px;min-width:36px">${prioOpts}</select>
        </td>
        <td class="nowrap">
          <input class="input" data-ag-fecha type="date" value="${escapeAttr(_fechaToISO_(r.fecha))}" style="font-size:12px;padding:4px 6px;min-width:130px"/>
        </td>
        <td>${ownerSelectHtml(r.owner, "ag_owner_" + r.row)}</td>
        <td>
          <input class="input" data-ag-tema value="${escapeAttr(r.tema)}" style="font-size:13px;min-width:180px"/>
          <textarea class="input" data-ag-desc rows="2" placeholder="Descripción..." style="font-size:11px;margin-top:3px;width:100%;resize:vertical;min-height:40px;font-family:inherit">${escapeHtml(parseDescLinks_(r.descripcion).text)}</textarea>
          <div data-ag-links-wrap style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:28px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--input-bg,var(--card2));margin-top:3px">
            ${parseDescLinks_(r.descripcion).urls.map(u => `<span class="pill" style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px" data-link-pill="${escapeAttr(u)}"><a href="${escapeAttr(u)}" target="_blank" rel="noopener" style="color:var(--pri);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(u.replace(/^https?:\/\//, "").slice(0,40))}${u.length > 43 ? "…" : ""}</a><span style="opacity:0.5;font-size:10px" data-rm-link="${escapeAttr(u)}">×</span></span>`).join("")}
            <input class="input" data-ag-link-input placeholder="https://..." style="border:none;background:transparent;outline:none;flex:1;min-width:120px;padding:0;font-size:11px"/>
          </div>
        </td>
        <td class="nowrap">
          <select class="input" data-ag-tiempo style="font-size:12px;padding:4px 6px">${tiempoOpts}</select>
        </td>
        <td class="nowrap" style="white-space:nowrap">
          <div style="display:flex;gap:4px;align-items:center">
            <button class="btn ghost" data-ag-save="${r.row}" style="font-size:11px;padding:3px 8px" title="Guardar cambios">💾</button>
            <button class="btn ghost" data-hecho="${r.row}" style="font-size:11px;padding:3px 8px" title="Marcar como hecho">✓</button>
            <button class="xbtn" data-ag-del="${r.row}" title="Eliminar">×</button>
          </div>
        </td>
      </tr>`;
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
            const textHtml = text ? `<div style="font-size:11px;margin-top:2px;opacity:0.6;white-space:pre-wrap">${escapeHtml(text)}</div>` : "";
            const linksHtml = urls.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px">${urls.map(u => `<a href="${escapeAttr(u)}" target="_blank" rel="noopener" class="pill" style="font-size:10px;color:var(--pri);text-decoration:none;opacity:0.8">${escapeHtml(u.replace(/^https?:\/\//, "").slice(0,40))}${u.length > 43 ? "…" : ""}</a>`).join("")}</div>` : "";
            return textHtml + linksHtml;
          })()}
        </td>
        <td class="nowrap">${escapeHtml(r.tiempo ? r.tiempo + (r.tiempo !== "Si sobra tiempo" ? " min" : "") : "—")}</td>
        <td class="nowrap">
          <button class="xbtn" data-ag-del="${r.row}" title="Eliminar">×</button>
        </td>
      </tr>`;
  };

  const thead = `
    <thead><tr>
      <th style="width:50px">Prio</th>
      <th class="nowrap">Fecha</th>
      <th>Owner</th>
      <th>Tema / Descripción</th>
      <th class="nowrap">Tiempo</th>
      <th style="width:90px"></th>
    </tr></thead>`;

  const pendientesHtml = pendientes.length
    ? `<div style="overflow-x:auto"><table class="table" style="margin-top:8px">${thead}<tbody>${pendientes.map(r => rowHtmlEditable(r)).join("")}</tbody></table></div>`
    : `<div class="muted" style="margin-top:12px;padding:12px">Sin pendientes. ¡Todo al día! 🎉</div>`;

  const histBtnLabel = S.agendaHistCollapsed ? `▶ Ver historial (${historial.length})` : `▼ Ocultar historial`;
  const histContent  = S.agendaHistCollapsed ? "" : `
    <div style="overflow-x:auto"><table class="table" style="margin-top:8px">
      ${thead}<tbody>${historial.map(r => rowHtmlReadOnly(r)).join("")}</tbody>
    </table></div>`;

  // ── Owner multiselect para el formulario de carga ────────
  host.innerHTML = `
    <div style="margin-bottom:10px">
      <div class="row" style="flex-wrap:wrap;gap:8px;align-items:flex-end">
        <div style="display:flex;flex-direction:column;gap:4px">
          <div class="muted" style="font-size:12px">Fecha</div>
          <input class="input" id="agFecha" type="date" style="max-width:160px" value="${new Date().toISOString().slice(0,10)}"/>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <div class="muted" style="font-size:12px">Owner</div>
          ${ownerSelectHtml("", "ag_new_owner")}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:180px">
          <div class="muted" style="font-size:12px">Tema *</div>
          <input class="input" id="agTema" placeholder="Tema a tratar..."/>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <div class="muted" style="font-size:12px">Tiempo</div>
          <select class="input" id="agTiempo" style="max-width:160px">
            ${AGENDA_TIEMPO_OPTS.map(o => `<option value="${escapeAttr(o)}">${escapeHtml(o)}${o !== "Si sobra tiempo" ? " min" : ""}</option>`).join("")}
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <div class="muted" style="font-size:12px">Prioridad</div>
          <select class="input" id="agPrioridad" style="max-width:140px">
            <option value="Urgente">🔴 Urgente</option>
            <option value="Importante" selected>🟡 Importante</option>
            <option value="Normal">🔵 Normal</option>
          </select>
        </div>
        <button class="btn primary" id="btnAgendaAgregar" type="button">Agregar</button>
      </div>
      <div style="margin-top:8px">
        <div class="muted" style="font-size:12px;margin-bottom:4px">Descripción (opcional)</div>
        <textarea class="input" id="agDesc" placeholder="Escribí la descripción..." rows="2" style="width:100%;resize:vertical;min-height:48px;font-family:inherit"></textarea>
      </div>
      <div style="margin-top:6px">
        <div class="muted" style="font-size:12px;margin-bottom:4px">Links (pegá una URL y presioná Enter)</div>
        <div id="agLinksWrap" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:32px;padding:6px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg,var(--card2))">
          <input id="agLinkInput" class="input" placeholder="https://..." style="border:none;background:transparent;outline:none;flex:1;min-width:180px;padding:0"/>
        </div>
      </div>
    </div>
    <div class="hr"></div>
    <div class="row" style="align-items:center;justify-content:space-between;margin-bottom:4px">
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
  function mountAgendaOwnerMs_(wrapId) {
    const host2 = $(wrapId);
    if (!host2) return;
    const btn2   = host2.querySelector(".ms-btn");
    const panel2 = host2.querySelector(".ms-panel");
    const val2   = host2.querySelector("[data-ms-value]");
    const cbs    = host2.querySelectorAll("input[type=checkbox]");
    const bClr   = host2.querySelector("[data-ms-clear]");

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

    btn2?.addEventListener("click", (e) => { e.stopPropagation(); host2.classList.toggle("open"); });
    panel2?.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => host2.classList.remove("open"));
  }

  // Montar ms del formulario nuevo
  mountAgendaOwnerMs_("ag_new_owner_wrap");

  // ── Links píldoras en el formulario nuevo ───────────────
  (function mountLinkInput_(inputId, wrapId) {
    const inp = $(inputId);
    const wrap = $(wrapId);
    if (!inp || !wrap) return;

    const addLink = () => {
      const url = inp.value.trim();
      if (!url || !/^https?:\/\//.test(url)) return;
      // No duplicar
      if (wrap.querySelector(`[data-link-pill="${CSS.escape(url)}"]`)) { inp.value = ""; return; }
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.setAttribute("data-link-pill", url);
      pill.style.cssText = "font-size:11px;cursor:default;display:flex;align-items:center;gap:4px";
      pill.innerHTML = `<a href="${url}" target="_blank" rel="noopener" style="color:var(--pri);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(url.replace(/^https?:\/\//, "").slice(0,40))}${url.length > 43 ? "…" : ""}</a><span style="opacity:0.5;font-size:10px;cursor:pointer" data-rm>×</span>`;
      pill.querySelector("[data-rm]").addEventListener("click", () => pill.remove());
      wrap.insertBefore(pill, inp);
      inp.value = "";
    };

    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addLink(); }
    });
    inp.addEventListener("paste", () => setTimeout(addLink, 50));
  })("agLinkInput", "agLinksWrap");

  // Montar ms y links de cada fila editable
  pendientes.forEach(r => {
    mountAgendaOwnerMs_("ag_owner_" + r.row + "_wrap");

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
  const readOwnerFromMs = (wrapId) => {
    const wrap = $(wrapId + "_wrap");
    if (!wrap) return "Todos";
    const checked = Array.from(wrap.querySelectorAll("input[type=checkbox]:checked"))
      .filter(c => c.value !== "Todos").map(c => c.value);
    return checked.length ? checked.join(", ") : "Todos";
  };

  // ── Botón agregar ────────────────────────────────────────
  $("btnAgendaAgregar")?.addEventListener("click", async () => {
    const owner = readOwnerFromMs("ag_new_owner");
    await onAgendaAgregar_(owner);
  });

  // ── Botones guardar (edición inline) ────────────────────
  host.querySelectorAll("[data-ag-save]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = Number(btn.getAttribute("data-ag-save"));
      const tr = btn.closest("tr");
      const owner = readOwnerFromMs("ag_owner_" + row);
      const fechaISO = tr.querySelector("[data-ag-fecha]")?.value || "";
      const fecha = fechaISO ? fechaISO.split("-").reverse().join("/") : "";
      const descTxt  = tr.querySelector("[data-ag-desc]")?.value?.trim() || "";
      const rowLinks = Array.from(tr.querySelectorAll("[data-ag-links-wrap] [data-link-pill]"))
        .map(el => el.getAttribute("data-link-pill")).filter(Boolean);
      const payload = {
        row,
        fecha,
        owner,
        tema:        tr.querySelector("[data-ag-tema]")?.value?.trim() || "",
        tiempo:      tr.querySelector("[data-ag-tiempo]")?.value       || "",
        prioridad:   tr.querySelector("[data-ag-prio]")?.value         || "",
        descripcion: joinDescLinks_(descTxt, rowLinks),
      };
      try {
        // Optimistic update
        const idx = (S.agenda||[]).findIndex(r => r.row === row);
        if (idx >= 0) Object.assign(S.agenda[idx], {
          fecha: payload.fecha, owner: payload.owner, tema: payload.tema,
          tiempo: payload.tiempo, prioridad: payload.prioridad, descripcion: payload.descripcion
        });
        await API.agendaUpdate(payload);
        toast("Agenda", "✓ Guardado");
        renderAgenda();
      } catch (e) { setErr(`Agenda: ${e.message || e}`); }
    });
  });

  // ── Botones Hecho ────────────────────────────────────────
  host.querySelectorAll("[data-hecho]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await onAgendaSetHecho_(Number(btn.getAttribute("data-hecho")));
    });
  });

  // ── Botones eliminar (×) ─────────────────────────────────
  host.querySelectorAll("[data-ag-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = Number(btn.getAttribute("data-ag-del"));
      if (!confirm("¿Eliminar este tema de la agenda?")) return;
      const idx = (S.agenda||[]).findIndex(r => r.row === row);
      if (idx >= 0) S.agenda.splice(idx, 1);
      renderAgenda();
      try {
        await API.agendaDelete(row);
        S.agenda = await API.agendaList();
        renderAgenda();
      } catch (e) {
        setErr(`Agenda: ${e.message || e}`);
        S.agenda = await API.agendaList().catch(() => S.agenda);
        renderAgenda();
      }
    });
  });

  // ── Toggle historial ─────────────────────────────────────
  $("btnAgendaHistToggle")?.addEventListener("click", () => {
    S.agendaHistCollapsed = !S.agendaHistCollapsed;
    renderAgenda();
  });

  $("btnAgendaCopiar")?.addEventListener("click", onAgendaCopiar_);
}

// Convierte "dd/MM/yyyy" → "yyyy-MM-dd" para input type=date
function _fechaToISO_(ddmmyyyy) {
  const m = String(ddmmyyyy || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return ddmmyyyy || "";
}

async function onAgendaAgregar_(ownerParam) {
  const fecha     = $("agFecha")?.value || "";
  const owner     = ownerParam || "Todos";
  const tema      = $("agTema")?.value?.trim() || "";
  const tiempo    = $("agTiempo")?.value || "10";
  const prioridad = $("agPrioridad")?.value || "Importante";
  const descText  = $("agDesc")?.value?.trim() || "";
  const linkPills = Array.from($("agLinksWrap")?.querySelectorAll("[data-link-pill]") || [])
    .map(el => el.getAttribute("data-link-pill")).filter(Boolean);
  const desc = joinDescLinks_(descText, linkPills);

  if (!tema) { setErr("Agenda: el campo Tema es obligatorio."); return; }

  // Convertir fecha de yyyy-MM-dd a dd/MM/yyyy para GAS
  const fechaGAS = fecha
    ? fecha.split("-").reverse().join("/")
    : new Date().toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", year:"numeric" });

  setErr("");
  try {
    setBusy("Agenda", "Guardando...");
    await API.agendaAdd({ fecha: fechaGAS, owner, tema, tiempo, prioridad, descripcion: desc });
    S.agenda = await API.agendaList();
    renderAgenda();
    // Limpiar campos (excepto fecha, owner, prioridad)
    if ($("agTema")) $("agTema").value = "";
    if ($("agDesc")) $("agDesc").value = "";
    // Limpiar píldoras de links
    const linkWrap = $("agLinksWrap");
    if (linkWrap) linkWrap.querySelectorAll("[data-link-pill]").forEach(el => el.remove());
    toast("Agenda", "✓ Tema agregado");
  } catch (e) {
    setErr(`Agenda: ${e.message || e}`);
  } finally {
    clearBusy();
  }
}

async function onAgendaSetHecho_(row, btn) {
  // Optimistic update
  const idx = (S.agenda || []).findIndex(r => r.row === row);
  if (idx >= 0) S.agenda[idx].estado = "Hecho";
  renderAgenda();
  try {
    await API.agendaSetHecho(row);
    toast("Agenda", "✓ Marcado como hecho");
  } catch (e) {
    // Revertir
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
    $("dailyStatus").textContent = "Listo";
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
    if (!name) return setErr("Flujos: escribí el nombre del flujo.");

    if ((S.flujos || []).some(f => String(f.flujo).trim().toLowerCase() === name.toLowerCase())) {
      return setErr(`Flujos: ya existe un flujo con el nombre "${name}".`);
    }

    try {
      $("dailyStatus").textContent = "Guardando...";
      await API.flujosUpsert(name, 0, "");
      S.flujos = await API.flujosList();
      renderFlujos();
      toast("Flujo agregado", name);
      $("newFlujoName").value = "";
      // Scroll al nuevo flujo y foco en input de perfiles
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
    } catch (e) {
      setErr(`Flujos: ${e.message || e}`);
    } finally {
      $("dailyStatus").textContent = "Listo";
    }
  });

  // Reload buttons — invalidan cache antes de re-fetch
  $("btnReloadDash")?.addEventListener("click", async () => {
    CACHE.invalidate("plan");
    CACHE.invalidate("outbox");
    CACHE.invalidate("pres_week");
    CACHE.invalidate("pres_stats");
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
  $("btnReloadHabil")?.addEventListener("click", async () => {
    CACHE.invalidate("habil");
    await refreshHabil();
    renderHabil();
    toast("Habilitaciones", "Actualizado");
  });

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
  const rolesList = ["Analista KV", "Analista PM", "Analista QA", "Líderes"];
  const rolesListHab = ["Analista KV", "Analista PM", "Analista QA"];

  const msRolesCol = mountMultiSelect("msRolesColabs", { title: "Roles", items: rolesList, onChange: (set) => { S.fColabs.roles = set; renderColabs(); }});
  const msEquipCol = mountMultiSelect("msEquiposColabs", { title: "Equipo", items: EQUIPOS_PRESET, onChange: (set) => { S.fColabs.equipos = set; renderColabs(); }});

  const msRolesHab = mountMultiSelect("msRolesHabil", { title: "Roles", items: rolesListHab, onChange: (set) => { S.fHabil.roles = set; renderHabil(); }});
  const msEquipHab = mountMultiSelect("msEquiposHabil", { title: "Equipo", items: EQUIPOS_PRESET, onChange: (set) => { S.fHabil.equipos = set; renderHabil(); }});

  // Filtro de flujo: mismo componente multi-select que Roles/Equipo.
  // Selección múltiple con OR: muestra colaboradores habilitados en CUALQUIERA de los flujos elegidos.
  _habilFlujoMs = mountMultiSelect("msHabilFlujoFilter", {
    title: "Flujo",
    items: [],   // se puebla en renderHabil() con los flujos reales
    onChange: (set) => { S.fHabil.flujos = set; renderHabil(); },
  });

  // Select de flujo en la barra masiva (multi: puede aplicar a varios flujos a la vez)
  let _habilBulkFlujoMs = mountMultiSelect("msHabilBulkFlujo", {
    title: "Flujos a aplicar",
    items: [],   // se puebla al abrir habilitaciones
    onChange: () => {},  // no filtra, solo acumula selección para la acción
  });

  // Poblar el ms de la barra masiva cuando S.habil tenga datos
  const _syncBulkFlujoItems_ = () => {
    const flujos = (S.habil?.flujos || []).slice().sort((a, b) => a.localeCompare(b));
    if (_habilBulkFlujoMs && typeof _habilBulkFlujoMs.updateItems === "function") {
      _habilBulkFlujoMs.updateItems(flujos);
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
      toast("Habilitaciones", `✓ Aplicado a ${sel.length} colaboradores en ${flujosSel.length} flujo${flujosSel.length > 1 ? "s" : ""}`);
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

  const msRolesPres = mountMultiSelect("msRolesPres", { title: "Roles", items: rolesList, onChange: (set) => { S.fPres.roles = set; renderPresentismo(); }});
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



