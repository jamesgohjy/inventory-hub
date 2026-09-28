const V=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');

// Representative duplicate OCR witness pattern from the live Concept diagnostic:
// 14 recovered representations for 7 physical equipment rows.
const rows=[
  {sku:'1604DSP',model:'1604DSP',item_name:'with DSP 1 Duecanali 1604DSP',description:'Digital Power Amplifier with DSP',quantity:1,unit_price:2500,amount:2500,v703312kSource:'ocr-model',v703312kSourceLine:'2 Digital Power Amplifier with DSP 1 2500.00 2500.00 | Model: Powersoft Duecanali 1604DSP',v703314zPrintedModel:'1604DSP'},
  {sku:'',item_name:'Digital Power Amplifier with DSP',description:'Digital Power Amplifier with DSP',quantity:1,unit_price:2500,amount:2500,v703312kSource:'ocr-table',v703312kSourceLine:'Digital Power Amplifier with DSP 1 2500.00 2500.00'},

  {sku:'ZX1I-90',model:'ZX1I-90',item_name:'Passive Loudspeakers with mounting brackets',description:'Passive Loudspeakers with mounting brackets',quantity:6,unit_price:800,amount:4800,v703312kSource:'ocr-model',v703312kSourceLine:'3 Passive Loudspeakers with mounting brackets 6 800.00 4800.00 | Model: Electrovoice ZX1I-90',v703314zPrintedModel:'ZX1I-90'},
  {sku:'',item_name:'Passive Loudspeakers mounting brackets',description:'Passive Loudspeakers mounting brackets',quantity:6,unit_price:800,amount:4800,v703312kSource:'ocr-table',v703312kSourceLine:'Passive Loudspeakers mounting brackets 6 800.00 4800.00'},

  {sku:'CQ12T',model:'CQ12T',item_name:'Digital Mixer console',description:'Digital Mixer console. Support up to 12 channels with 7 Multi Touch Screen',quantity:1,unit_price:1400,amount:1400,v703312kSource:'ocr-model',v703312kSourceLine:'1 Digital Mixer console Support up to 12 channels | Model: Allen & Heath CQ12T',v703314zPrintedModel:'CQ12T'},
  {sku:'',item_name:'Digital Mixer console Support up to 12 channels with 7 Multi Touch Screen',description:'Digital Mixer console Support up to 12 channels with 7 Multi Touch Screen',quantity:1,unit_price:1400,amount:1400,v703312kSource:'ocr-table',v703312kSourceLine:'Digital Mixer console Support up to 12 channels with 7 Multi Touch Screen 1 1400.00 1400.00'},

  {sku:'SLXD24/SM58',model:'SLXD24/SM58',item_name:'Single Channel Digital Wireless Handheld Microphone System',description:'Single Channel Digital Wireless Handheld Microphone System',quantity:2,unit_price:null,amount:null,v703312kSource:'ocr-model',v703312kSourceLine:'4 Single Channel Digital Wireless Handheld Microphone System | Model: Shure SLXD24/SM58',v703314zPrintedModel:'SLXD24/SM58'},
  {sku:'',item_name:'Single Channel Digital Wireless Handheld Microphone System',description:'Single Channel Digital Wireless Handheld Microphone System',quantity:2,unit_price:null,amount:null,v703312kSource:'ocr-table',v703312kSourceLine:'Single Channel Digital Wireless Handheld Microphone System 2 OCR-DAMAGED'},

  {sku:'MS101-4',model:'MS101-4',item_name:'Monitor Speaker at the console',description:'Monitor Speaker at the console',quantity:1,unit_price:null,amount:null,v703312kSource:'ocr-model',v703312kSourceLine:'5 Monitor Speaker at the console | Model: Yamaha MS101-4',v703314zPrintedModel:'MS101-4'},
  {sku:'',item_name:'LH Monitor Speaker at the console Yamaha',description:'Monitor Speaker at the console',quantity:1,unit_price:null,amount:null,v703312kSource:'ocr-table',v703312kSourceLine:'LH Monitor Speaker at the console Yamaha 1 OCR-DAMAGED'},

  {sku:'XDP-3002',model:'XDP-3002',item_name:'Dual CD and MP3 player with USB supported Playback',description:'Dual CD and MP3 player with USB supported Playback',quantity:1,unit_price:null,amount:null,v703312kSource:'ocr-model',v703312kSourceLine:'6 Dual CD and MP3 player with USB supported Playback | Model: Omnitronic XDP-3002 | Note replaced with XDP-3001',v703314zPrintedModel:'XDP-3002',v703314zReplacementModel:'XDP-3001'},
  {sku:'',item_name:'Dual CD and MP3 player with USB supported Playback Omnitronic',description:'Dual CD and MP3 player with USB supported Playback',quantity:1,unit_price:null,amount:null,v703312kSource:'ocr-table',v703312kSourceLine:'Dual CD and MP3 player with USB supported Playback Omnitronic 1 OCR-DAMAGED'},

  {sku:'Neutrik',model:'Neutrik',item_name:'Outdoor Dual Microphone Wall Receptacle',description:'Supply & Install Outdoor Dual Microphone Wall Receptacle',quantity:1,unit_price:450,amount:450,v703312kSource:'ocr-model',v703312kSourceLine:'7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00 | Model: Neutrik',v703314zPrintedModel:'Neutrik'},
  {sku:'',item_name:'Quidoar Dual Microphone Wall Receptacle Neutrik',description:'Outdoor Dual Microphone Wall Receptacle',quantity:1,unit_price:450,amount:450,v703312kSource:'ocr-table',v703312kSourceLine:'Quidoar Dual Microphone Wall Receptacle Neutrik 1 450.00 450.00'}
];

const consolidated=V.v703314zdConsolidateRecoveredWitnesses(rows);
console.log('PHASE4 DUPLICATE OCR INPUT='+rows.length+' FINAL='+consolidated.length);
console.log('PHASE4 DUPLICATE OCR FINAL ROWS: '+JSON.stringify(consolidated.map(r=>({sku:r.sku,item:r.item_name,q:r.quantity,p:r.unit_price,a:r.amount}))));

assert(consolidated.length===7,'14 recovered OCR witnesses must collapse to 7 physical items; got '+consolidated.length);
const expected=['1604DSP','ZX1I90','CQ12T','SLXD24SM58','MS1014','XDP3002','NEUTRIK'];
for(const id of expected){
  assert(consolidated.some(r=>norm(r.sku||r.model)===id),'missing consolidated model '+id);
}
assert(new Set(consolidated.map(r=>norm(r.sku||r.model))).size===7,'duplicate model identities remain');
const amp=consolidated.find(r=>norm(r.sku)==='1604DSP');
assert(amp&&String(amp.item_name||'')==='Digital Power Amplifier with DSP','1604DSP must retain cleaner equipment name: '+JSON.stringify(amp));
const ms=consolidated.find(r=>norm(r.sku)==='MS1014');
assert(ms&&String(ms.item_name||'')==='Monitor Speaker at the console','MS101-4 name degraded during dedupe: '+JSON.stringify(ms));
const neutrik=consolidated.find(r=>norm(r.sku)==='NEUTRIK');
assert(neutrik&&Number(neutrik.quantity)===1&&Number(neutrik.unit_price)===450&&Number(neutrik.amount)===450,'Neutrik economics changed during dedupe');
assert(String(neutrik.item_name||'')==='Outdoor Dual Microphone Wall Receptacle','Neutrik name degraded during dedupe: '+JSON.stringify(neutrik));
const xdp=consolidated.find(r=>norm(r.sku)==='XDP3002');
assert(norm(xdp?.v703314zReplacementModel)==='XDP3001','XDP replacement evidence lost during dedupe');

console.log('PHASE4 CROSS-OCR DEDUPE: PASS 14->7');
