const fs=require('fs');
const vm=require('vm');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');
const core=read('v7033-core.js'),app=read('app.js'),parser=read('parser-v7-core.js'),index=read('index.html');
new Function(core);new Function(app);new Function(parser);
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
  monetary14q:api.runMonetaryConsensusRegressionChecks14q()
};
for(const [name,result] of Object.entries(suites)){
  console.log(name+': '+result.cases.filter(x=>x.pass).length+'/'+result.cases.length+' PASS');
  if(!result.ok)console.error(result.failures);
  assert(result.ok,name+' regression suite failed: '+(result.failures||[]).join(', '));
}
const cv=(core.match(/const VERSION='([^']+)'/)||[])[1],av=(app.match(/const VERSION='([^']+)'/)||[])[1],iv=(index.match(/releaseCurrentVersion">v([^<]+)/)||[])[1],uv=(index.match(/releaseUpcomingVersion">v([^<]+)/)||[])[1];
assert(cv==='7.03.3.14q','Core version must be 7.03.3.14q');
assert(av===cv,'App/core version mismatch: '+av+' vs '+cv);assert(iv===cv,'Index/core version mismatch: '+iv+' vs '+cv);assert(uv==='7.03.3.14r','Upcoming version must be 7.03.3.14r');
assert(app.includes('__AV_14O_DIAGNOSTICS__'),'14o runtime is not staged');
assert(app.includes('find_document_by_hash_v703314o'),'Fingerprint RPC is not staged');
assert(app.includes('Parser Quality Dashboard'),'Admin Parser Quality Dashboard is not staged');
assert(app.includes('__AV_14P_DIAGNOSTICS__')&&app.includes('recovery-header-hi'),'14p targeted recovery runtime is not staged');
assert(app.includes('__AV_14Q_DIAGNOSTICS__')&&app.includes('collapseDocumentGroups14q')&&app.includes('initialiseInventoryGroups14q'),'14q money/group runtime is not staged');
assert(fs.existsSync('supabase-v7-03-3-14o-parser-intelligence.sql'),'14o Supabase migration missing');
const frozen=JSON.parse(read('tests/known-good-releases.json'));assert(frozen.version==='7.03.3.14m'&&frozen.commit==='742bbf4f66b4f3ae257b5e813661c7b555fb874c','Known-good 14m reference changed');
console.log('All Inventory Hub regression gates PASS.');
