/****************************************************
 * HUB Catálogo — Backend (Code.gs) — FULL
 * Contrato estable para Netlify + Front
 *
 * Script Properties requeridas:
 * - API_TOKEN
 * - SPREADSHEET_ID
 * - SLACK_BOT_TOKEN (si vas a enviar Slack desde Apps Script)
 *
 * Nota:
 * - Si Slack lo manda Netlify directo, Apps Script NO necesita UrlFetch para Slack,
 *   pero mantenemos slack.outbox.enviar por compatibilidad.
 ****************************************************/

const PROPS = PropertiesService.getScriptProperties();
const API_TOKEN = PROPS.getProperty("API_TOKEN");
const SPREADSHEET_ID = PROPS.getProperty("SPREADSHEET_ID");
const SLACK_BOT_TOKEN = PROPS.getProperty("SLACK_BOT_TOKEN");

const PRESENCIA_CODE = "P";
const LICENCIAS_CODES = ["V", "M", "E", "TP", "N", "MUD", "MAT", "MATR", "DUELO", "CF", "DS", "TM", "TR", "CJ", "MHM"];
const PRESENTISMO_CODES = ["P", "V", "M", "E", "TP", "N", "MUD", "MAT", "MATR", "DUELO", "CF", "DS", "TM", "TR", "CJ", "MHM"];


// ✅ Presente Parcial cuenta como Presente para planificación
const PRESENTE_PARCIAL_CODES = ["TM/TR", "TM", "TR", "CJ"]; // TM y TR pueden venir solos o combinados
/* =========================
   Router
========================= */
function doGet(e) {
  var action = "";
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    action = String(params.action || "");

    assertToken_(params.token);

    console.log("[GET] action=" + action);

    if (action === "health") return ok_({ status: "ok", ts: new Date().toISOString() });

    if (action === "peopleforce.health") return ok_(peopleforceHealth_());

    if (action === "colaboradores.list") return ok_(colaboradoresList_());
    if (action === "colaboradores.equipos") return ok_(colaboradoresEquipos_());
    if (action === "canales.list") return ok_(canalesList_());
    if (action === "links.list") return ok_(linksUtilesList_());
    if (action === "links.categorias.list") return ok_(linksCategoriasList_());
    if (action === "asignacion.list") return ok_(asignacionSemanalList_());
    if (action === "canales.gestion.list") return ok_(gestionCanalesList_());
    if (action === "flujos.list") return ok_(flujosList_());
    if (action === "habilitaciones.list") return ok_(habilitacionesList_());
    if (action === "templates.list") return ok_(templatesList_());

    if (action === "presentismo.week") {
      var date = String(params.date || "").trim();
      return ok_(presentismoWeek_(date));
    }
    if (action === "presentismo.stats") {
      var date = String(params.date || "").trim();
      return ok_(presentismoStats_(date));
    }

    if (action === "presentismo.semanas") {
      return ok_(presentismoSemanas_());
    }
    if (action === "presentismo.weekBySemana") {
      var semana = String(params.semana || "").trim();
      return ok_(presentismoWeekBySemana_(semana));
    }
    if (action === "presentismo.statsBySemana") {
      var semanaStats = String(params.semana || "").trim();
      return ok_(presentismoStatsBySemana_(semanaStats));
    }

    if (action === "hub.init") return ok_(hubInit_());

    if (action === "planificacion.list") return ok_(planificacionList_());
    if (action === "slack.outbox.list") return ok_(slackOutboxList_());

    if (action === "agenda.list") return ok_(agendaList_());

    return errDetailed_("Acción inválida (GET): " + action, "doGet", action);
  } catch (err) {
    return errDetailed_(err, "doGet", action);
  }
}

function doPost(e) {
  var action = "";
  var lock = null;
  var hasLock = false;

  try {
    lock = LockService.getScriptLock();
    lock.waitLock(30000);
    hasLock = true;

    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var body = JSON.parse(raw || "{}");
    action = String(body.action || "");
    assertToken_(body.token);

    console.log("[POST] action=" + action);

    if (action === "flujos.update") return ok_(flujosUpdateFromUI_(body));
    if (action === "flujos.upsert") return ok_(flujosUpsert_(body));
    if (action === "flujos.delete") return ok_(flujosDelete_(body));

    if (action === "habilitaciones.set") return ok_(habilitacionesSet_(body));

    if (action === "planificacion.generar") return ok_(planificacionGenerar_());

    if (action === "peopleforce.sync") return ok_(peopleforceSync_(body));

    if (action === "config.flujos.setIncluirMensaje") return ok_(configFlujosSetIncluirMensaje_(body.flujo, body.value));

    if (action === "slack.outbox.generar") return ok_(slackOutboxGenerar_());
    if (action === "slack.outbox.generarPorFlujo") return ok_(slackOutboxGenerarPorFlujo_(body));
    if (action === "slack.outbox.generarGeneral") return ok_(slackOutboxGenerarGeneral_());
    if (action === "slack.outbox.update") return ok_(slackOutboxUpdate_(body));
    if (action === "slack.outbox.append") return ok_(slackOutboxAppend_(body));
    if (action === "slack.outbox.delete") return ok_(slackOutboxDelete_(body));

    // ✅ NUEVO: para Netlify Slack Direct (leer fila + setear estado)
    if (action === "slack.outbox.getRow") return ok_(slackOutboxGetRow_(body));
    if (action === "slack.outbox.setStatus") return ok_(slackOutboxSetStatus_(body));

    // ✅ Scheduling: programar / desprogramar + claim atómico
    if (action === "slack.outbox.programar") return ok_(slackOutboxProgramar_(body));
    if (action === "slack.outbox.desprogramar") return ok_(slackOutboxDesprogramar_(body));
    if (action === "slack.outbox.claimDue") return ok_(slackOutboxClaimDue_(body));

    // Compat: Apps Script envía a Slack (si tenés permisos)
    if (action === "slack.outbox.enviar") return ok_(slackOutboxEnviar_(body));

    if (action === "presentismo.licencias.set") return ok_(presentismoLicenciasSet_(body));
    if (action === "colaboradores.add")    return ok_(colaboradoresAdd_(body));
    if (action === "colaboradores.update") return ok_(colaboradoresUpdate_(body));
    if (action === "colaboradores.delete") return ok_(colaboradoresDelete_(body));

    if (action === "agenda.add") return ok_(agendaAdd_(body));
    if (action === "agenda.setHecho") return ok_(agendaSetHecho_(body));
    if (action === "agenda.delete") return ok_(agendaDelete_(body));
    if (action === "agenda.update") return ok_(agendaUpdate_(body));
    if (action === "slack.outbox.listDue") return ok_(slackOutboxListDue_(body));

    // Links útiles
    if (action === "links.add")    return ok_(linksUtilesAdd_(body));
    if (action === "links.update") return ok_(linksUtilesUpdate_(body));
    if (action === "links.delete") return ok_(linksUtilesDelete_(body));
    if (action === "links.reorder") return ok_(linksUtilesReorder_(body));
    if (action === "links.categorias.upsert") return ok_(linksCategoriasUpsert_(body));

    // Asignación semanal
    if (action === "asignacion.upsert") return ok_(asignacionSemanalUpsert_(body));
    if (action === "asignacion.delete") return ok_(asignacionSemanalDelete_(body));

    // Gestión de canales
    if (action === "canales.upsert") return ok_(gestionCanalesUpsert_(body));
    if (action === "canales.delete") return ok_(gestionCanalesDelete_(body));

    if (action === "templates.save") return ok_(templatesSave_(body));

    return errDetailed_("Acción inválida (POST): " + action, "doPost", action);
  } catch (err) {
    return errDetailed_(err, "doPost", action);
  } finally {
    if (hasLock && lock) {
      try {
        lock.releaseLock();
      } catch (releaseErr) {
        console.error("[doPost] lock.releaseLock error", releaseErr);
      }
    }
  }
}

/* =========================
   RESP helpers
========================= */
function ok_(data) {
  return json_({ ok: true, data: data });
}
function err_(error) {
  return errDetailed_(error, "", "");
}
function errDetailed_(error, where, action) {
  var message = error && error.message ? error.message : String(error || "Error");
  var stack = error && error.stack ? String(error.stack) : "";

  try {
    console.error("[GAS_ERROR]", JSON.stringify({
      where: where || "",
      action: action || "",
      message: message,
      stack: stack
    }));
  } catch (logErr) {
    console.error("[GAS_ERROR] " + message);
  }

  return json_({
    ok: false,
    error: message,
    where: where || "",
    action: action || ""
  });
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/* =========================
   AUTH + SS helpers
========================= */
function assertToken_(token) {
  if (!API_TOKEN) throw new Error("API_TOKEN no configurado en Script Properties");
  if (!token || token !== API_TOKEN) throw new Error("Unauthorized");
}
let _ss_ = null;
function ss_() {
  if (!SPREADSHEET_ID) throw new Error("SPREADSHEET_ID no configurado en Script Properties");
  if (!_ss_) _ss_ = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _ss_;
}
function tz_() {
  return ss_().getSpreadsheetTimeZone() || Session.getScriptTimeZone() || "America/Argentina/Buenos_Aires";
}
function fmt_(d, pattern) { return Utilities.formatDate(d, tz_(), pattern); }
function parseYMD_(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function todayNoTime_() { return parseYMD_(fmt_(new Date(), "yyyy-MM-dd")); }

// Devuelve lunes-viernes (d1..d5) en formato yyyy-MM-dd para la semana ISO de una fecha yyyy-MM-dd.
// No reemplaza weekFromDate_ (que en otros módulos puede devolver "YYYY-Www"). Usar esta para Presentismo.
function weekDaysFromYmd_(dateYMD) {
  var base = parseYMD_(String(dateYMD || "").trim());
  if (!base) base = todayNoTime_();
  // normalizamos a medianoche local
  base = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  // JS: 0=Dom..6=Sab. Queremos lunes como inicio.
  var dow = base.getDay();
  var diffToMon = (dow === 0) ? -6 : (1 - dow); // domingo -> lunes anterior
  var mon = new Date(base);
  mon.setDate(base.getDate() + diffToMon);

  var d1 = fmt_(mon, "yyyy-MM-dd");
  var d2 = fmt_(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 1), "yyyy-MM-dd");
  var d3 = fmt_(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 2), "yyyy-MM-dd");
  var d4 = fmt_(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 3), "yyyy-MM-dd");
  var d5 = fmt_(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4), "yyyy-MM-dd");
  return { d1: d1, d2: d2, d3: d3, d4: d4, d5: d5 };
}


function num_(v, def) {
  var n = Number(v);
  return isNaN(n) ? (def || 0) : n;
}


function normOpt_(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}


/**
 * TTL dinámico para Pulso, según rango.
 * - Hoy: 5 min
 * - Semana en curso (incluye hoy): 15 min
 * - Rango cerrado: 6h
 */
function getPulsoCacheTtlSeconds_(from, to) {
  try {
    var today = todayNoTime_();
    var toT = (to && to.getTime) ? to.getTime() : null;
    var todayT = today.getTime();
    if (toT === todayT) return 300;
    if (toT && toT > todayT) return 300; // futuro (defensivo)
    // si el rango incluye hoy (por ejemplo to==hoy) ya cae arriba
    return 21600;
  } catch (e) {
    return 1800; // fallback 30 min
  }
}


/**
 * Parse YYYY-MM-DD (o Date) a Date sin hora (00:00:00).
 * Devuelve null si no parsea.
 */
function parseDateParamNoTime_(v) {
  if (v === null || v === undefined || v === "") return null;
  if (Object.prototype.toString.call(v) === "[object Date]") return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  var s = String(v).trim();
  // YYYY-MM-DD
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // DD/MM/YYYY (por si viene de algún lado)
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  } catch (e) {}
  return null;
}

// Presentismo: soporta headers de fecha como Date real o como TEXTO (dd/MM/yyyy o yyyy-MM-dd)
function ymdFromHeaderCell_(cell) {
  if (cell instanceof Date) return fmt_(cell, "yyyy-MM-dd");
  const s = String(cell || "").trim();
  if (!s) return "";
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m2) {
    const dd = String(m2[1]).padStart(2, "0");
    const mm = String(m2[2]).padStart(2, "0");
    const yy = String(m2[3]);
    return `${yy}-${mm}-${dd}`;
  }
  return "";
}

/* =========================
   Sheet helpers
========================= */
function getSheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error(`No existe la hoja "${name}"`);
  return sh;
}
function values_(sh) { return sh.getDataRange().getValues(); }
function headers_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]; }
function idx_(headers, name) {
  const i = headers.indexOf(name);
  if (i === -1) throw new Error(`Falta columna "${name}"`);
  return i;
}



/* =========================
   Perf + Cache helpers (V1)
   - No cambia contratos de endpoints
   ========================= */
function nowMs_() { return new Date().getTime(); }

function cacheGetJson_(key) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function cachePutJson_(key, obj, ttlSec) {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(key, JSON.stringify(obj), Number(ttlSec || 300));
  } catch (e) {}
}

function cacheRemove_(key) {
  try {
    CacheService.getScriptCache().remove(String(key));
  } catch (e) {}
}


function timedLog_(label, startMs, extra) {
  try {
    const ms = nowMs_() - startMs;
    console.log("[perf] " + label + " " + ms + "ms" + (extra ? (" | " + extra) : ""));
  } catch (e) {}
}

// Lee un rectángulo mínimo (evita getDataRange en hojas grandes)
function readRect_(sh, startRow, startCol, numRows, numCols) {
  if (numRows <= 0 || numCols <= 0) return [];
  return sh.getRange(startRow, startCol, numRows, numCols).getValues();
}

// Convierte Date o texto a yyyy-MM-dd (solo día)
function ymd_(v) {
  const d = (v instanceof Date) ? v : (v ? new Date(v) : null);
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return fmt_(new Date(d.getFullYear(), d.getMonth(), d.getDate()), "yyyy-MM-dd");
}

// Boolean robusto para "SI/NO", TRUE/FALSE, 1/0
function bool_(v) {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v || "").trim().toUpperCase();
  if (!s) return false;
  return (s === "TRUE" || s === "SI" || s === "S" || s === "1" || s === "YES");
}
function ensureColaboradoresFechaIngresoFormat_(sh) {
  const h = headers_(sh);
  const idx = h.indexOf("Fecha Ingreso");
  if (idx === -1) return;
  const last = sh.getLastRow();
  if (last < 2) return;
  sh.getRange(2, idx + 1, last - 1, 1).setNumberFormat("dd-MM-yyyy");
}

function appendPlanningHistory_(fecha, outRows) {
  if (!outRows || !outRows.length) return;

  const ss = ss_();
  let sh = ss.getSheetByName("Historial_Planning");
  if (!sh) sh = ss.insertSheet("Historial_Planning");

  const headers = ["Fecha", "Flujo", "ID_MELI", "Nombre", "Rol", "Fijo"];
  const COLS = headers.length;

  // Asegurar headers
  sh.getRange(1, 1, 1, COLS).setValues([headers]);
  sh.getRange(1, 1, 1, COLS).setFontWeight("bold");

  // Normalizar fecha a "día" (sin hora)
  const dayKey = formatDayKey_(fecha); // "yyyy-MM-dd"

  // 1) Borrar cualquier registro previo del mismo día
  deleteRowsByDayKey_(sh, dayKey, COLS);

  // 2) Append de la planificación "final" del día
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, outRows.length, COLS).setValues(outRows);

  // Formato visual (opcional)
  sh.getRange(start, 1, outRows.length, 1).setNumberFormat("dd/MM/yyyy");
}

// ===== Helpers =====

function formatDayKey_(d) {
  const tz = Session.getScriptTimeZone();
  const dt = (d instanceof Date) ? d : new Date(d);
  return Utilities.formatDate(dt, tz, "yyyy-MM-dd");
}

function deleteRowsByDayKey_(sh, dayKey, COLS) {
  const last = sh.getLastRow();
  if (last < 2) return;

  const tz = Session.getScriptTimeZone();
  const values = sh.getRange(2, 1, last - 1, COLS).getValues();

  // Detectar filas a eliminar (por fecha)
  const rowsToDelete = [];
  for (let i = 1; i < values.length; i++) {
    const v = values[i][0]; // Fecha
    if (!v) continue;

    const k = Utilities.formatDate(
      (v instanceof Date) ? v : new Date(v),
      tz,
      "yyyy-MM-dd"
    );
    if (k === dayKey) rowsToDelete.push(i + 2); // offset por header
  }

  if (!rowsToDelete.length) return;

  // Borrar desde abajo para no romper índices
  rowsToDelete.sort((a, b) => b - a).forEach((r) => sh.deleteRow(r));
}

/* =========================
   Colaboradores / Canales / Flujos
========================= */

function colaboradoresList_() {
  const t0 = nowMs_();
  const cacheKey = "colaboradores.list.v3";
  const cached = cacheGetJson_(cacheKey);
  if (cached) return cached;

  const sh = getSheet_("Colaboradores");
  try { ensureColaboradoresFechaIngresoFormat_(sh); } catch (e) {}

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const data = readRect_(sh, 1, 1, lastRow, lastCol);
  const h = data[0].map(String);

  const out = data.slice(1).filter(r => r.join("") !== "").map(r => {
    const o = {};
    // Trim de keys y valor del ID para evitar mismatches por espacios en el sheet
    h.forEach((k, i) => {
      const key = String(k || "").trim();
      o[key] = r[i];
    });
    // Normalizar ID_MELI explícitamente
    if (o["ID_MELI"] !== undefined) o["ID_MELI"] = String(o["ID_MELI"] || "").trim();
    if (o["Slack_ID"] !== undefined) o["Slack_ID"] = String(o["Slack_ID"] || "").replace(/[\u200b\u00a0\ufeff]/g, "").trim();
    return o;
  });

  cachePutJson_(cacheKey, out, 3600);
  timedLog_("colaboradores.list", t0, "rows=" + out.length);
  return out;
}



function canalesList_() {
  const t0 = nowMs_();
  const cacheKey = "canales.list.v2";
  const cached = cacheGetJson_(cacheKey);
  if (cached) return cached;

  const sh = getSheet_("Canales");
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const hRaw = readRect_(sh, 1, 1, 1, lastCol)[0];
const h = hRaw.map(v => String(v || "").trim());
  const idxCanal = idx_(h, "Canal");
  const idxId = idx_(h, "Slack_channel");
  const maxIdx = Math.max(idxCanal, idxId);

  const data = readRect_(sh, 2, 1, lastRow - 1, maxIdx + 1);
  const out = data.filter(r => r[idxCanal]).map(r => ({
    canal: String(r[idxCanal]).trim(),
    channel_id: String(r[idxId] || "").trim(),
  }));

  cachePutJson_(cacheKey, out, 600); // 10m (canales raramente cambian)
  timedLog_("canales.list", t0, "rows=" + out.length);
  return out;
}



function flujosList_() {
  const t0 = nowMs_();
  const cacheKey = "flujos.list.v4";
  const cached = cacheGetJson_(cacheKey);
  if (cached) return cached;

  const sh = getSheet_("Config_Flujos");
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const data = readRect_(sh, 1, 1, lastRow, lastCol);
  const h = data[0].map(String);

  const idxFlujo = idx_(h, "Flujo");
  const idxReq = idx_(h, "Perfiles_requeridos");

  // opcionales
  const idxSlack = h.indexOf("Slack_Channel");
  const idxChanId = h.indexOf("Channel_ID");
  const idxPermFijos = h.indexOf("Permite_Fijos");

  // soportar con y sin tilde
  const idxRot = h.indexOf("Rotación_Modo") >= 0 ? h.indexOf("Rotación_Modo") : h.indexOf("Rotacion_Modo");
  const idxVent = h.indexOf("Ventana_Rotacion_Dias") >= 0 ? h.indexOf("Ventana_Rotacion_Dias") : h.indexOf("Ventana_Rotacion");

  // ✅ NUEVO
  const idxIncl = h.indexOf("Incluir_en_mensaje");

  const out = data.slice(1).filter(r => r[idxFlujo]).map(r => ({
    flujo: String(r[idxFlujo]).trim(),
    perfiles_requeridos: Number(r[idxReq] || 0),

    // canal: compatibilidad
    channel_id: (
      idxChanId >= 0 && String(r[idxChanId] || "").trim()
        ? String(r[idxChanId] || "").trim()
        : (idxSlack >= 0 ? String(r[idxSlack] || "").trim() : "")
    ),

    permite_fijos: idxPermFijos >= 0
      ? (String(r[idxPermFijos] || "").toUpperCase() === "TRUE" ||
         String(r[idxPermFijos] || "").toUpperCase() === "SI" ||
         r[idxPermFijos] === true)
      : true,

    rotacion_modo: idxRot >= 0 ? String(r[idxRot] || "Off").trim() : "Off",
    ventana_rotacion_dias: idxVent >= 0 ? Number(r[idxVent] || 0) : 0,

    incluir_en_mensaje: idxIncl >= 0
      ? (String(r[idxIncl] || "").toUpperCase() === "TRUE" || String(r[idxIncl] || "").toUpperCase() === "SI" || r[idxIncl] === true)
      : true
  }));

  cachePutJson_(cacheKey, out, 120); // 2m
  timedLog_("flujos.list", t0, "rows=" + out.length);
  return out;
}


function configFlujosSetIncluirMensaje_(flujo, value) {
  const sh = getSheet_("Config_Flujos");
  const values = sh.getDataRange().getValues();
  const h = values[0].map(String);

  const idxFlujo = h.indexOf("Flujo");
  const idxIncl  = h.indexOf("Incluir_en_mensaje");
  if (idxFlujo < 0) throw new Error("Falta columna Flujo");
  if (idxIncl < 0) throw new Error("Falta columna Incluir_en_mensaje");

  const rowIndex = values.findIndex((r, i) => i > 0 && String(r[idxFlujo]).trim() === flujo);
  if (rowIndex < 0) throw new Error("Flujo no encontrado: " + flujo);

  sh.getRange(rowIndex + 1, idxIncl + 1).setValue(!!value);
  return { ok: true };
}

function buildRotacionIndex_(today) {
  // Devuelve: { [flujo]: { [dayKey]: Set(ids) } } solo para días < today
  const ss = ss_();
  const sh = ss.getSheetByName("Historial_Planning");
  if (!sh) return {};

  const data = values_(sh);
  if (!data || data.length < 2) return {};

  const h = data[0];
  const idxFecha = idx_(h, "Fecha");
  const idxFlujo = idx_(h, "Flujo");
  const idxId = idx_(h, "ID_MELI");

  const tz = Session.getScriptTimeZone();
  const todayKey = Utilities.formatDate(today, tz, "yyyy-MM-dd");

  const out = {};

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const flujo = String(row[idxFlujo] || "").trim();
    const id = String(row[idxId] || "").trim();
    const f = row[idxFecha];

    if (!flujo || !id || !f) continue;

    const d = (f instanceof Date) ? f : new Date(f);
    if (!(d instanceof Date) || isNaN(d.getTime())) continue;

    const dayKey = Utilities.formatDate(d, tz, "yyyy-MM-dd");
    if (dayKey === todayKey) continue; // el mismo día se pisa: no cuenta para rotación

    out[flujo] = out[flujo] || {};
    out[flujo][dayKey] = out[flujo][dayKey] || new Set();
    out[flujo][dayKey].add(id);
  }
  try { cache.put("tlmap_v1", JSON.stringify(out), 3600); } catch (e) {}
  return out;
}

function getExcluidosPorVentana_(rotIdx, flujo, today, ventanaDias) {
  if (!ventanaDias || ventanaDias <= 0) return new Set();
  if (!rotIdx || !rotIdx[flujo]) return new Set();

  const tz = Session.getScriptTimeZone();

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - ventanaDias);

  const excl = new Set();
  const byDay = rotIdx[flujo];

  // Recorremos claves día
  Object.keys(byDay).forEach(dayKey => {
    // convertir dayKey -> date sin hora
    const d = new Date(dayKey + "T00:00:00");
    if (isNaN(d.getTime())) return;

    // incluir solo (cutoff <= d < today)
    if (d.getTime() >= cutoff.getTime() && d.getTime() < today.getTime()) {
      byDay[dayKey].forEach(id => excl.add(id));
    }
  });

  return excl;
}

function rotacionActiva_(modo) {
  const m = String(modo || "Off").trim().toLowerCase();
  return m === "diaria" || m === "semanal";
}

/**
 * ✅ OPTIMIZACIÓN: Guardado robusto con validación y retry
 * Solución al problema: "Modificar perfiles a veces no guarda"
 */
function flujosUpsert_({ flujo, perfiles_requeridos, channel_id }) {
  flujo = String(flujo || "").trim();
  if (!flujo) throw new Error("flujo requerido");

  const req = Number(perfiles_requeridos || 0);
  const chanVal = String(channel_id || "").trim();

  const sh = getSheet_("Config_Flujos");
  const data = values_(sh);
  const h = data[0];
  const idxFlujo = idx_(h, "Flujo");
  const idxReq = idx_(h, "Perfiles_requeridos");
  const idxChan = h.indexOf("Slack_Channel");

  let row = -1;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][idxFlujo]).trim() === flujo) { row = i + 1; break; }
  }
  if (row === -1) row = sh.getLastRow() + 1;

  // Escritura directa sin retry ni sleep.
  // El frontend usa optimistic update local, no necesita verificación en backend.
  sh.getRange(row, idxFlujo + 1).setValue(flujo);
  sh.getRange(row, idxReq + 1).setValue(req);
  if (idxChan >= 0 && chanVal) sh.getRange(row, idxChan + 1).setValue(chanVal);

  // Invalidar todas las claves de cache afectadas
  cacheRemove_("flujos_list_v1");
  cacheRemove_("flujos.list.v4");
  cacheRemove_("habilitaciones.list.v2");

  return { ok: true };
}

/**
 * Update de Config_Flujos desde el HUB (api.js).
 * Soporta el payload del front: { id, flowName, slackChannel, profilesRequired, includeSlack, rotationMode, rotationWindowDays, allowFixed, notesDefault }
 * y también el formato legacy: { flujo, perfiles_requeridos, slack_channel / channel_id }
 */
function flujosUpdateFromUI_(body) {
  body = body || {};
  var flujo = (body.flowName || body.flujo || body.Flujo || "").toString().trim();
  if (!flujo) throw new Error("flujos.update: falta flowName/flujo");
  // Soporte para renombre: buscar por originalName si difiere de flowName
  var searchName = (body.originalName || flujo).toString().trim() || flujo;

  var perfiles = body.profilesRequired;
  if (perfiles === undefined || perfiles === null || perfiles === "") perfiles = body.perfiles_requeridos;
  perfiles = Number(perfiles || 0);

  // Canal: el front manda slackChannel (nombre) y channel_id (ID tecnico)
  var slackInput = (body.slackChannel || body.slack_channel || body.Slack_Channel || "").toString().trim();
  var directChannelId = (body.channel_id || "").toString().trim();
  var slackId = directChannelId || resolveSlackChannelId_(slackInput);

  var incluir = body.includeSlack;
  if (incluir === undefined) incluir = body.incluir_en_mensaje;
  incluir = (incluir === true || incluir === "true" || incluir === 1 || incluir === "1");

  var permiteFijos = body.allowFixed;
  if (permiteFijos === undefined) permiteFijos = body.permite_fijos;
  permiteFijos = (permiteFijos === true || permiteFijos === "true" || permiteFijos === 1 || permiteFijos === "1");

  var notas = body.notesDefault;
  if (notas === undefined) notas = body.notas_default;
  notas = (notas === null || notas === undefined) ? "" : String(notas);

  var rotMode = body.rotationMode;
  if (rotMode === undefined) rotMode = body.rotacion_modo;
  rotMode = (rotMode === null || rotMode === undefined) ? "" : String(rotMode);
  // Capitalizar para cumplir validacion del sheet (Diaria, Semanal, Off)
  if (rotMode) rotMode = rotMode.charAt(0).toUpperCase() + rotMode.slice(1).toLowerCase();

  var rotWindow = body.rotationWindowDays;
  if (rotWindow === undefined) rotWindow = body.ventana_rotacion_dias;
  rotWindow = (rotWindow === null || rotWindow === undefined || rotWindow === "") ? "" : Number(rotWindow);

  var sh = getSheet_("Config_Flujos");
  var lastRow = Math.max(sh.getLastRow(), 1);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h || "").trim(); });

  function colIdx_(name) { return headers.indexOf(name); }

  // columnas (si alguna no existe, no rompe)
  var cFlujo = colIdx_("Flujo");
  var cSlack = colIdx_("Slack_Channel");
  var cPerfiles = colIdx_("Perfiles_requeridos");
  var cIncluir = colIdx_("Incluir_en_mensaje");
  var cNotas = colIdx_("Notas_default");
  var cFijos = colIdx_("Permite_Fijos");
  var cRotMode = colIdx_("Rotación_Modo");
  var cRotWindow = colIdx_("Ventana_Rotacion_Dias");
  var cChanId = colIdx_("Channel_ID");

  if (cFlujo < 0) throw new Error("Config_Flujos: falta columna 'Flujo'");

  // buscar fila por Flujo (usando searchName para soportar renombre)
  var flujoVals = sh.getRange(2, cFlujo + 1, Math.max(0, lastRow - 1), 1).getValues().map(function (r) { return String(r[0] || "").trim(); });
  var rowIdx = -1;
  for (var i = 0; i < flujoVals.length; i++) {
    if (flujoVals[i].toLowerCase() === searchName.toLowerCase()) { rowIdx = i + 2; break; }
  }
  if (rowIdx === -1) {
    rowIdx = lastRow + 1;
  }
  // Escribir nombre (nuevo si renombre, o el mismo)
  sh.getRange(rowIdx, cFlujo + 1).setValue(flujo);

  if (cPerfiles >= 0) sh.getRange(rowIdx, cPerfiles + 1).setValue(perfiles);
  if (cSlack >= 0 && slackId) sh.getRange(rowIdx, cSlack + 1).setValue(slackId);

  if (cIncluir >= 0) sh.getRange(rowIdx, cIncluir + 1).setValue(incluir);
  if (cNotas >= 0) sh.getRange(rowIdx, cNotas + 1).setValue(notas);
  if (cFijos >= 0) sh.getRange(rowIdx, cFijos + 1).setValue(permiteFijos);
  if (cRotMode >= 0) sh.getRange(rowIdx, cRotMode + 1).setValue(rotMode);
  if (cRotWindow >= 0 && rotWindow !== "") sh.getRange(rowIdx, cRotWindow + 1).setValue(rotWindow);

  // Guardar Channel_ID directamente desde el payload del front
  if (cChanId >= 0 && directChannelId) {
    sh.getRange(rowIdx, cChanId + 1).setValue(directChannelId);
  } else if (cChanId >= 0 && slackInput) {
    sh.getRange(rowIdx, cChanId + 1).setValue(slackInput);
  }

  // limpiar cache para que el HUB vea el cambio inmediatamente
  cacheRemove_("flujos.list.v4");
  cacheRemove_("flujos_list_v1");
  cacheRemove_("habilitaciones.list.v2");

  return { ok: true, row: rowIdx };
}

function resolveSlackChannelId_(input) {
  input = (input || "").toString().trim();
  if (!input) return "";
  if (/^C[A-Z0-9]{8,}$/.test(input)) return input;

  // buscar por nombre en hoja Canales (canal -> channel_id)
  try {
    var canales = canalesList_(); // [{canal, channel_id}]
    for (var i = 0; i < canales.length; i++) {
      if (String(canales[i].canal || "").trim().toLowerCase() === input.toLowerCase()) {
        return String(canales[i].channel_id || "").trim();
      }
    }
  } catch (e) {
    // no rompe
  }
  // fallback: guardar lo que vino (mejor que perderlo)
  return input;
}

function flujosDelete_({ flujo }) {
  flujo = String(flujo || "").trim();
  if (!flujo) throw new Error("flujo requerido");
  const sh = getSheet_("Config_Flujos");
  const data = values_(sh);
  const h = data[0];
  const idxFlujo = idx_(h, "Flujo");

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][idxFlujo]).trim() === flujo) {
      sh.deleteRow(i + 1);
      // Invalidar cache para que el próximo fetch traiga datos frescos
      cacheRemove_("flujos_list_v1");
      cacheRemove_("flujos.list.v4");
      cacheRemove_("habilitaciones.list.v2");
      return { ok: true };
    }
  }
  // Flujo no encontrado — invalidar cache igual por si acaso
  cacheRemove_("flujos_list_v1");
  cacheRemove_("flujos.list.v4");
  cacheRemove_("habilitaciones.list.v2");
  return { ok: true };
}

/* =========================
   Habilitaciones
========================= */

function habilitacionesList_() {
  const t0 = nowMs_();

  // Depende de flujos + habilitaciones; cache corto pero efectivo (pantalla carga inicial)
  const cacheKey = "habilitaciones.list.v2";
  const cached = cacheGetJson_(cacheKey);
  if (cached) return cached;

  const sh = getSheet_("Habilitaciones");
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { flujos: [], rows: [] };

  const hRaw = readRect_(sh, 1, 1, 1, lastCol)[0];
const h = hRaw.map(v => String(v || "").trim());
  const idxId = idx_(h, "ID_MELI");

  const flujos = flujosList_().map(f => f.flujo);

  // Precalcular índices por flujo (1 sola vez)
  const idxByFlujo = {};
  flujos.forEach(f => {
    idxByFlujo[f] = {
      h: findHeaderIndex_(h, f),
      f: findFijoHeaderIndex_(h, f),
    };
  });

  // Leemos toda la fila hasta lastCol (habilitaciones suele ser ancho moderado; evita N*findHeader)
  const data = readRect_(sh, 2, 1, lastRow - 1, lastCol);

  const rows = data.filter(r => r[idxId]).map(r => {
    const id = String(r[idxId]).trim();
    const obj = { id_meli: id };

    flujos.forEach(f => {
      const ix = idxByFlujo[f] || {};
      obj[`H_${f}`] = ix.h >= 0 ? !!r[ix.h] : false;
      obj[`F_${f}`] = ix.f >= 0 ? !!r[ix.f] : false;
    });

    return obj;
  });

  const out = { flujos, rows };
  cachePutJson_(cacheKey, out, 600); // 10m
  timedLog_("habilitaciones.list", t0, "rows=" + rows.length + " flujos=" + flujos.length);
  return out;
}


function habilitacionesSet_({ idMeli, flujo, habilitado, fijo }) {
  idMeli = String(idMeli || "").trim();
  flujo = String(flujo || "").trim();
  if (!idMeli) throw new Error("idMeli requerido");
  if (!flujo) throw new Error("flujo requerido");

  const sh = getSheet_("Habilitaciones");
  const h = headers_(sh);
  const idxId = idx_(h, "ID_MELI");

  const idxH = findHeaderIndex_(h, flujo);
  const idxF = findFijoHeaderIndex_(h, flujo);
  if (idxH === -1) throw new Error(`No existe columna de habilitación para flujo "${flujo}"`);
  if (idxF === -1) throw new Error(`No existe columna de fijo para flujo "${flujo}"`);

  const data = values_(sh);
  let row = -1;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][idxId]).trim() === idMeli) { row = i + 1; break; }
  }
  if (row === -1) throw new Error(`ID_MELI no encontrado en Habilitaciones: ${idMeli}`);

  const hVal = !!habilitado;
  const fVal = !!fijo && hVal;

  sh.getRange(row, idxH + 1).setValue(hVal);
  sh.getRange(row, idxF + 1).setValue(fVal);

  return { ok: true };
}

/* =========================
   Presentismo
========================= */

function feriadosSet_() {
  const cacheKey = "feriados.set.v1";
  const cached = cacheGetJson_(cacheKey);
  if (cached) return new Set(cached);

  const sh = getSheet_("Feriados_AR");
  const h = headers_(sh);
  const idxFecha = idx_(h, "Fecha");
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return new Set();

  const data = readRect_(sh, 2, 1, lastRow - 1, idxFecha + 1);
  const arr = data.map(r => ymd_(r[idxFecha])).filter(Boolean);

  cachePutJson_(cacheKey, arr, 21600); // 6h
  return new Set(arr);
}



function presentismoWeek_(dateYMD) {
  const t0 = nowMs_();
  const cacheKey = "presentismo.week.v4|" + String(dateYMD || "");
  const cached = cacheGetJson_(cacheKey);
  if (cached) return cached;

  const sh = getSheet_("Presentismo");
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { semana: {}, days: [], rows: [] };

  const hRaw = readRect_(sh, 1, 1, 1, lastCol)[0];
const h = hRaw.map(v => String(v || "").trim());

  // ID_MELI y Nombre suelen estar al inicio. Evitamos leer un rectángulo gigante.
  const idxId = idx_(h, "ID_MELI");
  const idxNombre = h.indexOf("Nombre");

  const week = weekDaysFromYmd_(dateYMD);
const keys = [week.d1, week.d2, week.d3, week.d4, week.d5]; // yyyy-MM-dd // yyyy-MM-dd

  const colByKey = {};
  hRaw.forEach((cell, i) => {
  const kDate = ymdFromHeaderCell_(cell);
  if (kDate) { colByKey[kDate] = i; return; }
  const k = String(cell || "").trim();
  if (k) colByKey[k] = i;
});

  const dateCols = keys.map(k => {
    const idx = colByKey[k];
    if (idx == null) throw new Error("No existe columna de fecha en Presentismo: " + k);
    return idx;
  });

  const n = lastRow - 1;

  // Leer columnas individualmente para evitar problemas con columnas no contiguas
  const ids    = sh.getRange(2, idxId + 1, n, 1).getValues();
  const nombres = idxNombre >= 0 ? sh.getRange(2, idxNombre + 1, n, 1).getValues() : null;
  const dayColsValues = dateCols.map(colIdx =>
    sh.getRange(2, colIdx + 1, n, 1).getValues()
  );

  const feriados = feriadosSet_();

  // Formato esperado por Front (app.js):
  // - days: [{ key: "YYYY-MM-DD", isFeriado: true/false }, ...]
  // - rows: [{ id_meli, nombre, vals: { "YYYY-MM-DD": "P", ... } }, ...]
  //
  // Backward-compatible:
  // - mantenemos semana (d1..d5 + feriados[])
  // - mantenemos d1..d5 en cada row (como venía en v2)
  const days = keys.map(k => ({ key: k, isFeriado: feriados.has(k) }));

  const rows = [];
  for (let i = 0; i < n; i++) {
    const id = String(ids[i][0] || "").trim();
    if (!id) continue;

    const v1 = String(dayColsValues[0][i][0] || "");
    const v2 = String(dayColsValues[1][i][0] || "");
    const v3 = String(dayColsValues[2][i][0] || "");
    const v4 = String(dayColsValues[3][i][0] || "");
    const v5 = String(dayColsValues[4][i][0] || "");

    const vals = {};
    vals[keys[0]] = v1;
    vals[keys[1]] = v2;
    vals[keys[2]] = v3;
    vals[keys[3]] = v4;
    vals[keys[4]] = v5;

    rows.push({
      id_meli: id,
      nombre: nombres ? String(nombres[i][0] || "") : "",
      vals,
    });
  }

  const out = {
    semana: {
      feriados: keys.filter(k => feriados.has(k)),
    },
    days,
    rows
  };

  // ✅ MERGE PeopleForce: Aplicar licencias de PF_Staging_Licencias
  mergePeopleforceIntoPresentismo_(rows, days);

  cachePutJson_(cacheKey, out, 180); // 3m
  timedLog_("presentismo.week", t0, "rows=" + rows.length);
  return out;
}




function presentismoStats_(dateYMD) {
  const t0 = nowMs_();
  const cacheKey = "presentismo.stats.v3|" + String(dateYMD || "");
  const cached = cacheGetJson_(cacheKey);
  if (cached) return cached;

  const sh = getSheet_("Presentismo");
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { total: 0, presentes: 0, ausentes: 0, ratios: {} };

  const hRaw = readRect_(sh, 1, 1, 1, lastCol)[0];
const h = hRaw.map(v => String(v || "").trim());
  const idxId = idx_(h, "ID_MELI");

  const colByKey = {};
  hRaw.forEach((cell, i) => {
  const kDate = ymdFromHeaderCell_(cell);
  if (kDate) { colByKey[kDate] = i; return; }
  const k = String(cell || "").trim();
  if (k) colByKey[k] = i;
});

  // Si cae en fin de semana, usamos el viernes de la semana ISO correspondiente.
  // Esto evita "presentes=0" por columnas vacías de sábado/domingo.
  let eff = String(dateYMD || "").trim();
  let dt = parseYMD_(eff);
  if (!dt) {
    eff = fmt_(new Date(), "yyyy-MM-dd");
    dt = parseYMD_(eff);
  }
  if (dt) {
    const dow = dt.getDay(); // 0=Dom ... 6=Sab
    if (dow === 0 || dow === 6) {
      const week = weekDaysFromYmd_(eff);
      eff = week.d5; // viernes
    }
  }

  let dateCol = colByKey[eff];
  if (dateCol == null) {
    // fallback defensivo: intentar viernes de semana ISO (aunque no sea weekend)
    const week = weekDaysFromYmd_(eff);
      eff = week.d5;
    dateCol = colByKey[eff];
  }
  if (dateCol == null) throw new Error("No existe columna de fecha en Presentismo: " + eff);

  const n = lastRow - 1;
  // PERF: una sola lectura rectangular en lugar de 2 getRange() separados
  const minCS = Math.min(idxId, dateCol);
  const maxCS = Math.max(idxId, dateCol);
  const statsRect = sh.getRange(2, minCS + 1, n, maxCS - minCS + 1).getValues();
  const relIdS  = idxId   - minCS;
  const relValS = dateCol - minCS;

  // FIX: TM/TR y CJ son "Presente parcial" → cuentan como presentes (igual que en el frontend)
  // Sincronizado con PRES_PARTIAL_CODES del frontend y planificacionGenerar_()
  const STATS_PARTIAL_CODES = new Set(["TM/TR", "TM", "TR", "CJ"]); // TM y TR pueden venir solos o combinados

  let total = 0, presentes = 0, ausentes = 0;
  for (let i = 0; i < n; i++) {
    const id = String(statsRect[i][relIdS] || "").trim();
    if (!id) continue;
    total++;
    const v = String(statsRect[i][relValS] || "").trim().toUpperCase();
    if (!v) continue; // sin carga (no contamos como ausente)
    if (v === "P" || v === "PRESENTE" || v === "OK") presentes++;
    else if (STATS_PARTIAL_CODES.has(v)) presentes++; // Presente parcial cuenta como presente
    else ausentes++;
  }

  const out = {
    total,
    presentes,
    ausentes,
    ratios: {
      present_pct: total ? round_((presentes / total) * 100, 2) : 0,
      absent_pct: total ? round_((ausentes / total) * 100, 2) : 0,
    },
    // legacy
    present: presentes,
    absent: ausentes,
    date: eff,
  };

  cachePutJson_(cacheKey, out, 180); // 3m (misma semana, datos estables)
  timedLog_("presentismo.stats", t0, "date=" + eff + " total=" + total);
  return out;
}




function presentismoSemanas_() {
  const sh = getSheet_("Presentismo");
  const h = headers_(sh);

  const byYear = {}; // {year: Set(week)}
  for (let c = 0; c < h.length; c++) {
    const ymd = ymdFromHeaderCell_(h[c]);
    if (!ymd) continue;
    const d = parseYMD_(ymd);
    if (!d) continue;
    const y = d.getFullYear();
    const w = isoWeekNumber_(d);
    if (!byYear[y]) byYear[y] = new Set();
    byYear[y].add(w);
  }

  const years = Object.keys(byYear).map(Number).sort((a,b)=>a-b);
  if (!years.length) return [];
  const year = years[years.length - 1];

  const weeks = Array.from(byYear[year]).sort((a,b)=>a-b);
  return weeks.map(w => "W" + w);
}

function presentismoWeekBySemana_(semana) {
  const info = presentismoResolveSemana_(semana);
  return presentismoWeek_(info.mondayYMD);
}

function presentismoStatsBySemana_(semana) {
  const info = presentismoResolveSemana_(semana);
  return presentismoStats_(info.mondayYMD);
}

function presentismoResolveSemana_(semana) {
  const sh = getSheet_("Presentismo");
  const h = headers_(sh);

  // Detecto el año más reciente presente en headers de fecha
  let maxYear = null;
  for (let c = 0; c < h.length; c++) {
    const ymd = ymdFromHeaderCell_(h[c]);
    if (!ymd) continue;
    const d = parseYMD_(ymd);
    if (!d) continue;
    const y = d.getFullYear();
    if (maxYear == null || y > maxYear) maxYear = y;
  }
  if (maxYear == null) maxYear = (new Date()).getFullYear();

  const m = String(semana || "").trim().toUpperCase().match(/^W(\d{1,2})$/);
  if (!m) throw new Error("Semana inválida (formato esperado: W1, W2, ...)");
  const week = Number(m[1]);
  if (!(week >= 1 && week <= 53)) throw new Error("Semana inválida");

  const monday = isoWeekMonday_(maxYear, week);
  const mondayYMD = fmt_(monday, "yyyy-MM-dd");
  return { year: maxYear, week, mondayYMD };
}

// ISO week number (1-53)
function isoWeekNumber_(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return week;
}

// Monday of ISO week in local time (Spreadsheet TZ still handled by fmt_)
function isoWeekMonday_(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const isoMonday = new Date(simple);
  if (dow <= 4) isoMonday.setUTCDate(simple.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  else isoMonday.setUTCDate(simple.getUTCDate() + (8 - dow));
  // return as local Date
  return new Date(isoMonday.getUTCFullYear(), isoMonday.getUTCMonth(), isoMonday.getUTCDate());
}

function presentismoLicenciasSet_({ idMeli, desde, hasta, tipo }) {
  idMeli = String(idMeli || "").trim();
  tipo = String(tipo || "").trim();
  if (!idMeli) throw new Error("idMeli requerido");
  if (!tipo) throw new Error("tipo requerido");

  const d1 = parseYMD_(desde);
  const d2 = parseYMD_(hasta) || d1;
  if (!d1) throw new Error("desde inválido");
  if (d1.getTime() > d2.getTime()) throw new Error("hasta no puede ser anterior a desde");

  const sh = getSheet_("Presentismo");
  const data = values_(sh);
  const h = data[0];

  const idxId = idx_(h, "ID_MELI");

  let row = -1;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][idxId]).trim() === idMeli) { row = i + 1; break; }
  }
  if (row === -1) throw new Error(`ID_MELI no encontrado en Presentismo: ${idMeli}`);

  const colByKey = {};
  for (let c = 0; c < h.length; c++) {
    const k = ymdFromHeaderCell_(h[c]);
    if (k) colByKey[k] = c + 1;
  }

  const cur = new Date(d1);
  while (cur.getTime() <= d2.getTime()) {
    const key = fmt_(cur, "yyyy-MM-dd");
    let col = colByKey[key];

    if (!col) {
      col = sh.getLastColumn() + 1;
      sh.insertColumnAfter(sh.getLastColumn());
      sh.getRange(1, col).setValue(new Date(cur));
      sh.getRange(1, col).setNumberFormat("dd mmm");
      colByKey[key] = col;
    }

    // PeopleForce priority: prevent manual override when day is controlled by PeopleForce
    if (peopleforceEnabled_() && peopleforceHasDay_(idMeli, key)) {
      throw new Error(`No editable: el día ${key} está sincronizado desde PeopleForce.`);
    }

    sh.getRange(row, col).setValue(tipo);
    cur.setDate(cur.getDate() + 1);
  }

  return { ok: true };
}

/* =========================
   Planificación
========================= */

function planificacionList_() {
  const t0 = nowMs_();
  const cacheKey = "planificacion.list.v3";
  const cached = cacheGetJson_(cacheKey);
  if (cached) return cached;

  const sh = getSheet_("Planificacion_Diaria");
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const hRaw = readRect_(sh, 1, 1, 1, lastCol)[0];
const h = hRaw.map(v => String(v || "").trim());

  const idxFecha = idx_(h, "Fecha");
  const idxFlujo = idx_(h, "Flujo");
  const idxId = idx_(h, "ID_MELI");
  const idxNombre = h.indexOf("Nombre");
  const idxFijo = h.indexOf("Es_Fijo");

  const maxIdx0 = Math.max(idxFecha, idxFlujo, idxId, idxNombre >= 0 ? idxNombre : 0, idxFijo >= 0 ? idxFijo : 0);
  const data = readRect_(sh, 2, 1, lastRow - 1, maxIdx0 + 1);

  // PERF: solo devolver filas de los últimos 7 días
  // El frontend solo muestra el plan de hoy
  const hoy = todayNoTime_();
  const hace7 = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);

  const out = data.filter(r => {
    if (!r[idxFlujo]) return false;
    if (idxFecha < 0) return true;
    const f = r[idxFecha] instanceof Date ? r[idxFecha] : new Date(r[idxFecha]);
    return !isNaN(f.getTime()) && f >= hace7;
  }).map(r => ({
    fecha: r[idxFecha] instanceof Date ? fmt_(r[idxFecha], "dd/MM/yyyy") : String(r[idxFecha] || ""),
    flujo: String(r[idxFlujo] || "").trim(),
    id_meli: String(r[idxId] || "").replace(/[\r\n\t\u200b\u00a0]/g, "").trim(),
    nombre: idxNombre >= 0 ? String(r[idxNombre] || "").replace(/[\r\n\t]/g, " ").trim() : "",
    es_fijo: idxFijo >= 0 ? String(r[idxFijo] || "").trim() : "",
  }));

  cachePutJson_(cacheKey, out, 300); // 5m (se invalida al regenerar)
  timedLog_("planificacion.list", t0, "rows=" + out.length);
  return out;
}


function planificacionGenerar_() {
  const flujos = flujosList_();
  const hab = habilitacionesList_();
  const colabs = colaboradoresList_();

  const colById = {};
  colabs.forEach(c => {
    const id = String(c["ID_MELI"] || "").trim();
    if (id) colById[id] = c;
  });

  const today = todayNoTime_();
  const pres = getSheet_("Presentismo");
  const presLastRow = pres.getLastRow();
  const presLastCol = pres.getLastColumn();

  // PERF: leer solo header + 2 columnas necesarias (ID_MELI + columna de hoy)
  const presH = pres.getRange(1, 1, 1, presLastCol).getValues()[0];
  const idxId = idx_(presH, "ID_MELI");

  const key = fmt_(today, "yyyy-MM-dd");
  let col = -1;
  for (let c = 0; c < presH.length; c++) {
    const k = ymdFromHeaderCell_(presH[c]);
    if (k && k === key) { col = c; break; }
  }
  if (col === -1) throw new Error("No existe columna de hoy en Presentismo.");

  const n = presLastRow - 1;
  const minC = Math.min(idxId, col);
  const maxC = Math.max(idxId, col);
  const presRect = pres.getRange(2, minC + 1, n, maxC - minC + 1).getValues();
  const relId  = idxId - minC;
  const relCol = col   - minC;

  const presentes = new Set();
  for (let i = 0; i < n; i++) {
    const id = String(presRect[i][relId] || "").trim();
    if (!id) continue;

    // Valores posibles:
    // - "P" (Presente)
    // - "TM/TR", "CJ" (Presente parcial) -> ✅ cuenta como Presente para planificación
    // - códigos de ausencia (V, M, E, etc.)
    // - "PF|..." (PeopleForce) -> NO cuenta como Presente
    const v = String(presRect[i][relCol] || "").trim().toUpperCase();

    if (v === PRESENCIA_CODE || PRESENTE_PARCIAL_CODES.includes(v)) {
      presentes.add(id);
    }
  }
const sh = getSheet_("Planificacion_Diaria");
  sh.clearContents();
  sh.getRange(1, 1, 1, 6).setValues([["Fecha","Flujo","ID_MELI","Nombre","Rol","Es_Fijo"]]);

  const rotIdx = buildRotacionIndex_(today);

  // =========================
  // FIX: pool global asignados
  // =========================
  const assigned = new Set();

  // Pre-armamos estado por flujo para poder:
  // - Pasada 1: asignar fijos sin duplicar
  // - Pasada 2: completar cupos (rotación preferida) sin duplicar
  const flowState = [];

  flujos.forEach(f => {
    const flujo = f.flujo;
    const cant = Number(f.perfiles_requeridos || 0);
    if (!cant) return;

    const candidates = hab.rows
      .filter(r => presentes.has(r.id_meli) && !!r[`H_${flujo}`])
      .map(r => ({
        id: r.id_meli,
        fijo: f.permite_fijos ? !!r[`F_${flujo}`] : false
      }));

    let fijos = candidates.filter(x => x.fijo);
    const nof = candidates.filter(x => !x.fijo);

    // --- ROTACIÓN (preferencia, no bloqueo duro) ---
    let excluidos = new Set();
    if (rotacionActiva_(f.rotacion_modo)) {
      const win = Number(f.ventana_rotacion_dias || 0) ||
        (String(f.rotacion_modo).toLowerCase() === "semanal" ? 7 : 1);
      excluidos = getExcluidosPorVentana_(rotIdx, flujo, today, win);

      // --- ROTACIÓN DE FIJOS: si hay más fijos que cupos, ordenar por
      //     antigüedad de última asignación (más descansado primero).
      //     Solo aplica cuando rotación activa Y fijos > cupos necesarios.
      if (fijos.length > cant) {
        // Construir mapa: id -> última fecha asignado en este flujo
        const ultimaFecha = {}; // id -> timestamp (0 = nunca asignado = prioridad máxima)
        const byDay = (rotIdx[flujo] || {});
        Object.keys(byDay).forEach(dayKey => {
          const ts = new Date(dayKey + 'T00:00:00').getTime();
          if (isNaN(ts)) return;
          byDay[dayKey].forEach(id => {
            if (!ultimaFecha[id] || ts > ultimaFecha[id]) {
              ultimaFecha[id] = ts;
            }
          });
        });
        // Ordenar: nunca asignado (0) primero, luego más antiguo primero
        // Empate: mantener orden original de la hoja (sort estable en V8)
        fijos = fijos.slice().sort((a, b) => {
          const ta = ultimaFecha[a.id] || 0;
          const tb = ultimaFecha[b.id] || 0;
          return ta - tb; // menor timestamp (más antiguo / nunca) primero
        });
      }
    }

    const nofPreferidos = nof.filter(x => !excluidos.has(x.id));
    const nofFallback  = nof.filter(x =>  excluidos.has(x.id));

    flowState.push({
      flujo,
      cant,
      fijos,
      nofPreferidos,
      nofFallback,
      selected: []
    });
  });

  const out = [];

  // -------------------------
  // PASADA 1: fijos primero
  // -------------------------
  flowState.forEach(st => {
    st.fijos.forEach(x => {
      if (st.selected.length >= st.cant) return;
      if (assigned.has(x.id)) return;
      st.selected.push(x);
      assigned.add(x.id);
    });
  });

  // -------------------------
  // PASADA 2: completar cupos
  // (rotación preferida, luego fallback)
  // -------------------------
  flowState.forEach(st => {
    st.nofPreferidos.forEach(x => {
      if (st.selected.length >= st.cant) return;
      if (assigned.has(x.id)) return;
      st.selected.push(x);
      assigned.add(x.id);
    });

    st.nofFallback.forEach(x => {
      if (st.selected.length >= st.cant) return;
      if (assigned.has(x.id)) return;
      st.selected.push(x);
      assigned.add(x.id);
    });

    if (!st.selected.length) {
      out.push([today, st.flujo, "SIN PERFILES DISPONIBLES", "", "", ""]);
      return;
    }

    st.selected.forEach(x => {
      const c = colById[x.id] || {};
      out.push([
        today,
        st.flujo,
        x.id,
        String(c["Nombre"] || ""),
        String(c["Rol"] || ""),
        x.fijo ? "SI" : "NO",
      ]);
    });
  });

  if (out.length) {
    sh.getRange(2, 1, out.length, 6).setValues(out);
    sh.getRange(1, 1, sh.getLastRow(), 1).setNumberFormat("dd/MM/yyyy");
  }

  // Historial_Planning (NO eliminar): append sin pisar información previa
  try { appendPlanningHistory_(today, out); } catch (e) {
    console.log("Historial_Planning error: " + (e && e.message ? e.message : e));
  }

  return { ok: true, rows: out.length };
}

/* =========================
   Slack Outbox
========================= */

function slackOutboxList_() {
  const t0 = nowMs_();
  const cacheKey = "slack.outbox.list.v2";
  const cached = cacheGetJson_(cacheKey);
  if (cached) return cached;

  const sh = getSheet_("Slack_Outbox");
  ensureSlackOutboxHeader_(sh);

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const hRaw = readRect_(sh, 1, 1, 1, lastCol)[0];
const h = hRaw.map(v => String(v || "").trim());

  const idxCanal = idx_(h, "Canal");
  const idxChanId = idx_(h, "Slack_Channel_ID") >= 0 ? idx_(h, "Slack_Channel_ID") : h.indexOf("Channel_ID"); // compatibilidad con hojas viejas
  const idxMsg = idx_(h, "Mensaje");
  const idxEstado = idx_(h, "Estado");
  const idxTipo = h.indexOf("Tipo");
  const idxFecha = h.indexOf("Fecha");
  const idxProg = h.indexOf("Programado_Para");

  const maxIdx0 = Math.max(idxCanal, idxChanId, idxMsg, idxEstado, idxTipo >= 0 ? idxTipo : 0, idxFecha >= 0 ? idxFecha : 0, idxProg >= 0 ? idxProg : 0);
  const data = readRect_(sh, 1, 1, lastRow, maxIdx0 + 1);

  // PERF: solo incluir no-enviados + enviados de los últimos 30 días
  // El frontend solo muestra 14 días / 50 filas de enviados — no necesitamos todo el historial
  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffMs);

  const out = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[idxMsg]) continue;
    const estado = String(r[idxEstado] || "");
    const isEnviado = estado.toUpperCase().includes("ENVIADO");

    if (isEnviado) {
      // Incluir solo enviados recientes (últimos 30 días)
      let fechaRow = null;
      if (idxFecha >= 0 && r[idxFecha] instanceof Date) fechaRow = r[idxFecha];
      else if (idxFecha >= 0 && r[idxFecha]) {
        const d = new Date(r[idxFecha]);
        if (!isNaN(d.getTime())) fechaRow = d;
      }
      if (fechaRow && fechaRow < cutoffDate) continue; // skip enviados viejos
    }

    out.push({
      row: i + 1,
      fecha: idxFecha >= 0 ? (r[idxFecha] instanceof Date ? fmt_(r[idxFecha], "yyyy-MM-dd") : String(r[idxFecha] || "")) : "",
      tipo: idxTipo >= 0 ? String(r[idxTipo] || "") : "",
      canal: String(r[idxCanal] || ""),
      channel_id: String(r[idxChanId] || ""),
      mensaje: String(r[idxMsg] || ""),
      estado: estado,
      programado_para: idxProg >= 0
        ? (r[idxProg] instanceof Date
            ? fmt_(r[idxProg], "yyyy-MM-dd'T'HH:mm")
            : String(r[idxProg] || ""))
        : "",
    });
  }

  cachePutJson_(cacheKey, out, 30); // 30s — dinámico
  timedLog_("slack.outbox.list", t0, "rows=" + out.length);
  return out;
}



function slackOutboxGenerar_() {
  const shPlan = getSheet_("Planificacion_Diaria");
  const plan = values_(shPlan);
  if (plan.length < 2) throw new Error("No hay planificación.");

  const h = plan[0];
  const idxFecha = idx_(h, "Fecha");
  const idxFlujo = idx_(h, "Flujo");
  const idxId = idx_(h, "ID_MELI");

  const colabs = colaboradoresList_();
  const colById = {};
  colabs.forEach(c => {
    const id = String(c["ID_MELI"] || "").trim();
    if (id) colById[id] = c;
  });

  const porFlujo = {};
  for (let i = 1; i < plan.length; i++) {
    const r = plan[i];
    const flujo = String(r[idxFlujo] || "").trim();
    if (!flujo) continue; // regla: sin Flujo de Tarea no sirve
    if (!flujo) continue; // regla: sin Flujo de Tarea no sirve
    if (!flujo) continue;
    const id = String(r[idxId] || "").trim();
    if (!id || id === "SIN PERFILES DISPONIBLES") continue;
    porFlujo[flujo] = porFlujo[flujo] || [];
    porFlujo[flujo].push(id);
  }

  const firstDate = plan[1][idxFecha];
  const fecha = firstDate instanceof Date ? firstDate : todayNoTime_();

  const lineas = Object.keys(porFlujo).sort().map(flujo => {
    const ids = porFlujo[flujo];
    const mentions = ids.map(id => {
      const slackId = String(colById[id]?.["Slack_ID"] || "").trim();
      return slackId ? `<@${slackId}>` : id;
    }).join(" - ");
    return `*${flujo}*: ${mentions}`;
  });
  const lineasStr = lineas.join("\n");

  // Mensaje GENERAL usando template con fallback
  const tplGeneral = applyTemplate_("OUTBOX_GENERAL", { lineas: lineasStr });
  const msgGeneral = tplGeneral !== null ? tplGeneral
    : "Muy buenos d\xc3\xadas equipo! :sunny: Les comparto c\xc3\xb3mo quedamos organizados para hoy:\n" + lineasStr + "\n\nQue tengan una excelente jornada :pepe_love:";

  const shOut = getSheet_("Slack_Outbox");
  ensureSlackOutboxHeader_(shOut);

  appendSlackOutboxRow_(shOut, fecha, "GENERAL", "General", "", msgGeneral, "PENDIENTE - SIN CANAL", "");

  // Mensajes POR_FLUJO usando template con fallback
  Object.keys(porFlujo).forEach(flujo => {
    const ids = porFlujo[flujo];
    const mentions = ids.map(id => {
      const slackId = String(colById[id]?.["Slack_ID"] || "").trim();
      return slackId ? `<@${slackId}>` : id;
    }).join(" - ");
    const tplFlujo = applyTemplate_("OUTBOX_POR_FLUJO", { flujo: flujo, mentions: mentions });
    const msg = tplFlujo !== null ? tplFlujo : `*${flujo}*\n${mentions}`;
    appendSlackOutboxRow_(shOut, fecha, "POR_FLUJO", flujo, "", msg, "PENDIENTE - SIN CANAL", "");
  });

  return { ok: true };
}


function slackOutboxGenerarGeneral_() {
  const shPlan = getSheet_("Planificacion_Diaria");
  const plan = values_(shPlan);
  if (plan.length < 2) throw new Error("No hay planificación.");

  const h = plan[0];
  const idxFecha = idx_(h, "Fecha");
  const idxFlujo = idx_(h, "Flujo");
  const idxId = idx_(h, "ID_MELI");

  const colabs = colaboradoresList_();
  const colById = {};
  colabs.forEach(c => {
    const id = String(c["ID_MELI"] || "").trim();
    if (id) colById[id] = c;
  });

  // ✅ Config de flujos (incluye canal Slack)
  const flujosCfg = flujosList_();
  const cfgByFlujo = {};
  flujosCfg.forEach(f => { cfgByFlujo[String(f.flujo || "").trim()] = f; });

  // Mapa de canales (para mostrar #canal en outbox)
  const canales = canalesList_();
  const canalById = {};
  const idByCanal = {};
  canales.forEach(c => {
    const cid = String(c.channel_id || "").trim();
    const name = String(c.canal || "").trim();
    if (cid) canalById[cid] = name;
    if (name) idByCanal[name] = cid;
  });

  // Agrupar por canal
  const porCanal = {}; // { channel_id: { flujo: [ids] } }
  for (let i = 1; i < plan.length; i++) {
    const r = plan[i];
    const flujo = String(r[idxFlujo] || "").trim();
    if (!flujo) continue; // regla: sin Flujo de Tarea no sirve
    if (!flujo) continue;

    const cfg = cfgByFlujo[flujo];
    if (!cfg || !cfg.incluir_en_mensaje) continue;

    // Canal requerido solo si se notifica por Slack
    let ch = String(cfg.channel_id || "").trim();
    if (!ch) continue;

    // Si vino guardado como nombre (#canal), resolver a ID
    if (!/^([CGD][A-Z0-9]{8,})$/.test(ch) && idByCanal[ch]) ch = idByCanal[ch];
    if (!ch) continue;

    const id = String(r[idxId] || "").trim();
    if (!id || id === "SIN PERFILES DISPONIBLES") continue;

    porCanal[ch] = porCanal[ch] || {};
    porCanal[ch][flujo] = porCanal[ch][flujo] || [];
    porCanal[ch][flujo].push(id);
  }

  const firstDate = plan[1][idxFecha];
  const fecha = firstDate instanceof Date ? firstDate : todayNoTime_();

  const shOut = getSheet_("Slack_Outbox");
  ensureSlackOutboxHeader_(shOut);

  const canalesKeys = Object.keys(porCanal);
  // Si no hay canales configurados (o no hay flujos incluidos con canal), no generar outbox.
  if (!canalesKeys.length) return { ok: true };

  canalesKeys.forEach((channelId) => {
    const porFlujo = porCanal[channelId] || {};
    const lineas = Object.keys(porFlujo).sort().map(flujo => {
      const ids = porFlujo[flujo];
      const mentions = ids.map(id => {
        const slackId = String(colById[id]?.["Slack_ID"] || "").trim();
        return slackId ? `<@${slackId}>` : id;
      }).join(" - ");
      return `*${flujo}*: ${mentions}`;
    });
    const lineasStr = lineas.join("\n");
    const tplMsg = applyTemplate_("OUTBOX_GENERAL", { lineas: lineasStr });
    const msg = tplMsg !== null ? tplMsg
      : "Muy buenos d\xc3\xadas equipo! :sunny: Les comparto c\xc3\xb3mo quedamos organizados para hoy:\n" + lineasStr + "\n\nQue tengan una excelente jornada :pepe_love:";
    const canalName = canalById[channelId] || "";
    appendSlackOutboxRow_(shOut, fecha, "PLAN", canalName, channelId, msg, "BORRADOR - PLANNING", "");
  });

  return { ok: true };
}

function slackOutboxUpdate_({ row, canal, channel_id, mensaje }) {
  const sh = getSheet_("Slack_Outbox");
  const data = values_(sh);
  const h = data[0];

  const idxCanal = idx_(h, "Canal");
  const idxChanId = idx_(h, "Slack_Channel_ID");
  const idxMsg = idx_(h, "Mensaje");

  row = Number(row);
  if (!row || row < 2) throw new Error("row inválida");

  sh.getRange(row, idxCanal + 1).setValue(String(canal || ""));
  sh.getRange(row, idxChanId + 1).setValue(String(channel_id || ""));
  sh.getRange(row, idxMsg + 1).setValue(String(mensaje || ""));
  cacheRemove_("slack.outbox.list.v2");
  return { ok: true };
}

function slackOutboxAppend_({ fechaISO, tipo, canal, channel_id, mensaje, estado }) {
  const sh = getSheet_("Slack_Outbox");
  ensureSlackOutboxHeader_(sh);

  const d = parseYMD_(fechaISO) || todayNoTime_();
  appendSlackOutboxRow_(
    sh,
    d,
    String(tipo || "MANUAL"),
    String(canal || ""),
    String(channel_id || ""),
    String(mensaje || ""),
    String(estado || "PENDIENTE - SIN CANAL"),
    ""
  );

    cacheRemove_("slack.outbox.list.v2");
  const newRow = sh.getLastRow();
  return { ok: true, row: newRow };
}

// Elimina un mensaje en borrador (PENDIENTE / ERROR). Por seguridad:
// - NO permite borrar ENVIADO
// - NO permite borrar PROGRAMADO
function slackOutboxDelete_({ row }) {
  row = Number(row);
  if (!row || row < 2) throw new Error("row inválida");

  const sh = getSheet_("Slack_Outbox");
  const data = values_(sh);
  if (row > data.length) throw new Error("row fuera de rango");

  const h = data[0];
  const idxEstado = idx_(h, "Estado");
  const estadoRaw = String(data[row - 1][idxEstado] || "").toUpperCase();

  if (estadoRaw.includes("ENVIADO")) throw new Error("No se puede eliminar un mensaje ya enviado.");

  sh.deleteRow(row);
  cacheRemove_("slack.outbox.list.v2");
  return { ok: true };
}

/* ✅ NUEVO: Netlify Slack Direct — leer fila para enviar */
function slackOutboxGetRow_({ row }) {
  row = Number(row);
  if (!row || row < 2) throw new Error("row inválida");

  const sh = getSheet_("Slack_Outbox");
  const data = values_(sh);
  if (row > data.length) throw new Error("row fuera de rango");

  const h = data[0];
  const idxCanal = idx_(h, "Canal");
  const idxChanId = idx_(h, "Slack_Channel_ID");
  const idxMsg = idx_(h, "Mensaje");

  const r = data[row - 1];
  let channelId = String(r[idxChanId] || "").trim();
  const canal = String(r[idxCanal] || "").trim();
  if (!channelId && canal) channelId = resolveChannelIdByName_(canal);

  return { row, canal, channel_id: channelId, mensaje: String(r[idxMsg] || "") };
}

/* ✅ NUEVO: Netlify Slack Direct — actualizar estado post-envío */
function slackOutboxSetStatus_({ row, estado }) {
  row = Number(row);
  if (!row || row < 2) throw new Error("row inválida");

  const sh = getSheet_("Slack_Outbox");
  const data = values_(sh);
  const h = data[0];

  const idxEstado = idx_(h, "Estado");
  sh.getRange(row, idxEstado + 1).setValue(String(estado || ""));
  return { ok: true, row };
}


/* ✅ Scheduling: programar / desprogramar (solo Sheet, Slack lo manda Netlify) */
function slackOutboxProgramar_({ row, programado_para, canal, channel_id, mensaje }) {
  row = Number(row);
  if (!row || row < 2) throw new Error("row inválida");

  const sh = getSheet_("Slack_Outbox");
  ensureSlackOutboxHeader_(sh);

  const data = values_(sh);
  const h = data[0];
  const idxProg = h.indexOf("Programado_Para");
  if (idxProg === -1) throw new Error("Falta columna Programado_Para");

  const raw = String(programado_para || "").trim();
  if (!raw) throw new Error("programado_para requerido");

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) throw new Error("programado_para inválido (formato esperado: yyyy-MM-ddTHH:mm)");
  const when = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0);

  // Actualizar canal/mensaje si se pasan (evita round-trip separado a slackOutboxUpdate)
  const idxCanal  = idx_(h, "Canal");
  const idxChanId = idx_(h, "Slack_Channel_ID");
  const idxMsg    = idx_(h, "Mensaje");
  if (canal      !== undefined) sh.getRange(row, idxCanal  + 1).setValue(String(canal      || ""));
  if (channel_id !== undefined) sh.getRange(row, idxChanId + 1).setValue(String(channel_id || ""));
  if (mensaje    !== undefined) sh.getRange(row, idxMsg    + 1).setValue(String(mensaje    || ""));

  sh.getRange(row, idxProg + 1).setValue(when);
  sh.getRange(row, idxProg + 1).setNumberFormat("dd/MM/yyyy HH:mm");

  const stamp = fmt_(when, "dd/MM/yyyy HH:mm");
  const idxEstado = idx_(h, "Estado");
  sh.getRange(row, idxEstado + 1).setValue(`PROGRAMADO ⏰ ${stamp}`);

  cacheRemove_("slack.outbox.list.v2");
  return { ok: true, row, programado_para: raw, estado: `PROGRAMADO ⏰ ${stamp}` };
}

function slackOutboxDesprogramar_({ row }) {
  row = Number(row);
  if (!row || row < 2) throw new Error("row inválida");

  const sh = getSheet_("Slack_Outbox");
  ensureSlackOutboxHeader_(sh);

  const data = values_(sh);
  const h = data[0];

  const idxProg = h.indexOf("Programado_Para");
  if (idxProg >= 0) sh.getRange(row, idxProg + 1).setValue("");

  // Volver a BORRADOR conservando canal, mensaje y todos los datos
  const idxEstado = idx_(h, "Estado");
  sh.getRange(row, idxEstado + 1).setValue("BORRADOR");

  cacheRemove_("slack.outbox.list.v2");
  return { ok: true, row };
}

/* ✅ Claim atómico para evitar duplicados del scheduler */
function slackOutboxClaimDue_({ row }) {
  row = Number(row);
  if (!row || row < 2) throw new Error("row inválida");

  const sh = getSheet_("Slack_Outbox");
  ensureSlackOutboxHeader_(sh);

  const data = values_(sh);
  const h = data[0];

  const idxEstado = idx_(h, "Estado");
  const idxProg = h.indexOf("Programado_Para");
  if (idxProg === -1) return { ok: true, row, claimed: false, reason: "no_programado_para" };

  const estado = String(data[row - 1][idxEstado] || "").toUpperCase();
  if (!estado.startsWith("PROGRAMADO")) return { ok: true, row, claimed: false, reason: "estado_no_programado" };

  const when = data[row - 1][idxProg];
  const whenDate = when instanceof Date ? when : new Date(String(when || ""));
  if (!(whenDate instanceof Date) || isNaN(whenDate.getTime())) return { ok: true, row, claimed: false, reason: "programado_invalido" };

  const now = new Date();
  if (whenDate.getTime() > now.getTime()) return { ok: true, row, claimed: false, reason: "aun_no_due" };

  const stamp = fmt_(now, "dd/MM/yyyy HH:mm");
  sh.getRange(row, idxEstado + 1).setValue(`ENVIANDO… ${stamp}`);

  return { ok: true, row, claimed: true };
}


/* Resolve Channel ID desde:
   - "team-catalogo (C08ACHW287L)" -> C08ACHW287L
   - "C08ACHW287L" directo
   - lookup en hoja Canales
*/
function resolveChannelIdByName_(canalName) {
  canalName = String(canalName || "").trim();
  if (!canalName) return "";

  const m = canalName.match(/\(([A-Z0-9]{6,})\)/i);
  if (m && m[1]) return String(m[1]).trim();

  if (/^[CG][A-Z0-9]{6,}$/.test(canalName)) return canalName;

  try {
    const sh = getSheet_("Canales");
    const data = values_(sh);
    const h = data[0];
    const idxCanal = idx_(h, "Canal");
    const idxId = idx_(h, "Slack_channel");

    for (let i = 0; i < data.length; i++) {
      const c = String(data[i][idxCanal] || "").trim();
      if (c && c.toLowerCase() === canalName.toLowerCase()) {
        return String(data[i][idxId] || "").trim();
      }
    }
  } catch (e) {}
  return "";
}

/* Compat: Apps Script envía a Slack (si tenés permisos/scopes) */
function slackOutboxEnviar_({ row }) {
  if (!SLACK_BOT_TOKEN) throw new Error("Falta SLACK_BOT_TOKEN en Script Properties.");

  const sh = getSheet_("Slack_Outbox");
  const data = values_(sh);
  const h = data[0];

  const idxChanId = idx_(h, "Slack_Channel_ID");
  const idxMsg = idx_(h, "Mensaje");
  const idxEstado = idx_(h, "Estado");

  const stamp = fmt_(new Date(), "dd/MM HH:mm");

  let targets = [];
  if (row) {
    const rr = Number(row);
    if (rr < 2 || rr > data.length) throw new Error("row fuera de rango");
    targets = [rr];
  } else {
    targets = [];
    for (let i = 0; i < data.length; i++) {
      const estado = String(data[i][idxEstado] || "");
      if (estado.toUpperCase().startsWith("PENDIENTE")) targets.push(i + 1);
    }
  }

  let enviados = 0, errores = 0;

  targets.forEach(rn => {
    const i = rn - 1;
    const channelId = String(data[i][idxChanId] || "").trim();
    const msg = String(data[i][idxMsg] || "");

    if (!channelId) {
      sh.getRange(rn, idxEstado + 1).setValue(`ERROR ❌ ${stamp} - SIN CANAL`);
      errores++;
      return;
    }

    const resp = postToSlack_(SLACK_BOT_TOKEN, channelId, msg);
    if (resp.ok) {
      sh.getRange(rn, idxEstado + 1).setValue(`ENVIADO ✅ ${stamp}`);
      enviados++;
    } else {
      sh.getRange(rn, idxEstado + 1).setValue(`ERROR ❌ ${stamp} - ${resp.error || "desconocido"}`);
      errores++;
    }
  });

  return { ok: true, enviados, errores };
}

function ensureSlackOutboxHeader_(sh) {
  const lastRow = sh.getLastRow();

  // Headers esperados (orden canónico)
  const HEADERS = ["Fecha","Tipo","Canal","Slack_Channel_ID","Mensaje","Estado","Programado_Para"];

  if (lastRow === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return;
  }

  // Si la hoja ya existe con 6 columnas, agregamos Programado_Para al final sin tocar datos.
  const lastCol = sh.getLastColumn();
  const current = sh.getRange(1, 1, 1, Math.max(lastCol, 6)).getValues()[0];

  const hasBase = String(current[0] || "") === "Fecha" && String(current[1] || "") === "Tipo";
  if (!hasBase) {
    // Reescribimos SOLO los headers base (1..6) para no romper data
    sh.getRange(1, 1, 1, 6).setValues([HEADERS.slice(0, 6)]);
  }

  const nowLastCol = sh.getLastColumn();
  const h2 = sh.getRange(1, 1, 1, nowLastCol).getValues()[0];
  if (h2.indexOf("Programado_Para") === -1) {
    sh.getRange(1, nowLastCol + 1).setValue("Programado_Para");
  }
}



function appendSlackOutboxRow_(sh, fecha, tipo, canal, channelId, mensaje, estado, programadoPara) {
  ensureSlackOutboxHeader_(sh);

  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  const idxFecha = idx_(headers, "Fecha");
  const idxTipo = idx_(headers, "Tipo");
  const idxCanal = idx_(headers, "Canal");
  const idxChanId = idx_(headers, "Slack_Channel_ID");
  const idxMsg = idx_(headers, "Mensaje");
  const idxEstado = idx_(headers, "Estado");
  const idxProg = headers.indexOf("Programado_Para");

  const row = sh.getLastRow() + 1;
  const rowArr = new Array(headers.length).fill("");

  rowArr[idxFecha] = fecha;
  rowArr[idxTipo] = tipo;
  rowArr[idxCanal] = canal;
  rowArr[idxChanId] = channelId;
  rowArr[idxMsg] = mensaje;
  rowArr[idxEstado] = estado;
  if (idxProg >= 0) rowArr[idxProg] = programadoPara || "";

  sh.getRange(row, 1, 1, rowArr.length).setValues([rowArr]);

  // Formatos
  sh.getRange(row, idxFecha + 1).setNumberFormat("dd/MM/yyyy");
  if (idxProg >= 0) sh.getRange(row, idxProg + 1).setNumberFormat("dd/MM/yyyy HH:mm");
}



function postToSlack_(token, channelId, text) {
  const payload = { channel: channelId, text };
  const params = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
  const resp = UrlFetchApp.fetch("https://slack.com/api/chat.postMessage", params);
  const bodyTxt = resp.getContentText();
  try { return JSON.parse(bodyTxt); } catch (e) { return { ok: false, error: "invalid_json" }; }
}

/* =========================
   Header match helpers
========================= */
function norm_(s) { return String(s || "").trim().toLowerCase(); }
function findHeaderIndex_(headers, flujoNombre) {
  const target = norm_(flujoNombre);
  for (let i = 0; i < headers.length; i++) {
    if (norm_(headers[i]) === target) return i;
  }
  const t2 = target.replace(/[\s_-]+/g, "");
  for (let i = 0; i < headers.length; i++) {
    const h2 = norm_(headers[i]).replace(/[\s_-]+/g, "");
    if (h2 === t2) return i;
  }
  return -1;
}
function findFijoHeaderIndex_(headers, flujoNombre) {
  const target = norm_(flujoNombre);
  const patrones = [
    `fijo_${target}`,
    `fijo ${target}`,
    `fijo-${target}`,
    `f_${target}`,
    `f ${target}`,
    `f-${target}`,
    `fijo_${target.replace(/[\s_-]+/g, "")}`,
    `f_${target.replace(/[\s_-]+/g, "")}`,
  ].map(p => p.replace(/[\s_-]+/g, ""));

  for (let i = 0; i < headers.length; i++) {
    const h = norm_(headers[i]).replace(/[\s_-]+/g, "");
    if (patrones.includes(h)) return i;
  }
  return -1;
}

function slackOutboxListDue_() {
  const sh = getSheet_("Slack_Outbox");
  const data = values_(sh);
  const h = data[0];

  const idxChanId = idx_(h, "Slack_Channel_ID");
  const idxCanal = idx_(h, "Canal");
  const idxMsg = idx_(h, "Mensaje");
  const idxEstado = idx_(h, "Estado");

  // Columna opcional: Programado_Para (si no existe, no hay "due")
  const idxProg = h.indexOf("Programado_Para");

  if (idxProg === -1) return []; // no hay scheduling configurado aún

  const now = new Date();

  const out = [];
  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 1;
    const estado = String(data[i][idxEstado] || "").toUpperCase();
    if (!estado.startsWith("PROGRAMADO")) continue;

    const when = data[i][idxProg];
    const whenDate = when instanceof Date ? when : new Date(String(when || ""));
    if (!(whenDate instanceof Date) || isNaN(whenDate.getTime())) continue;

    if (whenDate.getTime() <= now.getTime()) {
      let channelId = String(data[i][idxChanId] || "").trim();
      const canalName = String(data[i][idxCanal] || "").trim();
      if (!channelId && canalName) channelId = resolveChannelIdByName_(canalName);

      out.push({
        row: rowNum,
        channel_id: channelId,
        mensaje: String(data[i][idxMsg] || ""),
      });
    }
  }
  return out;
}
/* =========================
   PeopleForce (Presentismo)
   - Robust, desacoplado, desactivable
   - Cache en Script Properties
   - Prioridad PeopleForce sobre carga manual
   ========================= */

function peopleforceEnabled_() {
  const p = PropertiesService.getScriptProperties();
  const v = String(p.getProperty('PEOPLEFORCE_ENABLED') || '1').trim();
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'si';
}

function peopleforceHealth_() {
  const p = PropertiesService.getScriptProperties();
  const enabled = peopleforceEnabled_();
  const ts = p.getProperty('PEOPLEFORCE_CACHE_TS') || '';
  const ttlMin = Number(p.getProperty('PEOPLEFORCE_CACHE_TTL_MIN') || 20);
  return { enabled, cache_ts: ts, cache_ttl_min: ttlMin };
}

function peopleforceSync_() {
  if (!peopleforceEnabled_()) {
    return { ok: true, enabled: false, msg: 'PeopleForce desactivado (PEOPLEFORCE_ENABLED=0).' };
  }

  const p = PropertiesService.getScriptProperties();
  const apiKey = String(p.getProperty('PEOPLEFORCE_API_KEY') || '').trim();
  if (!apiKey) throw new Error('Falta PEOPLEFORCE_API_KEY en Script Properties.');

  const baseUrl = 'https://app.peopleforce.io/api/public/v3/leave_requests';

  // Paginacion: page (tamano fijo 50) segun docs
  // https://developer.peopleforce.io/docs/pagination
  // Autenticacion: header X-API-KEY segun docs
  // https://developer.peopleforce.io/docs/authentication

  // Identificacion de colaborador (definicion del HUB): por "Mail Productora".
  // Fallbacks solo si no existe (para no dejarte ciego si alguien carga mal el sheet).
  const colabs = colaboradoresList_();
  const emailToId = {};
  colabs.forEach(c => {
    const id = String(c['ID_MELI'] || '').trim();
    const email = String(
      c['Mail Productora'] ||
      c['Mail_Productora'] ||
      c['MailProductora'] ||
      c['Email Productora'] ||
      c['Email'] || c['email'] || c['Mail'] || c['MAIL'] ||
      ''
    ).trim().toLowerCase();
    if (id && email) emailToId[email] = id;
  });

  const out = [];

  let page = 1;
  let pages = 1;
  while (page <= pages) {
    const url = baseUrl + '?page=' + page;
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: { 'X-API-KEY': apiKey },
    });

    const code = res.getResponseCode();
    const txt = res.getContentText();
    if (code < 200 || code >= 300) {
      throw new Error('PeopleForce error HTTP ' + code + ': ' + txt);
    }

    const json = JSON.parse(txt || '{}');
    const data = Array.isArray(json.data) ? json.data : [];
    const meta = json.metadata || {};
    pages = Number(meta.pages || pages || 1);

    data.forEach(lr => out.push(lr));
    page += 1;
  }

  // Normalizacion a cache minimalista para el HUB
  // Estructura cache:
  // {
  //   byId: { "<ID_MELI>": { "YYYY-MM-DD": { tipo, estado, source:'PF', req_id } } }
  // }
  const byId = {};

  out.forEach(lr => {
    // Extraccion flexible de email/employee
    const employee = lr.employee || lr.employee_profile || lr.user || {};
    const emailRaw = (employee.work_email || employee.email || lr.employee_email || lr.email || '').toString().trim().toLowerCase();
    const idMeli = emailToId[emailRaw];
    if (!idMeli) return;

    const start = lr.start_date || lr.startDate || lr.from || lr.date_from;
    const end = lr.end_date || lr.endDate || lr.to || lr.date_to;
    if (!start || !end) return;

    const status = String(lr.status || lr.state || lr.approval_status || '').trim().toLowerCase();
    const leaveType = (lr.leave_type && (lr.leave_type.name || lr.leave_type.code)) || lr.leave_type_name || lr.type || lr.leave_type_id || 'LIC';

    const startDate = new Date(start);
    const endDate = new Date(end);

    // En PeopleForce suele ser rango inclusivo.
    const days = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      days.push(key);
    }

    if (!byId[idMeli]) byId[idMeli] = {};
    days.forEach(key => {
      byId[idMeli][key] = {
        tipo: String(leaveType),
        estado: status,
        source: 'PF',
        req_id: lr.id || lr.request_id || '',
      };
    });
  });

  const payload = {
    byId,
    updated_at: new Date().toISOString(),
  };

  p.setProperty('PEOPLEFORCE_CACHE', JSON.stringify(payload));
  p.setProperty('PEOPLEFORCE_CACHE_TS', payload.updated_at);

  return { ok: true, enabled: true, total_requests: out.length, total_ids: Object.keys(byId).length, cache_ts: payload.updated_at };
}

function peopleforceGetCache_() {
  const p = PropertiesService.getScriptProperties();
  const ttlMin = Number(p.getProperty('PEOPLEFORCE_CACHE_TTL_MIN') || 20);

  const ts = p.getProperty('PEOPLEFORCE_CACHE_TS') || '';
  const cacheRaw = p.getProperty('PEOPLEFORCE_CACHE') || '';

  let cache = null;
  try { cache = cacheRaw ? JSON.parse(cacheRaw) : null; } catch (e) { cache = null; }

  const tsDate = ts ? new Date(ts) : null;
  const now = new Date();
  const isStale = !tsDate || (now.getTime() - tsDate.getTime()) > ttlMin * 60 * 1000;

  return { cache, ts, ttlMin, isStale };
}

function peopleforceHasDay_(idMeli, ymd) {
  const { cache } = peopleforceGetCache_();
  if (!cache || !cache.byId) return false;
  return !!(cache.byId[idMeli] && cache.byId[idMeli][ymd]);
}

function mergePeopleforceIntoPresentismo_(rows, days) {
  // ✅ CORRECCIÓN: Esta función ya no aplica datos desde el cache de Script Properties.
  // Los datos de PeopleForce se escriben directo en la hoja Presentismo via
  // PeopleForce_Apply_Staging_To_Presentismo_OptionB(), que es la fuente de verdad.
  // El frontend lee los valores correctos desde la hoja, no hay nada que mergear aquí.
  return;
}


function peopleforceInstallTriggerDaily_() {
  // Ejecutar 1 vez manualmente para instalar (o reinstalar) el trigger.
  // Ej: 06:05 AM.
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'peopleforceSyncCron_') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('peopleforceSyncCron_')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(5)
    .create();
}

// Alias sin guion bajo para que aparezca facil en el dropdown de funciones.
function peopleforceInstallTriggerDaily() {
  return peopleforceInstallTriggerDaily_();
}

// Debug rapido: ver triggers instalados en el proyecto.
function peopleforceListTriggers() {
  return ScriptApp.getProjectTriggers().map(t => ({
    handler: t.getHandlerFunction && t.getHandlerFunction(),
    type: String(t.getEventType && t.getEventType()),
    uid: String(t.getUniqueId && t.getUniqueId()),
  }));
}

function peopleforceSyncCron_() {
  try {
    peopleforceSync_();
  } catch (e) {
    // No reventar el trigger: loguear.
    console.error('peopleforceSyncCron_ error', e);
  }
}

/* =========================
   Hub Init — endpoint unificado de arranque
   Devuelve colabs + canales + flujos + plan + outbox en un solo request.
   Elimina 4 de los 7 cold starts del arranque normal.
========================= */
function hubInit_() {
  // Un solo request que devuelve TODO lo necesario para el render inicial completo.
  // Con warm-up trigger activo, cada función ya tiene cache → respuesta en <1s total.
  const d          = fmt_(new Date(), "yyyy-MM-dd");
  const colabs     = colaboradoresList_();
  const canales    = canalesList_();
  const flujos     = flujosList_();
  const plan       = planificacionList_();
  const outbox     = slackOutboxList_();
  const presWeek   = presentismoWeek_(d);
  const presStats  = presentismoStats_(d);
  const habil      = habilitacionesList_();
  // agenda excluida: 268 filas históricas, carga lazy al primer click en el tab
  return { colabs, canales, flujos, plan, outbox, presWeek, presStats, habil };
}


/* =========================
   Agenda del equipo
========================= */

function agendaList_() {
  const t0 = nowMs_();
  const cacheKey = "agenda.list.v1";
  const cached = cacheGetJson_(cacheKey);
  if (cached) return cached;

  const sh = getSheet_("Agenda");
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const hRaw = readRect_(sh, 1, 1, 1, lastCol)[0];
  const h = hRaw.map(v => String(v || "").trim());

  const idxFecha   = h.indexOf("Fecha");
  const idxOwner   = h.indexOf("Owner");
  const idxTema    = h.indexOf("Tema");
  const idxTiempo  = h.indexOf("Tiempo");
  const idxPrio    = h.indexOf("Prioridad");
  const idxDesc    = h.indexOf("Descripción");
  const idxEstado  = h.indexOf("Estado");
  const idxObs     = h.indexOf("Observaciones");

  const data = readRect_(sh, 2, 1, lastRow - 1, lastCol);

  const out = data
    .map((r, i) => ({
      row:          i + 2, // 1-indexed, +1 por header
      fecha:        r[idxFecha] instanceof Date
                      ? fmt_(r[idxFecha], "dd/MM/yyyy")
                      : String(r[idxFecha] || ""),
      owner:        String(r[idxOwner]  || ""),
      tema:         String(r[idxTema]   || ""),
      tiempo:       String(r[idxTiempo] || ""),
      prioridad:    String(r[idxPrio]   || "Importante"),
      descripcion:  String(r[idxDesc]   || ""),
      estado:       String(r[idxEstado] || "Pendiente"),
      observaciones:String(r[idxObs]   || ""),
    }))
    .filter(r => r.tema); // ignorar filas vacías

  cachePutJson_(cacheKey, out, 600); // 10 min (warm-up corre cada 5 min, siempre en cache)
  timedLog_("agenda.list", t0, "rows=" + out.length);
  return out;
}

function agendaAdd_({ fecha, owner, tema, tiempo, prioridad, descripcion }) {
  if (!tema) throw new Error("tema requerido");

  const sh = getSheet_("Agenda");
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) throw new Error("Agenda: la hoja no tiene columnas");

  // Trim de headers para evitar mismatches por espacios invisibles
  const h = sh.getRange(1, 1, 1, lastCol).getValues()[0]
              .map(v => String(v || "").trim());

  const idxFecha   = h.indexOf("Fecha");
  const idxOwner   = h.indexOf("Owner");
  const idxTema    = h.indexOf("Tema");
  const idxTiempo  = h.indexOf("Tiempo");
  const idxPrio    = h.indexOf("Prioridad");
  // Buscar Descripción con y sin tilde por si el sheet tiene variante
  const idxDesc    = h.indexOf("Descripción") >= 0 ? h.indexOf("Descripción") : h.indexOf("Descripcion");
  const idxEstado  = h.indexOf("Estado");

  if (idxTema < 0) throw new Error("Columna Tema no encontrada en hoja Agenda. Headers: " + JSON.stringify(h));

  const rowArr = new Array(lastCol).fill("");

  // Fecha: si viene "dd/MM/yyyy" la convertimos a Date para que Sheets la entienda
  let fechaVal = "";
  if (fecha) {
    const m = String(fecha).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) fechaVal = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    else {
      const d = new Date(fecha);
      fechaVal = isNaN(d.getTime()) ? fecha : d;
    }
  }

  if (idxFecha  >= 0) rowArr[idxFecha]  = fechaVal || "";
  if (idxOwner  >= 0) rowArr[idxOwner]  = String(owner       || "All");
  if (idxTema   >= 0) rowArr[idxTema]   = String(tema        || "");
  if (idxTiempo >= 0) rowArr[idxTiempo] = String(tiempo      || "");
  if (idxPrio   >= 0) rowArr[idxPrio]   = String(prioridad   || "Importante");
  if (idxDesc   >= 0) rowArr[idxDesc]   = String(descripcion || "");
  if (idxEstado >= 0) rowArr[idxEstado] = "Para hacer";

  // Insertar en fila 2 (debajo del header) para que lo más reciente quede arriba
  let inserted = false;
  try {
    sh.insertRowBefore(2);
    inserted = true;
    sh.getRange(2, 1, 1, lastCol).setValues([rowArr]);
  } catch (writeErr) {
    if (inserted) {
      try { sh.deleteRow(2); } catch (_) {}
    }
    throw writeErr;
  }

  let formatWarning = "";
  if (idxFecha >= 0 && fechaVal) {
    try {
      sh.getRange(2, idxFecha + 1).setNumberFormat("dd/MM/yyyy");
    } catch (formatErr) {
      formatWarning = "agenda.add date format failed: " + (formatErr && formatErr.message ? formatErr.message : formatErr);
      console.error(formatWarning);
    }
  }

  cacheRemove_("agenda.list.v1");
  return formatWarning ? { ok: true, row: 2, warning: formatWarning } : { ok: true, row: 2 };
}

function agendaSetHecho_({ row }) {
  row = Number(row);
  if (!row || row < 2) throw new Error("row inválida");

  const sh = getSheet_("Agenda");
  const h = headers_(sh);
  const idxEstado = h.indexOf("Estado");
  if (idxEstado < 0) throw new Error("Falta columna Estado en Agenda");

  sh.getRange(row, idxEstado + 1).setValue("Hecho");
  cacheRemove_("agenda.list.v1");
  return { ok: true, row };
}

function agendaDelete_({ row }) {
  row = Number(row);
  if (!row || row < 2) throw new Error("row inválida");

  const sh = getSheet_("Agenda");
  sh.deleteRow(row);
  cacheRemove_("agenda.list.v1");
  return { ok: true };
}

function agendaUpdate_({ row, fecha, owner, tema, tiempo, prioridad, descripcion, estado }) {
  row = Number(row);
  if (!row || row < 2) throw new Error("row inválida");

  const sh = getSheet_("Agenda");
  const h  = headers_(sh);
  const lastCol = h.length;

  // Leer la fila completa de una sola vez
  const rowVals = sh.getRange(row, 1, 1, lastCol).getValues()[0];

  const idx = (key) => h.indexOf(key);
  const set = (key, val) => { const i = idx(key); if (i >= 0) rowVals[i] = val; };

  // Fecha: convertir dd/MM/yyyy → Date
  if (fecha !== undefined) {
    let fechaVal = fecha;
    const m = String(fecha || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) fechaVal = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    set("Fecha", fechaVal || "");
  }
  if (owner       !== undefined) set("Owner",       String(owner       || ""));
  if (tema        !== undefined) set("Tema",         String(tema        || ""));
  if (tiempo      !== undefined) set("Tiempo",       String(tiempo      || ""));
  if (prioridad   !== undefined) set("Prioridad",    String(prioridad   || ""));
  if (descripcion !== undefined) set("Descripción",  String(descripcion || ""));
  if (estado      !== undefined) set("Estado",       String(estado      || "Para hacer"));

  // Un solo setValues — 1 round-trip en lugar de 7
  sh.getRange(row, 1, 1, lastCol).setValues([rowVals]);

  // Restaurar formato de fecha
  const idxF = idx("Fecha");
  if (idxF >= 0 && fecha !== undefined) {
    sh.getRange(row, idxF + 1).setNumberFormat("dd/MM/yyyy");
  }

  cacheRemove_("agenda.list.v1");
  return { ok: true, row };
}


/* =========================
   Warm-up trigger (anti cold start)
   Instalar trigger: Extensiones → Triggers → warmUp_ → Cada 5 min
========================= */
function warmUp_() {
  // Mantiene el proceso GAS caliente y el CacheService poblado.
  // Con este trigger activo, el HUB carga en 2-3s en lugar de 10s.
  try {
    const d = fmt_(new Date(), "yyyy-MM-dd");
    colaboradoresList_();
    flujosList_();
    presentismoWeek_(d);
    presentismoStats_(d);
    planificacionList_();
    agendaList_(); // incluir agenda para que el primer click sea instantáneo
  } catch (e) {
    // No fallar el trigger
    console.log("warmUp_ error: " + e.message);
  }
}

function installWarmUpTrigger() {
  // Ejecutar una sola vez manualmente desde el editor de GAS
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "warmUp_")
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("warmUp_")
    .timeBased()
    .everyMinutes(5)
    .create();

  console.log("✅ Warm-up trigger instalado (cada 5 min)");
}


/* =========================
   Colaboradores CRUD
========================= */

function colaboradoresEquipos_() {
  // Devuelve lista única de equipos para el selector del formulario
  const sh = getSheet_("Colaboradores");
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(s => String(s).trim());
  const idxEquipo = h.indexOf("Equipo");
  if (idxEquipo < 0) return [];
  const vals = sh.getRange(2, idxEquipo + 1, lastRow - 1, 1).getValues();
  const equipos = [...new Set(vals.map(r => String(r[0] || "").trim()).filter(Boolean))].sort();
  return equipos;
}

function colaboradoresAdd_({ id_meli, nombre, rol, equipo, ubicacion, mail_prod, mail_ext, fecha_ingreso, slack_id, cuil }) {
  id_meli = String(id_meli || "").trim();
  nombre  = String(nombre  || "").trim();
  if (!id_meli) throw new Error("ID_MELI requerido");
  if (!nombre)  throw new Error("Nombre requerido");

  const sh = getSheet_("Colaboradores");
  const h  = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(s => String(s).trim());

  // Verificar que no exista ya el ID
  const lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    const idxId = h.indexOf("ID_MELI");
    if (idxId >= 0) {
      const ids = sh.getRange(2, idxId + 1, lastRow - 1, 1).getValues().map(r => String(r[0] || "").trim());
      if (ids.includes(id_meli)) throw new Error("Ya existe un colaborador con ese ID_MELI: " + id_meli);
    }
  }

  // Construir fila según headers del sheet
  const rowArr = new Array(h.length).fill("");
  const set_ = (key, val) => { const i = h.indexOf(key); if (i >= 0) rowArr[i] = val || ""; };
  set_("ID_MELI",       id_meli);
  set_("Nombre",        nombre);
  set_("Slack_ID",      slack_id || "");
  set_("Rol",           rol || "");
  set_("Equipo",        equipo || "");
  set_("Ubicación",     ubicacion || "");
  set_("Mail Productora", mail_prod || "");
  set_("Mail Externo",  mail_ext || "");
  set_("CUIL",          cuil || "");

  // Fecha ingreso
  let fechaVal = "";
  if (fecha_ingreso) {
    const m = String(fecha_ingreso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) fechaVal = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    else {
      const m2 = String(fecha_ingreso).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m2) fechaVal = new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
    }
  }
  const idxFecha = h.indexOf("Fecha Ingreso");
  if (idxFecha >= 0) rowArr[idxFecha] = fechaVal || "";

  // Insertar en fila 2 (más reciente arriba)
  sh.insertRowBefore(2);
  sh.getRange(2, 1, 1, h.length).setValues([rowArr]);
  if (idxFecha >= 0 && fechaVal) sh.getRange(2, idxFecha + 1).setNumberFormat("dd-mm-yyyy");

  // Invalidar cache
  CacheService.getScriptCache().remove("colaboradores.list.v2");

  // Agregar a Presentismo
  _colaboradoresAddToPresentismo_(id_meli, nombre, fechaVal || new Date());

  // Agregar a Habilitaciones con Flujo Mixto H=1, F=0 por defecto
  _colaboradoresAddToHabilitaciones_(id_meli);

  return { ok: true, id_meli };
}

function _colaboradoresAddToHabilitaciones_(idMeli) {
  try {
    const sh = getSheet_("Habilitaciones");
    const h  = headers_(sh);
    const idxId = idx_(h, "ID_MELI");
    if (idxId < 0) return; // hoja sin columna ID_MELI

    // Verificar si ya existe
    const lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      const ids = sh.getRange(2, idxId + 1, lastRow - 1, 1).getValues().map(r => String(r[0] || "").trim());
      if (ids.includes(String(idMeli).trim())) return; // ya existe
    }

    // Agregar fila nueva al final con ID_MELI
    const rowArr = new Array(h.length).fill("");
    rowArr[idxId] = idMeli;

    // Buscar columna de Flujo Mixto (H) y marcar H=TRUE, F=FALSE
    const idxFlujMixtoH = findHeaderIndex_(h, "Flujo Mixto");
    const idxFlujMixtoF = findFijoHeaderIndex_(h, "Flujo Mixto");
    if (idxFlujMixtoH >= 0) rowArr[idxFlujMixtoH] = true;
    if (idxFlujMixtoF >= 0) rowArr[idxFlujMixtoF] = false;

    sh.appendRow(rowArr);
    CacheService.getScriptCache().remove("habilitaciones.list.v2");
  } catch (e) {
    console.log("_colaboradoresAddToHabilitaciones_ error: " + e.message);
    // No fallar el flujo principal si Habilitaciones falla
  }
}

function _colaboradoresAddToPresentismo_(idMeli, nombre, fechaIngreso) {
  const pres = getSheet_("Presentismo");
  const lastRow = pres.getLastRow();
  const lastCol = pres.getLastColumn();
  const h = pres.getRange(1, 1, 1, lastCol).getValues()[0];

  const idxId     = idx_(h, "ID_MELI");
  const idxNombre = h.indexOf("Nombre");

  // Verificar si ya existe
  if (lastRow >= 2) {
    const ids = pres.getRange(2, idxId + 1, lastRow - 1, 1).getValues().map(r => String(r[0] || "").trim());
    if (ids.includes(String(idMeli).trim())) return; // ya existe
  }

  // Agregar fila al final de Presentismo
  const newRow = lastRow + 1;
  const rowArr = new Array(lastCol).fill("");
  if (idxId >= 0)     rowArr[idxId]     = idMeli;
  if (idxNombre >= 0) rowArr[idxNombre] = nombre;
  pres.getRange(newRow, 1, 1, lastCol).setValues([rowArr]);

  // Poblar P desde fecha de ingreso hasta hoy (solo días de lunes a viernes)
  const today = todayNoTime_();
  const desde = fechaIngreso instanceof Date ? fechaIngreso : today;
  const colByKey = {};
  for (let c = 0; c < h.length; c++) {
    const k = ymdFromHeaderCell_(h[c]);
    if (k) colByKey[k] = c + 1;
  }

  const cur = new Date(desde);
  while (cur.getTime() <= today.getTime()) {
    const dow = cur.getDay(); // 0=dom, 6=sab
    if (dow !== 0 && dow !== 6) {
      const key = fmt_(cur, "yyyy-MM-dd");
      let col = colByKey[key];
      if (!col) {
        col = pres.getLastColumn() + 1;
        pres.insertColumnAfter(pres.getLastColumn());
        pres.getRange(1, col).setValue(new Date(cur));
        pres.getRange(1, col).setNumberFormat("dd mmm");
        colByKey[key] = col;
      }
      // Solo escribir P si no hay ya un valor (no pisar licencias de PeopleForce)
      const existing = pres.getRange(newRow, col).getValue();
      if (!existing || String(existing).trim() === "") {
        pres.getRange(newRow, col).setValue("P");
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
}

function colaboradoresUpdate_({ id_meli, nombre, rol, equipo, ubicacion, mail_prod, mail_ext, fecha_ingreso, slack_id, cuil }) {
  id_meli = String(id_meli || "").trim();
  if (!id_meli) throw new Error("ID_MELI requerido");

  const sh = getSheet_("Colaboradores");
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error("No hay colaboradores");

  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(s => String(s).trim());
  const idxId = h.indexOf("ID_MELI");
  if (idxId < 0) throw new Error("Columna ID_MELI no encontrada");

  const ids = sh.getRange(2, idxId + 1, lastRow - 1, 1).getValues().map(r => String(r[0] || "").trim());
  const rowIdx = ids.indexOf(id_meli);
  if (rowIdx < 0) throw new Error("Colaborador no encontrado: " + id_meli);
  const row = rowIdx + 2;

  const set_ = (key, val) => {
    const i = h.indexOf(key);
    if (i >= 0 && val !== undefined) sh.getRange(row, i + 1).setValue(String(val || ""));
  };

  set_("Nombre",          nombre);
  set_("Slack_ID",        slack_id);
  set_("Rol",             rol);
  set_("Equipo",          equipo);
  set_("Ubicación",       ubicacion);
  set_("Mail Productora", mail_prod);
  set_("Mail Externo",    mail_ext);
  set_("CUIL",            cuil);

  if (fecha_ingreso !== undefined) {
    const idxF = h.indexOf("Fecha Ingreso");
    if (idxF >= 0) {
      const m = String(fecha_ingreso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        sh.getRange(row, idxF + 1).setValue(d);
        sh.getRange(row, idxF + 1).setNumberFormat("dd-mm-yyyy");
      }
    }
  }

  CacheService.getScriptCache().remove("colaboradores.list.v2");
  return { ok: true, row };
}

function colaboradoresDelete_({ ids }) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("ids requerido");
  ids = ids.map(id => String(id || "").trim()).filter(Boolean);

  const shCol  = getSheet_("Colaboradores");
  const shPres = getSheet_("Presentismo");

  // ── Eliminar de Colaboradores ──────────────────────────────
  const hCol = shCol.getRange(1, 1, 1, shCol.getLastColumn()).getValues()[0].map(s => String(s).trim());
  const idxColId = hCol.indexOf("ID_MELI");
  if (idxColId < 0) throw new Error("Columna ID_MELI no encontrada en Colaboradores");

  const colLastRow = shCol.getLastRow();
  const colIds = colLastRow >= 2
    ? shCol.getRange(2, idxColId + 1, colLastRow - 1, 1).getValues().map(r => String(r[0] || "").trim())
    : [];

  // Eliminar de abajo hacia arriba para no desplazar índices
  const colRows = ids.map(id => colIds.indexOf(id)).filter(i => i >= 0).map(i => i + 2).sort((a, b) => b - a);
  colRows.forEach(r => shCol.deleteRow(r));

  // ── Eliminar de Presentismo ────────────────────────────────
  const hPres = shPres.getRange(1, 1, 1, shPres.getLastColumn()).getValues()[0].map(s => String(s).trim());
  const idxPresId = idx_(hPres, "ID_MELI");
  if (idxPresId >= 0) {
    const presLastRow = shPres.getLastRow();
    if (presLastRow >= 2) {
      const presIds = shPres.getRange(2, idxPresId + 1, presLastRow - 1, 1).getValues().map(r => String(r[0] || "").trim());
      const presRows = ids.map(id => presIds.indexOf(id)).filter(i => i >= 0).map(i => i + 2).sort((a, b) => b - a);
      presRows.forEach(r => shPres.deleteRow(r));
    }
  }

  // ── Eliminar de Habilitaciones ────────────────────────────
  try {
    const shHab = getSheet_("Habilitaciones");
    const hHab = shHab.getRange(1, 1, 1, shHab.getLastColumn()).getValues()[0].map(s => String(s).trim());
    const idxHabId = idx_(hHab, "ID_MELI");
    if (idxHabId >= 0) {
      const habLastRow = shHab.getLastRow();
      if (habLastRow >= 2) {
        const habIds = shHab.getRange(2, idxHabId + 1, habLastRow - 1, 1).getValues().map(r => String(r[0] || "").trim());
        const habRows = ids.map(id => habIds.indexOf(id)).filter(i => i >= 0).map(i => i + 2).sort((a, b) => b - a);
        habRows.forEach(r => shHab.deleteRow(r));
      }
    }
    CacheService.getScriptCache().remove("habilitaciones.list.v2");
  } catch (e) {
    console.log("colaboradoresDelete_ Habilitaciones error: " + e.message);
  }

  CacheService.getScriptCache().remove("colaboradores.list.v2");
  return { ok: true, deleted: ids.length };
}


function round_(num, decimals) {
  decimals = Number(decimals || 0);
  if (num === null || num === undefined || num === "" || isNaN(num)) return null;
  var factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/* =========================
   Links Útiles
========================= */

function linksUtilesList_() {
  const ss = ss_();
  let sh = ss.getSheetByName("Links_Utiles");
  if (!sh) {
    sh = ss.insertSheet("Links_Utiles");
    sh.getRange(1, 1, 1, 4).setValues([["Titulo", "URL", "Categoria", "Orden"]]);
    sh.getRange(1, 1, 1, 4).setFontWeight("bold");
    return [];
  }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 4).getValues();
  return data
    .map((r, i) => ({
      titulo:    String(r[0] || "").trim(),
      url:       String(r[1] || "").trim(),
      categoria: String(r[2] || "").trim(),
      orden:     Number(r[3] || i),
      _row:      i + 2
    }))
    .filter(r => r.titulo && r.url)
    .sort((a, b) => a.orden - b.orden);
}

function linksUtilesAdd_({ titulo, url, categoria }) {
  titulo    = String(titulo    || "").trim();
  url       = String(url       || "").trim();
  categoria = String(categoria || "").trim();
  if (!titulo) throw new Error("Título requerido");
  if (!url)    throw new Error("URL requerida");

  const ss = ss_();
  let sh = ss.getSheetByName("Links_Utiles");
  if (!sh) {
    sh = ss.insertSheet("Links_Utiles");
    sh.getRange(1, 1, 1, 4).setValues([["Titulo", "URL", "Categoria", "Orden"]]);
    sh.getRange(1, 1, 1, 4).setFontWeight("bold");
  }
  const lastRow = sh.getLastRow();
  const orden = lastRow; // orden = posición al final
  sh.appendRow([titulo, url, categoria, orden]);
  var newRow = sh.getLastRow();
  return { ok: true, row: newRow };
}

function linksUtilesUpdate_({ row, titulo, url, categoria }) {
  if (!row) throw new Error("row requerido");
  const ss = ss_();
  const sh = ss.getSheetByName("Links_Utiles");
  if (!sh) throw new Error("Hoja Links_Utiles no encontrada");
  const r = Number(row);
  if (titulo    !== undefined) sh.getRange(r, 1).setValue(String(titulo    || ""));
  if (url       !== undefined) sh.getRange(r, 2).setValue(String(url       || ""));
  if (categoria !== undefined) sh.getRange(r, 3).setValue(String(categoria || ""));
  return { ok: true };
}

function linksUtilesDelete_({ row }) {
  if (!row) throw new Error("row requerido");
  const ss = ss_();
  const sh = ss.getSheetByName("Links_Utiles");
  if (!sh) throw new Error("Hoja Links_Utiles no encontrada");
  sh.deleteRow(Number(row));
  return { ok: true };
}

function linksUtilesReorder_({ items }) {
  // items = [{ row, orden }] — actualiza columna Orden para reflejar nuevo orden drag & drop
  if (!Array.isArray(items) || !items.length) return { ok: true };
  const ss = ss_();
  const sh = ss.getSheetByName("Links_Utiles");
  if (!sh) throw new Error("Hoja Links_Utiles no encontrada");
  items.forEach(({ row, orden }) => {
    sh.getRange(Number(row), 4).setValue(Number(orden));
  });
  return { ok: true };
}

/* =========================
   Asignación Semanal
========================= */

function asignacionSemanalList_() {
  const ss = ss_();
  let sh = ss.getSheetByName("Asignacion_Semanal");
  if (!sh) {
    sh = ss.insertSheet("Asignacion_Semanal");
    sh.getRange(1, 1, 1, 6).setValues([["Tarea", "Descripcion", "Owner_S1", "Owner_S2", "Owner_S3", "Backup"]]);
    sh.getRange(1, 1, 1, 6).setFontWeight("bold");
    return [];
  }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 6).getValues();
  return data
    .filter(r => String(r[0] || "").trim())
    .map((r, i) => ({
      tarea:       String(r[0] || "").trim(),
      descripcion: String(r[1] || "").trim(),
      owner_s1:    String(r[2] || "").trim(),
      owner_s2:    String(r[3] || "").trim(),
      owner_s3:    String(r[4] || "").trim(),
      backup:      String(r[5] || "").trim(),
      _row:        i + 2
    }));
}

function asignacionSemanalUpsert_({ tarea, descripcion, owner_s1, owner_s2, owner_s3, backup, row }) {
  tarea = String(tarea || "").trim();
  if (!tarea) throw new Error("Tarea requerida");
  const ss = ss_();
  let sh = ss.getSheetByName("Asignacion_Semanal");
  if (!sh) {
    sh = ss.insertSheet("Asignacion_Semanal");
    sh.getRange(1, 1, 1, 6).setValues([["Tarea", "Descripcion", "Owner_S1", "Owner_S2", "Owner_S3", "Backup"]]);
    sh.getRange(1, 1, 1, 6).setFontWeight("bold");
  }
  const vals = [
    tarea,
    String(descripcion || "").trim(),
    String(owner_s1    || "").trim(),
    String(owner_s2    || "").trim(),
    String(owner_s3    || "").trim(),
    String(backup      || "").trim()
  ];
  if (row) {
    sh.getRange(Number(row), 1, 1, 6).setValues([vals]);
  } else {
    sh.appendRow(vals);
  }
  return { ok: true };
}

function asignacionSemanalDelete_({ row }) {
  if (!row) throw new Error("row requerido");
  const ss = ss_();
  const sh = ss.getSheetByName("Asignacion_Semanal");
  if (!sh) throw new Error("Hoja Asignacion_Semanal no encontrada");
  sh.deleteRow(Number(row));
  return { ok: true };
}

/* =========================
   Gestión de Canales
========================= */

function gestionCanalesList_() {
  const ss = ss_();
  let sh = ss.getSheetByName("Gestion_Canales");
  if (!sh) {
    sh = ss.insertSheet("Gestion_Canales");
    sh.getRange(1, 1, 1, 6).setValues([["Canal", "Foco", "Owner_S1", "Owner_S2", "Owner_S3", "Grupo"]]);
    sh.getRange(1, 1, 1, 6).setFontWeight("bold");
    return [];
  }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 6).getValues();
  return data
    .filter(r => String(r[0] || "").trim())
    .map((r, i) => ({
      canal:    String(r[0] || "").trim(),
      foco:     String(r[1] || "").trim(),
      owner_s1: String(r[2] || "").trim(),
      owner_s2: String(r[3] || "").trim(),
      owner_s3: String(r[4] || "").trim(),
      grupo:    String(r[5] || "").trim(),
      _row:     i + 2
    }));
}

function gestionCanalesUpsert_({ canal, foco, owner_s1, owner_s2, owner_s3, grupo, row }) {
  canal = String(canal || "").trim();
  if (!canal) throw new Error("Canal requerido");
  const ss = ss_();
  let sh = ss.getSheetByName("Gestion_Canales");
  if (!sh) {
    sh = ss.insertSheet("Gestion_Canales");
    sh.getRange(1, 1, 1, 6).setValues([["Canal", "Foco", "Owner_S1", "Owner_S2", "Owner_S3", "Grupo"]]);
    sh.getRange(1, 1, 1, 6).setFontWeight("bold");
  }
  const vals = [
    canal,
    String(foco     || "").trim(),
    String(owner_s1 || "").trim(),
    String(owner_s2 || "").trim(),
    String(owner_s3 || "").trim(),
    String(grupo    || "").trim()
  ];
  if (row) {
    sh.getRange(Number(row), 1, 1, 6).setValues([vals]);
  } else {
    sh.appendRow(vals);
  }
  return { ok: true };
}

function gestionCanalesDelete_({ row }) {
  if (!row) throw new Error("row requerido");
  const ss = ss_();
  const sh = ss.getSheetByName("Gestion_Canales");
  if (!sh) throw new Error("Hoja Gestion_Canales no encontrada");
  sh.deleteRow(Number(row));
  return { ok: true };
}

/* =========================
   Links Útiles — Categorías
========================= */

function linksCategoriasList_() {
  const ss = ss_();
  let sh = ss.getSheetByName("Links_Categorias");
  if (!sh) {
    sh = ss.insertSheet("Links_Categorias");
    sh.getRange(1, 1, 1, 2).setValues([["Categoria", "Color"]]);
    sh.getRange(1, 1, 1, 2).setFontWeight("bold");
    return [];
  }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  return data
    .filter(r => String(r[0] || "").trim())
    .map(r => ({
      categoria: String(r[0] || "").trim(),
      color:     String(r[1] || "").trim()
    }));
}

function linksCategoriasUpsert_({ categoria, color }) {
  categoria = String(categoria || "").trim();
  color     = String(color     || "").trim();
  if (!categoria) throw new Error("Categoria requerida");

  const ss = ss_();
  let sh = ss.getSheetByName("Links_Categorias");
  if (!sh) {
    sh = ss.insertSheet("Links_Categorias");
    sh.getRange(1, 1, 1, 2).setValues([["Categoria", "Color"]]);
    sh.getRange(1, 1, 1, 2).setFontWeight("bold");
  }

  const lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    const cats = sh.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0] || "").trim());
    const idx = cats.indexOf(categoria);
    if (idx >= 0) {
      sh.getRange(idx + 2, 2).setValue(color);
      return { ok: true, action: "updated" };
    }
  }
  sh.appendRow([categoria, color]);
  return { ok: true, action: "inserted" };
}
/* =========================
   TEMPLATES (Comunicaciones_Templates)
========================= */
function templatesList_() {
  var sh = getSheet_("Comunicaciones_Templates");
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var data = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  return data
    .filter(function(r) { return String(r[0] || "").trim(); })
    .map(function(r) { return { key: String(r[0] || "").trim(), template: String(r[1] || "") }; });
}

function templatesSave_(body) {
  var items = Array.isArray(body.templates) ? body.templates : [];
  if (!items.length) throw new Error("templates: array vacio");
  for (var i = 0; i < items.length; i++) {
    if (!String(items[i].key || "").trim()) throw new Error("Cada template debe tener una key");
  }
  var sh = getSheet_("Comunicaciones_Templates");
  var lastRow = sh.getLastRow();
  if (lastRow >= 2) sh.deleteRows(2, lastRow - 1);
  var rows = items.map(function(t) { return [String(t.key).trim(), String(t.template || "")]; });
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  return { saved: rows.length };
}

/* =========================
   TEMPLATE INTERPOLATION
========================= */
function applyTemplate_(key, vars) {
  // Busca el template por key en Comunicaciones_Templates y reemplaza variables
  var templates = templatesList_();
  var tpl = null;
  for (var i = 0; i < templates.length; i++) {
    if (templates[i].key === key) { tpl = templates[i].template; break; }
  }
  if (tpl === null) {
    // Fallback: si no existe el template, devolver null para que el caller use el mensaje hardcodeado
    return null;
  }
  var result = tpl;
  var keys = Object.keys(vars);
  for (var j = 0; j < keys.length; j++) {
    var k = keys[j];
    result = result.split('{{' + k + '}}').join(String(vars[k] || ''));
  }
  return result;
}

/* =========================
   GENERAR MENSAJE POR FLUJO (desde botón "Generar mensaje" en card)
   Construye el mensaje en GAS para garantizar Slack_IDs correctos
========================= */
function slackOutboxGenerarPorFlujo_(body) {
  var flujo = String(body.flujo || "").trim();
  if (!flujo) throw new Error("slackOutboxGenerarPorFlujo_: falta flujo");

  var shPlan = getSheet_("Planificacion_Diaria");
  var plan = values_(shPlan);
  if (plan.length < 2) throw new Error("No hay planificacion.");

  var h = plan[0];
  var idxFlujo = idx_(h, "Flujo");
  var idxId    = idx_(h, "ID_MELI");
  var idxFecha = idx_(h, "Fecha");

  var colabs = colaboradoresList_();
  var colById = {};
  colabs.forEach(function(c) {
    var id = String(c["ID_MELI"] || "").trim();
    if (id) colById[id] = c;
  });

  // Lookup flexible: busca por ID exacto, si no encuentra hace scan lineal
  function findColab_(searchId) {
    if (colById[searchId]) return colById[searchId];
    for (var k = 0; k < colabs.length; k++) {
      if (String(colabs[k]["ID_MELI"] || "").trim().toLowerCase() === searchId.toLowerCase()) return colabs[k];
    }
    return null;
  }

  var idxNombrePlan = h.indexOf("Nombre");
  var ids = [];
  var nombrePorId = {};
  for (var i = 1; i < plan.length; i++) {
    var r = plan[i];
    var f = String(r[idxFlujo] || "").trim();
    if (f !== flujo) continue;
    var id = String(r[idxId] || "").trim();
    if (!id || id === "SIN PERFILES DISPONIBLES") continue;
    ids.push(id);
    if (idxNombrePlan >= 0) nombrePorId[id] = String(r[idxNombrePlan] || "");
  }

  if (!ids.length) return { ok: false, error: "Sin perfiles asignados para " + flujo };

  var mentions = ids.map(function(id) {
    var colab = findColab_(id);
    var slackId = colab ? String(colab["Slack_ID"] || "").replace(/[\u200b\u00a0\ufeff]/g, "").trim() : "";
    if (!slackId) Logger.log("SIN SLACK_ID: id=" + id + " colab=" + JSON.stringify(colab));
    return slackId ? "<@" + slackId + ">" : (nombrePorId[id] || id);
  }).join(" - ");

  var tpl = applyTemplate_("OUTBOX_POR_FLUJO", { flujo: flujo, mentions: mentions });
  var msg = tpl !== null ? tpl : ("*" + flujo + "*\n" + mentions);

  var firstDate = plan[1][idxFecha];
  var fecha = firstDate instanceof Date ? firstDate : todayNoTime_();

  // Resolver canal del flujo
  var flujosCfg = flujosList_();
  var cfg = null;
  for (var j = 0; j < flujosCfg.length; j++) {
    if (String(flujosCfg[j].flujo || "").trim() === flujo) { cfg = flujosCfg[j]; break; }
  }
  var chId   = cfg ? String(cfg.channel_id || "").trim() : "";
  var estado = chId ? "BORRADOR" : "SIN CANAL CONFIGURADO";

  var shOut = getSheet_("Slack_Outbox");
  ensureSlackOutboxHeader_(shOut);
  appendSlackOutboxRow_(shOut, fecha, "POR_FLUJO", flujo, chId, msg, estado, "");

  cacheRemove_("slack.outbox.list.v2");

  return { ok: true, flujo: flujo, mentions: mentions.length };
}

/* =========================
   DEBUG PRESENTISMO — ejecutar manualmente en Apps Script
   Logs qué columnas encuentra y qué valores lee
========================= */
function debugPresentismo2() {
  const sh = getSheet_("Presentismo");
  // Ver headers alrededor del idx 141
  var headers = sh.getRange(1, 139, 1, 8).getValues()[0];
  Logger.log("Headers cols 139-146 (Sheets):");
  for (var i = 0; i < headers.length; i++) {
    var cell = headers[i];
    var parsed = ymdFromHeaderCell_(cell);
    Logger.log("  Sheets col " + (139+i) + " = " + JSON.stringify(String(cell)) + " -> " + parsed);
  }
  // Ver datos fila 2 cols 139-146
  var data = sh.getRange(2, 139, 1, 8).getValues()[0];
  Logger.log("Data fila 2 cols 139-146: " + JSON.stringify(data));
}

function debugPresentismo() {
  const sh = getSheet_("Presentismo");
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  Logger.log("lastRow=" + lastRow + " lastCol=" + lastCol);

  // Buscar columna del 06/04/2026 leyendo header completo
  const hRaw = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  const target = "2026-04-06";
  var foundIdx = -1;
  hRaw.forEach(function(cell, i) {
    var k = ymdFromHeaderCell_(cell);
    if (k === target) foundIdx = i;
  });
  Logger.log("Columna de " + target + ": idx=" + foundIdx + " (col Sheets=" + (foundIdx+1) + ")");

  if (foundIdx >= 0) {
    // Leer con getRange directo
    var direct = sh.getRange(2, foundIdx + 1, 5, 1).getValues();
    Logger.log("getRange directo fila 2-6, col " + (foundIdx+1) + ": " + JSON.stringify(direct));

    // Leer via getDataRange para comparar
    var cellA2 = sh.getRange(2, foundIdx + 1).getValue();
    Logger.log("getValue() fila 2 col " + (foundIdx+1) + ": " + JSON.stringify(cellA2));

    // Ver nota de la celda por si tiene formato especial
    var cellA2display = sh.getRange(2, foundIdx + 1).getDisplayValue();
    Logger.log("getDisplayValue() fila 2 col " + (foundIdx+1) + ": " + JSON.stringify(cellA2display));

    // Leer un bloque más ancho alrededor de la columna para ver si hay offset
    var around = sh.getRange(2, foundIdx, 3, 3).getValues();
    Logger.log("Bloque 3x3 alrededor (cols " + foundIdx + "-" + (foundIdx+2) + "): " + JSON.stringify(around));

    // Ver ID_MELI de las primeras filas
    var ids = sh.getRange(2, 1, 5, 1).getValues();
    Logger.log("ID_MELI filas 2-6: " + JSON.stringify(ids));
  }
}
