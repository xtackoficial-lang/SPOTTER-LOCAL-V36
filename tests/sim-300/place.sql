\set k random(1,50)
select * from businesses_public offset :k-1 limit 1;
select * from products where business_id=(select id from businesses offset :k-1 limit 1);
select * from reviews where business_id=(select id from businesses offset :k-1 limit 1) order by created_at desc limit 20;
