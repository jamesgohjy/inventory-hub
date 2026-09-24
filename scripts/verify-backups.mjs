import { createHash } from 'node:crypto';
import { writeFile, appendFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_ACCESS_TOKEN=String(process.env.SUPABASE_ACCESS_TOKEN||'').trim();
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||'').trim();
const GITHUB_RUN_ID=String(process.env.GITHUB_RUN_ID||'').trim();
const GITHUB_RUN_ATTEMPT=String(process.env.GITHUB_RUN_ATTEMPT||'').trim();
const PROJECT_REF=(SUPABASE_URL.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i)||[])[1]||'';

for(const [name,value] of Object.entries({SUPABASE_URL,SUPABASE_ACCESS_TOKEN,SUPABASE_SECRET_KEY,PROJECT_REF})){
  if(!value)throw new Error(name+' is required for backup verification.');
}

const sb=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});

const rank={PASS:0,WARN:1,FAIL:2,UNKNOWN:1};
const worst=(...xs)=>xs.map(x=>String(x||'UNKNOWN').toUpperCase()).sort((a,b)=>(rank[b]??1)-(rank[a]??1))[0]||'UNKNOWN';
const ageHours=(date)=>date?Math.max(0,(Date.now()-new Date(date).getTime())/36e5):null;
const iso=(value)=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toISOString():null;};
const safeInt=(v)=>Number.isFinite(Number(v))?Number(v):0;

async function managementBackupStatus(){
  const response=await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/backups`,{
    headers:{Authorization:`Bearer ${SUPABASE_ACCESS_TOKEN}`,Accept:'application/json'}
  });
  if(!response.ok){
    const text=await response.text();
    throw new Error(`Supabase Management API backup query failed (${response.status}): ${text.slice(0,300)}`);
  }
  const body=await response.json();
  const candidates=[];
  for(const b of Array.isArray(body.backups)?body.backups:[]){
    if(String(b?.status||'').toUpperCase()!=='COMPLETED')continue;
    const d=iso(b.inserted_at);
    if(d)candidates.push(d);
  }
  const physicalUnix=Number(body?.physical_backup_data?.latest_physical_backup_date_unix);
  if(Number.isFinite(physicalUnix)&&physicalUnix>0){
    const d=iso(physicalUnix*1000);
    if(d)candidates.push(d);
  }
  candidates.sort((a,b)=>new Date(b)-new Date(a));
  const latest=candidates[0]||null;
  const hours=ageHours(latest);
  let status='FAIL';
  if(hours!==null&&hours<=36)status='PASS';
  else if(hours!==null&&hours<=60)status='WARN';
  return {
    status,
    latest_backup_at:latest,
    latest_backup_age_hours:hours===null?null:Math.round(hours*100)/100,
    backup_type:body.pitr_enabled?'PITR':(body.walg_enabled?'physical/daily':'daily'),
    pitr_enabled:!!body.pitr_enabled,
    walg_enabled:!!body.walg_enabled,
    summary:{
      region:String(body.region||''),
      backup_count:Array.isArray(body.backups)?body.backups.length:0,
      completed_backup_count:candidates.length,
      pitr_enabled:!!body.pitr_enabled,
      walg_enabled:!!body.walg_enabled
    }
  };
}

async function fetchAllDocuments(){
  const rows=[];
  const pageSize=500;
  for(let from=0;;from+=pageSize){
    const {data,error}=await sb.from('documents').select('id,storage_path,file_sha256').range(from,from+pageSize-1);
    if(error)throw error;
    const page=data||[];
    rows.push(...page);
    if(page.length<pageSize)break;
  }
  return rows;
}

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);
  let cursor=0;
  async function runner(){
    for(;;){
      const i=cursor++;
      if(i>=items.length)return;
      try{out[i]=await worker(items[i],i);}
      catch(error){out[i]={ok:false,error:String(error?.message||error)};}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,Math.max(1,items.length))},runner));
  return out;
}

async function verifyDocumentContents(documents){
  const results=await mapLimit(documents,4,async(doc)=>{
    const path=String(doc.storage_path||'').trim();
    if(!path)return {ok:false,reason:'missing-path',hashed:false};
    const {data,error}=await sb.storage.from('inventory-documents').download(path);
    if(error||!data)return {ok:false,reason:'download-failed',hashed:false};
    const buffer=Buffer.from(await data.arrayBuffer());
    if(buffer.length<=0)return {ok:false,reason:'zero-byte',hashed:false};
    const expected=String(doc.file_sha256||'').trim().toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(expected))return {ok:true,reason:'unhashed',hashed:false,bytes:buffer.length};
    const actual=createHash('sha256').update(buffer).digest('hex');
    return {ok:actual===expected,reason:actual===expected?'hash-match':'hash-mismatch',hashed:true,bytes:buffer.length};
  });

  const summary={
    checked:results.length,
    readable:results.filter(x=>x?.ok).length,
    unreadable:results.filter(x=>!x?.ok&&x?.reason==='download-failed').length,
    missing_path:results.filter(x=>!x?.ok&&x?.reason==='missing-path').length,
    zero_byte:results.filter(x=>!x?.ok&&x?.reason==='zero-byte').length,
    hashed:results.filter(x=>x?.hashed).length,
    hash_matches:results.filter(x=>x?.hashed&&x?.ok).length,
    hash_mismatches:results.filter(x=>x?.reason==='hash-mismatch').length,
    unhashed:results.filter(x=>x?.reason==='unhashed').length,
    total_verified_bytes:results.reduce((n,x)=>n+safeInt(x?.bytes),0)
  };
  return summary;
}

async function rpc(name,args={}){
  const {data,error}=await sb.rpc(name,args);
  if(error)throw new Error(name+': '+String(error.message||error));
  return data;
}

async function main(){
  const errors=[];
  let managed={
    status:'FAIL',latest_backup_at:null,latest_backup_age_hours:null,backup_type:'',
    pitr_enabled:null,walg_enabled:null,summary:{}
  };
  try{managed=await managementBackupStatus();}
  catch(error){errors.push(String(error?.message||error));}

  let snapshot=null;
  try{snapshot=await rpc('service_backup_integrity_snapshot_v703314t');}
  catch(error){errors.push(String(error?.message||error));}

  let contentSummary={checked:0,readable:0,unreadable:0,missing_path:0,zero_byte:0,hashed:0,hash_matches:0,hash_mismatches:0,unhashed:0,total_verified_bytes:0};
  if(snapshot){
    try{contentSummary=await verifyDocumentContents(await fetchAllDocuments());}
    catch(error){errors.push(String(error?.message||error));}
  }

  const databaseStatus=String(snapshot?.database_status||'FAIL').toUpperCase();
  let documentStatus=String(snapshot?.document_status||'FAIL').toUpperCase();
  if(contentSummary.unreadable||contentSummary.missing_path||contentSummary.zero_byte||contentSummary.hash_mismatches)documentStatus='FAIL';
  else if(documentStatus!=='FAIL'&&contentSummary.unhashed>0)documentStatus='WARN';

  const overall=worst(managed.status,databaseStatus,documentStatus,errors.length?'FAIL':'PASS');
  const documentSummary={
    ...(snapshot?.storage||{}),
    content_verification:contentSummary
  };
  const payload={
    run_source:'github-actions',
    overall_status:overall,
    managed_backup_status:managed.status,
    database_status:databaseStatus,
    document_status:documentStatus,
    latest_backup_at:managed.latest_backup_at,
    latest_backup_age_hours:managed.latest_backup_age_hours,
    backup_type:managed.backup_type,
    pitr_enabled:managed.pitr_enabled,
    walg_enabled:managed.walg_enabled,
    table_counts:snapshot?.table_counts||{},
    integrity_summary:snapshot?.integrity||{},
    document_summary:documentSummary,
    management_summary:managed.summary||{},
    error_text:errors.join(' | ').slice(0,2000),
    external_run_id:[GITHUB_RUN_ID,GITHUB_RUN_ATTEMPT].filter(Boolean).join('/'),
    verified_at:new Date().toISOString()
  };

  let recorded=null;
  try{recorded=await rpc('service_record_backup_verification_v703314t',{p_payload:payload});}
  catch(error){
    errors.push(String(error?.message||error));
    payload.overall_status='FAIL';
    payload.error_text=errors.join(' | ').slice(0,2000);
  }

  const report={
    version:'7.03.3.14t',
    verified_at:payload.verified_at,
    overall_status:payload.overall_status,
    managed_backup:{
      status:payload.managed_backup_status,
      latest_backup_at:payload.latest_backup_at,
      age_hours:payload.latest_backup_age_hours,
      type:payload.backup_type,
      pitr_enabled:payload.pitr_enabled,
      walg_enabled:payload.walg_enabled
    },
    database:{
      status:payload.database_status,
      table_counts:payload.table_counts,
      integrity:payload.integrity_summary
    },
    documents:{
      status:payload.document_status,
      summary:payload.document_summary
    },
    recorded:!!recorded,
    errors:errors.map(x=>x.slice(0,300))
  };

  await writeFile('backup-verification-report.json',JSON.stringify(report,null,2)+'\n','utf8');

  const summaryPath=process.env.GITHUB_STEP_SUMMARY;
  if(summaryPath){
    const lines=[
      '# Inventory Hub backup verification',
      '',
      `**Overall:** ${report.overall_status}`,
      `- Managed database backup: ${report.managed_backup.status}${report.managed_backup.age_hours!==null?' · '+report.managed_backup.age_hours+'h old':''}`,
      `- Database integrity: ${report.database.status}`,
      `- Document integrity: ${report.documents.status}`,
      `- Documents checked: ${contentSummary.checked}`,
      `- SHA-256 verified: ${contentSummary.hash_matches}`,
      `- Unhashed legacy documents: ${contentSummary.unhashed}`,
      `- Hash mismatches: ${contentSummary.hash_mismatches}`,
      `- Unreadable/missing files: ${contentSummary.unreadable+contentSummary.missing_path}`,
      ''
    ];
    if(errors.length)lines.push('## Errors','',...errors.map(e=>'- '+e.replace(/\n/g,' ')));
    await appendFile(summaryPath,lines.join('\n')+'\n','utf8');
  }

  console.log(JSON.stringify(report,null,2));
  if(report.overall_status==='FAIL')process.exitCode=1;
}

main().catch(async error=>{
  const message=String(error?.stack||error?.message||error);
  console.error(message);
  try{await writeFile('backup-verification-report.json',JSON.stringify({version:'7.03.3.14t',overall_status:'FAIL',fatal_error:message.slice(0,1000)},null,2)+'\n','utf8');}catch{}
  process.exitCode=1;
});
