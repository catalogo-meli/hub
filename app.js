// app.js (ESM)
import { API } from "/api.js";

const ROLES_PRESET = [
  { key: "Analista KV", match: ["kv", "analista kv"] },
  { key: "Analista PM", match: ["pm", "analista pm", "analista"] },
  { key: "Analista QA", match: ["qa", "analista qa"] },
  { key: "Líderes", match: ["tl", "team leader", "pm líder", "lider", "líder", "cp", "coordin"] },
];

const EQUIPOS_PRESET = [
  "Celeste Cignoli",
  "José Puentes",
  "Matías López",
  "Matías Minczuk",
];

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function fmtDateDMY(isoYMD) {
  // iso: yyyy-mm-dd
  if (!isoYMD) return "";
  const [y, m, d] = isoYMD.split("-").map(Number);
  if (!y || !m || !d) return isoYMD;
  return `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`;
}

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function roleBucket(raw) {
  const r = norm(raw);
  for (const p of ROLES_PRESET) {
    if (p.match.some((m) => r.includes(norm(m)))) return p.key;
  }
  return raw ? String(raw) : "Sin rol";
}

function copyToClipboard(text) {
  const t = String(text ?? "");
  if (!t) return;
  navigator.clipboard?.writeText(t).then(
    () => toast("Copiado", t),
    () => toast("No se pudo copiar", t)
  );
}

/* ========= MultiSelect minimal ========= */
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
        <button class="btn ghost" type="button" data-ms-all>Todos</button>
        <button class="btn ghost" type="button" data-ms-none>Ninguno</button>
      </div>
    </div>
  `;

  const state = { selected: new Set() };

  const btn = host.querySelector(".ms-btn");
  const panel = host.querySelector(".ms-panel");
  const list = host.querySelector("[data-ms-list]");
  const value = host.querySelector("[data-ms-value]");
  const bAll = host.querySelector("[data-ms-all]");
  const bNone = host.querySelector("[data-ms-none]");

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
  function open() {
    host.classList.add("open");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    host.classList.toggle("open");
  });
  document.addEventListener("click", () => close());
  panel.addEventListener("click", (e) => e.stopPropagation());

  bAll.addEventListener("click", () => {
    state.selected.clear();
    renderList();
    renderValue();
    onChange?.(new Set(state.selected));
  });
  bNone.addEventListener("click", () => {
    state.selected = new Set(items);
    renderList();
    renderValue();
    onChange?.(new Set(state.selected));
  });

  renderList();
  renderValue();

  return {
    getSelected: () => new Set(state.selected),
    setSelected: (set) => {
      state.selected = new Set(set);
      renderList();
      renderValue();
    },
    clear: () => {
      state.selected.clear();
      renderList();
      renderValue();
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
  clr.addEventListener("click", () => {
    inp.value = "";
    sync();
    inp.focus();
  });
  sync();
}

/* ========= App State ========= */
const S = {
  theme: localStorage.getItem("hub_theme") || "dark",

  colabs: [],
  canales: [],
  flujos: [],
  habil: null, // { flujos:[], rows:[] }
  plan: [],
  outbox: [],
  presWeek: null, // {days, rows}
  presStats: null,

  // section filters
  fColabs: { roles: new Set(), equipos: new Set(), q: "" },
  fHabil: { roles: new Set(), equipos: new Set(), q: "" },
  fPres: { roles: new Set(), equipos: new Set(), q: "" },
};

/* ========= Theme ========= */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", S.theme);
  localStorage.setItem("hub_theme", S.theme);
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
      ["daily", "dashboard", "colabs", "habil", "pres"].forEach((k) => {
        const sec = $(`tab_${k}`);
        if (sec) sec.style.display = k === key ? "" : "none";
      });

      // lazy refresh
      if (key === "dashboard") renderDashboard();
      if (key === "colabs") renderColabs();
      if (key === "habil") renderHabil();
      if (key === "pres") renderPresentismo();
    });
  });
}

/* ========= Data load ========= */
async function loadCore() {
  setErr("");
  try {
    const [colabs, canales, flujos] = await Promise.all([
      API.colaboradoresList(),
      API.canalesList(),
      API.flujosList(),
    ]);
    S.colabs = colabs || [];
    S.canales = canales || [];
    S.flujos = flujos || [];

    renderFlujos();
    await refreshPlanAndOutbox(); // also updates dashboard counters
    await refreshHabil();
    await refreshPresentismo();

    mountPresentismoSelect();
    renderDashboard();
    renderColabs();
    renderHabil();
    renderPresentismo();

    toast("Listo", "Datos cargados");
  } catch (e) {
    setErr(`Error: ${e.message || e}`);
  }
}

async function refreshPlanAndOutbox() {
  try {
    const [plan, outbox] = await Promise.all([API.planificacionList(), API.slackOutboxList()]);
    S.plan = plan || [];
    S.outbox = outbox || [];
    renderPlan();
    renderOutbox();
  } catch (e) {
    setErr(`Error: ${e.message || e}`);
  }
}

async function refreshHabil() {
  try {
    S.habil = await API.habilitacionesList();
  } catch (e) {
    // no rompas el resto del hub por esto, pero sí mostrale el error
    setErr(`Habilitaciones: ${e.message || e}`);
    S.habil = null;
  }
}

function todayYMD() {
  // local date -> yyyy-mm-dd
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function refreshPresentismo() {
  try {
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

/* ========= Operativa diaria: Flujos ========= */
function renderFlujos() {
  const tb = $("tblFlujos")?.querySelector("tbody");
  if (!tb) return;

  const rows = (S.flujos || []).slice().sort((a, b) => String(a.flujo).localeCompare(String(b.flujo)));
  tb.innerHTML = rows
    .map((f) => {
      const name = f.flujo ?? "";
      const req = Number(f.perfiles_requeridos ?? f.cantidad ?? 0) || 0;
      return `
        <tr data-flujo="${String(name).replace(/"/g, "&quot;")}">
          <td><b>${name}</b></td>
          <td class="right nowrap" style="min-width:170px">
            <input class="input" type="number" min="0" step="1" value="${req}" data-req />
          </td>
          <td class="right nowrap">
            <button class="btn ghost" data-save>Guardar</button>
            <button class="btn ghost" data-del>Borrar</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tb.querySelectorAll("tr").forEach((tr) => {
    const flujo = tr.getAttribute("data-flujo");
    const inp = tr.querySelector("[data-req]");
    tr.querySelector("[data-save]")?.addEventListener("click", async () => {
      const perfiles = Number(inp.value || 0) || 0;
      await onFlujoSave(flujo, perfiles);
    });
    tr.querySelector("[data-del]")?.addEventListener("click", async () => {
      if (!confirm(`Borrar flujo "${flujo}"?`)) return;
      await onFlujoDelete(flujo);
    });
  });
}

async function onFlujoSave(flujo, perfiles) {
  setErr("");
  try {
    $("dailyStatus").textContent = "Guardando...";
    await API.flujosUpsert(flujo, perfiles, ""); // channel_id prescindible acá
    S.flujos = await API.flujosList();
    renderFlujos();
    toast("Guardado", `Flujo: ${flujo}`);
  } catch (e) {
    setErr(`Flujos: ${e.message || e}`);
  } finally {
    $("dailyStatus").textContent = "Listo";
  }
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

/* ========= Planificación (columnas por flujo) ========= */
function renderPlan() {
  const host = $("planGrid");
  if (!host) return;

  const plan = (S.plan || []).filter((r) => r?.flujo);
  if (!plan.length) {
    host.innerHTML = `<div class="muted">Sin planificación cargada.</div>`;
    return;
  }

  const by = {};
  for (const r of plan) {
    const f = r.flujo;
    by[f] = by[f] || [];
    by[f].push(r);
  }

  const flujosOrden = Object.keys(by).sort((a, b) => a.localeCompare(b));

  host.innerHTML = flujosOrden
    .map((f) => {
      const items = by[f] || [];
      const lis = items
        .map((x) => {
          const fijo = x.es_fijo === "SI" ? " ⭐" : "";
          const name = x.nombre || x.id_meli || "";
          return `<li>${name}${fijo}</li>`;
        })
        .join("");
      return `
        <div class="flow-col">
          <h3>${f}</h3>
          <ul>${lis || `<li class="muted">—</li>`}</ul>
        </div>
      `;
    })
    .join("");
}

/* ========= Slack Outbox ========= */
function channelOptionsHtml(selectedId = "") {
  const opts = [`<option value="">—</option>`].concat(
    (S.canales || []).map((c) => {
      const id = c.channel_id || "";
      const name = c.canal || "";
      const sel = id === selectedId ? "selected" : "";
      return `<option value="${id}" ${sel}>${name} (${id})</option>`;
    })
  );
  return opts.join("");
}

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
      const badge = isErr ? "badge bad" : estado.toUpperCase().includes("ENVIADO") ? "badge ok" : "badge";
      const date = r.fecha || "";
      const chId = r.channel_id || "";
      const msg = r.mensaje || "";
      const row = r.row;

      return `
        <tr data-row="${row}">
          <td class="nowrap">${date}</td>
          <td>
            <select data-ch>${channelOptionsHtml(chId)}</select>
          </td>
          <td>
            <textarea data-msg>${escapeHtml(msg)}</textarea>
          </td>
          <td class="nowrap"><span class="${badge}">${escapeHtml(estado)}</span></td>
          <td class="right nowrap">
            <button class="btn ghost" data-save>Guardar</button>
            <button class="btn primary" data-send>Enviar</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tb.querySelectorAll("tr").forEach((tr) => {
    const row = Number(tr.getAttribute("data-row"));
    const sel = tr.querySelector("[data-ch]");
    const txt = tr.querySelector("[data-msg]");

    tr.querySelector("[data-save]")?.addEventListener("click", async () => {
      await onOutboxSave(row, sel.value, txt.value);
    });
    tr.querySelector("[data-send]")?.addEventListener("click", async () => {
      await onOutboxSave(row, sel.value, txt.value);
      await onOutboxSend(row);
    });
  });
}

async function onOutboxSave(row, channel_id, mensaje) {
  setErr("");
  try {
    const canal = (S.canales || []).find((c) => c.channel_id === channel_id)?.canal || "";
    await API.slackOutboxUpdate(row, canal, channel_id, mensaje);
    S.outbox = await API.slackOutboxList();
    renderOutbox();
    toast("Outbox", "Guardado");
  } catch (e) {
    setErr(`Outbox: ${e.message || e}`);
  }
}

async function onOutboxSend(row) {
  setErr("");
  try {
    await API.slackOutboxEnviar(row);
    S.outbox = await API.slackOutboxList();
    renderOutbox();
    toast("Slack", "Enviado");
  } catch (e) {
    setErr(`Slack: ${e.message || e}`);
  }
}

/* ========= Colaboradores ========= */
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
  const mailProd = getField(c, ["Mail_Productora", "Mail productora", "MailProductora", "mail_productora"]);
  const mailExt = getField(c, ["Mail_Externo", "Mail externo", "MailExterno", "mail_externo"]);
  const ingreso = getField(c, ["Fecha_Ingreso", "Fecha ingreso", "Ingreso", "fecha_ingreso"]);
  return { id, nombre, rol, equipo, ubic, mailProd, mailExt, ingreso };
}

function applySectionFilter(list, f) {
  const q = norm(f.q);
  const rolesSel = f.roles;     // empty => todos
  const equiposSel = f.equipos; // empty => todos

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

function renderColabs() {
  const tb = $("tblColabs")?.querySelector("tbody");
  if (!tb) return;

  const filtered = applySectionFilter(S.colabs || [], S.fColabs);

  if (!filtered.length) {
    tb.innerHTML = `<tr><td colspan="8" class="muted">Sin resultados.</td></tr>`;
    return;
  }

  tb.innerHTML = filtered
    .map((c) => {
      const v = colabRowView(c);
      return `
        <tr>
          <td class="copyable" data-copy="${escapeAttr(v.id)}">${escapeHtml(v.id)}</td>
          <td>${escapeHtml(v.nombre)}</td>
          <td>${escapeHtml(roleBucket(v.rol))}</td>
          <td>${escapeHtml(v.equipo)}</td>
          <td>${escapeHtml(v.ubic)}</td>
          <td class="copyable" data-copy="${escapeAttr(v.mailProd)}">${escapeHtml(v.mailProd)}</td>
          <td class="copyable" data-copy="${escapeAttr(v.mailExt)}">${escapeHtml(v.mailExt)}</td>
          <td class="nowrap">${escapeHtml(String(v.ingreso || ""))}</td>
        </tr>
      `;
    })
    .join("");

  tb.querySelectorAll("[data-copy]").forEach((el) => {
    el.addEventListener("click", () => copyToClipboard(el.getAttribute("data-copy")));
  });
}

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
  // columns: usuario + (flujo -> habil + fijo)
  head.innerHTML = `
    <tr>
      <th style="min-width:220px">Colaborador</th>
      ${flujos.map((f) => `<th class="nowrap">${escapeHtml(f)}<div class="muted" style="font-size:11px;margin-top:2px">H / ⭐</div></th>`).join("")}
    </tr>
  `;

  // build base colabs map for rol/equipo filters
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
                <span class="muted">⭐</span>
              </label>
            </td>
          `;
        })
        .join("");

      return `<tr><td>${escapeHtml(label)}</td>${cells}</tr>`;
    })
    .join("");

  // events
  body.querySelectorAll("input[data-h]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const idMeli = cb.getAttribute("data-id");
      const flujo = cb.getAttribute("data-flujo");
      const habilitado = cb.checked;
      // si deshabilita, también apaga fijo
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

      // fijo implica habilitado
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

  const days = S.presWeek.days; // [{key,label,isFeriado}]
  const rows = S.presWeek.rows; // [{id_meli,nombre,vals:{key:value}}]

  // filtrar por rol/equipo/q usando colabsById
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

  // header
  const thead = tbl.querySelector("thead");
  thead.innerHTML = `
    <tr>
      <th style="min-width:240px">Colaborador</th>
      ${days.map((d) => `<th class="nowrap ${d.isFeriado ? "feriado" : ""}">${fmtDateDMY(d.key)}</th>`).join("")}
    </tr>
  `;

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
          return `<td class="${cls}">${escapeHtml(v)}</td>`;
        })
        .join("");
      return `<tr><td>${escapeHtml(label)}</td>${tds}</tr>`;
    })
    .join("");
}

async function onSetLicencia() {
  setErr("");
  try {
    const idMeli = $("presSelectColab").value;
    const tipo = $("presTipo").value;
    const desde = $("presDesde").value; // yyyy-mm-dd
    const hasta = $("presHasta").value || desde;

    if (!idMeli) throw new Error("Seleccioná un colaborador.");
    if (!desde) throw new Error("Seleccioná fecha Desde.");

    await API.presentismoSetLicencia(idMeli, desde, hasta, tipo);
    await refreshPresentismo();
    renderPresentismo();
    toast("Presentismo", "Licencia guardada");
  } catch (e) {
    setErr(`Presentismo: ${e.message || e}`);
  }
}

/* ========= Dashboard ========= */
function renderDashboard() {
  const kpi = $("dashKpis");
  const tb = $("tblDashRoles")?.querySelector("tbody");
  if (!kpi || !tb) return;

  const colabs = (S.colabs || []).map(colabRowView).filter((x) => x.id);
  const total = colabs.length;

  // roles buckets
  const counts = new Map();
  for (const c of colabs) {
    const b = roleBucket(c.rol);
    counts.set(b, (counts.get(b) || 0) + 1);
  }

  // presentes hoy
  const pres = S.presStats?.presentes ?? 0;
  const aus = S.presStats?.ausentes ?? 0;

  // slack pendientes
  const pend = (S.outbox || []).filter((x) => String(x.estado || "").toUpperCase().startsWith("PENDIENTE")).length;

  // plan count
  const planCount = (S.plan || []).filter((x) => x?.flujo).length;

  kpi.innerHTML = `
    <div class="kpi"><div class="v">${total}</div><div class="l">Colaboradores</div></div>
    <div class="kpi"><div class="v">${pres}</div><div class="l">Presentes hoy</div></div>
    <div class="kpi"><div class="v">${planCount}</div><div class="l">Asignaciones hoy</div></div>
    <div class="kpi"><div class="v">${pend}</div><div class="l">Slack pendientes</div></div>
  `;

  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  tb.innerHTML = ordered.map(([rol, n]) => `<tr><td>${escapeHtml(rol)}</td><td class="right">${n}</td></tr>`).join("");
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
function cssEsc(s) {
  // escape for querySelector attribute
  return String(s ?? "").replaceAll('"', '\\"');
}

async function main() {
  applyTheme();
  mountTabs();

  $("btnTheme")?.addEventListener("click", () => {
    S.theme = S.theme === "dark" ? "light" : "dark";
    applyTheme();
  });

  $("btnHealth")?.addEventListener("click", async () => {
    setErr("");
    try {
      const h = await API.health();
      toast("Health", JSON.stringify(h));
    } catch (e) {
      setErr(`Health: ${e.message || e}`);
    }
  });

  // Daily actions
  $("btnGenerarPlan")?.addEventListener("click", async () => {
    setErr("");
    try {
      $("dailyStatus").textContent = "Generando planificación...";
      await API.planificacionGenerar();
      await refreshPlanAndOutbox(); // plan updates
      await refreshPresentismo();   // stats maybe
      renderDashboard();
      toast("Planificación", "Generada");
    } catch (e) {
      setErr(`Planificación: ${e.message || e}`);
    } finally {
      $("dailyStatus").textContent = "Listo";
    }
  });

  $("btnGenerarOutbox")?.addEventListener("click", async () => {
    setErr("");
    try {
      $("dailyStatus").textContent = "Generando Outbox...";
      await API.slackOutboxGenerar();
      await refreshPlanAndOutbox();
      renderDashboard();
      toast("Outbox", "Generado");
    } catch (e) {
      setErr(`Outbox: ${e.message || e}`);
    } finally {
      $("dailyStatus").textContent = "Listo";
    }
  });

  $("btnEnviarTodos")?.addEventListener("click", async () => {
    setErr("");
    try {
      $("dailyStatus").textContent = "Enviando...";
      await API.slackOutboxEnviar(); // sin row => batch
      await refreshPlanAndOutbox();
      renderDashboard();
      toast("Slack", "Procesado");
    } catch (e) {
      setErr(`Slack: ${e.message || e}`);
    } finally {
      $("dailyStatus").textContent = "Listo";
    }
  });

  $("btnAddFlujo")?.addEventListener("click", async () => {
    const name = $("newFlujoName")?.value?.trim() || "";
    const req = Number($("newFlujoReq")?.value || 0) || 0;
    if (!name) return setErr("Flujos: escribí el nombre del flujo.");
    await onFlujoSave(name, req);
    $("newFlujoName").value = "";
    $("newFlujoReq").value = "";
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
    toast("Colaboradores", "Actualizado");
  });
  $("btnReloadHabil")?.addEventListener("click", async () => {
    await refreshHabil();
    renderHabil();
    toast("Habilitaciones", "Actualizado");
  });
  $("btnReloadPres")?.addEventListener("click", async () => {
    await refreshPresentismo();
    mountPresentismoSelect();
    renderPresentismo();
    renderDashboard();
    toast("Presentismo", "Actualizado");
  });

  $("btnSetLicencia")?.addEventListener("click", onSetLicencia);

  // Filters: mount multiselects
  const rolesList = ROLES_PRESET.map((r) => r.key);
  const equiposList = EQUIPOS_PRESET;

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
    items: equiposList,
    onChange: (set) => {
      S.fColabs.equipos = set;
      renderColabs();
    },
  });

  const msRolesHab = mountMultiSelect("msRolesHabil", {
    title: "Roles",
    items: rolesList,
    onChange: (set) => {
      S.fHabil.roles = set;
      renderHabil();
    },
  });
  const msEquipHab = mountMultiSelect("msEquiposHabil", {
    title: "Equipo",
    items: equiposList,
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
    items: equiposList,
    onChange: (set) => {
      S.fPres.equipos = set;
      renderPresentismo();
    },
  });

  // Search inputs (with X)
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

  // Clear buttons
  $("btnClearColabs")?.addEventListener("click", () => {
    S.fColabs = { roles: new Set(), equipos: new Set(), q: "" };
    msRolesCol?.clear(); msEquipCol?.clear();
    $("searchColabs").value = "";
    $("searchColabsWrap").classList.remove("has");
    renderColabs();
  });
  $("btnClearHabil")?.addEventListener("click", () => {
    S.fHabil = { roles: new Set(), equipos: new Set(), q: "" };
    msRolesHab?.clear(); msEquipHab?.clear();
    $("searchHabil").value = "";
    $("searchHabilWrap").classList.remove("has");
    renderHabil();
  });
  $("btnClearPres")?.addEventListener("click", () => {
    S.fPres = { roles: new Set(), equipos: new Set(), q: "" };
    msRolesPres?.clear(); msEquipPres?.clear();
    $("searchPres").value = "";
    $("searchPresWrap").classList.remove("has");
    renderPresentismo();
  });

  // Initial load
  await loadCore();
}

document.addEventListener("DOMContentLoaded", () => {
  // evita pantalla en blanco por error no manejado
  main().catch((e) => setErr(`Error: ${e.message || e}`));
});
