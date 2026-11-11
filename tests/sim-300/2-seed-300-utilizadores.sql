\set ON_ERROR_STOP on
set session_replication_role = replica;  -- seed rápido (sem triggers)
insert into auth.users (id,email) select gen_random_uuid(),'u'||g||'@gmail.com' from generate_series(1,300) g;
create temp table u as select id, row_number() over () n from auth.users;
insert into profiles (id,profile_type,name,email,province,city,country,phone)
 select id, case when n<=50 then 'business' else 'personal' end, 'Utilizador '||n, 'u'||n||'@gmail.com','Inhambane','Inhambane','Moçambique','+25884'||lpad(n::text,7,'0') from u;
insert into businesses (id,owner_id,business_name,category,province,city,country,address,phone,description,tags,website,hours_open,hours_close,open_days,structure_id,theme_id,background_id,block_order,cover_image,gallery,plan_id,plan_status,lat,lng,rating,reviews_count,neighborhood)
 select gen_random_uuid(), id, 'Negócio '||n, (array['restaurant','pharmacy','hotel','gym','barbershop'])[1+n%5], 'Inhambane', (array['Inhambane','Maxixe','Maputo'])[1+n%3],'Moçambique','Av. da Independência '||n||', Inhambane','+25884'||lpad(n::text,7,'0'),
  repeat('Descrição realista do negócio com serviços, horários e ofertas. ',6), array['peixe','marisco','esplanada','wifi'], 'https://negocio'||n||'.co.mz','08:00','22:00',array[1,2,3,4,5,6],'classic','sunset','bg1',array['hero','menu','gallery','reviews'],
  'https://imagens.xtack.co.mz/cover/'||id||'/1700000000000-abc123.jpg', (select array_agg('https://imagens.xtack.co.mz/gallery/'||u.id||'/17000000000'||k||'-abc123.jpg') from generate_series(1,6) k), 'free','active', -23.8+random()/10, 35.3+random()/10, round((3+random()*2)::numeric,1), 8, 'Bairro '||n
 from u where n<=50;
create temp table b as select id bid, owner_id, row_number() over () bn from businesses;
insert into products (business_id,name,description,price,currency,category,image_url,available) select bid,'Produto '||g,'Descrição do produto com ingredientes e detalhes',100+g*10,'MZN','menu','https://imagens.xtack.co.mz/product/'||bid||'/'||g||'.jpg',true from b, generate_series(1,15) g;
insert into business_posts (business_id,photo_url,caption,city,package_id,status,published_at,expires_at) select bid,'https://imagens.xtack.co.mz/post/'||bid||'/'||g||'.jpg','Legenda da publicação','Inhambane','7d','active',now(),now()+interval '7 days' from b, generate_series(1,3) g;
insert into reviews (business_id,author_id,author_name,rating,text,verified) select (select bid from b order by random() limit 1), (select id from u where n>50 order by random()+g*0 limit 1),'Cliente '||g,1+(random()*4)::int,'Gostei muito do atendimento e da comida, voltarei com certeza.',false from generate_series(1,400) g;
insert into favorites (user_id,business_id) select distinct on (uid,bid) uid,bid from (select (select id from u where n>50 order by random()+g*0 limit 1) uid,(select bid from b order by random()+g*0 limit 1) bid from generate_series(1,1000) g) x on conflict do nothing;
insert into messages (business_id,sender_id,receiver_id,text,read,created_at) select bid, uid, owner_id, 'Olá, vocês têm mesa livre para hoje à noite? Somos quatro pessoas.', random()<.7, now()-random()*interval '30 days' from (select (select bid from b order by random()+g*0 limit 1) bid,(select id from u where n>50 order by random()+g*0 limit 1) uid,g from generate_series(1,2000) g) x join b using (bid);
insert into orders (business_id,business_name,client_id,items,total,note,status) select bid,'Negócio','cliente-'||g,'[{"name":"Prato","qty":2,"price":250}]'::jsonb,500,'sem picante','pending' from b, generate_series(1,6) g;
insert into push_tokens (user_id,token,platform) select id, md5(id::text)||md5(n::text)||'xxxxxxxx', 'web' from u;
insert into analytics (business_id,date,views,clicks,messages,map_pins,calls) select bid, d::date, (random()*40)::int,(random()*10)::int,(random()*4)::int,(random()*8)::int,(random()*3)::int from b, generate_series(current_date-29,current_date,'1 day') d;
set session_replication_role = origin;
analyze;
select 'ok';
