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
       de cada página: {hoja, fila, encabezados, id}. */
    fila: function(tipo, datos, persona){
      var d = new Date(), id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      M[tipo] = { id: id, datos: copia(datos) };
      guardarLocal(M);
      return { hoja: 'Maestros', id: 'maestro:' + tipo, encabezados: ENC,
        fila: [d.toLocaleDateString('es-CO'), p2(d.getHours()) + ':' + p2(d.getMinutes()), tipo, id, JSON.stringify(datos), persona || ''] };
    },
    /* Lee la hoja; "pendientes" son los tipos que este celular todavía no
       ha enviado (no se pisan con lo de la hoja). Devuelve true si cambió algo. */
    traer: async function(pendientes){
      pendientes = pendientes || {};
      var r = await fetch(GS_URL + '?hoja=Maestros&t=' + Date.now());
      var d = await r.json();
      if (!d || !d.ok || !Array.isArray(d.datos)) return false;
      var ult = {};
      d.datos.forEach(function(row){
        var tipo = String(row[2] || '').trim(), id = String(row[3] || '').trim();
        if (!tipo || !id) return;
        try { ult[tipo] = { id: id, datos: JSON.parse(String(row[4] || '')) }; } catch(e){}
      });
      var cambio = false;
      Object.keys(ult).forEach(function(t){
        if (pendientes[t]) return;
        if (!M[t] || M[t].id !== ult[t].id){ M[t] = ult[t]; cambio = true; }
      });
      if (cambio) guardarLocal(M);
      return cambio;
    }
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
