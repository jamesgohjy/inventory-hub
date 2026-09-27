const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'runtime-v7.03.3.14z.js'),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

const start=src.indexOf('function v672SketchKind(item){');
const end=src.indexOf('\nfunction auditIcon(',start);
assert(start>=0&&end>start,'Recent Inventory artwork functions not found');
assert(!src.includes('function v672SketchSvg('),'Old procedural SVG renderer must be removed');
assert(!src.includes('data:image/svg+xml;charset=UTF-8'),'Procedural SVG data URI must not remain in Recent Inventory fallback');

const ctx={console,String,norm:v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()};
ctx.globalThis=ctx;ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(src.slice(start,end)+'\nthis.kind=v672SketchKind;this.image=imageForItem;',ctx);

const cases=[
 ['microphone',{item_name:'Shure SLXD24/SM58 Wireless Handheld Microphone',category:'Audio'},'microphone','assets/recent-items/microphone-3d.webp'],
 ['speaker',{item_name:'Yamaha MS101-4 Monitor Speaker',category:'Audio'},'speaker','assets/recent-items/speaker-3d.webp'],
 ['projector',{item_name:'Panasonic PT-VW540 Projector',category:'Projection'},'projector','assets/recent-items/projector-3d.webp'],
 ['projector-controller',{item_name:'AVS-320 projector controller',category:'Control'},'control','assets/recent-items/control-3d.webp'],
 ['mixer',{item_name:'Allen & Heath CQ12T Digital Mixer Console',category:'Audio'},'control','assets/recent-items/control-3d.webp']
];

for(const [label,item,kind,asset] of cases){
 assert(ctx.kind(item)===kind,label+' expected '+kind+', got '+ctx.kind(item));
 assert(ctx.image(item)===asset,label+' mapped to wrong 3D artwork');
 assert(fs.existsSync(path.join(root,asset)),label+' artwork file missing');
}

for(const asset of ['microphone-3d.webp','control-3d.webp','speaker-3d.webp','projector-3d.webp']){
 const b=fs.readFileSync(path.join(root,'assets','recent-items',asset));
 assert(b.length>5000,asset+' unexpectedly small');
 assert(b.slice(0,4).toString('ascii')==='RIFF'&&b.slice(8,12).toString('ascii')==='WEBP',asset+' is not a WebP container');
}

assert(ctx.image({item_name:'PTZ Camera',category:'Video'})==='','Unsupported type must use existing dashboard icon');
const manual='https://example.com/exact-product.jpg';
assert(ctx.image({item_name:'Speaker',image_url:manual})===manual,'Manual exact product image must remain authoritative');

console.log('RECENT INVENTORY 3D ARTWORK MAPPING: '+cases.length+'/'+cases.length+' PASS');
console.log('3D ASSET FILE INTEGRITY: 4/4 PASS');
console.log('PROJECTOR CONTROLLER PRIORITY: PASS');
console.log('UNSUPPORTED TYPE ICON FALLBACK: PASS');
console.log('MANUAL PRODUCT IMAGE OVERRIDE: PASS');
console.log('OLD PROCEDURAL SVG REMOVAL: PASS');
console.log('RECENT INVENTORY 3D ARTWORK SUMMARY: PASS');
