-- AGENDAMENTO A CADA 60 SEGUNDOS
--
-- Antes:
-- 1. Faça o deploy da função ticket-monitor.
-- 2. Crie o secret MONITOR_SECRET na Edge Function.
-- 3. Substitua os dois valores abaixo.
--
-- O Supabase recomenda guardar tokens no Vault. Este exemplo usa Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select vault.create_secret(
  'https://hznejgtxdqaxnlarpzum.supabase.co/functions/v1/ticket-monitor',
  'ticket_monitor_url'
);

select vault.create_secret(
  'COLE-AQUI-O-MESMO-MONITOR-SECRET',
  'ticket_monitor_secret'
);

select cron.schedule(
  'ticket-monitor-cada-minuto',
  '* * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'ticket_monitor_url'
      limit 1
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-monitor-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ticket_monitor_secret'
        limit 1
      )
    ),
    body := '{"source":"cron"}'::jsonb
  );
  $$
);

-- Conferir o job:
-- select * from cron.job;

-- Remover, se necessário:
-- select cron.unschedule('ticket-monitor-cada-minuto');
