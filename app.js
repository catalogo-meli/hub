// app.js (ESM)
import { API } from "/api.js";

const ROLES_BUCKETS = ["Analista KV", "Analista PM", "Analista QA", "Líderes", "Otros"];
const EQUIPOS_PRESET = [
  "Celeste Cignoli",
  "José Puentes",
  "Matías López",
  "Matías Minczuk",
  "Victoria Tofalo",
  "Mariana Arias",
  "Catalina Mantilla",
  "Otro",
];

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}
function escapeAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}
function unescapeAttr(s) {
  return String(s ?? "").replace(/&quot;/g, '"');
}

function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function fmt_(d, fmt) {
  const z = (n) => String(n).padStart(2, "0");
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = z(d.getMonth() + 1);
  const dd = z(d.getDate());
  const HH = z(d.getHours());
  const MM = z(d.getMinutes());
  if (fmt === "dd/MM/yyyy") return `${dd}/${mm}/${yyyy}`;
  if (fmt === "yyyy-MM-dd") return `${yyyy}-${mm}-${dd}`;
  if (fmt === "HH:mm") return `${HH}:${MM}`;
  if (fmt === "dd/MM HH:mm") return `${dd}/${mm} ${HH}:${MM}`;
  return d.toISOString();
}

function todayYMD() {
  return fmt_(new Date(), "yyyy-MM-dd");
}

function fmtDateAny(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [dd, mm, yyyy] = s.slice(0, 10).split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return fmt_(d, "yyyy-MM-dd");
  return s;
}

function copyText(t) {
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

  const state = { selected: new Set() }; // vacío = sin filtro (Todos)

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

function setTheme(t) {
  S.theme = t;
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("hub_theme", t);
}

function toggleTheme() {
  setTheme(S.theme === "dark" ? "light" : "dark");
}

function setErr(msg) {
  const box = $("errBox");
  if (!box) return;
  box.textContent = msg || "";
  box.style.display = msg ? "block" : "none";
}

function toast(t1, t2 = "") {
  const box = $("toast");
  if (!box) return;
  $("toastT1").textContent = t1;
  $("toastT2").textContent = t2;
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), 2200);
}

/* ========= Helpers (domain) ========= */
function roleBucket(role) {
  const r = norm(role);
  if (r.includes("kv")) return "Analista KV";
  if (r.includes("qa")) return "Analista QA";
  if (r.includes("pm")) return "Analista PM";
  if (r.includes("team leader") || r.includes("tl") || r.includes("coordin")) return "Líderes";
  return "Otros";
}

function isAnalista_(role) {
  const b = roleBucket(role);
  return b === "Analista KV" || b === "Analista PM" || b === "Analista QA";
}

function colabRowView(r) {
  // tolera schema viejo/nuevo
  const id = r.id_meli || r.USER_ASIGNADO || r.user || r.id || "";
  const nombre = r.nombre || r.NOMBRE || r.Nombre || "";
  const rol = r.rol || r.ROL || r.Rol || "";
  const equipo = r.equipo || r.EQUIPO || r.Equipo || "";
  const ingreso = r.ingreso || r.INGRESO || r.Ingreso || "";
  const mailProd = r.mail_prod || r.MAIL_PROD || r.MailProd || "";
  const mailExt = r.mail_ext || r.MAIL_EXT || r.MailExt || "";
  return { id, nombre, rol, equipo, ingreso, mailProd, mailExt };
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

/* ========= Presentismo Stats ========= */
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

function updateDailyMissingAlert_() {
  const el = $("dailyMissing");
  if (!el) return;

  const reqTotal = (S.flujos || []).reduce(
    (acc, f) => acc + (Number(f.perfiles_requeridos ?? f.cantidad ?? 0) || 0),
    0
  );

  const disponibles = countAnalistasDisponiblesHoy_();
  const faltan = Math.max(0, reqTotal - disponibles);

  // visible y simple: rojo si falta, verde si ok
  el.innerHTML = faltan > 0
    ? `<span class="badge bad">Faltan asignar: ${faltan}</span>`
    : `<span class="badge ok">Cobertura OK</span>`;
}

/* ========= Loaders ========= */
async function refreshAll() {
  setErr("");
  try {
    const [colabs, canales, flujos, habil, plan, outbox, presWeek, presStats] = await Promise.all([
      API.colabsList(),
      API.canalesList(),
      API.flujosList(),
      API.habilGet(),
      API.planList(),
      API.slackOutboxList(),
      API.presentismoWeek(),
      API.presentismoStats(),
    ]);

    S.colabs = colabs || [];
    S.canales = canales || [];
    S.flujos = flujos || [];
    S.habil = habil || null;
    S.plan = plan || [];
    S.outbox = outbox || [];
    S.presWeek = presWeek || null;
    S.presStats = presStats || null;

    renderDashboard();
    renderFlujos();
    renderPlan();
    renderOutbox();
    renderColabs();
    renderHabil();
    renderPresentismo();
    updateDailyMissingAlert_();
  } catch (e) {
    setErr(e?.message || String(e));
  }
}

async function refreshPlanAndOutbox() {
  const [plan, outbox] = await Promise.all([API.planList(), API.slackOutboxList()]);
  S.plan = plan || [];
  S.outbox = outbox || [];
  renderPlan();
  renderOutbox();
}

/* ========= Dashboard ========= */
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

  // presentes hoy por bucket (desde presWeek)
  const presByBucket = new Map();
  if (S.presWeek?.days?.length && S.presWeek?.rows?.length) {
    const today = todayYMD();
    const colabsById = new Map(colabs.map((v) => [v.id, v]));
    for (const r of S.presWeek.rows) {
      const v = r.vals?.[today];
      if (String(v || "").trim() !== "P") continue;
      const meta = colabsById.get(r.id_meli);
      const b = roleBucket(meta?.rol || "");
      presByBucket.set(b, (presByBucket.get(b) || 0) + 1);
    }
  }

  const pres = S.presStats?.presentes ?? 0;
  const analistasHoy = countAnalistasDisponiblesHoy_();
  const flujosActivos = (S.flujos || []).filter((f) => Number(f.perfiles_requeridos ?? f.cantidad ?? 0) >= 1).length;

  kpi.innerHTML = `
    <div class="kpi"><div class="v">${total}</div><div class="l">Colaboradores</div></div>
    <div class="kpi"><div class="v">${pres}</div><div class="l">Presentes hoy</div></div>
    <div class="kpi"><div class="v">${analistasHoy}</div><div class="l">Analistas disponibles hoy</div></div>
    <div class="kpi"><div class="v">${flujosActivos}</div><div class="l">Flujos activos hoy</div></div>
  `;

  // filas
  const rows = ROLES_BUCKETS.map((rol) => ({
    rol,
    nomina: counts.get(rol) || 0,
    presentes: presByBucket.get(rol) || 0,
  }));

  // sort (asc/desc por encabezado)
  const { key, dir } = S.sort.dashRoles || { key: "rol", dir: 1 };
  rows.sort((a, b) => {
    const av = a?.[key] ?? "";
    const bv = b?.[key] ?? "";
    if (typeof av === "number" && typeof bv === "number") return dir * (av - bv);
    return dir * String(av).localeCompare(String(bv));
  });

  tb.innerHTML = rows
    .map((x) => `<tr><td>${escapeHtml(x.rol)}</td><td class="right">${x.nomina}</td><td class="right">${x.presentes}</td></tr>`)
    .join("");

  // activar sort headers si existen
  mountTableSort_("tblDashRoles", S.sort.dashRoles, (s) => {
    S.sort.dashRoles = s;
    renderDashboard();
  });
}

/* ========= Daily - Flujos ========= */
const saveFlujoDebounced = debounce(async (flujo, perfiles) => {
  try {
    $("dailyStatus").textContent = "Guardando...";
    await API.flujosUpsert(flujo, perfiles, "");
    S.flujos = await API.flujosList();
    renderFlujos();
    $("dailyStatus").textContent = "Listo";
  } catch (e) {
    $("dailyStatus").textContent = "Error";
    setErr(e?.message || String(e));
  }
}, 450);

async function onFlujoDelete(flujo) {
  setErr("");
  try {
    $("dailyStatus").textContent = "Borrando...";
    await API.flujosDelete(flujo);
    S.flujos = await API.flujosList();
    renderFlujos();
    $("dailyStatus").textContent = "Listo";
  } catch (e) {
    $("dailyStatus").textContent = "Error";
    setErr(e?.message || String(e));
  }
}

async function onDailyGenerate() {
  setErr("");
  try {
    $("dailyStatus").textContent = "Generando...";
    await API.planificacionGenerar();
    await API.slackOutboxGenerar();
    await refreshPlanAndOutbox();
    await API.presentismoWeek().then((x) => (S.presWeek = x || null));
    await API.presentismoStats().then((x) => (S.presStats = x || null));
    renderDashboard();
    renderPresentismo();
    updateDailyMissingAlert_();
    $("dailyStatus").textContent = "Listo";
    toast("Operativa diaria", "Planificación y Outbox generadas");
  } catch (e) {
    $("dailyStatus").textContent = "Error";
    setErr(e?.message || String(e));
  }
}

async function onDailyRefresh() {
  await refreshAll();
  $("dailyStatus").textContent = "Listo";
}

function renderFlujos() {
  const tb = $("tblFlujos")?.querySelector("tbody");
  if (!tb) return;

  const flujos = (S.flujos || []).slice().sort((a, b) => norm(a.flujo).localeCompare(norm(b.flujo)));
  if (!flujos.length) {
    tb.innerHTML = `<tr><td colspan="4" class="muted">Sin flujos.</td></tr>`;
  } else {
    tb.innerHTML = flujos
      .map((f) => {
        const flujo = f.flujo || f.Flujo || f.nombre || "";
        const perfiles = Number(f.perfiles_requeridos ?? f.cantidad ?? f.perfiles ?? 0) || 0;
        return `
        <tr>
          <td class="nowrap"><b>${escapeHtml(flujo)}</b></td>
          <td class="right"><input class="input right" data-flujo="${escapeAttr(flujo)}" data-perfiles value="${perfiles}" type="number" min="0" step="1" style="max-width:120px" /></td>
          <td class="right"><button class="btn ghost" data-del data-flujo="${escapeAttr(flujo)}">Eliminar</button></td>
        </tr>
        `;
      })
      .join("");
  }

  // new flow
  $("newFlujoName")?.addEventListener("input", () => {});
  $("newFlujoReq")?.addEventListener("input", () => {});

  tb.querySelectorAll("input[data-perfiles]").forEach((inp) => {
    const flujo = inp.getAttribute("data-flujo") || "";
    inp.addEventListener("input", () => {
      const perfiles = Number(inp.value || 0) || 0;
      saveFlujoDebounced(unescapeAttr(flujo), perfiles);
    });
    inp.addEventListener("blur", () => {
      const perfiles = Number(inp.value || 0) || 0;
      saveFlujoDebounced(unescapeAttr(flujo), perfiles);
    });
  });

  tb.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const flujo = btn.getAttribute("data-flujo") || "";
      if (!confirm(`Eliminar flujo "${unescapeAttr(flujo)}"?`)) return;
      await onFlujoDelete(unescapeAttr(flujo));
    });
  });

  // alerta: faltantes vs presentes hoy
  updateDailyMissingAlert_();
}

async function onFlujoAdd() {
  setErr("");
  const name = ($("newFlujoName")?.value || "").trim();
  const req = Number(($("newFlujoReq")?.value || "").trim() || 0) || 0;
  if (!name) return setErr("Flujos: escribí el nombre del flujo.");

  try {
    $("dailyStatus").textContent = "Guardando...";
    await API.flujosUpsert(name, req, "");
    S.flujos = await API.flujosList();
    renderFlujos();
    $("newFlujoName").value = "";
    $("newFlujoReq").value = "";
    $("dailyStatus").textContent = "Listo";
  } catch (e) {
    $("dailyStatus").textContent = "Error";
    setErr(e?.message || String(e));
  }
}

/* ========= Plan ========= */
function planRowView(r) {
  return {
    flujo: r.flujo || r.Flujo || "",
    perfiles_requeridos: Number(r.perfiles_requeridos ?? r.Perfiles_requeridos ?? r.perfiles ?? 0) || 0,
    user_asignado: r.user_asignado || r.USER_ASIGNADO || "",
    asignado_por: r.asignado_por || r.ASIGNADO_POR || "",
    asignado_en: r.asignado_en || r.ASIGNADO_EN || "",
  };
}

function renderPlan() {
  const tb = $("tblPlan")?.querySelector("tbody");
  if (!tb) return;

  const rows = (S.plan || []).map(planRowView).filter((x) => x.flujo);
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="5" class="muted">Sin planificación.</td></tr>`;
    return;
  }

  tb.innerHTML = rows
    .map((r) => {
      const aen = r.asignado_en ? fmt_(r.asignado_en, "dd/MM HH:mm") : "";
      return `
      <tr>
        <td class="nowrap">${escapeHtml(r.flujo)}</td>
        <td class="right">${r.perfiles_requeridos}</td>
        <td class="nowrap">${escapeHtml(r.user_asignado)}</td>
        <td class="nowrap">${escapeHtml(r.asignado_por)}</td>
        <td class="nowrap">${escapeHtml(aen)}</td>
      </tr>
      `;
    })
    .join("");
}

/* ========= Slack Outbox ========= */
const outboxAutosave = debounce(async (row, canal, channel_id, mensaje) => {
  try {
    const canalName = (S.canales || []).find((c) => c.channel_id === channel_id)?.canal || canal || "";
    await API.slackOutboxUpdate(row, canalName, channel_id, mensaje);
    // refresh row list (light)
    S.outbox = await API.slackOutboxList();
    renderOutbox();
  } catch (e) {
    setErr(`Outbox autosave: ${e?.message || String(e)}`);
  }
}, 450);

async function onOutboxSend(row) {
  setErr("");
  try {
    const res = await API.slackSendRow(row);
    if (!res?.ok && res?.error) throw new Error(res.error);
    S.outbox = await API.slackOutboxList();
    renderOutbox();
    toast("Outbox", "Enviado");
  } catch (e) {
    setErr(`Slack: ${e?.message || String(e)}`);
  }
}

function renderOutbox() {
  const tb = $("tblOutbox")?.querySelector("tbody");
  if (!tb) return;

  const out = (S.outbox || []).slice().sort((a, b) => (b.row || 0) - (a.row || 0));
  if (!out.length) {
    tb.innerHTML = `<tr><td colspan="5" class="muted">Sin mensajes pendientes.</td></tr>`;
    return;
  }

  // Convierte ISO Z a dd/mm/yyyy HH:mm (hora local del navegador)
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

  tb.innerHTML = out
    .map((r) => {
      const rawEstado = r.estado || "";
      const estado = formatEstado(rawEstado);

      const estUp = String(rawEstado || "").toUpperCase();
      const isErr = estUp.includes("ERROR");
      const isSent = estUp.includes("ENVIADO");
      const isProg = estUp.includes("PROGRAMADO");

      const badge = isErr ? "badge bad" : isSent ? "badge ok" : "badge";
      const date = r.fecha || "";
      const chId = r.channel_id || "";
      const msg = r.mensaje || "";
      const row = r.row;

      // Acciones:
      // - ENVIADO: no mostrar programar/enviar ni el datetime
      // - PROGRAMADO: mostrar datetime solo lectura y sin botones
      // - PENDIENTE/ERROR: mostrar todo
      const accionesHtml = isSent
        ? ""
        : isProg
          ? `
            <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
              <input class="input" type="datetime-local" data-when value="${escapeAttr(r.programado_para || "")}" style="max-width:220px" disabled />
              <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="btn ghost" data-prog disabled title="Ya está programado">Programar</button>
                <button class="btn primary" data-send disabled title="Ya está programado">Enviar</button>
              </div>
            </div>
          `
          : `
            <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
              <input class="input" type="datetime-local" data-when value="${escapeAttr(r.programado_para || "")}" style="max-width:220px" />
              <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="btn ghost" data-prog>Programar</button>
                <button class="btn primary" data-send>Enviar</button>
              </div>
            </div>
          `;

      return `
        <tr data-row="${row}" data-sent="${isSent ? "1" : "0"}" data-prog="${isProg ? "1" : "0"}">
          <td class="nowrap">${escapeHtml(date)}</td>
          <td>
            <select data-ch ${isSent ? "disabled" : ""}>${channelOptionsHtml(chId)}</select>
          </td>
          <td>
            <textarea data-msg ${isSent ? "disabled" : ""}>${escapeHtml(msg)}</textarea>
          </td>
          <td class="nowrap"><span class="${badge}">${escapeHtml(estado)}</span></td>
          <td class="right nowrap">${accionesHtml}</td>
        </tr>
      `;
    })
    .join("");

  tb.querySelectorAll("tr").forEach((tr) => {
    const row = Number(tr.getAttribute("data-row"));
    const isSent = tr.getAttribute("data-sent") === "1";
    const isProg = tr.getAttribute("data-prog") === "1";

    const sel = tr.querySelector("[data-ch]");
    const txt = tr.querySelector("[data-msg]");
    const when = tr.querySelector("[data-when]");

    // Si ya fue enviado, no hay listeners
    if (isSent) return;

    const triggerSave = () => outboxAutosave(row, sel.value, txt.value);

    sel?.addEventListener("change", triggerSave);
    txt?.addEventListener("input", triggerSave);
    txt?.addEventListener("blur", triggerSave);

    tr.querySelector("[data-prog]")?.addEventListener("click", async () => {
      setErr("");
      try {
        // Si ya está programado, no permitir reprogramar desde UI (evita duplicados)
        if (isProg) return;

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
      // Si ya está programado, no permitir enviar manual (evita duplicados)
      if (isProg) return;

      // guardo antes de enviar
      const canal = (S.canales || []).find((c) => c.channel_id === sel.value)?.canal || "";
      await API.slackOutboxUpdate(row, canal, sel.value, txt.value);
      await onOutboxSend(row);
    });
  });
}

function channelOptionsHtml(selected) {
  const opts = (S.canales || []).slice().sort((a, b) => norm(a.canal).localeCompare(norm(b.canal)));
  const sel = String(selected || "");
  const none = `<option value="">—</option>`;
  const items = opts
    .map((c) => {
      const id = c.channel_id || c.Channel_ID || "";
      const name = c.canal || c.Canal || "";
      const label = id ? `${name} (${id})` : `${name}`;
      const s = id === sel ? "selected" : "";
      return `<option value="${escapeAttr(id)}" ${s}>${escapeHtml(label)}</option>`;
    })
    .join("");
  return none + items;
}

/* ========= Habilitaciones ========= */
function habilRowView(r) {
  // normaliza
  const meta = colabRowView(r);
  const habilitado = String(r.habilitado ?? r.Habilitado ?? r.H ?? "");
  const fijo = String(r.fijo ?? r.Fijo ?? r.F ?? "");
  const flujo = r.flujo || r.Flujo || "";
  return { ...r, _meta: meta, habilitado, fijo, flujo };
}

async function onHabilSet(id, flujo, habilitado, fijo) {
  setErr("");
  try {
    await API.habilSet(id, flujo, habilitado, fijo);
    S.habil = await API.habilGet();
    renderHabil();
    toast("Habilitaciones", "Actualizado");
  } catch (e) {
    setErr(e?.message || String(e));
  }
}

function renderHabil() {
  const tb = $("tblHabil")?.querySelector("tbody");
  if (!tb) return;

  const raw = S.habil?.rows || [];
  const rows = raw.map(habilRowView);
  const filtered = applySectionFilter(rows, S.fHabil);

  // sort
  const { key, dir } = S.sort.habil || { key: "", dir: 1 };
  const sorted = filtered.slice().sort((a, b) => {
    const av = key === "nombre" ? a._meta.nombre : (a?.[key] ?? "");
    const bv = key === "nombre" ? b._meta.nombre : (b?.[key] ?? "");
    return dir * String(av).localeCompare(String(bv));
  });

  // render
  if (!sorted.length) {
    tb.innerHTML = `<tr><td colspan="5" class="muted">No se pudo cargar habilitaciones.</td></tr>`;
    return;
  }

  tb.innerHTML = sorted
    .map((r) => {
      const v = r._meta;
      const rb = roleBucket(v.rol);
      const h = String(r.habilitado || "").toUpperCase() === "H";
      const f = String(r.fijo || "").toUpperCase() === "F";
      const ch = (x) => (x ? "checked" : "");
      return `
      <tr>
        <td class="nowrap">${escapeHtml(v.nombre)} <span class="muted">(${escapeHtml(v.id)})</span></td>
        <td class="nowrap">${escapeHtml(rb)}</td>
        <td class="nowrap">${escapeHtml(v.equipo)}</td>
        <td class="nowrap">${escapeHtml(r.flujo)}</td>
        <td class="right nowrap">
          <label class="toggle"><input type="checkbox" data-h ${ch(h)} /><span>H</span></label>
          <label class="toggle"><input type="checkbox" data-f ${ch(f)} /><span>F</span></label>
        </td>
      </tr>`;
    })
    .join("");

  // handlers
  tb.querySelectorAll("tr").forEach((tr, idx) => {
    const r = sorted[idx];
    const id = colabRowView(r).id || r._meta.id;
    const flujo = r.flujo;
    const cbH = tr.querySelector("input[data-h]");
    const cbF = tr.querySelector("input[data-f]");
    cbH?.addEventListener("change", () => onHabilSet(id, flujo, cbH.checked ? "H" : "", cbF.checked ? "F" : ""));
    cbF?.addEventListener("change", () => onHabilSet(id, flujo, cbH.checked ? "H" : "", cbF.checked ? "F" : ""));
  });

  mountTableSort_("tblHabil", S.sort.habil, (s) => {
    S.sort.habil = s;
    renderHabil();
  });
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

  if (!sorted.length) {
    tb.innerHTML = `<tr><td colspan="6" class="muted">Sin colaboradores.</td></tr>`;
    return;
  }

  tb.innerHTML = sorted
    .map((r) => {
      const rb = roleBucket(r.rol);
      return `
      <tr>
        <td class="nowrap"><b>${escapeHtml(r.nombre)}</b><div class="muted">${escapeHtml(r.id)}</div></td>
        <td class="nowrap">${escapeHtml(rb)}</td>
        <td class="nowrap">${escapeHtml(r.equipo)}</td>
        <td class="nowrap">${escapeHtml(fmtDateAny(r.ingreso))}</td>
        <td class="nowrap">${escapeHtml(r.mailProd)}</td>
        <td class="nowrap">${escapeHtml(r.mailExt)}</td>
      </tr>
      `;
    })
    .join("");

  mountTableSort_("tblColabs", S.sort.colabs, (s) => {
    S.sort.colabs = s;
    renderColabs();
  });
}

/* ========= Presentismo ========= */
function renderPresentismo() {
  const tb = $("tblPres")?.querySelector("tbody");
  if (!tb) return;

  const data = S.presWeek;
  if (!data?.rows?.length || !data?.days?.length) {
    tb.innerHTML = `<tr><td colspan="10" class="muted">No se pudo cargar.</td></tr>`;
    return;
  }

  const days = data.days; // ["2026-01-12", ...]
  const rows = data.rows || [];

  const colabsById = new Map((S.colabs || []).map((c) => {
    const v = colabRowView(c);
    return [v.id, v];
  }));

  // build view rows
  const view = rows
    .map((r) => {
      const meta = colabsById.get(r.id_meli) || { id: r.id_meli, nombre: r.nombre || r.id_meli, rol: "", equipo: "" };
      const v = {
        id: meta.id,
        nombre: meta.nombre || r.nombre || meta.id,
        rol: roleBucket(meta.rol || ""),
        equipo: meta.equipo || "",
        vals: r.vals || {},
      };
      return v;
    })
    .filter((v) => {
      if (S.fPres.roles.size > 0 && !S.fPres.roles.has(v.rol)) return false;
      if (S.fPres.equipos.size > 0 && !S.fPres.equipos.has(v.equipo)) return false;
      const q = norm(S.fPres.q);
      if (q) {
        const hay = norm(v.nombre).includes(q) || norm(v.id).includes(q) || norm(v.rol).includes(q) || norm(v.equipo).includes(q);
        if (!hay) return false;
      }
      return true;
    });

  // sort
  const { key, dir } = S.sort.pres || { key: "nombre", dir: 1 };
  const sorted = view.slice().sort((a, b) => {
    const av = a?.[key] ?? "";
    const bv = b?.[key] ?? "";
    return dir * String(av).localeCompare(String(bv));
  });

  // header days already in html; render rows
  tb.innerHTML = sorted
    .map((r) => {
      const cols = days
        .map((d) => `<td class="center">${escapeHtml(r.vals?.[d] || "")}</td>`)
        .join("");
      return `
      <tr>
        <td class="nowrap"><b>${escapeHtml(r.nombre)}</b><div class="muted">${escapeHtml(r.id)}</div></td>
        <td class="nowrap">${escapeHtml(r.rol)}</td>
        <td class="nowrap">${escapeHtml(r.equipo)}</td>
        ${cols}
      </tr>`;
    })
    .join("");

  mountTableSort_("tblPres", S.sort.pres, (s) => {
    S.sort.pres = s;
    renderPresentismo();
  });
}

/* ========= Mount filters ========= */
function mountFilters() {
  // Search inputs
  $("qColabs")?.addEventListener("input", (e) => { S.fColabs.q = e.target.value || ""; renderColabs(); });
  $("qHabil")?.addEventListener("input", (e) => { S.fHabil.q = e.target.value || ""; renderHabil(); });
  $("qPres")?.addEventListener("input", (e) => { S.fPres.q = e.target.value || ""; renderPresentismo(); });

  // Clear buttons
  $("clearColabs")?.addEventListener("click", () => { S.fColabs.q = ""; $("qColabs").value = ""; S.fColabs.roles.clear(); S.fColabs.equipos.clear(); renderColabs(); });
  $("clearHabil")?.addEventListener("click", () => { S.fHabil.q = ""; $("qHabil").value = ""; S.fHabil.roles.clear(); S.fHabil.equipos.clear(); renderHabil(); });
  $("clearPres")?.addEventListener("click", () => { S.fPres.q = ""; $("qPres").value = ""; S.fPres.roles.clear(); S.fPres.equipos.clear(); renderPresentismo(); });

  const rolesList = ROLES_BUCKETS.filter((x) => x !== "Otros");
  const rolesListHab = ["Analista KV", "Analista PM", "Analista QA"];

  mountMultiSelect("msRolesColabs", { title: "Roles", items: rolesList, onChange: (set) => { S.fColabs.roles = set; renderColabs(); }});
  mountMultiSelect("msEquiposColabs", { title: "Equipo", items: EQUIPOS_PRESET, onChange: (set) => { S.fColabs.equipos = set; renderColabs(); }});

  mountMultiSelect("msRolesHabil", { title: "Roles", items: rolesListHab, onChange: (set) => { S.fHabil.roles = set; renderHabil(); }});
  mountMultiSelect("msEquiposHabil", { title: "Equipo", items: EQUIPOS_PRESET, onChange: (set) => { S.fHabil.equipos = set; renderHabil(); }});

  mountMultiSelect("msRolesPres", { title: "Roles", items: rolesList, onChange: (set) => { S.fPres.roles = set; renderPresentismo(); }});
  mountMultiSelect("msEquiposPres", { title: "Equipo", items: EQUIPOS_PRESET, onChange: (set) => { S.fPres.equipos = set; renderPresentismo(); }});
}

/* ========= Tabs ========= */
function mountTabs() {
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab").forEach((t) => t.classList.add("hidden"));
      document.querySelectorAll("[data-tab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      $(key)?.classList.remove("hidden");

      // refresh view-specific
      if (key === "dash") renderDashboard();
      if (key === "daily") { renderFlujos(); renderPlan(); renderOutbox();  updateDailyMissingAlert_(); }
      if (key === "colabs") renderColabs();
      if (key === "habil") renderHabil();
      if (key === "pres") renderPresentismo();
    });
  });
}

/* ========= Bind buttons ========= */
function bindActions() {
  $("btnTheme")?.addEventListener("click", toggleTheme);

  $("btnDailyGenerate")?.addEventListener("click", onDailyGenerate);
  $("btnDailyRefresh")?.addEventListener("click", onDailyRefresh);
  $("btnFlujoAdd")?.addEventListener("click", onFlujoAdd);
}

/* ========= Init ========= */
(function init() {
  setTheme(S.theme);
  mountTabs();
  mountFilters();
  bindActions();
  refreshAll();
})();
