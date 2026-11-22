export function crearRepoEquipos(pool) {
    return {
        // MÉTODOS DE LECTURA PARA VISTAS HTML

        async listar({ q, categoria, disponible, orden, pagina }) {
            const condiciones = [];
            const valores = [];

            // 1. Construcción dinámica y segura del WHERE usando parámetros $1, $2...
            if (q) {
                valores.push(`%${q}%`);
                // ILIKE busca sin distinguir mayúsculas/minúsculas
                condiciones.push(`nombre ILIKE $${valores.length}`);
            }
            if (categoria) {
                valores.push(categoria);
                condiciones.push(`categoria = $${valores.length}`);
            }
            if (disponible === 'true' || disponible === 'false') {
                valores.push(disponible === 'true');
                condiciones.push(`disponible = $${valores.length}`);
            }

            const whereSQL = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

            // 2. Lista blanca para ORDER BY: nunca concatenamos texto libre del usuario
            // Añadimos ", id ASC" para desempatar y que no bailen filas al cambiar de página
            const ordenSQL = orden === 'nombre' ? 'nombre ASC, id ASC' : 'codigo ASC, id ASC';

            // 3. Paginación de 5 en 5: pedimos 6 filas (tamano + 1) para saber si hay página siguiente
            const tamano = 5;
            const offset = (pagina - 1) * tamano;
            const idxLimit = valores.length + 1;
            const idxOffset = valores.length + 2;
            valores.push(tamano + 1, offset);

            const resultado = await pool.query(
                `SELECT id, codigo, nombre, categoria, disponible
                 FROM practica_prestamos.equipos
                 ${whereSQL}
                 ORDER BY ${ordenSQL}
                 LIMIT $${idxLimit} OFFSET $${idxOffset}`,
                valores
            );

            return {
                // Recortamos a 5 filas como máximo y avisamos si llegó la 6ª
                equipos: resultado.rows.slice(0, tamano),
                haySiguiente: resultado.rows.length > tamano
            };
        },

        async listarCategorias() {
            // Recupera las categorías existentes para rellenar el desplegable de filtro
            const resultado = await pool.query(
                'SELECT DISTINCT categoria FROM practica_prestamos.equipos ORDER BY categoria ASC'
            );
            return resultado.rows.map((fila) => fila.categoria);
        },

        async buscarDetalle(id) {
            // 1. Datos del equipo + usuario que lo tiene prestado actualmente (si existe)
            // Usamos LEFT JOIN para que si el equipo está libre (sin préstamo activo), no se pierda la fila
            const resEquipo = await pool.query(
                `SELECT e.id, e.codigo, e.nombre, e.categoria, e.disponible,
                        u.nombre AS usuario_actual,
                        p.fecha_prestamo AS fecha_prestamo_actual
                 FROM practica_prestamos.equipos e
                 LEFT JOIN practica_prestamos.prestamos p
                        ON p.equipo_id = e.id AND p.fecha_devolucion IS NULL
                 LEFT JOIN practica_prestamos.usuarios u
                        ON u.id = p.usuario_id
                 WHERE e.id = $1`,
                [id]
            );

            if (resEquipo.rows.length === 0) {
                return null; // El equipo no existe (server.mjs responderá 404)
            }

            // Relación completa de préstamos de este equipo usando INNER JOIN con usuarios
            const resHistorial = await pool.query(
                `SELECT p.id, u.nombre AS usuario, p.fecha_prestamo, p.fecha_devolucion
                 FROM practica_prestamos.prestamos p
                 INNER JOIN practica_prestamos.usuarios u
                         ON u.id = p.usuario_id
                 WHERE p.equipo_id = $1
                 ORDER BY p.fecha_prestamo DESC, p.id DESC`,
                [id]
            );

            return {
                ...resEquipo.rows[0],
                historial: resHistorial.rows
            };
        },

        // MÉTODOS DE ESCRITURA PARA LA API

        async crear({ codigo, nombre, categoria }) {
            const resultado = await pool.query(
                `INSERT INTO practica_prestamos.equipos (codigo, nombre, categoria)
                 VALUES ($1, $2, $3)
                 RETURNING id, codigo, nombre, categoria, disponible`,
                [codigo, nombre, categoria]
            );
            return resultado.rows[0];
        },

        async actualizar(id, { codigo, nombre, categoria }) {
            const resultado = await pool.query(
                `UPDATE practica_prestamos.equipos
                 SET codigo = $1, nombre = $2, categoria = $3
                 WHERE id = $4
                 RETURNING id, codigo, nombre, categoria, disponible`,
                [codigo, nombre, categoria, id]
            );
            return resultado.rows[0] ?? null;
        },

        async eliminar(id) {
            const resultado = await pool.query(
                'DELETE FROM practica_prestamos.equipos WHERE id = $1',
                [id]
            );
            return resultado.rowCount > 0;
        }
    };
}