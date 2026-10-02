(function () {
  const { createInitialState } = window.VALHALLA.data;

  function formatCurrency(value) {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0
    }).format(Math.round(value || 0));
  }

  function getMonthRange(referenceDate = new Date()) {
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59);
    return { start, end };
  }

  function getRecurringDates(recurringItem, referenceDate = new Date()) {
    const { end } = getMonthRange(referenceDate);
    const dates = [];
    if (recurringItem.frequency === 'monthly') {
      const day = Math.min(recurringItem.day || 1, end.getDate());
      const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), day);
      if (date >= referenceDate && date <= end) {
        dates.push(date);
      }
      return dates;
    }

    let cursor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    while (cursor.getDay() !== Number(recurringItem.weekday)) {
      cursor.setDate(cursor.getDate() + 1);
    }
    while (cursor <= end) {
      if (cursor >= referenceDate) {
        dates.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 7);
    }
    return dates;
  }

  function getMonthMovements(state, referenceDate = new Date()) {
    const monthKey = referenceDate.toISOString().slice(0, 7);
    return state.movements.filter((movement) => movement.date && movement.date.slice(0, 7) === monthKey);
  }

  function getAccountById(state, accountId) {
    return state.accounts.find((account) => account.id === accountId) || null;
  }

  function getOperationalAccounts(state) {
    return (state.accounts || []).filter((account) => account.isActive !== false && account.isOperational !== false);
  }

  function getDashboardHighlights(state, referenceDate = new Date(), selectedSegment = 'global') {
    const dashboard = calculateDashboard(state, referenceDate, selectedSegment);
    const reserve = Number(state.profile.minimum_reserve || 0);
    const savingsGoal = Number(state.profile.savings_goal || 0);
    const activeClients = (state.clients || []).filter((client) => client.continues && client.status !== 'paid' && client.payment_status !== 'not_applicable');
    const upcomingItems = dashboard.upcomingItems || [];

    return [
      {
        title: 'Finanzas',
        summary: formatCurrency(dashboard.realAvailable),
        detail: dashboard.realAvailable < reserve ? 'Reserva mínima comprometida' : 'Disponible real para operar',
        badge: dashboard.realAvailable < reserve ? 'Atención' : 'En orden',
        nav: 'register',
        buttonLabel: 'Registrar'
      },
      {
        title: 'Clientes',
        summary: (state.clients || []).length ? `${(state.clients || []).length} clientes` : 'Sin información',
        detail: activeClients.length ? `${activeClients.length} pagos por revisar` : 'No hay clientes pendientes',
        badge: (state.clients || []).length ? 'Activos' : 'Pendiente',
        nav: 'clients',
        buttonLabel: 'Ver clientes'
      },
      {
        title: 'Agenda',
        summary: upcomingItems.length ? `${upcomingItems.length} próximos` : 'Sin información',
        detail: upcomingItems[0] ? upcomingItems[0].name : 'Aún no hay fechas destacadas',
        badge: upcomingItems.length ? 'Próximos' : 'Sin datos',
        nav: 'register',
        buttonLabel: 'Ver historial'
      },
      {
        title: 'Alertas',
        summary: dashboard.realAvailable < reserve ? 'Reserva baja' : 'Sin información',
        detail: dashboard.suggestedSavings > 0 ? `Ahorro sugerido ${formatCurrency(dashboard.suggestedSavings)}` : 'Todo se ve estable',
        badge: dashboard.realAvailable < reserve ? 'Atención' : 'Estable',
        nav: 'settings',
        buttonLabel: 'Ajustes'
      },
      {
        title: 'Objetivos',
        summary: savingsGoal > 0 ? formatCurrency(savingsGoal) : 'Sin información',
        detail: dashboard.suggestedSavings > 0 ? `Meta de ahorro ${formatCurrency(dashboard.suggestedSavings)}` : 'Define tu meta de ahorro',
        badge: savingsGoal > 0 ? 'Meta' : 'Pendiente',
        nav: 'settings',
        buttonLabel: 'Configurar'
      }
    ];
  }

  function calculateDashboard(state, referenceDate = new Date(), selectedSegment = 'global') {
    const monthMovements = getMonthMovements(state, referenceDate);
    const filteredMovements = selectedSegment && selectedSegment !== 'global'
      ? monthMovements.filter((movement) => (movement.segment || 'personal') === selectedSegment)
      : monthMovements;
    const incomesReceived = filteredMovements.filter((m) => m.type === 'income').reduce((sum, m) => sum + Number(m.amount || 0), 0);
    const expensesMade = filteredMovements.filter((m) => m.type === 'expense').reduce((sum, m) => sum + Number(m.amount || 0), 0);

    const recurringItems = (state.recurringTransactions || state.recurring || []).filter((item) => item.active);
    const pendingCommitments = recurringItems.reduce((sum, item) => {
      if (item.type === 'expense') {
        const installmentFactor = item.id === 'debt' ? Number(item.installments_pending || item.installmentsPending || 0) : 1;
        return sum + getRecurringDates(item, referenceDate).reduce((innerSum) => innerSum + Number(item.amount || 0) * installmentFactor, 0);
      }
      return sum;
    }, 0);

    const upcomingItems = [];
    recurringItems.forEach((item) => {
      getRecurringDates(item, referenceDate).forEach((date) => {
        upcomingItems.push({ name: item.name, amount: Number(item.amount || 0), type: item.type, date });
      });
    });

    state.clients.filter((client) => client.continues && client.status !== 'paid').forEach((client) => {
      if (client.status === 'uncertain') {
        return;
      }
      const renewalDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), client.renewal_day);
      const { end } = getMonthRange(referenceDate);
      const currentMonth = renewalDate.getMonth() === referenceDate.getMonth() && renewalDate.getFullYear() === referenceDate.getFullYear();
      if (currentMonth && renewalDate >= referenceDate && renewalDate <= end) {
        upcomingItems.push({ name: `Cobro ${client.name}`, amount: Number(client.amount || 0), type: 'income', date: renewalDate });
      }
    });

    const accountBalance = (state.accounts || []).reduce((sum, account) => sum + Number(account.initialBalance || 0), 0);
    const operatingBalance = getOperationalAccounts(state).reduce((sum, account) => sum + Number(account.initialBalance || 0), 0);
    const initialCash = Number(state.profile.initial_cash || 0);
    const projection = initialCash + incomesReceived - expensesMade - pendingCommitments;
    const reserve = Number(state.profile.minimum_reserve || 0);
    const realAvailable = projection - reserve;
    const suggestedSavings = Math.max(0, Math.round(Math.max(0, projection - reserve) * (state.settings.savings_rate || 0.5)));

    const debtPending = (state.debts || []).reduce((sum, debt) => sum + (Number(debt.amountPerInstallment || 0) * Number(debt.installmentsPending || 0)), 0);

    return {
      incomesReceived,
      expensesMade,
      pendingCommitments,
      projection,
      realAvailable,
      suggestedSavings,
      upcomingItems: upcomingItems.sort((a, b) => a.date - b.date),
      totalAccountsBalance: accountBalance,
      operatingBalance,
      debtPending
    };
  }

  function validateMovement(state, movement) {
    const errors = [];
    if (!movement.date) errors.push('La fecha es obligatoria');
    if (Number(movement.amount) <= 0) errors.push('El monto debe ser mayor a cero');
    if (!movement.accountId) errors.push('La cuenta es obligatoria');
    if (!movement.category) errors.push('La categoría es obligatoria');
    const duplicate = state.movements.some((item) => item.date === movement.date && item.description === movement.description && Number(item.amount) === Number(movement.amount));
    if (duplicate) errors.push('El movimiento ya existe');
    return { valid: errors.length === 0, errors };
  }

  function addMovement(state, movement) {
    const normalized = {
      id: movement.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      type: movement.type,
      amount: Number(movement.amount || 0),
      category: movement.category,
      date: movement.date,
      description: movement.description,
      segment: movement.segment,
      accountId: movement.accountId,
      metadata: movement.metadata || {},
      created_at: new Date().toISOString()
    };

    const result = validateMovement(state, normalized);
    if (!result.valid) {
      return { success: false, errors: result.errors };
    }

    state.movements.push(normalized);
    return { success: true, movement: normalized };
  }

  function removeMovement(state, movementId) {
    const initialLength = state.movements.length;
    state.movements = state.movements.filter((item) => item.id !== movementId);
    return { success: state.movements.length < initialLength, removed: state.movements.length < initialLength };
  }

  function toggleClientStatus(state, clientId) {
    const client = state.clients.find((item) => item.id === clientId);
    if (!client) {
      return { success: false, error: 'Cliente no encontrado' };
    }
    const previous = client.status;
    client.status = client.status === 'paid' ? 'pending' : 'paid';
    client.payment_status = client.status;
    if (client.status === 'paid' && previous !== 'paid') {
      addMovement(state, {
        type: 'income',
        amount: client.amount,
        category: 'alumno',
        date: new Date().toISOString().slice(0, 10),
        description: `Pago ${client.name}`,
        segment: 'business'
      });
    } else if (client.status === 'pending' && previous === 'paid') {
      state.movements = state.movements.filter((item) => item.description !== `Pago ${client.name}`);
    }
    return { success: true, client };
  }

  function createRoutine(state, payload) {
    const routine = {
      id: payload.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      studentId: payload.studentId,
      clientId: payload.clientId || payload.studentId,
      name: payload.name,
      date: payload.date,
      exercise: payload.exercise,
      sets: Number(payload.sets || 0),
      reps: Number(payload.reps || 0),
      weight: Number(payload.weight || 0),
      rest: payload.rest,
      performedWeight: payload.performedWeight !== undefined && payload.performedWeight !== '' ? Number(payload.performedWeight) : null,
      performedReps: payload.performedReps !== undefined && payload.performedReps !== '' ? Number(payload.performedReps) : null,
      techniqueNotes: payload.techniqueNotes || '',
      sessionCompleted: Boolean(payload.sessionCompleted),
      created_at: new Date().toISOString()
    };

    state.trainings.routines.push(routine);
    const student = state.trainings.students.find((item) => item.id === payload.studentId);
    if (student) {
      student.routines.push(routine.id);
    }
    return routine;
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.finance = {
    formatCurrency,
    calculateDashboard,
    getDashboardHighlights,
    validateMovement,
    addMovement,
    removeMovement,
    toggleClientStatus,
    createRoutine,
    getMonthMovements,
    getRecurringDates
  };
})();
