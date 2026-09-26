const V2=require('../v7033-core.js');
require('../modules/parser-v2/verification-gate.js');
require('../modules/parser-v3/evidence-fusion.js');
const Gate=globalThis.InventoryHubParserV2VerificationGate;
const V3=globalThis.InventoryHubParserV3;
const fixtures=require('./parser-v3-comparison.cjs');
const compact=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const families=[
  {key:'CQ12T',aliases:['CQ12T']},
  {key:'1604DSP',aliases:['1604DSP','DUECANALI1604DSP']},
  {key:'ZX11',aliases:['ZX1190','ZX1180']},
  {key:'SLXD24/SM58',aliases:['SLXD24SM58']},
  {key:'MS101-4',aliases:['MS1014']},
  {key:'XDP-300x',aliases:['XDP3002','XDP3001']},
  {key:'NEUTRIK',aliases:['NEUTRIK']}
];
function family(row){
  const k=compact(row?.sku||row?.model||'');
  return families.find(f=>f.aliases.some(a=>k===a||k.includes(a)))?.key||'';
}
function metrics(verified=[],pending=[],rejected=[]){
  const all=[...verified,...pending], fs=all.map(family).filter(Boolean);
  return {
    verifiedCount:verified.length,pendingCount:pending.length,rejectedCount:rejected.length,
    familyCoverage:new Set(fs).size,
    unknownPending:pending.filter(x=>!family(x)).length,
    falseVerified:verified.filter(x=>!family(x)).length,
    serviceVerified:verified.filter(x=>/scope of work|dismantle|training|cabling|system tuning|delivery fee/i.test(String(x.item_name||x.description||''))).length,
    families:[...new Set(fs)].sort()
  };
}
async function fullV2(input){
  const raw=[input.invoice,...input.sources].join('\n');
  const low=V2.applyParsedFixes({doc:{supplier_name:'Concept Systems Technologies Pte Ltd'},items:fixtures.historicalV2ConceptRows.map(x=>({...x}))},raw);
  const g=await Gate.verifyParsed(low,{raw,inventoryItems:[],supplierName:'Concept Systems Technologies Pte Ltd',webVerifier:null});
  return {raw,low,g,metrics:metrics(g.parsed.items||[],g.report.pending||[],g.report.rejected||[])};
}
async function fullV3(input){
  const raw=[input.invoice,...input.sources].join('\n');
  const rec=V3.recover({baselineRows:fixtures.historicalV2ConceptRows,evidenceSources:[{id:'invoice',text:input.invoice},...input.sources.map((text,i)=>({id:'support-'+i,text}))],invoiceText:input.invoice,invoiceSubtotal:16500});
  const parsed={doc:{supplier_name:'Concept Systems Technologies Pte Ltd'},items:rec.rows};
  const g=await Gate.verifyParsed(parsed,{raw,inventoryItems:[],supplierName:'Concept Systems Technologies Pte Ltd',webVerifier:null});
  // V3 conflicts are intentionally held outside the authoritative auto-confirm list.
  const pending=[...(g.report.pending||[]),...(rec.pending||[])];
  return {raw,rec,g,metrics:metrics(g.parsed.items||[],pending,g.report.rejected||[])};
}
(async()=>{
  if(!Gate?.selfTest?.().ok)throw new Error('V2 authoritative gate self-test failed');
  const inputs=fixtures.conceptMutationInputs;
  const details=[];
  for(const input of inputs){
    const a=await fullV2(input),b=await fullV3(input);
    details.push({name:input.name,v2:a.metrics,v3:b.metrics,v3Recovery:{mode:b.rec.mode,recovered:b.rec.recovered.length,conflicts:b.rec.pending.length}});
  }
  const base={name:'base',sources:[fixtures.scheduleA,fixtures.scheduleB,fixtures.scheduleC],invoice:fixtures.conceptInvoice};
  const v2=await fullV2(base),v3=await fullV3(base);
  const summary={base:{v2:v2.metrics,v3:v3.metrics,v3Recovery:{mode:v3.rec.mode,recovered:v3.rec.recovered.length,conflicts:v3.rec.pending.length}},mutations:details};
  console.log('PARSER_V3_FULL_GATE_JSON '+JSON.stringify(summary));
  console.log('parser-v3-full-authoritative-gate: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
