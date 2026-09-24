const fs=require('fs');
const vm=require('vm');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');

const core=read('v7033-core.js');
const app=read('app.js');
const runtime=read('runtime-v7.03.3.14u.js');
const evidenceEngine=read('modules/parser-evidence-engine.js');
const parserModule=read('modules/parser-table.js');
const groupModule=read('modules/grouped-company-ui.js');
const backupUiModule=read('modules/backup-verification-ui.js');
const parser=read('parser-v7-core.js');
const index=read('index.html');
const backupSql=read('supabase-v7-03-3-14t-backup-verification.sql');
const backupScript=read('scripts/verify-backups.mjs');
const backupWorkflow=read('.github/workflows/backup-verification.yml');
const setupDoc=read('BACKUP_VERIFICATION_SETUP-v7.03.3.14t.md');
const accuracyFixtures=JSON.parse(read('tests/parser-accuracy-fixtures-v7.03.3.14u.json'));

new Function(core);new Function(app);new Function(runtime);new Function(evidenceEngine);new Function(parserModule);new Function(groupModule);new Function(backupUiModule);new Function(parser);

const ctx={console,setTimeout,clearTimeout,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);vm.runInContext(core,ctx,{filename:'v7033-core.js'});
const api=ctx.V7033Patch;assert(api,'V7033Patch did not initialise');
const suites={
  behavioral:api.runRegressionChecks(),
  golden:api.runHistoricalRegressionChecks(),
  quality14n:api.runQualityRegressionChecks14n(),
  holdout14n:api.runHoldoutRegressionChecks14n(),
  intelligence14o:api.runIntelligenceRegressionChecks14o(),
  aerospace14p:api.runAerospaceRegressionChecks14p(),
  monetary14q:api.runMonetaryConsensusRegressionChecks14q(),
  headerAligned14r:api.runHeaderAlignedMoneyRegressionChecks14r()
};
for(const [name,result] of Object.entries(suites)){
  console.log(name+': '+result.cases.filter(x=>x.pass).length+'/'+result.cases.length+' PASS');
  assert(result.ok,name+' regression suite failed: '+(result.failures||[]).join(', '));
}
const total=Object.values(suites).reduce((n,r)=>n+r.cases.length,0),passed=Object.values(suites).reduce((n,r)=>n+r.cases.filter(x=>x.pass).length,0);
assert(total===77&&passed===77,'Expected 77/77 core regression checks, got '+passed+'/'+total);

// 14u: historical source excerpts are now checked field-by-field, not just by broad case predicates.
const historicalExpectations={
  'avs-320-vin17-049472':[{sku:'AVS-320',quantity:2,unit_price:350,amount:700}],
  'aerospace-2022':[{sku:'PT-VW540',quantity:1,unit_price:804,amount:804},{sku:'AVS320',quantity:1,unit_price:350,amount:350}],
  'loud-pga58-00215542':[{sku:'PGA58-LC',quantity:10,unit_price:64.69,amount:646.90}],
  'loud-mixed-00215840':[{sku:'U35C',quantity:4,unit_price:340,amount:1360},{sku:'SLXD2+',quantity:1,unit_price:480,amount:480},{sku:'AT-2',quantity:1,unit_price:270,amount:270},{sku:'U3',quantity:4,unit_price:275,amount:1100}],
  'jny-rds-2021':[{sku:'PT-TW381R',quantity:1,unit_price:4820,amount:4820}],
  'seminar-room-2021':[{sku:'PT-VW540',quantity:2,unit_price:707,amount:1414},{sku:'SPS-1100',quantity:2,unit_price:90,amount:180}],
  'hawko-av-cart-2021':[{sku:'ZS6HKOAV-EB97E',quantity:2,unit_price:550,amount:1100,recovered:true}]
};
let historicalFields=0,historicalFieldsPassed=0;
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=.01;
for(const hc of suites.golden.cases){
  const expected=historicalExpectations[hc.id]||[];
  const actualRows=hc.id==='hawko-av-cart-2021'?(hc.actual?.recovered||[]):(hc.actual?.items||[]);
  for(const ex of expected){
    const row=actualRows.find(r=>String(r.sku||'').replace(/[^A-Z0-9]+/gi,'').toUpperCase()===String(ex.sku).replace(/[^A-Z0-9]+/gi,'').toUpperCase());
    for(const field of ['sku','quantity','unit_price','amount']){
      historicalFields++;
      const ok=!!row&&(field==='sku'?String(row.sku||'').replace(/[^A-Z0-9]+/gi,'').toUpperCase()===String(ex.sku).replace(/[^A-Z0-9]+/gi,'').toUpperCase():near(row[field],ex[field]));
      if(ok)historicalFieldsPassed++;
      else throw new Error('Historical field accuracy failed: '+hc.id+' '+ex.sku+' '+field+' expected '+ex[field]+' got '+(row?.[field]??'missing'));
    }
  }
}
console.log('historical-field-accuracy: '+historicalFieldsPassed+'/'+historicalFields+' PASS (source excerpts, not raw-PDF OCR)');

const cv=(core.match(/const VERSION='([^']+)'/)||[])[1],av=(app.match(/const VERSION='([^']+)'/)||[])[1],iv=(index.match(/releaseCurrentVersion">v([^<]+)/)||[])[1],uv=(index.match(/releaseUpcomingVersion">v([^<]+)/)||[])[1];
assert(cv==='7.03.3.14u','Core version must be 7.03.3.14u');
assert(av===cv,'App/core version mismatch: '+av+' vs '+cv);
assert(iv===cv,'Index/core version mismatch: '+iv+' vs '+cv);
assert(uv==='7.03.3.14v','Upcoming version must be 7.03.3.14v');

for(const bad of ['replaceOnce(','src.replace(','new Blob([src]','raw.githubusercontent.com','baseline-v6.55-d452']){
  assert(!runtime.includes(bad),'Direct runtime contains retired compatibility mechanism: '+bad);
}
assert(runtime.includes('InventoryHubParserEvidenceEngine'),'Direct runtime does not use parser evidence engine');
assert(runtime.includes('InventoryHubParserTable.parseHeaderAlignedLayout'),'Direct runtime does not call parser module');
assert(runtime.includes('InventoryHubGroupedCompanyUI.renderGroupedCompanyCards'),'Direct runtime does not call grouped UI module');
assert(runtime.includes('InventoryHubBackupVerificationUI'),'Direct runtime does not call backup UI module');
assert(runtime.includes('admin_backup_verification_history_v703314t'),'Admin backup history RPC is not staged');
assert(runtime.includes("currentRole()==='admin'"),'Backup history is not visibly admin-gated in the runtime');
assert(runtime.includes("__AV_DIRECT_RUNTIME_LOADED__='7.03.3.14u'"),'14u direct runtime load sentinel missing');
assert(!runtime.includes('SUPABASE_SECRET_KEY')&&!runtime.includes('SUPABASE_ACCESS_TOKEN'),'Server backup secrets leaked into browser runtime');

assert(app.includes('modules/parser-evidence-engine.js')&&app.includes('modules/parser-table.js')&&app.includes('modules/grouped-company-ui.js')&&app.includes('modules/backup-verification-ui.js')&&app.includes('runtime-v7.03.3.14u.js'),'14u bootstrap direct module references missing');
assert(!app.includes('runtime-v7.03.3.14t.js')&&!app.includes('runtime-v7.03.3.14s.js')&&!app.includes('baseline-v6.55-d452'),'14u bootstrap still references an older runtime/baseline');
assert(fs.existsSync('runtime-v7.03.3.14t.js')&&fs.existsSync('runtime-v7.03.3.14s.js')&&fs.existsSync('runtime-v7.03.3.14r.js')&&fs.existsSync('baseline-v6.55-d452.js'),'Rollback references must remain available');

const mctx={console,Number,String,Array,Object,Set,Map,RegExp,Math};mctx.globalThis=mctx;mctx.window=mctx;vm.createContext(mctx);vm.runInContext(evidenceEngine,mctx,{filename:'modules/parser-evidence-engine.js'});vm.runInContext(parserModule,mctx,{filename:'modules/parser-table.js'});
const layout=[{yTolerance:3,rows:[
 {y:100,text:'PRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT',items:[{text:'PRODUCT',x:50,width:80},{text:'DESCRIPTION',x:190,width:120},{text:'QUANTITY',x:480,width:40},{text:'PRICE',x:590,width:40},{text:'AMOUNT',x:700,width:40}]},
 {y:130,text:'AVS-320A Abtus AVS320 HDMI Control panel 1 350.00 350.00',items:[{text:'AVS-320A',x:55,width:75},{text:'Abtus AVS320 HDMI Control panel',x:190,width:230},{text:'1 350.00 350.00',x:450,width:320}]},
 {y:160,text:'60100-SALES Abtus Active Speaker in pair 1 90.00 90.00',items:[{text:'60100-SALES',x:55,width:90},{text:'Abtus Active Speaker in pair',x:190,width:220},{text:'1 90.00 90.00',x:450,width:320}]},
 {y:190,text:'60200-INSTALLATION Installation work including 1 530.00 530.00',items:[{text:'60200-INSTALLATION',x:55,width:120},{text:'Installation work including',x:190,width:220},{text:'1 530.00 530.00',x:450,width:320}]},
 {y:230,text:'SUBTOTAL 1774.00',items:[{text:'SUBTOTAL',x:570,width:70},{text:'1774.00',x:700,width:50}]}
]}];
const rows=mctx.InventoryHubParserTable.parseHeaderAlignedLayout({pdfLayout:layout,sourceText:'Aerospace',resolveEconomics:(items,cols)=>api.v703314rResolveEconomicsFromItems(items,cols),cleanInventoryDescription:v=>String(v||'').trim(),cleanVerifiedSku:v=>String(v||'').trim(),normalizeParsedInvoiceItem:x=>({...x}),isServiceLine:x=>/installation/i.test([x.sku,x.item_name,x.description].join(' '))});
assert(rows.length===2&&rows.some(x=>x.unit_price===350&&x.amount===350)&&rows.some(x=>x.unit_price===90&&x.amount===90)&&!rows.some(x=>/installation/i.test(x.sku||'')),'Parser module Aerospace-layout regression failed');

// 14u field-level parser accuracy suite. Every expected field is exact/tolerance-checked;
// negative fixtures must produce zero rows instead of a plausible invented line.
let fixtureCasesPassed=0,fixtureFields=0,fixtureFieldsPassed=0;
for(const fx of accuracyFixtures.cases){
  const got=mctx.InventoryHubParserTable.parseHeaderAlignedLayout({
    pdfLayout:fx.layout,sourceText:fx.sourceText||'',
    resolveEconomics:(items,cols)=>api.v703314rResolveEconomicsFromItems(items,cols),
    cleanInventoryDescription:v=>String(v||'').trim(),
    cleanVerifiedSku:v=>String(v||'').trim(),
    normalizeParsedInvoiceItem:x=>({...x}),
    isServiceLine:x=>api.v703312jIsServiceRow(x)
  });
  assert(got.length===fx.expected.length,'Accuracy fixture '+fx.id+' row count expected '+fx.expected.length+' got '+got.length);
  let caseOk=true;
  for(let i=0;i<fx.expected.length;i++){
    const ex=fx.expected[i],row=got[i];
    const checks=[
      ['sku',String(row?.sku||'')===String(ex.sku||'')],
      ['nameIncludes',!ex.nameIncludes||String(row?.item_name||'').includes(ex.nameIncludes)],
      ['quantity',near(row?.quantity,ex.quantity)],
      ['unit_price',near(row?.unit_price,ex.unit_price)],
      ['amount',near(row?.amount,ex.amount)]
    ];
    if(ex.warranty!==undefined)checks.push(['warranty',String(row?.warranty||'')===String(ex.warranty)]);
    for(const [field,ok] of checks){fixtureFields++;if(ok)fixtureFieldsPassed++;else{caseOk=false;throw new Error('Accuracy fixture '+fx.id+' '+field+' failed: '+JSON.stringify(row));}}
    const inv=mctx.InventoryHubParserEvidenceEngine.verifyEconomics(row);
    assert(inv.ok,'Accuracy fixture '+fx.id+' violates economic invariant');
  }
  if(caseOk)fixtureCasesPassed++;
}
assert(fixtureCasesPassed===accuracyFixtures.cases.length,'Not all parser accuracy fixtures passed');
console.log('parser-accuracy-fixtures: '+fixtureCasesPassed+'/'+accuracyFixtures.cases.length+' cases, '+fixtureFieldsPassed+'/'+fixtureFields+' fields PASS');

const evidenceRanking=mctx.InventoryHubParserEvidenceEngine.rankCandidateSets([
  {origin:'verified-layout',items:[{sku:'U35C',item_name:'Wireless System',quantity:4,unit_price:340,amount:1360,layoutEvidenceVerified:true,economicEvidenceVerified:true}]},
  {origin:'plausible-but-wrong',items:[{sku:'U35C',item_name:'Wireless System',quantity:4,unit_price:1360,amount:340,layoutEvidenceVerified:true}]},
  {origin:'service-contaminated',items:[{sku:'U35C',item_name:'Wireless System',quantity:4,unit_price:340,amount:1360},{sku:'DEL',item_name:'Delivery Fee',quantity:1,unit_price:50,amount:50,classification:{type:'service'}}]}
],{subtotal:1360});
assert(evidenceRanking.best?.origin==='verified-layout','Evidence engine selected a weaker or contaminated candidate');
console.log('evidence-ranking: verified candidate selected PASS');

vm.runInContext(groupModule,mctx,{filename:'modules/grouped-company-ui.js'});
const host={innerHTML:'',querySelectorAll(){return[];}};
const groups=new Map([['AV Media Pte Ltd',[{html:'<tr></tr>'},{html:'<tr></tr>'}]],['Loud Technologies Asia Pte Ltd',[{html:'<tr></tr>'}]]]);
assert(mctx.InventoryHubGroupedCompanyUI.renderGroupedCompanyCards({host,groups,head:'<thead></thead>',escapeHtml:v=>String(v)}),'Grouped-company module returned false');
assert(/v669-doc-group-body hidden/.test(host.innerHTML)&&/2 items ▸/.test(host.innerHTML),'Grouped-company module output regression failed');

assert(backupUiModule.includes("version:'7.03.3.14t'"),'Backup UI version marker missing');
assert(backupUiModule.includes("String(role).toLowerCase()==='admin'"),'Backup UI is not admin-only');
assert(backupUiModule.includes('backupVerificationCard')&&backupUiModule.includes('backupVerificationDialog'),'Backup UI elements are missing');
assert(!backupUiModule.includes('SUPABASE_SECRET_KEY')&&!backupUiModule.includes('SUPABASE_ACCESS_TOKEN'),'Backup UI contains server secret names');

for(const marker of [
  'create table if not exists public.backup_verification_runs',
  'service_backup_integrity_snapshot_v703314t',
  'service_record_backup_verification_v703314t',
  'admin_backup_verification_history_v703314t',
  "grant execute on function public.service_backup_integrity_snapshot_v703314t() to service_role",
  "grant execute on function public.service_record_backup_verification_v703314t(jsonb) to service_role",
  "grant execute on function public.admin_backup_verification_history_v703314t(integer) to authenticated",
  "revoke execute on function public.service_backup_integrity_snapshot_v703314t() from public, anon, authenticated",
  'storage.objects',
  'inventory-documents'
])assert(backupSql.includes(marker),'Backup SQL contract missing: '+marker);
assert(!/sb_secret_[A-Za-z0-9_-]{20,}/.test(backupSql),'A Supabase secret-looking value was committed in SQL');

assert(backupScript.includes('https://api.supabase.com/v1/projects/')&&backupScript.includes('/database/backups'),'Management API backup endpoint missing from verifier');
assert(backupScript.includes("createHash('sha256')"),'Document SHA-256 verification missing');
assert(backupScript.includes("storage.from('inventory-documents').download(path)"),'Document Storage download verification missing');
assert(backupScript.includes('service_backup_integrity_snapshot_v703314t'),'Service integrity snapshot RPC missing');
assert(backupScript.includes('service_record_backup_verification_v703314t'),'Verification history record RPC missing');
assert(!/sb_secret_[A-Za-z0-9_-]{20,}/.test(backupScript)&&!/sbp_[A-Za-z0-9_-]{20,}/.test(backupScript),'A server credential-looking value was committed in verifier script');

assert(backupWorkflow.includes('cron: "30 18 * * *"'),'Daily 02:30 Singapore backup schedule missing');
assert(backupWorkflow.includes('secrets.SUPABASE_ACCESS_TOKEN')&&backupWorkflow.includes('secrets.SUPABASE_SECRET_KEY'),'Backup workflow secure secret references missing');
assert(backupWorkflow.includes('node scripts/verify-backups.mjs'),'Backup workflow verifier invocation missing');
assert(backupWorkflow.includes('backup-verification-report.json'),'Sanitized verification artifact missing');
assert(setupDoc.includes('Supabase database backups do **not** contain Storage object file contents'),'Storage-backup limitation is not documented');

assert(fs.existsSync('supabase-v7-03-3-14o-parser-intelligence.sql'),'14o Supabase migration missing');
const frozen=JSON.parse(read('tests/known-good-releases.json'));
assert(frozen.version==='7.03.3.14m'&&frozen.commit==='742bbf4f66b4f3ae257b5e813661c7b555fb874c','Known-good 14m reference changed');

console.log('backup14t: security/storage/workflow contracts PASS');
console.log('All Inventory Hub v7.03.3.14t regression gates PASS.');
