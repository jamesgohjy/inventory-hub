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
 ['touch-panel',{sku:'TP-051',item_name:'5" Wall mount touch screen',category:'Control'},'touchpanel','assets/recent-items/touch-panel-3d.webp'],
 ['display',{item_name:'Huawei IdeaHub Interactive Display',category:'Display'},'display','assets/recent-items/display-3d.webp'],
 ['ptz-camera',{item_name:'PTZ Camera',category:'Video'},'camera','assets/recent-items/camera-3d.webp'],
 ['visualizer',{item_name:'Document Camera Visualizer',category:'Video'},'visualizer','assets/recent-items/visualizer-3d.webp'],
 ['stand',{item_name:'Gravity CART M 01 B Multifunctional Trolley',category:'Stand'},'stand','assets/recent-items/stand-3d.webp'],
 ['cable',{item_name:'HDMI Cable',category:'Cable'},'cable','assets/recent-items/cable-3d.webp'],
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

const assets=[
 'touch-panel-3d.webp','display-3d.webp','camera-3d.webp','visualizer-3d.webp','stand-3d.webp','cable-3d.webp',
 'microphone-3d.webp','control-3d.webp','speaker-3d.webp','projector-3d.webp'
];
for(const asset of assets){
 const b=fs.readFileSync(path.join(root,'assets','recent-items',asset));
 assert(b.length>5000,asset+' unexpectedly small');
 assert(b.slice(0,4).toString('ascii')==='RIFF'&&b.slice(8,12).toString('ascii')==='WEBP',asset+' is not a WebP container');
}

assert(ctx.kind({item_name:'Document Camera Visualizer'})==='visualizer','Visualizer must take priority over generic camera');
assert(ctx.kind({item_name:'Yamaha Monitor Speaker'})==='speaker','Speaker must take priority over generic monitor/display');
assert(ctx.kind({item_name:'AVS-320 projector controller'})==='control','Controller must take priority over projector');
assert(ctx.kind({item_name:'5" wall-mounted touch screen'})==='touchpanel','Touch panel must take priority over generic screen/display');

assert(ctx.image({item_name:'Unknown AV Widget',category:'Other'})==='','Unknown type must use existing dashboard icon, not incorrect 3D artwork');
const manual='https://example.com/exact-product.jpg';
assert(ctx.image({item_name:'Speaker',image_url:manual})===manual,'Manual exact product image must remain authoritative');

console.log('RECENT INVENTORY 3D ARTWORK MAPPING: '+cases.length+'/'+cases.length+' PASS');
console.log('3D ASSET FILE INTEGRITY: '+assets.length+'/'+assets.length+' PASS');
console.log('TOUCH PANEL PRIORITY: PASS');
console.log('VISUALIZER CAMERA PRIORITY: PASS');
console.log('MONITOR SPEAKER PRIORITY: PASS');
console.log('PROJECTOR CONTROLLER PRIORITY: PASS');
console.log('UNKNOWN TYPE ICON FALLBACK: PASS');
console.log('MANUAL PRODUCT IMAGE OVERRIDE: PASS');
console.log('OLD PROCEDURAL SVG REMOVAL: PASS');
console.log('RECENT INVENTORY 3D ARTWORK SUMMARY: PASS');
