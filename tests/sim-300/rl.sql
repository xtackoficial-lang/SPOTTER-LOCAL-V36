\set u random(1,300)
select * from check_rate_limit('r2:'||:u, 60, 60);
