/* =====================================================================
   ADJUNTOS — cotizaciones y documentos de las reparaciones (foto o PDF).
   Copia de respaldo: el que funciona es el que está en Google Sheets
   (Extensiones → Apps Script). Para activarlo:

   1. En el proyecto de Apps Script, botón "+" junto a Archivos → Secuencia
      de comandos → nombre "Adjuntos" → pegar TODO este archivo.
   2. En Código.gs, dentro de doPost, justo después de la línea
        const data = JSON.parse(e.postData.contents);
      agregar esta línea:
        if (data.archivo) return guardarArchivo(ss, data);
   3. Implementar → Gestionar implementaciones → lápiz (editar) → Versión:
      "Nueva versión" → Implementar. Google pide permiso para usar Drive:
      aceptarlo. La dirección (URL) de la app NO cambia.

   Cada archivo se guarda en la carpeta de Drive "Palma Grande — Cotizaciones
   del taller" (se crea sola la primera vez), con permiso de ver para quien
   tenga el enlace, y queda una fila en la hoja "Adjuntos" con el enlace.
   Si el mismo archivo llega dos veces (reintento por falta de señal), no se
   duplica: se busca por su ID.
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
