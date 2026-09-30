const assert=require('node:assert/strict');
require('../modules/parser-v4_1_2-item-blocks.js');
const V=globalThis.InventoryHubParserV412;

const raw=`TAX INVOICE
Description Quantity Unit Price Amount
XVive U35C Wireless System for Condenser Microphones 5.8GHz
4.00 340.00 1,360.00
Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter with SM58 Cardioid Capsule
1.00 480.00 480.00
XVive AT-2 Portable Audio Tester
1.00 270.00 270.00
Xvive Audio U3 2.4 GHz Digital Wireless Microphone System for Dynamic Microphones
4.00 275.00 1,100.00`;
const rows=[
 {sku:'U35C',item_name:'Wireless System for Condenser Microphones'},
 {sku:'SLXD2+',item_name:'Digital Wireless Handheld Microphone Transmitter with SM58 Cardioid Capsule'},
 {sku:'AT-2',item_name:'Portable Audio Tester'},
 {sku:'U3',item_name:'Digital Wireless Microphone System for Dynamic Microphones'}
];
const preserved=V.apply(rows,{raw}).outputRows;
assert.deepEqual(preserved.map(r=>r.sku),['U35C','SLXD2+','AT-2','U3'],'valid source-supported identities must survive when no Model: label exists');
assert.ok(preserved.every(r=>r.identity_status==='verified'),'preserved identities must remain verified');

const variants=[
 {label:'Model: Allen & Heath CQ12T',want:'CQ12T'},
 {label:'Model No. Allen & Heath CQ12T',want:'CQ12T'},
 {label:'Model No: Allen & Heath CQ12T',want:'CQ12T'},
 {label:'SKU # Allen & Heath CQ12T',want:'CQ12T'},
 {label:'Part No - Allen & Heath CQ12T',want:'CQ12T'}
];
for(const x of variants){
 const out=V.apply([{sku:'ca1zr',item_name:'Digital Mixer console'}],{raw:'1 Digital Mixer console 1 100 100\n'+x.label}).outputRows[0];
 assert.equal(out.sku,x.want,'label syntax recovery failed: '+x.label);
 assert.equal(out.item_name,'Digital Mixer');
}

const concept=`1 Digital Mixer console
Model: Allen & Heath CQ12T
2 Digital Power Amplifier with DSP
Model: Powersoft Duecanali 1604DSP
3 Passive Loudspeakers with mounting brackets
Model: Electrovoice ZX1I-90
4 Single Channel Digital Wireless Handheld Microphone System
Model: Shure SLXD24/SM58
5 Monitor Speaker at the console
Model: Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback
Model: Omnitronic XDP-3002
7 Supply & Install Outdoor Dual Microphone Wall Receptacle
Model: Neutrik`;
const damaged=[
 {sku:'ca1zr',item_name:'CQ12T Mixer'},
 {sku:'1604DSP',item_name:'Digital Power Amplifier with DSP'},
 {sku:'ZX11-90',item_name:'Passive Loudspeakers with mounting brackets'},
 {sku:'',item_name:'Single Channel Digital Wireless Handheld Microphone System'},
 {sku:'MS101-4',item_name:'MS101-4 Monitor'},
 {sku:'XDP-3002',item_name:'Dual CD and MP3 player with USB supported Playback Ormaitronic XDP-3002 China'},
 {sku:'Neutrik',item_name:'Outdoor Dual Microphone Wall Receptacle'}
];
const final=V.apply(damaged,{raw:concept}).outputRows;
const expected=[
 ['CQ12T','Digital Mixer'],
 ['1604DSP','Digital Power Amplifier with DSP'],
 ['ZX1I-90','Passive Loudspeaker'],
 ['SLXD24/SM58','Single Channel Digital Wireless Handheld Microphone System'],
 ['MS101-4','Monitor Speaker'],
 ['XDP-3002','Dual CD/MP3 Player']
];
for(const [sku,name] of expected){
 const r=final.find(x=>x.sku===sku);
 assert.ok(r,'missing expected identity '+sku);
 assert.equal(r.item_name,name,'canonical name mismatch '+sku);
}
const receptacle=final.find(x=>x.item_name==='Outdoor Dual Microphone Wall Receptacle');
assert.ok(receptacle);
assert.equal(receptacle.sku,'');
assert.equal(receptacle.identity_status,'needs_attention');

const unrelated=`1 Digital Mixer console
Model: Brand CQ12T
2 Passive Loudspeaker
Model: Brand ZX1I-90`;
const isolated=V.apply([{sku:'junk1',item_name:'Digital Mixer console'},{sku:'junk2',item_name:'Passive Loudspeaker'}],{raw:unrelated}).outputRows;
assert.equal(isolated[0].sku,'CQ12T');
assert.equal(isolated[1].sku,'ZX1I-90');

for(let i=0;i<30;i++){
 const id='MX-'+String(100+i);
 const noise=i%2?'ocrNoise':'badtoken';
 const text='Equipment Digital Mixer '+id+' '+(100+i)+' 1 '+(200+i)+'.00\n';
 const out=V.apply([{sku:id,item_name:'Digital Mixer '+noise}],{raw:text}).outputRows[0];
 assert.equal(out.sku,id,'unseen source-backed identity lost at mutation '+i);
}
console.log('V4.1.2 IDENTITY PRESERVATION + LABEL VARIANTS + 30 UNSEEN MUTATIONS: PASS');
