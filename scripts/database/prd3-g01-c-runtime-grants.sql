\set ON_ERROR_STOP on

\if :{?database_name}
\else
  \echo 'database_name is required'
  \quit 3
\endif

SELECT current_database() = :'database_name' AS database_matches
\gset
\if :database_matches
\else
  \echo 'connected database does not match database_name'
  \quit 3
\endif

DO $policy$
DECLARE
  unexpected_owner text;
BEGIN
  IF to_regnamespace('public') IS NULL THEN
    RAISE EXCEPTION 'expected application schema public is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'moazez_migration'
  ) THEN
    RAISE EXCEPTION 'expected migration role is missing';
  END IF;

  IF NOT pg_catalog.has_schema_privilege(
    'moazez_migration', 'public', 'USAGE'
  ) OR NOT pg_catalog.has_schema_privilege(
    'moazez_migration', 'public', 'CREATE'
  ) THEN
    RAISE EXCEPTION 'migration role lacks required application schema authority';
  END IF;

  IF to_regclass('public._prisma_migrations') IS NULL THEN
    RAISE EXCEPTION 'expected Prisma migration ownership table is missing';
  END IF;

  SELECT format('%I.%I owned by %I', namespace_name, object_name, owner_name)
  INTO unexpected_owner
  FROM (
    SELECT
      namespace.nspname AS namespace_name,
      class.relname AS object_name,
      owner.rolname AS owner_name
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = class.relnamespace
    JOIN pg_catalog.pg_roles AS owner
      ON owner.oid = class.relowner
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p', 'S', 'v', 'm', 'f', 'i')
      AND owner.rolname <> 'moazez_migration'

    UNION ALL

    SELECT
      namespace.nspname,
      procedure.proname,
      owner.rolname
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    JOIN pg_catalog.pg_roles AS owner
      ON owner.oid = procedure.proowner
    WHERE namespace.nspname = 'public'
      AND owner.rolname <> 'moazez_migration'
  ) AS owned_objects
  LIMIT 1;

  IF unexpected_owner IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected application object ownership: %', unexpected_owner;
  END IF;
END
$policy$;

REVOKE ALL PRIVILEGES ON DATABASE :"database_name" FROM
  moazez_api,
  moazez_core_worker,
  moazez_media_worker;
GRANT CONNECT ON DATABASE :"database_name" TO
  moazez_api,
  moazez_core_worker,
  moazez_media_worker;

REVOKE ALL PRIVILEGES ON SCHEMA public FROM
  moazez_api,
  moazez_core_worker,
  moazez_media_worker;
GRANT USAGE ON SCHEMA public TO
  moazez_api,
  moazez_core_worker,
  moazez_media_worker;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM
  moazez_api,
  moazez_core_worker,
  moazez_media_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO
  moazez_api,
  moazez_core_worker,
  moazez_media_worker;

REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM
  moazez_api,
  moazez_core_worker,
  moazez_media_worker;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM
  moazez_api,
  moazez_core_worker,
  moazez_media_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO
  moazez_api,
  moazez_core_worker,
  moazez_media_worker;

ALTER DEFAULT PRIVILEGES FOR ROLE moazez_migration IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM
    moazez_api, moazez_core_worker, moazez_media_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE moazez_migration IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO
    moazez_api, moazez_core_worker, moazez_media_worker;

ALTER DEFAULT PRIVILEGES FOR ROLE moazez_migration IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM
    moazez_api, moazez_core_worker, moazez_media_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE moazez_migration IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO
    moazez_api, moazez_core_worker, moazez_media_worker;

ALTER DEFAULT PRIVILEGES FOR ROLE moazez_migration IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE moazez_migration IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM
    moazez_api, moazez_core_worker, moazez_media_worker;
