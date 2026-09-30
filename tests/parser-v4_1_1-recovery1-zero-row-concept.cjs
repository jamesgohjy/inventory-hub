const fs=require('fs'),vm=require('vm');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const core=fs.readFileSync(require('path').join(__dirname,'..','v7033-core.js'),'utf8');
const ctx={console,setTimeout,clearTimeout,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);vm.runInContext(core,ctx,{filename:'v7033-core.js'});
const api=ctx.V7033Patch;assert(api,'V7033Patch missing');

const primary=String.raw`TAX INVOICE
Company: Raffles Institution Date: 16 Jul 2024
Address: One Raffles institution Lane Invoice No.: 2407/015
Singapore 575954 Order Ref: PO2024/000134
No. Description Qty Unit Price SGD Amount SGD
1 RE: Sound System Replacement Setup for Y14 Parade Square 1 1,400.00 1,400.00
(A) Section 2: Technical Specifications for AV Equipment
Digital Mixer console. Support up to 12 channels with 7 Multi Touch Screen
Model: Allen & Heath CQ12T
2 Digital Power Amplifier with DSP 1 2,500.00 2,500.00
Model: Powersoft Duecanali 1604DSP
3 Passive Loudspeakers with mounting brackets 6 800.00 4,800.00
Model: Electrovoice ZX1I-90
4 Single Channel Digital Wireless Handheld Microphone System 2 950.00 1,900.00
Model: Shure SLXD24/SM58
5 Monitor Speaker at the console 1 200.00 200.00
Model: Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback 1 950.00 950.00
Model: Omnitronic XDP-3002
Note: replaced with XDP-3001
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model: Neutrik
8 (B) Scope of Work: 1 1,800.00 1,800.00
Dismantle, remove old speakers, AV equipment and speakers from mounted spaces and equipment racks.
9 Supply and install the new equipment specified in Section 2. Includes racking, mounting kits for AV equipment and speakers. 1 1,500.00 1,500.00
10 Supply and install cabling (electrical / audio / data signal) for the required setup for equipment specified in Section 2. 1 300.00 300.00
11 Provide labelling and tidying the cabling setups. 1 100.00 100.00
12 System tuning and calibration and DSP programming. 1 500.00 500.00
13 Provide operational training and knowledge transfer to RI's AV team after commissioning. 1 300.00 300.00
14 All Installation work must include the necessary tools and safety documents 1 800.00 800.00
15 24 months equipment and workmanship on-site warranty 1 0.00 0.00
Subtotal 16,500.00
GST 9% 1,485.00
Invoice Total 17,985.00`;

const noisy=primary
 .replace('ZX1I-90','Z2X1I-90')
 .replace('950.00 1,900.00','750.00 00.00')
 .replace('200.00 200.00','odBlggtA boo.00')
 .replace('950.00 950.00','950.00 BS0.00');

const parsed={doc:{supplier_name:'Concept Systems Technologies Pte Ltd',invoice_number:'2407/015',invoice_date:'2024-07-16',currency:'SGD'},items:[],v7:{verification:{rows:[],humanReviewRows:[]},completenessValidation:{}}};
const out=api.applyParsedFixes(parsed,primary,[{source:'ocr-psm3',text:noisy},{source:'ocr-psm6',text:primary}]);
const rows=out.items||[];
const key=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const bySku=s=>rows.find(r=>key(r.sku||r.model)===key(s));
for(const s of ['1604DSP','ZX1I-90','CQ12T','SLXD24/SM58','MS101-4','XDP-3002']) assert(bySku(s),'missing recovered SKU '+s);
assert(rows.some(r=>/Outdoor Dual Microphone Wall Receptacle/i.test(String(r.item_name||r.description||''))),'wall receptacle row missing');
assert(!rows.some(r=>/Raffles Institution Lane|Singapore 575954|Order Ref|Invoice No/i.test(String(r.item_name||r.description||''))),'address/header leaked into line items');
assert(!rows.some(r=>/Dismantle, remove old speakers|System tuning and calibration|operational training|cabling setups/i.test(String(r.item_name||r.description||''))),'service row leaked into inventory');
const ms=bySku('MS101-4');assert(ms&&!/microphone/i.test(String(ms.item_name||'')),'MS101-4 cross-row name contamination');
const zx=bySku('ZX1I-90');assert(zx&&!/mixer/i.test(String(zx.item_name||'')),'ZX1I-90 cross-row name contamination');
console.log('RECOVERY1 ZERO-PREPARED-ROW CONCEPT OCR EVIDENCE: '+rows.length+' rows; required six identities present');
