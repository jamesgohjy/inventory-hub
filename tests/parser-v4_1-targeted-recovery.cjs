const fs=require('fs'),vm=require('vm');
const V7033=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');

const ctx={console,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl,setTimeout,clearTimeout};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);
for(const path of [
  'modules/parser-v2/evidence-model.js',
  'modules/parser-v2/table-detector.js',
  'modules/parser-v2/numbered-schedule.js',
  'modules/parser-v2/verification-gate.js',
  'modules/parser-v3/engine.js',
  'modules/parser-v4-review-bridge.js',
  'modules/parser-v4_1-shadow.js'
]) vm.runInContext(read(path),ctx,{filename:path});

const V2=ctx.InventoryHubParserV2VerificationGate;
const V3=ctx.InventoryHubParserV3;
const V4Review=ctx.InventoryHubParserV4ReviewBridge;
const V41=ctx.InventoryHubParserV41Shadow;
assert(V41?.selfTest?.().ok,'V4.1 targeted recovery self-test failed');

function clone(v){return JSON.parse(JSON.stringify(v));}
function loadSupplierCases(){
  const src=read('tests/parser-v4-unseen-holdout.cjs');
  const start=src.indexOf('const cases='),end=src.indexOf('];\n\nconst key=',start);
  assert(start>=0&&end>start,'Unable to load supplier holdouts');
  return vm.runInNewContext('('+src.slice(start+'const cases='.length,end+1)+')');
}
async function runV4(test){
  const rows=V7033.v703314pRecoverEquipmentRows(test.raw,'v4.1-targeted-recovery-test');
  const parsed={doc:{supplier_name:test.supplier,invoice_number:test.invoice},items:rows,invoiceClassification:{type:'equipment'},raw:test.raw};
  const v2=await V2.verifyParsed(parsed,{raw:test.raw,inventoryItems:[],supplierName:test.supplier,doc:parsed.doc,webVerifier:null});
  const v3=await V3.evaluate(v2.parsed,{fullEvidence:[{source:'holdout-native',kind:'native',text:test.raw,layout:[]}],inventoryItems:[],verifyGate:V2,webVerifier:null});
  return V4Review.materialize(v3.parsed,rows);
}
function randomToken(i){
  const pool=['Q7XZ9K2P','T7F8K5W6','Z9Q2X7M4','R8V3K6T2','P7X4Q9N6','M8Z2T5K7'];
  return pool[i%pool.length];
}

// 1) Geometry-locked recovery: all identity fields are contaminated at once.
const fixtures=JSON.parse(read('tests/parser-accuracy-fixtures-v7.03.3.14u.json')).cases;
const geometry=fixtures.find(x=>x.id==='header-separated-equipment-service');
assert(geometry,'Geometry fixture missing');
{
  const row={
    sku:'Q7XZ9K2P',model:'T7F8K5W6',item_name:'Z9Q2X7M4',description:'R8V3K6T2',
    quantity:2,unit_price:350,amount:700,
    provenance:{page:1,rowIndexes:[1],source:'fixture-layout'}
  };
  const result=V41.recoverRows([row],{layout:geometry.layout,raw:'TAX INVOICE'});
  assert(result.randomCharacterFailureCount===0,'Geometry recovery left random characters');
  assert(result.outputRows[0].sku==='AVS-320','Geometry SKU recovery failed: '+result.outputRows[0].sku);
  assert(result.outputRows[0].model==='AVS-320','Geometry model recovery failed');
  assert(/Projector controller/i.test(result.outputRows[0].item_name),'Geometry item-name recovery failed');
  assert(/Projector controller/i.test(result.outputRows[0].description),'Geometry description recovery failed');
  assert(result.targetedRecoveryCount===4,'Expected four geometry recoveries, got '+result.targetedRecoveryCount);
  console.log('V4.1 GEOMETRY CELL RECOVERY: 4/4 PASS');
}

// 2) Multi-line geometry with wrapped description/warranty/economic anchor.
const multiline=fixtures.find(x=>x.id==='multiline-warranty-numeric-row');
assert(multiline,'Multiline fixture missing');
{
  const row={
    sku:'Q7XZ9K2P',model:'T7F8K5W6',item_name:'Z9Q2X7M4',description:'R8V3K6T2',
    quantity:4,unit_price:340,amount:1360,
    provenance:{page:1,rowIndexes:[1,2,3],source:'fixture-layout'}
  };
  const result=V41.recoverRows([row],{layout:multiline.layout,raw:'TAX INVOICE'});
  assert(result.randomCharacterFailureCount===0,'Multiline recovery left random characters');
  assert(result.outputRows[0].sku==='U35C','Multiline SKU recovery failed: '+result.outputRows[0].sku);
  assert(/Wireless System/i.test(result.outputRows[0].item_name),'Multiline description recovery failed');
  assert(!/Warranty/i.test(result.outputRows[0].item_name),'Warranty contaminated recovered item name');
  console.log('V4.1 MULTILINE SOURCE-REGION RECOVERY: PASS');
}

// 3) A token elsewhere on the same page must not validate the current row.
{
  const raw='TAX INVOICE\nAVS-320 Projector controller 2 350.00 700.00\nQ7XZ9K2P unrelated footer text';
  const row={sku:'Q7XZ9K2P',model:'AVS-320',item_name:'Projector controller',description:'Projector controller',quantity:2,unit_price:350,amount:700,provenance:{rawText:'AVS-320 Projector controller 2 350.00 700.00'}};
  const audit=V41.auditRows([row],{raw});
  assert(audit.randomCharacterFailureCount===1,'Cross-row random token was incorrectly accepted');
  const recovered=V41.recoverRows([row],{raw});
  assert(recovered.outputRows[0].sku==='AVS-320','Cross-row targeted recovery failed');
  console.log('V4.1 CROSS-ROW CONTAMINATION LOCK: PASS');
}

// 4) Targeted OCR consensus may recover a field when the source row has no readable model.
{
  const row={sku:'Q7XZ9K2P',model:'',item_name:'Wireless microphone',description:'Wireless microphone',quantity:1,unit_price:90,amount:90,provenance:{page:1,rowIndexes:[4],rawText:'Wireless microphone 1 90.00 90.00'}};
  const targetedEvidence=[
    {field:'sku',page:1,rowIndexes:[4],source:'targeted-ocr-a',value:'PGA58-LC'},
    {field:'sku',page:1,rowIndexes:[4],source:'targeted-ocr-b',value:'PGA58-LC'}
  ];
  const recovered=V41.recoverRows([row],{targetedEvidence});
  assert(recovered.outputRows[0].sku==='PGA58-LC','Two-source targeted OCR consensus did not recover SKU');
  assert(recovered.randomCharacterFailureCount===0,'Recovered OCR value did not pass re-audit');
  console.log('V4.1 TARGETED OCR CONSENSUS: 2/2 SOURCES PASS');
}

// 5) Conflicting targeted OCR must remain blank/review, never guessed.
{
  const row={sku:'Q7XZ9K2P',model:'',item_name:'Wireless microphone',description:'Wireless microphone',quantity:1,unit_price:90,amount:90,provenance:{page:1,rowIndexes:[4],rawText:'Wireless microphone 1 90.00 90.00'}};
  const targetedEvidence=[
    {field:'sku',page:1,rowIndexes:[4],source:'targeted-ocr-a',value:'PGA58-LC'},
    {field:'sku',page:1,rowIndexes:[4],source:'targeted-ocr-b',value:'PGA5B-LC'}
  ];
  const recovered=V41.recoverRows([row],{targetedEvidence});
  assert(recovered.outputRows[0].sku==='','Conflicting OCR evidence must not guess a SKU');
  assert(recovered.randomCharacterFailureCount===0,'Conflicting OCR left random characters');
  assert(recovered.unresolvedRecoveryCount>=1,'Conflicting OCR should remain review-required');
  console.log('V4.1 CONFLICTING OCR FAIL-CLOSED: PASS');
}

// 6) Cross-row semantic contamination: microphone row must never keep amplifier text.
{
  const raw='Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter with SM58 Cardioid Capsule (Freq: G66) 1 480.00 480.00';
  const row={
    sku:'SLXD24/SM58',
    item_name:'Single Channel Digital Wireless Handheld Mic',
    description:'Digital Power Amplifier with DSP',
    quantity:1,unit_price:480,amount:480,
    provenance:{rawText:raw}
  };
  const audit=V41.auditRows([row],{raw});
  assert(audit.hardFailures.some(x=>x.field==='description'&&x.code==='cross-row-equipment-class-contamination'),
    'Cross-row microphone/amplifier contamination was not detected');
  const recovered=V41.recoverRows([row],{raw});
  assert(recovered.randomCharacterFailureCount===0,'Cross-row contamination survived recovery');
  assert(recovered.outputRows[0].description!=='Digital Power Amplifier with DSP','Amplifier contamination remained in microphone row');
  console.log('V4.1 CROSS-ROW EQUIPMENT CLASS CONTAMINATION: PASS');
}

// 7) Numeric/text fragments from neighbouring rows must not pollute a description.
{
  const raw='HZMZ-84X84 ABTUS 84 x 84 Motorized Screen (Synchronous) c/w Abtus SSR8 screen switch';
  const row={
    sku:'HZMZ-84X84',
    item_name:'Motorized Screen',
    description:'(Synchronous) 84 motorised 1 230.00 230.00 plifier 5 29.50 147.50',
    quantity:2,unit_price:430,amount:860,
    provenance:{rawText:raw}
  };
  const audit=V41.auditRows([row],{raw});
  assert(audit.hardFailures.some(x=>x.field==='description'&&x.code==='source-region-content-contamination'),
    'Numeric/source-region contamination was not detected');
  const recovered=V41.recoverRows([row],{raw});
  assert(recovered.randomCharacterFailureCount===0,'Numeric contamination survived recovery');
  assert(!/230\.00|147\.50|plifier/.test(recovered.outputRows[0].description),'Neighbour-row fragments remained after recovery');
  console.log('V4.1 NUMERIC SOURCE-REGION CONTAMINATION: PASS');
}

// 8) Source-backed invoice spelling/wording must not be treated as contamination.
{
  const raw='Monitor Speeker at the console Yamaha MS101-4 Japan 1 200.00 200.00';
  const row={
    sku:'MS101-4',
    item_name:'Monitor Speaker',
    description:'Monitor Speeker at the console Yamaha MS101-4 Japan',
    quantity:1,unit_price:200,amount:200,
    provenance:{rawText:raw}
  };
  const audit=V41.auditRows([row],{raw});
  assert(audit.hardFailures.length===0,'Source-backed spelling variant was falsely flagged');
  console.log('V4.1 SOURCE-BACKED TYPO FALSE-POSITIVE GUARD: PASS');
}

// 9) Randomized multi-supplier targeted recovery.
(async()=>{
  const cases=loadSupplierCases();
  assert(cases.length>=5,'Expected five supplier cases');
  let total=0,recoveredCount=0,safeBlankCount=0;
  for(let ci=0;ci<cases.length;ci++){
    const test=cases[(ci*3+2)%cases.length];
    const v4=await runV4(test);
    assert((v4.items||[]).length>0,'No V4 rows for supplier '+test.supplier);
    const base=(v4.items||[])[0];
    const region=V41.bestRawRegion(base,'sku',{raw:test.raw})||V41.bestRawRegion(base,'item_name',{raw:test.raw});
    assert(region,'Could not localize source row for supplier '+test.supplier);
    const original={sku:String(base.sku||''),model:String(base.model||''),item_name:String(base.item_name||''),description:String(base.description||'')};
    const mutations=[
      ['item_name','description'],
      ['description','item_name'],
      ['sku','model'],
      ['model','sku']
    ];
    let supplierPass=0;
    for(let mi=0;mi<mutations.length;mi++){
      const [field,twin]=mutations[mi];
      if(!String(base[field]||'').trim()&&!String(base[twin]||'').trim())continue;
      const row=clone(base);
      row.provenance={...(row.provenance||{}),rawText:region.text};
      row[field]=randomToken(ci*7+mi);
      if(field==='sku'&&!String(row.model||'').trim()&&original.sku)row.model=original.sku;
      if(field==='model'&&!String(row.sku||'').trim()&&original.sku)row.sku=original.sku;
      if(field==='item_name'&&!String(row.description||'').trim()&&original.item_name)row.description=original.item_name;
      if(field==='description'&&!String(row.item_name||'').trim()&&original.description)row.item_name=original.description;
      const result=V41.recoverRows([row],{raw:test.raw,sources:[{source:'holdout-native',text:test.raw}]});
      assert(result.randomCharacterFailureCount===0,'Random characters survived recovery for '+test.supplier+' '+field);
      const value=String(result.outputRows[0][field]||'');
      if(value&&value!==randomToken(ci*7+mi))recoveredCount++;else if(!value)safeBlankCount++;
      assert(value!==randomToken(ci*7+mi),'Contaminated field remained for '+test.supplier+' '+field);
      supplierPass++;total++;
    }
    assert(supplierPass>=2,'Insufficient supplier recovery mutations for '+test.supplier);
    console.log('V4.1 SUPPLIER TARGETED RECOVERY '+test.supplier+': '+supplierPass+'/'+supplierPass+' PASS');
  }
  assert(total>=10,'Expected at least 10 supplier recovery mutations');
  console.log('V4.1 SUPPLIER TARGETED RECOVERY SUMMARY: '+total+'/'+total+' PASS');
  console.log('V4.1 TARGETED RECOVERED VALUES: '+recoveredCount);
  console.log('V4.1 SAFE BLANK/REVIEW FALLBACKS: '+safeBlankCount);
  console.log('V4.1 RANDOM CHARACTERS SURVIVING: 0');
  console.log('V4.1 TARGETED RECOVERY MODE: SHADOW ONLY; production Parser V4 unchanged');
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
