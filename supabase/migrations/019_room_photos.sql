-- 019 (era 015_room_photos) — Quartos: até 4 fotos por quarto.
-- Seguro de correr mais de uma vez. photo_url (a antiga, 1 foto) continua a existir
-- e guarda sempre a 1ª foto, para nada partir.
alter table public.business_rooms
  add column if not exists photo_urls text[] not null default '{}';

update public.business_rooms
   set photo_urls = array[photo_url]
 where photo_url is not null and cardinality(photo_urls) = 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_rooms_photo_urls_max4') then
    alter table public.business_rooms
      add constraint business_rooms_photo_urls_max4 check (cardinality(photo_urls) <= 4);
  end if;
end $$;
