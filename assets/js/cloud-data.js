
(function () {
  const authApi = window.VALHALLA.auth;
  const supabaseApi = window.VALHALLA.supabase;
  const dataApi = window.VALHALLA.data;

  // Capa de tablas antiguas (schema.sql: clients, training_plans, ...). Queda desactivada:
  // esas tablas no existen en el proyecto nuevo y usan ids uuid que no calzan con los de la app.
  // La sincronización nueva (coach_state y tablas de alumno) va en otro módulo.
  const LEGACY_TABLES_ENABLED = false;

  function isAvailable() {
    return Boolean(LEGACY_TABLES_ENABLED && supabaseApi && typeof supabaseApi.isCloudEnabled === 'function' && supabaseApi.isCloudEnabled());
  }

  function getSupabaseClient() {
    if (!isAvailable()) {
      return null;
    }
    if (!(window.supabase && typeof window.supabase.createClient === 'function')) {
      return null;
    }
    return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }

  async function getOwnerContext() {
    if (!authApi || typeof authApi.loadSession !== 'function' || typeof authApi.getProfile !== 'function') {
      return { ownerId: null, authUserId: null, error: 'Autenticación no disponible' };
    }

    const sessionResult = await authApi.loadSession();
    if (!sessionResult || !sessionResult.session || !sessionResult.user) {
      return { ownerId: null, authUserId: null, error: 'No existe una sesión activa en Cloud' };
    }

    const profileResult = await authApi.getProfile();
    if (!profileResult || !profileResult.profile || !profileResult.profile.id) {
      return { ownerId: null, authUserId: null, error: 'No se encontró un perfil asociado a la sesión activa' };
    }

    return {
      ownerId: profileResult.profile.id,
      authUserId: sessionResult.user.id,
      error: null
    };
  }

  function normalizeTrainingSet(setEntry, index) {
    const rawType = String(setEntry?.setType || setEntry?.set_type || 'S').trim().toUpperCase();
    const setType = rawType === 'A' || rawType === 'T' || rawType === 'S' ? rawType : 'S';
    return {
      setNumber: Number(setEntry?.setNumber || index + 1),
      weight: Number(setEntry?.weight || 0),
      reps: Number(setEntry?.reps || 0),
      completed: setEntry?.completed !== false,
      setType,
      createdAt: setEntry?.createdAt || new Date().toISOString(),
      techniqueStatus: setEntry?.techniqueStatus || 'pending',
      coachValidated: Boolean(setEntry?.coachValidated),
      personalRecord: Boolean(setEntry?.personalRecord)
    };
  }

  function normalizeTrainingExercise(exercise, index) {
    const plannedSets = Number(exercise?.plannedSets || 1);
    const plannedRepMin = Number(exercise?.plannedRepMin || 1);
    const plannedRepMaxRaw = Number(exercise?.plannedRepMax || plannedRepMin);
    return {
      id: String(exercise?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tx-exercise-${Date.now()}-${index + 1}`)),
      libraryExerciseId: exercise?.libraryExerciseId || exercise?.library_exercise_id || null,
      exerciseName: String(exercise?.exerciseName || 'Ejercicio'),
      order: Number(exercise?.order || index + 1),
      plannedSets: plannedSets > 0 ? plannedSets : 1,
      plannedRepMin: plannedRepMin > 0 ? plannedRepMin : 1,
      plannedRepMax: plannedRepMaxRaw >= plannedRepMin ? plannedRepMaxRaw : plannedRepMin,
      targetWeight: Number(exercise?.targetWeight || 0),
      restSeconds: Number(exercise?.restSeconds || 90),
      coachNotes: String(exercise?.coachNotes || ''),
      sets: Array.isArray(exercise?.sets)
        ? exercise.sets.map((setEntry, setIndex) => normalizeTrainingSet(setEntry, setIndex))
        : []
    };
  }

  function normalizeTrainingSession(session, index) {
    return {
      id: String(session?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tx-session-${Date.now()}-${index + 1}`)),
      clientId: String(session?.clientId || ''),
      planId: session?.planId || null,
      groupSessionId: session?.groupSessionId || null,
      date: String(session?.date || ''),
      title: String(session?.title || `Sesion ${index + 1}`),
      status: String(session?.status || 'in_progress'),
      notes: String(session?.notes || ''),
      exercises: Array.isArray(session?.exercises)
        ? session.exercises.map((exercise, exerciseIndex) => normalizeTrainingExercise(exercise, exerciseIndex))
        : []
    };
  }

  function normalizeLibraryExercise(exercise) {
    return {
      id: exercise?.id || null,
      name: String(exercise?.name || 'Ejercicio'),
      normalizedName: String(exercise?.normalizedName || exercise?.normalized_name || ''),
      description: String(exercise?.description || ''),
      pattern: String(exercise?.pattern || 'other'),
      primaryMuscle: String(exercise?.primaryMuscle || exercise?.primary_muscle || 'full_body'),
      secondaryMuscles: Array.isArray(exercise?.secondaryMuscles) ? exercise.secondaryMuscles.slice() : [],
      equipments: Array.isArray(exercise?.equipments) ? exercise.equipments.slice() : [],
      technicalLevel: String(exercise?.technicalLevel || exercise?.technical_level || 'beginner'),
      loadType: String(exercise?.loadType || exercise?.load_type || 'external_load'),
      active: exercise?.active !== false,
      relations: Array.isArray(exercise?.relations) ? exercise.relations.slice() : []
    };
  }

  function normalizeClientRecord(client) {
    if (dataApi && typeof dataApi.normalizeClient === 'function') {
      return dataApi.normalizeClient(client);
    }

    return client;
  }

  async function listClients() {
    if (!isAvailable()) {
      return { data: [], error: 'Modo local' };
    }

    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: [], error: ownerContext.error };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { data: [], error: 'Supabase SDK no disponible' };
    }

    const { data, error } = await client.from('clients').select('*').eq('owner_id', ownerContext.ownerId).order('created_at', { ascending: false });
    return { data: Array.isArray(data) ? data.map((item) => normalizeClientRecord(item)) : [], error };
  }

  async function createClient(payload) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }

    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }

    // auth_user_id es la cuenta del alumno, no la del entrenador: no se completa aquí.
    const nextPayload = {
      ...payload,
      owner_id: ownerContext.ownerId
    };

    const { data, error } = await client.from('clients').insert(nextPayload).select().single();
    return { data: data ? normalizeClientRecord(data) : null, error };
  }

  async function updateClient(id, payload) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }

    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }

    const { data, error } = await client.from('clients').update(payload).eq('id', id).eq('owner_id', ownerContext.ownerId).select().single();
    return { data: data ? normalizeClientRecord(data) : null, error };
  }

  async function markClientPaid(clientId, paymentDetails) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }

    return { data: null, error: 'Integración en preparación' };
  }

  async function listTrainingPlans() {
    if (!isAvailable()) {
      return { data: [], error: 'Modo local' };
    }

    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: [], error: ownerContext.error };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { data: [], error: 'Supabase SDK no disponible' };
    }

    const { data, error } = await client
      .from('training_plans')
      .select('*')
      .eq('owner_id', ownerContext.ownerId)
      .order('created_at', { ascending: false });

    return { data: Array.isArray(data) ? data : [], error };
  }

  async function listLibraryExercises() {
    if (!isAvailable()) {
      return { data: [], error: 'Modo local' };
    }
    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: [], error: ownerContext.error };
    }
    const client = getSupabaseClient();
    if (!client) {
      return { data: [], error: 'Supabase SDK no disponible' };
    }

    const { data: exercisesData, error: exercisesError } = await client
      .from('library_exercises')
      .select('*')
      .eq('owner_id', ownerContext.ownerId)
      .order('name', { ascending: true });
    if (exercisesError) {
      return { data: [], error: exercisesError };
    }

    const exerciseIds = (exercisesData || []).map((item) => item.id);
    const secondaryMusclesByExercise = new Map();
    const equipmentsByExercise = new Map();
    const relationsByExercise = new Map();

    if (exerciseIds.length) {
      const [{ data: muscleRows, error: muscleError }, { data: equipmentRows, error: equipmentError }, { data: relationRows, error: relationError }] = await Promise.all([
        client.from('library_exercise_secondary_muscles').select('*').eq('owner_id', ownerContext.ownerId).in('exercise_id', exerciseIds),
        client.from('library_exercise_equipments').select('*').eq('owner_id', ownerContext.ownerId).in('exercise_id', exerciseIds),
        client.from('library_exercise_relations').select('*').eq('owner_id', ownerContext.ownerId).in('exercise_id', exerciseIds)
      ]);
      if (muscleError) {
        return { data: [], error: muscleError };
      }
      if (equipmentError) {
        return { data: [], error: equipmentError };
      }
      if (relationError) {
        return { data: [], error: relationError };
      }

      const nameById = new Map((exercisesData || []).map((row) => [String(row.id), String(row.name || '')]));

      (muscleRows || []).forEach((row) => {
        const key = String(row.exercise_id);
        if (!secondaryMusclesByExercise.has(key)) {
          secondaryMusclesByExercise.set(key, []);
        }
        secondaryMusclesByExercise.get(key).push(String(row.muscle_key));
      });

      (equipmentRows || []).forEach((row) => {
        const key = String(row.exercise_id);
        if (!equipmentsByExercise.has(key)) {
          equipmentsByExercise.set(key, []);
        }
        equipmentsByExercise.get(key).push(String(row.equipment_key));
      });

      (relationRows || []).forEach((row) => {
        const key = String(row.exercise_id);
        if (!relationsByExercise.has(key)) {
          relationsByExercise.set(key, []);
        }
        relationsByExercise.get(key).push({
          id: row.id,
          relatedExerciseId: row.related_exercise_id,
          relationType: row.relation_type,
          notes: row.notes || '',
          relatedExerciseName: nameById.get(String(row.related_exercise_id)) || ''
        });
      });
    }

    const exercises = (exercisesData || []).map((row) => normalizeLibraryExercise({
      id: row.id,
      name: row.name,
      normalized_name: row.normalized_name,
      description: row.description,
      pattern: row.pattern,
      primary_muscle: row.primary_muscle,
      technical_level: row.technical_level,
      load_type: row.load_type,
      active: row.active,
      secondaryMuscles: secondaryMusclesByExercise.get(String(row.id)) || [],
      equipments: equipmentsByExercise.get(String(row.id)) || [],
      relations: relationsByExercise.get(String(row.id)) || []
    }));

    return { data: exercises, error: null };
  }

  async function upsertLibraryExercise(exercisePayload) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }
    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }
    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }

    const normalized = normalizeLibraryExercise(exercisePayload);
    const { data, error } = await client
      .from('library_exercises')
      .upsert({
        id: normalized.id || undefined,
        owner_id: ownerContext.ownerId,
        name: normalized.name,
        normalized_name: normalized.normalizedName,
        description: normalized.description || null,
        pattern: normalized.pattern,
        primary_muscle: normalized.primaryMuscle,
        technical_level: normalized.technicalLevel,
        load_type: normalized.loadType,
        active: normalized.active !== false
      }, { onConflict: 'id' })
      .select()
      .single();
    if (error) {
      return { data: null, error };
    }

    const exerciseId = data.id;
    const [currentMuscles, currentEquipments, currentRelations] = await Promise.all([
      client.from('library_exercise_secondary_muscles').select('*').eq('owner_id', ownerContext.ownerId).eq('exercise_id', exerciseId),
      client.from('library_exercise_equipments').select('*').eq('owner_id', ownerContext.ownerId).eq('exercise_id', exerciseId),
      client.from('library_exercise_relations').select('*').eq('owner_id', ownerContext.ownerId).eq('exercise_id', exerciseId)
    ]);

    const incomingMuscles = new Set(normalized.secondaryMuscles || []);
    const incomingEquipments = new Set(normalized.equipments || []);
    const incomingRelations = new Set((normalized.relations || []).map((relation) => `${relation.relatedExerciseId}::${relation.relationType}`));

    const staleMuscles = (currentMuscles.data || []).filter((row) => !incomingMuscles.has(String(row.muscle_key))).map((row) => row.id);
    const staleEquipments = (currentEquipments.data || []).filter((row) => !incomingEquipments.has(String(row.equipment_key))).map((row) => row.id);
    const staleRelations = (currentRelations.data || []).filter((row) => !incomingRelations.has(`${row.related_exercise_id}::${row.relation_type}`)).map((row) => row.id);

    if (staleMuscles.length) {
      await client.from('library_exercise_secondary_muscles').delete().eq('owner_id', ownerContext.ownerId).in('id', staleMuscles);
    }
    if (staleEquipments.length) {
      await client.from('library_exercise_equipments').delete().eq('owner_id', ownerContext.ownerId).in('id', staleEquipments);
    }
    if (staleRelations.length) {
      await client.from('library_exercise_relations').delete().eq('owner_id', ownerContext.ownerId).in('id', staleRelations);
    }

    for (const muscleKey of incomingMuscles) {
      await client.from('library_exercise_secondary_muscles').upsert({
        owner_id: ownerContext.ownerId,
        exercise_id: exerciseId,
        muscle_key: muscleKey
      }, { onConflict: 'exercise_id,muscle_key' });
    }
    for (const equipmentKey of incomingEquipments) {
      await client.from('library_exercise_equipments').upsert({
        owner_id: ownerContext.ownerId,
        exercise_id: exerciseId,
        equipment_key: equipmentKey
      }, { onConflict: 'exercise_id,equipment_key' });
    }
    for (const relation of normalized.relations || []) {
      if (!relation.relatedExerciseId) {
        continue;
      }
      await client.from('library_exercise_relations').upsert({
        owner_id: ownerContext.ownerId,
        exercise_id: exerciseId,
        related_exercise_id: relation.relatedExerciseId,
        relation_type: relation.relationType,
        notes: relation.notes || null
      }, { onConflict: 'exercise_id,related_exercise_id,relation_type' });
    }

    return { data, error: null };
  }

  async function deleteLibraryExercise(exerciseId) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }
    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }
    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }
    const { error } = await client
      .from('library_exercises')
      .update({ active: false })
      .eq('id', exerciseId)
      .eq('owner_id', ownerContext.ownerId);
    return { data: null, error };
  }

  async function upsertTrainingPlan(planPayload) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }

    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }

    const payload = {
      id: String(planPayload?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tx-plan-${Date.now()}`)),
      owner_id: ownerContext.ownerId,
      client_id: String(planPayload?.client_id || ''),
      name: String(planPayload?.name || 'Plantilla de entrenamiento'),
      notes: String(planPayload?.notes || ''),
      active: planPayload?.active !== false
    };

    const { data, error } = await client
      .from('training_plans')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    return { data, error };
  }

  async function deleteTrainingPlan(planId) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }

    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }

    const { error } = await client
      .from('training_plans')
      .delete()
      .eq('id', planId)
      .eq('owner_id', ownerContext.ownerId);

    return { data: null, error };
  }

  async function listSportsProfiles() {
    if (!isAvailable()) {
      return { data: [], error: 'Modo local' };
    }
    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: [], error: ownerContext.error };
    }
    const client = getSupabaseClient();
    if (!client) {
      return { data: [], error: 'Supabase SDK no disponible' };
    }
    const { data, error } = await client
      .from('client_sports_profiles')
      .select('*')
      .eq('owner_id', ownerContext.ownerId)
      .order('updated_at', { ascending: false });
    return { data: Array.isArray(data) ? data : [], error };
  }

  async function upsertSportsProfile(profilePayload) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }
    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }
    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }
    const payload = {
      id: profilePayload?.id || undefined,
      owner_id: ownerContext.ownerId,
      client_id: profilePayload?.client_id,
      primary_goal: profilePayload?.primary_goal || 'otro',
      secondary_goal: profilePayload?.secondary_goal || null,
      goal_notes: profilePayload?.goal_notes || null,
      experience_level: profilePayload?.experience_level || 'principiante',
      experience_months: Number(profilePayload?.experience_months || 0),
      coach_start_date: profilePayload?.coach_start_date || null,
      sessions_per_week: Number(profilePayload?.sessions_per_week || 0),
      session_duration_minutes: Number(profilePayload?.session_duration_minutes || 0),
      coach_notes: profilePayload?.coach_notes || null
    };
    const { data, error } = await client
      .from('client_sports_profiles')
      .upsert(payload, { onConflict: 'client_id' })
      .select()
      .single();
    return { data, error };
  }

  async function listSportsConsiderations() {
    if (!isAvailable()) {
      return { data: [], error: 'Modo local' };
    }
    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: [], error: ownerContext.error };
    }
    const client = getSupabaseClient();
    if (!client) {
      return { data: [], error: 'Supabase SDK no disponible' };
    }
    const { data, error } = await client
      .from('client_sports_considerations')
      .select('*')
      .eq('owner_id', ownerContext.ownerId)
      .order('noted_on', { ascending: false })
      .order('created_at', { ascending: false });
    return { data: Array.isArray(data) ? data : [], error };
  }

  async function upsertSportsConsideration(itemPayload) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }
    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }
    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }
    const payload = {
      id: itemPayload?.id || undefined,
      owner_id: ownerContext.ownerId,
      client_id: itemPayload?.client_id,
      title: itemPayload?.title || 'Consideración',
      description: itemPayload?.description || null,
      status: itemPayload?.status || 'activa',
      noted_on: itemPayload?.noted_on || new Date().toISOString().slice(0, 10),
      review_date: itemPayload?.review_date || null
    };
    const { data, error } = await client
      .from('client_sports_considerations')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();
    return { data, error };
  }

  async function deleteSportsConsideration(id) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }
    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }
    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }
    const { error } = await client
      .from('client_sports_considerations')
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerContext.ownerId);
    return { data: null, error };
  }

  async function listMovementStatuses() {
    if (!isAvailable()) {
      return { data: [], error: 'Modo local' };
    }
    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: [], error: ownerContext.error };
    }
    const client = getSupabaseClient();
    if (!client) {
      return { data: [], error: 'Supabase SDK no disponible' };
    }
    const { data, error } = await client
      .from('client_movement_statuses')
      .select('*')
      .eq('owner_id', ownerContext.ownerId)
      .order('movement_name', { ascending: true });
    return { data: Array.isArray(data) ? data : [], error };
  }

  async function upsertMovementStatus(itemPayload) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }
    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }
    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }
    const payload = {
      id: itemPayload?.id || undefined,
      owner_id: ownerContext.ownerId,
      client_id: itemPayload?.client_id,
      library_exercise_id: itemPayload?.library_exercise_id || null,
      movement_name: itemPayload?.movement_name || 'Movimiento',
      movement_key: itemPayload?.movement_key || 'movimiento',
      status: itemPayload?.status || 'no_evaluado',
      coach_note: itemPayload?.coach_note || null,
      evaluated_1rm: itemPayload?.evaluated_1rm === '' || itemPayload?.evaluated_1rm === null || itemPayload?.evaluated_1rm === undefined ? null : Number(itemPayload?.evaluated_1rm),
      last_evaluated_on: itemPayload?.last_evaluated_on || null
    };
    const { data, error } = await client
      .from('client_movement_statuses')
      .upsert(payload, { onConflict: 'client_id,movement_key' })
      .select()
      .single();
    return { data, error };
  }

  async function deleteMovementStatus(id) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }
    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }
    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }
    const { error } = await client
      .from('client_movement_statuses')
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerContext.ownerId);
    return { data: null, error };
  }

  async function listTrainingSessions() {
    if (!isAvailable()) {
      return { data: [], error: 'Modo local' };
    }

    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: [], error: ownerContext.error };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { data: [], error: 'Supabase SDK no disponible' };
    }

    const { data: sessionsData, error: sessionsError } = await client
      .from('training_sessions')
      .select('*')
      .eq('owner_id', ownerContext.ownerId)
      .order('session_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (sessionsError) {
      return { data: [], error: sessionsError };
    }

    const sessionIds = (sessionsData || []).map((session) => String(session.id));
    if (!sessionIds.length) {
      return { data: [], error: null };
    }

    const { data: exercisesData, error: exercisesError } = await client
      .from('training_exercises')
      .select('*')
      .eq('owner_id', ownerContext.ownerId)
      .in('session_id', sessionIds)
      .order('exercise_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (exercisesError) {
      return { data: [], error: exercisesError };
    }

    const exerciseIds = (exercisesData || []).map((exercise) => String(exercise.id));
    const setsByExerciseId = new Map();
    if (exerciseIds.length) {
      const { data: setsData, error: setsError } = await client
        .from('training_sets')
        .select('*')
        .eq('owner_id', ownerContext.ownerId)
        .in('exercise_id', exerciseIds)
        .order('set_number', { ascending: true })
        .order('created_at', { ascending: true });
      if (setsError) {
        return { data: [], error: setsError };
      }

      (setsData || []).forEach((setRow, setIndex) => {
        const key = String(setRow.exercise_id);
        if (!setsByExerciseId.has(key)) {
          setsByExerciseId.set(key, []);
        }
        setsByExerciseId.get(key).push(normalizeTrainingSet({
          setNumber: setRow.set_number,
          weight: setRow.weight,
          reps: setRow.reps,
          completed: setRow.completed,
          setType: setRow.set_type,
          createdAt: setRow.created_at,
          techniqueStatus: setRow.technique_status,
          coachValidated: setRow.coach_validated,
          personalRecord: setRow.personal_record
        }, setIndex));
      });
    }

    const exercisesBySessionId = new Map();
    (exercisesData || []).forEach((exerciseRow, index) => {
      const sessionId = String(exerciseRow.session_id);
      if (!exercisesBySessionId.has(sessionId)) {
        exercisesBySessionId.set(sessionId, []);
      }
      exercisesBySessionId.get(sessionId).push(normalizeTrainingExercise({
        id: exerciseRow.id,
        library_exercise_id: exerciseRow.library_exercise_id,
        exerciseName: exerciseRow.exercise_name,
        order: exerciseRow.exercise_order,
        plannedSets: exerciseRow.planned_sets,
        plannedRepMin: exerciseRow.planned_rep_min,
        plannedRepMax: exerciseRow.planned_rep_max,
        targetWeight: exerciseRow.target_weight,
        restSeconds: exerciseRow.rest_seconds,
        coachNotes: exerciseRow.coach_notes,
        sets: setsByExerciseId.get(String(exerciseRow.id)) || []
      }, index));
    });

    const sessions = (sessionsData || []).map((sessionRow, index) => normalizeTrainingSession({
      id: sessionRow.id,
      clientId: sessionRow.client_id,
      planId: sessionRow.plan_id,
      groupSessionId: sessionRow.group_session_id,
      date: sessionRow.session_date,
      title: sessionRow.title,
      status: sessionRow.status,
      notes: sessionRow.notes,
      exercises: exercisesBySessionId.get(String(sessionRow.id)) || []
    }, index));

    return { data: sessions, error: null };
  }

  async function upsertTrainingSession(session) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }

    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }

    const normalized = normalizeTrainingSession(session, 0);
    const payload = {
      id: normalized.id,
      owner_id: ownerContext.ownerId,
      client_id: normalized.clientId,
      plan_id: normalized.planId,
      group_session_id: normalized.groupSessionId,
      session_date: normalized.date || null,
      title: normalized.title,
      status: normalized.status,
      notes: normalized.notes
    };

    const { data, error } = await client
      .from('training_sessions')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    return { data, error };
  }

  async function upsertTrainingExercise(session, exercise) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }

    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }

    const normalizedSession = normalizeTrainingSession(session, 0);
    const normalizedExercise = normalizeTrainingExercise(exercise, 0);

    const payload = {
      id: normalizedExercise.id,
      owner_id: ownerContext.ownerId,
      client_id: normalizedSession.clientId,
      session_id: normalizedSession.id,
      library_exercise_id: normalizedExercise.libraryExerciseId || null,
      exercise_name: normalizedExercise.exerciseName,
      exercise_order: normalizedExercise.order,
      planned_sets: normalizedExercise.plannedSets,
      planned_rep_min: normalizedExercise.plannedRepMin,
      planned_rep_max: normalizedExercise.plannedRepMax,
      target_weight: normalizedExercise.targetWeight,
      rest_seconds: normalizedExercise.restSeconds,
      coach_notes: normalizedExercise.coachNotes
    };

    const { data, error } = await client
      .from('training_exercises')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    return { data, error };
  }

  async function upsertTrainingSet(session, exercise, setEntry) {
    if (!isAvailable()) {
      return { data: null, error: 'Modo local' };
    }

    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }

    const normalizedSession = normalizeTrainingSession(session, 0);
    const normalizedExercise = normalizeTrainingExercise(exercise, 0);
    const normalizedSet = normalizeTrainingSet(setEntry, 0);
    const setId = String(setEntry?.id || `${normalizedExercise.id}::${normalizedSet.setNumber}`);

    const payload = {
      id: setId,
      owner_id: ownerContext.ownerId,
      client_id: normalizedSession.clientId,
      session_id: normalizedSession.id,
      exercise_id: normalizedExercise.id,
      set_number: normalizedSet.setNumber,
      weight: normalizedSet.weight,
      reps: normalizedSet.reps,
      completed: normalizedSet.completed,
      technique_status: normalizedSet.techniqueStatus,
      coach_validated: normalizedSet.coachValidated,
      personal_record: normalizedSet.personalRecord,
      created_at: normalizedSet.createdAt
    };

    const { data, error } = await client
      .from('training_sets')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    return { data, error };
  }

  async function saveTrainingSessionDeep(session) {
    const normalizedSession = normalizeTrainingSession(session, 0);
    const sessionResult = await upsertTrainingSession(normalizedSession);
    if (sessionResult.error) {
      return sessionResult;
    }

    const ownerContext = await getOwnerContext();
    if (ownerContext.error) {
      return { data: null, error: ownerContext.error };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: 'Supabase SDK no disponible' };
    }

    const incomingExerciseIds = new Set(normalizedSession.exercises.map((exercise) => String(exercise.id)));
    const incomingSetIds = new Set();

    for (let exerciseIndex = 0; exerciseIndex < normalizedSession.exercises.length; exerciseIndex += 1) {
      const exercise = normalizeTrainingExercise(normalizedSession.exercises[exerciseIndex], exerciseIndex);
      const exerciseResult = await upsertTrainingExercise(normalizedSession, exercise);
      if (exerciseResult.error) {
        return exerciseResult;
      }
      for (let setIndex = 0; setIndex < exercise.sets.length; setIndex += 1) {
        const setEntry = normalizeTrainingSet(exercise.sets[setIndex], setIndex);
        incomingSetIds.add(String(setEntry?.id || `${exercise.id}::${setEntry.setNumber}`));
        const setResult = await upsertTrainingSet(normalizedSession, exercise, setEntry);
        if (setResult.error) {
          return setResult;
        }
      }
    }

    const { data: existingExercises, error: existingExercisesError } = await client
      .from('training_exercises')
      .select('id')
      .eq('owner_id', ownerContext.ownerId)
      .eq('session_id', normalizedSession.id);

    if (existingExercisesError) {
      return { data: null, error: existingExercisesError };
    }

    const staleExerciseIds = (existingExercises || [])
      .map((row) => String(row.id))
      .filter((exerciseId) => !incomingExerciseIds.has(exerciseId));

    if (staleExerciseIds.length) {
      const { error: deleteExercisesError } = await client
        .from('training_exercises')
        .delete()
        .eq('owner_id', ownerContext.ownerId)
        .in('id', staleExerciseIds);
      if (deleteExercisesError) {
        return { data: null, error: deleteExercisesError };
      }
    }

    const { data: existingSets, error: existingSetsError } = await client
      .from('training_sets')
      .select('id')
      .eq('owner_id', ownerContext.ownerId)
      .eq('session_id', normalizedSession.id);

    if (existingSetsError) {
      return { data: null, error: existingSetsError };
    }

    const staleSetIds = (existingSets || [])
      .map((row) => String(row.id))
      .filter((setId) => !incomingSetIds.has(setId));

    if (staleSetIds.length) {
      const { error: deleteSetsError } = await client
        .from('training_sets')
        .delete()
        .eq('owner_id', ownerContext.ownerId)
        .in('id', staleSetIds);
      if (deleteSetsError) {
        return { data: null, error: deleteSetsError };
      }
    }

    return { data: normalizedSession, error: null };
  }

  async function uploadLocalDataToCloud(localState) {
    if (!isAvailable()) {
      return { ok: false, error: 'Modo local' };
    }
    return {
      ok: false,
      error: 'Funcion manual pendiente: Subir datos locales a Cloud'
    };
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.cloudData = {
    isAvailable,
    getOwnerContext,
    listClients,
    createClient,
    updateClient,
    markClientPaid,
    listLibraryExercises,
    upsertLibraryExercise,
    deleteLibraryExercise,
    listSportsProfiles,
    upsertSportsProfile,
    listSportsConsiderations,
    upsertSportsConsideration,
    deleteSportsConsideration,
    listMovementStatuses,
    upsertMovementStatus,
    deleteMovementStatus,
    listTrainingPlans,
    upsertTrainingPlan,
    deleteTrainingPlan,
    listTrainingSessions,
    upsertTrainingSession,
    upsertTrainingExercise,
    upsertTrainingSet,
    saveTrainingSessionDeep,
    uploadLocalDataToCloud
  };
})();
