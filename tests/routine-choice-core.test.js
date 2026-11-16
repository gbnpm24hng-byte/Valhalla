const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/publish-core.js');
require('../assets/js/self-log-core.js');
require('../assets/js/routine-choice-core.js');
require('../assets/js/student-view.js');

const rc = globalThis.VALHALLA.routineChoice;
const view = globalThis.VALHALLA.studentView.format;

// Datos falsos: programa de 3 rutinas (A, B, C) y semana del lunes 16 al domingo 22 de noviembre de 2026.
const ex = (id) => ({ id, name: `Ejercicio falso ${id}`, sets: 2, repMin: 8, repMax: 10 });
const days = [
  { id: 'dA', name: 'Día A', exercises: [ex('a1')] },
  { id: 'dB', name: 'Día B', exercises: [ex('b1')] },
  { id: 'dC', name: 'Día C', exercises: [ex('c1')] }
];
const row = (dayId, date, extra = {}) => ({ assignment_id: 'as-1', session_date: date, day_id: dayId, exercise_id: 'x', set_type: 'S', set_number: 1, ...extra });

test('etiqueta corta de la rutina', () => {
  assert.equal(rc.routineLabel({ name: 'Día C' }), 'C');
  assert.equal(rc.routineLabel({ name: 'dia b' }), 'B');
  assert.equal(rc.routineLabel({ name: 'Lunes — A' }), 'A');
  assert.equal(rc.routineLabel({ name: 'Viernes — Piernas/Glúteos' }), 'Piernas/Glúteos');
  assert.equal(rc.routineLabel({ name: 'Mié - Espalda' }), 'Espalda');
  assert.equal(rc.routineLabel({ name: 'Piernas' }), 'Piernas');
  assert.equal(rc.routineLabel({ name: 'Lunes' }), 'Lunes', 'solo el día de la semana: queda igual');
  assert.equal(rc.routineLabel({ name: '' }, 2), 'C');
});

test('semana de lunes a domingo', () => {
  assert.deepEqual(rc.weekRange('2026-11-16'), { start: '2026-11-16', end: '2026-11-22' });
  assert.deepEqual(rc.weekRange('2026-11-22'), { start: '2026-11-16', end: '2026-11-22' });
  assert.deepEqual(rc.weekRange('2026-11-19'), { start: '2026-11-16', end: '2026-11-22' });
});

test('"✓ hecha esta semana": series S propias, pendientes o publicadas; no rechazadas ni de otra semana', () => {
  const done = rc.doneDayIds({
    days, assignmentId: 'as-1', date: '2026-11-19',
    setRows: [
      row('dA', '2026-11-16'),
      row('dB', '2026-11-15'), // semana anterior
      row('dC', '2026-11-17', { set_type: 'A' }), // solo aproximación
      row('dC', '2026-11-17', { assignment_id: 'otra' }) // otro programa
    ],
    outbox: [
      { assignmentId: 'as-1', sessionDate: '2026-11-18', dayId: 'dB', setType: 'S', status: 'rejected' }
    ],
    progress: []
  });
  assert.deepEqual([...done], ['dA']);
  const pending = rc.doneDayIds({ days, assignmentId: 'as-1', date: '2026-11-19', outbox: [{ assignmentId: 'as-1', sessionDate: '2026-11-18', dayId: 'dB', setType: 'S', status: 'pending' }] });
  assert.deepEqual([...pending], ['dB']);
  // Sesión publicada por el entrenador (Modo Grupo): se reconoce por el nombre del día.
  const published = rc.doneDayIds({ days, assignmentId: 'as-1', date: '2026-11-19', progress: [{ session_date: '2026-11-17', data: { dayName: 'día c' } }, { session_date: '2026-11-10', data: { dayName: 'Día B' } }] });
  assert.deepEqual([...published], ['dC']);
});

test('sugerencia: primera pendiente de la semana; si hizo todas, la del calendario', () => {
  assert.equal(rc.suggestDay({ days, done: new Set(), date: '2026-11-16' }).id, 'dA');
  assert.equal(rc.suggestDay({ days, done: new Set(['dA']), date: '2026-11-16' }).id, 'dB');
  assert.equal(rc.suggestDay({ days, done: new Set(['dA', 'dB']), date: '2026-11-16' }).id, 'dC');
  const named = [
    { id: 'lun', name: 'Lunes — A', exercises: [ex('1')] },
    { id: 'mie', name: 'Miércoles — B', exercises: [ex('2')] },
    { id: 'vie', name: 'Viernes — C', exercises: [ex('3')] }
  ];
  // Todas hechas: la del calendario (miércoles 18 → B); sin coincidencia (domingo) → la primera.
  assert.equal(rc.suggestDay({ days: named, done: new Set(['lun', 'mie', 'vie']), date: '2026-11-18' }).id, 'mie');
  assert.equal(rc.suggestDay({ days: named, done: new Set(['lun', 'mie', 'vie']), date: '2026-11-22' }).id, 'lun');
  // Un día sin ejercicios no se sugiere.
  assert.equal(rc.suggestDay({ days: [{ id: 'vacio', name: 'Día A', exercises: [] }, ...days.slice(1)], done: new Set(), date: '2026-11-16' }).id, 'dB');
});

test('textos: encabezado, aviso al repetir y línea del entrenador', () => {
  assert.equal(rc.headline('2026-11-16', days[2], 2), 'Lunes — C');
  assert.equal(rc.repeatQuestion(days[1], 1), 'Ya hiciste B esta semana. ¿Repetirla?');
  assert.equal(rc.sessionLine('2026-11-16', 'C'), 'Lun 16 nov · hizo C');
  assert.equal(rc.sessionLine('2026-11-16', ''), 'Lun 16 nov');
});

test('rutina de una sesión del entrenador (por id del día o por nombre)', () => {
  const assignments = [{ id: 'as-1', days }];
  assert.equal(rc.sessionRoutineLabel({ programAssignmentId: 'as-1', programDayId: 'dC', programDayName: 'Día C' }, assignments), 'C');
  assert.equal(rc.sessionRoutineLabel({ programAssignmentId: 'as-1', programDayId: 'otro', programDayName: 'Día B' }, assignments), 'B');
  assert.equal(rc.sessionRoutineLabel({ programAssignmentId: 'borrada', programDayId: 'x', programDayName: 'Viernes — Piernas' }, assignments), 'Piernas');
  assert.equal(rc.sessionRoutineLabel({ programAssignmentId: 'as-1' }, assignments), '', 'sesión libre sin día: no dice "hizo"');
});

// ---- Vista del alumno ----

const ctxFor = ({ date = '2026-11-16', canLog = true, setRows = [], outbox = [], progress = [] } = {}) => ({
  userId: 'u-falso', canLog, date, dates: [date], setRows, outbox, progress,
  serverByKey: new Map(setRows.map((item) => [[item.assignment_id, item.session_date, item.day_id, item.exercise_id, item.set_type, item.set_number].join('|'), item])),
  localByKey: new Map()
});
let seq = 0;
// Cada llamada usa otro assignment_id: así la vista no recuerda la elección anterior.
const programFor = () => {
  seq += 1;
  return { assignment_id: `as-test-${seq}`, title: 'Programa falso', data: { days } };
};

test('Hoy: sugiere la primera rutina pendiente de la semana (no la del calendario)', () => {
  const program = programFor();
  const id = program.assignment_id;
  const ctx = ctxFor({ date: '2026-11-18', setRows: [row('dA', '2026-11-16', { assignment_id: id }), row('dB', '2026-11-17', { assignment_id: id })] });
  const selection = view.resolveSelection(ctx, [program]);
  assert.equal(selection.day.id, 'dC');
  assert.deepEqual([...selection.done].sort(), ['dA', 'dB']);
  const html = view.renderToday(ctx, { progress: [] }, selection, [program]);
  assert.match(html, /data-sv-day-title[^>]*>Miércoles — C</);
  assert.match(html, /data-sv-change-day[^>]*>Cambiar día</);
  assert.doesNotMatch(html, /data-sv-day-list/, 'la lista se abre con "Cambiar día"');
});

test('Hoy: con series de la fecha, sigue mostrando esa rutina (aunque ya esté hecha)', () => {
  const program = programFor();
  const id = program.assignment_id;
  const ctx = ctxFor({ date: '2026-11-16', setRows: [row('dC', '2026-11-16', { assignment_id: id, exercise_id: 'c1' })] });
  assert.equal(view.resolveSelection(ctx, [program]).day.id, 'dC');
});

test('Hoy: sin poder anotar, la del calendario como antes (sin sugerencia), con "✓ hecha" y "Cambiar día"', () => {
  const named = [
    { id: 'lun', name: 'Lunes — A', exercises: [ex('1')] },
    { id: 'mie', name: 'Miércoles — B', exercises: [ex('2')] },
    { id: 'vie', name: 'Viernes — C', exercises: [ex('3')] }
  ];
  seq += 1;
  const program = { assignment_id: `as-test-${seq}`, title: 'Programa falso', data: { days: named } };
  // Miércoles: hizo B el lunes y A está pendiente; igual se muestra B (calendario).
  const ctx = ctxFor({ canLog: false, date: '2026-11-18', progress: [{ session_date: '2026-11-16', data: { dayName: 'Miércoles — B' } }] });
  const selection = view.resolveSelection(ctx, [program]);
  assert.equal(selection.day.id, 'mie');
  assert.equal(selection.suggestedId, '');
  assert.deepEqual([...selection.done], ['mie']);
  assert.match(view.renderToday(ctx, { progress: ctx.progress }, selection, [program]), /data-sv-change-day/);
  // Con permiso, el mismo caso sugiere A.
  seq += 1;
  const program2 = { ...program, assignment_id: `as-test-${seq}` };
  assert.equal(view.resolveSelection({ ...ctxFor({ date: '2026-11-18', progress: ctx.progress }) }, [program2]).day.id, 'lun');
});
