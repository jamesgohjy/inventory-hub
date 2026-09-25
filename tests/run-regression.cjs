const fs=require('fs');
const vm=require('vm');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');

const core=read('v7033-core.js');
const app=read('app.js');
const runtime=read('runtime-v7.03.3.14u.js');
const evidenceEngine=read('modules/parser-evidence-engine.js');
const parserModule=read('modules/parser-table.js');
const canonicalParser=read('modules/canonical-parser.js');
const canonicalSaveSql=read('supabase-v7-03-3-14v-canonical-save.sql');
const groupModule=read('modules/grouped-company-ui.js');
const componentsCss=read('components.css');
const backupUiModule=read('modules/backup-verification-ui.js');
const parser=read('parser-v7-core.js');
const index=read('index.html');
const backupSql=read('supabase-v7-03-3-14t-backup-verification.sql');
const backupScript=read('scripts/verify-backups.mjs');
const backupWorkflow=read('.github/workflows/backup-verification.yml');
const setupDoc=read('BACKUP_VERIFICATION_SETUP-v7.03.3.14t.md');
const accuracyFixtures=JSON.parse(read('tests/parser-accuracy-fixtures-v7.03.3.14u.json'));
const anonymizedCorpus=JSON.parse(read('tests/fixtures/anonymized-invoice-corpus-v7.03.3.14v.json'));

new Function(core);new Function(app);new Function(runtime);new Function(evidenceEngine);new Function(parserModule);new Function(canonicalParser);new Function(groupModule);new Function(backupUiModule);new Function(parser);

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
assert(app.includes('modules/canonical-parser.js'),'Canonical parser module is not loaded');
assert(runtime.includes('InventoryHubCanonicalParser.fromPipeline'),'Production finalizer does not publish through the canonical parser API');
assert(!runtime.includes('globalThis.AVParserV7.enhanceParsed({parsed:normalized'),'Independent post-finalizer parser mutation still exists');
assert(!runtime.includes('globalThis.AVParserV7.prepareSave(state.parsed.items'),'Independent save-time parser correction still exists');
assert(!runtime.includes('applyParsedFixes(state.parsed'),'Review UI must not re-run an independent parser correction layer');
assert(!runtime.includes('state.parsed.items=v689SerialIntegrityGate'),'Save flow must not mutate canonical rows with a separate serial gate');
assert(!runtime.includes('state.parsed.items=inventoryOnlyItems'),'Save flow must not independently filter canonical rows');
assert(!runtime.includes('sanitizeParsedInventoryItems(state.parsed'),'Review rendering must consume canonical rows without a separate sanitizer');
assert(runtime.includes('InventoryHubCanonicalParser.applyReviewEdits'),'Review edits do not route through the canonical parser API');
assert(runtime.includes('__canonicalAuthorityV11'),'Final canonical parser authority boundary is missing');
assert(runtime.includes("this.sb.rpc('confirm_and_save_invoice_v703314v'"),'Confirm & Save does not use canonical PostgreSQL RPC');
assert(!runtime.includes("this.sb.rpc('import_invoice_atomic'"),'Legacy import_invoice_atomic remains in production Confirm & Save path');
assert(canonicalSaveSql.includes('create or replace function public.confirm_and_save_invoice_v703314v'),'Canonical Confirm & Save RPC missing');
for(const table of ['public.documents','public.purchases','public.master_items','public.purchase_items','public.serial_numbers'])assert(canonicalSaveSql.includes(table),'Atomic save RPC/schema missing '+table);
assert(canonicalSaveSql.includes('canonical_brand')&&canonicalSaveSql.includes('canonical_model')&&canonicalSaveSql.includes('verified_aliases'),'Canonical identity schema incomplete');
assert(canonicalSaveSql.includes('invoice_evidence'),'Original invoice evidence retention missing');
assert(canonicalSaveSql.includes('security invoker'),'Confirm & Save RPC must remain SECURITY INVOKER');
assert(canonicalSaveSql.includes('revoke execute on function public.confirm_and_save_invoice_v703314v')&&canonicalSaveSql.includes('grant execute on function public.confirm_and_save_invoice_v703314v'),'RPC execution grants missing');

const canonicalCtx={};canonicalCtx.window=canonicalCtx;canonicalCtx.globalThis=canonicalCtx;vm.createContext(canonicalCtx);vm.runInContext(canonicalParser,canonicalCtx,{filename:'modules/canonical-parser.js'});
const canonicalApi=canonicalCtx.InventoryHubCanonicalParser;
const identity=canonicalApi.canonicalIdentity({brand:'Remaco',model:'MAS-1818',sku:'MAS-1818',verified_aliases:['MAS1818']});
assert(identity.key==='REMACO::MAS1818','Canonical brand+model identity normalization failed');
assert(identity.verifiedAliases.includes('MAS1818'),'Verified alias retention failed');
const canonicalResult=canonicalApi.normalizeResult({doc:{invoice_number:'ANON-1'},items:[{brand:'Remaco',model:'MAS-1818',sku:'MAS-1818',item_name:'Projector mount controller',description:'Original invoice wording',quantity:2,unit_price:350,amount:700,verified_aliases:['MAS1818']}],rawText:'anonymized invoice evidence',parseEvidence:{evidenceRanking:{review:[]}}});
assert(canonicalResult.apiVersion==='1.1'&&canonicalResult.canonical===true&&canonicalResult.status==='accepted','Canonical result contract failed');
assert(canonicalResult.items[0].invoice_evidence.original_description==='Original invoice wording','Canonical normalization lost original invoice evidence');
assert(canonicalResult.items[0].canonical_identity.key==='REMACO::MAS1818','Canonical result lost identity');
const editedCanonical=canonicalApi.applyReviewEdits(canonicalResult,{doc:{invoice_date:'2026-09-25'},items:[{...canonicalResult.items[0],item_name:'Reviewed controller'}]});
assert(editedCanonical.items[0].item_name==='Reviewed controller','Canonical review edits were not applied');
assert(editedCanonical.items[0].invoice_evidence.original_description==='Original invoice wording','Canonical review edit overwrote original invoice evidence');
const serialConflict=canonicalApi.normalizeResult({doc:{invoice_number:'ANON-2'},items:[{item_name:'A',quantity:1,serials:'SER-1'},{item_name:'B',quantity:1,serials:'SER-1'}],parseEvidence:{evidenceRanking:{review:[]}}});
assert(canonicalApi.prepareSave(serialConflict).status==='block','Canonical save validation must block duplicate serial ownership');
assert(canonicalApi.diagnostics(editedCanonical).canonical===true,'Canonical diagnostics contract failed');
console.log('canonical-parser-and-atomic-save: API, identity, evidence and RPC contracts PASS');
assert(runtime.includes('evidenceEngine.runPipeline(candidates,{subtotal:doc.subtotal,confidenceThreshold:.72})'),'Production finalizer must use candidate -> evidence -> economics -> confidence -> review pipeline');
assert(runtime.includes("pipeline.status==='accepted'?(pipeline.items||[]):[]"),'Production finalizer must not accept rows when pipeline requires review');
assert(!runtime.includes('v687CompletenessReconcile(candidates,inventory,evidence)'),'Post-ranking completeness must not reintroduce weaker candidate rows');
assert(runtime.includes('InventoryHubParserTable.parseHeaderAlignedLayout'),'Direct runtime does not call parser module');
assert(runtime.includes('InventoryHubGroupedCompanyUI.renderGroupedCompanyCards'),'Direct runtime does not call grouped UI module');
assert(!runtime.includes('InventoryHubBackupVerificationUI'),'Backup Verification Admin UI must not be referenced by the direct runtime');
assert(!runtime.includes('backupVerificationCard')&&!runtime.includes('loadBackupVerification')&&!runtime.includes('renderBackupVerification'),'Backup Verification Admin UI hooks remain in the direct runtime');
assert(runtime.includes("__AV_DIRECT_RUNTIME_LOADED__='7.03.3.14u'"),'14u direct runtime load sentinel missing');
assert(!runtime.includes('SUPABASE_SECRET_KEY')&&!runtime.includes('SUPABASE_ACCESS_TOKEN'),'Server backup secrets leaked into browser runtime');

assert(app.includes('modules/parser-evidence-engine.js')&&app.includes('modules/parser-table.js')&&app.includes('modules/grouped-company-ui.js')&&app.includes('runtime-v7.03.3.14u.js'),'14u bootstrap direct module references missing');
assert(!app.includes('modules/backup-verification-ui.js'),'Backup Verification Admin must not be loaded into Automation Centre');
assert(index.includes('components.css?v=7.03.3.14v-r1'),'Reusable component stylesheet is not loaded');
for(const marker of ['.ui-toolbar','.ui-modal','.ui-table-wrap','.ui-group','.ui-diagnostic','@media(max-width:760px)'])assert(componentsCss.includes(marker),'Reusable component style missing '+marker);
assert(index.includes('ui-toolbar--responsive')&&index.includes('ui-table-wrap')&&index.includes('ui-modal'),'Core views are not consuming reusable component classes');
assert(groupModule.includes('ui-group')&&groupModule.includes('ui-group__toggle'),'Grouped view module is not consuming reusable component classes');
assert(app.includes("ASSET_REV='v703314v-canonical-components-20260925-1'"),'Canonical/components asset revision marker missing');
assert(runtime.includes("'Improved invoice parsing accuracy and verification.'")&&runtime.includes("'Simplify review messages and workflow.'"),'Direct runtime Patch Notes are not the concise user-facing version');
assert(index.includes('<li>Improved invoice parsing accuracy and verification.</li>')&&index.includes('<li>Simplify review messages and workflow.</li>'),'Static Patch Notes fallback is not concise');
assert(index.includes('app.js?v=7.03.3.14u-r4'),'Index app.js cache-bust revision missing');
assert(!app.includes('runtime-v7.03.3.14t.js')&&!app.includes('runtime-v7.03.3.14s.js')&&!app.includes('baseline-v6.55-d452'),'14u bootstrap still references an older runtime/baseline');
assert(index.includes('id="inventoryGroup"')&&index.includes('id="documentGroup"'),'Protected Group by Company controls are missing from Inventory or Documents');
assert(/id="inventoryGroup"[\s\S]{0,300}value="company">Group by Company/.test(index),'Inventory Group by Company option must remain available');
assert(/id="documentGroup"[\s\S]{0,300}value="company">Group by Company/.test(index),'Documents Group by Company option must remain available');
assert(/id="documentGroup"[\s\S]{0,160}<option value="none">No Grouping<\/option>[\s\S]{0,160}<option value="company">Group by Company<\/option>/.test(index),'Documents grouping must default to No Grouping so selecting Group by Company causes a visible state change');
assert(index.includes('#documentsView #documentGroup{flex:0 0 210px;width:210px;min-width:210px;max-width:210px;'),'Documents Group by Company dropdown width guard missing');
assert(runtime.includes("group=$('documentGroup')?.value||'none'"),'Documents renderer fallback must default to No Grouping');
assert(runtime.includes("\\$('inventoryGroup')?.addEventListener('change',renderInventory)")||runtime.includes("\\$('inventoryGroup').onchange=renderInventory")||runtime.includes("inventoryGroup')?.addEventListener('change',renderInventory"),'Inventory Group by Company event path must remain wired');
assert(runtime.includes("$('documentGroup')?.addEventListener('change',renderDocuments)"),'Documents Group by Company must use the same change-listener pattern as Inventory');
assert(runtime.includes("function v703314sRenderDocumentGroups(groups,head)")&&runtime.includes("host:$('documentsTable'),groups,head,escapeHtml:esc"),'Documents Group by Company must use a dedicated wrapper matching Inventory grouping behavior');
console.log('protected-company-grouping: Inventory + Documents controls/event/render paths PASS');
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

// 14v: execute every anonymized fixture through the production candidate -> evidence -> economics -> confidence -> review pipeline.
let corpusPassed=0,corpusFields=0;
for(const fx of anonymizedCorpus.cases){
  const result=mctx.InventoryHubParserEvidenceEngine.runPipeline(fx.candidates,{subtotal:fx.subtotal,confidenceThreshold:.72});
  assert(result.status===fx.expected.status,'Anonymized corpus '+fx.id+' status expected '+fx.expected.status+' got '+result.status);
  if(fx.expected.winnerOrigin)assert(result.winnerOrigin===fx.expected.winnerOrigin,'Anonymized corpus '+fx.id+' winner expected '+fx.expected.winnerOrigin+' got '+result.winnerOrigin);
  const rows=result.items||[];
  assert(rows.length===fx.expected.rows.length,'Anonymized corpus '+fx.id+' row count expected '+fx.expected.rows.length+' got '+rows.length);
  for(let i=0;i<fx.expected.rows.length;i++){
    const [sku,qty,unit,amount]=fx.expected.rows[i],row=rows[i]||{};
    for(const [field,actual,expected] of [['sku',row.sku,sku],['quantity',row.quantity,qty],['unit_price',row.unit_price,unit],['amount',row.amount,amount]]){
      corpusFields++;
      assert(field==='sku'?String(actual)===String(expected):near(actual,expected),'Anonymized corpus '+fx.id+' '+field+' expected '+expected+' got '+actual);
    }
  }
  if(fx.expected.status==='review')assert(result.review.length>0,'Anonymized corpus '+fx.id+' expected review reasons');
  corpusPassed++;
}
assert(corpusPassed===anonymizedCorpus.cases.length,'Not all anonymized corpus fixtures passed');
const corpusFailureClasses=new Set(anonymizedCorpus.cases.map(x=>x.failureClass||x.id));
assert(anonymizedCorpus.cases.length>=20,'Anonymized corpus must retain at least 20 structural cases');
assert(corpusFailureClasses.size>=15,'Anonymized corpus must cover at least 15 distinct structural failure classes');
const forbiddenFixtureKeys=['supplier','customer','address','email','phone','invoice_number','invoiceNumber','rawText','pdf','imageBytes'];
for(const fx of anonymizedCorpus.cases){
  const serialized=JSON.stringify(fx).toLowerCase();
  for(const key of forbiddenFixtureKeys)assert(!Object.prototype.hasOwnProperty.call(fx,key),'Private/raw fixture field forbidden: '+key+' in '+fx.id);
  assert(!/\b(?:pte\.?\s*ltd|private limited|@|\+65\s*\d{4})\b/i.test(serialized),'Fixture appears to contain identifying organization/contact data: '+fx.id);
}
console.log('anonymized-pipeline-corpus: '+corpusPassed+'/'+anonymizedCorpus.cases.length+' fixtures, '+corpusFields+' accepted-row fields, '+corpusFailureClasses.size+' failure classes PASS');


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
