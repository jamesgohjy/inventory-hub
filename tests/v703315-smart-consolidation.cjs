const fs=require('fs'),vm=require('vm');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const src=fs.readFileSync(require('path').join(__dirname,'../runtime-v7.03.3.14z.js'),'utf8');
const start=src.indexOf("function v703314dSkuKey");
const end=src.indexOf("function v703314dDismissMergeDialog",start);
assert(start>=0&&end>start,'matching helper block unavailable');
const block=src.slice(start,end);
const sandbox={state:{data:{items:[]}},globalThis:{V7033Patch:{compact:v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'')}}};
vm.createContext(sandbox);vm.runInContext(block+";this.api={key:v703315IdentityKey,tokens:v703315IdentityTokens,smart:v703315SmartMergeCandidates};",sandbox);
const A=sandbox.api;
assert(A.key('AVS-320')==='AVS320'&&A.key('AVS 320')==='AVS320','separator normalization failed');
assert(A.key('Model: MAS-1818')==='MAS1818','model label normalization failed');
sandbox.state.data.items=[
 {id:'1',sku:'AVS-320',model:'AVS-320',item_name:'Projector Controller'},
 {id:'2',sku:'MAS-1818',model:'MAS-1818',item_name:'Touch Panel'},
 {id:'3',sku:'RX-A100',model:'RX-A100',item_name:'Wireless Receiver'},
 {id:'4',sku:'RX-A100-B',model:'RX-A100',item_name:'Wireless Receiver spare'}
];
sandbox.state.data.items.push({id:'x',sku:'LEGACY-X',model:'',item_name:'Legacy source'});\nlet c=A.smart('x',{sku:'AVS 320',model:'AVS 320',item_name:'Projector Controller'});
assert(c.length===1&&c[0].item.id==='1','unique normalized AVS-320 candidate not found');
c=A.smart('x',{sku:'MAS1818',model:'MAS1818',item_name:'Touch Panel'});
assert(c.length===1&&c[0].item.id==='2','unique MAS-1818 candidate not found');
c=A.smart('x',{sku:'RX A100',model:'RX-A100',item_name:'Wireless Receiver'});
assert(c.filter(x=>x.shared.length).length===2,'ambiguous model evidence was not preserved');
c=A.smart('x',{sku:'U3',model:'U3',item_name:'Wireless microphone'});
assert(c.length===0,'short/generic identity should not propose merge');
console.log('V7.03.3.15 SMART CONSOLIDATION: PASS unique normalized identities; ambiguous identities fail closed; short identities ignored');
