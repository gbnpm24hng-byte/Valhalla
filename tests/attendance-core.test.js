const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/attendance-core.js');
require('../assets/js/data.js');
require('../assets/js/payment-period-core.js');
require('../assets/js/publish-core.js');

const att = globalThis.VALHALLA.attendanceCore;
const data = globalThis.VALHALLA.data;
const period = globalThis.VALHALLA.paymentPeriodCore;
const publishCore = globalThis.VALHALLA.publishCore;
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const NOW = '2026-11-16T12:00:00.000Z';

test('una marca por día: Vino, No vino (sin descuento), Vino a otra clase y quitar', () => {
  let client = { id: 'falso-1', training_attendance: [{ sessionKey: 'viejo', date: '2026-11-10', status: 'attended' }] };
  client.training_attendance = att.withMark(client, { date: '2026-11-12', status: 'attended', time: '9:05', now: NOW });
  assert.equal(att.entryFor(client, '2026-11-12').status, 'attended');
  assert.equal(att.entryFor(client, '2026-11-12').time, '09:05');
  assert.equal(att.entryFor(client, '2026-11-12').sessionKey, '2026-11-12:ficha');
  // Cambiar la marca del mismo día la reemplaza (nunca dos marcas el mismo día).
  client.training_attendance = att.withMark(client, { date: '2026-11-12', status: 'no_show', now: NOW });
  assert.equal(client.training_attendance.filter((entry) => entry.date === '2026-11-12').length, 1);
  assert.equal(att.entryFor(client, '2026-11-12').noDiscount, true);
  assert.equal(att.statusLabel(att.entryFor(client, '2026-11-12')), 'No vino');
  client.training_attendance = att.withMark(client, { date: '2026-11-12', status: 'attended', otherClass: true, classLabel: 'Personalizado 13:00', now: NOW });
  assert.equal(att.statusLabel(att.entryFor(client, '2026-11-12')), 'Vino a otra clase (Personalizado 13:00)');
  client.training_attendance = att.withMark(client, { date: '2026-11-12', status: '' });
  assert.equal(att.entryFor(client, '2026-11-12'), null);
  assert.deepEqual(client.training_attendance.map((entry) => entry.sessionKey), ['viejo'], 'lo demás no cambia');
  assert.deepEqual(att.withMark(client, { date: 'mal', status: 'attended' }), client.training_attendance);
});

test('la marca de esa clase gana; si no, la última del día', () => {
  const client = { training_attendance: [
    { sessionKey: 'a', date: '2026-11-12', status: 'no_show' },
    { sessionKey: 'b', date: '2026-11-12', status: 'attended' }
  ] };
  assert.equal(att.entryFor(client, '2026-11-12', 'a').status, 'no_show');
  assert.equal(att.entryFor(client, '2026-11-12', 'otra').status, 'attended');
  assert.equal(att.entryFor({}, '2026-11-12'), null);
});

test('data.js conserva los campos nuevos de cada marca y del alumno', () => {
  const client = data.normalizeClient({
    id: 'falso-2',
    classesUsedBefore: 4,
    coachMessage: 'Vamos',
    classMoves: [{ date: '2026-11-18', time: '13:00', modality: 'personalized' }],
    training_attendance: [{ sessionKey: 'x', date: '2026-11-12', status: 'attended', otherClass: true, classLabel: 'Grupo 17:00' }, null]
  });
  assert.equal(client.training_attendance.length, 1);
  assert.equal(client.training_attendance[0].otherClass, true);
  assert.equal(client.training_attendance[0].classLabel, 'Grupo 17:00');
  assert.equal(client.classesUsedBefore, 4);
  assert.equal(client.coachMessage, 'Vamos');
  assert.equal(client.classMoves[0].time, '13:00');
});

test('Solo un día: uno por fecha, el nuevo reemplaza al de ese día; quitar', () => {
  let client = { classMoves: [] };
  client.classMoves = att.withMove(client, { date: '2026-11-18', time: '13:00', modality: 'personalized' }, NOW);
  client.classMoves = att.withMove(client, { date: '2026-11-17', time: '17:00', modality: 'group', groupSize: 9, slotKey: '17:00:group:4' }, NOW);
  assert.deepEqual(client.classMoves.map((move) => move.date), ['2026-11-17', '2026-11-18']);
  assert.equal(att.moveFor(client, '2026-11-17').groupSize, 4);
  assert.equal(att.moveFor(client, '2026-11-17').slotKey, '17:00:group:4');
  assert.equal(att.classLabel(att.moveFor(client, '2026-11-18')), 'Personalizado 13:00');
  client.classMoves = att.withMove(client, { date: '2026-11-18', time: '10:00', modality: 'group' }, NOW);
  assert.equal(client.classMoves.length, 2);
  assert.equal(att.moveFor(client, '2026-11-18').time, '10:00');
  client.classMoves = att.withoutMove(client, '2026-11-18');
  assert.equal(att.moveFor(client, '2026-11-18'), null);
  assert.equal(att.moveFor({}, '2026-11-18'), null);
});

test('Desde ahora: días, hora, servicio y modalidad (los campos de Editar)', () => {
  assert.deepEqual(att.scheduleChange({ weekdays: [4, 2, 2], time: '13:00', service: 'Personalizado', modality: 'personalized' }), {
    training_days: 'martes, jueves', schedule_notes: '13:00', service: 'Personalizado', training_modality: 'personalized', training_group_size: 1
  });
  assert.equal(att.scheduleChange({ weekdays: [1], time: '17:00', service: '', modality: 'group', groupSize: 3 }).service, 'Grupo');
  assert.equal(att.scheduleChange({ weekdays: [], time: '13:00' }), null);
  assert.equal(att.scheduleChange({ weekdays: [1], time: '' }), null);
});

test('pago: ajuste de 4 clases + 3 asistencias = 7 de 12; a las 12 o a los 28 días vence', () => {
  const client = { payment_status: 'paid', paidAt: '2026-11-02', classesUsedBefore: 4 };
  const dates = ['2026-11-03', '2026-11-05', '2026-11-05', '2026-10-30'];
  const info = period.evaluate(client, { today: '2026-11-10', perWeek: 3, dates });
  assert.equal(info.counted, 2);
  assert.equal(info.before, 4);
  assert.equal(info.used, 6);
  const seven = period.evaluate(client, { today: '2026-11-10', perWeek: 3, dates: [...dates, '2026-11-07'] });
  assert.equal(seven.used, 7);
  assert.equal(seven.total, 12);
  assert.deepEqual(period.headline(client, seven), { text: 'Pago: 7 de 12 clases · vence el 30 nov', tone: 'ok', kind: 'active' });
  const twelve = period.evaluate({ ...client, classesUsedBefore: 9 }, { today: '2026-11-10', perWeek: 3, dates: [...dates, '2026-11-07'] });
  assert.equal(twelve.kind, 'due');
  assert.equal(period.evaluate(client, { today: '2026-11-30', perWeek: 3, dates }).kind, 'due');
  assert.equal(period.headline({ payment_status: 'pending' }, { kind: 'none' }).text, 'Pago: Pendiente');
  assert.equal(period.headline({ payment_status: 'pending' }, { kind: 'none' }).tone, 'warn');
  assert.equal(period.headline({ payment_status: 'paid' }, { kind: 'no-start' }).kind, 'no-start');
  assert.deepEqual(period.headline({ payment_status: 'overdue' }), { text: 'Pago: Atrasado', tone: 'warn', kind: 'status' }); // sin rojo en la ficha
});

test('ajuste manual: sin el campo = 0; Editar acepta 0-99; un pago nuevo lo vuelve a 0', () => {
  assert.equal(period.usedBefore({}), 0);
  assert.equal(period.usedBefore({ classesUsedBefore: 'x' }), 0);
  assert.equal(period.parseUsedBefore(''), 0);
  assert.equal(period.parseUsedBefore('4'), 4);
  assert.equal(period.parseUsedBefore('-1'), undefined);
  assert.equal(period.parseUsedBefore('2.5'), undefined);
  const next = period.startPeriod({ id: 'x', classesUsedBefore: 4 }, '2026-11-16');
  assert.equal('classesUsedBefore' in next, false);
  assert.equal(period.startPeriod({ id: 'x' }, '2026-11-16', 3).classesUsedBefore, 3);
  // Sin el campo, el conteo es el de siempre.
  assert.equal(period.evaluate({ payment_status: 'paid', paidAt: '2026-11-02' }, { today: '2026-11-10', dates: ['2026-11-03'] }).used, 1);
});

test('lo publicado nunca lleva el ajuste de clases; el mensaje del coach solo si hay texto', () => {
  assert.ok(publishCore.FORBIDDEN_KEYS.includes('classesUsedBefore'));
  const assignment = { id: 'a1', programName: 'P', days: [] };
  const plain = publishCore.buildPublication(assignment, [], []);
  assert.equal('coachMessage' in plain.program, false, 'sin mensaje, igual que antes');
  assert.deepEqual(publishCore.buildPublication(assignment, [], [], { coachMessage: '   ' }).program, plain.program);
  const withMessage = publishCore.buildPublication(assignment, [], [], { coachMessage: '  ¡Gran   semana!  ' + 'x'.repeat(200) });
  assert.equal(withMessage.program.coachMessage.length, 140);
  assert.match(withMessage.program.coachMessage, /^¡Gran semana! x/);
  assert.deepEqual(publishCore.findForbiddenKeys(withMessage), []);
});

test('app: Hoy marca con ✓/✗, agrega alumnos y la ficha tiene asistencia, cambio de clase y mensaje', () => {
  const app = read('assets/js/app.js');
  ['data-today-mark', 'data-today-add', 'data-ficha-sheet', 'data-coach-msg-form', 'data-ficha-paid-at-form'].forEach((attr) => assert.ok(app.includes(attr), attr));
  // "No vino" nunca descuenta: ya no se escribe sessions_used.
  assert.doesNotMatch(app, /client\.sessions_used\s*=/);
  assert.doesNotMatch(app, /resetClientSessionMonth\(client/);
  const html = read('index.html');
  assert.doesNotMatch(html, /clientSessionsTotal|clientSessionsUsed/);
  assert.match(html, /id="clientClassesUsedBefore" name="classesUsedBefore"/);
  assert.match(html, /<details class="client-form-more" id="clientMoreData">/);
  assert.ok(html.indexOf('attendance-core.js') > 0 && html.indexOf('attendance-core.js') < html.indexOf('assets/js/app.js'));
});
