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

  // null = sin horario (todo libre). Si viene algo, los 5 días quedan definidos.
  function normalizeWorkHours(raw) {
    if (!raw || typeof raw !== 'object' || !raw.days || typeof raw.days !== 'object') {
      return null;
    }
    const days = {};
    DAYS.forEach((day) => { days[day.n] = cleanRanges(raw.days[day.n] || raw.days[String(day.n)]); });
    return { days };
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
        const inWork = !work || overlapsWork(work.days[column.n] || [], hour);
        return { state: classes.length ? 'busy' : (inWork ? 'free' : 'off'), classes };
      })
    }));
    return { dates, columns, rows, noHour: [...noHour.values()], configured: Boolean(work) };
  }

  // "Lun 10:00 · Grupo · 4 alumnos" / "Lun 13:00 · Personalizado · Nombre".
  function classLine(dayShort, info) {
    if (info.modality === 'group') {
      return `${dayShort} ${info.time} · Grupo · ${info.count} ${info.count === 1 ? 'alumno' : 'alumnos'}`;
    }
    return `${dayShort} ${info.time} · Personalizado · ${info.names.join(', ') || 'sin alumno'}`;
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
    weekDates,
    weekLabel,
    hoursTouched,
    buildGrid,
    classLine,
    cellLines,
    shareData
  };
})();
