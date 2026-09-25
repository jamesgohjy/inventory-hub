const fs=require('fs');
const vm=require('vm');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');

const core=read('v7033-core.js');
const app=read('app.js');
const runtime=read('runtime-v7.03.3.14x.js');
const evidenceEngine=read('modules/parser-evidence-engine.js');
const parserModule=read('modules/parser-table.js');
const canonicalParser=read('modules/canonical-parser.js');
const parserV2Evidence=read('modules/parser-v2/evidence-model.js');
const parserV2Header=read('modules/parser-v2/header-resolver.js');
const parserV2Table=read('modules/parser-v2/table-detector.js');
const parserV2Builder=read('modules/parser-v2/row-builder.js');
const parserV2Rows=read('modules/parser-v2/row-accounting.js');
const parserV2Engine=read('modules/parser-v2/engine.js');
const canonicalSaveSql=read('supabase-v7-03-3-14v-canonical-save.sql');
const masterMergeSql=read('supabase-v7-03-3-14d-master-item-merge.sql');
const healthResolutionSql=read('supabase-v7-03-3-14x-data-health-resolution.sql');
const databaseMigrationWorkflow=read('.github/workflows/database-migrations.yml');
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

new Function(core);new Function(app);new Function(runtime);new Function(evidenceEngine);new Function(parserModule);new Function(canonicalParser);new Function(parserV2Evidence);new Function(parserV2Header);new Function(parserV2Table);new Function(parserV2Builder);new Function(parserV2Rows);new Function(parserV2Engine);new Function(groupModule);new Function(backupUiModule);new Function(parser);

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
assert(total===80&&passed===80,'Expected 80/80 core regression checks, got '+passed+'/'+total);
assert(api.referenceNumberFromLabel('Ref. No. VSO17-026212/V17-041821 DATE 15/12/23 P/O NO. PO/23/000056')==='VSO17-026212/V17-041821','Flexible labelled Reference No. extraction failed');
const avMediaDedupe=api.consolidateFragmentedParsedLineItems([
  {sku:'',item_name:'and control Panel',description:'and control Panel',quantity:4,unit_price:9588,amount:38.35,amountReviewRequired:true},
  {sku:'',item_name:'PT-MZI7K Replacement of AV Projector and control Panel',description:'PT-MZI7K Replacement of AV Projector and control Panel',quantity:4,unit_price:9588,amount:38352},
  {sku:'PT-MZI7K',item_name:'Replacement of AV Projector and control Panel',description:'Replacement of AV Projector and control Panel',quantity:4,unit_price:9588,amount:38352}
]);
assert(avMediaDedupe.length===1&&avMediaDedupe[0].sku==='PT-MZI7K'&&Math.abs(Number(avMediaDedupe[0].amount)-38352)<=.01,'Fragmented duplicate consolidation did not retain the strongest evidenced PT-MZI7K row');
assert(api.v703312jIsTrackedEquipment({sku:'RC-208/UK',item_name:'I/O Control Button Keypad',description:'I/O Control Button Keypad'})===true,'Generic keypad equipment recognition failed');

// 14u: historical source excerpts are now checked field-by-field, not just by broad case predicates.
const historicalExpectations={
  'avs-320-vin17-049472':[{sku:'AVS-320',quantity:2,unit_price:350,amount:700}],
  'aerospace-2022':[{sku:'PT-VW540',quantity:1,unit_price:804,amount:804},{sku:'AVS320',quantity:1,unit_price:350,amount:350}],
  'loud-pga58-00215542':[{sku:'PGA58-LC',quantity:10,unit_price:64.69,amount:646.90}],
  'loud-mixed-00215840':[{sku:'U35C',quantity:4,unit_price:340,amount:1360},{sku:'SLXD2+',quantity:1,unit_price:480,amount:480},{sku:'AT-2',quantity:1,unit_price:270,amount:270},{sku:'U3',quantity:4,unit_price:275,amount:1100}],
  'jny-rds-2021':[{sku:'PT-TW381R',quantity:1,unit_price:4820,amount:4820}],
  'seminar-room-2021':[{sku:'PT-VW540',quantity:2,unit_price:707,amount:1414},{sku:'SPS-1100',quantity:2,unit_price:90,amount:180}],
  'hawko-av-cart-2021':[{sku:'ZS6HKOAV-EB97E',quantity:2,unit_price:550,amount:1100,recovered:true}],
  'av-media-2023-reference-dedupe':[
    {sku:'PT-MZI7K',quantity:4,unit_price:9588,amount:38352},
    {sku:'ET-EMT750',quantity:4,unit_price:3080,amount:12320},
    {sku:'VS-442H2A',quantity:3,unit_price:3500,amount:10500},
    {sku:'RC-208/UK',quantity:6,unit_price:800,amount:4800},
    {sku:'TP-583TXR',quantity:8,unit_price:590,amount:4720},
    {sku:'TP-583RXR',quantity:8,unit_price:590,amount:4720}
  ]
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
assert(cv==='7.03.3.14x','Core version must be 7.03.3.14x');
assert(av===cv,'App/core version mismatch: '+av+' vs '+cv);
assert(iv===cv,'Index/core version mismatch: '+iv+' vs '+cv);
assert(uv==='7.03.3.14y','Upcoming version must be 7.03.3.14y');

for(const bad of ['replaceOnce(','src.replace(','new Blob([src]','raw.githubusercontent.com','baseline-v6.55-d452']){
  assert(!runtime.includes(bad),'Direct runtime contains retired compatibility mechanism: '+bad);
}
assert(runtime.includes('InventoryHubParserEvidenceEngine'),'Direct runtime does not use parser evidence engine');
assert(runtime.includes('Parser V2 runs in shadow mode only.')&&runtime.includes('v2Shadow:v2'),'Production finalizer must attach Parser V2 shadow diagnostics without replacing legacy values');
assert(app.includes('modules/parser-v2/engine.js')&&app.includes('Parser V2 shadow gate failed'),'App bootstrap must load and gate Parser V2 before runtime');
assert(app.includes('modules/parser-v2/table-detector.js')&&app.includes('modules/parser-v2/row-builder.js'),'App bootstrap must load independent Parser V2 table/row modules');
assert(parserV2Engine.includes("mode:'shadow-independent-table'")&&parserV2Engine.includes('T.detectTables(evidence)')&&parserV2Engine.includes('B.buildRows(evidence,tables)'),'Parser V2 engine must derive completeness from its own geometry pipeline');


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
assert(runtime.includes('database migration must be applied before this invoice can be saved'),'Confirm & Save must surface a specific missing-RPC/database-migration error');
assert(runtime.includes('InventoryHubCanonicalParser.calculateAmount(qty.value,price.value)'),'Review Qty/Unit Price changes are not wired to canonical Amount auto-calculation');
assert(runtime.includes('extractSupplierHeaderCandidate'),'Runtime supplier recovery is not using the generic evidence resolver');
assert(runtime.includes("recovery-header-left")&&runtime.includes("!existingInvoice||!existingSupplier"),'Targeted header OCR must recover supplier and invoice independently');
assert(runtime.includes("renderDuplicateImportWarning14x(dupe,{focus:true})")&&!runtime.includes("if(dupe&&!state.allowDuplicate)throw new Error('Possible duplicate detected."),'Duplicate invoice save path must surface the decision UI instead of throwing a generic import error');
assert(runtime.includes("for(const id of ['pSupplier','pInvoice','pDate'])")&&runtime.includes("refreshDuplicateWarning({resetOverride:true,focus:false})"),'Manual header edits must refresh duplicate detection');

assert(runtime.includes("this.sb.rpc('resolve_health_issue_v703314x'"),'Data Health Resolve does not persist through its database RPC');
assert(runtime.includes('data-health-resolve'),'Data Health Resolve action is not rendered');
assert(runtime.includes("x.type==='Possible duplicate SKU')?'<button class=\"secondary small-btn\" data-health-resolve="),'Possible duplicate SKU alerts must expose Resolve');
assert(runtime.includes('function renderNeedsAttention14x(openDialog=false)'),'14x must have one authoritative Needs Attention renderer');
assert(runtime.includes('const hydratePersistedHealthReviews14x=async()=>'),'14x must hydrate persisted Data Health reviews after core init');
assert(runtime.includes('hydratePersistedHealthReviews14x().then(()=>{')&&runtime.includes('renderNeedsAttention14x(false);'),'14x must reconcile Needs Attention after persisted health hydration');
const health14xStart=runtime.indexOf('function v703314x');
const health14xTail=health14xStart>=0?runtime.slice(health14xStart):runtime.slice(runtime.indexOf('function renderNeedsAttention14x')-5000);
assert(!health14xTail.includes('v703314xBaseRenderQuality=renderQualityDashboard14o'),'14x must not reference closure-local renderQualityDashboard14o');
assert(!health14xTail.includes('renderQualityDashboard14o=function'),'14x must not overwrite closure-local parser dashboard renderer');
const intel14oStart=runtime.indexOf('(function v703314oInstallParserIntelligence(){'),intel14oEnd=runtime.indexOf('})();',intel14oStart)+5,intel14oBlock=runtime.slice(intel14oStart,intel14oEnd),intel14oExecutableCalls=(intel14oBlock.match(/renderQualityDashboard14o\(\)/g)||[]).length;
assert(intel14oExecutableCalls===1&&intel14oBlock.includes('function renderQualityDashboard14o()'),'Retired 14o quality renderer must have no executable call sites');
assert(runtime.includes('renderAutomationCentre=function(){renderNeedsAttention14x(false)'),'Automation Centre card must use authoritative 14x issue list');
assert(runtime.includes('openAttention=function(){renderNeedsAttention14x(true)'),'Needs Attention dialog must use the same authoritative 14x issue list');
assert(/ASSET_REV='v703314x-[^']+'/.test(app),'14x loader must carry an explicit cache-busting asset revision');
assert(!runtime.includes('out=applySupplierProfile14o(out,raw);out=applyCorrectionMemory14o(out,raw)'),'Retired Correction Memory must not mutate parsed output');
assert(!runtime.includes('if(corrections.length)await persistCorrectionMemory14o(corrections)'),'Retired Correction Memory must not persist new corrections');
assert(!runtime.includes('<strong>Correction Memory</strong>'),'Retired Correction Memory UI must not render');
assert(runtime.includes('<strong>Supplier Layout Profiles</strong>'),'Supplier Layout Profiles must remain after Correction Memory retirement');
assert(runtime.includes("source.sku||'No SKU'"),'No-SKU merge acknowledgement must render a safe label');
assert(core.includes("'embedded-sku-alias'"),'Evidence-backed no-SKU duplicate merge path is missing');
assert(masterMergeSql.includes('v_source_text_key')&&masterMergeSql.includes('No-SKU source does not contain the surviving SKU/model'),'Server-side no-SKU merge evidence guard is missing');
assert(healthResolutionSql.includes('resolve_health_issue_v703314x')&&healthResolutionSql.includes("resolution_status='resolved'"),'Persistent Data Health resolution migration is incomplete');
assert(databaseMigrationWorkflow.includes('/v1/projects/$SUPABASE_PROJECT_REF/database/query'),'Database migration workflow does not use the verified Supabase Management API query endpoint');
assert(databaseMigrationWorkflow.includes('secrets.SUPABASE_ACCESS_TOKEN'),'Database migration workflow must use the protected Supabase access token');
assert(databaseMigrationWorkflow.includes('confirm_and_save_invoice_v703314v')&&databaseMigrationWorkflow.includes('merge_master_items_v703314d')&&databaseMigrationWorkflow.includes('resolve_health_issue_v703314x'),'Database deployment verification does not check all required RPCs');
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
assert(canonicalApi.calculateAmount(4,9588)===38352,'Canonical Qty × Unit Price amount calculation failed');
assert(canonicalApi.calculateAmount('',9588)===null,'Canonical amount calculator must reject blank quantity');
const canonicalResult=canonicalApi.normalizeResult({doc:{invoice_number:'ANON-1'},items:[{brand:'Remaco',model:'MAS-1818',sku:'MAS-1818',item_name:'Projector mount controller',description:'Original invoice wording',quantity:2,unit_price:350,amount:700,verified_aliases:['MAS1818']}],rawText:'anonymized invoice evidence',parseEvidence:{evidenceRanking:{review:[]}}});
assert(canonicalResult.apiVersion==='1.1'&&canonicalResult.canonical===true&&canonicalResult.status==='accepted','Canonical result contract failed');
assert(canonicalResult.items[0].invoice_evidence.original_description==='Original invoice wording','Canonical normalization lost original invoice evidence');
assert(canonicalResult.items[0].canonical_identity.key==='REMACO::MAS1818','Canonical result lost identity');
const editedCanonical=canonicalApi.applyReviewEdits(canonicalResult,{doc:{invoice_date:'2026-09-25'},items:[{...canonicalResult.items[0],item_name:'Reviewed controller'}]});
assert(editedCanonical.items[0].item_name==='Reviewed controller','Canonical review edits were not applied');
assert(editedCanonical.items[0].invoice_evidence.original_description==='Original invoice wording','Canonical review edit overwrote original invoice evidence');

const level3Review=canonicalApi.normalizeResult({
  doc:{supplier_name:'Example Supplier',invoice_number:'ANON-L3',invoice_date:'2026-09-25',currency:'SGD'},
  items:[{sku:'CTRL-200',item_name:'Reviewed controller',description:'Reviewed controller',quantity:2,unit_price:350,amount:700}],
  review:[{index:0,reason:'low-confidence'}],
  rawText:'anonymized invoice evidence'
});
assert(canonicalApi.prepareSave(level3Review).status==='review','Unresolved Level 3 case must require review');
const level3Approved=canonicalApi.markHumanReviewed(level3Review);
assert(canonicalApi.prepareSave(level3Approved).ok===true,'Human-approved Level 3 case must become saveable');
const level3Recollected=canonicalApi.applyReviewEdits(level3Approved,{
  doc:{...level3Approved.doc},
  items:level3Approved.items.map(x=>({...x}))
});
assert(level3Recollected.humanReviewed===true,'Unchanged form recollection must preserve Level 3 human approval');
assert(canonicalApi.prepareSave(level3Recollected).ok===true,'Approved Level 3 case must remain saveable after unchanged form recollection');
const level3Changed=canonicalApi.applyReviewEdits(level3Approved,{
  doc:{...level3Approved.doc},
  items:level3Approved.items.map((x,i)=>i===0?{...x,quantity:3,amount:1050}:x)
});
assert(level3Changed.humanReviewed===false&&canonicalApi.prepareSave(level3Changed).status==='review','Material post-review edits must invalidate Level 3 approval');

const serialConflict=canonicalApi.normalizeResult({doc:{invoice_number:'ANON-2'},items:[{item_name:'A',quantity:1,serials:'SER-1'},{item_name:'B',quantity:1,serials:'SER-1'}],parseEvidence:{evidenceRanking:{review:[]}}});
assert(canonicalApi.prepareSave(serialConflict).status==='block','Canonical save validation must block duplicate serial ownership');
assert(canonicalApi.diagnostics(editedCanonical).canonical===true,'Canonical diagnostics contract failed');
console.log('canonical-parser-and-atomic-save: API, identity, evidence and RPC contracts PASS');
assert(runtime.includes('evidenceEngine.runPipeline(candidates,{subtotal:doc.subtotal,confidenceThreshold:.72})'),'Production finalizer must use candidate -> evidence -> economics -> confidence -> review pipeline');
assert(runtime.includes("let extracted=pipeline.items||[]"),'Production finalizer must preserve evidence-backed rows when pipeline requires review');
assert(runtime.includes("if(pipeline.status==='review')inventory=inventory.map"),'Production finalizer must mark preserved review rows for human verification');
assert(!runtime.includes('v687CompletenessReconcile(candidates,inventory,evidence)'),'Post-ranking completeness must not reintroduce weaker candidate rows');
assert(runtime.includes('InventoryHubParserTable.parseHeaderAlignedLayout'),'Direct runtime does not call parser module');
assert(runtime.includes('InventoryHubGroupedCompanyUI.renderGroupedCompanyCards'),'Direct runtime does not call grouped UI module');
assert(!runtime.includes('InventoryHubBackupVerificationUI'),'Backup Verification Admin UI must not be referenced by the direct runtime');
assert(!runtime.includes('backupVerificationCard')&&!runtime.includes('loadBackupVerification')&&!runtime.includes('renderBackupVerification'),'Backup Verification Admin UI hooks remain in the direct runtime');
assert(runtime.includes("__AV_DIRECT_RUNTIME_LOADED__='7.03.3.14x'"),'14x direct runtime load sentinel missing');
assert(!runtime.includes('SUPABASE_SECRET_KEY')&&!runtime.includes('SUPABASE_ACCESS_TOKEN'),'Server backup secrets leaked into browser runtime');

assert(app.includes('modules/parser-evidence-engine.js')&&app.includes('modules/parser-table.js')&&app.includes('modules/grouped-company-ui.js')&&app.includes('runtime-v7.03.3.14x.js'),'14x bootstrap direct module references missing');
assert(!app.includes('modules/backup-verification-ui.js'),'Backup Verification Admin must not be loaded into Automation Centre');
assert(index.includes('components.css?v=7.03.3.14v-r3'),'Reusable component stylesheet is not loaded');
for(const marker of ['.ui-toolbar','.ui-modal','.ui-table-wrap','.ui-group','.ui-diagnostic','@media(max-width:760px)'])assert(componentsCss.includes(marker),'Reusable component style missing '+marker);
assert(index.includes('ui-toolbar--responsive')&&index.includes('ui-table-wrap')&&index.includes('ui-modal'),'Core views are not consuming reusable component classes');
assert(groupModule.includes('ui-group')&&groupModule.includes('ui-group__toggle'),'Grouped view module is not consuming reusable component classes');
assert(/ASSET_REV='v703314x-[^']+'/.test(app),'v14x cache-busting asset revision marker missing');
assert(runtime.includes("'Restored equipment line-item recovery for previously supported multi-page invoice layouts.'")&&runtime.includes("'Improved equipment verification and manual-line Confirm & Save handling.'"),'Direct runtime Patch Notes are not the current concise user-facing version');
assert(index.includes('Restored equipment line-item recovery for previously supported multi-page invoice layouts.')&&index.includes('Improved equipment verification and manual-line Confirm &amp; Save handling.'),'Static Patch Notes fallback is not current');
assert(index.includes('app.js?v=7.03.3.14x-r9'),'Index app.js cache-bust revision missing');
assert(!app.includes('runtime-v7.03.3.14t.js')&&!app.includes('runtime-v7.03.3.14s.js')&&!app.includes('baseline-v6.55-d452'),'14x bootstrap still references an older runtime/baseline');
assert(index.includes('id="inventoryGroup"')&&index.includes('id="documentGroup"'),'Protected Group by Company controls are missing from Inventory or Documents');
assert(/id="inventoryGroup"[\s\S]{0,300}value="company">Group by Company/.test(index),'Inventory Group by Company option must remain available');
assert(/id="documentGroup"[\s\S]{0,300}value="company">Group by Company/.test(index),'Documents Group by Company option must remain available');
assert(/id="documentGroup"[\s\S]{0,160}<option value="none">No Grouping<\/option>[\s\S]{0,160}<option value="company">Group by Company<\/option>/.test(index),'Documents grouping must default to No Grouping so selecting Group by Company causes a visible state change');
assert(index.includes('#documentsView #documentGroup{flex:0 0 230px;width:230px;min-width:230px;max-width:230px;'),'Documents Group by Company dropdown width guard missing');
assert(runtime.includes("group=$('documentGroup')?.value||'none'"),'Documents renderer fallback must default to No Grouping');
assert(runtime.includes("\\$('inventoryGroup')?.addEventListener('change',renderInventory)")||runtime.includes("\\$('inventoryGroup').onchange=renderInventory")||runtime.includes("inventoryGroup')?.addEventListener('change',renderInventory"),'Inventory Group by Company event path must remain wired');
assert(runtime.includes("$('documentGroup')?.addEventListener('change',renderDocuments)"),'Documents Group by Company must use the same change-listener pattern as Inventory');
assert(runtime.includes("function v703314sRenderDocumentGroups(groups,head)")&&runtime.includes("host:$('documentsTable'),groups,head,escapeHtml:esc"),'Documents Group by Company must use a dedicated wrapper matching Inventory grouping behavior');
assert(runtime.includes("host:$('documentsTable'),groups,head,escapeHtml:esc,itemLabel:'invoice'"),'Documents grouped view must use invoice count labels');
assert(runtime.includes("host:$('inventoryTable'),groups,head,escapeHtml:esc,itemLabel:'item'"),'Inventory grouped view must use item count labels');
assert(componentsCss.includes('#documentsView #documentGroup,#inventoryView #inventoryGroup')&&componentsCss.includes('width:230px'),'Reusable grouped-view controls must preserve full company grouping labels');
assert(componentsCss.includes('.ui-group__toggle,.v669-doc-group-toggle')&&componentsCss.includes('justify-content:space-between'),'Compact grouped-view accordion styling is missing');
assert(index.indexOf('id="documentSort"')<index.indexOf('id="documentGroup"'),'Documents toolbar must remain Search → Sort → Group as in the established UI');
assert(componentsCss.includes('#auditView #auditUser')&&componentsCss.includes('#auditView #auditAction')&&componentsCss.includes('flex:0 0 190px'),'Recent Activities dropdowns must match the date control width');
assert(componentsCss.includes('#importDialog #dropZone.drop-zone')&&componentsCss.includes('min-height:56px')&&componentsCss.includes('height:56px'),'Import PDF drop zone must remain approximately 70% shorter on desktop');
console.log('protected-company-grouping: Inventory + Documents controls/event/render paths PASS');
assert(fs.existsSync('runtime-v7.03.3.14t.js')&&fs.existsSync('runtime-v7.03.3.14s.js')&&fs.existsSync('runtime-v7.03.3.14r.js')&&fs.existsSync('baseline-v6.55-d452.js'),'Rollback references must remain available');


// Parser V2 architecture gates: evidence sources stay separate, headers resolve independently,
// Reference Number is exact-or-blank, and row accounting must expose missing equipment.
const v2ctx={console,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp};v2ctx.globalThis=v2ctx;v2ctx.window=v2ctx;vm.createContext(v2ctx);
vm.runInContext(parserV2Evidence,v2ctx,{filename:'modules/parser-v2/evidence-model.js'});
vm.runInContext(parserV2Header,v2ctx,{filename:'modules/parser-v2/header-resolver.js'});
vm.runInContext(parserV2Table,v2ctx,{filename:'modules/parser-v2/table-detector.js'});
vm.runInContext(parserV2Builder,v2ctx,{filename:'modules/parser-v2/row-builder.js'});
vm.runInContext(parserV2Rows,v2ctx,{filename:'modules/parser-v2/row-accounting.js'});
vm.runInContext(parserV2Engine,v2ctx,{filename:'modules/parser-v2/engine.js'});
assert(v2ctx.InventoryHubParserV2?.selfTest?.().ok,'Parser V2 self-test failed: '+(v2ctx.InventoryHubParserV2?.selfTest?.().failures||[]).join(', '));
const sameCompanyA=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
  {source:'native',text:'AV MEDIA PTE LTD\nTAX INVOICE\nInvoice No.: VIN17-049472\nDATE: 06-04-26\nRef. No.: VSO17-035483'},
  {source:'ocr',text:'AV MEDIA PTE LTD\nInvoice No.: VIN17-049472\nDATE: 06-04-26\nRef. No.: VSO17-035483'}
]});
const sameCompanyB=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
  {source:'native',text:'TAX INVOICE\nCustomer Code: R2002\nInvoice No.: VIN17-055555\nDATE: 18/08/26'},
  {source:'ocr',text:'AV MEDIA PTE LTD\nBlk 2023 Bukit Batok Industrial Park\nInvoice No.: VIN17-055555\nDATE: 18/08/26'}
]});
const ha=v2ctx.InventoryHubParserV2Header.resolveHeaders(sameCompanyA),hb=v2ctx.InventoryHubParserV2Header.resolveHeaders(sameCompanyB);
assert(/AV MEDIA PTE LTD/i.test(ha.supplier_name)&&/AV MEDIA PTE LTD/i.test(hb.supplier_name),'Parser V2 same-company supplier resolution failed across evidence variations');
assert(ha.invoice_number==='VIN17-049472'&&hb.invoice_number==='VIN17-055555','Parser V2 invoice-number resolution failed across same-company variations');
assert(ha.invoice_date==='2026-04-06'&&hb.invoice_date==='2026-08-18','Parser V2 date resolution failed across same-company variations');
const badRef=v2ctx.InventoryHubParserV2Header.resolveHeaders(v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
  {source:'native',text:'Ref. No.: VSO17-035483'},
  {source:'ocr',text:'Ref. No.: VSOI7-O354B3'}
]}));
assert(badRef.reference_number==='','Reference Number conflict must remain blank; guessing is forbidden');
const ledger=v2ctx.InventoryHubParserV2Rows.buildLedger([
  {origin:'high-confidence-partial',items:[{sku:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700}]},
  {origin:'complete-layout',items:[
    {sku:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700},
    {sku:'RX-1',item_name:'Wireless receiver',quantity:2,unit_price:400,amount:800},
    {sku:'MIC-1',item_name:'Wireless microphone',quantity:2,unit_price:250,amount:500},
    {sku:'PROJ-1',item_name:'Laser projector',quantity:1,unit_price:5000,amount:5000},
    {sku:'INSTALL',item_name:'Installation labour',quantity:1,unit_price:1000,amount:1000}
  ]}
]);
const ledgerSummary=v2ctx.InventoryHubParserV2Rows.summarize(ledger);
assert(ledgerSummary.detectedRows===5&&ledgerSummary.counts.equipment===4&&ledgerSummary.counts.service===1,'Parser V2 row ledger failed to preserve/account for the fuller candidate set');
const compared=v2ctx.InventoryHubParserV2Rows.compareFinalItems(ledger,[{sku:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700}]);
assert(compared.missingEquipment.length===3,'Parser V2 must detect equipment missing from a partial winning candidate');
const independentFiveRowLayout=[{page:1,width:820,height:1000,yTolerance:3,rows:[
  {y:100,text:'PRODUCT NO DESCRIPTION QUANTITY UNIT PRICE AMOUNT',items:[
    {text:'PRODUCT NO',x:40,width:90},{text:'DESCRIPTION',x:180,width:120},{text:'QUANTITY',x:470,width:60},{text:'UNIT PRICE',x:570,width:70},{text:'AMOUNT',x:700,width:60}
  ]},
  {y:140,text:'AVS-320 Projector controller 2 350.00 700.00',items:[
    {text:'AVS-320',x:45,width:65},{text:'Projector controller',x:180,width:190},{text:'2',x:490,width:10},{text:'350.00',x:585,width:55},{text:'700.00',x:710,width:55}
  ]},
  {y:175,text:'RX-1 Wireless receiver 2 400.00 800.00',items:[
    {text:'RX-1',x:45,width:45},{text:'Wireless receiver',x:180,width:170},{text:'2',x:490,width:10},{text:'400.00',x:585,width:55},{text:'800.00',x:710,width:55}
  ]},
  {y:210,text:'MIC-1 Wireless microphone 2 250.00 500.00',items:[
    {text:'MIC-1',x:45,width:50},{text:'Wireless microphone',x:180,width:190},{text:'2',x:490,width:10},{text:'250.00',x:585,width:55},{text:'500.00',x:710,width:55}
  ]},
  {y:245,text:'PROJ-1 Laser projector 1 5000.00 5000.00',items:[
    {text:'PROJ-1',x:45,width:60},{text:'Laser projector',x:180,width:150},{text:'1',x:490,width:10},{text:'5000.00',x:580,width:60},{text:'5000.00',x:705,width:60}
  ]},
  {y:280,text:'INSTALL Installation labour 1 1000.00 1000.00',items:[
    {text:'INSTALL',x:45,width:65},{text:'Installation labour',x:180,width:180},{text:'1',x:490,width:10},{text:'1000.00',x:580,width:60},{text:'1000.00',x:705,width:60}
  ]},
  {y:325,text:'SUBTOTAL 8000.00',items:[{text:'SUBTOTAL',x:570,width:70},{text:'8000.00',x:705,width:60}]}
]}];
const independentV2=v2ctx.InventoryHubParserV2.analyze({
  sources:[{source:'native-layout',kind:'layout',text:'SUPPLIER: Example AV Pte Ltd\nInvoice No.: INV-5001\nDATE: 25/09/26',layout:independentFiveRowLayout}],
  candidates:[{origin:'legacy-partial',items:[
    {sku:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700},
    {sku:'RX-1',item_name:'Wireless receiver',quantity:2,unit_price:400,amount:800}
  ]}],
  legacyResult:{doc:{supplier_name:'Example AV Pte Ltd',invoice_number:'INV-5001',invoice_date:'2026-09-25'},items:[
    {sku:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700},
    {sku:'RX-1',item_name:'Wireless receiver',quantity:2,unit_price:400,amount:800}
  ]}
});
assert(independentV2.mode==='shadow-independent-table'&&independentV2.tables.length===1,'Parser V2 must detect the table independently of legacy candidates');
assert(independentV2.physicalRows.length===5,'Parser V2 physical reconstruction expected 5 source rows, got '+independentV2.physicalRows.length);
assert(independentV2.completeness.counts.equipment===4&&independentV2.completeness.counts.service===1,'Parser V2 physical ledger must account for 4 equipment + 1 service rows');
assert(independentV2.finalComparison.missingEquipment.length===2,'Parser V2 must expose the 2 equipment rows omitted by the legacy partial result');

// Real-world failure-class locks derived from historical invoice geometry/OCR.
// 1) Corroborate supplier/invoice/date across noisy full-page OCR + targeted header OCR.
const hawkoHeaders=v2ctx.InventoryHubParserV2Header.resolveHeaders(
  v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
    {source:'full-ocr-auto',kind:'ocr',text:'033773\nboa A WKO HAWIKO TRADING CO PTE LTD TAX INVOICE\nSingapore 339159 B 1N-1049266\nCO REG. NO. 197400001W Website: www.hawko.com Email: info@hawko.com DATE: 40/09/2021\nAll payments should be crossed payable to HAWKO TRADING CO PTE LTD\nHAWKO TRADING CO PTE LTD'},
    {source:'full-ocr-column',kind:'ocr',text:'HAWKO HAWKO TRADING CO PTE LTD TAX INVOICE\nSingapore 339159 NO: IN-1049266\nCO REG. NO. 197400001W Website: www.hawko.com Email: info@hawko.com DATE: 40/09/2021\nHAWKO TRADING CO PTE LTD'},
    {source:'targeted-header',kind:'ocr',text:'TAX INVOICE\nNO: IN-1049266\nDATE: 10/09/2021\nPG: Page 1 of 1'}
  ]})
);
assert(hawkoHeaders.supplier_name==='HAWKO TRADING CO PTE LTD','V2 noisy supplier reconciliation failed');
assert(hawkoHeaders.invoice_number==='IN-1049266','V2 contextual invoice-number resolution failed');
assert(hawkoHeaders.invoice_date==='2021-09-10','V2 targeted 4-digit invoice date failed');
assert(hawkoHeaders.reference_number==='','V2 must not invent a Reference Number when none is proven');

// 2) Headerless scan table: arithmetic proof may recover a priced row, but account/customer metadata must not.
const hawkoHeaderless=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[{source:'hawko-ocr',kind:'ocr',layout:[
  {page:1,width:1503,height:1973,yTolerance:4,rows:[
    {y:730,text:'786HKOAV-PB97E WYAVC004 ADJUSTABLE METAL TROLLEY W C+S 2 $550.00 $1,100.00',items:[
      {x:58,text:'786HKOAV-PB97E',width:193},{x:328,text:'WYAVC004',width:120},{x:453,text:'ADJUSTABLE',width:146},
      {x:606,text:'METAL',width:74},{x:686,text:'TROLLEY',width:103},{x:796,text:'W',width:22},{x:824,text:'C+S',width:43},
      {x:1009,text:'2',width:12},{x:1115,text:'$550.00',width:81},{x:1319,text:'$1,100.00',width:100}
    ]}
  ]},
  {page:2,width:1000,height:1200,yTolerance:4,rows:[
    {y:100,text:'ACCOUNT NO 1 550.00 550.00',items:[{x:40,text:'ACCOUNT',width:70},{x:115,text:'NO',width:20},{x:700,text:'1',width:10},{x:800,text:'550.00',width:55},{x:920,text:'550.00',width:55}]},
    {y:130,text:'CUSTOMER CODE R2002 1 400.00 400.00',items:[{x:40,text:'CUSTOMER',width:80},{x:125,text:'CODE',width:35},{x:170,text:'R2002',width:45},{x:700,text:'1',width:10},{x:800,text:'400.00',width:55},{x:920,text:'400.00',width:55}]}
  ]}
]}]});
const hawkoTables=v2ctx.InventoryHubParserV2TableDetector.detectTables(hawkoHeaderless);
const hawkoRows=v2ctx.InventoryHubParserV2RowBuilder.buildRows(hawkoHeaderless,hawkoTables).rows;
assert(hawkoTables.length===1&&hawkoRows.length===1,'V2 headerless scan must accept the proven product row and reject metadata rows');
assert(hawkoRows[0].sku==='786HKOAV-PB97E'&&hawkoRows[0].item_name==='WYAVC004 ADJUSTABLE METAL TROLLEY W C+S','V2 headerless scan identity/description mismatch');
assert(hawkoRows[0].quantity===2&&hawkoRows[0].unit_price===550&&hawkoRows[0].amount===1100,'V2 headerless scan economics mismatch');

// 3) Tax-column + serial-overlap regression: numeric tokens in Tax/serial bands must not merge adjacent products.
const taxedWrapped=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[{source:'taxed-layout',kind:'layout',layout:[{page:1,width:595,height:842,yTolerance:3,rows:[
  {y:100,text:'Description Quantity Unit Price Tax Amount',items:[{text:'Description',x:36,width:48},{text:'Quantity',x:252,width:37},{text:'Unit',x:341,width:18},{text:'Price',x:361,width:21},{text:'Tax',x:437,width:14},{text:'Amount',x:523,width:34}]},
  {y:140,text:'XVive U35C Wireless System for Condenser Microphones 5.8GHz',items:[{text:'XVive',x:36,width:22},{text:'U35C',x:58,width:22},{text:'Wireless',x:80,width:33},{text:'System',x:114,width:28},{text:'for',x:142,width:13},{text:'Condenser',x:155,width:46},{text:'Microphones',x:203,width:48},{text:'5.8GHz',x:252,width:32}]},
  {y:176,text:'S/N: IntlE251100449 4.00 340.00 9% 1,360.00',items:[{text:'S/N:',x:36,width:18},{text:'IntlE251100449',x:58,width:70},{text:'4.00',x:272,width:16},{text:'340.00',x:357,width:25},{text:'9%',x:441,width:11},{text:'1,360.00',x:544,width:32}]},
  {y:232,text:'Shure SLXD2+ Digital Wireless Handheld Microphone',items:[{text:'Shure',x:36,width:23},{text:'SLXD2+',x:59,width:29},{text:'Digital',x:88,width:25},{text:'Wireless',x:114,width:33},{text:'Handheld',x:147,width:42},{text:'Microphone',x:190,width:45}]},
  {y:271,text:'1.00 480.00 9% 480.00',items:[{text:'1.00',x:272,width:16},{text:'480.00',x:357,width:25},{text:'9%',x:441,width:11},{text:'480.00',x:551,width:25}]},
  {y:320,text:'SUBTOTAL 1840.00',items:[{text:'SUBTOTAL',x:421,width:35},{text:'1840.00',x:544,width:35}]}
]}]}]});
const taxedTables=v2ctx.InventoryHubParserV2TableDetector.detectTables(taxedWrapped);
const taxedRows=v2ctx.InventoryHubParserV2RowBuilder.buildRows(taxedWrapped,taxedTables).rows;
assert(taxedRows.length===2,'V2 Tax-column layout must reconstruct two distinct priced products');
assert(taxedRows[0].quantity===4&&taxedRows[0].unit_price===340&&taxedRows[0].amount===1360,'V2 Tax-column first product economics failed');
assert(taxedRows[1].quantity===1&&taxedRows[1].unit_price===480&&taxedRows[1].amount===480,'V2 Tax-column second product economics failed');
console.log('parser-v2-realworld-locks: noisy headers, headerless scans, metadata rejection and taxed wrapped rows PASS');


console.log('parser-v2-shadow: header independence, strict reference, same-layout variation and row completeness PASS');

const mctx={console,Number,String,Array,Object,Set,Map,RegExp,Math};mctx.globalThis=mctx;mctx.window=mctx;vm.createContext(mctx);vm.runInContext(evidenceEngine,mctx,{filename:'modules/parser-evidence-engine.js'});vm.runInContext(parserModule,mctx,{filename:'modules/parser-table.js'});
const supplierHeaderCases=[
  ['legal-company-header','AV MEDIA PTE LTD\nBlk 2023 Industrial Park\nSingapore 659528 Tel: 6569 2123','AV MEDIA PTE LTD'],
  ['labelled-vendor','VENDOR: Bright Vision Systems Pte Ltd\nGST Reg No. M2-0000000-0','Bright Vision Systems Pte Ltd'],
  ['customer-must-not-win','Northstar AV Solutions Pte Ltd\nTel: 6123 4567\nSOLD TO: Example School Pte Ltd\nCustomer Code: C100','Northstar AV Solutions Pte Ltd'],
  ['no-company-evidence','TAX INVOICE\nCustomer Code: R2002\nInvoice No: INV-1001',null]
];
for(const [id,input,expected] of supplierHeaderCases){
  const hit=mctx.InventoryHubParserEvidenceEngine.extractSupplierHeaderCandidate(input);
  assert((hit?.value||null)===expected,'Supplier header resolver '+id+' expected '+expected+' got '+(hit?.value||null));
}
console.log('supplier-header-evidence: '+supplierHeaderCases.length+'/'+supplierHeaderCases.length+' PASS');

const consolidatedEvidenceRows=mctx.InventoryHubParserEvidenceEngine.consolidateRows([
  {sku:'',item_name:'and control Panel',description:'and control Panel',quantity:4,unit_price:9588,amount:38.35,amountReviewRequired:true},
  {sku:'PT-MZI7K',item_name:'Replacement of AV Projector and control Panel',description:'Replacement of AV Projector and control Panel',quantity:4,unit_price:9588,amount:38352,layoutEvidenceVerified:true,economicEvidenceVerified:true},
  {sku:'RC-208/UK',item_name:'I/O Control Button Keypad',description:'I/O Control Button Keypad',quantity:6,unit_price:800,amount:4800}
]);
assert(consolidatedEvidenceRows.rows.length===2&&consolidatedEvidenceRows.rows.some(x=>x.sku==='PT-MZI7K')&&consolidatedEvidenceRows.rows.some(x=>x.sku==='RC-208/UK'),'Evidence engine failed to collapse fragment duplicate without losing distinct keypad row');
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
assert(/class="[^"]*v669-doc-group-body[^"]*hidden[^"]*"/.test(host.innerHTML)&&/2 items/.test(host.innerHTML)&&/ui-group__chevron[^>]*>▸</.test(host.innerHTML),'Grouped-company module output regression failed');
const invoiceHost={innerHTML:'',querySelectorAll(){return[];}};
assert(mctx.InventoryHubGroupedCompanyUI.renderGroupedCompanyCards({host:invoiceHost,groups:new Map([['AV Media Pte Ltd',[{html:'<tr></tr>'},{html:'<tr></tr>'}]]]),head:'<thead></thead>',escapeHtml:v=>String(v),itemLabel:'invoice'}),'Documents grouped-company renderer returned false');
assert(/2 invoices/.test(invoiceHost.innerHTML),'Documents grouped-company count must use invoice label');

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
console.log('All Inventory Hub v7.03.3.14x regression gates PASS.');
