-- Apply this only when migration 202608120001 was already run.
-- A driver may handle any number of tasks in parallel or sequentially. The
-- claim RPC still atomically allows only one driver to claim each individual task.

drop index if exists public.one_open_task_per_driver;
