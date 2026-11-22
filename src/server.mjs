// Importaciones
import express from 'express';
import { pool } from './db.mjs';
import { crearRepoEquipos } from './equipos.repo.mjs';
import { crearServicioPrestamos } from './prestamos.service.mjs';
import { fileURLToPath } from 'node:url';

// Configuraciones iniciales
const app = express();
const equipos = crearRepoEquipos(pool);
const prestamos = crearServicioPrestamos(pool); // Instanciamos el servicio con el pool

// Configuración de plantillas EJS
app.set('view engine', 'ejs');
app.set('views', fileURLToPath(new URL('../views/', import.meta.url)));

app.use(express.json({ limit: '10kb' }));

function esIdValido(valor) {
    return Number.isInteger(valor) && valor > 0 && valor <= 2147483647;
}

function datosEquipoValidos(body) {
    if (!body || typeof body !== 'object') return false;
    const { codigo, nombre, categoria } = body;
    return (
        typeof codigo === 'string' &&
        typeof nombre === 'string' &&
        typeof categoria === 'string' &&
        codigo.trim().length >= 1 &&
        codigo.trim().length <= 20 &&
        nombre.trim().length >= 1 &&
        categoria.trim().length >= 1
    );
}

// Helper para formatear fechas timestamptz de PostgreSQL antes de pasarlas a EJS
function formatearFecha(fecha) {
    if (!fecha) return 'En curso (activo)';
    return new Date(fecha).toLocaleString('es-ES', {
        dateStyle: 'short',
        timeStyle: 'short'
    });
}

// Valida :id en todas las rutas que lo usen (GET /equipos/:id, PUT/DELETE /api/equipos/:id, etc.)
app.param('id', (req, res, next, texto) => {
    const id = Number(texto);
    if (!/^[1-9]\d*$/.test(texto) || !esIdValido(id)) {
        return res.status(400).json({ error: 'Identificador no válido' });
    }
    req.idParam = id;
    next();
});

// VISTAS HTML CON EJS
app.get('/equipos', async (req, res) => {
    const q = req.query.q ?? '';
    const categoria = req.query.categoria ?? '';
    const disponible = req.query.disponible ?? '';
    const orden = req.query.orden ?? 'codigo';
    const textoPagina = req.query.pagina ?? '1';

    // Validamos que todos sean strings (evita ataques pasando arrays tipo ?q=a&q=b) y valores permitidos
    if (
        typeof q !== 'string' || q.length > 80 ||
        typeof categoria !== 'string' || categoria.length > 50 ||
        typeof disponible !== 'string' || !['', 'true', 'false'].includes(disponible) ||
        typeof orden !== 'string' || !['codigo', 'nombre'].includes(orden) ||
        typeof textoPagina !== 'string' || !/^[1-9]\d{0,3}$/.test(textoPagina)
    ) {
        return res.status(400).send('Parámetros de búsqueda no válidos');
    }

    const pagina = Number(textoPagina);
    const filtros = { q: q.trim(), categoria, disponible, orden };

    const [{ equipos: lista, haySiguiente }, categorias] = await Promise.all([
        equipos.listar({ ...filtros, pagina }),
        equipos.listarCategorias()
    ]);

    // Construye enlaces de paginación manteniendo intactos los filtros activos
    const enlace = (numPagina) =>
        '/equipos?' + new URLSearchParams({ ...filtros, pagina: String(numPagina) });

    res.render('equipos', {
        equipos: lista,
        categorias,
        filtros,
        pagina,
        anterior: pagina > 1 ? enlace(pagina - 1) : null,
        siguiente: haySiguiente ? enlace(pagina + 1) : null
    });
});

app.get('/equipos/:id', async (req, res) => {
    // req.idParam ya viene validado por app.param (si era inválido devolvió 400)
    const detalle = await equipos.buscarDetalle(req.idParam);
    if (!detalle) {
        return res.status(404).send('Equipo no encontrado'); // 404 si el ID no existe
    }

    // Preparamos el modelo de vista con las fechas ya legibles
    const equipoVista = {
        ...detalle,
        fecha_prestamo_actual_texto: formatearFecha(detalle.fecha_prestamo_actual),
        historial: detalle.historial.map((p) => ({
            ...p,
            fecha_prestamo_texto: formatearFecha(p.fecha_prestamo),
            fecha_devolucion_texto: formatearFecha(p.fecha_devolucion)
        }))
    };

    res.render('equipo', { equipo: equipoVista });
});

// RUTAS DE INVENTARIO
app.post('/api/equipos', async (req, res) => {
    if (!datosEquipoValidos(req.body)) {
        return res.status(400).json({ error: 'Datos del equipo no válidos' });
    }
    const nuevo = await equipos.crear({
        codigo: req.body.codigo.trim(),
        nombre: req.body.nombre.trim(),
        categoria: req.body.categoria.trim()
    });
    res.status(201).location(`/api/equipos/${nuevo.id}`).json(nuevo);
});

app.put('/api/equipos/:id', async (req, res) => {
    if (!datosEquipoValidos(req.body)) {
        return res.status(400).json({ error: 'Datos del equipo no válidos' });
    }
    const actualizado = await equipos.actualizar(req.idParam, { // <-- Actualizado a req.idParam
        codigo: req.body.codigo.trim(),
        nombre: req.body.nombre.trim(),
        categoria: req.body.categoria.trim()
    });
    if (!actualizado) {
        return res.status(404).json({ error: 'Equipo no encontrado' });
    }
    res.json(actualizado);
});

app.delete('/api/equipos/:id', async (req, res) => {
    const eliminado = await equipos.eliminar(req.idParam); // <-- Actualizado a req.idParam
    if (!eliminado) {
        return res.status(404).json({ error: 'Equipo no encontrado' });
    }
    res.status(204).end();
});

// RUTAS DE PRÉSTAMOS Y DEVOLUCIONES
app.post('/api/prestamos', async (req, res) => {
    const { equipoId, usuarioId } = req.body ?? {};
    // Comprobamos que ambos IDs del cuerpo JSON sean enteros positivos antes de abrir transacción
    if (!esIdValido(equipoId) || !esIdValido(usuarioId)) {
        return res.status(400).json({ error: 'equipoId y usuarioId deben ser enteros positivos' });
    }

    const creado = await prestamos.prestar(equipoId, usuarioId);
    res.status(201).json(creado); // 201 con los datos del préstamo recién creado
});

app.post('/api/prestamos/:id/devolucion', async (req, res) => {
    // El :id ya viene validado por app.param en req.idParam
    const devuelto = await prestamos.devolver(req.idParam);
    res.json(devuelto); // 200 con los datos del préstamo cerrado
});

// MIDDLEWARE GLOBAL DE ERRORES
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON no válido' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Cuerpo demasiado grande' });
    }
    // Errores de negocio lanzados desde prestamos.service.mjs
    if (err.codigo === 'NO_DISPONIBLE') {
        return res.status(409).json({ error: 'El equipo no está disponible o no existe' });
    }
    if (err.codigo === 'NO_ACTIVO') {
        return res.status(409).json({ error: 'El préstamo no existe o ya fue devuelto' });
    }
    if (err.code === '23505') {
        return res.status(409).json({ error: 'Conflicto de unicidad (código duplicado o préstamo ya activo)' });
    }
    // Infracción de clave foránea
    if (err.code === '23503') {
        // Si intentan borrar un equipo con historial de préstamos, el enunciado pide 409
        if (req.method === 'DELETE') {
            return res.status(409).json({ error: 'No se puede eliminar un equipo con préstamos registrados' });
        }
        // Si intentan crear un préstamo con un usuarioId que no existe, es un dato inválido del cliente (400)
        return res.status(400).json({ error: 'El usuario indicado no existe' });
    }
    if (['23502', '23514'].includes(err.code)) {
        return res.status(400).json({ error: 'Datos no admitidos por las restricciones' });
    }
    console.error('Error en la aplicación:', err.code ?? err.message);
    res.status(500).json({ error: 'No se pudo completar la operación' });
});

try {
    const r = await pool.query('SELECT 1 AS comprobacion');
    console.log('Conexión comprobada:', r.rows[0].comprobacion);
    const servidor = app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => {
        console.log(`HTTP preparado en http://127.0.0.1:${process.env.PORT ?? 3000}`);
    });
    const cerrar = () => servidor.close(async () => { await pool.end(); });
    process.once('SIGINT', cerrar);
    process.once('SIGTERM', cerrar);
} catch {
    console.error('No se pudo conectar con PostgreSQL');
    await pool.end();
    process.exitCode = 1;
}