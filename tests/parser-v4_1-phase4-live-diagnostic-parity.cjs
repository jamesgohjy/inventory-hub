const V=require('../v7033-core.js');
require('../modules/parser-v4_1-shadow.js');
const V41=globalThis.InventoryHubParserV41Shadow;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const key=r=>norm([r.sku,r.model,r.item_name,r.description].filter(Boolean).join(' '));
const near=(a,b)=>a!=null&&Math.abs(Number(a)-Number(b))<=.06;

const invoice=`TAX INVOICE
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
9 Supply and install the new equipment specified in Section 2. Includesracking, mounting kits 1 500.00 500.00
10 Supply and install cabling electrical audio data signal 1 300.00 300.00
11 Provide labelling and tidying the cabling setups. 1 100.00 100.00`;

const sources=[
 {source:'live-auto',kind:'ocr',text:invoice,layout:[]},
 {source:'live-column',kind:'ocr',text:invoice.replace('ZX1I-90','Z2X1I-90'),layout:[]},
 {source:'live-block',kind:'ocr',text:invoice.replace('Support up to 12 channels','Supports up to 12 channels'),layout:[]}
];

// Representative live downstream fragments copied from the failure shape shown in Parser Diagnostics.
const degraded=[
 {sku:'',item_name:'the new equipment specified in Section 2. Includesracking',description:'the new equipment specified in Section 2. Includesracking mounting kits',quantity:1,unit_price:0,amount:0},
 {sku:'',item_name:'Quidoar Dual Microphone Wall Receptacle Neutrik',description:'Quidoar Dual Microphone Wall Receptacle Neutrik',quantity:1,unit_price:450,amount:450},
 {sku:'',item_name:'and brackets',description:'and brackets',quantity:6,unit_price:800,amount:4800},
 {sku:'',item_name:'Digital Power Amplifier with DSP',description:'Digital Power Amplifier with DSP',quantity:1,unit_price:2500,amount:2500},
 {sku:'',item_name:'Single Channel Digital Wireless Handheld Microphone System',description:'Single Channel Digital Wireless Handheld Microphone System',quantity:2,unit_price:null,amount:null},
 {sku:'SLXD24/SM58',item_name:'Shure SLXD24/SM58 usa',description:'Single Channel Digital Wireless Handheld Microphone System',quantity:2,unit_price:null,amount:null},
 {sku:'',item_name:'Digital Mixer console. Support up to 12 channels with 7” Multi Touch Screen',description:'Digital Mixer console. Support up to 12 channels with 7” Multi Touch Screen',quantity:1,unit_price:1400,amount:1400},
 {sku:'',item_name:'Supply & Install Outdoor Dual Microphone Wall Receptacle Neutrik',description:'Supply & Install Outdoor Dual Microphone Wall Receptacle Neutrik',quantity:1,unit_price:450,amount:450},
 {sku:'1604DSP',item_name:'with DSP 1 Duecanali 1604DSP',description:'Digital Power Amplifier with DSP',quantity:1,unit_price:2500,amount:2500},
 {sku:'XDP-3002',item_name:'Dual CD and MP3 player with USB supported Playback',description:'Dual CD and MP3 player with USB supported Playback',quantity:1,unit_price:null,amount:null},
 {sku:'ZX1I-90',item_name:'Passive Loudspeakers with mounting brackets',description:'Passive Loudspeakers with mounting brackets',quantity:6,unit_price:800,amount:4800},
 {sku:'MS101-4',item_name:'Monitor Speaker at the console',description:'Monitor Speaker at the console',quantity:1,unit_price:null,amount:null},
 {sku:'CQ12T',item_name:'Digital Mixer console',description:'Digital Mixer console. Support up to 12 channels with 7” Multi Touch Screen',quantity:1,unit_price:1400,amount:1400}
];

const parsed=V.applyParsedFixes({doc:{supplier_name:'Concept Systems Technologies'},items:degraded},invoice,sources);
console.log('RECOVERY1 PARITY PRE-V41: '+JSON.stringify((parsed.items||[]).map(x=>({sku:x.sku||x.model||'',item:x.item_name||'',q:x.quantity,p:x.unit_price,a:x.amount,source:x.v7033Identity?.source||x.v703312kSource||'',sourceLine:x.v703312kSourceLine||''}))));
const audited=V41.recoverRows(parsed.items,{raw:invoice,sources});
console.log('RECOVERY1 PARITY POST-V41: '+JSON.stringify((audited.outputRows||[]).map(x=>({sku:x.sku||x.model||'',item:x.item_name||'',q:x.quantity,p:x.unit_price,a:x.amount,review:!!(x.humanReviewRequired||x.needsReview)}))));
const items=audited.outputRows;
assert(items.length===7,'final live diagnostic parity expected 7 items, got '+items.length+' '+JSON.stringify(items.map(x=>({sku:x.sku,item:x.item_name}))));

const req=(id,q,p,a)=>{
 const r=items.find(x=>key(x).includes(norm(id)));assert(r,'missing '+id);
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
assert(norm(xdp.v703314zReplacementModel)==='XDP3001','XDP replacement note lost');
const neutrik=req('NEUTRIK',1,450,450);
assert(String(neutrik.item_name||'').trim()==='Outdoor Dual Microphone Wall Receptacle','Neutrik Standard Item Name must be concise and equipment-only: '+JSON.stringify(neutrik));
assert(!items.some(r=>/new equipment specified|includesracking|\band brackets\b|labelling|tidying|cabling setups/i.test(String(r.item_name||r.description||''))),'work/fragment row survived final set');

const diag=V.buildParserDiagnostics14l({...parsed,items},invoice,{
 incoming:degraded,
 excludedService:degraded.filter(V.v703312jIsServiceRow),
 excludedAccessory:degraded.filter(V.v703312jIsAccessoryRow),
 recovered:V.v703312jRecoverNumberedEquipmentRows(invoice,sources),
 evidenceSources:sources
});
assert(diag.final_items.length===7,'diagnostic final_items must be 7, got '+diag.final_items.length);
assert(diag.filtering.excluded_service_count>=1,'diagnostic must report service/work exclusion');
assert(diag.final_items.every(x=>!/^No SKU$/i.test(x.sku||'')),'diagnostic must not emit literal No SKU values');
assert(diag.final_items.some(x=>norm(x.sku)==='NEUTRIK'),'diagnostic missing Neutrik');
assert(!diag.final_items.some(x=>/new equipment specified|quidoar|includesracking/i.test(String(x.item_name||''))),'diagnostic still exposes degraded live rows');
assert(audited.randomCharacterFailureCount===0,'V4.1 contamination hard failure');

console.log('PHASE4 LIVE DIAGNOSTIC FINAL ITEMS: '+JSON.stringify(diag.final_items.map(x=>({sku:x.sku,item_name:x.item_name,qty:x.quantity,unit:x.unit_price,amount:x.amount}))));
console.log('PHASE4 LIVE DIAGNOSTIC FILTERING: '+JSON.stringify(diag.filtering));
console.log('PHASE4 LIVE DIAGNOSTIC PARITY: PASS rows=7/7');
