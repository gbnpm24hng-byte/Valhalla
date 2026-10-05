(function () {
  if (window.VALHALLA?.onboarding?.active) {
    return;
  }

  const dataApi = window.VALHALLA.data;
  const financeApi = window.VALHALLA.finance;
  const supabaseApi = window.VALHALLA.supabase;
  const cloudDataApi = window.VALHALLA.cloudData;

  const state = dataApi.loadState();
  const currentSessionMonth = getTodayLocalDate().slice(0, 7);
  let sessionMonthChanged = false;
  state.clients.forEach((client) => {
    sessionMonthChanged = dataApi.resetClientSessionMonth(client, currentSessionMonth) || sessionMonthChanged;
  });
  if (sessionMonthChanged) {
    dataApi.saveState(state);
  }
  const nutritionUi = {
    selectedClientId: state.clients[0]?.id || '',
    editingPlanId: null,
    dailyDate: new Date().toISOString().slice(0, 10)
  };
  const trainingUi = {
    selectedClientId: '',
    programDayClientId: '',
    selectedProgramDayId: '',
    selectedExercise: '',
    activeSessionId: '',
    activeExerciseId: '',
    editingSetNumber: null,
    editingExerciseId: '',
    editingTemplateId: '',
    editingTemplateExerciseId: '',
    activeTrainingView: 'today',
    editingProgramId: '',
    editingProgramDayId: '',
    editingProgramExerciseId: '',
    programExerciseDraft: null
  };
  const planningUi = {
    currentStep: 1,
    selectedClientIds: [],
    objective: 'Fuerza',
    duration: 4,
    frequency: 3,
    currentDayIndex: 0,
    currentDayName: 'Día A',
    category: 'PIERNAS',
    selectedCategory: null,
    exerciseDraft: null,
    draftProgram: null,
    baseProgramId: '',
    moreOptionsOpen: false,
    weeklyDays: []
  };
  const groupSessionUi = {
    selectedClientIds: [],
    sessionDate: getTodayLocalDate(),
    drafts: {},
    message: ''
  };
  const routineBuilder = {
    screen: 'day',
    activeDayIndex: 0,
    category: null,
    exerciseId: null,
    editingIndex: null,
    search: '',
    showMoreOptions: false,
    draft: {
      sets: 3,
      repMin: 8,
      repMax: 12,
      targetWeight: '',
      approximations: [],
      zone: '',
      restSeconds: 90,
      notes: ''
    }
  };
  const studentUi = {
    enabled: false,
    clientId: '',
    sessionId: '',
    exerciseIndex: 0,
    editingSetNumber: null,
    restRemaining: 0,
    restRunning: false,
    restTimerId: null,
    startedAt: null
  };
  const clientUi = {
    search: '',
    filter: 'all',
    editingId: null,
    detailId: '',
    detailType: '',
    formOpen: false,
    saving: false,
    notice: '',
    noticeTone: 'neutral',
    records: (state.clients || []).map((client) => normalizeClientRecord(client)),
    loading: false
  };
  const cloudUi = {
    sessionActive: false,
    ownerId: '',
    authUserId: ''
  };

  const els = {
    cloudModeBadge: document.getElementById('cloudModeBadge'),
    authPanel: document.getElementById('authPanel'),
    nav: document.querySelector('.nav'),
    sections: {
      home: document.getElementById('home'),
      register: document.getElementById('register'),
      clients: document.getElementById('clients'),
      trainings: document.getElementById('trainings'),
      studentTraining: document.getElementById('studentTraining'),
      nutrition: document.getElementById('nutrition'),
      settings: document.getElementById('settings')
    },
    metrics: {
      initialCash: document.getElementById('initialCash'),
      incomes: document.getElementById('incomes'),
      expenses: document.getElementById('expenses'),
      available: document.getElementById('available'),
      projection: document.getElementById('projection'),
      savings: document.getElementById('saving'),
      pending: document.getElementById('pending')
    },
    advice: document.getElementById('advice'),
    upcoming: document.getElementById('upcoming'),
    dashboardCards: document.getElementById('dashboardCards'),
    movementsTable: document.getElementById('movementsTable'),
    form: document.getElementById('movementForm'),
    formMessage: document.getElementById('formMessage'),
    segmentFilter: document.getElementById('segmentFilter'),
    categorySelect: document.getElementById('category'),
    accountSelect: document.getElementById('accountId'),
    quickCategories: document.getElementById('quickCategories'),
    accountSettings: document.getElementById('accountSettings'),
    accountSettingsMessage: document.getElementById('accountSettingsMessage'),
    clientList: document.getElementById('clientList'),
    clientFormPanel: document.getElementById('clientFormPanel'),
    clientForm: document.getElementById('clientForm'),
    clientFormTitle: document.getElementById('clientFormTitle'),
    clientFormMessage: document.getElementById('clientFormMessage'),
    clientMessage: document.getElementById('clientMessage'),
    clientSearch: document.getElementById('clientSearch'),
    clientNewBtn: document.getElementById('newClientBtn'),
    clientCancelBtn: document.getElementById('clientCancelBtn'),
    clientSubmitBtn: document.getElementById('clientSubmitBtn'),
    clientCount: document.getElementById('clientCount'),
    trainingsStudents: document.getElementById('trainingsStudents'),
    routineForm: document.getElementById('routineForm'),
    routineMessage: document.getElementById('routineMessage'),
    trainingClientNotice: document.getElementById('trainingClientNotice'),
    trainingViewTabs: document.getElementById('trainingViewTabs'),
    trainingViewMessage: document.getElementById('trainingViewMessage'),
    trainingTodayView: document.getElementById('trainingTodayView'),
    trainingAgendaDate: document.getElementById('trainingAgendaDate'),
    trainingAgendaToday: document.getElementById('trainingAgendaToday'),
    trainingAgendaUpcoming: document.getElementById('trainingAgendaUpcoming'),
    programDaySelect: document.getElementById('programDaySelect'),
    programDayMessage: document.getElementById('programDayMessage'),
    trainingPlanningView: document.getElementById('trainingPlanningView'),
    trainingProgressView: document.getElementById('trainingProgressView'),
    trainingGroupView: document.getElementById('trainingGroupView'),
    groupSessionClients: document.getElementById('groupSessionClients'),
    groupSessionDate: document.getElementById('groupSessionDate'),
    groupSessionMessage: document.getElementById('groupSessionMessage'),
    groupSessionRows: document.getElementById('groupSessionRows'),
    importWhatsAppBtn: document.getElementById('importWhatsAppBtn'),
    whatsAppImportPanel: document.getElementById('whatsAppImportPanel'),
    whatsAppImportText: document.getElementById('whatsAppImportText'),
    parseWhatsAppImportBtn: document.getElementById('parseWhatsAppImportBtn'),
    cancelWhatsAppImportBtn: document.getElementById('cancelWhatsAppImportBtn'),
    whatsAppImportMessage: document.getElementById('whatsAppImportMessage'),
    clientAge: document.getElementById('clientAge'),
    clientTrainingExperience: document.getElementById('clientTrainingExperience'),
    clientAvoidExercises: document.getElementById('clientAvoidExercises'),
    clientIntakeComment: document.getElementById('clientIntakeComment'),
    studentId: document.getElementById('studentId'),
    sessionCreateMode: document.getElementById('sessionCreateMode'),
    sessionTemplateId: document.getElementById('sessionTemplateId'),
    trainingSessionId: document.getElementById('trainingSessionId'),
    createSessionBtn: document.getElementById('createSessionBtn'),
    duplicateSessionBtn: document.getElementById('duplicateSessionBtn'),
    saveAsTemplateBtn: document.getElementById('saveAsTemplateBtn'),
    coachExerciseList: document.getElementById('coachExerciseList'),
    restPreset: document.getElementById('restPreset'),
    restInput: document.getElementById('rest'),
    routineDate: document.getElementById('routineDate'),
    routineName: document.getElementById('routineName'),
    sessionStatus: document.getElementById('sessionStatus'),
    sessionNotes: document.getElementById('sessionNotes'),
    exerciseInput: document.getElementById('exercise'),
    exerciseIdInput: document.getElementById('exerciseId'),
    plannedSetsInput: document.getElementById('sets'),
    plannedRepMinInput: document.getElementById('plannedRepMin'),
    plannedRepMaxInput: document.getElementById('plannedRepMax'),
    targetWeightInput: document.getElementById('weight'),
    techniqueNotesInput: document.getElementById('techniqueNotes'),
    historyClientId: document.getElementById('historyClientId'),
    historyExercise: document.getElementById('historyExercise'),
    trainingProgressSummary: document.getElementById('trainingProgressSummary'),
    currentExerciseTitle: document.getElementById('currentExerciseTitle'),
    trainingLastRecord: document.getElementById('trainingLastRecord'),
    setProgressLabel: document.getElementById('setProgressLabel'),
    setWeightInput: document.getElementById('setWeightInput'),
    setRepsInput: document.getElementById('setRepsInput'),
    setRirInput: document.getElementById('setRirInput'),
    setCompletedInput: document.getElementById('setCompletedInput'),
    saveSetBtn: document.getElementById('saveSetBtn'),
    setEntryList: document.getElementById('setEntryList'),
    setRecordNotice: document.getElementById('setRecordNotice'),
    editingSetNumber: document.getElementById('editingSetNumber'),
    studentBackBtn: document.getElementById('studentBackBtn'),
    studentName: document.getElementById('studentName'),
    studentSessionTitle: document.getElementById('studentSessionTitle'),
    studentSessionDate: document.getElementById('studentSessionDate'),
    studentExerciseProgress: document.getElementById('studentExerciseProgress'),
    studentSessionProgressBar: document.getElementById('studentSessionProgressBar'),
    studentSessionProgressText: document.getElementById('studentSessionProgressText'),
    studentExerciseName: document.getElementById('studentExerciseName'),
    studentExercisePlan: document.getElementById('studentExercisePlan'),
    studentExerciseTarget: document.getElementById('studentExerciseTarget'),
    studentExerciseRest: document.getElementById('studentExerciseRest'),
    studentExerciseLast: document.getElementById('studentExerciseLast'),
    studentLastWeight: document.getElementById('studentLastWeight'),
    studentLastReps: document.getElementById('studentLastReps'),
    studentBestWeight: document.getElementById('studentBestWeight'),
    studentTechniqueNote: document.getElementById('studentTechniqueNote'),
    studentWeightInput: document.getElementById('studentWeightInput'),
    studentRepsInput: document.getElementById('studentRepsInput'),
    studentSetCompleted: document.getElementById('studentSetCompleted'),
    studentEditingSetNumber: document.getElementById('studentEditingSetNumber'),
    studentSaveSetBtn: document.getElementById('studentSaveSetBtn'),
    studentSetNotice: document.getElementById('studentSetNotice'),
    studentSetList: document.getElementById('studentSetList'),
    studentExerciseCompletedNotice: document.getElementById('studentExerciseCompletedNotice'),
    studentNextExerciseBtn: document.getElementById('studentNextExerciseBtn'),
    studentValidateRecordBtn: document.getElementById('studentValidateRecordBtn'),
    studentRestValue: document.getElementById('studentRestValue'),
    studentRestStartBtn: document.getElementById('studentRestStartBtn'),
    studentRestPlusBtn: document.getElementById('studentRestPlusBtn'),
    studentRestSkipBtn: document.getElementById('studentRestSkipBtn'),
    studentSessionFinishPanel: document.getElementById('studentSessionFinishPanel'),
    studentSessionSummary: document.getElementById('studentSessionSummary'),
    studentFinalizeBtn: document.getElementById('studentFinalizeBtn'),
    templateForm: document.getElementById('templateForm'),
    templateIdInput: document.getElementById('templateId'),
    templateNameInput: document.getElementById('templateName'),
    templateNotesInput: document.getElementById('templateNotes'),
    templateAssignDateInput: document.getElementById('templateAssignDate'),
    saveTemplateBtn: document.getElementById('saveTemplateBtn'),
    assignTemplateBtn: document.getElementById('assignTemplateBtn'),
    newTemplateBtn: document.getElementById('newTemplateBtn'),
    templateMessage: document.getElementById('templateMessage'),
    templateExerciseForm: document.getElementById('templateExerciseForm'),
    templateExerciseIdInput: document.getElementById('templateExerciseId'),
    templateExerciseNameInput: document.getElementById('templateExerciseName'),
    templateExerciseNotesInput: document.getElementById('templateExerciseNotes'),
    templateExerciseSetsInput: document.getElementById('templateExerciseSets'),
    templateExerciseRepMinInput: document.getElementById('templateExerciseRepMin'),
    templateExerciseRepMaxInput: document.getElementById('templateExerciseRepMax'),
    templateExerciseWeightInput: document.getElementById('templateExerciseWeight'),
    templateExerciseRestInput: document.getElementById('templateExerciseRest'),
    saveTemplateExerciseBtn: document.getElementById('saveTemplateExerciseBtn'),
    templateExerciseList: document.getElementById('templateExerciseList'),
    templateList: document.getElementById('templateList'),
    librarySearch: document.getElementById('librarySearch'),
    libraryPatternFilter: document.getElementById('libraryPatternFilter'),
    libraryMuscleFilter: document.getElementById('libraryMuscleFilter'),
    libraryTechnicalLevelFilter: document.getElementById('libraryTechnicalLevelFilter'),
    libraryExerciseIdInput: document.getElementById('libraryExerciseId'),
    libraryExerciseNameInput: document.getElementById('libraryExerciseName'),
    libraryExercisePatternSelect: document.getElementById('libraryExercisePattern'),
    libraryExercisePrimaryMuscleSelect: document.getElementById('libraryExercisePrimaryMuscle'),
    libraryExerciseTechnicalLevelSelect: document.getElementById('libraryExerciseTechnicalLevel'),
    libraryExerciseLoadTypeSelect: document.getElementById('libraryExerciseLoadType'),
    libraryExerciseActiveSelect: document.getElementById('libraryExerciseActive'),
    libraryExerciseBackDemandSelect: document.getElementById('libraryExerciseBackDemand'),
    libraryExerciseShoulderDemandSelect: document.getElementById('libraryExerciseShoulderDemand'),
    libraryExerciseKneeDemandSelect: document.getElementById('libraryExerciseKneeDemand'),
    libraryExerciseHipDemandSelect: document.getElementById('libraryExerciseHipDemand'),
    libraryExerciseDescriptionInput: document.getElementById('libraryExerciseDescription'),
    libraryExerciseSecondaryMusclesInput: document.getElementById('libraryExerciseSecondaryMuscles'),
    libraryExerciseEquipmentsInput: document.getElementById('libraryExerciseEquipments'),
    libraryExerciseBaseInput: document.getElementById('libraryExerciseBase'),
    libraryExerciseAlternativeGroupInput: document.getElementById('libraryExerciseAlternativeGroup'),
    libraryRelationTargetInput: document.getElementById('libraryRelationTarget'),
    libraryRelationTargetIdInput: document.getElementById('libraryRelationTargetId'),
    libraryRelationTypeSelect: document.getElementById('libraryRelationType'),
    libraryExerciseList: document.getElementById('libraryExerciseList'),
    libraryMessage: document.getElementById('libraryMessage'),
    newLibraryExerciseBtn: document.getElementById('newLibraryExerciseBtn'),
    saveLibraryExerciseBtn: document.getElementById('saveLibraryExerciseBtn'),
    exerciseLibraryOptions: document.getElementById('exerciseLibraryOptions'),
    programForm: document.getElementById('programForm'),
    programIdInput: document.getElementById('programId'),
    programNameInput: document.getElementById('programName'),
    programObjectiveInput: document.getElementById('programObjective'),
    programStartDateInput: document.getElementById('programStartDate'),
    programDurationWeeksInput: document.getElementById('programDurationWeeks'),
    programWeeklyFrequencyInput: document.getElementById('programWeeklyFrequency'),
    programAssignedClientsInput: document.getElementById('programAssignedClients'),
    programDayList: document.getElementById('programDayList'),
    addProgramDayBtn: document.getElementById('addProgramDayBtn'),
    saveProgramBtn: document.getElementById('saveProgramBtn'),
    programMessage: document.getElementById('programMessage'),
    programList: document.getElementById('programList'),
    newProgramBtn: document.getElementById('newProgramBtn'),
    planningStep1: document.getElementById('planningStep1'),
    planningStep2: document.getElementById('planningStep2'),
    planningStep3: document.getElementById('planningStep3'),
    planningStep4: document.getElementById('planningStep4'),
    planningWizard: document.getElementById('planningWizard'),
    planningClientGrid: document.getElementById('planningClientGrid'),
    planningClientSelectionSummary: document.getElementById('planningClientSelectionSummary'),
    planningProgramName: document.getElementById('planningProgramName'),
    planningObjectiveOptions: document.getElementById('planningObjectiveOptions'),
    planningCustomDuration: document.getElementById('planningCustomDuration'),
    planningProgramStartDate: document.getElementById('planningProgramStartDate'),
    planningDayTabs: document.getElementById('planningDayTabs'),
    planningCurrentDayLabel: document.getElementById('planningCurrentDayLabel'),
    planningExerciseList: document.getElementById('planningExerciseList'),
    planningExerciseEmptyState: document.getElementById('planningExerciseEmptyState'),
    routineBuilderRoot: document.getElementById('routineBuilderRoot'),
    planningReviewSummary: document.getElementById('planningReviewSummary'),
    planningSaveProgramWizardBtn: document.getElementById('planningSaveProgramWizardBtn'),
    planningContinueStep1: document.getElementById('planningContinueStep1'),
    planningContinueStep2: document.getElementById('planningContinueStep2'),
    planningContinueStep3: document.getElementById('planningContinueStep3'),
    planningBackToStep1: document.getElementById('planningBackToStep1'),
    planningBackToStep2: document.getElementById('planningBackToStep2'),
    planningBackToStep3: document.getElementById('planningBackToStep3'),
    planningSavedPrograms: document.getElementById('planningSavedPrograms'),
    programExerciseForm: document.getElementById('programExerciseForm'),
    programExerciseIdInput: document.getElementById('programExerciseId'),
    programExerciseNameInput: document.getElementById('programExerciseName'),
    programExerciseCategoryInput: document.getElementById('programExerciseCategory'),
    programExerciseZoneInput: document.getElementById('programExerciseZone'),
    programExerciseRestInput: document.getElementById('programExerciseRest'),
    programExerciseWeightInput: document.getElementById('programExerciseWeight'),
    programExerciseRepMinInput: document.getElementById('programExerciseRepMin'),
    programExerciseRepMaxInput: document.getElementById('programExerciseRepMax'),
    programExerciseNotesInput: document.getElementById('programExerciseNotes'),
    programApproximationModeInput: document.getElementById('programApproximationMode'),
    programApproximationRows: document.getElementById('programApproximationRows'),
    addProgramApproximationBtn: document.getElementById('addProgramApproximationBtn'),
    programEffectiveSetRows: document.getElementById('programEffectiveSetRows'),
    addProgramEffectiveSetBtn: document.getElementById('addProgramEffectiveSetBtn'),
    saveProgramExerciseBtn: document.getElementById('saveProgramExerciseBtn'),
    clearProgramExerciseBtn: document.getElementById('clearProgramExerciseBtn'),
    exerciseCategorySelect: document.getElementById('exerciseCategorySelect'),
    exerciseLibrarySearch: document.getElementById('exerciseLibrarySearch'),
    exerciseLibraryList: document.getElementById('exerciseLibraryList'),
    reserve: document.getElementById('reserve'),
    coachWhatsAppNumber: document.getElementById('coachWhatsAppNumber'),
    onboardingQr: document.getElementById('onboardingQr'),
    onboardingUrl: document.getElementById('onboardingUrl'),
    onboardingQrMessage: document.getElementById('onboardingQrMessage'),
    copyOnboardingUrlBtn: document.getElementById('copyOnboardingUrlBtn'),
    magicBudget: document.getElementById('magicBudget'),
    antBudget: document.getElementById('antBudget'),
    savingsGoal: document.getElementById('savingsGoal'),
    fileInput: document.getElementById('fileInput'),
    importMessage: document.getElementById('importMessage'),
    initialCashInput: document.getElementById('initialCashInput'),
    cashForm: document.getElementById('cashForm'),
    nutritionMessage: document.getElementById('nutritionMessage'),
    nutritionSummary: document.getElementById('nutritionSummary'),
    nutritionPlans: document.getElementById('nutritionPlans'),
    nutritionAssignment: document.getElementById('nutritionAssignment'),
    nutritionDaily: document.getElementById('nutritionDaily'),
    nutritionProgress: document.getElementById('nutritionProgress')
  };

  // Siempre guarda el estado en memoria, haya o no sesión iniciada.
  function persist() {
    if (supabaseApi && typeof supabaseApi.saveData === 'function') {
      supabaseApi.saveData(state);
    } else {
      dataApi.saveState(state);
    }
    render();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slugifyTrainingPart(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'base';
  }

  function isCloudMode() {
    return Boolean(supabaseApi && typeof supabaseApi.isCloudEnabled === 'function' && supabaseApi.isCloudEnabled());
  }

  function isCloudSessionActive() {
    return Boolean(isCloudMode() && cloudUi.sessionActive && cloudUi.ownerId);
  }

  // "Sesión cloud" aquí significa la capa de tablas antiguas (cloud-data.js), hoy desactivada.
  // El inicio de sesión lo maneja auth-gate.js; los datos siguen solo en este dispositivo.
  async function refreshCloudSessionState() {
    if (!isCloudMode() || !cloudDataApi || typeof cloudDataApi.isAvailable !== 'function' || !cloudDataApi.isAvailable() || typeof cloudDataApi.getOwnerContext !== 'function') {
      cloudUi.sessionActive = false;
      cloudUi.ownerId = '';
      cloudUi.authUserId = '';
      return false;
    }

    const ownerContext = await cloudDataApi.getOwnerContext();
    if (ownerContext && !ownerContext.error && ownerContext.ownerId) {
      cloudUi.sessionActive = true;
      cloudUi.ownerId = ownerContext.ownerId;
      cloudUi.authUserId = ownerContext.authUserId || '';
      if (els.cloudModeBadge) {
        els.cloudModeBadge.textContent = 'Modo Cloud';
      }
      return true;
    }

    cloudUi.sessionActive = false;
    cloudUi.ownerId = '';
    cloudUi.authUserId = '';
    if (els.cloudModeBadge) {
      els.cloudModeBadge.textContent = 'Modo Local';
    }
    return false;
  }

  function normalizeClientRecord(client) {
    if (dataApi && typeof dataApi.normalizeClient === 'function') {
      return dataApi.normalizeClient(client);
    }
    return client;
  }

  function normalizePhoneDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizeChileanPhoneForWhatsApp(value) {
    const digits = normalizePhoneDigits(value);
    if (!digits) {
      return '';
    }
    if (digits.startsWith('56') && digits.length >= 11) {
      return digits;
    }
    if (digits.length >= 8 && digits.length <= 9) {
      return `56${digits}`;
    }
    if (digits.startsWith('0')) {
      const withoutZero = digits.replace(/^0+/, '');
      return withoutZero ? `56${withoutZero}` : '';
    }
    return digits;
  }

  const SPORTS_GOAL_OPTIONS = ['ganancia_muscular', 'perdida_grasa', 'fuerza', 'acondicionamiento', 'salud_general', 'rendimiento', 'otro'];
  const EXPERIENCE_LEVEL_OPTIONS = ['principiante', 'intermedio', 'avanzado'];
  const CONSIDERATION_STATUS_OPTIONS = ['activa', 'en_observacion', 'resuelta'];
  const MOVEMENT_STATUS_OPTIONS = ['dominado', 'tolerado', 'en_aprendizaje', 'no_evaluado', 'adaptar', 'restringido'];

  function ensureSportsState() {
    if (!Array.isArray(state.sportsProfiles)) {
      state.sportsProfiles = [];
    }
    if (!Array.isArray(state.sportsConsiderations)) {
      state.sportsConsiderations = [];
    }
    if (!Array.isArray(state.movementStatuses)) {
      state.movementStatuses = [];
    }
  }

  function getSportsProfile(clientId) {
    ensureSportsState();
    return state.sportsProfiles.find((item) => item.clientId === clientId) || null;
  }

  function getSportsConsiderations(clientId) {
    ensureSportsState();
    return state.sportsConsiderations
      .filter((item) => item.clientId === clientId)
      .sort((a, b) => String(b.notedOn || '').localeCompare(String(a.notedOn || '')));
  }

  function getMovementStatuses(clientId) {
    ensureSportsState();
    return state.movementStatuses
      .filter((item) => item.clientId === clientId)
      .sort((a, b) => String(a.movementName || '').localeCompare(String(b.movementName || '')));
  }

  function normalizeMovementKey(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'movimiento';
  }

  function getSportsLabel(value) {
    const labels = {
      ganancia_muscular: 'Ganancia muscular',
      perdida_grasa: 'Pérdida de grasa',
      fuerza: 'Fuerza',
      acondicionamiento: 'Acondicionamiento',
      salud_general: 'Salud general',
      rendimiento: 'Rendimiento',
      otro: 'Otro',
      principiante: 'Principiante',
      intermedio: 'Intermedio',
      avanzado: 'Avanzado',
      activa: 'Activa',
      en_observacion: 'En observación',
      resuelta: 'Resuelta',
      dominado: 'DOMINADO',
      tolerado: 'TOLERADO',
      en_aprendizaje: 'EN_APRENDIZAJE',
      no_evaluado: 'NO_EVALUADO',
      adaptar: 'ADAPTAR',
      restringido: 'RESTRINGIDO'
    };
    return labels[value] || value || 'Sin dato';
  }

  function buildBestLoadEntries(clientId) {
    const bestByMovement = new Map();
    const sessions = sortSessionsByDateAsc(getTrainingSessionsByClient(clientId));
    sessions.forEach((session) => {
      getSessionExercises(session).forEach((exercise) => {
        getExerciseSets(exercise).forEach((setEntry) => {
          const weight = Number(setEntry.weight || 0);
          const reps = Number(setEntry.reps || 0);
          if (!Number.isFinite(weight) || weight <= 0) {
            return;
          }
          const key = normalizeMovementKey(exercise.exerciseName);
          const current = bestByMovement.get(key);
          if (!current || weight > current.weight || (weight === current.weight && reps > current.reps)) {
            bestByMovement.set(key, {
              movementName: exercise.exerciseName,
              weight,
              reps,
              date: session.date || ''
            });
          }
        });
      });
    });
    return Array.from(bestByMovement.values()).sort((a, b) => a.movementName.localeCompare(b.movementName));
  }

  function buildSportsSummary(profile) {
    return {
      primaryGoal: getSportsLabel(profile?.primaryGoal || 'otro'),
      experienceLevel: getSportsLabel(profile?.experienceLevel || 'principiante'),
      sessionsPerWeek: Number(profile?.sessionsPerWeek || 0),
      sessionDurationMinutes: Number(profile?.sessionDurationMinutes || 0)
    };
  }

  function renderSportsProfilePanel(client) {
    if (!client) {
      return '';
    }

    ensureSportsState();
    const profile = getSportsProfile(client.id);
    const considerations = getSportsConsiderations(client.id);
    const movements = getMovementStatuses(client.id);
    const bestLoads = buildBestLoadEntries(client.id);
    const summary = buildSportsSummary(profile);

    const optionMarkup = (options, selectedValue, allowEmpty = false, emptyLabel = 'Sin definir') => `${allowEmpty ? `<option value="">${emptyLabel}</option>` : ''}${options.map((value) => `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${escapeHtml(getSportsLabel(value))}</option>`).join('')}`;

    return `
      <section class="client-detail-inline sports-profile-inline" data-client-detail-panel="${escapeHtml(client.id)}" data-client-panel-type="sports" aria-label="Ficha deportiva de ${escapeHtml(getClientDisplayName(client))}">
      <div class="client-detail-card">
        <div class="section-title">
          <div>
            <h3>${escapeHtml(getClientDisplayName(client))}</h3>
            <div class="meta">Resumen rápido deportivo</div>
          </div>
          <button class="secondary small" type="button" data-client-sports="${client.id}" aria-expanded="true">Cerrar ficha deportiva</button>
        </div>
        <div class="client-detail-grid">
          <div><strong>Objetivo</strong><div class="meta">${escapeHtml(summary.primaryGoal)}</div></div>
          <div><strong>Nivel</strong><div class="meta">${escapeHtml(summary.experienceLevel)}</div></div>
          <div><strong>Frecuencia</strong><div class="meta">${summary.sessionsPerWeek || 0} sesiones/semana</div></div>
          <div><strong>Duración</strong><div class="meta">${summary.sessionDurationMinutes || 0} min</div></div>
        </div>
      </div>

      <form id="sportsProfileForm" class="form-grid" data-client-id="${client.id}">
        <div class="section-title"><h3>Resumen</h3></div>
        <div class="row">
          <div>
            <label for="sportsPrimaryGoal">Objetivo principal</label>
            <select id="sportsPrimaryGoal" name="primaryGoal">${optionMarkup(SPORTS_GOAL_OPTIONS, profile?.primaryGoal || 'otro')}</select>
          </div>
          <div>
            <label for="sportsSecondaryGoal">Objetivo secundario</label>
            <select id="sportsSecondaryGoal" name="secondaryGoal">${optionMarkup(SPORTS_GOAL_OPTIONS, profile?.secondaryGoal || '', true)}</select>
          </div>
        </div>
        <div>
          <label for="sportsGoalNotes">Notas del objetivo</label>
          <textarea id="sportsGoalNotes" name="goalNotes">${escapeHtml(profile?.goalNotes || '')}</textarea>
        </div>
        <div class="row">
          <div>
            <label for="sportsExperienceLevel">Nivel</label>
            <select id="sportsExperienceLevel" name="experienceLevel">${optionMarkup(EXPERIENCE_LEVEL_OPTIONS, profile?.experienceLevel || 'principiante')}</select>
          </div>
          <div>
            <label for="sportsExperienceMonths">Meses entrenando aprox.</label>
            <input id="sportsExperienceMonths" name="experienceMonths" type="number" min="0" value="${Number(profile?.experienceMonths || 0)}">
          </div>
        </div>
        <div class="row">
          <div>
            <label for="sportsCoachStartDate">Inicio con el coach</label>
            <input id="sportsCoachStartDate" name="coachStartDate" type="date" value="${escapeHtml(profile?.coachStartDate || '')}">
          </div>
          <div>
            <label for="sportsSessionsPerWeek">Sesiones por semana</label>
            <input id="sportsSessionsPerWeek" name="sessionsPerWeek" type="number" min="0" max="14" value="${Number(profile?.sessionsPerWeek || 3)}">
          </div>
        </div>
        <div class="row">
          <div>
            <label for="sportsSessionDuration">Duración habitual (min)</label>
            <input id="sportsSessionDuration" name="sessionDurationMinutes" type="number" min="0" max="300" value="${Number(profile?.sessionDurationMinutes || 60)}">
          </div>
          <div>
            <label for="sportsCoachNotes">Notas del coach</label>
            <textarea id="sportsCoachNotes" name="coachNotes">${escapeHtml(profile?.coachNotes || '')}</textarea>
          </div>
        </div>
        <button class="primary" type="submit">Guardar ficha deportiva</button>
      </form>

      <div class="client-detail-card">
        <div class="section-title"><h3>Consideraciones</h3></div>
        <form id="sportsConsiderationForm" class="form-grid" data-client-id="${client.id}">
          <input type="hidden" name="considerationId" value="">
          <div class="row">
            <div>
              <label for="sportsConsiderationTitle">Título</label>
              <input id="sportsConsiderationTitle" name="title" type="text" required>
            </div>
            <div>
              <label for="sportsConsiderationStatus">Estado</label>
              <select id="sportsConsiderationStatus" name="status">${optionMarkup(CONSIDERATION_STATUS_OPTIONS, 'activa')}</select>
            </div>
          </div>
          <div>
            <label for="sportsConsiderationDescription">Descripción</label>
            <textarea id="sportsConsiderationDescription" name="description"></textarea>
          </div>
          <div class="row">
            <div>
              <label for="sportsConsiderationDate">Fecha</label>
              <input id="sportsConsiderationDate" name="notedOn" type="date" value="${getTodayLocalDate()}">
            </div>
            <div>
              <label for="sportsConsiderationReviewDate">Revisión</label>
              <input id="sportsConsiderationReviewDate" name="reviewDate" type="date">
            </div>
          </div>
          <button class="secondary" type="submit">Agregar consideración</button>
        </form>
        <div class="training-set-list">
          ${considerations.length ? considerations.map((item) => `
            <div class="training-set-item">
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <div class="meta">${escapeHtml(getSportsLabel(item.status))} · ${escapeHtml(formatClientDate(item.notedOn))}${item.reviewDate ? ` · Revisar ${escapeHtml(formatClientDate(item.reviewDate))}` : ''}</div>
                <div class="meta">${escapeHtml(item.description || '')}</div>
              </div>
              <button class="danger small" type="button" data-sports-consideration-delete="${item.id}">Eliminar</button>
            </div>`).join('') : '<div class="muted">Sin consideraciones registradas.</div>'}
        </div>
      </div>

      <div class="client-detail-card">
        <div class="section-title"><h3>Movimientos</h3></div>
        <form id="movementStatusForm" class="form-grid" data-client-id="${client.id}">
          <input type="hidden" name="movementStatusId" value="">
          <div class="row">
            <div>
              <label for="movementName">Ejercicio / movimiento</label>
              <input id="movementName" name="movementName" type="text" required>
            </div>
            <div>
              <label for="movementStatus">Estado</label>
              <select id="movementStatus" name="status">${optionMarkup(MOVEMENT_STATUS_OPTIONS, 'no_evaluado')}</select>
            </div>
          </div>
          <div class="row">
            <div>
              <label for="movementLastEvaluatedOn">Última evaluación</label>
              <input id="movementLastEvaluatedOn" name="lastEvaluatedOn" type="date" value="${getTodayLocalDate()}">
            </div>
            <div>
              <label for="movementEvaluated1rm">1RM evaluado (opcional)</label>
              <input id="movementEvaluated1rm" name="evaluated1rm" type="number" min="0" step="0.1">
            </div>
          </div>
          <div>
            <label for="movementCoachNote">Nota del coach</label>
            <textarea id="movementCoachNote" name="coachNote"></textarea>
          </div>
          <button class="secondary" type="submit">Guardar estado de movimiento</button>
        </form>
        <div class="training-set-list">
          ${movements.length ? movements.map((item) => `
            <div class="training-set-item">
              <div>
                <strong>${escapeHtml(item.movementName)}</strong>
                <div class="meta">${escapeHtml(getSportsLabel(item.status))}${item.lastEvaluatedOn ? ` · ${escapeHtml(formatClientDate(item.lastEvaluatedOn))}` : ''}${item.evaluated1rm !== '' ? ` · 1RM evaluado ${Number(item.evaluated1rm)} kg` : ''}</div>
                <div class="meta">${escapeHtml(item.coachNote || '')}</div>
              </div>
              <button class="danger small" type="button" data-movement-status-delete="${item.id}">Eliminar</button>
            </div>`).join('') : '<div class="muted">Sin movimientos evaluados.</div>'}
        </div>
      </div>

      <div class="client-detail-card">
        <div class="section-title"><h3>Marcas</h3></div>
        <div class="training-set-list">
          ${bestLoads.length ? bestLoads.map((item) => `
            <div class="training-set-item">
              <div>
                <strong>${escapeHtml(item.movementName)}</strong>
                <div class="meta">Mejor carga registrada: ${Number(item.weight)} kg × ${Number(item.reps)}${item.date ? ` · ${escapeHtml(formatClientDate(item.date))}` : ''}</div>
              </div>
            </div>`).join('') : '<div class="muted">Aún no hay cargas registradas en el historial.</div>'}
        </div>
      </div>
      </section>`;
  }

  async function refreshSportsDataFromCloud() {
    ensureSportsState();
    const hasCloudSession = await refreshCloudSessionState();
    if (!hasCloudSession || !cloudDataApi) {
      return;
    }

    const [profilesResponse, considerationsResponse, movementStatusesResponse] = await Promise.all([
      typeof cloudDataApi.listSportsProfiles === 'function' ? cloudDataApi.listSportsProfiles() : Promise.resolve({ data: [], error: null }),
      typeof cloudDataApi.listSportsConsiderations === 'function' ? cloudDataApi.listSportsConsiderations() : Promise.resolve({ data: [], error: null }),
      typeof cloudDataApi.listMovementStatuses === 'function' ? cloudDataApi.listMovementStatuses() : Promise.resolve({ data: [], error: null })
    ]);

    if (Array.isArray(profilesResponse?.data) && dataApi.normalizeSportsProfile) {
      state.sportsProfiles = profilesResponse.data.map((item) => dataApi.normalizeSportsProfile(item));
    }
    if (Array.isArray(considerationsResponse?.data) && dataApi.normalizeSportsConsideration) {
      state.sportsConsiderations = considerationsResponse.data.map((item) => dataApi.normalizeSportsConsideration(item));
    }
    if (Array.isArray(movementStatusesResponse?.data) && dataApi.normalizeMovementStatus) {
      state.movementStatuses = movementStatusesResponse.data.map((item) => dataApi.normalizeMovementStatus(item));
    }
  }

  function isValidDateInput(value) {
    if (!value) {
      return true;
    }
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime());
  }

  function formatClientDate(value) {
    if (!value) {
      return 'Sin fecha';
    }
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return 'Sin fecha';
    }
    return date.toLocaleDateString('es-CL');
  }

  function getTodayLocalDate() {
    const today = new Date();
    const timezoneOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - timezoneOffset).toISOString().slice(0, 10);
  }

  function ensureDateValue(input) {
    if (!input || input.value) {
      return;
    }
    input.value = getTodayLocalDate();
  }

  function getActiveTrainingClients() {
    return (state.clients || []).filter((client) => {
      const clientStatus = String(client?.client_status || client?.status || 'active').toLowerCase();
      const paymentStatus = String(client?.payment_status || '').toLowerCase();
      const notInactive = client?.active !== false && clientStatus !== 'inactive' && clientStatus !== 'paused';
      const legacyIsActive = clientStatus === 'active' || clientStatus === 'paid' || clientStatus === 'pending' || paymentStatus === 'paid' || paymentStatus === 'pending' || paymentStatus === 'uncertain';
      return notInactive && legacyIsActive;
    });
  }

  function ensureTrainingsV08State() {
    if (!state.trainingsV08 || typeof state.trainingsV08 !== 'object') {
      state.trainingsV08 = { plans: [], sessions: [], programs: [], assignments: [] };
    }
    if (!Array.isArray(state.trainingsV08.sessions)) {
      state.trainingsV08.sessions = [];
    }
    if (!Array.isArray(state.trainingsV08.plans)) {
      state.trainingsV08.plans = [];
    }
    if (!Array.isArray(state.trainingsV08.programs)) {
      state.trainingsV08.programs = [];
    }
    if (!Array.isArray(state.trainingsV08.assignments)) {
      state.trainingsV08.assignments = [];
    }
    if (!state.trainingModelVersion) {
      state.trainingModelVersion = '0.8.0';
    }
  }

  function getTrainingSessionsByClient(clientId) {
    ensureTrainingsV08State();
    return (state.trainingsV08.sessions || []).filter((session) => session.clientId === clientId);
  }

  function createTemplateExerciseFromSource(exercise, index) {
    return {
      id: String(exercise?.id || dataApi.createId('tpl-exercise')),
      exerciseName: String(exercise?.exerciseName || 'Ejercicio'),
      order: Number(exercise?.order || index + 1),
      plannedSets: Math.max(1, Number(exercise?.plannedSets || 1)),
      plannedRepMin: Math.max(1, Number(exercise?.plannedRepMin || 1)),
      plannedRepMax: Math.max(Number(exercise?.plannedRepMin || 1), Number(exercise?.plannedRepMax || exercise?.plannedRepMin || 1)),
      targetWeight: Math.max(0, Number(exercise?.targetWeight || 0)),
      restSeconds: Math.max(1, Number(exercise?.restSeconds || 90)),
      coachNotes: String(exercise?.coachNotes || '')
    };
  }

  function normalizeTemplateExercises(exercises) {
    const list = Array.isArray(exercises) ? exercises : [];
    return list.map((exercise, index) => createTemplateExerciseFromSource(exercise, index)).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map((exercise, index) => ({
      ...exercise,
      order: index + 1
    }));
  }

  function parseTemplateNotes(rawNotes) {
    if (!rawNotes) {
      return { notes: '', exercises: [] };
    }
    const value = String(rawNotes || '').trim();
    if (!value) {
      return { notes: '', exercises: [] };
    }
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.exercises)) {
        return {
          notes: String(parsed.notes || ''),
          exercises: normalizeTemplateExercises(parsed.exercises)
        };
      }
    } catch (_) {
      // Keep backward compatibility with plain text notes.
    }
    return { notes: value, exercises: [] };
  }

  function serializeTemplateNotes(template) {
    const payload = {
      notes: String(template?.notes || ''),
      exercises: normalizeTemplateExercises(template?.exercises || []).map((exercise) => ({
        exerciseName: exercise.exerciseName,
        order: exercise.order,
        plannedSets: exercise.plannedSets,
        plannedRepMin: exercise.plannedRepMin,
        plannedRepMax: exercise.plannedRepMax,
        targetWeight: exercise.targetWeight,
        restSeconds: exercise.restSeconds,
        coachNotes: exercise.coachNotes || ''
      }))
    };
    return JSON.stringify(payload);
  }

  function normalizeTrainingPlan(plan, index = 0) {
    const parsedNotes = parseTemplateNotes(plan?.notes);
    const fallbackName = `Plantilla ${index + 1}`;
    return {
      id: String(plan?.id || dataApi.createId('tx-plan')),
      clientId: String(plan?.clientId || plan?.client_id || ''),
      name: String(plan?.name || fallbackName),
      notes: parsedNotes.notes,
      active: plan?.active !== false,
      exercises: parsedNotes.exercises
    };
  }

  function getTemplateById(templateId) {
    ensureTrainingsV08State();
    return (state.trainingsV08.plans || []).find((template) => template.id === templateId) || null;
  }

  function getTrainingPrograms() {
    ensureTrainingsV08State();
    return Array.isArray(state.trainingsV08.programs) ? state.trainingsV08.programs : [];
  }

  function getTrainingProgramById(programId) {
    return getTrainingPrograms().find((program) => program.id === programId) || null;
  }

  function getTrainingAssignments() {
    ensureTrainingsV08State();
    return Array.isArray(state.trainingsV08.assignments) ? state.trainingsV08.assignments : [];
  }

  function getTrainingAssignmentsForClient(clientId) {
    return getTrainingAssignments().filter((assignment) => assignment.clientId === clientId);
  }

  function getActiveTrainingAssignment(clientId) {
    return getTrainingAssignmentsForClient(clientId)
      .filter((assignment) => assignment.status !== 'cancelled' && assignment.status !== 'completed')
      .sort((first, second) => String(second.updatedAt || '').localeCompare(String(first.updatedAt || '')))[0] || null;
  }

  function getSelectedTrainingProgramDay(clientId, assignment = getActiveTrainingAssignment(clientId)) {
    const days = Array.isArray(assignment?.days) ? assignment.days : [];
    if (!days.length) {
      return { day: null, index: -1 };
    }
    const client = getClientById(clientId);
    const selectedDayId = client?.last_training_program_id === assignment.id ? client.last_training_day_id : '';
    const index = days.findIndex((day) => day.id === selectedDayId);
    return { day: index >= 0 ? days[index] : null, index };
  }

  function getGroupRowData(clientId) {
    const assignment = getActiveTrainingAssignment(clientId);
    if (!assignment) {
      return null;
    }
    const { day, index: dayIndex } = getSelectedTrainingProgramDay(clientId, assignment);
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    const draft = groupSessionUi.drafts[clientId];
    const planExercise = exercises.find((exercise) => exercise.id === draft?.planExerciseId) || exercises[0] || null;
    if (!day || !planExercise) {
      return null;
    }
    const exerciseIndex = exercises.indexOf(planExercise);
    if (!draft || draft.planExerciseId !== planExercise.id) {
      groupSessionUi.drafts[clientId] = {
        planExerciseId: planExercise.id,
        exerciseId: planExercise.libraryExerciseId || planExercise.id,
        warmups: '',
        set1: '',
        set2: '',
        set3: '',
        rir: '',
        decision: '',
        proposedWeight: String(Number(planExercise.targetWeight || 0))
      };
    }
    return { assignment, day, dayIndex, exerciseIndex, planExercise, draft: groupSessionUi.drafts[clientId] };
  }

  function getGroupSessionId() {
    const selectedIds = [...groupSessionUi.selectedClientIds].sort();
    return `group-${groupSessionUi.sessionDate}-${selectedIds.join('-')}`;
  }

  function getGroupExerciseOption(exerciseId, planExercise) {
    const libraryExercise = (state.exerciseLibrary || []).find((exercise) => exercise.id === exerciseId);
    return libraryExercise || {
      id: planExercise.libraryExerciseId || planExercise.id,
      name: planExercise.exerciseName || 'Ejercicio'
    };
  }

  function renderTrainingGroupMode() {
    if (!els.trainingGroupView) {
      return;
    }
    if (!groupSessionUi.sessionDate) {
      groupSessionUi.sessionDate = getTodayLocalDate();
    }
    if (els.groupSessionDate && els.groupSessionDate.value !== groupSessionUi.sessionDate) {
      els.groupSessionDate.value = groupSessionUi.sessionDate;
    }
    const activeClients = getActiveTrainingClients();
    groupSessionUi.selectedClientIds = groupSessionUi.selectedClientIds.filter((id) => activeClients.some((client) => client.id === id));
    if (els.groupSessionClients) {
      els.groupSessionClients.innerHTML = activeClients.length
        ? activeClients.map((client) => `
          <label class="group-session-client">
            <input type="checkbox" data-group-client="${escapeHtml(client.id)}" ${groupSessionUi.selectedClientIds.includes(client.id) ? 'checked' : ''}>
            <span>${escapeHtml(getClientDisplayName(client))}</span>
          </label>`).join('')
        : '<div class="muted">No hay alumnos activos.</div>';
    }
    if (els.groupSessionMessage) {
      els.groupSessionMessage.textContent = groupSessionUi.message || '';
      els.groupSessionMessage.className = groupSessionUi.message.startsWith('✓') ? 'notice ok' : 'notice';
    }
    if (!els.groupSessionRows) {
      return;
    }
    if (!groupSessionUi.selectedClientIds.length) {
      els.groupSessionRows.innerHTML = '<div class="muted">Selecciona de 1 a 4 alumnos.</div>';
      return;
    }
    const groupSessionId = getGroupSessionId();
    els.groupSessionRows.innerHTML = groupSessionUi.selectedClientIds.map((clientId) => {
      const client = getClientById(clientId);
      const row = getGroupRowData(clientId);
      if (!row) {
        return `<article class="group-athlete-row"><h3>${escapeHtml(client ? getClientDisplayName(client) : 'Alumno')}</h3><div class="notice warn">No tiene un programa activo con ejercicios para esta fecha.</div></article>`;
      }
      const { assignment, day, planExercise, draft } = row;
      const currentWeight = Number(planExercise.targetWeight || 0);
      const selectedExerciseId = draft.exerciseId || planExercise.libraryExerciseId || planExercise.id;
      const selectedExercise = getGroupExerciseOption(selectedExerciseId, planExercise);
      const exerciseOptions = new Map();
      (day.exercises || []).forEach((exercise) => {
        const id = exercise.libraryExerciseId || exercise.id;
        exerciseOptions.set(id, exercise.exerciseName || 'Ejercicio');
      });
      (state.exerciseLibrary || []).filter((exercise) => exercise.active !== false).forEach((exercise) => {
        if (!exerciseOptions.has(exercise.id)) {
          exerciseOptions.set(exercise.id, exercise.name || 'Ejercicio');
        }
      });
      if (!exerciseOptions.has(selectedExerciseId)) {
        exerciseOptions.set(selectedExerciseId, planExercise.exerciseName || selectedExercise.name);
      }
      const options = Array.from(exerciseOptions, ([id, name]) => `
        <option value="${escapeHtml(id)}" ${id === selectedExerciseId ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
      const alreadyConfirmed = getTrainingSessionsByClient(clientId).some((session) => session.groupSessionId === groupSessionId);
      const decisionLabels = [
        ['up', '↑ Subir'],
        ['keep', '→ Mantener'],
        ['down', '↓ Bajar'],
        ['change', '↔ Cambiar ejercicio']
      ];
      return `
        <article class="group-athlete-row" data-group-row="${escapeHtml(clientId)}">
          <header class="group-athlete-heading">
            <div><h3>${escapeHtml(client ? getClientDisplayName(client) : 'Alumno')}</h3><div class="meta">${escapeHtml(day.name || 'Rutina')} · Plan actual: ${currentWeight} kg × ${Number(planExercise.repMin || planExercise.repRangeMin || 1)}-${Number(planExercise.repMax || planExercise.repRangeMax || 1)}</div></div>
            <div class="meta">${escapeHtml(assignment.programName || 'Programa')}</div>
          </header>
          <label>Ejercicio<select data-group-field="exerciseId" data-client-id="${escapeHtml(clientId)}">${options}</select></label>
          <div class="group-set-grid">
            <label>Aproximaciones<input type="text" inputmode="text" placeholder="30/40 kg" data-group-field="warmups" data-client-id="${escapeHtml(clientId)}" value="${escapeHtml(draft.warmups)}"></label>
            ${[1, 2, 3].map((setNumber) => `<label>S${setNumber} (kg)<input type="number" min="0" step="0.5" inputmode="decimal" data-group-field="set${setNumber}" data-client-id="${escapeHtml(clientId)}" value="${escapeHtml(draft[`set${setNumber}`])}"></label>`).join('')}
            <label>RIR final<input type="number" min="0" max="10" step="1" inputmode="numeric" data-group-field="rir" data-client-id="${escapeHtml(clientId)}" value="${escapeHtml(draft.rir)}"></label>
          </div>
          <div class="group-decisions" role="group" aria-label="Decisión para ${escapeHtml(client ? getClientDisplayName(client) : 'alumno')}">
            ${decisionLabels.map(([value, label]) => `<button class="${draft.decision === value ? 'primary' : 'secondary'} small" type="button" data-group-decision="${value}" data-client-id="${escapeHtml(clientId)}" aria-pressed="${draft.decision === value}">${label}</button>`).join('')}
          </div>
          <div class="group-confirm-row">
            <label>Próxima sesión · ${escapeHtml(selectedExercise.name)}<input type="number" min="0" step="2.5" inputmode="decimal" data-group-field="proposedWeight" data-client-id="${escapeHtml(clientId)}" value="${escapeHtml(draft.proposedWeight)}">kg × ${Number(planExercise.repMin || planExercise.repRangeMin || 1)}-${Number(planExercise.repMax || planExercise.repRangeMax || 1)}</label>
            <button class="primary" type="button" data-group-confirm="${escapeHtml(clientId)}" ${!draft.decision || alreadyConfirmed ? 'disabled' : ''}>${alreadyConfirmed ? 'Confirmada' : 'Confirmar'}</button>
          </div>
        </article>`;
    }).join('');
  }

  function selectGroupDecision(clientId, decision) {
    const row = getGroupRowData(clientId);
    if (!row) {
      return;
    }
    const currentWeight = Number(row.planExercise.targetWeight || 0);
    const chosenExercise = getGroupExerciseOption(row.draft.exerciseId, row.planExercise);
    const roundToPlate = (weight) => Math.round(weight / 2.5) * 2.5;
    const proposedWeight = decision === 'up'
      ? roundToPlate(currentWeight * 1.035)
      : decision === 'down'
        ? roundToPlate(currentWeight * 0.9)
        : decision === 'change'
          ? Number(chosenExercise.targetWeight || currentWeight)
          : currentWeight;
    row.draft.decision = decision;
    row.draft.proposedWeight = String(proposedWeight);
    groupSessionUi.message = '';
    renderTrainingGroupMode();
  }

  function confirmGroupStudentSession(clientId) {
    const row = getGroupRowData(clientId);
    if (!row || !row.draft.decision) {
      groupSessionUi.message = 'Selecciona una decisión antes de confirmar.';
      renderTrainingGroupMode();
      return;
    }
    const draft = row.draft;
    const effectiveSets = [draft.set1, draft.set2, draft.set3].filter((value) => value !== '' && Number.isFinite(Number(value)));
    if (!effectiveSets.length) {
      groupSessionUi.message = 'Registra al menos una serie efectiva antes de confirmar.';
      renderTrainingGroupMode();
      return;
    }
    const groupSessionId = getGroupSessionId();
    if (getTrainingSessionsByClient(clientId).some((session) => session.groupSessionId === groupSessionId)) {
      groupSessionUi.message = 'Esta sesión ya fue confirmada para el alumno.';
      renderTrainingGroupMode();
      return;
    }

    const proposedWeight = Number(draft.proposedWeight);
    if (!Number.isFinite(proposedWeight) || proposedWeight < 0) {
      groupSessionUi.message = 'El objetivo propuesto debe ser un peso válido.';
      renderTrainingGroupMode();
      return;
    }
    const selectedExercise = getGroupExerciseOption(draft.exerciseId, row.planExercise);
    const planExercise = row.day.exercises[row.exerciseIndex];
    const plannedWeight = Number(planExercise.targetWeight || 0);
    const performedExerciseName = selectedExercise.name || planExercise.exerciseName;
    const originalLibraryExerciseId = planExercise.libraryExerciseId || '';
    const originalExerciseName = String(planExercise.exerciseName || '').trim().toLowerCase();
    row.assignment.days.forEach((day) => {
      (day.exercises || []).forEach((exercise) => {
        const sameExercise = originalLibraryExerciseId
          ? exercise.libraryExerciseId === originalLibraryExerciseId
          : String(exercise.exerciseName || '').trim().toLowerCase() === originalExerciseName;
        if (!sameExercise) {
          return;
        }
        if (draft.decision === 'change') {
          exercise.libraryExerciseId = selectedExercise.id || '';
          exercise.exerciseName = performedExerciseName;
        }
        exercise.targetWeight = proposedWeight;
      });
    });
    row.assignment.updatedAt = new Date().toISOString();

    const sets = String(draft.warmups || '').match(/[0-9]+(?:[.,][0-9]+)?/g) || [];
    const archivedSets = sets.map((weight, index) => ({
      setNumber: index + 1,
      weight: Number(weight.replace(',', '.')),
      reps: 0,
      setType: 'A',
      completed: true
    }));
    effectiveSets.forEach((weight, index) => {
      archivedSets.push({
        setNumber: archivedSets.length + 1,
        weight: Number(weight),
        reps: Number(row.planExercise.repMin || row.planExercise.repRangeMin || 1),
        setType: 'S',
        rir: index === effectiveSets.length - 1 && draft.rir !== '' ? Number(draft.rir) : null,
        completed: true
      });
    });

    const session = {
      id: dataApi.createId('tx-session'),
      clientId,
      planId: row.assignment.programId || null,
      groupSessionId,
      date: groupSessionUi.sessionDate,
      title: `Modo Grupo · ${row.day.name || 'Entrenamiento'}`,
      status: 'completed',
      notes: JSON.stringify({ decision: draft.decision, proposedWeight, proposedExercise: performedExerciseName }),
      exercises: [{
        id: dataApi.createId('tx-exercise'),
        libraryExerciseId: selectedExercise.id || '',
        exerciseName: performedExerciseName,
        order: 1,
        plannedSets: Number(row.planExercise.sets || 3),
        plannedRepMin: Number(row.planExercise.repMin || row.planExercise.repRangeMin || 1),
        plannedRepMax: Number(row.planExercise.repMax || row.planExercise.repRangeMax || 1),
        targetWeight: plannedWeight,
        restSeconds: Number(row.planExercise.restSeconds || 90),
        coachNotes: row.planExercise.notes || '',
        sets: archivedSets
      }]
    };
    state.trainingsV08.sessions.push(session);
    dataApi.saveState(state);
    if (isCloudSessionActive()) {
      syncSessionToCloud(session).catch((error) => console.error(error));
    }
    const client = getClientById(clientId);
    groupSessionUi.message = `✓ ${client ? getClientDisplayName(client) : 'Alumno'}: próximo objetivo ${performedExerciseName}, ${proposedWeight} kg.`;
    renderTrainings();
  }

  function handleGroupSessionInput(event) {
    const field = event.target.getAttribute('data-group-field');
    const clientId = event.target.getAttribute('data-client-id');
    if (!field || !clientId) {
      return;
    }
    const row = getGroupRowData(clientId);
    if (row) {
      row.draft[field] = event.target.value;
    }
  }

  function handleGroupSessionChange(event) {
    if (event.target === els.groupSessionDate) {
      groupSessionUi.sessionDate = event.target.value || getTodayLocalDate();
      groupSessionUi.message = '';
      renderTrainingGroupMode();
      return;
    }
    const clientCheckbox = event.target.closest('[data-group-client]');
    if (clientCheckbox) {
      const clientId = clientCheckbox.getAttribute('data-group-client');
      const selected = new Set(groupSessionUi.selectedClientIds);
      if (clientCheckbox.checked) {
        if (selected.size >= 4) {
          groupSessionUi.message = 'Modo Grupo admite hasta 4 alumnos.';
          renderTrainingGroupMode();
          return;
        }
        selected.add(clientId);
      } else {
        selected.delete(clientId);
      }
      groupSessionUi.selectedClientIds = Array.from(selected);
      groupSessionUi.message = '';
      renderTrainingGroupMode();
      return;
    }
    const field = event.target.getAttribute('data-group-field');
    const clientId = event.target.getAttribute('data-client-id');
    if (field === 'exerciseId' && clientId) {
      const row = getGroupRowData(clientId);
      if (row) {
        row.draft.exerciseId = event.target.value;
        const plannedExercise = row.day.exercises.find((exercise) => (exercise.libraryExerciseId || exercise.id) === event.target.value);
        if (plannedExercise && plannedExercise.id !== row.planExercise.id) {
          row.draft.planExerciseId = plannedExercise.id;
          row.draft.proposedWeight = String(Number(plannedExercise.targetWeight || 0));
          row.draft.decision = '';
          row.draft.set1 = '';
          row.draft.set2 = '';
          row.draft.set3 = '';
          row.draft.warmups = '';
          row.draft.rir = '';
        }
        groupSessionUi.message = '';
        renderTrainingGroupMode();
      }
    }
  }

  function setTrainingView(viewName) {
    trainingUi.activeTrainingView = viewName;
    const trainingsSection = document.getElementById('trainings');
    if (trainingsSection) {
      trainingsSection.setAttribute('data-view', viewName);
    }
    const viewMap = {
      today: els.trainingTodayView,
      planning: els.trainingPlanningView,
      progress: els.trainingProgressView,
      group: els.trainingGroupView
    };
    Object.entries(viewMap).forEach(([key, element]) => {
      if (element) {
        element.classList.toggle('hidden', key !== viewName);
      }
    });
    document.querySelectorAll('#trainingViewTabs button').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-training-view') === viewName);
    });
    if (viewName === 'planning') {
      const currentStep = Number.isInteger(planningUi.currentStep) && planningUi.currentStep >= 1 && planningUi.currentStep <= 4
        ? planningUi.currentStep
        : 1;
      planningUi.currentStep = currentStep;
      showPlanningStep(currentStep);
      renderPlanningClientSelection();
      renderPlanningSavedPrograms();
    }
    if (viewName === 'group') {
      renderTrainingGroupMode();
    }
    if (viewName === 'today') {
      renderTrainingAgenda();
    }
    if (els.trainingViewMessage) {
      els.trainingViewMessage.textContent = viewName === 'planning'
        ? 'Planifica programas y días sin duplicar sesiones semanales.'
        : viewName === 'progress'
          ? 'Revisa progreso y series efectivas.'
          : viewName === 'group'
            ? 'Registra la sesión individual de cada alumno y confirma su próximo objetivo.'
            : 'Hoy: registra la clase y las series reales.';
    }
  }

  function cloneSessionFromTemplate(template, clientId, sessionDate) {
    const exercises = normalizeTemplateExercises(template.exercises || []).map((exercise, index) => ({
      ...createTemplateExerciseFromSource(exercise, index),
      id: dataApi.createId('tx-exercise'),
      sets: []
    }));

    return {
      id: dataApi.createId('tx-session'),
      clientId,
      planId: template.id,
      groupSessionId: null,
      date: sessionDate || getTodayLocalDate(),
      title: template.name || 'Sesión desde plantilla',
      status: 'planned',
      notes: template.notes || '',
      exercises
    };
  }

  function cloneSessionPlanning(session, sessionDate) {
    const exercises = getSessionExercises(session).map((exercise, index) => ({
      ...createTemplateExerciseFromSource(exercise, index),
      id: dataApi.createId('tx-exercise'),
      sets: []
    }));

    return {
      id: dataApi.createId('tx-session'),
      clientId: session.clientId,
      planId: session.planId || null,
      groupSessionId: session.groupSessionId || null,
      date: sessionDate || getTodayLocalDate(),
      title: session.title || 'Sesión duplicada',
      status: 'planned',
      notes: session.notes || '',
      exercises
    };
  }

  function getSessionStatusLabel(status) {
    const labels = {
      planned: 'Planificada',
      in_progress: 'En progreso',
      completed: 'Completada'
    };
    return labels[status] || 'Planificada';
  }

  function getSessionStatusTone(status) {
    if (status === 'completed') {
      return 'ok';
    }
    if (status === 'in_progress') {
      return 'warn';
    }
    return 'muted';
  }

  function getDefaultSessionTitle(clientId) {
    const client = getClientById(clientId);
    const today = getTodayLocalDate();
    const name = client ? getClientDisplayName(client).split(' ')[0] : 'Alumno';
    return `Entrenamiento ${name} ${today}`;
  }

  function normalizeSessionExerciseOrder(session) {
    const exercises = getSessionExercises(session);
    exercises.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    exercises.forEach((exercise, index) => {
      exercise.order = index + 1;
    });
  }

  function getSessionBuckets(clientId) {
    const today = getTodayLocalDate();
    const sessions = sortSessionsByDateAsc(getTrainingSessionsByClient(clientId));
    const buckets = {
      today: [],
      upcoming: [],
      completed: []
    };

    sessions.forEach((session) => {
      const date = session.date || '';
      if (session.status === 'completed') {
        buckets.completed.push(session);
        return;
      }
      if (date === today) {
        buckets.today.push(session);
        return;
      }
      if (date && date > today) {
        buckets.upcoming.push(session);
        return;
      }
      buckets.today.push(session);
    });

    buckets.completed.reverse();
    return buckets;
  }

  function setActiveSessionForClient(clientId, preferredSessionId = '') {
    const sessions = sortSessionsByDateAsc(getTrainingSessionsByClient(clientId));
    const today = getTodayLocalDate();
    const preferred = preferredSessionId ? sessions.find((session) => session.id === preferredSessionId) : null;
    const fromToday = sessions.find((session) => session.date === today && session.status !== 'completed') || null;
    const fromProgress = sessions.find((session) => session.status === 'in_progress') || null;
    const fallback = sessions[sessions.length - 1] || null;
    const active = preferred || fromToday || fromProgress || fallback;

    trainingUi.activeSessionId = active?.id || '';
    if (active) {
      normalizeSessionExerciseOrder(active);
    }
    const exercises = getSessionExercises(active);
    trainingUi.activeExerciseId = exercises[0]?.id || '';
    trainingUi.editingSetNumber = null;
    trainingUi.editingExerciseId = '';
    if (els.editingSetNumber) {
      els.editingSetNumber.value = '';
    }
    if (els.exerciseIdInput) {
      els.exerciseIdInput.value = '';
    }
  }

  async function createSessionForClient(clientId, options = {}) {
    const templateId = options.templateId || '';
    const template = templateId ? getTemplateById(templateId) : null;
    const date = options.date || els.routineDate?.value || getTodayLocalDate();
    const status = options.status || els.sessionStatus?.value || 'planned';
    const notes = options.notes !== undefined ? String(options.notes || '').trim() : String(els.sessionNotes?.value || '').trim();
    const title = String(options.title || els.routineName?.value || '').trim() || getDefaultSessionTitle(clientId);

    const session = template
      ? cloneSessionFromTemplate(template, clientId, date)
      : {
        id: dataApi.createId('tx-session'),
        clientId,
        planId: null,
        groupSessionId: null,
        date,
        title,
        status,
        notes,
        exercises: []
      };

    session.date = date;
    session.status = status;
    session.notes = notes || session.notes || '';
    session.title = title || session.title || getDefaultSessionTitle(clientId);

    state.trainingsV08.sessions.push(session);
    setActiveSessionForClient(clientId, session.id);

    if (isCloudSessionActive()) {
      const syncResult = await syncSessionToCloud(session);
      if (!syncResult.ok) {
        return { ok: false, error: syncResult.error || 'No se pudo crear la sesión en Cloud.' };
      }
      return { ok: true, session };
    }

    persist();
    return { ok: true, session };
  }

  function startProgramDaySession(clientId, programDayId) {
    const client = getClientById(clientId);
    const assignment = getActiveTrainingAssignment(clientId);
    const day = assignment?.days?.find((item) => item.id === programDayId);
    if (!client || !assignment || !day) {
      return false;
    }

    client.last_training_program_id = assignment.id;
    client.last_training_day_id = day.id;
    trainingUi.programDayClientId = client.id;
    trainingUi.selectedProgramDayId = day.id;

    const sessionDate = getTodayLocalDate();
    let session = getTrainingSessionsByClient(client.id).find((item) =>
      item.programAssignmentId === assignment.id && item.programDayId === day.id && item.date === sessionDate && item.status !== 'completed'
    );
    if (!session) {
      session = {
        id: dataApi.createId('tx-session'),
        clientId: client.id,
        programAssignmentId: assignment.id,
        programId: assignment.programId,
        programDayId: day.id,
        programDayName: day.name,
        planId: null,
        groupSessionId: null,
        date: sessionDate,
        title: day.name,
        status: 'in_progress',
        notes: `Programa: ${assignment.programName || 'Programa'}`,
        exercises: (day.exercises || []).map((exercise, index) => ({
          id: dataApi.createId('tx-exercise'),
          programExerciseId: exercise.id,
          exerciseName: exercise.exerciseName,
          order: index + 1,
          plannedSets: Math.max(1, Number(exercise.sets || 1)),
          plannedRepMin: exercise.repRangeMin ?? null,
          plannedRepMax: exercise.repRangeMax ?? null,
          targetWeight: exercise.targetWeight === null || exercise.targetWeight === undefined ? 0 : Number(exercise.targetWeight || 0),
          restSeconds: Number(exercise.restSeconds || 90),
          coachNotes: exercise.notes || '',
          sets: []
        }))
      };
      state.trainingsV08.sessions.push(session);
    }

    setActiveSessionForClient(client.id, session.id);
    dataApi.saveState(state);
    render();
    return true;
  }

  function setTemplateMessage(message, tone = 'neutral') {
    if (!els.templateMessage) {
      return;
    }
    els.templateMessage.textContent = message;
    els.templateMessage.classList.toggle('ok', tone === 'ok');
    els.templateMessage.classList.toggle('bad', tone === 'bad');
    els.templateMessage.classList.toggle('warn', tone === 'warn');
    els.templateMessage.classList.toggle('muted', tone === 'neutral');
  }

  function clearTemplateExerciseForm() {
    trainingUi.editingTemplateExerciseId = '';
    if (els.templateExerciseIdInput) {
      els.templateExerciseIdInput.value = '';
    }
    if (els.templateExerciseNameInput) {
      els.templateExerciseNameInput.value = '';
    }
    if (els.templateExerciseNotesInput) {
      els.templateExerciseNotesInput.value = '';
    }
    if (els.templateExerciseSetsInput) {
      els.templateExerciseSetsInput.value = '4';
    }
    if (els.templateExerciseRepMinInput) {
      els.templateExerciseRepMinInput.value = '8';
    }
    if (els.templateExerciseRepMaxInput) {
      els.templateExerciseRepMaxInput.value = '10';
    }
    if (els.templateExerciseWeightInput) {
      els.templateExerciseWeightInput.value = '';
    }
    if (els.templateExerciseRestInput) {
      els.templateExerciseRestInput.value = '90';
    }
  }

  function resetTemplateDraft() {
    trainingUi.editingTemplateId = '';
    if (els.templateIdInput) {
      els.templateIdInput.value = '';
    }
    if (els.templateNameInput) {
      els.templateNameInput.value = '';
    }
    if (els.templateNotesInput) {
      els.templateNotesInput.value = '';
    }
    clearTemplateExerciseForm();
  }

  function getTemplateDraftExercises() {
    const template = trainingUi.editingTemplateId ? getTemplateById(trainingUi.editingTemplateId) : null;
    return normalizeTemplateExercises(template?.exercises || []);
  }

  function buildTemplatePayload(baseTemplate = null) {
    const name = String(els.templateNameInput?.value || '').trim();
    const notes = String(els.templateNotesInput?.value || '').trim();
    const existingExercises = getTemplateDraftExercises();
    return normalizeTrainingPlan({
      id: baseTemplate?.id || trainingUi.editingTemplateId || dataApi.createId('tx-plan'),
      clientId: baseTemplate?.clientId || trainingUi.selectedClientId || state.clients[0]?.id || '',
      name,
      notes,
      active: true,
      exercises: existingExercises
    });
  }

  async function persistTemplateToCloud(template) {
    if (!isCloudSessionActive() || !cloudDataApi || typeof cloudDataApi.upsertTrainingPlan !== 'function') {
      return { ok: false, error: 'Modo local' };
    }
    const response = await cloudDataApi.upsertTrainingPlan({
      id: template.id,
      client_id: template.clientId,
      name: template.name,
      notes: serializeTemplateNotes(template),
      active: template.active !== false
    });
    if (response && response.error) {
      return { ok: false, error: response.error.message || response.error };
    }
    return { ok: true, data: response?.data || null };
  }

  async function removeTemplateFromCloud(templateId) {
    if (!isCloudSessionActive() || !cloudDataApi || typeof cloudDataApi.deleteTrainingPlan !== 'function') {
      return { ok: false, error: 'Modo local' };
    }
    const response = await cloudDataApi.deleteTrainingPlan(templateId);
    if (response && response.error) {
      return { ok: false, error: response.error.message || response.error };
    }
    return { ok: true };
  }

  function renderTemplateExercises(template) {
    if (!els.templateExerciseList) {
      return;
    }
    const exercises = normalizeTemplateExercises(template?.exercises || []);
    els.templateExerciseList.innerHTML = exercises.length
      ? exercises.map((exercise, index) => `
        <div class="training-set-item">
          <div>
            <strong>${index + 1}. ${escapeHtml(exercise.exerciseName)}</strong>
            <div class="meta">${Number(exercise.plannedSets || 0)} × ${Number(exercise.plannedRepMin || 0)}-${Number(exercise.plannedRepMax || 0)} · ${Number(exercise.restSeconds || 0)} s · ${Number(exercise.targetWeight || 0) > 0 ? `${Number(exercise.targetWeight || 0)} kg` : 'Sin peso objetivo'}</div>
            <div class="meta">${escapeHtml(exercise.coachNotes || '')}</div>
          </div>
          <div class="inline-actions">
            <button class="ghost small" type="button" data-template-exercise-edit="${exercise.id}">Editar</button>
            <button class="ghost small" type="button" data-template-exercise-up="${exercise.id}" ${index === 0 ? 'disabled' : ''}>Subir</button>
            <button class="ghost small" type="button" data-template-exercise-down="${exercise.id}" ${index === exercises.length - 1 ? 'disabled' : ''}>Bajar</button>
            <button class="danger small" type="button" data-template-exercise-delete="${exercise.id}">Eliminar</button>
          </div>
        </div>`).join('')
      : '<div class="muted">La plantilla no tiene ejercicios todavía.</div>';
  }

  function getProgramExerciseCatalog() {
    const byCategory = {
      PIERNAS: ['Sentadilla libre', 'Sentadilla Smith', 'Prensa', 'Peso muerto', 'Peso muerto rumano', 'Hip thrust', 'Extensión de cuádriceps', 'Femoral', 'Abducción', 'Estocadas'],
      PECHO: ['Press de banca', 'Press inclinado', 'Aperturas', 'Pullover', 'Cruce de polea'],
      ESPALDA: ['Remo barra', 'Remo mancuernas', 'Jalón al pecho', 'Pulldown', 'Peso muerto', 'Hip thrust'],
      HOMBROS: ['Press militar', 'Elevaciones laterales', 'Elevaciones frontales', 'Face pull'],
      BÍCEPS: ['Curl barra', 'Curl mancuernas', 'Curl martillo', 'Curl concentrado'],
      TRÍCEPS: ['Press francés', 'Extension de tríceps polea', 'Fondos', 'Patada de tríceps'],
      CORE: ['Plancha', 'Crunch', 'Abdominal', 'Russian twist', 'Hollow hold'],
      OTROS: ['Movimiento libre', 'Carrera', 'Mobilidad', 'Core adicional']
    };
    return byCategory;
  }

  function createEmptyProgramDay(index = 1) {
    return {
      id: dataApi.createId('program-day'),
      name: `Día ${index}`,
      order: index,
      exercises: []
    };
  }

  function createEmptyProgramExercise() {
    return {
      id: dataApi.createId('program-exercise'),
      exerciseName: '',
      category: 'OTROS',
      notes: '',
      repRangeMin: 8,
      repRangeMax: 10,
      targetWeight: 0,
      restSeconds: 90,
      zone: '',
      weightConvention: 'external',
      approximations: [],
      effectiveSets: []
    };
  }

  function createProgramApproximation(index = 1) {
    return {
      id: dataApi.createId('program-approximation'),
      label: `A${index}`,
      weight: 0,
      reps: 0
    };
  }

  function createProgramEffectiveSet(index = 1) {
    return {
      id: dataApi.createId('program-set'),
      label: `S${index}`,
      weight: 0,
      reps: 0
    };
  }

  function clearProgramExerciseForm() {
    trainingUi.programExerciseDraft = null;
    trainingUi.editingProgramExerciseId = '';
    if (els.programExerciseIdInput) {
      els.programExerciseIdInput.value = '';
    }
    if (els.programExerciseNameInput) {
      els.programExerciseNameInput.value = '';
    }
    if (els.programExerciseCategoryInput) {
      els.programExerciseCategoryInput.value = 'OTROS';
    }
    if (els.programExerciseZoneInput) {
      els.programExerciseZoneInput.value = '';
    }
    if (els.programExerciseRestInput) {
      els.programExerciseRestInput.value = '90';
    }
    if (els.programExerciseWeightInput) {
      els.programExerciseWeightInput.value = '';
    }
    if (els.programExerciseRepMinInput) {
      els.programExerciseRepMinInput.value = '8';
    }
    if (els.programExerciseRepMaxInput) {
      els.programExerciseRepMaxInput.value = '12';
    }
    if (els.programExerciseNotesInput) {
      els.programExerciseNotesInput.value = '';
    }
    if (els.programApproximationModeInput) {
      els.programApproximationModeInput.value = 'none';
    }
    if (els.programApproximationRows) {
      els.programApproximationRows.innerHTML = '';
    }
    if (els.programEffectiveSetRows) {
      els.programEffectiveSetRows.innerHTML = '';
    }
  }

  function populateProgramExerciseForm(exercise) {
    if (!exercise) {
      clearProgramExerciseForm();
      return;
    }
    trainingUi.programExerciseDraft = exercise;
    trainingUi.editingProgramExerciseId = exercise.id;
    if (els.programExerciseIdInput) {
      els.programExerciseIdInput.value = exercise.id || '';
    }
    if (els.programExerciseNameInput) {
      els.programExerciseNameInput.value = exercise.exerciseName || '';
    }
    if (els.programExerciseCategoryInput) {
      els.programExerciseCategoryInput.value = exercise.category || 'OTROS';
    }
    if (els.programExerciseZoneInput) {
      els.programExerciseZoneInput.value = exercise.zone || '';
    }
    if (els.programExerciseRestInput) {
      els.programExerciseRestInput.value = String(exercise.restSeconds || 90);
    }
    if (els.programExerciseWeightInput) {
      els.programExerciseWeightInput.value = Number(exercise.targetWeight || 0) > 0 ? String(exercise.targetWeight) : '';
    }
    if (els.programExerciseRepMinInput) {
      els.programExerciseRepMinInput.value = String(exercise.repRangeMin || 8);
    }
    if (els.programExerciseRepMaxInput) {
      els.programExerciseRepMaxInput.value = String(exercise.repRangeMax || 12);
    }
    if (els.programExerciseNotesInput) {
      els.programExerciseNotesInput.value = exercise.notes || '';
    }
    if (els.programApproximationModeInput) {
      const hasApproximations = Array.isArray(exercise.approximations) && exercise.approximations.length;
      els.programApproximationModeInput.value = hasApproximations ? 'manual' : 'none';
    }
    renderProgramExerciseRows(exercise);
  }

  function renderProgramExerciseRows(exercise) {
    if (!els.programApproximationRows || !els.programEffectiveSetRows) {
      return;
    }
    const approximations = Array.isArray(exercise?.approximations) && exercise.approximations.length ? exercise.approximations : [];
    const effectiveSets = Array.isArray(exercise?.effectiveSets) && exercise.effectiveSets.length ? exercise.effectiveSets : [];
    els.programApproximationRows.innerHTML = approximations.length
      ? approximations.map((approx, index) => `
        <div class="training-set-item">
          <div><strong>${escapeHtml(approx.label || `A${index + 1}`)}</strong></div>
          <div class="row">
            <div><label>Peso</label><input data-program-approx-weight="${approx.id}" type="number" min="0" step="0.5" value="${Number(approx.weight || 0)}"></div>
            <div><label>Reps</label><input data-program-approx-reps="${approx.id}" type="number" min="0" value="${Number(approx.reps || 0)}"></div>
          </div>
        </div>`).join('')
      : '<div class="muted">Sin aproximaciones.</div>';
    els.programEffectiveSetRows.innerHTML = effectiveSets.length
      ? effectiveSets.map((setEntry, index) => `
        <div class="training-set-item">
          <div><strong>${escapeHtml(setEntry.label || `S${index + 1}`)}</strong></div>
          <div class="row">
            <div><label>Peso</label><input data-program-set-weight="${setEntry.id}" type="number" min="0" step="0.5" value="${Number(setEntry.weight || 0)}"></div>
            <div><label>Reps</label><input data-program-set-reps="${setEntry.id}" type="number" min="0" value="${Number(setEntry.reps || 0)}"></div>
          </div>
        </div>`).join('')
      : '<div class="muted">Sin series efectivas.</div>';
  }

  function resetProgramDraft() {
    trainingUi.editingProgramId = '';
    trainingUi.editingProgramDayId = '';
    trainingUi.editingProgramExerciseId = '';
    if (els.programIdInput) {
      els.programIdInput.value = '';
    }
    if (els.programNameInput) {
      els.programNameInput.value = '';
    }
    if (els.programObjectiveInput) {
      els.programObjectiveInput.value = '';
    }
    if (els.programStartDateInput) {
      els.programStartDateInput.value = getTodayLocalDate();
    }
    if (els.programDurationWeeksInput) {
      els.programDurationWeeksInput.value = '4';
    }
    if (els.programWeeklyFrequencyInput) {
      els.programWeeklyFrequencyInput.value = '3';
    }
    if (els.programAssignedClientsInput) {
      els.programAssignedClientsInput.innerHTML = '';
    }
  }

  function getProgramDraft() {
    ensureTrainingsV08State();
    const existing = trainingUi.editingProgramId ? getTrainingProgramById(trainingUi.editingProgramId) : null;
    if (existing) {
      return existing;
    }
    return {
      id: dataApi.createId('program'),
      name: '',
      objective: '',
      startDate: getTodayLocalDate(),
      durationWeeks: 4,
      weeklyFrequency: 3,
      assignedClientIds: [],
      days: [createEmptyProgramDay(1)],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function renderProgramDayList(program) {
    if (!els.programDayList) {
      return;
    }
    const safeProgram = program || getProgramDraft();
    els.programDayList.innerHTML = safeProgram.days.length
      ? safeProgram.days.map((day, dayIndex) => {
        const exerciseCount = day.exercises?.length || 0;
        const effectiveSetCount = (day.exercises || []).reduce((sum, exercise) => sum + Number(exercise.effectiveSets?.length || 0), 0);
        const zones = [...new Set((day.exercises || []).map((exercise) => exercise.zone).filter(Boolean))];
        const estimatedMinutes = Math.max(20, Math.round((effectiveSetCount * 3) + (exerciseCount * 2) + (zones.length * 4) + 10));
        return `
        <div class="training-set-item">
          <div>
            <strong>${escapeHtml(day.name || `Día ${dayIndex + 1}`)}</strong>
            <div class="meta">${exerciseCount} ejercicios · ${effectiveSetCount} series efectivas · Zonas: ${zones.length ? zones.join(' → ') : 'Sin zona'}</div>
            <div class="meta">Duración estimada: ${estimatedMinutes} min</div>
          </div>
          <div class="inline-actions">
            <button class="ghost small" type="button" data-program-day-edit="${day.id}">Editar</button>
            <button class="secondary small" type="button" data-program-exercise-add="${day.id}">+ EJERCICIO</button>
          </div>
          <div class="training-set-list">
            ${(day.exercises || []).map((exercise, exerciseIndex) => `
              <div class="training-set-item">
                <div>
                  <strong>${exerciseIndex + 1}. ${escapeHtml(exercise.exerciseName || 'Ejercicio')}</strong>
                  <div class="meta">${escapeHtml(exercise.category || 'OTROS')} · ${escapeHtml(exercise.zone || 'Sin zona')} · ${Number(exercise.restSeconds || 0)} s</div>
                  <div class="meta">A: ${(exercise.approximations || []).map((item) => `${escapeHtml(item.label || '')} ${Number(item.weight || 0)} kg x ${Number(item.reps || 0)}`).join(' · ') || 'Sin aproximaciones'}</div>
                  <div class="meta">S: ${(exercise.effectiveSets || []).map((item) => `${escapeHtml(item.label || '')} ${Number(item.weight || 0)} kg x ${Number(item.reps || 0)}`).join(' · ') || 'Sin series'}</div>
                </div>
                <div class="inline-actions">
                  <button class="ghost small" type="button" data-program-exercise-edit="${exercise.id}">Editar</button>
                  <button class="ghost small" type="button" data-program-exercise-up="${exercise.id}" ${exerciseIndex === 0 ? 'disabled' : ''}>Subir</button>
                  <button class="ghost small" type="button" data-program-exercise-down="${exercise.id}" ${exerciseIndex === (day.exercises || []).length - 1 ? 'disabled' : ''}>Bajar</button>
                  <button class="danger small" type="button" data-program-exercise-delete="${exercise.id}">Eliminar</button>
                </div>
              </div>`).join('')}
          </div>
        </div>`;
      }).join('')
      : '<div class="muted">Aún no hay días creados.</div>';
  }

  function renderProgramLibrary() {
    if (!els.exerciseLibraryList) {
      return;
    }
    const category = els.exerciseCategorySelect?.value || 'PIERNAS';
    const search = String(els.exerciseLibrarySearch?.value || '').trim().toLowerCase();
    const catalog = getProgramExerciseCatalog()[category] || [];
    const items = catalog.filter((exercise) => !search || exercise.toLowerCase().includes(search));
    els.exerciseLibraryList.innerHTML = items.length
      ? items.map((exercise) => `
        <div class="training-set-item">
          <div><strong>${escapeHtml(exercise)}</strong></div>
          <div class="inline-actions"><button class="secondary small" type="button" data-program-library-select="${escapeHtml(exercise)}">Agregar</button></div>
        </div>`).join('')
      : '<div class="muted">No hay ejercicios para esta categoría.</div>';
  }

  function renderProgramsList() {
    if (!els.programList) {
      return;
    }
    const programs = getTrainingPrograms();
    els.programList.innerHTML = programs.length
      ? programs.map((program) => `
        <div class="training-set-item">
          <div>
            <strong>${escapeHtml(program.name || 'Programa')}</strong>
            <div class="meta">${escapeHtml(program.objective || 'Sin objetivo')} · ${Number(program.durationWeeks || 0)} semanas · ${Number(program.weeklyFrequency || 0)} días/semana</div>
            <div class="meta">${program.days?.length || 0} días · ${program.assignedClientIds?.length || 0} alumnos</div>
          </div>
          <div class="inline-actions">
            <button class="secondary small" type="button" data-program-edit="${program.id}">Editar</button>
            <button class="ghost small" type="button" data-program-assign="${program.id}">Asignar</button>
          </div>
        </div>`).join('')
      : '<div class="muted">No hay programas aún.</div>';
  }

  function getPlanningDraftProgram() {
    ensureTrainingsV08State();
    if (planningUi.draftProgram && planningUi.draftProgram.id) {
      return planningUi.draftProgram;
    }
    const program = {
      id: dataApi.createId('planning-program'),
      name: '',
      objective: planningUi.objective || 'Fuerza',
      startDate: getTodayLocalDate(),
      durationWeeks: planningUi.duration || 4,
      weeklyFrequency: planningUi.frequency || 2,
      assignedClientIds: [...planningUi.selectedClientIds],
      days: [
        { id: dataApi.createId('program-day'), name: 'Día A', order: 1, exercises: [] },
        { id: dataApi.createId('program-day'), name: 'Día B', order: 2, exercises: [] },
        { id: dataApi.createId('program-day'), name: 'Día C', order: 3, exercises: [] }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    planningUi.draftProgram = program;
    return program;
  }

  function syncPlanningProgramToLegacyForm() {
    const draft = getPlanningDraftProgram();
    if (els.programNameInput) els.programNameInput.value = draft.name || '';
    if (els.programObjectiveInput) els.programObjectiveInput.value = draft.objective || '';
    if (els.programStartDateInput) els.programStartDateInput.value = draft.startDate || getTodayLocalDate();
    if (els.programDurationWeeksInput) els.programDurationWeeksInput.value = String(draft.durationWeeks || 4);
    if (els.programWeeklyFrequencyInput) els.programWeeklyFrequencyInput.value = String(draft.weeklyFrequency || 2);
    if (els.programAssignedClientsInput) {
      const selectedIds = new Set(draft.assignedClientIds || []);
      Array.from(els.programAssignedClientsInput.options).forEach((option) => {
        option.selected = selectedIds.has(option.value);
      });
    }
    if (els.programIdInput) els.programIdInput.value = draft.id || '';
  }

  function renderPlanningSavedPrograms() {
    if (!els.planningSavedPrograms) {
      return;
    }
    const programs = getTrainingPrograms();
    if (!programs.length) {
      els.planningSavedPrograms.innerHTML = '<div class="muted">Todavía no hay programaciones guardadas.</div>';
      return;
    }
    els.planningSavedPrograms.innerHTML = programs.slice(0, 6).map((program) => `
      <div class="planning-program-item">
        <div>
          <strong>${escapeHtml(program.name || 'Programa')}</strong>
          <div class="meta">${escapeHtml(program.objective || 'Sin objetivo')} · ${Number(program.durationWeeks || 0)} sem.</div>
        </div>
        <div class="inline-actions">
          <button class="ghost small" type="button" data-program-edit="${program.id}">Abrir</button>
          <button class="secondary small" type="button" data-program-base="${program.id}">Usar como base</button>
        </div>
      </div>
    `).join('');
  }

  function renderPlanningBaseProgramOptions() {
    const select = els.planningBaseProgramSelect;
    if (!select) {
      return;
    }
    const programs = getTrainingPrograms();
    const currentValue = String(planningUi.baseProgramId || '').trim();
    select.innerHTML = '<option value="">Selecciona un programa guardado...</option>' + programs.map((program) => {
      const programName = escapeHtml(program.name || 'Programa');
      const clientCount = Array.isArray(program.assignedClientIds) ? program.assignedClientIds.length : 0;
      return `<option value="${escapeHtml(program.id || '')}" ${currentValue === String(program.id || '') ? 'selected' : ''}>${programName} · ${clientCount} alumno(s)</option>`;
    }).join('');
    if (!programs.some((program) => String(program.id || '') === currentValue) && currentValue) {
      select.value = '';
      planningUi.baseProgramId = '';
    }
  }

  function duplicatePlanningProgramFromBase(programId) {
    const sourceProgram = getTrainingProgramById(programId);
    if (!sourceProgram) {
      return false;
    }

    const baseCopy = JSON.parse(JSON.stringify(sourceProgram));
    const copiedProgram = dataApi.normalizeTrainingProgram({
      ...baseCopy,
      id: dataApi.createId('planning-program'),
      name: `${baseCopy.name || 'Programa'} (copia)`,
      assignedClientIds: Array.isArray(baseCopy.assignedClientIds) ? [...baseCopy.assignedClientIds] : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    planningUi.baseProgramId = programId;
    planningUi.objective = copiedProgram.objective || 'Fuerza';
    planningUi.duration = Number(copiedProgram.durationWeeks || 4);
    planningUi.frequency = Number(copiedProgram.weeklyFrequency || copiedProgram.days?.length || 2);
    planningUi.draftProgram = copiedProgram;
    planningUi.selectedClientIds = Array.isArray(copiedProgram.assignedClientIds) ? [...copiedProgram.assignedClientIds] : [];
    planningUi.weeklyDays = [];
    planningUi.currentDayIndex = 0;
    if (copiedProgram.days?.length) {
      copiedProgram.days = copiedProgram.days.map((day, index) => ({ ...day, order: index + 1, name: day.name || `Día ${index + 1}` }));
    }
    applyPlanningChoiceData();
    renderPlanningClientSelection();
    renderPlanningSavedPrograms();
    renderPlanningBaseProgramOptions();
    showPlanningStep(2);
    return true;
  }

  function renderPlanningClientSelection() {
    const clients = getActiveTrainingClients();
    const selected = new Set(planningUi.selectedClientIds || []);
    if (!els.planningClientGrid) {
      return;
    }
    if (!clients.length) {
      els.planningClientGrid.innerHTML = '<div class="muted">No hay alumnos activos para seleccionar. Crea primero un cliente en la sección de Clientes.</div>';
      if (els.planningClientSelectionSummary) {
        els.planningClientSelectionSummary.textContent = '0 alumnos seleccionados';
      }
      return;
    }
    els.planningClientGrid.innerHTML = clients.map((client) => `
      <button class="planning-client-card ${selected.has(client.id) ? 'selected' : ''}" type="button" data-planning-client-id="${client.id}">
        ${escapeHtml(getClientDisplayName(client))}
      </button>
    `).join('');
    if (els.planningClientSelectionSummary) {
      els.planningClientSelectionSummary.textContent = `${selected.size} alumnos seleccionados`;
    }
  }

  function renderPlanningStepIndicators() {
    const steps = document.querySelectorAll('.planning-step');
    steps.forEach((step, index) => {
      const isActive = index + 1 === planningUi.currentStep;
      const isCompleted = index + 1 < planningUi.currentStep;
      step.classList.toggle('active', isActive);
      step.classList.toggle('completed', isCompleted);
      step.classList.toggle('pending', !isActive && !isCompleted);
      const mark = step.querySelector('.step-mark');
      if (mark) {
        mark.textContent = isCompleted ? '✓' : isActive ? '●' : '○';
      }
    });
  }

  function programHasExercises() {
    const draft = getPlanningDraftProgram();
    return (draft.days || []).some((day) => (day.exercises || []).length > 0);
  }

  function updatePlanningContinueButton() {
    const button = document.getElementById('planningContinueStep3');
    const message = document.getElementById('planningStep3Message');
    const enabled = programHasExercises();
    if (button) {
      button.disabled = !enabled;
      button.classList.toggle('secondary', !enabled);
      button.classList.toggle('primary', enabled);
    }
    if (message) {
      message.classList.toggle('hidden', enabled);
      message.textContent = 'Agrega al menos un ejercicio para continuar.';
    }
  }

  function showPlanningStep(stepNumber) {
    planningUi.currentStep = stepNumber;
    const panels = [els.planningStep1, els.planningStep2, els.planningStep3, els.planningStep4];
    panels.forEach((panel, index) => {
      if (panel) {
        panel.classList.toggle('hidden', index + 1 !== stepNumber);
      }
    });
    renderPlanningStepIndicators();

    if (stepNumber === 1) {
      renderPlanningClientSelection();
      renderPlanningSavedPrograms();
      renderPlanningBaseProgramOptions();
    }

    if (stepNumber === 2) {
      if (els.planningProgramName) {
        els.planningProgramName.value = getPlanningDraftProgram().name || '';
      }
      if (els.planningProgramStartDate) {
        els.planningProgramStartDate.value = getPlanningDraftProgram().startDate || getTodayLocalDate();
      }
    }

    if (stepNumber === 3) {
      routineBuilder.screen = 'day';
      routineBuilder.activeDayIndex = planningUi.currentDayIndex;
      renderPlanningDays();
      if (els.routineBuilderRoot) {
        renderRoutineBuilder();
      }
    }
    if (stepNumber === 4) {
      const draft = getPlanningDraftProgram();
      const expected = Math.max(1, Math.min(Number(draft.weeklyFrequency || planningUi.frequency || 3), Math.max(1, (draft.days || []).length || 3)));
      if (!planningUi.weeklyDays || !planningUi.weeklyDays.length) {
        planningUi.weeklyDays = getDefaultPlanningWeeklyDays(expected, draft.days.length || 3);
      }
      renderPlanningReview();
    }
  }

  function applyPlanningChoiceData() {
    const draft = getPlanningDraftProgram();
    draft.name = String(els.planningProgramName?.value || '').trim();
    draft.objective = planningUi.objective || draft.objective || 'Fuerza';
    draft.durationWeeks = planningUi.duration || Number(els.planningCustomDuration?.value || draft.durationWeeks || 4);
    draft.weeklyFrequency = planningUi.frequency || Number(draft.weeklyFrequency || 2);
    const expectedDayCount = Math.max(1, Math.min(Number(draft.weeklyFrequency || 2), 7));
    draft.days = Array.isArray(draft.days) ? draft.days : [];
    while (draft.days.length < expectedDayCount) {
      const index = draft.days.length;
      draft.days.push({
        id: dataApi.createId('program-day'),
        name: `Día ${String.fromCharCode(65 + index)}`,
        order: index + 1,
        exercises: []
      });
    }
    if (draft.days.length > expectedDayCount && draft.days.slice(expectedDayCount).every((day) => !(day.exercises || []).length)) {
      draft.days.splice(expectedDayCount);
    }
    planningUi.currentDayIndex = Math.min(planningUi.currentDayIndex, Math.max(0, draft.days.length - 1));
    draft.startDate = String(els.planningProgramStartDate?.value || draft.startDate || getTodayLocalDate());
    draft.assignedClientIds = [...planningUi.selectedClientIds];
    draft.updatedAt = new Date().toISOString();
    planningUi.draftProgram = draft;
    syncPlanningProgramToLegacyForm();
    renderPlanningReview();
  }

  function getVisualExerciseCategory(exercise) {
    const haystack = String(
      exercise?.name ||
      exercise?.normalizedName ||
      exercise?.primaryMuscle ||
      exercise?.primary_muscle ||
      exercise?.category ||
      exercise ||
      ''
    ).toLowerCase();

    if (/(quadriceps|hamstrings|glutes|adductors|squat|deadlift|hip thrust|split squat|leg press|femoral|estocada|sentadilla|peso muerto|prensa de piernas)/.test(haystack)) {
      return 'PIERNAS';
    }
    if (/(chest|pec|press banca|bench|incline|apertura|pecho)/.test(haystack)) {
      return 'PECHO';
    }
    if (/(lats|upper_back|traps|back|remo|pulldown|lat|espalda|jalon|remo)/.test(haystack)) {
      return 'ESPALDA';
    }
    if (/(front_delts|lateral_delts|rear_delts|shoulder|press militar|elevacion|hombro|delto|shoulders)/.test(haystack)) {
      return 'HOMBROS';
    }
    if (/(biceps|curl|bíceps|curls)/.test(haystack)) {
      return 'BÍCEPS';
    }
    if (/(triceps|patada|extension de tríceps|tríceps|press francés)/.test(haystack)) {
      return 'TRÍCEPS';
    }
    if (/(abdominals|obliques|spinal_erectors|core|plancha|abdominal|crunch|russian twist|hollow|oblicuo|core)/.test(haystack)) {
      return 'CORE';
    }
    return 'OTROS';
  }

  function getRoutineExerciseCatalog() {
    const library = Array.isArray(state.exerciseLibrary) && state.exerciseLibrary.length ? state.exerciseLibrary : [];
    const catalog = {
      PIERNAS: [],
      PECHO: [],
      ESPALDA: [],
      HOMBROS: [],
      BÍCEPS: [],
      TRÍCEPS: [],
      CORE: [],
      OTROS: []
    };

    if (library.length) {
      library.forEach((exercise) => {
        const category = getVisualExerciseCategory(exercise);
        const entry = {
          id: exercise.id || exercise.libraryExerciseId || dataApi.createId('library-exercise'),
          name: exercise.name || exercise.normalizedName || 'Ejercicio',
          primaryMuscle: exercise.primaryMuscle || exercise.primary_muscle || '',
          category
        };
        if (!catalog[category]) {
          catalog[category] = [];
        }
        catalog[category].push(entry);
      });
      return catalog;
    }

    const fallback = getProgramExerciseCatalog();
    Object.keys(fallback).forEach((category) => {
      catalog[category] = fallback[category].map((name) => ({ id: `${category}-${slugifyTrainingPart(name)}`, name, category }));
    });
    return catalog;
  }

  function getRoutineBuilderDay() {
    const draft = getPlanningDraftProgram();
    const day = draft.days[routineBuilder.activeDayIndex] || draft.days[0];
    return day || { id: dataApi.createId('program-day'), name: 'Día A', order: 1, exercises: [] };
  }

  function renderPlanningDays() {
    const draft = getPlanningDraftProgram();
    const days = draft.days || [];
    if (!els.planningDayTabs) {
      return;
    }
    els.planningDayTabs.innerHTML = days.map((day, index) => {
      const count = Array.isArray(day.exercises) ? day.exercises.length : 0;
      const label = count > 0 ? `${day.name || `Día ${index + 1}`} ✓ ${count}` : `${day.name || `Día ${index + 1}`} · VACÍO`;
      return `
        <button class="planning-day-tab ${index === planningUi.currentDayIndex ? 'active' : ''}" type="button" data-planning-day-index="${index}">${escapeHtml(label)}</button>
      `;
    }).join('');
    planningUi.currentDayName = days[planningUi.currentDayIndex]?.name || `Día ${planningUi.currentDayIndex + 1}`;
    if (els.planningCurrentDayLabel) {
      els.planningCurrentDayLabel.textContent = planningUi.currentDayName.toUpperCase();
    }
    routineBuilder.activeDayIndex = planningUi.currentDayIndex;
    routineBuilder.screen = 'day';
    renderRoutineBuilder();
    updatePlanningContinueButton();
  }

  function resetRoutineBuilderDraft() {
    routineBuilder.draft = {
      sets: 3,
      repMin: 8,
      repMax: 12,
      targetWeight: '',
      approximations: [],
      zone: '',
      restSeconds: 90,
      notes: ''
    };
    routineBuilder.showMoreOptions = false;
  }

  function loadRoutineBuilderDraftFromExercise(exercise) {
    if (!exercise) {
      resetRoutineBuilderDraft();
      return;
    }
    routineBuilder.exerciseId = exercise.libraryExerciseId || exercise.id || null;
    routineBuilder.draft = {
      sets: Number(exercise.sets || exercise.plannedSets || 3),
      repMin: Number(exercise.repMin || exercise.repRangeMin || exercise.plannedRepMin || 8),
      repMax: Number(exercise.repMax || exercise.repRangeMax || exercise.plannedRepMax || Number(exercise.repMin || exercise.repRangeMin || exercise.plannedRepMin || 8)),
      targetWeight: Number(exercise.targetWeight || 0) > 0 ? String(exercise.targetWeight) : '',
      approximations: Array.isArray(exercise.approximations) ? exercise.approximations.map((item) => ({
        weight: item.weight === undefined || item.weight === null ? '' : String(item.weight),
        reps: Number(item.reps || 8)
      })) : [],
      zone: exercise.zone || '',
      restSeconds: Number(exercise.restSeconds || 90),
      notes: exercise.notes || ''
    };
    routineBuilder.showMoreOptions = Boolean(routineBuilder.draft.zone || routineBuilder.draft.notes || routineBuilder.draft.restSeconds !== 90);
  }

  function renderRoutineBuilder() {
    if (!els.routineBuilderRoot) {
      return;
    }

    const draft = getPlanningDraftProgram();
    const day = draft.days[routineBuilder.activeDayIndex] || draft.days[0];
    const label = (day?.name || `Día ${routineBuilder.activeDayIndex + 1}`).toUpperCase();
    const categories = ['PIERNAS', 'PECHO', 'ESPALDA', 'HOMBROS', 'BÍCEPS', 'TRÍCEPS', 'CORE', 'OTROS'];

    if (routineBuilder.screen === 'day') {
      const items = Array.isArray(day?.exercises) ? day.exercises : [];
      const html = `
        <div class="planning-panel-box">
          <div class="section-title compact">
            <strong>${escapeHtml(label)}</strong>
          </div>
          ${items.length ? items.map((exercise, index) => `
            <div class="planning-exercise-item">
              <div class="planning-exercise-item-header">
                <strong>${index + 1}. ${escapeHtml(exercise.exerciseName || 'Ejercicio')}</strong>
              </div>
              <div class="meta">${Number(exercise.sets || exercise.plannedSets || 0)} × ${Number(exercise.repMin || exercise.repRangeMin || 0)}-${Number(exercise.repMax || exercise.repRangeMax || 0)}</div>
              <div class="meta">${Array.isArray(exercise.approximations) ? `${exercise.approximations.length} aproximaciones` : '0 aproximaciones'} · ${escapeHtml(exercise.zone || 'Sin zona')}</div>
              <div class="inline-actions">
                <button class="ghost small" type="button" data-routine-action="edit-exercise" data-exercise-index="${index}">Editar</button>
                <button class="ghost small" type="button" data-routine-action="move-up" data-exercise-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="ghost small" type="button" data-routine-action="move-down" data-exercise-index="${index}" ${index === items.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="danger small" type="button" data-routine-action="delete-exercise" data-exercise-index="${index}">Eliminar</button>
              </div>
            </div>
          `).join('') : '<div class="muted">Todavía no agregaste ejercicios.</div>'}
          <div class="inline-actions">
            <button class="primary" type="button" data-routine-action="add-exercise">+ AGREGAR EJERCICIO</button>
          </div>
        </div>
      `;
      els.routineBuilderRoot.innerHTML = html;
      updatePlanningContinueButton();
      return;
    }

    if (routineBuilder.screen === 'categories') {
      els.routineBuilderRoot.innerHTML = `
        <div class="planning-panel-box">
          <div class="section-title compact">
            <strong>¿QUÉ QUIERES TRABAJAR?</strong>
            <button class="ghost small" type="button" data-routine-action="back-day">← Volver</button>
          </div>
          <div class="planning-category-grid">
            ${categories.map((category) => `
              <button class="planning-category-btn" type="button" data-routine-action="open-category" data-category="${category}">${escapeHtml(category)}</button>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }

    if (routineBuilder.screen === 'exerciseList') {
      const category = routineBuilder.category || 'PIERNAS';
      const catalog = getRoutineExerciseCatalog();
      const filtered = (catalog[category] || []).filter((exercise) => {
        const value = String(routineBuilder.search || '').trim().toLowerCase();
        return !value || String(exercise.name || '').toLowerCase().includes(value);
      });
      els.routineBuilderRoot.innerHTML = `
        <div class="planning-panel-box">
          <div class="section-title compact">
            <button class="ghost small" type="button" data-routine-action="back-categories">← CATEGORÍAS</button>
            <strong>${escapeHtml(category)}</strong>
          </div>
          <div class="planning-search-wrap">
            <input type="search" data-routine-field="search" value="${escapeHtml(String(routineBuilder.search || ''))}" placeholder="Buscar ejercicio...">
          </div>
          <div class="planning-category-grid">
            ${filtered.length ? filtered.map((exercise) => `
              <button class="planning-exercise-pick-btn" type="button" data-routine-action="select-exercise" data-exercise-id="${escapeHtml(exercise.id || '')}">${escapeHtml(exercise.name || 'Ejercicio')}</button>
            `).join('') : '<div class="muted">No hay ejercicios para esta categoría.</div>'}
          </div>
        </div>
      `;
      return;
    }

    const selectedExercise = getRoutineExerciseCatalog()[routineBuilder.category || 'PIERNAS']?.find((item) => item.id === routineBuilder.exerciseId)
      || { id: routineBuilder.exerciseId || dataApi.createId('library-exercise'), name: 'Ejercicio', category: routineBuilder.category || 'PIERNAS' };
    const selectedName = selectedExercise.name || 'Ejercicio';
    const approx = Array.isArray(routineBuilder.draft.approximations) ? routineBuilder.draft.approximations : [];

    els.routineBuilderRoot.innerHTML = `
      <div class="planning-panel-box">
        <div class="section-title compact">
          <button class="ghost small" type="button" data-routine-action="back-exercise-list">← ${escapeHtml((routineBuilder.category || 'PIERNAS'))}</button>
          <strong>${escapeHtml(String(selectedName).toUpperCase())}</strong>
        </div>

        <div class="planning-field-inline">
          <label>SERIES</label>
          <div class="planning-stepper-counter">
            <button class="ghost small" type="button" data-routine-action="decrease-sets">-</button>
            <span>${Number(routineBuilder.draft.sets || 3)}</span>
            <button class="ghost small" type="button" data-routine-action="increase-sets">+</button>
          </div>
        </div>

        <div class="planning-field-inline">
          <label>REPETICIONES</label>
          <div class="planning-range-inline">
            <input type="number" min="1" data-routine-field="repMin" value="${Number(routineBuilder.draft.repMin || 8)}">
            <span>a</span>
            <input type="number" min="1" data-routine-field="repMax" value="${Number(routineBuilder.draft.repMax || 12)}">
          </div>
        </div>

        <div class="planning-field-inline">
          <label>PESO OBJETIVO</label>
          <input type="number" min="0" step="0.5" data-routine-field="targetWeight" value="${routineBuilder.draft.targetWeight === '' ? '' : Number(routineBuilder.draft.targetWeight || 0)}" placeholder="kg">
        </div>

        <div class="planning-advanced-toggle">
          <button class="secondary small" type="button" data-routine-action="toggle-more-options">⚙ MÁS OPCIONES</button>
        </div>

        ${routineBuilder.showMoreOptions ? `
          <div class="planning-more-options">
            <div class="planning-field-block">
              <label>ZONA</label>
              <select data-routine-field="zone">
                <option value="" ${!routineBuilder.draft.zone ? 'selected' : ''}>Otro</option>
                <option value="Salón A" ${routineBuilder.draft.zone === 'Salón A' ? 'selected' : ''}>Salón A</option>
                <option value="Salón B" ${routineBuilder.draft.zone === 'Salón B' ? 'selected' : ''}>Salón B</option>
                <option value="Patio / Factor" ${routineBuilder.draft.zone === 'Patio / Factor' ? 'selected' : ''}>Patio / Factor</option>
                <option value="Otro" ${routineBuilder.draft.zone === 'Otro' ? 'selected' : ''}>Otro</option>
              </select>
            </div>
            <div class="planning-field-block">
              <label>DESCANSO</label>
              <select data-routine-field="restSeconds">
                ${['60', '90', '95', '120'].map((value) => `<option value="${value}" ${String(routineBuilder.draft.restSeconds || 90) === value ? 'selected' : ''}>${value}</option>`).join('')}
              </select>
            </div>
            <div class="planning-field-block">
              <label>NOTA TÉCNICA</label>
              <textarea data-routine-field="notes" placeholder="Foco técnico...">${escapeHtml(routineBuilder.draft.notes || '')}</textarea>
            </div>
          </div>
        ` : ''}

        <div class="planning-field-block">
          <label>APROXIMACIONES</label>
          <div class="planning-approx-list">
            ${approx.length ? approx.map((item, index) => `
              <div class="planning-approx-item">
                <div>
                  <label>A${index + 1}</label>
                  <input type="number" min="0" step="0.5" data-routine-field="approx-weight" data-approx-index="${index}" value="${item.weight === '' || item.weight === null || item.weight === undefined ? '' : Number(item.weight || 0)}" placeholder="kg">
                </div>
                <div>
                  <label>Reps</label>
                  <input type="number" min="1" data-routine-field="approx-reps" data-approx-index="${index}" value="${Number(item.reps || 8)}">
                </div>
                <div class="planning-approx-actions">
                  <button class="ghost small" type="button" data-routine-action="remove-approx" data-approx-index="${index}">Eliminar</button>
                </div>
              </div>
            `).join('') : '<div class="muted">Sin aproximaciones.</div>'}
          </div>
          <button class="ghost small" type="button" data-routine-action="add-approximation" ${approx.length >= 3 ? 'disabled' : ''}>+ AGREGAR APROXIMACIÓN</button>
        </div>

        <div class="inline-actions">
          <button class="primary" type="button" data-routine-action="save-exercise">GUARDAR EJERCICIO</button>
        </div>
      </div>
    `;
  }

  function saveRoutineBuilderExercise() {
    const draft = getPlanningDraftProgram();
    const day = draft.days[routineBuilder.activeDayIndex] || draft.days[0];
    if (!day) {
      return;
    }

    const exerciseName = (() => {
      const libraryItems = getRoutineExerciseCatalog();
      const localExercise = (libraryItems[routineBuilder.category || 'PIERNAS'] || []).find((item) => item.id === routineBuilder.exerciseId);
      return localExercise?.name || 'Ejercicio';
    })();

    const payload = {
      id: dataApi.createId('program-exercise'),
      libraryExerciseId: routineBuilder.exerciseId || '',
      exerciseName,
      sets: Number(routineBuilder.draft.sets || 3),
      repMin: Number(routineBuilder.draft.repMin || 8),
      repMax: Number(routineBuilder.draft.repMax || Number(routineBuilder.draft.repMin || 8)),
      targetWeight: Number(routineBuilder.draft.targetWeight || 0),
      approximations: Array.isArray(routineBuilder.draft.approximations) ? routineBuilder.draft.approximations.map((item, index) => ({
        id: dataApi.createId('program-approximation'),
        label: `A${index + 1}`,
        weight: item.weight === '' || item.weight === null || item.weight === undefined ? '' : Number(item.weight || 0),
        reps: Number(item.reps || 8)
      })) : [],
      zone: routineBuilder.draft.zone || '',
      restSeconds: Number(routineBuilder.draft.restSeconds || 90),
      notes: routineBuilder.draft.notes || '',
      order: 1,
      category: routineBuilder.category || 'PIERNAS'
    };

    const normalizedDayExercises = Array.isArray(day.exercises) ? day.exercises : [];
    const replacementIndex = routineBuilder.editingIndex !== null && routineBuilder.editingIndex !== undefined ? routineBuilder.editingIndex : null;

    if (replacementIndex !== null && replacementIndex >= 0 && replacementIndex < normalizedDayExercises.length) {
      const existing = normalizedDayExercises[replacementIndex];
      payload.id = existing.id || payload.id;
      payload.order = replacementIndex + 1;
      normalizedDayExercises[replacementIndex] = { ...existing, ...payload };
    } else {
      payload.order = normalizedDayExercises.length + 1;
      normalizedDayExercises.push(payload);
    }

    day.exercises = normalizedDayExercises.map((item, index) => ({ ...item, order: index + 1 }));
    routineBuilder.screen = 'day';
    routineBuilder.exerciseId = null;
    routineBuilder.editingIndex = null;
    resetRoutineBuilderDraft();
    renderPlanningDays();
  }

  function getPlanningWeeklyDayOptions() {
    return [
      { value: 1, label: 'LUN' },
      { value: 2, label: 'MAR' },
      { value: 3, label: 'MIÉ' },
      { value: 4, label: 'JUE' },
      { value: 5, label: 'VIE' },
      { value: 6, label: 'SÁB' },
      { value: 7, label: 'DOM' }
    ];
  }

  function getWeekdayLabel(weekday) {
    return getPlanningWeeklyDayOptions().find((item) => Number(item.value) === Number(weekday))?.label || 'DIA';
  }

  function getDefaultPlanningWeeklyDays(frequency, totalDays = 3) {
    const palette = [1, 3, 5, 2, 4, 6, 7];
    const requested = Math.max(1, Math.min(Number(frequency || 3), Number(totalDays || 3), 7));
    const defaults = [];
    palette.forEach((weekday) => {
      if (defaults.length >= requested) {
        return;
      }
      if (!defaults.includes(weekday)) {
        defaults.push(weekday);
      }
    });
    return defaults.slice(0, requested);
  }

  function getPlanningWeeklyDaySelection() {
    const draft = getPlanningDraftProgram();
    const totalDays = Math.max(1, Math.min(Number(draft.days?.length || 3), 7));
    const expected = Math.max(1, Math.min(Number(draft.weeklyFrequency || planningUi.frequency || 3), totalDays));
    const current = Array.isArray(planningUi.weeklyDays)
      ? planningUi.weeklyDays
      : [];
    const normalized = [...new Set(current.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 1 && item <= 7))].sort((a, b) => a - b);
    if (!normalized.length) {
      planningUi.weeklyDays = getDefaultPlanningWeeklyDays(expected, totalDays);
      return planningUi.weeklyDays;
    }
    if (normalized.length > expected) {
      planningUi.weeklyDays = normalized.slice(0, expected);
      return planningUi.weeklyDays;
    }
    planningUi.weeklyDays = normalized;
    return planningUi.weeklyDays;
  }

  function getPlanningWeeklySchedule() {
    const draft = getPlanningDraftProgram();
    const selected = getPlanningWeeklyDaySelection();
    return selected.map((weekday, index) => {
      const programDay = draft.days?.[index] || draft.days?.[0] || { name: `Día ${index + 1}` };
      return {
        weekday,
        weekdayLabel: getWeekdayLabel(weekday),
        dayName: programDay.name || `Día ${index + 1}`,
        dayIndex: index
      };
    });
  }

  function formatReviewDate(dateString) {
    const value = String(dateString || '').trim();
    if (!value) {
      return 'Sin fecha';
    }
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-CL');
  }

  function calculateEstimatedFinishDate(startDate, durationWeeks) {
    const safeStart = String(startDate || getTodayLocalDate()).trim();
    const start = new Date(`${safeStart}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
      return 'Sin fecha';
    }
    const clone = new Date(start);
    const weeks = Math.max(1, Number(durationWeeks || 4));
    clone.setDate(clone.getDate() + weeks * 7);
    return clone.toLocaleDateString('es-CL');
  }

  function getSelectedPlanningClientNames() {
    const draft = getPlanningDraftProgram();
    const ids = Array.isArray(draft.assignedClientIds) ? draft.assignedClientIds : [];
    return ids.map((clientId) => {
      const client = getClientById(clientId);
      return client ? getClientDisplayName(client) : clientId;
    }).filter(Boolean);
  }

  function renderPlanningReview() {
    const draft = getPlanningDraftProgram();
    if (!els.planningReviewSummary) {
      return;
    }
    const totalExercises = (draft.days || []).reduce((sum, day) => sum + (day.exercises || []).length, 0);
    const totalSeries = (draft.days || []).reduce((sum, day) => {
      return sum + (day.exercises || []).reduce((inner, exercise) => inner + Number(exercise.sets || exercise.plannedSets || 0), 0);
    }, 0);
    const expectedDays = Math.max(1, Math.min(Number(draft.weeklyFrequency || planningUi.frequency || 3), Math.max(1, draft.days.length || 3)));
    if (!planningUi.weeklyDays || !planningUi.weeklyDays.length) {
      planningUi.weeklyDays = getDefaultPlanningWeeklyDays(expectedDays, draft.days.length || 3);
    }
    const selectedDays = getPlanningWeeklyDaySelection();
    const schedule = getPlanningWeeklySchedule();
    const startDate = String(draft.startDate || getTodayLocalDate()).trim() || getTodayLocalDate();
    const clientNames = getSelectedPlanningClientNames();

    els.planningReviewSummary.innerHTML = `
      <div class="planning-review-card">
        <strong>REVISAR PROGRAMACIÓN</strong>
        <div class="meta">${escapeHtml(draft.name || 'Programa sin nombre')}</div>
      </div>
      <div class="planning-review-card">
        <div class="meta"><strong>OBJETIVO</strong> · ${escapeHtml(draft.objective || 'Sin objetivo')}</div>
        <div class="meta"><strong>DURACIÓN</strong> · ${Number(draft.durationWeeks || 0)} semanas</div>
        <div class="meta"><strong>FRECUENCIA</strong> · ${Number(draft.weeklyFrequency || 0)} días por semana</div>
        <div class="meta"><strong>ALUMNOS</strong> · ${clientNames.length ? escapeHtml(clientNames.join(', ')) : 'Sin alumnos'}</div>
      </div>

      ${(draft.days || []).map((day, index) => {
        const exercises = Array.isArray(day.exercises) ? day.exercises : [];
        const countSeries = exercises.reduce((sum, exercise) => sum + Number(exercise.sets || exercise.plannedSets || 0), 0);
        return `
          <div class="planning-review-card">
            <div class="inline-actions" style="justify-content: space-between; align-items: center;">
              <strong>${escapeHtml(day.name || `Día ${index + 1}`)}</strong>
              <button class="ghost small" type="button" data-planning-edit-day="${index}">EDITAR DÍA</button>
            </div>
            <div class="meta">${exercises.length} ejercicios · ${countSeries} series efectivas</div>
            ${(exercises.length ? exercises.map((exercise, exerciseIndex) => `
              <div class="meta" style="margin-top: 8px;">
                <strong>${exerciseIndex + 1}. ${escapeHtml(exercise.exerciseName || 'Ejercicio')}</strong>
                <div>${Number(exercise.sets || exercise.plannedSets || 0)} × ${Number(exercise.repMin || exercise.repRangeMin || 0)}-${Number(exercise.repMax || exercise.repRangeMax || 0)}</div>
                <div>${Array.isArray(exercise.approximations) ? exercise.approximations.length : 0} aproximaciones</div>
                <div>${escapeHtml(exercise.zone || 'Sin zona')}</div>
              </div>
            `).join('') : '<div class="meta">Sin ejercicios</div>')}
          </div>
        `;
      }).join('')}

      <div class="planning-review-card">
        <strong>¿QUÉ DÍAS SE ENTRENA?</strong>
        <div class="planning-chip-grid" style="margin-top: 12px;">
          ${getPlanningWeeklyDayOptions().map((dayOption) => {
            const active = selectedDays.includes(Number(dayOption.value));
            return `
              <button class="planning-option-btn ${active ? 'active' : ''}" type="button" data-planning-weekday="${dayOption.value}">
                ${dayOption.label}${active ? ' ✓' : ''}
              </button>
            `;
          }).join('')}
        </div>
        <div class="meta">Se seleccionaron ${selectedDays.length} de ${expectedDays} días.</div>
        ${schedule.length ? `
          <div class="meta" style="margin-top: 8px;">
            ${schedule.map((slot) => `${slot.weekdayLabel} → ${escapeHtml(slot.dayName)}`).join(' · ')}
          </div>
        ` : ''}
      </div>

      <div class="planning-review-card">
        <strong>INICIO Y FIN</strong>
        <div class="meta">Inicio: ${formatReviewDate(startDate)}</div>
        <div class="meta">Fin estimado: ${calculateEstimatedFinishDate(startDate, Number(draft.durationWeeks || 4))}</div>
      </div>

      <div class="meta" style="margin-top: 10px;">Resumen total: ${totalExercises} ejercicios · ${totalSeries} series efectivas</div>
    `;
  }

  function persistPrograms() {
    ensureTrainingsV08State();
    persist();
    renderProgramsList();
    renderProgramDayList(getProgramDraft());
  }

  function setProgramSaveStatus(message, tone = 'neutral') {
    if (!els.programMessage) {
      return;
    }
    els.programMessage.textContent = message;
    els.programMessage.classList.remove('ok', 'bad', 'warn', 'muted');
    els.programMessage.classList.add(tone === 'ok' ? 'ok' : tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : 'muted');
  }

  function setProgramButtonState(label, isLoading = false) {
    if (!els.saveProgramBtn) {
      return;
    }
    els.saveProgramBtn.textContent = label;
    els.saveProgramBtn.disabled = isLoading;
  }

  function persistProgramInLocalStorage(program) {
    ensureTrainingsV08State();
    const programs = Array.isArray(state.trainingsV08.programs) ? [...state.trainingsV08.programs] : [];
    const existingIndex = programs.findIndex((item) => item.id === program.id);
    if (existingIndex >= 0) {
      programs[existingIndex] = program;
    } else {
      programs.unshift(program);
    }
    state.trainingsV08.programs = programs;

    dataApi.saveState(state);

    const verification = dataApi.loadState();
    const verified = Array.isArray(verification.trainingsV08?.programs)
      ? verification.trainingsV08.programs.some((item) => item.id === program.id)
      : false;

    if (!verified) {
      throw new Error('El programa no quedó persistido en almacenamiento local');
    }

    return verification;
  }

  function testLocalStorageWrite() {
    try {
      const snapshot = dataApi.loadState();
      snapshot.trainingsV08 = snapshot.trainingsV08 || { plans: [], sessions: [], programs: [], assignments: [] };
      snapshot.trainingsV08.programs = Array.isArray(snapshot.trainingsV08.programs) ? [...snapshot.trainingsV08.programs] : [];
      const id = dataApi.createId('local-test');
      const testProgram = {
        id,
        name: 'TEST LOCAL',
        objective: 'Prueba almacenamiento',
        startDate: '',
        durationWeeks: 4,
        weeklyFrequency: 3,
        assignedClientIds: [],
        days: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      snapshot.trainingsV08.programs.unshift(testProgram);
      dataApi.saveState(snapshot);

      const verification = dataApi.loadState();
      const exists = Array.isArray(verification.trainingsV08?.programs)
        ? verification.trainingsV08.programs.some((item) => item.id === id)
        : false;

      if (!exists) {
        throw new Error('La prueba de almacenamiento local falló');
      }

      setProgramButtonState('✓ Prueba local OK', false);
      setProgramSaveStatus('✓ Prueba local OK: almacenamiento local funciona.', 'ok');
    } catch (error) {
      console.error(error);
      setProgramButtonState('✕ Prueba local falló', false);
      setProgramSaveStatus(`✕ No se pudo guardar: ${error.message || 'Error desconocido'}`, 'bad');
    }
  }

  function saveProgram() {
    setProgramButtonState('Guardando...', true);
    setProgramSaveStatus('Guardando...', 'neutral');

    try {
      ensureTrainingsV08State();

      const planningDraft = planningUi.draftProgram && planningUi.draftProgram.id ? planningUi.draftProgram : getPlanningDraftProgram();
      const formName = String(els.programNameInput?.value || '').trim() || String(planningDraft.name || '').trim();
      const durationWeeks = Number(els.programDurationWeeksInput?.value || planningDraft.durationWeeks || 4);
      const weeklyFrequency = Number(els.programWeeklyFrequencyInput?.value || planningDraft.weeklyFrequency || 3);

      if (!formName) {
        throw new Error('Falta el nombre del programa');
      }
      if (!Number.isFinite(durationWeeks) || durationWeeks < 1) {
        throw new Error('La duración debe ser válida');
      }
      if (!Number.isFinite(weeklyFrequency) || weeklyFrequency < 1) {
        throw new Error('La frecuencia debe ser válida');
      }

      const draft = planningDraft.id ? planningDraft : getProgramDraft();
      draft.name = formName;
      draft.objective = String(els.programObjectiveInput?.value || planningDraft.objective || '').trim() || draft.objective || 'Fuerza';
      draft.startDate = String(els.programStartDateInput?.value || planningDraft.startDate || getTodayLocalDate()).trim();
      draft.durationWeeks = durationWeeks;
      draft.weeklyFrequency = weeklyFrequency;
      draft.assignedClientIds = Array.from(els.programAssignedClientsInput?.selectedOptions || []).map((option) => option.value).filter(Boolean);
      if (!draft.assignedClientIds.length) {
        draft.assignedClientIds = [...(planningUi.selectedClientIds || [])];
      }
      draft.updatedAt = new Date().toISOString();

      const normalizedDraft = dataApi.normalizeTrainingProgram(draft);
      const persisted = persistProgramInLocalStorage(normalizedDraft);
      state.trainingsV08 = persisted.trainingsV08 || state.trainingsV08;
      planningUi.draftProgram = normalizedDraft;

      trainingUi.editingProgramId = normalizedDraft.id;
      if (els.programIdInput) {
        els.programIdInput.value = normalizedDraft.id;
      }

      renderProgramsList();
      renderProgramDayList(normalizedDraft);
      renderPlanningReview();
      setProgramButtonState('✓ Programa guardado', false);
      setProgramSaveStatus(`✓ Programa guardado correctamente\n${formName}\n${durationWeeks} semanas · ${weeklyFrequency} días`, 'ok');
    } catch (error) {
      console.error(error);
      setProgramButtonState('✕ No se pudo guardar', false);
      setProgramSaveStatus(`✕ No se pudo guardar: ${error.message || 'Error desconocido'}`, 'bad');
    }
  }

  function savePlanningProgramAndAssignments() {
    try {
      ensureTrainingsV08State();
      const draft = getPlanningDraftProgram();
      const selectedClientIds = (planningUi.selectedClientIds && planningUi.selectedClientIds.length)
        ? [...planningUi.selectedClientIds]
        : [...(draft.assignedClientIds || [])];
      const expectedDays = Math.max(1, Math.min(Number(draft.weeklyFrequency || planningUi.frequency || 3), Math.max(1, (draft.days || []).length || 3)));
      const selectedDays = getPlanningWeeklyDaySelection();

      if (!draft.name) {
        throw new Error('El programa necesita un nombre.');
      }
      if (!selectedClientIds.length) {
        throw new Error('Selecciona al menos un alumno.');
      }
      if (selectedDays.length !== expectedDays) {
        throw new Error(`Selecciona ${expectedDays} días de entrenamiento.`);
      }
      if (!Array.isArray(draft.days) || draft.days.length === 0) {
        throw new Error('El programa no tiene días con ejercicios.');
      }

      draft.startDate = String(draft.startDate || els.planningProgramStartDate?.value || getTodayLocalDate()).trim();
      draft.updatedAt = new Date().toISOString();
      const normalizedDraft = dataApi.normalizeTrainingProgram(draft);
      const persistedProgramState = persistProgramInLocalStorage(normalizedDraft);
      state.trainingsV08 = persistedProgramState.trainingsV08 || state.trainingsV08;
      planningUi.draftProgram = normalizedDraft;

      const assignmentPayloads = selectedClientIds.map((clientId) => {
        const client = getClientById(clientId);
        return dataApi.normalizeTrainingProgramAssignment({
          id: dataApi.createId('program-assignment'),
          programId: normalizedDraft.id,
          clientId,
          clientName: client ? getClientDisplayName(client) : '',
          programName: normalizedDraft.name,
          objective: normalizedDraft.objective,
          startDate: normalizedDraft.startDate,
          durationWeeks: Number(normalizedDraft.durationWeeks || 4),
          weeklyDays: selectedDays.slice(),
          weeklyFrequency: expectedDays,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { trainingsV08: { programs: getTrainingPrograms() } });
      });

      const existingAssignments = getTrainingAssignments().filter((assignment) => !selectedClientIds.includes(assignment.clientId) || assignment.programId !== normalizedDraft.id);
      state.trainingsV08.assignments = [...existingAssignments, ...assignmentPayloads];
      dataApi.saveState(state);

      const verification = dataApi.loadState();
      const savedPrograms = Array.isArray(verification.trainingsV08?.programs) ? verification.trainingsV08.programs : [];
      const savedAssignments = Array.isArray(verification.trainingsV08?.assignments) ? verification.trainingsV08.assignments : [];
      const programExists = savedPrograms.some((item) => item.id === normalizedDraft.id);
      const assignmentsExist = savedAssignments.filter((item) => item.programId === normalizedDraft.id).length === selectedClientIds.length;

      if (!programExists || !assignmentsExist) {
        throw new Error('La programación o las asignaciones no quedaron persistidas correctamente.');
      }

      renderPlanningSavedPrograms();
      renderProgramsList();
      renderPlanningReview();
      if (els.planningReviewSummary) {
        els.planningReviewSummary.insertAdjacentHTML('beforeend', `
          <div class="planning-review-card" style="border-color: var(--success, #2e7d32);">
            <strong>✓ PROGRAMACIÓN ASIGNADA</strong>
            <div class="meta">${escapeHtml(normalizedDraft.name || 'Programa')}</div>
            <div class="meta">${selectedClientIds.length} alumnos · ${expectedDays} días/semana · ${formatReviewDate(normalizedDraft.startDate || getTodayLocalDate())}</div>
          </div>
        `);
      }
      if (els.programMessage) {
        els.programMessage.textContent = '✓ Programación asignada correctamente.';
        els.programMessage.className = 'notice ok';
      }
      return true;
    } catch (error) {
      console.error(error);
      if (els.programMessage) {
        els.programMessage.textContent = error.message || 'No se pudo guardar la programación.';
        els.programMessage.className = 'notice bad';
      }
      return false;
    }
  }

  function addProgramDay() {
    const draft = getProgramDraft();
    draft.days.push(createEmptyProgramDay(draft.days.length + 1));
    draft.updatedAt = new Date().toISOString();
    state.trainingsV08.programs = (getTrainingPrograms()).filter((program) => program.id !== draft.id);
    state.trainingsV08.programs.unshift(draft);
    trainingUi.editingProgramId = draft.id;
    persistPrograms();
    renderProgramDayList(draft);
  }

  function addProgramExerciseToDay(dayId, exerciseName) {
    const draft = getProgramDraft();
    const day = draft.days.find((item) => item.id === dayId);
    if (!day) {
      return;
    }
    const exercise = createEmptyProgramExercise();
    exercise.exerciseName = exerciseName;
    exercise.category = 'OTROS';
    day.exercises.push(exercise);
    draft.updatedAt = new Date().toISOString();
    state.trainingsV08.programs = (getTrainingPrograms()).filter((program) => program.id !== draft.id);
    state.trainingsV08.programs.unshift(draft);
    trainingUi.editingProgramId = draft.id;
    trainingUi.editingProgramDayId = dayId;
    populateProgramExerciseForm(exercise);
    persistPrograms();
    renderProgramDayList(draft);
  }

  function saveProgramExercise() {
    const draft = getProgramDraft();
    const day = draft.days.find((item) => item.id === trainingUi.editingProgramDayId);
    if (!day) {
      return;
    }
    const exerciseId = els.programExerciseIdInput?.value || trainingUi.editingProgramExerciseId || '';
    let exercise = day.exercises.find((item) => item.id === exerciseId) || null;
    if (!exercise) {
      exercise = createEmptyProgramExercise();
      day.exercises.push(exercise);
    }
    exercise.exerciseName = String(els.programExerciseNameInput?.value || '').trim() || exercise.exerciseName || 'Ejercicio';
    exercise.category = String(els.programExerciseCategoryInput?.value || 'OTROS').trim();
    exercise.notes = String(els.programExerciseNotesInput?.value || '').trim();
    exercise.repRangeMin = Math.max(1, Number(els.programExerciseRepMinInput?.value || 8));
    exercise.repRangeMax = Math.max(exercise.repRangeMin, Number(els.programExerciseRepMaxInput?.value || exercise.repRangeMin));
    exercise.targetWeight = Number(els.programExerciseWeightInput?.value || 0);
    exercise.restSeconds = Math.max(0, Number(els.programExerciseRestInput?.value || 90));
    exercise.zone = String(els.programExerciseZoneInput?.value || '').trim();

    const mode = els.programApproximationModeInput?.value || 'none';
    const approximationInputs = Array.from(document.querySelectorAll('[data-program-approx-weight]'));
    if (mode === 'none') {
      exercise.approximations = [];
    } else if (approximationInputs.length) {
      exercise.approximations = approximationInputs.slice(0, 3).map((input, index) => {
        const id = input.getAttribute('data-program-approx-weight') || createProgramApproximation(index + 1).id;
        const repsInput = document.querySelector(`[data-program-approx-reps="${id}"]`);
        return {
          id,
          label: `A${index + 1}`,
          weight: Number(input.value || 0),
          reps: Number(repsInput?.value || 0)
        };
      });
    } else if (mode === 'auto') {
      exercise.approximations = [createProgramApproximation(1), createProgramApproximation(2), createProgramApproximation(3)];
    } else {
      exercise.approximations = [createProgramApproximation(1)];
    }

    const effectiveSetInputs = Array.from(document.querySelectorAll('[data-program-set-weight]'));
    exercise.effectiveSets = effectiveSetInputs.length
      ? effectiveSetInputs.map((input, index) => {
        const id = input.getAttribute('data-program-set-weight') || createProgramEffectiveSet(index + 1).id;
        const repsInput = document.querySelector(`[data-program-set-reps="${id}"]`);
        return {
          id,
          label: `S${index + 1}`,
          weight: Number(input.value || 0),
          reps: Number(repsInput?.value || 0)
        };
      })
      : [];

    draft.updatedAt = new Date().toISOString();
    state.trainingsV08.programs = (getTrainingPrograms()).filter((program) => program.id !== draft.id);
    state.trainingsV08.programs.unshift(draft);
    trainingUi.editingProgramId = draft.id;
    persistPrograms();
    renderProgramDayList(draft);
    clearProgramExerciseForm();
  }

  function moveProgramExercise(dayId, exerciseId, direction) {
    const draft = getProgramDraft();
    const day = draft.days.find((item) => item.id === dayId);
    if (!day) {
      return;
    }
    const index = day.exercises.findIndex((item) => item.id === exerciseId);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= day.exercises.length) {
      return;
    }
    const [exercise] = day.exercises.splice(index, 1);
    day.exercises.splice(targetIndex, 0, exercise);
    draft.updatedAt = new Date().toISOString();
    state.trainingsV08.programs = (getTrainingPrograms()).filter((program) => program.id !== draft.id);
    state.trainingsV08.programs.unshift(draft);
    trainingUi.editingProgramId = draft.id;
    persistPrograms();
    renderProgramDayList(draft);
  }

  function deleteProgramExercise(dayId, exerciseId) {
    const draft = getProgramDraft();
    const day = draft.days.find((item) => item.id === dayId);
    if (!day) {
      return;
    }
    day.exercises = day.exercises.filter((item) => item.id !== exerciseId);
    draft.updatedAt = new Date().toISOString();
    state.trainingsV08.programs = (getTrainingPrograms()).filter((program) => program.id !== draft.id);
    state.trainingsV08.programs.unshift(draft);
    trainingUi.editingProgramId = draft.id;
    persistPrograms();
    renderProgramDayList(draft);
  }

  function renderProgramAssignedClients() {
    if (!els.programAssignedClientsInput) {
      return;
    }
    const clients = getActiveTrainingClients();
    const selectedIds = getProgramDraft().assignedClientIds || [];
    els.programAssignedClientsInput.innerHTML = clients.map((client) => `
      <option value="${client.id}" ${selectedIds.includes(client.id) ? 'selected' : ''}>${escapeHtml(getClientDisplayName(client))}</option>`).join('');
  }

  function loadProgramIntoForm(programId) {
    const program = getTrainingProgramById(programId);
    if (!program) {
      return;
    }
    trainingUi.editingProgramId = program.id;
    if (els.programIdInput) {
      els.programIdInput.value = program.id;
    }
    if (els.programNameInput) {
      els.programNameInput.value = program.name || '';
    }
    if (els.programObjectiveInput) {
      els.programObjectiveInput.value = program.objective || '';
    }
    if (els.programStartDateInput) {
      els.programStartDateInput.value = program.startDate || getTodayLocalDate();
    }
    if (els.programDurationWeeksInput) {
      els.programDurationWeeksInput.value = String(program.durationWeeks || 4);
    }
    if (els.programWeeklyFrequencyInput) {
      els.programWeeklyFrequencyInput.value = String(program.weeklyFrequency || 3);
    }
    renderProgramAssignedClients();
    renderProgramDayList(program);
  }

  function getLibraryPatternOptions() {
    return [
      'squat', 'horizontal_push', 'horizontal_pull', 'vertical_pull', 'hinge', 'carry', 'lunge', 'core', 'conditioning', 'mobility', 'other'
    ];
  }

  function getLibraryMuscleOptions() {
    return [
      'quadriceps', 'hamstrings', 'glutes', 'chest', 'lats', 'mid_back', 'front_delts', 'rear_delts',
      'biceps', 'triceps', 'core', 'calves', 'full_body', 'other'
    ];
  }

  function getLibraryTechnicalLevelOptions() {
    return ['beginner', 'intermediate', 'advanced'];
  }

  function getLibraryLoadTypeOptions() {
    return ['external_load', 'bodyweight', 'machine', 'assisted', 'band', 'other'];
  }

  function getExerciseDemandSummary(exercise) {
    const demand = exercise?.jointDemand || {};
    return {
      back: Number(demand.back || 0),
      shoulder: Number(demand.shoulder || 0),
      knee: Number(demand.knee || 0),
      hip: Number(demand.hip || 0),
      total: Number(demand.back || 0) + Number(demand.shoulder || 0) + Number(demand.knee || 0) + Number(demand.hip || 0)
    };
  }

  function formatJointDemand(demand) {
    return `E${demand.back || 0} / H${demand.shoulder || 0} / R${demand.knee || 0} / C${demand.hip || 0}`;
  }

  function findLibraryExerciseByName(name) {
    const target = String(name || '').trim();
    if (!target) {
      return null;
    }
    return (Array.isArray(state.exerciseLibrary) ? state.exerciseLibrary : []).find((exercise) =>
      (exercise.name || '').toLowerCase() === target.toLowerCase() ||
      (exercise.normalizedName || '').toLowerCase() === target.toLowerCase()
    ) || null;
  }

  function findAlternativesForExercise(exercise) {
    const library = Array.isArray(state.exerciseLibrary) ? state.exerciseLibrary : [];
    const currentPattern = exercise?.pattern || 'other';
    const currentDemand = getExerciseDemandSummary(exercise).total;
    if (!currentPattern || currentDemand === 0) {
      return [];
    }
    return library
      .filter((item) => item && item.id !== exercise.id && item.active !== false)
      .filter((item) => (item.pattern || 'other') === currentPattern)
      .filter((item) => getExerciseDemandSummary(item).total < currentDemand)
      .sort((a, b) => getExerciseDemandSummary(a).total - getExerciseDemandSummary(b).total)
      .slice(0, 3);
  }

  function findLibraryExerciseById(exerciseId) {
    return (Array.isArray(state.exerciseLibrary) ? state.exerciseLibrary : []).find((item) => item.id === exerciseId) || null;
  }

  function getLibraryExerciseOptions() {
    return (Array.isArray(state.exerciseLibrary) ? state.exerciseLibrary : [])
      .filter((exercise) => exercise && exercise.active !== false)
      .map((exercise) => ({
        id: exercise.id || exercise.libraryExerciseId || dataApi.createId('library-exercise'),
        name: exercise.name || exercise.normalizedName || 'Ejercicio'
      }));
  }

  function renderExerciseLibraryOptions() {
    const datalist = els.exerciseLibraryOptions;
    if (!datalist) {
      return;
    }
    const options = getLibraryExerciseOptions();
    datalist.innerHTML = options.map((exercise) => `<option value="${escapeHtml(exercise.name)}"></option>`).join('');
  }

  function fillLibrarySelectOptions() {
    const patternOptions = getLibraryPatternOptions();
    const muscleOptions = getLibraryMuscleOptions();
    const technicalOptions = getLibraryTechnicalLevelOptions();
    const loadTypeOptions = getLibraryLoadTypeOptions();

    const populate = (select, values, selectedValue = '') => {
      if (!select) {
        return;
      }
      const options = values.map((value) => `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
      select.innerHTML = options;
    };

    populate(els.libraryExercisePatternSelect, patternOptions);
    populate(els.libraryExercisePrimaryMuscleSelect, muscleOptions);
    populate(els.libraryExerciseTechnicalLevelSelect, technicalOptions);
    populate(els.libraryExerciseLoadTypeSelect, loadTypeOptions);

    if (els.libraryPatternFilter) {
      const patternValues = [''].concat(patternOptions);
      els.libraryPatternFilter.innerHTML = patternValues.map((value) => `<option value="${escapeHtml(value)}">${value ? escapeHtml(value) : 'Todos'}</option>`).join('');
    }
    if (els.libraryMuscleFilter) {
      const muscleValues = [''].concat(muscleOptions);
      els.libraryMuscleFilter.innerHTML = muscleValues.map((value) => `<option value="${escapeHtml(value)}">${value ? escapeHtml(value) : 'Todos'}</option>`).join('');
    }
    if (els.libraryTechnicalLevelFilter) {
      const technicalValues = [''].concat(technicalOptions);
      els.libraryTechnicalLevelFilter.innerHTML = technicalValues.map((value) => `<option value="${escapeHtml(value)}">${value ? escapeHtml(value) : 'Todos'}</option>`).join('');
    }
  }

  function renderLibraryExerciseList() {
    if (!els.libraryExerciseList) {
      return;
    }
    const search = String(els.librarySearch?.value || '').trim().toLowerCase();
    const pattern = String(els.libraryPatternFilter?.value || '');
    const muscle = String(els.libraryMuscleFilter?.value || '');
    const level = String(els.libraryTechnicalLevelFilter?.value || '');
    const exercises = (Array.isArray(state.exerciseLibrary) ? state.exerciseLibrary : [])
      .filter((exercise) => exercise && exercise.active !== false)
      .filter((exercise) => !search || (exercise.name || '').toLowerCase().includes(search) || (exercise.normalizedName || '').toLowerCase().includes(search))
      .filter((exercise) => !pattern || (exercise.pattern || '') === pattern)
      .filter((exercise) => !muscle || (exercise.primaryMuscle || '') === muscle)
      .filter((exercise) => !level || (exercise.technicalLevel || '') === level);

    els.libraryExerciseList.innerHTML = exercises.length
      ? exercises.map((exercise) => {
          const demand = getExerciseDemandSummary(exercise);
          const alternatives = findAlternativesForExercise(exercise);
          const baseName = findLibraryExerciseByName(exercise.baseExerciseId)?.name || '';
          return `
        <div class="training-set-item library-exercise-item">
          <div class="library-exercise-main">
            <strong>${escapeHtml(exercise.name || 'Ejercicio')}</strong>
            <div class="meta">${escapeHtml(exercise.pattern || 'other')} · ${escapeHtml(exercise.primaryMuscle || 'full_body')} · ${escapeHtml(exercise.technicalLevel || 'beginner')}</div>
            <div class="meta">Demanda articular: ${escapeHtml(formatJointDemand(demand))}</div>
            <div class="meta">${escapeHtml(exercise.description || 'Sin descripción')}</div>
            ${baseName ? `<div class="meta">Base: ${escapeHtml(baseName)}</div>` : ''}
            ${alternatives.length ? `<div class="meta library-alternatives">Alternativas — mismo patrón, menor demanda: ${alternatives.map((item) => escapeHtml(item.name)).join(' · ')}</div>` : '<div class="meta library-alternatives">Alternativas — mismo patrón, menor demanda: ninguna por debajo</div>'}
          </div>
          <div class="inline-actions">
            <button class="ghost small" type="button" data-library-exercise-edit="${exercise.id}">Editar</button>
            <button class="danger small" type="button" data-library-exercise-delete="${exercise.id}">Eliminar</button>
          </div>
        </div>`;
        }).join('')
      : '<div class="muted">No hay ejercicios en la galería con esos filtros.</div>';

    renderExerciseLibraryOptions();
  }

  function setLibraryMessage(message, tone = 'neutral') {
    if (!els.libraryMessage) {
      return;
    }
    els.libraryMessage.textContent = message;
    els.libraryMessage.classList.toggle('ok', tone === 'ok');
    els.libraryMessage.classList.toggle('bad', tone === 'bad');
    els.libraryMessage.classList.toggle('warn', tone === 'warn');
    els.libraryMessage.classList.toggle('muted', tone === 'neutral');
  }

  function resetLibraryExerciseForm() {
    if (els.libraryExerciseIdInput) {
      els.libraryExerciseIdInput.value = '';
    }
    if (els.libraryExerciseNameInput) {
      els.libraryExerciseNameInput.value = '';
    }
    if (els.libraryExercisePatternSelect) {
      els.libraryExercisePatternSelect.value = 'squat';
    }
    if (els.libraryExercisePrimaryMuscleSelect) {
      els.libraryExercisePrimaryMuscleSelect.value = 'quadriceps';
    }
    if (els.libraryExerciseTechnicalLevelSelect) {
      els.libraryExerciseTechnicalLevelSelect.value = 'beginner';
    }
    if (els.libraryExerciseLoadTypeSelect) {
      els.libraryExerciseLoadTypeSelect.value = 'external_load';
    }
    if (els.libraryExerciseBackDemandSelect) {
      els.libraryExerciseBackDemandSelect.value = '0';
    }
    if (els.libraryExerciseShoulderDemandSelect) {
      els.libraryExerciseShoulderDemandSelect.value = '0';
    }
    if (els.libraryExerciseKneeDemandSelect) {
      els.libraryExerciseKneeDemandSelect.value = '0';
    }
    if (els.libraryExerciseHipDemandSelect) {
      els.libraryExerciseHipDemandSelect.value = '0';
    }
    if (els.libraryExerciseActiveSelect) {
      els.libraryExerciseActiveSelect.value = 'true';
    }
    if (els.libraryExerciseDescriptionInput) {
      els.libraryExerciseDescriptionInput.value = '';
    }
    if (els.libraryExerciseSecondaryMusclesInput) {
      els.libraryExerciseSecondaryMusclesInput.value = '';
    }
    if (els.libraryExerciseEquipmentsInput) {
      els.libraryExerciseEquipmentsInput.value = '';
    }
    if (els.libraryExerciseBaseInput) {
      els.libraryExerciseBaseInput.value = '';
    }
    if (els.libraryExerciseAlternativeGroupInput) {
      els.libraryExerciseAlternativeGroupInput.value = '';
    }
    if (els.libraryRelationTargetInput) {
      els.libraryRelationTargetInput.value = '';
    }
    if (els.libraryRelationTargetIdInput) {
      els.libraryRelationTargetIdInput.value = '';
    }
    if (els.libraryRelationTypeSelect) {
      els.libraryRelationTypeSelect.value = '';
    }
  }

  function editLibraryExercise(exerciseId) {
    const exercise = (Array.isArray(state.exerciseLibrary) ? state.exerciseLibrary : []).find((item) => item.id === exerciseId);
    if (!exercise) {
      return;
    }
    if (els.libraryExerciseIdInput) {
      els.libraryExerciseIdInput.value = exercise.id || '';
    }
    if (els.libraryExerciseNameInput) {
      els.libraryExerciseNameInput.value = exercise.name || '';
    }
    if (els.libraryExercisePatternSelect) {
      els.libraryExercisePatternSelect.value = exercise.pattern || 'squat';
    }
    if (els.libraryExercisePrimaryMuscleSelect) {
      els.libraryExercisePrimaryMuscleSelect.value = exercise.primaryMuscle || 'full_body';
    }
    if (els.libraryExerciseTechnicalLevelSelect) {
      els.libraryExerciseTechnicalLevelSelect.value = exercise.technicalLevel || 'beginner';
    }
    if (els.libraryExerciseLoadTypeSelect) {
      els.libraryExerciseLoadTypeSelect.value = exercise.loadType || 'external_load';
    }
    if (els.libraryExerciseBackDemandSelect) {
      els.libraryExerciseBackDemandSelect.value = String(exercise.jointDemand?.back || 0);
    }
    if (els.libraryExerciseShoulderDemandSelect) {
      els.libraryExerciseShoulderDemandSelect.value = String(exercise.jointDemand?.shoulder || 0);
    }
    if (els.libraryExerciseKneeDemandSelect) {
      els.libraryExerciseKneeDemandSelect.value = String(exercise.jointDemand?.knee || 0);
    }
    if (els.libraryExerciseHipDemandSelect) {
      els.libraryExerciseHipDemandSelect.value = String(exercise.jointDemand?.hip || 0);
    }
    if (els.libraryExerciseActiveSelect) {
      els.libraryExerciseActiveSelect.value = String(exercise.active !== false);
    }
    if (els.libraryExerciseDescriptionInput) {
      els.libraryExerciseDescriptionInput.value = exercise.description || '';
    }
    if (els.libraryExerciseSecondaryMusclesInput) {
      els.libraryExerciseSecondaryMusclesInput.value = Array.isArray(exercise.secondaryMuscles) ? exercise.secondaryMuscles.join(', ') : '';
    }
    if (els.libraryExerciseEquipmentsInput) {
      els.libraryExerciseEquipmentsInput.value = Array.isArray(exercise.equipments) ? exercise.equipments.join(', ') : '';
    }
    if (els.libraryExerciseBaseInput) {
      els.libraryExerciseBaseInput.value = findLibraryExerciseById(exercise.baseExerciseId)?.name || '';
    }
    if (els.libraryExerciseAlternativeGroupInput) {
      els.libraryExerciseAlternativeGroupInput.value = exercise.alternativeGroupId || '';
    }
  }

  function saveLibraryExercise() {
    const name = String(els.libraryExerciseNameInput?.value || '').trim();
    if (!name) {
      setLibraryMessage('Ingresa un nombre para el ejercicio.', 'bad');
      return;
    }

    const existingId = String(els.libraryExerciseIdInput?.value || '').trim();
    const baseTarget = String(els.libraryExerciseBaseInput?.value || '').trim();
    const baseExercise = findLibraryExerciseByName(baseTarget);
    const targetRelationName = String(els.libraryRelationTargetInput?.value || '').trim();
    const relationTarget = findLibraryExerciseByName(targetRelationName);
    const relationType = String(els.libraryRelationTypeSelect?.value || '').trim();

    const normalized = dataApi.normalizeLibraryExercise({
      id: existingId || dataApi.createId('library-exercise'),
      name,
      normalizedName: name,
      description: String(els.libraryExerciseDescriptionInput?.value || '').trim(),
      pattern: String(els.libraryExercisePatternSelect?.value || 'other'),
      primaryMuscle: String(els.libraryExercisePrimaryMuscleSelect?.value || 'full_body'),
      secondaryMuscles: String(els.libraryExerciseSecondaryMusclesInput?.value || '').split(',').map((item) => item.trim()).filter(Boolean),
      equipments: String(els.libraryExerciseEquipmentsInput?.value || '').split(',').map((item) => item.trim()).filter(Boolean),
      technicalLevel: String(els.libraryExerciseTechnicalLevelSelect?.value || 'beginner'),
      loadType: String(els.libraryExerciseLoadTypeSelect?.value || 'external_load'),
      jointDemand: {
        back: Number(els.libraryExerciseBackDemandSelect?.value || 0),
        shoulder: Number(els.libraryExerciseShoulderDemandSelect?.value || 0),
        knee: Number(els.libraryExerciseKneeDemandSelect?.value || 0),
        hip: Number(els.libraryExerciseHipDemandSelect?.value || 0)
      },
      active: String(els.libraryExerciseActiveSelect?.value || 'true') === 'true',
      baseExerciseId: baseExercise?.id || '',
      alternativeGroupId: String(els.libraryExerciseAlternativeGroupInput?.value || '').trim() || (baseExercise ? `group-${baseExercise.id}` : ''),
      relations: relationType && relationTarget ? [{
        relatedExerciseId: relationTarget.id,
        relationType,
        notes: `Relación ${relationType} para ${name}`,
        relatedExerciseName: relationTarget.name
      }] : []
    });

    state.exerciseLibrary = (Array.isArray(state.exerciseLibrary) ? state.exerciseLibrary : []).filter((item) => item.id !== normalized.id);
    state.exerciseLibrary.unshift(normalized);
    persist();
    renderLibraryExerciseList();
    resetLibraryExerciseForm();
    setLibraryMessage('Ejercicio guardado en la biblioteca.', 'ok');
  }

  async function deleteLibraryExerciseById(exerciseId) {
    const library = Array.isArray(state.exerciseLibrary) ? state.exerciseLibrary : [];
    const match = library.find((item) => item.id === exerciseId);
    if (!match) {
      return;
    }

    if (isCloudSessionActive() && cloudDataApi && typeof cloudDataApi.deleteLibraryExercise === 'function') {
      const response = await cloudDataApi.deleteLibraryExercise(exerciseId);
      if (response && response.error) {
        throw new Error(response.error.message || response.error || 'No se pudo eliminar en Cloud');
      }
    }

    state.exerciseLibrary = library.filter((item) => item.id !== exerciseId).map((item) => ({ ...item, active: false }));
    persist();
    renderLibraryExerciseList();
    setLibraryMessage('Ejercicio eliminado de la galería.', 'ok');
  }

  function renderTemplateList() {
    if (!els.templateList) {
      return;
    }
    const templates = (state.trainingsV08.plans || []).map((template, index) => normalizeTrainingPlan(template, index));
    const selectedTemplateId = trainingUi.editingTemplateId;
    const selectedClientId = trainingUi.selectedClientId;
    if (els.sessionTemplateId) {
      els.sessionTemplateId.innerHTML = templates.length
        ? templates.map((template) => `<option value="${template.id}">${escapeHtml(template.name)} · ${template.exercises.length} ejercicios</option>`).join('')
        : '<option value="">No hay plantillas</option>';
      els.sessionTemplateId.disabled = !templates.length;
    }

    els.templateList.innerHTML = templates.length
      ? templates.map((template) => `
        <div class="training-set-item ${template.id === selectedTemplateId ? 'is-active' : ''}">
          <div>
            <strong>${escapeHtml(template.name)}</strong>
            <div class="meta">${template.exercises.length} ejercicios</div>
            <div class="meta">${escapeHtml(template.notes || '')}</div>
          </div>
          <div class="inline-actions">
            <button class="secondary small" type="button" data-template-use="${template.id}">USAR</button>
            <button class="ghost small" type="button" data-template-edit="${template.id}">EDITAR</button>
            <button class="ghost small" type="button" data-template-duplicate="${template.id}">DUPLICAR</button>
            <button class="danger small" type="button" data-template-delete="${template.id}">ELIMINAR</button>
          </div>
        </div>`).join('')
      : '<div class="muted">No hay plantillas guardadas.</div>';

    const template = selectedTemplateId ? getTemplateById(selectedTemplateId) : null;
    renderTemplateExercises(template);

    if (els.templateAssignDateInput && !els.templateAssignDateInput.value) {
      els.templateAssignDateInput.value = getTodayLocalDate();
    }
    if (els.assignTemplateBtn) {
      const canAssign = Boolean(template && selectedClientId);
      els.assignTemplateBtn.disabled = !canAssign;
    }
  }

  function loadTemplateIntoForm(templateId) {
    const template = getTemplateById(templateId);
    if (!template) {
      return;
    }
    trainingUi.editingTemplateId = template.id;
    if (els.templateIdInput) {
      els.templateIdInput.value = template.id;
    }
    if (els.templateNameInput) {
      els.templateNameInput.value = template.name || '';
    }
    if (els.templateNotesInput) {
      els.templateNotesInput.value = template.notes || '';
    }
    clearTemplateExerciseForm();
    setTemplateMessage(`Editando plantilla: ${template.name}`, 'neutral');
  }

  async function saveTemplate() {
    const name = String(els.templateNameInput?.value || '').trim();
    if (!name) {
      setTemplateMessage('Ingresa un nombre para la plantilla.', 'bad');
      return;
    }

    const baseTemplate = trainingUi.editingTemplateId ? getTemplateById(trainingUi.editingTemplateId) : null;
    const template = buildTemplatePayload(baseTemplate);
    const templates = (state.trainingsV08.plans || []).filter((item) => item.id !== template.id);
    templates.unshift(template);
    state.trainingsV08.plans = templates;

    if (isCloudSessionActive()) {
      const cloudResult = await persistTemplateToCloud(template);
      if (!cloudResult.ok) {
        setTemplateMessage(cloudResult.error || 'No se pudo guardar plantilla en Cloud.', 'bad');
        return;
      }
      await refreshTrainingsV08FromCloud();
    } else {
      persist();
    }

    trainingUi.editingTemplateId = template.id;
    if (els.templateIdInput) {
      els.templateIdInput.value = template.id;
    }
    setTemplateMessage('Plantilla guardada correctamente.', 'ok');
    renderTemplateList();
  }

  async function saveTemplateExercise() {
    if (!trainingUi.editingTemplateId) {
      setTemplateMessage('Primero selecciona o crea una plantilla.', 'warn');
      return;
    }
    const template = getTemplateById(trainingUi.editingTemplateId);
    if (!template) {
      setTemplateMessage('Plantilla no encontrada.', 'bad');
      return;
    }

    const exerciseName = String(els.templateExerciseNameInput?.value || '').trim();
    if (!exerciseName) {
      setTemplateMessage('Ingresa nombre del ejercicio.', 'bad');
      return;
    }

    const exerciseId = String(els.templateExerciseIdInput?.value || trainingUi.editingTemplateExerciseId || '').trim();
    const plannedSets = Math.max(1, Number(els.templateExerciseSetsInput?.value || 1));
    const plannedRepMin = Math.max(1, Number(els.templateExerciseRepMinInput?.value || 1));
    const plannedRepMax = Math.max(plannedRepMin, Number(els.templateExerciseRepMaxInput?.value || plannedRepMin));
    const targetWeight = Math.max(0, Number(els.templateExerciseWeightInput?.value || 0));
    const restSeconds = Math.max(1, Number(els.templateExerciseRestInput?.value || 90));
    const coachNotes = String(els.templateExerciseNotesInput?.value || '').trim();

    const exercises = normalizeTemplateExercises(template.exercises || []);
    const existing = exerciseId ? exercises.find((item) => item.id === exerciseId) : null;
    if (existing) {
      existing.exerciseName = exerciseName;
      existing.plannedSets = plannedSets;
      existing.plannedRepMin = plannedRepMin;
      existing.plannedRepMax = plannedRepMax;
      existing.targetWeight = targetWeight;
      existing.restSeconds = restSeconds;
      existing.coachNotes = coachNotes;
    } else {
      exercises.push(createTemplateExerciseFromSource({
        id: dataApi.createId('tpl-exercise'),
        exerciseName,
        plannedSets,
        plannedRepMin,
        plannedRepMax,
        targetWeight,
        restSeconds,
        coachNotes,
        order: exercises.length + 1
      }, exercises.length));
    }

    template.exercises = normalizeTemplateExercises(exercises);
    clearTemplateExerciseForm();

    if (isCloudSessionActive()) {
      const cloudResult = await persistTemplateToCloud(template);
      if (!cloudResult.ok) {
        setTemplateMessage(cloudResult.error || 'No se pudo sincronizar ejercicio de plantilla.', 'bad');
        return;
      }
    }

    if (!isCloudSessionActive()) {
      persist();
    } else {
      render();
    }
    setTemplateMessage('Ejercicio de plantilla guardado.', 'ok');
    renderTemplateList();
  }

  async function assignTemplateToSelectedClient(templateId) {
    const clientId = trainingUi.selectedClientId || '';
    if (!clientId) {
      setTemplateMessage('Selecciona un cliente activo para asignar plantilla.', 'warn');
      return;
    }
    const template = getTemplateById(templateId || trainingUi.editingTemplateId);
    if (!template) {
      setTemplateMessage('Selecciona una plantilla para asignar.', 'warn');
      return;
    }

    const date = els.templateAssignDateInput?.value || els.routineDate?.value || getTodayLocalDate();
    const session = cloneSessionFromTemplate(template, clientId, date);
    state.trainingsV08.sessions.push(session);
    setActiveSessionForClient(clientId, session.id);

    if (isCloudSessionActive()) {
      const syncResult = await syncSessionToCloud(session);
      if (!syncResult.ok) {
        setTemplateMessage(syncResult.error || 'No se pudo crear sesión desde plantilla en Cloud.', 'bad');
        return;
      }
      await refreshTrainingsV08FromCloud();
      setTemplateMessage('Plantilla asignada. Sesión creada en Cloud.', 'ok');
      return;
    }

    persist();
    setTemplateMessage('Plantilla asignada. Sesión creada.', 'ok');
  }

  async function duplicateSessionForSelectedClient() {
    const sourceSession = getCurrentTrainingSession();
    if (!sourceSession) {
      if (els.routineMessage) {
        els.routineMessage.textContent = 'Selecciona una sesión para duplicar.';
      }
      return;
    }
    const duplicateDate = els.routineDate?.value || getTodayLocalDate();
    const copy = cloneSessionPlanning(sourceSession, duplicateDate);
    state.trainingsV08.sessions.push(copy);
    setActiveSessionForClient(sourceSession.clientId, copy.id);

    if (isCloudSessionActive()) {
      const syncResult = await syncSessionToCloud(copy);
      if (!syncResult.ok) {
        if (els.routineMessage) {
          els.routineMessage.textContent = syncResult.error || 'No se pudo duplicar sesión en Cloud.';
        }
        return;
      }
      if (els.routineMessage) {
        els.routineMessage.textContent = 'Sesión duplicada y sincronizada en Cloud.';
      }
      renderTrainings();
      return;
    }

    if (els.routineMessage) {
      els.routineMessage.textContent = 'Sesión duplicada.';
    }
    persist();
  }

  async function saveCurrentSessionAsTemplate() {
    const session = getCurrentTrainingSession();
    if (!session) {
      if (els.routineMessage) {
        els.routineMessage.textContent = 'Selecciona una sesión para guardar como plantilla.';
      }
      return;
    }

    const suggestedName = String(session.title || '').trim() || 'Plantilla de entrenamiento';
    const templateName = window.prompt('Nombre de la plantilla', suggestedName);
    if (!templateName) {
      return;
    }

    const template = normalizeTrainingPlan({
      id: dataApi.createId('tx-plan'),
      clientId: session.clientId,
      name: templateName,
      notes: session.notes || '',
      active: true,
      exercises: getSessionExercises(session).map((exercise, index) => createTemplateExerciseFromSource(exercise, index))
    });

    state.trainingsV08.plans = [template, ...(state.trainingsV08.plans || [])];

    if (isCloudSessionActive()) {
      const cloudResult = await persistTemplateToCloud(template);
      if (!cloudResult.ok) {
        if (els.routineMessage) {
          els.routineMessage.textContent = cloudResult.error || 'No se pudo guardar plantilla en Cloud.';
        }
        return;
      }
      await refreshTrainingsV08FromCloud();
    } else {
      persist();
    }

    loadTemplateIntoForm(template.id);
    renderTemplateList();
    if (els.routineMessage) {
      els.routineMessage.textContent = 'Sesión guardada como plantilla.';
    }
  }

  function editTemplateExercise(exerciseId) {
    const template = getTemplateById(trainingUi.editingTemplateId);
    if (!template) {
      return;
    }
    const exercise = normalizeTemplateExercises(template.exercises || []).find((item) => item.id === exerciseId);
    if (!exercise) {
      return;
    }
    trainingUi.editingTemplateExerciseId = exercise.id;
    if (els.templateExerciseIdInput) {
      els.templateExerciseIdInput.value = exercise.id;
    }
    if (els.templateExerciseNameInput) {
      els.templateExerciseNameInput.value = exercise.exerciseName;
    }
    if (els.templateExerciseNotesInput) {
      els.templateExerciseNotesInput.value = exercise.coachNotes || '';
    }
    if (els.templateExerciseSetsInput) {
      els.templateExerciseSetsInput.value = String(exercise.plannedSets);
    }
    if (els.templateExerciseRepMinInput) {
      els.templateExerciseRepMinInput.value = String(exercise.plannedRepMin);
    }
    if (els.templateExerciseRepMaxInput) {
      els.templateExerciseRepMaxInput.value = String(exercise.plannedRepMax);
    }
    if (els.templateExerciseWeightInput) {
      els.templateExerciseWeightInput.value = String(exercise.targetWeight || 0);
    }
    if (els.templateExerciseRestInput) {
      els.templateExerciseRestInput.value = String(exercise.restSeconds);
    }
  }

  async function moveTemplateExercise(exerciseId, direction) {
    const template = getTemplateById(trainingUi.editingTemplateId);
    if (!template) {
      return;
    }
    const exercises = normalizeTemplateExercises(template.exercises || []);
    const currentIndex = exercises.findIndex((item) => item.id === exerciseId);
    if (currentIndex < 0) {
      return;
    }
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= exercises.length) {
      return;
    }
    const [item] = exercises.splice(currentIndex, 1);
    exercises.splice(nextIndex, 0, item);
    template.exercises = normalizeTemplateExercises(exercises);

    if (isCloudSessionActive()) {
      const cloudResult = await persistTemplateToCloud(template);
      if (!cloudResult.ok) {
        setTemplateMessage(cloudResult.error || 'No se pudo ordenar la plantilla en Cloud.', 'bad');
        return;
      }
    }

    if (!isCloudSessionActive()) {
      persist();
    } else {
      render();
    }
    renderTemplateList();
  }

  async function deleteTemplateExercise(exerciseId) {
    const template = getTemplateById(trainingUi.editingTemplateId);
    if (!template) {
      return;
    }
    template.exercises = normalizeTemplateExercises(template.exercises || []).filter((item) => item.id !== exerciseId);
    clearTemplateExerciseForm();

    if (isCloudSessionActive()) {
      const cloudResult = await persistTemplateToCloud(template);
      if (!cloudResult.ok) {
        setTemplateMessage(cloudResult.error || 'No se pudo eliminar ejercicio en Cloud.', 'bad');
        return;
      }
    }

    if (!isCloudSessionActive()) {
      persist();
    } else {
      render();
    }
    renderTemplateList();
  }

  async function duplicateTemplate(templateId) {
    const source = getTemplateById(templateId);
    if (!source) {
      return;
    }
    const copy = normalizeTrainingPlan({
      id: dataApi.createId('tx-plan'),
      clientId: trainingUi.selectedClientId || source.clientId,
      name: `${source.name} copia`,
      notes: source.notes,
      active: source.active,
      exercises: normalizeTemplateExercises(source.exercises || []).map((exercise, index) => ({
        ...exercise,
        id: dataApi.createId('tpl-exercise'),
        order: index + 1
      }))
    });
    state.trainingsV08.plans = [copy, ...(state.trainingsV08.plans || [])];

    if (isCloudSessionActive()) {
      const cloudResult = await persistTemplateToCloud(copy);
      if (!cloudResult.ok) {
        setTemplateMessage(cloudResult.error || 'No se pudo duplicar plantilla en Cloud.', 'bad');
        return;
      }
      await refreshTrainingsV08FromCloud();
    } else {
      persist();
    }

    loadTemplateIntoForm(copy.id);
    renderTemplateList();
  }

  async function deleteTemplate(templateId) {
    state.trainingsV08.plans = (state.trainingsV08.plans || []).filter((template) => template.id !== templateId);
    if (trainingUi.editingTemplateId === templateId) {
      resetTemplateDraft();
    }

    if (isCloudSessionActive()) {
      const cloudResult = await removeTemplateFromCloud(templateId);
      if (!cloudResult.ok) {
        setTemplateMessage(cloudResult.error || 'No se pudo eliminar plantilla en Cloud.', 'bad');
        return;
      }
      await refreshTrainingsV08FromCloud();
    } else {
      persist();
    }

    setTemplateMessage('Plantilla eliminada.', 'ok');
    renderTemplateList();
  }

  function sortSessionsByDateAsc(sessions) {
    return sessions.slice().sort((a, b) => {
      const timeA = new Date(`${a.date || '1970-01-01'}T00:00:00`).getTime();
      const timeB = new Date(`${b.date || '1970-01-01'}T00:00:00`).getTime();
      return timeA - timeB;
    });
  }

  function getSessionExercises(session) {
    return Array.isArray(session?.exercises) ? session.exercises : [];
  }

  function getTrainingExercisesByClientExercise(clientId, exerciseName, options = {}) {
    const normalizedExercise = String(exerciseName || '').trim().toLowerCase();
    if (!normalizedExercise) {
      return [];
    }

    const ignoreSessionId = options.ignoreSessionId || '';
    const sessions = sortSessionsByDateAsc(getTrainingSessionsByClient(clientId));
    const matches = [];
    sessions.forEach((session) => {
      if (ignoreSessionId && session.id === ignoreSessionId) {
        return;
      }
      getSessionExercises(session).forEach((exercise) => {
        const currentName = String(exercise.exerciseName || '').trim().toLowerCase();
        if (currentName === normalizedExercise) {
          matches.push({ session, exercise });
        }
      });
    });
    return matches;
  }

  function getExerciseOptionsForClient(clientId) {
    const sessions = getTrainingSessionsByClient(clientId);
    const unique = new Map();
    sessions.forEach((session) => {
      getSessionExercises(session).forEach((exercise) => {
        const key = String(exercise.exerciseName || '').trim().toLowerCase();
        if (!key) {
          return;
        }
        if (!unique.has(key)) {
          unique.set(key, exercise.exerciseName);
        }
      });
    });
    return Array.from(unique.values());
  }

  function getExerciseSets(exercise) {
    return Array.isArray(exercise?.sets) ? exercise.sets : [];
  }

  function getSetType(setEntry) {
    const rawType = String(setEntry?.setType || setEntry?.set_type || 'S').trim().toUpperCase();
    if (rawType === 'A' || rawType === 'T' || rawType === 'S') {
      return rawType;
    }
    return 'S';
  }

  function isEffectiveSet(setEntry) {
    const reps = Number(setEntry?.reps || 0);
    return setEntry?.completed !== false && getSetType(setEntry) === 'S' && Number.isFinite(reps) && reps > 0;
  }

  function getEffectiveExerciseSets(exercise) {
    return getExerciseSets(exercise)
      .filter((setEntry) => isEffectiveSet(setEntry))
      .sort((a, b) => Number(a.setNumber || 0) - Number(b.setNumber || 0));
  }

  function summarizeExecutionWeight(execution) {
    if (!execution || !execution.sets.length) {
      return 'Sin registro';
    }
    const uniqueWeights = Array.from(new Set(execution.sets
      .map((setEntry) => Number(setEntry.weight || 0))
      .filter((weight) => Number.isFinite(weight) && weight >= 0)));
    if (!uniqueWeights.length) {
      return 'Sin registro';
    }
    if (uniqueWeights.length === 1) {
      return `${uniqueWeights[0]} kg`;
    }
    return `${uniqueWeights[0]}-${uniqueWeights[uniqueWeights.length - 1]} kg`;
  }

  function summarizeExecutionReps(execution) {
    if (!execution || !execution.sets.length) {
      return 'Sin registro';
    }
    return execution.sets.map((setEntry) => `${Number(setEntry.reps || 0)}`).join('/');
  }

  function buildExecutionSnapshot(exercise) {
    const sets = getEffectiveExerciseSets(exercise);
    const totalReps = sets.reduce((sum, setEntry) => sum + Number(setEntry.reps || 0), 0);
    const averageWeight = sets.length
      ? sets.reduce((sum, setEntry) => sum + Number(setEntry.weight || 0), 0) / sets.length
      : 0;
    return {
      sets,
      totalReps,
      averageWeight
    };
  }

  function getLastValidExerciseExecution(clientId, exerciseName, options = {}) {
    const matches = getTrainingExercisesByClientExercise(clientId, exerciseName, options);
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const candidate = matches[index];
      const snapshot = buildExecutionSnapshot(candidate.exercise);
      if (snapshot.sets.length) {
        return {
          session: candidate.session,
          exercise: candidate.exercise,
          snapshot
        };
      }
    }
    return null;
  }

  function compareExerciseSnapshots(previousSnapshot, currentSnapshot) {
    if (!previousSnapshot || !previousSnapshot.sets.length || !currentSnapshot || !currentSnapshot.sets.length) {
      return {
        status: 'no_data',
        headline: 'Sin comparación previa'
      };
    }

    const previousBySetNumber = new Map(previousSnapshot.sets.map((setEntry) => [Number(setEntry.setNumber || 0), setEntry]));
    const comparablePairs = currentSnapshot.sets
      .map((currentSet) => {
        const previousSet = previousBySetNumber.get(Number(currentSet.setNumber || 0));
        return previousSet ? { previousSet, currentSet } : null;
      })
      .filter(Boolean);

    const previousTotalReps = Number(previousSnapshot.totalReps || 0);
    const currentTotalReps = Number(currentSnapshot.totalReps || 0);
    const totalRepsImproved = currentTotalReps > previousTotalReps;
    const totalRepsWorse = currentTotalReps < previousTotalReps;

    const previousAverageWeight = Number(previousSnapshot.averageWeight || 0);
    const currentAverageWeight = Number(currentSnapshot.averageWeight || 0);
    const loadImproved = currentAverageWeight > previousAverageWeight;
    const loadWorse = currentAverageWeight < previousAverageWeight;

    const setRepsImproved = comparablePairs.length > 0
      && comparablePairs.every(({ currentSet, previousSet }) => Number(currentSet.reps || 0) >= Number(previousSet.reps || 0))
      && comparablePairs.some(({ currentSet, previousSet }) => Number(currentSet.reps || 0) > Number(previousSet.reps || 0));

    if ((loadImproved && !totalRepsWorse) || (!loadWorse && (totalRepsImproved || setRepsImproved))) {
      return {
        status: 'improved',
        headline: 'Mejora de rendimiento'
      };
    }

    if (loadWorse && !totalRepsImproved) {
      return {
        status: 'worse',
        headline: 'Rendimiento por debajo de la sesión anterior'
      };
    }

    return {
      status: 'stable',
      headline: 'Rendimiento estable respecto a la sesión anterior'
    };
  }

  function buildProgressionSuggestion(exercise, currentSnapshot) {
    const minReps = Math.max(1, Number(exercise?.plannedRepMin || 1));
    const maxReps = Math.max(minReps, Number(exercise?.plannedRepMax || minReps));
    const sets = currentSnapshot?.sets || [];
    if (!sets.length) {
      return null;
    }

    const anyBelowMin = sets.some((setEntry) => Number(setEntry.reps || 0) < minReps);
    const allAtOrAboveMax = sets.every((setEntry) => Number(setEntry.reps || 0) >= maxReps);

    if (anyBelowMin) {
      return {
        code: 'OBSERVAR',
        badge: '⚠ OBSERVAR',
        message: 'Rendimiento por debajo del objetivo. No aumentar carga automáticamente.'
      };
    }

    if (allAtOrAboveMax) {
      return {
        code: 'PROGRESAR',
        badge: '↑ PROGRESAR',
        message: 'Sugerencia: aumentar ligeramente la carga en la próxima sesión.'
      };
    }

    return {
      code: 'MANTENER',
      badge: '= MANTENER',
      message: 'Sugerencia: mantener la carga e intentar aumentar repeticiones.'
    };
  }

  function getExerciseCompletionFeedback(clientId, exercise, currentSessionId) {
    const currentSnapshot = buildExecutionSnapshot(exercise);
    if (!currentSnapshot.sets.length) {
      return null;
    }

    const previousExecution = getLastValidExerciseExecution(clientId, exercise.exerciseName, {
      ignoreSessionId: currentSessionId
    });
    const previousSnapshot = previousExecution?.snapshot || null;
    const comparison = compareExerciseSnapshots(previousSnapshot, currentSnapshot);
    const suggestion = buildProgressionSuggestion(exercise, currentSnapshot);

    return {
      comparison,
      suggestion,
      previousExecution,
      currentSnapshot
    };
  }

  function getBestWeightForExercise(clientId, exerciseName, options = {}) {
    const matches = getTrainingExercisesByClientExercise(clientId, exerciseName, options);
    const weights = [];
    matches.forEach(({ exercise }) => {
      getExerciseSets(exercise).forEach((setEntry) => {
        const weight = Number(setEntry.weight || 0);
        if (Number.isFinite(weight) && weight > 0) {
          weights.push(weight);
        }
      });
    });
    return weights.length ? Math.max(...weights) : 0;
  }

  function buildLastSessionSummary(clientId, exerciseName, options = {}) {
    if (!clientId || !exerciseName) {
      return 'Sin registro anterior';
    }

    const previousExecution = getLastValidExerciseExecution(clientId, exerciseName, options);
    if (!previousExecution) {
      return 'Sin registro anterior';
    }

    const weightLabel = summarizeExecutionWeight(previousExecution.snapshot);
    const repsLabel = summarizeExecutionReps(previousExecution.snapshot);
    return `Última: ${weightLabel} · ${repsLabel}`;
  }

  function buildProgressSummary(clientId, exerciseName) {
    if (!clientId || !exerciseName) {
      return '<div class="muted">Sin registro anterior</div>';
    }
    const matches = getTrainingExercisesByClientExercise(clientId, exerciseName);
    if (!matches.length) {
      return '<div class="muted">Sin registro anterior</div>';
    }

    const last = matches[matches.length - 1];
    const first = matches[0];
    const lastSet = getExerciseSets(last.exercise)[getExerciseSets(last.exercise).length - 1] || null;
    const firstSet = getExerciseSets(first.exercise)[0] || null;
    const bestWeight = getBestWeightForExercise(clientId, exerciseName);
    const completedSets = getExerciseSets(last.exercise).filter((setEntry) => setEntry.completed !== false).length;
    const plannedSets = Number(last.exercise.plannedSets || 0);

    return `
      <div class="training-progress-grid">
        <div><strong>Último registro</strong><div class="meta">${lastSet ? `${Number(lastSet.weight || 0)} kg × ${Number(lastSet.reps || 0)}` : 'Sin registro'}</div></div>
        <div><strong>Mejor peso histórico</strong><div class="meta">${bestWeight > 0 ? `${bestWeight} kg` : 'Sin registro'}</div></div>
        <div><strong>Primer registro</strong><div class="meta">${firstSet ? `${Number(firstSet.weight || 0)} kg × ${Number(firstSet.reps || 0)}` : 'Sin registro'}</div></div>
        <div><strong>Fecha última sesión</strong><div class="meta">${last.session.date ? escapeHtml(formatClientDate(last.session.date)) : 'Sin fecha'}</div></div>
        <div><strong>Series completadas</strong><div class="meta">${completedSets}${plannedSets ? ` de ${plannedSets}` : ''}</div></div>
      </div>`;
  }

  function findSessionById(sessionId) {
    ensureTrainingsV08State();
    return (state.trainingsV08.sessions || []).find((session) => session.id === sessionId) || null;
  }

  function findExerciseInSession(session, exerciseId) {
    return getSessionExercises(session).find((exercise) => exercise.id === exerciseId) || null;
  }

  function getCurrentTrainingSession() {
    return findSessionById(trainingUi.activeSessionId);
  }

  function getCurrentTrainingExercise() {
    const session = getCurrentTrainingSession();
    if (!session) {
      return null;
    }
    return findExerciseInSession(session, trainingUi.activeExerciseId);
  }

  function stopStudentRestTimer() {
    if (studentUi.restTimerId) {
      clearInterval(studentUi.restTimerId);
      studentUi.restTimerId = null;
    }
    studentUi.restRunning = false;
  }

  function getClientById(clientId) {
    return (state.clients || []).find((client) => client.id === clientId) || null;
  }

  function getStudentSessionForClient(clientId) {
    const sessions = sortSessionsByDateAsc(getTrainingSessionsByClient(clientId));
    if (!sessions.length) {
      return null;
    }
    const today = getTodayLocalDate();
    const todaySession = sessions.find((session) => session.date === today && session.status !== 'completed') || null;
    if (todaySession) {
      return todaySession;
    }
    const nextUpcoming = sessions.find((session) => session.date && session.date > today && session.status !== 'completed') || null;
    if (nextUpcoming) {
      return nextUpcoming;
    }
    const inProgress = sessions.find((session) => session.status === 'in_progress') || null;
    if (inProgress) {
      return inProgress;
    }
    return sessions[sessions.length - 1] || null;
  }

  function enterStudentMode(clientId) {
    const client = getClientById(clientId);
    if (!client || client.client_status !== 'active' || client.active === false) {
      setClientNotice('La vista alumno solo está disponible para clientes activos.', 'warn');
      return;
    }

    const session = getStudentSessionForClient(clientId);
    if (!session) {
      setClientNotice('Este cliente no tiene sesiones planificadas para entrenar.', 'warn');
      return;
    }
    studentUi.enabled = true;
    studentUi.clientId = clientId;
    studentUi.sessionId = session.id;
    studentUi.exerciseIndex = 0;
    studentUi.editingSetNumber = null;
    studentUi.restRemaining = 0;
    studentUi.startedAt = new Date().toISOString();
    stopStudentRestTimer();
    show('studentTraining');
  }

  function exitStudentMode() {
    stopStudentRestTimer();
    studentUi.enabled = false;
    studentUi.clientId = '';
    studentUi.sessionId = '';
    studentUi.exerciseIndex = 0;
    studentUi.editingSetNumber = null;
    studentUi.restRemaining = 0;
    studentUi.startedAt = null;
    show('trainings');
  }

  function getStudentSession() {
    if (!studentUi.sessionId) {
      return null;
    }
    return findSessionById(studentUi.sessionId);
  }

  function getStudentExercises() {
    const session = getStudentSession();
    return session ? getSessionExercises(session) : [];
  }

  function getStudentExercise() {
    const exercises = getStudentExercises();
    if (!exercises.length) {
      return null;
    }
    const safeIndex = Math.max(0, Math.min(studentUi.exerciseIndex, exercises.length - 1));
    studentUi.exerciseIndex = safeIndex;
    return exercises[safeIndex];
  }

  function isExerciseCompleted(exercise) {
    const plannedSets = Number(exercise?.plannedSets || 0);
    const doneSets = getExerciseSets(exercise).filter((setEntry) => setEntry.completed !== false).length;
    return plannedSets > 0 && doneSets >= plannedSets;
  }

  function getPreviousExerciseMetrics(clientId, exerciseName, currentSessionId) {
    const previousExecution = getLastValidExerciseExecution(clientId, exerciseName, { ignoreSessionId: currentSessionId });
    if (!previousExecution) {
      return {
        hasHistory: false,
        label: 'Sin registro anterior',
        lastWeight: 'Sin registro',
        lastReps: 'Sin registro',
        bestWeight: 'Sin registro'
      };
    }

    const bestWeight = getBestWeightForExercise(clientId, exerciseName, { ignoreSessionId: currentSessionId });
    return {
      hasHistory: true,
      label: buildLastSessionSummary(clientId, exerciseName, { ignoreSessionId: currentSessionId }),
      lastWeight: summarizeExecutionWeight(previousExecution.snapshot),
      lastReps: summarizeExecutionReps(previousExecution.snapshot),
      bestWeight: bestWeight > 0 ? `${bestWeight} kg` : 'Sin registro'
    };
  }

  function getStudentSessionStats(session) {
    const exercises = getSessionExercises(session);
    const completedExercises = exercises.filter((exercise) => isExerciseCompleted(exercise)).length;
    const totalSets = exercises.reduce((sum, exercise) => sum + getExerciseSets(exercise).length, 0);
    const potentialRecords = exercises.reduce((sum, exercise) => sum + getExerciseSets(exercise).filter((setEntry) => setEntry.personalRecord).length, 0);
    const estimatedDurationMinutes = Math.max(1, Math.round(exercises.reduce((sum, exercise) => {
      const planned = Number(exercise.plannedSets || 0);
      const rest = Number(exercise.restSeconds || 0);
      return sum + (planned * (rest + 45));
    }, 0) / 60));
    return {
      completedExercises,
      totalExercises: exercises.length,
      totalSets,
      potentialRecords,
      estimatedDurationMinutes
    };
  }

  function notifyRestFinished() {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([150, 80, 150]);
    }
    try {
      if (typeof window !== 'undefined' && typeof window.AudioContext === 'function') {
        const context = new window.AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gain.gain.value = 0.04;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.2);
      }
    } catch (_) {
      // Silent fallback when audio is not available.
    }
  }

  function startStudentRest() {
    const exercise = getStudentExercise();
    const restSeconds = Number(exercise?.restSeconds || 0);
    if (!restSeconds) {
      return;
    }
    stopStudentRestTimer();
    studentUi.restRemaining = restSeconds;
    studentUi.restRunning = true;
    studentUi.restTimerId = setInterval(() => {
      studentUi.restRemaining = Math.max(0, studentUi.restRemaining - 1);
      if (studentUi.restRemaining <= 0) {
        stopStudentRestTimer();
        notifyRestFinished();
      }
      renderStudentTraining();
    }, 1000);
    renderStudentTraining();
  }

  async function saveStudentSetEntry() {
    const session = getStudentSession();
    const exercise = getStudentExercise();
    if (!session || !exercise) {
      if (els.studentSetNotice) {
        els.studentSetNotice.textContent = 'No hay ejercicio activo para registrar.';
      }
      return;
    }

    if (session.status === 'planned') {
      session.status = 'in_progress';
    }

    const weight = Number(els.studentWeightInput?.value || 0);
    const reps = Number(els.studentRepsInput?.value || 0);
    const completed = els.studentSetCompleted ? els.studentSetCompleted.checked : true;
    if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(reps) || reps < 0) {
      if (els.studentSetNotice) {
        els.studentSetNotice.textContent = 'Ingresa valores válidos.';
      }
      return;
    }

    const sets = getExerciseSets(exercise);
    const requestedSetNumber = Number(els.studentEditingSetNumber?.value || studentUi.editingSetNumber || 0);
    const plannedSets = Math.max(1, Number(exercise.plannedSets || 1));
    if (!requestedSetNumber && sets.length >= plannedSets) {
      if (els.studentSetNotice) {
        els.studentSetNotice.textContent = 'Ejercicio completado. Usa Siguiente ejercicio o corrige una serie.';
      }
      return;
    }
    const nextSetNumber = requestedSetNumber || (sets.length + 1);
    const previousBestWeight = getBestWeightForExercise(session.clientId, exercise.exerciseName, { ignoreSessionId: session.id });
    const isPotentialRecord = weight > previousBestWeight && weight > 0;

    const existingSet = sets.find((setEntry) => Number(setEntry.setNumber || 0) === Number(nextSetNumber));
    if (existingSet) {
      existingSet.weight = weight;
      existingSet.reps = reps;
      existingSet.completed = completed;
      existingSet.personalRecord = isPotentialRecord;
      existingSet.setType = getSetType(existingSet);
      existingSet.techniqueStatus = existingSet.techniqueStatus || 'pending';
      existingSet.coachValidated = Boolean(existingSet.coachValidated);
    } else {
      sets.push({
        setNumber: nextSetNumber,
        weight,
        reps,
        completed,
        setType: 'S',
        createdAt: new Date().toISOString(),
        techniqueStatus: 'pending',
        coachValidated: false,
        personalRecord: isPotentialRecord
      });
    }
    sets.sort((a, b) => Number(a.setNumber || 0) - Number(b.setNumber || 0));

    studentUi.editingSetNumber = null;
    if (els.studentEditingSetNumber) {
      els.studentEditingSetNumber.value = '';
    }
    if (els.studentRepsInput) {
      els.studentRepsInput.value = '';
    }
    if (els.studentSetNotice) {
      els.studentSetNotice.textContent = isPotentialRecord ? '🏆 Posible nuevo récord' : 'Serie guardada. Inicia descanso.';
    }

    const doneSets = sets.filter((setEntry) => setEntry.completed !== false).length;
    const exerciseCompleted = plannedSets > 0 && doneSets >= plannedSets;
    const completionFeedback = exerciseCompleted ? getExerciseCompletionFeedback(session.clientId, exercise, session.id) : null;
    if (exerciseCompleted && completionFeedback?.suggestion && els.studentSetNotice) {
      const comparisonText = completionFeedback.comparison?.status !== 'no_data'
        ? ` ${completionFeedback.comparison.headline}.`
        : '';
      els.studentSetNotice.textContent = `${completionFeedback.suggestion.badge}. ${completionFeedback.suggestion.message}${comparisonText}`;
    }
    if (doneSets < plannedSets && !els.studentWeightInput?.value) {
      els.studentWeightInput.value = String(Number(exercise.targetWeight || 0));
    }

    if (isCloudSessionActive()) {
      const syncResult = await syncSessionToCloud(session);
      if (!syncResult.ok) {
        if (els.studentSetNotice) {
          els.studentSetNotice.textContent = syncResult.error || 'No se pudo sincronizar la serie en Cloud.';
        }
        return;
      }
      renderStudentTraining();
      return;
    }

    persist();
  }

  async function goToNextStudentExercise() {
    const exercises = getStudentExercises();
    if (!exercises.length) {
      return;
    }
    if (studentUi.exerciseIndex < exercises.length - 1) {
      studentUi.exerciseIndex += 1;
      studentUi.editingSetNumber = null;
      if (els.studentEditingSetNumber) {
        els.studentEditingSetNumber.value = '';
      }
      if (els.studentSetNotice) {
        els.studentSetNotice.textContent = '';
      }
      renderStudentTraining();
      return;
    }

    const session = getStudentSession();
    if (session) {
      session.status = 'completed';
    }

    if (isCloudSessionActive() && session) {
      const syncResult = await syncSessionToCloud(session);
      if (!syncResult.ok) {
        if (els.studentSetNotice) {
          els.studentSetNotice.textContent = syncResult.error || 'No se pudo completar la sesión en Cloud.';
        }
        return;
      }
      renderStudentTraining();
      return;
    }

    persist();
  }

  async function finalizeStudentSession() {
    const session = getStudentSession();
    if (session) {
      session.status = 'completed';
    }
    stopStudentRestTimer();

    if (isCloudSessionActive() && session) {
      const syncResult = await syncSessionToCloud(session);
      if (!syncResult.ok) {
        if (els.studentSetNotice) {
          els.studentSetNotice.textContent = syncResult.error || 'No se pudo finalizar en Cloud.';
        }
        return;
      }
      renderStudentTraining();
    } else {
      persist();
    }

    exitStudentMode();
  }

  function renderStudentTraining() {
    if (!els.sections.studentTraining) {
      return;
    }

    const client = getClientById(studentUi.clientId);
    const session = getStudentSession();
    const exercises = getStudentExercises();
    const exercise = getStudentExercise();

    if (!studentUi.enabled || !client || !session || !exercise) {
      if (els.studentName) {
        els.studentName.textContent = 'Sin sesión activa';
      }
      return;
    }

    const metrics = getPreviousExerciseMetrics(client.id, exercise.exerciseName, session.id);
    const sets = getExerciseSets(exercise);
    const doneSets = sets.filter((setEntry) => setEntry.completed !== false).length;
    const plannedSets = Number(exercise.plannedSets || 0);
    const progressText = `Ejercicio ${studentUi.exerciseIndex + 1} de ${Math.max(1, exercises.length)}`;
    const sessionStats = getStudentSessionStats(session);
    const progressPercent = sessionStats.totalExercises > 0
      ? Math.round((sessionStats.completedExercises / sessionStats.totalExercises) * 100)
      : 0;

    if (els.studentName) {
      els.studentName.textContent = getClientDisplayName(client);
    }
    if (els.studentSessionTitle) {
      els.studentSessionTitle.textContent = session.title || 'Sesión de hoy';
    }
    if (els.studentSessionDate) {
      els.studentSessionDate.textContent = formatClientDate(session.date || getTodayLocalDate());
    }
    if (els.studentExerciseProgress) {
      els.studentExerciseProgress.textContent = progressText;
    }
    if (els.studentSessionProgressBar) {
      els.studentSessionProgressBar.style.width = `${progressPercent}%`;
    }
    if (els.studentSessionProgressText) {
      els.studentSessionProgressText.textContent = `${progressPercent}% completado`;
    }

    if (els.studentExerciseName) {
      els.studentExerciseName.textContent = exercise.exerciseName;
    }
    if (els.studentExercisePlan) {
      els.studentExercisePlan.textContent = `${plannedSets} series · ${Number(exercise.plannedRepMin || 0)}-${Number(exercise.plannedRepMax || 0)} repeticiones`;
    }
    if (els.studentExerciseTarget) {
      els.studentExerciseTarget.textContent = Number(exercise.targetWeight || 0) > 0
        ? `Peso objetivo ${Number(exercise.targetWeight || 0)} kg`
        : 'Sin peso objetivo definido';
    }
    if (els.studentExerciseRest) {
      els.studentExerciseRest.textContent = `Descanso ${Number(exercise.restSeconds || 0)} s`;
    }
    if (els.studentExerciseLast) {
      els.studentExerciseLast.textContent = metrics.label;
    }
    if (els.studentLastWeight) {
      els.studentLastWeight.textContent = metrics.lastWeight;
    }
    if (els.studentLastReps) {
      els.studentLastReps.textContent = metrics.lastReps;
    }
    if (els.studentBestWeight) {
      els.studentBestWeight.textContent = metrics.bestWeight;
    }
    if (els.studentTechniqueNote) {
      els.studentTechniqueNote.textContent = exercise.coachNotes || 'Sin instrucción';
    }

    const nextSetNumber = studentUi.editingSetNumber || Math.min(sets.length + 1, Math.max(1, plannedSets));
    if (els.studentWeightInput && !els.studentWeightInput.value) {
      const fallbackWeight = Number(exercise.targetWeight || 0);
      if (fallbackWeight > 0) {
        els.studentWeightInput.value = String(fallbackWeight);
      }
    }
    if (els.studentSetList) {
      els.studentSetList.innerHTML = sets.length
        ? sets.map((setEntry) => `
          <div class="student-set-item">
            <div>
              <strong>Serie ${Number(setEntry.setNumber || 0)}</strong>
              <div class="meta">${Number(setEntry.weight || 0)} kg × ${Number(setEntry.reps || 0)}</div>
              <div class="meta">${setEntry.personalRecord ? '🏆 Posible nuevo récord' : ''}</div>
            </div>
            <button class="secondary small" type="button" data-student-set-edit="${Number(setEntry.setNumber || 0)}">Corregir</button>
          </div>`).join('')
        : '<div class="muted">Todavía no hay series registradas en este ejercicio.</div>';
    }

    if (els.studentExerciseCompletedNotice) {
      const completed = plannedSets > 0 && doneSets >= plannedSets;
      const completionFeedback = completed ? getExerciseCompletionFeedback(client.id, exercise, session.id) : null;
      els.studentExerciseCompletedNotice.classList.toggle('hidden', !completed);
      if (completed && completionFeedback?.suggestion) {
        const comparisonText = completionFeedback.comparison?.status !== 'no_data'
          ? ` · ${completionFeedback.comparison.headline}`
          : '';
        els.studentExerciseCompletedNotice.textContent = `${completionFeedback.suggestion.badge}${comparisonText}`;
      } else {
        els.studentExerciseCompletedNotice.textContent = completed ? 'Ejercicio completado' : `Serie ${nextSetNumber} de ${Math.max(1, plannedSets)}`;
      }
    }

    if (els.studentNextExerciseBtn) {
      els.studentNextExerciseBtn.textContent = studentUi.exerciseIndex < exercises.length - 1 ? 'Siguiente ejercicio' : 'Completar sesión';
    }

    if (els.studentRestValue) {
      const baseRest = Number(exercise.restSeconds || 0);
      const displayRest = studentUi.restRunning || studentUi.restRemaining > 0 ? studentUi.restRemaining : baseRest;
      els.studentRestValue.textContent = `${Math.max(0, displayRest)} s`;
    }

    if (els.studentSessionFinishPanel) {
      const sessionDone = session.status === 'completed' || (sessionStats.totalExercises > 0 && sessionStats.completedExercises >= sessionStats.totalExercises);
      els.studentSessionFinishPanel.classList.toggle('hidden', !sessionDone);
      if (sessionDone && els.studentSessionSummary) {
        els.studentSessionSummary.innerHTML = `
          <div class="meta">Ejercicios completados: ${sessionStats.completedExercises}/${sessionStats.totalExercises}</div>
          <div class="meta">Series realizadas: ${sessionStats.totalSets}</div>
          <div class="meta">Récords potenciales: ${sessionStats.potentialRecords}</div>
          <div class="meta">Duración estimada: ${sessionStats.estimatedDurationMinutes} min</div>`;
      }
    }
  }

  function getClientDisplayName(client) {
    return client.full_name || client.name || 'Cliente sin nombre';
  }

  function getClientRenewalLabel(client) {
    if (client.renewal_date) {
      return formatClientDate(client.renewal_date);
    }
    if (client.renewal_day) {
      return `Día ${client.renewal_day}`;
    }
    return 'Sin fecha';
  }

  function getClientStatusTone(client) {
    if (client.client_status === 'inactive' || client.active === false) {
      return 'muted';
    }
    if (client.payment_status === 'not_applicable') {
      return 'muted';
    }
    if (client.payment_status === 'overdue') {
      return 'bad';
    }
    if (client.payment_status === 'paid') {
      return 'ok';
    }
    return 'warn';
  }

  function getClientStatusLabel(client) {
    const labels = {
      paid: 'Pagado',
      pending: 'Pendiente',
      overdue: 'Atrasado',
      uncertain: 'En duda',
      not_applicable: 'Sin cobro'
    };
    return labels[client.payment_status] || 'Pendiente';
  }

  function getClientPresenceLabel(client) {
    const labels = {
      active: 'Activo',
      paused: 'Pausado',
      uncertain: 'En duda',
      inactive: 'Inactivo'
    };
    return labels[client.client_status] || 'Activo';
  }

  function getVisibleClients() {
    const search = clientUi.search.trim().toLowerCase();
    return (clientUi.records || []).filter((client) => {
      const searchableText = `${getClientDisplayName(client)} ${client.phone || ''}`.toLowerCase();
      const matchesSearch = !search || searchableText.includes(search);
      if (!matchesSearch) {
        return false;
      }

      if (clientUi.filter === 'all') {
        return true;
      }
      if (clientUi.filter === 'active') {
        return client.client_status === 'active';
      }
      if (clientUi.filter === 'inactive') {
        return client.client_status === 'inactive';
      }
      if (clientUi.filter === 'uncertain') {
        return client.client_status === 'uncertain' || client.payment_status === 'uncertain';
      }
      if (clientUi.filter === 'pending') {
        return client.payment_status === 'pending' || client.payment_status === 'overdue';
      }
      return true;
    });
  }

  function setClientNotice(message, tone = 'neutral') {
    clientUi.notice = message;
    clientUi.noticeTone = tone;
    if (els.clientMessage) {
      els.clientMessage.textContent = message;
      els.clientMessage.classList.toggle('ok', tone === 'ok');
      els.clientMessage.classList.toggle('bad', tone === 'bad');
      els.clientMessage.classList.toggle('warn', tone === 'warn');
      els.clientMessage.classList.toggle('muted', tone === 'neutral');
    }
  }

  function clearClientForm() {
    if (!els.clientForm) {
      return;
    }
    els.clientForm.reset();
    const defaults = {
      clientService: 'Personalizado',
      clientStatus: 'active',
      clientPaymentStatus: 'pending',
      clientSessionsTotal: '8',
      clientSessionsUsed: '0',
      clientTrainingModality: 'personalized',
      clientTrainingGroupSize: ''
    };
    Object.entries(defaults).forEach(([elementId, value]) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.value = value;
      }
    });
    const clientIdInput = document.getElementById('clientId');
    if (clientIdInput) {
      clientIdInput.value = '';
    }
  }

  function fillClientForm(client) {
    if (!els.clientForm) {
      return;
    }
    document.getElementById('clientId').value = client?.id || '';
    document.getElementById('clientFullName').value = client?.full_name || client?.name || '';
    document.getElementById('clientPhone').value = client?.phone || '';
    document.getElementById('clientService').value = client?.service || 'Personalizado';
    document.getElementById('clientMonthlyValue').value = Number(client?.monthly_value ?? client?.amount ?? 0) || 0;
    document.getElementById('clientStatus').value = client?.client_status || 'active';
    document.getElementById('clientPaymentStatus').value = client?.payment_status || 'pending';
    document.getElementById('clientEmail').value = client?.email || '';
    document.getElementById('clientBirthDate').value = client?.birth_date || '';
    els.clientAge.value = client?.age || '';
    document.getElementById('clientTrainingDays').value = client?.training_days || '';
    document.getElementById('clientSchedule').value = client?.schedule_notes || '';
    document.getElementById('clientSessionsTotal').value = Number(client?.sessions_total ?? 0);
    document.getElementById('clientSessionsUsed').value = Number(client?.sessions_used ?? 0);
    document.getElementById('clientTrainingModality').value = client?.training_modality || 'personalized';
    document.getElementById('clientTrainingGroupSize').value = client?.training_modality === 'group' ? Number(client?.training_group_size || 2) : '';
    document.getElementById('clientStartDate').value = client?.start_date || '';
    document.getElementById('clientRenewalDate').value = client?.renewal_date || '';
    document.getElementById('clientObjective').value = client?.objective || '';
    els.clientTrainingExperience.value = client?.training_experience || '';
    els.clientAvoidExercises.value = client?.avoid_exercises || '';
    els.clientIntakeComment.value = client?.intake_comment || '';
    document.getElementById('clientInjuries').value = client?.injuries || '';
    document.getElementById('clientObservations').value = client?.observations || '';
    document.getElementById('clientEmergencyContact').value = client?.emergency_contact || '';
    document.getElementById('clientEmergencyPhone').value = client?.emergency_phone || '';
  }

  function toggleClientForm(open = true, client = null) {
    clientUi.formOpen = open;
    clientUi.editingId = client?.id || null;
    if (els.clientFormPanel) {
      els.clientFormPanel.classList.toggle('hidden', !open);
    }
    if (els.clientFormTitle) {
      els.clientFormTitle.textContent = client ? 'Editar cliente' : 'Nuevo cliente';
    }
    if (client) {
      fillClientForm(client);
    } else {
      clearClientForm();
    }
    if (open) {
      setClientNotice(client ? `Editando ${getClientDisplayName(client)}.` : 'Completa el formulario para crear un cliente.', 'neutral');
    }
  }

  function buildClientFormPayload() {
    if (!els.clientForm) {
      return null;
    }
    return Object.fromEntries(new FormData(els.clientForm).entries());
  }

  function parseWhatsAppImport() {
    const parsed = window.VALHALLA.onboarding?.parseMessage(els.whatsAppImportText.value || '') || {};
    if (!parsed.fullName || !parsed.phone) {
      els.whatsAppImportMessage.textContent = 'El mensaje debe incluir Nombre completo y Teléfono de contacto.';
      els.whatsAppImportMessage.className = 'notice warn';
      return;
    }
    toggleClientForm(true, null);
    document.getElementById('clientFullName').value = parsed.fullName;
    document.getElementById('clientPhone').value = parsed.phone;
    els.clientAge.value = parsed.age || '';
    document.getElementById('clientObjective').value = parsed.objective || '';
    els.clientTrainingExperience.value = parsed.experience || '';
    document.getElementById('clientInjuries').value = parsed.injuries || '';
    els.clientAvoidExercises.value = parsed.avoidExercises || '';
    els.clientIntakeComment.value = parsed.comment || '';
    els.whatsAppImportPanel.classList.add('hidden');
    els.whatsAppImportMessage.textContent = '';
    const formMessage = document.getElementById('clientFormMessage');
    if (formMessage) {
      formMessage.textContent = 'Ingreso importado. Revisa los datos y completa plan, días y modalidad antes de guardar.';
      formMessage.className = 'notice ok';
    }
    renderClients();
    els.clientFormPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function validateClientPayload(payload, existingId = null) {
    const errors = [];
    const fullName = String(payload.fullName || '').trim();
    const phone = String(payload.phone || '').trim();
    const monthlyValue = Number(payload.monthlyValue);

    if (!fullName) {
      errors.push('El nombre no puede estar vacío');
    }
    if (!phone) {
      errors.push('El teléfono es obligatorio');
    }
    if (!payload.service) {
      errors.push('El servicio es obligatorio');
    }
    if (!Number.isFinite(monthlyValue) || monthlyValue < 0) {
      errors.push('El valor mensual no puede ser negativo');
    }

    ['birthDate', 'startDate', 'renewalDate'].forEach((field) => {
      if (!isValidDateInput(payload[field])) {
        errors.push(`La fecha de ${field} no es válida`);
      }
    });

    const phoneKey = normalizePhoneDigits(phone);
    const nameKey = fullName.toLowerCase();
    const duplicate = (clientUi.records || []).some((client) => {
      if (existingId && client.id === existingId) {
        return false;
      }
      return getClientDisplayName(client).trim().toLowerCase() === nameKey && normalizePhoneDigits(client.phone) === phoneKey;
    });
    if (duplicate) {
      errors.push('Ya existe un cliente con ese nombre y teléfono');
    }

    return { valid: errors.length === 0, errors };
  }

  function buildClientRecord(payload, existingClient = null) {
    const fullName = String(payload.fullName || '').trim();
    const monthlyValue = Number(payload.monthlyValue || 0);
    const renewalDate = payload.renewalDate || '';
    const clientStatus = payload.clientStatus || 'active';
    const paymentStatus = payload.paymentStatus || 'pending';
    const clientId = existingClient?.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : dataApi.createId('client'));

    return normalizeClientRecord({
      ...existingClient,
      id: clientId,
      full_name: fullName,
      name: fullName,
      phone: payload.phone || '',
      email: payload.email || '',
      birth_date: payload.birthDate || '',
      age: payload.age ? Math.max(1, Math.min(120, Math.floor(Number(payload.age)))) : '',
      training_days: payload.trainingDays || '',
      service: payload.service || 'Personalizado',
      monthly_value: monthlyValue,
      amount: monthlyValue,
      client_status: clientStatus,
      payment_status: paymentStatus,
      status: paymentStatus,
      schedule_notes: payload.schedule || '',
      sessions_total: Math.max(0, Math.floor(Number(payload.sessionsTotal || 0))),
      sessions_used: Math.max(0, Math.floor(Number(payload.sessionsUsed || 0))),
      sessions_month: existingClient?.sessions_month || getTodayLocalDate().slice(0, 7),
      training_modality: payload.trainingModality === 'group' ? 'group' : 'personalized',
      training_group_size: payload.trainingModality === 'group' ? Math.max(2, Math.min(4, Math.floor(Number(payload.trainingGroupSize || 2)))) : 1,
      training_attendance: Array.isArray(existingClient?.training_attendance) ? existingClient.training_attendance : [],
      objective: payload.objective || '',
      training_experience: payload.trainingExperience || '',
      avoid_exercises: payload.avoidExercises || '',
      intake_comment: payload.intakeComment || '',
      injuries: payload.injuries || '',
      observations: payload.observations || '',
      emergency_contact: payload.emergencyContact || '',
      emergency_phone: payload.emergencyPhone || '',
      start_date: payload.startDate || '',
      renewal_date: renewalDate,
      renewal_day: renewalDate ? new Date(`${renewalDate}T00:00:00`).getDate() : (existingClient?.renewal_day || ''),
      active: clientStatus !== 'inactive',
      continues: clientStatus !== 'inactive',
      createdAt: existingClient?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  function renderClientDetail(client) {
    if (!client) {
      return '';
    }
    const assignment = getActiveTrainingAssignment(client.id);
    const formatProgramEntry = (entry) => {
      const load = entry.weight === null || entry.weight === undefined ? 'Peso por completar' : `${Number(entry.weight)} kg`;
      const reps = entry.reps === null || entry.reps === undefined ? 'reps por completar' : `${Number(entry.reps)} reps`;
      const rir = entry.rir === null || entry.rir === undefined ? 'RIR por completar' : `RIR ${Number(entry.rir)}`;
      return `${escapeHtml(entry.label)}: ${load} × ${reps} · ${rir}`;
    };

    return `
      <section class="client-detail-inline" data-client-detail-panel="${escapeHtml(client.id)}" data-client-panel-type="details" aria-label="Ficha de ${escapeHtml(getClientDisplayName(client))}">
        <div class="client-detail-grid">
          <div><strong>Teléfono</strong><div class="meta">${escapeHtml(client.phone || 'Sin teléfono')}</div></div>
          <div><strong>Estado de pago</strong><div class="meta">${escapeHtml(getClientStatusLabel(client))}</div></div>
          <div><strong>Servicio</strong><div class="meta">${escapeHtml(client.service || 'Sin servicio')}</div></div>
          <div><strong>Estado del cliente</strong><div class="meta">${escapeHtml(getClientPresenceLabel(client))}</div></div>
          <div><strong>Valor mensual</strong><div class="meta">${financeApi.formatCurrency(Number(client.monthly_value ?? client.amount ?? 0))}</div></div>
          <div><strong>Fecha de renovación</strong><div class="meta">${escapeHtml(getClientRenewalLabel(client))}</div></div>
          <div><strong>Horario</strong><div class="meta">${escapeHtml(client.schedule_notes || 'Sin horario')}</div></div>
          <div><strong>Días de entrenamiento</strong><div class="meta">${escapeHtml(client.training_days || 'Sin información')}</div></div>
          <div><strong>Sesiones disponibles</strong><div class="meta">${Math.max(0, Number(client.sessions_total || 0) - Number(client.sessions_used || 0))}/${Number(client.sessions_total || 0)} — puedes reagendar durante la semana sin problema.</div></div>
          <div><strong>Modalidad</strong><div class="meta">${client.training_modality === 'group' ? `Grupo (${Number(client.training_group_size || 2)})` : 'Personalizado'}</div></div>
          <div><strong>Correo</strong><div class="meta">${escapeHtml(client.email || 'Sin correo')}</div></div>
          <div><strong>Objetivo</strong><div class="meta">${escapeHtml(client.objective || 'Sin objetivo')}</div></div>
          <div><strong>Contacto de emergencia</strong><div class="meta">${escapeHtml(client.emergency_contact || 'Sin contacto')}</div></div>
          <div><strong>Teléfono de emergencia</strong><div class="meta">${escapeHtml(client.emergency_phone || 'Sin teléfono')}</div></div>
          <div><strong>Lesiones</strong><div class="meta">${escapeHtml(client.injuries || 'Sin información')}</div></div>
          <div><strong>Observaciones</strong><div class="meta">${escapeHtml(client.observations || 'Sin observaciones')}</div></div>
          <div><strong>Fecha de inicio</strong><div class="meta">${escapeHtml(formatClientDate(client.start_date))}</div></div>
        </div>
        <section class="client-program-detail">
          <div class="section-title compact"><h3>Programa actual</h3>${assignment ? `<span class="pill">${Number(assignment.durationWeeks || 4)} semanas</span>` : ''}</div>
          ${assignment ? `<strong>${escapeHtml(assignment.programName || 'Programa')}</strong>
            ${(assignment.days || []).map((day) => `
              <div class="client-program-day">
                <strong>${escapeHtml(day.name)}</strong>
                <ul>${(day.exercises || []).map((exercise) => `
                  <li>
                    <strong>${escapeHtml(exercise.exerciseName)}</strong> · ${Number(exercise.sets || 0)} series${exercise.targetWeight === null || exercise.targetWeight === undefined ? '' : ` · ${Number(exercise.targetWeight)} kg objetivo`}
                    <div class="meta">Aproximaciones: ${(exercise.approximations || []).length ? exercise.approximations.map(formatProgramEntry).join(' · ') : 'Sin aproximaciones'}</div>
                    <div class="meta">Series efectivas: ${(exercise.effectiveSets || []).length ? exercise.effectiveSets.map(formatProgramEntry).join(' · ') : 'Sin series definidas'}</div>
                    ${exercise.notes ? `<div class="meta">${escapeHtml(exercise.notes)}</div>` : ''}
                  </li>`).join('')}</ul>
              </div>`).join('')}` : '<div class="meta">No hay programa activo asignado.</div>'}
          ${client.last_training_day_id ? `<div class="meta">Última sesión elegida: ${escapeHtml(assignment?.days?.find((day) => day.id === client.last_training_day_id)?.name || '')}</div>` : ''}
        </section>
        <div class="inline-actions">
          <button class="secondary" type="button" data-client-sports="${client.id}">Ficha deportiva</button>
          ${client.client_status === 'active' && client.active !== false ? `<button class="primary" type="button" data-client-student-view="${client.id}">Vista alumno</button>` : '<span class="muted">Vista alumno disponible para clientes activos</span>'}
        </div>
      </section>`;
  }

  function renderAuthPanel() {
    if (!els.authPanel) {
      return;
    }

    // El inicio de sesión vive en auth-gate.js; aquí solo se informa la cuenta activa.
    if (supabaseApi && typeof supabaseApi.isCloudEnabled === 'function' && supabaseApi.isCloudEnabled()) {
      const user = window.VALHALLA.authGate?.getUser?.();
      els.authPanel.innerHTML = `
        <div class="card">
          <h3>Cuenta</h3>
          <p class="muted">${user?.email ? `Sesión iniciada como ${escapeHtml(user.email)}.` : 'Sesión iniciada.'}</p>
          <div class="notice">Por ahora tus datos se guardan solo en este dispositivo. La sincronización con la nube llegará en la próxima fase.</div>
          <button class="secondary" type="button" id="authPanelLogout">Cerrar sesión</button>
        </div>`;
      document.getElementById('authPanelLogout')?.addEventListener('click', () => window.VALHALLA.authGate?.signOut?.());
      return;
    }

    els.authPanel.innerHTML = '<div class="notice">Modo Local activo. Los datos siguen guardándose en localStorage.</div>';
  }

  function show(section) {
    if (els.cloudModeBadge) {
      els.cloudModeBadge.textContent = isCloudSessionActive() ? 'Modo Cloud' : 'Modo Local';
    }
    renderAuthPanel();
    Object.entries(els.sections).forEach(([name, element]) => {
      element.classList.toggle('hidden', name !== section);
    });
    if (els.nav) {
      els.nav.classList.toggle('hidden', section === 'studentTraining');
    }
    document.querySelectorAll('[data-nav]').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-nav') === section);
    });
    if (section === 'clients') {
      refreshClients().catch(() => {});
    }
    if (section === 'register') {
      ensureDateValue(document.getElementById('date'));
    }
    if (section === 'trainings') {
      ensureDateValue(els.routineDate);
      refreshTrainingsV08FromCloud().catch(() => {});
    }
    if (section === 'studentTraining') {
      renderStudentTraining();
    }
  }

  function renderDashboardCards() {
    if (!els.dashboardCards) {
      return;
    }

    const selectedSegment = els.segmentFilter?.value || 'global';
    const highlights = financeApi.getDashboardHighlights(state, new Date(), selectedSegment);

    els.dashboardCards.innerHTML = highlights.map((item) => `
      <div class="card dashboard-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">${escapeHtml(item.title)}</p>
            <h3>${escapeHtml(item.summary)}</h3>
          </div>
          <span class="pill">${escapeHtml(item.badge)}</span>
        </div>
        <p class="muted">${escapeHtml(item.detail)}</p>
        <div class="dashboard-actions">
          <button class="primary small" type="button" data-nav="${escapeHtml(item.nav)}">${escapeHtml(item.buttonLabel)}</button>
        </div>
      </div>`).join('');
  }

  function renderDashboard() {
    const selectedSegment = els.segmentFilter?.value || 'global';
    const dashboard = financeApi.calculateDashboard(state, new Date(), selectedSegment);
    els.metrics.initialCash.textContent = financeApi.formatCurrency(Number(state.profile.initial_cash || 0));
    els.metrics.incomes.textContent = financeApi.formatCurrency(dashboard.incomesReceived);
    els.metrics.expenses.textContent = financeApi.formatCurrency(dashboard.expensesMade);
    els.metrics.available.textContent = financeApi.formatCurrency(dashboard.realAvailable);
    els.metrics.projection.textContent = financeApi.formatCurrency(dashboard.projection);
    els.metrics.savings.textContent = financeApi.formatCurrency(dashboard.suggestedSavings);
    els.metrics.pending.textContent = financeApi.formatCurrency(dashboard.pendingCommitments);
    els.initialCashInput.value = Number(state.profile.initial_cash || 0);

    renderDashboardCards();

    const totalAccountsBalance = financeApi.formatCurrency(dashboard.totalAccountsBalance || 0);
    const operatingBalance = financeApi.formatCurrency(dashboard.operatingBalance || 0);
    const debtPending = financeApi.formatCurrency(dashboard.debtPending || 0);
    document.getElementById('dashboardSummary').innerHTML = `
      <div class="card">
        <h2>Resumen financiero</h2>
        <div class="row">
          <div><strong>Saldo total de cuentas</strong><div class="meta">${totalAccountsBalance}</div></div>
          <div><strong>Saldo operativo</strong><div class="meta">${operatingBalance}</div></div>
        </div>
        <div class="row">
          <div><strong>Compromisos pendientes</strong><div class="meta">${financeApi.formatCurrency(dashboard.pendingCommitments || 0)}</div></div>
          <div><strong>Deuda pendiente</strong><div class="meta">${debtPending}</div></div>
        </div>
      </div>`;

    const categoryOptions = (state.categories || []).map((category) => `<option value="${escapeHtml(category.name)}" ${category.name === 'Monster / bebidas' ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('');
    if (els.categorySelect) {
      els.categorySelect.innerHTML = categoryOptions;
    }
    if (els.accountSelect) {
      els.accountSelect.innerHTML = (state.accounts || []).filter((account) => account.isActive !== false).map((account) => `<option value="${account.id}" ${account.isMain ? 'selected' : ''}>${escapeHtml(account.name)}</option>`).join('');
    }
    if (els.quickCategories) {
      els.quickCategories.innerHTML = (state.categories || [])
        .filter((category) => !['Mariela', 'Magic'].includes(category.name))
        .map((category) => `<button class="chip" type="button" data-quick-category="${escapeHtml(category.name)}">${escapeHtml(category.name)}</button>`).join('');
    }

    ensureDateValue(document.getElementById('date'));

    let adviceText = '';
    if (dashboard.realAvailable < Number(state.profile.minimum_reserve || 0)) {
      adviceText = '⚠️ El dinero real disponible está por debajo de la reserva mínima. Considera postergar gastos no esenciales.';
    } else if (dashboard.suggestedSavings > 0) {
      adviceText = `✅ Podrías separar ${financeApi.formatCurrency(dashboard.suggestedSavings)} para ahorro este mes.`;
    } else {
      adviceText = '✅ Tu situación está estable. Mantén el control de los gastos hormiga.';
    }
    els.advice.textContent = adviceText;

    if (dashboard.upcomingItems.length) {
      els.upcoming.innerHTML = dashboard.upcomingItems.slice(0, 8).map((item) => `
        <div class="list-item">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <div class="meta">${item.date.toLocaleDateString('es-CL')}</div>
          </div>
          <div class="${item.type === 'income' ? 'ok' : 'bad'}">${item.type === 'income' ? '+' : '-'}${financeApi.formatCurrency(item.amount)}</div>
        </div>`).join('');
    } else {
      els.upcoming.innerHTML = '<div class="muted">Sin movimientos próximos.</div>';
    }

    const monthMovements = financeApi.getMonthMovements(state, new Date()).slice().reverse().filter((movement) => {
      if (!els.segmentFilter || !els.segmentFilter.value || els.segmentFilter.value === 'global') {
        return true;
      }
      return (movement.segment || 'personal') === els.segmentFilter.value;
    });
    els.movementsTable.innerHTML = monthMovements.length ? monthMovements.map((movement) => `
      <div class="list-item">
        <div>
          <strong>${escapeHtml(movement.description)}</strong>
          <div class="meta">${escapeHtml(movement.category)} · ${escapeHtml(movement.date)} · ${escapeHtml(movement.segment || 'personal')} · ${escapeHtml(movement.accountId ? (state.accounts.find((account) => account.id === movement.accountId)?.name || 'Cuenta') : 'Sin cuenta')}</div>
        </div>
        <div class="${movement.type === 'income' ? 'ok' : 'bad'}">
          <div>${movement.type === 'income' ? '+' : '-'}${financeApi.formatCurrency(movement.amount)}</div>
          <div class="inline-actions">
            <button class="ghost small" data-edit="${movement.id}" type="button">Editar</button>
            <button class="danger small" data-remove="${movement.id}" type="button">Eliminar</button>
          </div>
        </div>
      </div>`).join('') : '<div class="muted">Sin movimientos en este mes.</div>';
  }

  function getClientName(clientId) {
    return state.clients.find((client) => client.id === clientId)?.name || 'Alumno';
  }

  function getActiveNutritionProfile(clientId) {
    return state.nutritionProfiles.find((profile) => profile.clientId === clientId && profile.active);
  }

  function getSelectedPlan(profile) {
    if (!profile) {
      return state.nutritionPlans.find((plan) => plan.active) || null;
    }
    return state.nutritionPlans.find((plan) => plan.id === profile.currentPlanId) || state.nutritionPlans.find((plan) => plan.active) || null;
  }

  function getCycleDay(profile, referenceDate = new Date()) {
    if (!profile || !profile.cycleStartDate) {
      return 1;
    }
    const start = new Date(profile.cycleStartDate);
    const current = new Date(referenceDate);
    const diffDays = Math.floor((current.getTime() - start.getTime()) / 86400000);
    return Math.max(1, diffDays + 1);
  }

  function getNutritionCompliance(clientId, days = 7) {
    const relevantLogs = state.nutritionLogs.filter((log) => log.clientId === clientId).slice(-days);
    if (!relevantLogs.length) {
      return 0;
    }
    const ratio = relevantLogs.reduce((sum, log) => sum + (log.totalMeals ? Number(log.completedMeals || 0) / Number(log.totalMeals || 1) : 0), 0) / relevantLogs.length;
    return Math.round(ratio * 100);
  }

  function getNutritionAlerts(clientId) {
    const profile = getActiveNutritionProfile(clientId);
    const plan = getSelectedPlan(profile);
    const logs = state.nutritionLogs.filter((log) => log.clientId === clientId).slice(-7);
    const alerts = [];
    if (!profile) {
      return alerts;
    }
    const daysWithout = logs.length ? Math.max(0, 7 - logs.length) : 7;
    if (daysWithout > 3) {
      alerts.push(`Más de 3 días sin registro: ${daysWithout} días sin seguimiento.`);
    }
    const compliance = getNutritionCompliance(clientId, 7);
    if (compliance < 70) {
      alerts.push(`Cumplimiento inferior al 70% en los últimos 7 días: ${compliance}%.`);
    }
    if (plan) {
      const avgWater = logs.length ? logs.reduce((sum, log) => sum + Number(log.waterLiters || 0), 0) / logs.length : 0;
      if (avgWater < Number(plan.waterMinLiters || 0)) {
        alerts.push(`Agua promedio menor al mínimo configurado: ${avgWater.toFixed(1)} L.`);
      }
      const avgEnergy = logs.length ? logs.reduce((sum, log) => sum + Number(log.energy || 0), 0) / logs.length : 0;
      if (avgEnergy <= 2) {
        alerts.push(`Energía promedio baja o igual a 2.`);
      }
      const avgHunger = logs.length ? logs.reduce((sum, log) => sum + Number(log.hunger || 0), 0) / logs.length : 0;
      if (avgHunger >= 4) {
        alerts.push(`Hambre promedio alta o igual a 4.`);
      }
    }
    const weightSeries = logs.filter((log) => log.weight !== '' && log.weight !== undefined && log.weight !== null);
    if (weightSeries.length >= 2) {
      const first = Number(weightSeries[0].weight);
      const last = Number(weightSeries[weightSeries.length - 1].weight);
      if (first !== last) {
        alerts.push(`Cambio de peso registrado: ${first} kg → ${last} kg.`);
      }
    }
    return alerts;
  }

  function renderClients() {
    if (!els.clientList) {
      return;
    }

    const visibleClients = getVisibleClients();
    const selectedClient = clientUi.detailId ? (visibleClients.find((client) => client.id === clientUi.detailId) || clientUi.records.find((client) => client.id === clientUi.detailId)) : null;

    if (els.clientCount) {
      els.clientCount.textContent = `${visibleClients.length} cliente${visibleClients.length === 1 ? '' : 's'}`;
    }
    if (els.clientSearch && els.clientSearch.value !== clientUi.search) {
      els.clientSearch.value = clientUi.search;
    }
    document.querySelectorAll('[data-client-filter]').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-client-filter') === clientUi.filter);
    });
    if (els.clientFormPanel) {
      els.clientFormPanel.classList.toggle('hidden', !clientUi.formOpen);
    }
    if (els.clientFormTitle) {
      els.clientFormTitle.textContent = clientUi.editingId ? 'Editar cliente' : 'Nuevo cliente';
    }
    if (els.clientSubmitBtn) {
      els.clientSubmitBtn.textContent = clientUi.editingId ? 'Actualizar cliente' : 'Guardar cliente';
      els.clientSubmitBtn.disabled = clientUi.saving;
    }
    if (els.clientNewBtn) {
      els.clientNewBtn.disabled = clientUi.saving;
    }

    const emptyMessage = clientUi.loading
      ? '<div class="muted">Cargando clientes...</div>'
      : '<div class="muted">No hay clientes para mostrar.</div>';

    els.clientList.innerHTML = visibleClients.length ? visibleClients.map((client) => {
      const tone = getClientStatusTone(client);
      const serviceLabel = escapeHtml(client.service || 'Sin servicio');
      const scheduleLabel = escapeHtml(client.schedule_notes || 'Sin horario');
      const whatsappPhone = normalizeChileanPhoneForWhatsApp(client.phone);
      return `
        <article class="client-card" data-client-card="${escapeHtml(client.id)}">
          <div class="client-card-head">
            <div>
              <h3>${escapeHtml(getClientDisplayName(client))}</h3>
              <div class="meta">${serviceLabel} · ${scheduleLabel}</div>
            </div>
            <span class="client-badge ${tone}">${escapeHtml(getClientStatusLabel(client))}</span>
          </div>
          <div class="client-card-body">
            <div><strong>Valor mensual</strong><div class="meta">${financeApi.formatCurrency(Number(client.monthly_value ?? client.amount ?? 0))}</div></div>
            <div><strong>Renovación</strong><div class="meta">${escapeHtml(getClientRenewalLabel(client))}</div></div>
            <div><strong>Estado del cliente</strong><div class="meta">${escapeHtml(getClientPresenceLabel(client))}</div></div>
          </div>
          <div class="inline-actions client-actions">
            <button class="ghost small" type="button" data-client-view="${client.id}" aria-expanded="${clientUi.detailId === client.id && clientUi.detailType === 'details'}">${clientUi.detailId === client.id && clientUi.detailType === 'details' ? 'Cerrar ficha' : 'Ver ficha'}</button>
            <button class="ghost small" type="button" data-client-sports="${client.id}" aria-expanded="${clientUi.detailId === client.id && clientUi.detailType === 'sports'}">${clientUi.detailId === client.id && clientUi.detailType === 'sports' ? 'Cerrar ficha deportiva' : 'Ficha deportiva'}</button>
            <button class="secondary small" type="button" data-client-edit="${client.id}">Editar</button>
            <button class="secondary small" type="button" data-client-whatsapp="${client.id}" ${whatsappPhone ? '' : 'disabled'}>WhatsApp</button>
          </div>
          ${clientUi.detailId === client.id ? (clientUi.detailType === 'sports' ? renderSportsProfilePanel(client) : renderClientDetail(client)) : ''}
        </article>`;
    }).join('') : emptyMessage;

    if (clientUi.notice && els.clientMessage) {
      els.clientMessage.textContent = clientUi.notice;
      els.clientMessage.classList.toggle('ok', clientUi.noticeTone === 'ok');
      els.clientMessage.classList.toggle('bad', clientUi.noticeTone === 'bad');
      els.clientMessage.classList.toggle('warn', clientUi.noticeTone === 'warn');
      els.clientMessage.classList.toggle('muted', clientUi.noticeTone === 'neutral');
    }
  }

  async function refreshClients() {
    clientUi.loading = true;
    clientUi.records = (state.clients || []).map((client) => normalizeClientRecord(client));
    renderClients();

    const hasCloudSession = await refreshCloudSessionState();
    if (!hasCloudSession || !cloudDataApi || typeof cloudDataApi.listClients !== 'function') {
      clientUi.loading = false;
      renderClients();
      return;
    }

    const response = await cloudDataApi.listClients();
    if (response && response.error && response.error !== 'Modo local') {
      setClientNotice(response.error, 'bad');
    }

    if (response && Array.isArray(response.data)) {
      state.clients = response.data.map((client) => normalizeClientRecord(client));
      clientUi.records = state.clients.slice();
    }

    if (response && !response.error) {
      setClientNotice('', 'neutral');
    }

    await refreshSportsDataFromCloud();

    clientUi.loading = false;
    renderClients();
  }

  async function refreshTrainingsV08FromCloud() {
    ensureTrainingsV08State();
    const hasCloudSession = await refreshCloudSessionState();
    if (!hasCloudSession || !cloudDataApi || typeof cloudDataApi.listTrainingSessions !== 'function') {
      return;
    }

    const sessionsResponse = await cloudDataApi.listTrainingSessions();
    if (sessionsResponse && sessionsResponse.error && sessionsResponse.error !== 'Modo local') {
      if (els.routineMessage) {
        els.routineMessage.textContent = sessionsResponse.error.message || sessionsResponse.error;
      }
      return;
    }

    if (sessionsResponse && Array.isArray(sessionsResponse.data)) {
      state.trainingModelVersion = '0.8.0';
      state.trainingsV08.sessions = sessionsResponse.data.slice();
    }

    if (cloudDataApi && typeof cloudDataApi.listTrainingPlans === 'function') {
      const plansResponse = await cloudDataApi.listTrainingPlans();
      if (plansResponse && Array.isArray(plansResponse.data)) {
        state.trainingsV08.plans = plansResponse.data.map((plan, index) => normalizeTrainingPlan(plan, index));
      }
    }

    renderTrainings();
    renderStudentTraining();
  }

  async function syncSessionToCloud(session) {
    if (!session) {
      return { ok: false, error: 'Sesion invalida' };
    }
    const hasCloudSession = await refreshCloudSessionState();
    if (!hasCloudSession || !cloudDataApi || typeof cloudDataApi.saveTrainingSessionDeep !== 'function') {
      return { ok: false, error: 'Modo local' };
    }

    const response = await cloudDataApi.saveTrainingSessionDeep(session);
    if (response && response.error) {
      return { ok: false, error: response.error.message || response.error };
    }

    return { ok: true };
  }

  function openClientWhatsApp(client) {
    const phone = normalizeChileanPhoneForWhatsApp(client.phone);
    if (!phone) {
      setClientNotice('El cliente no tiene un teléfono válido para WhatsApp.', 'warn');
      return;
    }
    window.open(`https://wa.me/${phone}`, '_blank', 'noopener,noreferrer');
  }

  function getCloudClientPayload(client) {
    return {
      full_name: client.full_name,
      email: client.email || null,
      birth_date: client.birth_date || null,
      phone: client.phone || null,
      service: client.service || null,
      schedule_notes: client.schedule_notes || null,
      objective: client.objective || null,
      injuries: client.injuries || null,
      observations: client.observations || null,
      emergency_contact: client.emergency_contact || null,
      emergency_phone: client.emergency_phone || null,
      start_date: client.start_date || null,
      renewal_date: client.renewal_date || null,
      monthly_value: Number(client.monthly_value ?? client.amount ?? 0),
      payment_status: client.payment_status || 'pending',
      client_status: client.client_status || 'active',
      active: client.client_status !== 'inactive',
      auth_user_id: null
    };
  }

  async function handleClientSubmit(event) {
    event.preventDefault();
    if (clientUi.saving) {
      return;
    }

    if (isCloudMode()) {
      await refreshCloudSessionState();
    }

    const payload = buildClientFormPayload();
    const existingClient = clientUi.editingId ? (clientUi.records || []).find((client) => client.id === clientUi.editingId) || null : null;
    const validation = validateClientPayload(payload, clientUi.editingId);
    if (!validation.valid) {
      setClientNotice(validation.errors.join('. '), 'bad');
      return;
    }

    clientUi.saving = true;
    if (els.clientSubmitBtn) {
      els.clientSubmitBtn.disabled = true;
    }
    if (els.clientNewBtn) {
      els.clientNewBtn.disabled = true;
    }
    setClientNotice('Guardando cliente...', 'neutral');

    try {
      const nextClient = buildClientRecord(payload, existingClient);
      let savedClient = nextClient;

      if (isCloudSessionActive()) {
        if (!cloudDataApi || typeof cloudDataApi.createClient !== 'function' || typeof cloudDataApi.updateClient !== 'function') {
          throw new Error('La integración Cloud no está disponible');
        }
        const cloudPayload = getCloudClientPayload(nextClient);
        const response = existingClient
          ? await cloudDataApi.updateClient(existingClient.id, cloudPayload)
          : await cloudDataApi.createClient(cloudPayload);

        if (response.error) {
          throw new Error(response.error.message || response.error || 'No se pudo guardar el cliente en Cloud');
        }
        savedClient = normalizeClientRecord(response.data || nextClient);
      }

      const normalizedSavedClient = normalizeClientRecord(savedClient);
      const nextRecords = (clientUi.records || []).filter((client) => client.id !== normalizedSavedClient.id);
      nextRecords.unshift(normalizedSavedClient);
      clientUi.records = nextRecords;
      state.clients = nextRecords.map((client) => normalizeClientRecord(client));
      clientUi.detailId = normalizedSavedClient.id;
      clientUi.detailType = clientUi.detailType || 'details';
      clientUi.formOpen = false;
      clientUi.editingId = null;
      clearClientForm();
      if (els.clientFormPanel) {
        els.clientFormPanel.classList.add('hidden');
      }
      setClientNotice(existingClient ? 'Cliente actualizado correctamente.' : 'Cliente guardado correctamente.', 'ok');
      if (!isCloudSessionActive()) {
        persist();
      } else {
        render();
      }
      renderClients();
    } catch (error) {
      setClientNotice(error.message || 'No se pudo guardar el cliente.', 'bad');
    } finally {
      clientUi.saving = false;
      if (els.clientSubmitBtn) {
        els.clientSubmitBtn.disabled = false;
      }
      if (els.clientNewBtn) {
        els.clientNewBtn.disabled = false;
      }
      renderClients();
    }
  }

  async function saveSportsProfileForm(form) {
    ensureSportsState();
    const payload = Object.fromEntries(new FormData(form).entries());
    const clientId = form.getAttribute('data-client-id') || clientUi.detailId || '';
    if (!clientId) {
      setClientNotice('Selecciona un cliente para guardar la ficha deportiva.', 'warn');
      return;
    }

    const existing = getSportsProfile(clientId);
    const nextProfile = dataApi.normalizeSportsProfile({
      id: existing?.id,
      clientId,
      primaryGoal: payload.primaryGoal || 'otro',
      secondaryGoal: payload.secondaryGoal || '',
      goalNotes: payload.goalNotes || '',
      experienceLevel: payload.experienceLevel || 'principiante',
      experienceMonths: Number(payload.experienceMonths || 0),
      coachStartDate: payload.coachStartDate || '',
      sessionsPerWeek: Number(payload.sessionsPerWeek || 0),
      sessionDurationMinutes: Number(payload.sessionDurationMinutes || 0),
      coachNotes: payload.coachNotes || ''
    });

    state.sportsProfiles = (state.sportsProfiles || []).filter((item) => item.clientId !== clientId);
    state.sportsProfiles.unshift(nextProfile);

    if (isCloudSessionActive() && cloudDataApi && typeof cloudDataApi.upsertSportsProfile === 'function') {
      const response = await cloudDataApi.upsertSportsProfile({
        id: nextProfile.id,
        client_id: clientId,
        primary_goal: nextProfile.primaryGoal,
        secondary_goal: nextProfile.secondaryGoal || null,
        goal_notes: nextProfile.goalNotes || null,
        experience_level: nextProfile.experienceLevel,
        experience_months: nextProfile.experienceMonths,
        coach_start_date: nextProfile.coachStartDate || null,
        sessions_per_week: nextProfile.sessionsPerWeek,
        session_duration_minutes: nextProfile.sessionDurationMinutes,
        coach_notes: nextProfile.coachNotes || null
      });
      if (response?.error) {
        throw new Error(response.error.message || response.error);
      }
      await refreshSportsDataFromCloud();
      renderClients();
      return;
    }

    persist();
  }

  async function saveSportsConsiderationForm(form) {
    ensureSportsState();
    const payload = Object.fromEntries(new FormData(form).entries());
    const clientId = form.getAttribute('data-client-id') || clientUi.detailId || '';
    if (!clientId || !String(payload.title || '').trim()) {
      setClientNotice('La consideración necesita cliente y título.', 'warn');
      return;
    }

    const nextItem = dataApi.normalizeSportsConsideration({
      id: payload.considerationId || undefined,
      clientId,
      title: payload.title,
      description: payload.description || '',
      status: payload.status || 'activa',
      notedOn: payload.notedOn || getTodayLocalDate(),
      reviewDate: payload.reviewDate || ''
    });

    state.sportsConsiderations = (state.sportsConsiderations || []).filter((item) => item.id !== nextItem.id);
    state.sportsConsiderations.unshift(nextItem);

    if (isCloudSessionActive() && cloudDataApi && typeof cloudDataApi.upsertSportsConsideration === 'function') {
      const response = await cloudDataApi.upsertSportsConsideration({
        id: nextItem.id,
        client_id: clientId,
        title: nextItem.title,
        description: nextItem.description || null,
        status: nextItem.status,
        noted_on: nextItem.notedOn,
        review_date: nextItem.reviewDate || null
      });
      if (response?.error) {
        throw new Error(response.error.message || response.error);
      }
      await refreshSportsDataFromCloud();
      renderClients();
      return;
    }

    persist();
  }

  async function saveMovementStatusForm(form) {
    ensureSportsState();
    const payload = Object.fromEntries(new FormData(form).entries());
    const clientId = form.getAttribute('data-client-id') || clientUi.detailId || '';
    const movementName = String(payload.movementName || '').trim();
    if (!clientId || !movementName) {
      setClientNotice('El estado de movimiento necesita cliente y nombre de ejercicio.', 'warn');
      return;
    }

    const nextItem = dataApi.normalizeMovementStatus({
      id: payload.movementStatusId || undefined,
      clientId,
      movementName,
      movementKey: normalizeMovementKey(movementName),
      status: payload.status || 'no_evaluado',
      coachNote: payload.coachNote || '',
      evaluated1rm: payload.evaluated1rm || '',
      lastEvaluatedOn: payload.lastEvaluatedOn || ''
    });

    state.movementStatuses = (state.movementStatuses || []).filter((item) => item.id !== nextItem.id && !(item.clientId === clientId && item.movementKey === nextItem.movementKey));
    state.movementStatuses.unshift(nextItem);

    if (isCloudSessionActive() && cloudDataApi && typeof cloudDataApi.upsertMovementStatus === 'function') {
      const response = await cloudDataApi.upsertMovementStatus({
        id: nextItem.id,
        client_id: clientId,
        movement_name: nextItem.movementName,
        movement_key: nextItem.movementKey,
        status: nextItem.status,
        coach_note: nextItem.coachNote || null,
        evaluated_1rm: nextItem.evaluated1rm,
        last_evaluated_on: nextItem.lastEvaluatedOn || null
      });
      if (response?.error) {
        throw new Error(response.error.message || response.error);
      }
      await refreshSportsDataFromCloud();
      renderClients();
      return;
    }

    persist();
  }

  async function deleteSportsConsiderationById(id) {
    state.sportsConsiderations = (state.sportsConsiderations || []).filter((item) => item.id !== id);
    if (isCloudSessionActive() && cloudDataApi && typeof cloudDataApi.deleteSportsConsideration === 'function') {
      const response = await cloudDataApi.deleteSportsConsideration(id);
      if (response?.error) {
        throw new Error(response.error.message || response.error);
      }
      await refreshSportsDataFromCloud();
      renderClients();
      return;
    }
    persist();
  }

  async function deleteMovementStatusById(id) {
    state.movementStatuses = (state.movementStatuses || []).filter((item) => item.id !== id);
    if (isCloudSessionActive() && cloudDataApi && typeof cloudDataApi.deleteMovementStatus === 'function') {
      const response = await cloudDataApi.deleteMovementStatus(id);
      if (response?.error) {
        throw new Error(response.error.message || response.error);
      }
      await refreshSportsDataFromCloud();
      renderClients();
      return;
    }
    persist();
  }

  function editClientById(clientId) {
    const client = (clientUi.records || []).find((item) => item.id === clientId);
    if (!client) {
      setClientNotice('No se encontró el cliente para editar.', 'bad');
      return;
    }
    toggleClientForm(true, client);
    clientUi.detailId = client.id;
    clientUi.detailType = clientUi.detailType || 'details';
    renderClients();
  }

  function selectClientDetail(clientId, type = 'details') {
    const client = (clientUi.records || []).find((item) => item.id === clientId);
    if (!client) {
      return;
    }
    const panelType = type === 'sports' ? 'sports' : 'details';
    const isOpen = clientUi.detailId === client.id && (clientUi.detailType || 'details') === panelType;
    document.querySelector('[data-client-detail-panel]')?.remove();
    clientUi.detailId = isOpen ? '' : client.id;
    clientUi.detailType = isOpen ? '' : panelType;

    document.querySelectorAll('[data-client-view]').forEach((button) => {
      const expanded = !isOpen && panelType === 'details' && button.getAttribute('data-client-view') === client.id;
      button.textContent = expanded ? 'Cerrar ficha' : 'Ver ficha';
      button.setAttribute('aria-expanded', String(expanded));
    });
    document.querySelectorAll('[data-client-sports]').forEach((button) => {
      const expanded = !isOpen && panelType === 'sports' && button.getAttribute('data-client-sports') === client.id;
      button.textContent = expanded ? 'Cerrar ficha deportiva' : 'Ficha deportiva';
      button.setAttribute('aria-expanded', String(expanded));
    });
    if (isOpen) {
      return;
    }

    const card = [...document.querySelectorAll('[data-client-card]')]
      .find((element) => element.getAttribute('data-client-card') === client.id);
    card?.querySelector('.client-actions')?.insertAdjacentHTML('afterend', panelType === 'sports' ? renderSportsProfilePanel(client) : renderClientDetail(client));
  }

  function getClientAgendaWeekdays(client) {
    const rawDays = String(client.training_days || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const dayAliases = [
      ['lunes', 'lun'],
      ['martes', 'mar'],
      ['miercoles', 'mie'],
      ['jueves', 'jue'],
      ['viernes', 'vie'],
      ['sabado', 'sab'],
      ['domingo', 'dom']
    ];
    const parsed = dayAliases.flatMap((aliases, index) => {
      const pattern = new RegExp(`(^|[^a-z])(${aliases.join('|')})(?=$|[^a-z])`);
      return pattern.test(rawDays) ? [index + 1] : [];
    });
    if (parsed.length) {
      return parsed;
    }
    return [...new Set(getTrainingAssignmentsForClient(client.id).flatMap((assignment) => assignment.weeklyDays || []).map(Number))]
      .filter((weekday) => Number.isInteger(weekday) && weekday >= 1 && weekday <= 7);
  }

  function getAgendaDateValue(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function getAgendaRoutine(clientId, dateValue) {
    const assignment = getActiveTrainingAssignment(clientId);
    const { day } = getSelectedTrainingProgramDay(clientId, assignment);
    if (!day) {
      return assignment ? 'Selecciona una sesión del programa' : 'Sin rutina asignada';
    }
    const dayName = String(day.name || 'Rutina').replace(/^(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mie|jue|vie|sab|dom)\s*[—–-]\s*/i, '') || day.name;
    const exerciseNames = (day.exercises || []).map((exercise) => exercise.exerciseName).filter(Boolean);
    return exerciseNames.length ? `${dayName}: ${exerciseNames.join(', ')}` : dayName;
  }

  function getAgendaSlotsForDate(date) {
    const dateValue = getAgendaDateValue(date);
    const weekday = date.getDay() || 7;
    const dayAliases = [
      ['lunes', 'lun'], ['martes', 'mar'], ['miercoles', 'mie'], ['jueves', 'jue'],
      ['viernes', 'vie'], ['sabado', 'sab'], ['domingo', 'dom']
    ];
    const slotsByKey = new Map();
    getActiveTrainingClients().forEach((client) => {
      if (!getClientAgendaWeekdays(client).includes(weekday)) {
        return;
      }
      const schedule = String(client.schedule_notes || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const namedTimes = [...schedule.matchAll(/\b(lunes|lun|martes|mar|miercoles|mie|jueves|jue|viernes|vie|sabado|sab|domingo|dom)\s+([01]?\d|2[0-3]):([0-5]\d)\b/g)];
      const dayTime = namedTimes.find((match) => dayAliases[weekday - 1].includes(match[1]));
      const timeMatch = dayTime || schedule.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      const hour = dayTime ? dayTime[2] : timeMatch?.[1];
      const minute = dayTime ? dayTime[3] : timeMatch?.[2];
      const time = timeMatch ? `${hour.padStart(2, '0')}:${minute}` : 'Sin hora';
      const modality = client.training_modality === 'group' ? 'group' : 'personalized';
      const groupSize = modality === 'group' ? Number(client.training_group_size || 2) : 1;
      const slotKey = modality === 'group' ? `${time}:group:${groupSize}` : `${time}:client:${client.id}`;
      if (!slotsByKey.has(slotKey)) {
        slotsByKey.set(slotKey, { time, modality, groupSize, students: [] });
      }
      slotsByKey.get(slotKey).students.push({
        id: client.id,
        name: getClientDisplayName(client),
        routine: getAgendaRoutine(client.id, dateValue),
        total: Number(client.sessions_total || 0),
        used: Number(client.sessions_used || 0),
        attendance: null
      });
    });
    return Array.from(slotsByKey.entries()).map(([slotKey, slot]) => {
      const clientIds = slot.students.map((student) => student.id).sort();
      const sessionKey = `${dateValue}:${slotKey}:${clientIds.join(',')}`;
      slot.students.forEach((student) => {
        const client = getClientById(student.id);
        student.attendance = (client?.training_attendance || []).find((entry) => entry.sessionKey === sessionKey) || null;
      });
      return { ...slot, sessionKey, dateValue, key: slotKey };
    }).sort((first, second) => first.time.localeCompare(second.time));
  }

  function renderAgendaSlot(slot, showAttendanceAction = false) {
    const modeLabel = slot.modality === 'group' ? `Grupo (${slot.groupSize})` : 'Personalizado';
    const statusLabels = { attended: 'Asistió', rescheduled: 'Reagendada', no_show: 'No asistió' };
    return `
      <article class="training-agenda-slot">
        <div class="training-agenda-slot-heading"><strong>${escapeHtml(slot.time)}</strong><span class="pill">${modeLabel}</span></div>
        <div class="training-agenda-students">${slot.students.map((student) => `
          <div class="training-agenda-student">
            <div><strong>${escapeHtml(student.name)}</strong><div class="meta">${escapeHtml(student.routine)}</div></div>
            <div class="training-agenda-student-actions">
              <span class="training-session-balance">Sesiones disponibles: ${Math.max(0, student.total - student.used)}/${student.total} — puedes reagendar durante la semana sin problema.</span>
              ${showAttendanceAction ? student.attendance
                ? `<span class="training-attendance-status ${escapeHtml(student.attendance.status)}">${statusLabels[student.attendance.status] || 'Asistió'}</span>`
                : student.total > student.used
                  ? `<button class="secondary small" type="button" data-agenda-attend="${escapeHtml(slot.sessionKey)}" data-client-id="${escapeHtml(student.id)}">Marcar asistencia</button>
                    <button class="secondary small" type="button" data-agenda-reschedule="${escapeHtml(slot.sessionKey)}" data-client-id="${escapeHtml(student.id)}">Cancelar / reagendar</button>
                    <button class="ghost small" type="button" data-agenda-no-show="${escapeHtml(slot.sessionKey)}" data-client-id="${escapeHtml(student.id)}">Marcar no asistió</button>`
                  : '<span class="meta">Plan sin sesiones disponibles</span>'
                : ''}
            </div>
            ${showAttendanceAction && !student.attendance && student.total > student.used ? `
              <form class="agenda-reschedule-form hidden" data-agenda-reschedule-form="${escapeHtml(slot.sessionKey)}" data-client-id="${escapeHtml(student.id)}">
                <label>Fecha de la sesión original<input type="date" name="sessionDate" value="${escapeHtml(slot.dateValue)}" readonly></label>
                <label>Días de anticipación<input type="number" name="noticeDays" min="0" step="1" required></label>
                <label>¿Quién pidió el cambio?<select name="requestedBy" required><option value="">Selecciona</option><option value="student">El alumno</option><option value="coach">El entrenador</option></select></label>
                <label>Motivo<textarea name="reason" rows="2"></textarea></label>
                <p class="notice">Con 7 o más días de aviso, o si lo pidió el entrenador, queda como Reagendada sin descuento. Con menos de 7 días pedido por el alumno, se registra como No asistió y descuenta la sesión.</p>
                <div class="inline-actions"><button class="primary small" type="submit">Confirmar decisión</button><button class="secondary small" type="button" data-agenda-reschedule-close>Cancelar</button></div>
              </form>` : ''}
          </div>`).join('')}
        </div>
      </article>`;
  }

  function renderTrainingAgenda() {
    const today = new Date(`${getTodayLocalDate()}T00:00:00`);
    if (els.trainingAgendaDate) {
      els.trainingAgendaDate.textContent = today.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    const todaySlots = getAgendaSlotsForDate(today);
    if (els.trainingAgendaToday) {
      els.trainingAgendaToday.innerHTML = todaySlots.length
        ? todaySlots.map((slot) => renderAgendaSlot(slot, true)).join('')
        : '<div class="muted">No hay sesiones programadas para hoy.</div>';
    }
    const upcomingSlots = [];
    for (let offset = 1; offset <= 7; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      const dateValue = getAgendaDateValue(date);
      getAgendaSlotsForDate(date).forEach((slot) => upcomingSlots.push({ ...slot, dateLabel: date.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }), dateValue }));
    }
    if (els.trainingAgendaUpcoming) {
      els.trainingAgendaUpcoming.innerHTML = upcomingSlots.length
        ? upcomingSlots.map((slot) => `<div class="training-agenda-upcoming"><strong>${escapeHtml(slot.dateLabel)}</strong>${renderAgendaSlot(slot, false)}</div>`).join('')
        : '<div class="muted">No hay entrenamientos próximos en los siguientes 7 días.</div>';
    }
  }

  function recordAgendaStatus(sessionKey, clientId, status, details = {}) {
    const today = new Date(`${getTodayLocalDate()}T00:00:00`);
    const slot = getAgendaSlotsForDate(today).find((item) => item.sessionKey === sessionKey);
    if (!slot) {
      return;
    }
    const student = slot.students.find((item) => item.id === clientId);
    const client = getClientById(clientId);
    if (!student || !client || student.attendance || Number(client.sessions_used || 0) >= Number(client.sessions_total || 0)) {
      return;
    }
    const markedAt = new Date().toISOString();
    if (!Array.isArray(client.training_attendance)) {
      client.training_attendance = [];
    }
    if (client.training_attendance.some((entry) => entry.sessionKey === sessionKey)) {
      return;
    }
    client.training_attendance.push({
      sessionKey,
      date: slot.dateValue,
      time: slot.time,
      markedAt,
      status,
      reason: String(details.reason || '').trim(),
      noticeDays: details.noticeDays ?? null,
      requestedBy: details.requestedBy || ''
    });
    if (status !== 'rescheduled') {
      client.sessions_used = Math.min(Number(client.sessions_total || 0), Number(client.sessions_used || 0) + 1);
    }
    dataApi.saveState(state);
    render();
  }

  function markAgendaAttendance(sessionKey, clientId) {
    recordAgendaStatus(sessionKey, clientId, 'attended');
  }

  function handleAgendaRescheduleSubmit(form) {
    const formData = new FormData(form);
    const noticeDays = Number(formData.get('noticeDays'));
    const requestedBy = String(formData.get('requestedBy') || '');
    const status = noticeDays >= 7 || requestedBy === 'coach' ? 'rescheduled' : 'no_show';
    recordAgendaStatus(form.getAttribute('data-agenda-reschedule-form'), form.getAttribute('data-client-id'), status, {
      noticeDays,
      requestedBy,
      reason: formData.get('reason')
    });
  }

  function renderTrainings() {
    ensureTrainingsV08State();
    setTrainingView(trainingUi.activeTrainingView || 'today');
    renderProgramAssignedClients();
    renderProgramLibrary();
    fillLibrarySelectOptions();
    renderLibraryExerciseList();
    renderProgramsList();
    const draft = getProgramDraft();
    renderProgramDayList(draft);
    const activeClients = getActiveTrainingClients();
    const selectedClientId = trainingUi.selectedClientId && activeClients.some((client) => client.id === trainingUi.selectedClientId)
      ? trainingUi.selectedClientId
      : (activeClients[0]?.id || '');
    trainingUi.selectedClientId = selectedClientId;

    const selectedClient = getClientById(selectedClientId);
    const selectedAssignment = getActiveTrainingAssignment(selectedClientId);
    if (trainingUi.programDayClientId !== selectedClientId) {
      const savedDayId = selectedClient?.last_training_program_id === selectedAssignment?.id
        ? selectedClient.last_training_day_id
        : '';
      trainingUi.programDayClientId = selectedClientId;
      trainingUi.selectedProgramDayId = selectedAssignment?.days?.some((day) => day.id === savedDayId) ? savedDayId : '';
    }
    if (els.programDaySelect) {
      const dayOptions = (selectedAssignment?.days || []).map((day) => `<option value="${escapeHtml(day.id)}">${escapeHtml(day.name)}</option>`).join('');
      els.programDaySelect.innerHTML = dayOptions || '<option value="">No hay programa activo asignado</option>';
      els.programDaySelect.value = trainingUi.selectedProgramDayId;
      els.programDaySelect.disabled = !dayOptions;
    }
    if (els.programDayMessage) {
      els.programDayMessage.textContent = !selectedAssignment
        ? 'Este alumno no tiene un programa activo asignado.'
        : trainingUi.selectedProgramDayId
          ? 'El día elegido se guardará como parte de la sesión y su historial.'
          : 'Elige manualmente qué día del programa vas a ejecutar.';
    }

    if (!findSessionById(trainingUi.activeSessionId) || findSessionById(trainingUi.activeSessionId)?.clientId !== selectedClientId) {
      setActiveSessionForClient(selectedClientId);
    }

    const clientOptions = activeClients.map((client) => `<option value="${client.id}" ${client.id === selectedClientId ? 'selected' : ''}>${escapeHtml(getClientDisplayName(client))}</option>`).join('');

    if (els.studentId) {
      els.studentId.innerHTML = clientOptions || '<option value="">Primero debes crear un cliente</option>';
      els.studentId.disabled = !activeClients.length;
    }
    if (els.historyClientId) {
      els.historyClientId.innerHTML = clientOptions || '<option value="">Primero debes crear un cliente</option>';
      els.historyClientId.value = selectedClientId;
      els.historyClientId.disabled = !activeClients.length;
    }
    if (els.trainingClientNotice) {
      els.trainingClientNotice.textContent = activeClients.length ? '' : 'Primero debes crear un cliente';
      els.trainingClientNotice.classList.toggle('hidden', Boolean(activeClients.length));
    }

    const sessions = sortSessionsByDateAsc(getTrainingSessionsByClient(selectedClientId));
    const activeSession = getCurrentTrainingSession();
    const currentSession = activeSession && activeSession.clientId === selectedClientId ? activeSession : null;
    if (!currentSession && selectedClientId) {
      setActiveSessionForClient(selectedClientId);
    }
    const confirmedSession = getCurrentTrainingSession();
    const selectedSession = confirmedSession && confirmedSession.clientId === selectedClientId ? confirmedSession : null;

    if (els.trainingSessionId) {
      const sessionOptions = sessions.map((session) => {
        const dateLabel = session.date ? formatClientDate(session.date) : 'Sin fecha';
        return `<option value="${session.id}" ${session.id === selectedSession?.id ? 'selected' : ''}>${escapeHtml(dateLabel)} · ${escapeHtml(session.title || 'Sesión')} · ${escapeHtml(getSessionStatusLabel(session.status))}</option>`;
      }).join('');
      els.trainingSessionId.innerHTML = sessionOptions || '<option value="">No hay sesiones. Crea una nueva.</option>';
      els.trainingSessionId.disabled = !sessions.length;
    }

    if (els.sessionCreateMode && els.sessionTemplateId) {
      const mode = els.sessionCreateMode.value || 'scratch';
      els.sessionTemplateId.disabled = mode !== 'template' || !(state.trainingsV08.plans || []).length;
    }

    if (els.routineDate && (!els.routineDate.value || selectedSession)) {
      els.routineDate.value = selectedSession?.date || getTodayLocalDate();
    }
    if (els.routineName && (!els.routineName.value || selectedSession)) {
      els.routineName.value = selectedSession?.title || getDefaultSessionTitle(selectedClientId);
    }
    if (els.sessionStatus) {
      els.sessionStatus.value = selectedSession?.status || 'planned';
    }
    if (els.sessionNotes) {
      els.sessionNotes.value = selectedSession?.notes || '';
    }

    const knownExercises = getExerciseOptionsForClient(selectedClientId);
    if (!trainingUi.selectedExercise && knownExercises.length && !els.historyExercise?.value) {
      trainingUi.selectedExercise = knownExercises[0];
    }

    if (els.historyExercise) {
      if (!els.historyExercise.value) {
        els.historyExercise.value = trainingUi.selectedExercise || '';
      }
      trainingUi.selectedExercise = els.historyExercise.value || trainingUi.selectedExercise || '';
    }

    if (els.trainingProgressSummary) {
      els.trainingProgressSummary.innerHTML = buildProgressSummary(selectedClientId, trainingUi.selectedExercise);
    }

    const activeExercises = getSessionExercises(selectedSession);
    if (selectedSession) {
      normalizeSessionExerciseOrder(selectedSession);
    }
    if (!activeExercises.some((exercise) => exercise.id === trainingUi.activeExerciseId)) {
      trainingUi.activeExerciseId = activeExercises[0]?.id || '';
    }

    const activeExercise = getCurrentTrainingExercise();
    if (els.coachExerciseList) {
      els.coachExerciseList.innerHTML = selectedSession
        ? (activeExercises.length
          ? activeExercises.map((exercise, index) => `
            <div class="training-set-item ${exercise.id === activeExercise?.id ? 'is-active' : ''}">
              <div>
                <strong>${index + 1}. ${escapeHtml(exercise.exerciseName)}</strong>
                <div class="meta">${Number(exercise.plannedSets || 0)} × ${exercise.plannedRepMin == null || exercise.plannedRepMax == null ? 'reps por definir' : `${Number(exercise.plannedRepMin)}-${Number(exercise.plannedRepMax)} reps`} · ${Number(exercise.restSeconds || 0)} s</div>
                <div class="meta">${Number(exercise.targetWeight || 0) > 0 ? `${Number(exercise.targetWeight || 0)} kg objetivo` : 'Sin peso objetivo'}${exercise.coachNotes ? ` · ${escapeHtml(exercise.coachNotes)}` : ''}</div>
              </div>
              <div class="inline-actions">
                <button class="secondary small" type="button" data-training-select-exercise="${exercise.id}">Usar</button>
                <button class="ghost small" type="button" data-training-edit-exercise="${exercise.id}">Editar</button>
                <button class="ghost small" type="button" data-training-move-up="${exercise.id}" ${index === 0 ? 'disabled' : ''}>Subir</button>
                <button class="ghost small" type="button" data-training-move-down="${exercise.id}" ${index === activeExercises.length - 1 ? 'disabled' : ''}>Bajar</button>
                <button class="danger small" type="button" data-training-delete-exercise="${exercise.id}">Eliminar</button>
              </div>
            </div>`).join('')
          : '<div class="muted">Agrega ejercicios para esta sesión.</div>')
        : '<div class="muted">Crea o selecciona una sesión para planificar ejercicios.</div>';
    }

    const currentExercise = getCurrentTrainingExercise();
    if (currentExercise) {
      trainingUi.selectedExercise = currentExercise.exerciseName;
      if (els.historyExercise && !els.historyExercise.matches(':focus')) {
        els.historyExercise.value = currentExercise.exerciseName;
      }
    }
    const currentSets = getExerciseSets(currentExercise);
    const plannedSets = Number(currentExercise?.plannedSets || 1);
    const nextSetNumber = trainingUi.editingSetNumber || Math.min(currentSets.length + 1, Math.max(plannedSets, 1));

    if (els.currentExerciseTitle) {
      els.currentExerciseTitle.textContent = currentExercise?.exerciseName || 'Serie activa';
    }
    if (els.setProgressLabel) {
      els.setProgressLabel.textContent = `Serie ${nextSetNumber} de ${Math.max(plannedSets, 1)}`;
    }
    if (els.trainingLastRecord) {
      const summary = buildLastSessionSummary(selectedClientId, currentExercise?.exerciseName || trainingUi.selectedExercise, {
        ignoreSessionId: currentSession?.id || ''
      });
      els.trainingLastRecord.textContent = summary;
    }

    if (els.setEntryList) {
      els.setEntryList.innerHTML = currentSets.length
        ? currentSets.map((setEntry) => `
            <div class="training-set-item">
              <div>
                <strong>Serie ${Number(setEntry.setNumber || 0)}</strong>
                <div class="meta">${Number(setEntry.weight || 0)} kg × ${Number(setEntry.reps || 0)} · ${setEntry.rir == null ? 'RIR pendiente' : `RIR ${Number(setEntry.rir)}`} · ${setEntry.completed !== false ? 'Completada' : 'No completada'}</div>
                <div class="meta">${setEntry.personalRecord ? 'Posible nuevo récord' : ''}</div>
              </div>
              <button class="secondary small" type="button" data-set-edit="${Number(setEntry.setNumber || 0)}">Corregir</button>
            </div>`).join('')
        : '<div class="muted">Aún no hay series registradas para este ejercicio.</div>';
    }

    const buckets = getSessionBuckets(selectedClientId);
    const renderBucket = (title, list) => `
      <div class="student-card training-summary-grid">
        <strong>${title}</strong>
        <div class="routine-list">
          ${list.length ? list.map((session) => {
      const doneSets = getSessionExercises(session).reduce((sum, exercise) => sum + getExerciseSets(exercise).filter((setEntry) => setEntry.completed !== false).length, 0);
      const plannedSetsForSession = getSessionExercises(session).reduce((sum, exercise) => sum + Number(exercise.plannedSets || 0), 0);
      return `<div class="routine-pill">
                <div class="section-title">
                  <strong>${escapeHtml(session.title || 'Sesión')}</strong>
                  <span class="tag ${getSessionStatusTone(session.status)}">${escapeHtml(getSessionStatusLabel(session.status))}</span>
                </div>
                <div class="meta">${escapeHtml(formatClientDate(session.date || getTodayLocalDate()))} · ${getSessionExercises(session).length} ejercicios · ${doneSets}/${plannedSetsForSession || 0} series</div>
                <div class="inline-actions">
                  <button class="secondary small" type="button" data-training-open-session="${session.id}">Abrir</button>
                  <button class="ghost small" type="button" data-training-status="${session.id}" data-next-status="in_progress" ${session.status === 'in_progress' ? 'disabled' : ''}>En progreso</button>
                  <button class="ghost small" type="button" data-training-status="${session.id}" data-next-status="completed" ${session.status === 'completed' ? 'disabled' : ''}>Completar</button>
                </div>
              </div>`;
    }).join('') : '<div class="muted">Sin sesiones.</div>'}
        </div>
      </div>`;

    els.trainingsStudents.innerHTML = activeClients.length
      ? `${renderBucket('HOY', buckets.today)}${renderBucket('PRÓXIMAS', buckets.upcoming)}${renderBucket('COMPLETADAS', buckets.completed)}`
      : '<div class="notice">Primero debes crear un cliente</div>';

    ensureDateValue(els.routineDate);
    if (els.restPreset && els.restInput && els.restPreset.value !== 'custom') {
      els.restInput.value = els.restPreset.value;
    }

    if (els.setWeightInput && !els.setWeightInput.value && currentExercise) {
      const fallbackWeight = Number(currentExercise.targetWeight || 0);
      if (fallbackWeight > 0) {
        els.setWeightInput.value = String(fallbackWeight);
      }
    }

    if (els.saveSetBtn) {
      els.saveSetBtn.disabled = !(currentSession && currentExercise);
    }

    renderTemplateList();
  }

  function renderSettings() {
    els.reserve.value = state.profile.minimum_reserve || 0;
    els.magicBudget.value = state.settings.magic_budget || 0;
    els.antBudget.value = state.settings.ant_budget || 0;
    els.savingsGoal.value = state.profile.savings_goal || 0;
    els.coachWhatsAppNumber.value = String(state.settings.coach_whatsapp_number || '');
    renderOnboardingQr();
    if (els.accountSettings) {
      els.accountSettings.innerHTML = (state.accounts || []).map((account) => `
        <div class="list-item">
          <div>
            <strong>${escapeHtml(account.name)}</strong>
            <div class="meta">Saldo inicial ${financeApi.formatCurrency(account.initialBalance || 0)}</div>
          </div>
          <div class="inline-actions">
            <label class="muted"><input type="checkbox" data-account-toggle="${account.id}" ${account.isActive !== false ? 'checked' : ''}> Activa</label>
            <label class="muted"><input type="radio" name="mainAccount" data-account-main="${account.id}" ${account.isMain ? 'checked' : ''}> Principal</label>
            <button class="ghost small" type="button" data-account-balance="${account.id}">Editar saldo</button>
          </div>
        </div>`).join('');
    }
  }

  function getOnboardingUrl() {
    const currentUrl = window.location.protocol === 'file:'
      ? 'https://gbnpm24hng-byte.github.io/Valhalla/index.html'
      : window.location.href;
    const onboardingUrl = new URL(currentUrl);
    onboardingUrl.search = '';
    onboardingUrl.hash = '';
    onboardingUrl.searchParams.set('onboarding', '1');
    const coachNumber = String(state.settings.coach_whatsapp_number || '').replace(/\D/g, '');
    if (coachNumber) {
      onboardingUrl.searchParams.set('coach', coachNumber);
    }
    return onboardingUrl.toString();
  }

  function renderOnboardingQr() {
    if (!els.onboardingUrl || !els.onboardingQr) {
      return;
    }
    const onboardingUrl = getOnboardingUrl();
    els.onboardingUrl.value = onboardingUrl;
    if (!window.qrcode) {
      els.onboardingQr.textContent = 'No se pudo cargar el generador QR local.';
      return;
    }
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(onboardingUrl, 'Byte');
      qr.make();
      els.onboardingQr.innerHTML = qr.createSvgTag({
        cellSize: 4,
        margin: 16,
        title: { text: 'Código QR para ingreso de alumnos' },
        alt: { text: `Abrir ${onboardingUrl}` }
      });
      if (els.onboardingQrMessage) {
        els.onboardingQrMessage.textContent = state.settings.coach_whatsapp_number
          ? 'El QR incluye el número de WhatsApp configurado.'
          : 'Configura el número de WhatsApp para que el formulario pueda enviar el ingreso.';
      }
    } catch (error) {
      els.onboardingQr.textContent = 'No se pudo generar el código QR.';
      if (els.onboardingQrMessage) {
        els.onboardingQrMessage.textContent = error.message || 'Error al generar QR.';
      }
    }
  }

  async function copyOnboardingUrl() {
    const url = els.onboardingUrl?.value || getOnboardingUrl();
    try {
      await navigator.clipboard.writeText(url);
      els.onboardingQrMessage.textContent = 'Link copiado.';
    } catch (_) {
      els.onboardingUrl.focus();
      els.onboardingUrl.select();
      const copied = document.execCommand('copy');
      els.onboardingQrMessage.textContent = copied ? 'Link copiado.' : 'Selecciona el link para copiarlo.';
    }
  }

  function createEmptyMeal() {
    return {
      id: dataApi.createId('meal'),
      mealName: '',
      time: '',
      blocks: [{ type: '', quantity: '', unit: '', options: '' }]
    };
  }

  function createEmptyDay(dayNumber) {
    return {
      dayNumber,
      name: `Día ${dayNumber}`,
      description: '',
      carbohydrateLevel: '',
      meals: [createEmptyMeal()],
      supplements: '',
      instructions: ''
    };
  }

  function createDraftPlan() {
    return {
      id: dataApi.createId('plan'),
      name: '',
      description: '',
      cycleLength: 10,
      freeDay: true,
      waterMinLiters: 3,
      waterMaxLiters: 5,
      active: true,
      days: [createEmptyDay(1)]
    };
  }

  function getNutritionPlanDraft() {
    if (!nutritionUi.editingPlanId) {
      return createDraftPlan();
    }
    const existing = state.nutritionPlans.find((plan) => plan.id === nutritionUi.editingPlanId);
    return existing ? JSON.parse(JSON.stringify(existing)) : createDraftPlan();
  }

  function setNutritionPlanDraft(plan) {
    nutritionUi.planDraft = plan;
  }

  function renderNutritionPlanEditor() {
    const plan = nutritionUi.planDraft || getNutritionPlanDraft();
    const daysMarkup = (plan.days || []).map((day, dayIndex) => `
      <div class="nutrition-day-card">
        <div class="section-title">
          <h4>${escapeHtml(day.name || `Día ${dayIndex + 1}`)}</h4>
          <button class="ghost small" type="button" data-plan-action="remove-day" data-day-index="${dayIndex}">Eliminar día</button>
        </div>
        <div class="row">
          <div>
            <label>Nombre del día</label>
            <input data-kind="day" data-field="name" data-day-index="${dayIndex}" value="${escapeHtml(day.name || '')}">
          </div>
          <div>
            <label>Carbohidratos</label>
            <input data-kind="day" data-field="carbohydrateLevel" data-day-index="${dayIndex}" value="${escapeHtml(day.carbohydrateLevel || '')}" placeholder="bajo, medio, libre">
          </div>
        </div>
        <div>
          <label>Descripción</label>
          <textarea data-kind="day" data-field="description" data-day-index="${dayIndex}">${escapeHtml(day.description || '')}</textarea>
        </div>
        <div class="row">
          <div>
            <label>Suplementos</label>
            <input data-kind="day" data-field="supplements" data-day-index="${dayIndex}" value="${escapeHtml(day.supplements || '')}">
          </div>
          <div>
            <label>Instrucciones</label>
            <input data-kind="day" data-field="instructions" data-day-index="${dayIndex}" value="${escapeHtml(day.instructions || '')}">
          </div>
        </div>
        <div class="nutrition-meals">
          ${(day.meals || []).map((meal, mealIndex) => `
            <div class="nutrition-meal-card">
              <div class="section-title">
                <h5>Comida ${mealIndex + 1}</h5>
                <button class="ghost small" type="button" data-plan-action="remove-meal" data-day-index="${dayIndex}" data-meal-index="${mealIndex}">Eliminar comida</button>
              </div>
              <div class="row">
                <div>
                  <label>Nombre</label>
                  <input data-kind="meal" data-field="mealName" data-day-index="${dayIndex}" data-meal-index="${mealIndex}" value="${escapeHtml(meal.mealName || '')}">
                </div>
                <div>
                  <label>Hora</label>
                  <input data-kind="meal" data-field="time" data-day-index="${dayIndex}" data-meal-index="${mealIndex}" value="${escapeHtml(meal.time || '')}">
                </div>
              </div>
              <div class="nutrition-blocks">
                ${(meal.blocks || []).map((block, blockIndex) => `
                  <div class="nutrition-block-card">
                    <div class="section-title">
                      <h6>Bloque ${blockIndex + 1}</h6>
                      <button class="ghost small" type="button" data-plan-action="remove-block" data-day-index="${dayIndex}" data-meal-index="${mealIndex}" data-block-index="${blockIndex}">Eliminar</button>
                    </div>
                    <div class="row">
                      <div>
                        <label>Tipo</label>
                        <input data-kind="block" data-field="type" data-day-index="${dayIndex}" data-meal-index="${mealIndex}" data-block-index="${blockIndex}" value="${escapeHtml(block.type || '')}" placeholder="Proteína">
                      </div>
                      <div>
                        <label>Cantidad</label>
                        <input data-kind="block" data-field="quantity" data-day-index="${dayIndex}" data-meal-index="${mealIndex}" data-block-index="${blockIndex}" value="${escapeHtml(block.quantity || '')}">
                      </div>
                    </div>
                    <div class="row">
                      <div>
                        <label>Unidad</label>
                        <input data-kind="block" data-field="unit" data-day-index="${dayIndex}" data-meal-index="${mealIndex}" data-block-index="${blockIndex}" value="${escapeHtml(block.unit || '')}">
                      </div>
                      <div>
                        <label>Alternativas</label>
                        <input data-kind="block" data-field="options" data-day-index="${dayIndex}" data-meal-index="${mealIndex}" data-block-index="${blockIndex}" value="${escapeHtml(block.options || '')}">
                      </div>
                    </div>
                  </div>`).join('')}
              </div>
              <button class="secondary small" type="button" data-plan-action="add-block" data-day-index="${dayIndex}" data-meal-index="${mealIndex}">Agregar bloque</button>
            </div>`).join('')}
        </div>
        <button class="secondary small" type="button" data-plan-action="add-meal" data-day-index="${dayIndex}">Agregar comida</button>
      </div>`).join('');

    return `
      <div class="nutrition-day-list">
        ${daysMarkup}
        <button class="secondary small" type="button" data-plan-action="add-day">Agregar día</button>
      </div>`;
  }

  function renderNutritionPlans() {
    const plansMarkup = state.nutritionPlans.map((plan) => `
      <div class="nutrition-plan-card">
        <div>
          <strong>${escapeHtml(plan.name)}</strong>
          <div class="meta">${escapeHtml(plan.description || 'Sin descripción')}</div>
          <div class="meta">Duración ${plan.cycleLength || 0} días · ${plan.days.length || 0} comidas · ${plan.freeDay ? 'Día libre' : 'Sin día libre'}</div>
        </div>
        <div class="inline-actions">
          <button class="ghost small" type="button" data-plan-action="edit" data-plan-id="${plan.id}">Editar</button>
          <button class="ghost small" type="button" data-plan-action="duplicate" data-plan-id="${plan.id}">Duplicar</button>
          <button class="${plan.active ? 'secondary' : 'primary'} small" type="button" data-plan-action="toggle-active" data-plan-id="${plan.id}">${plan.active ? 'Desactivar' : 'Activar'}</button>
        </div>
      </div>`).join('');

    els.nutritionPlans.innerHTML = `
      <div class="card nutrition-panel">
        <div class="section-title">
          <h3>Planes</h3>
          <button class="primary small" type="button" data-plan-action="create">Crear plan</button>
        </div>
        <div class="nutrition-list">${plansMarkup || '<div class="muted">Sin planes guardados.</div>'}</div>
        <form id="nutritionPlanForm" class="form-grid">
          <div class="row">
            <div>
              <label>Nombre del plan</label>
              <input id="planName" name="planName" value="${escapeHtml((nutritionUi.planDraft || getNutritionPlanDraft()).name || '')}">
            </div>
            <div>
              <label>Descripción</label>
              <input id="planDescription" name="planDescription" value="${escapeHtml((nutritionUi.planDraft || getNutritionPlanDraft()).description || '')}">
            </div>
          </div>
          <div class="row">
            <div>
              <label>Días</label>
              <input id="planCycleLength" name="planCycleLength" type="number" min="1" value="${Number((nutritionUi.planDraft || getNutritionPlanDraft()).cycleLength || 10)}">
            </div>
            <div>
              <label>Día libre</label>
              <select id="planFreeDay" name="planFreeDay">
                <option value="true" ${(nutritionUi.planDraft || getNutritionPlanDraft()).freeDay ? 'selected' : ''}>Sí</option>
                <option value="false" ${(nutritionUi.planDraft || getNutritionPlanDraft()).freeDay ? '' : 'selected'}>No</option>
              </select>
            </div>
          </div>
          <div class="row">
            <div>
              <label>Agua mínima (L)</label>
              <input id="planWaterMin" name="planWaterMin" type="number" step="0.1" value="${Number((nutritionUi.planDraft || getNutritionPlanDraft()).waterMinLiters || 3)}">
            </div>
            <div>
              <label>Agua máxima (L)</label>
              <input id="planWaterMax" name="planWaterMax" type="number" step="0.1" value="${Number((nutritionUi.planDraft || getNutritionPlanDraft()).waterMaxLiters || 5)}">
            </div>
          </div>
          <div>
            <label>Estado</label>
            <select id="planActive" name="planActive">
              <option value="true" ${((nutritionUi.planDraft || getNutritionPlanDraft()).active ?? true) ? 'selected' : ''}>Activo</option>
              <option value="false" ${((nutritionUi.planDraft || getNutritionPlanDraft()).active ?? true) ? '' : 'selected'}>Inactivo</option>
            </select>
          </div>
          <div id="nutritionPlanEditor">${renderNutritionPlanEditor()}</div>
          <button class="primary" type="submit">Guardar cambios</button>
        </form>
      </div>`;

    const planForm = document.getElementById('nutritionPlanForm');
    if (planForm) {
      planForm.addEventListener('submit', handleNutritionPlanSubmit);
    }
  }

  function renderNutritionAssignment() {
    const activeProfile = nutritionUi.selectedClientId ? getActiveNutritionProfile(nutritionUi.selectedClientId) : null;
    const clientOptions = state.clients.map((client) => `<option value="${client.id}" ${nutritionUi.selectedClientId === client.id ? 'selected' : ''}>${escapeHtml(client.name)}</option>`).join('');
    const selectedPlanId = activeProfile?.currentPlanId || '';
    els.nutritionAssignment.innerHTML = `
      <div class="card nutrition-panel">
        <div class="section-title">
          <h3>Asignación</h3>
        </div>
        <form id="nutritionProfileForm" class="form-grid">
          <div>
            <label>Alumno</label>
            <select id="nutritionClientSelect" name="clientId">${clientOptions}</select>
          </div>
          <div>
            <label>Objetivo</label>
            <input id="nutritionObjective" name="objective" value="${escapeHtml(activeProfile?.objective || '')}">
          </div>
          <div>
            <label>Tipo de alimentación</label>
            <select id="nutritionDietType" name="dietType">
              <option value="Tradicional" ${activeProfile?.dietType === 'Tradicional' ? 'selected' : ''}>Tradicional</option>
              <option value="Vegetariana" ${activeProfile?.dietType === 'Vegetariana' ? 'selected' : ''}>Vegetariana</option>
              <option value="Ovo-lacto vegetariana" ${activeProfile?.dietType === 'Ovo-lacto vegetariana' ? 'selected' : ''}>Ovo-lacto vegetariana</option>
              <option value="Pescetariana" ${activeProfile?.dietType === 'Pescetariana' ? 'selected' : ''}>Pescetariana</option>
              <option value="Personalizada" ${activeProfile?.dietType === 'Personalizada' ? 'selected' : ''}>Personalizada</option>
            </select>
          </div>
          <div>
            <label>Restricciones</label>
            <textarea id="nutritionRestrictions" name="restrictions">${escapeHtml(activeProfile?.restrictions || '')}</textarea>
          </div>
          <div class="row">
            <div>
              <label>Fecha de inicio</label>
              <input id="nutritionStartDate" name="cycleStartDate" type="date" value="${escapeHtml(activeProfile?.cycleStartDate || '')}">
            </div>
            <div>
              <label>Plan asignado</label>
              <select id="nutritionPlanSelect" name="currentPlanId">
                <option value="">Sin plan</option>
                ${state.nutritionPlans.map((plan) => `<option value="${plan.id}" ${selectedPlanId === plan.id ? 'selected' : ''}>${escapeHtml(plan.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div>
            <label>Notas</label>
            <textarea id="nutritionNotes" name="notes">${escapeHtml(activeProfile?.notes || '')}</textarea>
          </div>
          <button class="primary" type="submit">Guardar perfil nutricional</button>
        </form>
      </div>`;
    document.getElementById('nutritionProfileForm')?.addEventListener('submit', handleNutritionProfileSubmit);
  }

  function renderNutritionDaily() {
    const clientId = nutritionUi.selectedClientId || state.clients[0]?.id || '';
    const profile = getActiveNutritionProfile(clientId);
    const plan = getSelectedPlan(profile);
    const cycleDay = profile ? getCycleDay(profile, nutritionUi.dailyDate) : 1;
    const currentDay = plan?.days.find((day) => Number(day.dayNumber) === cycleDay) || plan?.days[0] || null;
    const mealOptions = currentDay?.meals?.map((meal, index) => `
      <label class="nutrition-check-item">
        <input type="checkbox" name="completedMeals" value="${meal.id}">
        <span>${escapeHtml(meal.mealName || `Comida ${index + 1}`)} · ${escapeHtml(meal.time || 'Sin hora')}</span>
      </label>`).join('') || '<div class="muted">Sin comidas asignadas para este día.</div>';

    els.nutritionDaily.innerHTML = `
      <div class="card nutrition-panel">
        <div class="section-title">
          <h3>Vista diaria</h3>
        </div>
        <form id="nutritionDailyForm" class="form-grid">
          <div class="row">
            <div>
              <label>Alumno</label>
              <select id="dailyClientSelect" name="clientId">${state.clients.map((client) => `<option value="${client.id}" ${client.id === clientId ? 'selected' : ''}>${escapeHtml(client.name)}</option>`).join('')}</select>
            </div>
            <div>
              <label>Fecha</label>
              <input id="dailyDateInput" name="date" type="date" value="${escapeHtml(nutritionUi.dailyDate)}">
            </div>
          </div>
          <div class="row">
            <div>
              <label>Día del ciclo</label>
              <input id="dailyCycleDay" value="${cycleDay}" readonly>
            </div>
            <div>
              <label>Plan</label>
              <input value="${escapeHtml(plan?.name || 'Sin plan')}" readonly>
            </div>
          </div>
          <div>
            <label>Comidas del día</label>
            <div class="nutrition-check-list">${mealOptions}</div>
          </div>
          <div class="row">
            <div>
              <label>Agua consumida (L)</label>
              <input id="dailyWater" name="waterLiters" type="number" step="0.1" value="0">
            </div>
            <div>
              <label>Suplementos completados</label>
              <select id="dailySupplements" name="supplementsCompleted">
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>
          <div class="row">
            <div>
              <label>Energía 1-5</label>
              <input id="dailyEnergy" name="energy" type="number" min="1" max="5" value="3">
            </div>
            <div>
              <label>Hambre 1-5</label>
              <input id="dailyHunger" name="hunger" type="number" min="1" max="5" value="3">
            </div>
          </div>
          <div class="row">
            <div>
              <label>Digestión</label>
              <select id="dailyDigestion" name="digestion">
                <option value="Buena">Buena</option>
                <option value="Regular">Regular</option>
                <option value="Mala">Mala</option>
              </select>
            </div>
            <div>
              <label>Peso (kg, opcional)</label>
              <input id="dailyWeight" name="weight" type="number" step="0.1">
            </div>
          </div>
          <div>
            <label>Observaciones</label>
            <textarea id="dailyNotes" name="notes"></textarea>
          </div>
          <button class="primary" type="submit">Guardar registro</button>
        </form>
      </div>`;
    document.getElementById('nutritionDailyForm')?.addEventListener('submit', handleNutritionDailySubmit);
  }

  function renderNutritionProgress() {
    const clientId = nutritionUi.selectedClientId || state.clients[0]?.id || '';
    const profile = getActiveNutritionProfile(clientId);
    const logs = state.nutritionLogs.filter((log) => log.clientId === clientId).slice(-7);
    const averageWater = logs.length ? logs.reduce((sum, log) => sum + Number(log.waterLiters || 0), 0) / logs.length : 0;
    const averageEnergy = logs.length ? logs.reduce((sum, log) => sum + Number(log.energy || 0), 0) / logs.length : 0;
    const averageHunger = logs.length ? logs.reduce((sum, log) => sum + Number(log.hunger || 0), 0) / logs.length : 0;
    const compliance = getNutritionCompliance(clientId, 7);
    const latestWeight = logs.filter((log) => log.weight !== '' && log.weight !== undefined && log.weight !== null).slice(-5);
    const daysWithout = profile ? Math.max(0, 7 - logs.length) : 0;

    els.nutritionProgress.innerHTML = `
      <div class="card nutrition-panel">
        <div class="section-title">
          <h3>Progreso</h3>
        </div>
        <div class="nutrition-metrics-grid">
          <div class="card metric-card">
            <small>Cumplimiento semanal</small>
            <strong>${compliance}%</strong>
            <div class="progress-bar"><span style="width:${Math.min(100, compliance)}%"></span></div>
          </div>
          <div class="card metric-card">
            <small>Agua promedio</small>
            <strong>${averageWater.toFixed(1)} L</strong>
          </div>
          <div class="card metric-card">
            <small>Energía promedio</small>
            <strong>${averageEnergy.toFixed(1)}/5</strong>
          </div>
          <div class="card metric-card">
            <small>Hambre promedio</small>
            <strong>${averageHunger.toFixed(1)}/5</strong>
          </div>
        </div>
        <div class="row">
          <div>
            <h4>Historial de peso</h4>
            <div class="nutrition-list">${latestWeight.length ? latestWeight.map((log) => `<div class="list-item"><div><strong>${escapeHtml(log.date)}</strong><div class="meta">Peso registrado</div></div><div>${log.weight} kg</div></div>`).join('') : '<div class="muted">Sin pesos registrados.</div>'}</div>
          </div>
          <div>
            <h4>Alertas</h4>
            <div class="nutrition-list">${getNutritionAlerts(clientId).length ? getNutritionAlerts(clientId).map((item) => `<div class="notice">${escapeHtml(item)}</div>`).join('') : '<div class="muted">Sin alertas para revisión.</div>'}</div>
          </div>
        </div>
        <div class="row">
          <div>
            <h4>Días sin registro</h4>
            <div class="notice">${daysWithout} días desde el último registro.</div>
          </div>
          <div>
            <h4>Registros recientes</h4>
            <div class="nutrition-list">${logs.length ? logs.map((log) => `<div class="list-item"><div><strong>${escapeHtml(log.date)}</strong><div class="meta">${log.completedMeals}/${log.totalMeals} comidas · ${log.waterLiters} L</div></div><button class="danger small" data-log-delete="${log.id}" type="button">Eliminar</button></div>`).join('') : '<div class="muted">Sin registros todavía.</div>'}</div>
          </div>
        </div>
      </div>`;
  }

  function renderNutritionSummary() {
    const activeProfiles = state.nutritionProfiles.filter((profile) => profile.active);
    const compliance = activeProfiles.length ? Math.round(activeProfiles.reduce((sum, profile) => sum + getNutritionCompliance(profile.clientId, 7), 0) / activeProfiles.length) : 0;
    const withoutRecent = activeProfiles.filter((profile) => {
      const logs = state.nutritionLogs.filter((log) => log.clientId === profile.clientId).slice(-3);
      return !logs.length;
    });
    const nextControls = activeProfiles.slice(0, 3).map((profile) => {
      const clientName = getClientName(profile.clientId);
      return `<div class="list-item"><div><strong>${escapeHtml(clientName)}</strong><div class="meta">Control sugerido en 3 días o al finalizar el ciclo.</div></div><div>${escapeHtml(profile.objective || 'Objetivo sin definir')}</div></div>`;
    }).join('');

    els.nutritionSummary.innerHTML = `
      <div class="card nutrition-panel">
        <div class="section-title">
          <h3>Resumen</h3>
        </div>
        <div class="nutrition-metrics-grid">
          <div class="card metric-card">
            <small>Alumnos con pauta activa</small>
            <strong>${activeProfiles.length}</strong>
          </div>
          <div class="card metric-card">
            <small>Cumplimiento promedio 7 días</small>
            <strong>${compliance}%</strong>
          </div>
          <div class="card metric-card">
            <small>Próximos controles</small>
            <strong>${activeProfiles.length}</strong>
          </div>
          <div class="card metric-card">
            <small>Sin registro reciente</small>
            <strong>${withoutRecent.length}</strong>
          </div>
        </div>
        <div class="row">
          <div>
            <h4>Alertas de revisión</h4>
            <div class="nutrition-list">${activeProfiles.length ? activeProfiles.map((profile) => {
              const alerts = getNutritionAlerts(profile.clientId);
              return alerts.length ? `<div class="notice"><strong>${escapeHtml(getClientName(profile.clientId))}</strong><div>${alerts.map((item) => `<div>${escapeHtml(item)}</div>`).join('')}</div></div>` : '';
            }).join('') : '<div class="muted">No hay alertas por revisar.</div>'}</div>
          </div>
          <div>
            <h4>Próximos controles</h4>
            <div class="nutrition-list">${nextControls || '<div class="muted">Sin próximos controles definidos.</div>'}</div>
          </div>
        </div>
      </div>`;
  }

  function renderNutrition() {
    renderNutritionSummary();
    renderNutritionPlans();
    renderNutritionAssignment();
    renderNutritionDaily();
    renderNutritionProgress();
  }

  function render() {
    renderDashboard();
    renderClients();
    renderTrainings();
    renderStudentTraining();
    renderSettings();
    renderNutrition();
  }

  function handleMovementSubmit(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(els.form));
    const selectedDate = payload.date || getTodayLocalDate();
    const result = financeApi.addMovement(state, {
      type: payload.type,
      amount: Number(payload.amount || 0),
      category: payload.category || 'Otro',
      date: selectedDate,
      description: payload.description || payload.category || 'Movimiento',
      segment: payload.segment || 'personal',
      accountId: payload.accountId || (state.accounts.find((account) => account.isMain)?.id || '')
    });

    if (!result.success) {
      els.formMessage.innerHTML = `<span class="bad">${result.errors.join(', ')}</span>`;
      return;
    }

    els.form.reset();
    const dateInput = document.getElementById('date');
    if (dateInput) {
      dateInput.value = selectedDate;
    }
    els.formMessage.innerHTML = '<span class="ok">Movimiento guardado correctamente. Revisa el resumen y el historial.</span>';
    persist();
  }

  function handleInitialCashSubmit(event) {
    event.preventDefault();
    state.profile.initial_cash = Number(els.initialCashInput.value || 0);
    persist();
  }

  function handleSettingsSubmit(event) {
    event.preventDefault();
    state.profile.minimum_reserve = Number(els.reserve.value || 0);
    state.profile.savings_goal = Number(els.savingsGoal.value || 0);
    state.settings.magic_budget = Number(els.magicBudget.value || 0);
    state.settings.ant_budget = Number(els.antBudget.value || 0);
    state.settings.coach_whatsapp_number = String(els.coachWhatsAppNumber.value || '').replace(/\D/g, '');
    persist();
  }

  async function handleRoutineSubmit(event) {
    event.preventDefault();
    ensureTrainingsV08State();
    const activeClients = getActiveTrainingClients();
    if (!activeClients.length) {
      els.routineMessage.textContent = 'Primero debes crear un cliente';
      return;
    }

    const payload = Object.fromEntries(new FormData(els.routineForm));
    const clientId = payload.clientId || payload.studentId || '';
    if (!clientId) {
      els.routineMessage.textContent = 'Selecciona un cliente activo.';
      return;
    }

    trainingUi.selectedClientId = clientId;

    let activeSession = findSessionById(payload.sessionId || trainingUi.activeSessionId);
    if (!activeSession || activeSession.clientId !== clientId) {
      const createResult = await createSessionForClient(clientId);
      if (!createResult.ok) {
        els.routineMessage.textContent = createResult.error || 'No se pudo crear la sesión.';
        return;
      }
      activeSession = createResult.session;
    }

    activeSession.date = payload.date || getTodayLocalDate();
    activeSession.title = String(payload.title || '').trim() || getDefaultSessionTitle(clientId);
    activeSession.status = payload.status || 'planned';
    activeSession.notes = String(payload.sessionNotes || '').trim();

    const exerciseName = String(payload.exerciseName || payload.exercise || '').trim();
    if (!exerciseName) {
      els.routineMessage.textContent = 'Escribe el ejercicio.';
      return;
    }

    const plannedSets = Math.max(1, Number(payload.plannedSets || payload.sets || 1));
    const plannedRepMin = Math.max(1, Number(payload.plannedRepMin || payload.reps || 1));
    const plannedRepMaxRaw = Number(payload.plannedRepMax || plannedRepMin);
    const plannedRepMax = plannedRepMaxRaw >= plannedRepMin ? plannedRepMaxRaw : plannedRepMin;
    const targetWeight = Math.max(0, Number(payload.targetWeight || payload.weight || 0));
    const restSeconds = payload.restPreset === 'custom'
      ? Math.max(1, parseInt(String(payload.restSeconds || payload.rest || '90').replace(/\D/g, ''), 10) || 90)
      : Math.max(1, Number(payload.restPreset || 90));

    const requestedExerciseId = String(payload.exerciseId || trainingUi.editingExerciseId || '').trim();
    let exercise = requestedExerciseId
      ? getSessionExercises(activeSession).find((item) => item.id === requestedExerciseId)
      : null;
    if (!exercise) {
      exercise = getSessionExercises(activeSession).find((item) => String(item.exerciseName || '').trim().toLowerCase() === exerciseName.toLowerCase());
    }

    if (!exercise) {
      exercise = {
        id: dataApi.createId('tx-exercise'),
        exerciseName,
        order: getSessionExercises(activeSession).length + 1,
        plannedSets,
        plannedRepMin,
        plannedRepMax,
        targetWeight,
        restSeconds,
        coachNotes: String(payload.coachNotes || payload.techniqueNotes || '').trim(),
        sets: []
      };
      activeSession.exercises.push(exercise);
    } else {
      exercise.plannedSets = plannedSets;
      exercise.plannedRepMin = plannedRepMin;
      exercise.plannedRepMax = plannedRepMax;
      exercise.targetWeight = targetWeight;
      exercise.restSeconds = restSeconds;
      exercise.coachNotes = String(payload.coachNotes || payload.techniqueNotes || '').trim();
    }

    normalizeSessionExerciseOrder(activeSession);

    trainingUi.selectedClientId = clientId;
    trainingUi.selectedExercise = exerciseName;
    trainingUi.activeSessionId = activeSession.id;
    trainingUi.activeExerciseId = exercise.id;
    trainingUi.editingSetNumber = null;
    trainingUi.editingExerciseId = '';
    if (els.editingSetNumber) {
      els.editingSetNumber.value = '';
    }
    if (els.exerciseIdInput) {
      els.exerciseIdInput.value = '';
    }
    if (els.setWeightInput) {
      const previousSet = getExerciseSets(exercise)[getExerciseSets(exercise).length - 1] || null;
      els.setWeightInput.value = String(previousSet ? Number(previousSet.weight || 0) : targetWeight || 0);
    }
    if (els.setRepsInput) {
      els.setRepsInput.value = '';
    }
    if (els.historyClientId) {
      els.historyClientId.value = clientId;
    }
    if (els.historyExercise) {
      els.historyExercise.value = exerciseName;
    }

    if (isCloudSessionActive()) {
      const syncResult = await syncSessionToCloud(activeSession);
      if (!syncResult.ok) {
        els.routineMessage.textContent = syncResult.error || 'No se pudo sincronizar la sesión en Cloud.';
        return;
      }
      els.routineMessage.textContent = requestedExerciseId ? 'Ejercicio actualizado y sincronizado en Cloud.' : 'Ejercicio guardado y sincronizado en Cloud.';
      renderTrainings();
      return;
    }

    els.routineMessage.textContent = requestedExerciseId ? 'Ejercicio actualizado.' : 'Ejercicio guardado. Ahora registra serie por serie.';
    persist();
  }

  async function saveTrainingSetEntry() {
    ensureTrainingsV08State();
    const session = getCurrentTrainingSession();
    const exercise = getCurrentTrainingExercise();
    if (!session || !exercise) {
      if (els.routineMessage) {
        els.routineMessage.textContent = 'Primero prepara un ejercicio para la sesión.';
      }
      return;
    }

    if (session.status === 'planned') {
      session.status = 'in_progress';
    }

    const weight = Number(els.setWeightInput?.value || 0);
    const reps = Number(els.setRepsInput?.value || 0);
    const rirValue = String(els.setRirInput?.value || '').trim();
    const rir = rirValue ? Number(rirValue) : null;
    const completed = els.setCompletedInput ? els.setCompletedInput.checked : true;
    if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(reps) || reps < 0 || (rir !== null && (!Number.isFinite(rir) || rir < 0 || rir > 10))) {
      if (els.setRecordNotice) {
        els.setRecordNotice.textContent = 'Peso y repeticiones deben ser válidos.';
      }
      return;
    }

    const sets = getExerciseSets(exercise);
    const requestedSetNumber = Number(els.editingSetNumber?.value || trainingUi.editingSetNumber || 0);
    const nextSetNumber = requestedSetNumber || (sets.length + 1);
    const previousBestWeight = getBestWeightForExercise(session.clientId, exercise.exerciseName, { ignoreSessionId: session.id });
    const isPotentialPr = weight > previousBestWeight && weight > 0;

    const existingSet = sets.find((setEntry) => Number(setEntry.setNumber || 0) === Number(nextSetNumber));
    if (existingSet) {
      existingSet.weight = weight;
      existingSet.reps = reps;
      existingSet.rir = rir;
      existingSet.completed = completed;
      existingSet.setType = getSetType(existingSet);
      existingSet.techniqueStatus = existingSet.techniqueStatus || 'pending';
      existingSet.coachValidated = Boolean(existingSet.coachValidated);
      existingSet.personalRecord = isPotentialPr;
    } else {
      sets.push({
        setNumber: nextSetNumber,
        weight,
        reps,
        rir,
        completed,
        setType: 'S',
        createdAt: new Date().toISOString(),
        techniqueStatus: 'pending',
        coachValidated: false,
        personalRecord: isPotentialPr
      });
    }

    sets.sort((a, b) => Number(a.setNumber || 0) - Number(b.setNumber || 0));
    trainingUi.editingSetNumber = null;
    if (els.editingSetNumber) {
      els.editingSetNumber.value = '';
    }
    if (els.setRepsInput) {
      els.setRepsInput.value = '';
    }
    if (els.setRirInput) {
      els.setRirInput.value = '';
    }
    if (els.setRecordNotice) {
      els.setRecordNotice.textContent = isPotentialPr ? '🏆 Posible nuevo récord' : 'Serie guardada.';
    }
    const plannedSets = Math.max(1, Number(exercise.plannedSets || 1));
    const doneSets = sets.filter((setEntry) => setEntry.completed !== false).length;
    const exerciseCompleted = plannedSets > 0 && doneSets >= plannedSets;
    const completionFeedback = exerciseCompleted ? getExerciseCompletionFeedback(session.clientId, exercise, session.id) : null;
    if (exerciseCompleted && completionFeedback?.suggestion && els.setRecordNotice) {
      const comparisonText = completionFeedback.comparison?.status !== 'no_data'
        ? ` ${completionFeedback.comparison.headline}.`
        : '';
      els.setRecordNotice.textContent = `${completionFeedback.suggestion.badge}. ${completionFeedback.suggestion.message}${comparisonText}`;
    }
    if (isCloudSessionActive()) {
      const syncResult = await syncSessionToCloud(session);
      if (!syncResult.ok) {
        if (els.routineMessage) {
          els.routineMessage.textContent = syncResult.error || 'No se pudo sincronizar la serie en Cloud.';
        }
        return;
      }
      if (els.routineMessage) {
        els.routineMessage.textContent = 'Serie guardada y sincronizada en Cloud. Puedes iniciar descanso.';
      }
      renderTrainings();
      return;
    }

    if (els.routineMessage) {
      els.routineMessage.textContent = 'Serie guardada correctamente. Puedes iniciar descanso.';
    }
    persist();
  }

  async function updateSessionStatus(sessionId, nextStatus) {
    const session = findSessionById(sessionId);
    if (!session) {
      return;
    }
    session.status = nextStatus;
    if (isCloudSessionActive()) {
      const syncResult = await syncSessionToCloud(session);
      if (!syncResult.ok) {
        if (els.routineMessage) {
          els.routineMessage.textContent = syncResult.error || 'No se pudo actualizar el estado en Cloud.';
        }
        return;
      }
      renderTrainings();
      return;
    }
    persist();
  }

  async function removeExerciseFromActiveSession(exerciseId) {
    const session = getCurrentTrainingSession();
    if (!session) {
      return;
    }
    session.exercises = getSessionExercises(session).filter((exercise) => exercise.id !== exerciseId);
    normalizeSessionExerciseOrder(session);
    if (trainingUi.activeExerciseId === exerciseId) {
      trainingUi.activeExerciseId = getSessionExercises(session)[0]?.id || '';
    }
    trainingUi.editingExerciseId = '';
    if (els.exerciseIdInput) {
      els.exerciseIdInput.value = '';
    }

    if (isCloudSessionActive()) {
      const syncResult = await syncSessionToCloud(session);
      if (!syncResult.ok) {
        if (els.routineMessage) {
          els.routineMessage.textContent = syncResult.error || 'No se pudo eliminar el ejercicio en Cloud.';
        }
        return;
      }
      renderTrainings();
      return;
    }

    persist();
  }

  async function moveExerciseInSession(exerciseId, direction) {
    const session = getCurrentTrainingSession();
    if (!session) {
      return;
    }
    const exercises = getSessionExercises(session);
    const currentIndex = exercises.findIndex((exercise) => exercise.id === exerciseId);
    if (currentIndex < 0) {
      return;
    }
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= exercises.length) {
      return;
    }
    const [item] = exercises.splice(currentIndex, 1);
    exercises.splice(nextIndex, 0, item);
    normalizeSessionExerciseOrder(session);

    if (isCloudSessionActive()) {
      const syncResult = await syncSessionToCloud(session);
      if (!syncResult.ok) {
        if (els.routineMessage) {
          els.routineMessage.textContent = syncResult.error || 'No se pudo reordenar en Cloud.';
        }
        return;
      }
      renderTrainings();
      return;
    }

    persist();
  }

  function editExerciseFromActiveSession(exerciseId) {
    const session = getCurrentTrainingSession();
    if (!session) {
      return;
    }
    const exercise = getSessionExercises(session).find((item) => item.id === exerciseId);
    if (!exercise) {
      return;
    }
    trainingUi.activeExerciseId = exercise.id;
    trainingUi.editingExerciseId = exercise.id;
    if (els.exerciseIdInput) {
      els.exerciseIdInput.value = exercise.id;
    }
    if (els.exerciseInput) {
      els.exerciseInput.value = exercise.exerciseName || '';
    }
    if (els.plannedSetsInput) {
      els.plannedSetsInput.value = String(Number(exercise.plannedSets || 1));
    }
    if (els.plannedRepMinInput) {
      els.plannedRepMinInput.value = String(Number(exercise.plannedRepMin || 1));
    }
    if (els.plannedRepMaxInput) {
      els.plannedRepMaxInput.value = String(Number(exercise.plannedRepMax || 1));
    }
    if (els.targetWeightInput) {
      els.targetWeightInput.value = String(Number(exercise.targetWeight || 0));
    }
    if (els.techniqueNotesInput) {
      els.techniqueNotesInput.value = exercise.coachNotes || '';
    }
    if (els.restInput) {
      els.restInput.value = String(Number(exercise.restSeconds || 90));
    }
    if (els.restPreset) {
      const allowed = ['60', '90', '95', '120'];
      const restString = String(Number(exercise.restSeconds || 90));
      els.restPreset.value = allowed.includes(restString) ? restString : 'custom';
    }
    if (els.routineMessage) {
      els.routineMessage.textContent = `Editando ejercicio: ${exercise.exerciseName}`;
    }
  }

  function handleImport(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = dataApi.importState(reader.result);
        Object.keys(state).forEach((key) => {
          delete state[key];
        });
        Object.assign(state, imported);
        persist();
        els.importMessage.textContent = 'Datos importados correctamente.';
      } catch (error) {
        els.importMessage.textContent = 'No se pudo importar el archivo.';
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  function exportData() {
    const blob = new Blob([dataApi.exportState(state)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'valhalla.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function handleNutritionPlanSubmit(event) {
    event.preventDefault();
    const draft = nutritionUi.planDraft || getNutritionPlanDraft();
    const formData = new FormData(document.getElementById('nutritionPlanForm'));
    const payload = Object.fromEntries(formData.entries());
    const nextPlan = {
      ...draft,
      id: nutritionUi.editingPlanId || draft.id,
      name: payload.planName || 'Plan sin nombre',
      description: payload.planDescription || '',
      cycleLength: Number(payload.planCycleLength || 10),
      freeDay: payload.planFreeDay === 'true',
      waterMinLiters: Number(payload.planWaterMin || 3),
      waterMaxLiters: Number(payload.planWaterMax || 5),
      active: payload.planActive === 'true',
      days: (draft.days || []).map((day, index) => ({ ...day }))
    };
    if (nutritionUi.editingPlanId) {
      const index = state.nutritionPlans.findIndex((plan) => plan.id === nutritionUi.editingPlanId);
      if (index >= 0) {
        state.nutritionPlans[index] = nextPlan;
      }
    } else {
      state.nutritionPlans.push(nextPlan);
    }
    nutritionUi.editingPlanId = null;
    nutritionUi.planDraft = null;
    els.nutritionMessage.textContent = 'Plan guardado correctamente.';
    persist();
  }

  function handleNutritionProfileSubmit(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(document.getElementById('nutritionProfileForm')));
    const existing = state.nutritionProfiles.find((item) => item.clientId === payload.clientId && item.active);
    const nextProfile = {
      id: existing?.id || dataApi.createId('profile'),
      clientId: payload.clientId,
      objective: payload.objective || '',
      dietType: payload.dietType || 'Tradicional',
      restrictions: payload.restrictions || '',
      notes: payload.notes || '',
      cycleStartDate: payload.cycleStartDate || '',
      currentPlanId: payload.currentPlanId || '',
      active: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      Object.assign(existing, nextProfile);
    } else {
      state.nutritionProfiles.push(nextProfile);
    }
    nutritionUi.selectedClientId = payload.clientId;
    els.nutritionMessage.textContent = 'Perfil nutricional guardado.';
    persist();
  }

  function handleNutritionDailySubmit(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(document.getElementById('nutritionDailyForm')));
    const profile = getActiveNutritionProfile(payload.clientId);
    const plan = getSelectedPlan(profile);
    const selectedMeals = Array.isArray(payload.completedMeals) ? payload.completedMeals : [payload.completedMeals].filter(Boolean);
    const log = {
      id: dataApi.createId('log'),
      clientId: payload.clientId,
      planId: profile?.currentPlanId || '',
      date: payload.date || new Date().toISOString().slice(0, 10),
      cycleDay: Number(payload.cycleDay || 1),
      completedMeals: selectedMeals.length,
      totalMeals: plan?.days?.find((day) => Number(day.dayNumber) === Number(payload.cycleDay || 1))?.meals?.length || 0,
      waterLiters: Number(payload.waterLiters || 0),
      supplementsCompleted: payload.supplementsCompleted === 'true',
      energy: Number(payload.energy || 3),
      hunger: Number(payload.hunger || 3),
      digestion: payload.digestion || 'Regular',
      weight: payload.weight ? Number(payload.weight) : '',
      notes: payload.notes || '',
      createdAt: new Date().toISOString()
    };
    state.nutritionLogs.push(log);
    nutritionUi.selectedClientId = payload.clientId;
    nutritionUi.dailyDate = payload.date || nutritionUi.dailyDate;
    els.nutritionMessage.textContent = 'Registro diario guardado.';
    persist();
  }

  function updatePlanDraftFromInputs(event) {
    if (!event.target.dataset.kind) {
      return;
    }
    const plan = nutritionUi.planDraft || getNutritionPlanDraft();
    const dayIndex = Number(event.target.dataset.dayIndex || 0);
    const mealIndex = Number(event.target.dataset.mealIndex || 0);
    const blockIndex = Number(event.target.dataset.blockIndex || 0);
    const baseDay = plan.days[dayIndex] || createEmptyDay(dayIndex + 1);
    if (event.target.dataset.kind === 'day') {
      const field = event.target.dataset.field;
      baseDay[field] = event.target.value;
    } else if (event.target.dataset.kind === 'meal') {
      const field = event.target.dataset.field;
      const meal = baseDay.meals[mealIndex] || createEmptyMeal();
      meal[field] = event.target.value;
      baseDay.meals[mealIndex] = meal;
    } else if (event.target.dataset.kind === 'block') {
      const field = event.target.dataset.field;
      const meal = baseDay.meals[mealIndex] || createEmptyMeal();
      const block = meal.blocks[blockIndex] || { type: '', quantity: '', unit: '', options: '' };
      block[field] = event.target.value;
      meal.blocks[blockIndex] = block;
      baseDay.meals[mealIndex] = meal;
    }
    plan.days[dayIndex] = baseDay;
    nutritionUi.planDraft = plan;
  }

  function handlePlanEditorActions(event) {
    const button = event.target.closest('[data-plan-action]');
    if (!button) {
      return;
    }
    const action = button.getAttribute('data-plan-action');
    const plan = nutritionUi.planDraft || getNutritionPlanDraft();
    if (action === 'create') {
      nutritionUi.editingPlanId = null;
      nutritionUi.planDraft = createDraftPlan();
      renderNutritionPlans();
      return;
    }
    if (action === 'edit') {
      nutritionUi.editingPlanId = button.getAttribute('data-plan-id');
      nutritionUi.planDraft = getNutritionPlanDraft();
      renderNutritionPlans();
      return;
    }
    if (action === 'duplicate') {
      const selectedPlan = state.nutritionPlans.find((item) => item.id === button.getAttribute('data-plan-id'));
      if (selectedPlan) {
        const duplicate = JSON.parse(JSON.stringify(selectedPlan));
        duplicate.id = dataApi.createId('plan');
        duplicate.name = `${duplicate.name} copia`;
        duplicate.active = false;
        state.nutritionPlans.push(duplicate);
        nutritionUi.editingPlanId = null;
        nutritionUi.planDraft = duplicate;
        els.nutritionMessage.textContent = 'Plan duplicado.';
        persist();
      }
      return;
    }
    if (action === 'toggle-active') {
      const selectedPlan = state.nutritionPlans.find((item) => item.id === button.getAttribute('data-plan-id'));
      if (selectedPlan) {
        selectedPlan.active = !selectedPlan.active;
        els.nutritionMessage.textContent = selectedPlan.active ? 'Plan activado.' : 'Plan desactivado.';
        persist();
      }
      return;
    }
    if (action === 'add-day') {
      plan.days.push(createEmptyDay(plan.days.length + 1));
      nutritionUi.planDraft = plan;
      renderNutritionPlans();
      return;
    }
    if (action === 'remove-day') {
      const dayIndex = Number(button.getAttribute('data-day-index') || 0);
      plan.days.splice(dayIndex, 1);
      nutritionUi.planDraft = plan;
      renderNutritionPlans();
      return;
    }
    if (action === 'add-meal') {
      const dayIndex = Number(button.getAttribute('data-day-index') || 0);
      const day = plan.days[dayIndex] || createEmptyDay(dayIndex + 1);
      day.meals.push(createEmptyMeal());
      plan.days[dayIndex] = day;
      nutritionUi.planDraft = plan;
      renderNutritionPlans();
      return;
    }
    if (action === 'remove-meal') {
      const dayIndex = Number(button.getAttribute('data-day-index') || 0);
      const mealIndex = Number(button.getAttribute('data-meal-index') || 0);
      const day = plan.days[dayIndex] || createEmptyDay(dayIndex + 1);
      day.meals.splice(mealIndex, 1);
      plan.days[dayIndex] = day;
      nutritionUi.planDraft = plan;
      renderNutritionPlans();
      return;
    }
    if (action === 'add-block') {
      const dayIndex = Number(button.getAttribute('data-day-index') || 0);
      const mealIndex = Number(button.getAttribute('data-meal-index') || 0);
      const day = plan.days[dayIndex] || createEmptyDay(dayIndex + 1);
      const meal = day.meals[mealIndex] || createEmptyMeal();
      meal.blocks.push({ type: '', quantity: '', unit: '', options: '' });
      day.meals[mealIndex] = meal;
      plan.days[dayIndex] = day;
      nutritionUi.planDraft = plan;
      renderNutritionPlans();
      return;
    }
    if (action === 'remove-block') {
      const dayIndex = Number(button.getAttribute('data-day-index') || 0);
      const mealIndex = Number(button.getAttribute('data-meal-index') || 0);
      const blockIndex = Number(button.getAttribute('data-block-index') || 0);
      const day = plan.days[dayIndex] || createEmptyDay(dayIndex + 1);
      const meal = day.meals[mealIndex] || createEmptyMeal();
      meal.blocks.splice(blockIndex, 1);
      day.meals[mealIndex] = meal;
      plan.days[dayIndex] = day;
      nutritionUi.planDraft = plan;
      renderNutritionPlans();
      return;
    }
  }

  function handleClick(event) {
    const target = event.target;
    const navButton = target.closest('[data-nav]');
    if (navButton) {
      show(navButton.getAttribute('data-nav'));
      return;
    }

    const clientFilterButton = target.closest('[data-client-filter]');
    if (clientFilterButton) {
      clientUi.filter = clientFilterButton.getAttribute('data-client-filter') || 'all';
      renderClients();
      return;
    }

    const clientViewId = target.getAttribute('data-client-view');
    if (clientViewId) {
      selectClientDetail(clientViewId);
      return;
    }

    const clientSportsId = target.getAttribute('data-client-sports');
    if (clientSportsId) {
      selectClientDetail(clientSportsId, 'sports');
      return;
    }

    const clientEditId = target.getAttribute('data-client-edit');
    if (clientEditId) {
      editClientById(clientEditId);
      return;
    }

    const clientWhatsAppId = target.getAttribute('data-client-whatsapp');
    if (clientWhatsAppId) {
      const client = (clientUi.records || []).find((item) => item.id === clientWhatsAppId);
      if (client) {
        openClientWhatsApp(client);
      }
      return;
    }

    const clientStudentViewId = target.getAttribute('data-client-student-view');
    if (clientStudentViewId) {
      enterStudentMode(clientStudentViewId);
      return;
    }

    const deleteConsiderationId = target.getAttribute('data-sports-consideration-delete');
    if (deleteConsiderationId) {
      deleteSportsConsiderationById(deleteConsiderationId).catch((error) => {
        setClientNotice(error?.message || 'No se pudo eliminar la consideración.', 'bad');
      });
      return;
    }

    const deleteMovementStatusId = target.getAttribute('data-movement-status-delete');
    if (deleteMovementStatusId) {
      deleteMovementStatusById(deleteMovementStatusId).catch((error) => {
        setClientNotice(error?.message || 'No se pudo eliminar el estado de movimiento.', 'bad');
      });
      return;
    }

    if (target === els.importWhatsAppBtn) {
      els.whatsAppImportPanel.classList.remove('hidden');
      els.whatsAppImportMessage.textContent = '';
      els.whatsAppImportText.focus();
      return;
    }

    if (target === els.parseWhatsAppImportBtn) {
      parseWhatsAppImport();
      return;
    }

    if (target === els.cancelWhatsAppImportBtn) {
      els.whatsAppImportPanel.classList.add('hidden');
      els.whatsAppImportMessage.textContent = '';
      return;
    }

    if (target === els.clientNewBtn) {
      toggleClientForm(true, null);
      renderClients();
      return;
    }

    if (target === els.clientCancelBtn) {
      clientUi.formOpen = false;
      clientUi.editingId = null;
      clearClientForm();
      if (els.clientFormPanel) {
        els.clientFormPanel.classList.add('hidden');
      }
      setClientNotice('Formulario cerrado.', 'neutral');
      renderClients();
      return;
    }

    if (target === els.createSessionBtn) {
      const clientId = trainingUi.selectedClientId || els.studentId?.value || '';
      if (!clientId) {
        if (els.routineMessage) {
          els.routineMessage.textContent = 'Selecciona un cliente activo para crear sesión.';
        }
        return;
      }

      const createMode = els.sessionCreateMode?.value || 'scratch';
      const selectedTemplateId = els.sessionTemplateId?.value || '';
      if (createMode === 'template' && !selectedTemplateId) {
        if (els.routineMessage) {
          els.routineMessage.textContent = 'Selecciona una plantilla para crear la sesión.';
        }
        return;
      }
      const sessionOptions = createMode === 'template'
        ? { templateId: selectedTemplateId }
        : {};

      createSessionForClient(clientId, sessionOptions).then((result) => {
        if (!result.ok && els.routineMessage) {
          els.routineMessage.textContent = result.error || 'No se pudo crear la sesión.';
          return;
        }
        if (els.routineMessage) {
          els.routineMessage.textContent = createMode === 'template'
            ? 'Sesión creada desde plantilla. Ahora ejecuta o ajusta ejercicios.'
            : 'Sesión creada. Ahora agrega ejercicios.';
        }
        renderTrainings();
      }).catch((error) => {
        if (els.routineMessage) {
          els.routineMessage.textContent = error?.message || 'No se pudo crear la sesión.';
        }
      });
      return;
    }

    if (target === els.duplicateSessionBtn) {
      duplicateSessionForSelectedClient().catch((error) => {
        if (els.routineMessage) {
          els.routineMessage.textContent = error?.message || 'No se pudo duplicar la sesión.';
        }
      });
      return;
    }

    if (target === els.saveAsTemplateBtn) {
      saveCurrentSessionAsTemplate().catch((error) => {
        if (els.routineMessage) {
          els.routineMessage.textContent = error?.message || 'No se pudo guardar la sesión como plantilla.';
        }
      });
      return;
    }

    const trainingViewButton = target.closest('[data-training-view]');
    const agendaAttendanceButton = target.closest('[data-agenda-attend]');
    if (agendaAttendanceButton && !agendaAttendanceButton.disabled) {
      markAgendaAttendance(
        agendaAttendanceButton.getAttribute('data-agenda-attend'),
        agendaAttendanceButton.getAttribute('data-client-id')
      );
      return;
    }

    const agendaRescheduleButton = target.closest('[data-agenda-reschedule]');
    if (agendaRescheduleButton) {
      const form = agendaRescheduleButton.closest('.training-agenda-student')?.querySelector('[data-agenda-reschedule-form]');
      form?.classList.remove('hidden');
      form?.querySelector('[name="noticeDays"]')?.focus();
      return;
    }

    const agendaRescheduleCloseButton = target.closest('[data-agenda-reschedule-close]');
    if (agendaRescheduleCloseButton) {
      agendaRescheduleCloseButton.closest('[data-agenda-reschedule-form]')?.classList.add('hidden');
      return;
    }

    const agendaNoShowButton = target.closest('[data-agenda-no-show]');
    if (agendaNoShowButton) {
      recordAgendaStatus(
        agendaNoShowButton.getAttribute('data-agenda-no-show'),
        agendaNoShowButton.getAttribute('data-client-id'),
        'no_show'
      );
      return;
    }

    const groupDecisionButton = target.closest('[data-group-decision]');
    if (groupDecisionButton) {
      selectGroupDecision(
        groupDecisionButton.getAttribute('data-client-id'),
        groupDecisionButton.getAttribute('data-group-decision')
      );
      return;
    }

    const groupConfirmButton = target.closest('[data-group-confirm]');
    if (groupConfirmButton) {
      confirmGroupStudentSession(groupConfirmButton.getAttribute('data-group-confirm'));
      return;
    }

    if (trainingViewButton) {
      setTrainingView(trainingViewButton.getAttribute('data-training-view') || 'today');
      return;
    }

    if (target === els.newTemplateBtn) {
      resetTemplateDraft();
      setTemplateMessage('Nueva plantilla lista para editar.', 'neutral');
      renderTemplateList();
      return;
    }

    const libraryEditId = target.getAttribute('data-library-exercise-edit');
    if (libraryEditId) {
      editLibraryExercise(libraryEditId);
      return;
    }

    const libraryDeleteId = target.getAttribute('data-library-exercise-delete');
    if (libraryDeleteId) {
      deleteLibraryExerciseById(libraryDeleteId).catch((error) => {
        setLibraryMessage(error?.message || 'No se pudo eliminar el ejercicio.', 'bad');
      });
      return;
    }

    const planningClientId = target.closest('[data-planning-client-id]')?.getAttribute('data-planning-client-id');
    if (planningClientId) {
      const current = new Set(planningUi.selectedClientIds || []);
      if (current.has(planningClientId)) {
        current.delete(planningClientId);
      } else {
        current.add(planningClientId);
      }
      planningUi.selectedClientIds = Array.from(current);
      getPlanningDraftProgram().assignedClientIds = [...planningUi.selectedClientIds];
      renderPlanningClientSelection();
      renderPlanningSavedPrograms();
      return;
    }

    if (target === els.planningLoadBaseProgramBtn || target.closest('#planningLoadBaseProgramBtn')) {
      const selectedProgramId = String(els.planningBaseProgramSelect?.value || '').trim();
      if (!selectedProgramId) {
        if (els.programMessage) {
          els.programMessage.textContent = 'Selecciona un programa guardado para usarlo como base.';
          els.programMessage.className = 'notice warn';
        }
        return;
      }
      const loaded = duplicatePlanningProgramFromBase(selectedProgramId);
      if (loaded && els.programMessage) {
        els.programMessage.textContent = 'Base cargada correctamente.';
        els.programMessage.className = 'notice ok';
      }
      return;
    }

    const programBaseId = target.closest('[data-program-base]')?.getAttribute('data-program-base');
    if (programBaseId) {
      duplicatePlanningProgramFromBase(programBaseId);
      return;
    }

    if (target === els.planningContinueStep1) {
      showPlanningStep(2);
      if (els.planningProgramName) {
        els.planningProgramName.value = getPlanningDraftProgram().name || '';
      }
      if (els.planningProgramStartDate) {
        els.planningProgramStartDate.value = getPlanningDraftProgram().startDate || getTodayLocalDate();
      }
      return;
    }

    if (target === els.planningBackToStep1) {
      showPlanningStep(1);
      return;
    }

    if (target === els.planningContinueStep2) {
      applyPlanningChoiceData();
      showPlanningStep(3);
      renderPlanningDays();
      return;
    }

    if (target === els.planningBackToStep2) {
      showPlanningStep(2);
      return;
    }

    if (target === els.planningContinueStep3) {
      const totalExercises = (getPlanningDraftProgram().days || []).reduce((sum, day) => sum + (day.exercises || []).length, 0);
      if (totalExercises <= 0) {
        const message = document.getElementById('planningStep3Message');
        if (message) {
          message.classList.remove('hidden');
        }
        return;
      }
      applyPlanningChoiceData();
      renderPlanningReview();
      showPlanningStep(4);
      return;
    }

    if (target === els.planningBackToStep3) {
      showPlanningStep(3);
      return;
    }

    if (target === els.planningSaveProgramWizardBtn) {
      applyPlanningChoiceData();
      syncPlanningProgramToLegacyForm();
      savePlanningProgramAndAssignments();
      return;
    }

    const weekdayButton = target.closest('[data-planning-weekday]');
    if (weekdayButton) {
      const chosenDay = Number(weekdayButton.getAttribute('data-planning-weekday') || 0);
      const draft = getPlanningDraftProgram();
      const expected = Math.max(1, Math.min(Number(draft.weeklyFrequency || planningUi.frequency || 3), Math.max(1, (draft.days || []).length || 3)));
      const selected = new Set(getPlanningWeeklyDaySelection());
      if (selected.has(chosenDay)) {
        selected.delete(chosenDay);
      } else {
        if (selected.size >= expected) {
          if (els.programMessage) {
            els.programMessage.textContent = `Selecciona ${expected} días de entrenamiento.`;
            els.programMessage.className = 'notice warn';
          }
          return;
        }
        selected.add(chosenDay);
      }
      planningUi.weeklyDays = Array.from(selected).sort((a, b) => a - b);
      renderPlanningReview();
      return;
    }

    const reviewDayEdit = target.closest('[data-planning-edit-day]');
    if (reviewDayEdit) {
      const index = Number(reviewDayEdit.getAttribute('data-planning-edit-day') || 0);
      const draft = getPlanningDraftProgram();
      if (draft.days?.[index]) {
        planningUi.currentDayIndex = index;
        routineBuilder.activeDayIndex = index;
        showPlanningStep(3);
        renderPlanningDays();
      }
      return;
    }

    const planningCategory = target.closest('[data-planning-category]');
    if (planningCategory) {
      const category = planningCategory.getAttribute('data-planning-category') || 'PIERNAS';
      planningUi.category = category;
      planningUi.selectedCategory = category;
      if (els.planningCategorySelector) {
        els.planningCategorySelector.classList.remove('hidden');
      }
      renderPlanningCategories();
      return;
    }

    if (target.closest('[data-planning-category-back]')) {
      planningUi.selectedCategory = null;
      if (els.planningExerciseSearch) {
        els.planningExerciseSearch.value = '';
      }
      renderPlanningCategories();
      return;
    }

    if (target.closest('[data-planning-exercise-option]')) {
      const exerciseName = target.closest('[data-planning-exercise-option]')?.textContent?.trim() || 'Ejercicio';
      planningUi.exerciseDraft = {
        id: dataApi.createId('program-exercise'),
        exerciseName,
        category: planningUi.selectedCategory || planningUi.category || 'PIERNAS',
        notes: '',
        repRangeMin: 8,
        repRangeMax: 12,
        plannedSets: 3,
        targetWeight: '',
        restSeconds: 90,
        zone: '',
        approximations: [],
        effectiveSets: []
      };
      if (els.planningCategorySelector) {
        els.planningCategorySelector.classList.add('hidden');
      }
      if (els.planningExerciseBuilder) {
        els.planningExerciseBuilder.classList.remove('hidden');
      }
      renderPlanningBuilder();
      return;
    }

    if (target.closest('[data-planning-day-index]')) {
      const dayIndex = Number(target.closest('[data-planning-day-index]').getAttribute('data-planning-day-index') || 0);
      planningUi.currentDayIndex = dayIndex;
      routineBuilder.activeDayIndex = dayIndex;
      routineBuilder.screen = 'day';
      renderPlanningDays();
      return;
    }

    if (target.closest('[data-planning-exercise-remove]')) {
      const exerciseId = target.closest('[data-planning-exercise-remove]').getAttribute('data-planning-exercise-remove');
      const draft = getPlanningDraftProgram();
      const day = draft.days[planningUi.currentDayIndex];
      if (day) {
        day.exercises = (day.exercises || []).filter((item) => item.id !== exerciseId);
        planningUi.draftProgram = draft;
        renderPlanningDays();
      }
      return;
    }

    if (target === els.planningAddFirstExercise || target.closest('#planningAddFirstExercise') || target.closest('#planningAddExerciseBtn')) {
      routineBuilder.screen = 'categories';
      routineBuilder.category = null;
      routineBuilder.search = '';
      renderRoutineBuilder();
      return;
    }

    if (target === els.planningBackToDay || target.closest('#planningBackToDay')) {
      if (els.planningCategorySelector) {
        els.planningCategorySelector.classList.add('hidden');
      }
      if (els.planningExerciseBuilder) {
        els.planningExerciseBuilder.classList.add('hidden');
      }
      planningUi.selectedCategory = null;
      renderPlanningDays();
      return;
    }

    if (target === els.planningBuilderBack || target.closest('#planningBuilderBack')) {
      if (els.planningExerciseBuilder) {
        els.planningExerciseBuilder.classList.add('hidden');
      }
      if (els.planningCategorySelector) {
        els.planningCategorySelector.classList.remove('hidden');
      }
      planningUi.selectedCategory = planningUi.selectedCategory || planningUi.category || 'PIERNAS';
      renderPlanningCategories();
      return;
    }

    if (target === els.planningSetMinus || target.closest('#planningSetMinus')) {
      const nextValue = Math.max(1, Number(planningUi.exerciseDraft?.plannedSets || 3) - 1);
      if (planningUi.exerciseDraft) {
        planningUi.exerciseDraft.plannedSets = nextValue;
      }
      renderPlanningBuilder();
      return;
    }

    if (target === els.planningSetPlus || target.closest('#planningSetPlus')) {
      const nextValue = Math.max(1, Number(planningUi.exerciseDraft?.plannedSets || 3) + 1);
      if (planningUi.exerciseDraft) {
        planningUi.exerciseDraft.plannedSets = nextValue;
      }
      renderPlanningBuilder();
      return;
    }

    if (target === els.planningToggleMoreOptions || target.closest('#planningToggleMoreOptions')) {
      planningUi.moreOptionsOpen = !planningUi.moreOptionsOpen;
      renderPlanningBuilder();
      return;
    }

    if (target === els.planningAddApproximation || target.closest('#planningAddApproximation')) {
      const draft = planningUi.exerciseDraft || { approximations: [] };
      draft.approximations = Array.isArray(draft.approximations) ? draft.approximations : [];
      if (draft.approximations.length >= 3) {
        return;
      }
      draft.approximations.push({ id: dataApi.createId('planning-approx'), label: `A${draft.approximations.length + 1}`, weight: '', reps: 8 });
      planningUi.exerciseDraft = draft;
      renderPlanningBuilder();
      return;
    }

    if (target.closest('[data-planning-approx-remove]')) {
      const key = target.closest('[data-planning-approx-remove]').getAttribute('data-planning-approx-remove');
      if (planningUi.exerciseDraft) {
        planningUi.exerciseDraft.approximations = (planningUi.exerciseDraft.approximations || []).filter((item) => String(item.id || item.label || '') !== String(key));
      }
      renderPlanningBuilder();
      return;
    }

    if (target === els.planningSaveExerciseBtn || target.closest('#planningSaveExerciseBtn')) {
      const draft = getPlanningDraftProgram();
      const day = draft.days[planningUi.currentDayIndex] || draft.days[0];
      if (!day) {
        return;
      }
      const baseExercise = planningUi.exerciseDraft || {
        id: dataApi.createId('program-exercise'),
        exerciseName: 'Ejercicio',
        category: planningUi.category || 'PIERNAS',
        repRangeMin: 8,
        repRangeMax: 12,
        plannedSets: 3,
        targetWeight: 0,
        zone: '',
        restSeconds: 90,
        notes: '',
        approximations: []
      };
      const repMin = Number(els.planningRepMin?.value || baseExercise.repRangeMin || 8);
      const repMax = Number(els.planningRepMax?.value || baseExercise.repRangeMax || repMin);
      const capturedExercise = {
        ...baseExercise,
        id: baseExercise.id || dataApi.createId('program-exercise'),
        exerciseName: String(els.planningBuilderTitle?.textContent || baseExercise.exerciseName || 'Ejercicio').trim() || 'Ejercicio',
        category: baseExercise.category || planningUi.selectedCategory || planningUi.category || 'PIERNAS',
        plannedSets: Number(els.planningSetCount?.textContent || baseExercise.plannedSets || 3),
        repRangeMin: repMin,
        repRangeMax: repMax,
        targetWeight: Number(els.planningTargetWeight?.value || 0),
        zone: els.planningZoneSelect?.value || baseExercise.zone || '',
        restSeconds: Number(els.planningRestSelect?.value || baseExercise.restSeconds || 90),
        notes: els.planningNotes?.value || baseExercise.notes || '',
        approximations: Array.isArray(baseExercise.approximations) ? baseExercise.approximations.map((item, index) => ({
          ...item,
          id: item.id || dataApi.createId('planning-approx'),
          label: item.label || `A${index + 1}`,
          weight: String(els.planningApproximationRows?.querySelectorAll('[data-planning-approx-weight]')[index]?.value ?? item.weight ?? ''),
          reps: Number(els.planningApproximationRows?.querySelectorAll('[data-planning-approx-reps]')[index]?.value || item.reps || 8)
        })) : []
      };
      day.exercises = Array.isArray(day.exercises) ? day.exercises : [];
      day.exercises.push(capturedExercise);
      planningUi.exerciseDraft = null;
      planningUi.selectedCategory = null;
      planningUi.moreOptionsOpen = false;
      if (els.planningCategorySelector) {
        els.planningCategorySelector.classList.add('hidden');
      }
      if (els.planningExerciseBuilder) {
        els.planningExerciseBuilder.classList.add('hidden');
      }
      renderPlanningDays();
      return;
    }

    if (target.closest('[data-program-objective]')) {
      const button = target.closest('[data-program-objective]');
      planningUi.objective = button.getAttribute('data-program-objective') || 'Fuerza';
      document.querySelectorAll('[data-program-objective]').forEach((item) => item.classList.toggle('active', item === button));
      applyPlanningChoiceData();
      return;
    }

    if (target.closest('[data-program-duration]')) {
      const button = target.closest('[data-program-duration]');
      const choice = button.getAttribute('data-program-duration') || '4';
      planningUi.duration = choice === 'custom' ? Number(els.planningCustomDuration?.value || 4) : Number(choice);
      document.querySelectorAll('[data-program-duration]').forEach((item) => item.classList.toggle('active', item === button));
      if (choice === 'custom') {
        if (els.planningCustomDuration) {
          els.planningCustomDuration.classList.remove('hidden');
          els.planningCustomDuration.focus();
        }
      } else if (els.planningCustomDuration) {
        els.planningCustomDuration.classList.add('hidden');
      }
      applyPlanningChoiceData();
      return;
    }

    if (target.closest('[data-program-frequency]')) {
      const button = target.closest('[data-program-frequency]');
      planningUi.frequency = Number(button.getAttribute('data-program-frequency') || 2);
      document.querySelectorAll('[data-program-frequency]').forEach((item) => item.classList.toggle('active', item === button));
      applyPlanningChoiceData();
      return;
    }

    if (target === els.addProgramDayBtn) {
      addProgramDay();
      return;
    }

    if (target === els.saveProgramBtn) {
      saveProgram();
      return;
    }

    const programEditId = target.getAttribute('data-program-edit');
    if (programEditId) {
      loadProgramIntoForm(programEditId);
      return;
    }

    const programAssignId = target.getAttribute('data-program-assign');
    if (programAssignId) {
      const program = getTrainingProgramById(programAssignId);
      if (program) {
        const clientIds = program.assignedClientIds || [];
        const selectedClients = clientIds.length ? clientIds : [];
        const nextIds = selectedClients.length ? selectedClients : [trainingUi.selectedClientId || ''];
        const assignment = dataApi.normalizeTrainingProgramAssignment({
          id: dataApi.createId('program-assignment'),
          programId: program.id,
          clientId: nextIds[0] || '',
          clientName: getClientById(nextIds[0] || '')?.full_name || '',
          programName: program.name,
          program
        }, { trainingsV08: { programs: getTrainingPrograms() } });
        state.trainingsV08.assignments = [assignment, ...getTrainingAssignments().filter((item) => item.id !== assignment.id)];
        persist();
        if (els.programMessage) {
          els.programMessage.textContent = 'Programa asignado a un alumno.';
        }
      }
      return;
    }

    const programDayEditId = target.getAttribute('data-program-day-edit');
    if (programDayEditId) {
      const draft = getProgramDraft();
      trainingUi.editingProgramDayId = programDayEditId;
      if (els.programMessage) {
        els.programMessage.textContent = 'Edición de día activa.';
      }
      renderProgramDayList(draft);
      return;
    }

    const programExerciseAddId = target.getAttribute('data-program-exercise-add');
    if (programExerciseAddId) {
      addProgramExerciseToDay(programExerciseAddId, 'Ejercicio nuevo');
      return;
    }

    const programExerciseEditId = target.getAttribute('data-program-exercise-edit');
    if (programExerciseEditId) {
      const draft = getProgramDraft();
      const day = draft.days.find((item) => item.exercises.some((exercise) => exercise.id === programExerciseEditId));
      if (day) {
        trainingUi.editingProgramDayId = day.id;
        const exercise = day.exercises.find((item) => item.id === programExerciseEditId);
        if (exercise) {
          populateProgramExerciseForm(exercise);
          renderProgramDayList(draft);
        }
      }
      return;
    }

    const programExerciseMoveUpId = target.getAttribute('data-program-exercise-up');
    if (programExerciseMoveUpId) {
      const draft = getProgramDraft();
      const day = draft.days.find((item) => item.exercises.some((exercise) => exercise.id === programExerciseMoveUpId));
      if (day) {
        moveProgramExercise(day.id, programExerciseMoveUpId, 'up');
      }
      return;
    }

    const programExerciseMoveDownId = target.getAttribute('data-program-exercise-down');
    if (programExerciseMoveDownId) {
      const draft = getProgramDraft();
      const day = draft.days.find((item) => item.exercises.some((exercise) => exercise.id === programExerciseMoveDownId));
      if (day) {
        moveProgramExercise(day.id, programExerciseMoveDownId, 'down');
      }
      return;
    }

    const programExerciseDeleteId = target.getAttribute('data-program-exercise-delete');
    if (programExerciseDeleteId) {
      const draft = getProgramDraft();
      const day = draft.days.find((item) => item.exercises.some((exercise) => exercise.id === programExerciseDeleteId));
      if (day) {
        deleteProgramExercise(day.id, programExerciseDeleteId);
      }
      return;
    }

    const programLibrarySelect = target.getAttribute('data-program-library-select');
    if (programLibrarySelect) {
      const draft = getProgramDraft();
      const dayId = trainingUi.editingProgramDayId || draft.days[0]?.id || createEmptyProgramDay(1).id;
      const day = draft.days.find((item) => item.id === dayId) || draft.days[0] || createEmptyProgramDay(1);
      const exercise = createEmptyProgramExercise();
      exercise.exerciseName = programLibrarySelect;
      day.exercises.push(exercise);
      if (!draft.days.find((item) => item.id === day.id)) {
        draft.days.push(day);
      }
      state.trainingsV08.programs = (getTrainingPrograms()).filter((program) => program.id !== draft.id);
      state.trainingsV08.programs.unshift(draft);
      trainingUi.editingProgramId = draft.id;
      trainingUi.editingProgramDayId = day.id;
      populateProgramExerciseForm(exercise);
      persistPrograms();
      return;
    }

    if (target === els.saveTemplateBtn) {
      saveTemplate().catch((error) => {
        setTemplateMessage(error?.message || 'No se pudo guardar la plantilla.', 'bad');
      });
      return;
    }

    if (target === els.saveTemplateExerciseBtn) {
      saveTemplateExercise().catch((error) => {
        setTemplateMessage(error?.message || 'No se pudo guardar el ejercicio de plantilla.', 'bad');
      });
      return;
    }

    if (target === els.assignTemplateBtn) {
      assignTemplateToSelectedClient(els.templateIdInput?.value || '').catch((error) => {
        setTemplateMessage(error?.message || 'No se pudo asignar la plantilla.', 'bad');
      });
      return;
    }

    const templateUseId = target.getAttribute('data-template-use');
    if (templateUseId) {
      assignTemplateToSelectedClient(templateUseId).catch((error) => {
        setTemplateMessage(error?.message || 'No se pudo asignar la plantilla.', 'bad');
      });
      return;
    }

    const templateEditId = target.getAttribute('data-template-edit');
    if (templateEditId) {
      loadTemplateIntoForm(templateEditId);
      renderTemplateList();
      return;
    }

    const templateDuplicateId = target.getAttribute('data-template-duplicate');
    if (templateDuplicateId) {
      duplicateTemplate(templateDuplicateId).catch((error) => {
        setTemplateMessage(error?.message || 'No se pudo duplicar la plantilla.', 'bad');
      });
      return;
    }

    const templateDeleteId = target.getAttribute('data-template-delete');
    if (templateDeleteId) {
      deleteTemplate(templateDeleteId).catch((error) => {
        setTemplateMessage(error?.message || 'No se pudo eliminar la plantilla.', 'bad');
      });
      return;
    }

    const templateExerciseEditId = target.getAttribute('data-template-exercise-edit');
    if (templateExerciseEditId) {
      editTemplateExercise(templateExerciseEditId);
      return;
    }

    const templateExerciseUpId = target.getAttribute('data-template-exercise-up');
    if (templateExerciseUpId) {
      moveTemplateExercise(templateExerciseUpId, 'up').catch((error) => {
        setTemplateMessage(error?.message || 'No se pudo mover el ejercicio de plantilla.', 'bad');
      });
      return;
    }

    const templateExerciseDownId = target.getAttribute('data-template-exercise-down');
    if (templateExerciseDownId) {
      moveTemplateExercise(templateExerciseDownId, 'down').catch((error) => {
        setTemplateMessage(error?.message || 'No se pudo mover el ejercicio de plantilla.', 'bad');
      });
      return;
    }

    const templateExerciseDeleteId = target.getAttribute('data-template-exercise-delete');
    if (templateExerciseDeleteId) {
      deleteTemplateExercise(templateExerciseDeleteId).catch((error) => {
        setTemplateMessage(error?.message || 'No se pudo eliminar el ejercicio de plantilla.', 'bad');
      });
      return;
    }

    const openSessionId = target.getAttribute('data-training-open-session');
    if (openSessionId) {
      setActiveSessionForClient(trainingUi.selectedClientId, openSessionId);
      renderTrainings();
      return;
    }

    const nextStatus = target.getAttribute('data-next-status');
    const statusSessionId = target.getAttribute('data-training-status');
    if (statusSessionId && nextStatus) {
      updateSessionStatus(statusSessionId, nextStatus).catch((error) => {
        if (els.routineMessage) {
          els.routineMessage.textContent = error?.message || 'No se pudo actualizar el estado de la sesión.';
        }
      });
      return;
    }

    const selectExerciseId = target.getAttribute('data-training-select-exercise');
    if (selectExerciseId) {
      trainingUi.activeExerciseId = selectExerciseId;
      trainingUi.editingSetNumber = null;
      if (els.editingSetNumber) {
        els.editingSetNumber.value = '';
      }
      renderTrainings();
      return;
    }

    const editExerciseId = target.getAttribute('data-training-edit-exercise');
    if (editExerciseId) {
      editExerciseFromActiveSession(editExerciseId);
      renderTrainings();
      return;
    }

    const moveUpExerciseId = target.getAttribute('data-training-move-up');
    if (moveUpExerciseId) {
      moveExerciseInSession(moveUpExerciseId, 'up').catch((error) => {
        if (els.routineMessage) {
          els.routineMessage.textContent = error?.message || 'No se pudo mover el ejercicio.';
        }
      });
      return;
    }

    const moveDownExerciseId = target.getAttribute('data-training-move-down');
    if (moveDownExerciseId) {
      moveExerciseInSession(moveDownExerciseId, 'down').catch((error) => {
        if (els.routineMessage) {
          els.routineMessage.textContent = error?.message || 'No se pudo mover el ejercicio.';
        }
      });
      return;
    }

    const deleteExerciseId = target.getAttribute('data-training-delete-exercise');
    if (deleteExerciseId) {
      removeExerciseFromActiveSession(deleteExerciseId).catch((error) => {
        if (els.routineMessage) {
          els.routineMessage.textContent = error?.message || 'No se pudo eliminar el ejercicio.';
        }
      });
      return;
    }

    const setEditNumber = target.getAttribute('data-set-edit');
    if (setEditNumber) {
      const exercise = getCurrentTrainingExercise();
      const setEntry = getExerciseSets(exercise).find((item) => Number(item.setNumber || 0) === Number(setEditNumber));
      if (setEntry) {
        trainingUi.editingSetNumber = Number(setEditNumber);
        if (els.editingSetNumber) {
          els.editingSetNumber.value = String(setEditNumber);
        }
        if (els.setWeightInput) {
          els.setWeightInput.value = String(Number(setEntry.weight || 0));
        }
        if (els.setRepsInput) {
          els.setRepsInput.value = String(Number(setEntry.reps || 0));
        }
        if (els.setRirInput) {
          els.setRirInput.value = setEntry.rir == null ? '' : String(setEntry.rir);
        }
        if (els.setCompletedInput) {
          els.setCompletedInput.checked = setEntry.completed !== false;
        }
        if (els.setRecordNotice) {
          els.setRecordNotice.textContent = `Editando serie ${setEditNumber}`;
        }
      }
      return;
    }

    const weightDelta = target.getAttribute('data-weight-delta');
    if (weightDelta && els.setWeightInput) {
      const current = Number(els.setWeightInput.value || 0);
      const next = Math.max(0, Math.round((current + Number(weightDelta)) * 10) / 10);
      els.setWeightInput.value = String(next);
      return;
    }

    const studentSetEditNumber = target.getAttribute('data-student-set-edit');
    if (studentSetEditNumber) {
      const exercise = getStudentExercise();
      const setEntry = getExerciseSets(exercise).find((item) => Number(item.setNumber || 0) === Number(studentSetEditNumber));
      if (setEntry) {
        studentUi.editingSetNumber = Number(studentSetEditNumber);
        if (els.studentEditingSetNumber) {
          els.studentEditingSetNumber.value = String(studentSetEditNumber);
        }
        if (els.studentWeightInput) {
          els.studentWeightInput.value = String(Number(setEntry.weight || 0));
        }
        if (els.studentRepsInput) {
          els.studentRepsInput.value = String(Number(setEntry.reps || 0));
        }
        if (els.studentSetCompleted) {
          els.studentSetCompleted.checked = setEntry.completed !== false;
        }
        if (els.studentSetNotice) {
          els.studentSetNotice.textContent = `Editando serie ${studentSetEditNumber}`;
        }
      }
      return;
    }

    const studentWeightDelta = target.getAttribute('data-student-weight-delta');
    if (studentWeightDelta && els.studentWeightInput) {
      const current = Number(els.studentWeightInput.value || 0);
      const next = Math.max(0, Math.round((current + Number(studentWeightDelta)) * 10) / 10);
      els.studentWeightInput.value = String(next);
      return;
    }

    if (target === els.studentSaveSetBtn) {
      saveStudentSetEntry().catch((error) => {
        if (els.studentSetNotice) {
          els.studentSetNotice.textContent = error?.message || 'No se pudo guardar la serie.';
        }
      });
      return;
    }

    if (target === els.studentNextExerciseBtn) {
      goToNextStudentExercise().catch((error) => {
        if (els.studentSetNotice) {
          els.studentSetNotice.textContent = error?.message || 'No se pudo avanzar de ejercicio.';
        }
      });
      return;
    }

    if (target === els.studentRestStartBtn) {
      startStudentRest();
      return;
    }

    if (target === els.studentRestPlusBtn) {
      const exercise = getStudentExercise();
      if (!studentUi.restRunning && studentUi.restRemaining <= 0) {
        studentUi.restRemaining = Number(exercise?.restSeconds || 0);
      }
      studentUi.restRemaining = Math.max(0, Number(studentUi.restRemaining || 0) + 15);
      renderStudentTraining();
      return;
    }

    if (target === els.studentRestSkipBtn) {
      stopStudentRestTimer();
      studentUi.restRemaining = 0;
      renderStudentTraining();
      return;
    }

    if (target === els.studentBackBtn) {
      exitStudentMode();
      return;
    }

    if (target === els.studentFinalizeBtn) {
      finalizeStudentSession().catch((error) => {
        if (els.studentSetNotice) {
          els.studentSetNotice.textContent = error?.message || 'No se pudo finalizar la sesión.';
        }
      });
      return;
    }

    const editId = target.getAttribute('data-edit');
    if (editId) {
      const movement = state.movements.find((item) => item.id === editId);
      if (movement) {
        const nextDescription = window.prompt('Descripción', movement.description || '');
        const nextAmount = window.prompt('Monto', movement.amount || 0);
        if (nextDescription !== null && nextAmount !== null) {
          movement.description = nextDescription || movement.description;
          movement.amount = Number(nextAmount || 0);
          persist();
        }
      }
      return;
    }
    const removeId = target.getAttribute('data-remove');
    if (removeId) {
      if (window.confirm('¿Quieres eliminar este movimiento?')) {
        financeApi.removeMovement(state, removeId);
        persist();
      }
      return;
    }
    const payId = target.getAttribute('data-pay');
    if (payId) {
      financeApi.toggleClientStatus(state, payId);
      persist();
      return;
    }
    const quickCategory = target.getAttribute('data-quick-category');
    if (quickCategory) {
      document.getElementById('category').value = quickCategory;
      document.getElementById('description').value = quickCategory;
      return;
    }
    const accountToggleId = target.getAttribute('data-account-toggle');
    if (accountToggleId) {
      const account = state.accounts.find((item) => item.id === accountToggleId);
      if (account) {
        account.isActive = target.checked;
        persist();
      }
      return;
    }
    const accountMainId = target.getAttribute('data-account-main');
    if (accountMainId) {
      state.accounts.forEach((account) => {
        account.isMain = account.id === accountMainId;
      });
      persist();
      return;
    }
    const accountBalanceId = target.getAttribute('data-account-balance');
    if (accountBalanceId) {
      const account = state.accounts.find((item) => item.id === accountBalanceId);
      const nextBalance = window.prompt(`Saldo inicial de ${account?.name || 'cuenta'}`, account?.initialBalance || 0);
      if (nextBalance !== null) {
        account.initialBalance = Number(nextBalance || 0);
        persist();
      }
      return;
    }
    const openNutritionId = target.getAttribute('data-open-nutrition');
    if (openNutritionId) {
      nutritionUi.selectedClientId = openNutritionId;
      show('nutrition');
      render();
      return;
    }
    const logDeleteId = target.getAttribute('data-log-delete');
    if (logDeleteId) {
      if (window.confirm('¿Deseas eliminar este registro diario?')) {
        state.nutritionLogs = state.nutritionLogs.filter((item) => item.id !== logDeleteId);
        persist();
      }
      return;
    }
    if (target.closest('[data-plan-action]')) {
      handlePlanEditorActions(event);
      return;
    }
  }

  function handleDynamicFormSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    if (form.matches('[data-agenda-reschedule-form]')) {
      event.preventDefault();
      handleAgendaRescheduleSubmit(form);
      return;
    }
    if (form.id === 'sportsProfileForm') {
      event.preventDefault();
      saveSportsProfileForm(form).then(() => {
        setClientNotice('Ficha deportiva guardada.', 'ok');
        renderClients();
      }).catch((error) => {
        setClientNotice(error?.message || 'No se pudo guardar la ficha deportiva.', 'bad');
      });
      return;
    }
    if (form.id === 'sportsConsiderationForm') {
      event.preventDefault();
      saveSportsConsiderationForm(form).then(() => {
        setClientNotice('Consideración guardada.', 'ok');
        renderClients();
      }).catch((error) => {
        setClientNotice(error?.message || 'No se pudo guardar la consideración.', 'bad');
      });
      return;
    }
    if (form.id === 'movementStatusForm') {
      event.preventDefault();
      saveMovementStatusForm(form).then(() => {
        setClientNotice('Estado de movimiento guardado.', 'ok');
        renderClients();
      }).catch((error) => {
        setClientNotice(error?.message || 'No se pudo guardar el estado de movimiento.', 'bad');
      });
    }
  }

  function handleRoutineBuilderRootClick(event) {
    const actionTarget = event.target.closest('[data-routine-action]');
    if (!actionTarget || !els.routineBuilderRoot || !event.target.closest('#routineBuilderRoot')) {
      return;
    }

    const action = actionTarget.getAttribute('data-routine-action');
    if (!action) {
      return;
    }

    if (action === 'add-exercise') {
      routineBuilder.screen = 'categories';
      routineBuilder.category = null;
      routineBuilder.search = '';
      renderRoutineBuilder();
      return;
    }

    if (action === 'back-day') {
      routineBuilder.screen = 'day';
      renderRoutineBuilder();
      return;
    }

    if (action === 'back-categories') {
      routineBuilder.screen = 'categories';
      routineBuilder.search = '';
      renderRoutineBuilder();
      return;
    }

    if (action === 'back-exercise-list') {
      routineBuilder.screen = 'exerciseList';
      renderRoutineBuilder();
      return;
    }

    if (action === 'open-category') {
      routineBuilder.category = actionTarget.getAttribute('data-category') || 'PIERNAS';
      routineBuilder.screen = 'exerciseList';
      routineBuilder.search = '';
      renderRoutineBuilder();
      return;
    }

    if (action === 'select-exercise') {
      routineBuilder.exerciseId = actionTarget.getAttribute('data-exercise-id') || routineBuilder.exerciseId;
      routineBuilder.screen = 'exerciseForm';
      const libraryItems = getRoutineExerciseCatalog();
      const match = (libraryItems[routineBuilder.category || 'PIERNAS'] || []).find((item) => item.id === routineBuilder.exerciseId);
      if (match && routineBuilder.editingIndex === null) {
        routineBuilder.draft = {
          sets: 3,
          repMin: 8,
          repMax: 12,
          targetWeight: '',
          approximations: [],
          zone: '',
          restSeconds: 90,
          notes: ''
        };
      }
      renderRoutineBuilder();
      return;
    }

    if (action === 'increase-sets') {
      routineBuilder.draft.sets = Math.max(1, Number(routineBuilder.draft.sets || 3) + 1);
      renderRoutineBuilder();
      return;
    }

    if (action === 'decrease-sets') {
      routineBuilder.draft.sets = Math.max(1, Number(routineBuilder.draft.sets || 3) - 1);
      renderRoutineBuilder();
      return;
    }

    if (action === 'toggle-more-options') {
      routineBuilder.showMoreOptions = !routineBuilder.showMoreOptions;
      renderRoutineBuilder();
      return;
    }

    if (action === 'add-approximation') {
      if (routineBuilder.draft.approximations.length >= 3) {
        return;
      }
      routineBuilder.draft.approximations.push({ weight: '', reps: 8 });
      renderRoutineBuilder();
      return;
    }

    if (action === 'remove-approx') {
      const approxIndex = Number(actionTarget.getAttribute('data-approx-index') || -1);
      if (approxIndex >= 0) {
        routineBuilder.draft.approximations.splice(approxIndex, 1);
        renderRoutineBuilder();
      }
      return;
    }

    if (action === 'save-exercise') {
      saveRoutineBuilderExercise();
      return;
    }

    if (action === 'edit-exercise') {
      const exerciseIndex = Number(actionTarget.getAttribute('data-exercise-index') || -1);
      const day = getRoutineBuilderDay();
      const exercise = day?.exercises?.[exerciseIndex];
      if (exercise) {
        routineBuilder.activeDayIndex = planningUi.currentDayIndex;
        routineBuilder.editingIndex = exerciseIndex;
        routineBuilder.category = exercise.category || routineBuilder.category || 'PIERNAS';
        routineBuilder.exerciseId = exercise.libraryExerciseId || exercise.id || null;
        loadRoutineBuilderDraftFromExercise(exercise);
        routineBuilder.screen = 'exerciseForm';
        renderRoutineBuilder();
      }
      return;
    }

    if (action === 'delete-exercise') {
      const exerciseIndex = Number(actionTarget.getAttribute('data-exercise-index') || -1);
      const day = getRoutineBuilderDay();
      if (day && exerciseIndex >= 0) {
        day.exercises.splice(exerciseIndex, 1);
        day.exercises = day.exercises.map((item, index) => ({ ...item, order: index + 1 }));
        renderPlanningDays();
      }
      return;
    }

    if (action === 'move-up') {
      const exerciseIndex = Number(actionTarget.getAttribute('data-exercise-index') || -1);
      const day = getRoutineBuilderDay();
      if (day && exerciseIndex > 0) {
        [day.exercises[exerciseIndex - 1], day.exercises[exerciseIndex]] = [day.exercises[exerciseIndex], day.exercises[exerciseIndex - 1]];
        day.exercises = day.exercises.map((item, index) => ({ ...item, order: index + 1 }));
        renderPlanningDays();
      }
      return;
    }

    if (action === 'move-down') {
      const exerciseIndex = Number(actionTarget.getAttribute('data-exercise-index') || -1);
      const day = getRoutineBuilderDay();
      if (day && exerciseIndex >= 0 && exerciseIndex < day.exercises.length - 1) {
        [day.exercises[exerciseIndex], day.exercises[exerciseIndex + 1]] = [day.exercises[exerciseIndex + 1], day.exercises[exerciseIndex]];
        day.exercises = day.exercises.map((item, index) => ({ ...item, order: index + 1 }));
        renderPlanningDays();
      }
      return;
    }
  }

  function handleRoutineBuilderRootInput(event) {
    if (!els.routineBuilderRoot || !event.target.closest('#routineBuilderRoot')) {
      return;
    }

    const field = event.target.getAttribute('data-routine-field');
    if (!field) {
      return;
    }

    if (field === 'search') {
      routineBuilder.search = event.target.value || '';
      renderRoutineBuilder();
      return;
    }

    if (field === 'repMin') {
      routineBuilder.draft.repMin = Math.max(1, Number(event.target.value || 1));
      if (routineBuilder.draft.repMax < routineBuilder.draft.repMin) {
        routineBuilder.draft.repMax = routineBuilder.draft.repMin;
      }
      renderRoutineBuilder();
      return;
    }

    if (field === 'repMax') {
      routineBuilder.draft.repMax = Math.max(1, Number(event.target.value || 1));
      if (routineBuilder.draft.repMin > routineBuilder.draft.repMax) {
        routineBuilder.draft.repMin = routineBuilder.draft.repMax;
      }
      renderRoutineBuilder();
      return;
    }

    if (field === 'targetWeight') {
      routineBuilder.draft.targetWeight = event.target.value === '' ? '' : String(event.target.value);
      return;
    }

    if (field === 'zone') {
      routineBuilder.draft.zone = event.target.value || '';
      return;
    }

    if (field === 'restSeconds') {
      routineBuilder.draft.restSeconds = Number(event.target.value || 90);
      return;
    }

    if (field === 'notes') {
      routineBuilder.draft.notes = event.target.value || '';
      return;
    }

    if (field === 'approx-weight') {
      const index = Number(event.target.getAttribute('data-approx-index') || -1);
      if (index >= 0 && routineBuilder.draft.approximations[index]) {
        routineBuilder.draft.approximations[index].weight = event.target.value === '' ? '' : String(event.target.value);
      }
      return;
    }

    if (field === 'approx-reps') {
      const index = Number(event.target.getAttribute('data-approx-index') || -1);
      if (index >= 0 && routineBuilder.draft.approximations[index]) {
        routineBuilder.draft.approximations[index].reps = Math.max(1, Number(event.target.value || 8));
      }
    }
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleDynamicFormSubmit);
  if (els.routineBuilderRoot) {
    els.routineBuilderRoot.addEventListener('click', handleRoutineBuilderRootClick);
    els.routineBuilderRoot.addEventListener('input', handleRoutineBuilderRootInput);
  }
  els.trainingGroupView?.addEventListener('input', handleGroupSessionInput);
  els.trainingGroupView?.addEventListener('change', handleGroupSessionChange);
  els.form.addEventListener('submit', handleMovementSubmit);
  els.cashForm.addEventListener('submit', handleInitialCashSubmit);
  els.routineForm.addEventListener('submit', handleRoutineSubmit);
  els.clientForm?.addEventListener('submit', handleClientSubmit);
  document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);
  els.copyOnboardingUrlBtn?.addEventListener('click', copyOnboardingUrl);
  document.getElementById('exportBtn').addEventListener('click', exportData);
  els.fileInput.addEventListener('change', handleImport);
  els.clientSearch?.addEventListener('input', (event) => {
    clientUi.search = event.target.value || '';
    renderClients();
  });
  els.restPreset?.addEventListener('change', (event) => {
    const preset = event.target.value;
    if (!els.restInput) {
      return;
    }
    if (preset === 'custom') {
      if (!els.restInput.value || ['60', '90', '95', '120'].includes(String(els.restInput.value))) {
        els.restInput.value = '';
      }
      els.restInput.focus();
      return;
    }
    els.restInput.value = preset;
  });
  els.studentId?.addEventListener('change', (event) => {
    trainingUi.selectedClientId = event.target.value || '';
    trainingUi.programDayClientId = '';
    setActiveSessionForClient(trainingUi.selectedClientId);
    if (els.historyClientId) {
      els.historyClientId.value = trainingUi.selectedClientId;
    }
    renderTrainings();
  });
  els.programDaySelect?.addEventListener('change', (event) => {
    const selectedDayId = event.target.value || '';
    if (!selectedDayId) {
      return;
    }
    if (!startProgramDaySession(trainingUi.selectedClientId, selectedDayId) && els.programDayMessage) {
      els.programDayMessage.textContent = 'No se pudo abrir ese día del programa.';
    }
  });
  els.sessionCreateMode?.addEventListener('change', () => {
    renderTrainings();
  });
  els.sessionTemplateId?.addEventListener('change', () => {
    if ((els.sessionCreateMode?.value || 'scratch') === 'template') {
      const selectedTemplate = getTemplateById(els.sessionTemplateId?.value || '');
      if (selectedTemplate && els.routineName && !els.routineName.value) {
        els.routineName.value = selectedTemplate.name;
      }
    }
  });
  els.trainingSessionId?.addEventListener('change', (event) => {
    const sessionId = event.target.value || '';
    if (!sessionId) {
      trainingUi.activeSessionId = '';
      trainingUi.activeExerciseId = '';
      trainingUi.editingExerciseId = '';
      if (els.exerciseIdInput) {
        els.exerciseIdInput.value = '';
      }
      renderTrainings();
      return;
    }
    setActiveSessionForClient(trainingUi.selectedClientId, sessionId);
    renderTrainings();
  });
  els.historyClientId?.addEventListener('change', (event) => {
    trainingUi.selectedClientId = event.target.value || '';
    setActiveSessionForClient(trainingUi.selectedClientId);
    renderTrainings();
  });
  els.historyExercise?.addEventListener('input', (event) => {
    trainingUi.selectedExercise = event.target.value || '';
    renderTrainings();
  });
  els.exerciseCategorySelect?.addEventListener('change', renderProgramLibrary);
  els.exerciseLibrarySearch?.addEventListener('input', renderProgramLibrary);
  els.newLibraryExerciseBtn?.addEventListener('click', () => {
    resetLibraryExerciseForm();
    setLibraryMessage('Nuevo ejercicio listo para guardar.', 'neutral');
  });
  els.saveLibraryExerciseBtn?.addEventListener('click', () => {
    saveLibraryExercise();
  });
  els.librarySearch?.addEventListener('input', renderLibraryExerciseList);
  els.libraryPatternFilter?.addEventListener('change', renderLibraryExerciseList);
  els.libraryMuscleFilter?.addEventListener('change', renderLibraryExerciseList);
  els.libraryTechnicalLevelFilter?.addEventListener('change', renderLibraryExerciseList);
  els.addProgramDayBtn?.addEventListener('click', addProgramDay);
  els.newProgramBtn?.addEventListener('click', () => {
    clearProgramExerciseForm();
    resetProgramDraft();
    renderProgramDayList(getProgramDraft());
    renderProgramsList();
  });
  els.saveProgramBtn?.addEventListener('click', saveProgram);
  els.addProgramApproximationBtn?.addEventListener('click', () => {
    const draft = getProgramDraft();
    const day = draft.days.find((item) => item.id === trainingUi.editingProgramDayId);
    const exercise = day?.exercises.find((item) => item.id === trainingUi.editingProgramExerciseId) || trainingUi.programExerciseDraft;
    if (exercise) {
      exercise.approximations = Array.isArray(exercise.approximations) ? exercise.approximations : [];
      if (exercise.approximations.length >= 3) {
        return;
      }
      exercise.approximations.push(createProgramApproximation(exercise.approximations.length + 1));
      renderProgramExerciseRows(exercise);
    }
  });
  els.addProgramEffectiveSetBtn?.addEventListener('click', () => {
    const draft = getProgramDraft();
    const day = draft.days.find((item) => item.id === trainingUi.editingProgramDayId);
    const exercise = day?.exercises.find((item) => item.id === trainingUi.editingProgramExerciseId) || trainingUi.programExerciseDraft;
    if (exercise) {
      exercise.effectiveSets = Array.isArray(exercise.effectiveSets) ? exercise.effectiveSets : [];
      exercise.effectiveSets.push(createProgramEffectiveSet(exercise.effectiveSets.length + 1));
      renderProgramExerciseRows(exercise);
    }
  });
  els.saveProgramExerciseBtn?.addEventListener('click', saveProgramExercise);
  els.clearProgramExerciseBtn?.addEventListener('click', clearProgramExerciseForm);
  document.getElementById('exercise')?.addEventListener('input', (event) => {
    if (!els.historyExercise || els.historyExercise.value) {
      return;
    }
    trainingUi.selectedExercise = event.target.value || '';
    renderTrainings();
  });
  els.saveSetBtn?.addEventListener('click', () => {
    saveTrainingSetEntry().catch((error) => {
      if (els.routineMessage) {
        els.routineMessage.textContent = error?.message || 'No se pudo guardar la serie.';
      }
    });
  });
  document.addEventListener('input', (event) => {
    if (event.target.closest('#nutritionPlanForm')) {
      updatePlanDraftFromInputs(event);
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target.closest('#nutritionPlanForm')) {
      updatePlanDraftFromInputs(event);
    }
  });

  window.addEventListener('valhalla:auth-changed', renderAuthPanel);

  show('home');
  render();
  refreshCloudSessionState()
    .then((hasCloudSession) => {
      if (hasCloudSession) {
        return Promise.all([
          refreshClients(),
          refreshTrainingsV08FromCloud()
        ]);
      }
      return refreshClients();
    })
    .catch(() => {});

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
})();
