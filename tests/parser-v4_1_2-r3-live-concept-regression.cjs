const assert=require('node:assert/strict');
require('../modules/parser-v4_1_2-item-blocks.js');
const V=globalThis.InventoryHubParserV412;

const raw=`TAX INVOICE
1 Digital Mixer console. Support up to 12 channels 1 1,400.00 1,400.00
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
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model: Neutrik`;

const liveBadRows=[
 {sku:'1604DSP',item_name:'Digital Mixer',description:'Digital Mixer',quantity:1,unit_price:2500,amount:2500},
 {sku:'ZX11-90',item_name:'Digital Mixer',description:'Digital Mixer',quantity:6,unit_price:800,amount:4800},
 {sku:'',item_name:'Outdoor Dual Microphone Wall Receptacle',description:'Outdoor Dual Microphone Wall Receptacle',quantity:1,unit_price:450,amount:450},
 {sku:'',item_name:'Digital Mixer',description:'Digital Mixer',quantity:1,unit_price:1400,amount:1400},
 {sku:'',item_name:'Single Channel Digital Wireless Handheld Microphone System',description:'Single Channel Digital Wireless Handheld Microphone System',quantity:2,unit_price:950,amount:1900},
 {sku:'MS101-4',item_name:'Single Channel Digital Wireless Handheld Microphone System',description:'Single Channel Digital Wireless Handheld Microphone System',quantity:1,unit_price:200,amount:200},
 {sku:'XDP-3002',item_name:'Dual CD/MP3 Player',description:'Dual CD/MP3 Player',quantity:1,unit_price:950,amount:950}
];

const sources=[
 {source:'native-concept',kind:'native',text:raw},
 {source:'ocr-psm3',kind:'ocr',text:raw.replace('ZX1I-90','ZX11-90')},
 {source:'ocr-psm6',kind:'ocr',text:raw}
];

const out=V.apply(liveBadRows,{raw,sources}).outputRows;
const expected=[
 ['1604DSP','Digital Power Amplifier with DSP'],
 ['ZX1I-90','Passive Loudspeaker'],
 ['CQ12T','Digital Mixer'],
 ['SLXD24/SM58','Single Channel Digital Wireless Handheld Microphone System'],
 ['MS101-4','Monitor Speaker'],
 ['XDP-3002','Dual CD/MP3 Player']
];

for(const [sku,name] of expected){
 const row=out.find(r=>r.sku===sku);
 assert.ok(row,'missing '+sku+' from repaired live-bad rows');
 assert.equal(row.item_name,name,sku+' wrong semantic name');
 assert.equal(row.description,name,sku+' wrong canonical description');
}

const receptacle=out.find(r=>r.item_name==='Outdoor Dual Microphone Wall Receptacle');
assert.ok(receptacle,'missing receptacle');
assert.equal(receptacle.sku,'');
assert.equal(receptacle.identity_status,'needs_attention');

const assigned=out.map(r=>r.v412ItemBlock?.blockIndex).filter(Number.isInteger);
assert.equal(new Set(assigned).size,assigned.length,'same item block was reused across multiple rows');

const exact=out.filter(r=>r.identity_status==='verified').map(r=>r.sku+' — '+r.item_name).sort();
assert.deepEqual(exact,[
 '1604DSP — Digital Power Amplifier with DSP',
 'CQ12T — Digital Mixer',
 'MS101-4 — Monitor Speaker',
 'SLXD24/SM58 — Single Channel Digital Wireless Handheld Microphone System',
 'XDP-3002 — Dual CD/MP3 Player',
 'ZX1I-90 — Passive Loudspeaker'
].sort());

console.log('V4.1.2 R3 LIVE CONCEPT CONTAMINATION REPRODUCTION: 6/6 PASS');
