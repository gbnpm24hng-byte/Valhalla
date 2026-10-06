const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');

// Extrae una función con nombre de app.js (llaves balanceadas) para probar el código real.
function extractFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No se encontró function ${name} en app.js`);
  const bodyStart = appSource.indexOf('{', appSource.indexOf(')', start));
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Llaves sin cerrar en ${name}`);
}

function build({ sessionDate, dayChoices = {}, hoyDayId = '' }) {
  const groupSessionUi = { sessionDate, dayChoices };
  const factory = new Function('groupSessionUi', 'getTodayLocalDate', 'getSelectedTrainingProgramDay', `
    ${extractFunction('getWeekdayFromProgramDayName')}
    ${extractFunction('getGroupProgramDay')}
    return { getWeekdayFromProgramDayName, getGroupProgramDay };`);
  return factory(
    groupSessionUi,
    () => '2026-10-06',
    (clientId, assignment) => {
      const index = assignment.days.findIndex((day) => day.id === hoyDayId);
      return { day: index >= 0 ? assignment.days[index] : null, index };
    }
  );
}

const exercise = (name) => ({ id: `e-${name}`, exerciseName: name });
// Mismos nombres de días que los programas reales (respaldo de octubre 2026).
const GROUP = { id: 'asig-grupo', days: [
  { id: 'lun', name: 'Lunes — Piernas/Glúteos', exercises: [exercise('Sentadilla')] },
  { id: 'mie', name: 'Miércoles — Espalda', exercises: [exercise('Jalón al pecho')] },
  { id: 'vie', name: 'Viernes — Pecho/Hombros', exercises: [exercise('Press de banca')] }
] };
const SPLIT = { id: 'asig-split', days: [
  { id: 'pt1', name: 'Pecho-tríceps 1', exercises: [exercise('Press inclinado')] },
  { id: 'eb1', name: 'Espalda-bíceps 1', exercises: [exercise('Remo')] },
  { id: 'ph1', name: 'Piernas-hombros 1', exercises: [exercise('Prensa')] }
] };

test('reconoce el día de la semana al inicio del nombre del día', () => {
  const { getWeekdayFromProgramDayName: weekday } = build({ sessionDate: '2026-10-05' });
  assert.equal(weekday('Lunes — Piernas/Glúteos'), 1);
  assert.equal(weekday('Miércoles — Espalda'), 3);
  assert.equal(weekday('miercoles espalda'), 3);
  assert.equal(weekday('Mié - Espalda'), 3);
  assert.equal(weekday('Viernes — Pecho/Hombros'), 5);
  assert.equal(weekday('Sábado'), 6);
  assert.equal(weekday('Pecho-tríceps 1'), -1);
  assert.equal(weekday('Martillo'), -1, 'no confunde palabras que empiezan igual');
});

test('Lun/Mié/Vie: preselecciona el día que coincide con la fecha', () => {
  assert.equal(build({ sessionDate: '2026-10-05' }).getGroupProgramDay('c', GROUP).day.id, 'lun');
  assert.equal(build({ sessionDate: '2026-10-07' }).getGroupProgramDay('c', GROUP).day.id, 'mie');
  assert.equal(build({ sessionDate: '2026-10-09' }).getGroupProgramDay('c', GROUP).day.id, 'vie');
});

test('nunca queda sin día si la asignación tiene días con ejercicios', () => {
  // Martes: ningún día coincide -> primer día con ejercicios (no "sin programa").
  assert.equal(build({ sessionDate: '2026-10-06' }).getGroupProgramDay('c', GROUP).day.id, 'lun');
  // Programa sin días de la semana en el nombre -> primer día.
  assert.equal(build({ sessionDate: '2026-10-07' }).getGroupProgramDay('c', SPLIT).day.id, 'pt1');
  // Sin la "Sesión del programa" de Hoy (lo que tenían los datos reales) igual hay día.
  assert.ok(build({ sessionDate: '2026-10-07', hoyDayId: '' }).getGroupProgramDay('c', GROUP).day);
});

test('la elección manual manda; luego el día de la semana; luego la sesión elegida en Hoy', () => {
  assert.equal(build({ sessionDate: '2026-10-05', dayChoices: { c: 'vie' } }).getGroupProgramDay('c', GROUP).day.id, 'vie');
  assert.equal(build({ sessionDate: '2026-10-07', hoyDayId: 'eb1' }).getGroupProgramDay('c', SPLIT).day.id, 'eb1');
  assert.equal(build({ sessionDate: '2026-10-07', hoyDayId: 'lun' }).getGroupProgramDay('c', GROUP).day.id, 'mie', 'el día de la semana gana a lo elegido en Hoy');
  // Una elección manual que ya no existe se ignora.
  assert.equal(build({ sessionDate: '2026-10-09', dayChoices: { c: 'no-existe' } }).getGroupProgramDay('c', GROUP).day.id, 'vie');
});

test('se salta días sin ejercicios al elegir automáticamente', () => {
  const withEmpty = { id: 'a', days: [{ id: 'vacio', name: 'Lunes — Vacío', exercises: [] }, ...GROUP.days.slice(1)] };
  assert.equal(build({ sessionDate: '2026-10-05' }).getGroupProgramDay('c', withEmpty).day.id, 'mie');
  assert.equal(build({ sessionDate: '2026-10-05' }).getGroupProgramDay('c', { id: 'x', days: [] }).day, null);
});
