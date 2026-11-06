(function () {
  // Ajustes (v0.9.42): fecha del último respaldo exportado en ESTE equipo y revisión del
  // archivo antes de "Restaurar desde un respaldo". Sin DOM: se prueba en tests/settings-core.test.js.
  //
  // La fecha vive en localStorage con su propia clave, fuera del estado de la app: no sube a la
  // nube ni sale en los respaldos. Toda lectura y escritura va en try/catch (modo privado,
  // almacenamiento bloqueado): si falla, se trata como "nunca exportado".

  const LAST_EXPORT_KEY = 'valhalla_last_export_at';
  const REMINDER_DAYS = 7;
  const DAY_MS = 86400000;
  const PROGRAM_FORMAT = 'valhalla-programa';

  function readLastExport(storage) {
    try {
      const value = storage?.getItem(LAST_EXPORT_KEY);
      return value && !Number.isNaN(Date.parse(value)) ? value : '';
    } catch (_) {
      return '';
    }
  }

  function writeLastExport(storage, date = new Date()) {
    try {
      storage.setItem(LAST_EXPORT_KEY, date.toISOString());
      return true;
    } catch (_) {
      return false;
    }
  }

  // Días de calendario (hora local) entre el respaldo y hoy.
  function daysBetween(then, now) {
    const start = new Date(then.getFullYear(), then.getMonth(), then.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((end - start) / DAY_MS));
  }

  function formatDate(date) {
    try {
      return date.toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return date.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  // Texto de la tarjeta Respaldo. needsReminder: nunca exportado aquí, o hace más de 7 días.
  function describeLastExport(iso, now = new Date()) {
    if (!iso) {
      return { never: true, days: null, agoText: 'Último respaldo: nunca en este equipo', dateText: '', needsReminder: true };
    }
    const then = new Date(iso);
    const days = daysBetween(then, now);
    const ago = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
    return {
      never: false,
      days,
      agoText: `Último respaldo: ${ago}`,
      dateText: `${formatDate(then)} · en este equipo`,
      needsReminder: days > REMINDER_DAYS
    };
  }

  // ¿Es un respaldo completo de "Exportar respaldo"? Un archivo de programa, uno sin alumnos o
  // uno que no se puede leer quedan bloqueados (restaurarlos dejaría la nube vacía).
  function inspectBackup(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return { ok: false, readable: false, clients: 0, programs: 0, reason: 'No se pudo leer el archivo (no es JSON).' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, readable: false, clients: 0, programs: 0, reason: 'El archivo no tiene el formato de un respaldo.' };
    }
    const clients = Array.isArray(parsed.clients) ? parsed.clients.length : 0;
    const programs = Array.isArray(parsed.trainingsV08?.programs) ? parsed.trainingsV08.programs.length : 0;
    if (parsed.format === PROGRAM_FORMAT) {
      return { ok: false, readable: true, isProgram: true, clients, programs, reason: 'Es un archivo de programa: cárgalo en Programas → Importar.' };
    }
    if (!clients) {
      return { ok: false, readable: true, clients, programs, reason: 'No trae alumnos.' };
    }
    return { ok: true, readable: true, clients, programs, reason: '' };
  }

  const api = { LAST_EXPORT_KEY, REMINDER_DAYS, readLastExport, writeLastExport, describeLastExport, inspectBackup };
  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.settingsCore = api;
})();
