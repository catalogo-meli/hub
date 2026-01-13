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
  if (m1) return `${String(m1[1]).padStart(2, "0")}-${String(m1[2]).padStart(2, "0")}-${m1[3]}`;

  // dd-mm-yyyy already
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;

  return s;
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
  if (
    r.includes("team leader") ||
    r === "tl" ||
    r.includes(" tl") ||
    r.includes("coordin") ||
    r.includes("cp") ||
    r.includes("project manager") ||
    r.includes("pm lider") ||
    r.includes("pm líder") ||
    r.includes("lider")
  ) {
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

let msSemanaPresCtrl = null;

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
      const nextDir = nextKey === key ? dir * -1 : 1;
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

  function close() {
    host.classList.remove("open");
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    host.classList.toggle("open");
  });
  document.addEventListener("click", () => close());
  panel.addEventListener("click", (e) => e.stopPropagation());

  // Limpiar => vuelve a "Todos" (sin filtros)
  bClear.addEventListener("click", () => {
    state.selected.clear();
    renderList();
    renderValue();
    onChange?.(new Set(state.selected));
  });

  renderList();
  renderValue();

  return {
    clear: () => {
      state.selected.clear();
      renderList();
      renderValue();
      onChange?.(new Set(state.selected));
    },
  };
}

/* ========= SingleSelect (mismo patrón UI que MultiSelect) ========= */
/**
 * Selector de un solo valor con el mismo patrón visual/UX del MultiSelect (ms).
 * - Incluye opción "Actual" (value="") como primera.
 * - Botón "Limpiar" vuelve a "Actual".
 */
function mountSingleSelectMs(targetId, { title, items, emptyLabel = "Actual", onChange }) {
  const host = $(targetId);
  if (!host) return null;

  host.className = "ms";
  host.innerHTML = `
    <div class="ms-btn">
      <div>
        <div class="label">${title}</div>
        <div class="value" data-ms-value>${emptyLabel}</div>
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

  const state = { value: "" }; // "" => Actual

  const btn = host.querySelector(".ms-btn");
  const panel = host.querySelector(".ms-panel");
  const list = host.querySelector("[data-ms-list]");
  const value = host.querySelector("[data-ms-value]");
  const bClear = host.querySelector("[data-ms-clear]");

  const name = `ms_${targetId}_single`;

  function renderValue() {
    value.textContent = state.value ? state.value : emptyLabel;
  }

  function close() {
    host.classList.remove("open");
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    host.classList.toggle("open");
  });
  document.addEventListener("click", () => close());
  panel.addEventListener("click", (e) => e.stopPropagation());

  function renderList(nextItems) {
    const opts = (Array.isArray(nextItems) ? nextItems : items || []).filter(Boolean);

    list.innerHTML = [
      `<label class="ms-item">
        <input type="radio" name="${name}" value="" />
        <div>${escapeHtml(emptyLabel)}</div>
      </label>`,
      ...opts.map(
        (it) => `
        <label class="ms-item">
          <input type="radio" name="${name}" value="${escapeAttr(it)}" />
          <div>${escapeHtml(it)}</div>
        </label>
      `
      ),
    ].join("");

    list.querySelectorAll("input[type=radio]").forEach((rb) => {
      rb.checked = String(rb.value) === String(state.value);
      rb.addEventListener("change", () => {
        state.value = String(rb.value || "");
        renderValue();
        onChange?.(state.value);
      });
    });
  }

  bClear.addEventListener("click", () => {
    state.value = "";
    renderList();
    renderValue();
    onChange?.(state.value);
  });

  renderList();
  renderValue();

  return {
    setItems: (arr) => {
      renderList(arr);
    },
    setValue: (v) => {
      state.value = String(v || "");
      renderList();
      renderValue();
    },
    clear: () => {
      state.value = "";
      renderList();
      renderValue();
      onChange?.(state.value);
    },
    getValue: () => state.value,
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
  clr.addEventListener("click", () => {
    inp.value = "";
    sync();
    inp.focus();
  });
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
      if (key === "daily") {
        renderFlujos();
        renderPlan();
        renderOutbox();
      }
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
    const [colabs, canales, flujos] = await Promise.all([API.colaboradoresList(), API.canalesList(), API.flujosList()]);
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
  try {
    S.habil = await API.habilitacionesList();
  } catch (e) {
    setErr(`Habilitaciones: ${e.message || e}`);
    S.habil = null;
  }
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

    // default: semana "Actual"
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

/* ========= Dashboard ========= */
function renderDashboard() {
  const rolesAgg = new Map();
  let presentesTotal = 0;
  let total = 0;

  // Presentismo stats
  const stats = S.presStats || {};
  const byRole = stats.byRole || [];

  byRole.forEach((r) => {
    const rol = r.rol || r.role || r.Rol || "";
    const bucket = roleBucket(rol);

    const t = Number(r.total || r.Total || 0);
    const p = Number(r.presentes || r.Presentes || 0);

    total += t;
    presentesTotal += p;

    const prev = rolesAgg.get(bucket) || { rol: bucket, total: 0, presentes: 0 };
    prev.total += t;
    prev.presentes += p;
    rolesAgg.set(bucket, prev);
  });

  $("dashPresentes").textContent = presentesTotal ? String(presentesTotal) : "—";
  $("dashPresentes2").textContent = total ? `${presentesTotal}/${total}` : "—";

  // Flujos activos hoy (>= 1 requerido)
  const flActivos = (S.flujos || []).filter((f) => Number(f.perfiles_requeridos || f.Perfiles_Requeridos || 0) > 0);
  $("dashFlujosActivos").textContent = String(flActivos.length || 0);
  $("dashFlujosActivos2").textContent = flActivos.length ? flActivos.map((x) => x.flujo || x.Flujo).join(" · ") : "—";

  // Outbox pendientes
  const out = S.outbox || [];
  const pend = out.filter((x) => !String(x.estado || x.Estado || "").toUpperCase().includes("ENVIADO"));
  $("dashOutboxPend").textContent = String(pend.length || 0);
  $("dashOutboxPend2").textContent = pend.length ? "Hay mensajes pendientes" : "—";

  // Tabla roles
  const arr = [...rolesAgg.values()];
  const st = S.sort.dashRoles || { key: "rol", dir: 1 };
  arr.sort((a, b) => {
    if (st.key === "total") return st.dir * (a.total - b.total);
    if (st.key === "presentes") return st.dir * (a.presentes - b.presentes);
    return st.dir * String(a.rol).localeCompare(String(b.rol));
  });

  const tb = $("tblDashRoles")?.querySelector("tbody");
  if (tb) {
    if (!arr.length) {
      tb.innerHTML = `<tr><td colspan="3" class="muted">Sin datos.</td></tr>`;
    } else {
      tb.innerHTML = arr
        .map((r) => `<tr><td>${escapeHtml(r.rol)}</td><td class="right">${r.total}</td><td class="right">${r.presentes}</td></tr>`)
        .join("");
    }
  }

  mountTableSort_("tblDashRoles", S.sort.dashRoles, (next) => {
    S.sort.dashRoles = next;
    renderDashboard();
  });
}

/* ========= Operativa diaria ========= */
function renderFlujos() {
  const tbl = $("tblFlujos")?.querySelector("tbody");
  if (!tbl) return;

  const fl = (S.flujos || []).slice().sort((a, b) => String(a.flujo || a.Flujo).localeCompare(String(b.flujo || b.Flujo)));

  if (!fl.length) {
    tbl.innerHTML = `<tr><td colspan="3" class="muted">Sin flujos.</td></tr>`;
    return;
  }

  tbl.innerHTML = fl
    .map((f) => {
      const flujo = f.flujo || f.Flujo;
      const req = Number(f.perfiles_requeridos ?? f.Perfiles_Requeridos ?? 0);
      return `
        <tr>
          <td><b>${escapeHtml(flujo)}</b></td>
          <td class="right">
            <input class="input" style="max-width:120px;text-align:right" data-flujo="${escapeAttr(flujo)}" type="number" min="0" step="1" value="${req}" />
          </td>
          <td class="right">
            <button class="btn ghost" data-del="${escapeAttr(flujo)}">Eliminar</button>
          </td>
        </tr>
      `;
    })
    .join("");

  // on change perfiles requeridos
  tbl.querySelectorAll("input[data-flujo]").forEach((inp) => {
    inp.addEventListener(
      "input",
      debounce(async (e) => {
        const flujo = e.target.getAttribute("data-flujo");
        const perfiles = Number(e.target.value || 0);
        try {
          await API.flujosUpsert(flujo, perfiles);
          S.flujos = await API.flujosList();
          renderDashboard();
        } catch (err) {
          setErr(`Operativa diaria: ${err.message || err}`);
        }
      }, 450)
    );
  });

  // delete
  tbl.querySelectorAll("button[data-del]").forEach((b) => {
    b.addEventListener("click", async () => {
      const flujo = b.getAttribute("data-del");
      try {
        setBusy("Operativa diaria", "Eliminando flujo...");
        await API.flujosDelete(flujo);
        S.flujos = await API.flujosList();
        renderFlujos();
        renderDashboard();
      } catch (err) {
        setErr(`Operativa diaria: ${err.message || err}`);
      } finally {
        clearBusy();
      }
    });
  });
}

function renderPlan() {
  const wrap = $("planGrid");
  if (!wrap) return;

  const plan = S.plan || [];
  if (!plan.length) {
    wrap.innerHTML = `<div class="muted">Sin planificación generada.</div>`;
    return;
  }

  // group by flujo
  const g = new Map();
  plan.forEach((p) => {
    const flujo = p.flujo || p.Flujo || "—";
    if (!g.has(flujo)) g.set(flujo, []);
    g.get(flujo).push(p);
  });

  const flujos = [...g.keys()].sort((a, b) => String(a).localeCompare(String(b)));

  wrap.innerHTML = flujos
    .map((flujo) => {
      const items = g.get(flujo) || [];
      const req = Number((S.flujos || []).find((f) => (f.flujo || f.Flujo) === flujo)?.perfiles_requeridos || 0);

      const ul = items
        .map((r) => {
          const id = r.id_meli || r.ID_MELI || "";
          const fijo = String(r.fijo || r.Fijo || "").toUpperCase() === "SI";
          return `<li>${escapeHtml(id)}${fijo ? ` <span class="muted">(fijo)</span>` : ""}</li>`;
        })
        .join("");

      return `
        <div class="flow-col">
          <h3>${escapeHtml(flujo)} <span class="muted">${items.length}/${req}</span></h3>
          <ul>${ul || `<li class="muted">Sin asignaciones.</li>`}</ul>
          <div class="row" style="margin-top:10px;justify-content:flex-end">
            <button class="btn" data-gen-msg="${escapeAttr(flujo)}">Generar mensaje</button>
          </div>
        </div>
      `;
    })
    .join("");

  wrap.querySelectorAll("button[data-gen-msg]").forEach((b) => {
    b.addEventListener("click", async () => {
      const flujo = b.getAttribute("data-gen-msg");
      try {
        setBusy("Operativa diaria", `Generando mensaje ${flujo}...`);
        // el backend expone el mensaje por flujo dentro de planificacion.list
        // (si tu backend lo devolviera por endpoint, acá lo llamarías)
        const plan2 = await API.planificacionList();
        S.plan = plan2 || [];
        // busca msg
        const msg = (S.plan || []).find((x) => (x.flujo || x.Flujo) === flujo)?.mensaje || "";
        if (msg) copyToClipboard(msg);
        else toast("Sin mensaje", "No hay mensaje para este flujo");
      } catch (err) {
        setErr(`Operativa diaria: ${err.message || err}`);
      } finally {
        clearBusy();
      }
    });
  });
}

async function onGenPlan() {
  setErr("");
  try {
    setBusy("Operativa diaria", "Generando planificación...");
    await API.planificacionGenerar();
    await refreshPlanAndOutbox();
    renderPlan();
    renderOutbox();
    renderDashboard();
    toast("Operativa diaria", "Planificación generada");
  } catch (e) {
    setErr(`Operativa diaria: ${e.message || e}`);
  } finally {
    clearBusy();
  }
}

/* ========= Slack Outbox ========= */
function renderOutbox() {
  const tb = $("tblOutbox")?.querySelector("tbody");
  if (!tb) return;

  const out = (S.outbox || []).slice().sort((a, b) => (b.row || 0) - (a.row || 0));
  if (!out.length) {
    tb.innerHTML = `<tr><td colspan="5" class="muted">Sin mensajes pendientes.</td></tr>`;
    return;
  }

  tb.innerHTML = out
    .map((r) => {
      const estado = r.estado || "";
      const isErr = estado.toUpperCase().includes("ERROR");
      const badge = isErr ? "pill bad" : estado.toUpperCase().includes("ENVIADO") ? "pill ok" : "pill";
      const date = r.fecha || "";
      const chId = r.channel_id || "";
      const canal = r.canal || "";
      const msg = r.mensaje || "";

      return `
        <tr>
          <td class="nowrap">${escapeHtml(date)}</td>
          <td class="nowrap">${escapeHtml(canal)}<div class="muted" style="font-size:11px">${escapeHtml(chId)}</div></td>
          <td style="max-width:520px">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(msg)}</div>
          </td>
          <td><span class="${badge}"><b>Estado</b> ${escapeHtml(estado || "PENDIENTE")}</span></td>
          <td class="right">
            <button class="btn" data-copy="${escapeAttr(msg)}">Copiar</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tb.querySelectorAll("button[data-copy]").forEach((b) => {
    b.addEventListener("click", () => copyToClipboard(unescapeAttr(b.getAttribute("data-copy"))));
  });
}

async function onGenOutbox() {
  setErr("");
  try {
    setBusy("Slack Outbox", "Generando outbox...");
    await API.slackOutboxGenerar();
    S.outbox = await API.slackOutboxList();
    renderOutbox();
    renderDashboard();
    toast("Slack Outbox", "Outbox generada");
  } catch (e) {
    setErr(`Slack Outbox: ${e.message || e}`);
  } finally {
    clearBusy();
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

  sel.innerHTML = rows
    .map((x) => `<option value="${escapeAttr(x.id)}">${escapeHtml(x.nombre)} (${escapeHtml(x.id)})</option>`)
    .join("");
}

function syncPresSemanaSelect_() {
  // Semana: mismo patrón UI que Roles/Equipo (ms). No cambio lógica de semanas; solo UI.
  const opts = (S.presSemanas || []).filter(Boolean);
  if (msSemanaPresCtrl) {
    msSemanaPresCtrl.setItems(opts);
    // Mantengo selección si existe; si no, vacío => "Actual"
    const current = S.presSemanaSel;
    if (current && opts.includes(current)) msSemanaPresCtrl.setValue(current);
    else msSemanaPresCtrl.setValue("");
  }
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

  const colabsById = new Map(
    (S.colabs || []).map((c) => {
      const v = colabRowView(c);
      return [v.id, v];
    })
  );

  const filtered = rows.filter((r) => {
    const meta = colabsById.get(r.id_meli) || { id: r.id_meli, nombre: r.nombre, rol: "", equipo: "" };
    const rb = roleBucket(meta.rol);

    if (S.fPres.roles.size > 0 && !S.fPres.roles.has(rb)) return false;
    if (S.fPres.equipos.size > 0 && !S.fPres.equipos.has(meta.equipo)) return false;

    const q = norm(S.fPres.q);
    if (q) {
      const hay = norm(meta.id).includes(q) || norm(meta.nombre).includes(q) || norm(meta.rol).includes(q) || norm(meta.equipo).includes(q);
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

  mountTableSort_("tblPresWeek", S.sort.pres, (next) => {
    S.sort.pres = next;
    renderPresentismo();
  });

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
          const v = r.vals && r.vals[d.key] ? String(r.vals[d.key]) : "";
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
  const idMeli = $("presSelectColab")?.value || "";
  const tipo = $("presTipo")?.value || "";
  const desde = $("presDesde")?.value || "";
  const hasta = $("presHasta")?.value || "";

  if (!idMeli || !tipo || !desde || !hasta) {
    toast("Faltan datos", "Completar colaborador, tipo, desde y hasta");
    return;
  }

  try {
    setBusy("Presentismo", "Guardando...");
    await API.presentismoSetLicencia(idMeli, desde, hasta, tipo);
    await refreshPresentismo();
    renderPresentismo();
    renderDashboard();
    toast("Presentismo", "Guardado");
  } catch (e) {
    setErr(`Presentismo: ${e.message || e}`);
  } finally {
    clearBusy();
  }
}

/* ========= Colaboradores ========= */
function renderColabs() {
  const tbl = $("tblColabs")?.querySelector("tbody");
  if (!tbl) return;

  const list = applySectionFilter(S.colabs || [], S.fColabs).map(colabRowView);

  const st = S.sort.colabs || { key: "nombre", dir: 1 };
  list.sort((a, b) => {
    const ka = a[st.key] ?? "";
    const kb = b[st.key] ?? "";
    if (typeof ka === "number" && typeof kb === "number") return st.dir * (ka - kb);
    return st.dir * String(ka).localeCompare(String(kb));
  });

  if (!list.length) {
    tbl.innerHTML = `<tr><td colspan="10" class="muted">Sin resultados.</td></tr>`;
    return;
  }

  tbl.innerHTML = list
    .map((r) => {
      const checked = S.selColabs.has(r.id) ? "checked" : "";
      return `
        <tr>
          <td class="right"><input type="checkbox" data-sel="${escapeAttr(r.id)}" ${checked} /></td>
          <td><b>${escapeHtml(r.nombre)}</b></td>
          <td class="nowrap">${escapeHtml(r.id)}</td>
          <td>${escapeHtml(roleBucket(r.rol))}</td>
          <td>${escapeHtml(r.equipo)}</td>
          <td>${escapeHtml(r.ubic)}</td>
          <td class="nowrap">${escapeHtml(r.slackId)}</td>
          <td>${escapeHtml(r.mailProd)}</td>
          <td>${escapeHtml(r.mailExt)}</td>
          <td class="nowrap">${escapeHtml(fmtDateAny(r.ingreso))}</td>
        </tr>
      `;
    })
    .join("");

  tbl.querySelectorAll("input[type=checkbox][data-sel]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.getAttribute("data-sel");
      if (!id) return;
      if (cb.checked) S.selColabs.add(id);
      else S.selColabs.delete(id);
      syncColabsSelPill();
    });
  });

  mountTableSort_("tblColabs", S.sort.colabs, (next) => {
    S.sort.colabs = next;
    renderColabs();
  });

  syncColabsSelPill();
}

function syncColabsSelPill() {
  const pill = $("colabsSelPill");
  if (!pill) return;
  pill.innerHTML = `<b>Seleccionados</b> ${S.selColabs.size}`;
}

function copySelected(field) {
  const arr = (S.colabs || []).map(colabRowView).filter((x) => S.selColabs.has(x.id));
  const out = arr.map((x) => x[field]).filter(Boolean).join("\n");
  if (!out) toast("Nada para copiar", "");
  else copyToClipboard(out);
}

/* ========= Habilitaciones ========= */
function renderHabil() {
  const tbl = $("tblHabil");
  if (!tbl) return;

  if (!S.habil || !S.habil.headers || !S.habil.rows) {
    tbl.querySelector("thead").innerHTML = `<tr><th>Estado</th></tr>`;
    tbl.querySelector("tbody").innerHTML = `<tr><td class="muted">No se pudo cargar.</td></tr>`;
    return;
  }

  const headers = S.habil.headers;
  const rows = S.habil.rows;

  // headers: first columns are base fields; the rest are flujos
  const fixed = ["ID_MELI", "Nombre", "Rol", "Equipo"];
  const flCols = headers.filter((h) => !fixed.includes(h));

  const colabsById = new Map(
    (S.colabs || []).map((c) => {
      const v = colabRowView(c);
      return [v.id, v];
    })
  );

  const filtered = rows.filter((r) => {
    const id = r.ID_MELI || r.id_meli || "";
    const meta = colabsById.get(id) || { id, rol: r.Rol || "", equipo: r.Equipo || "" };
    const rb = roleBucket(meta.rol);

    if (S.fHabil.roles.size > 0 && !S.fHabil.roles.has(rb)) return false;
    if (S.fHabil.equipos.size > 0 && !S.fHabil.equipos.has(meta.equipo)) return false;

    const q = norm(S.fHabil.q);
    if (q) {
      const hay =
        norm(id).includes(q) ||
        norm(meta.nombre || r.Nombre || "").includes(q) ||
        norm(meta.rol || r.Rol || "").includes(q) ||
        norm(meta.equipo || r.Equipo || "").includes(q);
      if (!hay) return false;
    }
    return true;
  });

  // header render
  tbl.querySelector("thead").innerHTML = `
    <tr>
      <th>ID_MELI</th>
      <th>Nombre</th>
      <th>Rol</th>
      <th>Equipo</th>
      ${flCols.map((c) => `<th class="right">${escapeHtml(c)}</th>`).join("")}
    </tr>
  `;

  // body render
  const tb = tbl.querySelector("tbody");
  if (!filtered.length) {
    tb.innerHTML = `<tr><td colspan="${4 + flCols.length}" class="muted">Sin resultados.</td></tr>`;
    return;
  }

  tb.innerHTML = filtered
    .map((r) => {
      const id = r.ID_MELI || r.id_meli || "";
      const nombre = r.Nombre || "";
      const rol = r.Rol || "";
      const equipo = r.Equipo || "";
      const tds = flCols
        .map((f) => {
          const v = String(r[f] || "").toUpperCase();
          const on = v === "SI" || v === "TRUE" || v === "1" || v === "HABILITADO";
          return `<td class="right">${on ? "✅" : ""}</td>`;
        })
        .join("");

      return `<tr>
        <td class="nowrap">${escapeHtml(id)}</td>
        <td><b>${escapeHtml(nombre)}</b></td>
        <td>${escapeHtml(roleBucket(rol))}</td>
        <td>${escapeHtml(equipo)}</td>
        ${tds}
      </tr>`;
    })
    .join("");
}

/* ========= HTML helpers ========= */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeAttr(s) {
  return escapeHtml(String(s ?? "")).replace(/`/g, "&#096;");
}
function unescapeAttr(s) {
  return String(s ?? "");
}

/* ========= main ========= */
async function main() {
  applyTheme();
  mountTabs();

  $("btnTheme")?.addEventListener("click", () => {
    S.theme = S.theme === "dark" ? "light" : "dark";
    applyTheme();
  });

  $("btnReloadAll")?.addEventListener("click", async () => {
    setErr("");
    setBusy("Cargando", "Actualizando todo...");
    await loadCore();
    clearBusy();
  });

  $("btnReloadColabs")?.addEventListener("click", async () => {
    setErr("");
    setBusy("Colaboradores", "Actualizando...");
    S.colabs = await API.colaboradoresList();
    renderColabs();
    clearBusy();
    toast("Colaboradores", "Actualizado");
  });

  $("btnReloadHabil")?.addEventListener("click", async () => {
    setErr("");
    setBusy("Habilitaciones", "Actualizando...");
    await refreshHabil();
    renderHabil();
    clearBusy();
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

  $("btnGenPlan")?.addEventListener("click", onGenPlan);
  $("btnGenOutbox")?.addEventListener("click", onGenOutbox);

  $("btnSetLicencia")?.addEventListener("click", onSetLicencia);

  // Filters
  const rolesList = ["Analista KV", "Analista PM", "Analista QA", "Líderes"];
  const rolesListHab = ["Analista KV", "Analista PM", "Analista QA"];

  const msRolesCol = mountMultiSelect("msRolesColabs", {
    title: "Roles",
    items: rolesList,
    onChange: (set) => {
      S.fColabs.roles = set;
      renderColabs();
    },
  });
  const msEquipCol = mountMultiSelect("msEquiposColabs", {
    title: "Equipo",
    items: EQUIPOS_PRESET,
    onChange: (set) => {
      S.fColabs.equipos = set;
      renderColabs();
    },
  });

  const msRolesHab = mountMultiSelect("msRolesHabil", {
    title: "Roles",
    items: rolesListHab,
    onChange: (set) => {
      S.fHabil.roles = set;
      renderHabil();
    },
  });
  const msEquipHab = mountMultiSelect("msEquiposHabil", {
    title: "Equipo",
    items: EQUIPOS_PRESET,
    onChange: (set) => {
      S.fHabil.equipos = set;
      renderHabil();
    },
  });

  const msRolesPres = mountMultiSelect("msRolesPres", {
    title: "Roles",
    items: rolesList,
    onChange: (set) => {
      S.fPres.roles = set;
      renderPresentismo();
    },
  });
  const msEquipPres = mountMultiSelect("msEquiposPres", {
    title: "Equipo",
    items: EQUIPOS_PRESET,
    onChange: (set) => {
      S.fPres.equipos = set;
      renderPresentismo();
    },
  });

  // Semana (mismo patrón UI que Roles y Equipo)
  msSemanaPresCtrl = mountSingleSelectMs("msSemanaPres", {
    title: "Semana",
    items: S.presSemanas || [],
    emptyLabel: "Actual",
    onChange: async (val) => {
      S.presSemanaSel = String(val || "").trim(); // "" => semana actual
      setBusy("Presentismo", S.presSemanaSel ? `Cargando ${S.presSemanaSel}...` : "Cargando semana actual...");
      await refreshPresentismo();
      renderPresentismo();
      renderDashboard();
      clearBusy();
    },
  });
  syncPresSemanaSelect_();

  mountSearch("searchColabs", "searchColabsWrap", "clearSearchColabs", (q) => {
    S.fColabs.q = q;
    renderColabs();
  });
  mountSearch("searchHabil", "searchHabilWrap", "clearSearchHabil", (q) => {
    S.fHabil.q = q;
    renderHabil();
  });
  mountSearch("searchPres", "searchPresWrap", "clearSearchPres", (q) => {
    S.fPres.q = q;
    renderPresentismo();
  });

  $("btnClearColabs")?.addEventListener("click", () => {
    S.fColabs = { roles: new Set(), equipos: new Set(), q: "" };
    msRolesCol?.clear();
    msEquipCol?.clear();
    $("searchColabs").value = "";
    $("searchColabsWrap").classList.remove("has");
    renderColabs();
  });

  $("btnClearHabil")?.addEventListener("click", () => {
    S.fHabil = { roles: new Set(), equipos: new Set(), q: "" };
    msRolesHab?.clear();
    msEquipHab?.clear();
    $("searchHabil").value = "";
    $("searchHabilWrap").classList.remove("has");
    renderHabil();
  });

  $("btnClearPres")?.addEventListener("click", () => {
    S.fPres = { roles: new Set(), equipos: new Set(), q: "" };
    msRolesPres?.clear();
    msEquipPres?.clear();
    $("searchPres").value = "";
    $("searchPresWrap").classList.remove("has");
    renderPresentismo();
  });

  $("btnClearSelColabs")?.addEventListener("click", () => {
    S.selColabs.clear();
    renderColabs();
  });

  $("btnCopySelIds")?.addEventListener("click", () => copySelected("id"));
  $("btnCopySelMailProd")?.addEventListener("click", () => copySelected("mailProd"));
  $("btnCopySelMailExt")?.addEventListener("click", () => copySelected("mailExt"));

  await loadCore();
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => setErr(`Error: ${e.message || e}`));
});
