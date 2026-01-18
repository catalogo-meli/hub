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

function toast(t1, t2 = "") {
  const box = $("toast");
  if (!box) return;
  $("toastT1").textContent = t1;
  $("toastT2").textContent = t2;
  box.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => box.classList.remove("show"), 3200);
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

function fmtDateAny(val) {
  if (!val) return "";
  // Date instance
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${d}-${m}-${y}`;
  }

  const s = String(val).trim();
  if (!s) return "";

  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDateDMY(s);

  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${String(m1[1]).padStart(2,"0")}-${String(m1[2]).padStart(2,"0")}-${m1[3]}`;

  // dd-mm-yyyy already
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;

  return s;
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
  fHabil: { roles: new Set(), equipos: new Set(), q: "" },
  fPres: { roles: new Set(), equipos: new Set(), q: "" },

  // Selección + sorters
  selColabs: new Set(),
  sort: {
    colabs: { key: "nombre", dir: 1 },
    habil: { key: "", dir: 1 },
    pres: { key: "nombre", dir: 1 },
    dashRoles: { key: "rol", dir: 1 },
  },
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

  tabs.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      tabs.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");

      const key = t.dataset.tab;
      ["dashboard", "daily", "colabs", "habil", "pres"].forEach((k) => {
        const sec = $(`tab_${k}`);
        if (sec) sec.style.display = k === key ? "" : "none";
      });

      if (key === "dashboard") renderDashboard();
      if (key === "daily") { renderFlujos(); renderPlan(); renderOutbox(); }
      if (key === "colabs") renderColabs();
      if (key === "habil") renderHabil();
      if (key === "pres") renderPresentismo();
    });
  });
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
    const [colabs, canales, flujos] = await Promise.all([
      API.colaboradoresList(),
      API.canalesList(),
      API.flujosList(),
    ]);
    S.colabs = colabs || [];
    S.canales = canales || [];
    S.flujos = flujos || [];

    await refreshPlanAndOutbox();
    await refreshHabil();
    await refreshPresentismo();
    mountPresentismoSelect();

    renderDashboard();
    renderFlujos();
    renderPlan();
    renderOutbox();
    renderColabs();
    renderHabil();
    renderPresentismo();

    toast("Listo", "Datos cargados");
  } catch (e) {
    setErr(`Error: ${e.message || e}`);
  } finally {
    clearBusy();
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
  try {
    // 1) Semanas disponibles (dinámico)
    try {
      const semanas = await API.presentismoSemanas();
      S.presSemanas = Array.isArray(semanas) ? semanas : [];
      syncPresSemanaSelect_();
    } catch {
      // no bloqueo la vista si el endpoint no está
      S.presSemanas = S.presSemanas || [];
    }

    // 2) Semana seleccionada
    if (S.presSemanaSel) {
      const [week, stats] = await Promise.all([
        API.presentismoWeekBySemana(S.presSemanaSel),
        API.presentismoStatsBySemana(S.presSemanaSel),
      ]);
      S.presWeek = week;
      S.presStats = stats;
      return;
    }

    // default: semana de "hoy"
    const d = todayYMD();
    const [week, stats] = await Promise.all([API.presentismoWeek(d), API.presentismoStats(d)]);
    S.presWeek = week;
    S.presStats = stats;
  } catch (e) {
    setErr(`Presentismo: ${e.message || e}`);
    S.presWeek = null;
    S.presStats = null;
  }
}

function syncPresSemanaSelect_() {
  const sel = $("presSemana");
  if (!sel) return;

  const opts = (S.presSemanas || []).filter(Boolean);
  // Mantengo selección si existe; si no, vacío => "hoy"
  const current = S.presSemanaSel;

  sel.innerHTML = [`<option value="">Actual</option>`]
    .concat(opts.map((w) => `<option value="${escapeAttr(w)}">${escapeHtml(w)}</option>`))
    .join("");

  // restore selection
  if (current && opts.includes(current)) sel.value = current;
  else sel.value = "";
}

/* ========= Operativa diaria: Flujos autosave ========= */
const saveFlujoDebounced = debounce(async (flujo, perfiles) => {
  setErr("");
  try {
    $("dailyStatus").textContent = "Guardando...";
    await API.flujosUpsert(flujo, perfiles, "");
    S.flujos = await API.flujosList();
    renderFlujos();
    toast("Guardado", flujo);
  } catch (e) {
    setErr(`Flujos: ${e.message || e}`);
  } finally {
    $("dailyStatus").textContent = "Listo";
  }
}, 420);

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

  const rows = (S.flujos || []).slice().sort((a, b) => String(a.flujo).localeCompare(String(b.flujo)));
  tb.innerHTML = rows
    .map((f) => {
      const name = f.flujo ?? "";
      const req = Number(f.perfiles_requeridos ?? f.cantidad ?? 0) || 0;
      const incluir = !(f.incluir_en_mensaje === false || ["FALSE","NO","0"].includes(String(f.incluir_en_mensaje ?? "").toUpperCase()));
      return `
        <tr data-flujo="${escapeAttr(name)}">
          <td><b>${escapeHtml(name)}</b></td>
          <td style="text-align:center;min-width:110px">
            <input type="checkbox" data-inc-msg ${incluir ? "checked" : ""} />
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
    // Incluir / Excluir en mensaje GENERAL (persistido en Config_Flujos)
    const chk = tr.querySelector("[data-inc-msg]");
    chk?.addEventListener("change", async () => {
      const value = !!chk.checked;
      try {
        await API.configFlujosSetIncluirMensaje(unescapeAttr(flujo), value);
        // actualizar cache local si existe
        const idx = (S.flujos || []).findIndex((x) => String(x.flujo) === String(unescapeAttr(flujo)));
        if (idx >= 0) S.flujos[idx].incluir_en_mensaje = value;
        toast("Flujos", value ? "Incluido en mensaje" : "Excluido del mensaje");
      } catch (e) {
        setErr(e?.message || String(e));
        chk.checked = !value; // rollback visual
      }
    });

    // autosave on input (debounced) + blur (for mobile)
    inp.addEventListener("input", () => {
      const perfiles = Number(inp.value || 0) || 0;
      saveFlujoDebounced(unescapeAttr(flujo), perfiles);
    });
    inp.addEventListener("blur", () => {
      const perfiles = Number(inp.value || 0) || 0;
      saveFlujoDebounced(unescapeAttr(flujo), perfiles);
    });

    tr.querySelector("[data-del]")?.addEventListener("click", async () => {
      if (!confirm(`Eliminar flujo "${unescapeAttr(flujo)}"?`)) return;
      await onFlujoDelete(unescapeAttr(flujo));
    });
  });

  // Alerta: perfiles disponibles vs requeridos (basado en presentes hoy)
  const alertEl = $("dailyAssignAlert");
  if (alertEl) {
    const disponibles = countAnalistasDisponiblesHoy_();
    const requeridos = rows.reduce((acc, f) => acc + (Number(f.perfiles_requeridos ?? f.cantidad ?? 0) || 0), 0);
    const diff = disponibles - requeridos;

let cls = "";
let msg = "";

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

}/* ========= Planificación: columnas + generar mensaje por flujo ========= */
function renderPlan() {
  const host = $("planGrid");
  if (!host) return;

  // UI state (solo para esta sección)
  S._planUI = S._planUI || { q: "", sort: "alpha", expanded: new Set() };
  mountPlanControls_();

  const plan = (S.plan || []).filter((r) => r?.flujo);
  if (!plan.length) {
    host.innerHTML = `<div class="muted">Sin planificación cargada.</div>`;
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
  });

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

  tbSent.innerHTML = sent.length
    ? sent.map(sentRowHtml).join("")
    : `<tr><td colspan="4" class="muted">Sin mensajes enviados en las últimas 2 semanas.</td></tr>`;

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
          S.outbox = await API.slackOutboxList();
          renderOutbox();
          toast("Outbox", "Eliminado");
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
          S.outbox = await API.slackOutboxList();
          renderOutbox();
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
      S.outbox = await API.slackOutboxList();
      renderOutbox();
      clearCompose();
      toast("Outbox", "Borrador guardado");
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
      S.outbox = await API.slackOutboxList();
      const newest = (S.outbox || []).slice().sort((a, b) => (b.row || 0) - (a.row || 0))[0];
      if (!newest?.row) throw new Error("No se pudo obtener la fila creada.");

      // 2) send
      await API.slackSendRow(newest.row);
      S.outbox = await API.slackOutboxList();
      renderOutbox();
      clearCompose();
      toast("Slack", "Enviado");
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
      S.outbox = await API.slackOutboxList();
      const newest = (S.outbox || []).slice().sort((a,b)=>(b.row||0)-(a.row||0))[0];
      if (!newest?.row) throw new Error("No se pudo obtener la fila creada.");

      // 2) programar
      await API.slackOutboxProgramar(newest.row, v);
      S.outbox = await API.slackOutboxList();
      renderOutbox();
      clearCompose();
      toast("Outbox", "Mensaje programado");
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
    S.outbox = await API.slackOutboxList();
    renderOutbox();
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
    // ingreso as date-friendly
    if (key === "ingreso") {
      return dir * fmtDateAny(av).localeCompare(fmtDateAny(bv));
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

/* ========= Habilitaciones (igual) ========= */
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
  head.innerHTML = `
    <tr>
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
    body.innerHTML = `<tr><td colspan="${1 + flujos.length}" class="muted">Sin resultados.</td></tr>`;
    return;
  }

  body.innerHTML = filtered
    .map((r) => {
      const id = r.id_meli;
      const label = `${r._meta.nombre || id} (${id})`;
      const cells = flujos
        .map((f) => {
          const keyH = `H_${f}`;
          const keyF = `F_${f}`;
          const hab = !!r[keyH];
          const fijo = !!r[keyF];
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

      return `<tr><td>${escapeHtml(label)}</td>${cells}</tr>`;
    })
    .join("");

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
}

async function setHabilitacion(idMeli, flujo, habilitado, fijo) {
  setErr("");
  try {
    await API.habilitacionesSet(idMeli, flujo, !!habilitado, !!fijo);
    S.habil = await API.habilitacionesList();
    renderHabil();
    toast("Habilitaciones", "Actualizado");
  } catch (e) {
    setErr(`Habilitaciones: ${e.message || e}`);
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

function renderPresentismo() {
  const tbl = $("tblPresWeek");
  if (!tbl) return;

  if (!S.presWeek || !S.presWeek.days || !S.presWeek.rows) {
    tbl.querySelector("thead").innerHTML = `<tr><th>Estado</th></tr>`;
    tbl.querySelector("tbody").innerHTML = `<tr><td class="muted">No se pudo cargar.</td></tr>`;
    return;
  }

  const days = S.presWeek.days; // includes isFeriado
  const rows = S.presWeek.rows;

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
      ${days.map((d) => `<th class="nowrap ${d.isFeriado ? "feriado" : ""}">${fmtDateDMY(d.key)}</th>`).join("")}
    </tr>
  `;

  mountTableSort_("tblPresWeek", S.sort.pres, (next) => { S.sort.pres = next; renderPresentismo(); });

  const tbody = tbl.querySelector("tbody");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${1 + days.length}" class="muted">Sin resultados.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((r) => {
      const meta = colabsById.get(r.id_meli) || { id: r.id_meli, nombre: r.nombre, rol: "", equipo: "" };
      const label = `${meta.nombre || r.nombre} (${r.id_meli})`;
      const tds = days
        .map((d) => {
          const v = (r.vals && r.vals[d.key]) ? String(r.vals[d.key]) : "";
          const cls = d.isFeriado ? "feriado" : "";
          const isLic = v && String(v).trim() !== "P";
          const c2 = [cls, isLic ? "lic" : ""].filter(Boolean).join(" ");
          return `<td class="${c2}">${escapeHtml(v)}</td>`;
        })
        .join("");
      return `<tr><td>${escapeHtml(label)}</td>${tds}</tr>`;
    })
    .join("");
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
    const v = r.vals?.[today];
    if (String(v || "").trim() !== "P") continue;

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

  const counts = new Map();
  for (const c of colabs) {
    const b = roleBucket(c.rol);
    counts.set(b, (counts.get(b) || 0) + 1);
  }

  // presentes hoy por rol (cruza presWeek + colaboradores)
  const presentesPorRol = new Map();
  if (S.presWeek?.rows?.length) {
    const today = todayYMD();
    const colabsById = new Map((S.colabs || []).map((c) => {
      const v = colabRowView(c);
      return [v.id, v];
    }));
    for (const r of S.presWeek.rows) {
      const vday = String(r.vals?.[today] || "").trim();
      if (vday !== "P") continue;
      const meta = colabsById.get(r.id_meli);
      const bucket = roleBucket(meta?.rol || "");
      presentesPorRol.set(bucket, (presentesPorRol.get(bucket) || 0) + 1);
    }
  }

  // tabla base
  let rowsRoles = ROLES_BUCKETS.map((k) => ({
    rol: k,
    nomina: counts.get(k) || 0,
    presentes: presentesPorRol.get(k) || 0,
  }));

  // sort
  const ss = S.sort?.dashRoles || { key: "rol", dir: 1 };
  const key = ss.key || "rol";
  const dir = ss.dir || 1;
  rowsRoles.sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });

  const pres = S.presStats?.presentes ?? 0;
  const analistasHoy = countAnalistasDisponiblesHoy_();
  const flujosActivos = (S.flujos || []).filter((f) => Number(f.perfiles_requeridos ?? f.cantidad ?? 0) >= 1).length;

  kpi.innerHTML = `
    <div class="kpi"><div class="v">${total}</div><div class="l">En nómina</div></div>
    <div class="kpi"><div class="v">${pres}</div><div class="l">Presentes hoy</div></div>
    <div class="kpi"><div class="v">${analistasHoy}</div><div class="l">Analistas disponibles</div></div>
    <div class="kpi"><div class="v">${flujosActivos}</div><div class="l">Flujos activos</div></div>
  `;

  tb.innerHTML = rowsRoles.map((r) => `<tr><td>${escapeHtml(r.rol)}</td><td class="right">${r.nomina}</td><td class="right">${r.presentes}</td></tr>`).join("");
}


/* ========= Generar planificación (también genera outbox) ========= */
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

  $("btnAddFlujo")?.addEventListener("click", async () => {
    const name = $("newFlujoName")?.value?.trim() || "";
    const req = Number($("newFlujoReq")?.value || 0) || 0;
    if (!name) return setErr("Flujos: escribí el nombre del flujo.");

    try {
      $("dailyStatus").textContent = "Guardando...";
      await API.flujosUpsert(name, req, "");
      S.flujos = await API.flujosList();
      renderFlujos();
      toast("Flujo agregado", name);
      $("newFlujoName").value = "";
      $("newFlujoReq").value = "";
    } catch (e) {
      setErr(`Flujos: ${e.message || e}`);
    } finally {
      $("dailyStatus").textContent = "Listo";
    }
  });

  // Reload buttons
  $("btnReloadDash")?.addEventListener("click", async () => {
    await refreshPlanAndOutbox();
    await refreshPresentismo();
    renderDashboard();
    toast("Dashboard", "Actualizado");
  });
  $("btnReloadColabs")?.addEventListener("click", async () => {
    S.colabs = await API.colaboradoresList();
    renderColabs();
    renderDashboard();
    toast("Colaboradores", "Actualizado");
  });
  $("btnReloadHabil")?.addEventListener("click", async () => {
    await refreshHabil();
    renderHabil();
    toast("Habilitaciones", "Actualizado");
  });
  $("btnReloadPres")?.addEventListener("click", async () => {
    setBusy("Presentismo", "Actualizando...");
    await refreshPresentismo();
    mountPresentismoSelect();
    renderPresentismo();
    renderDashboard();
    clearBusy();
    toast("Presentismo", "Actualizado");
  });

  $("presSemana")?.addEventListener("change", async (e) => {
    S.presSemanaSel = String(e?.target?.value || "").trim();
    setBusy("Presentismo", S.presSemanaSel ? `Cargando ${S.presSemanaSel}...` : "Cargando semana actual...");
    await refreshPresentismo();
    renderPresentismo();
    renderDashboard();
    clearBusy();
  });

  $("btnSetLicencia")?.addEventListener("click", onSetLicencia);

  // Filters
  const rolesList = ["Analista KV", "Analista PM", "Analista QA", "Líderes"];
  const rolesListHab = ["Analista KV", "Analista PM", "Analista QA"];

  const msRolesCol = mountMultiSelect("msRolesColabs", { title: "Roles", items: rolesList, onChange: (set) => { S.fColabs.roles = set; renderColabs(); }});
  const msEquipCol = mountMultiSelect("msEquiposColabs", { title: "Equipo", items: EQUIPOS_PRESET, onChange: (set) => { S.fColabs.equipos = set; renderColabs(); }});

  const msRolesHab = mountMultiSelect("msRolesHabil", { title: "Roles", items: rolesListHab, onChange: (set) => { S.fHabil.roles = set; renderHabil(); }});
  const msEquipHab = mountMultiSelect("msEquiposHabil", { title: "Equipo", items: EQUIPOS_PRESET, onChange: (set) => { S.fHabil.equipos = set; renderHabil(); }});

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
    S.fHabil = { roles: new Set(), equipos: new Set(), q: "" };
    msRolesHab?.clear(); msEquipHab?.clear();
    $("searchHabil").value = ""; $("searchHabilWrap").classList.remove("has");
    renderHabil();
  });
  $("btnClearPres")?.addEventListener("click", () => {
    S.fPres = { roles: new Set(), equipos: new Set(), q: "" };
    msRolesPres?.clear(); msEquipPres?.clear();
    $("searchPres").value = ""; $("searchPresWrap").classList.remove("has");
    renderPresentismo();
  });

  await loadCore();
  mountSlackCompose_();
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => setErr(`Error: ${e.message || e}`));
});

