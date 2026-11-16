(function () {
  // v0.9.55: un solo lector de números con decimales (pesos, litros, 1RM…) para toda la app.
  //
  // Por qué: con type="number", Chrome en español (es-CL) toma el punto como separador de miles:
  // escribir "7.5" guardaba 75. Todos los campos de peso y decimales son ahora type="text" con
  // inputmode="decimal" y se leen solo con parse(): "7.5", "7,5" y " 7,5 " valen 7,5.
  //
  // Reglas de parse(texto):
  //   * vacío (o solo espacios) -> null
  //   * dígitos con a lo más UN separador decimal, coma o punto: "7.5", "7,5", "100", ",5", "22." -> número
  //   * cualquier otra cosa ("1.000,5", "7,5,5", "abc", "-3", "1e3") -> NaN
  // Nunca se interpreta un punto como separador de miles: en un peso "1.000" no tiene sentido.
  // Un número (no texto) se devuelve tal cual si es finito.

  function parse(value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : Number.NaN;
    }
    const text = String(value).trim().replace(/\s+/g, '');
    if (!text) {
      return null;
    }
    if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(text)) {
      return Number.NaN;
    }
    return Number(text.replace(',', '.'));
  }

  // Número o el valor de reserva si está vacío o no es válido (para lecturas que antes hacían
  // Number(x || 0)).
  function parseOr(value, fallback = 0) {
    const number = parse(value);
    return number === null || Number.isNaN(number) ? fallback : number;
  }

  // ¿Lo escrito es un número válido (o está vacío)?
  function isValid(value) {
    return !Number.isNaN(parse(value));
  }

  // Para mostrar en un campo: con coma y sin ceros de más (7.5 -> "7,5"; 40 -> "40"; vacío -> "").
  function format(value) {
    const number = parse(value);
    if (number === null || Number.isNaN(number)) {
      return '';
    }
    return String(Math.round(number * 100) / 100).replace('.', ',');
  }

  // Atributos de un campo de decimales (en vez de type="number").
  const INPUT_ATTRS = 'type="text" inputmode="decimal" autocomplete="off"';

  const api = { parse, parseOr, isValid, format, INPUT_ATTRS };

  if (typeof window !== 'undefined') {
    window.VALHALLA = window.VALHALLA || {};
    window.VALHALLA.decimal = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
