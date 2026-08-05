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

ALTER ROLE moazez_api WITH
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
  PASSWORD :'api_role_credential';
ALTER ROLE moazez_core_worker WITH
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
  PASSWORD :'core_worker_role_credential';
ALTER ROLE moazez_media_worker WITH
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
  PASSWORD :'media_worker_role_credential';
ALTER ROLE moazez_migration WITH
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
  PASSWORD :'migration_role_credential';

-- Normalize the cross-role boundary even if an earlier local rehearsal added
-- membership. None of the four identities can inherit or SET ROLE through a
-- Moazez role membership.
REVOKE moazez_migration FROM
  moazez_api, moazez_core_worker, moazez_media_worker;
REVOKE moazez_api FROM
  moazez_migration, moazez_core_worker, moazez_media_worker;
REVOKE moazez_core_worker FROM
  moazez_migration, moazez_api, moazez_media_worker;
REVOKE moazez_media_worker FROM
  moazez_migration, moazez_api, moazez_core_worker;

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
