/* =====================================================================
   MAESTROS COMPARTIDOS — Palma Grande S.A.S.
   La lista de máquinas (y en Programación los lotes, fincas e implementos)
   es una sola para Taller, Programación y Gerencia. Vive en la hoja
   "Maestros" del mismo Apps Script: cada cambio agrega una fila con la
   lista completa en JSON, y vale la última fila de cada tipo. La columna 4
   es un ID único, así el Apps Script siempre agrega y nunca sobrescribe.
   Cada página guarda una copia en el celular para funcionar sin señal.
   ===================================================================== */
/* Día en que arrancó el sistema actualizado. Las cifras de un período
   (disponibilidad, fallas, uso, preoperativos, horas, combustible) cuentan
   desde aquí y solo se comparan con períodos que también sean del sistema
   nuevo: lo de antes se registraba distinto o no se registraba, y las
   comparaciones salían engañosas. El estado de hoy (qué máquina está parada
   y desde cuándo) sí conserva su fecha real. Lo usan todas las apps y
   Agrovisión. */
window.SISTEMA = window.SISTEMA || { INICIO: '2026-10-27' };   // las pruebas pueden fijar otra fecha antes

(function(){
  var GS_URL = 'https://script.google.com/macros/s/AKfycbwvDU84orwDkO_iBIBdmaq2CSQWYdp4sH9O14k7u6RpeuGeB3Ay3Nqj3HdFZ_4UobNC/exec';
  var KEY = 'palma-maestros-v1';
  var ENC = ['Fecha','Hora','Tipo','ID','Datos','Persona'];

  /* grupo: sanidad | campo | transporte (transporte no se programa)
     clase: maquina | camion (solo cambia el dibujo cuando no hay foto) */
  var FLOTA_BASE = [
    {cod:'#01',  nombre:'Kubota B2441',     grupo:'sanidad',    clase:'maquina'},
    {cod:'#02',  nombre:'Kubota B2441',     grupo:'sanidad',    clase:'maquina'},
    {cod:'#03',  nombre:'Kubota M9540',     grupo:'campo',      clase:'maquina'},
    {cod:'#04',  nombre:'Kubota M9540',     grupo:'campo',      clase:'maquina'},
    {cod:'#05',  nombre:'John Deere 2850',  grupo:'campo',      clase:'maquina'},
    {cod:'#06',  nombre:'Kubota K5100',     grupo:'sanidad',    clase:'maquina'},
    {cod:'#07',  nombre:'Kubota M108S',     grupo:'campo',      clase:'maquina'},
    {cod:'#08',  nombre:'Lovol TH754-H',    grupo:'campo',      clase:'maquina'},
    {cod:'#09',  nombre:'Lovol TH754-H',    grupo:'campo',      clase:'maquina'},
    {cod:'#10',  nombre:'Lovol TH904-X',    grupo:'campo',      clase:'maquina'},
    {cod:'#11',  nombre:'Lovol TH904-X',    grupo:'campo',      clase:'maquina'},
    {cod:'FORD', nombre:'Ford 5000',        grupo:'campo',      clase:'maquina'},
    {cod:'EXX568', nombre:'VW Constellation', grupo:'transporte', clase:'camion', uso:'Transporte de fruta'},
    {cod:'SXY206', nombre:'Isuzu FVR',        grupo:'transporte', clase:'camion', uso:'Personal y varios'}
  ];
  var GRUPOS = { campo:'Campo', sanidad:'Sanidad', transporte:'Transporte' };

  function p2(n){ return ('0'+n).slice(-2); }
  function copia(x){ return JSON.parse(JSON.stringify(x)); }
  function leerLocal(){ try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch(e){ return {}; } }
  function guardarLocal(m){ try { localStorage.setItem(KEY, JSON.stringify(m)); return true; } catch(e){ return false; } }

  var M = leerLocal();
  var avisos = [], GRACIA_MS = 2 * 60000, MAX_INTENTOS = 3;
  var NOMBRES = { FLOTA:'la lista de máquinas', MTTO:'los mantenimientos', FICHAS:'las fichas de mantenimiento', OPERARIOS:'los tractoristas',
    SUPERVISORES:'los supervisores', LOTES:'los lotes', FINCAS:'las fincas', IMPL:'los implementos',
    VEHICULOS:'los vehículos que tanquean' };

  window.Maestros = {
    GRUPOS: GRUPOS,
    ENC: ENC,
    /* lista guardada de un tipo, o null si nunca se ha guardado */
    get: function(tipo){ return M[tipo] ? copia(M[tipo].datos) : null; },
    /* toda la flota, incluidas las dadas de baja */
    flotaTodas: function(){ return (M.FLOTA ? copia(M.FLOTA.datos) : copia(FLOTA_BASE)); },
    /* solo las activas */
    flota: function(){ return this.flotaTodas().filter(function(f){ return f.activa !== false; }); },
    /* Guarda la lista en el celular y devuelve la fila para la cola de envío
       de cada página: {hoja, fila, encabezados, id}. Queda "sin confirmar"
       hasta que la fila aparezca en la hoja (el envío no da respuesta). */
    fila: function(tipo, datos, persona){
      var d = new Date(), id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var x = { hoja: 'Maestros', id: 'maestro:' + tipo, encabezados: ENC,
        fila: [d.toLocaleDateString('es-CO'), p2(d.getHours()) + ':' + p2(d.getMinutes()), tipo, id, JSON.stringify(datos), persona || ''] };
      var base = M[tipo] ? (M[tipo].pendiente ? M[tipo].base : M[tipo].id) : null;
      M[tipo] = { id: id, datos: copia(datos), pendiente: true, base: base || null, fila: x.fila, creado: Date.now(), intentos: 0 };
      guardarLocal(M);
      return x;
    },
    /* Lee la hoja; "pendientes" son los tipos que este celular todavía no
       ha enviado (no se pisan con lo de la hoja). Devuelve true si cambió algo.
       Un cambio enviado que no aparece en la hoja no se pierde: se queda en
       el celular para reenviarlo, salvo que otro lo haya cambiado después. */
    traer: async function(pendientes){
      pendientes = pendientes || {};
      var r = await fetch(GS_URL + '?hoja=Maestros&t=' + Date.now());
      var d = await r.json();
      if (!d || !d.ok || !Array.isArray(d.datos)) return false;
      var ult = {}, vistos = {};
      d.datos.forEach(function(row){
        var tipo = String(row[2] || '').trim(), id = String(row[3] || '').trim();
        if (!tipo || !id) return;
        vistos[id] = true;
        try { ult[tipo] = { id: id, datos: JSON.parse(String(row[4] || '')) }; } catch(e){}
      });
      var cambio = false;
      Object.keys(M).forEach(function(t){
        var m = M[t];
        if (pendientes[t] || !m.pendiente) return;
        if (vistos[m.id]){ M[t] = { id: m.id, datos: m.datos }; cambio = true; return; }   // llegó
        var remota = ult[t] ? ult[t].id : null;
        if (remota !== (m.base || null)){                // otro lo cambió después: manda la hoja
          avisos.push('Un cambio en ' + (NOMBRES[t] || t) + ' no llegó a la hoja y otra persona ya la había cambiado; quedó lo de la hoja.');
          delete M[t]; cambio = true;
        }
      });
      Object.keys(ult).forEach(function(t){
        if (pendientes[t] || (M[t] && M[t].pendiente)) return;
        if (!M[t] || M[t].id !== ult[t].id){ M[t] = ult[t]; cambio = true; }
      });
      if (cambio) guardarLocal(M);
      return cambio;
    },
    /* Filas que hay que volver a enviar porque no aparecieron en la hoja
       (hasta 3 intentos). "pendientes" = tipos que aún están en la cola. */
    reenviar: function(pendientes){
      pendientes = pendientes || {};
      var out = [];
      Object.keys(M).forEach(function(t){
        var m = M[t];
        if (!m.pendiente || pendientes[t] || !m.fila || (m.intentos || 0) >= MAX_INTENTOS) return;
        if (Date.now() - (m.enviado || m.creado || 0) < GRACIA_MS) return;
        m.intentos = (m.intentos || 0) + 1; m.enviado = Date.now();
        out.push({ hoja: 'Maestros', id: 'maestro:' + t, encabezados: ENC, fila: m.fila });
      });
      if (out.length) guardarLocal(M);
      return out;
    },
    /* tipos que ya se reenviaron 3 veces y siguen sin aparecer */
    sinLlegar: function(){
      return Object.keys(M).filter(function(t){ return M[t].pendiente && (M[t].intentos || 0) >= MAX_INTENTOS; })
        .map(function(t){ return { tipo: t, nombre: NOMBRES[t] || t }; });
    },
    reintentar: function(t){
      if (!M[t] || !M[t].pendiente) return null;
      M[t].intentos = 0; M[t].enviado = Date.now(); guardarLocal(M);
      return { hoja: 'Maestros', id: 'maestro:' + t, encabezados: ENC, fila: M[t].fila };
    },
    /* deja lo que tenga la hoja (se recupera en la próxima lectura) */
    descartar: function(t){ delete M[t]; guardarLocal(M); },
    /* mensajes para mostrar una vez */
    avisos: function(){ return avisos.splice(0); }
  };
})();

/* =====================================================================
   FESTIVOS DE COLOMBIA — se calculan para cualquier año.
   Fijos; los que se corren al lunes siguiente (Ley Emiliani); y los que
   dependen de la Pascua (Semana Santa, Ascensión, Corpus, Sagrado Corazón).
   ===================================================================== */
(function(){
  var cache = {};
  function p2(n){ return ('0'+n).slice(-2); }
  function iso(d){ return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); }
  function pascua(a){   // algoritmo anónimo gregoriano
    var b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4,
        g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3), i = (19 * b + c - e - h + 15) % 30,
        k = Math.floor(d / 4), l = d % 4, m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * m) / 451),
        mes = Math.floor((i + m - 7 * n + 114) / 31), dia = ((i + m - 7 * n + 114) % 31) + 1;
    return new Date(a, mes - 1, dia);
  }
  function lunes(d){ var x = new Date(d); while (x.getDay() !== 1) x.setDate(x.getDate() + 1); return x; }
  function mas(d, n){ var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function delAnio(a){
    if (cache[a]) return cache[a];
    var f = {}, P = pascua(a);
    function pon(d, nombre){ f[iso(d)] = nombre; }
    pon(new Date(a, 0, 1), 'Año Nuevo');
    pon(lunes(new Date(a, 0, 6)), 'Reyes Magos');
    pon(lunes(new Date(a, 2, 19)), 'San José');
    pon(mas(P, -3), 'Jueves Santo');
    pon(mas(P, -2), 'Viernes Santo');
    pon(new Date(a, 4, 1), 'Día del Trabajo');
    pon(lunes(mas(P, 39)), 'Ascensión del Señor');
    pon(lunes(mas(P, 60)), 'Corpus Christi');
    pon(lunes(mas(P, 68)), 'Sagrado Corazón');
    pon(lunes(new Date(a, 5, 29)), 'San Pedro y San Pablo');
    pon(new Date(a, 6, 20), 'Día de la Independencia');
    pon(new Date(a, 7, 7), 'Batalla de Boyacá');
    pon(lunes(new Date(a, 7, 15)), 'Asunción de la Virgen');
    pon(lunes(new Date(a, 9, 12)), 'Día de la Raza');
    pon(lunes(new Date(a, 10, 1)), 'Todos los Santos');
    pon(lunes(new Date(a, 10, 11)), 'Independencia de Cartagena');
    pon(new Date(a, 11, 8), 'Inmaculada Concepción');
    pon(new Date(a, 11, 25), 'Navidad');
    return (cache[a] = f);
  }
  window.Festivos = {
    /* nombre del festivo, o '' si ese día (aaaa-mm-dd) no es festivo */
    nombre: function(fecha){ return delAnio(+String(fecha).slice(0, 4))[String(fecha).slice(0, 10)] || ''; },
    del: delAnio,
    /* día de trabajo: lunes a sábado y no festivo */
    laboral: function(fecha){
      var p = String(fecha).split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
      return d.getDay() !== 0 && !this.nombre(fecha);
    }
  };
})();

/* =====================================================================
   HORÓMETROS Y MANTENIMIENTO PREVENTIVO
   - Horómetros: lo que registran los operarios en el Preoperativo
     (PreopDiario, horómetro inicial; y Preoperativos, el anterior) y en el
     Cierre (CierreJornada, horómetro final y horas trabajadas). Si el cierre
     no trae el inicial, se toma el del preoperativo de ese día o el del
     cierre anterior. Copia en el celular sin señal.
   - Mantenimiento: cada máquina tiene el horómetro de su último
     mantenimiento (lo registra Tulio en el Taller) en la hoja Maestros,
     tipo MTTO. Se avisa al acercarse y al pasarse del intervalo.
   ===================================================================== */
(function(){
  var GS_URL = 'https://script.google.com/macros/s/AKfycbwvDU84orwDkO_iBIBdmaq2CSQWYdp4sH9O14k7u6RpeuGeB3Ay3Nqj3HdFZ_4UobNC/exec';
  var KEY = 'palma-horometros-v1';
  function p2(n){ return ('0'+n).slice(-2); }
  function isoLocal(d){ return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); }
  function aIso(v){
    var s = String(v==null?'':v).trim(); if (!s) return '';
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return m[3]+'-'+p2(m[2])+'-'+p2(m[1]);
    if (s.indexOf('T') > 0){ var d = new Date(s); if (!isNaN(d)) return isoLocal(d); }
    return s.slice(0,10);
  }
  function num(v){
    var t = String(v == null ? '' : v).trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(t)) return null;      // Sheets convirtió el número en fecha
    var n = parseFloat(t.replace(',', '.')); return isNaN(n) ? null : n;
  }
  /* "#05 - John Deere 2850", "05 - KUBOTA…", "FORD" → código de la flota */
  function codDe(txt){
    var t = String(txt || '').trim().toUpperCase();
    var f = window.Maestros.flotaTodas().filter(function(x){ return t === x.cod.toUpperCase() || t.indexOf(x.cod.toUpperCase() + ' ') === 0; })[0];
    if (f) return f.cod;
    var m = t.match(/^#?\s*0*(\d{1,2})\b/); return m ? '#' + p2(+m[1]) : t;
  }
  function diasEntre(a, b){ return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  /* El último horómetro creíble. Una lectura que salta más de 24 h por día
     (o baja) respecto a la anterior aceptada es casi siempre un error de
     digitación (11642 por 1164,2) y se ignora. Si la siguiente lectura
     confirma el salto (cambiaron el horómetro), se aceptan las dos. */
  function ultimoValido(l){
    l = l.slice().sort(function(a, b){ return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.h - b.h; });
    function creible(a, b){ return b.h >= a.h - 0.5 && b.h - a.h <= 24 * Math.max(1, diasEntre(a.fecha, b.fecha)); }
    var acc = null, pend = null;
    l.forEach(function(r){
      if (!acc || creible(acc, r)){ acc = r; pend = null; }
      else if (pend && creible(pend, r)){ acc = r; pend = null; }
      else pend = r;
    });
    return acc;
  }
  var H = (function(){ try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){ return null; } })() || { ultimo:{}, cierres:[] };

  async function leer(hoja){
    var r = await fetch(GS_URL + '?hoja=' + hoja + '&t=' + Date.now());
    var d = await r.json();
    if (!d || !d.ok || !Array.isArray(d.datos)) throw new Error('sin datos');
    return d.datos;
  }

  window.Horometros = {
    codDe: codDe,
    ultimoValido: ultimoValido,
    /* último horómetro conocido por máquina: { cod: { h, fecha } } */
    ultimo: function(){ return H.ultimo || {}; },
    /* cierres de jornada: [{ cod, fecha, final, inicial, horas, operario }] */
    cierres: function(){ return H.cierres || []; },
    /* días en que cada máquina tuvo preoperativo o cierre: { 'cod|fecha': true } */
    usos: function(){ return H.usos || {}; },
    traer: async function(){
      var res = await Promise.all([leer('PreopDiario'), leer('CierreJornada'), leer('Preoperativos')]
        .map(function(p){ return p.catch(function(){ return null; }); }));
      if (!res[0] && !res[1] && !res[2]) return false;
      var ult = {}, cierres = [], inicioDia = {}, lecturas = {}, usos = {};
      function anotar(cod, f, h){
        if (cod && /^\d{4}-\d{2}-\d{2}$/.test(f)) usos[cod + '|' + f] = true;   // ese día la máquina se usó
        if (h == null || h <= 0 || !cod || !f) return;
        (lecturas[cod] = lecturas[cod] || []).push({ fecha:f, h:h });
      }
      // horómetro con que arrancó cada máquina cada día, por operario (doble turno)
      // y el menor del día
      function inicio(cod, f, h, op){
        anotar(cod, f, h);
        if (h == null || h <= 0 || !cod || !f) return;
        var k = cod + '|' + f;
        if (inicioDia[k] == null || h < inicioDia[k]) inicioDia[k] = h;
        inicioDia[k + '|' + op] = h;
      }
      (res[0] || []).forEach(function(r){ inicio(codDe(r[3]), aIso(r[0]), num(r[7]), String(r[2]||'').trim()); });
      (res[2] || []).forEach(function(r){ inicio(codDe(r[3]), aIso(r[0]), num(r[6]), String(r[2]||'').trim()); });   // Preoperativo anterior
      var filas = (res[1] || []).map(function(r){
        return { cod:codDe(r[3]), fecha:aIso(r[0]), final:num(r[4]), inicial:num(r[5]), horas:num(r[6]), operario:String(r[2]||'') };
      }).filter(function(c){ return c.cod && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha); });
      // Un mismo cierre que llegó dos veces (se reintentó por falta de señal y
      // el reintento cayó otro día) se cuenta una vez: vale la última fila de
      // cada día + máquina + operario. Doble turno = otro operario, sí cuenta.
      var unico = {};
      filas.forEach(function(c){ unico[c.fecha + '|' + c.cod + '|' + c.operario.trim().toLowerCase()] = c; });
      filas = Object.keys(unico).map(function(k){ return unico[k]; })
        .sort(function(a, b){ return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.final || 0) - (b.final || 0); });
      var previo = {};
      filas.forEach(function(c){
        // Las filas viejas tienen texto (Estado, Novedad) en esas columnas: num() da null.
        var k = c.cod + '|' + c.fecha, ant = previo[c.cod];
        if (c.inicial == null && inicioDia[k + '|' + c.operario.trim()] != null) c.inicial = inicioDia[k + '|' + c.operario.trim()];
        if (c.inicial == null && ant && ant.fecha === c.fecha) c.inicial = ant.final;   // segundo turno: donde terminó el primero
        if (c.inicial == null && inicioDia[k] != null) c.inicial = inicioDia[k];
        if (c.inicial == null && ant && c.fecha > ant.fecha) c.inicial = ant.final;     // el cierre del día anterior
        if (c.horas == null && c.final != null && c.inicial != null) c.horas = Math.round((c.final - c.inicial) * 10) / 10;
        if (c.horas != null && (c.horas < 0 || c.horas > 24)) c.horas = null;   // horómetro mal digitado: no se cuenta
        anotar(c.cod, c.fecha, c.final);
        if (c.final != null && c.final > 0) previo[c.cod] = c;
        cierres.push(c);
      });
      Object.keys(lecturas).forEach(function(cod){ var u = ultimoValido(lecturas[cod]); if (u) ult[cod] = u; });
      H = { ultimo: ult, cierres: cierres, usos: usos, leido: new Date().toISOString() };
      try { localStorage.setItem(KEY, JSON.stringify(H)); } catch(e){}
      return true;
    }
  };

  /* La app de preoperativo anterior se reemplazó el 25 de octubre de 2026.
     Un celular que la tenía guardada y la abre sin señal la sigue mostrando, y
     lo que manda cae en hojas que ya no lee nadie (Preoperativos, Novedades,
     Tanqueos): un daño reportado ahí no llega al Taller. Esto lo encuentra
     para avisar quién sigue con la app vieja y qué daños reportó. */
  function hhmm(v){
    var s = String(v == null ? '' : v);
    if (s.indexOf('1899-') === 0){ var d = new Date(s); return isNaN(d) ? '' : p2(d.getHours()) + ':' + p2(d.getMinutes()); }
    return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }
  window.AppVieja = {
    DESDE: '2026-10-26',
    traer: async function(){
      var res = await Promise.all([leer('Preoperativos'), leer('Novedades'), leer('Tanqueos')]
        .map(function(p){ return p.catch(function(){ return null; }); }));
      if (!res[0] && !res[1] && !res[2]) return null;
      var desde = this.DESDE, out = { preop:[], nov:[], tanq:[], personas:[] }, gente = {};
      function base(r, tipo){
        var x = { fecha:aIso(r[0]), hora:hhmm(r[1]), op:String(r[2] || '').trim(), cod:codDe(r[3]) };
        x.id = tipo + '|' + x.fecha + '|' + x.hora + '|' + x.cod + '|' + x.op;
        if (x.fecha >= desde){ var g = gente[x.op || '—'] = gente[x.op || '—'] || { op:x.op, cods:{}, ultima:'' };
          g.cods[x.cod] = true; if (x.fecha > g.ultima) g.ultima = x.fecha; }
        return x;
      }
      (res[0] || []).forEach(function(r){ var x = base(r, 'pre'); if (x.fecha >= desde) out.preop.push(x); });
      (res[1] || []).forEach(function(r){ var x = base(r, 'nov');
        if (x.fecha >= desde){ x.items = String(r[4] || '').trim(); x.txt = String(r[5] || '').trim(); out.nov.push(x); } });
      (res[2] || []).forEach(function(r){ var x = base(r, 'tan'), g = num(r[6]);
        if (x.fecha >= desde && g > 0){ x.gal = g; out.tanq.push(x); } });
      out.personas = Object.keys(gente).map(function(k){ var g = gente[k]; return { op:g.op, cods:Object.keys(g.cods), ultima:g.ultima }; });
      return out;
    }
  };

  /* =====================================================================
     REPARACIONES — en qué va cada máquina parada y cuánto cuesta.
     Hoja "Reparaciones": una fila por cambio. El Taller anota el estado, el
     repuesto que necesita y cuándo sale; Compras anota el costo, el
     proveedor y cuándo llega el repuesto. Clave (columna 4) = ID de la
     parada | TALLER o COMPRAS: vale la última fila de cada clave (si es el
     mismo día, el Apps Script la reemplaza). Lo que se guarda se envía y se
     confirma al leer la hoja; lo que no aparece se reenvía hasta 3 veces y
     después queda a la vista (nunca se pierde sin avisar).
     ===================================================================== */
  var KEY_REP = 'palma-reparaciones-v1';
  var ENC_REP = ['Fecha','Hora','Tipo','Clave','Parada','Equipo','Estado','Repuesto que necesita','Sale estimado',
    'Costo repuestos','Costo mano de obra','Proveedor','Llega repuesto','Nota','Registró','Envío'];
  var ESTADOS_REP = [
    { id:'diagnostico', txt:'En diagnóstico', d:'Todavía se está mirando qué tiene' },
    { id:'repuesto', txt:'Esperando repuesto', d:'Ya se sabe qué necesita; falta que llegue' },
    { id:'reparacion', txt:'En reparación', d:'Se está arreglando en el taller' },
    { id:'externo', txt:'En taller externo', d:'Se mandó a otro taller' },
    { id:'decision', txt:'Pendiente de decisión', d:'Hay que decidir si se repara o se da de baja' }
  ];
  /* Se vuelve a leer lo guardado antes de cada cambio: el Taller y Compras
     pueden estar abiertos en el mismo equipo y comparten esta cola. */
  var RP;
  function cargarRep(){ try { RP = JSON.parse(localStorage.getItem(KEY_REP) || 'null'); } catch(e){ RP = null; } RP = RP || { hoja:{}, cola:[] }; return RP; }
  cargarRep();
  function guardarRep(){ try { localStorage.setItem(KEY_REP, JSON.stringify(RP)); } catch(e){} }
  function horaYa(){ var d = new Date(); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); }
  function fechaHoy(){ var d = new Date(); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }
  function aNum(v){ var n = num(v); return n == null ? null : n; }
  /* fila de la hoja → datos */
  function deFila(r){
    var t = String(r[2] || '').trim().toUpperCase();
    return t === 'TALLER'
      ? { estado:String(r[6] || '').trim(), repuesto:String(r[7] || '').trim(), sale:aIso(r[8]), nota:String(r[13] || '').trim(),
          por:String(r[14] || '').trim(), fecha:aIso(r[0]), envio:String(r[15] || '') }
      : { repuestos:aNum(r[9]), mano:aNum(r[10]), proveedor:String(r[11] || '').trim(), llega:aIso(r[12]), nota:String(r[13] || '').trim(),
          por:String(r[14] || '').trim(), fecha:aIso(r[0]), envio:String(r[15] || '') };
  }
  function aFila(x){
    var d = x.datos, t = x.tipo === 'TALLER';
    return [x.fechaTxt, x.hora, x.tipo, x.parada + '|' + x.tipo, x.parada, x.cod,
      t ? d.estado || '' : '', t ? d.repuesto || '' : '', t ? d.sale || '' : '',
      t ? '' : (d.repuestos == null ? '' : d.repuestos), t ? '' : (d.mano == null ? '' : d.mano), t ? '' : d.proveedor || '', t ? '' : d.llega || '',
      d.nota || '', x.por || '', x.envio];
  }
  var enviandoRep = null, otraVezRep = false;
  function enviarRep(){
    if (enviandoRep){ otraVezRep = true; return enviandoRep; }
    enviandoRep = enviarRepUnaVez().catch(function(){}).then(function(){
      enviandoRep = null;
      if (otraVezRep){ otraVezRep = false; return enviarRep(); }
    });
    return enviandoRep;
  }
  async function enviarRepUnaVez(){
    if (!navigator.onLine) return;
    var ahora = Date.now();
    var porEnviar = cargarRep().cola.filter(function(x){
      return !(x.enviadoEn && ahora - x.enviadoEn < 120000) && (x.intentos || 0) < 3;   // los 3 intentos ya se avisan en pantalla
    });
    for (var i = 0; i < porEnviar.length; i++){
      var x = porEnviar[i];
      try {
        await fetch(GS_URL, { method:'POST', mode:'no-cors', body:JSON.stringify({ hoja:'Reparaciones', fila:aFila(x), encabezados:ENC_REP }) });
      } catch(e){ break; }
      // se marca sobre lo guardado: otra pestaña pudo cambiar la cola mientras se enviaba
      var y = cargarRep().cola.filter(function(z){ return z.envio === x.envio; })[0];
      if (y){ y.enviadoEn = Date.now(); y.intentos = (y.intentos || 0) + 1; guardarRep(); }
    }
  }
  window.Reparaciones = {
    ESTADOS: ESTADOS_REP,
    txtEstado: function(id){ var e = ESTADOS_REP.filter(function(x){ return x.id === id; })[0]; return e ? e.txt : ''; },
    /* lo último de una parada: { taller:{…}, compras:{…} } (lo guardado aquí y aún no confirmado va primero) */
    de: function(parada){
      cargarRep();
      var o = { taller:null, compras:null };
      ['TALLER', 'COMPRAS'].forEach(function(t){
        var k = parada + '|' + t, enCola = RP.cola.filter(function(x){ return x.parada + '|' + x.tipo === k; }).pop();
        o[t.toLowerCase()] = enCola ? Object.assign({ fecha:aIso(enCola.fechaTxt), por:enCola.por, sinConfirmar:true }, enCola.datos) : (RP.hoja[k] || null);
      });
      return o;
    },
    guardar: function(tipo, parada, cod, datos, por){
      cargarRep();
      RP.cola = RP.cola.filter(function(x){ return !(x.parada === parada && x.tipo === tipo); });
      RP.cola.push({ tipo:tipo, parada:parada, cod:cod, datos:datos, por:por || '', fechaTxt:fechaHoy(), hora:horaYa(),
        envio:'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), intentos:0, enviadoEn:null });
      guardarRep();
      return enviarRep();
    },
    /* lee la hoja, confirma lo enviado y reintenta lo que no llegó */
    traer: async function(){
      var filas = await leer('Reparaciones').catch(function(){ return null; });
      if (filas){
        var h = {};
        filas.forEach(function(r){ var k = String(r[3] || '').trim(); if (k) h[k] = deFila(r); });
        cargarRep();
        RP.hoja = h;
        RP.cola = RP.cola.filter(function(x){
          var r = h[x.parada + '|' + x.tipo];
          if (r && r.envio === x.envio) return false;                              // llegó
          if (r && r.fecha > aIso(x.fechaTxt)) return false;                        // hay algo más nuevo hecho en otro equipo
          if (x.enviadoEn && Date.now() - x.enviadoEn > 120000 && x.intentos < 3) x.enviadoEn = null;   // reenviar
          return true;
        });
        guardarRep();
      }
      await enviarRep();
      return !!filas;
    },
    /* lo que ya se envió 3 veces y no aparece en la hoja */
    sinLlegar: function(){ cargarRep(); return RP.cola.filter(function(x){ return x.intentos >= 3 && x.enviadoEn && Date.now() - x.enviadoEn > 120000; }); },
    reintentar: function(envio){ cargarRep(); RP.cola.forEach(function(x){ if (x.intentos >= 3 && (!envio || x.envio === envio)){ x.intentos = 0; x.enviadoEn = null; } }); guardarRep(); return enviarRep(); },
    descartar: function(envio){ cargarRep(); RP.cola = RP.cola.filter(function(x){ return x.envio !== envio; }); guardarRep(); },
    enviar: enviarRep
  };

  /* =====================================================================
     ADJUNTOS — cotizaciones (foto o PDF) de cada reparación.
     El archivo se guarda en el celular (IndexedDB, porque un PDF no cabe en
     localStorage) y se envía al Apps Script, que lo guarda en Google Drive y
     anota el enlace en la hoja "Adjuntos" (guardarArchivo en apps-script/Codigo.gs). Solo
     cuando el enlace aparece en la hoja se borra del celular; lo que no
     llega en 3 intentos queda a la vista para reenviarlo.
     ===================================================================== */
  var KEY_ADJ = 'palma-adjuntos-v1', MAX_PDF = 10 * 1024 * 1024;
  var AD;
  function cargarAdj(){ try { AD = JSON.parse(localStorage.getItem(KEY_ADJ) || 'null'); } catch(e){ AD = null; } AD = AD || { hoja:[], cola:[] }; return AD; }
  function guardarAdj(){ try { localStorage.setItem(KEY_ADJ, JSON.stringify(AD)); } catch(e){} }
  cargarAdj();
  function idb(){
    return new Promise(function(res, rej){
      var r = indexedDB.open('palma-adjuntos', 1);
      r.onupgradeneeded = function(){ r.result.createObjectStore('archivos'); };
      r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); };
    });
  }
  function idbHacer(modo, fn){
    return idb().then(function(db){ return new Promise(function(res, rej){
      var tx = db.transaction('archivos', modo), st = tx.objectStore('archivos'), q = fn(st);
      tx.oncomplete = function(){ res(q && q.result); }; tx.onerror = function(){ rej(tx.error); };
    }); });
  }
  function aBase64(blob){
    return new Promise(function(res, rej){ var r = new FileReader(); r.onload = function(){ res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(blob); });
  }
  /* una foto de una cotización se achica, pero que se pueda leer */
  function achicarImagen(file){
    return new Promise(function(res){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){
        var esc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * esc); c.height = Math.round(img.naturalHeight * esc);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function(b){ res(b || file); }, 'image/jpeg', 0.72);
      };
      img.onerror = function(){ URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
  }
  /* un solo envío a la vez: si se pide otro mientras tanto, se repite al terminar */
  var enviandoAdj = null, otraVezAdj = false;
  function enviarAdj(){
    if (enviandoAdj){ otraVezAdj = true; return enviandoAdj; }
    enviandoAdj = enviarAdjUnaVez().catch(function(){}).then(function(){
      enviandoAdj = null;
      if (otraVezAdj){ otraVezAdj = false; return enviarAdj(); }
    });
    return enviandoAdj;
  }
  async function enviarAdjUnaVez(){
    if (!navigator.onLine) return;
    var ahora = Date.now();
    var porEnviar = cargarAdj().cola.filter(function(x){ return !(x.enviadoEn && ahora - x.enviadoEn < 180000) && (x.intentos || 0) < 3; });
    for (var i = 0; i < porEnviar.length; i++){
      var x = porEnviar[i], blob = await idbHacer('readonly', function(st){ return st.get(x.id); }).catch(function(){ return null; });
      if (!blob) continue;
      try {
        var b64 = await aBase64(blob);
        await fetch(GS_URL, { method:'POST', mode:'no-cors', body:JSON.stringify({ hoja:'Adjuntos',
          archivo:{ id:x.id, parada:x.parada, equipo:x.cod, nombre:x.nombre, tipo:x.tipo, base64:b64, quien:x.quien, por:x.por } }) });
      } catch(e){ break; }
      var y = cargarAdj().cola.filter(function(z){ return z.id === x.id; })[0];
      if (y){ y.enviadoEn = Date.now(); y.intentos = (y.intentos || 0) + 1; guardarAdj(); }
    }
  }
  window.Adjuntos = {
    MAX_PDF: MAX_PDF,
    /* guarda el archivo en el celular y lo envía; quien = TALLER o COMPRAS */
    subir: async function(parada, cod, file, quien, por){
      var esImg = /^image\//.test(file.type), esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
      if (!esImg && !esPdf) throw new Error('Solo se pueden subir fotos o PDF.');
      if (esPdf && file.size > MAX_PDF) throw new Error('El PDF pesa más de 10 MB. Tómele una foto a la cotización.');
      var blob = esImg ? await achicarImagen(file) : file;
      var id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var nombre = esImg ? 'Cotizacion ' + cod.replace('#', '') + ' ' + new Date().toISOString().slice(0, 10) + '.jpg' : (file.name || 'cotizacion.pdf');
      await idbHacer('readwrite', function(st){ return st.put(blob, id); });
      cargarAdj().cola.push({ id:id, parada:parada, cod:cod, nombre:nombre, tipo: esImg ? 'image/jpeg' : 'application/pdf',
        kb: Math.round(blob.size / 1024), quien:quien, por:por || '', fecha:isoLocal(new Date()), intentos:0, enviadoEn:null });
      guardarAdj();
      enviarAdj();
      return id;
    },
    /* los archivos de una parada: los de la hoja (con enlace) y los que van en camino */
    de: function(parada){
      cargarAdj();
      return AD.hoja.filter(function(x){ return x.parada === parada; })
        .concat(AD.cola.filter(function(x){ return x.parada === parada; }).map(function(x){ return Object.assign({ local:true }, x); }));
    },
    /* abre un archivo que todavía no ha llegado (está en el celular) */
    abrirLocal: async function(id){
      var b = await idbHacer('readonly', function(st){ return st.get(id); });
      if (b) window.open(URL.createObjectURL(b), '_blank');
    },
    traer: async function(){
      var filas = await leer('Adjuntos').catch(function(){ return null; });
      if (filas){
        var vistos = {};
        cargarAdj();
        AD.hoja = filas.filter(function(r){ return String(r[3] || '').trim() && String(r[8] || '').trim(); }).map(function(r){
          var x = { id:String(r[3]).trim(), parada:String(r[4] || '').trim(), cod:String(r[5] || '').trim(), nombre:String(r[6] || ''), tipo:String(r[7] || ''),
            url:String(r[8]), quien:String(r[9] || ''), por:String(r[10] || ''), fecha:aIso(r[0]) };
          vistos[x.id] = true; return x;
        });
        var llegaron = AD.cola.filter(function(x){ return vistos[x.id]; });
        AD.cola = AD.cola.filter(function(x){
          if (vistos[x.id]) return false;
          if (x.enviadoEn && Date.now() - x.enviadoEn > 180000 && x.intentos < 3) x.enviadoEn = null;    // reenviar
          return true;
        });
        guardarAdj();
        llegaron.forEach(function(x){ idbHacer('readwrite', function(st){ return st.delete(x.id); }).catch(function(){}); });
      }
      await enviarAdj();
      return !!filas;
    },
    sinLlegar: function(){ return cargarAdj().cola.filter(function(x){ return x.intentos >= 3 && x.enviadoEn && Date.now() - x.enviadoEn > 180000; }); },
    reintentar: function(id){ cargarAdj().cola.forEach(function(x){ if (x.intentos >= 3 && (!id || x.id === id)){ x.intentos = 0; x.enviadoEn = null; } }); guardarAdj(); return enviarAdj(); },
    descartar: function(id){ cargarAdj(); AD.cola = AD.cola.filter(function(x){ return x.id !== id; }); guardarAdj(); idbHacer('readwrite', function(st){ return st.delete(id); }).catch(function(){}); }
  };

  /* =====================================================================
     COMBUSTIBLE — un solo cálculo para la app de Tanqueo y Agrovisión.
     Antes cada pantalla calculaba el consumo a su manera y podían dar
     cifras distintas para la misma máquina.
     Un tanqueo: { id, ts, fecha, cod, gal, lec, tipo ('horometro'|'km'|
     'ninguna'), anulado, dudoso, … }. Un movimiento del tanque:
     { id, ts, fecha, tipo ('LLEGADA'|'AJUSTE'), gal, teorico, dif, … }.
     ===================================================================== */
  function tsDeId(id, fecha, hora){
    var ms = Number(String(id || '').slice(1, 14));
    if (ms > 1.5e12 && ms < 4e12) return ms;            // el ID lleva el momento exacto
    var p = String(fecha || '').split('-'), q = String(hora || '00:00').split(':');
    return new Date(+p[0], +p[1] - 1, +p[2], +q[0] || 0, +q[1] || 0).getTime();
  }
  function hm(v){
    var s = String(v == null ? '' : v);
    if (s.indexOf('1899-') === 0){ var d = new Date(s); return isNaN(d) ? '' : p2(d.getHours()) + ':' + p2(d.getMinutes()); }
    var m = s.match(/(\d{1,2}):(\d{2})/); return m ? p2(+m[1]) + ':' + m[2] : '';
  }
  /* una pareja válida: dos lecturas seguidas de la misma máquina que avanzan
     poco (una lectura mal digitada no cuenta) */
  function parValido(a, b){
    if (!a || !b || a.tipo !== b.tipo || a.tipo === 'ninguna' || !(a.lec > 0) || !(b.lec > 0) || b.dudoso) return false;
    var d = b.lec - a.lec;
    return d > 0 && d <= (b.tipo === 'km' ? 3000 : 300);
  }
  function porMaquina(lista, cod){ return lista.filter(function(t){ return t.cod === cod && !t.anulado; }).sort(function(a, b){ return a.ts - b.ts; }); }
  function tasaDe(pares, km){
    var gal = 0, av = 0;
    pares.forEach(function(p){ gal += p[1].gal; av += p[1].lec - p[0].lec; });
    return { gal:gal, avance:av, pares:pares.length, km:km,
      tasa: av > 0 && gal > 0 ? (km ? av / gal : gal / av) : null };   // gal/h, o km/gal en camiones y vehículos
  }
  window.Combustible = {
    /* hoja Combustible → tanqueos (vale la última fila de cada ID; sin anulados) */
    tanqueos: function(filas){
      var u = {};
      (filas || []).forEach(function(r){ var id = String(r[3] || '').trim(); if (id) u[id] = r; });
      var l = Object.keys(u).map(function(id){
        var r = u[id], f = aIso(r[0]), tl = String(r[8] || '');
        return { id:id, fecha:f, hora:hm(r[1]), ts:tsDeId(id, f, hm(r[1])), anulado: String(r[2] || '').trim().toUpperCase() === 'ANULADO',
          cod:String(r[4] || '').trim(), nom:String(r[5] || ''), gal:num(r[6]) || 0, lec:num(r[7]),
          tipo: tl === 'Km' ? 'km' : tl === 'Ninguna' ? 'ninguna' : 'horometro',
          recibe:String(r[11] || '').trim(), despacha:String(r[12] || '').trim(), precio:num(r[13]) || 0, costo:num(r[14]) || 0,
          saldo:num(r[15]), folio:String(r[16] || ''), just:String(r[17] || '').trim(), obs:String(r[18] || '').trim() };
      }).filter(function(t){ return /^\d{4}-\d{2}-\d{2}$/.test(t.fecha) && t.gal > 0; });
      // galones fuera de toda proporción para esa máquina (125 en vez de 12,5): no se cuentan
      var por = {};
      l.forEach(function(t){ if (!t.anulado) (por[t.cod] = por[t.cod] || []).push(t.gal); });
      l.forEach(function(t){
        var v = (por[t.cod] || []).slice().sort(function(a, b){ return a - b; }), med = v[Math.floor(v.length / 2)];
        t.dudoso = v.length >= 5 && t.gal > Math.max(med * 4, 30);
      });
      return l.sort(function(a, b){ return a.ts - b.ts; });
    },
    /* hoja CombustibleTanque → llegadas y mediciones (cuadres y cierres) */
    movimientos: function(filas){
      var u = {};
      (filas || []).forEach(function(r){ var id = String(r[3] || '').trim(); if (id) u[id] = r; });
      return Object.keys(u).map(function(id){
        var r = u[id], f = aIso(r[0]), tipo = String(r[2] || '').trim().toUpperCase(), nota = String(r[8] || '').trim();
        // un cierre: el tanque se quedó vacío (o, antes, la medida al recibir); una llegada trae lo esperado
        // según la orden y la diferencia con lo medido con regleta en el carrotanque (PR-ALM-01)
        var cierre = /^(Cierre por llegada|Tanque vacío)/.test(nota), lleg = tipo === 'LLEGADA';
        return { id:id, fecha:f, ts:tsDeId(id, f, hm(r[1])), tipo:tipo, gal:num(r[4]) || 0, teorico: lleg ? null : num(r[5]), dif: lleg ? 0 : num(r[6]) || 0,
          esperado: lleg ? num(r[5]) : null, difProv: lleg ? num(r[6]) || 0 : 0, obs: lleg ? String(r[11] || '').trim() : '',
          precio:num(r[7]) || 0, nota:nota, cierre:cierre, vacio: nota.indexOf('Tanque vacío') === 0,
          motivo: cierre ? nota.split(' · ').slice(2).join(' · ') : '' };
      }).filter(function(m){ return /^\d{4}-\d{2}-\d{2}$/.test(m.fecha) && (m.tipo === 'LLEGADA' || m.tipo === 'AJUSTE'); })
        .sort(function(a, b){ return a.ts - b.ts; });
    },
    /* consumo de una máquina con los tanqueos de un período (desde/hasta en ms):
       galones de cada tanqueo ÷ lo que avanzó el horómetro desde el anterior */
    consumo: function(lista, cod, desde, hasta){
      var l = porMaquina(lista, cod), pares = [];
      for (var i = 1; i < l.length; i++) if (l[i].ts >= desde && l[i].ts <= hasta && parValido(l[i - 1], l[i])) pares.push([l[i - 1], l[i]]);
      return tasaDe(pares, l.length && l[0].tipo === 'km');
    },
    /* lo normal de una máquina: sus últimos N tanqueos antes de "antes" */
    normal: function(lista, cod, antes, n, excluirId){
      var l = porMaquina(lista, cod).filter(function(t){ return t.ts < antes && t.id !== excluirId; }), pares = [];
      for (var i = l.length - 1; i >= 1 && pares.length < (n || 10); i--) if (parValido(l[i - 1], l[i])) pares.push([l[i - 1], l[i]]);
      var r = tasaDe(pares, l.length && l[0].tipo === 'km');
      if (pares.length < 3) r.tasa = null;          // con menos de 3 tanqueos no hay "normal"
      return r;
    },
    /* el consumo de un tanqueo frente al anterior de la misma máquina */
    deTanqueo: function(lista, t){
      var l = porMaquina(lista, t.cod), i = -1;
      for (var k = 0; k < l.length; k++) if (l[k].id === t.id) i = k;
      return i > 0 && parValido(l[i - 1], l[i]) ? tasaDe([[l[i - 1], l[i]]], t.tipo === 'km').tasa : null;
    },
    /* saldo del tanque: la última medición + lo que entró − lo despachado después */
    saldo: function(movs, lista, hasta){
      hasta = hasta || Infinity;
      var m = movs.filter(function(x){ return x.ts <= hasta; }), base = 0, desde = 0;
      for (var i = m.length - 1; i >= 0; i--) if (m[i].tipo === 'AJUSTE'){ base = m[i].gal; desde = m[i].ts; break; }
      m.forEach(function(x){ if (x.tipo === 'LLEGADA' && x.ts > desde) base += x.gal; });
      lista.forEach(function(t){ if (!t.anulado && t.ts > desde && t.ts <= hasta) base -= t.gal; });
      return Math.round(base * 100) / 100;
    },
    /* galones por día de los últimos días, y cuántos días alcanza el saldo */
    autonomia: function(lista, saldo, dias){
      dias = dias || 15;
      var lim = Date.now() - dias * 86400000, g = lista.filter(function(t){ return !t.anulado && t.ts >= lim; }).reduce(function(a, t){ return a + t.gal; }, 0);
      var diario = g / dias;
      return { diario:diario, dias: diario > 0 ? saldo / diario : null };
    },
    /* el período de un cierre: desde la medición anterior hasta este cierre */
    periodo: function(movs, lista, cierre){
      var ant = movs.filter(function(m){ return m.tipo === 'AJUSTE' && m.ts < cierre.ts; }).pop() || null, desde = ant ? ant.ts : 0;
      var entr = movs.filter(function(m){ return m.tipo === 'LLEGADA' && m.ts > desde && m.ts < cierre.ts; });
      var sal = lista.filter(function(t){ return !t.anulado && t.ts > desde && t.ts < cierre.ts; });
      var tE = entr.reduce(function(a, m){ return a + m.gal; }, 0), tS = sal.reduce(function(a, t){ return a + t.gal; }, 0);
      return { anterior:ant, entradas:entr, salidas:sal, totalEntradas:tE, totalSalidas:tS,
        teorico: Math.round(((ant ? ant.gal : 0) + tE - tS) * 100) / 100 };
    }
  };

  /* =====================================================================
     FICHAS DE MANTENIMIENTO — qué filtros y aceites lleva cada modelo, con
     qué referencia, cuánto y cada cuántas horas (km en los camiones).
     Hoja Maestros, tipo FICHAS: { modelos:{ nombre:{ medidor, items:[…] } },
     asignadas:{ cod: modelo }, propios:{ cod:[ítems de esa máquina] },
     base:{ cod:{ ítem:{ h, fecha } } } }. "base" es el último cambio de cada
     ítem que traía la app Fichas técnicas: el punto de partida hasta que el
     Taller registre el primer mantenimiento.
     Las publica la app Fichas técnicas (flota-palmagrande) cada vez que
     cambian sus hojas de configuración o proveedores; aquí no se editan.
     Mientras no lleguen, cada máquina usa la plantilla de su clase.
     ===================================================================== */
  var PLANTILLA = {
    horas: [['filtro','Filtro de aceite de motor','und',250], ['filtro','Filtro de aire primario','und',500],
      ['filtro','Filtro de aire secundario','und',1000], ['filtro','Filtro de combustible','und',500],
      ['filtro','Separador de agua','und',500], ['filtro','Filtro hidráulico','und',1000],
      ['filtro','Filtro de transmisión','und',1000], ['lubricante','Aceite de motor','gal',250],
      ['lubricante','Aceite hidráulico / transmisión','gal',1000], ['lubricante','Aceite de diferencial','gal',1000],
      ['lubricante','Aceite de mandos finales','gal',1000], ['lubricante','Refrigerante','gal',2000]],
    km: [['filtro','Filtro de aceite de motor','und',10000], ['filtro','Filtro de aire','und',20000],
      ['filtro','Filtro de combustible','und',10000], ['filtro','Separador de agua','und',10000],
      ['filtro','Filtro secador de aire','und',40000], ['filtro','Filtro de cabina','und',20000],
      ['lubricante','Aceite de motor','gal',10000], ['lubricante','Aceite de caja','gal',60000],
      ['lubricante','Aceite de diferencial','gal',60000], ['lubricante','Aceite de dirección hidráulica','gal',40000],
      ['lubricante','Refrigerante','gal',40000]]
  };
  function slug(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function deFlota(cod){ return window.Maestros.flotaTodas().filter(function(f){ return f.cod === cod; })[0] || null; }
  function medidorDe(f){ return f && (f.clase === 'camion' || f.grupo === 'transporte') ? 'km' : 'horas'; }
  function plantilla(medidor){
    return PLANTILLA[medidor].map(function(p){ return { id:slug(p[1]), cat:p[0], comp:p[1], unidad:p[2], cant:null, ref:'', prov:'', costo:null, cada:p[3] }; });
  }

  window.Fichas = {
    /* lo guardado; si nunca se ha guardado, una ficha de plantilla por modelo de la flota */
    datos: function(){
      var d = window.Maestros.get('FICHAS');
      if (d && d.modelos) return d;
      var m = {};
      window.Maestros.flotaTodas().forEach(function(f){ if (!m[f.nombre]) m[f.nombre] = { medidor:medidorDe(f), items:plantilla(medidorDe(f)) }; });
      return { modelos:m, asignadas:{}, propios:{}, base:{}, plantilla:true };
    },
    modeloDe: function(cod, d){
      d = d || this.datos();
      var f = deFlota(cod), n = d.asignadas && d.asignadas[cod];
      if (n && d.modelos[n]) return n;
      return f && d.modelos[f.nombre] ? f.nombre : null;
    },
    /* lo que lleva una máquina: { modelo, medidor, items } (ítems del modelo + los propios de esa máquina) */
    de: function(cod, d){
      d = d || this.datos();
      var n = this.modeloDe(cod, d), f = deFlota(cod);
      var mod = n ? d.modelos[n] : { medidor:medidorDe(f), items:plantilla(medidorDe(f)) };
      return { modelo:n, plantilla:!n || !!d.plantilla, medidor:mod.medidor || medidorDe(f), items:(mod.items || []).concat((d.propios && d.propios[cod]) || []) };
    },
    unidad: function(medidor){ return medidor === 'km' ? 'km' : 'h' },
    /* Convierte lo que guarda la app Fichas técnicas (respaldo .json o su
       backend) en fichas de este sistema. Las máquinas se emparejan por
       código (#01, EXX568…). */
    desdeFichasTecnicas: function(x){
      if (!x || !Array.isArray(x.planes) || !Array.isArray(x.equipos)) throw new Error('El archivo no es un respaldo de Fichas técnicas.');
      var cat = {}; (x.catalogoProveedores || []).forEach(function(c){ cat[c.id] = c; });
      function item(it){
        var provs = (it.proveedorIds || []).map(function(id){ return cat[id]; }).filter(Boolean);
        var p = provs.filter(function(c){ return c.id === it.proveedorPreferidoId; })[0] || provs[0] || null;
        return { id:String(it.id), cat:it.categoria || '', comp:String(it.componente || '').trim(), unidad:it.unidad || '',
          cant: it.cantidad == null || it.cantidad === '' ? null : +it.cantidad, ref: p ? String(p.referencia || '') : '',
          prov: p ? String(p.proveedor || '') : '', costo: p && p.costoUnitario != null ? +p.costoUnitario : null, cada: +it.intervalo || null };
      }
      var out = { modelos:{}, asignadas:{}, propios:{}, base:{}, importado:new Date().toISOString().slice(0, 10) }, porId = {};
      x.planes.forEach(function(p){
        var n = String(p.nombre || '').trim(); if (!n) return;
        porId[p.id] = n;
        out.modelos[n] = { medidor: p.medidor === 'km' ? 'km' : 'horas', items:(p.items || []).filter(function(it){ return it.componente; }).map(item) };
      });
      var codigos = {}; window.Maestros.flotaTodas().forEach(function(f){ codigos[f.cod.toUpperCase().replace(/\s+/g, '')] = f.cod; });
      x.equipos.forEach(function(e){
        var cod = codigos[String(e.codigo || '').toUpperCase().replace(/\s+/g, '')] || codigos[String(e.placa || '').toUpperCase().replace(/\s+/g, '')];
        if (!cod) return;
        if (porId[e.planId]) out.asignadas[cod] = porId[e.planId];
        if ((e.propios || []).length) out.propios[cod] = e.propios.filter(function(it){ return it.componente; }).map(item);
        var b = {};
        Object.keys(e.estado || {}).forEach(function(id){
          var s = e.estado[id];
          if (s && s.ultLectura != null && s.ultLectura !== '' && +s.ultLectura > 0) b[id] = { h:+s.ultLectura, fecha:String(s.ultFecha || '').slice(0, 10) };
        });
        if (Object.keys(b).length) out.base[cod] = b;
      });
      if (!Object.keys(out.modelos).length) throw new Error('El respaldo no trae hojas de configuración.');
      return out;
    }
  };

  /* =====================================================================
     MANTENIMIENTOS — historial de mantenimientos preventivos (los registra
     el Taller). Hoja "Mantenimientos": una fila por mantenimiento; columna 4
     = ID (el Apps Script reemplaza la del mismo día; si no, vale la última).
     El costo lo anota Compras en Reparaciones, con el ID del mantenimiento
     como parada. Mismo envío que Reparaciones: se confirma al leer la hoja y
     lo que no llega en 3 intentos queda a la vista.
     ===================================================================== */
  var KEY_MT = 'palma-mantenimientos-v1';
  var ENC_MT = ['Fecha','Hora','Acción','ID','Equipo','Máquina','Medidor','Fecha mantenimiento','Ítems','Qué se cambió','Nota','Registró','Envío'];
  var MT;
  function cargarMt(){ try { MT = JSON.parse(localStorage.getItem(KEY_MT) || 'null'); } catch(e){ MT = null; } MT = MT || { hoja:{}, cola:[] }; return MT; }
  function guardarMt(){ try { localStorage.setItem(KEY_MT, JSON.stringify(MT)); } catch(e){} }
  cargarMt();
  function fechaHoyMt(){ var d = new Date(); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }
  function horaMt(){ var d = new Date(); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); }
  function mtDeFila(r){
    var items = []; try { items = JSON.parse(String(r[8] || '[]')) || []; } catch(e){}
    return { id:String(r[3] || '').trim(), cod:String(r[4] || '').trim(), h:num(r[6]), fecha:aIso(r[7]) || aIso(r[0]), items:items,
      nota:String(r[10] || '').trim(), por:String(r[11] || '').trim(), anulado:String(r[2] || '').trim().toUpperCase() === 'ANULADO',
      registrado:aIso(r[0]), envio:String(r[12] || '') };
  }
  function mtAFila(x){
    var f = deFlota(x.cod);
    return [x.fechaTxt, x.hora, x.anulado ? 'ANULADO' : 'REGISTRO', x.id, x.cod, f ? f.nombre : '', x.h == null ? '' : x.h, x.fecha,
      JSON.stringify(x.items || []), (x.items || []).map(function(i){ return i.comp + (i.ref ? ' (' + i.ref + ')' : ''); }).join(' · '),
      x.nota || '', x.por || '', x.envio];
  }
  var enviandoMt = null, otraVezMt = false;
  function enviarMt(){
    if (enviandoMt){ otraVezMt = true; return enviandoMt; }
    enviandoMt = enviarMtUnaVez().catch(function(){}).then(function(){
      enviandoMt = null;
      if (otraVezMt){ otraVezMt = false; return enviarMt(); }
    });
    return enviandoMt;
  }
  async function enviarMtUnaVez(){
    if (!navigator.onLine) return;
    var ahora = Date.now();
    var porEnviar = cargarMt().cola.filter(function(x){ return !(x.enviadoEn && ahora - x.enviadoEn < 120000) && (x.intentos || 0) < 3; });
    for (var i = 0; i < porEnviar.length; i++){
      var x = porEnviar[i];
      try {
        await fetch(GS_URL, { method:'POST', mode:'no-cors', body:JSON.stringify({ hoja:'Mantenimientos', fila:mtAFila(x), encabezados:ENC_MT }) });
      } catch(e){ break; }
      var y = cargarMt().cola.filter(function(z){ return z.envio === x.envio; })[0];
      if (y){ y.enviadoEn = Date.now(); y.intentos = (y.intentos || 0) + 1; guardarMt(); }
    }
  }
  window.Mantenimientos = {
    /* todos (lo de este celular aún sin confirmar va encima de lo de la hoja), sin los anulados, el más reciente primero */
    todos: function(){
      cargarMt();
      var o = {};
      Object.keys(MT.hoja).forEach(function(k){ o[k] = MT.hoja[k]; });
      MT.cola.forEach(function(x){ o[x.id] = Object.assign({ sinConfirmar:true }, x); });
      return Object.keys(o).map(function(k){ return o[k]; }).filter(function(x){ return !x.anulado; })
        .sort(function(a, b){ return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (b.h || 0) - (a.h || 0); });
    },
    de: function(cod){ return this.todos().filter(function(x){ return x.cod === cod; }); },
    nuevoId: function(){ return 'MT-' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toUpperCase(); },
    /* x = { id, cod, h, fecha, items:[{id, comp, ref, cant, unidad}], nota, por } */
    guardar: function(x){
      cargarMt();
      MT.cola = MT.cola.filter(function(y){ return y.id !== x.id; });
      MT.cola.push(Object.assign({}, x, { fechaTxt:fechaHoyMt(), hora:horaMt(),
        envio:'t' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), intentos:0, enviadoEn:null }));
      guardarMt();
      return enviarMt();
    },
    anular: function(id, por){
      var x = this.todos().filter(function(y){ return y.id === id; })[0];
      if (!x) return Promise.resolve();
      var y = {}; ['id', 'cod', 'h', 'fecha', 'items', 'nota'].forEach(function(k){ y[k] = x[k]; });
      y.anulado = true; y.por = por || x.por;
      return this.guardar(y);
    },
    traer: async function(){
      var filas = await leer('Mantenimientos').catch(function(){ return null; });
      if (filas){
        var h = {};
        filas.forEach(function(r){ var x = mtDeFila(r); if (x.id && x.cod) h[x.id] = x; });
        cargarMt();
        MT.hoja = h;
        MT.cola = MT.cola.filter(function(x){
          var r = h[x.id];
          if (r && r.envio === x.envio) return false;                                     // llegó
          if (r && r.registrado > aIso(x.fechaTxt)) return false;                          // hay algo más nuevo hecho en otro equipo
          if (x.enviadoEn && Date.now() - x.enviadoEn > 120000 && x.intentos < 3) x.enviadoEn = null;
          return true;
        });
        guardarMt();
      }
      await enviarMt();
      return !!filas;
    },
    sinLlegar: function(){ cargarMt(); return MT.cola.filter(function(x){ return x.intentos >= 3 && x.enviadoEn && Date.now() - x.enviadoEn > 120000; }); },
    reintentar: function(envio){ cargarMt(); MT.cola.forEach(function(x){ if (x.intentos >= 3 && (!envio || x.envio === envio)){ x.intentos = 0; x.enviadoEn = null; } }); guardarMt(); return enviarMt(); },
    descartar: function(envio){ cargarMt(); MT.cola = MT.cola.filter(function(x){ return x.envio !== envio; }); guardarMt(); },
    enviar: enviarMt
  };

  /* =====================================================================
     ESTADO DEL MANTENIMIENTO — por ítem de la ficha: el último cambio
     (historial del Taller; si no hay, el punto de partida de Fichas
     técnicas; si no, el registro anterior de un solo horómetro, que cubre
     los ítems de ese intervalo o menos) más su intervalo, contra el
     horómetro de los operarios. La máquina toma el ítem más urgente.
     ===================================================================== */
  window.Mtto = {
    INTERVALO: 250,
    AVISO: 25,          // horas; en los camiones 500 km
    aviso: function(medidor){ return medidor === 'km' ? 500 : this.AVISO; },
    /* registro anterior: { cod: { hor, fecha, por, intervalo } } en Maestros (tipo MTTO) */
    datos: function(){ return window.Maestros.get('MTTO') || {}; },
    /* último cambio de cada ítem: { ítem: { h, fecha, por, id } } */
    ultimos: function(cod, ficha){
      ficha = ficha || window.Fichas.de(cod);
      var u = {}, fd = window.Fichas.datos(), base = (fd.base && fd.base[cod]) || {}, viejo = this.datos()[cod];
      ficha.items.forEach(function(it){
        if (base[it.id]) u[it.id] = { h:base[it.id].h, fecha:base[it.id].fecha, por:'Fichas técnicas' };
        else if (viejo && viejo.hor != null && it.cada && it.cada <= (viejo.intervalo || 250)) u[it.id] = { h:viejo.hor, fecha:viejo.fecha, por:viejo.por };
      });
      // lo registrado en el Taller manda; del más viejo al más nuevo, así queda el último.
      // Se empareja por ítem o por nombre (si la ficha se volvió a cargar, los ítems cambian de id).
      var porNombre = {}; ficha.items.forEach(function(it){ porNombre[slug(it.comp)] = it.id; });
      window.Mantenimientos.de(cod).slice().reverse().forEach(function(m){
        (m.items || []).forEach(function(i){
          var id = ficha.items.some(function(it){ return it.id === i.id; }) ? i.id : porNombre[slug(i.comp)];
          if (id) u[id] = { h:m.h, fecha:m.fecha, por:m.por, id:m.id };
        });
      });
      return u;
    },
    estado: function(cod, horActual){
      var ficha = window.Fichas.de(cod), u = window.Horometros.ultimo()[cod], av = this.aviso(ficha.medidor);
      var actual = horActual != null ? horActual : (u ? u.h : null), ult = this.ultimos(cod, ficha);
      var items = ficha.items.map(function(it){
        var l = ult[it.id], x = { id:it.id, comp:it.comp, cat:it.cat, ref:it.ref, prov:it.prov, cant:it.cant, unidad:it.unidad, costo:it.costo, cada:it.cada };
        if (!l || l.h == null || !it.cada){ x.nivel = 'sindato'; return x; }
        x.ultimo = l.h; x.fecha = l.fecha; x.por = l.por; x.proximo = l.h + it.cada;
        if (actual == null){ x.nivel = 'sinhorometro'; return x; }
        x.faltan = Math.round((x.proximo - actual) * 10) / 10;
        x.nivel = x.faltan <= 0 ? 'vencido' : x.faltan <= av ? 'proximo' : 'ok';
        return x;
      });
      var con = items.filter(function(x){ return x.nivel !== 'sindato'; });
      var r = { modelo:ficha.plantilla ? null : ficha.modelo, medidor:ficha.medidor, unidad:window.Fichas.unidad(ficha.medidor), actual:actual, items:items,
        sinDato:items.length - con.length };
      if (!con.length){ r.nivel = 'sindato'; return r; }
      if (actual == null){
        var p = con.slice().sort(function(a, b){ return a.proximo - b.proximo; })[0];
        r.nivel = 'sinhorometro'; r.ultimo = p.ultimo; r.fecha = p.fecha; r.intervalo = p.cada; r.proximo = p.proximo; return r;
      }
      con.sort(function(a, b){ return a.faltan - b.faltan; });
      var m = con[0];
      // lo que toca en ese mismo cambio: los que vencen hasta el aviso después del más urgente
      var tocan = con.filter(function(x){ return x.faltan <= Math.max(m.faltan, 0) + av; });
      r.nivel = m.nivel; r.faltan = m.faltan; r.proximo = m.proximo; r.ultimo = m.ultimo; r.fecha = m.fecha; r.por = m.por; r.intervalo = m.cada;
      r.tocan = tocan; r.que = tocan.map(function(x){ return x.comp.toLowerCase(); }).join(', ');
      return r;
    }
  };
})();

/* =====================================================================
   INSTALAR COMO APP — solo con Google Chrome en Android.
   Otros navegadores (Edge, Samsung Internet, Opera, Brave, Firefox…)
   arman la app con una versión vieja de Android y Google Play Protect la
   bloquea como "app no segura". En esos casos se pide abrir la página en
   Chrome en vez de instalar.
   ===================================================================== */
window.Instalar = {
  /* null si se puede instalar aquí; si no, el mensaje para el usuario */
  impedimento: function(){
    var ua = navigator.userAgent || '';
    if (!/Android/i.test(ua)) return null;
    var otro = /EdgA|SamsungBrowser|OPR\/|Opera|Firefox|YaBrowser|MiuiBrowser|UCBrowser|HuaweiBrowser|DuckDuckGo|Vivaldi|; wv\)/i.test(ua) || !!navigator.brave;
    if (!otro && /Chrome\//.test(ua)) return null;
    return 'Para instalarla sin advertencias, abra esta misma página en Google Chrome y toque "Instalar app" allí.\n\n' +
      'Desde este navegador Android la bloquea como "app no segura". Mientras tanto puede seguir usándola aquí normalmente.';
  }
};

/* =====================================================================
   DENTRO DE AGROVISIÓN — cuando estas páginas se abren en el marco de
   "Flota y Combustible" de Agrovisión (mismo sitio), se esconden la flecha
   de volver y el botón de instalar, y al pasar a otra app se le avisa a
   Agrovisión para que cambie la pestaña (mismo menú y encabezado).
   ===================================================================== */
(function(){
  var dentro = false;
  try { dentro = window.self !== window.top && window.top.location.origin === location.origin; } catch(e){ dentro = false; }
  if (!dentro) return;
  window.EMBEBIDO = true;
  document.documentElement.classList.add('embebido');
  var st = document.createElement('style');
  // en el Resumen sobran los botones de las apps: Agrovisión ya tiene las pestañas
  st.textContent = '.embebido .volver,.embebido #btn-instalar,.embebido .inst-btn,.embebido .btn-inst,.embebido main > nav.apps{display:none !important}';
  (document.head || document.documentElement).appendChild(st);
  var PAGS = { 'index.html':'resumen', '':'resumen', 'taller-palma.html':'taller', 'programacion-palma.html':'programacion',
    'preoperativo-palma.html':'preoperativo', 'gerencia-palma.html':'gerencia', 'tanqueo-palma.html':'combustible' };
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    var u; try { u = new URL(a.getAttribute('href'), location.href); } catch(x){ return; }
    if (u.origin !== location.origin || u.pathname.indexOf('/maquinaria-taller-palmag/') !== 0) return;
    var tab = PAGS[u.pathname.split('/').pop()];
    if (!tab) return;
    e.preventDefault();
    window.top.postMessage({ flota: tab }, location.origin);
  }, true);
})();

/* =====================================================================
   LABORES Y LOTES — una sola lista para Programación, Preoperativo,
   Tanqueo y los tableros.
   - Labores de la maquinaria: aquí (prog:false = no se programa).
   - Lotes: la lista de Agrovisión (finca, lote, hectáreas), que se edita
     allá (Agrovisión → Lotes). Se guarda una copia en el celular para
     trabajar sin señal.
   ===================================================================== */
window.LABORES_MAQ = [
  { id:'alceTijera', txt:'Alce de racimos con tijera',       req:'tijera',       pri:1 },
  { id:'alceQuinta', txt:'Alce de racimos con quinta rueda', req:'quintarueda',  pri:1 },
  { id:'rotospeed',  txt:'Rotospeed',                        req:'rotospeed',    pri:2 },
  { id:'rolo',       txt:'Rolo cuchilla',                    req:'rolocuchilla', pri:2 },
  { id:'fertMezcla', txt:'Fertilización con mezcla',         req:null,           pri:2 },
  { id:'fertBorax',  txt:'Fertilización en bórax',           req:null,           pri:2 },
  { id:'sanidad',    txt:'Sanidad',                          req:null,           pri:2 },
  { id:'varias',     txt:'Labores varias',                   req:null,           pri:3 },
  { id:'transporte', txt:'Transporte',                       req:null,           pri:3, prog:false }
];
/* id de una labor a partir de su id o su texto ("Alce de racimos con tijera · lotes 12" → alceTijera) */
window.laborId = function(v){
  var t = String(v || '').split('·')[0].trim().toLowerCase();
  if (!t) return '';
  var l = window.LABORES_MAQ.filter(function(x){ return x.id.toLowerCase() === t || x.txt.toLowerCase() === t; })[0];
  return l ? l.id : '';
};
window.laborTxt = function(id){ var l = window.LABORES_MAQ.filter(function(x){ return x.id === id; })[0]; return l ? l.txt : id || ''; };

(function(){
  var URL_AGRO = 'https://script.google.com/macros/s/AKfycbxzrPbQx5Sx4Q4G7e9CCEGqovZc-b3qTosmNhr51bQYbKqSe3-JqnhND0-mE9xb3cry/exec';
  var KEY_L = 'palma-lotes-v1';
  var L = (function(){ try { return JSON.parse(localStorage.getItem(KEY_L) || 'null'); } catch(e){ return null; } })();
  function orden(a, b){
    var fa = a.finca.localeCompare(b.finca, 'es', { numeric:true }); if (fa) return fa;
    return a.cod.localeCompare(b.cod, 'es', { numeric:true });
  }
  window.Lotes = {
    /* [{ cod, finca, ha }] de los lotes activos, o null si nunca se ha leído Agrovisión */
    lista: function(){ return L && L.lotes ? L.lotes.slice() : null; },
    leido: function(){ return L ? L.leido : null; },
    fincas: function(){ var f = {}; (this.lista() || []).forEach(function(x){ f[x.finca] = true; }); return Object.keys(f).sort(function(a, b){ return a.localeCompare(b, 'es', { numeric:true }); }); },
    ha: function(cod){ var x = (this.lista() || []).filter(function(y){ return y.cod === String(cod).trim().toUpperCase(); })[0]; return x ? x.ha : null; },
    /* "12, 13 y 1A" → ['12','13','1A'] (solo separa; no valida) */
    partir: function(txt){ return String(txt || '').replace(/lotes?/ig, ' ').split(/[,;\/]+|\s+y\s+|\s+/i).map(function(x){ return x.trim().toUpperCase(); }).filter(Boolean); },
    traer: async function(){
      var r = await fetch(URL_AGRO + '?accion=listarLotes&t=' + Date.now());
      var d = await r.json();
      if (!d || !d.ok || !Array.isArray(d.lotes)) return false;
      var lotes = d.lotes.filter(function(x){ return x.lote && !/inactiv|baja|elimin/i.test(x.estado || ''); })
        .map(function(x){ return { cod:String(x.lote).trim().toUpperCase(), finca:String(x.finca || '').trim(), ha: +x.ha || 0 }; }).sort(orden);
      if (!lotes.length) return false;
      var cambio = !L || JSON.stringify(L.lotes) !== JSON.stringify(lotes);
      L = { lotes:lotes, leido:new Date().toISOString() };
      try { localStorage.setItem(KEY_L, JSON.stringify(L)); } catch(e){}
      return cambio;
    }
  };
})();

/* =====================================================================
   OPERACIÓN — cumplimiento de la programación, horas por labor y horas y
   combustible por lote. Un solo cálculo para Agrovisión y Gerencia.
   Sale de los cierres de jornada que traen la labor y los lotes escogidos
   de la lista (Preoperativo); los de texto libre no se reparten.
   Las horas de un cierre con varios lotes se reparten por hectáreas. El
   combustible es lo realmente despachado a cada máquina en el período,
   repartido entre sus labores y lotes según las horas de sus cierres (si un
   cierre no trae la labor, la de la programación de ese día); así todo suma
   lo que salió del tanque. Los camiones van a Transporte.
   ===================================================================== */
(function(){
  function p2(n){ return ('0' + n).slice(-2); }
  function iso(d){ return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function aIso(v){
    var s = String(v == null ? '' : v).trim(); if (!s) return '';
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return m[3] + '-' + p2(m[2]) + '-' + p2(m[1]);
    if (s.indexOf('T') > 0){ var d = new Date(s); if (!isNaN(d)) return iso(d); }
    return s.slice(0, 10);
  }
  function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; }
  function sumar(f, n){ var p = f.split('-'); return iso(new Date(+p[0], +p[1] - 1, +p[2] + n)); }
  window.Operacion = {
    META: 85,
    /* filas de CierreJornada → [{ cod, fecha, op, horas, laborId, lotes, segun }]; vale la última de cada máquina, día y operario */
    cierres: function(filas){
      var u = {};
      (filas || []).forEach(function(r){
        var f = aIso(r[0]), c = window.Horometros.codDe(r[3]), op = String(r[2] || '').trim();
        if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
        u[c + '|' + f + '|' + op.toLowerCase()] = { cod:c, fecha:f, op:op, horas:num(r[6]), laborId:String(r[10] || '').trim(),
          lotes:String(r[11] == null ? '' : r[11]).trim(), segun:String(r[12] || '').trim() };
      });
      return Object.keys(u).map(function(k){ return u[k]; });
    },
    /* combustible realmente despachado a cada equipo en un período: { cod:{ gal, costo } }
       (sin anulados ni galones mal digitados; sin precio, el promedio del período) */
    combustible: function(tanqueos, desde, hasta){
      var o = {}, l = (tanqueos || []).filter(function(t){ return !t.anulado && !t.dudoso && t.fecha >= desde && t.fecha <= hasta; });
      var g = 0, c = 0; l.forEach(function(t){ if (t.costo){ g += t.gal; c += t.costo; } });
      var precio = g ? c / g : 0;
      l.forEach(function(t){ var x = o[t.cod] = o[t.cod] || { gal:0, costo:0 }; x.gal += t.gal; x.costo += t.costo || t.gal * precio; });
      return o;
    },
    /* Costo del taller de un período (Agrovisión, informe semanal y Gerencia):
       cada costo cuenta en la fecha en que Compras lo registró (la última vez
       que lo actualizó), sea de una reparación o de un mantenimiento.
       paradas = [{ id, cod }]; valida(cod) = si la máquina entra en la cuenta.
       mttos = los mantenimientos hechos en el período; sinCosto = los que
       Compras todavía no ha costeado. */
    costoTaller: function(paradas, desde, hasta, valida){
      var o = { rep:0, prev:0, total:0, porMaq:{}, sinCosto:[], mttos:[] }, ini = (window.SISTEMA && SISTEMA.INICIO) || '2026-10-27';
      if (desde < ini) desde = ini;
      function compras(id){ return window.Reparaciones ? Reparaciones.de(id).compras : null; }
      function valor(c){ return c ? (c.repuestos || 0) + (c.mano || 0) : 0; }
      function sumarA(cod, k, v){ var x = o.porMaq[cod] = o.porMaq[cod] || { rep:0, prev:0, total:0 }; x[k] += v; x.total += v; o[k] += v; o.total += v; }
      paradas.forEach(function(e){
        var c = compras(e.id), v = valor(c);
        if (v && valida(e.cod) && c.fecha >= desde && c.fecha <= hasta) sumarA(e.cod, 'rep', v);
      });
      (window.Mantenimientos ? Mantenimientos.todos() : []).forEach(function(m){
        if (!valida(m.cod)) return;
        var c = compras(m.id), v = valor(c);
        if (v && c.fecha >= desde && c.fecha <= hasta) sumarA(m.cod, 'prev', v);
        if (m.fecha < desde || m.fecha > hasta) return;
        o.mttos.push({ id:m.id, cod:m.cod, fecha:m.fecha, h:m.h, por:m.por, que:(m.items || []).map(function(i){ return i.comp.toLowerCase(); }).join(', '), costo:v });
        if (!v) o.sinCosto.push(m);
      });
      return o;
    },
    /* p = { desde, hasta, hoy, maquinas:[cod], prog:{ fecha:{ cod:{ labor, lotes } } }, cierres:[…],
             trabajo(cod, f), parado(cod, f), combustible:{ cod:{ gal, costo } } (Operacion.combustible) } */
    calcular: function(p){
      var O = { prog:0, cumplidas:0, otraLabor:0, otrosLotes:0, noTrabajo:0, sinCierre:0, sinDato:0, enTaller:0, sinProgramar:0, conDato:0,
        porMaq:{}, sinProg:[], labor:{}, lotes:{}, horas:0, gal:0, costo:0 };
      var hy = p.hoy, porDia = {};
      p.cierres.forEach(function(c){ (porDia[c.cod + '|' + c.fecha] = porDia[c.cod + '|' + c.fecha] || []).push(c); });
      function pm(cod){ return O.porMaq[cod] = O.porMaq[cod] || { cod:cod, prog:0, cumplidas:0, otras:0, noTrabajo:0, sinCierre:0 }; }
      var hasta = p.hasta > hy ? hy : p.hasta;
      for (var f = p.desde; f <= hasta; f = sumar(f, 1)){
        if (window.Festivos && !Festivos.laboral(f)) continue;
        p.maquinas.forEach(function(cod){
          var k = cod + '|' + f, pr = p.prog[f] && p.prog[f][cod], cs = porDia[k] || [], trabajo = cs.length || p.trabajo(cod, f);
          var est = cs.filter(function(x){ return x.laborId; });
          if (est.length) O.conDato++;
          if (!pr){ if ((trabajo && f < hy) || cs.length){ O.sinProgramar++; O.sinProg.push({ cod:cod, fecha:f, labor: est.length ? window.laborTxt(est[0].laborId) : '' }); } return; }
          if (f === hy && !cs.length) return;                // hoy todavía no termina
          var x = pm(cod);
          if (p.parado(cod, f)){ O.enTaller++; return; }
          O.prog++; x.prog++;
          if (est.some(function(c){ return c.segun === 'Sí'; })){ O.cumplidas++; x.cumplidas++; }
          else if (est.some(function(c){ return c.segun === 'Otros lotes'; })){ O.otrosLotes++; x.otras++; }
          else if (est.length){ O.otraLabor++; x.otras++; }
          else if (cs.length) O.sinDato++;
          else if (trabajo){ O.sinCierre++; x.sinCierre++; }
          else { O.noTrabajo++; x.noTrabajo++; }
        });
      }
      var maq = {}; p.maquinas.forEach(function(c){ maq[c] = true; });
      function alLote(ls, horas, gal, costo){
        if (!ls.length) return;
        var ha = ls.map(function(l){ return window.Lotes.ha(l) || 0; }), tot = ha.reduce(function(a, v){ return a + v; }, 0);
        ls.forEach(function(l, i){
          var w = tot ? ha[i] / tot : 1 / ls.length, y = O.lotes[l] = O.lotes[l] || { lote:l, ha:ha[i], horas:0, gal:0, costo:0, finca:'' };
          y.horas += horas * w; y.gal += gal * w; y.costo += costo * w;
        });
      }
      function lab(id){ return O.porLabor[id] = O.porLabor[id] || { id:id, txt: id === 'sin' ? 'Sin labor registrada' : window.laborTxt(id), horas:0, gal:0, costo:0 }; }
      O.porLabor = {};
      // horas: los cierres con la labor confirmada
      var unidades = {};   // por máquina: [{ laborId, lotes, horas }] para repartir su combustible
      p.cierres.forEach(function(c){
        if (c.fecha < p.desde || c.fecha > p.hasta || !maq[c.cod]) return;
        var id = c.laborId, ls = c.lotes, h = c.horas > 0 ? c.horas : 0;
        if (id && h){ O.horas += h; lab(id).horas += h; alLote(window.Lotes.partir(ls), h, 0, 0); }
        if (!id){   // cierre sin la labor: la de la programación de ese día
          var pr = p.prog[c.fecha] && p.prog[c.fecha][c.cod];
          id = pr ? window.laborId(pr.labor || pr) : ''; ls = pr && pr.lotes ? pr.lotes : '';
        }
        if (h) (unidades[c.cod] = unidades[c.cod] || []).push({ id: id || 'sin', lotes:ls, horas:h });
      });
      // combustible: lo realmente despachado a cada máquina, repartido por las horas de sus labores y lotes;
      // sin cierres con horas, por los días programados; los camiones, a transporte
      Object.keys(p.combustible || {}).forEach(function(cod){
        var g = p.combustible[cod]; if (!g || !(g.gal > 0)) return;
        O.gal += g.gal; O.costo += g.costo;
        var u = unidades[cod];
        if (!u && !maq[cod]) u = [{ id:'transporte', lotes:'', horas:1 }];
        if (!u){
          u = [];
          Object.keys(p.prog).forEach(function(f){ var pr = p.prog[f][cod]; if (pr && f >= p.desde && f <= p.hasta) u.push({ id: window.laborId(pr.labor || pr) || 'sin', lotes: pr.lotes || '', horas:1 }); });
          if (!u.length) u = [{ id:'sin', lotes:'', horas:1 }];
        }
        var tot = u.reduce(function(a, x){ return a + x.horas; }, 0);
        u.forEach(function(x){
          var w = x.horas / tot, gl = g.gal * w, cs = g.costo * w, l = lab(x.id);
          l.gal += gl; l.costo += cs;
          alLote(window.Lotes.partir(x.lotes), 0, gl, cs);
        });
      });
      var fin = {}; (window.Lotes.lista() || []).forEach(function(x){ fin[x.cod] = x.finca; });
      O.listaLotes = Object.keys(O.lotes).map(function(l){ var y = O.lotes[l]; y.finca = fin[l] || ''; y.porHa = y.ha ? y.horas / y.ha : null; y.galHa = y.ha ? y.gal / y.ha : null; return y; })
        .sort(function(a, b){ return b.horas - a.horas || b.gal - a.gal; });
      O.listaLabor = Object.keys(O.porLabor).map(function(id){ return O.porLabor[id]; }).sort(function(a, b){ return b.horas - a.horas || b.gal - a.gal; });
      O.labor = {}; O.listaLabor.forEach(function(x){ if (x.horas) O.labor[x.id] = x.horas; });
      O.pct = O.prog ? O.cumplidas / O.prog * 100 : null;
      return O;
    }
  };
})();
