const fs=require('fs'),vm=require('vm');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const {ocr3,ocr4,ocr6}=require('./fixtures/concept-actual-ocr-witnesses.cjs');
const core=fs.readFileSync(require('path').join(__dirname,'..','v7033-core.js'),'utf8');
const ctx={console,setTimeout,clearTimeout,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);vm.runInContext(core,ctx,{filename:'v7033-core.js'});
const api=ctx.V7033Patch;assert(api,'V7033Patch missing');

const parsed={doc:{supplier_name:'Concept Systems Technologies Pte Ltd',invoice_number:'2407/015',invoice_date:'2024-07-16',currency:'SGD'},items:[],v7:{verification:{rows:[],humanReviewRows:[]},completenessValidation:{}}};
const evidence=[
 {source:'concept-fresh-ocr-psm3',kind:'ocr',text:ocr3,layout:[]},
 {source:'concept-fresh-ocr-psm4',kind:'ocr',text:ocr4,layout:[]},
 {source:'concept-fresh-ocr-psm6',kind:'ocr',text:ocr6,layout:[]}
];
const out=api.applyParsedFixes(parsed,ocr3,evidence);
const rows=out.items||[];
const key=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const bySku=s=>rows.find(r=>key(r.sku||r.model)===key(s));
for(const s of ['1604DSP','ZX1I-90','CQ12T','SLXD24/SM58','MS101-4','XDP-3002']) assert(bySku(s),'missing recovered SKU '+s);
assert(rows.some(r=>/Outdoor Dual Microphone Wall Receptacle/i.test(String(r.item_name||r.description||''))),'wall receptacle row missing');
assert(!rows.some(r=>/Raffles Institution Lane|Singapore 575954|Order Ref|Invoice No/i.test(String(r.item_name||r.description||''))),'address/header leaked into line items');
assert(!rows.some(r=>/Dismantle, remove old speakers|System tuning and calibration|operational training|cabling setups/i.test(String(r.item_name||r.description||''))),'service row leaked into inventory');
const ms=bySku('MS101-4');assert(ms&&!/microphone/i.test(String(ms.item_name||'')),'MS101-4 cross-row name contamination');
const zx=bySku('ZX1I-90');assert(zx&&!/mixer/i.test(String(zx.item_name||'')),'ZX1I-90 cross-row name contamination');
console.log('RECOVERY1 ZERO-PREPARED-ROW CONCEPT ACTUAL OCR WITNESSES: '+rows.length+' rows; required six identities present');
