-- Runs once, via /docker-entrypoint-initdb.d, and only on an empty data volume.
-- Editing this file has no effect on an existing database: `docker compose down -v`
-- to drop the volume and re-run it.
--
-- One Postgres instance, two databases: the service boundary is kept in the data
-- layer without a second container. There is no cross-database foreign key —
-- Task.userId is a plain column.
--
-- POSTGRES_USER / POSTGRES_DB are created by the image's entrypoint before this
-- script runs, so the role already exists and only needs the extra databases.
--
-- No explicit OWNER: the entrypoint runs this as POSTGRES_USER and CREATE
-- DATABASE defaults the owner to the executing role, so both databases belong to
-- the app user whatever POSTGRES_USER is overridden to. Naming the owner would
-- hardcode it — and CREATE DATABASE's OWNER clause takes a literal name, not
-- CURRENT_USER.

CREATE DATABASE auth_db;
CREATE DATABASE tasks_db;
