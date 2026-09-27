const fs=require('fs');
const vm=require('vm');

const src=fs.readFileSync(require('path').join(__dirname,'..','runtime-v7.03.3.14z.js'),'utf8');
const fail=msg=>{throw new Error(msg);};
const assert=(ok,msg)=>{if(!ok)fail(msg);};

const helperMatch=src.match(/function v703314dDismissMergeDialog\(d\)\{[\s\S]*?\n\}/);
assert(helperMatch,'v703314dDismissMergeDialog helper not found');

const start=src.indexOf('function v703314dMergeDialog(source,target,payload){');
const end=src.indexOf('\nasync function v703314dMergeMasterItems',start);
assert(start>=0&&end>start,'base merge dialog function not found');
const dialogFnSource=src.slice(start,end);

function makeHarness({throwOnClose=false}={}){
  let current=null,mergeCalls=0;
  class FakeDialog{
    constructor(){
      this.open=false;
      this.isConnected=false;
      this.removed=false;
      this.closeCalls=0;
      this.buttons={
        '#mergeMasterClose':{},
        '#mergeMasterCancel':{},
        '#mergeMasterConfirm':{}
      };
      this.oncancel=null;
    }
    querySelector(sel){return this.buttons[sel]||null;}
    showModal(){this.open=true;}
    close(){
      this.closeCalls++;
      if(throwOnClose)throw new Error('forced native close failure');
      this.open=false;
    }
    remove(){this.isConnected=false;this.removed=true;this.open=false;}
  }
  const document={
    activeElement:{focus(){document.focusRestored=true;}},
    focusRestored:false,
    body:{appendChild(d){d.isConnected=true;current=d;}},
    getElementById(id){return id==='mergeMasterItemDialog'?current:null;},
    createElement(tag){assert(tag==='dialog','expected dialog creation');return new FakeDialog();}
  };
  const context={
    console:{warn(){},log(){},error(){}},
    document,
    queueMicrotask:fn=>fn(),
    summary:()=>({purchased:1,adjusted:0}),
    esc:v=>String(v),
    resolveResult:undefined
  };
  vm.createContext(context);
  vm.runInContext(helperMatch[0]+'\n'+dialogFnSource+'\nthis.dialogFn=v703314dMergeDialog;',context);
  return {context,getDialog:()=>current,getMergeCalls:()=>mergeCalls};
}

async function exercise(kind,opts){
  const h=makeHarness(opts);
  const p=h.context.dialogFn(
    {sku:'SRC-1',item_name:'Source'},
    {sku:'DST-1',item_name:'Target'},
    {sku:'DST-1'}
  );
  const d=h.getDialog();
  assert(d&&d.open,kind+': dialog did not open');
  if(kind==='x')d.buttons['#mergeMasterClose'].onclick();
  if(kind==='cancel')d.buttons['#mergeMasterCancel'].onclick();
  if(kind==='escape')d.oncancel({preventDefault(){}});
  const result=await p;
  assert(result===false,kind+': expected false result');
  assert(d.removed===true,kind+': transient merge dialog was not detached');
  assert(d.open===false,kind+': dialog remained open');
  assert(h.context.document.focusRestored===true,kind+': focus was not restored');
  return {kind,result,closeCalls:d.closeCalls,removed:d.removed};
}

(async()=>{
  const results=[];
  results.push(await exercise('x'));
  results.push(await exercise('cancel'));
  results.push(await exercise('escape'));
  results.push(await exercise('cancel',{throwOnClose:true}));

  // Both base and enhanced implementations must route X/Cancel through finish(false).
  const xHandlers=(src.match(/mergeMasterClose'\)\.onclick[^\n]*finish\(false\)/g)||[]).length;
  const cancelHandlers=(src.match(/mergeMasterCancel'\)\.onclick[^\n]*finish\(false\)/g)||[]).length;
  assert(xHandlers>=2,'Expected both merge-dialog X handlers to call finish(false), got '+xHandlers);
  assert(cancelHandlers>=2,'Expected both merge-dialog Cancel handlers to call finish(false), got '+cancelHandlers);
  assert(/d\.oncancel=e=>\{e\.preventDefault\(\);finish\(false\);\}/.test(src),'Escape/cancel event is not wired to finish(false)');

  console.log('MERGE DIALOG CLOSE BEHAVIOR: '+JSON.stringify(results));
  console.log('MERGE DIALOG HANDLER COVERAGE: X='+xHandlers+' Cancel='+cancelHandlers+' Escape=PASS');
  console.log('MERGE DIALOG CLOSE SUMMARY: PASS');
})().catch(err=>{console.error(err);process.exit(1);});
