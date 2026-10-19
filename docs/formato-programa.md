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
| `exercises` | sí | Lista de 1 a 30 ejercicios. |

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

`weight` acepta un número o `null`. `reps` acepta un entero o `null`. Si falta `label`, se numera
como A1, A2… o S1, S2…

## Lo que el formato no tiene (y cómo escribirlo)

- **Biseries:** pon los dos ejercicios seguidos y anótalo en `notes` (`"Biserie 1A con…"`). Si
  quieres, pon `restSeconds: 0` en el primero.
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
      ]
    }
  ]
}
```
