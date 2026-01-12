/* app.js */
const S = {
  tab: "dashboard",
  colabs: [],
  canales: [],
  flujos: [],
  plan: [],
  outbox: [],
  habil: null,
  presWeek: null,
  presStats: null,

  fColabs: { q: "", roles: new Set(), equipos: new Set() },
  fHabil: { q: "", roles: new Set(), equipos: new Set() },
  fPres: { q: "", roles: new Set(), equipos: new Set() },
  sort: { colabs: { key: "id", dir: 1 } },

  selColabs: new Set(),
};

// Endpoint directo (evita depender de api.js para features nuevas como scheduling)
const GAS_ENDPOINT = "/.netlify/functions/gas";

async function safeJson_(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `Non-JSON response (${resp.status}): ${text.slice(0, 200)}` };
  }
}

async function postAction_(action, payload = {}) {
  const resp = await fetch(GAS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await safeJson_(resp);
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `POST ${action} failed (${resp.status})`);
  return data.data;
}

function fmtDateTimeLocal_(s) {
  // Normaliza a value compatible con <input type="datetime-local">
  const str = String(s || "").trim();
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) return str;
  const m = str.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})$/);
  if (m) return `${m[1]}T${m[2]}`;
  return str;
}

const ROLES_BUCKETS = ["Líderes", "Analistas PM", "Analistas KV", "QA", "Otros"];

function $(id) {
  return document.getElementById(id);
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function toast(t1, t2 = "") {
  const el = $("toast");
  if (!el) return;
  el.querySelector(".t1").textContent = t1;
  el.querySelector(".t2").textContent = t2;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function setErr(msg) {
  const el = $("errbar");
  if (!el) return;
  if (!msg) {
    el.classList.remove("show");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.add("show");
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function roleBucket(rol) {
  const r = norm(rol);
  if (r.includes("tl") || r.includes("team leader") || r.includes("coordin") || r.includes("pm lider")) return "Líderes";
  if (r.includes("kv")) return "Analistas KV";
  if (r.includes("qa")) return "QA";
  if (r.includes("pm") || r.includes("matcher")) return "Analistas PM";
  return "Otros";
}

function colabRowView(x) {
  return {
    id: String(x?.ID_MELI ?? x?.id_meli ?? x?.id ?? ""),
    nombre: String(x?.Nombre ?? x?.nombre ?? ""),
    rol: String(x?.Rol ?? x?.rol ?? ""),
    equipo: String(x?.Equipo ?? x?.equipo ?? ""),
    ubic: String(x?.Ubicacion ?? x?.ubicacion ?? x?.ubic ?? ""),
    mailProd: String(x?.Mail_Productora ?? x?.mail_productora ?? x?.mailProd ?? ""),
    mailExt: String(x?.Mail_Externo ?? x?.mail_externo ?? x?.mailExt ?? ""),
    ingreso: x?.Fecha_ingreso ?? x?.fecha_ingreso ?? x?.Ingreso ?? x?.ingreso ?? "",
    slackId: String(x?.Slack_ID ?? x?.slack_id ?? x?.slackId ?? ""),
  };
}

function fmtDateAny(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d)) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }
  return s;
}

function applySectionFilter(list, filter) {
  const q = norm(filter.q || "");
  const rolesSel = filter.roles || new Set();
  const equiposSel = filter.equipos || new Set();

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

/* ========= Tabs ========= */
function showTab(tab) {
  S.tab = tab;
  const tabs = ["dashboard", "operativa", "colabs", "habil", "presentismo"];
  tabs.forEach((t) => {
    const sec = $(`tab_${t}`);
    const btn = $(`btn_${t}`);
    if (sec) sec.style.display = t === tab ? "" : "none";
    if (btn) btn.classList.toggle("active", t === tab);
  });
}

/* ========= Dashboard ========= */
function countAnalistasDisponiblesHoy_() {
  if (!S.presWeek?.header?.length || !S.presWeek?.rows?.length) return 0;
  const today = (() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
  })();

  const colabsById = new Map(
    (S.colabs || []).map((c) => {
      const v = colabRowView(c);
      return [v.id, v];
    })
  );

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

  const ordered = ROLES_BUCKETS.map((k) => [k, counts.get(k) || 0]);

  const pres = S.presStats?.presentes ?? 0;
  const analistasHoy = countAnalistasDisponiblesHoy_();
  const flujosActivos = (S.flujos || []).filter((f) => Number(f.perfiles_requeridos ?? f.cantidad ?? 0) >= 1).length;

  kpi.innerHTML = `
    <div class="kpi"><div class="v">${total}</div><div class="l">Colaboradores</div></div>
    <div class="kpi"><div class="v">${pres}</div><div class="l">Presentes hoy</div></div>
    <div class="kpi"><div class="v">${analistasHoy}</div><div class="l">Analistas disponibles hoy</div></div>
    <div class="kpi"><div class="v">${flujosActivos}</div><div class="l">Flujos activos hoy</div></div>
  `;

  tb.innerHTML = ordered.map(([rol, n]) => `<tr><td>${escapeHtml(rol)}</td><td class="right">${n}</td></tr>`).join("");
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
      return `
        <tr data-flujo="${escapeAttr(name)}">
          <td><b>${escapeHtml(name)}</b></td>
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
}

/* ========= Planificación: columnas + generar mensaje por flujo ========= */
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
          const fijo = x.es_fijo === "SI" ? " F" : "";
          const name = x.nombre || x.id_meli || "";
          return `<li>${escapeHtml(name)}${fijo}</li>`;
        })
        .join("");

      return `
        <div class="flow-col" data-flow="${escapeAttr(f)}">
          <h3>
            <span>${escapeHtml(f)}</span>
            <button class="btn ghost" style="padding:8px 10px;border-radius:12px" data-genmsg>Generar mensaje</button>
          </h3>
          <ul>${lis || `<li class="muted">—</li>`}</ul>
        </div>
      `;
    })
    .join("");

  host.querySelectorAll("[data-genmsg]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const flow = btn.closest("[data-flow]")?.getAttribute("data-flow");
      if (!flow) return;
      await generarMensajePorFlujo_(unescapeAttr(flow));
    });
  });
}

async function generarMensajePorFlujo_(flujo) {
  setErr("");
  try {
    const items = (S.plan || []).filter((x) => x?.flujo === flujo && x?.id_meli && x.id_meli !== "SIN PERFILES DISPONIBLES");
    if (!items.length) return toast("Mensaje", "No hay perfiles asignados");

    // map slack ids
    const map = new Map(
      (S.colabs || []).map((c) => {
        const v = colabRowView(c);
        return [v.id, v.slackId];
      })
    );

    const mentions = items
      .map((x) => {
        const slackId = map.get(x.id_meli);
        return slackId ? `<@${slackId}>` : x.nombre || x.id_meli;
      })
      .join(" - ");

    const msg = `*${flujo}*\n${mentions}`;

    const fechaISO = todayYMD();
    await API.slackOutboxAppend(fechaISO, "POR_FLUJO", flujo, "", msg, "PENDIENTE - SIN CANAL");
    S.outbox = await API.slackOutboxList();
    renderOutbox();
    toast("Outbox", `Mensaje generado: ${flujo}`);
  } catch (e) {
    setErr(`Mensaje por flujo: ${e.message || e}`);
  }
}

/* ========= Generar planificación + outbox ========= */
async function onGenerarPlanificacionYOutbox_() {
  setErr("");
  try {
    $("dailyStatus").textContent = "Generando...";
    await API.planificacionGenerar();
    await API.slackOutboxGenerar(); // backend: ahora SOLO GENERAL
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
  }
}

/* ========= Slack Outbox helpers ========= */
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

const outboxAutosave = debounce(async (row, channel_id, mensaje, programado_para) => {
  setErr("");
  try {
    const canal = (S.canales || []).find((c) => c.channel_id === channel_id)?.canal || "";
    await postAction_("slack.outbox.update", { row, canal, channel_id, mensaje, programado_para });
    toast("Outbox", "Guardado");
  } catch (e) {
    setErr(`Outbox: ${e.message || e}`);
  }
}, 500);

function renderOutbox() {
  const tb = $("tblOutbox")?.querySelector("tbody");
  if (!tb) return;

  const out = (S.outbox || []).slice().sort((a, b) => (b.row || 0) - (a.row || 0));
  if (!out.length) {
    tb.innerHTML = `<tr><td colspan="6" class="muted">Sin mensajes pendientes.</td></tr>`;
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
      const sch = fmtDateTimeLocal_(r.programado_para || "");
      const row = r.row;

      return `
        <tr data-row="${row}">
          <td class="nowrap">${escapeHtml(date)}</td>
          <td>
            <select data-ch>${channelOptionsHtml(chId)}</select>
          </td>
          <td>
            <textarea data-msg>${escapeHtml(msg)}</textarea>
          </td>
          <td class="nowrap" style="min-width:190px">
            <input class="input" type="datetime-local" data-sch value="${escapeAttr(sch)}" />
          </td>
          <td class="nowrap"><span class="${badge}">${escapeHtml(estado)}</span></td>
          <td class="right nowrap">
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
    const sch = tr.querySelector("[data-sch]");

    const triggerSave = () => outboxAutosave(row, sel.value, txt.value, sch?.value || "");

    sel.addEventListener("change", triggerSave);
    txt.addEventListener("input", triggerSave);
    txt.addEventListener("blur", triggerSave);
    sch?.addEventListener("change", triggerSave);
    sch?.addEventListener("blur", triggerSave);

    tr.querySelector("[data-send]")?.addEventListener("click", async () => {
      // guardo antes de enviar (sin esperar debounce)
      try {
        const canal = (S.canales || []).find((c) => c.channel_id === sel.value)?.canal || "";
        await postAction_("slack.outbox.update", {
          row,
          canal,
          channel_id: sel.value,
          mensaje: txt.value,
          programado_para: sch?.value || "",
        });
      } catch (e) {
        setErr(`Outbox: ${e.message || e}`);
        return;
      }
      await onOutboxSend(row);
    });
  });
}

async function onOutboxSend(row) {
  setErr("");
  try {
    // force=true: si estaba programado para futuro, lo manda igual ahora
    await postAction_("slack.outbox.enviar", { row, force: true });
    S.outbox = await API.slackOutboxList();
    renderOutbox();
    toast("Slack", "Enviado");
  } catch (e) {
    setErr(`Slack: ${e.message || e}`);
  }
}

/* ========= Colaboradores ========= */
function renderColabs() {
  const tb = $("tblColabs")?.querySelector("tbody");
  if (!tb) return;

  const filtered = applySectionFilter(S.colabs || [], S.fColabs).map(colabRowView);

  // sort
  const { key, dir } = S.sort.colabs || { key: "id", dir: 1 };
  const sorted = filtered.slice().sort((a, b) => {
    const va = String(a[key] ?? "");
    const vb = String(b[key] ?? "");
    return va.localeCompare(vb) * dir;
  });

  tb.innerHTML = sorted
    .map((c) => {
      const ingreso = fmtDateAny(c.ingreso);
      return `
      <tr data-id="${escapeAttr(c.id)}">
        <td class="nowrap"><input type="checkbox" data-sel ${S.selColabs.has(c.id) ? "checked" : ""} /></td>
        <td class="nowrap">${escapeHtml(c.id)}</td>
        <td>${escapeHtml(c.nombre)}</td>
        <td>${escapeHtml(c.rol)}</td>
        <td>${escapeHtml(c.equipo)}</td>
        <td class="nowrap">${escapeHtml(ingreso)}</td>
        <td class="nowrap">${escapeHtml(c.mailProd)}</td>
        <td class="nowrap">${escapeHtml(c.mailExt)}</td>
      </tr>`;
    })
    .join("");

  // select
  tb.querySelectorAll("tr").forEach((tr) => {
    const id = tr.getAttribute("data-id");
    tr.querySelector("[data-sel]")?.addEventListener("change", (e) => {
      if (e.target.checked) S.selColabs.add(id);
      else S.selColabs.delete(id);
      renderColabsSelectionTools_();
    });
  });

  renderColabsSelectionTools_();
}

function renderColabsSelectionTools_() {
  const box = $("colabsSelTools");
  if (!box) return;

  const n = S.selColabs.size;
  if (!n) {
    box.style.display = "none";
    return;
  }
  box.style.display = "";
  $("colabsSelCount").textContent = `${n} seleccionados`;
}

function copySelection_(field) {
  const ids = Array.from(S.selColabs);
  if (!ids.length) return;

  const map = new Map(
    (S.colabs || []).map((c) => {
      const v = colabRowView(c);
      return [v.id, v];
    })
  );

  const out = ids
    .map((id) => map.get(id))
    .filter(Boolean)
    .map((v) => {
      if (field === "id") return v.id;
      if (field === "mailExt") return v.mailExt;
      if (field === "mailProd") return v.mailProd;
      return v.id;
    })
    .filter(Boolean)
    .join("\n");

  navigator.clipboard.writeText(out);
  toast("Copiado", `${ids.length} líneas`);
}

/* ========= Habilitaciones ========= */
function renderHabil() {
  const tb = $("tblHabil")?.querySelector("tbody");
  if (!tb) return;

  const rows = S.habil || [];
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="6" class="muted">Sin datos.</td></tr>`;
    return;
  }

  // filtros (aplico sobre colaboradores, luego mapeo a habil)
  const colabsMap = new Map(
    (S.colabs || []).map((c) => {
      const v = colabRowView(c);
      return [v.id, v];
    })
  );

  const filtered = applySectionFilter(
    rows.map((r) => {
      const id = String(r.ID_MELI || r.id_meli || "");
      const c = colabsMap.get(id) || {};
      return {
        ...r,
        __Nombre: c.nombre || "",
        __Rol: c.rol || "",
        __Equipo: c.equipo || "",
      };
    }),
    S.fHabil
  );

  tb.innerHTML = filtered
    .map((r) => {
      const id = String(r.ID_MELI || r.id_meli || "");
      const hab = String(r.Habilitado || r.habilitado || "");
      const fijo = String(r.Fijo || r.fijo || "");
      const nombre = String(r.__Nombre || "");
      const rol = String(r.__Rol || "");
      const equipo = String(r.__Equipo || "");

      return `
        <tr data-id="${escapeAttr(id)}">
          <td class="nowrap">${escapeHtml(id)}</td>
          <td>${escapeHtml(nombre)}</td>
          <td>${escapeHtml(rol)}</td>
          <td>${escapeHtml(equipo)}</td>
          <td class="center nowrap">
            <button class="pill ${hab === "H" ? "on" : ""}" data-h>${escapeHtml(hab || "-")}</button>
          </td>
          <td class="center nowrap">
            <button class="pill ${fijo === "F" ? "on" : ""}" data-f>${escapeHtml(fijo || "-")}</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tb.querySelectorAll("tr").forEach((tr) => {
    const id = tr.getAttribute("data-id");
    tr.querySelector("[data-h]")?.addEventListener("click", async () => {
      await toggleHabil_(id, "habilitado");
    });
    tr.querySelector("[data-f]")?.addEventListener("click", async () => {
      await toggleHabil_(id, "fijo");
    });
  });
}

async function toggleHabil_(id, what) {
  setErr("");
  try {
    // buscar actual
    const row = (S.habil || []).find((r) => String(r.ID_MELI || r.id_meli || "") === String(id));
    if (!row) return;

    const hab = String(row.Habilitado || row.habilitado || "");
    const fijo = String(row.Fijo || row.fijo || "");

    const nextHab = what === "habilitado" ? (hab === "H" ? "" : "H") : hab;
    const nextFijo = what === "fijo" ? (fijo === "F" ? "" : "F") : fijo;

    await API.habilitacionesSet(id, nextHab, nextFijo);
    await refreshHabil();
    renderHabil();
    toast("Guardado", id);
  } catch (e) {
    setErr(`Habilitaciones: ${e.message || e}`);
  }
}

/* ========= Presentismo ========= */
function mountPresentismoSelect() {
  const sel = $("presDate");
  if (!sel) return;

  // default hoy
  sel.value = todayYMD();

  sel.addEventListener("change", async () => {
    try {
      const d = sel.value || todayYMD();
      const [week, stats] = await Promise.all([API.presentismoWeek(d), API.presentismoStats(d)]);
      S.presWeek = week;
      S.presStats = stats;
      renderPresentismo();
      renderDashboard();
    } catch (e) {
      setErr(`Presentismo: ${e.message || e}`);
    }
  });

  $("btnPresReload")?.addEventListener("click", async () => {
    await refreshPresentismo();
    renderPresentismo();
    renderDashboard();
  });
}

function renderPresentismo() {
  const host = $("presGrid");
  if (!host) return;

  const week = S.presWeek;
  if (!week?.header?.length || !week?.rows?.length) {
    host.innerHTML = `<div class="muted">Sin datos.</div>`;
    return;
  }

  const header = week.header;
  const rows = week.rows;

  // construir tabla simple
  const cols = header.slice(0);
  const dayCols = cols.slice(cols.indexOf("Nombre") + 1);

  const thead = `
    <thead>
      <tr>
        <th class="nowrap">ID</th>
        <th>Nombre</th>
        ${dayCols.map((d) => `<th class="center nowrap">${escapeHtml(d)}</th>`).join("")}
      </tr>
    </thead>`;

  const tbody = `
    <tbody>
      ${rows
        .map((r) => {
          const id = r.id_meli;
          const nombre = r.nombre || "";
          return `
            <tr>
              <td class="nowrap">${escapeHtml(id)}</td>
              <td>${escapeHtml(nombre)}</td>
              ${dayCols
                .map((d) => {
                  const v = String(r.vals?.[d] || "");
                  const isLic = v && v !== "P";
                  const cls = isLic ? "cell lic" : "cell";
                  return `<td class="center nowrap ${cls}">${escapeHtml(v)}</td>`;
                })
                .join("")}
            </tr>`;
        })
        .join("")}
    </tbody>`;

  host.innerHTML = `<div style="overflow:auto"><table class="table">${thead}${tbody}</table></div>`;

  // stats card
  const st = $("presStats");
  if (st && S.presStats) {
    st.innerHTML = `
      <div class="kpi"><div class="v">${S.presStats.presentes ?? 0}</div><div class="l">Presentes</div></div>
      <div class="kpi"><div class="v">${S.presStats.licencias ?? 0}</div><div class="l">Licencias</div></div>
    `;
  }
}

/* ========= Wire UI ========= */
function wireUI() {
  $("btn_dashboard")?.addEventListener("click", () => showTab("dashboard"));
  $("btn_operativa")?.addEventListener("click", () => showTab("operativa"));
  $("btn_colabs")?.addEventListener("click", () => showTab("colabs"));
  $("btn_habil")?.addEventListener("click", () => showTab("habil"));
  $("btn_presentismo")?.addEventListener("click", () => showTab("presentismo"));

  $("btnGenPlan")?.addEventListener("click", onGenerarPlanificacionYOutbox_);

  $("btnCopyIDs")?.addEventListener("click", () => copySelection_("id"));
  $("btnCopyMailsExt")?.addEventListener("click", () => copySelection_("mailExt"));
  $("btnCopyMailsProd")?.addEventListener("click", () => copySelection_("mailProd"));

  // filtros básicos
  $("colabsQ")?.addEventListener("input", (e) => {
    S.fColabs.q = e.target.value || "";
    renderColabs();
  });
  $("habilQ")?.addEventListener("input", (e) => {
    S.fHabil.q = e.target.value || "";
    renderHabil();
  });
  $("presQ")?.addEventListener("input", (e) => {
    S.fPres.q = e.target.value || "";
    renderPresentismo();
  });

  // nuevo flujo
  $("btnAddFlow")?.addEventListener("click", async () => {
    const name = $("newFlowName")?.value?.trim();
    const req = Number($("newFlowReq")?.value || 0) || 0;
    if (!name) return toast("Falta", "Nombre de flujo");
    try {
      await API.flujosUpsert(name, req, "");
      $("newFlowName").value = "";
      $("newFlowReq").value = "";
      S.flujos = await API.flujosList();
      renderFlujos();
      renderDashboard();
      toast("OK", "Flujo agregado");
    } catch (e) {
      setErr(`Flujos: ${e.message || e}`);
    }
  });
}

/* ========= Utils ========= */
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
function cssEsc(s) {
  return String(s ?? "").replaceAll('"', '\\"');
}

/* ========= Boot ========= */
document.addEventListener("DOMContentLoaded", async () => {
  wireUI();
  showTab("dashboard");
  await loadCore();
});
