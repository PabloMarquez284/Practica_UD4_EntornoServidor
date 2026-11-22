# Practica_UD4_EntornoServidor
## Sistema de Gestión de Préstamos de Material Informático
**Contexto**: un centro educativo necesita gestionar los equipos que presta temporalmente a su alumnado y personal: portátiles, tabletas, proyectores y otros dispositivos. Desarrollarás una aplicación web que mantenga el inventario y permita realizar préstamos y devoluciones sin perder la coherencia de los datos.

Esta aplicación web está desarrollada en **Node.js (Express 5)** con vistas renderizadas en servidor mediante **EJS** y persistencia relacional en **PostgreSQL 18** sobre **Docker**. Permite consultar el inventario de equipos con filtros y paginación, gestionar altas, modificaciones y bajas mediante una API REST, y registrar préstamos y devoluciones de forma atómica mediante transacciones SQL.

Este trabajo lo he realizado junto con el apoyo de la IA, guiándome paso a paso y ayudándome en los errores que he tenido. Dejo por aquí el enlace al chat con Gemini: https://gemini.google.com/share/d/1zsWl85ywpC0J5yGIy2PrNGgCdz5xLB9L?usp=sharing

## Estructura del proyecto

**Archivos de infraestructura y configuración (raíz del proyecto):** En la raíz se alojan `compose.yaml`, `init.sql`, `.env.example` y `package.json`. El archivo `compose.yaml` levanta el contenedor de PostgreSQL 18, mientras que `init.sql` define el esquema `practica_prestamos`, las tablas (`equipos`, `usuarios` y `prestamos`), sus restricciones de integridad, el índice único parcial para préstamos activos y los datos iniciales de prueba. Por su parte, `package.json` declara las dependencias (`express`, `pg` y `ejs`) y `.env.example` documenta las variables de entorno necesarias.

**Conexión y acceso a datos (`src/db.mjs` y `src/equipos.repo.mjs`):** El módulo `src/db.mjs` valida al arrancar las variables de entorno obligatorias y configura un pool de conexiones (`pg.Pool`) con control de tiempos de espera y errores en conexiones inactivas. En `src/equipos.repo.mjs` se agrupan las consultas SQL parametrizadas sobre el inventario: operaciones de escritura (`crear`, `actualizar` y `eliminar` con `RETURNING`) y consultas de lectura con filtros dinámicos (`ILIKE`, categoría y disponibilidad), ordenación segura por lista blanca, paginación de 5 en 5 y uniones (`LEFT JOIN` e `INNER JOIN`) para obtener el estado actual e historial de cada equipo.

**Lógica transaccional de préstamos (`src/prestamos.service.mjs`):** Este servicio aísla las operaciones de préstamo y devolución respecto a Express. Implementa un bloque transaccional (`BEGIN`, `COMMIT` y `ROLLBACK`) sobre una conexión dedicada (`pool.connect()`) para garantizar la atomicidad: al prestar marca el equipo como no disponible condicionalmente antes de insertar el préstamo, y al devolver cierra el préstamo activo con `now()` antes de liberar el equipo, revirtiendo todos los cambios si ocurre cualquier fallo.

**Servidor web, validación y rutas (`src/server.mjs`):** Configura la aplicación Express 5, el motor de plantillas EJS, los archivos estáticos y el análisis de peticiones JSON. Expone las vistas HTML (`GET /equipos` y `GET /equipos/:id`) y los endpoints REST (`/api/equipos` y `/api/prestamos`), validando todos los parámetros de ruta (`app.param`), parámetros de consulta y cuerpos JSON antes de acceder a la base de datos. Incluye además un middleware global que traduce errores de validación, reglas de negocio y códigos nativos de PostgreSQL (`23505`, `23503`, `23502`, `23514`) a códigos HTTP adecuados.

**Vistas HTML y estilos (`views/` y `public/css/`):** La carpeta `views/` contiene las dos plantillas EJS renderizadas en servidor: `equipos.ejs`, que muestra el formulario de búsqueda, filtros, ordenación, la tabla paginada del inventario y los enlaces de navegación; y `equipo.ejs`, que presenta la ficha detallada del equipo, el usuario que lo tiene prestado actualmente (si aplica) y su historial completo de préstamos. Finalmente, `public/css/estilos.css` aporta el diseño visual para formularios, tablas, etiquetas de estado y navegación.

## Guía de instalación y ejecución
### 1. Requisitos previos
* **Node.js** (versión 22 o superior, con soporte nativo para `--env-file`).
* **Docker** y **Docker Compose** instalados y en ejecución.

### 2. Instalación de dependencias
Clona el repositorio, accede a la carpeta raíz del proyecto e instala las dependencias:

```bash
npm install
```

### 3. Configuración de variables de entorno
Crea un archivo `.env` en la raíz del proyecto a partir de `.env.example` con los siguientes valores:

```env
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=dwes
PGUSER=dwes_app
PGPASSWORD=dwes_pass
PORT=3000
```

### 4. Arranque de PostgreSQL e inicialización de la base de datos
Levanta el contenedor de PostgreSQL en segundo plano:

```bash
docker compose up -d
```

Ejecuta `init.sql` dentro del contenedor para crear el esquema, las tablas, los índices y cargar los datos iniciales:

```bash
docker compose exec -T db psql -h 127.0.0.1 -U dwes_app -d dwes < init.sql
```

### 5. Ejecución del servidor y acceso a la aplicación
Inicia el servidor cargando las variables de entorno:

```bash
node --env-file=.env src/server.mjs
```

Una vez confirmada la conexión en consola (`HTTP preparado en http://127.0.0.1:3000`), accede desde el navegador a:
* **Listado de inventario:** `http://127.0.0.1:3000/equipos`
* **Detalle de un equipo:** `http://127.0.0.1:3000/equipos/1`

## Pruebas cURL realizadas y respuestas esperadas
Con el servidor activo, se han ejecutado los siguientes comandos `curl` para verificar cada endpoint de la API REST, las transacciones y las restricciones de integridad en PostgreSQL:

| Caso probado | Comando `curl` | Respuesta esperada y verificada |
| :--- | :--- | :--- |
| **Alta válida de equipo** | `curl -i -X POST http://127.0.0.1:3000/api/equipos -H "Content-Type: application/json" -d '{"codigo":"TEST-01","nombre":"Monitor Dell","categoria":"Monitores"}'` | **`201 Created`** con cabecera `Location: /api/equipos/11` y JSON del equipo creado (`"disponible": true`). |
| **Alta con código duplicado** | `curl -i -X POST http://127.0.0.1:3000/api/equipos -H "Content-Type: application/json" -d '{"codigo":"TEST-01","nombre":"Repetido","categoria":"Monitores"}'` | **`409 Conflict`** con `{"error":"Conflicto de unicidad (código duplicado o préstamo ya activo)"}`. |
| **Alta con datos inválidos** | `curl -i -X POST http://127.0.0.1:3000/api/equipos -H "Content-Type: application/json" -d '{"codigo":"","nombre":"Sin código","categoria":"Monitores"}'` | **`400 Bad Request`** con `{"error":"Datos del equipo no válidos"}`. |
| **Modificación de equipo existente** | `curl -i -X PUT http://127.0.0.1:3000/api/equipos/11 -H "Content-Type: application/json" -d '{"codigo":"TEST-01","nombre":"Monitor Dell 27","categoria":"Monitores"}'` | **`200 OK`** con los datos actualizados manteniendo intacto `"disponible"`. |
| **Modificación de equipo inexistente** | `curl -i -X PUT http://127.0.0.1:3000/api/equipos/9999 -H "Content-Type: application/json" -d '{"codigo":"X-99","nombre":"No existe","categoria":"Otros"}'` | **`404 Not Found`** con `{"error":"Equipo no encontrado"}`. |
| **Préstamo con usuario inexistente (`ROLLBACK`)** | `curl -i -X POST http://127.0.0.1:3000/api/prestamos -H "Content-Type: application/json" -d '{"equipoId":11,"usuarioId":9999}'` | **`400 Bad Request`** (`{"error":"El usuario indicado no existe"}`) y reversión (`ROLLBACK`) de la disponibilidad del equipo. |
| **Préstamo válido sobre equipo disponible** | `curl -i -X POST http://127.0.0.1:3000/api/prestamos -H "Content-Type: application/json" -d '{"equipoId":11,"usuarioId":1}'` | **`201 Created`** con el préstamo registrado (`id: 2`, `fecha_devolucion: null`) y equipo marcado como no disponible. |
| **Préstamo sobre equipo ya prestado** | `curl -i -X POST http://127.0.0.1:3000/api/prestamos -H "Content-Type: application/json" -d '{"equipoId":11,"usuarioId":2}'` | **`409 Conflict`** con `{"error":"El equipo no está disponible o no existe"}`. |
| **Borrado de equipo con historial** | `curl -i -X DELETE http://127.0.0.1:3000/api/equipos/11` | **`409 Conflict`** (`{"error":"No se puede eliminar un equipo con préstamos registrados"}`) por clave foránea (`23503`). |
| **Devolución de préstamo activo** | `curl -i -X POST http://127.0.0.1:3000/api/prestamos/2/devolucion` | **`200 OK`** con el préstamo cerrado (`fecha_devolucion` asignada) y equipo liberado (`disponible: true`). |
| **Devolución de préstamo ya cerrado** | `curl -i -X POST http://127.0.0.1:3000/api/prestamos/2/devolucion` | **`409 Conflict`** con `{"error":"El préstamo no existe o ya fue devuelto"}`. |
| **Borrado limpio de equipo sin préstamos** | `curl -i -X DELETE http://127.0.0.1:3000/api/equipos/13` | **`204 No Content`** sin cuerpo (y **`404 Not Found`** al repetir la petición sobre el mismo ID). |
| **Identificador no válido en URL** | `curl -i -X DELETE http://127.0.0.1:3000/api/equipos/12~` | **`400 Bad Request`** con `{"error":"Identificador no válido"}`. |
