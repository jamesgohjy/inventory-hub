const fs=require('fs');
const vm=require('vm');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');
const core=read('v7033-core.js'),app=read('app.js'),runtime=read('runtime-v7.03.3.14r.js'),parser=read('parser-v7-core.js'),index=read('index.html');
new Function(core);new Function(app);new Function(runtime);new Function(parser);
const ctx={console,setTimeout,clearTimeout,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);vm.runInContext(core,ctx,{filename:'v7033-core.js'});
const api=ctx.V7033Patch;assert(api,'V7033Patch did not initialise');
const suites={
  behavioral:api.runRegressionChecks(),
  golden:api.runHistoricalRegressionChecks(),
  quality14n:api.runQualityRegressionChecks14n(),
  holdout14n:api.runHoldoutRegressionChecks14n(),
  intelligence14o:api.runIntelligenceRegressionChecks14o(),
  aerospace14p:api.runAerospaceRegressionChecks14p(),
  monetary14q:api.runMonetaryConsensusRegressionChecks14q(),
  headerAligned14r:api.runHeaderAlignedMoneyRegressionChecks14r()
};
for(const [name,result] of Object.entries(suites)){
  console.log(name+': '+result.cases.filter(x=>x.pass).length+'/'+result.cases.length+' PASS');
  if(!result.ok)console.error(result.failures);
  assert(result.ok,name+' regression suite failed: '+(result.failures||[]).join(', '));
}
const cv=(core.match(/const VERSION='([^']+)'/)||[])[1],av=(app.match(/const VERSION='([^']+)'/)||[])[1],iv=(index.match(/releaseCurrentVersion">v([^<]+)/)||[])[1],uv=(index.match(/releaseUpcomingVersion">v([^<]+)/)||[])[1];
assert(cv==='7.03.3.14r','Core version must be 7.03.3.14r');
assert(av===cv,'App/core version mismatch: '+av+' vs '+cv);assert(iv===cv,'Index/core version mismatch: '+iv+' vs '+cv);assert(uv==='7.03.3.14s','Upcoming version must be 7.03.3.14s');
assert(runtime.includes('__AV_14O_DIAGNOSTICS__'),'14o runtime is not staged');
assert(runtime.includes('find_document_by_hash_v703314o'),'Fingerprint RPC is not staged');
assert(runtime.includes('Parser Quality Dashboard'),'Admin Parser Quality Dashboard is not staged');
assert(runtime.includes('__AV_14P_DIAGNOSTICS__')&&runtime.includes('recovery-header-hi'),'14p targeted recovery runtime is not staged');
assert(runtime.includes('__AV_14Q_DIAGNOSTICS__'),'14q compatibility runtime is not staged');
assert(runtime.includes('V703314R_HEADER_ALIGNED_HELPER')&&runtime.includes('v703314rRenderInventoryGroups'),'14r parser/UI helpers are not staged');
assert(runtime.includes("baseline-v6.55-d452.js?v=7.03.3.14r")&&!runtime.includes('raw.githubusercontent.com'),'Runtime baseline must be repository-local');
assert(!app.includes('BASELINE_APP_URL')&&!app.includes('src.replace(')&&!app.includes('new Blob([src]'),'Bootstrap must not generate source');
assert(app.includes('runtime-v7.03.3.14r.js'),'Static runtime bootstrap reference missing');
assert(fs.existsSync('baseline-v6.55-d452.js'),'Repository-local verified baseline missing');
assert(fs.existsSync('supabase-v7-03-3-14o-parser-intelligence.sql'),'14o Supabase migration missing');
const frozen=JSON.parse(read('tests/known-good-releases.json'));assert(frozen.version==='7.03.3.14m'&&frozen.commit==='742bbf4f66b4f3ae257b5e813661c7b555fb874c','Known-good 14m reference changed');
console.log('All Inventory Hub regression gates PASS.');
