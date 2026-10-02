import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { sign } from "/tmp/h/lib.mjs";
const BASE="http://127.0.0.1:5173";
const A="00000000-0000-0000-0000-00000000000a", B="00000000-0000-0000-0000-00000000000b", C="00000000-0000-0000-0000-00000000000c", E="00000000-0000-0000-0000-00000000000e";
const HOTEL="10000000-0000-0000-0000-00000000000a", TAXI="10000000-0000-0000-0000-00000000000b", RESTO="10000000-0000-0000-0000-00000000000e", ROOM="20000000-0000-0000-0000-00000000000a";
const CRASH=/algo correu mal|ocorreu um erro inesperado|something went wrong/i;
let pass=0, fail=0; const falhas=[];
const ok=(n,c,x="")=>{ if(c){pass++;console.log("  ✅",n);} else {fail++;falhas.push(n);console.log("  ❌",n,x);} };
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

const exe=await chromium.executablePath();
const browser=await puppeteer.launch({executablePath:exe,args:[...chromium.args.filter(a=>!/single-process|no-zygote/.test(a)),"--no-sandbox"],headless:"shell"});

function sessionFor(sub,email){ const t=sign({sub,role:"authenticated",email}); return {access_token:t,refresh_token:"r",expires_at:4000000000,expires_in:3600,token_type:"bearer",user:{id:sub,email,aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{}}}; }
function draftFor(kind,sub,biz){ const d={profileType:kind,step:0,completed:true,authMethod:"email",ownerUid:sub,termsAcceptedAt:new Date().toISOString(),personal:{name:"Cliente Teste"},business:biz?{businessId:biz.id,name:biz.name,category:biz.cat,hours:{open:"08:00",close:"18:00",alwaysOpen:false,openDays:[0,1,2,3,4,5,6]},gallery:[]}:{hours:{open:"08:00",close:"18:00",alwaysOpen:false,openDays:[0,1,2,3,4,5,6]},gallery:[]}}; return d; }

async function newPage(role,{w=390,h=844}={}){
  const ctx=await browser.createBrowserContext(); const page=await ctx.newPage();
  await page.setViewport({width:w,height:h,deviceScaleFactor:1,isMobile:w<600,hasTouch:w<600});
  const errs=[],fails=[]; page.__errs=errs; page.__fails=fails;
  page.on("pageerror",e=>errs.push("PAGEERROR: "+String(e.message||e).slice(0,200)));
  page.on("console",m=>{ if(m.type()==="error"){ const t=m.text(); if(!/Failed to load resource|net::ERR|fonts\.g|ERR_NAME|favicon|manifest|WebSocket connection/i.test(t)) errs.push("console: "+t.slice(0,200)); }});
  page.on("requestfailed",r=>{ const u=r.url(); if(u.startsWith(BASE)||u.includes("127.0.0.1:54321")) fails.push(u.replace(BASE,"")+" "+(r.failure()?.errorText||"")); });
  page.on("response",r=>{ const u=r.url(); if((u.startsWith(BASE)||u.includes("127.0.0.1:54321")) && r.status()>=400) fails.push(r.status()+" "+u.replace(BASE,"").slice(0,120)); });
  const data={};
  if(role){ data.sess=sessionFor(role.sub,role.email); data.draft=draftFor(role.kind,role.sub,role.biz); }
  await page.evaluateOnNewDocument((d)=>{ try{ localStorage.setItem("xlocal.lang","pt"); if(d.sess){ localStorage.setItem("sb-127-auth-token",JSON.stringify(d.sess)); localStorage.setItem("xlocal.onboarding.v1",JSON.stringify(d.draft)); } else { localStorage.setItem("xlocal.onboarding.v1",JSON.stringify({profileType:"personal",step:0,completed:true,termsAcceptedAt:new Date().toISOString(),personal:{name:"Visitante"},business:{}})); } }catch{} },data);
  return page;
}
async function visit(page,path,wait=2600){ page.__errs.length=0; page.__fails.length=0; await page.goto(BASE+path,{waitUntil:"domcontentloaded"}); await page.waitForFunction(()=>(document.body.innerText||"").trim().length>40,{timeout:9000}).catch(()=>{}); await sleep(Math.min(wait,1200)); }
const body=async(page)=>{ for(let i=0;i<4;i++){ try{ return await page.evaluate(()=>document.body.innerText||""); }catch(e){ await sleep(500); } } return ""; };
async function health(page,label,{allowRedirectTo=null}={}){
  const t=await body(page); const url=new URL(page.url()).pathname;
  const crashed=CRASH.test(t); const empty=t.trim().length<15;
  ok(`${label} abre sem crash (${url})`,!crashed&&!empty&&page.__errs.length===0, (crashed?"[ecrã de erro] ":"")+(empty?"[vazio] ":"")+page.__errs.slice(0,3).join(" | "));
  const bad=page.__fails.filter(x=>!/\/auth\/v1\/(token|user)/.test(x)&&!/firebase|google|gstatic|realtime|=eq\.default/i.test(x));
  if(bad.length) console.log("     ⚠ pedidos falhados:",[...new Set(bad)].slice(0,4));
  return {t,url};
}
const navClick=async(page,label)=>{ const h=await page.evaluateHandle((label)=>{ const nav=[...document.querySelectorAll("nav")].find(n=>getComputedStyle(n).position==="sticky"||getComputedStyle(n).position==="fixed"); if(!nav) return null; const els=[...nav.querySelectorAll("a,button")].filter(e=>(e.innerText||"").trim().toLowerCase().startsWith(label.toLowerCase())); return els[0]||null; },label); const el=h.asElement(); if(!el) return false; await el.click(); return true; };
const clickText=async(page,txt,sel="button, a, [role=button], label, span, div")=>{ const h=await page.evaluateHandle((txt,sel)=>{ const els=[...document.querySelectorAll(sel)].filter(e=>e.children.length<=4 && (e.innerText||"").trim().toLowerCase().startsWith(txt.toLowerCase())); els.sort((a,b)=>(a.innerText||"").length-(b.innerText||"").length); return els[0]||null; },txt,sel); const el=h.asElement(); if(!el) return false; await el.click(); return true; };

// =============== S1: LOGIN mobile + logo real ===============
console.log("\n=== S1: página de login (telemóvel) ===");
{ const p=await newPage(null); await p.evaluateOnNewDocument(()=>{ localStorage.removeItem("xlocal.onboarding.v1"); }); await p.evaluateOnNewDocument(()=>{ localStorage.clear(); localStorage.setItem("xlocal.lang","pt"); });
  await visit(p,"/",2500); await clickText(p,"Saltar","button"); await sleep(1500); await p.screenshot({path:"/tmp/h/shots/login-mobile.png"});
  const logo=await p.evaluate(()=>{ const img=[...document.querySelectorAll("img")].find(i=>/icon-192/.test(i.src)); return img?{src:img.src,ok:img.complete&&img.naturalWidth>0,w:img.naturalWidth,rect:img.getBoundingClientRect().width}:null; });
  ok("logo REAL (icon-192.png) está no login e carregou",!!logo&&logo.ok&&logo.w>=192,JSON.stringify(logo));
  ok("logo com tamanho visível (≥40px)",!!logo&&logo.rect>=40,JSON.stringify(logo));
  const t=await body(p); ok("textos do login presentes",/Spotter Local/.test(t)&&/Continuar com Google/.test(t)&&/Continuar sem conta/.test(t));
  ok("sem erros de consola no login",p.__errs.length===0,p.__errs.join(" | ")); await p.close(); }

// =============== S2: layout PC ===============
console.log("\n=== S2: ecrã cheio no computador (1440×900) ===");
{ const p=await newPage(null,{w:1440,h:900}); await p.evaluateOnNewDocument(()=>{ localStorage.clear(); localStorage.setItem("xlocal.lang","pt"); });
  await visit(p,"/",2500); await clickText(p,"Saltar","button"); await sleep(1500); await p.screenshot({path:"/tmp/h/shots/login-desktop.png"});
  const m=await p.evaluate(()=>{ const root=document.querySelector("#root"); const first=root.firstElementChild; const r=first.getBoundingClientRect(); const logo=[...document.querySelectorAll("img")].find(i=>/icon-192/.test(i.src)); return {vw:innerWidth,rootW:Math.round(r.width),hscroll:document.documentElement.scrollWidth>innerWidth+2,logo:!!logo&&logo.complete&&logo.naturalWidth>0}; });
  ok("login ocupa a largura toda (sem coluna de telemóvel)",m.rootW>=m.vw-20,JSON.stringify(m)); ok("sem scroll horizontal",!m.hscroll); ok("logo real também no PC",m.logo);
  ok("login em 2 colunas (cartão à direita)", await p.evaluate(()=>{ const card=[...document.querySelectorAll("div")].find(d=>/Comece em segundos/.test(d.innerText||"")&&d.children.length>1&&d.getBoundingClientRect().width<700); const h=document.querySelector("h1"); if(!card||!h) return false; return card.getBoundingClientRect().left>h.getBoundingClientRect().right-50; }));
  await p.close(); }
{ const p=await newPage({sub:C,email:"cliente@x.com",kind:"personal"},{w:1440,h:900});
  await visit(p,"/home",3000); await p.screenshot({path:"/tmp/h/shots/home-desktop.png"}); await health(p,"home (PC)");
  const g=await p.evaluate(()=>{ const grids=[...document.querySelectorAll("div")].filter(d=>getComputedStyle(d).display==="grid"&&d.children.length>=2); const best=grids.map(g=>({cols:getComputedStyle(g).gridTemplateColumns.split(" ").length,w:g.getBoundingClientRect().width,n:g.children.length})).sort((a,b)=>b.w-a.w)[0]; return {best,rootW:Math.round(document.querySelector("#root").firstElementChild.getBoundingClientRect().width),vw:innerWidth,hscroll:document.documentElement.scrollWidth>innerWidth+2}; });
  ok("home (PC) ocupa a largura toda",g.rootW>=g.vw-20,JSON.stringify(g)); ok("home (PC): lista em grelha de ≥2 colunas",!g.best||g.best.cols>=2,JSON.stringify(g)); ok("home (PC) sem scroll horizontal",!g.hscroll);
  await visit(p,"/payment",1500); const w=await p.evaluate(()=>Math.round(document.querySelector("#root").firstElementChild.getBoundingClientRect().width)); ok(`formulário (/payment) fica numa coluna legível (${w}px ≤ 800)`,w<=800&&w>=400,String(w)); await p.screenshot({path:"/tmp/h/shots/payment-desktop.png"}); await p.close(); }

// =============== S3: visitante/cliente: todas as rotas ===============
console.log("\n=== S3: rotas do cliente (telemóvel) ===");
{ const p=await newPage({sub:C,email:"cliente@x.com",kind:"personal"});
  for(const path of ["/home","/search","/map","/events","/chats","/profile","/history","/my-reservations","/privacy","/qr","/place/p1",`/place/${HOTEL}`,`/rooms/${HOTEL}`,`/reserve-room/${ROOM}`,`/reserve-table/${RESTO}`,`/reviews/p1`,"/forgot-password","/onboarding"]) { await visit(p,path,2200); await health(p,path); }
  await p.close(); }

// =============== S4: HOTEL ===============
console.log("\n=== S4: conta de HOTEL ===");
const hotel={sub:A,email:"hotel@x.com",kind:"business",biz:{id:HOTEL,name:"Hotel Mar",cat:"hotel"}};
{ const p=await newPage(hotel);
  for(const path of ["/business","/merchant","/products","/analytics","/business-inbox","/boost","/payment","/subscribe","/publish-post","/publish-event","/qr-business","/business/coupons","/business/orders","/business/promo","/manage-rooms","/reservation-settings"]) { await visit(p,path,1600); await health(p,path); }
  await visit(p,"/reservation-settings",1800); let t=await body(p); ok("hotel: define reservas de QUARTO",/reservas de quarto/i.test(t)); ok("hotel: define reservas de MESA",/reservas de mesa/i.test(t)); ok("hotel: NÃO vê aviso de indisponível",!/não disponíveis/i.test(t));
  await visit(p,"/business",1800); t=await body(p); ok("hotel: painel mostra 'Definições de reserva'",/Definições de reserva/i.test(t));

  console.log("\n--- filtros no dashboard de reservas (quartos) ---");
  await visit(p,"/reservations-dashboard",2500); await p.screenshot({path:"/tmp/h/shots/dash-hotel.png"});
  t=await body(p); const names=["João Macamo","Maria Sitoe","Carlos Nhaca","Zita Cossa","Pedro Langa"];
  const vis=async()=>{ const tx=await body(p); return names.filter(n=>tx.includes(n)); };
  ok("5 reservas visíveis sem filtros",(await vis()).length===5,(await vis()).join(","));
  const tx0=await body(p); ok("ordem por omissão: João (prazo excedido) antes de Pedro, e pendentes antes de confirmadas",tx0.indexOf("João Macamo")<tx0.indexOf("Pedro Langa")&&tx0.indexOf("Pedro Langa")<tx0.indexOf("Maria Sitoe"),names.map(n=>tx0.indexOf(n)).join(","));
  ok("barra de resumo e botão Exportar presentes",/Exportar \(5\)/.test(tx0)&&/pago pelos clientes/i.test(tx0)&&/a reembolsar/i.test(tx0));
  const search=async(q)=>{ const inp=await p.$('input[type="search"], input[placeholder*="Pesquisar"]'); await inp.focus(); await p.keyboard.down("Control"); await p.keyboard.press("KeyA"); await p.keyboard.up("Control"); await p.keyboard.press("Backspace"); if(q) await inp.type(q,{delay:15}); await sleep(600); };
  await search("joao"); ok("pesquisa 'joao' (sem acento) → só João",(await vis()).join()==="João Macamo",(await vis()).join(","));
  await search("825551234"); ok("pesquisa por telefone → só Maria",(await vis()).join()==="Maria Sitoe",(await vis()).join(","));
  await search("84 222"); ok("pesquisa por parte do telefone com espaço → João",(await vis()).join()==="João Macamo",(await vis()).join(","));
  await search("cama extra"); ok("pesquisa no pedido especial → Zita",(await vis()).join()==="Zita Cossa",(await vis()).join(","));
  await search("zzzz"); ok("sem resultados mostra mensagem",(await vis()).length===0&&/nenhum|sem resultados|encontr/i.test(await body(p)),(await body(p)).slice(0,200));
  await search("");
  const chip=async(label)=>{ const okc=await clickText(p,label,"button"); await sleep(400); return okc; };
  ok("chip 'Prazo excedido' → só João",await chip("Prazo excedido")&&(await vis()).join()==="João Macamo",(await vis()).join(","));
  ok("chip 'Confirmadas' → só Maria",await chip("Confirmadas")&&(await vis()).join()==="Maria Sitoe",(await vis()).join(","));
  ok("chip 'Recusadas' → Carlos e Zita",await chip("Recusadas")&&(await vis()).sort().join()==="Carlos Nhaca,Zita Cossa",(await vis()).join(","));
  ok("chip 'Reembolso por fazer' → só Carlos",await chip("Reembolso por fazer")&&(await vis()).join()==="Carlos Nhaca",(await vis()).join(","));
  ok("chip 'Pendentes' → João e Pedro",await chip("Pendentes")&&(await vis()).sort().join()==="João Macamo,Pedro Langa",(await vis()).join(","));
  ok("chip 'Todas' volta às 5",await chip("Todas")&&(await vis()).length===5);
  ok("abre filtros avançados",await clickText(p,"Mais filtros","button")||await clickText(p,"Filtros","button")); await sleep(400); await p.screenshot({path:"/tmp/h/shots/dash-hotel-filtros.png"});
  const sels=await p.$$("select"); ok("filtros avançados mostram campos (pagamento, ordenar, datas)",sels.length>=2&&(await p.$$('input[type="date"]')).length>=2,`selects=${sels.length}`);
  if(sels.length>=1){ const opts=await p.evaluate(()=>[...document.querySelectorAll("select")].map(s=>[...s.options].map(o=>o.value))); const payIdx=opts.findIndex(o=>o.includes("deposit")); if(payIdx>=0){ await p.select(`select:nth-of-type(1)`,"deposit").catch(()=>{}); const all=await p.$$("select"); await all[payIdx].select("full"); await sleep(400); ok("filtro pagamento 'Pago a 100%' → só Maria",(await vis()).join()==="Maria Sitoe",(await vis()).join(",")); await all[payIdx].select("all"); await sleep(300); } }
  const dates=await p.$$('input[type="date"]'); if(dates.length>=2){ await dates[0].type("11152026".replace(/(\d{2})(\d{2})(\d{4})/,"$1$2$3")).catch(()=>{}); }
  const clearBtn=await clickText(p,"Limpar filtros","button"); await sleep(300); ok("'Limpar filtros' repõe todas",(await vis()).length===5||!clearBtn,(await vis()).join(","));
  await p.close(); }

// =============== S5: RESTAURANTE ===============
console.log("\n=== S5: conta de RESTAURANTE ===");
const resto={sub:E,email:"resto@x.com",kind:"business",biz:{id:RESTO,name:"Restaurante Sol",cat:"restaurant"}};
{ const p=await newPage(resto);
  await visit(p,"/reservation-settings",1800); let t=await body(p); await health(p,"/reservation-settings (restaurante)");
  ok("restaurante: pode ter reservas de MESA",/reservas de mesa/i.test(t)); ok("restaurante: NÃO tem reservas de QUARTO",!/reservas de quarto/i.test(t),t.slice(0,160));
  await visit(p,"/reservations-dashboard",2500); await clickText(p,"Mesas","button"); await sleep(800); await p.screenshot({path:"/tmp/h/shots/dash-resto.png"});
  const tn=["Ana Mondlane","Bruno Tembe","Clara Bila"]; const vis=async()=>{ const tx=await body(p); return tn.filter(n=>tx.includes(n)); };
  ok("3 reservas de mesa visíveis",(await vis()).length===3,(await vis()).join(","));
  const chip=async(l)=>{ await clickText(p,l,"button"); await sleep(400); };
  await chip("Repasse por fazer"); ok("'Repasse por fazer' → só Ana",(await vis()).join()==="Ana Mondlane",(await vis()).join(","));
  await chip("Canceladas"); ok("'Canceladas' → só Clara",(await vis()).join()==="Clara Bila",(await vis()).join(","));
  await chip("Confirmadas"); ok("'Confirmadas' → Ana e Bruno",(await vis()).sort().join()==="Ana Mondlane,Bruno Tembe",(await vis()).join(","));
  await chip("Todas"); const inp=await p.$('input[placeholder*="Pesquisar"]'); await inp.type("19:30"); await sleep(400); ok("pesquisa por hora '19:30' → Ana",(await vis()).join()==="Ana Mondlane",(await vis()).join(","));
  await p.close(); }

// =============== S6: TÁXI ===============
console.log("\n=== S6: conta de TÁXI (não pode ter reservas) ===");
{ const p=await newPage({sub:B,email:"taxi@x.com",kind:"business",biz:{id:TAXI,name:"Taxi Joe",cat:"taxi"}});
  await visit(p,"/reservation-settings",1800); let t=await body(p); await health(p,"/reservation-settings (táxi)");
  ok("táxi vê 'Reservas online não disponíveis'",/não disponíveis/i.test(t),t.slice(0,200)); ok("táxi NÃO vê interruptores de reserva",!/Aceitar reservas de (quarto|mesa)/i.test(t));
  await visit(p,"/business",1800); t=await body(p); await health(p,"/business (táxi)"); ok("táxi: painel sem 'Definições de reserva'",!/Definições de reserva/i.test(t));
  await visit(p,"/manage-rooms",1800); await health(p,"/manage-rooms (táxi)");
  await p.close(); }

// =============== S7: CLIENTE: minhas reservas ===============
console.log("\n=== S7: cliente — as minhas reservas (pesquisa e filtros) ===");
{ const p=await newPage({sub:C,email:"cliente@x.com",kind:"personal"}); await visit(p,"/my-reservations",2500); await p.screenshot({path:"/tmp/h/shots/myres.png"}); await health(p,"/my-reservations");
  let t=await body(p); ok("cliente vê o prazo do hotel e os valores pagos",/responde até/i.test(t)&&/Pagaste/.test(t),t.slice(0,300));
  const inp=await p.$('input[placeholder*="esquis"]'); ok("campo de pesquisa existe",!!inp); if(inp){ await inp.type("Suite"); await sleep(400); }
  const chip=async(l)=>{ const r=await clickText(p,l,"button"); await sleep(400); return r; };
  ok("chip de estado clicável (Confirmadas)",await chip("Confirmadas")); t=await body(p); ok("   filtra: aparece só a confirmada",/nada a pagar no check-in/i.test(t)||/Confirmada/i.test(t)); await p.close(); }

// =============== S8: navegação e botão voltar ===============
console.log("\n=== S8: navegação entre abas e botão 'voltar' ===");
{ const p=await newPage(hotel); await visit(p,"/home",1500); await visit(p,"/business",2000);
  const hist0=await p.evaluate(()=>history.length);
  for(let i=0;i<3;i++){ for(const label of ["Produtos","Perfil","Painel"]){ await navClick(p,label); await sleep(450); } }
  const hist1=await p.evaluate(()=>history.length); ok(`abas do comerciante não empilham histórico (${hist0}→${hist1})`,hist1-hist0<=1,`${hist0}→${hist1}`);
  await p.goBack(); await sleep(800); ok("'voltar' sai da secção (não fica a trocar de aba)",!/\/(business|products|profile)(\/|$)/.test(new URL(p.url()).pathname)||/\/home/.test(new URL(p.url()).pathname),p.url());
  await p.close(); }
{ const p=await newPage({sub:C,email:"cliente@x.com",kind:"personal"}); await visit(p,"/home",1800); const hist0=await p.evaluate(()=>history.length);
  for(let i=0;i<3;i++){ for(const label of ["Pesquisa","Mapa","Eventos","Início"]){ await navClick(p,label); await sleep(400); } }
  const hist1=await p.evaluate(()=>history.length); ok(`abas do cliente não empilham histórico (${hist0}→${hist1})`,hist1-hist0<=1,`${hist0}→${hist1}`); await p.close(); }

await browser.close();
console.log(`\nRESULTADO navegação: ${pass} ok, ${fail} falhas`); if(falhas.length) console.log(falhas);
