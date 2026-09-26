const assert=require('assert');
const V2=require('../v7033-core.js');
require('../modules/parser-v3/evidence-fusion.js');
const V3=globalThis.InventoryHubParserV3;
if(!V3)throw new Error('Parser V3 module failed to load');

const compact=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const round=n=>Math.round(Number(n)*100)/100;
const rowView=r=>({sku:String(r?.sku||r?.model||''),quantity:Number(r?.quantity)||0,unit_price:round(Number(r?.unit_price)||0),amount:round(Number(r?.amount)||0)});
const sortedRows=rows=>(rows||[]).map(rowView).sort((a,b)=>compact(a.sku).localeCompare(compact(b.sku))||a.quantity-b.quantity||a.unit_price-b.unit_price||a.amount-b.amount);
const sameRows=(a,b)=>JSON.stringify(sortedRows(a))===JSON.stringify(sortedRows(b));
const hasSku=(rows,sku)=>rows.some(r=>compact(r.sku||r.model)===compact(sku));
const noText=(rows,re)=>rows.every(r=>!re.test([r.sku,r.item_name].filter(Boolean).join(' ')));
const uniqueSku=rows=>{const ks=rows.map(r=>compact(r.sku||r.model)).filter(Boolean);return new Set(ks).size===ks.length;};

function v2Apply(raw,items,doc={}){return V2.applyParsedFixes({doc:{...doc},items:items.map(x=>({...x}))},raw);}
function normalizeResult(x){return x?.items||x?.recovered||[];}

const normalCases=[
  {
    id:'av-media-aerospace',supplier:'AV Media Pte Ltd',
    raw:'TAX INVOICE\nInvoice No: VIN17-A32065\nPT-VW540 Panasonic PT-VW540 projector 1 804.00 804.00\nAVS320 Abtus AVS320 HDMI Control panel 1 350.00 350.00\n60200-INSTALLATION Installation work including supply and install bracket for projector 1 530.00 530.00',
    items:[
      {sku:'PT-VW540',item_name:'Panasonic PT-VW540 projector',description:'Panasonic PT-VW540 projector 5000 ANSI lumens',quantity:1,unit_price:804,amount:804,serials:'DC2210037'},
      {sku:'AVS320',item_name:'Abtus AVS320 HDMI Control panel',description:'Abtus AVS320 HDMI Control panel',quantity:1,unit_price:350,amount:350,serials:'320-T1-08078'},
      {sku:'60200-INSTALLATION',item_name:'Installation work including supply and install bracket for projector',description:'Installation work including supply and install bracket for projector',quantity:1,unit_price:530,amount:530}
    ],
    expected:['PT-VW540','AVS320'],exclude:/installation work|bracket/i
  },
  {
    id:'loud-mixed',supplier:'Loud Technologies Asia Pte Ltd',
    raw:'TAX INVOICE\nInvoice Number INV LTA-00215840\nXVive U35C Wireless System for Condenser Microphones 5.8GHz 4 340.00 1360.00\nShure SLXD2+ Digital Wireless Handheld Microphone Transmitter 1 480.00 480.00\nXVive AT-2 Portable Audio Tester 1 270.00 270.00\nXvive Audio U3 Digital Wireless Microphone System 4 275.00 1100.00\nDEL Delivery Services with return Trip for Signed Delivery Order 1 50.00 50.00',
    items:[
      {sku:'U35C',item_name:'XVive U35C Wireless System for Condenser Microphones 5.8GHz',description:'XVive U35C Wireless System for Condenser Microphones 5.8GHz',quantity:4,unit_price:340,amount:1360},
      {sku:'SLXD2+',item_name:'Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter',description:'Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter',quantity:1,unit_price:480,amount:480},
      {sku:'AT-2',item_name:'XVive AT-2 Portable Audio Tester',description:'XVive AT-2 Portable Audio Tester',quantity:1,unit_price:270,amount:270},
      {sku:'U3',item_name:'Xvive Audio U3 Digital Wireless Microphone System',description:'Xvive Audio U3 Digital Wireless Microphone System',quantity:4,unit_price:275,amount:1100},
      {sku:'DEL',item_name:'Delivery Services with return Trip for Signed Delivery Order',description:'Delivery Services with return Trip for Signed Delivery Order',quantity:1,unit_price:50,amount:50}
    ],
    expected:['U35C','SLXD2+','AT-2','U3'],exclude:/delivery|return trip/i
  },
  {
    id:'jny-rds',supplier:'JNY Integration Pte Ltd',
    raw:'Tax Invoice\nInvoice Number IV20210040\nDelivery Order Number D20210026\nAV Projection system replacement @ RDS Room3 & Room 5 including below hardware and services:\nPanasonic PT-TW381R Short Throw 3300 Lumens Projector\nProfessional Services including dismantle of existing projectors, installation of new projectors, HDMI cabling works, Testing & Commissioning',
    items:[
      {sku:'PT-TW381R',item_name:'Panasonic PT-TW381R Short Throw 3300 Lumens Projector',description:'Panasonic PT-TW381R Short Throw 3300 Lumens Projector. Professional Services including dismantle of existing projectors, installation of new projectors, Testing & Commissioning',quantity:1,unit_price:4820,amount:4820}
    ],
    expected:['PT-TW381R'],exclude:/dismant|dismount|installation|commissioning/i
  },
  {
    id:'hawko-cart',supplier:'HAWKO Trading Co Pte Ltd',
    raw:'TAX INVOICE\nZS6HKOAV-EB97E METAL TROLLEY W C+S 2 550.00 1100.00\nAdjustable height 770-970mm\nLockable Security Cabinet with key\nSingle pull out shelf for PC keyboard\n4 caster wheels 2 locking\nSolid steel construction will not topple over\nSUBTOTAL 1100.00',
    items:null,
    runV2(raw){
      return {items:V2.v703314aRecoverStructuredPricedAssetRows(raw,'v3-comparison-hawko')};
    },
    expected:['ZS6HKOAV-EB97E'],exclude:/^$a/
  },
  {
    id:'slpro-dmx200',supplier:'SL PRO GROUP PTE LTD / Clair Lighting',
    fixtureLevel:true,
    raw:'TAX INVOICE\n1 Clair Lighting DMX-200 Controller 1 350.00 350.00\n2 DMX Cable 1 25.00 25.00\n3 Delivery Fee 1 30.00 30.00',
    items:[
      {sku:'DMX-200',item_name:'Clair Lighting DMX-200 Controller',description:'Clair Lighting DMX-200 Controller',quantity:1,unit_price:350,amount:350},
      {sku:'DMX-CABLE',item_name:'DMX Cable',description:'DMX Cable',quantity:1,unit_price:25,amount:25},
      {sku:'DELIVERY',item_name:'Delivery Fee',description:'Delivery Fee',quantity:1,unit_price:30,amount:30}
    ],
    expected:['DMX-200'],exclude:/dmx cable|delivery fee/i
  }
];

function runCaseV2(c,raw=c.raw,items=c.items){
  const result=c.runV2?c.runV2(raw):v2Apply(raw,items||[]);
  return result;
}
function basePass(c,rows){
  return c.expected.every(s=>hasSku(rows,s))&&rows.length===c.expected.length&&noText(rows,c.exclude)&&uniqueSku(rows);
}
function v3On(c,v2Rows,evidenceText=c.raw){
  return V3.recover({baselineRows:v2Rows,evidenceSources:[{id:'invoice',text:evidenceText}],invoiceText:evidenceText});
}

const baseResults=[];
for(const c of normalCases){
  const v2=runCaseV2(c),v2Rows=normalizeResult(v2);
  const v3=v3On(c,v2Rows),v3Rows=v3.rows;
  const v2Pass=basePass(c,v2Rows),v3Pass=basePass(c,v3Rows)&&sameRows(v2Rows,v3Rows)&&v3.mode==='dormant';
  baseResults.push({id:c.id,supplier:c.supplier,fixtureLevel:!!c.fixtureLevel,v2Pass,v3Pass,v2Rows:sortedRows(v2Rows),v3Rows:sortedRows(v3Rows),v3Mode:v3.mode});
  assert(v2Pass,c.id+' V2 base failed');
  assert(v3Pass,c.id+' V3 base stability failed');
}

const mutationFns=[
  {name:'header-address-noise',apply:(c)=>({raw:'Supplier Address: 1 Raffles Institution Lane Singapore 575954\nInvoice No: NOISE-123\n'+c.raw,items:c.items})},
  {name:'service-candidate-injection',apply:(c)=>({raw:c.raw+'\nDismantle and install existing projector 1 999.00 999.00',items:c.items?[...c.items,{sku:'SERVICE-X',item_name:'Dismantle and install existing projector',description:'Dismantle and install existing projector',quantity:1,unit_price:999,amount:999}]:null})},
  {name:'duplicate-first-row',apply:(c)=>({raw:c.raw,items:c.items&&c.items.length?[...c.items,{...c.items[0]}]:c.items})},
  {name:'whitespace-layout-noise',apply:(c)=>({raw:c.raw.replace(/ /g,'  ').replace(/\n/g,'\n|   '),items:c.items})},
  {name:'fake-empty-support-heading',apply:(c)=>({raw:c.raw+'\nSCHEDULES OF PRICES AND TECHNICAL DATA\nScope of Work\nInstallation only',items:c.items})}
];

const mutationResults=[];
for(const c of normalCases){
  let v2Passes=0,v3Passes=0;
  const details=[];
  for(const m of mutationFns){
    const mut=m.apply(c);
    let v2;
    if(c.runV2&&m.name==='service-candidate-injection'){
      v2=c.runV2(mut.raw); // structured HAWKO extractor ignores service noise
    }else if(c.runV2&&m.name==='duplicate-first-row'){
      v2=c.runV2(mut.raw); // extractor itself should remain unique
    }else{
      v2=c.runV2?c.runV2(mut.raw):v2Apply(mut.raw,mut.items||[]);
    }
    const rows=normalizeResult(v2);
    const vp=basePass(c,rows);if(vp)v2Passes++;
    const v3=V3.recover({baselineRows:rows,evidenceSources:[{id:'mut',text:mut.raw}],invoiceText:mut.raw});
    const p3=basePass(c,v3.rows)&&sameRows(rows,v3.rows)&&['dormant','blocked'].includes(v3.mode);
    if(p3)v3Passes++;
    details.push({mutation:m.name,v2:vp,v3:p3,v3Mode:v3.mode});
  }
  mutationResults.push({id:c.id,supplier:c.supplier,v2Passes,v3Passes,total:mutationFns.length,details});
}

// Actual Concept-derived reduced evidence fixture: only equipment section + repeated schedules, no personal/banking data.
const conceptInvoice=[
'TAX INVOICE',
'No. Description Qty Unit Price Amount',
'1 RE: Sound System Replacement Setup for Y14 Parade Square 1 1,400.00 1,400.00',
'Digital Mixer console. Support up to 12 channels with 7 Multi Touch Screen',
'Model: Allen & Heath CQ12T',
'2 Digital Power Amplifier with DSP 1 2,500.00 2,500.00',
'Model: Powersoft Duecanali 1604DSP',
'3 Passive Loudspeakers with mounting brackets 6 800.00 4,800.00',
'Model: Electrovoice ZX11-90',
'4 Single Channel Digital Wireless Handheld Microphone System corrupted stamp text',
'Model: Shure SLXD24/SM58',
'5 Monitor Speaker at the console corrupted stamp text',
'Model: Yamaha MS101-4',
'6 Dual CD and MP3 player with USB supported Playback 1 950.00 950.00',
'Model: Omnitronic XDP-3002',
'Note: replaced with XDP-3001',
'7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00',
'Model: Neutrik',
'8 (B) Scope of Work: 1 1,800.00',
'9 Supply and install the new equipment specified in Section 2 1 500.00 500.00',
'10 Supply and install cabling 1 300.00 300.00',
'11 Provide labelling and tidying the cabling setups 1 100.00 100.00',
'12 System tuning and calibration and DSP programming 1 500.00 500.00',
'13 Provide operational training 1 300.00 300.00',
'14 All installation work must include tools and safety documents 1 800.00 800.00',
'Subtotal 16,500.00'
].join('\n');

const scheduleA=[
'SCHEDULES OF PRICES AND TECHNICAL DATA',
'Section 2 Technical Specifications for AV Equipment',
'1 Digital Mixer console Support up to 12 channels Allen & Heath CQ12T UK 1 $1,400.00 $1,400.00',
'2 Digital Power Amplifier with DSP Powersoft Duecanali 1604DSP Italy 1 $2,500.00 $2,500.00',
'3 Passive Loudspeakers with mounting brackets Electrovoice ZX11-80 USA 6 $800.00 $4,800.00',
'4 Single Channel Digital Wireless Handheld Microphone System Shure SLXD24/SM58 USA 2 $950.00 $1,900.00',
'Monitor Speaker at the console Yamaha MS101-4 Japan 1 $200.00 $200.00',
'6 Dual CD and MP3 player with USB supported Playback Omnitronic XDP-3002 China 1 $950.00 $950.00',
'7 Supply & Install Outdoor Dual Microphone Wall Receptacle Neutrik Neutrik MY 1 $450.00 $450.00',
'9 Scope of Work',
'9.1 Dismantle remove old speakers and AV equipment 1 $1,800.00 $1,800.00',
'Total Amount = $16,500.00'
].join('\n');
const scheduleB=scheduleA
  .replace('4 Single Channel Digital Wireless Handheld Microphone System Shure SLXD24/SM58 USA 2 $950.00 $1,900.00','4 Single Channel Digital Wireless Handheld Microphone System Shure SLXD24/SM58 USA 2 $850.00 $1,900.00')
  .replace('Monitor Speaker at the console Yamaha MS101-4 Japan 1 $200.00 $200.00','Monitor Speaker at the console Yamaha MS101-4 Japan 1 $5,200.00 $200.00');
const scheduleC=scheduleA.replace('Allen & Heath CQ12T','Allen & Heath ca1zr');

const historicalV2ConceptRows=[
  {sku:'1604DSP',model:'1604DSP',item_name:'Digital Power Amplifier with DSP',description:'Digital Power Amplifier with DSP',quantity:1,unit_price:2500,amount:2500},
  {sku:'MS101-4',model:'MS101-4',item_name:'Monitor Speaker at the console',description:'Monitor Speaker at the console',quantity:1,unit_price:200,amount:200}
];

function conceptRun(sources=[scheduleA,scheduleB,scheduleC],invoice=conceptInvoice,baseline=historicalV2ConceptRows){
  return V3.recover({
    baselineRows:baseline,
    evidenceSources:[{id:'invoice',text:invoice},...sources.map((text,i)=>({id:'support-'+(i+1),text}))],
    invoiceText:invoice,
    invoiceSubtotal:16500
  });
}

const concept=conceptRun();
const conceptVerified=concept.rows;
const conceptStructural=concept.rows.length+concept.pending.length;
const conceptChecks={
  mode:concept.mode==='active',
  structural7:conceptStructural===7,
  verified5:concept.rows.length===5,
  pending2:concept.pending.length===2,
  hasCQ12T:hasSku(concept.rows,'CQ12T'),
  has1604:hasSku(concept.rows,'1604DSP'),
  hasMS101:hasSku(concept.rows,'MS101-4'),
  hasMic:hasSku(concept.rows,'SLXD24/SM58'),
  hasNeutrik:hasSku(concept.rows,'Neutrik'),
  zxConflict:concept.pending.some(x=>x.reason==='model-source-conflict'&&compact(x.sku)==='ZX1190'),
  replacementConflict:concept.pending.some(x=>x.reason==='replacement-note-conflict'&&compact(x.sku)==='XDP3002'),
  noServices:[...concept.rows,...concept.pending].every(x=>!/scope of work|dismantle|training|cabling|system tuning/i.test(String(x.item_name||x.description||''))),
  noUnknown:[...concept.rows,...concept.pending].every(x=>String(x.sku||x.model||'').trim())
};
for(const [k,v] of Object.entries(conceptChecks))assert(v,'Concept V3 check failed: '+k+' result='+JSON.stringify(concept,null,2));

const conceptMutations=[
  {
    name:'duplicate-support-alias-does-not-inflate-votes',
    run:()=>conceptRun([scheduleA,scheduleA,scheduleB,scheduleC]),
    pass:r=>r.rows.length===5&&r.pending.length===2
  },
  {
    name:'single-misread-row4-price-consensus',
    run:()=>conceptRun([scheduleA,scheduleB,scheduleC]),
    pass:r=>r.rows.concat(r.pending).some(x=>compact(x.sku)==='SLXD24SM58'&&Number(x.unit_price)===950&&Number(x.amount)===1900)
  },
  {
    name:'missing-row5-ordinal-bounded-gap',
    run:()=>conceptRun([scheduleA,scheduleB,scheduleC]),
    pass:r=>r.rows.some(x=>compact(x.sku)==='MS1014'&&Number(x.amount)===200)
  },
  {
    name:'one-support-total-missing',
    run:()=>conceptRun([scheduleA.replace('Total Amount = $16,500.00',''),scheduleB,scheduleC]),
    pass:r=>r.mode==='active'&&r.rows.length===5&&r.pending.length===2
  },
  {
    name:'scope-service-injection-stays-excluded',
    run:()=>conceptRun([scheduleA.replace('9 Scope of Work','8 Fake Delivery Fee 1 $999.00 $999.00\n9 Scope of Work'),scheduleB,scheduleC]),
    pass:r=>[...r.rows,...r.pending].every(x=>!/Delivery Fee/i.test(String(x.description||'')))
  },
  {
    name:'invoice-address-header-noise',
    run:()=>conceptRun([scheduleA,scheduleB,scheduleC],'Address: One Example Lane Singapore 575954\nSupplier Pte Ltd\n'+conceptInvoice),
    pass:r=>r.rows.length===5&&r.pending.length===2&&[...r.rows,...r.pending].every(x=>!/Example Lane|Supplier Pte/i.test(String(x.description||'')))
  },
  {
    name:'one-support-only-fails-closed',
    run:()=>conceptRun([scheduleA]),
    pass:r=>r.recovered.length===0&&r.rows.length===historicalV2ConceptRows.length&&r.pending.length>=1
  },
  {
    name:'two-way-price-conflict-fails-closed',
    run:()=>conceptRun([scheduleA,scheduleB]),
    pass:r=>!r.recovered.some(x=>compact(x.sku)==='SLXD24SM58')
  },
  {
    name:'model-conflict-never-auto-resolves',
    run:()=>conceptRun([scheduleA,scheduleB,scheduleC]),
    pass:r=>r.pending.some(x=>x.reason==='model-source-conflict'&&compact(x.sku)==='ZX1190')
  },
  {
    name:'replacement-conflict-never-auto-resolves',
    run:()=>conceptRun([scheduleA,scheduleB,scheduleC]),
    pass:r=>r.pending.some(x=>x.reason==='replacement-note-conflict'&&compact(x.sku)==='XDP3002')
  }
];
let conceptMutationPass=0;
const conceptMutationDetails=[];
for(const m of conceptMutations){
  const r=m.run(),pass=!!m.pass(r);if(pass)conceptMutationPass++;
  conceptMutationDetails.push({name:m.name,pass,mode:r.mode,verified:r.rows.length,pending:r.pending.length,recovered:r.recovered.length,structuralCoverage:r.rows.length+r.pending.length});
}

// Symmetric Concept mutation inputs for the saved V2 baseline.
// This is a fixture-level mutation comparison starting from the historically observed two verified V2 rows;
// it is NOT represented as a fresh browser/PDF OCR run.
const conceptMutationInputs=[
  {name:'duplicate-support-alias-does-not-inflate-votes',sources:[scheduleA,scheduleA,scheduleB,scheduleC],invoice:conceptInvoice},
  {name:'single-misread-row4-price-consensus',sources:[scheduleA,scheduleB,scheduleC],invoice:conceptInvoice},
  {name:'missing-row5-ordinal-bounded-gap',sources:[scheduleA,scheduleB,scheduleC],invoice:conceptInvoice},
  {name:'one-support-total-missing',sources:[scheduleA.replace('Total Amount = $16,500.00',''),scheduleB,scheduleC],invoice:conceptInvoice},
  {name:'scope-service-injection-stays-excluded',sources:[scheduleA.replace('9 Scope of Work','8 Fake Delivery Fee 1 $999.00 $999.00\\n9 Scope of Work'),scheduleB,scheduleC],invoice:conceptInvoice},
  {name:'invoice-address-header-noise',sources:[scheduleA,scheduleB,scheduleC],invoice:'Address: One Example Lane Singapore 575954\\nSupplier Pte Ltd\\n'+conceptInvoice},
  {name:'one-support-only-fails-closed',sources:[scheduleA],invoice:conceptInvoice},
  {name:'two-way-price-conflict-fails-closed',sources:[scheduleA,scheduleB],invoice:conceptInvoice},
  {name:'model-conflict-never-auto-resolves',sources:[scheduleA,scheduleB,scheduleC],invoice:conceptInvoice},
  {name:'replacement-conflict-never-auto-resolves',sources:[scheduleA,scheduleB,scheduleC],invoice:conceptInvoice}
];
const conceptFamilies=[
  {key:'CQ12T',aliases:['CQ12T']},
  {key:'1604DSP',aliases:['1604DSP','DUECANALI1604DSP']},
  {key:'ZX11',aliases:['ZX1190','ZX1180']},
  {key:'SLXD24/SM58',aliases:['SLXD24SM58']},
  {key:'MS101-4',aliases:['MS1014']},
  {key:'XDP-300x',aliases:['XDP3002','XDP3001']},
  {key:'NEUTRIK',aliases:['NEUTRIK']}
];
function conceptFamilyFor(row){
  const k=compact(row?.sku||row?.model||'');
  return conceptFamilies.find(f=>f.aliases.some(a=>k===a||k.includes(a)))?.key||'';
}
function conceptMetrics(rows=[]){
  const families=rows.map(conceptFamilyFor).filter(Boolean);
  const serviceCount=rows.filter(r=>/scope of work|dismantle|training|cabling|system tuning|delivery fee/i.test(String(r.item_name||r.description||''))).length;
  const falsePositiveCount=rows.filter(r=>!conceptFamilyFor(r)).length;
  const duplicateCount=families.length-new Set(families).size;
  return {coverage:new Set(families).size,falsePositiveCount,serviceCount,duplicateCount,rows:sortedRows(rows)};
}
const v2ConceptMutationDetails=[];
for(const m of conceptMutationInputs){
  const raw=[m.invoice,...m.sources].join('\\n');
  const parsed=V2.applyParsedFixes({doc:{supplier_name:'Concept Systems Technologies Pte Ltd'},items:historicalV2ConceptRows.map(x=>({...x}))},raw);
  const metrics=conceptMetrics(parsed.items||[]);
  v2ConceptMutationDetails.push({name:m.name,...metrics,safe:metrics.falsePositiveCount===0&&metrics.serviceCount===0&&metrics.duplicateCount===0});
}

// Run the existing V2 historical suite as an independent stability control.
const hist=V2.runHistoricalRegressionChecks();
assert(hist.ok,'V2 historical regression suite failed on experimental branch');

const summary={
  parserV2Version:V2.VERSION,
  parserV3Version:V3.VERSION,
  v3SelfTest:V3.selfTest(),
  v2Historical:{ok:hist.ok,logicalCases:hist.logical_cases,representedFiles:hist.represented_files,failures:hist.failures},
  normalSupplierBase:baseResults,
  normalSupplierMutations:mutationResults,
  concept:{
    v2BaselineType:'historical-observed-two-row-baseline-not-fresh-browser-run',
    v2HistoricalRows:sortedRows(historicalV2ConceptRows),
    v3Mode:concept.mode,
    v3VerifiedRows:sortedRows(concept.rows),
    v3Pending:concept.pending.map(x=>({sku:x.sku,reason:x.reason,supportModel:x.supportModel||'',replacementModel:x.replacementModel||'',quantity:x.quantity,unit_price:x.unit_price,amount:x.amount})),
    structuralCoverage:conceptStructural,
    checks:conceptChecks
  },
  conceptMutations:{
    v3:{passed:conceptMutationPass,total:conceptMutations.length,details:conceptMutationDetails},
    v2:{baselineType:'historical-observed-two-row-baseline-not-fresh-browser-run',details:v2ConceptMutationDetails}
  }
};
console.log('PARSER_V3_COMPARISON_JSON '+JSON.stringify(summary));
console.log('parser-v3-comparison: PASS');
module.exports={conceptInvoice,scheduleA,scheduleB,scheduleC,historicalV2ConceptRows,conceptRun,conceptMutationInputs,conceptMetrics};
