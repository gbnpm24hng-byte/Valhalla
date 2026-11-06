# Formato de archivo para "Importar programa"

En **Entrenamientos → Planificación**, el recuadro **Importar programa desde archivo** recibe un
archivo `.json` con un programa. Antes de guardar, la app muestra una vista previa: el nombre, los días,
los ejercicios y cuáles no están en la galería. Al confirmar, **solo agrega un programa nuevo**, con
ids nuevos y sin alumnos asignados. No cambia los programas, las asignaciones, la galería, los clientes
ni los cambios por alumno que ya existen. Si el archivo tiene un error, muestra cuál es y no guarda nada.

Para asignarlo, usa **"Usar como base"** en *Programaciones guardadas* y sigue los pasos del armador.

## Estructura

Los nombres de los campos son los mismos que usa el armador. Un campo con un nombre distinto
(por ejemplo `repmin`) se rechaza con un error, así no se pierde en silencio.

### Programa

| Campo | Obligatorio | Valor |
|---|---|---|
| `format` | sí | Siempre `"valhalla-programa"`. |
| `formatVersion` | no | `1` (es la única versión que existe). |
| `name` | sí | Nombre del programa (hasta 120 caracteres). |
| `objective` | no | Texto, por ejemplo `"Fuerza"`. |
| `durationWeeks` | sí | Duración en semanas: un entero de 1 a 52. |
| `weeklyFrequency` | no | Sesiones por semana: de 1 a 7, sin pasar la cantidad de días. Si falta, se usa la cantidad de días. |
| `days` | sí | Lista de 1 a 7 días. |

### Día

| Campo | Obligatorio | Valor |
|---|---|---|
| `name` | sí | Nombre libre (hasta 80 caracteres). Para que **Modo Grupo** elija el día solo, empiézalo con el día de la semana: `"Lunes — A"`, `"Miércoles — B"`, `"Vie - C"`. |
| `exercises` | sí | Lista de 1 a 30 ejercicios. Puede ser `[]` si el día tiene al menos un circuito en `blocks`. |
| `blocks` | no | (v0.9.44) Superseries del día: lista de `{ "id", "type": "superset", "rounds", "restSeconds"? }`. `id` es un nombre corto (por ejemplo `"A"`) que usan los ejercicios en `block`; `rounds` son las vueltas (1 a 10) y `restSeconds` el descanso al final de cada vuelta (0 a 900; si falta, 90). (v0.9.45) También circuitos: `{ "type": "circuit", … }`, ver abajo. |

### Circuito (v0.9.45)

Va en `blocks` del día. Sus ejercicios son **estaciones** y van dentro del circuito (en `stations`), no en
`exercises`. Un circuito no tiene series, regla de carga ni récords: en Modo Grupo se anota un resultado por alumno.

| Campo | Obligatorio | Valor |
|---|---|---|
| `id` | sí | Nombre corto, distinto de los demás bloques del día (por ejemplo `"C1"`). Un ejercicio no puede usarlo en `block`. |
| `type` | sí | `"circuit"`. |
| `format` | sí | `"rounds"` (Vueltas), `"emom"`, `"amrap"`, `"tabata"` o `"fortime"` (Por tiempo). |
| `name` | no | Nombre del circuito (hasta 120 caracteres), por ejemplo `"Final"`. |
| `at` | no | Cuántos ejercicios del día van **antes** del circuito: `0` = al principio. Si falta, va al final. No puede quedar en medio de una superserie. |
| `stations` | sí | Lista de 1 a 12 estaciones: `{ "exerciseName", "quantity"?, "unit"? }`. `exerciseName` se enlaza con la galería igual que un ejercicio (si no está, queda como texto libre, por ejemplo `"200 m remo"`). `quantity` de 1 a 10000; `unit`: `"reps"`, `"seconds"` o `"meters"` (solo con `quantity`). |

Datos de cada formato (solo los de su formato; uno de otro formato se rechaza). Si falta, se usa el valor entre paréntesis:

| `format` | Campos |
|---|---|
| `"rounds"` | `rounds` vueltas, 1 a 50 (3) · `restSeconds` descanso entre vueltas, 0 a 900 (60) |
| `"emom"` | `minutes` 1 a 90 (10) |
| `"amrap"` | `minutes` 1 a 90 (12) |
| `"tabata"` | `rounds` 1 a 50 (8) · `workSeconds` 5 a 120 (20) · `pauseSeconds` 0 a 120 (10) |
| `"fortime"` | `rounds` 1 a 50 (3) · `capMinutes` tope opcional, 1 a 180 (sin tope) |

### Ejercicio

| Campo | Obligatorio | Valor |
|---|---|---|
| `exerciseName` | sí | Nombre del ejercicio. Se enlaza con la galería si hay uno con el **mismo nombre**, sin importar tildes ni mayúsculas. Si no hay, queda sin enlace (no se crea en la galería). |
| `sets` | sí | Series: un entero de 1 a 20. |
| `repMin`, `repMax` | no | Rango de repeticiones (de 1 a 100). Si solo viene `repMin`, el rango es ese único número. **Si las dos faltan o son `null`, el ejercicio queda sin repeticiones** (series por tiempo: escribe el tiempo en `notes`, por ejemplo `"40 s"`). |
| `targetWeight` | no | Peso objetivo en kg (de 0 a 1000) o `null`. Si falta, se usa 0. |
| `restSeconds` | no | Descanso en segundos (de 0 a 900). Si falta, se usa 90. Se puede poner 0 (por ejemplo, en el primer ejercicio de una biserie). |
| `notes` | no | Nota técnica (hasta 500 caracteres). Se publica al alumno junto con el programa. |
| `zone` | no | Zona, por ejemplo `"Salón A"`. |
| `approximations` | no | Series de aproximación: lista de `{ "label"?, "weight", "reps" }`. |
| `effectiveSets` | no | Series efectivas detalladas: lista de `{ "label"?, "weight", "reps", "rir" }` (`rir` de 0 a 10 o `null`). |
| `measure` | no | (v0.9.44) `"time"` para un ejercicio por tiempo (plancha, rueda abdominal…): se anotan segundos, sin kilos ni repeticiones. Sin el campo (o `"reps"`), es por repeticiones como siempre. Con `"time"` no van `repMin` ni `repMax`. |
| `durationSeconds` | con `"time"` | Segundos por serie (1 a 1000), por ejemplo `40` para "3 × 40 s". |
| `block` | no | (v0.9.44) `id` de una superserie de `blocks` del día. De 2 a 4 ejercicios **seguidos** por bloque (quedan A1, A2…). Sus series son las vueltas del bloque, así que `sets` puede faltar. |

`weight` acepta un número o `null`. `reps` acepta un entero o `null`. Si falta `label`, se numera
como A1, A2… o S1, S2…

## Lo que el formato no tiene (y cómo escribirlo)

- **Biseries:** desde v0.9.44 usa una superserie (`blocks` en el día y `block` en cada ejercicio).
  Los archivos anteriores, con los ejercicios seguidos y la nota en `notes`, se siguen importando igual.
- **Circuitos (EMOM, AMRAP…):** desde v0.9.45, con `{ "type": "circuit" }` en `blocks` (ver arriba).
  Los archivos anteriores, sin circuitos, se siguen importando igual.
- **Repeticiones distintas por semana o bloque, y semana de descarga:** escríbelas en `notes`, por
  ejemplo `"S1-3: 3×10 · S4-6: 4×8 · S7-8: 5×6 · S9 descarga: 2×8 liviano"`.

## Ejemplo (inventado)

```json
{
  "format": "valhalla-programa",
  "formatVersion": 1,
  "name": "Ciclo de ejemplo 9 semanas",
  "objective": "Fuerza",
  "durationWeeks": 9,
  "weeklyFrequency": 3,
  "days": [
    {
      "name": "Lunes — A",
      "exercises": [
        {
          "exerciseName": "Sentadilla",
          "sets": 4,
          "repMin": 6,
          "repMax": 8,
          "targetWeight": 60,
          "restSeconds": 120,
          "notes": "S1-3: 4×8 · S4-6: 4×6 · S7-8: 5×5 · S9 descarga: 2×8 liviano",
          "approximations": [
            { "weight": 30, "reps": 8 },
            { "weight": 45, "reps": 5 }
          ]
        },
        {
          "exerciseName": "Plancha",
          "sets": 3,
          "repMin": null,
          "repMax": null,
          "targetWeight": 0,
          "restSeconds": 60,
          "notes": "40 s"
        }
      ]
    },
    {
      "name": "Miércoles — B",
      "exercises": [
        {
          "exerciseName": "Press de banca",
          "sets": 3,
          "repMin": 8,
          "repMax": 10,
          "targetWeight": 40,
          "restSeconds": 0,
          "notes": "Biserie 1A con remo"
        },
        {
          "exerciseName": "Remo con barra",
          "sets": 3,
          "repMin": 10,
          "targetWeight": 35,
          "restSeconds": 90,
          "notes": "Biserie 1B",
          "effectiveSets": [
            { "weight": 35, "reps": 10, "rir": 2 },
            { "weight": 35, "reps": 10, "rir": 2 },
            { "weight": 35, "reps": 10, "rir": 1 }
          ]
        }
      ]
    },
    {
      "name": "Viernes — C",
      "exercises": [
        {
          "exerciseName": "Subida a cajón",
          "sets": 3,
          "repMin": 8,
          "repMax": 8,
          "targetWeight": null,
          "notes": "8 por pierna"
        }
      ],
      "blocks": [
        {
          "id": "C1",
          "type": "circuit",
          "format": "amrap",
          "name": "Final",
          "minutes": 12,
          "stations": [
            { "exerciseName": "Burpees", "quantity": 10, "unit": "reps" },
            { "exerciseName": "Remo en máquina", "quantity": 200, "unit": "meters" }
          ]
        }
      ]
    }
  ]
}
```

En el día C, el circuito no tiene `at`, así que queda al final, después de la Subida a cajón.
