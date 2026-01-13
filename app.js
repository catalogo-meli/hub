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

let msSemanaPres = null;

function toast(t1, t2 = "") {
  const box = $("toast");
  if (!box) return;
  $("toastT1").textContent = t1;
  $("toastT2").textContent = t2;
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), 3000);
}

function setErr(msg = "") {
  const bar = $("errBar");
  if (!bar) return;
  if (!msg) {
    bar.classList.remove("show");
    bar.innerHTML = "";
    return;
  }
  bar.classList.add("show");
  bar.innerHTML = msg;
}

function setBusy(t1, t2 = "") {
  const b = $("busy");
  if (!b) return;
  $("busyT1").textContent = t1;
  $("busyT2").textContent = t2;
  b.classList.add("show");
}
function clearBusy() {
  const b = $("busy");
  if (!b) return;
  b.classList.remove("show");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll("`", "&#96;");
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDateDMY(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function copyText(text) {
  return navigator.clipboard.writeText(String(text ?? ""));
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

/* ========= Estado global ========= */
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

  sort: {
    colabs: { k: "nombre", dir: "asc" },
    dashRoles: { k: "rol", dir: "asc" },
  },

  selColabs: new Set(),
};

/* ========= Theme ========= */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", S.theme === "light" ? "light" : "dark");
  localStorage.setItem("hub_theme", S.theme);
}
$("btnTheme")?.addEventListener("click", () => {
  S.theme = S.theme === "light" ? "dark" : "light";
  applyTheme();
});

/* ========= Tabs ========= */
function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  const map = {
    dashboard: "tab_dashboard",
    daily: "tab_daily",
    colabs: "tab_colabs",
    habil: "tab_habil",
    pres: "tab_pres",
  };
  Object.entries(map).forEach(([k, id]) => {
    const el = $(id);
    if (!el) return;
    el.style.display = k === name ? "" : "none";
  });
}
$("tabs")?.addEventListener("click", (e) => {
  const t = e.target?.closest?.(".tab");
  if (!t) return;
  showTab(t.dataset.tab);
});

/* ========= UI helpers ========= */
function mountSearch(inputId, wrapId, clearId, onChange) {
  const inp = $(inputId);
  const wrap = $(wrapId);
  const btn = $(clearId);
  if (!inp || !wrap) return;

  const sync = () => {
    wrap.classList.toggle("has", !!inp.value);
    onChange?.(inp.value || "");
  };

  inp.addEventListener("input", sync);
  btn?.addEventListener("click", () => {
    inp.value = "";
    sync();
  });
}

function mountMultiSelect(targetId, { title, items, selected, onChange }) {
  const host = $(targetId);
  if (!host) return null;
  host.className = "ms";

  host.innerHTML = `
    <div class="ms-btn">
      <div>
        <div class="label">${title}</div>
        <div class="value" data-ms-value></div>
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

  const state = { open: false, selected: new Set(selected || []) };

  const btn = host.querySelector(".ms-btn");
  const panel = host.querySelector(".ms-panel");
  const list = host.querySelector("[data-ms-list]");
  const valueEl = host.querySelector("[data-ms-value]");
  const bClear = host.querySelector("[data-ms-clear]");

  const renderValue = () => {
    const n = state.selected.size;
    valueEl.textContent = n ? `${n} seleccionados` : "Todos";
  };

  const renderList = () => {
    const it = items || [];
    list.innerHTML = it
      .map(
        (x) => `
        <label class="ms-item">
          <input type="checkbox" value="${escapeAttr(x)}" ${
            state.selected.has(x) ? "checked" : ""
          } />
          <div>${escapeHtml(x)}</div>
        </label>`
      )
      .join("");

    list.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const v = cb.value;
        if (cb.checked) state.selected.add(v);
        else state.selected.delete(v);
        renderValue();
        onChange?.(new Set(state.selected));
      });
    });
  };

  const close = () => host.classList.remove("open");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    host.classList.toggle("open");
  });
  document.addEventListener("click", () => close());
  panel.addEventListener("click", (e) => e.stopPropagation());

  bClear.addEventListener("click", () => {
    state.selected = new Set();
    renderList();
    renderValue();
    onChange?.(new Set(state.selected));
  });

  renderList();
  renderValue();

  return {
    clear: () => {
      state.selected = new Set();
      renderList();
      renderValue();
      onChange?.(new Set(state.selected));
    },
    setItems: (newItems) => {
      items = newItems || [];
      // si items cambian, limpiamos selecciones que ya no existan
      state.selected = new Set(Array.from(state.selected).filter((x) => items.includes(x)));
      renderList();
      renderValue();
      onChange?.(new Set(state.selected));
    },
  };
}

/* ========= Semana Select (Presentismo) ========= */
function mountSemanaSelect(targetId, { title, onChange }) {
  const host = $(targetId);
  if (!host) return null;

  host.className = "ms";
  host.innerHTML = `
    <div class="ms-btn">
      <div>
        <div class="label">${title}</div>
        <div class="value" data-ms-value></div>
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
  const valueEl = host.querySelector("[data-ms-value]");
  const bClear = host.querySelector("[data-ms-clear]");

  function renderValue() {
    valueEl.textContent = state.value ? state.value : "Actual";
  }

  function renderList(options = []) {
    const opts = (options || []).filter(Boolean);
    const all = ["", ...opts];
    const name = `ms_semana_${targetId}`;

    list.innerHTML = all
      .map((v) => {
        const label = v ? v : "Actual";
        const checked = v === state.value ? "checked" : "";
        return `
          <label class="ms-item">
            <input type="radio" name="${name}" value="${escapeAttr(v)}" ${checked} />
            <div>${escapeHtml(label)}</div>
          </label>`;
      })
      .join("");

    list.querySelectorAll("input[type=radio]").forEach((rb) => {
      rb.addEventListener("change", () => {
        state.value = String(rb.value || "");
        renderValue();
        host.classList.remove("open");
        onChange?.(state.value);
      });
    });
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

  bClear.addEventListener("click", () => {
    state.value = "";
    renderList(currentOptions);
    renderValue();
    onChange?.(state.value);
  });

  let currentOptions = [];
  renderValue();
  renderList(currentOptions);

  return {
    setOptions: (opts) => {
      currentOptions = Array.isArray(opts) ? opts.slice() : [];
      renderList(currentOptions);
      renderValue();
    },
    setValue: (v) => {
      state.value = String(v || "");
      renderList(currentOptions);
      renderValue();
    },
    clear: () => {
      state.value = "";
      renderList(currentOptions);
      renderValue();
      onChange?.(state.value);
    },
    getValue: () => state.value,
  };
}

function colabRowView(r) {
  // Ajustá según tu backend si cambia el shape. Esto respeta tu contrato actual.
  const id = r.ID_MELI ?? r.id ?? "";
  const nombre = r.Nombre ?? r.nombre ?? "";
  const rol = r.Rol ?? r.rol ?? "";
  const equipo = r.Equipo ?? r.equipo ?? "";
  const ubic = r.Ubicacion ?? r.ubicacion ?? "";
  const mailProd = r.Mail_Productora ?? r.mail_productora ?? r.mailProd ?? "";
  const mailExt = r.Mail_Externo ?? r.mail_externo ?? r.mailExt ?? "";
  const ingreso = r.Fecha_Ingreso ?? r.fecha_ingreso ?? r.ingreso ?? "";

  return {
    id: String(id || "").trim(),
    nombre: String(nombre || "").trim(),
    rol: String(rol || "").trim(),
    equipo: String(equipo || "").trim(),
    ubic: String(ubic || "").trim(),
    mailProd: String(mailProd || "").trim(),
    mailExt: String(mailExt || "").trim(),
    ingreso,
  };
}

/* ========= Data refresh ========= */
async function refreshColabs() {
  const data = await API.colaboradores();
  S.colabs = Array.isArray(data) ? data : [];
}
async function refreshCanales() {
  const data = await API.canales();
  S.canales = Array.isArray(data) ? data : [];
}
async function refreshFlujos() {
  const data = await API.flujos();
  S.flujos = Array.isArray(data) ? data : [];
}
async function refreshHabil() {
  const data = await API.habilitaciones();
  S.habil = data || null;
}
async function refreshPlanAndOutbox() {
  const [plan, outbox] = await Promise.all([API.planificacion(), API.slackOutbox()]);
  S.plan = Array.isArray(plan) ? plan : [];
  S.outbox = Array.isArray(outbox) ? outbox : [];
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
    console.error(e);
    throw e;
  }
}

function syncPresSemanaSelect_() {
  // UI Semana (Presentismo) usa el mismo patrón que Roles/Equipo
  if (msSemanaPres) {
    msSemanaPres.setOptions(S.presSemanas || []);
    msSemanaPres.setValue(S.presSemanaSel || "");
  }
}

/* ========= Operativa diaria: Flujos autosave ========= */
const saveFlujoDebounced = debounce(async (id, req) => {
  try {
    await API.flujoUpdate(id, { req });
    await refreshFlujos();
    renderFlujos();
  } catch (e) {
    console.error(e);
    toast("Operativa diaria", "Error al guardar");
  }
}, 450);

/* ========= Dashboard ========= */
function renderDashboard() {
  const kpis = $("dashKpis");
  if (!kpis) return;

  const colabs = (S.colabs || []).map(colabRowView);
  const total = colabs.length;

  const stats = S.presStats || null;
  const presentes = stats?.presentes ?? stats?.Presentes ?? null;
  const ausentes = stats?.ausentes ?? stats?.Ausentes ?? null;

  const k = [
    { v: total, l: "Colaboradores" },
    { v: presentes ?? "-", l: "Presentes" },
    { v: ausentes ?? "-", l: "Ausentes" },
    { v: (S.flujos || []).reduce((a, f) => a + (Number(f.req || f.Req || 0) || 0), 0), l: "Req. totales" },
  ];

  kpis.innerHTML = k
    .map(
      (x) => `
      <div class="kpi">
        <div class="v">${escapeHtml(x.v)}</div>
        <div class="l">${escapeHtml(x.l)}</div>
      </div>`
    )
    .join("");

  const tbl = $("tblDashRoles");
  if (!tbl) return;

  const roleCounts = {};
  colabs.forEach((c) => {
    if (!c.rol) return;
    roleCounts[c.rol] = (roleCounts[c.rol] || 0) + 1;
  });

  const rows = Object.entries(roleCounts).map(([rol, nomina]) => ({
    rol,
    nomina,
    presentes: stats?.roles?.[rol]?.presentes ?? "-",
  }));

  const { k: sortK, dir } = S.sort.dashRoles;
  rows.sort((a, b) => {
    const va = a[sortK];
    const vb = b[sortK];
    if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
    return dir === "asc"
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  tbl.querySelector("tbody").innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.rol)}</td>
        <td class="right">${escapeHtml(r.nomina)}</td>
        <td class="right">${escapeHtml(r.presentes)}</td>
      </tr>`
    )
    .join("");

  tbl.querySelectorAll("th.sortable").forEach((th) => {
    th.onclick = () => {
      const k = th.dataset.sort;
      const cur = S.sort.dashRoles;
      if (cur.k === k) cur.dir = cur.dir === "asc" ? "desc" : "asc";
      else {
        cur.k = k;
        cur.dir = "asc";
      }
      renderDashboard();
    };
  });
}

/* ========= Colaboradores ========= */
function renderColabs() {
  const tbody = $("tblColabs")?.querySelector("tbody");
  if (!tbody) return;

  const rows = (S.colabs || []).map(colabRowView);

  const roles = S.fColabs.roles;
  const equipos = S.fColabs.equipos;
  const q = (S.fColabs.q || "").toLowerCase().trim();

  let list = rows.slice();

  if (roles.size) list = list.filter((r) => roles.has(r.rol));
  if (equipos.size) list = list.filter((r) => equipos.has(r.equipo));

  if (q) {
    list = list.filter((r) => {
      const hay =
        `${r.id} ${r.nombre} ${r.rol} ${r.equipo} ${r.mailProd} ${r.mailExt}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const s = S.sort.colabs;
  list.sort((a, b) => {
    const va = a[s.k];
    const vb = b[s.k];
    if (s.k === "ingreso") {
      const da = new Date(String(va || ""));
      const db = new Date(String(vb || ""));
      const na = isNaN(da.getTime()) ? 0 : da.getTime();
      const nb = isNaN(db.getTime()) ? 0 : db.getTime();
      return s.dir === "asc" ? na - nb : nb - na;
    }
    return s.dir === "asc"
      ? String(va ?? "").localeCompare(String(vb ?? ""))
      : String(vb ?? "").localeCompare(String(va ?? ""));
  });

  tbody.innerHTML = list
    .map((r) => {
      const checked = S.selColabs.has(r.id) ? "checked" : "";
      return `
      <tr>
        <td class="nowrap"><input type="checkbox" data-sel="${escapeAttr(r.id)}" ${checked}/></td>
        <td class="copyable" data-copy="${escapeAttr(r.id)}">${escapeHtml(r.id)}</td>
        <td>${escapeHtml(r.nombre)}</td>
        <td>${escapeHtml(r.rol)}</td>
        <td>${escapeHtml(r.equipo)}</td>
        <td>${escapeHtml(r.ubic)}</td>
        <td class="copyable" data-copy="${escapeAttr(r.mailProd)}">${escapeHtml(r.mailProd)}</td>
        <td class="copyable" data-copy="${escapeAttr(r.mailExt)}">${escapeHtml(r.mailExt)}</td>
        <td class="nowrap">${escapeHtml(fmtDateDMY(r.ingreso) || "")}</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-copy]").forEach((el) => {
    el.addEventListener("click", async () => {
      const t = el.getAttribute("data-copy");
      if (!t) return;
      await copyText(t);
      toast("Copiado", t);
    });
  });

  tbody.querySelectorAll("input[type=checkbox][data-sel]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.getAttribute("data-sel");
      if (!id) return;
      if (cb.checked) S.selColabs.add(id);
      else S.selColabs.delete(id);
      syncSelPill();
    });
  });

  // header sort
  $("tblColabs")?.querySelectorAll("th.sortable").forEach((th) => {
    th.onclick = () => {
      const k = th.dataset.sort;
      const cur = S.sort.colabs;
      if (cur.k === k) cur.dir = cur.dir === "asc" ? "desc" : "asc";
      else {
        cur.k = k;
        cur.dir = "asc";
      }
      $("tblColabs")
        ?.querySelectorAll("th.sortable .srt")
        .forEach((srt) => (srt.textContent = ""));
      th.querySelector(".srt") && (th.querySelector(".srt").textContent = cur.dir === "asc" ? "▲" : "▼");
      renderColabs();
    };
  });

  syncSelPill();
}

function syncSelPill() {
  const pill = $("colabsSelPill");
  if (!pill) return;
  pill.innerHTML = `<b>Seleccionados</b> ${S.selColabs.size}`;
}

/* ========= Habilitaciones ========= */
function renderHabil() {
  const head = $("tblHabilHead");
  const body = $("tblHabilBody");
  if (!head || !body) return;

  const rows = (S.colabs || []).map(colabRowView);
  const roles = S.fHabil.roles;
  const equipos = S.fHabil.equipos;
  const q = (S.fHabil.q || "").toLowerCase().trim();

  let list = rows.slice();
  if (roles.size) list = list.filter((r) => roles.has(r.rol));
  if (equipos.size) list = list.filter((r) => equipos.has(r.equipo));
  if (q) {
    list = list.filter((r) => {
      const hay = `${r.id} ${r.nombre} ${r.rol} ${r.equipo}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const flujos = (S.flujos || []).map((f) => f.flujo ?? f.Flujo ?? f.name ?? f.Nombre ?? "").filter(Boolean);

  head.innerHTML = `
    <tr>
      <th>ID_MELI</th>
      <th>Nombre</th>
      ${flujos.map((f) => `<th class="nowrap">${escapeHtml(f)}</th>`).join("")}
    </tr>
  `;

  const h = S.habil || {};
  body.innerHTML = list
    .map((r) => {
      const byUser = h[r.id] || {};
      return `
        <tr>
          <td class="nowrap">${escapeHtml(r.id)}</td>
          <td>${escapeHtml(r.nombre)}</td>
          ${flujos
            .map((f) => {
              const v = byUser[f] || "";
              return `<td class="nowrap">
                <input class="input" style="max-width:70px" data-habil="${escapeAttr(r.id)}||${escapeAttr(f)}" value="${escapeAttr(v)}" />
              </td>`;
            })
            .join("")}
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll("input[data-habil]").forEach((inp) => {
    inp.addEventListener(
      "input",
      debounce(async () => {
        const key = inp.getAttribute("data-habil");
        if (!key) return;
        const [id, flujo] = key.split("||");
        const val = String(inp.value || "").trim().toUpperCase();
        try {
          await API.habilUpdate(id, flujo, val);
          await refreshHabil();
        } catch (e) {
          console.error(e);
          toast("Habilitaciones", "Error al guardar");
        }
      }, 450)
    );
  });
}

/* ========= Operativa diaria ========= */
function renderFlujos() {
  const tbody = $("tblFlujos")?.querySelector("tbody");
  if (!tbody) return;

  const flujos = (S.flujos || []).map((f) => ({
    id: f.id ?? f.ID ?? f.flujo ?? f.Flujo ?? "",
    flujo: f.flujo ?? f.Flujo ?? f.name ?? "",
    req: Number(f.req ?? f.Req ?? 0) || 0,
  }));

  tbody.innerHTML = flujos
    .map(
      (f) => `
      <tr>
        <td>${escapeHtml(f.flujo)}</td>
        <td class="right nowrap">
          <input class="input smallnum" type="number" min="0" step="1" value="${escapeAttr(f.req)}" data-req="${escapeAttr(f.id)}"/>
        </td>
        <td class="right nowrap">
          <button class="btn" data-msg="${escapeAttr(f.flujo)}">Generar mensaje</button>
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll("input[data-req]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const id = inp.getAttribute("data-req");
      const req = Number(inp.value || 0) || 0;
      if (!id) return;
      saveFlujoDebounced(id, req);
    });
  });

  tbody.querySelectorAll("button[data-msg]").forEach((b) => {
    b.addEventListener("click", async () => {
      const flujo = b.getAttribute("data-msg");
      if (!flujo) return;
      setBusy("Operativa diaria", "Generando mensaje...");
      try {
        const msg = await API.planificacionMensajePorFlujo(flujo);
        await copyText(msg || "");
        toast("Copiado", "Mensaje por flujo");
      } catch (e) {
        console.error(e);
        toast("Operativa diaria", "Error al generar mensaje");
      } finally {
        clearBusy();
      }
    });
  });
}

function renderPlan() {
  const grid = $("planGrid");
  if (!grid) return;

  const plan = Array.isArray(S.plan) ? S.plan : [];
  if (!plan.length) {
    grid.innerHTML = `<div class="muted">Sin planificación.</div>`;
    return;
  }

  const byFlujo = {};
  plan.forEach((r) => {
    const flujo = r.Flujo ?? r.flujo ?? "";
    if (!flujo) return;
    if (!byFlujo[flujo]) byFlujo[flujo] = [];
    byFlujo[flujo].push(r);
  });

  grid.innerHTML = Object.entries(byFlujo)
    .map(([flujo, rows]) => {
      const list = rows
        .map((r) => {
          const id = r.ID_MELI ?? r.id ?? "";
          const fijo = String(r.Fijo ?? r.fijo ?? "").toUpperCase() === "SI";
          return `<li>${escapeHtml(id)}${fijo ? " <span class='badge ok'>Fijo</span>" : ""}</li>`;
        })
        .join("");
      return `
        <div class="flow-col">
          <h3>
            <span>${escapeHtml(flujo)}</span>
          </h3>
          <ul>${list}</ul>
        </div>
      `;
    })
    .join("");
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
      const ch = r.canal || "";
      const msg = r.mensaje || "";
      return `
        <tr>
          <td class="nowrap">${escapeHtml(date)}</td>
          <td>${escapeHtml(ch)}</td>
          <td>${escapeHtml(msg)}</td>
          <td class="nowrap"><span class="${badge}">${escapeHtml(estado)}</span></td>
          <td class="right nowrap">
            <button class="btn" data-send="${escapeAttr(r.row || "")}">Enviar</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tb.querySelectorAll("button[data-send]").forEach((b) => {
    b.addEventListener("click", async () => {
      const row = Number(b.getAttribute("data-send") || 0);
      if (!row) return;
      setBusy("Slack Outbox", "Enviando...");
      try {
        await API.slackEnviarFila(row);
        await refreshPlanAndOutbox();
        renderOutbox();
        toast("Slack Outbox", "Enviado");
      } catch (e) {
        console.error(e);
        toast("Slack Outbox", "Error al enviar");
      } finally {
        clearBusy();
      }
    });
  });
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

function renderPresentismo() {
  const tbl = $("tblPresWeek");
  if (!tbl) return;

  if (!S.presWeek || !S.presWeek.days || !S.presWeek.rows) {
    tbl.querySelector("thead").innerHTML = `<tr><th>Estado</th></tr>`;
    tbl.querySelector("tbody").innerHTML = `<tr><td class="muted">Sin datos.</td></tr>`;
    return;
  }

  const days = S.presWeek.days || [];
  const rows = S.presWeek.rows || [];

  // filtros (roles/equipos/busqueda)
  const roles = S.fPres.roles;
  const equipos = S.fPres.equipos;
  const q = (S.fPres.q || "").toLowerCase().trim();

  const colabs = (S.colabs || []).map(colabRowView);
  const mapCol = {};
  colabs.forEach((c) => (mapCol[c.id] = c));

  let list = rows.slice();
  list = list.filter((r) => {
    const id = r.id ?? r.ID_MELI ?? "";
    const c = mapCol[id] || {};
    if (roles.size && !roles.has(c.rol)) return false;
    if (equipos.size && !equipos.has(c.equipo)) return false;
    if (q) {
      const hay = `${id} ${c.nombre} ${c.rol} ${c.equipo}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  tbl.querySelector("thead").innerHTML = `
    <tr>
      <th>Colaborador</th>
      ${days.map((d) => `<th class="nowrap">${escapeHtml(d.label || d)}</th>`).join("")}
    </tr>
  `;

  tbl.querySelector("tbody").innerHTML = list
    .map((r) => {
      const id = r.id ?? r.ID_MELI ?? "";
      const c = mapCol[id] || {};
      const name = c.nombre ? `${c.nombre} (${id})` : id;
      const cells = (r.days || r.vals || []).map((v) => {
        const cls = v && String(v).length > 1 ? "lic" : "";
        return `<td class="${cls}">${escapeHtml(v || "")}</td>`;
      });
      return `<tr><td class="nowrap">${escapeHtml(name)}</td>${cells.join("")}</tr>`;
    })
    .join("") || `<tr><td class="muted">Sin resultados.</td></tr>`;
}

/* ========= Actions ========= */
$("btnReloadDash")?.addEventListener("click", async () => {
  setBusy("Dashboard", "Actualizando...");
  await refreshColabs();
  await refreshPresentismo();
  renderDashboard();
  clearBusy();
  toast("Dashboard", "Actualizado");
});

$("btnReloadColabs")?.addEventListener("click", async () => {
  setBusy("Colaboradores", "Actualizando...");
  await refreshColabs();
  renderColabs();
  clearBusy();
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

$("btnSetLicencia")?.addEventListener("click", async () => {
  const idMeli = $("presSelectColab")?.value || "";
  const tipo = $("presTipo")?.value || "";
  const desde = $("presDesde")?.value || "";
  const hasta = $("presHasta")?.value || "";
  if (!idMeli || !tipo || !desde || !hasta) {
    toast("Presentismo", "Completá todos los campos");
    return;
  }
  setBusy("Presentismo", "Guardando...");
  try {
    await API.presentismoSetLicencia(idMeli, desde, hasta, tipo);
    await refreshPresentismo();
    renderPresentismo();
    toast("Presentismo", "Guardado");
  } catch (e) {
    console.error(e);
    toast("Presentismo", "Error al guardar");
  } finally {
    clearBusy();
  }
});

$("btnGenerarPlan")?.addEventListener("click", async () => {
  setBusy("Operativa diaria", "Generando planificación...");
  try {
    const res = await API.planificacionGenerar();
    await refreshPlanAndOutbox();
    await refreshPresentismo();
    renderPlan();
    renderOutbox();
    renderDashboard();
    // mensaje GENERAL viene desde backend; lo copiamos como estaba en tu flujo anterior
    if (res?.mensaje_general) {
      await copyText(res.mensaje_general);
      toast("Operativa diaria", "Mensaje copiado");
    } else {
      toast("Operativa diaria", "Generado");
    }
  } catch (e) {
    console.error(e);
    toast("Operativa diaria", "Error al generar");
  } finally {
    clearBusy();
  }
});

$("btnAddFlujo")?.addEventListener("click", async () => {
  const name = $("newFlujoName")?.value || "";
  const req = Number($("newFlujoReq")?.value || 0) || 0;
  if (!String(name).trim()) return;
  setBusy("Operativa diaria", "Agregando flujo...");
  try {
    await API.flujoCreate(String(name).trim(), req);
    $("newFlujoName").value = "";
    $("newFlujoReq").value = "";
    await refreshFlujos();
    renderFlujos();
    toast("Operativa diaria", "Agregado");
  } catch (e) {
    console.error(e);
    toast("Operativa diaria", "Error al agregar");
  } finally {
    clearBusy();
  }
});

/* ========= Clear buttons ========= */
$("btnClearColabs")?.addEventListener("click", () => {
  S.fColabs = { roles: new Set(), equipos: new Set(), q: "" };
  // los ms tienen handles locales en init; se limpian desde ahí
  $("searchColabs").value = "";
  $("searchColabsWrap").classList.remove("has");
  renderColabs();
});

$("btnClearHabil")?.addEventListener("click", () => {
  S.fHabil = { roles: new Set(), equipos: new Set(), q: "" };
  $("searchHabil").value = "";
  $("searchHabilWrap").classList.remove("has");
  renderHabil();
});

$("btnClearPres")?.addEventListener("click", () => {
  S.fPres = { roles: new Set(), equipos: new Set(), q: "" };
  $("searchPres").value = "";
  $("searchPresWrap").classList.remove("has");
  renderPresentismo();
});

/* ========= Selection tools (colabs) ========= */
$("btnCopySelIds")?.addEventListener("click", async () => {
  const ids = Array.from(S.selColabs);
  if (!ids.length) return toast("Colaboradores", "Sin selección");
  await copyText(ids.join("\n"));
  toast("Copiado", "IDs");
});
$("btnCopySelMailProd")?.addEventListener("click", async () => {
  const map = {};
  (S.colabs || []).map(colabRowView).forEach((c) => (map[c.id] = c));
  const mails = Array.from(S.selColabs).map((id) => map[id]?.mailProd).filter(Boolean);
  if (!mails.length) return toast("Colaboradores", "Sin mails");
  await copyText(uniq(mails).join("\n"));
  toast("Copiado", "Mail Productora");
});
$("btnCopySelMailExt")?.addEventListener("click", async () => {
  const map = {};
  (S.colabs || []).map(colabRowView).forEach((c) => (map[c.id] = c));
  const mails = Array.from(S.selColabs).map((id) => map[id]?.mailExt).filter(Boolean);
  if (!mails.length) return toast("Colaboradores", "Sin mails");
  await copyText(uniq(mails).join("\n"));
  toast("Copiado", "Mail Externo");
});
$("btnClearSelColabs")?.addEventListener("click", () => {
  S.selColabs.clear();
  renderColabs();
});

/* ========= Init ========= */
async function init() {
  try {
    applyTheme();
    showTab("dashboard");
    setErr("");

    setBusy("Cargando", "Inicializando...");
    await refreshColabs();
    await refreshCanales();
    await refreshFlujos();
    await refreshHabil();
    await refreshPlanAndOutbox();
    await refreshPresentismo();

    // MultiSelect: items
    const rolesList = ROLES_BUCKETS.slice();
    const equiposList = EQUIPOS_PRESET.slice();
    const rolesListHab = ["Analista KV", "Analista PM", "Analista QA"];

    const msRolesCol = mountMultiSelect("msRolesColabs", { title: "Roles", items: rolesList, selected: [], onChange: (set) => { S.fColabs.roles = set; renderColabs(); }});
    const msEquipCol = mountMultiSelect("msEquiposColabs", { title: "Equipo", items: equiposList, selected: [], onChange: (set) => { S.fColabs.equipos = set; renderColabs(); }});

    const msRolesHab = mountMultiSelect("msRolesHabil", { title: "Roles", items: rolesListHab, selected: [], onChange: (set) => { S.fHabil.roles = set; renderHabil(); }});
    const msEquipHab = mountMultiSelect("msEquiposHabil", { title: "Equipo", items: equiposList, selected: [], onChange: (set) => { S.fHabil.equipos = set; renderHabil(); }});

    const msRolesPres = mountMultiSelect("msRolesPres", { title: "Roles", items: rolesList, selected: [], onChange: (set) => { S.fPres.roles = set; renderPresentismo(); }});
    const msEquipPres = mountMultiSelect("msEquiposPres", { title: "Equipo", items: equiposList, selected: [], onChange: (set) => { S.fPres.equipos = set; renderPresentismo(); }});

    msSemanaPres = mountSemanaSelect("msSemanaPres", {
      title: "Semana",
      onChange: async (val) => {
        S.presSemanaSel = String(val || "");
        setBusy("Presentismo", "Actualizando...");
        await refreshPresentismo();
        mountPresentismoSelect();
        renderPresentismo();
        clearBusy();
      },
    });

    // poblar opciones/valor actual (incluye "Actual")
    syncPresSemanaSelect_();

    mountSearch("searchColabs", "searchColabsWrap", "clearSearchColabs", (q) => { S.fColabs.q = q; renderColabs(); });
    mountSearch("searchHabil", "searchHabilWrap", "clearSearchHabil", (q) => { S.fHabil.q = q; renderHabil(); });
    mountSearch("searchPres", "searchPresWrap", "clearSearchPres", (q) => { S.fPres.q = q; renderPresentismo(); });

    // Limpiar (respetando que por defecto sea "Todos")
    $("btnClearColabs")?.addEventListener("click", () => {
      S.fColabs = { roles: new Set(), equipos: new Set(), q: "" };
      msRolesCol?.clear(); msEquipCol?.clear();
      $("searchColabs").value = ""; $("searchColabsWrap").classList.remove("has");
      renderColabs();
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

    // render inicial
    renderDashboard();
    renderFlujos();
    renderPlan();
    renderOutbox();
    mountPresentismoSelect();
    renderColabs();
    renderHabil();
    renderPresentismo();
  } catch (e) {
    console.error(e);
    setErr("Error cargando datos. Revisá consola y backend.");
  } finally {
    clearBusy();
  }
}

init();

