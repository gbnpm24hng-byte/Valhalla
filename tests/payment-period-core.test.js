const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/payment-period-core.js');
require('../assets/js/data.js');
require('../assets/js/sync-core.js');
require('../assets/js/publish-core.js');

const core = globalThis.VALHALLA.paymentPeriodCore;
const data = globalThis.VALHALLA.data;
const syncCore = globalThis.VALHALLA.syncCore;
const publishCore = globalThis.VALHALLA.publishCore;
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Días seguidos desde una fecha (datos falsos).
function days(start, count) {
  return Array.from({ length: count }, (_, index) => core.addDays(start, index));
}
const paid = (extra = {}) => ({ id: 'falso-1', name: 'Alumno Falso', payment_status: 'paid', paidAt: '2026-11-01', ...extra });

test('clases del período: 3 por semana = 12, 2 por semana = 8, sin dato = 12, a mano = 10', () => {
  assert.deepEqual(core.classesForPeriod({}, 3), { total: 12, source: 'week' });
  assert.deepEqual(core.classesForPeriod({}, 2), { total: 8, source: 'week' });
  assert.deepEqual(core.classesForPeriod({}, 0), { total: 12, source: 'default' });
  assert.deepEqual(core.classesForPeriod({}, 9), { total: 12, source: 'default' });
  assert.deepEqual(core.classesForPeriod({ classesPerPayment: 10 }, 3), { total: 10, source: 'manual' });
  assert.deepEqual(core.classesForPeriod({ classesPerPayment: '10' }, 2), { total: 10, source: 'manual' });
  assert.deepEqual(core.classesForPeriod({ classesPerPayment: 0 }, 2), { total: 8, source: 'week' });
  assert.deepEqual(core.classesForPeriod({ classesPerPayment: 'x' }, 2), { total: 8, source: 'week' });
});

test('"Clases por pago" del formulario: vacío = automático; 1 a 99 enteros; lo demás inválido', () => {
  assert.equal(core.parseManualClasses(''), null);
  assert.equal(core.parseManualClasses('  '), null);
  assert.equal(core.parseManualClasses(undefined), null);
  assert.equal(core.parseManualClasses('10'), 10);
  assert.equal(core.parseManualClasses('0'), undefined);
  assert.equal(core.parseManualClasses('100'), undefined);
  assert.equal(core.parseManualClasses('2.5'), undefined);
  assert.equal(core.parseManualClasses('diez'), undefined);
});

test('clases usadas: desde paidAt hasta hoy, un día cuenta una vez', () => {
  const dates = ['2026-10-31', '2026-11-01', '2026-11-01', '2026-11-03', '2026-11-03T10:00', '2026-11-10', 'basura'];
  assert.equal(core.countUsed(dates, '2026-11-01', '2026-11-05'), 2);
  assert.equal(core.countUsed(new Set(dates), '2026-11-01', '2026-11-30'), 3);
});

test('12 clases usadas vuelven a Pendiente (antes de los 28 días)', () => {
  const eleven = core.evaluate(paid(), { today: '2026-11-12', perWeek: 3, dates: days('2026-11-01', 11) });
  assert.equal(eleven.kind, 'active');
  assert.equal(eleven.remaining, 1);
  assert.equal(eleven.warn, true);
  assert.equal(core.notice(eleven), 'le queda 1 clase');
  const twelve = core.evaluate(paid(), { today: '2026-11-12', perWeek: 3, dates: days('2026-11-01', 12) });
  assert.equal(twelve.kind, 'due');
  assert.equal(twelve.reason, 'classes');
  assert.equal(core.describe(twelve), '12 de 12 clases · hasta el 28 nov');
});

test('28 días también vuelven a Pendiente, aunque queden clases', () => {
  const day27 = core.evaluate(paid(), { today: '2026-11-28', perWeek: 3, dates: ['2026-11-02'] });
  assert.equal(day27.kind, 'active');
  assert.equal(day27.daysLeft, 1);
  assert.equal(core.notice(day27), 'su pago vence mañana');
  assert.equal(core.describe(day27), '1 de 12 clases · hasta el 28 nov');
  const day28 = core.evaluate(paid(), { today: '2026-11-29', perWeek: 3, dates: ['2026-11-02'] });
  assert.equal(day28.kind, 'due');
  assert.equal(day28.reason, 'days');
});

test('amarillo con 2 clases o menos, o 3 días o menos; normal con más', () => {
  const ok = core.evaluate(paid(), { today: '2026-11-05', perWeek: 3, dates: days('2026-11-01', 4) });
  assert.equal(ok.warn, false);
  assert.equal(core.describe(ok), '4 de 12 clases · hasta el 28 nov');
  assert.equal(core.notice(ok), '');
  assert.equal(core.evaluate(paid(), { today: '2026-11-11', perWeek: 3, dates: days('2026-11-01', 10) }).warn, true);
  const threeDays = core.evaluate(paid(), { today: '2026-11-26', perWeek: 3, dates: [] });
  assert.equal(threeDays.daysLeft, 3);
  assert.equal(threeDays.warn, true);
  assert.equal(core.notice(threeDays), 'su pago vence en 3 días');
});

test('2 por semana: 8 clases; a mano 10', () => {
  assert.equal(core.evaluate(paid(), { today: '2026-11-10', perWeek: 2, dates: days('2026-11-01', 8) }).kind, 'due');
  const manual = core.evaluate(paid({ classesPerPayment: 10 }), { today: '2026-11-10', perWeek: 2, dates: days('2026-11-01', 8) });
  assert.equal(manual.kind, 'active');
  assert.equal(core.describe(manual), '8 de 10 clases · hasta el 28 nov');
});

test('"No aplica" no cambia nunca; pendiente sin período no avisa; pendiente vencido sí', () => {
  const na = { payment_status: 'not_applicable', paidAt: '2026-01-01' };
  assert.deepEqual(core.evaluate(na, { today: '2026-11-30', dates: days('2026-01-01', 50) }), { kind: 'none' });
  assert.equal(core.notice(core.evaluate({ payment_status: 'pending' }, { today: '2026-11-30' })), '');
  const expired = core.evaluate({ payment_status: 'pending', paidAt: '2026-10-01' }, { today: '2026-11-30' });
  assert.equal(expired.kind, 'expired');
  assert.equal(core.notice(expired), 'su pago venció');
  assert.equal(core.describe(expired), '');
});

test('pagado sin fecha: "Pagado · sin fecha de inicio" y nunca vence solo (no se deduce de finanzas)', () => {
  const client = { name: 'Alumno Falso', full_name: 'Alumno Falso', payment_status: 'paid' };
  const info = core.evaluate(client, { today: '2026-11-30', perWeek: 3, dates: days('2026-10-01', 40) });
  assert.equal(info.kind, 'no-start');
  assert.equal(core.describe(info), 'Pagado · sin fecha de inicio');
  assert.equal(core.notice(info), '');
  assert.equal(core.lastPaymentDate, undefined);
});

test('"Inicio del pago" del formulario: vacío, fecha válida hasta hoy; futura o inválida no', () => {
  assert.equal(core.parseStartDate('', '2026-11-20'), '');
  assert.equal(core.parseStartDate('2026-11-17', '2026-11-20'), '2026-11-17');
  assert.equal(core.parseStartDate('2026-11-20', '2026-11-20'), '2026-11-20');
  assert.equal(core.parseStartDate('2026-11-21', '2026-11-20'), undefined);
  assert.equal(core.parseStartDate('2026-02-30', '2026-11-20'), undefined);
  assert.equal(core.parseStartDate('ayer', '2026-11-20'), undefined);
});

test('Editar: qué paidAt queda al guardar', () => {
  const today = '2026-11-20';
  const f = (prevStatus, prevPaidAt, nextStatus, formDate) => core.startDateFromForm({ prevStatus, prevPaidAt, nextStatus, formDate, today });
  // Pasa a Pagado: hoy, o la fecha que el entrenador escribió (p. ej., le pagó hace 3 días).
  assert.equal(f('pending', undefined, 'paid', ''), today);
  assert.equal(f('pending', undefined, 'paid', '2026-11-17'), '2026-11-17');
  // Vencido (paidAt viejo en el campo sin tocar) que pasa a Pagado: período nuevo desde hoy.
  assert.equal(f('pending', '2026-10-01', 'paid', '2026-10-01'), today);
  // Sigue Pagado: la fecha escrita; vacía = sin fecha de inicio; corregirla hacia atrás vale.
  assert.equal(f('paid', '2026-11-10', 'paid', '2026-11-10'), '2026-11-10');
  assert.equal(f('paid', '2026-11-10', 'paid', '2026-10-15'), '2026-10-15');
  assert.equal(f('paid', undefined, 'paid', '2026-11-17'), '2026-11-17');
  assert.equal(f('paid', '2026-11-10', 'paid', ''), '');
  // Deja de estar Pagado o cambia de estado: se cierra; sigue igual sin pagar: se conserva.
  assert.equal(f('paid', '2026-11-10', 'pending', '2026-11-10'), '');
  assert.equal(f('pending', '2026-10-01', 'overdue', '2026-10-01'), '');
  assert.equal(f('pending', '2026-10-01', 'pending', '2026-10-01'), '2026-10-01');
  assert.equal(f('not_applicable', undefined, 'not_applicable', ''), '');
  // Una fecha que ya cumplió 28 días queda guardada y el período resulta vencido (vuelve a Pendiente).
  const backdated = { payment_status: 'paid', paidAt: f('paid', '2026-11-10', 'paid', '2026-10-15') };
  assert.equal(core.evaluate(backdated, { today, perWeek: 3, dates: [] }).kind, 'due');
});

test('Marcar pagado empieza un período y Volver a pendiente lo cierra (sin tocar lo demás)', () => {
  const client = { id: 'falso-1', payment_status: 'pending', classesPerPayment: 10, monthly_value: 1 };
  const started = core.startPeriod(client, '2026-11-08');
  assert.equal(started.paidAt, '2026-11-08');
  assert.equal(started.classesPerPayment, 10);
  assert.equal(client.paidAt, undefined);
  const closed = core.closePeriod(started);
  assert.equal('paidAt' in closed, false);
  assert.equal(closed.classesPerPayment, 10);
  assert.equal(closed.monthly_value, 1);
});

test('los campos nuevos se conservan al guardar y suben con los alumnos; nunca se publican', () => {
  const client = data.normalizeClient({ id: 'falso-1', full_name: 'Alumno Falso', payment_status: 'paid', paidAt: '2026-11-01', classesPerPayment: 10 });
  assert.equal(client.paidAt, '2026-11-01');
  assert.equal(client.classesPerPayment, 10);
  const payload = syncCore.buildCloudPayload({ clients: [client], movements: [{ id: 'm' }] });
  assert.equal(payload.clients[0].paidAt, '2026-11-01');
  assert.equal(payload.clients[0].classesPerPayment, 10);
  assert.equal(payload.movements, undefined);
  // Un alumno sin los campos nuevos no los recibe (lo que sube no cambia para él).
  const plain = data.normalizeClient({ id: 'falso-2', full_name: 'Otro Falso' });
  assert.equal('paidAt' in plain, false);
  assert.equal('classesPerPayment' in plain, false);
  const publish = read('assets/js/publish-core.js');
  assert.match(publish, /'paidAt', 'classesPerPayment'/);
  assert.ok(publishCore);
});

test('app.js: Marcar pagado y Editar usan el período; la revisión corre al abrir y al guardar', () => {
  const app = read('assets/js/app.js');
  const toggle = app.slice(app.indexOf('async function toggleClientPayment'), app.indexOf('let clientToastTimer'));
  assert.match(toggle, /periodApi\.startPeriod\(existingClient, getTodayLocalDate\(\)\)/);
  assert.match(toggle, /periodApi\.closePeriod\(existingClient\)/);
  const persist = app.slice(app.indexOf('  function persist() {'), app.indexOf('  function escapeHtml('));
  assert.match(persist, /if \(paymentCheck\.ready\) \{\s*applyPaymentPeriods\(\);/);
  assert.match(app, /'synced', 'offline', 'unavailable', 'notUploaded'/);
  // Guardados de sesión/asistencia que no pasan por persist() también revisan los pagos.
  const saveSession = app.slice(app.indexOf('function saveSessionState'), app.indexOf('function escapeHtml'));
  assert.match(saveSession, /if \(paymentCheck\.ready\) \{\s*applyPaymentPeriods\(\);\s*\}\s*dataApi\.saveState\(state\);/);
  ['recordAgendaStatus', 'confirmGroupExercise', 'saveGroupCircuitResults'].forEach((name) => {
    const start = app.indexOf(`function ${name}(`);
    const body = app.slice(start, app.indexOf('\n  }\n', start));
    assert.match(body, /saveSessionState\(\);/, `${name} debe guardar con saveSessionState()`);
    assert.doesNotMatch(body, /dataApi\.saveState\(state\)/, `${name} no debe saltarse la revisión`);
  });
  const apply = app.slice(app.indexOf('function applyPaymentPeriods'), app.indexOf('function runOpenPaymentCheck'));
  assert.doesNotMatch(apply, /movements|\.push\(|splice|amount|monthly_value|paidAt\s*:/);
  const build = app.slice(app.indexOf('function buildClientRecord'), app.indexOf('return normalizeClientRecord({', app.indexOf('function buildClientRecord')));
  assert.match(build, /periodApi\.startDateFromForm\(/);
  assert.match(read('index.html'), /id="clientPaidAt" name="paidAt" type="date"/);
  const html = read('index.html');
  assert.ok(html.indexOf('payment-period-core.js') > 0 && html.indexOf('payment-period-core.js') < html.indexOf('assets/js/app.js'));
  assert.match(html, /id="clientClassesPerPayment" name="classesPerPayment"/);
  assert.match(html, /id="todayPaymentNotice"/);
  assert.match(read('service-worker.js'), /'\.\/assets\/js\/payment-period-core\.js\?v=[\d.]+'/);
});
