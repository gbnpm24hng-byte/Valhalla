(function () {
  // v0.9.61 · "Mi semana" en Hoy (sin red ni pantalla; lo usan app.js y week-grid.js).
  //
  // Grilla Lun a Vie × 08:00 a 20:00, un bloque por hora. Las clases vienen de
  // getAgendaSlotsForDate (app.js), la MISMA lectura de hora que las tarjetas de Hoy, con
  // "Cambiar de clase · Solo un día" incluido. Cada clase dura 60 min: una de 11:15 ocupa 11 y 12.
  //   busy = alguna clase toca esa hora · free = libre · off = fuera del horario de trabajo.
  //
  // Horario de trabajo (opcional): trainingsV08.workHours = { days: { '1': [{ from, to }], … '5': … } }
  // (1 = lunes; uno o dos tramos por día; un día sin tramos = no trabaja). Sube con trainingsV08 en
  // coach_state. Sin workHours, todo lo que no está ocupado es libre.
  //
  // v0.9.62 · Bloqueos y horas extra (todo opcional, dentro del mismo workHours):
  //   blocked:     [{ day: 1..5, hour }]  "Bloquear esta hora (todas las semanas)"
  //   weekBlocked: [{ date, hour }]       "Bloquear solo esta semana" (esa fecha)
  //   extra:       [{ date, hour }]       "Marcar disponible solo esta semana" (hora fuera de horario)
  // Una hora bloqueada se ve gris con rayas ('blocked') y no sale en la imagen. Una clase manda sobre
  // todo (ocupado). days puede faltar (sin horario) y aun así haber bloqueos.
  //
  // La imagen para compartir usa shareData(): solo días, horas y libre sí/no (sin nombres ni clases).

  const FIRST_HOUR = 8;
  const LAST_HOUR = 20;
  const CLASS_MINUTES = 60;
  const DAYS = [
    { n: 1, short: 'Lun', long: 'Lunes' },
    { n: 2, short: 'Mar', long: 'Martes' },
    { n: 3, short: 'Mié', long: 'Miércoles' },
    { n: 4, short: 'Jue', long: 'Jueves' },
    { n: 5, short: 'Vie', long: 'Viernes' }
  ];
  const MAX_RANGES = 2;
  const DEFAULT_WORK_HOURS = {
    days: {
      1: [{ from: '08:30', to: '15:00' }, { from: '17:00', to: '20:00' }],
      2: [{ from: '08:30', to: '15:00' }, { from: '17:00', to: '20:00' }],
      3: [{ from: '08:30', to: '15:00' }, { from: '17:00', to: '20:00' }],
      4: [{ from: '08:30', to: '15:00' }, { from: '17:00', to: '20:00' }],
      5: [{ from: '08:30', to: '12:30' }, { from: '17:00', to: '20:15' }]
    }
  };
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // "08:30" → 510; "8:30" también. Otra cosa → null.
  function minutes(value) {
    const match = String(value || '').trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  function clock(total) {
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function hours() {
    const list = [];
    for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour += 1) list.push(hour);
    return list;
  }

  // Tramos válidos de un día (desde < hasta, sin cruzarse), ordenados. Lo inválido se descarta.
  function cleanRanges(list) {
    const ranges = (Array.isArray(list) ? list : [])
      .map((range) => ({ from: minutes(range && range.from), to: minutes(range && range.to) }))
      .filter((range) => range.from !== null && range.to !== null && range.from < range.to)
      .sort((a, b) => a.from - b.from)
      .slice(0, MAX_RANGES);
    return ranges.filter((range, index) => index === 0 || range.from >= ranges[index - 1].to)
      .map((range) => ({ from: clock(range.from), to: clock(range.to) }));
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const isHour = (value) => Number.isInteger(value) && value >= FIRST_HOUR && value <= LAST_HOUR;

  function cleanDayHours(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
      .map((item) => ({ day: Number(item && item.day), hour: Number(item && item.hour) }))
      .filter((item) => DAYS.some((day) => day.n === item.day) && isHour(item.hour))
      .filter((item) => !seen.has(`${item.day}:${item.hour}`) && seen.add(`${item.day}:${item.hour}`))
      .sort((a, b) => a.day - b.day || a.hour - b.hour);
  }

  function cleanDateHours(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
      .map((item) => ({ date: String(item && item.date || ''), hour: Number(item && item.hour) }))
      .filter((item) => DATE_RE.test(item.date) && isHour(item.hour))
      .filter((item) => !seen.has(`${item.date}:${item.hour}`) && seen.add(`${item.date}:${item.hour}`))
      .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
  }

  // null = sin horario ni bloqueos (todo libre). Con days, los 5 días quedan definidos.
  // Las listas vacías no se devuelven.
  function normalizeWorkHours(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const out = {};
    if (raw.days && typeof raw.days === 'object') {
      out.days = {};
      DAYS.forEach((day) => { out.days[day.n] = cleanRanges(raw.days[day.n] || raw.days[String(day.n)]); });
    }
    const blocked = cleanDayHours(raw.blocked);
    const weekBlocked = cleanDateHours(raw.weekBlocked);
    const extra = cleanDateHours(raw.extra);
    if (blocked.length) out.blocked = blocked;
    if (weekBlocked.length) out.weekBlocked = weekBlocked;
    if (extra.length) out.extra = extra;
    return Object.keys(out).length ? out : null;
  }

  // ---- Cambios (devuelven el workHours nuevo, o undefined si quedó vacío) ----
  // Las fechas de hace más de 35 días se descartan al escribir.
  function prune(list, todayValue) {
    if (!todayValue) return list;
    const limit = new Date(`${todayValue}T12:00:00`);
    limit.setDate(limit.getDate() - 35);
    const min = [limit.getFullYear(), String(limit.getMonth() + 1).padStart(2, '0'), String(limit.getDate()).padStart(2, '0')].join('-');
    return list.filter((item) => item.date >= min);
  }

  function rebuild(base, change, todayValue) {
    const next = { ...(normalizeWorkHours(base) || {}), ...change };
    ['weekBlocked', 'extra'].forEach((key) => { if (next[key]) next[key] = prune(next[key], todayValue); });
    return normalizeWorkHours(next) || undefined;
  }

  function withDays(workHours, days, todayValue) {
    return rebuild(workHours, { days }, todayValue);
  }

  function withoutDays(workHours, todayValue) {
    const current = normalizeWorkHours(workHours) || {};
    delete current.days;
    return rebuild(current, {}, todayValue);
  }

  // kind 'always' (day, hour) o 'week' (date, hour).
  function withBlock(workHours, { kind, day, date, hour }, todayValue) {
    const current = normalizeWorkHours(workHours) || {};
    if (kind === 'always') {
      return rebuild(current, { blocked: [...(current.blocked || []), { day, hour }] }, todayValue);
    }
    return rebuild(current, { weekBlocked: [...(current.weekBlocked || []), { date, hour }] }, todayValue);
  }

  // Desbloquear quita los dos (el de todas las semanas de ese día y el de esa fecha).
  function withoutBlock(workHours, { day, date, hour }, todayValue) {
    const current = normalizeWorkHours(workHours) || {};
    return rebuild(current, {
      blocked: (current.blocked || []).filter((item) => !(item.day === day && item.hour === hour)),
      weekBlocked: (current.weekBlocked || []).filter((item) => !(item.date === date && item.hour === hour))
    }, todayValue);
  }

  function withExtra(workHours, { date, hour }, todayValue) {
    const current = normalizeWorkHours(workHours) || {};
    return rebuild(current, { extra: [...(current.extra || []), { date, hour }] }, todayValue);
  }

  function withoutExtra(workHours, { date, hour }, todayValue) {
    const current = normalizeWorkHours(workHours) || {};
    return rebuild(current, { extra: (current.extra || []).filter((item) => !(item.date === date && item.hour === hour)) }, todayValue);
  }

  // Revisa lo escrito en Ajustes: rows = [{ n, ranges: [{ from, to }] }] (vacío = sin tramo).
  // Devuelve { ok, workHours, errors: ['Lun: …'] }.
  function validateForm(rows) {
    const errors = [];
    const days = {};
    DAYS.forEach((day) => {
      const row = (rows || []).find((item) => Number(item.n) === day.n) || { ranges: [] };
      const ranges = [];
      (row.ranges || []).slice(0, MAX_RANGES).forEach((range, index) => {
        const fromText = String(range.from || '').trim();
        const toText = String(range.to || '').trim();
        if (!fromText && !toText) return;
        const from = minutes(fromText);
        const to = minutes(toText);
        if (from === null || to === null) {
          errors.push(`${day.short}: el tramo ${index + 1} necesita desde y hasta.`);
        } else if (from >= to) {
          errors.push(`${day.short}: "hasta" debe ser después de "desde".`);
        } else {
          ranges.push({ from, to });
        }
      });
      ranges.sort((a, b) => a.from - b.from);
      if (ranges.length === 2 && ranges[1].from < ranges[0].to) {
        errors.push(`${day.short}: los dos tramos se cruzan.`);
      }
      days[day.n] = ranges.map((range) => ({ from: clock(range.from), to: clock(range.to) }));
    });
    return errors.length ? { ok: false, errors, workHours: null } : { ok: true, errors: [], workHours: { days } };
  }

  // Lunes a viernes de la semana de hoy; sábado y domingo muestran la semana que viene.
  function weekDates(todayValue) {
    const today = new Date(`${todayValue}T12:00:00`);
    const weekday = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - (weekday - 1) + (weekday >= 6 ? 7 : 0));
    return DAYS.map((day, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    });
  }

  // "Semana del 16 al 20 de noviembre" (o "del 30 de noviembre al 4 de diciembre").
  function weekLabel(dates) {
    const first = new Date(`${dates[0]}T12:00:00`);
    const last = new Date(`${dates[dates.length - 1]}T12:00:00`);
    const sameMonth = first.getMonth() === last.getMonth();
    return sameMonth
      ? `Semana del ${first.getDate()} al ${last.getDate()} de ${MONTHS[last.getMonth()]}`
      : `Semana del ${first.getDate()} de ${MONTHS[first.getMonth()]} al ${last.getDate()} de ${MONTHS[last.getMonth()]}`;
  }

  // Horas de la grilla que toca una clase de 60 min: "10:00" → [10]; "11:15" → [11, 12].
  function hoursTouched(time, duration = CLASS_MINUTES) {
    const start = minutes(time);
    if (start === null) return [];
    const end = start + duration;
    return hours().filter((hour) => start < (hour + 1) * 60 && end > hour * 60);
  }

  function overlapsWork(ranges, hour) {
    return ranges.some((range) => minutes(range.from) < (hour + 1) * 60 && minutes(range.to) > hour * 60);
  }

  // slotsByDate: { 'AAAA-MM-DD': [slot de getAgendaSlotsForDate] }.
  // Devuelve { dates, columns, rows: [{ hour, label, cells: [{ state, classes }] }], noHour, configured }.
  function buildGrid({ dates, slotsByDate, workHours, todayValue }) {
    const work = normalizeWorkHours(workHours);
    const columns = DAYS.map((day, index) => ({ ...day, date: dates[index], isToday: dates[index] === todayValue }));
    const noHour = new Map();
    const byCell = new Map();
    columns.forEach((column, col) => {
      (slotsByDate[column.date] || []).forEach((slot) => {
        const touched = hoursTouched(slot.time);
        if (!touched.length) {
          if (minutes(slot.time) === null) {
            (slot.students || []).forEach((student) => noHour.set(student.id, { id: student.id, name: student.name }));
          }
          return;
        }
        const info = {
          time: slot.time,
          modality: slot.modality === 'group' ? 'group' : 'personalized',
          count: (slot.students || []).length,
          names: (slot.students || []).map((student) => student.name)
        };
        touched.forEach((hour) => {
          const key = `${col}:${hour}`;
          if (!byCell.has(key)) byCell.set(key, []);
          byCell.get(key).push(info);
        });
      });
    });
    const rows = hours().map((hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}`,
      cells: columns.map((column, col) => {
        const classes = (byCell.get(`${col}:${hour}`) || []).slice().sort((a, b) => a.time.localeCompare(b.time));
        if (classes.length) {
          return { state: 'busy', classes };
        }
        const always = Boolean(work && (work.blocked || []).some((item) => item.day === column.n && item.hour === hour));
        const week = Boolean(work && (work.weekBlocked || []).some((item) => item.date === column.date && item.hour === hour));
        if (always || week) {
          return { state: 'blocked', classes, blockKind: always ? 'always' : 'week' };
        }
        const inWork = !(work && work.days) || overlapsWork(work.days[column.n] || [], hour);
        if (inWork) {
          return { state: 'free', classes };
        }
        const extra = Boolean(work && (work.extra || []).some((item) => item.date === column.date && item.hour === hour));
        return extra ? { state: 'free', classes, extra: true } : { state: 'off', classes };
      })
    }));
    return { dates, columns, rows, noHour: [...noHour.values()], configured: Boolean(work && work.days) };
  }

  // "Lun 10:00 · Grupo · 4 alumnos" / "Lun 13:00 · Personalizado · Nombre".
  function classLine(dayShort, info) {
    if (info.modality === 'group') {
      return `${dayShort} ${info.time} · Grupo · ${info.count} ${info.count === 1 ? 'alumno' : 'alumnos'}`;
    }
    return `${dayShort} ${info.time} · Personalizado · ${info.names.join(', ') || 'sin alumno'}`;
  }

  // Lo que se ofrece al tocar una celda: { title, actions: [{ id, label }], lines }.
  // ids: block-always, block-week, unblock, extra, unextra.
  function cellMenu(grid, col, hour) {
    const row = grid.rows.find((item) => item.hour === hour);
    const cell = row && row.cells[col];
    const column = grid.columns[col];
    if (!cell || !column) return null;
    const at = `${column.short} ${String(hour).padStart(2, '0')}:00`;
    if (cell.state === 'busy') return { title: '', lines: cellLines(grid, col, hour), actions: [] };
    if (cell.state === 'blocked') {
      return { title: `${at} · Bloqueada ${cell.blockKind === 'always' ? '(todas las semanas)' : '(solo esta semana)'}`, lines: [], actions: [{ id: 'unblock', label: 'Desbloquear' }] };
    }
    if (cell.state === 'off') {
      return { title: `${at} · Fuera de horario`, lines: [], actions: [{ id: 'extra', label: 'Marcar disponible solo esta semana' }] };
    }
    const actions = [{ id: 'block-always', label: 'Bloquear esta hora (todas las semanas)' }, { id: 'block-week', label: 'Bloquear solo esta semana' }];
    if (cell.extra) actions.push({ id: 'unextra', label: 'Quitar hora extra' });
    return { title: `${at} · ${cell.extra ? 'Disponible solo esta semana' : 'Libre'}`, lines: [], actions };
  }

  function cellLines(grid, col, hour) {
    const row = grid.rows.find((item) => item.hour === hour);
    const cell = row && row.cells[col];
    if (!cell) return [];
    return cell.classes.map((info) => classLine(grid.columns[col].short, info));
  }

  // Lo único que va en la imagen: días, horas y libre sí/no. Nunca nombres ni clases.
  function shareData(grid) {
    return {
      title: 'Horas disponibles',
      weekLabel: weekLabel(grid.dates),
      days: grid.columns.map((column) => column.short),
      hours: grid.rows.map((row) => row.hour),
      free: grid.rows.map((row) => row.cells.map((cell) => cell.state === 'free')),
      signature: 'by Vikingos Radical'
    };
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.weekGridCore = {
    FIRST_HOUR,
    LAST_HOUR,
    CLASS_MINUTES,
    DAYS,
    DEFAULT_WORK_HOURS,
    minutes,
    hours,
    normalizeWorkHours,
    validateForm,
    withDays,
    withoutDays,
    withBlock,
    withoutBlock,
    withExtra,
    withoutExtra,
    cellMenu,
    weekDates,
    weekLabel,
    hoursTouched,
    buildGrid,
    classLine,
    cellLines,
    shareData
  };
})();
