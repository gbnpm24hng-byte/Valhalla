(function () {
  // v0.9.53: motivo de un "Cambiar ejercicio" de Modo Grupo (molestia, máquina ocupada u otro).
  // Se guarda opcional en el cambio del alumno (trainingsV08.clientOverrides[].reason):
  //   reason: { kind: 'pain' | 'busy' | 'other', zones?: [...], side?: 'left' | 'right' | 'both', note?: '...' }
  // Sube a la nube con trainingsV08 (coach_state, privado del entrenador) y NUNCA se publica:
  // el alumno no ve el motivo. Un cambio sin motivo funciona igual que antes.
  // Aquí viven también la lista de ejercicios que van "al final" según la molestia y el orden
  // de los reemplazos sugeridos. Puro: no guarda, no dibuja, no toca la red.

  const KINDS = ['pain', 'busy', 'other'];

  const KIND_LABELS = { pain: 'Molestia', busy: 'Máquina ocupada', other: 'Otro' };

  // Zonas de molestia, en el orden de los chips. sided: lleva lado (Izq / Der / Ambos).
  const PAIN_ZONES = [
    { key: 'cuello', label: 'Cuello', text: 'cuello', sided: false },
    { key: 'hombro', label: 'Hombro', text: 'hombro', plural: 'ambos hombros', sided: true },
    { key: 'codo', label: 'Codo', text: 'codo', plural: 'ambos codos', sided: true },
    { key: 'muneca', label: 'Muñeca', text: 'muñeca', plural: 'ambas muñecas', sided: true },
    { key: 'espaldaAlta', label: 'Espalda alta', text: 'espalda alta', sided: false },
    { key: 'lumbar', label: 'Lumbar', text: 'lumbar', sided: false },
    { key: 'cadera', label: 'Cadera', text: 'cadera', plural: 'ambas caderas', sided: true },
    { key: 'rodilla', label: 'Rodilla', text: 'rodilla', plural: 'ambas rodillas', sided: true },
    { key: 'tobillo', label: 'Tobillo', text: 'tobillo', plural: 'ambos tobillos', sided: true }
  ];

  const SIDES = ['left', 'right', 'both'];
  const SIDE_LABELS = { left: 'Izq', right: 'Der', both: 'Ambos' };
  const SIDE_TEXT = { left: 'izq.', right: 'der.' };

  const NOTE_MAX = 80;

  // ÚNICO lugar de la lista "al final": con una molestia en esa zona, los reemplazos cuyo
  // nombre contiene alguno de estos textos (sin tildes ni mayúsculas) se muestran al final de
  // los sugeridos, marcados; nunca se ocultan. Incluye sinónimos que usa la galería.
  const CAUTION_BY_ZONE = {
    lumbar: ['peso muerto', 'deadlift', 'sentadilla trasera', 'back squat', 'buenos dias', 'good morning', 'remo con barra', 'remo barra', 'barbell row'],
    rodilla: ['estocada', 'zancada', 'lunge', 'bulgara', 'bulgarian', 'salto', 'jump'],
    hombro: ['press militar', 'military press', 'overhead press', 'tras nuca', 'behind the neck']
  };

  const SUGGESTION_LIMIT = 8;

  function fold(value) {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function zoneInfo(key) {
    return PAIN_ZONES.find((zone) => zone.key === key) || null;
  }

  // Lo que se guarda: solo campos conocidos y válidos. null si no hay motivo.
  function normalizeReason(raw) {
    if (!raw || typeof raw !== 'object' || !KINDS.includes(raw.kind)) {
      return null;
    }
    const reason = { kind: raw.kind };
    if (raw.kind === 'pain') {
      const wanted = new Set(Array.isArray(raw.zones) ? raw.zones.map(String) : []);
      const zones = PAIN_ZONES.filter((zone) => wanted.has(zone.key)).map((zone) => zone.key);
      reason.zones = zones;
      if (SIDES.includes(raw.side) && zones.some((key) => zoneInfo(key).sided)) {
        reason.side = raw.side;
      }
    }
    const note = String(raw.note ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
    if (note && raw.kind !== 'busy') {
      reason.note = note;
    }
    return reason;
  }

  function hasSidedZone(zones) {
    return (Array.isArray(zones) ? zones : []).some((key) => zoneInfo(key)?.sided);
  }

  function joinList(items) {
    if (items.length <= 1) {
      return items[0] || '';
    }
    return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
  }

  // "rodilla der.", "ambas rodillas", "rodilla der. y lumbar". Vacío si no hay zonas.
  function painPlace(reason) {
    const value = normalizeReason(reason);
    if (!value || value.kind !== 'pain') {
      return '';
    }
    return joinList(value.zones.map((key) => {
      const zone = zoneInfo(key);
      if (!zone.sided || !value.side) {
        return zone.text;
      }
      return value.side === 'both' ? zone.plural : `${zone.text} ${SIDE_TEXT[value.side]}`;
    }));
  }

  // Etiqueta de la tarjeta del ejercicio: "Molestia: rodilla der.", "Máquina ocupada", "Otro: nota".
  function tagText(reason) {
    const value = normalizeReason(reason);
    if (!value) {
      return '';
    }
    if (value.kind === 'pain') {
      const place = painPlace(value);
      return place ? `Molestia: ${place}` : 'Molestia';
    }
    if (value.kind === 'busy') {
      return 'Máquina ocupada';
    }
    return value.note ? `Otro: ${value.note}` : 'Otro motivo';
  }

  // Historial y Progreso: "Cambiado por molestia en rodilla der." (+ la nota, si hay).
  function historyText(reason) {
    const value = normalizeReason(reason);
    if (!value) {
      return '';
    }
    if (value.kind === 'busy') {
      return 'Cambiado por máquina ocupada';
    }
    if (value.kind === 'other') {
      return value.note ? `Cambiado: ${value.note}` : 'Cambiado por otro motivo';
    }
    const place = painPlace(value);
    return `Cambiado por molestia${place ? ` en ${place}` : ''}${value.note ? ` (${value.note})` : ''}`;
  }

  // "molestia en hombro izq." (Hoy y Ficha).
  function painPhrase(reason) {
    const place = painPlace(reason);
    return place ? `molestia en ${place}` : 'molestia';
  }

  function dayDiff(from, to) {
    return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
  }

  function addDays(date, days) {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // "el miércoles" (hace menos de una semana), "ayer", o "el 3 nov".
  function whenText(date, today) {
    const diff = dayDiff(date, today);
    const value = new Date(`${date}T12:00:00Z`);
    if (diff === 1) {
      return 'ayer';
    }
    if (diff > 1 && diff < 7) {
      return `el ${WEEKDAYS[value.getUTCDay()]}`;
    }
    return `el ${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]}`;
  }

  // Hoy: "Beto: molestia en hombro izq. el miércoles".
  function todayText(name, reason, date, today) {
    return `${name}: ${painPhrase(reason)} ${whenText(date, today)}`;
  }

  function isPain(override) {
    return normalizeReason(override?.reason)?.kind === 'pain';
  }

  // Cambios con motivo de molestia de un alumno en los últimos `days` días (hasta hoy),
  // del más reciente al más antiguo.
  function recentPain(overrides, clientId, today, days = 28) {
    const from = addDays(today, -(days - 1));
    return (Array.isArray(overrides) ? overrides : [])
      .filter((item) => item && item.clientId === clientId && isPain(item)
        && String(item.date || '') >= from && String(item.date || '') <= today)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  // Aviso de Hoy en la próxima clase: la molestia más reciente de los últimos `days` días,
  // anterior a hoy, si el alumno no entrenó entre ese día y hoy (sessionDates: fechas con
  // trabajo registrado). null si no corresponde.
  function nextClassNotice(overrides, clientId, today, sessionDates, days = 14) {
    const dates = Array.isArray(sessionDates) ? sessionDates : [];
    const found = recentPain(overrides, clientId, today, days).find((item) => item.date < today);
    if (!found || dates.some((date) => date > found.date && date < today)) {
      return null;
    }
    return found;
  }

  // ¿Va "al final" con esta molestia? Devuelve la zona de molestia que lo marca, o ''.
  function cautionZone(exerciseName, reason) {
    const value = normalizeReason(reason);
    if (!value || value.kind !== 'pain') {
      return '';
    }
    const name = fold(exerciseName);
    return value.zones.find((key) => (CAUTION_BY_ZONE[key] || []).some((term) => name.includes(term))) || '';
  }

  // Reemplazos sugeridos: ejercicios de la galería que trabajan alguna zona principal del
  // original. candidates: [{ id, name, zones: { main, sec } }]. Orden: más zonas principales
  // en común, después más secundarias en común, después nombre. Con molestia, los de la lista
  // "al final" van después de los demás (marcados con caution) y siempre se muestran.
  // Devuelve [{ ...candidato, caution: '' | zona }].
  function suggest({ candidates, original, reason, excludeIds = [], limit = SUGGESTION_LIMIT }) {
    const main = new Set(original?.main || []);
    if (!main.size) {
      return [];
    }
    const sec = new Set([...(original?.sec || [])]);
    const skip = new Set(excludeIds.filter(Boolean));
    const scored = (Array.isArray(candidates) ? candidates : [])
      .filter((item) => item && item.id && !skip.has(item.id))
      .map((item) => {
        const itemMain = item.zones?.main || [];
        const itemSec = item.zones?.sec || [];
        return {
          item,
          mainHits: itemMain.filter((zone) => main.has(zone)).length,
          secHits: [...itemMain, ...itemSec].filter((zone) => sec.has(zone)).length
        };
      })
      .filter((entry) => entry.mainHits > 0)
      .sort((a, b) => (b.mainHits - a.mainHits) || (b.secHits - a.secHits)
        || String(a.item.name || '').localeCompare(String(b.item.name || ''), 'es', { sensitivity: 'base' }));
    const good = [];
    const caution = [];
    scored.forEach(({ item }) => {
      const zone = cautionZone(item.name, reason);
      (zone ? caution : good).push({ ...item, caution: zone });
    });
    return [...good.slice(0, limit), ...caution];
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.swapReason = {
    KINDS,
    KIND_LABELS,
    PAIN_ZONES,
    SIDES,
    SIDE_LABELS,
    NOTE_MAX,
    CAUTION_BY_ZONE,
    SUGGESTION_LIMIT,
    normalizeReason,
    hasSidedZone,
    painPlace,
    tagText,
    historyText,
    painPhrase,
    whenText,
    todayText,
    isPain,
    recentPain,
    nextClassNotice,
    cautionZone,
    suggest
  };
})();
