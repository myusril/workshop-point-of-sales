-- Integration-test database on the development stack.
-- The production stack never mounts this directory.
SELECT 'CREATE DATABASE workshop_pos_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'workshop_pos_test')\gexec
