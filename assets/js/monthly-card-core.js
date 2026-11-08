(function () {
  // v0.9.47 · Tarjeta del mes (sin pantalla ni red): qué se guarda y qué números lleva la tarjeta.
  //
  // Dato (opcional; sin él todo funciona como antes):
  //   state.trainingsV08.monthlyCards = { 'AAAA-MM': { '<clientId>': { message?, sentAt? } } }
  //   message: texto del entrenador en la tarjeta (máx. 140 caracteres; vacío = sin recuadro).
  //   sentAt: fecha ISO en que se marcó "Enviada". Vive dentro de trainingsV08, así que sube a
  //   coach_state con el resto de los entrenamientos (no se publica al alumno).
  //
  // Números del mes: los mismos cálculos de la app, que app.js le pasa como funciones (helpers):
  //   * récords: la regla de la ficha y de Progreso (la carga máxima del día supera todo lo anterior;
  //     el primer registro nunca es récord). Por tiempo compara segundos, aparte de los kilos.
  //   * racha: weekStreak de la vista del alumno, cortada al último día del mes.
  //   * series: solo efectivas (S) hechas. Los circuitos viven en session.circuits: no cuentan.

  const MESSAGE_MAX = 140;
  const RECORDS_MAX = 4;
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  // Corta por caracteres reales (un emoji cuenta como uno, no se parte por la mitad).
  function cleanMessage(value) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return [...text].slice(0, MESSAGE_MAX).join('');
  }

  function isMonth(value) {
    return typeof value === 'string' && MONTH_RE.test(value);
  }

  function monthLabel(month) {
    if (!isMonth(month)) return '';
    return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
  }

  function shiftMonth(month, delta) {
    const year = Number(month.slice(0, 4));
    const index = Number(month.slice(5, 7)) - 1 + delta;
    const date = new Date(Date.UTC(year, index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function monthDays(month) {
    const year = Number(month.slice(0, 4));
    const count = new Date(Date.UTC(year, Number(month.slice(5, 7)), 0)).getUTCDate();
    return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
  }

  // ---- Dato guardado ----

  // Solo meses AAAA-MM, ids de texto y, por alumno, message (texto) y sentAt (fecha ISO).
  // Lo demás de cada entrada se conserva (una versión más nueva puede agregar campos).
  function normalizeEntry(raw) {
    if (!isPlainObject(raw)) return null;
    const entry = {};
    Object.keys(raw).forEach((key) => {
      if (key !== 'message' && key !== 'sentAt' && raw[key] !== undefined) entry[key] = raw[key];
    });
    const message = cleanMessage(raw.message);
    if (message) entry.message = message;
    if (typeof raw.sentAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.sentAt)) entry.sentAt = raw.sentAt.slice(0, 40);
    return Object.keys(entry).length ? entry : null;
  }

  function normalizeMonthlyCards(raw) {
    const cards = {};
    if (!isPlainObject(raw)) return cards;
    Object.keys(raw).filter(isMonth).forEach((month) => {
      if (!isPlainObject(raw[month])) return;
      const byClient = {};
      Object.keys(raw[month]).forEach((clientId) => {
        if (!clientId || clientId.length > 120 || clientId === '__proto__') return;
        const entry = normalizeEntry(raw[month][clientId]);
        if (entry) byClient[clientId] = entry;
      });
      if (Object.keys(byClient).length) cards[month] = byClient;
    });
    return cards;
  }

  function getEntry(cards, month, clientId) {
    const byClient = isPlainObject(cards) && isPlainObject(cards[month]) ? cards[month] : null;
    return byClient && own(byClient, clientId) && isPlainObject(byClient[clientId]) ? byClient[clientId] : {};
  }

  // Devuelve una copia con el cambio (nunca toca el objeto recibido).
  function withEntry(cards, month, clientId, change) {
    if (!isMonth(month) || !clientId) return normalizeMonthlyCards(cards);
    const next = normalizeMonthlyCards(cards);
    const merged = { ...(next[month]?.[clientId] || {}), ...change };
    Object.keys(merged).forEach((key) => merged[key] === undefined && delete merged[key]);
    const entry = normalizeEntry(merged);
    next[month] = { ...(next[month] || {}) };
    if (entry) next[month][clientId] = entry;
    else delete next[month][clientId];
    if (!Object.keys(next[month]).length) delete next[month];
    return next;
  }

  function setMessage(cards, month, clientId, message) {
    return withEntry(cards, month, clientId, { message: cleanMessage(message) || undefined });
  }

  function markSent(cards, month, clientId, isoDate) {
    return withEntry(cards, month, clientId, { sentAt: String(isoDate || new Date().toISOString()) });
  }

  // ---- Números del mes ----

  const lowerName = (exercise) => String(exercise?.exerciseName || '').trim().toLowerCase();

  // Por ejercicio (nombre, y aparte "::time" si es por tiempo) y por fecha: la carga máxima de las
  // series hechas (kilos; segundos si es por tiempo). Igual que la ficha y Progreso.
  function topByExercise(sessions, h) {
    const byKey = new Map();
    sessions.forEach((session) => h.getExercises(session).forEach((exercise) => {
      const name = lowerName(exercise);
      const timed = h.isTimed(exercise);
      const key = timed && name ? `${name}::time` : name;
      const top = h.getSets(exercise).reduce((max, setEntry) => {
        const value = Number(timed ? setEntry.seconds : setEntry.weight);
        return setEntry.completed !== false && Number.isFinite(value) && value > 0 ? Math.max(max, value) : max;
      }, 0);
      if (!key || !top) return;
      const item = byKey.get(key) || { timed, name: '', perDate: new Map() };
      item.name = String(exercise.exerciseName || '').trim() || item.name;
      item.perDate.set(session.date, Math.max(item.perDate.get(session.date) || 0, top));
      byKey.set(key, item);
    }));
    return byKey;
  }

  // Récords del mes. count = cada día en que un ejercicio superó todo lo anterior (como la ficha).
  // list = un renglón por ejercicio con récord: lo mejor del mes y la subida contra lo mejor ANTES
  // del mes (sin registro antes → sin subida). Orden: mayor subida en porcentaje (así kilos y
  // segundos se comparan parejo); los que no tienen subida van al final.
  function monthRecords(sessions, month, h) {
    let count = 0;
    const list = [];
    topByExercise(sessions, h).forEach((item) => {
      let best = 0;
      let before = 0;
      let monthBest = 0;
      [...item.perDate.keys()].sort().forEach((date) => {
        const top = item.perDate.get(date);
        if (date < `${month}-01`) before = Math.max(before, top);
        if (best > 0 && top > best && date.startsWith(month)) {
          count += 1;
          monthBest = Math.max(monthBest, top);
        }
        best = Math.max(best, top);
      });
      if (!monthBest) return;
      const delta = before > 0 ? Math.round((monthBest - before) * 100) / 100 : null;
      list.push({ name: item.name, unit: item.timed ? 's' : 'kg', value: monthBest, delta, ratio: before > 0 ? (monthBest - before) / before : -1 });
    });
    list.sort((a, b) => (b.ratio - a.ratio) || (b.value - a.value) || a.name.localeCompare(b.name));
    return { count, list: list.slice(0, RECORDS_MAX).map(({ ratio, ...rest }) => rest) };
  }

  // Clases planificadas del mes con la regla de la asistencia de la ficha: los días de la semana
  // en que entrena (un día que no pasó todavía cuenta solo si ya entrenó) o, sin días, sus
  // sesiones por semana prorrateadas. Sin ninguno de los dos datos: null (se muestra solo "11").
  function plannedClasses({ month, today, weekdays, perWeek, dates }) {
    const days = monthDays(month).filter((date) => date < today || dates.has(date));
    if (Array.isArray(weekdays) && weekdays.length) {
      return days.filter((date) => weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay() || 7)).length || null;
    }
    const weekly = Number(perWeek || 0);
    return weekly > 0 && days.length ? Math.max(1, Math.round((weekly * days.length) / 7)) : null;
  }

  // Zonas de la figura por series efectivas del mes: trabaja suma las series, ayuda la mitad.
  // tone 3 / 2 / 1 = de más a menos trabajada (tercios del máximo).
  function monthZones(sessions, h) {
    const load = new Map();
    sessions.forEach((session) => h.getExercises(session).forEach((exercise) => {
      const done = h.getSets(exercise).filter((setEntry) => setEntry.completed !== false && h.setType(setEntry) === 'S').length;
      if (!done) return;
      const zones = h.zonesOf(exercise) || { main: [], sec: [] };
      (zones.main || []).forEach((zone) => load.set(zone, (load.get(zone) || 0) + done));
      (zones.sec || []).forEach((zone) => load.set(zone, (load.get(zone) || 0) + done / 2));
    }));
    const max = Math.max(0, ...load.values());
    const tones = {};
    load.forEach((value, zone) => {
      if (value > 0) tones[zone] = value >= max * (2 / 3) ? 3 : value >= max / 3 ? 2 : 1;
    });
    return tones;
  }

  // Todo lo que lleva la tarjeta de un alumno en un mes.
  //   sessions: sus sesiones con trabajo y con fecha hasta hoy (como la ficha).
  //   attendedDates: fechas con asistencia marcada (hasta hoy).
  function buildCardData({ month, today, firstName, sessions, attendedDates = [], weekdays = [], perWeek = 0, message = '' }, h) {
    const monthEnd = monthDays(month).pop();
    const limit = today < monthEnd ? today : monthEnd;
    const upToMonth = sessions.filter((session) => session.date && session.date <= limit);
    const inMonth = upToMonth.filter((session) => session.date.startsWith(month));
    const allDates = new Set([...upToMonth.map((session) => session.date), ...attendedDates.filter((date) => date <= limit)]);
    const monthDates = new Set([...allDates].filter((date) => date.startsWith(month)));
    const records = monthRecords(upToMonth, month, h);
    const streak = h.weekStreak ? h.weekStreak(allDates, limit) : 0;
    const effectiveSets = inMonth.reduce((sum, session) => sum + h.getExercises(session)
      .reduce((total, exercise) => total + h.getSets(exercise).filter((setEntry) => setEntry.completed !== false && h.setType(setEntry) === 'S').length, 0), 0);
    return {
      month,
      monthLabel: monthLabel(month),
      firstName: String(firstName || '').trim().split(/\s+/)[0] || 'Alumno',
      classes: monthDates.size,
      planned: plannedClasses({ month, today, weekdays, perWeek, dates: monthDates }),
      recordCount: records.count,
      records: records.list,
      streak,
      effectiveSets,
      zones: monthZones(inMonth, h),
      message: cleanMessage(message)
    };
  }

  // Textos de la tarjeta (los usa el dibujo y la lista).
  const fmtNumber = (value) => String(Math.round(Number(value || 0) * 100) / 100).replace('.', ',');

  function recordText(record) {
    const value = `${fmtNumber(record.value)} ${record.unit}`;
    return { name: record.name, value, delta: record.delta && record.delta > 0 ? `↑${fmtNumber(record.delta)}` : '' };
  }

  function boxes(data) {
    return [
      { key: 'classes', value: data.planned ? `${data.classes}/${data.planned}` : String(data.classes), label: 'clases' },
      { key: 'records', value: String(data.recordCount), label: data.recordCount === 1 ? 'récord' : 'récords' },
      data.streak > 0
        ? { key: 'streak', value: String(data.streak), label: data.streak === 1 ? 'semana seguida' : 'semanas seguidas' }
        : { key: 'sets', value: String(data.effectiveSets), label: 'series' }
    ];
  }

  // "11 clases · 4 récords" de la fila de la lista.
  function summaryLine(data) {
    const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
    return `${plural(data.classes, 'clase', 'clases')} · ${plural(data.recordCount, 'récord', 'récords')}`;
  }

  const api = {
    MESSAGE_MAX,
    RECORDS_MAX,
    SHARE_TEXT: 'Tu mes en Vikingos Radical 💪',
    EMPTY_RECORDS_TEXT: 'Este mes sumaste base. El próximo vamos por récords.',
    cleanMessage,
    isMonth,
    monthLabel,
    shiftMonth,
    monthDays,
    normalizeMonthlyCards,
    getEntry,
    setMessage,
    markSent,
    monthRecords,
    plannedClasses,
    monthZones,
    buildCardData,
    recordText,
    boxes,
    summaryLine,
    fmtNumber
  };

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.VALHALLA = root.VALHALLA || {};
  root.VALHALLA.monthlyCardCore = api;
})();
