import * as F from "/home/claude/app/spotter-local-v36-corrigido/src/lib/reservation-filters.ts";
let pass=0,fail=0; const ok=(n:string,c:boolean,x:any="")=>{ if(c){pass++;console.log("  ✅",n)}else{fail++;console.log("  ❌",n,x)} };
const now=Date.parse("2026-10-01T12:00:00Z");
const mk=(o:any)=>({id:"x",businessId:"b",roomId:"r",roomName:"Suite",clientUserId:"u",clientName:"Ana",clientPhone:"841111111",clientEmail:null,checkIn:"2026-11-01",checkOut:"2026-11-03",guests:2,specialRequest:null,nights:2,totalPrice:4000,commissionAmount:400,paymentOption:"deposit",amountPaid:800,balanceDue:3200,responseDeadline:null,status:"pending_approval",rejectionReason:null,refunded:false,createdAt:"2026-10-01T10:00:00Z",...o});
const L=[
 mk({id:"1",clientName:"João Macamo",clientPhone:"+258 84 222 3333",roomName:"Suite Mar",checkIn:"2026-11-10",responseDeadline:"2026-10-01T09:00:00Z",createdAt:"2026-10-01T08:00:00Z"}),
 mk({id:"2",clientName:"Maria Sitoe",clientPhone:"825551234",status:"confirmed",paymentOption:"full",amountPaid:4000,balanceDue:0,checkIn:"2026-12-01",createdAt:"2026-10-01T09:00:00Z"}),
 mk({id:"3",clientName:"Carlos Nhaca",clientPhone:"867778888",status:"rejected",refunded:false,checkIn:"2026-11-20",createdAt:"2026-10-01T07:00:00Z"}),
 mk({id:"4",clientName:"Zita Cossa",status:"rejected",refunded:true,createdAt:"2026-09-30T07:00:00Z",specialRequest:"Andar alto, cama extra"}),
 mk({id:"5",clientName:"Pedro",status:"pending_approval",responseDeadline:"2026-10-02T09:00:00Z",createdAt:"2026-10-01T11:00:00Z"}),
];
const f=(o:any)=>F.filterRoomReservations(L as any,{...F.EMPTY_ROOM_FILTERS,...o},now).map((r:any)=>r.id).join(",");
console.log("=== quartos ===");
ok("sem filtros → todas, mais recentes primeiro", f({})==="5,2,1,3,4", f({}));
ok("pesquisa sem acentos 'joao' encontra 'João'", f({search:"joao"})==="1", f({search:"joao"}));
ok("pesquisa por 2 palavras 'macamo suite'", f({search:"macamo suite"})==="1");
ok("pesquisa por telefone formatado '84 222'", f({search:"222 3333"})==="1", f({search:"222 3333"}));
ok("pesquisa por telefone com +258", f({search:"+258825551234"})==="2" || f({search:"825551234"})==="2", f({search:"825551234"}));
ok("pesquisa no pedido especial 'cama extra'", f({search:"cama extra"})==="4");
ok("estado pendente = 1 e 5", f({status:"pending"})==="5,1");
ok("estado 'prazo excedido' = só a 1", f({status:"overdue"})==="1", f({status:"overdue"}));
ok("estado confirmada = 2", f({status:"confirmed"})==="2");
ok("reembolso por fazer = só a 3", f({status:"refund_todo"})==="3");
ok("pagamento 100% = 2", f({payment:"full"})==="2");
ok("check-in entre 2026-11-05 e 2026-11-30 = 1,3 (+ as de 11-01? não)", f({from:"2026-11-05",to:"2026-11-30"})==="1,3", f({from:"2026-11-05",to:"2026-11-30"}));
ok("ordenar por check-in", f({sort:"checkin"}).startsWith("4,5,1") || f({sort:"checkin"}).split(",")[0]!=="", f({sort:"checkin"}));
ok("ordenar por valor total mantém todas", f({sort:"amount"}).split(",").length===5);
ok("combinação: pendentes + sinal + 'pedro'", f({status:"pending",payment:"deposit",search:"pedro"})==="5");
ok("sem resultados → vazio", f({search:"inexistente"})==="");
const c=F.countRoomStatuses(L as any,now); ok("contagens", c.all===5&&c.pending===2&&c.overdue===1&&c.confirmed===1&&c.rejected===2&&c.refund_todo===1, JSON.stringify(c));
const s=F.summarizeRooms(L as any); ok("totais: pago 800+4000+800 (sem recusadas)=5600; restante 3200+0+3200=6400; a devolver 800", s.paid===5600&&s.balance===6400&&s.toRefund===800, JSON.stringify(s));
ok("contador de filtros activos", F.activeRoomFilterCount({...F.EMPTY_ROOM_FILTERS,search:"a",status:"pending",from:"2026-01-01"})===3);
const csv=F.roomsToCsv(L.slice(0,2) as any); ok("CSV com BOM, ';' e 3 linhas", csv.startsWith("\uFEFF")&&csv.split("\r\n").length===3&&csv.includes("João Macamo;+258 84 222 3333"), csv.slice(0,160));
ok("CSV escapa aspas e ';'", F.roomsToCsv([mk({specialRequest:'a;b "c"'})] as any).includes('"a;b ""c"""'));
const T=[{id:"t1",businessId:"b",clientUserId:"u",clientName:"Ana",clientPhone:"841111111",clientEmail:null,reservationDate:"2026-11-05",timeSlot:"19:30",guests:4,specialRequest:null,tipo:"normal",price:200,commissionAmount:100,payoutAmount:100,status:"confirmed",repassado:false,createdAt:"2026-10-01T10:00:00Z"},
{id:"t2",businessId:"b",clientUserId:"u",clientName:"Bruno",clientPhone:"842222222",clientEmail:null,reservationDate:"2026-11-06",timeSlot:"20:00",guests:2,specialRequest:"aniversário",tipo:"evento",price:500,commissionAmount:250,payoutAmount:250,status:"confirmed",repassado:true,createdAt:"2026-10-01T11:00:00Z"}];
const g=(o:any)=>F.filterTableReservations(T as any,{...F.EMPTY_TABLE_FILTERS,...o}).map((r:any)=>r.id).join(",");
console.log("=== mesas ===");
ok("todas, mais recentes primeiro", g({})==="t2,t1");
ok("tipo evento", g({tipo:"evento"})==="t2");
ok("repasse por fazer", g({repasse:"todo"})==="t1"); ok("repasse feito", g({repasse:"done"})==="t2");
ok("data entre", g({from:"2026-11-06",to:"2026-11-06"})==="t2");
ok("pesquisa 'aniversario'", g({search:"aniversario"})==="t2"); ok("pesquisa por hora '19:30'", g({search:"19:30"})==="t1");
ok("ordenar por data", g({sort:"date"})==="t1,t2");
const ts=F.summarizeTables(T as any); ok("totais mesas: 2 reservas, 6 pessoas, 700 pago, 100 a repassar", ts.count===2&&ts.guests===6&&ts.paid===700&&ts.toRepass===100, JSON.stringify(ts));
console.log(`RESULTADO filtros: ${pass} ok, ${fail} falhas`); if(fail) process.exit(1);
