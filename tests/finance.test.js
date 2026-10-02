const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/data.js');
require('../assets/js/finance.js');

const { calculateDashboard, getDashboardHighlights, validateMovement, addMovement } = globalThis.VALHALLA.finance;

function createFinanceState() {
  return {
    profile: { initial_cash: 0, minimum_reserve: 0, savings_goal: 0 },
    settings: { savings_rate: 0.5 },
    movements: [],
    recurringTransactions: [],
    accounts: [
      { id: 'account-operating', initialBalance: 0, isActive: true, isOperational: true },
      { id: 'account-savings', initialBalance: 0, isActive: true, isOperational: true }
    ],
    clients: [],
    debts: []
  };
}

test('calculateDashboard returns expected projection and available amount', () => {
  const state = createFinanceState();
  state.profile.initial_cash = 200000;
  state.movements.push({ id: 'm1', type: 'income', amount: 50000, category: 'sueldo', date: '2026-08-05', description: 'Sueldo', segment: 'personal' });
  state.movements.push({ id: 'm2', type: 'expense', amount: 30000, category: 'supermercado', date: '2026-08-04', description: 'Super', segment: 'personal' });

  const dashboard = calculateDashboard(state, new Date('2026-08-15'));

  assert.equal(dashboard.incomesReceived, 50000);
  assert.equal(dashboard.expensesMade, 30000);
  assert.equal(dashboard.pendingCommitments, 0);
  assert.equal(dashboard.realAvailable, 220000);
});

test('validateMovement rejects negative amounts, empty dates, missing account and duplicates', () => {
  const state = createFinanceState();
  const valid = {
    type: 'expense',
    amount: 10000,
    category: 'Monster / bebidas',
    date: '2026-08-04',
    description: 'Monster',
    segment: 'personal',
    accountId: state.accounts[0].id
  };

  assert.equal(validateMovement(state, valid).valid, true);
  assert.equal(validateMovement(state, { ...valid, amount: -1 }).valid, false);
  assert.equal(validateMovement(state, { ...valid, date: '' }).valid, false);
  assert.equal(validateMovement(state, { ...valid, accountId: '' }).valid, false);
  assert.equal(validateMovement(state, { ...valid, category: '' }).valid, false);

  addMovement(state, valid);
  assert.equal(validateMovement(state, valid).valid, false);
});

test('calculateDashboard exposes account balances and excludes non-operational accounts from the operating view', () => {
  const state = createFinanceState();
  state.accounts[0].initialBalance = 100000;
  state.accounts[1].initialBalance = 50000;
  state.accounts[1].isOperational = false;
  state.profile.initial_cash = 0;

  const dashboard = calculateDashboard(state, new Date('2026-08-15'));

  assert.equal(dashboard.totalAccountsBalance, 150000);
  assert.equal(dashboard.operatingBalance, 100000);
});

test('getDashboardHighlights builds the dashboard cards for the new home shell', () => {
  const state = createFinanceState();
  state.profile.minimum_reserve = 50000;
  state.profile.savings_goal = 200000;
  state.clients.push({ id: 'c1', name: 'Ana', status: 'pending', continues: true, renewal_day: 20, amount: 90000 });

  const highlights = getDashboardHighlights(state, new Date('2026-08-15'));

  assert.equal(highlights[0].title, 'Finanzas');
  assert.equal(highlights[1].summary, '1 clientes');
  assert.equal(highlights[4].summary, '$200.000');
  assert.equal(highlights[4].buttonLabel, 'Configurar');
});

test('dashboard payment review excludes clients without a charge', () => {
  const state = createFinanceState();
  state.clients = [
    { id: 'paid', status: 'paid', payment_status: 'paid', continues: true },
    { id: 'pending', status: 'pending', payment_status: 'pending', continues: true },
    { id: 'internal', status: 'not_applicable', payment_status: 'not_applicable', continues: true }
  ];

  const clientsCard = getDashboardHighlights(state, new Date('2026-08-15')).find((card) => card.title === 'Clientes');

  assert.equal(clientsCard.detail, '1 pagos por revisar');
});
