// Crea un error propio con propiedad .codigo para distinguirlo de los errores de PostgreSQL (.code)
function fallo(codigo) {
    return Object.assign(new Error(codigo), { codigo });
}

export function crearServicioPrestamos(pool) {
    // Envoltorio reutilizable que garantiza "todo o nada" (BEGIN / COMMIT / ROLLBACK)
    async function transaccion(trabajo) {
        // Pedimos UNA única conexión fija del pool para toda la operación
        const cliente = await pool.connect();
        let descartar = false;

        try {
            await cliente.query('BEGIN'); // Inicia la transacción
            const resultado = await trabajo(cliente); // Ejecuta las consultas usando ese mismo cliente
            await cliente.query('COMMIT'); // Confirma todos los cambios si no hubo fallos
            return resultado;
        } catch (error) {
            try {
                await cliente.query('ROLLBACK'); // Deshace cualquier cambio previo si algo falló
            } catch {
                // Si el propio rollback falla, marcamos la conexión para destruirla y no reutilizarla
                descartar = true;
            }
            // Relanzamos el error para que Express lo convierta en respuesta HTTP
            throw error; 
        } finally {
            // Pase lo que pase, devolvemos el cliente al pool para no bloquear futuras peticiones
            cliente.release(descartar);
        }
    }

    return {
        async prestar(equipoId, usuarioId) {
            return transaccion(async (cliente) => {
                // Actualización condicional: solo bloquea el equipo si estaba libre (evita prestarlo dos veces a la vez)
                const cambio = await cliente.query(
                    `UPDATE practica_prestamos.equipos
                     SET disponible = false
                     WHERE id = $1 AND disponible = true
                     RETURNING id`,
                    [equipoId]
                );

                // Si rowCount es 0, el equipo no existe o ya estaba prestado; abortamos
                if (cambio.rowCount === 0) {
                    throw fallo('NO_DISPONIBLE');
                }

                // Insertamos el préstamo. Si usuarioId no existe, saltará la clave foránea y el ROLLBACK revertirá el paso 1
                const resPrestamo = await cliente.query(
                    `INSERT INTO practica_prestamos.prestamos (equipo_id, usuario_id)
                     VALUES ($1, $2)
                     RETURNING id, equipo_id, usuario_id, fecha_prestamo, fecha_devolucion`,
                    [equipoId, usuarioId]
                );

                return resPrestamo.rows[0];
            });
        },

        async devolver(prestamoId) {
            return transaccion(async (cliente) => {
                // Cerramos el préstamo SOLO si existe y sigue activo (fecha_devolucion IS NULL)
                const resDevolucion = await cliente.query(
                    `UPDATE practica_prestamos.prestamos
                     SET fecha_devolucion = now()
                     WHERE id = $1 AND fecha_devolucion IS NULL
                     RETURNING id, equipo_id, usuario_id, fecha_prestamo, fecha_devolucion`,
                    [prestamoId]
                );

                // Si no se modificó ninguna fila, el préstamo no existe o ya había sido devuelto
                if (resDevolucion.rowCount === 0) {
                    throw fallo('NO_ACTIVO');
                }

                // Liberamos el equipo asociado usando el equipo_id recuperado en el RETURNING anterior
                await cliente.query(
                    `UPDATE practica_prestamos.equipos
                     SET disponible = true
                     WHERE id = $1`,
                    [resDevolucion.rows[0].equipo_id]
                );

                return resDevolucion.rows[0];
            });
        }
    };
}