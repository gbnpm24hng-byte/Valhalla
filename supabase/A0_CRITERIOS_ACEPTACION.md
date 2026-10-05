# Criterios de aceptación pendientes (fases A1 / B1)

Surgen de la revisión de la fase A0 (`a0_migracion_roles_sync.sql`). Una fase no se da por terminada si alguno de sus criterios no se cumple.

## Publicación al alumno sin datos de pago

Aplica a todo lo que se escribe en `student_programs.data` y `student_progress.data` (botón "Publicar al alumno" y publicación de progreso).

1. **Lista de campos permitidos.** El JSON publicado se arma copiando campo por campo solo los permitidos. Nunca se copia el objeto completo, nunca se usa spread (`{...assignment}`) y nunca se hace "copiar todo y borrar lo prohibido". Si mañana se agrega un campo nuevo al cliente o a la asignación, no se publica hasta que alguien lo añada a la lista a propósito.
2. **Prueba automática (node --test).** Con un cliente y una asignación de ejemplo que sí tengan `monthly_value`, `amount`, `payment_status`, `renewal_date`, `renewal_day` y pagos, la función que arma lo publicado devuelve un JSON sin ninguna de esas claves a ningún nivel. La prueba recorre el objeto completo (en profundidad), no solo el primer nivel.
3. **Comprobación en la base.** Tras publicar con datos falsos, esta consulta en el SQL Editor devuelve 0 filas:

   ```sql
   select 'student_programs' as tabla, id from public.student_programs
   where jsonb_path_exists(data, 'lax $.** ? (exists(@.monthly_value) || exists(@.amount) || exists(@.payment_status) || exists(@.payments) || exists(@.renewal_date) || exists(@.renewal_day) || exists(@.movements) || exists(@.accounts))')
   union all
   select 'student_progress', id from public.student_progress
   where jsonb_path_exists(data, 'lax $.** ? (exists(@.monthly_value) || exists(@.amount) || exists(@.payment_status) || exists(@.payments) || exists(@.renewal_date) || exists(@.renewal_day) || exists(@.movements) || exists(@.accounts))');
   ```

   Las restricciones `student_programs_no_finance` y `student_progress_no_finance` ya rechazan esas claves en la base. Son una red de seguridad: los puntos 1 y 2 tienen que cumplirse igual, y si la app choca con esas restricciones, es que hay un error en la app.

## Tipo de serie

4. **Tipo `'T'`.** La app acepta un tipo de serie `'T'` al normalizar (`data.js`, `app.js`, `cloud-data.js`), aunque la interfaz solo crea `'A'` y `'S'`. `student_sets` solo admite `'A'` y `'S'`. Antes de sincronizar series en A1/B1 hay que decidir si `'T'` se elimina de la app o se agrega a la base, y comprobar con datos falsos que ninguna serie `'T'` hace fallar la subida.
