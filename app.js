import { HUB } from "./api.js";

/* =========================
   Utils
========================= */
const $ = (s) => document.querySelector(s);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(type, title, msg) {
  const wrap = $("#toasts");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<p class="t">${escapeHtml(title)}</p><p class="m">${escapeHtml(msg)}</p>`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function setStatus(msg) {
  $("#status").textContent = msg;
}

function setCards(cards) {
  const el = $("#cards");
  el.innerHTML = "";
  cards.forEach(({ label, value, sub }) => {
    const c = document.createElement("div");
    c.className = "kpi";
    c.innerHTML = `
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}</div>
      ${sub ? `<div class="small">${escapeHtml(sub)}</div>` : ""}
    `;
    el.appendChild(c);
  });
}

function toMonthShortEs_(d) {
  const m = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return m[d.getMonth()];
}

function formatDateShort_(v) {
  if (!v) return "";
  // si viene Date serializado en GAS suele venir como string; intentamos parsear
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2,"0")}-${toMonthShortEs_(d)}`;
  }
  // si viene como "2026-01-08"
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
    const d2 = new Date(String(v) + "T00:00:00");
    return `${String(d2.getDate()).padStart(2,"0")}-${toMonthShortEs_(d2)}`;
  }
  // si viene "08 ene" ya está
  const s = String(v);
  return s.length <= 8 ? s : s;
}

async function copyText_(text) {
  try {
    await navigator.clipboard.writeText(String(text ?? ""));
    toast("good", "Copiado", "Listo.");
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = String(text ?? "");
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("good", "Copiado", "Listo.");
  }
}

function debounce(fn, ms = 450) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* =========================
   State
========================= */
const state = {
  tab: "operativa",
  cache: {
    colabs: null,
    flujos: null,
    canales: null,
    plan: null,
    outbox: null,
    habMatrix: null,
    presToday: null,
  },
  theme: localStorage.getItem("hub_theme") || "dark",
};

const TABS = [
  { key: "operativa", label: "Operativa diaria" },
  { key: "colaboradores", label: "Colaboradores" },
  { key: "habilitaciones", label: "Habilitaciones" },
  { key: "presentismo", label: "Presentismo" },
];

init();

function init() {
  // theme
  applyTheme_(state.theme);
  $("#themeBtn").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("hub_theme", state.theme);
    applyTheme_(state.theme);
  });

  renderTabs_();
  $("#healthChip").addEventListener("click", runHealth);

  loadTab_(state.tab, true);
  runHealth().catch(() => {});
}

function applyTheme_(mode) {
  document.body.classList.toggle("light", mode === "light");
  $("#themeBtn").textContent = mode === "light" ? "Oscuro" : "Claro";
}

function renderTabs_() {
  const el = $("#tabs");
  el.innerHTML = "";
  TABS.forEach((t) => {
    const b = document.createElement("button");
    b.className = `tab ${state.tab === t.key ? "active" : ""}`;
    b.textContent = t.label;
    b.addEventListener("click", () => {
      state.tab = t.key;
      renderTabs_();
      loadTab_(t.key, false);
    });
    el.appendChild(b);
  });
}

async function runHealth() {
  const dot = $("#healthDot");
  const txt = $("#healthText");
  txt.textContent = "…";
  dot.className = "dot";
  try {
    await HUB.health();
    txt.textContent = "ok";
    dot.className = "dot ok";
    return true;
  } catch (e) {
    txt.textContent = "fail";
    dot.className = "dot bad";
    toast("bad", "Health FAIL", e.message || "No responde");
    throw e;
  }
}

async function loadTab_(tab, force) {
  $("#content").innerHTML = "";
  $("#controls").innerHTML = "";
  $("#cards").innerHTML = "";

  try {
    if (tab === "operativa") return await tabOperativa_(force);
    if (tab === "colaboradores") return await tabColaboradores_(force);
    if (tab === "habilitaciones") return await tabHabilitaciones_(force);
    if (tab === "presentismo") return await tabPresentismo_(force);
  } catch (e) {
    setStatus("Error.");
    toast("bad", "Error", e.message || String(e));
    $("#content").innerHTML = `<div class="empty">Falló: <span class="mono">${escapeHtml(e.message || String(e))}</span></div>`;
  }
}

/* =========================
   Data loaders
========================= */
async function ensureBase_(force) {
  const [colabs, flujos, canales] = await Promise.all([
    force || !state.cache.colabs ? HUB.colaboradoresList() : state.cache.colabs,
    force || !state.cache.flujos ? HUB.flujosList() : state.cache.flujos,
    force || !state.cache.canales ? HUB.canalesList() : state.cache.canales,
  ]);
  state.cache.colabs = colabs;
  state.cache.flujos = flujos;
  state.cache.canales = canales;
  return { colabs, flujos, canales };
}

function isAnalista_(rol) {
  return /analista/i.test(String(rol || ""));
}

/* =========================
   TAB: Operativa diaria
========================= */
async function tabOperativa_(force) {
  setStatus("Cargando Operativa diaria…");

  const { flujos, canales } = await ensureBase_(force);

  const [pres, plan, outbox] = await Promise.all([
    force || !state.cache.presToday ? HUB.presentismoSummaryToday() : state.cache.presToday,
    force || !state.cache.plan ? HUB.planificacionGet().catch(() => []) : state.cache.plan,
    force || !state.cache.outbox ? HUB.slackOutboxList().catch(() => []) : state.cache.outbox,
  ]);

  state.cache.presToday = pres;
  state.cache.plan = plan;
  state.cache.outbox = outbox;

  // Cards nuevas
  setCards([
    { label: "Perfiles disponibles (presentes hoy)", value: String(pres.presentes ?? 0), sub: "Solo Analistas con P hoy" },
    { label: "Licencias hoy", value: String(pres.licencias ?? 0), sub: "E/M/MM/AI" },
  ]);

  // Controls: acciones clave (sin botón recargar)
  $("#controls").innerHTML = `
    <span class="badge">Paso 1 → definí perfiles por flujo. Paso 2 → generá/ajustá planificación. Paso 3 → ajustá mensajes y enviá.</span>
    <button class="btn primary" id="btnPlanGen">2) Generar planificación</button>
    <button class="btn" id="btnSlackGen">3) Generar Outbox</button>
    <button class="btn good" id="btnSlackSend">Enviar pendientes</button>
  `;

  $("#btnPlanGen").addEventListener("click", async () => {
    if (!confirm("Vas a generar planificación. ¿Confirmás?")) return;
    setStatus("Generando planificación…");
    await HUB.planificacionGenerar();
    toast("good", "OK", "Planificación generada.");
    await loadTab_("operativa", true);
  });

  $("#btnSlackGen").addEventListener("click", async () => {
    setStatus("Generando Outbox…");
    await HUB.slackOutboxGenerar();
    toast("good", "OK", "Outbox generado.");
    await loadTab_("operativa", true);
  });

  $("#btnSlackSend").addEventListener("click", async () => {
    if (!confirm("Vas a enviar pendientes a Slack. Si te equivocás no hay undo. ¿Confirmás?")) return;
    setStatus("Enviando…");
    const res = await HUB.slackOutboxEnviar();
    toast("good", "Slack", `Enviados: ${res.enviados ?? "?"} · Errores: ${res.errores ?? "?"}`);
    await loadTab_("operativa", true);
  });

  // Layout por pasos (más intuitivo)
  $("#content").innerHTML = `
    <div class="grid2">
      <div class="section">
        <h3>1) Flujos (Perfiles requeridos)</h3>
        <div class="small">Edita y se guarda automático. También podés agregar o borrar flujos.</div>
        <div id="flujosBox"></div>
      </div>

      <div class="section">
        <h3>2) Planificación (resultado)</h3>
        <div class="small">Se muestra agrupado por Flujo. Canal editable por dropdown.</div>
        <div id="planBox"></div>
      </div>
    </div>

    <div class="section" style="margin-top:16px;">
      <h3>3) Slack Outbox (pendientes)</h3>
      <div class="small">Canal y Mensaje editables. Botón para copiar texto.</div>
      <div id="slackBox"></div>
    </div>
  `;

  renderFlujosStep_(flujos, canales);
  renderPlanStep_(plan, canales);
  renderSlackStep_(outbox, canales);

  setStatus("Listo.");
}

function canalesOptions_(canales, selected) {
  const list = (canales || []).map(r => String(r["Canal (nombre)"] || r.Canal || "").trim()).filter(Boolean);
  return `
    <option value="">—</option>
    ${list.map(c => `<option value="${escapeHtml(c)}" ${c===selected?"selected":""}>${escapeHtml(c)}</option>`).join("")}
  `;
}

/* ---- Paso 1: Flujos ---- */
function renderFlujosStep_(flujos, canales) {
  const mount = $("#flujosBox");
  const flujoNames = flujos.map(f => String(f.Flujo || "").trim()).filter(Boolean);

  mount.innerHTML = `
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin:10px 0;">
      <select id="selFlujo">${canalesOptions_([{ "Canal (nombre)": "" }], "")}</select>
      <select id="selFlujo" style="display:none"></select>
      <select id="flujoPick">
        <option value="">Seleccionar flujo…</option>
        ${flujoNames.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("")}
        <option value="__NEW__">+ Nuevo flujo…</option>
      </select>

      <input id="flujoNew" placeholder="Nombre de nuevo flujo" style="display:none; min-width:240px"/>
      <input id="flujoReq" type="number" min="0" step="1" placeholder="Perfiles requeridos" style="width:180px"/>
      <select id="flujoSlack" style="min-width:240px">${canalesOptions_(canales, "")}</select>

      <button class="btn primary" id="flujoSave">Guardar</button>
      <button class="btn bad" id="flujoDelete">Borrar flujo</button>
    </div>

    <div style="overflow:auto; border:1px solid rgba(255,255,255,.12); border-radius:14px;">
      <table>
        <thead>
          <tr>
            <th>Flujo</th>
            <th>Perfiles requeridos</th>
            <th>Slack channel</th>
          </tr>
        </thead>
        <tbody>
          ${flujos.map(r=>{
            const f = String(r.Flujo||"");
            const p = r.Perfiles_requeridos ?? "";
            const s = String(r.Slack_Channel||"");
            return `
              <tr>
                <td class="copyable" data-copy="${escapeHtml(f)}">${escapeHtml(f)}</td>
                <td>${escapeHtml(p)}</td>
                <td>${escapeHtml(s)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  // copy
  mount.querySelectorAll(".copyable").forEach(el=>{
    el.addEventListener("click", ()=>copyText_(el.getAttribute("data-copy")));
  });

  const pick = $("#flujoPick");
  const inpNew = $("#flujoNew");
  const inpReq = $("#flujoReq");
  const selSlack = $("#flujoSlack");

  pick.addEventListener("change", ()=>{
    const v = pick.value;
    if (v === "__NEW__") {
      inpNew.style.display = "";
      inpNew.value = "";
      inpReq.value = "";
      selSlack.value = "";
    } else if (v) {
      inpNew.style.display = "none";
      inpNew.value = "";
      const row = flujos.find(x => String(x.Flujo||"").trim() === v) || {};
      inpReq.value = row.Perfiles_requeridos ?? 0;
      selSlack.value = String(row.Slack_Channel||"");
    } else {
      inpNew.style.display = "none";
      inpNew.value = "";
      inpReq.value = "";
      selSlack.value = "";
    }
  });

  $("#flujoSave").addEventListener("click", async ()=>{
    const mode = pick.value;
    const flujo = mode === "__NEW__" ? String(inpNew.value||"").trim() : String(mode||"").trim();
    const perfiles = Number(inpReq.value||0);
    const slack_channel = String(selSlack.value||"").trim();

    if (!flujo) return toast("bad","Falta flujo","Elegí o escribí un flujo.");
    if (!Number.isFinite(perfiles) || perfiles < 0) return toast("bad","Número inválido","Perfiles debe ser >= 0.");

    setStatus("Guardando flujo…");
    await HUB.flujosUpsert({ flujo, perfiles_requeridos: perfiles, slack_channel });
    toast("good","OK","Flujo guardado.");
    await loadTab_("operativa", true);
  });

  $("#flujoDelete").addEventListener("click", async ()=>{
    const v = String(pick.value||"").trim();
    if (!v || v==="__NEW__") return toast("warn","Elegí un flujo","Seleccioná un flujo existente.");
    if (!confirm(`Vas a borrar el flujo "${v}". ¿Confirmás?`)) return;
    setStatus("Borrando…");
    await HUB.flujosDelete(v);
    toast("good","OK","Flujo borrado.");
    await loadTab_("operativa", true);
  });
}

/* ---- Paso 2: Planificación ---- */
function renderPlanStep_(plan, canales) {
  const mount = $("#planBox");
  const rows = Array.isArray(plan) ? plan : [];
  if (!rows.length) {
    mount.innerHTML = `<div class="empty">Sin datos en Planificación.</div>`;
    return;
  }

  // Normalización columnas (y eliminar Comentario si existe)
  const cols = Object.keys(rows[0]).filter(c => c !== "Comentario");
  // Agrupar por Flujo si existe
  const flujoCol = cols.find(c => /flujo/i.test(c)) || "Flujo";

  const groups = {};
  rows.forEach(r=>{
    const f = String(r[flujoCol] ?? r.Flujo ?? "Sin flujo");
    (groups[f] ||= []).push(r);
  });

  const canalCol = cols.find(c => /Canal_destino/i.test(c)) || "Canal_destino";
  const fechaCol = cols.find(c => /^Fecha$/i.test(c)) || "Fecha";

  const saveDebounced = debounce(async (updates) => {
    try {
      await HUB.planificacionBatchSet(updates);
      toast("good","Guardado","Planificación actualizada.");
    } catch (e) {
      toast("bad","Error guardando", e.message || String(e));
    }
  }, 550);

  mount.innerHTML = Object.keys(groups).sort().map(flujo=>{
    const g = groups[flujo];

    return `
      <div class="card" style="margin:12px 0;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="badge">Flujo</div>
            <div style="font-size:18px; font-weight:700; margin-top:4px;">${escapeHtml(flujo)}</div>
          </div>
          <div class="badge">${g.length} filas</div>
        </div>

        <div style="overflow:auto; margin-top:10px;">
          <table>
            <thead>
              <tr>
                ${cols.filter(c=>c!=="Comentario").map(c=>{
                  if (c===fechaCol) return `<th>Fecha</th>`;
                  if (c===canalCol) return `<th>Canal destino</th>`;
                  return `<th>${escapeHtml(c)}</th>`;
                }).join("")}
              </tr>
            </thead>
            <tbody>
              ${g.map(r=>{
                const rid = String(r.Row ?? r.row ?? "");
                return `
                  <tr>
                    ${cols.filter(c=>c!=="Comentario").map(c=>{
                      if (c===fechaCol) return `<td>${escapeHtml(formatDateShort_(r[c]))}</td>`;

                      if (c===canalCol) {
                        const val = String(r[c]||"");
                        return `
                          <td>
                            <select data-plan-row="${escapeHtml(rid)}" data-plan-col="${escapeHtml(c)}">
                              ${canalesOptions_(canales, val)}
                            </select>
                          </td>
                        `;
                      }

                      const v = r[c] ?? "";
                      return `<td class="copyable" data-copy="${escapeHtml(v)}">${escapeHtml(v)}</td>`;
                    }).join("")}
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join("");

  // copy
  mount.querySelectorAll(".copyable").forEach(el=>{
    el.addEventListener("click", ()=>copyText_(el.getAttribute("data-copy")));
  });

  // changes
  const pending = [];
  mount.querySelectorAll("select[data-plan-row]").forEach(sel=>{
    sel.addEventListener("change", ()=>{
      const Row = sel.getAttribute("data-plan-row");
      const col = sel.getAttribute("data-plan-col");
      pending.push({ Row, [col]: sel.value });
      saveDebounced(pending.splice(0, pending.length));
    });
  });
}

/* ---- Paso 3: Slack Outbox ---- */
function renderSlackStep_(outbox, canales) {
  const mount = $("#slackBox");
  const rows = Array.isArray(outbox) ? outbox : [];
  if (!rows.length) {
    mount.innerHTML = `<div class="empty">Sin datos en Slack Outbox.</div>`;
    return;
  }

  // Solo pendientes primero
  const pendingRows = rows
    .map(r => ({ ...r, __estado: String(r.Estado||"") }))
    .sort((a,b)=> (a.__estado.startsWith("PENDIENTE") ? -1 : 1) - (b.__estado.startsWith("PENDIENTE") ? -1 : 1));

  const colsRaw = Object.keys(pendingRows[0]);
  const cols = colsRaw.filter(c => !["Tipo","Slack_Channel_ID"].includes(c)); // eliminar columnas pedidas
  const fechaCol = cols.find(c => /^Fecha$/i.test(c)) || "Fecha";
  const canalCol = cols.find(c => /^Canal$/i.test(c)) || "Canal";
  const msgCol = cols.find(c => /^Mensaje$/i.test(c)) || "Mensaje";

  const saveDebounced = debounce(async (updates) => {
    try {
      await HUB.slackOutboxBatchSet(updates);
      toast("good","Guardado","Outbox actualizado.");
    } catch (e) {
      toast("bad","Error guardando", e.message || String(e));
    }
  }, 650);

  mount.innerHTML = `
    <div style="overflow:auto; border:1px solid rgba(255,255,255,.12); border-radius:14px;">
      <table>
        <thead>
          <tr>
            ${cols.map(c=>{
              if (c===fechaCol) return `<th>Fecha</th>`;
              if (c===canalCol) return `<th>Canal</th>`;
              if (c===msgCol) return `<th>Mensaje</th>`;
              return `<th>${escapeHtml(c)}</th>`;
            }).join("")}
            <th>Copiar</th>
          </tr>
        </thead>
        <tbody>
          ${pendingRows.map(r=>{
            const rid = String(r.Row ?? r.row ?? "");
            return `
              <tr>
                ${cols.map(c=>{
                  if (c===fechaCol) return `<td>${escapeHtml(formatDateShort_(r[c]))}</td>`;

                  if (c===canalCol) {
                    const val = String(r[c]||"");
                    return `
                      <td>
                        <select data-out-row="${escapeHtml(rid)}" data-out-col="${escapeHtml(c)}">
                          ${canalesOptions_(canales, val)}
                        </select>
                      </td>
                    `;
                  }

                  if (c===msgCol) {
                    const val = String(r[c]||"");
                    return `
                      <td style="min-width:420px;">
                        <textarea data-out-row="${escapeHtml(rid)}" data-out-col="${escapeHtml(c)}" rows="3" style="width:100%;">${escapeHtml(val)}</textarea>
                      </td>
                    `;
                  }

                  const v = r[c] ?? "";
                  return `<td class="copyable" data-copy="${escapeHtml(v)}">${escapeHtml(v)}</td>`;
                }).join("")}
                <td>
                  <button class="btn" data-copy-btn="1" data-copy-text="${escapeHtml(String(r[msgCol]||""))}">Copiar</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  // copy cells
  mount.querySelectorAll(".copyable").forEach(el=>{
    el.addEventListener("click", ()=>copyText_(el.getAttribute("data-copy")));
  });

  // copy msg btn
  mount.querySelectorAll("button[data-copy-btn='1']").forEach(btn=>{
    btn.addEventListener("click", ()=>copyText_(btn.getAttribute("data-copy-text")));
  });

  const pending = [];
  mount.querySelectorAll("select[data-out-row]").forEach(sel=>{
    sel.addEventListener("change", ()=>{
      const Row = sel.getAttribute("data-out-row");
      const col = sel.getAttribute("data-out-col");
      pending.push({ Row, [col]: sel.value });
      saveDebounced(pending.splice(0, pending.length));
    });
  });

  mount.querySelectorAll("textarea[data-out-row]").forEach(ta=>{
    const onInput = debounce(()=>{
      const Row = ta.getAttribute("data-out-row");
      const col = ta.getAttribute("data-out-col");
      pending.push({ Row, [col]: ta.value });
      saveDebounced(pending.splice(0, pending.length));
    }, 700);
    ta.addEventListener("input", onInput);
  });
}

/* =========================
   TAB: Colaboradores
========================= */
async function tabColaboradores_(force) {
  setStatus("Cargando colaboradores…");
  const { colabs } = await ensureBase_(force);

  // Solo analistas
  const analistas = colabs.filter(r => isAnalista_(r.Rol));
  const total = analistas.length;

  // Cards por ubicación
  const locCounts = {};
  analistas.forEach(r=>{
    const u = String(r.Ubicacion || r.Ubicación || "").trim() || "Sin ubicación";
    locCounts[u] = (locCounts[u]||0)+1;
  });

  // Mostrar BA / MDP / Tandil si existen
  const wanted = ["Buenos Aires","Mar del Plata","Tandil"];
  const cards = [{ label:"Colaboradores (Analistas)", value:String(total) }];
  wanted.forEach(w=>{
    if (locCounts[w]!=null) cards.push({ label:w, value:String(locCounts[w]) });
  });
  setCards(cards);

  $("#controls").innerHTML = `
    <input id="qCol" placeholder="Buscar por Nombre / ID_MELI / Mail / TAG" style="min-width:320px;" />
    <select id="fEquipo"><option value="">Equipo (todos)</option></select>
    <select id="fRol"><option value="">Rol (todos)</option></select>
    <select id="fUb"><option value="">Ubicación (todas)</option></select>
  `;

  // opciones filtros
  fillSelect_($("#fEquipo"), uniq_(analistas.map(r=>r.Equipo)));
  fillSelect_($("#fRol"), uniq_(analistas.map(r=>r.Rol)));
  fillSelect_($("#fUb"), uniq_(analistas.map(r=>r.Ubicacion || r.Ubicación)));

  const render = () => {
    const q = String($("#qCol").value||"").toLowerCase().trim();
    const fe = $("#fEquipo").value;
    const fr = $("#fRol").value;
    const fu = $("#fUb").value;

    const filtered = analistas.filter(r=>{
      if (fe && String(r.Equipo||"")!==fe) return false;
      if (fr && String(r.Rol||"")!==fr) return false;
      if (fu && String(r.Ubicacion||r.Ubicación||"")!==fu) return false;

      if (!q) return true;
      const blob = [
        r.Nombre, r.ID_MELI, r.TAG,
        r["Mail Productora"], r["Mail Externo"]
      ].map(x=>String(x||"").toLowerCase()).join(" ");
      return blob.includes(q);
    });

    const cols = ["Nombre","ID_MELI","Equipo","Rol","Ubicacion","TAG","Mail Productora","Mail Externo","Fecha Ingreso"];
    $("#content").innerHTML = `
      <div style="overflow:auto; border:1px solid rgba(255,255,255,.12); border-radius:14px;">
        <table>
          <thead><tr>${cols.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
          <tbody>
            ${filtered.map(r=>`
              <tr>
                ${cols.map(c=>{
                  const v =
                    c==="Ubicacion" ? (r.Ubicacion || r.Ubicación || "") :
                    (r[c] ?? "");
                  return `<td class="copyable" data-copy="${escapeHtml(v)}">${escapeHtml(v)}</td>`;
                }).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="small" style="margin-top:8px;">Mostrando ${filtered.length}/${total} analistas.</div>
    `;

    $("#content").querySelectorAll(".copyable").forEach(el=>{
      el.addEventListener("click", ()=>copyText_(el.getAttribute("data-copy")));
    });

    setStatus("Listo.");
  };

  ["qCol","fEquipo","fRol","fUb"].forEach(id=>$("#"+id).addEventListener("input", render));
  ["fEquipo","fRol","fUb"].forEach(id=>$("#"+id).addEventListener("change", render));
  render();
}

function uniq_(arr){
  return [...new Set(arr.map(x=>String(x||"").trim()).filter(Boolean))].sort();
}
function fillSelect_(sel, items){
  items.forEach(x=>{
    const o=document.createElement("option");
    o.value=x; o.textContent=x;
    sel.appendChild(o);
  });
}

/* =========================
   TAB: Habilitaciones
========================= */
async function tabHabilitaciones_(force) {
  setStatus("Cargando habilitaciones…");
  const { colabs, flujos } = await ensureBase_(force);
  const hab = force || !state.cache.habMatrix ? await HUB.habilitacionesMatrix() : state.cache.habMatrix;
  state.cache.habMatrix = hab;

  const analistas = colabs.filter(r => isAnalista_(r.Rol));
  setCards([{ label:"Colaboradores (Analistas)", value:String(analistas.length) }]);

  // filtros + búsqueda
  $("#controls").innerHTML = `
    <input id="qHab" placeholder="Buscar por Nombre / ID_MELI" style="min-width:320px;" />
    <select id="hEquipo"><option value="">Equipo (todos)</option></select>
    <select id="hRol"><option value="">Rol (todos)</option></select>
    <select id="hUb"><option value="">Ubicación (todas)</option></select>
  `;
  fillSelect_($("#hEquipo"), uniq_(analistas.map(r=>r.Equipo)));
  fillSelect_($("#hRol"), uniq_(analistas.map(r=>r.Rol)));
  fillSelect_($("#hUb"), uniq_(analistas.map(r=>r.Ubicacion || r.Ubicación)));

  // pivot habilitaciones: idMeli -> flujo -> {habilitado,fijo}
  const byId = {};
  (hab.rows||[]).forEach(r=>{
    const id = String(r.ID_MELI||"").trim();
    const f = String(r.Flujo||"").trim();
    if (!id || !f) return;
    byId[id] ||= {};
    byId[id][f] = {
      habilitado: String(r.Habilitado||"").toUpperCase() === "TRUE" || String(r.Habilitado||"")==="1" || String(r.Habilitado||"").toUpperCase()==="SI",
      fijo: String(r.Fijo||"").toUpperCase() === "TRUE" || String(r.Fijo||"")==="1" || String(r.Fijo||"").toUpperCase()==="SI"
    };
  });

  const flujoList = flujos.map(x=>String(x.Flujo||"").trim()).filter(Boolean);

  const saveDebounced = debounce(async (idMeli, flujo, payload) => {
    try {
      await HUB.habilitacionesSet(idMeli, flujo, payload);
      toast("good","Guardado",`${idMeli} · ${flujo}`);
    } catch(e) {
      toast("bad","Error guardando", e.message||String(e));
    }
  }, 500);

  const render = () => {
    const q = String($("#qHab").value||"").toLowerCase().trim();
    const fe = $("#hEquipo").value;
    const fr = $("#hRol").value;
    const fu = $("#hUb").value;

    const filtered = analistas.filter(r=>{
      if (fe && String(r.Equipo||"")!==fe) return false;
      if (fr && String(r.Rol||"")!==fr) return false;
      if (fu && String(r.Ubicacion||r.Ubicación||"")!==fu) return false;
      if (!q) return true;
      return (`${r.Nombre||""} ${r.ID_MELI||""}`.toLowerCase().includes(q));
    });

    $("#content").innerHTML = `
      <div style="overflow:auto; border:1px solid rgba(255,255,255,.12); border-radius:14px;">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th class="mono">ID_MELI</th>
              <th>Equipo</th>
              <th>Rol</th>
              <th>Ubicación</th>
              ${flujoList.map(f=>`<th>${escapeHtml(f)}<div class="small">H / F</div></th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${filtered.map(r=>{
              const id = String(r.ID_MELI||"").trim();
              return `
                <tr>
                  <td class="copyable" data-copy="${escapeHtml(r.Nombre||"")}">${escapeHtml(r.Nombre||"")}</td>
                  <td class="mono copyable" data-copy="${escapeHtml(id)}">${escapeHtml(id)}</td>
                  <td>${escapeHtml(r.Equipo||"")}</td>
                  <td>${escapeHtml(r.Rol||"")}</td>
                  <td>${escapeHtml(r.Ubicacion||r.Ubicación||"")}</td>
                  ${flujoList.map(f=>{
                    const cur = (byId[id] && byId[id][f]) ? byId[id][f] : { habilitado:false, fijo:false };
                    return `
                      <td style="text-align:center;">
                        <label class="small">
                          <input type="checkbox" data-hab="1" data-id="${escapeHtml(id)}" data-flujo="${escapeHtml(f)}" data-kind="habilitado" ${cur.habilitado?"checked":""}/>
                          H
                        </label>
                        <br/>
                        <label class="small">
                          <input type="checkbox" data-hab="1" data-id="${escapeHtml(id)}" data-flujo="${escapeHtml(f)}" data-kind="fijo" ${cur.fijo?"checked":""}/>
                          F
                        </label>
                      </td>
                    `;
                  }).join("")}
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="small" style="margin-top:8px;">Tip: al tildar se guarda automático (debounced).</div>
    `;

    // copy
    $("#content").querySelectorAll(".copyable").forEach(el=>{
      el.addEventListener("click", ()=>copyText_(el.getAttribute("data-copy")));
    });

    // handlers
    $("#content").querySelectorAll("input[data-hab='1']").forEach(ch=>{
      ch.addEventListener("change", ()=>{
        const id = ch.getAttribute("data-id");
        const flujo = ch.getAttribute("data-flujo");
        const kind = ch.getAttribute("data-kind");
        const val = ch.checked;

        byId[id] ||= {};
        byId[id][flujo] ||= { habilitado:false, fijo:false };
        byId[id][flujo][kind] = val;

        saveDebounced(id, flujo, byId[id][flujo]);
      });
    });

    setStatus("Listo.");
  };

  ["qHab","hEquipo","hRol","hUb"].forEach(id=>$("#"+id).addEventListener("input", render));
  ["hEquipo","hRol","hUb"].forEach(id=>$("#"+id).addEventListener("change", render));
  render();
}

/* =========================
   TAB: Presentismo
========================= */
async function tabPresentismo_(force) {
  setStatus("Cargando presentismo…");
  const { colabs } = await ensureBase_(force);

  // filtros UI (sin “guardar”: autosave)
  $("#controls").innerHTML = `
    <input id="qPres" placeholder="Buscar por Nombre / ID_MELI" style="min-width:280px;" />
    <select id="pEquipo"><option value="">Equipo (todos)</option></select>
    <select id="pRol"><option value="">Rol (todos)</option></select>
    <select id="pUb"><option value="">Ubicación (todas)</option></select>
    <input id="pFrom" type="date" />
    <input id="pTo" type="date" />
    <span class="badge">Rango es aproximado si tus headers no tienen año</span>
  `;

  const analistas = colabs.filter(r=>isAnalista_(r.Rol));
  fillSelect_($("#pEquipo"), uniq_(analistas.map(r=>r.Equipo)));
  fillSelect_($("#pRol"), uniq_(analistas.map(r=>r.Rol)));
  fillSelect_($("#pUb"), uniq_(analistas.map(r=>r.Ubicacion || r.Ubicación)));

  const saveDebounced = debounce(async (updates)=>{
    try {
      await HUB.presentismoBatchSet(updates);
      toast("good","Guardado","Presentismo actualizado.");
    } catch(e) {
      toast("bad","Error guardando", e.message||String(e));
    }
  }, 650);

  let pending = [];

  const render = async () => {
    setStatus("Cargando matriz…");

    const q = String($("#qPres").value||"").trim();
    const equipo = $("#pEquipo").value;
    const rol = $("#pRol").value;
    const ubicacion = $("#pUb").value;
    const from = $("#pFrom").value;
    const to = $("#pTo").value;

    const matrix = await HUB.presentismoMatrix({ q, equipo, rol, ubicacion, from, to });

    // cruzar ubicación desde Colaboradores si Presentismo no la trae: acá asumimos que el filtro ub ya lo hiciste por colabs->rol, pero matrix filtra por Equipo/Rol en sheet.
    // (si querés exactitud, hay que meter Ubicacion en Presentismo o hacer join en backend)

    // Cards: presentes hoy + licencias hoy
    const presToday = force || !state.cache.presToday ? await HUB.presentismoSummaryToday() : state.cache.presToday;
    state.cache.presToday = presToday;

    setCards([
      { label:"Colaboradores presentes (hoy)", value:String(presToday.presentes ?? 0), sub:"Analistas con P hoy" },
      { label:"Con licencia (hoy)", value:String(presToday.licencias ?? 0), sub:"E/M/MM/AI" },
    ]);

    // tabla
    const days = matrix.days || [];
    const rows = matrix.rows || [];

    if (!rows.length) {
      $("#content").innerHTML = `<div class="empty">Sin datos para esos filtros.</div>`;
      setStatus("Listo.");
      return;
    }

    $("#content").innerHTML = `
      <style>
        .matrixWrap{ overflow:auto; border:1px solid rgba(255,255,255,.12); border-radius:14px; }
        .presCell{ cursor:pointer; text-align:center; width:52px; }
        .presCell:hover{ background: rgba(43,124,255,.08); }
        th.day{ min-width:52px; text-align:center; }
        th.sticky, td.sticky{ position:sticky; left:0; z-index:3; background: rgba(12,19,37,.95); }
        body.light th.sticky, body.light td.sticky{ background: rgba(255,255,255,.95); }
        th.sticky2, td.sticky2{ position:sticky; left:240px; z-index:2; background: rgba(12,19,37,.95); }
        body.light th.sticky2, body.light td.sticky2{ background: rgba(255,255,255,.95); }
        td.sticky{ min-width:240px; }
        td.sticky2{ min-width:140px; }
      </style>

      <div class="matrixWrap">
        <table>
          <thead>
            <tr>
              <th class="sticky">Nombre</th>
              <th class="sticky2">ID_MELI</th>
              <th>Días trabajados</th>
              ${days.map(d=>`<th class="day">${escapeHtml(d.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>{
              return `
                <tr>
                  <td class="sticky copyable" data-copy="${escapeHtml(r.Nombre)}">${escapeHtml(r.Nombre)}</td>
                  <td class="sticky2 mono copyable" data-copy="${escapeHtml(r.ID_MELI)}">${escapeHtml(r.ID_MELI)}</td>
                  <td>${escapeHtml(r.dias_trabajados ?? 0)}</td>
                  ${days.map(d=>{
                    const code = String((r.codes||{})[d.key]||"").trim().toUpperCase();
                    return `
                      <td class="presCell" data-pres="1" data-id="${escapeHtml(r.ID_MELI)}" data-day="${escapeHtml(d.key)}" data-code="${escapeHtml(code)}">
                        ${escapeHtml(code)}
                      </td>
                    `;
                  }).join("")}
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="small" style="margin-top:8px;">Click en una celda → editás el código → se guarda automático (debounced). Códigos: P, V, E, M, MM, AI, vacío.</div>
    `;

    // copy
    $("#content").querySelectorAll(".copyable").forEach(el=>{
      el.addEventListener("click", ()=>copyText_(el.getAttribute("data-copy")));
    });

    // edit cells autosave
    $("#content").querySelectorAll("td[data-pres='1']").forEach(cell=>{
      cell.addEventListener("click", ()=>{
        const idMeli = cell.getAttribute("data-id");
        const dayKey = cell.getAttribute("data-day");
        const cur = cell.getAttribute("data-code") || "";
        const next = prompt(`Código (${idMeli} / ${dayKey})\nP, V, E, M, MM, AI o vacío`, cur);
        if (next === null) return;
        const code = String(next).trim().toUpperCase();

        const allowed = ["","P","V","E","M","MM","AI"];
        if (!allowed.includes(code)) return toast("bad","Código inválido",allowed.join(", "));

        cell.textContent = code;
        cell.setAttribute("data-code", code);

        pending.push({ idMeli, dayKey, code });
        saveDebounced(pending.splice(0, pending.length));
      });
    });

    setStatus("Listo.");
  };

  // listeners
  ["qPres","pEquipo","pRol","pUb","pFrom","pTo"].forEach(id=>{
    $("#"+id).addEventListener("input", debounce(render, 300));
    $("#"+id).addEventListener("change", debounce(render, 300));
  });

  await render();
}
