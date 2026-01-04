/***********************
 * CONFIG GENERAL
 ***********************/
const CODIGOS_PRESENTES = ['P']; // qué códigos cuentan como "presente"
const CODIGOS_ERROR_TEXTO = ['NOT OK']; // para calidad (si lo seguís usando)

// Script Properties esperadas:
// SLACK_BOT_TOKEN (obligatoria para enviar)
// SLACK_DEFAULT_CHANNEL_ID (opcional fallback)
// ROTATION_WINDOW_DAYS (opcional, default 0; ej 7 para rotación semanal)

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📌 Catálogo - Backend')
    .addItem('1) Presentismo: agregar columna de hoy', 'agregarColumnaHoyEnPresentismo')
    .addItem('2) Presentismo: completar P por defecto (hoy)', 'completarPresentesPorDefecto')
    .addSeparator()
    .addItem('3) Generar planificación de hoy', 'generarPlanificacionHoy')
    .addItem('4) Generar Slack Outbox (General + por flujo)', 'generarSlackOutbox')
    .addItem('5) Enviar mensajes pendientes de Slack_Outbox', 'enviarPendientesSlackOutbox')
    .addSeparator()
    .addItem('Presentismo - Abrir panel de ausencias', 'abrirPanelAusencias')
    .addToUi();
}

/***********************
 * HELPERS FECHA (TZ SAFE)
 ***********************/
function getSpreadsheetTz_() {
  return SpreadsheetApp.getActive().getSpreadsheetTimeZone() ||
    Session.getScriptTimeZone() ||
    'America/Argentina/Buenos_Aires';
}

function dateKey_(d) {
  if (!d) return '';
  const tz = getSpreadsheetTz_();
  let dd = d;
  if (Object.prototype.toString.call(dd) !== '[object Date]') dd = new Date(dd);
  if (isNaN(dd)) return '';
  return Utilities.formatDate(dd, tz, 'yyyy-MM-dd');
}

function todayKey_() {
  const tz = getSpreadsheetTz_();
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function todayDateNoTime_() {
  // Date a medianoche local del spreadsheet
  const tz = getSpreadsheetTz_();
  const key = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'); // ej 2026-01-03
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/***********************
 * HELPERS PRESENTISMO (fechas input + comparación)
 ***********************/
function parseDateInput_(fechaStr) {
  if (!fechaStr) return null;

  // soporta "dd/mm/yyyy" y "yyyy-mm-dd"
  const s = fechaStr.toString().trim();

  // yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    return isNaN(dt) ? null : dt;
  }

  // dd/mm/yyyy
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    return isNaN(dt) ? null : dt;
  }

  // fallback
  const dt = new Date(s);
  return isNaN(dt) ? null : dt;
}

function mismaFecha_(a, b) {
  // compara por yyyy-mm-dd en TZ del spreadsheet
  return dateKey_(a) !== '' && dateKey_(a) === dateKey_(b);
}

/***********************
 * PRESENTISMO: agregar columna de hoy (TZ SAFE)
 ***********************/
function agregarColumnaHoyEnPresentismo() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Presentismo');
  if (!sh) throw new Error('No existe la hoja "Presentismo".');

  const tz = getSpreadsheetTz_();
  const hoyKey = todayKey_();
  const hoyDate = todayDateNoTime_();

  const lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const headerKeys = headers.map(h => dateKey_(h));

  ss.toast(`TZ: ${tz} | hoyKey: ${hoyKey}`, 'DEBUG', 4);

  if (headerKeys.includes(hoyKey)) {
    ss.toast('Presentismo: la columna de hoy ya existe.', 'OK', 3);
    return;
  }

  let lastDateCol = -1; // 1-based
  for (let c = headerKeys.length - 1; c >= 0; c--) {
    if (headerKeys[c]) {
      lastDateCol = c + 1;
      break;
    }
  }

  if (lastDateCol === -1) {
    let lastNonEmptyHeaderCol = 1;
    for (let c = headers.length - 1; c >= 0; c--) {
      const v = headers[c];
      if (v !== '' && v !== null && v !== undefined) {
        lastNonEmptyHeaderCol = c + 1;
        break;
      }
    }
    lastDateCol = lastNonEmptyHeaderCol;
  }

  const insertAfter = lastDateCol;
  const newCol = insertAfter + 1;

  sh.insertColumnAfter(insertAfter);
  sh.getRange(1, newCol).setValue(hoyDate);
  sh.getRange(1, newCol).setNumberFormat('dd mmm');

  if (lastRow >= 2) {
    const source = sh.getRange(2, insertAfter, lastRow - 1, 1);
    const target = sh.getRange(2, newCol, lastRow - 1, 1);

    target.setDataValidations(source.getDataValidations());
    source.copyTo(target, { formatOnly: true });
  }

  ss.toast('Presentismo: columna de HOY agregada correctamente.', 'OK', 3);
}

/***********************
 * PRESENTISMO: completar P por defecto (TZ SAFE)
 ***********************/
function completarPresentesPorDefecto() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Presentismo');
  if (!sh) throw new Error('No existe la hoja "Presentismo".');

  const hoyKey = todayKey_();

  const lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const headerKeys = headers.map(h => dateKey_(h));

  let colHoy = -1; // 1-based
  for (let c = 0; c < headerKeys.length; c++) {
    if (headerKeys[c] === hoyKey) {
      colHoy = c + 1;
      break;
    }
  }

  if (colHoy === -1) {
    agregarColumnaHoyEnPresentismo();
    const headers2 = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const headerKeys2 = headers2.map(h => dateKey_(h));
    for (let c = 0; c < headerKeys2.length; c++) {
      if (headerKeys2[c] === hoyKey) {
        colHoy = c + 1;
        break;
      }
    }
    if (colHoy === -1) throw new Error('No pude ubicar la columna de hoy en Presentismo.');
  }

  const rango = sh.getRange(2, colHoy, lastRow - 1, 1);
  const vals = rango.getValues();

  let cambios = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = (vals[i][0] || '').toString().trim();
    if (v === '') {
      vals[i][0] = 'P';
      cambios++;
    }
  }
  rango.setValues(vals);

  ss.toast(`Presentismo: completé ${cambios} celdas con "P".`, 'OK', 3);
}

/***********************
 * SIDEBAR AUSENCIAS
 ***********************/
function abrirPanelAusencias() {
  const html = HtmlService.createHtmlOutputFromFile('PanelAusencias')
    .setTitle('Registrar ausencia / vacaciones');
  SpreadsheetApp.getUi().showSidebar(html);
}

function obtenerColaboradoresParaPanel() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Presentismo');
  if (!sh) throw new Error('No existe la hoja Presentismo');

  const data = sh.getDataRange().getValues();
  const res = [];

  const idxIdMeli = 0;
  const idxNombre = 1;

  for (let i = 1; i < data.length; i++) {
    const idMeli = data[i][idxIdMeli];
    const nombre = data[i][idxNombre];
    if (!idMeli) continue;
    res.push({ idMeli, nombre: nombre || '' });
  }
  return res;
}

function registrarAusenciaEnPresentismo(idMeli, fechaStrDesde, fechaStrHasta, tipo) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Presentismo');
  if (!sh) throw new Error('No existe la hoja Presentismo');

  agregarColumnaHoyEnPresentismo();

  const data = sh.getDataRange().getValues();
  const headers = data[0];

  const idxIdMeli = 0;
  let fila = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idxIdMeli] === idMeli) {
      fila = i + 1;
      break;
    }
  }
  if (fila === -1) throw new Error('No encontré al colaborador con ID_MELI: ' + idMeli);

  const fechaDesde = parseDateInput_(fechaStrDesde);
  if (!fechaDesde) throw new Error('Fecha desde inválida: ' + fechaStrDesde);

  let fechaHasta = fechaStrHasta ? parseDateInput_(fechaStrHasta) : null;
  if (fechaStrHasta && !fechaHasta) throw new Error('Fecha hasta inválida: ' + fechaStrHasta);
  if (!fechaHasta) fechaHasta = new Date(fechaDesde);

  if (fechaDesde.getTime() > fechaHasta.getTime()) {
    throw new Error('La fecha hasta no puede ser anterior a la fecha desde.');
  }

  let d = new Date(fechaDesde);
  while (d.getTime() <= fechaHasta.getTime()) {
    marcarAusenciaDia_(sh, headers, fila, new Date(d), tipo);
    d.setDate(d.getDate() + 1);
  }
  return 'Registro guardado correctamente.';
}

function marcarAusenciaDia_(sh, headers, fila, fecha, tipo) {
  let col = -1;

  for (let c = 0; c < headers.length; c++) {
    if (mismaFecha_(headers[c], fecha)) {
      col = c + 1;
      break;
    }
  }

  if (col === -1) {
    const lastCol = sh.getLastColumn();
    const lastRow = sh.getLastRow();
    col = lastCol + 1;

    sh.getRange(1, col).setValue(fecha);
    sh.getRange(1, col).setNumberFormat('dd mmm');

    if (lastCol >= 2 && lastRow >= 2) {
      const source = sh.getRange(2, lastCol, lastRow - 1, 1);
      const target = sh.getRange(2, col, lastRow - 1, 1);

      target.setDataValidations(source.getDataValidations());
      source.copyTo(target, { formatOnly: true });
    }
  }

  sh.getRange(fila, col).setValue(tipo);
}

/***********************
 * LECTURAS: COLABORADORES / CANALES / HABILITACIONES / FLUJOS
 ***********************/
function leerColaboradores_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Colaboradores');
  if (!sh) throw new Error('No existe la hoja "Colaboradores".');

  const data = sh.getDataRange().getValues();
  const h = data[0];

  const idxId = h.indexOf('ID_MELI');
  const idxSlack = h.indexOf('Slack_ID');
  const idxNombre = h.indexOf('Nombre');

  if (idxId === -1) throw new Error('En "Colaboradores" falta columna ID_MELI');
  if (idxSlack === -1) throw new Error('En "Colaboradores" falta columna Slack_ID');

  const map = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const id = r[idxId];
    if (!id) continue;
    map[id] = {
      idMeli: id,
      slackId: r[idxSlack] || '',
      nombre: idxNombre >= 0 ? (r[idxNombre] || '') : ''
    };
  }
  return map;
}

function leerMapaCanales_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Canales');
  if (!sh) throw new Error('No existe la hoja "Canales".');

  const data = sh.getDataRange().getValues();
  const h = data[0];

  const idxName = h.indexOf('Canal (nombre)');
  const idxId = h.indexOf('Channel_ID');

  if (idxName === -1 || idxId === -1) {
    throw new Error('En "Canales" deben existir: "Canal (nombre)" y "Channel_ID".');
  }

  const map = {};
  for (let i = 1; i < data.length; i++) {
    const name = (data[i][idxName] || '').toString().trim();
    const cid = (data[i][idxId] || '').toString().trim();
    if (!name) continue;
    map[name] = cid;
  }
  return map;
}

function leerFlujos_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Config_Flujos');
  if (!sh) throw new Error('No existe la hoja "Config_Flujos".');

  const data = sh.getDataRange().getValues();
  const h = data[0];

  const idxFlujo = h.indexOf('Flujo');
  const idxCant = h.indexOf('Perfiles_requeridos');
  const idxNotas = h.indexOf('Notas_default');
  const idxSlackChannel = h.indexOf('Slack_Channel');

  if (idxFlujo === -1) throw new Error('En "Config_Flujos" falta columna Flujo');
  if (idxCant === -1) throw new Error('En "Config_Flujos" falta columna Perfiles_requeridos');
  if (idxSlackChannel === -1) throw new Error('En "Config_Flujos" falta columna Slack_Channel');

  const flujos = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const nombre = r[idxFlujo];
    if (!nombre) continue;
    flujos.push({
      flujo: nombre,
      cantidad: Number(r[idxCant] || 0),
      notas: idxNotas >= 0 ? (r[idxNotas] || '') : '',
      slackChannelName: (r[idxSlackChannel] || '').toString().trim()
    });
  }
  return flujos;
}

function leerHabilitaciones_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Habilitaciones');
  if (!sh) throw new Error('No existe la hoja "Habilitaciones".');

  const data = sh.getDataRange().getValues();
  const headers = data[0];

  const idxId = headers.indexOf('ID_MELI');
  if (idxId === -1) throw new Error('En "Habilitaciones" falta columna ID_MELI.');

  const flujos = leerFlujos_().map(f => f.flujo);

  const map = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const id = row[idxId];
    if (!id) continue;

    map[id] = map[id] || {};

    flujos.forEach(flujoNombre => {
      const idxFlujoCol = findHeaderIndex(headers, flujoNombre);
      const idxFijoCol = findFijoHeaderIndex(headers, flujoNombre);

      const habilitado = idxFlujoCol >= 0 ? Boolean(row[idxFlujoCol]) : false;
      const fijo = idxFijoCol >= 0 ? Boolean(row[idxFijoCol]) : false;

      map[id][flujoNombre] = { habilitado, fijo };
    });
  }
  return map;
}

/***********************
 * DISPONIBILIDAD (PRESENTISMO)
 ***********************/
function construirMapaDisponibilidadPorIdMeli_(fecha) {
  const ss = SpreadsheetApp.getActive();
  const shPres = ss.getSheetByName('Presentismo');
  if (!shPres) throw new Error('No existe la hoja "Presentismo".');

  const data = shPres.getDataRange().getValues();
  const headers = data[0];

  const idxIdMeli = headers.indexOf('ID_MELI');
  if (idxIdMeli === -1) throw new Error('En "Presentismo" debe existir la columna ID_MELI.');

  let colFecha = -1;
  for (let c = 0; c < headers.length; c++) {
    if (mismaFecha_(headers[c], fecha)) {
      colFecha = c;
      break;
    }
  }

  if (colFecha === -1) {
    agregarColumnaHoyEnPresentismo();
    completarPresentesPorDefecto();

    const headers2 = shPres.getRange(1, 1, 1, shPres.getLastColumn()).getValues()[0];
    for (let c = 0; c < headers2.length; c++) {
      if (mismaFecha_(headers2[c], fecha)) {
        colFecha = c;
        break;
      }
    }
    if (colFecha === -1) throw new Error('No pude crear/encontrar la columna de fecha en Presentismo.');
    return construirMapaDisponibilidadPorIdMeli_(fecha);
  }

  const mapa = {};
  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const idMeli = fila[idxIdMeli];
    if (!idMeli) continue;
    mapa[idMeli] = fila[colFecha];
  }
  return mapa;
}

/***********************
 * ROTACIÓN (ANTI-REPETICIÓN) - opcional
 ***********************/
function getRotationWindowDays_() {
  const v = PropertiesService.getScriptProperties().getProperty('ROTATION_WINDOW_DAYS');
  const n = Number(v || 0);
  return isNaN(n) ? 0 : n;
}

function filtrarPorRotacion_(candidatosIds, flujo, fecha, windowDays) {
  if (!windowDays || windowDays <= 0) return candidatosIds;

  const ss = SpreadsheetApp.getActive();
  const shHist = ss.getSheetByName('Historial_Planning');
  if (!shHist) return candidatosIds;

  const data = shHist.getDataRange().getValues();
  if (data.length < 2) return candidatosIds;

  const h = data[0];
  const idxFecha = h.indexOf('Fecha');
  const idxFlujo = h.indexOf('Flujo');
  const idxId = h.indexOf('ID_MELI');

  if (idxFecha === -1 || idxFlujo === -1 || idxId === -1) return candidatosIds;

  const minDate = new Date(fecha);
  minDate.setDate(minDate.getDate() - windowDays);

  const usados = new Set();
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const f = r[idxFecha];
    const fl = r[idxFlujo];
    const id = r[idxId];
    if (!f || !fl || !id) continue;

    const fd = (Object.prototype.toString.call(f) === '[object Date]') ? f : new Date(f);
    if (isNaN(fd)) continue;

    if (norm(fl) === norm(flujo) && fd.getTime() >= minDate.getTime() && fd.getTime() <= fecha.getTime()) {
      usados.add(id);
    }
  }

  const filtrados = candidatosIds.filter(id => !usados.has(id));
  return filtrados.length > 0 ? filtrados : candidatosIds;
}

/***********************
 * 1) GENERAR PLANIFICACIÓN (normalizada)
 ***********************/
function generarPlanificacionHoy() {
  const ss = SpreadsheetApp.getActive();

  const shPlan = ss.getSheetByName('Planificacion_Diaria');
  const shHist = ss.getSheetByName('Historial_Planning');

  if (!shPlan || !shHist) {
    SpreadsheetApp.getUi().alert('Revisá que existan las hojas: Planificacion_Diaria, Historial_Planning');
    return;
  }

  agregarColumnaHoyEnPresentismo();
  completarPresentesPorDefecto();

  // FIX: era todayNoTime_() y no existía
  const hoy = todayDateNoTime_();

  const mapaDisp = construirMapaDisponibilidadPorIdMeli_(hoy);
  const colaboradores = leerColaboradores_();
  const flujos = leerFlujos_();
  const habil = leerHabilitaciones_();

  const disponibles = Object.keys(colaboradores).filter(id => {
    const estado = (mapaDisp[id] || '').toString().trim();
    return CODIGOS_PRESENTES.includes(estado);
  });

  const rotationDays = getRotationWindowDays_();

  shPlan.clearContents();
  shPlan.getRange(1, 1, 1, 6).setValues([[
    'Fecha', 'Flujo', 'ID_MELI', 'Es_Fijo', 'Comentario', 'Canal_destino'
  ]]);

  const outPlan = [];
  const outHist = [];

  flujos.forEach(f => {
    const flujo = f.flujo;
    const cant = Number(f.cantidad || 0);
    if (!cant || cant <= 0) return;

    let candidatos = disponibles.filter(id => habil[id] && habil[id][flujo] && habil[id][flujo].habilitado);

    candidatos = filtrarPorRotacion_(candidatos, flujo, hoy, rotationDays);

    if (candidatos.length === 0) {
      outPlan.push([hoy, flujo, 'SIN PERFILES DISPONIBLES', '', f.notas || '', f.slackChannelName || '']);
      return;
    }

    const fijos = candidatos.filter(id => habil[id] && habil[id][flujo] && habil[id][flujo].fijo);
    const noFijos = candidatos.filter(id => !fijos.includes(id));

    const seleccion = [];
    fijos.forEach(id => { if (seleccion.length < cant) seleccion.push({ id, fijo: true }); });
    noFijos.forEach(id => { if (seleccion.length < cant) seleccion.push({ id, fijo: false }); });

    seleccion.forEach(sel => {
      outPlan.push([hoy, flujo, sel.id, sel.fijo ? 'SI' : 'NO', f.notas || '', f.slackChannelName || '']);
      outHist.push([hoy, flujo, sel.id, sel.fijo ? 'SI' : 'NO', '', f.slackChannelName || '']);
    });
  });

  if (outPlan.length > 0) {
    shPlan.getRange(2, 1, outPlan.length, 6).setValues(outPlan);
    shPlan.getRange(1, 1, shPlan.getLastRow(), 1).setNumberFormat('dd/mm/yyyy');
  }

  appendHistorial_(outHist);

  SpreadsheetApp.getUi().alert('Planificación generada para hoy (fecha TZ-safe).');
}

function appendHistorial_(rows) {
  if (!rows || rows.length === 0) return;

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Historial_Planning');
  if (!sh) return;

  const lastRow = sh.getLastRow();
  if (lastRow === 0) {
    sh.getRange(1, 1, 1, 5).setValues([['Fecha', 'Flujo', 'ID_MELI', 'Es_Fijo', 'Comentario']]);
  }

  const start = sh.getLastRow() + 1;
  const cols = sh.getLastColumn();
  const toWrite = rows.map(r => {
    if (cols >= 6) return [r[0], r[1], r[2], r[3], r[4], r[5]];
    return [r[0], r[1], r[2], r[3], r[4]];
  });

  sh.getRange(start, 1, toWrite.length, Math.min(cols, 6)).setValues(toWrite);
  sh.getRange(1, 1, sh.getLastRow(), 1).setNumberFormat('dd/mm/yyyy');
}

/***********************
 * 2) SLACK OUTBOX (GENERAL + POR_FLUJO) - Opción B
 ***********************/
function generarSlackOutbox() {
  const ss = SpreadsheetApp.getActive();
  const shPlan = ss.getSheetByName('Planificacion_Diaria');
  const shOut = ss.getSheetByName('Slack_Outbox');

  if (!shPlan || !shOut) {
    SpreadsheetApp.getUi().alert('Revisá que existan las hojas: Planificacion_Diaria, Slack_Outbox');
    return;
  }

  const colabs = leerColaboradores_();
  const canales = leerMapaCanales_();
  const flujos = leerFlujos_();

  const plan = shPlan.getDataRange().getValues();
  if (plan.length < 2) {
    SpreadsheetApp.getUi().alert('No hay planificación para armar mensajes. Corré "Generar planificación de hoy".');
    return;
  }

  const rows = plan.slice(1).filter(r => r[1]);
  const fecha = rows[0] ? rows[0][0] : todayDateNoTime_();

  const porFlujo = {};
  rows.forEach(r => {
    const flujo = r[1];
    const id = r[2];
    if (!porFlujo[flujo]) porFlujo[flujo] = [];
    if (id && id !== 'SIN PERFILES DISPONIBLES') porFlujo[flujo].push(id);
  });

  const header = 'Muy buenos días equipo! :sunny: Les comparto cómo quedamos organizados para hoy:';
  const lineas = [];

  Object.keys(porFlujo).forEach(flujo => {
    const ids = porFlujo[flujo] || [];
    if (ids.length === 0) return;

    const mentions = ids.map(id => {
      const slackId = (colabs[id] && colabs[id].slackId) ? colabs[id].slackId : '';
      return slackId ? `<@${slackId}>` : id;
    }).join(' - ');

    lineas.push(`*${flujo}*: ${mentions}`);
  });

  const msgGeneral = `${header}\n${lineas.join('\n')}\n\nQue tengan una excelente jornada :pepe_love:`;

  ensureSlackOutboxHeader_();

  appendSlackOutboxRow_(fecha, 'GENERAL', 'General', '', msgGeneral, 'PENDIENTE - SIN CANAL');

  flujos.forEach(f => {
    const flujo = f.flujo;
    const ids = porFlujo[flujo] || [];
    if (ids.length === 0) return;

    const channelName = (f.slackChannelName || '').trim();
    const channelId = channelName ? (canales[channelName] || '') : '';

    const mentions = ids.map(id => {
      const slackId = (colabs[id] && colabs[id].slackId) ? colabs[id].slackId : '';
      return slackId ? `<@${slackId}>` : id;
    }).join(' - ');

    let msg = `*${flujo}*\n${mentions}`;
    if (f.notas && f.notas.toString().trim() !== '') {
      msg += `\n_${f.notas}_`;
    }

    const estado = channelId ? 'PENDIENTE' : 'PENDIENTE - SIN CANAL';
    appendSlackOutboxRow_(fecha, 'POR_FLUJO', flujo, channelId, msg, estado);
  });

  SpreadsheetApp.getUi().alert('Slack_Outbox generado (GENERAL + POR_FLUJO).');
}

function ensureSlackOutboxHeader_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Slack_Outbox');
  const lastRow = sh.getLastRow();
  if (lastRow === 0) {
    sh.getRange(1, 1, 1, 6).setValues([['Fecha', 'Tipo', 'Canal', 'Slack_Channel_ID', 'Mensaje', 'Estado']]);
    return;
  }
  const h = sh.getRange(1, 1, 1, 6).getValues()[0];
  if (h[0] !== 'Fecha' || h[1] !== 'Tipo' || h[2] !== 'Canal') {
    sh.getRange(1, 1, 1, 6).setValues([['Fecha', 'Tipo', 'Canal', 'Slack_Channel_ID', 'Mensaje', 'Estado']]);
  }
}

function appendSlackOutboxRow_(fecha, tipo, canal, channelId, mensaje, estado) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Slack_Outbox');
  const row = sh.getLastRow() + 1;

  sh.getRange(row, 1, 1, 6).setValues([[fecha, tipo, canal, channelId, mensaje, estado]]);
  sh.getRange(row, 1).setNumberFormat('dd/mm/yyyy');
}

/***********************
 * 3) ENVIAR PENDIENTES SLACK OUTBOX
 ***********************/
function enviarPendientesSlackOutbox() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Slack_Outbox');
  if (!sh) throw new Error('No existe la hoja Slack_Outbox');

  const token = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
  const defaultChannel = PropertiesService.getScriptProperties().getProperty('SLACK_DEFAULT_CHANNEL_ID') || '';

  if (!token) {
    SpreadsheetApp.getUi().alert('Falta SLACK_BOT_TOKEN en Propiedades del Script.');
    return;
  }

  const data = sh.getDataRange().getValues();
  if (data.length < 2) {
    SpreadsheetApp.getUi().alert('No hay mensajes en Slack_Outbox.');
    return;
  }

  const h = data[0];
  const idxChannelId = h.indexOf('Slack_Channel_ID');
  const idxMsg = h.indexOf('Mensaje');
  const idxEstado = h.indexOf('Estado');

  if (idxChannelId === -1 || idxMsg === -1 || idxEstado === -1) {
    throw new Error('Slack_Outbox debe tener columnas: Slack_Channel_ID, Mensaje, Estado');
  }

  // FIX: era getTz_() y no existía
  const tz = getSpreadsheetTz_();
  const stamp = Utilities.formatDate(new Date(), tz, 'dd/MM HH:mm');

  let enviados = 0;
  let errores = 0;

  for (let i = 1; i < data.length; i++) {
    const estado = (data[i][idxEstado] || '').toString();
    if (!estado.startsWith('PENDIENTE')) continue;

    const msg = data[i][idxMsg];
    let channelId = (data[i][idxChannelId] || '').toString().trim();

    if (!channelId) channelId = defaultChannel;

    if (!channelId) {
      sh.getRange(i + 1, idxEstado + 1).setValue(`ERROR ❌ ${stamp} - SIN CANAL`);
      errores++;
      continue;
    }

    try {
      const ok = postToSlack_(token, channelId, msg);
      if (ok.ok) {
        sh.getRange(i + 1, idxEstado + 1).setValue(`ENVIADO ✅ ${stamp}`);
        enviados++;
      } else {
        sh.getRange(i + 1, idxEstado + 1).setValue(`ERROR ❌ ${stamp} - ${ok.error || 'desconocido'}`);
        errores++;
      }
    } catch (e) {
      sh.getRange(i + 1, idxEstado + 1).setValue(`ERROR ❌ ${stamp} - ${e.message}`);
      errores++;
    }
  }

  SpreadsheetApp.getUi().alert(`Slack_Outbox procesado.\nEnviados: ${enviados}\nErrores: ${errores}`);
}

function postToSlack_(token, channelId, text) {
  const payload = { channel: channelId, text };

  const params = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': `Bearer ${token}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const resp = UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', params);
  const bodyTxt = resp.getContentText();

  let body;
  try { body = JSON.parse(bodyTxt); } catch (e) { body = { ok: false, error: 'invalid_json' }; }
  return body;
}

/***********************
 * (Opcional) 4) CALIDAD PM - lo dejo intacto si lo usás
 ***********************/
function recalcularCalidadPM() {
  const ss = SpreadsheetApp.getActive();
  const shSrc = ss.getSheetByName('Auditorias_PM_raw');
  const shOut = ss.getSheetByName('Calidad_PM');

  if (!shSrc || !shOut) {
    SpreadsheetApp.getUi().alert('Revisá que existan las hojas "Auditorias_PM_raw" y "Calidad_PM".');
    return;
  }

  const data = shSrc.getDataRange().getValues();
  const headers = data[0];

  const idxSemana = headers.indexOf('semana');
  const idxUsuario = headers.indexOf('usuario');
  const idxEstFinal = headers.indexOf('EstadoFinal_esCorrecto');
  const idxMotRech = headers.indexOf('Motivo_de_Rechazo_esCorrecto');
  const idxAccCorr = headers.indexOf('Accion_Correcta');

  if (idxSemana === -1 || idxUsuario === -1 || idxEstFinal === -1 || idxMotRech === -1 || idxAccCorr === -1) {
    throw new Error('No encuentro columnas requeridas en Auditorias_PM_raw.');
  }

  const mapa = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const semana = row[idxSemana];
    const usuario = row[idxUsuario];
    if (!semana || !usuario) continue;

    const key = semana + '||' + usuario;
    if (!mapa[key]) mapa[key] = { semana, usuario, total: 0, errores: 0 };

    mapa[key].total++;

    const estFinal = (row[idxEstFinal] || '').toString().toUpperCase();
    const motRech = (row[idxMotRech] || '').toString().toUpperCase();
    const accCorr = (row[idxAccCorr] || '').toString().toUpperCase();

    const hayError =
      CODIGOS_ERROR_TEXTO.some(t => estFinal.includes(t)) ||
      CODIGOS_ERROR_TEXTO.some(t => motRech.includes(t)) ||
      CODIGOS_ERROR_TEXTO.some(t => accCorr.includes(t));

    if (hayError) mapa[key].errores++;
  }

  const out = [['semana', 'usuario', 'total_sugerencias', 'sugerencias_con_error', 'sugerencias_correctas', 'efectividad']];
  Object.values(mapa).forEach(o => {
    const correctas = o.total - o.errores;
    const eff = o.total ? correctas / o.total : '';
    out.push([o.semana, o.usuario, o.total, o.errores, correctas, eff]);
  });

  shOut.clearContents();
  shOut.getRange(1, 1, out.length, out[0].length).setValues(out);

  SpreadsheetApp.getUi().alert('Calidad_PM recalculada.');
}

/***********************
 * HELPERS PARA HABILITACIONES (match headers)
 ***********************/
function norm(s) {
  return (s || '').toString().trim().toLowerCase();
}

function findHeaderIndex(headers, flujoNombre) {
  const target = norm(flujoNombre);

  for (let i = 0; i < headers.length; i++) {
    if (norm(headers[i]) === target) return i;
  }

  const t2 = target.replace(/[\s_-]+/g, '');
  for (let i = 0; i < headers.length; i++) {
    const h2 = norm(headers[i]).replace(/[\s_-]+/g, '');
    if (h2 === t2) return i;
  }

  return -1;
}

function findFijoHeaderIndex(headers, flujoNombre) {
  const target = norm(flujoNombre);

  const patrones = [
    `fijo_${target}`,
    `fijo ${target}`,
    `fijo-${target}`,
    `fijo_${target.replace(/[\s_-]+/g, '')}`,
    `fijo ${target.replace(/[\s_-]+/g, '')}`,
    `fijo-${target.replace(/[\s_-]+/g, '')}`,
  ].map(p => p.replace(/[\s_-]+/g, ''));

  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]).replace(/[\s_-]+/g, '');
    if (patrones.includes(h)) return i;
  }

  return -1;
}
function esDiaHabil_(fecha) {
  const day = fecha.getDay(); // 0=Dom, 6=Sáb
  if (day === 0 || day === 6) return false;

  const sh = SpreadsheetApp.getActive().getSheetByName('Feriados_AR');
  if (!sh) return true;

  const feriados = sh.getRange(2,1,sh.getLastRow()-1,1).getValues()
    .map(r => Utilities.formatDate(r[0], getSpreadsheetTz_(), 'yyyy-MM-dd'));

  const key = Utilities.formatDate(fecha, getSpreadsheetTz_(), 'yyyy-MM-dd');
  return !feriados.includes(key);
}

function jobPresentismoInicioDia() {
  const hoy = todayDateNoTime_();
  if (!esDiaHabil_(hoy)) return;

  agregarColumnaHoyEnPresentismo();
  completarPresentesPorDefecto();
}

function jobGenerarPlanificacion() {
  const hoy = todayDateNoTime_();
  if (!esDiaHabil_(hoy)) return;

  generarPlanificacionHoy();
}

function jobGenerarSlackOutbox() {
  const hoy = todayDateNoTime_();
  if (!esDiaHabil_(hoy)) return;

  generarSlackOutbox();
}

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('App')
    .setTitle('Catálogo | HUB');
}

function abrirPanelAusencias() {
  var html = HtmlService.createHtmlOutputFromFile('PanelAusencias')
    .setTitle('Registrar ausencia / vacaciones');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Catálogo | HUB - WebApp entrypoint **/

function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) ? String(e.parameter.page) : "home";

  const t = HtmlService.createTemplateFromFile("App");
  t.page = page;
  t.config = getHubConfig_();

  return t.evaluate()
    .setTitle("Catálogo | HUB")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Include de parciales HTML
function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Config central del HUB (acá cargás links reales)
function getHubConfig_() {
  return {
    title: "Catálogo | HUB",
    repoUrl: "https://github.com/catalogo-meli/hub",
    sections: [
      {
        id: "home",
        label: "Nuevo HUB",
        items: [
          { label: "Repo GitHub", type: "link", href: "https://github.com/catalogo-meli/hub" }
        ]
      },
      {
        id: "ausencias",
        label: "Vacaciones / Ausencias",
        items: [
          { label: "Panel Ausencias", type: "internal", page: "ausencias", description: "Carga y consulta de ausencias/vacaciones." }
        ]
      },
      { id: "metricas", label: "Métricas", items: [] },
      { id: "plan", label: "Plan de Carrera", items: [] },
      { id: "matchers", label: "Matchers", items: [] },
      { id: "fallos", label: "Fallos", items: [] },
      { id: "mejoras", label: "Mejoras", items: [] },
      { id: "calidad", label: "Calidad", items: [] }
    ]
  };
}
