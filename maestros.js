/* =====================================================================
   MAESTROS COMPARTIDOS — Palma Grande S.A.S.
   La lista de máquinas (y en Programación los lotes, fincas e implementos)
   es una sola para Taller, Programación y Gerencia. Vive en la hoja
   "Maestros" del mismo Apps Script: cada cambio agrega una fila con la
   lista completa en JSON, y vale la última fila de cada tipo. La columna 4
   es un ID único, así el Apps Script siempre agrega y nunca sobrescribe.
   Cada página guarda una copia en el celular para funcionar sin señal.
   ===================================================================== */
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
  var NOMBRES = { FLOTA:'la lista de máquinas', MTTO:'los mantenimientos', OPERARIOS:'los tractoristas',
    SUPERVISORES:'los supervisores', LOTES:'los lotes', FINCAS:'las fincas', IMPL:'los implementos' };

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
  function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; }
  /* "#05 - John Deere 2850", "05 - KUBOTA…", "FORD" → código de la flota */
  function codDe(txt){
    var t = String(txt || '').trim().toUpperCase();
    var f = window.Maestros.flotaTodas().filter(function(x){ return t === x.cod.toUpperCase() || t.indexOf(x.cod.toUpperCase() + ' ') === 0; })[0];
    if (f) return f.cod;
    var m = t.match(/^#?\s*0*(\d{1,2})\b/); return m ? '#' + p2(+m[1]) : t;
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
    /* último horómetro conocido por máquina: { cod: { h, fecha } } */
    ultimo: function(){ return H.ultimo || {}; },
    /* cierres de jornada: [{ cod, fecha, final, inicial, horas, operario }] */
    cierres: function(){ return H.cierres || []; },
    traer: async function(){
      var res = await Promise.all([leer('PreopDiario'), leer('CierreJornada'), leer('Preoperativos')]
        .map(function(p){ return p.catch(function(){ return null; }); }));
      if (!res[0] && !res[1] && !res[2]) return false;
      var ult = {}, cierres = [], inicioDia = {};
      function anotar(cod, f, h){
        if (h == null || h <= 0 || !cod || !f) return;
        if (!ult[cod] || f > ult[cod].fecha || (f === ult[cod].fecha && h > ult[cod].h)) ult[cod] = { fecha:f, h:h };
      }
      // horómetro con que arrancó cada máquina cada día (el menor si hubo dos preoperativos)
      function inicio(cod, f, h){
        anotar(cod, f, h);
        if (h == null || h <= 0 || !cod || !f) return;
        var k = cod + '|' + f;
        if (inicioDia[k] == null || h < inicioDia[k]) inicioDia[k] = h;
      }
      (res[0] || []).forEach(function(r){ inicio(codDe(r[3]), aIso(r[0]), num(r[7])); });
      (res[2] || []).forEach(function(r){ inicio(codDe(r[3]), aIso(r[0]), num(r[6])); });   // Preoperativo anterior
      var filas = (res[1] || []).map(function(r){
        return { cod:codDe(r[3]), fecha:aIso(r[0]), final:num(r[4]), inicial:num(r[5]), horas:num(r[6]), operario:String(r[2]||'') };
      }).filter(function(c){ return c.cod && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha); })
        .sort(function(a, b){ return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.final || 0) - (b.final || 0); });
      var previo = {};
      filas.forEach(function(c){
        // Las filas viejas tienen texto (Estado, Novedad) en esas columnas: num() da null.
        if (c.inicial == null) c.inicial = inicioDia[c.cod + '|' + c.fecha] != null ? inicioDia[c.cod + '|' + c.fecha] : null;
        if (c.inicial == null && previo[c.cod] && c.fecha > previo[c.cod].fecha) c.inicial = previo[c.cod].final;   // el cierre anterior
        if (c.horas == null && c.final != null && c.inicial != null) c.horas = Math.round((c.final - c.inicial) * 10) / 10;
        if (c.horas != null && (c.horas < 0 || c.horas > 24)) c.horas = null;   // horómetro mal digitado: no se cuenta
        anotar(c.cod, c.fecha, c.final);
        if (c.final != null && c.final > 0) previo[c.cod] = c;
        cierres.push(c);
      });
      H = { ultimo: ult, cierres: cierres, leido: new Date().toISOString() };
      try { localStorage.setItem(KEY, JSON.stringify(H)); } catch(e){}
      return true;
    }
  };

  window.Mtto = {
    INTERVALO: 250,     // horas entre mantenimientos, si la máquina no tiene otro
    AVISO: 25,          // se avisa cuando faltan estas horas o menos
    /* { cod: { hor, fecha, por, intervalo } } guardado en Maestros (tipo MTTO) */
    datos: function(){ return window.Maestros.get('MTTO') || {}; },
    /* estado del mantenimiento con el horómetro actual (o el último conocido) */
    estado: function(cod, horActual){
      var d = this.datos()[cod], u = window.Horometros.ultimo()[cod];
      var actual = horActual != null ? horActual : (u ? u.h : null);
      if (!d || d.hor == null) return { nivel:'sindato', actual:actual };
      var intervalo = d.intervalo || this.INTERVALO, proximo = d.hor + intervalo;
      if (actual == null) return { nivel:'sinhorometro', ultimo:d.hor, fecha:d.fecha, intervalo:intervalo, proximo:proximo };
      var faltan = Math.round((proximo - actual) * 10) / 10;
      return { nivel: faltan <= 0 ? 'vencido' : faltan <= this.AVISO ? 'proximo' : 'ok', actual:actual, ultimo:d.hor, fecha:d.fecha,
               por:d.por, intervalo:intervalo, proximo:proximo, faltan:faltan };
    }
  };
})();
