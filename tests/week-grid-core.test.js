const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/week-grid-core.js');
require('../assets/js/data.js');
require('../assets/js/sync-core.js');

const week = globalThis.VALHALLA.weekGridCore;
const data = globalThis.VALHALLA.data;
const sync = globalThis.VALHALLA.syncCore;
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Semana del lunes 16 al viernes 20 de noviembre de 2026 (datos falsos).
const DATES = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const slot = (time, modality, names) => ({ time, modality, groupSize: 4, students: names.map((name, index) => ({ id: `id-${name}-${index}`, name })) });
const cell = (grid, col, hour) => grid.rows.find((row) => row.hour === hour).cells[col];

test('semana: lunes a viernes; sábado y domingo muestran la que viene', () => {
  assert.deepEqual(week.weekDates('2026-11-18'), DATES);
  assert.deepEqual(week.weekDates('2026-11-16'), DATES);
  assert.deepEqual(week.weekDates('2026-11-20'), DATES);
  assert.equal(week.weekDates('2026-11-21')[0], '2026-11-23');
  assert.equal(week.weekDates('2026-11-22')[0], '2026-11-23');
  assert.equal(week.weekLabel(DATES), 'Semana del 16 al 20 de noviembre');
  assert.equal(week.weekLabel(week.weekDates('2026-12-02')), 'Semana del 30 de noviembre al 4 de diciembre');
});

test('una clase dura 60 min: 10:00 marca 10; 11:15 marca 11 y 12; sin hora no marca', () => {
  assert.deepEqual(week.hoursTouched('10:00'), [10]);
  assert.deepEqual(week.hoursTouched('11:15'), [11, 12]);
  assert.deepEqual(week.hoursTouched('20:30'), [20]);
  assert.deepEqual(week.hoursTouched('07:30'), [8]);
  assert.deepEqual(week.hoursTouched('Sin hora'), []);
  assert.deepEqual(week.hours(), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
});

test('grilla sin horario: ocupado / libre; con horario: fuera de horario aparte', () => {
  const slotsByDate = {
    '2026-11-16': [slot('10:00', 'group', ['Uno', 'Dos', 'Tres', 'Cuatro']), slot('11:15', 'personalized', ['Alumna Falsa'])],
    '2026-11-18': [slot('10:00', 'group', ['Uno'])],
    '2026-11-20': [slot('10:00', 'group', ['Uno', 'Dos']), slot('Sin hora', 'personalized', ['Sin Hora Falso'])]
  };
  const free = week.buildGrid({ dates: DATES, slotsByDate, workHours: undefined, todayValue: '2026-11-18' });
  assert.equal(free.configured, false);
  assert.equal(cell(free, 0, 10).state, 'busy');
  assert.equal(cell(free, 2, 10).state, 'busy');
  assert.equal(cell(free, 4, 10).state, 'busy');
  assert.equal(cell(free, 1, 10).state, 'free');
  assert.equal(cell(free, 0, 11).state, 'busy');
  assert.equal(cell(free, 0, 12).state, 'busy');
  assert.equal(cell(free, 0, 13).state, 'free');
  assert.equal(cell(free, 0, 8).state, 'free', 'sin horario, nada queda fuera');
  assert.ok(free.rows.every((row) => row.cells.every((item) => item.state !== 'off')));
  assert.deepEqual(free.columns.map((column) => column.isToday), [false, false, true, false, false]);
  assert.deepEqual(free.noHour.map((item) => item.name), ['Sin Hora Falso']);
  assert.deepEqual(week.cellLines(free, 0, 10), ['Lun 10:00 · Grupo · 4 alumnos']);
  assert.deepEqual(week.cellLines(free, 0, 12), ['Lun 11:15 · Personalizado · Alumna Falsa']);
  assert.deepEqual(week.cellLines(free, 2, 10), ['Mié 10:00 · Grupo · 1 alumno']);
  assert.deepEqual(week.cellLines(free, 1, 10), []);

  const work = week.buildGrid({ dates: DATES, slotsByDate, workHours: week.DEFAULT_WORK_HOURS, todayValue: '2026-11-18' });
  assert.equal(work.configured, true);
  assert.equal(cell(work, 0, 8).state, 'free', '08:30 toca la hora 8');
  assert.equal(cell(work, 0, 15).state, 'off', 'lun 15:00 a 17:00 fuera');
  assert.equal(cell(work, 0, 16).state, 'off');
  assert.equal(cell(work, 0, 17).state, 'free');
  assert.equal(cell(work, 0, 20).state, 'off', 'lun termina 20:00');
  assert.equal(cell(work, 4, 20).state, 'free', 'vie termina 20:15');
  assert.equal(cell(work, 4, 12).state, 'free', 'vie 12:00 a 12:30');
  assert.equal(cell(work, 4, 13).state, 'off');
  // Una clase fuera del horario igual se ve ocupada.
  const late = week.buildGrid({ dates: DATES, slotsByDate: { '2026-11-17': [slot('15:30', 'group', ['Uno'])] }, workHours: week.DEFAULT_WORK_HOURS, todayValue: '2026-11-18' });
  assert.equal(cell(late, 1, 15).state, 'busy');
  assert.equal(cell(late, 1, 16).state, 'busy');
});

test('horario: normalizar y revisar el formulario', () => {
  assert.equal(week.normalizeWorkHours(null), null);
  assert.equal(week.normalizeWorkHours({}), null);
  const normal = week.normalizeWorkHours({ days: { 1: [{ from: '8:30', to: '15:00' }, { from: '14:00', to: '16:00' }], 2: [{ from: '10:00', to: '09:00' }] } });
  assert.deepEqual(normal.days[1], [{ from: '08:30', to: '15:00' }], 'el tramo que se cruza se descarta');
  assert.deepEqual(normal.days[2], [], 'desde después de hasta se descarta');
  assert.deepEqual(normal.days[5], []);

  const empty = (n) => ({ n, ranges: [{ from: '', to: '' }, { from: '', to: '' }] });
  const ok = week.validateForm([{ n: 1, ranges: [{ from: '17:00', to: '20:00' }, { from: '08:30', to: '15:00' }] }, empty(2), empty(3), empty(4), empty(5)]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.workHours.days[1], [{ from: '08:30', to: '15:00' }, { from: '17:00', to: '20:00' }], 'se ordenan');
  assert.deepEqual(ok.workHours.days[3], []);
  const bad = week.validateForm([{ n: 1, ranges: [{ from: '10:00', to: '09:00' }] }, { n: 2, ranges: [{ from: '08:00', to: '12:00' }, { from: '11:00', to: '13:00' }] }, { n: 3, ranges: [{ from: '08:00', to: '' }] }]);
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 3);
  assert.match(bad.errors.join(' '), /Lun: "hasta" debe ser después de "desde"\./);
  assert.match(bad.errors.join(' '), /Mar: los dos tramos se cruzan\./);
  assert.match(bad.errors.join(' '), /Mié: el tramo 1 necesita desde y hasta\./);
});

test('la imagen para compartir lleva solo días, horas y libre sí/no (sin nombres)', () => {
  const slotsByDate = { '2026-11-16': [slot('10:00', 'group', ['Nombre Secreto Falso']), slot('13:00', 'personalized', ['Otro Nombre Falso'])] };
  const grid = week.buildGrid({ dates: DATES, slotsByDate, workHours: week.DEFAULT_WORK_HOURS, todayValue: '2026-11-16' });
  const share = week.shareData(grid);
  const text = JSON.stringify(share);
  assert.doesNotMatch(text, /Nombre|Falso|Grupo|Personalizado|alumno/);
  assert.deepEqual(Object.keys(share).sort(), ['days', 'free', 'hours', 'signature', 'title', 'weekLabel']);
  assert.equal(share.free[2][0], false, 'lun 10 ocupado');
  assert.equal(share.free[5][0], false, 'lun 13 ocupado');
  assert.equal(share.free[3][0], true, 'lun 11 libre');
  assert.equal(share.free[8][0], false, 'lun 16 fuera de horario');
  assert.equal(share.title, 'Horas disponibles');
  assert.equal(share.signature, 'by Vikingos Radical');
});

test('bloquear siempre, solo esta semana, desbloquear y hora extra (y la imagen los respeta)', () => {
  const TODAY = '2026-11-16';
  const slotsByDate = { '2026-11-16': [slot('10:00', 'group', ['Uno'])] };
  const build = (workHours) => week.buildGrid({ dates: DATES, slotsByDate, workHours, todayValue: TODAY });
  // Sin horario: bloquear funciona igual (days falta).
  let wh = week.withBlock(undefined, { kind: 'always', day: 2, hour: 9 }, TODAY);
  assert.deepEqual(wh, { blocked: [{ day: 2, hour: 9 }] });
  wh = week.withBlock(wh, { kind: 'week', date: '2026-11-18', hour: 11 }, TODAY);
  let grid = build(wh);
  assert.equal(grid.configured, false);
  assert.equal(cell(grid, 1, 9).state, 'blocked');
  assert.equal(cell(grid, 1, 9).blockKind, 'always');
  assert.equal(cell(grid, 2, 11).blockKind, 'week');
  assert.equal(cell(grid, 2, 9).state, 'free');
  // La semana siguiente: el de siempre sigue, el de esa fecha no.
  const next = week.buildGrid({ dates: week.weekDates('2026-11-23'), slotsByDate: {}, workHours: wh, todayValue: '2026-11-23' });
  assert.equal(cell(next, 1, 9).state, 'blocked');
  assert.equal(cell(next, 2, 11).state, 'free');
  // Una clase manda sobre el bloqueo.
  const busy = build(week.withBlock(wh, { kind: 'always', day: 1, hour: 10 }, TODAY));
  assert.equal(cell(busy, 0, 10).state, 'busy');
  // Menús.
  assert.deepEqual(week.cellMenu(grid, 1, 9).actions.map((a) => a.label), ['Desbloquear']);
  assert.equal(week.cellMenu(grid, 1, 9).title, 'Mar 09:00 · Bloqueada (todas las semanas)');
  assert.deepEqual(week.cellMenu(grid, 3, 9).actions.map((a) => a.label), ['Bloquear esta hora (todas las semanas)', 'Bloquear solo esta semana']);
  assert.deepEqual(week.cellMenu(grid, 0, 10).lines, ['Lun 10:00 · Grupo · 1 alumno']);
  // Desbloquear.
  wh = week.withoutBlock(wh, { day: 2, date: '2026-11-17', hour: 9 }, TODAY);
  assert.deepEqual(wh, { weekBlocked: [{ date: '2026-11-18', hour: 11 }] });
  assert.equal(week.withoutBlock(wh, { day: 3, date: '2026-11-18', hour: 11 }, TODAY), undefined, 'vacío = sin workHours');
  // Hora extra fuera de horario.
  let work = week.withDays(undefined, week.DEFAULT_WORK_HOURS.days, TODAY);
  grid = build(work);
  assert.equal(cell(grid, 0, 15).state, 'off');
  assert.deepEqual(week.cellMenu(grid, 0, 15).actions.map((a) => a.label), ['Marcar disponible solo esta semana']);
  work = week.withExtra(work, { date: '2026-11-16', hour: 15 }, TODAY);
  work = week.withBlock(work, { kind: 'week', date: '2026-11-17', hour: 8 }, TODAY);
  grid = build(work);
  assert.equal(cell(grid, 0, 15).state, 'free');
  assert.equal(cell(grid, 0, 15).extra, true);
  assert.equal(cell(grid, 0, 16).state, 'off');
  assert.ok(week.cellMenu(grid, 0, 15).actions.some((a) => a.id === 'unextra'));
  const share = week.shareData(grid);
  assert.equal(share.free[7][0], true, 'hora extra sale disponible');
  assert.equal(share.free[0][1], false, 'bloqueada no sale');
  assert.equal(share.free[8][0], false);
  // Ajustes: guardar o quitar los tramos conserva bloqueos y extras; las fechas viejas se descartan.
  const kept = week.withoutDays(work, TODAY);
  assert.equal(kept.days, undefined);
  assert.equal(kept.extra.length, 1);
  assert.equal(kept.weekBlocked.length, 1);
  const pruned = week.withBlock(kept, { kind: 'always', day: 5, hour: 20 }, '2027-01-30');
  assert.equal(pruned.extra, undefined);
  assert.deepEqual(pruned.blocked, [{ day: 5, hour: 20 }]);
  assert.equal(week.normalizeWorkHours({ blocked: [{ day: 6, hour: 9 }, { day: 1, hour: 7 }], extra: [{ date: 'x', hour: 9 }] }), null);
});

test('workHours vive en trainingsV08: data.js lo conserva y sube en coach_state', () => {
  const workHours = { days: { 1: [{ from: '08:30', to: '15:00' }], 2: [], 3: [], 4: [], 5: [] } };
  const state = data.importState(JSON.stringify({ clients: [{ id: 'c1', full_name: 'Cliente Falso' }], trainingsV08: { workHours } }));
  assert.deepEqual(state.trainingsV08.workHours, workHours);
  const payload = sync.buildCloudPayload(state);
  assert.deepEqual(payload.trainingsV08.workHours, workHours);
  const back = sync.applyCloudData({}, payload);
  assert.deepEqual(back.trainingsV08.workHours, workHours);
});

test('index.html carga week-grid-core antes de app.js y la grilla va antes de "Más"', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('week-grid-core.js') < html.indexOf('assets/js/app.js'));
  assert.ok(html.indexOf('week-grid.js?') < html.indexOf('assets/js/app.js'));
  assert.ok(html.indexOf('id="todayClasses"') < html.indexOf('id="todayWeek"'));
  assert.ok(html.indexOf('id="todayWeek"') < html.indexOf('id="trainingTodayMore"'));
  assert.ok(html.includes('id="workHoursForm"'));
});
