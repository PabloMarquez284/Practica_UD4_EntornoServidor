CREATE SCHEMA IF NOT EXISTS practica_prestamos;

CREATE TABLE IF NOT EXISTS practica_prestamos.equipos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo text NOT NULL UNIQUE CHECK (char_length(codigo) BETWEEN 1 AND 20),
    nombre text NOT NULL CHECK (char_length(trim(nombre)) > 0),
    categoria text NOT NULL CHECK (char_length(trim(categoria)) > 0),
    disponible boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS practica_prestamos.usuarios (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL CHECK (char_length(trim(nombre)) > 0)
);

CREATE TABLE IF NOT EXISTS practica_prestamos.prestamos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipo_id integer NOT NULL REFERENCES practica_prestamos.equipos(id),
    usuario_id integer NOT NULL REFERENCES practica_prestamos.usuarios(id),
    fecha_prestamo timestamptz NOT NULL DEFAULT now(),
    fecha_devolucion timestamptz,
    CHECK (fecha_devolucion IS NULL OR fecha_devolucion >= fecha_prestamo)
);

CREATE UNIQUE INDEX IF NOT EXISTS un_prestamo_activo
    ON practica_prestamos.prestamos(equipo_id)
    WHERE fecha_devolucion IS NULL;

TRUNCATE practica_prestamos.prestamos,
         practica_prestamos.equipos,
         practica_prestamos.usuarios
RESTART IDENTITY;

INSERT INTO practica_prestamos.usuarios (nombre) VALUES
    ('Ana García'),
    ('Luis Martínez'),
    ('Marta López');

INSERT INTO practica_prestamos.equipos (codigo, nombre, categoria) VALUES
    ('PORT-01', 'Portátil Dell Latitude 5440', 'Portátiles'),
    ('PORT-02', 'Portátil Lenovo ThinkPad L14', 'Portátiles'),
    ('PORT-03', 'Portátil HP ProBook 450', 'Portátiles'),
    ('TAB-01', 'Tableta Samsung Galaxy Tab S9', 'Tabletas'),
    ('TAB-02', 'Tableta Apple iPad Air', 'Tabletas'),
    ('TAB-03', 'Tableta Lenovo Tab P11', 'Tabletas'),
    ('PROY-01', 'Proyector Epson EB-FH06', 'Proyectores'),
    ('PROY-02', 'Proyector BenQ MH560', 'Proyectores'),
    ('CAM-01', 'Cámara Web Logitech Brio 4K', 'Periféricos'),
    ('AUD-01', 'Micrófono USB Blue Yeti', 'Audio');