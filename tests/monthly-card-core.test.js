const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/monthly-card-core.js');
require('../assets/js/muscle-map-core.js');
require('../assets/js/data.js');
require('../assets/js/sync-core.js');
require('../assets/js/student-view.js');

const core = globalThis.VALHALLA.monthlyCardCore;
const map = globalThis.VALHALLA.muscleMap;
const data = globalThis.VALHALLA.data;
const sync = globalThis.VALHALLA.syncCore;

// Las mismas reglas que app.js le pasa (getSessionExercises, getExerciseSets, getSetType, measure 'time').
const LIBRARY = { 'sentadilla falsa': ['quadriceps', ['glutes']], 'press falso': ['chest', ['triceps']], 'plancha falsa': ['core', []] };
const H = {
  getExercises: (session) => (Array.isArray(session?.exercises) ? session.exercises : []),
  getSets: (exercise) => (Array.isArray(exercise?.sets) ? exercise.sets : []),
  isTimed: (exercise) => exercise?.measure === 'time',
  setType: (setEntry) => (['A', 'T', 'S'].includes(String(setEntry?.setType || 'S').toUpperCase()) ? String(setEntry?.setType || 'S').toUpperCase() : 'S'),
  zonesOf: (exercise) => {
    const item = LIBRARY[String(exercise.exerciseName).toLowerCase()];
    return item ? map.zonesFor(item[0], item[1], exercise.exerciseName) : { main: [], sec: [] };
  },
  weekStreak: (dates, ref) => globalThis.VALHALLA.studentView.format.weekStreak(dates, ref)
};

const kg = (name, weights) => ({ exerciseName: name, sets: weights.map((weight, i) => ({ setNumber: i + 1, setType: 'S', completed: true, weight, reps: 8 })) });
const secs = (name, seconds) => ({ exerciseName: name, measure: 'time', sets: seconds.map((value, i) => ({ setNumber: i + 1, setType: 'S', completed: true, seconds: value, reps: 0, weight: 0 })) });
const ses = (date, exercises, extra = {}) => ({ id: `s-${date}`, date, status: 'completed', exercises, ...extra });

test('meses: etiqueta, anterior y días', () => {
  assert.equal(core.monthLabel('2026-11'), 'NOVIEMBRE 2026');
  assert.equal(core.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(core.shiftMonth('2026-11', -1), '2026-10');
  assert.equal(core.monthDays('2026-02').length, 28);
  assert.equal(core.isMonth('2026-13'), false);
});

test('récords: kilos y segundos por separado, subida contra lo mejor antes del mes', () => {
  const sessions = [
    ses('2026-10-06', [kg('Sentadilla falsa', [40, 35]), secs('Plancha falsa', [45])]),
    ses('2026-10-20', [kg('Sentadilla falsa', [40]), secs('Plancha falsa', [40])]),
    ses('2026-11-02', [kg('Sentadilla falsa', [42.5]), secs('Plancha falsa', [50])]),
    ses('2026-11-04', [kg('Sentadilla falsa', [45]), secs('Plancha falsa', [60])]),
    // Mismo nombre con kilos: otro ejercicio (nunca se mezcla con los segundos).
    ses('2026-11-05', [kg('Plancha falsa', [10])])
  ];
  const result = core.monthRecords(sessions, '2026-11', H);
  assert.equal(result.count, 4, 'cada día que supera todo lo anterior cuenta (2 sentadilla + 2 plancha)');
  assert.deepEqual(result.list.map(core.recordText), [
    { name: 'Plancha falsa', value: '60 s', delta: '↑15' },
    { name: 'Sentadilla falsa', value: '45 kg', delta: '↑5' }
  ]);
});

test('récords: el primer registro no es récord; primero en el mes y mejorado va sin flecha', () => {
  const sessions = [ses('2026-11-02', [kg('Press falso', [30])]), ses('2026-11-04', [kg('Press falso', [32.5])])];
  const result = core.monthRecords(sessions, '2026-11', H);
  assert.equal(result.count, 1);
  assert.deepEqual(core.recordText(result.list[0]), { name: 'Press falso', value: '32,5 kg', delta: '' });
  assert.deepEqual(core.monthRecords([ses('2026-11-02', [kg('Press falso', [30])])], '2026-11', H), { count: 0, tracked: 1, list: [] });
});

test('récords: hasta 4, los de mayor subida primero; series no hechas no cuentan', () => {
  const names = ['A', 'B', 'C', 'D', 'E'];
  const sessions = [
    ses('2026-10-01', names.map((n) => kg(n, [100]))),
    ses('2026-11-03', names.map((n, i) => kg(n, [100 + (i + 1) * 5]))),
    ses('2026-11-04', [{ exerciseName: 'A', sets: [{ setType: 'S', completed: false, weight: 200 }] }])
  ];
  const result = core.monthRecords(sessions, '2026-11', H);
  assert.equal(result.count, 5);
  assert.deepEqual(result.list.map((r) => r.name), ['E', 'D', 'C', 'B']);
});

test('tarjeta: clases N/M con días de entrenamiento, racha, series efectivas y zonas', () => {
  const sessions = [
    ses('2026-10-26', [kg('Sentadilla falsa', [40])]),
    ses('2026-11-02', [kg('Sentadilla falsa', [45, 40]), { exerciseName: 'Sentadilla falsa', sets: [{ setType: 'A', completed: true, weight: 20 }] }]),
    ses('2026-11-04', [kg('Press falso', [30, 30, 30])], { circuits: [{ blockId: 'c1', format: 'amrap', rounds: 5 }] })
  ];
  const card = core.buildCardData({ month: '2026-11', today: '2026-11-06', firstName: 'Ana Prueba Falsa', sessions, attendedDates: ['2026-11-06'], weekdays: [1, 3, 5] }, H);
  assert.equal(card.firstName, 'Ana');
  assert.equal(card.classes, 3, '2 sesiones + 1 asistencia');
  assert.equal(card.planned, 3, 'lun 2, mié 4 y vie 6 (hoy, ya entrenó)');
  assert.equal(card.recordCount, 1);
  assert.equal(card.streak, 2);
  assert.equal(card.effectiveSets, 5, 'solo series S; ni aproximaciones ni circuitos');
  // Tonos por series efectivas: pecho 3 series (máximo), cuádriceps 2, tríceps (ayuda) 1,5,
  // glúteo (ayuda) 1 → tercios del máximo.
  assert.deepEqual(card.zones, { pechoSup: 3, pechoInf: 3, cuadriceps: 3, triceps: 2, gluteoMayor: 2 });
  const zonesLow = core.monthZones([ses('2026-11-02', [kg('Press falso', [30, 30, 30, 30, 30, 30])]), ses('2026-11-03', [kg('Sentadilla falsa', [40])])], H);
  assert.equal(zonesLow.gluteoMayor, 1, 'menos de un tercio del máximo = el tono más suave');
  assert.deepEqual(core.boxes(card).map((b) => `${b.value} ${b.label}`), ['3/3 clases', '1 récord', '2 semanas seguidas']);
  assert.equal(core.summaryLine(card), '3 clases · 1 récord');
});

test('tarjeta: sin racha cambia la caja por series; sin datos de plan muestra solo el número', () => {
  const sessions = [ses('2026-10-06', [kg('Press falso', [30, 30])])];
  const card = core.buildCardData({ month: '2026-10', today: '2026-11-20', firstName: 'Bruno', sessions }, H);
  assert.equal(card.streak, 0, 'al 31 de octubre la última semana con registro es la del 6');
  assert.equal(card.planned, null);
  assert.deepEqual(core.boxes(card).map((b) => `${b.value} ${b.label}`), ['1 clases', '0 récords', '2 series']);
  assert.equal(card.records.length, 0);
});

test('tarjeta de un mes pasado: no usa lo de después del mes', () => {
  const sessions = [ses('2026-10-05', [kg('Press falso', [30])]), ses('2026-10-19', [kg('Press falso', [35])]), ses('2026-11-02', [kg('Press falso', [50])])];
  const card = core.buildCardData({ month: '2026-10', today: '2026-11-08', firstName: 'Ana', sessions }, H);
  assert.equal(card.classes, 2);
  assert.equal(card.recordCount, 1);
  assert.equal(card.records[0].value, 35);
});

test('mensaje: máximo 140 caracteres (un emoji cuenta como uno), vacío lo borra', () => {
  let cards = core.setMessage({}, '2026-11', 'cli-a', `  ${'x'.repeat(139)}💪💪 `);
  assert.equal([...cards['2026-11']['cli-a'].message].length, 140);
  assert.ok(cards['2026-11']['cli-a'].message.endsWith('💪'));
  cards = core.markSent(cards, '2026-11', 'cli-a', '2026-11-08T12:00:00.000Z');
  assert.equal(cards['2026-11']['cli-a'].sentAt, '2026-11-08T12:00:00.000Z');
  cards = core.setMessage(cards, '2026-11', 'cli-a', '   ');
  assert.deepEqual(cards, { '2026-11': { 'cli-a': { sentAt: '2026-11-08T12:00:00.000Z' } } });
  const before = JSON.stringify(cards);
  core.markSent(cards, '2026-10', 'cli-b');
  assert.equal(JSON.stringify(cards), before, 'nunca toca el objeto recibido');
});

test('normalizar: meses y entradas inválidas fuera; campos desconocidos de la entrada se conservan', () => {
  const raw = { '2026-11': { 'cli-a': { message: 'Hola', sentAt: '2026-11-08T10:00:00Z', campoFuturo: 1 }, 'cli-b': 'x', '': {} }, malo: {}, '2026-13': {} };
  assert.deepEqual(core.normalizeMonthlyCards(raw), { '2026-11': { 'cli-a': { campoFuturo: 1, message: 'Hola', sentAt: '2026-11-08T10:00:00Z' } } });
  assert.deepEqual(core.normalizeMonthlyCards(null), {});
});

test('datos: monthlyCards sobrevive a guardar y cargar, sube en trainingsV08 y sin usarlo nada cambia', () => {
  const withCards = data.importState(JSON.stringify({ trainingsV08: { sessions: [], monthlyCards: { '2026-11': { 'cli-a': { message: 'Vamos', sentAt: '2026-11-08T10:00:00Z' } } } } }));
  assert.deepEqual(withCards.trainingsV08.monthlyCards, { '2026-11': { 'cli-a': { message: 'Vamos', sentAt: '2026-11-08T10:00:00Z' } } });
  const again = data.importState(JSON.stringify(withCards));
  assert.deepEqual(again.trainingsV08.monthlyCards, withCards.trainingsV08.monthlyCards);
  const payload = sync.buildCloudPayload(withCards);
  assert.deepEqual(payload.trainingsV08.monthlyCards, withCards.trainingsV08.monthlyCards);
  assert.deepEqual(Object.keys(payload).filter((key) => !sync.SYNCED_KEYS.includes(key)), [], 'no hay claves nuevas en la subida');
  const without = data.importState(JSON.stringify({ trainingsV08: { sessions: [] } }));
  assert.equal('monthlyCards' in without.trainingsV08, false, 'si nunca se usó, lo guardado no cambia de forma');
});

test('v0.9.48: Desmarcar quita solo la marca; el mensaje queda; sin nada la entrada desaparece', () => {
  let cards = core.markSent(core.setMessage({}, '2026-11', 'cli-a', 'Bien'), '2026-11', 'cli-a', '2026-11-08T12:00:00.000Z');
  const before = JSON.stringify(cards);
  const unmarked = core.unmarkSent(cards, '2026-11', 'cli-a');
  assert.deepEqual(unmarked, { '2026-11': { 'cli-a': { message: 'Bien' } } });
  assert.equal(JSON.stringify(cards), before, 'nunca toca el objeto recibido');
  cards = core.unmarkSent(core.markSent({}, '2026-11', 'cli-b', '2026-11-08T12:00:00.000Z'), '2026-11', 'cli-b');
  assert.deepEqual(cards, {});
});

test('v0.9.48: la ficha cuenta lo mismo que la tarjeta; un récord solo por tiempo cuenta y no se mezcla con kilos', () => {
  // "Plancha falsa" por tiempo y, con el mismo nombre, una vez con kilos: dos historias separadas.
  const sessions = [
    ses('2026-10-20', [secs('Plancha falsa', [40]), kg('Plancha falsa', [50])]),
    ses('2026-11-03', [secs('Plancha falsa', [45]), kg('Plancha falsa', [10])])
  ];
  const result = core.monthRecords(sessions, '2026-11', H);
  assert.equal(result.count, 1, '45 s supera 40 s; 10 kg no supera 50 kg');
  assert.equal(result.tracked, 2);
  assert.deepEqual(result.list.map((item) => [item.unit, item.value]), [['s', 45]]);
  assert.equal(core.monthRecords([], '2026-11', H).tracked, 0, 'sin cargas → la ficha muestra "—"');
});
