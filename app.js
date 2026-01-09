// app.js (ESM)
import { API } from "./api.js";

/*****************
 * Utils
 *****************/
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

function esc(s) {
  return (s ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2600);
}

function showError(err) {
  const box = $("#errorBox");
  const text = $("#errorText");
  if (!box || !text) return;
  text.textContent = err?.message || String(err);
  box.classList.remove("hidden");
}
function clearError() {
  const box = $("#errorBox");
  if (box) box.classList.add("hidden");
}

function fmtDateDMY(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yy = dt.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function fmtISO(d) {
  const dt = new Date(d);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function mondayOf(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 dom
  const diff = (day === 0 ? -6 : 1) - day; // lunes
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copiado");
  } catch {
    toast("No pude copiar (permiso del navegador)");
  }
}

function iconSun() {
  return `
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" stroke-width="2"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}
function iconMoon() {
  return `
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M21 13.2A7.5 7.5 0 0 1 10.8 3a9 9 0 1 0 10.2 10.2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
}

/*****************
 * State
 *****************/
const state = {
  tab: "dashboard",
  theme: localStorage.getItem("hub_theme") || "dark",

  colaboradores: [],
  canales: [],

  flujos: [],
  plan: [],
  outbox: [],

  habs: [],

  presWeekFrom: mondayOf(new Date()),
  pres: null,

  filters: {
    colab: { role: "ALL", team: "ALL", q: "" },
    hab: { role: "ALL", team: "ALL", q: "" },
    pres: { role: "ALL", team: "ALL", q: "" },
  },
};

const ROLE_GROUPS = [
  { key: "ALL", label: "Roles: Todos" },
  { key: "PM", label: "Analista PM" },
  { key: "KV", label: "Analista KV" },
  { key: "QA", label: "Analista QA" },
  { key: "LEADS", label: "Líderes" },
];

const TEAM_OPTIONS = [
  { key: "ALL", label: "Equipo: Todos" },
  { key: "Celeste Cignoli", label: "Celeste Cignoli" },
  { key: "José Puentes", label: "José Puentes" },
  { key: "Matías López", label: "Matías López" },
  { key: "Matías Minczuk", label: "Matías Minczuk" },
];

function roleGroupOf(c) {
  const r = (c.rol || "").toLowerCase();
  if (r.includes("kv")) return "KV";
  if (r.includes("qa")) return "QA";
  // si no es kv/qa y es líder por rol
  if (r.includes("tl") || r.includes("team leader") || r.includes("cp") || r.includes("coordin") || r.includes("pm ")) return "LEADS";
  // default PM analysts
  if (r.includes("pm")) return "PM";
  // fallback (asumimos PM)
  return "PM";
}

function isLead(c) {
  return roleGroupOf(c) === "LEADS";
}

function setupTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  const icon = $("#themeIcon");
  if (icon) icon.innerHTML = state.theme === "dark" ? iconSun() : iconMoon();
}

function setTheme(next) {
  state.theme = next;
  localStorage.setItem("hub_theme", next);
  setupTheme();
}

/*****************
 * Tabs
 *****************/
function setTab(tab) {
  state.tab = tab;
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("#tabDashboard").classList.toggle("hidden", tab !== "dashboard");
  $("#tabOperativa").classList.toggle("hidden", tab !== "operativa");
  $("#tabColaboradores").classList.toggle("hidden", tab !== "colaboradores");
  $("#tabHabilitaciones").classList.toggle("hidden", tab !== "habilitaciones");
  $("#tabPresentismo").classList.toggle("hidden", tab !== "presentismo");
}

function bindTabs() {
  $("#navTabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    setTab(b.dataset.tab);
    // refresco suave según tab
    if (state.tab === "dashboard") refreshDashboard().catch(showError);
    if (state.tab === "operativa") refreshOperativa().catch(showError);
    if (state.tab === "colaboradores") renderColaboradores();
    if (state.tab === "habilitaciones") renderHabilitaciones();
    if (state.tab === "presentismo") renderPresentismo();
  });
}

/*****************
 * Load base data
 *****************/
async function loadBase() {
  clearError();
  const [colabs, canales] = await Promise.all([API.colaboradoresList(), API.canalesList()]);
  state.colaboradores = colabs || [];
  state.canales = canales || [];
}

async function refreshOperativa() {
  clearError();
  $("#operStatus").textContent = "Actualizando…";
  const [flujos, plan, outbox] = await Promise.all([
    API.flujosList(),
    API.planificacionList(),
    API.slackOutboxList(),
  ]);
  state.flujos = flujos || [];
  state.plan = plan || [];
  state.outbox = outbox || [];
  renderFlujos();
  renderPlanificacion();
  renderOutbox();
  $("#operStatus").textContent = "";
}

async function refreshDashboard() {
  clearError();
  const stats = await API.presentismoStats().catch(() => null);

  // distribución por rol (según colaboradores)
  const pm = state.colaboradores.filter((c) => roleGroupOf(c) === "PM").length;
  const kv = state.colaboradores.filter((c) => roleGroupOf(c) === "KV").length;
  const qa = state.colaboradores.filter((c) => roleGroupOf(c) === "QA").length;
  const leads = state.colaboradores.filter((c) => roleGroupOf(c) === "LEADS").length;

  $("#dashPm").textContent = String(pm);
  $("#dashKv").textContent = String(kv);
  $("#dashQa").textContent = String(qa);
  $("#dashLeads").textContent = String(leads);

  if (stats?.disponibles_hoy != null) {
    $("#dashDispHoy").textContent = String(stats.disponibles_hoy);
    $("#dashFecha").textContent = stats.hoy || "—";
  } else {
    $("#dashDispHoy").textContent = "—";
    $("#dashFecha").textContent = "—";
  }
}

async function refreshColabs() {
  await loadBase();
  renderColaboradores();
}

async function refreshHabs() {
  clearError();
  const [flujos, habs] = await Promise.all([API.flujosList(), API.habilitacionesList()]);
  state.flujos = flujos || [];
  state.habs = habs || [];
  renderHabilitaciones();
}

async function refreshPres() {
  clearError();
  const from = fmtISO(state.presWeekFrom);
  const pres = await API.presentismoWeek(from);
  state.pres = pres;
  renderPresentismo();
}

/*****************
 * Operativa: Flujos
 *****************/
const saveFlowDebounced = debounce(async (flujo, req) => {
  await API.flujosUpsert(flujo, Number(req || 0), "");
  toast("Flujo guardado");
  // refresco flujos
  state.flujos = await API.flujosList();
  renderFlujos();
}, 350);

function renderFlujos() {
  const host = $("#flujosList");
  host.innerHTML = "";

  const flujos = [...(state.flujos || [])].sort((a, b) => (a.flujo || "").localeCompare(b.flujo || ""));

  flujos.forEach((f) => {
    const row = document.createElement("div");
    row.className = "flujos";
    row.innerHTML = `
      <div class="card" style="padding:10px 12px;border-radius:16px">
        <div style="font-weight:750">${esc(f.flujo)}</div>
      </div>
      <input class="field small" type="number" min="0" max="99" value="${Number(f.perfiles_requeridos || 0)}" aria-label="Req. ${esc(f.flujo)}">
      <button class="xbtn" title="Eliminar flujo" aria-label="Eliminar ${esc(f.flujo)}">×</button>
    `;
    const reqEl = row.querySelector("input");
    const delEl = row.querySelector("button");

    reqEl.addEventListener("input", () => {
      const v = Math.max(0, Math.min(99, Number(reqEl.value || 0)));
      reqEl.value = String(v);
      saveFlowDebounced(f.flujo, v);
    });

    delEl.addEventListener("click", async () => {
      if (!confirm(`Eliminar flujo "${f.flujo}"?`)) return;
      await API.flujosDelete(f.flujo);
      toast("Flujo eliminado");
      state.flujos = await API.flujosList();
      renderFlujos();
    });

    host.appendChild(row);
  });
}

async function addFlow() {
  const name = ($("#newFlujo").value || "").trim();
  const req = Number($("#newReq").value || 0);
  if (!name) return toast("Poné nombre de flujo");
  await API.flujosUpsert(name, Math.max(0, Math.min(99, req)), "");
  $("#newFlujo").value = "";
  $("#newReq").value = "";
  toast("Flujo agregado");
  state.flujos = await API.flujosList();
  renderFlujos();
}

/*****************
 * Operativa: Planificación
 *****************/
function groupPlanByFlujo(planRows) {
  const map = new Map();
  (planRows || []).forEach((r) => {
    const flujo = r.flujo || r.Flujo || r[1];
    if (!flujo) return;
    if (!map.has(flujo)) map.set(flujo, []);
    map.get(flujo).push(r);
  });
  return map;
}

function renderPlanificacion() {
  const host = $("#planificacionGrid");
  const plan = state.plan || [];
  host.innerHTML = "";

  if (!plan.length) {
    host.innerHTML = `<div class="subtle">Sin planificación cargada.</div>`;
    $("#planStamp").textContent = "—";
    return;
  }

  // stamp
  const f0 = plan[0]?.fecha || plan[0]?.Fecha || plan[0]?.[0];
  $("#planStamp").textContent = f0 ? fmtDateDMY(f0) : "—";

  const by = groupPlanByFlujo(plan);
  const flujos = [...by.keys()].sort((a, b) => a.localeCompare(b));

  // layout "armonioso": grid con 2 columnas si hay muchos
  const cols = flujos.length >= 6 ? 3 : flujos.length >= 3 ? 2 : 1;
  host.style.display = "grid";
  host.style.gridTemplateColumns = `repeat(${cols}, minmax(0,1fr))`;
  host.style.gap = "12px";

  flujos.forEach((flujo) => {
    const rows = by.get(flujo) || [];
    const ids = rows
      .map((r) => r.id_meli || r.ID_MELI || r[2])
      .filter((x) => x && x !== "SIN PERFILES DISPONIBLES");

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row" style="margin-bottom:8px">
        <div style="font-weight:800">${esc(flujo)}</div>
        <div class="spacer"></div>
        <button class="btn" data-action="genmsg">Generar mensaje</button>
      </div>
      <div class="subtle">${ids.length ? ids.map(esc).join(" · ") : "Sin perfiles"}</div>
    `;

    card.querySelector('[data-action="genmsg"]').addEventListener("click", async () => {
      // no hay endpoint para "solo un flujo": generamos outbox completo y listo
      await API.slackOutboxGenerar();
      state.outbox = await API.slackOutboxList();
      renderOutbox();
      toast(`Mensaje generado (Outbox)`);
      // scroll a outbox
      $("#outboxTable").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    host.appendChild(card);
  });
}

/*****************
 * Operativa: Outbox
 *****************/
const outboxSaveDebounced = debounce(async (row, canal, channel_id, mensaje) => {
  await API.slackOutboxUpdate(row, canal, channel_id, mensaje);
  toast("Guardado");
  state.outbox = await API.slackOutboxList();
  renderOutbox();
}, 350);

function renderOutbox() {
  const body = $("#outboxBody");
  body.innerHTML = "";

  const canales = state.canales || [];
  const out = (state.outbox || []).map((r, idx) => ({ ...r, _row: r.row ?? idx + 2 })); // fallback

  if (!out.length) {
    body.innerHTML = `<tr><td colspan="5" class="subtle">Sin pendientes.</td></tr>`;
    return;
  }

  out.forEach((r) => {
    const tr = document.createElement("tr");

    const fecha = r.fecha || r.Fecha || "";
    const canalName = r.canal || r.Canal || "";
    const channelId = r.channel_id || r.Slack_Channel_ID || "";
    const msg = r.mensaje || r.Mensaje || "";
    const estado = r.estado || r.Estado || "";

    const opts = [`<option value="">—</option>`]
      .concat(
        canales.map((c) => {
          const id = c.channel_id || c.Slack_channel || c.Slack_channel_ID || c.id || "";
          const name = c.canal || c.Canal || c.name || "";
          const selected = id && id === channelId ? "selected" : "";
          // Mostrar “nombre (ID)”
          return `<option value="${esc(id)}" ${selected}>${esc(name)} (${esc(id)})</option>`;
        })
      )
      .join("");

    tr.innerHTML = `
      <td>${esc(fmtDateDMY(fecha))}</td>
      <td>
        <select class="field" style="min-width:260px" data-k="channel">${opts}</select>
      </td>
      <td>
        <textarea class="field" style="width:100%;min-height:64px;resize:vertical" data-k="msg">${esc(msg)}</textarea>
      </td>
      <td>${esc(estado)}</td>
      <td>
        <button class="btn primary" data-k="send">Enviar</button>
      </td>
    `;

    const sel = tr.querySelector('[data-k="channel"]');
    const ta = tr.querySelector('[data-k="msg"]');
    const btn = tr.querySelector('[data-k="send"]');

    sel.addEventListener("change", () => {
      const id = sel.value;
      const canal = sel.options[sel.selectedIndex]?.textContent || canalName || "";
      outboxSaveDebounced(r._row, canal, id, ta.value);
    });
    ta.addEventListener("input", () => {
      const id = sel.value;
      const canal = sel.options[sel.selectedIndex]?.textContent || canalName || "";
      outboxSaveDebounced(r._row, canal, id, ta.value);
    });

    btn.addEventListener("click", async () => {
      await API.slackOutboxEnviar(r._row);
      state.outbox = await API.slackOutboxList();
      renderOutbox();
      toast("Enviado");
    });

    body.appendChild(tr);
  });
}

/*****************
 * Colaboradores
 *****************/
function fillSelect(el, options) {
  el.innerHTML = options.map((o) => `<option value="${esc(o.key)}">${esc(o.label)}</option>`).join("");
}

function renderColaboradores() {
  const roleSel = $("#colabRole");
  const teamSel = $("#colabTeam");
  const qEl = $("#colabSearch");

  fillSelect(roleSel, ROLE_GROUPS);
  fillSelect(teamSel, TEAM_OPTIONS);
  roleSel.value = state.filters.colab.role;
  teamSel.value = state.filters.colab.team;
  qEl.value = state.filters.colab.q;

  const rows = state.colaboradores
    .filter((c) => {
      const rg = roleGroupOf(c);
      const f = state.filters.colab;
      if (f.role !== "ALL") {
        if (f.role === "LEADS") return rg === "LEADS";
        return rg === f.role;
      }
      return true;
    })
    .filter((c) => (state.filters.colab.team === "ALL" ? true : (c.equipo || "") === state.filters.colab.team))
    .filter((c) => {
      const q = (state.filters.colab.q || "").trim().toLowerCase();
      if (!q) return true;
      const blob = `${c.nombre || ""} ${c.id_meli || ""} ${c.rol || ""} ${c.equipo || ""} ${c.mail_productora || ""} ${c.mail_externo || ""} ${c.fecha_ingreso || ""}`.toLowerCase();
      return blob.includes(q);
    });

  const body = $("#colabBody");
  body.innerHTML = "";

  rows.forEach((c) => {
    const tr = document.createElement("tr");
    const nombre = c.nombre || "";
    const id = c.id_meli || "";
    const rol = c.rol || "";
    const equipo = c.equipo || "";
    const mp = c.mail_productora || "";
    const me = c.mail_externo || "";
    const fi = c.fecha_ingreso || "";

    tr.innerHTML = `
      <td>${esc(nombre)}</td>
      <td><span class="copy" data-copy="${esc(id)}">${esc(id)}</span></td>
      <td>${esc(rol)}</td>
      <td>${esc(equipo)}</td>
      <td>${mp ? `<span class="copy" data-copy="${esc(mp)}">${esc(mp)}</span>` : ""}</td>
      <td>${me ? `<span class="copy" data-copy="${esc(me)}">${esc(me)}</span>` : ""}</td>
      <td>${fi ? `<span class="copy" data-copy="${esc(fi)}">${esc(fi)}</span>` : ""}</td>
    `;
    body.appendChild(tr);
  });

  // copy handler
  body.onclick = (e) => {
    const el = e.target.closest("[data-copy]");
    if (!el) return;
    copyText(el.dataset.copy);
  };
}

/*****************
 * Habilitaciones
 *****************/
function renderHabilitaciones() {
  // roles SIN Líderes
  const roleSel = $("#habRole");
  const rolesHabs = ROLE_GROUPS.filter((r) => r.key !== "LEADS");
  fillSelect(roleSel, rolesHabs);

  const teamSel = $("#habTeam");
  fillSelect(teamSel, TEAM_OPTIONS);

  roleSel.value = state.filters.hab.role === "LEADS" ? "ALL" : state.filters.hab.role;
  teamSel.value = state.filters.hab.team;
  $("#habSearch").value = state.filters.hab.q;

  const flujos = (state.flujos || []).map((f) => f.flujo).sort((a, b) => a.localeCompare(b));
  const habMap = new Map(); // id -> {flujo:{habilitado,fijo}}
  (state.habs || []).forEach((h) => {
    habMap.set(h.id_meli, h.flujos || {});
  });

  const users = state.colaboradores
    .filter((c) => !isLead(c)) // líderes no aplican
    .filter((c) => {
      const f = state.filters.hab;
      if (f.role !== "ALL") return roleGroupOf(c) === f.role;
      return true;
    })
    .filter((c) => (state.filters.hab.team === "ALL" ? true : (c.equipo || "") === state.filters.hab.team))
    .filter((c) => {
      const q = (state.filters.hab.q || "").trim().toLowerCase();
      if (!q) return true;
      const blob = `${c.nombre || ""} ${c.id_meli || ""}`.toLowerCase();
      return blob.includes(q);
    });

  // header
  const head = $("#habHead");
  head.innerHTML = `
    <th style="min-width:260px">Colaborador</th>
    ${flujos.map((f) => `<th style="min-width:140px">${esc(f)}<div class="subtle">H / ⭐</div></th>`).join("")}
  `;

  const body = $("#habBody");
  body.innerHTML = "";

  users.forEach((u) => {
    const id = u.id_meli;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:700">${esc(u.nombre || "")}</div>
        <div class="subtle">${esc(id)}</div>
      </td>
      ${flujos
        .map((flujo) => {
          const data = (habMap.get(id) || {})[flujo] || { habilitado: false, fijo: false };
          const h = !!data.habilitado;
          const fijo = !!data.fijo;
          return `
            <td>
              <label style="display:inline-flex;align-items:center;gap:8px">
                <input type="checkbox" data-k="h" data-id="${esc(id)}" data-f="${esc(flujo)}" ${h ? "checked" : ""}/>
                <span class="subtle">H</span>
              </label>
              <button class="btn ghost" style="padding:6px 10px;border-radius:12px;margin-left:8px"
                title="Fijo" data-k="star" data-id="${esc(id)}" data-f="${esc(flujo)}">
                ${fijo ? "⭐" : "☆"}
              </button>
            </td>
          `;
        })
        .join("")}
    `;
    body.appendChild(tr);
  });

  // handlers
  body.onchange = async (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-k="h"]');
    if (!cb) return;
    const id = cb.dataset.id;
    const flujo = cb.dataset.f;
    const current = (habMap.get(id) || {})[flujo] || { habilitado: false, fijo: false };
    await API.habilitacionesSet(id, flujo, cb.checked, !!current.fijo);
    toast("Guardado");
    state.habs = await API.habilitacionesList();
    renderHabilitaciones();
  };
  body.onclick = async (e) => {
    const b = e.target.closest('button[data-k="star"]');
    if (!b) return;
    const id = b.dataset.id;
    const flujo = b.dataset.f;
    const current = (habMap.get(id) || {})[flujo] || { habilitado: false, fijo: false };
    await API.habilitacionesSet(id, flujo, !!current.habilitado, !current.fijo);
    toast("Guardado");
    state.habs = await API.habilitacionesList();
    renderHabilitaciones();
  };
}

/*****************
 * Presentismo
 *****************/
function renderPresentismo() {
  const roleSel = $("#presRole");
  const teamSel = $("#presTeam");
  fillSelect(roleSel, ROLE_GROUPS);
  fillSelect(teamSel, TEAM_OPTIONS);
  roleSel.value = state.filters.pres.role;
  teamSel.value = state.filters.pres.team;
  $("#presSearch").value = state.filters.pres.q;

  const pres = state.pres;
  if (!pres) return;

  const weekFrom = state.presWeekFrom;
  $("#presWeekLabel").textContent = `Semana ${fmtDateDMY(weekFrom)} → ${fmtDateDMY(new Date(weekFrom.getTime() + 4 * 86400000))}`;
  $("#presNow").textContent = `Hoy: ${pres.hoy || "—"}`;

  const days = pres.dias || pres.days || [];
  const feriados = new Set((pres.feriados || []).map(String));

  // header
  const head = $("#presHead");
  head.innerHTML = `
    <th style="min-width:320px">Colaborador</th>
    ${days
      .map((d) => {
        const isFer = feriados.has(d.key);
        return `<th class="${isFer ? "head-fer" : ""}" style="min-width:120px">${esc(d.label || d.key)}</th>`;
      })
      .join("")}
  `;

  const body = $("#presBody");
  body.innerHTML = "";

  const rows = (pres.rows || pres.filas || [])
    .filter((r) => {
      // filtros por rol/equipo/search se aplican contra colaboradores
      const col = state.colaboradores.find((c) => c.id_meli === r.id_meli);
      if (!col) return true;
      const f = state.filters.pres;

      const rg = roleGroupOf(col);
      if (f.role !== "ALL") {
        if (f.role === "LEADS") {
          if (rg !== "LEADS") return false;
        } else {
          if (rg !== f.role) return false;
        }
      }
      if (f.team !== "ALL" && (col.equipo || "") !== f.team) return false;

      const q = (f.q || "").trim().toLowerCase();
      if (!q) return true;
      const blob = `${col.nombre || ""} ${col.id_meli || ""}`.toLowerCase();
      return blob.includes(q);
    });

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    const name = r.nombre || "";
    const id = r.id_meli || "";
    tr.innerHTML = `
      <td>
        <div style="font-weight:700">${esc(name)}</div>
        <div class="subtle"><span class="copy" data-copy="${esc(id)}">${esc(id)}</span></div>
      </td>
      ${(r.valores || r.values || []).map((v, idx) => {
        const day = days[idx] || {};
        const isFer = feriados.has(day.key);
        const val = (v || "").toString().trim();
        const isOk = val === "P" || val === "";
        const isLic = !isOk && val !== "";
        const cls = `${isFer ? "cell-fer" : ""} ${isLic ? "cell-lic" : "cell-ok"}`;
        return `<td class="${cls}" style="text-align:center">${esc(val || "")}</td>`;
      }).join("")}
    `;
    body.appendChild(tr);
  });

  body.onclick = (e) => {
    const el = e.target.closest("[data-copy]");
    if (!el) return;
    copyText(el.dataset.copy);
  };
}

/*****************
 * Licencias modal
 *****************/
function openLicenciasModal() {
  const dlg = $("#dlgLic");
  const sel = $("#licUser");
  sel.innerHTML = state.colaboradores
    .map((c) => `<option value="${esc(c.id_meli)}">${esc(c.nombre || "")} (${esc(c.id_meli)})</option>`)
    .join("");
  // defaults
  const d = new Date();
  $("#licDesde").value = fmtISO(d);
  $("#licHasta").value = fmtISO(d);
  dlg.showModal();
}

async function saveLicencia() {
  const idMeli = $("#licUser").value;
  const tipo = $("#licTipo").value;
  const desde = $("#licDesde").value;
  const hasta = $("#licHasta").value || desde;
  await API.licenciasSet(idMeli, desde, hasta, tipo);
  toast("Licencia guardada");
  await refreshPres();
}

/*****************
 * Bind events
 *****************/
function bindUI() {
  // theme
  $("#themeBtn").addEventListener("click", () => {
    setTheme(state.theme === "dark" ? "light" : "dark");
  });

  // tabs
  bindTabs();

  // dashboard
  $("#btnRefDash").addEventListener("click", () => refreshDashboard().catch(showError));

  // operativa
  $("#btnRefOper").addEventListener("click", () => refreshOperativa().catch(showError));
  $("#btnAddFlow").addEventListener("click", () => addFlow().catch(showError));
  $("#newFlujo").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addFlow().catch(showError);
  });
  $("#btnGenerarPlan").addEventListener("click", async () => {
    try {
      $("#operStatus").textContent = "Generando planificación…";
      await API.planificacionGenerar();
      $("#operStatus").textContent = "Generando Outbox…";
      await API.slackOutboxGenerar();
      toast("Planificación + Outbox generados");
      await refreshOperativa();
    } catch (e) {
      showError(e);
      $("#operStatus").textContent = "";
    }
  });

  // colaboradores filtros
  $("#btnRefColabs").addEventListener("click", () => refreshColabs().catch(showError));
  $("#colabRole").addEventListener("change", (e) => {
    state.filters.colab.role = e.target.value;
    renderColaboradores();
  });
  $("#colabTeam").addEventListener("change", (e) => {
    state.filters.colab.team = e.target.value;
    renderColaboradores();
  });
  $("#colabSearch").addEventListener("input", (e) => {
    state.filters.colab.q = e.target.value;
    renderColaboradores();
  });
  $("#colabClear").addEventListener("click", () => {
    state.filters.colab.q = "";
    $("#colabSearch").value = "";
    renderColaboradores();
  });
  $("#colabReset").addEventListener("click", () => {
    state.filters.colab = { role: "ALL", team: "ALL", q: "" };
    renderColaboradores();
  });

  // habilitaciones filtros
  $("#btnRefHabs").addEventListener("click", () => refreshHabs().catch(showError));
  $("#habRole").addEventListener("change", (e) => {
    state.filters.hab.role = e.target.value;
    renderHabilitaciones();
  });
  $("#habTeam").addEventListener("change", (e) => {
    state.filters.hab.team = e.target.value;
    renderHabilitaciones();
  });
  $("#habSearch").addEventListener("input", (e) => {
    state.filters.hab.q = e.target.value;
    renderHabilitaciones();
  });
  $("#habClear").addEventListener("click", () => {
    state.filters.hab.q = "";
    $("#habSearch").value = "";
    renderHabilitaciones();
  });
  $("#habReset").addEventListener("click", () => {
    state.filters.hab = { role: "ALL", team: "ALL", q: "" };
    renderHabilitaciones();
  });

  // presentismo
  $("#btnRefPres").addEventListener("click", () => refreshPres().catch(showError));
  $("#presRole").addEventListener("change", (e) => {
    state.filters.pres.role = e.target.value;
    renderPresentismo();
  });
  $("#presTeam").addEventListener("change", (e) => {
    state.filters.pres.team = e.target.value;
    renderPresentismo();
  });
  $("#presSearch").addEventListener("input", (e) => {
    state.filters.pres.q = e.target.value;
    renderPresentismo();
  });
  $("#presClear").addEventListener("click", () => {
    state.filters.pres.q = "";
    $("#presSearch").value = "";
    renderPresentismo();
  });
  $("#presReset").addEventListener("click", () => {
    state.filters.pres = { role: "ALL", team: "ALL", q: "" };
    renderPresentismo();
  });

  $("#presPrev").addEventListener("click", () => {
    state.presWeekFrom = new Date(state.presWeekFrom.getTime() - 7 * 86400000);
    state.presWeekFrom = mondayOf(state.presWeekFrom);
    refreshPres().catch(showError);
  });
  $("#presNext").addEventListener("click", () => {
    state.presWeekFrom = new Date(state.presWeekFrom.getTime() + 7 * 86400000);
    state.presWeekFrom = mondayOf(state.presWeekFrom);
    refreshPres().catch(showError);
  });

  $("#presLic").addEventListener("click", () => openLicenciasModal());

  $("#licForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await saveLicencia();
      $("#dlgLic").close();
    } catch (err) {
      showError(err);
    }
  });
}

/*****************
 * Init
 *****************/
async function init() {
  setupTheme();
  bindUI();

  try {
    await loadBase();

    // carga inicial por tab
    await refreshDashboard();
    await refreshOperativa();

    // para que no aparezcan vacíos si entrás directo
    await refreshHabs();
    await refreshPres();
    renderColaboradores();

    setTab(state.tab);
  } catch (e) {
    showError(e);
  }
}

document.addEventListener("DOMContentLoaded", init);
