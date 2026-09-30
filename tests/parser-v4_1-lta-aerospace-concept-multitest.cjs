const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const AV=require('../parser-v7-core.js'); globalThis.AVParserV7=AV;
const V=require('../v7033-core.js'); V.installParserPatch();
for(const p of ['../modules/parser-v2/evidence-model.js','../modules/parser-v2/table-detector.js','../modules/parser-v2/numbered-schedule.js','../modules/parser-v2/verification-gate.js','../modules/parser-v3/engine.js','../modules/parser-v4-review-bridge.js','../modules/parser-v4_1-shadow.js','../modules/parser-v4_1_2-item-blocks.js']) require(p);
const V2=globalThis.InventoryHubParserV2VerificationGate,V3=globalThis.InventoryHubParserV3,V4=globalThis.InventoryHubParserV4ReviewBridge,V41=globalThis.InventoryHubParserV41Shadow,V412=globalThis.InventoryHubParserV412;
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const near=(a,b)=>a!=null&&Math.abs(Number(a)-Number(b))<=.06;
async function pipeline(name,pages,supplier){
 const auth=V.filterInvoicePages(pages,[]),raw=auth.text,evidence=pages.map((text,i)=>auth.decisions[i].allowed?{source:name+'-page-'+(i+1),kind:'native',text,page:i+1,layout:[]}:null).filter(Boolean);
 const rawRows=AV.parseText(raw,name+'-raw',1),base={doc:{supplier_name:supplier},items:rawRows,invoiceClassification:{type:'equipment'},raw};
 const enhanced=AV.enhanceParsed({parsed:base,raw,layout:[],evidenceSources:evidence});
 const v2=await V2.verifyParsed(enhanced,{raw,inventoryItems:[],supplierName:supplier,doc:enhanced.doc||base.doc,webVerifier:null});
 const v3=await V3.evaluate(v2.parsed,{fullEvidence:evidence,inventoryItems:[],verifyGate:V2,webVerifier:null});
 const review=V4.materialize(v3.parsed,enhanced.items||[]);
 const normalized=V.applyParsedFixes(review,raw,evidence);
 const integrity=V41.recoverRows(normalized.items||[],{raw,sources:evidence,layout:[]});
 const v412=V412.apply(integrity.outputRows||[],{raw,sources:evidence});
 return {auth,raw,items:v412.outputRows||[],integrity,v412};
}
const has=(rows,id)=>{const n=norm(id);return rows.find(r=>norm(r.sku||r.model||'')===n)||rows.find(r=>norm([r.item_name,r.description].filter(Boolean).join(' ')).split(/(?=[A-Z])/).join('').includes(n));};
(async()=>{
 const results=[];
 // Aerospace: raw invoice evidence, no prebuilt rows. Test identities, economics, serials, service/accessory filtering and contamination.
 const aero=[`TAX INVOICE
Invoice No AERO-2022
Description Quantity Unit Price Amount
Panasonic PT-VW540 projector 5000 ANSI lumens
SN: DC2210037
1 804.00 804.00
Abtus AVS320 HDMI Control panel
S/N: 320-T1-08078
1 350.00 350.00
Installation work including:
Supply and install bracket for projector
1 530.00 530.00
testing and commission`];
 const a=await pipeline('AEROSPACE',aero,'AV Media Pte Ltd');
 let af=[]; for(const [id,q,p,amt] of [['PT-VW540',1,804,804],['AVS320',1,350,350]]){const r=has(a.items,id);if(!r)af.push('missing '+id);else{if(Number(r.quantity)!==q)af.push(id+' qty');if(!near(r.unit_price,p)||!near(r.amount,amt))af.push(id+' economics');}}
 if(a.items.some(r=>/installation work|testing and commission|bracket/i.test(String(r.item_name||r.description||''))))af.push('service/accessory leakage');
 if(a.integrity.randomCharacterFailureCount)af.push('contamination='+a.integrity.randomCharacterFailureCount);
 results.push({supplier:'Aerospace',pass:!af.length,rows:a.items.length,failures:af,items:a.items.map(r=>({sku:r.sku||r.model,item:r.item_name,qty:r.quantity,unit:r.unit_price,amount:r.amount}))});

 // LTA mixed invoice: two invoice pages + packing slip/continuation rejected. 11 serials and 4 equipment rows.
 const l1=`TAX INVOICE
Description Quantity Unit Price Tax Amount SGD
XVive U35C Wireless System for Condenser Microphones 5.8GHz
S/N: IntlE251100449, Intle251100452, Intle251000719, Intle251100448
4.00 340.00 9% 1,360.00
Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter with SM58 Cardioid Capsule
S/N: 3EL26704289, 3FA0985618
1.00 480.00 9% 480.00
Gravity CART M 01 B Multifunctional Trolley (Medium)
S/N: N/A
2.00 170.00 9% 340.00`;
 const l2=`TAX INVOICE
Description Quantity Unit Price Tax Amount SGD
XVive AT-2 Portable Audio Tester
S/N: IntL260500638
1.00 270.00 9% 270.00
Xvive Audio U3 2.4 GHz Digital Wireless Microphone System for Dynamic Microphones
S/N: Int1241204279, Int1241204276,
Int1241204210,
Int1241203023
4.00 275.00 9% 1,100.00
DEL, Delivery Services with return Trip for Signed Delivery Order
1.00 50.00 9% 50.00`;
 const lp='PACKING/DELIVERY SLIP\nXVive U35C Wireless System\nS/N: SHOULD-NOT-BIND-999\n4.00';
 const l=await pipeline('LTA',[l1,l2,lp,'Description Quantity\nNOTE Supply and delivery only.'],'Loud Technologies Asia Pte Ltd');
 let lf=[];for(const [id,q,p,amt] of [['U35C',4,340,1360],['SLXD2+',1,480,480],['AT-2',1,270,270],['U3',4,275,1100]]){const r=has(l.items,id);if(!r)lf.push('missing '+id);else if(Number(r.quantity)!==q||!near(r.unit_price,p)||!near(r.amount,amt))lf.push(id+' values');}
 const ls=V.v703315ExtractSerialBlocks(l.raw).blocks.flatMap(b=>b.serials||[]);if(ls.length!==11)lf.push('serials '+ls.length+'/11');if(ls.includes('SHOULD-NOT-BIND-999'))lf.push('packing serial leaked');
 if(l.items.some(r=>/delivery services|trolley/i.test(String(r.item_name||r.description||''))))lf.push('service/accessory leakage');if(l.integrity.randomCharacterFailureCount)lf.push('contamination');
 results.push({supplier:'LTA/LT4',pass:!lf.length,rows:l.items.length,serials:ls.length,authority:l.auth.decisions.map(x=>!!x.allowed),failures:lf,items:l.items.map(r=>({sku:r.sku||r.model,item:r.item_name,qty:r.quantity,unit:r.unit_price,amount:r.amount}))});

 // Concept: six-page document authority + 7 equipment rows; damaged economics must remain blank/review rather than invented.
 const ci=`TAX INVOICE
No. Description Qty Unit Price Amount
1 RE: Sound System Replacement Setup for Y14 Parade Square 1 1,400.00 1,400.00
(A) Section 2: Technical Specifications for AV Equipment
Digital Mixer console. Support up to 12 channels with 7 Multi Touch Screen
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
Model: Neutrik`;
 const cp=['PURCHASE ORDER\nPO Number PO2024',ci,'TAX INVOICE\nDescription Qty Unit Price Amount\nSubtotal 16,500.00\nGST 1,485.00\nInvoice Total 17,985.00','DELIVERY ORDER\nModel Allen & Heath CQ12T','DELIVERY ORDER\nSystem tuning','QUOTATION\nQuotation Validity 90 days'];
 const c=await pipeline('CONCEPT',cp,'Concept Systems Technologies Pte Ltd');
 let cf=[];for(const id of ['CQ12T','1604DSP','ZX1I-90','SLXD24/SM58','MS101-4','XDP-3002'])if(!has(c.items,id))cf.push('missing '+id);
 const expectedNames={CQ12T:'Digital Mixer','1604DSP':'Digital Power Amplifier with DSP','ZX1I-90':'Passive Loudspeaker','SLXD24/SM58':'Single Channel Digital Wireless Handheld Microphone System','MS101-4':'Monitor Speaker','XDP-3002':'Dual CD/MP3 Player'};
 for(const [id,name] of Object.entries(expectedNames)){const r=has(c.items,id);if(r&&r.item_name!==name)cf.push(id+' canonical name '+JSON.stringify(r.item_name));}
 const receptacle=c.items.find(r=>/outdoor\s+dual\s+microphone\s+wall\s+receptacle/i.test(String(r.item_name||r.description||'')));
 if(!receptacle)cf.push('missing wall receptacle');
 else{
   if(String(receptacle.sku||receptacle.model||'').trim())cf.push('brand-only Neutrik survived as identity');
   if(receptacle.v41ProductionReviewRequired!==true)cf.push('receptacle identity not review-gated');
   if(receptacle.identity_status!=='needs_attention'||receptacle.equipment_status!=='verified')cf.push('receptacle status split incorrect');
   if(Number(receptacle.quantity)!==1||!near(receptacle.unit_price,450)||!near(receptacle.amount,450))cf.push('receptacle economics');
 }
 if(c.items.length!==7)cf.push('rows '+c.items.length+'/7');if(c.auth.decisions.map(x=>!!x.allowed).join(',')!=='false,true,true,false,false,false')cf.push('authority');
 if(c.items.some(r=>/scope of work|cabling|training|installation|warranty/i.test(String(r.item_name||r.description||''))))cf.push('service leakage');if(c.integrity.randomCharacterFailureCount)cf.push('contamination');
 results.push({supplier:'Concept',pass:!cf.length,rows:c.items.length,authority:c.auth.decisions.map(x=>!!x.allowed),failures:cf,items:c.items.map(r=>({sku:r.sku||r.model,item:r.item_name,qty:r.quantity,unit:r.unit_price,amount:r.amount,review:!!(r.humanReviewRequired||r.needsReview||r.v41ShadowReviewRequired||r.v41ProductionReviewRequired)}))});
 for(const x of results)console.log('MULTI SUPPLIER '+x.supplier+': '+(x.pass?'PASS':'FAIL')+' '+JSON.stringify(x));
 const failed=results.filter(x=>!x.pass);console.log('MULTI SUPPLIER FAIRNESS: raw invoice/page text only; no post-extraction rows supplied to parser');
 console.log('MULTI SUPPLIER SUMMARY: '+(results.length-failed.length)+'/'+results.length+' PASS');
 if(failed.length)process.exitCode=17;
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
