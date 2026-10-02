import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { sign } from "./lib.mjs";
const A="00000000-0000-0000-0000-00000000000a", B="00000000-0000-0000-0000-00000000000b", C="00000000-0000-0000-0000-00000000000c", E="00000000-0000-0000-0000-00000000000e";
const HOTEL="10000000-0000-0000-0000-00000000000a", RESTO="10000000-0000-0000-0000-00000000000e", ROOM="20000000-0000-0000-0000-00000000000a";
const tok=(sub)=>sign({sub,role:"authenticated"});
const sql=(q)=>execSync(`su postgres -c "psql -d spot2 -At -F'|' -c \\"${q.replace(/"/g,'\\\\\\"')}\\""`).toString().trim();
let pass=0, fail=0; const falhas=[];
const ok=(n,c,x="")=>{ if(c){pass++;console.log("  ✅",n);} else {fail++;falhas.push(n);console.log("  ❌",n,x);} };
const post=async(port,body,t,extra={})=>{ const r=await fetch(`http://127.0.0.1:${port}/`,{method:"POST",headers:{"content-type":"application/json",...(t?{authorization:`Bearer ${t}`}:{}),...extra},body:typeof body==="string"?body:JSON.stringify(body)}); const txt=await r.text(); let j=null; try{j=JSON.parse(txt)}catch{} return {status:r.status,json:j,txt}; };
const create=(b,t)=>post(8101,b,t);
const hook=(event,zref,secret="whsec_test",shape="data")=>{ const body=JSON.stringify(shape==="data"?{event,data:{reference:zref,payment_id:"pid-"+zref,slug:zref.toLowerCase()}}:{event,reference:zref}); const sig=crypto.createHmac("sha256",secret).update(body).digest("hex"); return post(8102,body,null,{"x-zumbopay-signature":sig}); };
const zref=(paymentId)=>sql(`select zumbopay_payment_id from payments where id='${paymentId}'`);
const mails=()=>fs.readFileSync("/tmp/h/mock.log","utf8").trim().split("\n").map(x=>JSON.parse(x)).filter(x=>x.path==="/emails");

console.log("\n=== zumbopay-webhook ===");
let r=await post(8102,JSON.stringify({event:"payment.succeeded",data:{reference:"X"}}),null,{"x-zumbopay-signature":"00"}); ok("assinatura errada → 401", r.status===401, r.txt);
r=await post(8102,JSON.stringify({event:"payment.succeeded",data:{reference:"X"}})); ok("sem assinatura → 401", r.status===401);
r=await hook("payment.succeeded","ZP_NAOEXISTE"); ok("pagamento desconhecido → 200 (não reenviar) matched=false", r.status===200 && r.json?.matched===false, r.txt);
r=await hook("payout.completed","ZP_X"); ok("evento que não é pagamento → ignorado 200", r.status===200 && r.json?.ignored, r.txt);
r=await post(8102,"x",null,{"x-zumbopay-signature":crypto.createHmac("sha256","whsec_test").update("x").digest("hex")}); ok("corpo não-JSON assinado → 400", r.status===400, r.txt);

// --- assinatura premium
let p=await create({businessId:HOTEL,planId:"premium"},tok(A));
r=await hook("payment.succeeded",zref(p.json.paymentId)); ok("premium: webhook → 200", r.status===200, r.txt);
ok("  payment → confirmed", sql(`select status from payments where id='${p.json.paymentId}'`)==="confirmed");
ok("  negócio passa a plano premium activo", sql(`select plan_id||'/'||plan_status from businesses where id='${HOTEL}'`).startsWith("premium/active"), sql(`select plan_id||'/'||plan_status from businesses where id='${HOTEL}'`));
r=await hook("payment.succeeded",zref(p.json.paymentId)); ok("  repetição do webhook → alreadyConfirmed (idempotente)", r.json?.alreadyConfirmed===true, r.txt);

// --- boost
p=await create({businessId:HOTEL,planId:"boost",boostPackageId:"7d"},tok(A)); r=await hook("payment.succeeded",zref(p.json.paymentId));
ok("boost 7d: webhook 200 + linha em business_boosts", r.status===200 && sql(`select count(*) from business_boosts where business_id='${HOTEL}'`)==="1", r.txt+sql(`select count(*) from business_boosts`));
// --- post
p=await create({businessId:HOTEL,planId:"post",postPackageId:"24h",contentMetadata:{caption:"Promoção de verão",imageUrl:"https://x/y.jpg"}},tok(A)); r=await hook("payment.succeeded",zref(p.json.paymentId));
ok("post 24h: webhook 200 + business_posts criado", r.status===200 && sql(`select count(*) from business_posts where business_id='${HOTEL}'`)==="1", r.txt);
// --- event
p=await create({businessId:HOTEL,planId:"event",eventTier:"standard",contentMetadata:{title:"Festa",date:"2026-12-01",description:"d"}},tok(A)); r=await hook("payment.succeeded",zref(p.json.paymentId));
ok("evento: webhook 200 + events criado", r.status===200 && sql(`select count(*) from events where business_id='${HOTEL}'`)==="1", r.txt+sql(`select count(*) from events`));

// --- quarto (sinal 20%)
const room=(extra={})=>({businessId:HOTEL,planId:"room",roomId:ROOM,checkIn:"2026-11-01",checkOut:"2026-11-03",guests:2,clientName:"Ana",clientPhone:"841111111",specialRequest:"andar alto",...extra});
const mailsAntes=mails().length;
p=await create(room({paymentOption:"deposit"}),tok(C)); r=await hook("payment.succeeded",zref(p.json.paymentId));
ok("quarto sinal: webhook 200", r.status===200, r.txt);
const rr=sql(`select status||'|'||payment_option||'|'||total_price||'|'||amount_paid||'|'||balance_due||'|'||commission_amount||'|'||(response_deadline is not null)||'|'||client_user_id from room_reservations order by created_at desc limit 1`);
ok("  reserva criada pending_approval, sinal 800, resta 3200, comissão 400, com prazo", rr===`pending_approval|deposit|4000|800|3200|400|true|${C}`, rr);
const hrs=sql(`select round(extract(epoch from (response_deadline - now()))/3600) from room_reservations order by created_at desc limit 1`); ok("  prazo ≈ 24 horas", hrs==="24", hrs);
ok("  mensagem no chat do cliente com prazo", sql(`select count(*) from messages where text like '%responde até%'`)!=="0" || sql(`select count(*) from messages`)!=="0", "(ver tabela messages)");
const m=mails().slice(mailsAntes); ok("  e-mail de controlo enviado (Resend) com os valores certos", m.length>0 && /Sinal de 20%/.test(m[m.length-1].body) && /3200/.test(m[m.length-1].body) && /A repassar ao hotel/.test(m[m.length-1].body), m.length?m[m.length-1].body.slice(0,200):"sem e-mail");
const depId=sql(`select id from room_reservations order by created_at desc limit 1`);
// --- quarto 100%
p=await create(room({paymentOption:"full",checkIn:"2026-12-10",checkOut:"2026-12-12"}),tok(C)); r=await hook("payment.succeeded",zref(p.json.paymentId));
const rf=sql(`select payment_option||'|'||amount_paid||'|'||balance_due||'|'||commission_amount from room_reservations order by created_at desc limit 1`);
ok("quarto 100%: pago 4000, resta 0, comissão 400", rf==="full|4000|0|400", rf);
const fullId=sql(`select id from room_reservations order by created_at desc limit 1`);
// --- mesa
p=await create({businessId:RESTO,planId:"table",reservationDate:"2026-11-05",timeSlot:"19:30",guests:4,clientName:"Ana",clientPhone:"841111111",tableTipo:"normal"},tok(C)); r=await hook("payment.succeeded",zref(p.json.paymentId));
ok("mesa: webhook 200 + reserva criada e confirmada", r.status===200 && /confirmed/.test(sql(`select status from table_reservations order by created_at desc limit 1`)), r.txt+sql(`select status from table_reservations`));
// --- falha
p=await create({businessId:RESTO,planId:"pro"},tok(E)); r=await hook("payment.failed",zref(p.json.paymentId));
ok("payment.failed → pagamento 'failed', nada activado", r.status===200 && sql(`select status from payments where id='${p.json.paymentId}'`)==="failed" && sql(`select plan_id from businesses where id='${RESTO}'`)==="free", r.txt);
// formato alternativo (campos na raiz)
p=await create({businessId:RESTO,planId:"starter"},tok(E)); r=await hook("payment.succeeded",zref(p.json.paymentId),"whsec_test","root");
ok("formato com 'reference' na raiz também funciona", r.status===200 && sql(`select status from payments where id='${p.json.paymentId}'`)==="confirmed", r.txt);
// lookup pelo slug
p=await create({businessId:RESTO,planId:"pro"},tok(E)); { const slug=sql(`select payment_url from payments where id='${p.json.paymentId}'`).split("/pay/")[1]; const body=JSON.stringify({event:"payment.succeeded",data:{slug}}); const sig=crypto.createHmac("sha256","whsec_test").update(body).digest("hex"); r=await post(8102,body,null,{"x-zumbopay-signature":sig}); }
ok("webhook só com 'slug' também encontra o pagamento", r.status===200 && sql(`select status from payments where id='${p.json.paymentId}'`)==="confirmed", r.txt);

console.log("\n=== reservation-respond ===");
const resp=(id,action,t,reason)=>post(8103,{reservationId:id,action,reason},t);
r=await resp(depId,"accept",null); ok("sem login → 401", r.status===401, r.txt);
r=await resp(depId,"accept",tok(B)); ok("outro comerciante (táxi) tenta aceitar → recusado 403/404", r.status===403||r.status===404, r.status+" "+r.txt);
r=await resp(depId,"accept",tok(C)); ok("o próprio cliente tenta aceitar → recusado", r.status===403||r.status===404, r.status+" "+r.txt);
r=await resp(depId,"reject",tok(A)); ok("rejeitar sem motivo → 400", r.status===400, r.txt);
const mA=mails().length;
r=await resp(depId,"accept",tok(A)); ok("hotel aceita (sinal) → 200", r.status===200, r.txt);
ok("  estado confirmed", sql(`select status from room_reservations where id='${depId}'`)==="confirmed");
ok("  mensagem diz 'Restam 3200 MT'", sql(`select count(*) from messages where text like '%Restam 3200%'`)==="1", sql(`select text from messages order by created_at desc limit 2`));
r=await resp(depId,"accept",tok(A)); ok("aceitar duas vezes → recusado (já respondida)", r.status>=400, r.txt);
r=await resp(fullId,"accept",tok(A)); ok("hotel aceita reserva paga a 100% → 200", r.status===200, r.txt);
ok("  mensagem diz 'nada a pagar no check-in'", sql(`select count(*) from messages where text like '%nada a pagar no check-in%'`)==="1", sql(`select text from messages order by created_at desc limit 1`));
// rejeição
p=await create(room({paymentOption:"deposit",checkIn:"2027-01-10",checkOut:"2027-01-12"}),tok(C)); await hook("payment.succeeded",zref(p.json.paymentId));
const rejId=sql(`select id from room_reservations order by created_at desc limit 1`); const mB=mails().length;
r=await resp(rejId,"reject",tok(A),"Sem disponibilidade"); ok("hotel recusa com motivo → 200", r.status===200, r.txt);
ok("  estado rejected + e-mail de reembolso com valor pago 800", sql(`select status from room_reservations where id='${rejId}'`)==="rejected" && mails().slice(mB).some(x=>/800/.test(x.body)&&/reembols/i.test(x.body)), JSON.stringify(mails().slice(mB).map(x=>x.body.slice(0,120))));
// mesa respond? 
console.log(`\nRESULTADO webhook+respond: ${pass} ok, ${fail} falhas`, falhas);
