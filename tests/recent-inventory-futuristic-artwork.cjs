const fs=require('fs');
const vm=require('vm');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','runtime-v7.03.3.14z.js'),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const start=src.indexOf('function v672SketchKind(item){');
const end=src.indexOf('\nfunction auditIcon(',start);
assert(start>=0&&end>start,'Recent Inventory artwork functions not found');
const ctx={
  console,
  Math,
  String,
  encodeURIComponent,
  norm:v=>String(v||'').toLowerCase().replace(/\s+/g,' ').trim()
};
ctx.globalThis=ctx;ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(src.slice(start,end)+'\nthis.kind=v672SketchKind;this.art=v672SketchSvg;this.image=imageForItem;',ctx);

const cases=[
  ['speaker',{item_name:'Yamaha MS101-4 Monitor Speaker',category:'Audio'},'speaker'],
  ['projector',{item_name:'Panasonic PT-VW540 Projector',category:'Projection'},'projector'],
  ['projector-controller',{item_name:'AVS-320 projector controller',category:'Control'},'control'],
  ['mixer',{item_name:'Allen & Heath CQ12T Digital Mixer Console',category:'Audio'},'control'],
  ['microphone',{item_name:'Shure SLXD24/SM58 Wireless Handheld Microphone',category:'Audio'},'microphone'],
  ['camera',{item_name:'PTZ Camera',category:'Video'},'camera'],
  ['visualizer',{item_name:'Document Camera Visualizer',category:'Video'},'visualizer'],
  ['cable',{item_name:'HDMI Cable',category:'Accessories'},'cable'],
  ['display',{item_name:'IdeaHub Interactive Display',category:'Display'},'display'],
  ['stand',{item_name:'Gravity CART M 01 B Multifunctional Trolley',category:'Stand'},'stand']
];
for(const [label,item,expected] of cases){
  const kind=ctx.kind(item);
  assert(kind===expected,label+' expected '+expected+' artwork, got '+kind);
  const uri=ctx.image(item);
  assert(uri.startsWith('data:image/svg+xml;charset=UTF-8,'),label+' did not produce generated SVG artwork');
  const svg=decodeURIComponent(uri.split(',').slice(1).join(','));
  assert(svg.includes('data-art-style="futuristic"'),label+' missing futuristic artwork marker');
  assert(svg.includes('data-av-kind="'+expected+'"'),label+' artwork marker mismatched '+expected);
  assert(svg.includes('id="grid"')&&svg.includes('id="glow"')&&svg.includes('url(#edge)'),label+' futuristic visual layers missing');
}
const manual='https://example.com/exact-product.jpg';
assert(ctx.image({item_name:'Speaker',image_url:manual})===manual,'Manual exact product image must remain authoritative');
console.log('RECENT INVENTORY FUTURISTIC ARTWORK MAPPING: '+cases.length+'/'+cases.length+' PASS');
console.log('PROJECTOR CONTROLLER PRIORITY: PASS');
console.log('MANUAL PRODUCT IMAGE OVERRIDE: PASS');
console.log('RECENT INVENTORY FUTURISTIC ARTWORK SUMMARY: PASS');
