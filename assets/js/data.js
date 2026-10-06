(function () {
  const DEFAULT_RECURRING_TRANSACTIONS = [];

  const INITIAL_STATE = {
    profile: {
      name: 'Sebastián',
      initial_cash: 0,
      minimum_reserve: 0,
      savings_goal: 0
    },
    settings: {
      magic_budget: 30000,
      ant_budget: 30000,
      savings_rate: 0.5,
      coach_whatsapp_number: ''
    },
    accounts: [
      { id: 'account-bancoestado', name: 'Cuenta Corriente BancoEstado', initialBalance: 0, isActive: true, isMain: true, isOperational: true },
      { id: 'account-rut', name: 'CuentaRUT', initialBalance: 0, isActive: true, isMain: false, isOperational: true },
      { id: 'account-global66', name: 'Global66', initialBalance: 0, isActive: true, isMain: false, isOperational: false },
      { id: 'account-efectivo', name: 'Efectivo', initialBalance: 0, isActive: true, isMain: false, isOperational: true }
    ],
    categories: [
      { id: 'cat-breakfast', name: 'Desayuno', group: 'personal' },
      { id: 'cat-lunch', name: 'Almuerzo', group: 'personal' },
      { id: 'cat-once', name: 'Once', group: 'personal' },
      { id: 'cat-supermarket', name: 'Supermercado', group: 'personal' },
      { id: 'cat-fiesta', name: 'Fiesta', group: 'personal' },
      { id: 'cat-paseo', name: 'Paseo', group: 'personal' },
      { id: 'cat-transporte', name: 'Transporte', group: 'personal' },
      { id: 'cat-magic', name: 'Magic', group: 'personal' },
      { id: 'cat-mariela', name: 'Mariela', group: 'personal' },
      { id: 'cat-monster', name: 'Monster / bebidas', group: 'personal' },
      { id: 'cat-other-personal', name: 'Otros personales', group: 'personal' },
      { id: 'cat-rent', name: 'Arriendo', group: 'business' },
      { id: 'cat-light', name: 'Luz', group: 'business' },
      { id: 'cat-internet', name: 'Internet', group: 'business' },
      { id: 'cat-work-fuel', name: 'Bencina de trabajo', group: 'business' },
      { id: 'cat-equipment', name: 'Equipamiento', group: 'business' },
      { id: 'cat-maintenance', name: 'Mantención', group: 'business' },
      { id: 'cat-advertising', name: 'Publicidad', group: 'business' },
      { id: 'cat-teachers', name: 'Profesores', group: 'business' },
      { id: 'cat-materials', name: 'Materiales', group: 'business' },
      { id: 'cat-other-business', name: 'Otros del negocio', group: 'business' },
      { id: 'cat-salary', name: 'Sueldo', group: 'income' },
      { id: 'cat-student', name: 'Alumno', group: 'income' },
      { id: 'cat-extraordinary', name: 'Aporte extraordinario', group: 'income' },
      { id: 'cat-income-other', name: 'Otro ingreso', group: 'income' }
    ],
    movements: [],
    recurring: JSON.parse(JSON.stringify(DEFAULT_RECURRING_TRANSACTIONS)),
    recurringTransactions: JSON.parse(JSON.stringify(DEFAULT_RECURRING_TRANSACTIONS)),
    financialGoals: [
      { id: 'goal-debt', name: 'Pago de deuda', targetAmount: 1200000, accumulatedAmount: 0, priority: 'alta', targetDate: '', progress: 0 },
      { id: 'goal-travel', name: 'Viaje', targetAmount: 800000, accumulatedAmount: 0, priority: 'media', targetDate: '', progress: 0 },
      { id: 'goal-gym', name: 'Equipamiento del gimnasio', targetAmount: 900000, accumulatedAmount: 0, priority: 'media', targetDate: '', progress: 0 },
      { id: 'goal-emergency', name: 'Fondo de emergencia', targetAmount: 1000000, accumulatedAmount: 0, priority: 'alta', targetDate: '', progress: 0 },
      { id: 'goal-magic', name: 'Magic', targetAmount: 300000, accumulatedAmount: 0, priority: 'media', targetDate: '', progress: 0 }
    ],
    debts: [
      { id: 'debt-main', name: 'Deuda total', totalAmount: 1200000, installmentsTotal: 12, installmentsPaid: 5, installmentsPending: 7, amountPerInstallment: 100000, status: 'active' }
    ],
    clients: [],
    trainings: {
      students: [
        { id: 'alumno-1', name: 'Martín', routines: [] },
        { id: 'alumno-2', name: 'Camila', routines: [] }
      ],
      routines: []
    },
    trainingModelVersion: '0.8.0',
    trainingsV08: {
      plans: [],
      sessions: [],
      programs: [],
      assignments: []
    },
    exerciseLibrary: [
      {
        id: 'library-squat',
        name: 'Sentadilla',
        normalizedName: 'sentadilla',
        description: 'Patrón principal de fuerza y potencia para piernas.',
        pattern: 'squat',
        primaryMuscle: 'quadriceps',
        secondaryMuscles: ['glutes', 'core'],
        equipments: ['barbell', 'rack'],
        technicalLevel: 'intermediate',
        loadType: 'external_load',
        active: true,
        relations: []
      },
      {
        id: 'library-bench',
        name: 'Press de banca',
        normalizedName: 'press-de-banca',
        description: 'Empuje horizontal para pecho, hombros y tríceps.',
        pattern: 'horizontal_push',
        primaryMuscle: 'chest',
        secondaryMuscles: ['triceps', 'front_delts'],
        equipments: ['barbell', 'bench'],
        technicalLevel: 'intermediate',
        loadType: 'external_load',
        active: true,
        relations: []
      },
      {
        id: 'library-row',
        name: 'Remo con barra',
        normalizedName: 'remo-con-barra',
        description: 'Patrón de tracción para espalda y bíceps.',
        pattern: 'horizontal_pull',
        primaryMuscle: 'lats',
        secondaryMuscles: ['mid_back', 'biceps'],
        equipments: ['barbell'],
        technicalLevel: 'beginner',
        loadType: 'external_load',
        active: true,
        relations: []
      }
    ],
    sportsProfiles: [],
    sportsConsiderations: [],
    movementStatuses: []
  };

  const STORAGE_KEY = 'valhalla_v07';
  const LEGACY_STORAGE_KEYS = ['valhalla_v05', 'valhalla_v06'];

  function createId(prefix) {
    return `${prefix}-${(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)}`;
  }

  function createInitialNutritionPlan() {
    return {
      id: createId('plan'),
      name: 'Ciclo base 9 días + día 10 libre',
      description: 'Plantilla editable para seguimiento general de nutrición con día libre al final del ciclo.',
      cycleLength: 10,
      freeDay: true,
      waterMinLiters: 3,
      waterMaxLiters: 5,
      active: true,
      days: [
        {
          dayNumber: 1,
          name: 'Día 1',
          description: 'Inicio del ciclo con enfoque en alimentos simples y estructura básica.',
          carbohydrateLevel: 'bajo',
          meals: [
            { id: createId('meal'), mealName: 'Desayuno', time: '08:00', blocks: [{ type: 'Proteína', quantity: '', unit: '', options: '' }], supplements: '', instructions: '' }
          ],
          supplements: '',
          instructions: 'Registrar fotos y mediciones en el día 9 o 10.'
        },
        {
          dayNumber: 4,
          name: 'Día 4',
          description: 'Aumento de carbohidratos según la pauta y revisión del seguimiento.',
          carbohydrateLevel: 'medio',
          meals: [
            { id: createId('meal'), mealName: 'Almuerzo', time: '13:00', blocks: [{ type: 'Carbohidrato', quantity: '', unit: '', options: '' }], supplements: '', instructions: '' }
          ],
          supplements: '',
          instructions: 'Ajustar según respuesta del alumno y criterio del entrenador.'
        },
        {
          dayNumber: 10,
          name: 'Día 10 libre',
          description: 'Día libre o comida libre según configuración del entrenador.',
          carbohydrateLevel: 'libre',
          meals: [
            { id: createId('meal'), mealName: 'Comida libre', time: '', blocks: [{ type: 'Otro', quantity: '', unit: '', options: '' }], supplements: '', instructions: '' }
          ],
          supplements: '',
          instructions: 'Se puede usar como día libre o para una comida de mayor flexibilidad.'
        }
      ]
    };
  }

  function createInitialFoodBlocks() {
    return [
      { id: createId('food'), type: 'Proteína', name: 'Proteína tradicional', portion: '', unit: '', alternatives: '', tags: ['tradicional'] },
      { id: createId('food'), type: 'Proteína', name: 'Proteína vegetariana', portion: '', unit: '', alternatives: '', tags: ['vegetariana'] },
      { id: createId('food'), type: 'Carbohidrato', name: 'Carbohidrato integral', portion: '', unit: '', alternatives: '', tags: ['integral'] },
      { id: createId('food'), type: 'Vegetal', name: 'Vegetales', portion: '', unit: '', alternatives: '', tags: ['vegetal'] },
      { id: createId('food'), type: 'Grasa', name: 'Grasas', portion: '', unit: '', alternatives: '', tags: ['grasa'] },
      { id: createId('food'), type: 'Fruta', name: 'Fruta', portion: '', unit: '', alternatives: '', tags: ['fruta'] },
      { id: createId('food'), type: 'Colación', name: 'Colación', portion: '', unit: '', alternatives: '', tags: ['colacion'] },
      { id: createId('food'), type: 'Otro', name: 'Hidratación', portion: '', unit: 'L', alternatives: '', tags: ['hidratacion'] }
    ];
  }

  function createInitialState() {
    const state = JSON.parse(JSON.stringify(INITIAL_STATE));
    state.clients = state.clients.map((client) => normalizeClient(client));
    state.nutritionProfiles = [];
    state.nutritionPlans = [createInitialNutritionPlan()];
    state.nutritionLogs = [];
    state.foodBlocks = createInitialFoodBlocks();
    state.trainingModelVersion = '0.8.0';
    state.trainingsV08 = {
      plans: [],
      sessions: [],
      programs: [],
      assignments: []
    };
    state.exerciseLibrary = Array.isArray(state.exerciseLibrary) && state.exerciseLibrary.length
      ? state.exerciseLibrary.map((exercise) => normalizeLibraryExercise(exercise))
      : [
          normalizeLibraryExercise({
            id: 'library-squat',
            name: 'Sentadilla',
            normalizedName: 'sentadilla',
            description: 'Patrón principal de fuerza y potencia para piernas.',
            pattern: 'squat',
            primaryMuscle: 'quadriceps',
            secondaryMuscles: ['glutes', 'core'],
            equipments: ['barbell', 'rack'],
            technicalLevel: 'intermediate',
            loadType: 'external_load',
            active: true
          }),
          normalizeLibraryExercise({
            id: 'library-bench',
            name: 'Press de banca',
            normalizedName: 'press-de-banca',
            description: 'Empuje horizontal para pecho, hombros y tríceps.',
            pattern: 'horizontal_push',
            primaryMuscle: 'chest',
            secondaryMuscles: ['triceps', 'front_delts'],
            equipments: ['barbell', 'bench'],
            technicalLevel: 'intermediate',
            loadType: 'external_load',
            active: true
          })
        ];
    state.sportsProfiles = [];
    state.sportsConsiderations = [];
    state.movementStatuses = [];
    return state;
  }

  function normalizeSportsProfile(profile) {
    return {
      id: profile.id || createId('sports-profile'),
      clientId: profile.clientId || profile.client_id || '',
      primaryGoal: profile.primaryGoal || profile.primary_goal || 'otro',
      secondaryGoal: profile.secondaryGoal || profile.secondary_goal || '',
      goalNotes: profile.goalNotes || profile.goal_notes || '',
      experienceLevel: profile.experienceLevel || profile.experience_level || 'principiante',
      experienceMonths: Math.max(0, Number(profile.experienceMonths ?? profile.experience_months ?? 0)),
      coachStartDate: profile.coachStartDate || profile.coach_start_date || '',
      sessionsPerWeek: Math.max(0, Number(profile.sessionsPerWeek ?? profile.sessions_per_week ?? 3)),
      sessionDurationMinutes: Math.max(0, Number(profile.sessionDurationMinutes ?? profile.session_duration_minutes ?? 60)),
      coachNotes: profile.coachNotes || profile.coach_notes || ''
    };
  }

  function normalizeSportsConsideration(item) {
    return {
      id: item.id || createId('sports-consideration'),
      clientId: item.clientId || item.client_id || '',
      title: item.title || '',
      description: item.description || '',
      status: item.status || 'activa',
      notedOn: item.notedOn || item.noted_on || new Date().toISOString().slice(0, 10),
      reviewDate: item.reviewDate || item.review_date || ''
    };
  }

  function normalizeMovementStatus(item) {
    return {
      id: item.id || createId('movement-status'),
      clientId: item.clientId || item.client_id || '',
      movementName: item.movementName || item.movement_name || '',
      movementKey: item.movementKey || item.movement_key || '',
      status: item.status || 'no_evaluado',
      coachNote: item.coachNote || item.coach_note || '',
      evaluated1rm: item.evaluated1rm ?? item.evaluated_1rm ?? '',
      lastEvaluatedOn: item.lastEvaluatedOn || item.last_evaluated_on || ''
    };
  }

  function normalizeJointDemand(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {
      back: clampDemandValue(input.back ?? input.spine ?? input.espalda ?? 0),
      shoulder: clampDemandValue(input.shoulder ?? input.hombro ?? 0),
      knee: clampDemandValue(input.knee ?? input.rodilla ?? 0),
      hip: clampDemandValue(input.hip ?? input.cadera ?? 0)
    };
  }

  function clampDemandValue(value) {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.min(2, Math.max(0, Math.round(numeric)));
  }

  function normalizeLibraryExercise(item) {
    const jointDemand = normalizeJointDemand(item.jointDemand || item.joint_demand || item.demandArticular || item.articularDemand || {});
    const existingRelations = Array.isArray(item.relations) ? item.relations.map((relation) => ({
      id: relation.id || createId('library-relation'),
      relatedExerciseId: relation.relatedExerciseId || relation.related_exercise_id || '',
      relationType: relation.relationType || relation.relation_type || 'alternative_to',
      notes: relation.notes || '',
      relatedExerciseName: relation.relatedExerciseName || relation.related_exercise_name || ''
    })) : [];

    return {
      id: item.id || createId('library-exercise'),
      name: item.name || 'Ejercicio',
      normalizedName: item.normalizedName || item.normalized_name || '',
      description: item.description || '',
      pattern: item.pattern || 'other',
      primaryMuscle: item.primaryMuscle || item.primary_muscle || 'full_body',
      secondaryMuscles: Array.isArray(item.secondaryMuscles)
        ? item.secondaryMuscles.slice()
        : (Array.isArray(item.secondary_muscles) ? item.secondary_muscles.slice() : []),
      equipments: Array.isArray(item.equipments)
        ? item.equipments.slice()
        : (Array.isArray(item.equipment_keys) ? item.equipment_keys.slice() : []),
      technicalLevel: item.technicalLevel || item.technical_level || 'beginner',
      loadType: item.loadType || item.load_type || 'external_load',
      jointDemand,
      active: item.active !== false,
      baseExerciseId: item.baseExerciseId || item.base_exercise_id || item.baseId || '',
      alternativeGroupId: item.alternativeGroupId || item.alternative_group_id || item.alternativeGroup || '',
      relations: existingRelations
    };
  }

  function slugifyTrainingPart(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'base';
  }

  function normalizeTrainingSet(setEntry, index) {
    const rawType = String(setEntry.setType || setEntry.set_type || 'S').trim().toUpperCase();
    const setType = rawType === 'A' || rawType === 'T' || rawType === 'S' ? rawType : 'S';
    const rir = setEntry.rir === '' || setEntry.rir === undefined || setEntry.rir === null ? null : Number(setEntry.rir);
    return {
      setNumber: Number(setEntry.setNumber || index + 1),
      weight: Number(setEntry.weight || 0),
      // null = repeticiones sin dato (no se convierte en 0); los números guardados no cambian.
      reps: setEntry.reps === null || setEntry.reps === '' ? null : Number(setEntry.reps || 0),
      completed: setEntry.completed !== false,
      setType,
      rir: Number.isFinite(rir) ? rir : null,
      createdAt: setEntry.createdAt || new Date().toISOString(),
      techniqueStatus: setEntry.techniqueStatus || 'pending',
      coachValidated: Boolean(setEntry.coachValidated),
      personalRecord: Boolean(setEntry.personalRecord)
    };
  }

  function normalizeTrainingExercise(exercise, index) {
    const plannedSets = Number(exercise.plannedSets || exercise.sets || 1);
    const rawRepMin = exercise.plannedRepMin === null ? null : (exercise.plannedRepMin || exercise.reps || 1);
    const rawRepMax = exercise.plannedRepMax === null ? null : (exercise.plannedRepMax || exercise.reps || rawRepMin);
    const plannedRepMin = rawRepMin === null ? null : Number(rawRepMin);
    const plannedRepMax = rawRepMax === null ? null : Number(rawRepMax);
    return {
      id: exercise.id || createId('tx-exercise'),
      programExerciseId: exercise.programExerciseId || '',
      exerciseName: exercise.exerciseName || exercise.exercise || 'Ejercicio',
      order: Number(exercise.order || index + 1),
      plannedSets: plannedSets > 0 ? plannedSets : 1,
      plannedRepMin: plannedRepMin === null ? null : plannedRepMin > 0 ? plannedRepMin : 1,
      plannedRepMax: plannedRepMax === null ? null : plannedRepMax >= plannedRepMin ? plannedRepMax : plannedRepMin,
      targetWeight: exercise.targetWeight === null ? null : Number(exercise.targetWeight || exercise.weight || 0),
      restSeconds: Number(exercise.restSeconds || 90),
      coachNotes: exercise.coachNotes || exercise.techniqueNotes || '',
      sets: Array.isArray(exercise.sets)
        ? exercise.sets.map((setEntry, setIndex) => normalizeTrainingSet(setEntry, setIndex))
        : []
    };
  }

  function normalizeTrainingSession(session, index) {
    const status = session.status || (session.sessionCompleted ? 'completed' : 'in_progress');
    return {
      id: session.id || createId('tx-session'),
      clientId: session.clientId || session.studentId || '',
      programAssignmentId: session.programAssignmentId || '',
      programId: session.programId || '',
      programDayId: session.programDayId || '',
      programDayName: session.programDayName || '',
      planId: session.planId || null,
      groupSessionId: session.groupSessionId || null,
      date: session.date || '',
      title: session.title || session.name || `Sesión ${index + 1}`,
      status,
      notes: session.notes || '',
      exercises: Array.isArray(session.exercises)
        ? session.exercises.map((exercise, exerciseIndex) => normalizeTrainingExercise(exercise, exerciseIndex))
        : []
    };
  }

  function normalizeTrainingProgramExercise(exercise, index) {
    const rawRepRangeMin = exercise.repRangeMin === null || exercise.repMin === null
      ? null
      : (exercise.repRangeMin ?? exercise.rep_min ?? exercise.repMin ?? exercise.plannedRepMin ?? 1);
    const rawRepRangeMax = exercise.repRangeMax === null || exercise.repMax === null
      ? null
      : (exercise.repRangeMax ?? exercise.rep_max ?? exercise.repMax ?? exercise.plannedRepMax ?? rawRepRangeMin);
    const repRangeMin = rawRepRangeMin === null || rawRepRangeMin === '' ? null : Number(rawRepRangeMin);
    const repRangeMax = rawRepRangeMax === null || rawRepRangeMax === '' ? null : Number(rawRepRangeMax);
    const plannedSets = Number(exercise.sets ?? exercise.plannedSets ?? exercise.planned_sets ?? 1);
    const approximations = Array.isArray(exercise.approximations)
      ? exercise.approximations.map((item, itemIndex) => ({
        id: item.id || createId('program-approximation'),
        label: item.label || `A${itemIndex + 1}`,
        weight: item.weight === null ? null : Number(item.weight || 0),
        reps: item.reps === null ? null : Number(item.reps || 0)
      }))
      : [];
    const effectiveSets = Array.isArray(exercise.effectiveSets)
      ? exercise.effectiveSets.map((item, itemIndex) => ({
        id: item.id || createId('program-set'),
        label: item.label || `S${itemIndex + 1}`,
        weight: item.weight === null ? null : Number(item.weight || 0),
        reps: item.reps === null ? null : Number(item.reps || 0),
        rir: item.rir === '' || item.rir === undefined || item.rir === null ? null : Number(item.rir)
      }))
      : [];

    return {
      id: exercise.id || createId('program-exercise'),
      libraryExerciseId: exercise.libraryExerciseId || exercise.library_exercise_id || '',
      exerciseName: exercise.exerciseName || exercise.name || `Ejercicio ${index + 1}`,
      category: exercise.category || 'OTROS',
      notes: exercise.notes || '',
      sets: Number.isFinite(plannedSets) && plannedSets > 0 ? plannedSets : 1,
      repMin: repRangeMin === null ? null : Number.isFinite(repRangeMin) && repRangeMin > 0 ? repRangeMin : 1,
      repMax: repRangeMax === null ? null : Number.isFinite(repRangeMax) && repRangeMax >= repRangeMin ? repRangeMax : (repRangeMin || 1),
      repRangeMin: repRangeMin === null ? null : Number.isFinite(repRangeMin) && repRangeMin > 0 ? repRangeMin : 1,
      repRangeMax: repRangeMax === null ? null : Number.isFinite(repRangeMax) && repRangeMax >= repRangeMin ? repRangeMax : (repRangeMin || 1),
      targetWeight: exercise.targetWeight === null || exercise.weight === null ? null : Number(exercise.targetWeight ?? exercise.weight ?? 0),
      restSeconds: Number(exercise.restSeconds ?? 90),
      zone: exercise.zone || '',
      weightConvention: exercise.weightConvention || 'external',
      approximations,
      effectiveSets
    };
  }

  function normalizeTrainingProgramDay(day, index) {
    return {
      id: day.id || createId('program-day'),
      name: day.name || `Día ${index + 1}`,
      order: Number(day.order || index + 1),
      exercises: Array.isArray(day.exercises)
        ? day.exercises.map((exercise, exerciseIndex) => normalizeTrainingProgramExercise(exercise, exerciseIndex))
        : []
    };
  }

  function normalizeTrainingProgram(program) {
    return {
      id: program.id || createId('program'),
      name: program.name || 'Programa de entrenamiento',
      objective: program.objective || '',
      startDate: program.startDate || '',
      durationWeeks: Number(program.durationWeeks || 0),
      weeklyFrequency: Number(program.weeklyFrequency || 0),
      assignedClientIds: Array.isArray(program.assignedClientIds) ? program.assignedClientIds.filter(Boolean) : [],
      days: Array.isArray(program.days)
        ? program.days.map((day, index) => normalizeTrainingProgramDay(day, index)).sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        : [],
      createdAt: program.createdAt || new Date().toISOString(),
      updatedAt: program.updatedAt || new Date().toISOString()
    };
  }

  function normalizeTrainingProgramAssignment(assignment, state) {
    const programId = assignment.programId || assignment.program?.id || '';
    const baseProgram = programId && state?.trainingsV08?.programs?.length
      ? state.trainingsV08.programs.find((program) => program.id === programId)
      : (assignment.program || null);
    const baseProgramNormalized = baseProgram ? normalizeTrainingProgram(baseProgram) : null;
    const days = Array.isArray(assignment.days) && assignment.days.length
      ? assignment.days.map((day, index) => normalizeTrainingProgramDay(day, index))
      : (baseProgramNormalized?.days || []).map((day, index) => ({ ...day, id: day.id || createId('assignment-day'), order: index + 1, exercises: day.exercises.map((exercise) => ({ ...exercise, id: exercise.id || createId('assignment-exercise') })) }));
    const weeklyDays = Array.isArray(assignment.weeklyDays)
      ? assignment.weeklyDays.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 1 && item <= 7)
      : (Array.isArray(assignment.daysOfWeek) ? assignment.daysOfWeek.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 1 && item <= 7) : []);
    const durationWeeks = Number.isFinite(Number(assignment.durationWeeks))
      ? Number(assignment.durationWeeks)
      : (Number(baseProgramNormalized?.durationWeeks) || 4);
    const resolvedWeeklyFrequency = Number.isFinite(Number(assignment.weeklyFrequency))
      ? Number(assignment.weeklyFrequency)
      : (weeklyDays.length ? weeklyDays.length : (Number(baseProgramNormalized?.weeklyFrequency) || 3));

    return {
      id: assignment.id || createId('program-assignment'),
      programId,
      clientId: assignment.clientId || '',
      clientName: assignment.clientName || '',
      programName: assignment.programName || baseProgramNormalized?.name || 'Programa',
      objective: assignment.objective || baseProgramNormalized?.objective || '',
      startDate: assignment.startDate || baseProgramNormalized?.startDate || '',
      durationWeeks,
      weeklyDays: [...new Set(weeklyDays)].sort((a, b) => a - b),
      weeklyFrequency: resolvedWeeklyFrequency,
      status: assignment.status || 'active',
      days: days.map((day, index) => ({ ...day, order: index + 1 })),
      createdAt: assignment.createdAt || new Date().toISOString(),
      updatedAt: assignment.updatedAt || new Date().toISOString()
    };
  }

  function mergeTrainingSessionsById(existingItems, incomingItems) {
    const map = new Map();
    [...(existingItems || []), ...(incomingItems || [])].forEach((item, index) => {
      const normalized = normalizeTrainingSession(item, index);
      if (!normalized.id) {
        return;
      }
      map.set(normalized.id, normalized);
    });
    return Array.from(map.values());
  }

  function migrateLegacyRoutinesToV08(routines) {
    if (!Array.isArray(routines) || !routines.length) {
      return [];
    }

    const sessionsMap = new Map();
    routines.forEach((routine, index) => {
      const clientId = routine.clientId || routine.studentId || '';
      if (!clientId) {
        return;
      }

      const date = routine.date || '';
      const title = routine.name || 'Sesión migrada';
      const sessionKey = `${slugifyTrainingPart(clientId)}-${slugifyTrainingPart(date)}-${slugifyTrainingPart(title)}`;
      const sessionId = `legacy-session-${sessionKey}`;
      if (!sessionsMap.has(sessionId)) {
        sessionsMap.set(sessionId, {
          id: sessionId,
          clientId,
          planId: null,
          groupSessionId: null,
          date,
          title,
          status: routine.sessionCompleted ? 'completed' : 'in_progress',
          notes: '',
          exercises: []
        });
      }

      const session = sessionsMap.get(sessionId);
      const exerciseId = routine.id ? `legacy-exercise-${routine.id}` : `legacy-exercise-${index + 1}`;
      const exercise = {
        id: exerciseId,
        exerciseName: routine.exercise || 'Ejercicio migrado',
        order: session.exercises.length + 1,
        plannedSets: Number(routine.sets || 1),
        plannedRepMin: Number(routine.reps || 1),
        plannedRepMax: Number(routine.reps || 1),
        targetWeight: Number(routine.weight || 0),
        restSeconds: Number(routine.restSeconds || parseInt(String(routine.rest || '').replace(/\D/g, ''), 10) || 90),
        coachNotes: routine.techniqueNotes || '',
        sets: []
      };

      if (routine.performedWeight || routine.performedReps) {
        exercise.sets.push(normalizeTrainingSet({
          setNumber: 1,
          weight: Number(routine.performedWeight || routine.weight || 0),
          reps: Number(routine.performedReps || routine.reps || 0),
          completed: routine.sessionCompleted !== false,
          createdAt: routine.created_at || new Date().toISOString(),
          techniqueStatus: 'pending',
          coachValidated: false,
          personalRecord: false
        }, 0));
      }

      session.exercises.push(exercise);
    });

    return Array.from(sessionsMap.values()).map((session, index) => normalizeTrainingSession(session, index));
  }

  function normalizeClient(client) {
    const fullName = client.full_name || client.name || '';
    const phone = client.phone || client.phone_number || '';
    const service = client.service || 'Personalizado';
    const monthlyValue = Number(client.monthly_value ?? client.amount ?? 0);
    const paymentStatus = client.payment_status || (client.status === 'paid' ? 'paid' : client.status === 'uncertain' ? 'uncertain' : client.status === 'overdue' ? 'overdue' : 'pending');
    const clientStatus = client.client_status || (client.status === 'uncertain' ? 'uncertain' : client.continues === false ? 'inactive' : 'active');
    const renewalDate = client.renewal_date || '';
    const renewalDayFromDate = renewalDate ? new Date(renewalDate) : null;
    const renewalDay = client.renewal_day || (renewalDayFromDate && !Number.isNaN(renewalDayFromDate.getTime()) ? renewalDayFromDate.getDate() : '');
    const normalized = {
      ...client,
      id: client.id || createId('client'),
      full_name: fullName,
      name: fullName,
      phone,
      email: client.email || '',
      birth_date: client.birth_date || '',
      age: client.age === '' || client.age === undefined || client.age === null ? '' : Math.max(1, Math.min(120, Math.floor(Number(client.age) || 1))),
      training_days: client.training_days || '',
      service,
      monthly_value: monthlyValue,
      amount: Number(client.amount ?? monthlyValue),
      schedule_notes: client.schedule_notes || client.schedule || '',
      objective: client.objective || '',
      training_experience: client.training_experience || '',
      avoid_exercises: client.avoid_exercises || '',
      intake_comment: client.intake_comment || '',
      injuries: client.injuries || '',
      observations: client.observations || '',
      emergency_contact: client.emergency_contact || '',
      emergency_phone: client.emergency_phone || '',
      start_date: client.start_date || '',
      renewal_date: renewalDate,
      renewal_day: renewalDay,
      sessions_total: Math.max(0, Math.floor(Number(client.sessions_total ?? 0) || 0)),
      sessions_used: Math.max(0, Math.floor(Number(client.sessions_used ?? 0) || 0)),
      sessions_month: String(client.sessions_month || ''),
      training_modality: client.training_modality === 'group' ? 'group' : 'personalized',
      training_group_size: Math.max(2, Math.min(4, Math.floor(Number(client.training_group_size || 2)))),
      training_attendance: Array.isArray(client.training_attendance) ? client.training_attendance.map((entry) => ({
        sessionKey: String(entry.sessionKey || ''),
        date: String(entry.date || ''),
        time: String(entry.time || ''),
        markedAt: String(entry.markedAt || ''),
        status: ['attended', 'rescheduled', 'no_show'].includes(entry.status) ? entry.status : 'attended',
        reason: String(entry.reason || ''),
        noticeDays: entry.noticeDays === undefined || entry.noticeDays === null || entry.noticeDays === ''
          ? null
          : Math.max(0, Math.floor(Number(entry.noticeDays) || 0)),
        requestedBy: ['student', 'coach'].includes(entry.requestedBy) ? entry.requestedBy : ''
      })) : [],
      payment_status: paymentStatus,
      client_status: clientStatus,
      status: paymentStatus,
      active: client.active !== false,
      continues: client.continues !== undefined ? client.continues : clientStatus !== 'inactive'
    };
    return normalized;
  }

  function resetClientSessionMonth(client, currentMonth) {
    const month = String(currentMonth || '').slice(0, 7);
    if (!client || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return false;
    }
    const lastMonth = String(client.sessions_month || '');
    if (lastMonth === month) {
      return false;
    }
    if (lastMonth) {
      client.sessions_used = 0;
    }
    client.sessions_month = month;
    return true;
  }

  function normalizeNutritionProfile(profile) {
    const next = {
      id: profile.id || createId('profile'),
      clientId: profile.clientId || '',
      objective: profile.objective || '',
      dietType: profile.dietType || 'Tradicional',
      restrictions: profile.restrictions || '',
      notes: profile.notes || '',
      cycleStartDate: profile.cycleStartDate || '',
      currentPlanId: profile.currentPlanId || '',
      active: profile.active !== false,
      createdAt: profile.createdAt || new Date().toISOString(),
      updatedAt: profile.updatedAt || new Date().toISOString()
    };
    return next;
  }

  function normalizeNutritionPlan(plan) {
    const next = {
      id: plan.id || createId('plan'),
      name: plan.name || 'Plan sin nombre',
      description: plan.description || '',
      cycleLength: Number(plan.cycleLength || 10),
      freeDay: plan.freeDay !== false,
      waterMinLiters: Number(plan.waterMinLiters || 3),
      waterMaxLiters: Number(plan.waterMaxLiters || 5),
      active: plan.active !== false,
      days: Array.isArray(plan.days) ? plan.days.map((day, index) => ({
        dayNumber: Number(day.dayNumber || index + 1),
        name: day.name || `Día ${index + 1}`,
        description: day.description || '',
        carbohydrateLevel: day.carbohydrateLevel || '',
        meals: Array.isArray(day.meals) ? day.meals.map((meal) => ({
          id: meal.id || createId('meal'),
          mealName: meal.mealName || '',
          time: meal.time || '',
          blocks: Array.isArray(meal.blocks) ? meal.blocks.map((block) => ({
            type: block.type || '',
            quantity: block.quantity || '',
            unit: block.unit || '',
            options: block.options || ''
          })) : []
        })) : [],
        supplements: day.supplements || '',
        instructions: day.instructions || ''
      })) : []
    };
    return next;
  }

  function normalizeNutritionLog(log) {
    return {
      id: log.id || createId('log'),
      clientId: log.clientId || '',
      planId: log.planId || '',
      date: log.date || new Date().toISOString().slice(0, 10),
      cycleDay: Number(log.cycleDay || 1),
      completedMeals: Number(log.completedMeals || 0),
      totalMeals: Number(log.totalMeals || 0),
      waterLiters: Number(log.waterLiters || 0),
      supplementsCompleted: log.supplementsCompleted || false,
      energy: Number(log.energy || 0),
      hunger: Number(log.hunger || 0),
      digestion: log.digestion || 'Regular',
      weight: log.weight ? Number(log.weight) : '',
      notes: log.notes || '',
      createdAt: log.createdAt || new Date().toISOString()
    };
  }

  function normalizeFoodBlock(block) {
    return {
      id: block.id || createId('food'),
      type: block.type || '',
      name: block.name || '',
      portion: block.portion || '',
      unit: block.unit || '',
      alternatives: block.alternatives || '',
      tags: Array.isArray(block.tags) ? block.tags : []
    };
  }

  // "Agregar ejercicios desde un respaldo": decide qué ejercicios del respaldo se agregan.
  // Solo agrega los que no existen ya (por id o por nombre sin tildes ni mayúsculas, incluidos
  // los inactivos); nunca modifica ni reemplaza los existentes. Los agregados conservan su id,
  // así los programas que ya apuntan a ellos los vuelven a encontrar.
  function planLibraryAdditions(currentLibrary, backupLibrary) {
    const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const current = Array.isArray(currentLibrary) ? currentLibrary : [];
    const takenIds = new Set(current.map((item) => item && item.id).filter(Boolean));
    const takenNames = new Set(current.map((item) => fold(item && (item.name || item.normalizedName))).filter(Boolean));
    const toAdd = [];
    const skipped = [];
    (Array.isArray(backupLibrary) ? backupLibrary : []).forEach((item) => {
      if (!item || typeof item !== 'object') {
        return;
      }
      const name = String(item.name || item.normalizedName || '').trim();
      const key = fold(name);
      if (!name) {
        skipped.push({ name: '(sin nombre)', reason: 'sin nombre' });
      } else if (item.id && takenIds.has(item.id)) {
        skipped.push({ name, reason: 'ya existe (mismo id)' });
      } else if (takenNames.has(key)) {
        skipped.push({ name, reason: 'ya existe un ejercicio con ese nombre' });
      } else {
        const normalized = normalizeLibraryExercise(item);
        toAdd.push(normalized);
        takenIds.add(normalized.id);
        takenNames.add(key);
      }
    });
    return { toAdd, skipped };
  }

  function normalizeArray(items, fallback, normalizeItem) {
    if (Array.isArray(items)) {
      return items.map((item, index) => normalizeItem(item, index)).filter(Boolean);
    }
    return fallback.map((item, index) => normalizeItem(item, index));
  }

  function normalizeAccount(account) {
    return {
      id: account.id || createId('account'),
      name: account.name || 'Cuenta',
      initialBalance: Number(account.initialBalance || 0),
      isActive: account.isActive !== false,
      isMain: account.isMain === true,
      isOperational: account.isOperational !== false
    };
  }

  function normalizeFinancialGoal(goal) {
    const targetAmount = Number(goal.targetAmount || 0);
    const accumulatedAmount = Number(goal.accumulatedAmount || 0);
    const progress = Number(goal.progress || Math.min(100, targetAmount ? (accumulatedAmount / targetAmount) * 100 : 0));
    return {
      id: goal.id || createId('goal'),
      name: goal.name || 'Meta',
      targetAmount,
      accumulatedAmount,
      priority: goal.priority || 'media',
      targetDate: goal.targetDate || '',
      progress: Number.isFinite(progress) ? progress : 0
    };
  }

  function normalizeDebt(debt) {
    return {
      id: debt.id || createId('debt'),
      name: debt.name || 'Deuda',
      totalAmount: Number(debt.totalAmount || 0),
      installmentsTotal: Number(debt.installmentsTotal || 0),
      installmentsPaid: Number(debt.installmentsPaid || 0),
      installmentsPending: Number(debt.installmentsPending || 0),
      amountPerInstallment: Number(debt.amountPerInstallment || 0),
      status: debt.status || 'active'
    };
  }

  function mergeArrayById(existingItems, incomingItems, normalizeItem) {
    const base = Array.isArray(incomingItems) && incomingItems.length ? incomingItems : existingItems;
    const merged = [];
    const byId = new Map();
    base.forEach((item) => {
      const normalized = normalizeItem(item);
      byId.set(normalized.id, normalized);
      merged.push(normalized);
    });
    existingItems.forEach((item) => {
      const normalized = normalizeItem(item);
      if (!byId.has(normalized.id)) {
        merged.push(normalized);
      }
    });
    return merged;
  }

  function mergeWithDefaults(parsed) {
    const base = createInitialState();
    // Una lista guardada (aunque esté vacía) reemplaza a la de ejemplo; los valores por defecto
    // solo se usan cuando el dato guardado no trae esa lista.
    const mergeList = (defaults, incoming, normalizeItem) => mergeArrayById(Array.isArray(incoming) ? [] : defaults, incoming, normalizeItem);
    const legacyMigratedSessions = migrateLegacyRoutinesToV08(parsed.trainings?.routines || []);
    const parsedSessions = Array.isArray(parsed.trainingsV08?.sessions) ? parsed.trainingsV08.sessions : [];
    const mergedSessions = mergeTrainingSessionsById(parsedSessions, legacyMigratedSessions);
    const recurringSource = Array.isArray(parsed.recurringTransactions) && (parsed.recurringTransactions.length || !Array.isArray(parsed.recurring))
      ? parsed.recurringTransactions
      : (Array.isArray(parsed.recurring) ? parsed.recurring : base.recurring);
    const merged = {
      ...base,
      ...parsed,
      profile: { ...base.profile, ...(parsed.profile || {}) },
      settings: { ...base.settings, ...(parsed.settings || {}) },
      accounts: mergeList(base.accounts, parsed.accounts, normalizeAccount),
      categories: mergeList(base.categories, parsed.categories, (item) => ({ id: item.id || createId('category'), name: item.name || 'Categoría', group: item.group || 'personal' })),
      recurring: mergeList(base.recurring, recurringSource, (item) => item),
      recurringTransactions: mergeList(base.recurringTransactions, recurringSource, (item) => item),
      clients: mergeList(base.clients, parsed.clients, normalizeClient),
      movements: mergeList(base.movements, parsed.movements, (item) => item),
      financialGoals: mergeList(base.financialGoals, parsed.financialGoals, normalizeFinancialGoal),
      debts: mergeList(base.debts, parsed.debts, normalizeDebt),
      trainings: {
        students: Array.isArray(parsed.trainings?.students)
          ? mergeArrayById([], parsed.trainings.students, (item) => item)
          : base.trainings.students,
        routines: Array.isArray(parsed.trainings?.routines)
          ? mergeArrayById([], parsed.trainings.routines, (item) => item)
          : base.trainings.routines
      },
      trainingModelVersion: parsed.trainingModelVersion || '0.8.0',
      trainingsV08: {
        plans: normalizeArray(parsed.trainingsV08?.plans, base.trainingsV08.plans, (plan) => ({
          id: plan.id || createId('tx-plan'),
          clientId: plan.clientId || '',
          name: plan.name || 'Plan de entrenamiento',
          active: plan.active !== false,
          notes: plan.notes || ''
        })),
        sessions: mergedSessions,
        programs: normalizeArray(parsed.trainingsV08?.programs, base.trainingsV08.programs, normalizeTrainingProgram),
        assignments: normalizeArray(parsed.trainingsV08?.assignments, base.trainingsV08.assignments, (assignment) => normalizeTrainingProgramAssignment(assignment, { trainingsV08: { programs: parsed.trainingsV08?.programs || [] } }))
      },
      exerciseLibrary: normalizeArray(parsed.exerciseLibrary, base.exerciseLibrary, normalizeLibraryExercise),
      sportsProfiles: normalizeArray(parsed.sportsProfiles, base.sportsProfiles, normalizeSportsProfile),
      sportsConsiderations: normalizeArray(parsed.sportsConsiderations, base.sportsConsiderations, normalizeSportsConsideration),
      movementStatuses: normalizeArray(parsed.movementStatuses, base.movementStatuses, normalizeMovementStatus),
      nutritionProfiles: normalizeArray(parsed.nutritionProfiles, base.nutritionProfiles, normalizeNutritionProfile),
      nutritionPlans: normalizeArray(parsed.nutritionPlans, base.nutritionPlans, normalizeNutritionPlan),
      nutritionLogs: normalizeArray(parsed.nutritionLogs, base.nutritionLogs, normalizeNutritionLog),
      foodBlocks: normalizeArray(parsed.foodBlocks, base.foodBlocks, normalizeFoodBlock)
    };
    return merged;
  }

  function loadState() {
    try {
      const existingKeys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
      const storedRaw = existingKeys.map((key) => ({ key, value: localStorage.getItem(key) })).find((entry) => Boolean(entry.value));
      if (!storedRaw) {
        return createInitialState();
      }
      const parsed = JSON.parse(storedRaw.value);
      return mergeWithDefaults(parsed);
    } catch (error) {
      console.warn('No se pudo cargar el estado inicial', error);
      return createInitialState();
    }
  }

  function saveState(state) {
    try {
      const serialized = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, serialized);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        throw new Error('saveState no escribió valhalla_v07');
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('saveState escribió un estado inválido');
      }
      // Ya quedó guardado en el equipo; la sincronización (cloud-sync.js) sube después.
      if (window && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('valhalla:state-saved'));
      }
      return raw;
    } catch (error) {
      const message = error?.message || 'No se pudo guardar el estado en localStorage';
      console.error(message, error);
      if (window && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('valhalla:storage-error', { detail: { message, error } }));
      }
      throw new Error(message);
    }
  }

  function exportState(state) {
    return JSON.stringify(state, null, 2);
  }

  function importState(raw) {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Respaldo inválido');
    }
    return mergeWithDefaults(parsed);
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.data = {
    STORAGE_KEY,
    LEGACY_STORAGE_KEYS,
    createInitialState,
    planLibraryAdditions,
    loadState,
    saveState,
    exportState,
    importState,
    createId,
    normalizeClient,
    resetClientSessionMonth,
    normalizeLibraryExercise,
    normalizeSportsProfile,
    normalizeSportsConsideration,
    normalizeMovementStatus,
    normalizeTrainingProgram,
    normalizeTrainingProgramAssignment
  };
})();
