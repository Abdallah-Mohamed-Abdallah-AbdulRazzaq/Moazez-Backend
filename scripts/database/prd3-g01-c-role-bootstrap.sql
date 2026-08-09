\set ON_ERROR_STOP on

-- Required psql variables are supplied by the deployment/bootstrap caller.
-- Values are never echoed by this policy.
\if :{?database_name}
\else
  \echo 'database_name is required'
  \quit 3
\endif
\if :{?api_role_credential}
\else
  \echo 'api_role_credential is required'
  \quit 3
\endif
\if :{?core_worker_role_credential}
\else
  \echo 'core_worker_role_credential is required'
  \quit 3
\endif
\if :{?media_worker_role_credential}
\else
  \echo 'media_worker_role_credential is required'
  \quit 3
\endif
\if :{?migration_role_credential}
\else
  \echo 'migration_role_credential is required'
  \quit 3
\endif

SELECT
  current_database() = :'database_name' AS database_matches,
  length(:'api_role_credential') > 0
    AND length(:'core_worker_role_credential') > 0
    AND length(:'media_worker_role_credential') > 0
    AND length(:'migration_role_credential') > 0 AS credentials_present
\gset

\if :database_matches
\else
  \echo 'connected database does not match database_name'
  \quit 3
\endif
\if :credentials_present
\else
  \echo 'all role credentials must be non-empty'
  \quit 3
\endif

SELECT format('CREATE ROLE %I LOGIN', role_name)
FROM (
  VALUES
    ('moazez_api'),
    ('moazez_core_worker'),
    ('moazez_media_worker'),
    ('moazez_migration')
) AS required_roles(role_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_roles
  WHERE rolname = required_roles.role_name
)
\gexec

-- Cloud SQL administrators are not PostgreSQL superusers. Missing roles use
-- PostgreSQL's safe CREATE ROLE defaults; existing administrative attributes
-- are never normalized. Reject any unsafe role before credentials or grants
-- can change.
DO $policy$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_roles AS required_role
    WHERE required_role.rolname IN (
      'moazez_api',
      'moazez_core_worker',
      'moazez_media_worker',
      'moazez_migration'
    )
      AND required_role.rolcanlogin
      AND NOT required_role.rolsuper
      AND NOT required_role.rolcreatedb
      AND NOT required_role.rolcreaterole
      AND NOT required_role.rolreplication
      AND NOT required_role.rolbypassrls
      AND required_role.rolinherit
  ) <> 4 THEN
    RAISE EXCEPTION 'required database role attributes are unsafe';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS member_role
    JOIN pg_catalog.pg_roles AS system_role
      ON system_role.rolname = 'cloudsqlsuperuser'
    WHERE member_role.rolname IN (
      'moazez_api',
      'moazez_core_worker',
      'moazez_media_worker',
      'moazez_migration'
    )
      AND pg_catalog.pg_has_role(member_role.oid, system_role.oid, 'MEMBER')
  ) THEN
    RAISE EXCEPTION 'required database role memberships are unsafe';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS member_role
    CROSS JOIN pg_catalog.pg_roles AS granted_role
    WHERE member_role.rolname IN (
      'moazez_api',
      'moazez_core_worker',
      'moazez_media_worker',
      'moazez_migration'
    )
      AND granted_role.rolname IN (
        'moazez_api',
        'moazez_core_worker',
        'moazez_media_worker',
        'moazez_migration'
      )
      AND member_role.oid <> granted_role.oid
      AND pg_catalog.pg_has_role(member_role.oid, granted_role.oid, 'MEMBER')
  ) THEN
    RAISE EXCEPTION 'required database role memberships are unsafe';
  END IF;
END
$policy$;

-- Attribute and membership guards above must pass before password-only
-- rotation. Credentials stay bound psql variables and are never interpolated
-- into generated SQL.
ALTER ROLE moazez_api
  PASSWORD :'api_role_credential';
ALTER ROLE moazez_core_worker
  PASSWORD :'core_worker_role_credential';
ALTER ROLE moazez_media_worker
  PASSWORD :'media_worker_role_credential';
ALTER ROLE moazez_migration
  PASSWORD :'migration_role_credential';

REVOKE ALL PRIVILEGES ON DATABASE :"database_name" FROM
  PUBLIC,
  moazez_api,
  moazez_core_worker,
  moazez_media_worker,
  moazez_migration;
GRANT CONNECT ON DATABASE :"database_name" TO
  moazez_api,
  moazez_core_worker,
  moazez_media_worker;
GRANT CONNECT, CREATE ON DATABASE :"database_name" TO moazez_migration;

REVOKE ALL PRIVILEGES ON SCHEMA public FROM
  PUBLIC,
  moazez_api,
  moazez_core_worker,
  moazez_media_worker,
  moazez_migration;
GRANT USAGE, CREATE ON SCHEMA public TO moazez_migration;
