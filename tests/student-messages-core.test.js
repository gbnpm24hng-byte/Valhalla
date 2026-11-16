const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/student-messages-core.js');

const msg = globalThis.VALHALLA.studentMessages;
const day = (sets) => ({ sets: sets.map(([weight, reps], index) => ({ setNumber: index + 1, weight, reps })) });

test('saludo con el primer nombre', () => {
  assert.equal(msg.firstName('Ana María Falsa'), 'Ana');
  assert.equal(msg.firstName('  Beto  '), 'Beto');
  assert.equal(msg.firstName(''), '');
});

test('comparado con la última vez: subió peso, subió reps, mismo peso; nada si bajó o no hay anterior', () => {
  assert.deepEqual(msg.exerciseComparison(day([[65, 8], [65, 8]]), day([[60, 8], [60, 8]])), { kind: 'more-weight', text: 'Subiste 5 kg 💪' });
  assert.equal(msg.exerciseComparison(day([[22.5, 8]]), day([[20, 8]])).text, 'Subiste 2,5 kg 💪');
  assert.deepEqual(msg.exerciseComparison(day([[60, 9], [60, 9]]), day([[60, 8], [60, 8]])), { kind: 'more-reps', text: 'Hiciste 2 reps más' });
  assert.equal(msg.exerciseComparison(day([[60, 9]]), day([[60, 8]])).text, 'Hiciste 1 rep más');
  assert.equal(msg.exerciseComparison(day([[60, 8]]), day([[60, 8]])).text, 'Mismo peso, más control: vamos bien en este rango');
  assert.equal(msg.exerciseComparison(day([[55, 10]]), day([[60, 8]])), null);
  assert.equal(msg.exerciseComparison(day([[60, 7]]), day([[60, 8]])), null);
  assert.equal(msg.exerciseComparison(day([[60, 8]]), null), null);
  assert.equal(msg.exerciseComparison(day([[60, 8]]), day([])), null);
  // Por tiempo: los segundos van en "reps".
  assert.equal(msg.exerciseComparison(day([[null, 45]]), day([[null, 35]]), true).text, 'Aguantaste 10 s más 💪');
  assert.equal(msg.exerciseComparison(day([[null, 30]]), day([[null, 35]]), true), null);
});

test('récord del último día entrenado (hasta 7 días después)', () => {
  const records = [{ date: '2026-11-12', name: 'Sentadilla', weight: 70, unit: 'kg' }, { date: '2026-11-12', name: 'Remo', weight: 50, unit: 'kg' }];
  assert.equal(msg.recordMessage(records.slice(0, 1), '2026-11-12', '2026-11-14').text, '¡Récord nuevo en Sentadilla: 70 kg!');
  assert.equal(msg.recordMessage(records, '2026-11-12', '2026-11-12').text, '¡Récord nuevo en Sentadilla: 70 kg! Y 1 récord más.');
  assert.equal(msg.recordMessage(records, '2026-11-12', '2026-11-20'), null);
  assert.equal(msg.recordMessage([], '2026-11-12', '2026-11-12'), null);
});

test('semana completa y racha de 2, 4 y 8 semanas', () => {
  assert.equal(msg.weekMessage(3, 3).text, '¡Semana completa! 3 de 3 🔥');
  assert.equal(msg.weekMessage(4, 3).text, '¡Semana completa! 3 de 3 🔥');
  assert.equal(msg.weekMessage(2, 3), null);
  assert.equal(msg.weekMessage(1, 0), null);
  assert.equal(msg.streakMessage(2).text, '¡2 semanas seguidas! Sigue así 🔥');
  assert.equal(msg.streakMessage(4).kind, 'streak');
  assert.equal(msg.streakMessage(8).kind, 'streak');
  [0, 1, 3, 5, 9].forEach((weeks) => assert.equal(msg.streakMessage(weeks), null));
});

test('máximo 2 mensajes, el del coach primero', () => {
  const all = msg.pick({
    coach: '  Gran semana,  sigue así  ',
    record: { kind: 'record', text: 'R' },
    week: { kind: 'week', text: 'W' },
    streak: { kind: 'streak', text: 'S' }
  });
  assert.deepEqual(all.map((item) => item.kind), ['coach', 'record']);
  assert.equal(all[0].text, 'Gran semana, sigue así');
  assert.deepEqual(msg.pick({ week: { kind: 'week', text: 'W' }, streak: { kind: 'streak', text: 'S' } }).map((item) => item.kind), ['week', 'streak']);
  assert.deepEqual(msg.pick({}), []);
  assert.equal(msg.coachMessage('x'.repeat(200)).length, 140);
});
