import fs from "node:fs";
import { execSync } from "node:child_process";
import { sign } from "./lib.mjs";
const A="00000000-0000-0000-0000-00000000000a", B="00000000-0000-0000-0000-00000000000b", C="00000000-0000-0000-0000-00000000000c";
const HOTEL="10000000-0000-0000-0000-00000000000a", TAXI="10000000-0000-0000-0000-00000000000b";
const tok=(sub)=>sign({sub,role:"authenticated"});
const sql=(q)=>execSync(`su postgres -c "psql -d spot2 -At -F'|' -c \\"${q.replace(/"/g,'\\\\\\"')}\\""`).toString().trim();
let pass=0, fail=0; const falhas=[];
const ok=(n,c,x="")=>{ if(c){pass++;console.log("  ✅",n);} else {fail++;falhas.push(n);console.log("  ❌",n,x);} };
const post=async(port,body,t,m="POST")=>{ const r=await fetch(`http://127.0.0.1:${port}/`,{method:m,headers:{"content-type":"application/json",...(t?{authorization:`Bearer ${t}`}:{})},...(m==="POST"?{body:JSON.stringify(body)}:{})}); const txt=await r.text(); let j=null; try{j=JSON.parse(txt)}catch{} return {status:r.status,json:j,txt}; };

console.log("\n=== reactivate-rooms (8105) ===");
sql(`update business_rooms set occupied_until = current_date - 2 where id='20000000-0000-0000-0000-00000000000a'`);
let r=await post(8105,{},null); ok("sem credencial → 401", r.status===401, r.txt);
r=await post(8105,{},tok(C)); ok("utilizador normal → 401/403", r.status===401||r.status===403, r.status+r.txt);
r=await post(8105,{},"fsecret"); ok("com FUNCTION_SECRET → 200", r.status===200, r.txt);
ok("  quarto com ocupação expirada volta a livre", sql(`select occupied_until is null from business_rooms where id='20000000-0000-0000-0000-00000000000a'`)==="t", r.txt);

console.log("\n=== run-billing-engine (8106) ===");
sql(`update businesses set plan_id='pro', plan_status='active', plan_renews_at = now() - interval '2 days' where id='${HOTEL}'`);
r=await post(8106,{},null); ok("sem credencial → 401", r.status===401, r.txt);
r=await post(8106,{},tok(C)); ok("utilizador normal → 401/403", r.status===401||r.status===403, r.status+r.txt);
r=await post(8106,{},"fsecret"); ok("com FUNCTION_SECRET → 200", r.status===200, r.txt);
console.log("   resposta:", r.txt.slice(0,300)); console.log("   estado do hotel depois:", sql(`select plan_id||'/'||plan_status from businesses where id='${HOTEL}'`));

console.log("\n=== send-scheduled-notifications (8108) ===");
r=await post(8108,{},null); ok("sem credencial → 401", r.status===401, r.txt);
r=await post(8108,{},"fsecret"); ok("com FUNCTION_SECRET → responde sem rebentar (200 ou erro tratado)", r.status===200||(r.status>=400&&r.status<500)||r.status===500&&r.json, r.status+" "+r.txt.slice(0,200));
console.log("   resposta:", r.status, r.txt.slice(0,200));

console.log("\n=== send-merchant-promo (8107) ===");
r=await post(8107,{businessId:HOTEL,title:"Promo",body:"Desconto",validUntil:"2026-12-31"},null); ok("sem login → 401", r.status===401, r.txt);
r=await post(8107,{businessId:HOTEL},tok(A)); ok("campos em falta → 400", r.status===400, r.txt);
r=await post(8107,{businessId:HOTEL,title:"Promo",body:"Desconto",validUntil:"2026-12-31"},tok(B)); ok("outro comerciante → 403", r.status===403, r.status+r.txt);
r=await post(8107,{businessId:HOTEL,title:"Promo",body:"Desconto",validUntil:"2026-12-31"},tok(A)); console.log("   dono do hotel (sem Firebase configurado):", r.status, r.txt.slice(0,200)); ok("dono → não rebenta (resposta tratada)", r.status<500||!!r.json, r.txt);

console.log("\n=== delete-own-account (8104) ===");
r=await post(8104,{},null); ok("sem login → 401", r.status===401, r.txt);
r=await post(8104,{},tok(B)); ok("utilizador apaga a própria conta → 200", r.status===200, r.txt);
ok("  negócio do utilizador removido", sql(`select count(*) from businesses where owner_id='${B}'`)==="0");
ok("  auth.admin.deleteUser chamado só para o próprio id", fs.existsSync("/tmp/h/admin-calls.log") && fs.readFileSync("/tmp/h/admin-calls.log","utf8").includes(B) && !fs.readFileSync("/tmp/h/admin-calls.log","utf8").includes(A));
ok("  negócio de OUTRO utilizador intacto", sql(`select count(*) from businesses where owner_id='${A}'`)==="1");
console.log(`\nRESULTADO restantes: ${pass} ok, ${fail} falhas`, falhas);
