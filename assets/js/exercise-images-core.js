(function () {
  // v0.9.58: imagen de cómo se hace cada ejercicio (maniquí gris con los músculos en amarillo).
  // Archivos en assets/images/ejercicios/; FILES es la misma tabla que
  // assets/images/ejercicios/imagenes-ejercicios.json (tests/exercise-images-core.test.js revisa que coincidan).
  // Búsqueda como videoUrlFor y la figura: primero el ejercicio de la galería enlazado (libraryExerciseId →
  // su nombre) y si no, el nombre del ejercicio; sin tildes ni mayúsculas. Puro: no guarda ni sube nada.
  const FOLDER = './assets/images/ejercicios/';

  const FILES = {
    'abduccion-maquina.webp': ['Abducción de cadera en máquina', 'Abductores'],
    'aduccion-maquina.webp': ['Aducción de cadera en máquina'],
    'bicicleta.webp': ['Bicicleta'],
    'caminar.webp': ['Caminar'],
    'curl-femoral-sentado.webp': ['Curl femoral', 'Curl femoral sentado'],
    'equilibrio.webp': ['Equilibrio en un pie'],
    'extension-cuadriceps.webp': ['Extensión de cuádriceps'],
    'hip-thrust.webp': ['Hip thrust con barra'],
    'jalon-estrecho.webp': ['Jalón al pecho agarre estrecho'],
    'peso-muerto-rumano.webp': ['Peso muerto rumano'],
    'peso-muerto.webp': ['Peso muerto convencional'],
    'prensa.webp': ['Prensa'],
    'press-banca.webp': ['Press de banca', 'Press pecho plano'],
    'press-inclinado-mancuernas.webp': ['Press inclinado con mancuernas'],
    'press-inclinado-smith.webp': ['Press inclinado Smith', 'Press inclinado en Smith'],
    'press-mancuernas.webp': ['Press plano con mancuernas'],
    'press-militar-sentado.webp': ['Press militar sentado con mancuernas'],
    'puente-gluteo.webp': ['Puente de glúteo'],
    'remo-barra.webp': ['Remo con barra'],
    'remo-invertido.webp': ['Remo invertido'],
    'remo-polea.webp': ['Remo bajo', 'Remo bajo en polea', 'Remo sentado en polea'],
    'sentadilla-barra.webp': ['Sentadilla', 'Sentadilla trasera con barra'],
    'sentadilla-goblet.webp': ['Sentadilla goblet'],
    'sentadilla-libre.webp': ['Sentadilla libre'],
    'sentarse-silla.webp': ['Sentarse y pararse de una silla'],
    'subida-cajon.webp': ['Subida a cajón']
  };

  function fold(value) {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  const BY_NAME = {};
  Object.keys(FILES).forEach((file) => {
    FILES[file].forEach((name) => {
      BY_NAME[fold(name)] = file;
    });
  });

  function fileForName(name) {
    const key = fold(name);
    return key ? BY_NAME[key] || '' : '';
  }

  function result(file, alt) {
    return file ? { file, src: FOLDER + file, alt: String(alt || '').trim() || 'Ejercicio' } : null;
  }

  // exercise: del programa ({ libraryExerciseId, exerciseName }), publicado ({ name }) o de la galería
  // ({ name }). library: la galería del entrenador (puede faltar, como en la vista del alumno).
  // Devuelve { file, src, alt } o null.
  function imageFor(exercise, library) {
    if (!exercise) {
      return null;
    }
    const name = exercise.exerciseName || exercise.name || '';
    // Lo publicado al alumno trae solo el archivo (image), calculado al publicar con la galería.
    if (typeof exercise.image === 'string' && Object.prototype.hasOwnProperty.call(FILES, exercise.image)) {
      return result(exercise.image, name);
    }
    const libraryId = String(exercise.libraryExerciseId || '');
    const linked = libraryId && Array.isArray(library) ? library.find((item) => item && item.id === libraryId) : null;
    if (linked) {
      const file = fileForName(linked.name) || fileForName(linked.normalizedName);
      if (file) {
        return result(file, name || linked.name);
      }
    }
    return result(fileForName(name) || fileForName(exercise.normalizedName), name);
  }

  // HTML de la imagen (escapada); '' si no hay imagen.
  function imgHtml(image, className = '') {
    if (!image) {
      return '';
    }
    const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    return `<img${className ? ` class="${esc(className)}"` : ''} src="${esc(image.src)}" alt="${esc(image.alt)}" loading="lazy" decoding="async">`;
  }

  const api = { FOLDER, FILES, fold, fileForName, imageFor, imgHtml };
  if (typeof window !== 'undefined') {
    window.VALHALLA = window.VALHALLA || {};
    window.VALHALLA.exerciseImages = api;
  }
})();
