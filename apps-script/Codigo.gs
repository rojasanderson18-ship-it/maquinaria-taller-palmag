/* =====================================================================
   COPIA DE RESPALDO del Google Apps Script de Palma Grande.
   El que funciona de verdad es el que está en Google Sheets
   (Extensiones → Apps Script). Cambiar este archivo NO cambia nada:
   si se modifica, hay que pegarlo allá y publicar una nueva versión.

   Ojo: doPost sobrescribe la fila de hoy que tenga el mismo valor en la
   columna de equipo (columna 3 en Revisiones y Altas, columna 4 en las
   demás) en vez de agregar una fila nueva.

   Cómo actualizarlo: copiar TODO este archivo, en Apps Script borrar lo que
   hay en Código.gs y pegarlo; luego Implementar → Gestionar
   implementaciones → lápiz → Versión: Nueva versión → Implementar. La
   dirección (URL) no cambia. La primera vez que se usa Drive, Google pide
   permiso: aceptarlo.
   ===================================================================== */

function doGet(e) {
  const ss = SpreadsheetApp.openById('1CyRN1R136NSvTfBSQdl4jt8fESH_HuKSqcei7CwSoa0');
  const action = e.parameter.action || 'read';

  try {
    if (action === 'write') {
      // Guardar/actualizar programación
      const hoja = e.parameter.hoja || 'Programacion';
      let sheet = ss.getSheetByName(hoja);
      if (!sheet) sheet = ss.insertSheet(hoja);

      if (sheet.getLastRow() === 0) {
        const enc = ['Fecha','Supervisor','Tractor','Labor','Lote','Implemento','Hora Inicio'];
        sheet.appendRow(enc);
        sheet.getRange(1,1,1,enc.length).setBackground('#1a4731').setFontColor('#fff').setFontWeight('bold');
        sheet.setFrozenRows(1);
      }

      const fila = [
        e.parameter.fecha || '',
        e.parameter.supervisor || '',
        e.parameter.tractor || '',
        e.parameter.labor || '',
        e.parameter.lote || '',
        e.parameter.impl || '',
        e.parameter.hora || ''
      ];
      const tractorVal = fila[2];
      const fechaVal   = fila[0];

      // Buscar y actualizar si existe
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const vals = sheet.getRange(2,1,lastRow-1,7).getValues();
        for (let i = 0; i < vals.length; i++) {
          let f = vals[i][0];
          if (typeof f === 'object') f = f.toLocaleDateString('es-CO');
          if (f === fechaVal && String(vals[i][2]).trim() === tractorVal.trim()) {
            sheet.getRange(i+2,1,1,7).setValues([fila]);
            if (fila[3]) sheet.getRange(i+2,4).setBackground('#d8f3dc');
            else sheet.getRange(i+2,1,1,7).setBackground('#f1f5f9');
            return resp({ok:true, updated:true});
          }
        }
      }
      sheet.appendRow(fila);
      if (fila[3]) sheet.getRange(sheet.getLastRow(),4).setBackground('#d8f3dc');
      return resp({ok:true, inserted:true});

    } else if (action === 'delete') {
      const hoja = e.parameter.hoja || 'Programacion';
      const sheet = ss.getSheetByName(hoja);
      if (!sheet) return resp({ok:true});
      const tractorVal = e.parameter.tractor || '';
      const fechaVal   = e.parameter.fecha || '';
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const vals = sheet.getRange(2,1,lastRow-1,7).getValues();
        for (let i = 0; i < vals.length; i++) {
          let f = vals[i][0];
          if (typeof f === 'object') f = f.toLocaleDateString('es-CO');
          if (f === fechaVal && String(vals[i][2]).trim() === tractorVal.trim()) {
            sheet.deleteRow(i+2);
            return resp({ok:true, deleted:true});
          }
        }
      }
      return resp({ok:true});

    } else {
      // Leer datos
      const hoja = e.parameter.hoja || 'Preoperativos';
      const sheet = ss.getSheetByName(hoja);
      if (!sheet || sheet.getLastRow() < 2)
        return resp({ok:true, datos:[], cols:[]});
      const cols = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
      const datos = sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn())
        .getValues().filter(r => r[0] !== '');
      return resp({ok:true, datos, cols});
    }

  } catch(err) {
    return resp({ok:false, error:err.toString()});
  }
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.openById('1CyRN1R136NSvTfBSQdl4jt8fESH_HuKSqcei7CwSoa0');
    const data = JSON.parse(e.postData.contents);
    // cotizaciones y documentos (foto o PDF): van a Google Drive, ver guardarArchivo abajo
    if (data.archivo) return guardarArchivo(ss, data);
    let sheet = ss.getSheetByName(data.hoja);
    if (!sheet) sheet = ss.insertSheet(data.hoja);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(data.encabezados);
      sheet.getRange(1,1,1,data.encabezados.length)
        .setBackground('#1a4731').setFontColor('#fff').setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else if (data.encabezados && data.encabezados.length) {
      // una app agregó columnas al final (p. ej. Labor ID, Lotes y Según programación
      // en CierreJornada): se completan los títulos que falten, sin tocar los demás
      const tit = sheet.getRange(1,1,1,data.encabezados.length).getValues()[0];
      data.encabezados.forEach(function(h, i){
        if (String(tit[i] || '').trim() === '')
          sheet.getRange(1,i+1).setValue(h).setBackground('#1a4731').setFontColor('#fff').setFontWeight('bold');
      });
    }
    const equipoIdx = (data.hoja==='Revisiones'||data.hoja==='Altas') ? 2 : 3;
    const today = new Date().toLocaleDateString('es-CO');
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const valores = sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();
      for (let i = 0; i < valores.length; i++) {
        let fn = valores[i][0];
        if (typeof fn === 'object') fn = fn.toLocaleDateString('es-CO');
        if (fn === today && String(valores[i][equipoIdx]).trim() === String(data.fila[equipoIdx]).trim()) {
          sheet.getRange(i+2,1,1,data.fila.length).setValues([data.fila]);
          if (data.colorCol && data.color)
            sheet.getRange(i+2,data.colorCol).setBackground(data.color).setFontWeight('bold');
          return resp({ok:true, updated:true});
        }
      }
    }
    sheet.appendRow(data.fila);
    if (data.colorCol && data.color)
      sheet.getRange(sheet.getLastRow(),data.colorCol).setBackground(data.color).setFontWeight('bold');
    return resp({ok:true});
  } catch(err) {
    return resp({ok:false, error:err.toString()});
  }
}

function resp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =====================================================================
   ADJUNTOS — cotizaciones y documentos de las reparaciones (foto o PDF).
   Cada archivo se guarda en la carpeta de Drive "Palma Grande —
   Cotizaciones del taller" (se crea sola la primera vez), con permiso de
   ver para quien tenga el enlace, y queda una fila en la hoja "Adjuntos"
   con el enlace. Si el mismo archivo llega dos veces (reintento por falta
   de señal), no se duplica: se busca por su ID.
   ===================================================================== */

const ENC_ADJ = ['Fecha','Hora','Acción','ID','Parada','Equipo','Nombre','Tipo','Enlace','Quién','Subió','KB'];

function guardarArchivo(ss, data) {
  try {
    const a = data.archivo;
    let sheet = ss.getSheetByName('Adjuntos');
    if (!sheet) sheet = ss.insertSheet('Adjuntos');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(ENC_ADJ);
      sheet.getRange(1, 1, 1, ENC_ADJ.length).setBackground('#1a4731').setFontColor('#fff').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    // ¿ya llegó antes? (reintento)
    const n = sheet.getLastRow();
    if (n > 1) {
      const ids = sheet.getRange(2, 4, n - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(a.id)) return resp({ ok: true, repetido: true });
    }
    const blob = Utilities.newBlob(Utilities.base64Decode(a.base64), a.tipo || 'application/octet-stream', a.nombre || a.id);
    const f = carpetaAdjuntos().createFile(blob);
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
    const ahora = new Date();
    sheet.appendRow([
      Utilities.formatDate(ahora, 'America/Bogota', 'd/M/yyyy'),
      Utilities.formatDate(ahora, 'America/Bogota', 'HH:mm'),
      'ARCHIVO', a.id, a.parada || '', a.equipo || '', a.nombre || '', a.tipo || '', f.getUrl(),
      a.quien || '', a.por || '', Math.round(blob.getBytes().length / 1024)
    ]);
    return resp({ ok: true });
  } catch (err) {
    return resp({ ok: false, error: err.toString() });
  }
}

function carpetaAdjuntos() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('CARPETA_ADJUNTOS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) {} }
  const c = DriveApp.createFolder('Palma Grande — Cotizaciones del taller');
  props.setProperty('CARPETA_ADJUNTOS', c.getId());
  return c;
}
