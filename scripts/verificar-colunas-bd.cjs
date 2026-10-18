// Verifica se TODAS as tabelas/colunas que o código usa (supabase.from(...)) existem nos ficheiros SQL.
// Correr na raiz do projeto: npm run check:db
const ts = require("typescript");
const fs = require("fs"), path = require("path");
const ROOT = process.cwd(); // correr na raiz do projeto
const walk = (d, out=[]) => { for (const f of fs.readdirSync(d)) { const p = path.join(d,f); const s = fs.statSync(p); if (s.isDirectory()) { if (!/node_modules|dist/.test(f)) walk(p,out);} else if (/\.(ts|tsx)$/.test(f) && !/routeTree|\.d\.ts/.test(f)) out.push(p);} return out; };
const files = [...walk(ROOT+"/src"), ...walk(ROOT+"/supabase/functions")];

// ---------- SQL: tabelas e colunas ----------
const sqlFiles = [ROOT+"/SUPABASE_SETUP.sql", ...fs.readdirSync(ROOT+"/supabase/migrations").sort().map(f=>ROOT+"/supabase/migrations/"+f)];
const cols = {}; // table -> Set
const addCol = (t,c)=>{ (cols[t] ||= new Set()).add(c.replace(/"/g,"").toLowerCase()); };
const NOT_COL = /^(constraint|primary|foreign|unique|check|exclude|like)$/i;
for (const f of sqlFiles) {
  let sql = fs.readFileSync(f,"utf8").replace(/--[^\n]*/g,"");
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_]+)"?\s*\(/gi; let m;
  while ((m = re.exec(sql))) {
    let i = re.lastIndex, depth = 1, start = i;
    while (i < sql.length && depth>0) { const ch = sql[i]; if (ch==="(") depth++; else if (ch===")") depth--; i++; }
    const body = sql.slice(start, i-1); let d=0, cur="", parts=[];
    for (const ch of body) { if (ch==="(") d++; if (ch===")") d--; if (ch==="," && d===0) { parts.push(cur); cur=""; } else cur+=ch; }
    parts.push(cur);
    for (const p of parts) { const tok = p.trim().split(/\s+/)[0]; if (tok && !NOT_COL.test(tok)) addCol(m[1].toLowerCase(), tok); }
  }
  const re2 = /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:public\.)?"?([a-z_]+)"?\s+([^;]*);/gi;
  while ((m = re2.exec(sql))) { const t=m[1].toLowerCase(); const re3=/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_0-9]+)"?/gi; let k; while((k=re3.exec(m[2]))) addCol(t,k[1]); 
     const re4=/rename\s+column\s+"?([a-z_0-9]+)"?\s+to\s+"?([a-z_0-9]+)"?/gi; while((k=re4.exec(m[2]))) addCol(t,k[2]); }
}
// views
const setup = fs.readFileSync(ROOT+"/SUPABASE_SETUP.sql","utf8");
const vm = /create\s+(?:or\s+replace\s+)?view\s+public\.([a-z_]+)[^;]*?as\s+select([\s\S]*?)from\s/i.exec(setup);
const views = {};
if (vm) { views[vm[1]] = vm[2].split(",").map(s=>s.trim().split(/\s+as\s+|\./i).pop().replace(/[^a-z_0-9]/gi,"").toLowerCase()).filter(Boolean); }

// ---------- Código: colunas usadas ----------
const used = {}; // table -> Map(col -> Set(file:line))
const use = (t,c,loc)=>{ if(!c) return; c=c.trim(); if(!/^[a-z_][a-z_0-9]*$/.test(c)) return; ((used[t] ||= new Map()).get(c) || (used[t].set(c,new Set()), used[t].get(c))).add(loc); };
const parseSelect = (s)=>{ const out=[]; let d=0,cur=""; for(const ch of s){ if(ch==="(")d++; if(ch===")")d--; if(ch==="," && d===0){out.push(cur);cur="";} else cur+=ch;} out.push(cur); return out.map(x=>x.trim()).filter(Boolean).map(x=>{ if (x.includes("(")) return null; x=x.replace(/^[a-z_]+:/i,""); x=x.replace(/::.*$/,""); return x==="*"?null:x; }).filter(Boolean); };
const strLit = n => n && (ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : (n && ts.isTemplateExpression(n) ? n.head.text+"…" : null);
const FILTERS = new Set(["eq","neq","gt","gte","lt","lte","like","ilike","is","in","contains","order","not","match"]);
for (const f of files) {
  const text = fs.readFileSync(f,"utf8"); const sf = ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true, f.endsWith("x")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const rel = path.relative(ROOT,f);
  const locOf = n => rel+":"+(sf.getLineAndCharacterOfPosition(n.getStart()).line+1);
  const objKeys = (arg, fnode) => {
    const scopeRoot = (()=>{ let p=arg; while(p && !(ts.isFunctionDeclaration(p)||ts.isArrowFunction(p)||ts.isFunctionExpression(p)||ts.isMethodDeclaration(p))) p=p.parent; return p||sf; })(); const keys=[]; const fromObj=o=>{ for(const p of o.properties){ if(ts.isPropertyAssignment(p)||ts.isShorthandPropertyAssignment(p)){ const nm=p.name.getText().replace(/['"]/g,""); keys.push(nm);} } };
    if (!arg) return keys;
    if (ts.isObjectLiteralExpression(arg)) fromObj(arg);
    else if (ts.isArrayLiteralExpression(arg)) arg.elements.forEach(e=>ts.isObjectLiteralExpression(e)&&fromObj(e));
    else if (ts.isIdentifier(arg)) { const name=arg.text; const visit=n=>{ if(ts.isVariableDeclaration(n)&&n.name.getText()===name&&n.initializer&&ts.isObjectLiteralExpression(n.initializer)) fromObj(n.initializer);
        if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(n.left)&&n.left.expression.getText()===name) keys.push(n.left.name.text);
        if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isElementAccessExpression(n.left)&&n.left.expression.getText()===name&&ts.isStringLiteral(n.left.argumentExpression)) keys.push(n.left.argumentExpression.text);
        ts.forEachChild(n,visit);}; visit(scopeRoot); }
    return keys; };
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text==="from") {
      const t = strLit(node.arguments[0]);
      if (t && !/^spotter-/.test(t) && node.expression.expression.getText().match(/supabase|client|sb|admin|db/i)) {
        let cur = node; 
        while (cur.parent && ts.isPropertyAccessExpression(cur.parent) && cur.parent.parent && ts.isCallExpression(cur.parent.parent)) {
          cur = cur.parent.parent; const m = cur.expression.name.text; const a0 = cur.arguments[0];
          if (m==="select") { const s = strLit(a0); if (s) parseSelect(s).forEach(c=>use(t,c,locOf(cur))); }
          else if (FILTERS.has(m)) { const c = strLit(a0); if (c) use(t,c.split(".")[0],locOf(cur)); }
          else if (m==="or") { const s = strLit(a0); if (s) s.split(",").forEach(p=>use(t,p.split(".")[0].replace(/[()]/g,""),locOf(cur))); }
          else if (["insert","update","upsert"].includes(m)) objKeys(a0).forEach(k=>use(t,k,locOf(cur)));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
// ---------- Relatório ----------
const known = new Set(Object.keys(cols));
let problems = 0;
for (const t of Object.keys(used).sort()) {
  const have = cols[t] || new Set(views[t]||[]);
  const isView = !!views[t];
  if (!cols[t] && !isView) { console.log(`\n❌ TABELA SEM SQL: ${t}`); problems++; continue; }
  const missing = [...used[t].keys()].filter(c=>!have.has(c.toLowerCase()));
  console.log(`\n${missing.length?"⚠️ ":"✅"} ${t}${isView?" (view)":""}  [${used[t].size} colunas usadas, ${have.size} no SQL]`);
  for (const c of missing) { problems++; console.log(`     FALTA coluna "${c}"  ← ${[...used[t].get(c)].slice(0,3).join(" , ")}`); }
}
console.log(`\nTOTAL de problemas: ${problems}`);
process.exit(problems ? 1 : 0);
