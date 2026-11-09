(function () {
  // v0.9.51 · Período de pago por clases (sin red ni pantalla; lo usa app.js).
  // Al tocar "Marcar pagado" empieza un período: paidAt = hoy. El período dura lo que ocurra
  // primero: las clases del período (clases por semana × 4, 12 si no hay dato, o "Clases por
  // pago" escrito a mano) o 28 días desde paidAt. Al terminar, el pago vuelve a "Pendiente".
  // Campos opcionales en el alumno: paidAt ('AAAA-MM-DD') y classesPerPayment (entero).
  // Solo cambia payment_status: nunca toca finanzas, montos ni el historial de movimientos.

  const PERIOD_DAYS = 28;
  const DEFAULT_CLASSES = 12;
  const MAX_CLASSES = 99;
  const WARN_CLASSES = 2; // quedan 2 clases o menos → amarillo
  const WARN_DAYS = 3; // quedan 3 días o menos → amarillo
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function isDate(value) {
    if (!DATE_RE.test(String(value || ''))) {
      return false;
    }
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && toDate(date) === value;
  }

  function toDate(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function addDays(value, days) {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + days);
    return toDate(date);
  }

  // Días entre dos fechas locales (b − a), sin problemas de cambio de hora.
  function daysBetween(a, b) {
    const [ya, ma, da] = a.split('-').map(Number);
    const [yb, mb, db] = b.split('-').map(Number);
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
  }

  // "Clases por pago" escrito a mano: entero de 1 a 99; cualquier otra cosa = automático.
  function manualClasses(client) {
    const raw = client ? client.classesPerPayment : null;
    if (raw === null || raw === undefined || raw === '') {
      return null;
    }
    const value = Number(raw);
    return Number.isInteger(value) && value >= 1 && value <= MAX_CLASSES ? value : null;
  }

  function parseManualClasses(raw) {
    const text = String(raw ?? '').trim();
    if (!text) {
      return null;
    }
    const value = Number(text);
    return Number.isInteger(value) && value >= 1 && value <= MAX_CLASSES ? value : undefined;
  }

  // Clases del período: a mano; si no, clases por semana × 4; si no hay dato, 12.
  function classesForPeriod(client, perWeek) {
    const manual = manualClasses(client);
    if (manual) {
      return { total: manual, source: 'manual' };
    }
    const week = Math.floor(Number(perWeek) || 0);
    if (week >= 1 && week <= 7) {
      return { total: week * 4, source: 'week' };
    }
    return { total: DEFAULT_CLASSES, source: 'default' };
  }

  // Clases usadas: días con asistencia o sesión desde paidAt hasta hoy (un día cuenta una vez).
  function countUsed(dates, paidAt, today) {
    const unique = new Set();
    (dates ? Array.from(dates) : []).forEach((value) => {
      const date = String(value || '').slice(0, 10);
      if (isDate(date) && date >= paidAt && date <= today) {
        unique.add(date);
      }
    });
    return unique.size;
  }

  // Estado del período de un alumno.
  //   kind 'none'      → no está pagado (o "Sin cobro")
  //   kind 'no-start'  → pagado sin fecha de inicio (lo decide el entrenador)
  //   kind 'active'    → pagado con período en curso
  //   kind 'due'       → pagado, pero el período ya terminó (debe volver a Pendiente)
  //   kind 'expired'   → pendiente porque el período terminó (paidAt quedó guardado)
  function evaluate(client, { today, perWeek = 0, dates = [] } = {}) {
    const status = String(client?.payment_status || '');
    const paidAt = isDate(client?.paidAt) ? client.paidAt : '';
    if (status === 'not_applicable') {
      return { kind: 'none' };
    }
    if (status !== 'paid') {
      return paidAt && status === 'pending' ? { kind: 'expired', paidAt } : { kind: 'none' };
    }
    if (!paidAt) {
      return { kind: 'no-start' };
    }
    const { total, source } = classesForPeriod(client, perWeek);
    const used = countUsed(dates, paidAt, today);
    const endDate = addDays(paidAt, PERIOD_DAYS); // ese día vuelve a Pendiente
    const lastDay = addDays(paidAt, PERIOD_DAYS - 1); // último día cubierto ("hasta el …")
    const remaining = Math.max(0, total - used);
    const daysLeft = Math.max(0, daysBetween(today, endDate));
    const byClasses = used >= total;
    const byDays = today >= endDate;
    return {
      kind: byClasses || byDays ? 'due' : 'active',
      reason: byClasses ? 'classes' : byDays ? 'days' : '',
      paidAt,
      total,
      source,
      used,
      remaining,
      lastDay,
      endDate,
      daysLeft,
      warn: remaining <= WARN_CLASSES || daysLeft <= WARN_DAYS
    };
  }

  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function shortDate(value) {
    if (!isDate(value)) {
      return '';
    }
    const [, month, day] = value.split('-').map(Number);
    return `${day} ${MONTHS[month - 1]}`;
  }

  // "8 de 12 clases · hasta el 3 dic"
  function describe(info) {
    if (!info) {
      return '';
    }
    if (info.kind === 'no-start') {
      return 'Pagado · sin fecha de inicio';
    }
    if (info.kind === 'active' || info.kind === 'due') {
      return `${info.used} de ${info.total} clases · hasta el ${shortDate(info.lastDay)}`;
    }
    return '';
  }

  // Aviso de Hoy para un alumno (o '' si no hay nada que avisar).
  function notice(info) {
    if (!info) {
      return '';
    }
    if (info.kind === 'expired' || info.kind === 'due') {
      return 'su pago venció';
    }
    if (info.kind !== 'active' || !info.warn) {
      return '';
    }
    if (info.remaining <= WARN_CLASSES) {
      return info.remaining === 1 ? 'le queda 1 clase' : `le quedan ${info.remaining} clases`;
    }
    return info.daysLeft <= 1 ? 'su pago vence mañana' : `su pago vence en ${info.daysLeft} días`;
  }

  // Al tocar "Marcar pagado" / "Volver a pendiente": solo agrega o quita paidAt.
  function startPeriod(client, today) {
    return { ...client, paidAt: today };
  }

  function closePeriod(client) {
    const next = { ...client };
    delete next.paidAt;
    return next;
  }

  // Campo "Inicio del pago" de Editar: '' vacío, la fecha, o undefined si es inválida o futura.
  function parseStartDate(raw, today) {
    const text = String(raw ?? '').trim();
    if (!text) {
      return '';
    }
    return isDate(text) && text <= today ? text : undefined;
  }

  // paidAt al guardar desde Editar ('' = sin fecha de inicio):
  //  - pasa a Pagado: la fecha escrita si la cambió el entrenador; si no, hoy (como "Marcar pagado");
  //  - sigue Pagado: la fecha escrita (vacía = sin fecha de inicio);
  //  - deja de estar Pagado o cambia entre otros estados: se cierra el período;
  //  - sigue igual sin estar Pagado: se conserva (para el aviso "su pago venció").
  function startDateFromForm({ prevStatus, prevPaidAt, nextStatus, formDate, today }) {
    const previous = isDate(prevPaidAt) ? prevPaidAt : '';
    const typed = isDate(formDate) && formDate <= today ? formDate : '';
    if (nextStatus === 'paid') {
      if (prevStatus !== 'paid') {
        return typed && typed !== previous ? typed : today;
      }
      return typed;
    }
    return prevStatus === 'paid' || nextStatus !== prevStatus ? '' : previous;
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.paymentPeriodCore = {
    PERIOD_DAYS,
    DEFAULT_CLASSES,
    MAX_CLASSES,
    isDate,
    addDays,
    manualClasses,
    parseManualClasses,
    classesForPeriod,
    countUsed,
    evaluate,
    describe,
    notice,
    shortDate,
    startPeriod,
    closePeriod,
    parseStartDate,
    startDateFromForm
  };
})();
