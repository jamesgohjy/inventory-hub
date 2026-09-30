const assert=require('node:assert/strict');
require('../modules/parser-v4_1_2-item-blocks.js');
const V=globalThis.InventoryHubParserV412;
const raw=`TAX INVOICE
1 Digital Mixer console. Support up to 12 channels 1 1400 1400
Model: Allen & Heath CQ12T
2 Digital Power Amplifier with DSP 1 2500 2500
Model: Powersoft 1604DSP
3 Passive Loudspeakers with mounting brackets 6 800 4800
Model: Electrovoice ZX1I-90
4 Single Channel Digital Wireless Handheld Microphone System 2 950 1900
Model: Shure SLXD24/SM58
5 Monitor Speaker at the console 1 200 200
Model: Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback 1 950 950
Model: Omnitronic XDP-3002
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450 450
Model: Neutrik`;
const rows=[
 ['ca1zr','CQ12T Mixer'],['1604DSP','Digital Power Amplifier with DSP'],['ZX11-90','Passive Loudspeakers with mounting brackets'],['','Single Channel Digital Wireless Handheld Microphone System'],['MS101-4','MS101-4 Monitor'],['XDP-3002','Dual CD and MP3 player with USB supported Playback'],['Neutrik','Outdoor Dual Microphone Wall Receptacle']
].map(([sku,item_name])=>({sku,item_name,description:item_name,quantity:1,unit_price:1,amount:1}));
const final=V.apply(rows,{raw,sources:[{text:raw},{text:raw.replace('ZX1I-90','Z2X1I-90')},{text:raw}]}).outputRows;
const bySku=sku=>final.find(r=>r.sku===sku);
assert.equal(bySku('CQ12T').item_name,'Digital Mixer');
assert.equal(bySku('1604DSP').item_name,'Digital Power Amplifier with DSP');
assert.equal(bySku('ZX1I-90').item_name,'Passive Loudspeaker');
assert.equal(bySku('SLXD24/SM58').item_name,'Single Channel Digital Wireless Handheld Microphone System');
assert.equal(bySku('MS101-4').item_name,'Monitor Speaker');
assert.equal(bySku('XDP-3002').item_name,'Dual CD/MP3 Player');
const unknown=final.find(r=>r.item_name==='Outdoor Dual Microphone Wall Receptacle');
assert.ok(unknown); assert.equal(unknown.sku,''); assert.equal(unknown.equipment_status,'verified'); assert.equal(unknown.identity_status,'needs_attention'); assert.equal(unknown.humanReviewRequired,true);
assert.equal(final.filter(r=>r.identity_status==='verified').length,6);
assert.equal(final.filter(r=>r.identity_status==='needs_attention').length,1);
console.log('V4.1.2 CANONICAL CONCEPT REVIEW GATE: PASS');
