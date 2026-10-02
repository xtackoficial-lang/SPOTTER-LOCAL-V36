import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { sign } from "./lib.mjs";
const A="00000000-0000-0000-0000-00000000000a", B="00000000-0000-0000-0000-00000000000b", C="00000000-0000-0000-0000-00000000000c", E="00000000-0000-0000-0000-00000000000e";
const HOTEL="10000000-0000-0000-0000-00000000000a", TAXI="10000000-0000-0000-0000-00000000000b", RESTO="10000000-0000-0000-0000-00000000000e", ROOM="20000000-0000-0000-0000-00000000000a";
const tok=(sub)=>sign({sub,role:"authenticated"});
const sql=(q)=>execSync(`su postgres -c "psql -d spot2 -At -F'|' -c \\"${q.replace(/"/g,'\\\\\\"')}\\""`).toString().trim();
let pass=0, fail=0; const falhas=[];
const ok=(nome,cond,extra="")=>{ if(cond){pass++;console.log("  ✅",nome);} else {fail++;falhas.push(nome);console.log("  ❌",nome,extra);} };
const call=async(port,body,t,extra={})=>{ const r=await fetch(`http://127.0.0.1:${port}/`,{method:"POST",headers:{"content-type":"application/json",...(t?{authorization:`Bearer ${t}`}:{}),...extra},body:typeof body==="string"?body:JSON.stringify(body)}); let j=null; const txt=await r.text(); try{j=JSON.parse(txt)}catch{} return {status:r.status,json:j,txt}; };
const create=(b,t)=>call(8101,b,t);
const lastZumbo=()=>{ const l=fs.readFileSync("/tmp/h/mock.log","utf8").trim().split("\n").map(x=>JSON.parse(x)).filter(x=>x.path==="/api/public/v1/payments"); return l[l.length-1]; };
const webhook=(event,reference,secret="whsec_test")=>{ const body=JSON.stringify({event,data:{reference,payment_id:"pid-"+reference,slug:reference.toLowerCase()}}); const sig=crypto.createHmac("sha256",secret).update(body).digest("hex"); return call(8102,body,null,{"x-zumbopay-signature":sig}); };

console.log("\n=== create-zumbopay-payment ===");
// planos
for (const [plan,preco] of [["starter",300],["pro",500],["premium",900]]) {
  const r=await create({businessId:HOTEL,planId:plan},tok(A));
  ok(`plano ${plan} → 200 com link`, r.status===200 && r.json?.paymentUrl||r.json?.payment_url, r.txt);
  const z=lastZumbo(); const zb=JSON.parse(z.body);
  ok(`  ZumboPay recebeu ${preco} MZN, wallet, merchant, Bearer`, zb.amount===preco && zb.wallet_id==="wallet-test-1" && z.headers["x-merchant-id"]==="MCH_TEST" && /^Bearer zk_/.test(z.headers.authorization), JSON.stringify(zb));
}
console.log(" payload exemplo:", lastZumbo().body.slice(0,300));
const rb=await create({businessId:HOTEL,planId:"boost",boostPackageId:"7d"},tok(A)); ok("boost 7d → 200", rb.status===200, rb.txt);
ok("  boost 7d cobra 7×preço/dia > 0", JSON.parse(lastZumbo().body).amount>0, lastZumbo().body);
const rp=await create({businessId:HOTEL,planId:"post",postPackageId:"3d",contentMetadata:{title:"Promo"}},tok(A)); ok("post 3d → 200 (120 MZN)", rp.status===200 && JSON.parse(lastZumbo().body).amount===120, rp.txt);
const re=await create({businessId:HOTEL,planId:"event",eventTier:"featured",contentMetadata:{title:"Festa"}},tok(A)); ok("evento featured → 200 (250 MZN)", re.status===200 && JSON.parse(lastZumbo().body).amount===250, re.txt);
// quarto
const room=(extra={})=>({businessId:HOTEL,planId:"room",roomId:ROOM,checkIn:"2026-11-01",checkOut:"2026-11-03",guests:2,clientName:"Ana",clientPhone:"841111111",...extra});
let r=await create(room({paymentOption:"deposit"}),tok(C)); ok("quarto sinal 20% → 200", r.status===200, r.txt); ok("  cobra 800 (20% de 4000)", JSON.parse(lastZumbo().body).amount===800, lastZumbo().body);
r=await create(room({paymentOption:"full"}),tok(C)); ok("quarto 100% → 200", r.status===200, r.txt); ok("  cobra 4000", JSON.parse(lastZumbo().body).amount===4000);
r=await create(room(),tok(C)); ok("quarto sem opção → assume sinal 800", r.status===200 && JSON.parse(lastZumbo().body).amount===800, r.txt);
r=await create(room({paymentOption:"10pct"}),tok(C)); ok("quarto opção inválida → 400", r.status===400, r.txt);
r=await create(room({paymentOption:"full"}),null); ok("quarto sem login → 401", r.status===401, r.txt);
r=await create(room({businessId:TAXI,paymentOption:"full"}),tok(C)); ok("quarto num TÁXI → recusado (400/404)", r.status>=400 && r.status<500, r.txt);
r=await create(room({paymentOption:"full",checkOut:"2026-10-30"}),tok(C)); ok("check-out antes do check-in → recusado", r.status>=400 && r.status<500, r.txt);
r=await create(room({paymentOption:"full",amount:1}),tok(C)); ok("cliente a forçar 'amount' → ignorado (cobra 4000)", JSON.parse(lastZumbo().body).amount===4000);
// mesa
const mesa=(extra={})=>({businessId:RESTO,planId:"table",reservationDate:"2026-11-05",timeSlot:"19:30",guests:4,clientName:"Ana",clientPhone:"841111111",tableTipo:"normal",...extra});
r=await create(mesa(),tok(C)); ok("mesa normal → 200 (200 MZN)", r.status===200 && JSON.parse(lastZumbo().body).amount===200, r.txt);
r=await create(mesa({tableTipo:"evento"}),tok(C)); ok("mesa evento → 200 (500 MZN)", r.status===200 && JSON.parse(lastZumbo().body).amount===500, r.txt);
r=await create(mesa({businessId:TAXI}),tok(C)); ok("mesa num TÁXI → recusado", r.status>=400 && r.status<500, r.txt);
r=await create(mesa(),null); ok("mesa sem login → 401", r.status===401);
// inválidos
r=await create({businessId:HOTEL,planId:"inexistente"},tok(A)); ok("plano inexistente → 400", r.status===400, r.txt);
r=await create("not json",tok(A)); ok("corpo inválido → 400", r.status===400, r.txt);
// ZumboPay em baixo
await fetch("http://127.0.0.1:4000/__mode",{method:"POST",body:"down"});
r=await create({businessId:RESTO,planId:"starter"},tok(E)); ok("ZumboPay em baixo → 502 com mensagem", r.status===502 && r.json?.error, r.txt);
ok("  linha fica 'failed' (não órfã pending)", sql("select status from payments where business_id='"+RESTO+"' and plan_id='starter'")==="failed", sql("select status from payments where business_id='"+RESTO+"' and plan_id='starter'"));
await fetch("http://127.0.0.1:4000/__mode",{method:"POST",body:"ok"});
// duplo clique numa assinatura reaproveita o link; 2 clientes no mesmo hotel NÃO partilham pagamento
let d1=await create({businessId:HOTEL,planId:"premium"},tok(A)), d2=await create({businessId:HOTEL,planId:"premium"},tok(A)); ok("duplo clique em assinatura → reaproveita o mesmo link", d2.json?.reused===true && d1.json?.paymentId===d2.json?.paymentId, d2.txt);
let c1=await create(room({paymentOption:"full",clientName:"Cliente Um"}),tok(C)), c2=await create(room({paymentOption:"full",clientName:"Cliente Dois"}),tok("00000000-0000-0000-0000-00000000000e")); ok("2 clientes a reservar quarto → pagamentos SEPARADOS", c1.json?.paymentId && c2.json?.paymentId && c1.json.paymentId!==c2.json.paymentId && !c2.json.reused, c2.txt);
await fetch("http://127.0.0.1:4000/__mode",{method:"POST",body:"badjson"});
r=await create({businessId:RESTO,planId:"pro"},tok(E)); ok("ZumboPay sem checkout_url → 502", r.status===502, r.txt);
await fetch("http://127.0.0.1:4000/__mode",{method:"POST",body:"ok"});
console.log("\nlinhas payments:", sql("select plan_id||':'||status||':'||amount||':'||coalesce(method,'?') from payments order by created_at").split("\n").join("  "));
fs.writeFileSync("/tmp/h/t1.json",JSON.stringify({pass,fail,falhas}));
console.log(`\nRESULTADO create: ${pass} ok, ${fail} falhas`, falhas);
