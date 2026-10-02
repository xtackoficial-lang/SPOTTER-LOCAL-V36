truncate public.payments, public.room_reservations, public.table_reservations, public.business_rooms, public.business_boosts, public.business_posts, public.events, public.businesses cascade;
delete from public.admins; delete from auth.users;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','hotel@x.com'),('00000000-0000-0000-0000-00000000000b','taxi@x.com'),
 ('00000000-0000-0000-0000-00000000000c','cliente@x.com'),('00000000-0000-0000-0000-00000000000e','resto@x.com');
insert into public.businesses(id,owner_id,business_name,category,accepts_room_reservation,accepts_table_reservation,mesa_preco_normal,mesa_preco_evento) values
 ('10000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','Hotel Mar','hotel',true,true,200,500),
 ('10000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','Taxi Joe','taxi',false,false,200,500),
 ('10000000-0000-0000-0000-00000000000e','00000000-0000-0000-0000-00000000000e','Restaurante Sol','restaurant',false,true,200,500);
insert into public.business_rooms(id,business_id,name,price_per_night,capacity,active) values
 ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','Suite',2000,2,true);
