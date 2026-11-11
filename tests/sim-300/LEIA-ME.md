# Simulação: 300 utilizadores no plano gratuito do Supabase (03/11/2026)
Postgres local (sem Supabase real). Ordem: `1-stub-supabase.sql` → `SUPABASE_SETUP.sql` → migrações `002…021` → `SUPABASE_TUDO_v45.sql`
→ `grant select on all tables in schema public to anon, authenticated;` → `2-seed-300-utilizadores.sql`.
Carga: `PGOPTIONS='-c role=authenticated' pgbench -n -f home.sql -c 100 -T 8` (idem place.sql, chat.sql; rl.sql com role=service_role).
Resultados: base ≈ 11 MB; Home (50 negócios) ≈ 96 kB por carregamento; 100 clientes simultâneos: Home 32 ms, página 36 ms, conversa 15 ms, rate limit 10 ms.
