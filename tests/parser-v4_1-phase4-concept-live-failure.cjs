const V=require('../v7033-core.js');
require('../modules/parser-v4_1-shadow.js');
const V41=globalThis.InventoryHubParserV41Shadow;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const key=r=>norm([r.sku,r.model,r.item_name,r.description].filter(Boolean).join(' '));
const near=(a,b)=>a!=null&&Math.abs(Number(a)-Number(b))<=.06;

// Reproduces the live Concept failure seen in Phase 4:
// - a Scope-of-Work row entered Review as "the new equipment specified..." with 0/0
// - the wall receptacle lost its model and its Standard Item Name was OCR-degraded.
// Authoritative OCR witnesses remain invoice-only and are supplied independently.
const ocrA=`TAX INVOICE
No. Description Qty Unit Price Amount
1 RE: Sound System Replacement Setup for Y14 Parade Square 1 1,400.00 1,400.00
(A) Section 2: Technical Specifications for AV Equipment
Digital Mixer console. Support up to 12 channels with 7” Multi Touch Screen
Model: Allen & Heath CQ12T
2 Digital Power Amplifier with DSP 1 2,500.00 2,500.00
Model: Powersoft Duecanali 1604DSP
3 Passive Loudspeakers with mounting brackets 6 800.00 4,800.00
Model: Electrovoice ZX1I-90
4 Single Channel Digital Wireless Handheld Microphone System 2 OCR-DAMAGED OCR-DAMAGED
Model: Shure SLXD24/SM58
5 Monitor Speaker at the console 1 OCR-DAMAGED OCR-DAMAGED
Model: Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback 1 OCR-DAMAGED OCR-DAMAGED
Model: Omnitronic XDP-3002
Note: replaced with XDP-3001
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model: Neutrik
8 (B) Scope of Work 1 1,800.00 1,800.00
9 Supply and install the new equipment specified in Section 2. Includes racking, mounting kits 1 500.00 500.00
10 Supply and install cabling electrical audio data signal 1 300.00 300.00
11 Provide labelling and tidying the cabling setups. 1 100.00 100.00`;

const ocrB=ocrA.replace('ZX1I-90','Z2X1I-90');
const ocrC=ocrA;

const sources=[
 {source:'phase4-live-concept-auto',kind:'ocr',text:ocrA,layout:[]},
 {source:'phase4-live-concept-column',kind:'ocr',text:ocrB,layout:[]},
 {source:'phase4-live-concept-block',kind:'ocr',text:ocrC,layout:[]}
];

// Simulated live downstream materialisation, based on the user's production screenshot.
const degradedLiveRows=[
 {sku:'',item_name:'the new equipment specified in',description:'the new equipment specified in Section 2 Includes racking mounting kits',quantity:1,unit_price:0,amount:0,humanReviewRequired:true,needsReview:true},
 {sku:'',item_name:'Quidoar Dual Microphone Wall Receptacle',description:'Quidoar Dual Microphone Wall Receptacle',quantity:1,unit_price:450,amount:450,humanReviewRequired:true,needsReview:true}
];

const recovered=V.v703312jRecoverNumberedEquipmentRows(ocrA,sources);
assert(recovered.length===7,'authoritative Concept recovery must yield 7 rows, got '+recovered.length);

const merged=V.v703312jMergeTrackedRows(degradedLiveRows,recovered,ocrA);
const audited=V41.recoverRows(merged,{raw:ocrA,sources});
const rows=audited.outputRows;

assert(rows.length===7,'live Concept reconciliation must yield exactly 7 equipment rows, got '+rows.length);
assert(!rows.some(r=>/the new equipment specified|racking|mounting kits|cabling|labelling|tidying/i.test(String(r.item_name||r.description||''))),
  'Scope-of-Work/service row survived reconciliation');

const req=(id,q,p,a)=>{
  const r=rows.find(x=>key(x).includes(norm(id)));
  assert(r,'missing '+id);
  assert(Number(r.quantity)===q,id+' qty mismatch '+r.quantity);
  if(p!=null)assert(near(r.unit_price,p)&&near(r.amount,a),id+' economics mismatch '+r.unit_price+'/'+r.amount);
  return r;
};
req('CQ12T',1,1400,1400);
req('1604DSP',1,2500,2500);
req('ZX1I90',6,800,4800);
req('SLXD24SM58',2,null,null);
req('MS1014',1,null,null);
const xdp=req('XDP3002',1,null,null);
assert(norm(xdp.v703314zReplacementModel)==='XDP3001','XDP replacement evidence lost');
const neutrik=req('NEUTRIK',1,450,450);
assert(norm(neutrik.sku||neutrik.model)==='NEUTRIK','Neutrik model not restored');
assert(/outdoor\s+dual\s+microphone\s+wall\s+receptacle/i.test(String(neutrik.item_name||neutrik.description||'')),
  'wall receptacle Standard Item Name not repaired from authoritative evidence: '+JSON.stringify(neutrik));

assert(audited.randomCharacterFailureCount===0,'random-character hard failure survived');

console.log('PHASE4 CONCEPT LIVE FAILURE REPRODUCTION: PASS');
console.log('PHASE4 CONCEPT LIVE SERVICE EXCLUSION: PASS');
console.log('PHASE4 CONCEPT LIVE AUTHORITATIVE RECONCILIATION: PASS rows='+rows.length+'/7');
console.log('PHASE4 CONCEPT LIVE NEUTRIK REPAIR: PASS sku='+neutrik.sku+' item='+neutrik.item_name+' unit='+neutrik.unit_price+' amount='+neutrik.amount);
console.log('PHASE4 CONCEPT LIVE SUMMARY: PASS');
