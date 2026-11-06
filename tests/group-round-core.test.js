const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/group-round-core.js');

const core = globalThis.VALHALLA.groupRoundCore;

test('kilos con coma o punto; se guardan con punto y se muestran con coma', () => {
  assert.equal(core.parseNumber('22,5'), 22.5);
  assert.equal(core.parseNumber('22.5'), 22.5);
  assert.equal(core.parseNumber(''), null);
  assert.equal(core.parseNumber('abc'), null);
  assert.equal(core.normalizeWeightText(' 22,5 '), '22.5');
  assert.equal(core.formatNumber('22.5'), '22,5');
  assert.equal(core.formatNumber(40), '40');
  assert.equal(core.formatNumber(''), '');
});

test('−/+ parte del valor escrito o, si no hay, del gris; nunca bajo 0', () => {
  assert.equal(core.stepValue('40', '35', 2.5), '42.5');
  assert.equal(core.stepValue('', '35', 2.5), '37.5');
  assert.equal(core.stepValue('', '12', -1), '11');
  assert.equal(core.stepValue('', '', 1), '1');
  assert.equal(core.stepValue('1', '', -2.5), '0');
  assert.equal(core.stepValue('22,5', '', 2.5), '25');
});

test('una serie está hecha con peso y reps; la actual es la primera sin hacer', () => {
  const draft = { setCount: 3, s1Weight: '40', s1Reps: '12', s2Weight: '40', s3Weight: '40', s3Reps: '10' };
  assert.equal(core.isSetDone(draft, 1), true);
  assert.equal(core.isSetDone(draft, 2), false);
  assert.deepEqual(core.setProgress(draft), { done: 2, total: 3, current: 2, pending: true });
  assert.deepEqual(core.setProgress({ setCount: 1, s1Weight: '0', s1Reps: '5' }), { done: 1, total: 1, current: 0, pending: false });
});

test('siguiente alumno: circular, primero los que van más atrás; vuelta y ronda completa', () => {
  const states = [
    { clientId: 'a', done: 1, pending: true, active: true },
    { clientId: 'b', done: 0, pending: true, active: true },
    { clientId: 'c', done: 0, pending: true, active: true }
  ];
  assert.equal(core.nextClient(states, 'a'), 'b');
  assert.equal(core.nextClient(states, 'b'), 'c');
  assert.equal(core.nextClient(states, 'c'), 'b');
  assert.equal(core.roundNumber(states), 1);
  const all1 = states.map((s) => ({ ...s, done: 1 }));
  assert.equal(core.nextClient(all1, 'c'), 'a');
  assert.equal(core.roundNumber(all1), 2);
  // c ya terminó sus 2 series: se salta.
  const mixed = [{ clientId: 'a', done: 2, pending: true, active: true }, { clientId: 'b', done: 2, pending: true, active: true }, { clientId: 'c', done: 2, pending: false, active: true }];
  assert.equal(core.nextClient(mixed, 'b'), 'a');
  assert.equal(core.roundComplete(mixed), false);
  assert.equal(core.nextClient(mixed.map((s) => ({ ...s, pending: false })), 'a'), '');
  assert.equal(core.roundComplete(mixed.map((s) => ({ ...s, pending: false }))), true);
  assert.equal(core.roundComplete([{ clientId: 'x', active: false, pending: false }]), false);
  assert.equal(core.nextClient([], 'a'), '');
});

test('resumen de series, decisión que rota e iniciales', () => {
  assert.equal(core.summarizeSets([{ weight: '40', reps: '12' }, { weight: '40', reps: '12' }, { weight: '40', reps: '11' }]), '40 × 12, 12, 11');
  assert.equal(core.summarizeSets([{ weight: '40', reps: '12' }, { weight: '42.5', reps: '' }]), '40 × 12 / 42,5 × —');
  assert.equal(core.summarizeSets([]), '');
  assert.equal(core.cycleDecision('up'), 'keep');
  assert.equal(core.cycleDecision('keep'), 'down');
  assert.equal(core.cycleDecision('down'), 'up');
  assert.equal(core.cycleDecision(''), 'up');
  assert.equal(core.initials('Alumna Falsa'), 'AF');
  assert.equal(core.initials('alumna'), 'AL');
  assert.equal(core.initials(''), '?');
});
