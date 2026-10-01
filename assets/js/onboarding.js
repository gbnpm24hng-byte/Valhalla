(function () {
  const fields = [
    { label: 'Nombre completo', name: 'fullName', required: true },
    { label: 'Teléfono de contacto', name: 'phone', required: true },
    { label: 'Edad', name: 'age' },
    { label: 'Objetivo', name: 'objective', required: true },
    { label: 'Experiencia previa', name: 'experience', required: true },
    { label: 'Lesiones o molestias', name: 'injuries' },
    { label: 'Ejercicios que debe evitar', name: 'avoidExercises' },
    { label: 'Comentario adicional', name: 'comment' }
  ];

  function parseMessage(message) {
    const source = String(message || '').replace(/\r/g, '');
    const markers = [];
    fields.forEach((field) => {
      const marker = new RegExp(`^\\s*${field.label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}:[ \\t]*`, 'gm');
      let match;
      while ((match = marker.exec(source))) {
        markers.push({ name: field.name, start: match.index, valueStart: marker.lastIndex });
      }
    });
    markers.sort((first, second) => first.start - second.start);
    const values = {};
    markers.forEach((marker, index) => {
      const end = markers[index + 1]?.start ?? source.length;
      values[marker.name] = source.slice(marker.valueStart, end).trim();
    });
    if (values.age === 'No informado') {
      values.age = '';
    }
    return values;
  }

  function buildMessage(values) {
    const lines = ['INGRESO NUEVO ALUMNO'];
    fields.forEach((field) => {
      const value = String(values[field.name] || '').trim();
      lines.push(`${field.label}: ${value || 'No informado'}`);
    });
    return lines.join('\n');
  }

  const query = new URLSearchParams(window.location.search);
  const active = query.get('onboarding') === '1';
  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.onboarding = { active, parseMessage, buildMessage };

  if (!active) {
    return;
  }

  const app = document.getElementById('app');
  const root = document.getElementById('onboardingView');
  const coachNumber = String(query.get('coach') || '').replace(/\D/g, '');
  if (app) {
    app.classList.add('hidden');
  }
  if (!root) {
    return;
  }
  document.body.classList.add('public-onboarding-mode');
  document.title = 'Ingreso de alumnos | VALHALLA';
  root.classList.remove('hidden');
  root.innerHTML = `
    <div class="onboarding-shell">
      <header class="onboarding-header">
        <span class="onboarding-brand-mark">VR</span>
        <div><p class="eyebrow">VIKINGOS RADICAL</p><h1>Ingreso de alumno</h1></div>
      </header>
      <section class="onboarding-panel">
        <form id="publicOnboardingForm" class="onboarding-form">
          <div class="onboarding-field"><label for="intakeFullName">Nombre completo</label><input id="intakeFullName" name="fullName" autocomplete="name" required></div>
          <div class="onboarding-field"><label for="intakePhone">Teléfono de contacto</label><input id="intakePhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required></div>
          <div class="onboarding-field"><label for="intakeAge">Edad <span class="muted">(opcional)</span></label><input id="intakeAge" name="age" type="number" min="1" max="120" inputmode="numeric"></div>
          <div class="onboarding-field"><label for="intakeObjective">Objetivo</label><select id="intakeObjective" name="objective" required><option value="">Selecciona</option><option>Fuerza</option><option>Hipertrofia</option><option>Pérdida de grasa</option><option>Acondicionamiento</option><option>Otro</option></select></div>
          <div class="onboarding-field"><label for="intakeExperience">Experiencia previa</label><select id="intakeExperience" name="experience" required><option value="">Selecciona</option><option>Principiante</option><option>Intermedio</option><option>Avanzado</option></select></div>
          <div class="onboarding-field"><label for="intakeInjuries">Lesiones o molestias</label><textarea id="intakeInjuries" name="injuries" rows="3" placeholder="Indica zona, lado y situación actual"></textarea></div>
          <div class="onboarding-field"><label for="intakeAvoidExercises">Ejercicios que debe evitar</label><textarea id="intakeAvoidExercises" name="avoidExercises" rows="2"></textarea></div>
          <div class="onboarding-field"><label for="intakeComment">Comentario adicional</label><textarea id="intakeComment" name="comment" rows="3"></textarea></div>
          <button class="primary onboarding-submit" type="submit">Preparar ingreso por WhatsApp</button>
        </form>
        <div id="onboardingResult" class="onboarding-result hidden" aria-live="polite">
          <a id="onboardingWhatsAppLink" class="primary onboarding-submit" target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>
          <label for="onboardingSummaryOutput">Resumen del ingreso</label>
          <textarea id="onboardingSummaryOutput" rows="10" readonly></textarea>
          <button id="copyOnboardingSummaryBtn" class="secondary" type="button">Copiar resumen</button>
          <div id="onboardingCopyMessage" class="notice" role="status"></div>
        </div>
        <p class="onboarding-privacy">Tus respuestas se enviarán directamente al entrenador por WhatsApp.</p>
      </section>
    </div>`;

  const form = document.getElementById('publicOnboardingForm');
  const result = document.getElementById('onboardingResult');
  const summaryOutput = document.getElementById('onboardingSummaryOutput');
  const whatsappLink = document.getElementById('onboardingWhatsAppLink');
  const copyMessage = document.getElementById('onboardingCopyMessage');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!coachNumber) {
      copyMessage.textContent = 'El enlace de registro no tiene configurado el WhatsApp del entrenador. Solicita un QR actualizado.';
      result.classList.remove('hidden');
      whatsappLink.removeAttribute('href');
      whatsappLink.setAttribute('aria-disabled', 'true');
      return;
    }
    const values = Object.fromEntries(new FormData(form).entries());
    const summary = buildMessage(values);
    summaryOutput.value = summary;
    whatsappLink.href = `https://wa.me/${coachNumber}?text=${encodeURIComponent(summary)}`;
    whatsappLink.removeAttribute('aria-disabled');
    result.classList.remove('hidden');
    copyMessage.textContent = '';
  });

  document.getElementById('copyOnboardingSummaryBtn').addEventListener('click', async () => {
    const summary = summaryOutput.value;
    try {
      await navigator.clipboard.writeText(summary);
      copyMessage.textContent = 'Resumen copiado.';
    } catch (_) {
      summaryOutput.focus();
      summaryOutput.select();
      const copied = document.execCommand('copy');
      copyMessage.textContent = copied ? 'Resumen copiado.' : 'Selecciona el texto para copiarlo.';
    }
  });
})();
