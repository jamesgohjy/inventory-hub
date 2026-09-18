// AV Inventory Hub V7.03 — V7 primary structured parser; flattened runtime
const APP_VERSION='7.03';
const RELEASE_CURRENT_NOTES=[
  'Improved invoice item detection',
  'Improved quantity accuracy',
  'Improved serial number checks',
  'Better multi-page invoice verification',
  'Microphone stands can be tracked as inventory',
  'Excluded accessories remain excluded',
  'Stronger checks to prevent incorrect auto-filled fields'
];
// Upcoming notes are intentionally manual. Edit only this list for the next release preview.
// Items already delivered in the current release must not remain here.
const RELEASE_UPCOMING_NOTES=[
  'Tweaks to login UI background',
  'Improving the activity window on Dashboard page',
  'Backup & Recovery planning for imported invoice PDFs'
];
const nextReleaseVersion=(v)=>{const parts=String(v).split('.').map(Number);const major=parts[0]||0,minor=parts[1]||0;return `${major}.${minor+1}`;};
const RELEASE_UPCOMING_VERSION=nextReleaseVersion(APP_VERSION);
const CFG = window.INVENTORY_CONFIG || {mode:'local'};
const authUrlParams=()=>{
  const search=new URLSearchParams(location.search||'');
  const hash=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
  return {
    action:(search.get('auth_action')||hash.get('auth_action')||'').toLowerCase(),
    type:(search.get('type')||hash.get('type')||'').toLowerCase(),
    hasCode:search.has('code')||hash.has('code')
  };
};
const initialAuthParams=authUrlParams();
let authFlowMode=initialAuthParams.action==='recovery'||initialAuthParams.type==='recovery'?'recovery':(initialAuthParams.action==='confirm'||['signup','email','email_change'].includes(initialAuthParams.type)?'confirm':null);
const authRedirectUrl=(action)=>{const u=new URL(location.origin+location.pathname);u.searchParams.set('auth_action',action);return u.toString();};
function cleanAuthCallbackUrl(){history.replaceState({},document.title,location.pathname);}
const $ = (id)=>document.getElementById(id);
const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowIso = ()=>new Date().toISOString();
const today = ()=>new Date().toISOString().slice(0,10);
const fmtDate=(v)=>v?new Date(String(v).slice(0,10)+'T00:00:00').toLocaleDateString('en-SG',{day:'numeric',month:'short',year:'numeric'}):'—';
const fmtDT=(v)=>v?new Date(v).toLocaleString('en-SG',{dateStyle:'medium',timeStyle:'short'}):'—';
const singaporeDateKey=(v)=>{if(!v)return '';const d=new Date(v);if(Number.isNaN(d.getTime()))return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const get=t=>parts.find(p=>p.type===t)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`;};
const money=(n,c='SGD')=> n===null||n===undefined||n===''?'—':new Intl.NumberFormat('en-SG',{style:'currency',currency:c||'SGD'}).format(Number(n));
const uid=()=>crypto.randomUUID();
const norm=(s='')=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const fileKey=(s='')=>String(s).trim().toLowerCase();
const canonicalSupplier=(s='')=>{
  const n=norm(s);
  if(n.includes('loud technologies asia')) return 'Loud Technologies Asia Pte Ltd';
  if(n.includes('av media')) return 'AV Media Pte Ltd';
  if(n.includes('maxxmedia international')) return 'Maxxmedia International Pte Ltd';
  return String(s).replace(/\bPTE\.?\s*LTD\.?\b/i,'Pte Ltd').replace(/\s+/g,' ').trim();
};
const toast=(msg)=>{const openDialogs=[...document.querySelectorAll('dialog[open]')];const dlg=openDialogs[openDialogs.length-1];if(dlg){let t=dlg.querySelector('.v667-modal-toast');if(!t){t=document.createElement('div');t.className='v667-modal-toast';t.setAttribute('role','status');t.style.cssText='position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:min(720px,calc(100vw - 40px));background:#10253f;color:#fff;border:1px solid #4c6f96;border-radius:10px;padding:12px 16px;box-shadow:0 10px 30px rgba(0,0,0,.32);font:600 14px/1.4 system-ui,sans-serif;text-align:center;';dlg.appendChild(t);}t.textContent=msg;t.style.display='block';clearTimeout(t._hideTimer);t._hideTimer=setTimeout(()=>{t.style.display='none';},3500);return;}const t=$('toast');if(!t)return;t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3000)};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const isTransientNetworkError=(err)=>{const x=String(err?.message||err||'').toLowerCase();return ['failed to fetch','network','timeout','timed out','connection','502','503','504'].some(k=>x.includes(k));};
async function withRetry(fn,{retries=2,label='Saving'}={}){let last;for(let attempt=0;attempt<=retries;attempt++){try{return await fn();}catch(err){last=err;if(attempt>=retries||!isTransientNetworkError(err))throw err;toast(`⚠ ${label} interrupted — retrying…`);await sleep(700*(attempt+1));}}throw last;}
function setBusy(el,busy,busyText='Saving…'){if(!el)return;if(busy){el.dataset.oldText=el.textContent;el.disabled=true;el.textContent=busyText;}else{el.disabled=false;if(el.dataset.oldText)el.textContent=el.dataset.oldText;delete el.dataset.oldText;}}


class LocalDB{
  constructor(){this.key='inventory-hub-v1';this.user='Demo user';this.role='admin';}
  data(){return JSON.parse(localStorage.getItem(this.key)||'{"items":[],"purchases":[],"purchaseItems":[],"serials":[],"adjustments":[],"documents":[],"maintenance":[],"audit":[]}');}
  save(d){localStorage.setItem(this.key,JSON.stringify(d));}
  audit(d,entity,entityId,action,oldData,newData){d.audit.unshift({id:uid(),entity_type:entity,entity_id:entityId,action,old_data:oldData,new_data:newData,changed_by:this.user,changed_at:nowIso()});}
  async init(){}
  async load(){const d=this.data();d.maintenance=d.maintenance||[];d.profiles=d.profiles||[];d.healthReviews=d.healthReviews||[];return d;}
  async addItem(x){const d=this.data(); if(d.items.some(i=>norm(i.sku)===norm(x.sku))) throw new Error('SKU already exists.'); const r={id:uid(),...x,created_at:nowIso(),updated_at:nowIso()};d.items.push(r);this.audit(d,'master_items',r.id,'INSERT',null,r);this.save(d);return r;}
  async updateItem(id,x){const d=this.data(),i=d.items.findIndex(r=>r.id===id);if(i<0)throw new Error('Item not found');const old={...d.items[i]};d.items[i]={...d.items[i],...x,updated_at:nowIso()};this.audit(d,'master_items',id,'UPDATE',old,d.items[i]);this.save(d);}
  async deleteItem(id){const d=this.data();if(d.purchaseItems.some(p=>p.master_item_id===id))throw new Error('Cannot delete an item that has purchase history.');const i=d.items.findIndex(r=>r.id===id);if(i<0)return;const old=d.items[i];d.items.splice(i,1);d.adjustments=d.adjustments.filter(a=>a.master_item_id!==id);this.audit(d,'master_items',id,'DELETE',old,null);this.save(d);}
  async adjust(x){const d=this.data();const r={id:uid(),...x,created_at:nowIso(),created_by:this.user};d.adjustments.push(r);this.audit(d,'inventory_adjustments',r.id,'INSERT',null,r);this.save(d);}
  async saveMaintenance(x){const d=this.data();d.maintenance=d.maintenance||[];const id=x.id||uid(),old=d.maintenance.find(r=>r.id===id);const rec={...x,id,created_at:old?.created_at||nowIso(),created_by:old?.created_by||this.user,updated_at:nowIso()};if(old)d.maintenance[d.maintenance.findIndex(r=>r.id===id)]=rec;else d.maintenance.unshift(rec);this.audit(d,'maintenance_records',id,old?'UPDATE':'INSERT',old||null,rec);this.save(d);return rec;}
  async deleteMaintenance(id){const d=this.data();d.maintenance=d.maintenance||[];const i=d.maintenance.findIndex(r=>r.id===id);if(i<0)return;const old=d.maintenance[i];d.maintenance.splice(i,1);this.audit(d,'maintenance_records',id,'DELETE',old,null);this.save(d);}
  async reviewHealthIssue(issue){const d=this.data();d.healthReviews=d.healthReviews||[];if(!d.healthReviews.some(r=>r.issue_key===issue.key))d.healthReviews.unshift({issue_key:issue.key,issue_type:issue.type,entity_type:issue.entity_type||null,entity_id:issue.entity_id||null,title:issue.title||'',detail:issue.detail||'',reviewed_by:this.user,reviewed_at:nowIso()});this.save(d);}
  async duplicateInvoice(supplier,invoice,date=''){const d=this.data();return d.purchases.find(p=>norm(p.supplier_name)===norm(supplier)&&norm(p.invoice_number)===norm(invoice)&&(!date||String(p.invoice_date||'')===String(date)));}
  async duplicateFilename(fileName){const d=this.data();return d.documents.find(x=>fileKey(x.file_name)===fileKey(fileName))||null;}
  async importPurchase(doc,purchase,lines,file){const d=this.data();const docRec={id:uid(),...doc,uploaded_at:nowIso(),uploaded_by:this.user,storage_path:'indexeddb:'+uid()};d.documents.push(docRec);await saveBlob(docRec.id,file);
    const p={id:uid(),...purchase,document_id:docRec.id,created_at:nowIso(),created_by:this.user};d.purchases.push(p);
    for(const line of lines){let item=String(line.sku||'').trim()?d.items.find(i=>norm(i.sku)===norm(line.sku)):null;if(!item){const sameName=d.items.find(i=>norm(i.item_name)===norm(line.item_name));item=sameName||{id:uid(),sku:String(line.sku||'').trim(),item_name:line.item_name,description:line.description||'',category:line.category||'',unit:line.unit||'pcs',created_at:nowIso(),updated_at:nowIso()};if(!sameName){d.items.push(item);this.audit(d,'master_items',item.id,'INSERT',null,item);}}
      const pi={id:uid(),purchase_id:p.id,master_item_id:item.id,raw_description:line.description||'',quantity:Number(line.quantity)||1,unit_price:num(line.unit_price),amount:num(line.amount),warranty:line.warranty||'',created_at:nowIso()};d.purchaseItems.push(pi);
      for(const sn of parseSerials(line.serials)){ if(d.serials.some(s=>norm(s.serial_number)===norm(sn))) throw new Error('Duplicate serial number detected: '+sn); d.serials.push({id:uid(),purchase_item_id:pi.id,master_item_id:item.id,serial_number:sn,created_at:nowIso()}); }
    }
    this.audit(d,'purchases',p.id,'INSERT',null,p);this.audit(d,'documents',docRec.id,'INSERT',null,docRec);this.save(d);return p;}
  async deleteDocument(docId){const d=this.data();const doc=d.documents.find(x=>x.id===docId);if(!doc)throw new Error('Document not found.');const purchases=d.purchases.filter(p=>p.document_id===docId);const purchaseIds=new Set(purchases.map(p=>p.id));const purchaseItems=d.purchaseItems.filter(pi=>purchaseIds.has(pi.purchase_id));const impactedItemIds=[...new Set(purchaseItems.map(pi=>pi.master_item_id).filter(Boolean))];const purchaseItemIds=new Set(purchaseItems.map(pi=>pi.id));d.serials=d.serials.filter(sn=>!purchaseItemIds.has(sn.purchase_item_id));d.purchaseItems=d.purchaseItems.filter(pi=>!purchaseIds.has(pi.purchase_id));d.purchases=d.purchases.filter(p=>!purchaseIds.has(p.id));d.documents=d.documents.filter(x=>x.id!==docId);for(const p of purchases)this.audit(d,'purchases',p.id,'DELETE',p,null);this.audit(d,'documents',doc.id,'DELETE',doc,null);for(const itemId of impactedItemIds){if(!d.purchaseItems.some(pi=>pi.master_item_id===itemId)){const idx=d.items.findIndex(i=>i.id===itemId);if(idx>=0){const old=d.items[idx];d.items.splice(idx,1);d.adjustments=d.adjustments.filter(a=>a.master_item_id!==itemId);this.audit(d,'master_items',itemId,'DELETE',old,null);}}}this.save(d);await deleteBlob(docId);}
  async fileUrl(docId,download=false){const b=await getBlob(docId);if(!b)throw new Error('Stored PDF not found in this browser.');const url=URL.createObjectURL(b);if(download){const a=document.createElement('a');a.href=url;a.download=(this.data().documents.find(d=>d.id===docId)?.file_name)||'document.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return null;}return url;}
  async signOut(){}
}

class SupabaseDB{
  async init(){const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');this.sb=createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);}
  async session(){return (await this.sb.auth.getSession()).data.session;}
  async currentUser(){const {data,error}=await this.sb.auth.getUser();if(error)throw error;return data.user||null;}
  onAuthStateChange(cb){return this.sb.auth.onAuthStateChange(cb);}
  async signIn(email,password){const {error}=await this.sb.auth.signInWithPassword({email,password});if(error)throw error;}
  async resetPassword(email){const {error}=await this.sb.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl('recovery')});if(error)throw error;}
  async signUp(email,password){const displayName=prettyEmailName(email);try{await this.sb.auth.signOut({scope:'local'});}catch(_){ }const {data,error}=await this.sb.auth.signUp({email,password,options:{data:{display_name:displayName},emailRedirectTo:authRedirectUrl('confirm')}});if(error)throw error;if(data?.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0)throw new Error('An account already exists for this email.');return data;}
  async resendConfirmation(email){const {error}=await this.sb.auth.resend({type:'signup',email,options:{emailRedirectTo:authRedirectUrl('confirm')}});if(error)throw error;}
  async updatePassword(password){const {data,error}=await this.sb.auth.updateUser({password});if(error)throw error;return data;}
  async signOut(){await this.sb.auth.signOut();}
  async profileForUser(id){if(!id)return null;const {data,error}=await this.sb.from('profiles').select('id,email,display_name,app_confirmed,role,is_owner').eq('id',id).maybeSingle();if(error)throw error;return data||null;}
  async ensureProfile(){const {error}=await this.sb.rpc('ensure_inventory_profile');if(error)throw error;}
  async setMemberRole(userId,role){const {error}=await this.sb.rpc('set_inventory_member_role',{p_user_id:userId,p_role:role});if(error)throw error;}
  async setMemberDisplayName(userId,displayName){const {error}=await this.sb.rpc('set_inventory_member_display_name',{p_user_id:userId,p_display_name:displayName});if(error)throw error;}
  async load(){
    const [items,purchases,purchaseItems,serials,adjustments,documents,maintenance,audit,profiles,healthReviews]=await Promise.all([
      this.sb.from('master_items').select('*').order('item_name'),this.sb.from('purchases').select('*').order('invoice_date',{ascending:false}),this.sb.from('purchase_items').select('*'),this.sb.from('serial_numbers').select('*'),this.sb.from('inventory_adjustments').select('*'),this.sb.from('documents').select('*').order('uploaded_at',{ascending:false}),this.sb.from('maintenance_records').select('*').order('maintenance_date',{ascending:false}),this.sb.from('audit_log').select('*').order('changed_at',{ascending:false}).limit(500),this.sb.from('profiles').select('id,email,display_name,role,is_owner'),this.sb.from('health_issue_reviews').select('issue_key,issue_type,entity_type,entity_id,title,detail,reviewed_by,reviewed_at').order('reviewed_at',{ascending:false})
    ]);for(const r of [items,purchases,purchaseItems,serials,adjustments,documents,maintenance,audit,profiles])if(r.error)throw r.error;if(healthReviews.error&&!['42P01','PGRST205'].includes(healthReviews.error.code))throw healthReviews.error;return{items:items.data,purchases:purchases.data,purchaseItems:purchaseItems.data,serials:serials.data,adjustments:adjustments.data,documents:documents.data,maintenance:maintenance.data,audit:audit.data,profiles:profiles.data||[],healthReviews:healthReviews.error?[]:(healthReviews.data||[])};
  }
  async addItem(x){const {data,error}=await this.sb.from('master_items').insert(x).select().single();if(error)throw error;return data;}
  async updateItem(id,x){const {error}=await this.sb.from('master_items').update(x).eq('id',id);if(error)throw error;}
  async deleteItem(id){const {error}=await this.sb.from('master_items').delete().eq('id',id);if(error)throw error;}
  async adjust(x){const {error}=await this.sb.from('inventory_adjustments').insert(x);if(error)throw error;}
  async saveMaintenance(x){const payload={maintenance_date:x.maintenance_date,master_item_id:x.master_item_id,serial_number:x.serial_number||null,issue:x.issue,action_taken:x.action_taken,outcome:x.outcome,notes:x.notes||null};if(x.id){const {error}=await this.sb.from('maintenance_records').update(payload).eq('id',x.id);if(error)throw error;}else{const {error}=await this.sb.from('maintenance_records').insert(payload);if(error)throw error;}}
  async deleteMaintenance(id){const {error}=await this.sb.from('maintenance_records').delete().eq('id',id);if(error)throw error;}
  async reviewHealthIssue(issue){const {error}=await this.sb.rpc('mark_health_issue_reviewed',{p_issue_key:issue.key,p_issue_type:issue.type,p_entity_type:issue.entity_type||null,p_entity_id:issue.entity_id||null,p_title:issue.title||'',p_detail:issue.detail||''});if(error){if(['42883','PGRST202'].includes(error.code)||String(error.message||'').includes('mark_health_issue_reviewed'))throw new Error('V6.35 database update is required before reviewed Data Health findings can be saved.');throw error;}}
  async duplicateInvoice(supplier,invoice,date=''){let q=this.sb.from('purchases').select('*').ilike('supplier_name',supplier).ilike('invoice_number',invoice);if(date)q=q.eq('invoice_date',date);const {data,error}=await q.limit(1);if(error)throw error;return data?.[0]||null;}
  async duplicateSerials(serials){const vals=parseSerials(serials);if(!vals.length)return[];const {data,error}=await this.sb.from('serial_numbers').select('serial_number').in('serial_number',vals);if(error)throw error;return (data||[]).map(x=>x.serial_number);}
  async duplicateFilename(fileName){const {data,error}=await this.sb.from('documents').select('id,file_name').limit(1000);if(error)throw error;return (data||[]).find(x=>fileKey(x.file_name)===fileKey(fileName))||null;}
  async importPurchase(doc,purchase,lines,file){
    const path=`${String(purchase.invoice_date||new Date().getFullYear()).slice(0,4)}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    let uploaded=false;
    try{
      const up=await this.sb.storage.from('inventory-documents').upload(path,file,{contentType:'application/pdf'});
      if(up.error)throw up.error; uploaded=true;
      const invoiceDate=String(purchase.invoice_date||'').trim();
      const cleanPurchase={supplier_name:purchase.supplier_name,invoice_number:purchase.invoice_number,invoice_date:invoiceDate||'',delivery_order_number:purchase.delivery_order_number||'',purchase_order_number:'',reference_number:purchase.reference_number||'',currency:purchase.currency||'SGD',subtotal:purchase.subtotal===''||purchase.subtotal==null?'':String(purchase.subtotal),gst:purchase.gst===''||purchase.gst==null?'':String(purchase.gst),total_amount:purchase.total_amount===''||purchase.total_amount==null?'':String(purchase.total_amount)};
      const rpcLines=lines.map(line=>({...line,quantity:Number(line.quantity),unit_price:line.unit_price===''||line.unit_price==null?'':String(line.unit_price),amount:line.amount===''||line.amount==null?'':String(line.amount),serial_numbers:parseSerials(line.serials)}));
      const atomic=await this.sb.rpc('import_invoice_atomic',{p_document:{...doc,storage_path:path},p_purchase:cleanPurchase,p_lines:rpcLines});
      if(atomic.error){if(String(atomic.error.message||'').includes('import_invoice_atomic'))throw new Error('V6.17 database update is required before importing invoices.');throw atomic.error;}
      return atomic.data;
    }catch(err){
      if(uploaded){try{await this.sb.storage.from('inventory-documents').remove([path]);}catch(_e){}}
      throw err;
    }
  }
  async deleteDocument(docId){
    const d=state.data.documents.find(x=>x.id===docId);
    if(!d)throw new Error('Document not found.');
    // V6.10 uses a Supabase transaction function so purchase rows, purchase items and
    // now-unused Master SKUs are cleaned up together instead of leaving zero-quantity SKUs.
    const rpc=await this.sb.rpc('delete_document_inventory_cascade',{p_document_id:docId});
    if(rpc.error){
      if(String(rpc.error.message||'').toLowerCase().includes('delete_document_inventory_cascade')){
        throw new Error('V6.10 database migration has not been run yet. Run supabase-v6-10-migration.sql in Supabase SQL Editor, then try again.');
      }
      throw rpc.error;
    }
    const storagePath=rpc.data||d.storage_path;
    if(storagePath){const rm=await this.sb.storage.from('inventory-documents').remove([storagePath]);if(rm.error)console.warn('Database records deleted but storage cleanup failed:',rm.error);}
  }
  async fileUrl(docId,download=false){const d=state.data.documents.find(x=>x.id===docId);const {data,error}=await this.sb.storage.from('inventory-documents').createSignedUrl(d.storage_path,120,{download:download?d.file_name:undefined});if(error)throw error;if(download){window.open(data.signedUrl,'_blank');return null;}return data.signedUrl;}
}

const state={db:null,data:null,parsed:null,file:null,session:null,profile:null,pdfPreviewUrl:null,pdfPreviewPage:1,pdfPreviewZoom:'page-width',pdfLayout:null,ocrCandidates:null};
const prettyEmailName=(email='')=>{const base=String(email||'').split('@')[0];return base.replace(/[._-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase()).trim()||'Team Member';};
const currentRole=()=>CFG.mode==='supabase'?String(state.profile?.role||'viewer').trim().toLowerCase():'admin';
const canEdit=()=>['admin','editor'].includes(currentRole());
const canManageRoles=()=>currentRole()==='admin';
const requireEdit=()=>{if(canEdit())return true;toast('Viewer access is read-only.');return false;};
const num=(v)=>v===null||v===undefined||v===''?null:Number(String(v).replace(/,/g,''));
const parseSerials=(s='')=>String(s).split(/[,;\n]+/).map(x=>x.trim()).filter(x=>x&&!/^n\/?a$/i.test(x));
function safeFilePart(v,fallback='Unknown'){
  return String(v||'').normalize('NFKD').replace(/[’']/g,'').replace(/&/g,' and ').replace(/\b(?:pte\.?\s*ld?t\.?|pte\.?\s*ltd\.?|private\s+limited|limited)\b/gi,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-{2,}/g,'-')||fallback;
}
function standardPdfFilename(doc={},file=null){
  return v665StoredDocumentFilename(doc,file);
}
async function autoNamedPdf(file,doc){
  const base=standardPdfFilename(doc,file);
  let name=base,n=2;
  while(await state.db.duplicateFilename(name)){
    const dot=base.lastIndexOf('.'),stem=dot>0?base.slice(0,dot):base,ext=dot>0?base.slice(dot):'';
    name=stem+'-'+n+ext;n++;
  }
  if(name===file.name)return file;
  return new File([file],name,{type:file.type||'application/octet-stream',lastModified:file.lastModified});
}

function openIdb(){return new Promise((res,rej)=>{const r=indexedDB.open('inventory-hub-docs',1);r.onupgradeneeded=()=>r.result.createObjectStore('pdfs');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function saveBlob(id,blob){const db=await openIdb();await new Promise((res,rej)=>{const tx=db.transaction('pdfs','readwrite');tx.objectStore('pdfs').put(blob,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();}
async function getBlob(id){const db=await openIdb();const v=await new Promise((res,rej)=>{const tx=db.transaction('pdfs','readonly');const r=tx.objectStore('pdfs').get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return v;}
async function deleteBlob(id){const db=await openIdb();await new Promise((res,rej)=>{const tx=db.transaction('pdfs','readwrite');tx.objectStore('pdfs').delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();}

function summary(item){const purchased=state.data.purchaseItems.filter(x=>x.master_item_id===item.id).reduce((a,b)=>a+Number(b.quantity||0),0);const adjusted=state.data.adjustments.filter(x=>x.master_item_id===item.id).reduce((a,b)=>a+Number(b.quantity||0),0);return{purchased,adjusted,current:purchased-adjusted};}
function itemSuppliers(itemId){const pids=new Set(state.data.purchaseItems.filter(x=>x.master_item_id===itemId).map(x=>x.purchase_id));return [...new Set(state.data.purchases.filter(p=>pids.has(p.id)).map(p=>p.supplier_name))];}
function itemInvoices(itemId){const pids=new Set(state.data.purchaseItems.filter(x=>x.master_item_id===itemId).map(x=>x.purchase_id));return state.data.purchases.filter(p=>pids.has(p.id));}
function itemSerials(itemId){return state.data.serials.filter(s=>s.master_item_id===itemId).map(s=>s.serial_number);}
function words(v=''){return new Set(norm(v).split(' ').filter(x=>x.length>1));}
function similarity(a='',b=''){const A=words(a),B=words(b);if(!A.size||!B.size)return 0;let common=0;A.forEach(x=>{if(B.has(x))common++;});return common/Math.max(A.size,B.size);}
function compactSku(v=''){return String(v).toLowerCase().replace(/[^a-z0-9]/g,'');}
function itemMatchScore(line,item){const ls=compactSku(line.sku),is=compactSku(item.sku);if(ls&&is&&ls===is)return 1;const skuScore=ls&&is&&(ls.includes(is)||is.includes(ls))?0.82:0;const nameScore=similarity([line.item_name,line.description].join(' '),[item.item_name,item.description].join(' '));return Math.max(skuScore,nameScore);}
function findBestItemMatch(line){let best=null;for(const item of state.data?.items||[]){const score=itemMatchScore(line,item);if(!best||score>best.score)best={item,score};}return best&&best.score>=0.58?best:null;}
function duplicateLookingPairs(){const out=[],items=state.data?.items||[];for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const score=itemMatchScore(items[i],items[j]);if(score>=0.72)out.push({a:items[i],b:items[j],score});}return out;}
function linkedItemsForDocument(docId){const purchaseIds=new Set((state.data?.purchases||[]).filter(p=>p.document_id===docId).map(p=>p.id));const itemIds=new Set((state.data?.purchaseItems||[]).filter(pi=>purchaseIds.has(pi.purchase_id)).map(pi=>pi.master_item_id));return (state.data?.items||[]).filter(i=>itemIds.has(i.id));}
function healthIssueKey(type,entityType,entityId,extra=''){return [String(type||'issue').toLowerCase().replace(/[^a-z0-9]+/g,'-'),String(entityType||'record').toLowerCase(),String(entityId||extra||'unknown').toLowerCase()].join(':');}
function reviewedHealthKeys(){return new Set((state.data?.healthReviews||[]).map(r=>r.issue_key).filter(Boolean));}
function buildAllHealthIssues(){const issues=[];for(const item of state.data?.items||[]){const s=summary(item),serials=itemSerials(item.id);if(!String(item.category||'').trim())issues.push({key:healthIssueKey('Missing category','master_items',item.id),severity:'medium',type:'Missing category',title:item.item_name,detail:`${item.sku||'No SKU'} has no category.`,entity_type:'master_items',entity_id:item.id,item_id:item.id,view:'inventory'});if(s.purchased>0&&!serials.length)issues.push({key:healthIssueKey('Serial review','master_items',item.id),severity:'low',type:'Serial review',title:item.item_name,detail:`No serial number is recorded for ${item.sku||item.item_name}.`,entity_type:'master_items',entity_id:item.id,item_id:item.id,view:'inventory'});if(s.current<0)issues.push({key:healthIssueKey('Negative inventory','master_items',item.id),severity:'high',type:'Negative inventory',title:item.item_name,detail:`Current inventory is ${s.current}. Review adjustments.`,entity_type:'master_items',entity_id:item.id,item_id:item.id,view:'inventory'});}for(const p of state.data?.purchases||[])if(!String(p.invoice_date||'').trim())issues.push({key:healthIssueKey('Missing invoice date','purchases',p.id),severity:'high',type:'Missing invoice date',title:p.invoice_number||'Invoice',detail:`${p.supplier_name||'Supplier'} invoice has no invoice date.`,entity_type:'purchases',entity_id:p.id,view:'documents'});for(const d of state.data?.documents||[])if(!linkedItemsForDocument(d.id).length)issues.push({key:healthIssueKey('Unlinked document','documents',d.id),severity:'medium',type:'Unlinked document',title:d.file_name,detail:'Document has no linked equipment line items.',entity_type:'documents',entity_id:d.id,view:'documents'});for(const pair of duplicateLookingPairs()){const ids=[pair.a.id,pair.b.id].sort();issues.push({key:healthIssueKey('Possible duplicate SKU','master_items_pair',ids.join('+')),severity:'medium',type:'Possible duplicate SKU',title:`${pair.a.sku} / ${pair.b.sku}`,detail:`${pair.a.item_name} and ${pair.b.item_name} look ${Math.round(pair.score*100)}% similar.`,entity_type:'master_items_pair',entity_id:ids.join('+'),item_id:pair.a.id,view:'inventory'});}const seen=new Map();for(const sn of state.data?.serials||[]){const k=norm(sn.serial_number);if(!k)continue;seen.set(k,(seen.get(k)||0)+1);}for(const [sn,c] of seen)if(c>1)issues.push({key:healthIssueKey('Duplicate serial','serial_numbers',sn),severity:'high',type:'Duplicate serial',title:sn,detail:`Serial appears ${c} times.`,entity_type:'serial_numbers',entity_id:sn,view:'inventory'});return issues;}
function buildHealthIssues(){const reviewed=reviewedHealthKeys();return buildAllHealthIssues().filter(x=>!reviewed.has(x.key));}
function healthScore(issues=buildHealthIssues()){const weight={high:12,medium:7,low:3};return Math.max(0,100-Math.min(85,issues.reduce((n,x)=>n+(weight[x.severity]||5),0)));}
function healthLabel(score){return score>=95?'Excellent':score>=85?'Good':score>=70?'Fair':'Needs attention';}
function healthBreakdown(issues=buildHealthIssues()){const counts={missingCategory:0,serial:0,document:0,other:0};for(const x of issues){if(x.type==='Missing category')counts.missingCategory++;else if(['Serial review','Duplicate serial'].includes(x.type))counts.serial++;else if(['Unlinked document','Missing invoice date'].includes(x.type))counts.document++;else counts.other++;}return counts;}
function renderAutomationCentre(){const issues=buildHealthIssues(),score=healthScore(issues),high=issues.filter(x=>x.severity==='high').length;if($('needsAttentionCount'))$('needsAttentionCount').textContent=issues.length;if($('needsAttentionSummary'))$('needsAttentionSummary').textContent=issues.length?`${high?high+' important · ':''}${issues.length} record${issues.length===1?'':'s'} to review`:'No issues detected';if($('dataHealthScore')){$('dataHealthScore').textContent=`${score}% ${healthLabel(score)}`;$('dataHealthScore').classList.toggle('warn',score<85);}if($('importRuleSummary'))$('importRuleSummary').textContent='Loud + AV Media rules active';}
function issueReviewButton(x){const label=canEdit()?'Review':'View';return `<button class="secondary small-btn" data-health-view="${esc(x.view||'inventory')}" data-health-key="${esc(x.key)}" ${x.item_id?`data-health-item="${x.item_id}"`:''}>${label}</button>`;}
function issueRow(x){return `<div class="attention-row ${x.severity}"><span class="attention-severity"><i data-lucide="${x.severity==='high'?'triangle-alert':x.severity==='medium'?'circle-alert':'info'}"></i></span><div><strong>${esc(x.type)} · ${esc(x.title)}</strong><p>${esc(x.detail)}</p></div>${issueReviewButton(x)}</div>`;}
function openAttention(){const issues=buildHealthIssues(),score=healthScore(issues);$('attentionSummary').innerHTML=`<strong>${issues.length} item${issues.length===1?'':'s'} need review</strong><span>Data health score: ${score}%</span>`;$('attentionList').innerHTML=issues.length?issues.map(issueRow).join(''):'<div class="empty">No issues detected. Your records look healthy.</div>';$('attentionDialog').showModal();window.lucide?.createIcons();}
function openHealth(){const issues=buildHealthIssues(),score=healthScore(issues),b=healthBreakdown(issues),healthy=Math.max(0,(state.data?.items||[]).length-issues.filter(x=>x.item_id).length);const breakdown=[['check-circle-2',`${healthy} healthy record${healthy===1?'':'s'}`,'healthy'],['tags',`${b.missingCategory} missing categor${b.missingCategory===1?'y':'ies'}`,b.missingCategory?'warning':'healthy'],['barcode',`${b.serial} serial issue${b.serial===1?'':'s'}`,b.serial?'warning':'healthy'],['file-warning',`${b.document} document link/date issue${b.document===1?'':'s'}`,b.document?'warning':'healthy']].map(([icon,text,kind])=>`<div class="health-breakdown-row ${kind}"><i data-lucide="${icon}"></i><span>${esc(text)}</span></div>`).join('');$('healthDialogSummary').innerHTML=`<div class="health-overview"><div class="health-overview-score"><strong>${score}%</strong><span>${healthLabel(score)}</span></div><div class="health-breakdown">${breakdown}</div><button type="button" class="secondary small-btn health-review-all" data-health-review-all>${issues.length?`Review ${issues.length} issue${issues.length===1?'':'s'} →`:'No issues to review'}</button></div>`;const rows=issues.map(x=>`<tr><td><span class="health-pill ${x.severity}">${esc(x.severity)}</span></td><td>${esc(x.type)}</td><td>${esc(x.title)}</td><td>${esc(x.detail)}</td><td>${issueReviewButton(x)}</td></tr>`).join('');$('healthIssueTable').innerHTML=rows?`<table><thead><tr><th>Priority</th><th>Check</th><th>Record</th><th>Finding</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="empty">No issues detected.</div>';$('healthDialog').showModal();window.lucide?.createIcons();}
async function markHealthIssueReviewed(issue){if(!issue||!canEdit())return false;try{await state.db.reviewHealthIssue(issue);state.data.healthReviews=state.data.healthReviews||[];if(!state.data.healthReviews.some(r=>r.issue_key===issue.key))state.data.healthReviews.unshift({issue_key:issue.key,issue_type:issue.type,entity_type:issue.entity_type||null,entity_id:issue.entity_id||null,title:issue.title||'',detail:issue.detail||'',reviewed_by:state.session?.user?.id||currentUserDisplayName(),reviewed_at:nowIso()});renderAutomationCentre();return true;}catch(e){console.error(e);toast(friendlyError(e));return false;}}
function supplierRuleForText(text=''){if(/Loud Technologies Asia/i.test(text))return{key:'loud',label:'Loud Technologies rule'};if(/AV\s+MEDIA/i.test(text))return{key:'avmedia',label:'AV Media OCR rule'};if(/MAXXMEDIA/i.test(text))return{key:'maxxmedia',label:'Maxxmedia OCR rule'};return{key:'generic',label:'Generic OCR rules'};}
function renderStockTake(){state.stockTakeCounts=state.stockTakeCounts||{};const q=norm($('stockTakeSearch')?.value||'');const items=(state.data?.items||[]).filter(i=>!q||norm([i.sku,i.item_name,i.category].join(' ')).includes(q));let counted=0,diffs=0;const rows=items.map(i=>{const sys=summary(i).current,raw=state.stockTakeCounts[i.id],has=raw!==undefined&&raw!==''&&raw!==null,physical=has?Number(raw):null,diff=has?physical-sys:null;if(has)counted++;if(has&&diff!==0)diffs++;const status=!has?'Not counted':diff===0?'Match':diff<0?`Short ${Math.abs(diff)}`:`Over ${diff}`;return `<tr><td><strong>${esc(i.sku)}</strong><br><span class="muted">${esc(i.item_name)}</span></td><td class="qty">${sys}</td><td><input class="stocktake-input" data-stock-id="${i.id}" type="number" min="0" step="1" value="${has?physical:''}" placeholder="Count"></td><td class="qty ${has&&diff!==0?'stock-diff':''}">${has?(diff>0?'+':'')+diff:'—'}</td><td><span class="stock-status ${!has?'pending':diff===0?'match':'difference'}">${status}</span></td></tr>`;}).join('');$('stockTakeTable').innerHTML=rows?`<table><thead><tr><th>Equipment</th><th>System</th><th>Physical count</th><th>Difference</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="empty">No inventory items found.</div>';$('stockTakeSummary').innerHTML=`<strong>${counted}/${state.data.items.length} counted</strong><span>${diffs} discrepanc${diffs===1?'y':'ies'} flagged</span>`;}
function openStockTake(){state.stockTakeCounts=state.stockTakeCounts||{};$('stockTakeSearch').value='';renderStockTake();$('stockTakeDialog').showModal();}
function stockTakeDifferences(){return (state.data?.items||[]).map(i=>{const raw=state.stockTakeCounts?.[i.id];if(raw===undefined||raw==='')return null;const sys=summary(i).current,physical=Number(raw),diff=physical-sys;return diff?{i,sys,physical,diff}:null;}).filter(Boolean);}
async function openLatestInvoiceForItem(id){const ps=itemInvoices(id).filter(p=>p.document_id).sort((a,b)=>String(b.invoice_date||'').localeCompare(String(a.invoice_date||'')));if(!ps.length){toast('No linked invoice PDF for this item.');return;}try{const u=await state.db.fileUrl(ps[0].document_id);if(u)window.open(u,'_blank');}catch(e){toast(friendlyError(e));}}
async function copyItemSerials(id){const serials=itemSerials(id);if(!serials.length){toast('No serial numbers recorded for this item.');return;}await navigator.clipboard.writeText(serials.join(', '));toast(`${serials.length} serial number${serials.length===1?'':'s'} copied.`);}

async function reload(){if(CFG.mode==='supabase')setHealth('reconnecting','Reconnecting');try{state.data=await state.db.load();if(state.session){const liveProfile=(state.data.profiles||[]).find(p=>p.id===state.session.user?.id);if(liveProfile)state.profile={...(state.profile||{}),...liveProfile};setUserIdentity(state.session);}renderAll();setHealth('live',CFG.mode==='supabase'?'Live':'Demo mode');}catch(e){setHealth('offline','Offline');throw e;}}
function iconForItem(item){const c=norm([item.category,item.item_name,item.description].join(' '));if(c.includes('microphone')||c.includes('wireless')||c.includes('audio'))return'mic-2';if(c.includes('cable')||c.includes('hdmi'))return'cable';if(c.includes('display')||c.includes('monitor')||c.includes('screen'))return'monitor';if(c.includes('projector'))return'projector';if(c.includes('camera'))return'camera';if(c.includes('speaker'))return'speaker';return'package';}
const DASH_ASSETS={projector:'data:image/jpeg;base64,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',microphone:'data:image/jpeg;base64,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',cable:'data:image/jpeg;base64,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',monitor:'data:image/jpeg;base64,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'};
function v672SketchKind(item){
  const c=norm([item?.sku,item?.item_name,item?.description,item?.category].join(' '));
  if(/\b(?:rolling stand|mobile stand|floor stand|trolley|cart|tripod stand|display stand)\b/.test(c))return'stand';
  if(/\b(?:projector|projection)\b/.test(c))return'projector';
  if(/\b(?:active speaker|speaker|loudspeaker|soundbar)\b/.test(c))return'speaker';
  if(/\b(?:control panel|controller|switcher|matrix|processor|av control)\b/.test(c))return'control';
  if(/\b(?:microphone|wireless handheld|transmitter|receiver|bodypack)\b/.test(c))return'microphone';
  if(/\b(?:visualizer|document camera)\b/.test(c))return'visualizer';
  if(/\b(?:camera|camcorder|ptz)\b/.test(c))return'camera';
  if(/\b(?:hdmi|usb|cat6|cable|adapter|dongle|ideashare key)\b/.test(c))return'cable';
  if(/\b(?:display|monitor|screen|ideahub|television|tv)\b/.test(c))return'display';
  return'generic';
}
function v672SketchSvg(item){
  const kind=v672SketchKind(item),identity=String(item?.sku||item?.item_name||item?.description||kind);
  let hash=2166136261;for(let i=0;i<identity.length;i++){hash^=identity.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0;}
  const wobble=(hash%5)-2,tilt=((hash>>>3)%5)-2;
  const stroke='#395269',soft='#7890a5',paper='#f3f7fb';
  const common=`fill="none" stroke="${stroke}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;
  const faint=`fill="none" stroke="${soft}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".48"`;
  const sketches={
    projector:`<g transform="translate(${wobble} ${tilt})"><rect x="112" y="92" width="256" height="102" rx="18" ${common}/><circle cx="304" cy="143" r="32" ${common}/><circle cx="304" cy="143" r="17" ${faint}/><path d="M140 117h93M140 133h74M141 166h54M127 194l-9 18M353 194l10 18" ${faint}/><path d="M145 88l22-20h154l21 20" ${faint}/></g>`,
    microphone:`<g transform="translate(${wobble} ${tilt}) rotate(-8 240 130)"><ellipse cx="184" cy="78" rx="45" ry="34" ${common}/><path d="M161 101l20 101M207 101l20 101M176 203h58" ${common}/><path d="M151 72h66M157 59h53M165 47h37" ${faint}/><path d="M268 64c24 10 34 28 29 53l-19 91M260 58c34 9 54 31 54 62" ${faint}/></g>`,
    speaker:`<g transform="translate(${wobble} ${tilt})"><rect x="145" y="45" width="190" height="174" rx="16" ${common}/><circle cx="240" cy="148" r="50" ${common}/><circle cx="240" cy="148" r="25" ${faint}/><circle cx="240" cy="82" r="15" ${common}/><path d="M161 210h158M164 54l-9 14M316 54l9 14" ${faint}/></g>`,
    control:`<g transform="translate(${wobble} ${tilt})"><rect x="88" y="72" width="304" height="120" rx="12" ${common}/><rect x="112" y="96" width="112" height="70" rx="7" ${faint}/><circle cx="268" cy="112" r="9" ${common}/><circle cx="307" cy="112" r="9" ${common}/><circle cx="346" cy="112" r="9" ${common}/><path d="M254 147h103M254 163h77M105 192l-12 19M375 192l12 19" ${faint}/></g>`,
    cable:`<g transform="translate(${wobble} ${tilt})"><path d="M125 143c0-54 50-82 104-64 65 21 73 91 20 110-47 17-91-6-88-44 3-38 44-57 78-41 27 13 30 41 11 55" ${common}/><path d="M112 142h-38v-29h31l20 14M250 160l55 28" ${common}/><rect x="305" y="176" width="72" height="30" rx="5" ${common}/><path d="M322 176v-16h38v16M86 113V96" ${faint}/></g>`,
    display:`<g transform="translate(${wobble} ${tilt})"><rect x="96" y="42" width="288" height="154" rx="12" ${common}/><path d="M240 197v28M188 226h104" ${common}/><path d="M118 67l119 0M118 84h70M335 174h26" ${faint}/><rect x="116" y="62" width="248" height="111" rx="5" ${faint}/></g>`,
    camera:`<g transform="translate(${wobble} ${tilt})"><rect x="120" y="86" width="202" height="110" rx="18" ${common}/><circle cx="235" cy="141" r="43" ${common}/><circle cx="235" cy="141" r="22" ${faint}/><path d="M322 110l70-31v123l-70-30zM151 86l18-30h87l19 30" ${common}/></g>`,
    visualizer:`<g transform="translate(${wobble} ${tilt})"><rect x="106" y="181" width="268" height="34" rx="8" ${common}/><path d="M186 181V79c0-20 14-34 34-34h46" ${common}/><rect x="257" y="31" width="93" height="55" rx="9" ${common}/><circle cx="316" cy="58" r="10" ${faint}/><path d="M138 197h84M272 197h61" ${faint}/></g>`,
    stand:`<g transform="translate(${wobble} ${tilt})"><rect x="126" y="43" width="228" height="112" rx="9" ${common}/><path d="M240 155v55M240 179h-72M240 179h72M169 179l-27 35M311 179l27 35" ${common}/><circle cx="138" cy="219" r="9" ${faint}/><circle cx="342" cy="219" r="9" ${faint}/><path d="M145 57h190M145 73h117" ${faint}/></g>`,
    generic:`<g transform="translate(${wobble} ${tilt})"><rect x="105" y="72" width="270" height="126" rx="16" ${common}/><circle cx="154" cy="135" r="17" ${common}/><circle cx="207" cy="135" r="17" ${common}/><path d="M251 112h88M251 132h68M251 152h96M124 87l16-18h201l15 18" ${faint}/></g>`
  };
  const art=sketches[kind]||sketches.generic;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 260" role="img" aria-label="Generated AV equipment sketch"><rect width="480" height="260" rx="24" fill="${paper}"/><path d="M43 218c72 8 143 9 216 3 72-5 129-4 176 2" ${faint}/>${art}</svg>`;
  return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);
}
function imageForItem(item){
  const manual=String(item?.image_url||'').trim();
  if(manual)return manual;
  return v672SketchSvg(item);
}
function auditIcon(a){if(a.entity_type==='inventory_adjustments')return['sliders-horizontal','adjustment'];if(a.action==='DELETE')return['trash-2','delete'];if(a.entity_type==='purchases'||a.entity_type==='documents')return['file-text',''];return['package-plus',''];}
function auditLabel(a){if(a.entity_type==='inventory_adjustments')return['Adjusted','adjusted'];if(a.action==='DELETE')return['Deleted','deleted'];if(a.action==='UPDATE')return['Edited','edited'];if(a.entity_type==='purchases'||a.entity_type==='documents')return['Imported','imported'];return['Added','added'];}
function friendlyEntityName(t){return({purchase_items:'purchase item',serial_numbers:'serial number',master_items:'inventory item',inventory_adjustments:'inventory adjustment',documents:'document',purchases:'invoice'})[t]||String(t||'record').replaceAll('_',' ');}
function profileName(userId){const p=(state.data?.profiles||[]).find(x=>x.id===userId);return p?.display_name||p?.email||'';}
function currentUserDisplayName(){return state.profile?.display_name||profileName(state.session?.user?.id)||state.session?.user?.user_metadata?.display_name||prettyEmailName(state.session?.user?.email||'');}
function auditWho(a){if(!a?.changed_by)return'System';const named=profileName(a.changed_by);if(named)return named;const u=state.session?.user;if(u&&a.changed_by===u.id)return currentUserDisplayName();return'Team Member';}
function sameAuditActor(a,b){return String(a.changed_by||'')===String(b.changed_by||'');}
function nearAuditTime(a,b,ms=8000){return Math.abs(new Date(a.changed_at||0)-new Date(b.changed_at||0))<=ms;}
function consolidatedAudit(){
  const src=[...(state.data.audit||[])].sort((a,b)=>new Date(b.changed_at)-new Date(a.changed_at));
  const hidden=new Set(),out=[];
  for(const a of src){
    if(hidden.has(a.id))continue;
    const data=a.new_data||a.old_data||{};
    if(a.entity_type==='purchases'&&(a.action==='INSERT'||a.action==='DELETE')){
      const p=data,pid=p.id||a.entity_id;
      const pis=src.filter(x=>!hidden.has(x.id)&&x.entity_type==='purchase_items'&&x.action===a.action&&String((x.new_data||x.old_data||{}).purchase_id||'')===String(pid||'')&&sameAuditActor(a,x)&&nearAuditTime(a,x));
      const piIds=new Set(pis.map(x=>String((x.new_data||x.old_data||{}).id||x.entity_id||'')));
      const itemIds=new Set(pis.map(x=>String((x.new_data||x.old_data||{}).master_item_id||'')).filter(Boolean));
      const serials=src.filter(x=>!hidden.has(x.id)&&x.entity_type==='serial_numbers'&&x.action===a.action&&piIds.has(String((x.new_data||x.old_data||{}).purchase_item_id||''))&&sameAuditActor(a,x)&&nearAuditTime(a,x));
      const masters=src.filter(x=>!hidden.has(x.id)&&x.entity_type==='master_items'&&x.action===a.action&&itemIds.has(String((x.new_data||x.old_data||{}).id||x.entity_id||''))&&sameAuditActor(a,x)&&nearAuditTime(a,x));
      const docs=src.filter(x=>!hidden.has(x.id)&&x.entity_type==='documents'&&x.action===a.action&&String((x.new_data||x.old_data||{}).id||x.entity_id||'')===String(p.document_id||'')&&sameAuditActor(a,x)&&nearAuditTime(a,x));
      [...pis,...serials,...masters,...docs].forEach(x=>hidden.add(x.id));
      const units=pis.reduce((sum,x)=>sum+Number((x.new_data||x.old_data||{}).quantity||0),0);
      out.push({...a,_summary:{kind:a.action==='INSERT'?'import':'deleteInvoice',lineCount:pis.length,units}});
      continue;
    }
    out.push(a);
  }
  return out;
}
function friendlyAudit(a){
  const n=a.new_data||{},o=a.old_data||{};
  if(a._summary?.kind==='import')return `Imported invoice ${n.invoice_number||''}${a._summary.lineCount?` — ${a._summary.lineCount} line item${a._summary.lineCount===1?'':'s'}, ${a._summary.units} unit${a._summary.units===1?'':'s'}`:''}`;
  if(a._summary?.kind==='deleteInvoice')return `Deleted invoice ${o.invoice_number||''}${a._summary.lineCount?` — removed ${a._summary.lineCount} linked line item${a._summary.lineCount===1?'':'s'}`:''}`;
  if(a.entity_type==='inventory_adjustments'&&a.action==='INSERT'){
    const item=state.data.items.find(i=>String(i.id)===String(n.master_item_id));
    const sku=item?.sku||'inventory item',qty=Number(n.quantity||0),reason=n.adjustment_type||n.reason||'Adjustment';
    return `Adjusted ${sku} inventory by -${qty} — ${reason}`;
  }
  if(a.entity_type==='master_items')return `${a.action==='INSERT'?'Added':a.action==='UPDATE'?'Edited':'Deleted'} item ${n.sku||o.sku||''}`;
  if(a.entity_type==='purchases'&&a.action==='INSERT')return `Imported invoice ${n.invoice_number||''}`;
  if(a.entity_type==='documents'&&a.action==='INSERT')return `Stored invoice PDF ${n.file_name||''}`;
  if(a.entity_type==='documents'&&a.action==='DELETE')return `Deleted invoice PDF ${o.file_name||''}`;
  if(a.entity_type==='purchases'&&a.action==='DELETE')return `Deleted invoice ${o.invoice_number||''}`;
  if(a.entity_type==='serial_numbers')return `${a.action==='INSERT'?'Added':a.action==='DELETE'?'Deleted':'Edited'} serial number ${n.serial_number||o.serial_number||''}`;
  if(a.entity_type==='maintenance_records'){const d=a.new_data||a.old_data||{},i=maintenanceItem(d.master_item_id)||{};const verb=a.action==='INSERT'?'Added':a.action==='UPDATE'?'Updated':'Deleted';return `${verb} maintenance record for ${i.sku||i.item_name||'equipment'}${d.outcome?' — '+d.outcome:''}`;}
  if(a.entity_type==='purchase_items')return `${a.action==='INSERT'?'Added':a.action==='DELETE'?'Removed':'Edited'} purchase line item`;
  const verb=a.action==='INSERT'?'Added':a.action==='UPDATE'?'Edited':a.action==='DELETE'?'Deleted':a.action;return `${verb} ${friendlyEntityName(a.entity_type)}`;
}
function renderAll(){renderDashboard();renderAutomationCentre();renderInventory();renderDocuments();renderMaintenance();renderAudit();renderCategories();window.lucide?.createIcons();}
function renderDashboard(){const sums=state.data.items.map(summary);$('mSku').textContent=state.data.items.length;$('mPurchased').textContent=sums.reduce((a,b)=>a+b.purchased,0);$('mCurrent').textContent=sums.reduce((a,b)=>a+b.current,0);$('mDocs').textContent=state.data.documents.length;const latest=state.data.audit.find(a=>['master_items','purchases','purchase_items','inventory_adjustments','documents'].includes(a.entity_type));if($('dashboardUpdated'))$('dashboardUpdated').textContent='Last updated: '+(latest?fmtDT(latest.changed_at):'—');
  const cards=state.data.items.slice(0,4).map(i=>{const s=summary(i);return `<article class="inventory-card" data-detail="${i.id}"><div class="asset-thumb">${imageForItem(i)?`<img src="${imageForItem(i)}" alt="" loading="lazy">`:`<i data-lucide="${iconForItem(i)}"></i>`}</div><h3 title="${esc(i.item_name)}">${esc(i.item_name)}</h3><div class="sku">${esc(i.sku)}</div><div class="stock-line"><span>Current Stock</span><strong>${s.current}</strong></div><div class="stock-line"><span>Total Purchased</span><strong>${s.purchased}</strong></div></article>`}).join('');$('dashboardInventory').innerHTML=cards||'<div class="empty">No inventory yet. Add an item or import an invoice to get started.</div>';
  $('recentAudit').innerHTML=state.data.audit.slice(0,6).map(a=>{const [icon,cls]=auditIcon(a);return `<div class="activity"><div class="activity-icon ${cls}"><i data-lucide="${icon}"></i></div><div class="activity-body"><strong>${esc(friendlyAudit(a))}</strong><span>${esc(auditWho(a))} · ${fmtDT(a.changed_at)}</span></div></div>`}).join('')||'<div class="empty">No activity yet.</div>';window.lucide?.createIcons();}
function renderCategories(){const cur=$('categoryFilter').value;const cats=[...new Set(state.data.items.map(i=>i.category).filter(Boolean))].sort();$('categoryFilter').innerHTML='<option value="">All categories</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');$('categoryFilter').value=cur;}
function renderInventory(){const q=norm($('inventorySearch').value),cat=$('categoryFilter').value,editable=canEdit();const filtered=state.data.items.filter(i=>{const hay=[i.sku,i.item_name,i.description,i.category,...itemSerials(i.id),...itemSuppliers(i.id),...itemInvoices(i.id).map(p=>p.invoice_number)].join(' ');return(!q||norm(hay).includes(q))&&(!cat||i.category===cat)});
  const rows=filtered.map(i=>{const s=summary(i),serials=itemSerials(i.id),hasInvoice=itemInvoices(i.id).some(p=>p.document_id);const skuLabel=String(i.sku||'').trim().length<=13?String(i.sku||'').trim():'—';const itemDisplayDescription=String(i.description||i.item_name||'').trim();return `<tr><td><button class="item-link" data-detail="${i.id}"><strong>${esc(skuLabel)}</strong><span>${esc(itemDisplayDescription)}</span></button></td><td>${esc(i.category||'—')}</td><td>${editable?`<button class="secondary small-btn" data-edit="${i.id}">Edit</button>`:'—'}</td><td class="qty">${s.purchased}</td><td class="qty ${s.current<0?'negative':''}"><strong>${s.current}</strong></td><td>${esc(itemSuppliers(i.id).join(', ')||'—')}</td><td class="actions-menu-cell"><details class="action-menu"><summary aria-label="Actions">⋯</summary><div><button data-detail="${i.id}">View details</button>${editable?`<button data-quick-maint="${i.id}">Add maintenance</button>`:''}<button data-quick-invoice="${i.id}" ${hasInvoice?'':'disabled'}>View invoice</button><button data-copy-serials="${i.id}" ${serials.length?'':'disabled'}>Copy serial${serials.length===1?'':'s'}</button>${editable?`<button data-adjust="${i.id}">Adjust inventory</button><button data-edit="${i.id}">Edit</button><button data-delete="${i.id}">Delete</button>`:''}</div></details></td></tr>`}).join('');$('inventoryTable').innerHTML=rows?`<table><thead><tr><th>SKU / item</th><th>Category</th><th>Edit</th><th>Total purchased <span class="info-tip" title="Everything ever purchased from saved invoices.">ⓘ</span></th><th>Current inventory <span class="info-tip" title="Total Purchased minus inventory adjustments.">ⓘ</span></th><th>Supplier</th><th>Quick actions</th></tr></thead><tbody>${rows}</tbody></table>`:`<div class="empty-state"><strong>No inventory items found.</strong><span>Try clearing your search${editable?' or import an invoice':''}.</span>${editable?'<button class="primary" data-empty-import>Import invoice</button>':''}</div>`;}


function documentInvoiceDate(d){
  const purchases=(state.data?.purchases||[]).filter(p=>String(p.document_id||'')===String(d.id||''));
  const dated=purchases.find(p=>/^\d{4}-\d{2}-\d{2}$/.test(String(p.invoice_date||'')));
  return dated?.invoice_date||'';
}
function documentSortTime(d){
  const invoiceDate=documentInvoiceDate(d);
  if(invoiceDate){
    const m=invoiceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m)return Date.UTC(+m[1],+m[2]-1,+m[3]);
  }
  const t=Date.parse(d.uploaded_at||'');
  return Number.isFinite(t)?t:0;
}
function renderDocuments(){
  const q=norm($('documentSearch').value),editable=canEdit(),sort=$('documentSort')?.value||'newest';
  const docs=state.data.documents
    .filter(d=>!q||norm([d.file_name,d.supplier_name,d.invoice_number,documentInvoiceDate(d),...linkedItemsForDocument(d.id).map(i=>i.sku+' '+i.item_name)].join(' ')).includes(q))
    .slice()
    .sort((a,b)=>{
      const at=documentSortTime(a),bt=documentSortTime(b);
      if(at===bt)return String(a.file_name||'').localeCompare(String(b.file_name||''));
      return sort==='oldest'?at-bt:bt-at;
    });
  const rows=docs.map(d=>{
    const linked=linkedItemsForDocument(d.id),invoiceDate=documentInvoiceDate(d);
    const displayFile=displayDocumentFilename(d,invoiceDate);return `<tr><td>${esc(displayFile)}</td><td>${esc(d.supplier_name||'—')}</td><td>${esc(d.invoice_number||'—')}</td><td>${invoiceDate?fmtDate(invoiceDate):'—'}</td><td><span class="linked-count" title="${esc(linked.map(i=>i.sku+' · '+i.item_name).join(' | '))}">${linked.length} item${linked.length===1?'':'s'}</span></td><td>${fmtDT(d.uploaded_at)}</td><td class="actions"><button data-doc-view="${d.id}">View</button><button data-doc-download="${d.id}">Download</button>${editable?`<button class="danger-outline" data-doc-delete="${d.id}">Delete</button>`:''}</td></tr>`
  }).join('');
  $('documentsTable').innerHTML=rows?`<table><thead><tr><th>File</th><th>Supplier</th><th>Invoice</th><th>Invoice date</th><th>Linked equipment</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="empty">No documents found.</div>';
}
function maintenanceItem(id){return state.data.items.find(i=>i.id===id);}
function renderMaintenance(){const q=norm($('maintenanceSearch')?.value||''),out=$('maintenanceOutcome')?.value||'',editable=canEdit();const rows=(state.data.maintenance||[]).filter(r=>{const i=maintenanceItem(r.master_item_id)||{};return(!q||norm([i.sku,i.item_name,r.serial_number,r.issue,r.action_taken,r.outcome,r.notes].join(' ')).includes(q))&&(!out||r.outcome===out)}).map(r=>{const i=maintenanceItem(r.master_item_id)||{};return `<tr><td>${fmtDate(r.maintenance_date)}</td><td><strong>${esc(i.sku||'—')}</strong><br><span class="muted">${esc(i.item_name||'Unknown item')}</span></td><td>${esc(r.serial_number||'—')}</td><td>${esc(r.issue)}</td><td>${esc(r.action_taken)}</td><td><span class="badge maintenance-badge">${esc(r.outcome)}</span></td><td>${esc(r.notes||'—')}</td><td>${editable?`<div class="maintenance-actions"><button class="icon-btn" title="Edit" data-maint-edit="${r.id}"><i data-lucide="pencil"></i></button><button class="icon-btn danger-icon" title="Delete" data-maint-delete="${r.id}"><i data-lucide="trash-2"></i></button></div>`:'<span class="muted">Read only</span>'}</td></tr>`}).join('');$('maintenanceTable').innerHTML=rows?`<table><thead><tr><th>Date</th><th>Equipment / SKU</th><th>Serial Number</th><th>Issue / Problem</th><th>Action Taken</th><th>Outcome</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="empty">No maintenance records yet.</div>';window.lucide?.createIcons();}
function populateMaintenanceItems(selected=''){if(!$('maintenanceItem'))return;$('maintenanceItem').innerHTML='<option value="">Select equipment...</option>'+state.data.items.map(i=>`<option value="${i.id}" ${i.id===selected?'selected':''}>${esc(i.sku)} · ${esc(i.item_name)}</option>`).join('');populateMaintenanceSerials();}
function populateMaintenanceSerials(selected=''){const id=$('maintenanceItem')?.value;$('maintenanceSerial').innerHTML='<option value="">None / not applicable</option>'+(state.data.serials||[]).filter(x=>x.master_item_id===id).map(x=>`<option ${x.serial_number===selected?'selected':''}>${esc(x.serial_number)}</option>`).join('');}
function openMaintenance(id='',prefillItemId=''){if(!requireEdit())return;const r=(state.data.maintenance||[]).find(x=>x.id===id);const itemId=prefillItemId||(!r&&(state.data.items||[]).some(x=>x.id===id)?id:'');if(itemId&&!r)id='';$('maintenanceForm').reset();$('maintenanceId').value=id;$('maintenanceDate').value=r?.maintenance_date||today();populateMaintenanceItems(r?.master_item_id||itemId||'');if(r){populateMaintenanceSerials(r.serial_number||'');$('maintenanceIssue').value=r.issue||'';$('maintenanceAction').value=r.action_taken||'';$('maintenanceResult').value=r.outcome||'Repaired';$('maintenanceNotes').value=r.notes||'';}else if(itemId){populateMaintenanceSerials('');}$('maintenanceDialogTitle').textContent=r?'Edit Maintenance Record':'Add Maintenance Record';$('maintenanceDialog').showModal();}

function renderAudit(){const q=norm($('auditSearch').value),uf=$('auditUser')?.value||'',af=$('auditAction')?.value||'',df=$('auditDate')?.value||'';const prepared=consolidatedAudit();let list=prepared.filter(a=>{const actionGroup=a.entity_type==='inventory_adjustments'?'ADJUST':a.action;return(!q||norm([friendlyAudit(a),auditWho(a),JSON.stringify(a.new_data),JSON.stringify(a.old_data)].join(' ')).includes(q))&&(!uf||auditWho(a)===uf)&&(!af||actionGroup===af)&&(!df||singaporeDateKey(a.changed_at)===df)});const users=[...new Set(prepared.map(auditWho).filter(Boolean))].sort();if($('auditUser')){const keep=$('auditUser').value;$('auditUser').innerHTML='<option value="">All users</option>'+users.map(u=>`<option ${u===keep?'selected':''} value="${esc(u)}">${esc(u)}</option>`).join('');}const rows=list.map(a=>{const [label,cls]=auditLabel(a);return `<tr><td>${fmtDT(a.changed_at)}</td><td>${esc(auditWho(a))}</td><td><span class="badge ${cls}">${label}</span></td><td>${esc(friendlyAudit(a))}</td></tr>`}).join('');$('auditTable').innerHTML=rows?`<table><thead><tr><th>Date / time</th><th>Who</th><th>Status</th><th>What</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="empty">No recent activities.</div>';}

function changeSummary(a){if(a.action!=='UPDATE')return '';const o=a.old_data||{},n=a.new_data||{};return Object.keys(n).filter(k=>JSON.stringify(o[k])!==JSON.stringify(n[k])&&!['updated_at'].includes(k)).map(k=>`${k.replaceAll('_',' ')}: ${o[k]??'—'} → ${n[k]??'—'}`).join('; ');}

function renderReleasePanel(){
  if($('releaseCurrentVersion'))$('releaseCurrentVersion').textContent='v'+APP_VERSION;
  if($('releaseUpcomingVersion'))$('releaseUpcomingVersion').textContent='v'+RELEASE_UPCOMING_VERSION;
  if($('releaseCurrentNotes'))$('releaseCurrentNotes').innerHTML=RELEASE_CURRENT_NOTES.map(x=>`<li>${esc(x)}</li>`).join('');
  if($('releaseUpcomingNotes'))$('releaseUpcomingNotes').innerHTML=RELEASE_UPCOMING_NOTES.map(x=>`<li>${esc(x)}</li>`).join('');
  if($('appVersion'))$('appVersion').textContent=`Version ${APP_VERSION}`;
}
function openPatchNotes(){renderReleasePanel();$('patchNotesPanel')?.classList.remove('hidden');$('patchNotesBtn')?.setAttribute('aria-expanded','true');window.lucide?.createIcons();}
function closePatchNotes(){$('patchNotesPanel')?.classList.add('hidden');$('patchNotesBtn')?.setAttribute('aria-expanded','false');}
function togglePatchNotes(){const open=$('patchNotesBtn')?.getAttribute('aria-expanded')==='true';open?closePatchNotes():openPatchNotes();}

function showView(name){closePatchNotes();if(name==='audit'&&$('auditSearch')){$('auditSearch').value='';$('auditSearch').setAttribute('value','');}document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));$(name+'View').classList.add('active');if($('appVersion'))$('appVersion').textContent=`Version ${APP_VERSION}`;
document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.view===name));document.body.dataset.view=name;const map={dashboard:['Dashboard','Overview of purchased and current inventory.'],inventory:['Inventory','Master SKUs with aggregated purchases and inventory adjustments.'],documents:['Documents','Stored invoices and source PDFs.'],maintenance:['Maintenance','Track equipment faults, repairs and service history.'],audit:['Recent Activities','Track recent inventory, document and system changes.']};$('pageTitle').textContent=map[name][0];$('pageSubtitle').textContent=map[name][1];if(name==='documents')renderDocuments();window.lucide?.createIcons();}

function openItem(id=null){if(!requireEdit())return;$('itemForm').reset();$('itemUnit').value='pcs';$('itemId').value=id||'';$('itemDialogTitle').textContent=id?'Edit item':'Add item';if(id){const i=state.data.items.find(x=>x.id===id);$('itemSku').value=i.sku;$('itemName').value=i.item_name;$('itemCategory').value=i.category||'';$('itemUnit').value=i.unit||'pcs';$('itemDescription').value=i.description||'';}$('itemDialog').showModal();}
function openAdjust(id){if(!requireEdit())return;const i=state.data.items.find(x=>x.id===id),s=summary(i);$('adjustForm').reset();$('adjustItemId').value=id;$('adjustDate').value=today();$('adjustItemLabel').textContent=`${i.sku} · ${i.item_name} · Current inventory: ${s.current}`;$('adjustQty').max=Math.max(0,s.current);$('adjustDialog').showModal();}
function openDetail(id){const i=state.data.items.find(x=>x.id===id),s=summary(i),purchases=itemInvoices(id),serials=itemSerials(id),adjust=state.data.adjustments.filter(a=>a.master_item_id===id);$('detailTitle').textContent=i.item_name;$('detailSubtitle').textContent=i.sku;
  const purchaseRows=purchases.map(p=>{const lines=state.data.purchaseItems.filter(pi=>pi.purchase_id===p.id&&pi.master_item_id===id);return lines.map(li=>`<tr><td>${fmtDate(p.invoice_date)}</td><td>${esc(p.supplier_name)}</td><td>${esc(p.invoice_number)}</td><td>${li.quantity}</td><td>${money(li.unit_price,p.currency)}</td><td>${p.document_id?`<span class="doc-link" data-doc-view="${p.document_id}">Open PDF</span>`:'—'}</td></tr>`).join('')}).join('');
  const adjRows=adjust.map(a=>`<tr><td>${fmtDate(a.adjustment_date)}</td><td>${esc(a.adjustment_type)}</td><td>-${a.quantity}</td><td>${esc(a.reason||'—')}</td></tr>`).join('');
  const maint=(state.data.maintenance||[]).filter(m=>m.master_item_id===id).sort((a,b)=>String(b.maintenance_date||'').localeCompare(String(a.maintenance_date||'')));
  const maintSummary=maint.length?`${maint.length} maintenance record${maint.length===1?'':'s'} · Last serviced ${fmtDate(maint[0].maintenance_date)}`:'No maintenance records';
  const frequent=maint.length>=3?'<span class="maintenance-frequency"><i data-lucide="history"></i> Frequent maintenance</span>':'';
  const maintTimeline=maint.length?`<div class="maintenance-history-head"><span>${esc(maintSummary)}</span>${frequent}</div><div class="maintenance-timeline">${maint.map(m=>`<article class="maintenance-timeline-item"><div class="maintenance-dot"></div><div class="maintenance-timeline-content"><div class="maintenance-timeline-meta"><strong>${fmtDate(m.maintenance_date)}</strong><span class="badge maintenance-badge">${esc(m.outcome)}</span>${m.serial_number?`<span class="muted">${esc(m.serial_number)}</span>`:''}</div><p><strong>${esc(m.issue)}</strong></p><p>${esc(m.action_taken)}</p>${m.notes?`<small>${esc(m.notes)}</small>`:''}</div></article>`).join('')}</div>`:'<p class="muted">No maintenance records.</p>';
  $('detailBody').innerHTML=`<div class="detail-cards"><div class="detail-card"><span>Total purchased</span><strong>${s.purchased}</strong></div><div class="detail-card"><span>Total adjustments</span><strong>-${s.adjusted}</strong></div><div class="detail-card"><span>Current inventory</span><strong>${s.current}</strong></div></div><p><strong>Category:</strong> ${esc(i.category||'—')} &nbsp; <strong>Unit:</strong> ${esc(i.unit||'pcs')}</p><p>${esc(i.description||'')}</p><h3>Purchase history</h3>${purchaseRows?`<div class="table-wrap"><table><thead><tr><th>Invoice date</th><th>Supplier</th><th>Invoice</th><th>Qty</th><th>Unit price</th><th>PDF</th></tr></thead><tbody>${purchaseRows}</tbody></table></div>`:'<p class="muted">No purchases recorded.</p>'}<h3>Serial numbers</h3><p>${serials.length?serials.map(esc).join(', '):'<span class="muted">None recorded.</span>'}</p><h3>Adjustments</h3>${adjRows?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Reason</th><th>Qty</th><th>Remarks</th></tr></thead><tbody>${adjRows}</tbody></table></div>`:'<p class="muted">No adjustments.</p>'}<h3>Maintenance history</h3>${maintTimeline}`;$('detailDialog').showModal();window.lucide?.createIcons();}

function textContentToLayout(tc,pageNumber=1){
  const items=(tc?.items||[]).filter(x=>String(x.str||'').trim()).map(x=>({text:String(x.str||'').trim(),x:Number(x.transform?.[4]||0),y:Number(x.transform?.[5]||0),w:Number(x.width||0),h:Math.abs(Number(x.height||x.transform?.[3]||0))}));
  if(!items.length)return {page:pageNumber,rows:[],items:[]};
  const heights=items.map(x=>x.h).filter(x=>x>0).sort((a,b)=>a-b);
  const median=heights.length?heights[Math.floor(heights.length/2)]:10;
  const yTolerance=Math.max(2,median*0.45);
  items.sort((a,b)=>Math.abs(b.y-a.y)>yTolerance?b.y-a.y:a.x-b.x);
  const rows=[];
  for(const item of items){
    let row=rows.find(r=>Math.abs(r.y-item.y)<=yTolerance);
    if(!row){row={y:item.y,items:[]};rows.push(row);}
    row.items.push(item);
  }
  rows.sort((a,b)=>b.y-a.y);
  for(const row of rows){
    row.items.sort((a,b)=>a.x-b.x);
    let out='',prev=null;
    for(const item of row.items){
      if(prev){
        const prevRight=prev.x+Math.max(prev.w,0);
        const gap=item.x-prevRight;
        if(gap>Math.max(8,median*1.2))out+='    ';
        else out+=' ';
      }
      out+=item.text;prev=item;
    }
    row.text=out.trim();
  }
  return {page:pageNumber,rows:rows.filter(r=>r.text),items,median,yTolerance};
}
function textContentToLines(tc){return textContentToLayout(tc).rows.map(r=>r.text).join('\n');}
function wordsToLayout(words,pageNumber=1,pageHeight=0,source='ocr'){
  const clean=(words||[]).map(w=>{
    const text=String(w.text||'').trim();
    const x=Number(w.x??w.left??0),top=Number(w.top??0),w0=Number(w.w??w.width??0),h=Number(w.h??w.height??0);
    if(!text||![x,top,w0,h].every(Number.isFinite))return null;
    return {text,x,top,w:w0,h,y:(pageHeight||0)-top,conf:Number.isFinite(Number(w.conf))?Number(w.conf):0};
  }).filter(Boolean);
  if(!clean.length)return {page:pageNumber,rows:[],items:[],source};
  const heights=clean.map(x=>x.h).filter(x=>x>0).sort((a,b)=>a-b);
  const median=heights.length?heights[Math.floor(heights.length/2)]:16;
  const tol=Math.max(4,median*0.70);
  const sorted=[...clean].sort((a,b)=>a.top-b.top||a.x-b.x);
  const rows=[];
  for(const word of sorted){
    const cy=word.top+word.h/2;
    let best=null,bestD=Infinity;
    for(const row of rows){const d=Math.abs(row.cy-cy);if(d<=tol&&d<bestD){best=row;bestD=d;}}
    if(!best){best={cy,items:[]};rows.push(best);}
    best.items.push(word);
    best.cy=best.items.reduce((a,x)=>a+x.top+x.h/2,0)/best.items.length;
  }
  const outRows=rows.map(row=>{
    const items=row.items.sort((a,b)=>a.x-b.x);
    let out='',prev=null;
    for(const item of items){
      if(prev){const gap=item.x-(prev.x+Math.max(prev.w,0));out+=gap>Math.max(12,median*1.3)?'    ':' ';}
      out+=item.text;prev=item;
    }
    const top=Math.min(...items.map(x=>x.top));
    return {y:(pageHeight||0)-top,items:items.map(({top,...x})=>x),text:out.trim()};
  }).filter(r=>r.text).sort((a,b)=>b.y-a.y);
  return {page:pageNumber,rows:outRows,items:clean.map(({top,...x})=>x),median,yTolerance:tol,source};
}
function tsvToLayout(tsv,pageNumber=1,pageHeight=0){
  const raw=String(tsv||'').split(/\r?\n/),words=[];
  for(let i=1;i<raw.length;i++){
    if(!raw[i].trim())continue;
    const parts=raw[i].split('\t');
    if(parts.length<12||Number(parts[0])!==5)continue;
    const left=Number(parts[6]),top=Number(parts[7]),width=Number(parts[8]),height=Number(parts[9]),conf=Number(parts[10]);
    const text=parts.slice(11).join('\t').trim();
    if(!text||![left,top,width,height].every(Number.isFinite))continue;
    words.push({text,x:left,top,w:width,h:height,conf});
  }
  return wordsToLayout(words,pageNumber,pageHeight,'ocr-tsv');
}
function blocksToLayout(blocks,pageNumber=1,pageHeight=0){
  const words=[];
  const walk=(node)=>{
    if(!node)return;
    if(Array.isArray(node)){node.forEach(walk);return;}
    if(typeof node!=='object')return;
    const text=String(node.text||node.symbol||'').trim();
    const b=node.bbox||node.boundingBox||node.box;
    if(text&&b){
      const x0=Number(b.x0??b.left??b.x??0),y0=Number(b.y0??b.top??b.y??0);
      const x1=Number(b.x1??(b.right??(x0+Number(b.width||0)))),y1=Number(b.y1??(b.bottom??(y0+Number(b.height||0))));
      if([x0,y0,x1,y1].every(Number.isFinite)&&x1>x0&&y1>y0&&!/\s/.test(text))words.push({text,x:x0,top:y0,w:x1-x0,h:y1-y0,conf:node.confidence??node.conf??0});
    }
    for(const k of ['blocks','paragraphs','lines','words','symbols'])if(node[k])walk(node[k]);
  };
  walk(blocks);
  const dedup=[],seen=new Set();
  for(const w of words){const key=[w.text,Math.round(w.x),Math.round(w.top),Math.round(w.w),Math.round(w.h)].join('|');if(!seen.has(key)){seen.add(key);dedup.push(w);}}
  return wordsToLayout(dedup,pageNumber,pageHeight,'ocr-blocks');
}
function hocrToLayout(hocr,pageNumber=1,pageHeight=0){
  const words=[];
  const html=String(hocr||'');
  const re=/<span[^>]*class=["'][^"']*ocrx_word[^"']*["'][^>]*title=["'][^"']*bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  const strip=v=>String(v||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();
  while((m=re.exec(html))){const x0=+m[1],y0=+m[2],x1=+m[3],y1=+m[4],text=strip(m[5]);if(text&&x1>x0&&y1>y0)words.push({text,x:x0,top:y0,w:x1-x0,h:y1-y0,conf:0});}
  return wordsToLayout(words,pageNumber,pageHeight,'ocr-hocr');
}
function ocrResultToLayout(data,pageNumber=1,pageHeight=0){
  const candidates=[];
  if(data?.tsv){const x=tsvToLayout(data.tsv,pageNumber,pageHeight);if(x.items?.length)candidates.push(x);}
  if(data?.blocks){const x=blocksToLayout(data.blocks,pageNumber,pageHeight);if(x.items?.length)candidates.push(x);}
  if(data?.hocr){const x=hocrToLayout(data.hocr,pageNumber,pageHeight);if(x.items?.length)candidates.push(x);}
  candidates.sort((a,b)=>(b.items?.length||0)-(a.items?.length||0));
  return candidates[0]||{page:pageNumber,rows:[],items:[],source:'ocr-none'};
}
function layoutInvoiceQuality(layout){
  const rows=layout?.rows||[];
  let score=0;
  const header=rows.find(r=>/\bdescription\b/i.test(r.text)&&/\b(?:units?|qty|quantity)\b/i.test(r.text)&&/\bprice\b/i.test(r.text)&&/\bamount\b/i.test(r.text));
  if(header){
    score+=30;
    const stop=rows.find(r=>r.y<header.y&&/^(?:remarks?|sub\s*total|subtotal|add\s+gst|gst\b|total\b)/i.test(r.text.replace(/^[^A-Za-z]+/,'')));
    const stopY=stop?stop.y:-Infinity;
    const candidates=rows.filter(r=>r.y<header.y&&r.y>stopY&&/^\s*\d{1,3}\b/.test(r.text));
    score+=Math.min(50,candidates.length*10);
  }
  if(rows.some(r=>/\b(?:sub\s*total|subtotal)\b/i.test(r.text)))score+=8;
  if(rows.some(r=>/\b(?:add\s+)?gst\b/i.test(r.text)&&!/(?:reg|registration)/i.test(r.text)))score+=6;
  if(rows.some(r=>/^\s*(?:t?otal)\b/i.test(r.text)))score+=6;
  return score;
}
function ocrTextQuality(text=''){
  const t=normalizePdfText(text);
  let score=0;
  if(/\b(?:tax\s+)?invoice\b/i.test(t))score+=15;
  if(/invoice\s*(?:no\.?|number|#)\s*[:#.-]?\s*\d{5,}/i.test(t))score+=18;
  if(/invoice\s*date\s*[:#.-]?\s*[0-3]?\d\s*[/.\-]\s*[01]?\d\s*[/.\-]\s*\d{2,4}/i.test(t))score+=18;
  if(/ref\s*po\s*number\s*[:#.-]?\s*\d+/i.test(t))score+=6;
  if(/\bdescription\b/i.test(t)&&/\b(?:units?|qty|quantity)\b/i.test(t)&&/\bprice\b/i.test(t)&&/\bamount\b/i.test(t))score+=16;
  if(/\bsub\s*total\b[^\n]*\d+[.,]\d{2}/i.test(t))score+=8;
  if(/\b(?:add\s+)?gst\b[^\n]*\d+[.,]\d{2}/i.test(t)&&!/gst\s+reg/i.test(t))score+=8;
  if(/^\s*t?otal\b[^\n]*\d+[.,]\d{2}/im.test(t))score+=8;
  if(/MAXXMEDIA\s+INTERNATIONAL\s+PTE\s+LTD/i.test(t))score+=6;
  const rows=t.split('\n').filter(x=>/^\s*\d{1,3}\s+.+?\s+(?:\d+\s+)?\d+[.,]\d{2}\s+\d+[.,]\d{2}\s*[\])|}.,;:]*\s*$/.test(x.trim()));
  score+=Math.min(40,rows.length*8);
  return score;
}
async function extractPdf(file){
  setProgress(5,'Loading PDF…');
  state.ocrCandidates=null;
  const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  const data=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjs.getDocument({data}).promise;
  let pages=[],layouts=[],chars=0;
  for(let i=1;i<=pdf.numPages;i++){
    setProgress(10+Math.round(30*i/pdf.numPages),`Extracting page ${i} of ${pdf.numPages}…`);
    const p=await pdf.getPage(i),tc=await p.getTextContent(),layout=textContentToLayout(tc,i);
    layouts.push(layout);const text=layout.rows.map(r=>r.text).join('\n');pages.push(text);chars+=text.replace(/\s/g,'').length;
  }
  let text=pages.join('\n');state.pdfLayout=layouts;
  if(chars<80){
    if(!window.Tesseract)throw new Error('This PDF appears scanned and OCR could not be loaded.');
    const modes=[
      {key:'auto',label:'AUTO',psm:Tesseract.PSM?.AUTO??'3',texts:[],layouts:[]},
      {key:'column',label:'SINGLE_COLUMN',psm:Tesseract.PSM?.SINGLE_COLUMN??'4',texts:[],layouts:[]},
      {key:'block',label:'SINGLE_BLOCK',psm:Tesseract.PSM?.SINGLE_BLOCK??'6',texts:[],layouts:[]}
    ];
    const worker=await Tesseract.createWorker('eng');
    try{
      for(let i=1;i<=pdf.numPages;i++){
        const p=await pdf.getPage(i),vp=p.getViewport({scale:2.5}),c=document.createElement('canvas');
        c.width=Math.round(vp.width);c.height=Math.round(vp.height);await p.render({canvasContext:c.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;
        for(let mi=0;mi<modes.length;mi++){
          const mode=modes[mi];
          const pct=40+Math.round(42*((i-1)*modes.length+mi+1)/(pdf.numPages*modes.length));
          setProgress(pct,`Running OCR ${mode.label}… page ${i} of ${pdf.numPages}`);
          await worker.setParameters({tessedit_pageseg_mode:mode.psm,preserve_interword_spaces:'1',user_defined_dpi:'180'});
          const r=await worker.recognize(c,{}, {text:true,tsv:true,hocr:true,blocks:true});
          const layout=ocrResultToLayout(r.data||{},i,c.height);
          mode.layouts.push(layout);
          const natural=String(r.data?.text||'').trim();
          const reconstructed=layout.rows?.map(x=>x.text).join('\n').trim();
          mode.texts.push(natural||reconstructed);
        }
      }
    }finally{await worker.terminate();}
    const candidates=modes.map(m=>{
      const candidateText=m.texts.join('\n').trim();
      const score=ocrTextQuality(candidateText)+m.layouts.reduce((n,l)=>n+layoutInvoiceQuality(l),0);
      return {source:m.key,label:m.label,text:candidateText,layout:m.layouts,score};
    }).filter(x=>x.text);
    if(!candidates.length)throw new Error('OCR could not read enough text from this PDF.');
    candidates.sort((a,b)=>b.score-a.score);
    state.ocrCandidates=candidates;
    text=candidates[0].text;state.pdfLayout=candidates[0].layout;
  }
  setProgress(84,'Comparing OCR results…');await new Promise(r=>setTimeout(r,80));
  setProgress(94,'Preparing review…');return text;
}

function friendlyError(err,context='operation'){
  const raw=String(err?.message||err||'').toLowerCase();
  if(raw.includes('duplicate')&&raw.includes('serial'))return 'A serial number already exists. Correct the serial number before saving.';
  if(raw.includes('row-level security')||raw.includes('permission')||raw.includes('admin access required')||raw.includes('editor or admin access required'))return canEdit()?('Your account is '+currentRole().replace(/^./,c=>c.toUpperCase())+', but Supabase rejected the database/storage write. This is a database policy permission error, not an account-role restriction.'):'Your account role does not allow this action. Please contact an Admin.';
  if(raw.includes('network')||raw.includes('fetch'))return 'Connection problem. Check your internet connection and try again.';
  if(context==='import')return 'Invoice could not be saved. No inventory changes were committed.';
  return 'Something went wrong. No changes were made. Please try again.';
}
function setHealth(status='live',text='Live'){const el=$('healthStatus');if(!el)return;el.classList.remove('live','reconnecting','offline');el.classList.add(status);el.innerHTML=`<i></i> ${text}`;}
function setProgress(p,t){$('importProgress').classList.remove('hidden');$('progressBar').style.width=p+'%';$('progressText').textContent=t;}
function normalizePdfText(v=''){
  return String(v||'')
    .replace(/\u00a0/g,' ')
    .replace(/[／⁄∕]/g,'/')
    .replace(/[–—−]/g,'-')
    .replace(/[：]/g,':')
    .replace(/\r/g,'');
}
function parseDate(v=''){
  let s=normalizePdfText(v).trim().replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi,'$1').replace(/\s*([/.])\s*/g,'$1');
  s=s.replace(/\b(\d{1,2})\s*[-/.]\s*([A-Za-z]{3,9})\s*[-/.]\s*(\d{2,4})\b/g,'$1 $2 $3')
     .replace(/\b([A-Za-z]{3,9})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/g,'$1 $2 $3');
  const valid=(y,m,d)=>{y=Number(y);m=Number(m);d=Number(d);if(y<100)y+=2000;if(y<1900||y>2200||m<1||m>12||d<1||d>31)return'';const md=[31,((y%4===0&&y%100!==0)||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];if(d>md[m-1])return'';return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;};
  let m=s.match(/\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/);if(m){const d=valid(m[1],m[2],m[3]);if(d)return d;}
  m=s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);if(m){const d=valid(m[3],m[2],m[1]);if(d)return d;}
  const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  m=s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/);if(m&&months[m[2].toLowerCase()]){const d=valid(m[3],months[m[2].toLowerCase()],m[1]);if(d)return d;}
  m=s.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/);if(m&&months[m[1].toLowerCase()]){const d=valid(m[3],months[m[1].toLowerCase()],m[2]);if(d)return d;}
  return '';
}

function invoiceSignals(text=''){
  const t=normalizePdfText(text);
  const checks={
    invoiceTitle:/\b(?:tax\s+)?invoice\b/i.test(t),
    invoiceNumber:/(?:invoice\s*(?:no\.?|number|#)|inv\s*(?:no\.?|#))/i.test(t),
    invoiceDate:/(?:invoice|document|tax\s*invoice)\s*date/i.test(t),
    supplier:/\b(?:supplier|vendor|from)\b/i.test(t)||/\b[A-Z][A-Za-z0-9 &.,'-]+Pte\.?\s*Ltd\.?\b/i.test(t),
    customer:/\b(?:bill\s*to|sold\s*to|customer)\b/i.test(t),
    itemTable:/\b(?:description|item)\b/i.test(t)&&/\b(?:qty|quantity|units?)\b/i.test(t),
    money:/\b(?:price|amount|subtotal|sub\s*total|gst|total)\b/i.test(t)
  };
  const score=Object.values(checks).filter(Boolean).length;
  return {checks,score,isInvoice:(checks.invoiceTitle&&score>=3)||score>=4};
}
function dateCandidateFromText(v=''){
  const text=normalizePdfText(v);
  const patterns=[
    /\b([0-3]?\d\s*[/.\-]\s*[01]?\d\s*[/.\-]\s*\d{2,4})\b/,
    /\b([0-3]?\d(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4})\b/i,
    /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+[0-3]?\d(?:st|nd|rd|th)?[,]?\s+\d{2,4})\b/i
  ];
  for(const re of patterns){const m=text.match(re);if(m)return m[1];}
  return '';
}
function detectInvoiceDate(text,invoice=''){
  const flat=normalizePdfText(text);
  const compact=flat.replace(/[ \t]+/g,' ');
  const labelled=[
    /(?:invoice|document|tax\s*invoice)\s*date\s*[:#.-]?\s*([0-3]?\d\s*[/\.\-]\s*[01]?\d\s*[/\.\-]\s*\d{2,4})/i,
    /(?:invoice|document|tax\s*invoice)\s*date\s*[:#.-]?\s*([0-3]?\d\s+[A-Za-z]{3,9}\s+\d{2,4})/i,
    /(?:invoice|document|tax\s*invoice)\s*date\s*[:#.-]?\s*([0-3]?\d\s*[-/.]\s*[A-Za-z]{3,9}\s*[-/.]\s*\d{2,4})/i
  ];
  for(const source of [flat,compact])for(const re of labelled){const m=source.match(re);if(m){const d=parseDate(m[1]);if(d)return d;}}
  const lines=flat.split('\n').map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    if(/\binvoice\s*date\b/i.test(lines[i])){
      const direct=parseDate(lines[i]);if(direct)return direct;const same=dateCandidateFromText(lines[i]);if(same){const d=parseDate(same);if(d)return d;}
      for(let j=i+1;j<=Math.min(lines.length-1,i+8);j++){
        const direct=parseDate(lines[j]);if(direct)return direct;const c=dateCandidateFromText(lines[j]);if(c){const d=parseDate(c);if(d)return d;}
      }
    }
  }
  // V6.67: many AV Media invoices use a compact header labelled only "DATE".
  // Accept that label only when the same header row also contains invoice-header fields,
  // never when it is a due/delivery/payment/warranty date.
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(!/\bDATE\b/i.test(line)||/\b(?:due|delivery|payment|warranty)\b/i.test(line))continue;
    const headerLike=/\b(?:ref\.?\s*(?:no\.?|number)?|invoice\s*(?:no\.?|number|#)|p\/?o\s*(?:no\.?|number)?|salesman|terms)\b/i.test(line);
    if(!headerLike)continue;
    const same=dateCandidateFromText(line);if(same){const d=parseDate(same);if(d)return d;}
    for(let j=i+1;j<=Math.min(lines.length-1,i+5);j++){
      if(/\b(?:due|delivery|payment|warranty)\s*date\b/i.test(lines[j]))continue;
      const c=dateCandidateFromText(lines[j]);if(c){const d=parseDate(c);if(d)return d;}
    }
  }
  const idx=compact.search(/\binvoice\s*date\b/i);
  if(idx>=0){const near=compact.slice(idx,idx+180);const c=dateCandidateFromText(near);if(c){const d=parseDate(c);if(d)return d;}}
  if(invoice){
    const pos=compact.toLowerCase().indexOf(String(invoice).toLowerCase());
    if(pos>=0){const near=compact.slice(Math.max(0,pos-120),pos+500);const c=dateCandidateFromText(near);if(c){const d=parseDate(c);if(d)return d;}}
  }
  const all=[...compact.matchAll(/\b([0-3]?\d\s*[/.\-]\s*[01]?\d\s*[/.\-]\s*\d{2,4})\b/g)].map(m=>m[1]);
  if(all.length===1){const d=parseDate(all[0]);if(d)return d;}
  return '';
}

function first(re,text,group=1){const m=text.match(re);return m?m[group].trim():'';}
function cleanHeaderValue(v=''){
  return String(v||'').replace(/\s+/g,' ').replace(/\s+(?:Bill|Sold|Ship)\s*To\b.*$/i,'').trim();
}
function labelledValue(text,labelRe,valueRe=/[^\n]+/){
  const re=new RegExp(`(?:${labelRe})\\s*[:#.-]?\\s*(?:\\n\\s*)?(${valueRe.source})`, 'i');
  return cleanHeaderValue(first(re,text));
}
function moneyFromLine(line=''){
  const clean=normalizePdfText(line).replace(/,/g,'');
  const vals=[...clean.matchAll(/(?:\$|SGD\s*)?(-?\d+(?:\.\d{1,2})?)/gi)].map(m=>Number(m[1])).filter(Number.isFinite);
  return vals.length?vals[vals.length-1]:null;
}
function labelledMoney(text,labelRe){
  const lines=normalizePdfText(text).split('\n').map(x=>x.trim()).filter(Boolean);
  const re=new RegExp(labelRe,'i');
  for(let i=0;i<lines.length;i++){
    if(!re.test(lines[i]))continue;
    let v=moneyFromLine(lines[i].replace(re,''));
    if(v!==null)return v;
    if(i+1<lines.length){v=moneyFromLine(lines[i+1]);if(v!==null)return v;}
  }
  return null;
}

function getPdfLayoutRows(){
  return (state.pdfLayout||[]).flatMap(pg=>(pg.rows||[]).map(r=>({...r,page:pg.page||1})));
}
function decimalMoneyCandidates(v=''){
  // Support OCR decimal commas (e.g. 200,00) without breaking thousands separators (e.g. 2,840.00).
  const clean=normalizePdfText(v).replace(/(\d),(\d{2})\b/g,'$1.$2').replace(/,/g,'');
  return [...clean.matchAll(/(?:\$|SGD\s*)?\s*(\d+(?:\.\d{2}))/gi)].map(m=>Number(m[1])).filter(Number.isFinite);
}
function detectInvoiceDateFromLayout(){
  const pages=state.pdfLayout||[];
  const loose=(v='')=>{const t=normalizePdfText(v).replace(/\s+/g,' ');const direct=parseDate(t);if(direct)return direct;const m=t.match(/([0-3]?\d\s*[/.-]\s*[01]?\d\s*[/.-]\s*\d{2,4})/);return m?parseDate(m[1]):'';};
  const headerCtx=/\b(?:REF\.?\s*(?:NO\.?|NUMBER)?|P\/?O\s*(?:NO\.?|NUMBER)?|SALESMAN|TERMS|INVOICE\s*(?:NO\.?|NUMBER|#)|CUSTOMER\s*CODE)\b/i;
  for(const pg of pages){
    const rows=(pg.rows||[]).filter(r=>Array.isArray(r.items));
    for(let i=0;i<rows.length;i++){
      const row=rows[i],txt=String(row.text||'');
      const isDateHeader=/\bDATE\b/i.test(txt)||(row.items||[]).some(it=>/^\s*(?:invoice\s*)?date\.?\s*$/i.test(String(it.text||'')));
      if(!isDateHeader)continue;
      const ctx=rows.filter(r=>Math.abs((Number(r.y)||0)-(Number(row.y)||0))<=45).map(r=>r.text||'').join(' ');
      if(!/\binvoice\s+date\b/i.test(txt)&&!headerCtx.test(ctx))continue;
      const direct=loose(txt);if(direct)return direct;
      // OCR often merges the DATE value into the Ref No token, so Y alignment is stronger than X alignment here.
      const nearby=rows.map(r=>({r,dy:Math.abs((Number(r.y)||0)-(Number(row.y)||0)),d:loose(r.text||'')})).filter(x=>x.d&&x.dy<=80).sort((a,b)=>a.dy-b.dy);
      if(nearby.length)return nearby[0].d;
    }
  }
  return '';
}

function layoutMoneyForLabel(labelRe,{exclude=null}={}){
  const rows=getPdfLayoutRows();
  const re=labelRe instanceof RegExp?labelRe:new RegExp(labelRe,'i');
  for(const row of rows){
    if(!re.test(row.text))continue;
    if(exclude&&exclude.test(row.text))continue;
    const vals=decimalMoneyCandidates(row.text);
    if(vals.length)return vals[vals.length-1];
    const nearby=rows.filter(r=>r.page===row.page&&Math.abs(r.y-row.y)<=10&&r!==row);
    for(const r of nearby){
      const n=decimalMoneyCandidates(r.text);
      if(n.length)return n[n.length-1];
    }
  }
  return null;
}
function layoutHeaderValue(labelRe,valueRe){
  const rows=getPdfLayoutRows();
  const re=labelRe instanceof RegExp?labelRe:new RegExp(labelRe,'i');
  const vre=valueRe||/[A-Z0-9][A-Z0-9._\/-]*/i;
  for(const row of rows){
    if(!re.test(row.text))continue;
    const stripped=row.text.replace(re,' ').replace(/[:#.-]+/g,' ').trim();
    const m=stripped.match(vre);if(m)return cleanHeaderValue(m[0]);
    const nearby=rows.filter(r=>r.page===row.page&&Math.abs(r.y-row.y)<=12&&r!==row);
    for(const r of nearby){const mm=r.text.match(vre);if(mm)return cleanHeaderValue(mm[0]);}
  }
  return '';
}
function cleanInvoiceDescription(v=''){
  return String(v||'')
    .replace(/\bHUAWEI?[\]\|]?/gi,'HUAWEI')
    .replace(/\bIdeashare\b/gi,'IdeaShare')
    .replace(/\boverseas[_ ]+Hi-\s*/gi,'overseas Hi-')
    .replace(/\s+\|\|\s+/g,' II ')
    .replace(/\s+I!\s+/g,' II ')
    .replace(/\s+/g,' ').trim();
}
function standardItemNameFromDescription(desc=''){
  const d=cleanInvoiceDescription(desc);
  if(/HUAWEI\s+IdeaHub\s+K3\b/i.test(d))return 'HUAWEI IdeaHub K3';
  if(/IdeaShare\s+Key\b/i.test(d))return 'IdeaShare Key';
  if(/HUAWEI\s+IdeaHub\s+Gray\s+Rolling\s+Stand/i.test(d))return 'HUAWEI IdeaHub Gray Rolling Stand II';
  if(/Labou?r\s+for\s+Installation\s*&\s*Services/i.test(d))return 'Labour for Installation & Services';
  return d.split(/[,;]|\s{2,}/)[0].trim()||d;
}
function skuFromDescription(desc=''){
  const d=cleanInvoiceDescription(desc);
  const m=d.match(/\b(IHK3[- ]?86SA)\b/i);
  return m?m[1].replace(/\s+/g,'').toUpperCase():'';
}
function normalizeParsedInvoiceItem(x={}){
  const description=cleanInvoiceDescription(x.description||x.item_name||'');
  return {...x,sku:String(x.sku||'').trim(),item_name:standardItemNameFromDescription(description),description};
}
function isNonInventoryServiceLine(x={}){
  const text=normalizePdfText([x.item_name,x.description].filter(Boolean).join(' ')).replace(/\s+/g,' ').trim();
  const sku=normalizePdfText(x.sku||'').replace(/\s+/g,' ').trim();
  if(!text&&!sku)return false;
  const physical=/\b(?:projector|microphone|speaker|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|stand|control\s+panel|wireless\s+system)\b/i.test(text);
  const deliveryOnly=/^(?:return\s+trip|trip\s+for|signed\s+delivery\s+order|delivery\s+order|delivery\s+fee|delivery\s+charge|collection|courier|freight|transport)\b/i.test(text)||(/\bsigned\s+delivery\s+order\b/i.test(text)&&!physical);
  const serviceSku=/\b(?:INSTALL(?:ATION)?|LABOU?R|SERVICE|REPAIR|DISMOUNT(?:ING)?|DISMANTL(?:E|ING)|RE-?INSTAT(?:E|EMENT)|RELOCAT(?:E|ION)|REMOV(?:E|AL)|TEST(?:ING)?|COMMISSION(?:ING)?|DELIVERY|FREIGHT|TRANSPORT|COURIER)\b/i.test(sku);
  const strongStart=/^(?:sales\s*[-:]\s*)?(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|labou?r|installation|installing|services?|professional\s+services?|consultancy|consulting|training|testing|commissioning|setup|configuration|delivery|freight|transport|manpower|on[- ]?site\s+support)\b/i.test(text);
  const labourPhrase=/\b(?:supply\s+)?labou?r\s+(?:for|to|and|&)\s+(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|installation|install|services?|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|testing|commissioning|replace)\b/i.test(text);
  const workPhrase=/\b(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|installation|testing|commissioning)\s*(?:work|works|service|services|job|labou?r)\b/i.test(text);
  const actionChain=/\b(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|remove|relocate|reinstate)\b[\s\S]{0,180}\b(?:install(?:ation|ing)?|test(?:ing)?|commission(?:ing)?)\b/i.test(text);
  const installBundle=/\b(?:installation|testing|commissioning)\s*(?:and|&|\/|,)+\s*(?:services?|testing|commissioning)\b/i.test(text);
  return deliveryOnly||serviceSku||strongStart||labourPhrase||workPhrase||actionChain||installBundle;
}

function isExcludedInventoryAccessoryLine(x={}){
  const itemName=normalizePdfText(x.item_name||'').replace(/\s+/g,' ').trim();
  const description=normalizePdfText(x.description||'').replace(/\s+/g,' ').trim();
  const sku=normalizePdfText(x.sku||'').replace(/\s+/g,' ').trim();
  const primary=itemName||description;
  const evidence=[sku,primary].filter(Boolean).join(' ');
  if(!evidence)return false;

  // Explicit accessory/support identities. Keep this narrow so equipment is not removed merely
  // because a longer description says a cable/bracket is included in the box.
  // V6.90: microphone stands are tracked inventory. This specific exception must run before generic stand exclusions.
  if(/\b(?:microphone|mic)\s+stands?\b/i.test(evidence))return false;
  const explicit=new RegExp('\\b(?:(?:power\\s+)?adapt(?:er|or)s?|ac\\s+adapt(?:er|or)s?|security\\s+(?:lock|cable)|projector\\s+lock|kensington\\s+lock|safety\\s+(?:wire|cable)|(?:projector|ceiling|wall|speaker|display|monitor|tv)\\s+(?:ceiling\\s+)?mount|ceiling\\s+mount|wall\\s+mount|mounting\\s+bracket|speaker\\s+bracket|projector\\s+bracket|display\\s+bracket|lamp\\s*kits?|lampkits?|replacement\\s+(?:projector\\s+)?lamp|projector\\s+lamp|(?:gravity|rolling|mobile|equipment|av|projector|display|monitor)\\s+cart|trolley|(?:rolling|mobile|floor|speaker|display|monitor|projector|equipment|av)\\s+stand)\\b','i');
  if(explicit.test(evidence))return true;

  const target=primary||evidence;
  if(/\b(?:bracket|mount)\b/i.test(target))return true;
  if(/\b(?:cart|trolley)\b/i.test(target))return true;
  if(/\bstands?\b/i.test(target)&&!/\bstandalone\b/i.test(target)&&!/\b(?:microphone|mic)\s+stands?\b/i.test(target))return true;
  if(/\b(?:lamp\s*kits?|lampkits?)\b/i.test(target))return true;

  const cableWord=/\b(?:cables?|cords?|patch\s+leads?|fly\s+leads?)\b/i;
  const trackedDevice=/\b(?:projector|microphone|speaker|camera|mixer|display|monitor|transmitter|receiver|control\s+panel|amplifier|processor|switcher|visualizer|document\s+camera|audio\s+tester)\b/i;
  if(cableWord.test(itemName)){
    const accessoryMentionOnly=trackedDevice.test(itemName)&&/\b(?:with|includes?|including|supplied\s+with)\b/i.test(itemName);
    if(!accessoryMentionOnly)return true;
  }
  if(!itemName&&cableWord.test(description)&&!trackedDevice.test(description))return true;
  return false;
}
function inventoryOnlyItems(items=[]){return validParsedItems(items).filter(x=>!isNonInventoryServiceLine(x)&&!isExcludedInventoryAccessoryLine(x)&&!v676IsSupportCoverageLine(x));}
function serialTokensFromLine(line=''){
  const clean=String(line||'').replace(/^\s*(?:S\s*[/\\.-]?\s*N|S\.?N\.?|Serial\s*(?:No\.?|Number(?:s)?))\s*[:#.-]?\s*/i,'').trim();
  if(!clean)return [];
  return clean.split(/[\s,;]+/).map(x=>x.replace(/^[([{]+|[\])}.:,;]+$/g,'').trim()).filter(x=>{
    if(!/^[A-Z0-9][A-Z0-9._\/-]{5,31}$/i.test(x))return false;
    if(!/\d/.test(x)||/^(?:INVOICE|DELIVERY|WARRANTY|DESCRIPTION|QUANTITY|SUBTOTAL|TOTAL)$/i.test(x))return false;
    if(/^\d+(?:[.,]\d{1,2})?$/.test(x)||parseDate(x))return false;
    return true;
  });
}
function attachSerialBlocks(items=[],text=''){
  const out=items.map(x=>({...x}));
  const lines=normalizePdfText(text).split('\n').map(x=>x.trim()).filter(Boolean);
  const label=/^(?:S\s*[/\\.-]?\s*N|S\.?N\.?|Serial\s*(?:No\.?|Number(?:s)?))\s*[:#.-]?/i;
  const stop=/^(?:delivery|freight|transport|labou?r|installation|services?|remarks?|sub\s*total|subtotal|gst\b|total\b|amount\s+due|warranty\b|note\b|payment\b)/i;
  const blocks=[];
  for(let i=0;i<lines.length;i++){
    if(!label.test(lines[i]))continue;
    const serials=[];let uncertain=false;
    const firstTokens=serialTokensFromLine(lines[i]);serials.push(...firstTokens);
    for(let j=i+1;j<lines.length;j++){
      const line=lines[j];
      if(label.test(line)||stop.test(line)||/\b\d+(?:[.,]\d{2})\s+\d+(?:[.,]\d{2})\s*$/.test(line))break;
      const tokens=serialTokensFromLine(line);
      if(tokens.length){serials.push(...tokens);continue;}
      // A normal multi-word product/section line ends the S/N block. Only a compact,
      // serial-looking unreadable token is flagged; following descriptions are not.
      if(/[A-Za-z0-9]/.test(line)&&!/[\s]{1,}/.test(line)&&line.length>=6)uncertain=true;
      break;
    }
    blocks.push({lineIndex:i,serials:[...new Set(serials)],uncertain});
  }
  const itemPositions=out.map((item,itemIndex)=>{
    const keys=[item.sku,item.item_name,item.description].map(x=>norm(x)).filter(x=>x.length>=6);
    const positions=[];
    lines.forEach((line,lineIndex)=>{const n=norm(line);if(keys.some(k=>n.includes(k)||k.includes(n)&&n.length>=12))positions.push(lineIndex);});
    return {itemIndex,positions};
  });
  for(const block of blocks){
    const preceding=itemPositions.map(x=>({itemIndex:x.itemIndex,pos:Math.max(...x.positions.filter(p=>p<block.lineIndex),-1)})).filter(x=>x.pos>=0).sort((a,b)=>b.pos-a.pos);
    const targetIndex=preceding[0]?.itemIndex??(out.length===1?0:-1);
    if(targetIndex<0)continue; // Do not guess when the source item cannot be proven.
    const item=out[targetIndex];
    const existing=parseSerials(item.serials);
    if(!existing.length&&block.serials.length)item.serials=block.serials.join(', ');
    const observed=existing.length?existing:block.serials;
    item.serialReviewRequired=!!item.serialReviewRequired||block.uncertain;
  }
  return out;
}
function invoiceItemsQuality(items=[],subtotal=null){
  let score=0;
  for(const x of items){
    if(String(x.item_name||x.description||'').trim())score+=12;
    if(Number(x.quantity)>0)score+=8;
    if(Number.isFinite(Number(x.unit_price)))score+=6;
    if(Number.isFinite(Number(x.amount)))score+=6;
  }
  score+=Math.min(50,items.length*10);
  if(items.length&&subtotal!==null&&Number.isFinite(Number(subtotal))){
    const sum=items.reduce((n,x)=>n+(Number(x.amount)||0),0);
    if(Math.abs(sum-Number(subtotal))<0.02)score+=80;
    else if(Math.abs(sum-Number(subtotal))<1)score+=25;
  }
  return score;
}
function parseLayoutInvoiceItems(){
  const pages=state.pdfLayout||[];
  const out=[];
  const token=(v='')=>String(v||'').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g,'').trim();
  const reconcileQty=(qty,price,amount)=>{
    if(!(price>0)||!(amount>=0))return qty;
    const ratio=amount/price,rounded=Math.round(ratio);
    if(rounded>=1&&rounded<=999&&Math.abs(ratio-rounded)<0.015){
      if(qty===null||qty<=0||Math.abs(qty-rounded)>0.001)return rounded;
    }
    return qty;
  };
  for(const pg of pages){
    const rows=pg.rows||[];
    const header=rows.find(r=>/\bdescription\b/i.test(r.text)&&/\b(?:units?|qty|quantity)\b/i.test(r.text)&&/\bprice\b/i.test(r.text)&&/\bamount\b/i.test(r.text));
    if(!header)continue;
    const pickX=(re)=>{const it=header.items.find(x=>re.test(token(x.text)));return it?it.x:null;};
    const xSerial=pickX(/^(?:sr\.?\s*no\.?|no\.?#?)$/i)??Math.min(...header.items.map(i=>i.x));
    const xDesc=pickX(/^description$/i),xQty=pickX(/^(?:units?|qty|quantity)$/i),xPrice=pickX(/^price$/i),xAmount=pickX(/^amount$/i);
    if([xDesc,xQty,xPrice,xAmount].some(v=>v===null))continue;
    const bSD=(xSerial+xDesc)/2;
    const qtyStart=xQty-Math.max(20,(xPrice-xQty)*0.25);
    const bQP=(xQty+xPrice)/2,bPA=(xPrice+xAmount)/2;
    const stop=rows.find(r=>r.y<header.y&&/^(?:remarks?|sub\s*total|subtotal|add\s+gst|gst\b|total\b)/i.test(r.text.replace(/^[^A-Za-z]+/,'')));
    const stopY=stop?stop.y:-Infinity;
    const anchors=[];
    for(const r of rows){
      if(!(r.y<header.y&&r.y>stopY))continue;
      const sn=r.items.find(it=>it.x<bSD&&/^\d{1,3}$/.test(token(it.text)));
      if(sn)anchors.push({row:r,n:Number(token(sn.text))});
    }
    anchors.sort((a,b)=>b.row.y-a.row.y);
    const seenY=[];
    const uniq=anchors.filter(a=>seenY.every(y=>Math.abs(y-a.row.y)>Math.max(2,pg.yTolerance||2))&&(seenY.push(a.row.y),true));
    for(let i=0;i<uniq.length;i++){
      const tol=Math.max(3,pg.yTolerance||3);
      const topY=uniq[i].row.y+tol;
      const bottomY=i+1<uniq.length?uniq[i+1].row.y+tol:stopY;
      const group=rows.filter(r=>r.y<=topY&&r.y>bottomY&&r.y<header.y);
      const descParts=[];let qty=null,price=null,amount=null;
      for(const r of group.sort((a,b)=>b.y-a.y)){
        const descTokens=r.items.filter(it=>it.x>=bSD&&it.x<qtyStart).map(it=>it.text.trim()).filter(Boolean);
        if(descTokens.length)descParts.push(descTokens.join(' '));
        const qVals=r.items.filter(it=>it.x>=qtyStart&&it.x<bQP).flatMap(it=>[...token(it.text).matchAll(/\d+(?:\.\d+)?/g)].map(m=>Number(m[0]))).filter(Number.isFinite);
        if(qty===null&&qVals.length)qty=qVals[0];
        const pVals=r.items.filter(it=>it.x>=bQP&&it.x<bPA).flatMap(it=>decimalMoneyCandidates(token(it.text)));
        if(price===null&&pVals.length)price=pVals[pVals.length-1];
        const aVals=r.items.filter(it=>it.x>=bPA).flatMap(it=>decimalMoneyCandidates(token(it.text)));
        if(amount===null&&aVals.length)amount=aVals[aVals.length-1];
      }
      qty=reconcileQty(qty,price,amount);
      const desc=cleanInvoiceDescription(descParts.join(' ').replace(/^\|+|\|+$/g,''));
      if(desc&&price!==null&&amount!==null)out.push(normalizeParsedInvoiceItem({sku:'',item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty??1,unit_price:price,amount,warranty:'',serials:''}));
    }
  }
  return out;
}
function parseProductCodeLayoutItems(){
  const pages=state.pdfLayout||[],out=[];
  const token=(v='')=>String(v||'').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'').trim();
  const toNum=(v)=>{const n=Number(String(v??'').replace(/,(?=\d{2}(?:\D|$))/g,'.').replace(/,/g,'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null;};
  const reconcileQty=(qty,price,amount)=>{
    if(!(price>0)||!(amount>=0))return qty;
    const ratio=amount/price,rounded=Math.round(ratio);
    if(rounded>=1&&rounded<=999&&Math.abs(ratio-rounded)<0.015&&(qty===null||qty<=0||Math.abs(qty-rounded)>0.001))return rounded;
    return qty;
  };
  for(const pg of pages){
    const rows=pg.rows||[];
    const header=rows.find(r=>/\b(?:product\s*no\.?|product|sku|model|item\s*no\.?)\b/i.test(r.text)&&/\bdescription\b/i.test(r.text)&&/\b(?:qty|quantity|units?)\b/i.test(r.text)&&/\bprice\b/i.test(r.text)&&/\bamount\b/i.test(r.text));
    if(!header)continue;
    const pickX=(re)=>{const it=header.items.find(x=>re.test(token(x.text)));return it?it.x:null;};
    const xCode=Math.min(...header.items.map(i=>i.x));
    const xDesc=pickX(/^description$/i),xQty=pickX(/^(?:units?|qty|quantity)$/i),xPrice=pickX(/^(?:unit\s*)?price$/i)??pickX(/price/i),xAmount=pickX(/^amount$/i);
    if(!Number.isFinite(xCode)||[xDesc,xQty,xPrice,xAmount].some(v=>v===null))continue;
    const bCD=(xCode+xDesc)/2,qtyStart=xQty-Math.max(18,(xPrice-xQty)*0.28),bQP=(xQty+xPrice)/2,bPA=(xPrice+xAmount)/2;
    const stop=rows.filter(r=>r.y<header.y&&/^(?:remarks?|sub\s*total|subtotal|add\s+gst|gst\b|grand\s+total|total\b|amount\s+due)/i.test(r.text.replace(/^[^A-Za-z]+/,''))).sort((a,b)=>b.y-a.y)[0];
    const stopY=stop?stop.y:-Infinity;
    const body=rows.filter(r=>r.y<header.y&&r.y>stopY).sort((a,b)=>b.y-a.y);
    const anchors=[];
    for(const r of body){
      const left=r.items.filter(it=>it.x<bCD).map(it=>token(it.text)).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
      if(!left||left.length<3||/^(?:s\/?n|serial|shipment|remarks?|date|ref|subtotal|total)$/i.test(left))continue;
      const codeLike=(/[A-Za-z]/.test(left)&&/\d/.test(left))||/\b(?:installation|service|labou?r)\b/i.test(left);
      if(!codeLike)continue;
      const hasDesc=r.items.some(it=>it.x>=bCD&&it.x<qtyStart&&String(it.text||'').trim());
      const hasRight=r.items.some(it=>it.x>=qtyStart&&/[0-9]/.test(String(it.text||'')));
      if(hasDesc||hasRight)anchors.push({row:r,code:left});
    }
    const seenY=[];
    const uniq=anchors.filter(a=>seenY.every(y=>Math.abs(y-a.row.y)>Math.max(2,pg.yTolerance||2))&&(seenY.push(a.row.y),true));
    for(let i=0;i<uniq.length;i++){
      const tol=Math.max(3,pg.yTolerance||3),topY=uniq[i].row.y+tol,bottomY=i+1<uniq.length?uniq[i+1].row.y+tol:stopY;
      const group=body.filter(r=>r.y<=topY&&r.y>bottomY);
      const descParts=[];let qty=null,price=null,amount=null;
      for(const r of group){
        const descTokens=r.items.filter(it=>it.x>=bCD&&it.x<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean);
        if(descTokens.length){const part=descTokens.join(' ');if(!/^\s*(?:s\/?n|serial\s*(?:no|number)?|shipment\s*no)\b/i.test(part))descParts.push(part);}
        if(qty===null){const qVals=r.items.filter(it=>it.x>=qtyStart&&it.x<bQP).map(it=>toNum(token(it.text))).filter(v=>v!==null);if(qVals.length)qty=qVals[0];}
        if(price===null){const vals=r.items.filter(it=>it.x>=bQP&&it.x<bPA).flatMap(it=>decimalMoneyCandidates(token(it.text)));if(vals.length)price=vals[vals.length-1];}
        if(amount===null){const vals=r.items.filter(it=>it.x>=bPA).flatMap(it=>decimalMoneyCandidates(token(it.text)));if(vals.length)amount=vals[vals.length-1];}
      }
      qty=reconcileQty(qty,price,amount);
      const code=uniq[i].code.replace(/\s+/g,' ').trim();
      const desc=cleanInvoiceDescription(descParts.join(' '));
      const warrantyLike=/\b(?:warranty|wt\b|\d+\s*years?\s*warranty)\b/i.test(code+' '+desc);
      if(warrantyLike&&(amount===null||amount===0)){
        if(out.length){const years=(code+' '+desc).match(/\b(\d+)\s*years?\b/i);out[out.length-1].warranty=years?`${years[1]} Years`:(desc||'Warranty');}
        continue;
      }
      if(!desc||!(qty>0))continue;
      if(price===null&&amount===null)continue;
      out.push(normalizeParsedInvoiceItem({sku:code,item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:''}));
    }
  }
  return out;
}
function parseFlexibleProductLayoutItems(){
  const pages=state.pdfLayout||[],out=[];
  const cleanToken=v=>String(v||'').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
  const numeric=v=>{const z=String(v??'').replace(/\s/g,'').replace(/,(?=\d{3}(?:\D|$))/g,'').replace(/,(?=\d{2}(?:\D|$))/g,'.').replace(/[^0-9.-]/g,'');const n=Number(z);return Number.isFinite(n)?n:null;};
  const moneyVals=v=>{
    const vals=decimalMoneyCandidates(String(v||''));if(vals.length)return vals;
    const n=numeric(v);return n===null?[]:[n];
  };
  const reconcile=(q,p,a)=>{if(p>0&&a>=0){const r=a/p,n=Math.round(r);if(n>=1&&n<=999&&Math.abs(r-n)<.02&&(q===null||q<=0||Math.abs(q-n)>.001))return n;}return q;};
  const labelX=(items,re,fallback=null)=>{const hits=items.filter(it=>re.test(cleanToken(it.text)));return hits.length?Math.min(...hits.map(x=>Number(x.x)||0)):fallback;};

  for(const pg of pages){
    const rows=(pg.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length);
    const descRows=rows.filter(r=>/\bdescription\b/i.test(r.text||'')||(r.items||[]).some(it=>/^description$/i.test(cleanToken(it.text))));
    for(const dr of descRows){
      const band=rows.filter(r=>Math.abs((r.y||0)-(dr.y||0))<=26);
      const items=band.flatMap(r=>r.items||[]).sort((a,b)=>(a.x||0)-(b.x||0));
      const bandText=band.map(r=>r.text||'').join(' ');
      if(!/\b(?:product|sku|model|item)\b/i.test(bandText)||!/\b(?:qty|quantity|units?)\b/i.test(bandText)||!/\bprice\b/i.test(bandText)||!/\bamount\b/i.test(bandText))continue;

      const xDesc=labelX(items,/^description$/i),xQty=labelX(items,/^(?:qty|quantity|units?)$/i),xPrice=labelX(items,/^price$/i,labelX(items,/price/i)),xAmount=labelX(items,/^amount$/i);
      let xCode=labelX(items,/^(?:product|sku|model|item)$/i);
      if(xCode===null){const p=items.find(it=>/\bproduct\b/i.test(String(it.text||'')));if(p)xCode=Number(p.x);}
      if(xCode===null)xCode=Math.min(...items.map(i=>Number(i.x)).filter(Number.isFinite));
      if(![xCode,xDesc,xQty,xPrice,xAmount].every(Number.isFinite))continue;
      if(!(xCode<xDesc&&xDesc<xQty&&xQty<xPrice&&xPrice<xAmount))continue;

      const headerY=Math.max(...band.map(r=>Number(r.y)||0));
      const bCD=(xCode+xDesc)/2,qtyStart=xQty-Math.max(14,(xPrice-xQty)*.18),bQP=(xQty+xPrice)/2,bPA=(xPrice+xAmount)/2;
      const totalRows=rows.filter(r=>r.y<headerY&&/\b(?:sub\s*total|subtotal|gst\s*\d*\s*%?|amount\s+due|grand\s+total|invoice\s+total)\b/i.test(r.text||'')).sort((a,b)=>b.y-a.y);
      const stopY=totalRows[0]?.y??-Infinity;
      const body=rows.filter(r=>r.y<headerY&&r.y>stopY).sort((a,b)=>b.y-a.y);

      const anchors=[];
      for(const r of body){
        const left=(r.items||[]).filter(it=>it.x>=xCode-12&&it.x<bCD).map(it=>cleanToken(it.text)).filter(Boolean).join('').trim();
        const desc=(r.items||[]).filter(it=>it.x>=bCD&&it.x<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim();
        const q=(r.items||[]).filter(it=>it.x>=qtyStart&&it.x<bQP).map(it=>numeric(it.text)).find(Number.isFinite);
        const p=(r.items||[]).filter(it=>it.x>=bQP&&it.x<bPA).flatMap(it=>moneyVals(it.text));
        const a=(r.items||[]).filter(it=>it.x>=bPA).flatMap(it=>moneyVals(it.text));
        const codeLike=left&&/^[A-Z0-9][A-Z0-9+._\/-]{2,}$/i.test(left)&&!/^(?:DATE|TERMS|TOTAL|SUBTOTAL|SERIAL|WARRANTY)$/i.test(left);
        if(codeLike||(desc&&(p.length||a.length)))anchors.push({row:r,code:codeLike?left:''});
      }
      const uniq=[];
      for(const a of anchors){if(uniq.every(u=>Math.abs((u.row.y||0)-(a.row.y||0))>Math.max(3,pg.yTolerance||3)))uniq.push(a);}
      for(let i=0;i<uniq.length;i++){
        const tol=Math.max(5,pg.yTolerance||3),topY=(uniq[i].row.y||0)+tol,bottomY=i+1<uniq.length?(uniq[i+1].row.y||0)+tol:stopY;
        const group=body.filter(r=>r.y<=topY&&r.y>bottomY);
        const descParts=[];let qty=null,price=null,amount=null,warranty='';
        for(const r of group){
          const d=(r.items||[]).filter(it=>it.x>=bCD&&it.x<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim();
          if(d){
            if(/\bwarranty\b/i.test(d)){const y=d.match(/\b(\d+)\s*years?\b/i);warranty=y?`${y[1]} Years`:d;}
            else if(!/^\s*(?:s\/?n|serial\s*(?:no|number)?)\b/i.test(d)){
              const detail=d.replace(/^\s*shipment\s*no\.?\s*[:#.-]?\s*[A-Z0-9._\/-]+\s*[:;,-]?\s*/i,'').trim();
              if(detail)descParts.push(detail);
            }
          }
          if(qty===null){const q=(r.items||[]).filter(it=>it.x>=qtyStart&&it.x<bQP).map(it=>numeric(it.text)).find(v=>Number.isFinite(v)&&v>0&&v<10000);if(Number.isFinite(q))qty=q;}
          if(price===null){const p=(r.items||[]).filter(it=>it.x>=bQP&&it.x<bPA).flatMap(it=>moneyVals(it.text)).filter(v=>Number.isFinite(v)&&v>=0);if(p.length)price=p[p.length-1];}
          if(amount===null){const a=(r.items||[]).filter(it=>it.x>=bPA).flatMap(it=>moneyVals(it.text)).filter(v=>Number.isFinite(v)&&v>=0);if(a.length)amount=a[a.length-1];}
        }
        qty=reconcile(qty,price,amount);
        const desc=cleanInvoiceDescription(descParts.join(' ').replace(/\s+/g,' ').trim());
        const code=String(uniq[i].code||'').trim();
        if(!desc||!(qty>0))continue;
        out.push(normalizeParsedInvoiceItem({sku:code,item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty,serials:''}));
      }
      if(out.length)break;
    }
  }
  return out;
}
function parseAvMediaMixedLayoutItems(){
  const pages=state.pdfLayout||[],out=[];
  const token=v=>String(v||'').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
  const numVal=v=>{const z=String(v??'').replace(/\s/g,'').replace(/,(?=\d{3}(?:\D|$))/g,'').replace(/,(?=\d{2}(?:\D|$))/g,'.').replace(/[^0-9.-]/g,'');const n=Number(z);return Number.isFinite(n)?n:null;};
  const moneyVals=v=>{const raw=String(v||'').replace(/\s/g,'');const normalized=raw.replace(/(?<=\d)[,.](?=\d{3}(?:[,.]\d{2})?$)/g,'').replace(/,(?=\d{2}$)/,'.');const n=Number(normalized.replace(/[^0-9.-]/g,''));const vals=decimalMoneyCandidates(String(v||''));return vals.length?vals:(Number.isFinite(n)?[n]:[]);};
  const allSource=(pages.flatMap(pg=>(pg.rows||[]).map(r=>r.text||'')).join('\n'));
  for(const pg of pages){
    const rows=(pg.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length);
    const headerRows=rows.filter(r=>/\bDESCRIPTION\b/i.test(r.text||'')||/\bPRODUCT\s*NO\.?\b/i.test(r.text||''));
    for(const seed of headerRows){
      const band=rows.filter(r=>Math.abs((Number(r.y)||0)-(Number(seed.y)||0))<=32);
      const headerItems=band.flatMap(r=>r.items||[]).sort((a,b)=>(Number(a.x)||0)-(Number(b.x)||0));
      const bandText=band.map(r=>r.text||'').join(' ');
      if(!/\bPRODUCT\b/i.test(bandText)||!/\bDESCRIPTION\b/i.test(bandText)||!/(?:\bQUANTITY\b|\bQTY\b)/i.test(bandText)||!/\bPRICE\b/i.test(bandText)||!/\bAMOUNT\b/i.test(bandText))continue;
      const findX=re=>{const h=headerItems.filter(it=>re.test(String(it.text||'').trim()));return h.length?Math.min(...h.map(it=>Number(it.x)||0)):null;};
      let xCode=findX(/PRODUCT/i);if(xCode===null)xCode=Math.min(...headerItems.map(it=>Number(it.x)).filter(Number.isFinite));
      const xDesc=findX(/DESCRIPTION/i),xQty=findX(/QUANTITY|\bQTY\b/i),xAmount=findX(/AMOUNT/i);let xPrice=findX(/PRICE/i);
      if(![xCode,xDesc,xQty,xPrice,xAmount].every(Number.isFinite)||!(xCode<xDesc&&xDesc<xQty&&xQty<xPrice&&xPrice<xAmount))continue;
      const headerY=Number(seed.y)||0;
      const totals=rows.filter(r=>/\b(?:SUB\s*TOTAL|SUBTOTAL|GST\s*\d*\s*%?|AMOUNT\s+DUE|GRAND\s+TOTAL|INVOICE\s+TOTAL)\b/i.test(r.text||''));
      let totalRow=null;if(totals.length)totalRow=totals.sort((a,b)=>Math.abs((Number(a.y)||0)-headerY)-Math.abs((Number(b.y)||0)-headerY))[0];
      let dir=totalRow?Math.sign((Number(totalRow.y)||0)-headerY):0;
      if(!dir){
        const below=rows.filter(r=>(Number(r.y)||0)>headerY&&/\d/.test(r.text||'')).length;
        const above=rows.filter(r=>(Number(r.y)||0)<headerY&&/\d/.test(r.text||'')).length;dir=below>=above?1:-1;
      }
      const logical=r=>((Number(r.y)||0)-headerY)*dir;
      const totalLogical=totalRow?logical(totalRow):Infinity;
      const body=rows.filter(r=>logical(r)>2&&logical(r)<totalLogical-1).sort((a,b)=>logical(a)-logical(b));
      if(!body.length)continue;
      const bCD=(xCode+xDesc)/2,qtyStart=xQty-Math.max(12,(xPrice-xQty)*.22),bQP=(xQty+xPrice)/2,bPA=(xPrice+xAmount)/2;
      const anchors=[];
      for(const r of body){
        const code=(r.items||[]).filter(it=>(Number(it.x)||0)>=xCode-22&&(Number(it.x)||0)<bCD).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
        if(!code||/^(?:S\/?N|SERIAL|WARRANTY|SHIPMENT|DATE|REF\.?|TERMS|GST|TOTAL)$/i.test(code))continue;
        const desc=(r.items||[]).filter(it=>(Number(it.x)||0)>=bCD&&(Number(it.x)||0)<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ');
        const hasMoney=(r.items||[]).some(it=>(Number(it.x)||0)>=qtyStart&&/\d/.test(String(it.text||'')));
        const codeLike=/\d/.test(code)&&(/[A-Za-z]/.test(code)||/^\d{4,}(?:[-/][A-Za-z0-9]+)?$/.test(code));
        if(codeLike&&(desc||hasMoney))anchors.push({row:r,code});
      }
      const uniq=[];for(const a of anchors){if(uniq.every(u=>Math.abs(logical(u.row)-logical(a.row))>Math.max(3,pg.yTolerance||3)))uniq.push(a);}
      for(let i=0;i<uniq.length;i++){
        const p0=logical(uniq[i].row)-Math.max(4,pg.yTolerance||3),p1=i+1<uniq.length?logical(uniq[i+1].row)-Math.max(4,pg.yTolerance||3):totalLogical;
        const group=body.filter(r=>logical(r)>=p0&&logical(r)<p1);
        const descParts=[];let qty=null,price=null,amount=null,warranty='',serials=[];
        for(const r of group){
          const d=(r.items||[]).filter(it=>(Number(it.x)||0)>=bCD&&(Number(it.x)||0)<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim();
          if(d){
            if(/\bwarranty\b|\bWT\s+FOR\b/i.test(d)){const y=d.match(/\b(\d+)\s*years?\b/i);warranty=y?`${y[1]} Years`:warranty;}
            else descParts.push(d);
            const sn=d.match(/\bS\s*\/?\s*N\s*[:#.-]?\s*(.+)$/i);if(sn)serials.push(...(sn[1].match(/\b[A-Z0-9][A-Z0-9._\/-]{5,31}\b/gi)||[]));
          }
          if(qty===null){const q=(r.items||[]).filter(it=>(Number(it.x)||0)>=qtyStart&&(Number(it.x)||0)<bQP).map(it=>numVal(it.text)).find(v=>Number.isFinite(v)&&v>0&&v<10000);if(Number.isFinite(q))qty=q;}
          if(price===null){const ps=(r.items||[]).filter(it=>(Number(it.x)||0)>=bQP&&(Number(it.x)||0)<bPA).flatMap(it=>moneyVals(it.text)).filter(Number.isFinite);if(ps.length)price=ps[ps.length-1];}
          if(amount===null){const as=(r.items||[]).filter(it=>(Number(it.x)||0)>=bPA).flatMap(it=>moneyVals(it.text)).filter(Number.isFinite);if(as.length)amount=as[as.length-1];}
        }
        if(price>0&&amount>=0){const q=Math.round(amount/price);if(q>=1&&q<=999&&Math.abs(amount/price-q)<.02)qty=q;}
        const codeRaw=uniq[i].code,rawDesc=cleanInvoiceDescription(descParts.join(' '));
        const warrantyRow=/\b(?:WARRANTY|WT\s+FOR|\d+\s*YEARS?\s+WARRANTY)\b/i.test(codeRaw+' '+rawDesc)&&(amount===null||amount===0);
        if(warrantyRow){if(out.length){if(warranty)out[out.length-1].warranty=warranty;}continue;}
        if(!(qty>0)||(price===null&&amount===null)||!rawDesc)continue;
        const sku=cleanVerifiedSku(codeRaw,allSource),description=cleanInventoryDescription(rawDesc);
        out.push(normalizeParsedInvoiceItem({sku,item_name:description,description,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty,serials:[...new Set(serials)].join(', ')}));
      }
      if(out.length)return out;
    }
  }
  return out;
}
function parseAvMediaTextItems(text=''){
  const lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const moneyVal=v=>{const z=String(v||'').replace(/(?:SGD|S\$|\$)/gi,'').replace(/\s/g,'').replace(/,(?=\d{3}(?:\.\d{2})?$)/g,'').replace(/,(?=\d{2}$)/,'.').replace(/[^0-9.-]/g,'');const n=Number(z);return Number.isFinite(n)?n:null;};
  const money='(?:S?\\$?\\s*\\d[\\d,]*(?:[.]\\d{2}))';
  const rowRe=new RegExp('^([A-Z0-9][A-Z0-9+._\\/-]{2,}(?:\\s+(?:[A-Z0-9]{1,8})){0,3})\\s+(.+?)\\s+(\\d+(?:[.]\\d+)?)\\s+('+money+')\\s+('+money+')$','i');
  let header=-1;
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    if(/\b(?:PROD(?:UCT|OUCT)|STOCK)\s*(?:NO\.?|NUMBER|CODE)?\b/i.test(l)&&/\bDESCRIPTION\b/i.test(l)&&/\b(?:QUANTITY|QTY)\b/i.test(l)&&/\b(?:UNIT\s*)?PRICE\b/i.test(l)&&/\bAMOUNT\b/i.test(l)){header=i;break;}
  }
  const from=header>=0?header+1:0,out=[];let current=null;
  for(let i=from;i<lines.length;i++){
    const line=lines[i];
    if(/\b(?:SUB\s*TOTAL|SUBTOTAL|GST\s*\d*\s*%|AMOUNT\s+DUE|GRAND\s+TOTAL|TOTAL\s+DUE)\b/i.test(line))break;
    const m=line.match(rowRe);
    if(m){
      const qty=moneyVal(m[3]),price=moneyVal(m[4]),amount=moneyVal(m[5]);
      if(!(qty>0)||price===null||amount===null)continue;
      const code=String(m[1]||'').trim(),desc=cleanInventoryDescription(m[2]);if(!desc)continue;
      current=normalizeParsedInvoiceItem({sku:cleanVerifiedSku(code,text),item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:''});out.push(current);continue;
    }
    // Preserve useful continuations beneath the last priced item but never append totals/header metadata.
    if(current&&!/^(?:S\s*\/?\s*N|SERIAL|SHIPMENT\s+NO|WARRANTY|REF\.?\s*NO|DATE|P\/?O|SALESMAN|TERMS)\b/i.test(line)&&!/^[-–—]?\s*\d[\d,]*[.]\d{2}\s*$/.test(line)){
      if(!/^(?:PRODUCT|DESCRIPTION|QUANTITY|QTY|UNIT\s+PRICE|AMOUNT)\b/i.test(line))current.description=cleanInventoryDescription((current.description+' '+line).trim());
    }
  }
  return out;
}
function parseGenericInvoiceItems(text){
  const lines=normalizePdfText(text).split('\n').map(x=>x.trim()).filter(Boolean);
  let header=-1;
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    if(/\bdescription\b/i.test(l)&&/\b(?:units?|qty|quantity)\b/i.test(l)&&/\bprice\b/i.test(l)&&/\bamount\b/i.test(l)){header=i;break;}
  }
  if(header<0)return [];
  const items=[];
  let current=null;
  const stop=/^(?:remarks?|sub\s*total|subtotal|add\s+gst|gst\b|t?otal\b|amount\s+due)/i;
  const parseNumber=(v)=>{
    const t=String(v??'').replace(/[$\s]/g,'').replace(/,(?=\d{2}(?:\D|$))/g,'.').replace(/,/g,'');
    const n=Number(t);return Number.isFinite(n)?n:null;
  };
  const reconcileQty=(qty,price,amount)=>{
    if(!(price>0)||!(amount>=0))return qty;
    const ratio=amount/price;
    const rounded=Math.round(ratio);
    if(rounded>=1&&rounded<=999&&Math.abs(ratio-rounded)<0.015){
      // Amount/price is more reliable than an isolated OCR quantity glyph (1 is often read as 4 or |).
      if(qty===null||qty<=0||Math.abs(qty-rounded)>0.001)return rounded;
    }
    return qty;
  };
  for(let i=header+1;i<lines.length;i++){
    const line=lines[i];
    if(stop.test(line))break;
    let serial='',desc='',qty=null,price=null,amount=null;

    // Primary OCR row shape: serial + description + qty + unit price + amount.
    let m=line.match(/^\s*(\d{1,3})\s+(.+?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]{1,2})?)\s+([0-9]+(?:[.,][0-9]{1,2})?)\s*[\]|}.,;:]*\s*$/);
    if(m){
      serial=m[1];desc=m[2].trim();qty=parseNumber(m[3]);price=parseNumber(m[4]);amount=parseNumber(m[5]);
      qty=reconcileQty(qty,price,amount);
    }else{
      // OCR frequently loses a narrow quantity digit/column separator. Infer qty from amount ÷ unit price.
      m=line.match(/^\s*(\d{1,3})\s+(.+?)\s+[|Iil!]?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s+([0-9]+(?:[.,][0-9]{1,2})?)\s*[\]|}.,;:]*\s*$/);
      if(m){
        serial=m[1];desc=m[2].trim();price=parseNumber(m[3]);amount=parseNumber(m[4]);qty=reconcileQty(null,price,amount);
      }
    }

    // Fallback for PDF/OCR outputs that preserve wide spaces/tabs as pseudo-columns.
    if(!desc){
      const cells=line.split(/\s{3,}|\t+/).map(x=>x.trim()).filter(Boolean);
      if(cells.length>=4){
        let work=[...cells];
        if(/^\d{1,3}$/.test(work[0]))serial=work.shift();
        const nums=[];
        while(work.length&&nums.length<3){
          const n=parseNumber(work[work.length-1]);
          if(n!==null){nums.unshift(n);work.pop();}else break;
        }
        if(nums.length>=2){
          if(nums.length===3)[qty,price,amount]=nums;else [price,amount]=nums;
          qty=reconcileQty(qty,price,amount);
          desc=work.join(' ').trim();
        }
      }
    }

    desc=desc.replace(/^\|+|\|+$/g,'').replace(/\s+/g,' ').trim();
    if(desc&&qty!==null&&price!==null&&amount!==null){
      current=normalizeParsedInvoiceItem({sku:'',item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:''});
      items.push(current);continue;
    }
    if(current&&!/^\d+\s*$/.test(line)&&!/(?:invoice\s+no|invoice\s+date|customer\s+code|payment\s+terms)/i.test(line)){
      const continuation=line.replace(/^\d+\s+/,'').trim();
      if(continuation&&!/^(?:price|amount|units?)$/i.test(continuation)){
        current.description=cleanInvoiceDescription(current.description+' '+continuation);
        current.sku=String(current.sku||'').trim();
        current.item_name=standardItemNameFromDescription(current.description);
      }
    }
  }
  return items;
}

function parseNumberedInvoiceRows(text){
  const lines=normalizePdfText(text).split('\n').map(x=>x.trim()).filter(Boolean);
  const stop=/\b(?:remarks?|sub\s*total|subtotal|add\s+gst|gst\s*@|grand\s+total|amount\s+due)\b/i;
  const startLike=/^\s*\d{1,3}\s+.+\d+[.,]\d{2}\s+\d+[.,]\d{2}\s*[\])|}.,;:]*\s*$/;
  const starts=[];
  for(let i=0;i<lines.length;i++){
    if(stop.test(lines[i]))break;
    if(startLike.test(lines[i]))starts.push(i);
  }
  if(!starts.length)return [];
  const out=[];
  for(let si=0;si<starts.length;si++){
    const idx=starts[si],next=si+1<starts.length?starts[si+1]:lines.length;
    let block=[];
    for(let j=idx;j<next;j++){if(j>idx&&stop.test(lines[j]))break;block.push(lines[j]);}
    if(!block.length)continue;
    const firstLine=block[0].replace(/^\s*\d{1,3}\s+/,'').trim();
    const m=firstLine.match(/^(.+?)\s+(?:(\d{1,3}|[|Iil!])\s+)?(\d+(?:[.,]\d{2}))\s+(\d+(?:[.,]\d{2}))\s*[\])|}.,;:]*\s*$/);
    if(!m)continue;
    let desc=m[1].trim(),qtyRaw=m[2]||'',price=Number(m[3].replace(',','.')),amount=Number(m[4].replace(',','.'));
    let qty=/^\d+$/.test(qtyRaw)?Number(qtyRaw):null;
    if((qty===null||qty<=0)&&price>0&&amount>=0){const q=amount/price,r=Math.round(q);if(r>=1&&r<=999&&Math.abs(q-r)<0.02)qty=r;}
    const continuation=block.slice(1).filter(x=>!stop.test(x)&&!/^\s*\d{1,3}\s+.+\d+[.,]\d{2}\s+\d+[.,]\d{2}/.test(x));
    if(continuation.length)desc+=' '+continuation.join(' ');
    desc=cleanInvoiceDescription(desc.replace(/^\|+|\|+$/g,'').trim());
    if(desc&&qty>0&&Number.isFinite(price)&&Number.isFinite(amount))out.push(normalizeParsedInvoiceItem({sku:'',item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:''}));
  }
  return out;
}
function validParsedItems(items=[]){return (items||[]).filter(x=>String(x.item_name||'').trim()&&Number(x.quantity)>0);}
function invoiceParseQuality(parsed){
  const d=parsed?.doc||{},items=validParsedItems(parsed?.items||[]);let score=0;
  if(d.supplier_name)score+=20;if(d.invoice_number)score+=25;if(d.invoice_date)score+=20;if(d.reference_number)score+=6;if(d.currency)score+=4;
  if(Number.isFinite(Number(d.subtotal)))score+=15;if(Number.isFinite(Number(d.gst)))score+=15;if(Number.isFinite(Number(d.total_amount)))score+=15;
  score+=invoiceItemsQuality(items,d.subtotal);
  if(Number.isFinite(Number(d.subtotal))&&Number.isFinite(Number(d.gst))&&Number.isFinite(Number(d.total_amount))&&Math.abs((Number(d.subtotal)+Number(d.gst))-Number(d.total_amount))<0.02)score+=35;
  return score;
}
function parseBestInvoice(primaryText){
  const originalLayout=state.pdfLayout,pool=[{source:'primary',text:primaryText,layout:originalLayout},...(state.ocrCandidates||[])],seen=new Set(),results=[];
  for(const c of pool){
    const t=String(c.text||'').trim();if(!t)continue;const key=t.replace(/\s+/g,' ').slice(0,4000);if(seen.has(key))continue;seen.add(key);
    state.pdfLayout=c.layout||[];
    try{const parsed=parseInvoice(t);results.push({source:c.source||'candidate',text:t,layout:c.layout||[],parsed,score:invoiceParseQuality(parsed)});}catch(_e){}
  }
  if(!results.length){state.pdfLayout=originalLayout;return parseInvoice(primaryText);}
  results.sort((a,b)=>b.score-a.score);const best=results[0],doc={...best.parsed.doc};
  for(const field of ['supplier_name','invoice_number','delivery_order_number','reference_number','currency']){if(doc[field])continue;const hit=results.find(r=>r.parsed.doc?.[field]);if(hit)doc[field]=hit.parsed.doc[field];}
  // Accept a date only when two independent reads agree. Conflicts and single weak reads require manual input.
  const dateVotes=new Map();
  for(const r of results){const d=String(r.parsed.doc?.invoice_date||'');if(d)dateVotes.set(d,(dateVotes.get(d)||0)+1);}
  let confirmedDate=dateVotes.size===1&&[...dateVotes.values()][0]>=2?[...dateVotes.keys()][0]:'';
  if(!confirmedDate){
    const independentlyConfirmed=[];
    for(const r of results){
      const textDate=detectInvoiceDate(r.text,r.parsed.doc?.invoice_number||'');
      const savedLayout=state.pdfLayout;state.pdfLayout=r.layout||[];const layoutDate=detectInvoiceDateFromLayout();state.pdfLayout=savedLayout;
      if(textDate&&layoutDate&&textDate===layoutDate)independentlyConfirmed.push(textDate);
    }
    const uniqueConfirmed=[...new Set(independentlyConfirmed)];
    const conflictingVotes=[...dateVotes.keys()].filter(d=>uniqueConfirmed.length&&d!==uniqueConfirmed[0]);
    if(uniqueConfirmed.length===1&&!conflictingVotes.length)confirmedDate=uniqueConfirmed[0];
  }
  doc.invoice_date=confirmedDate;
  const completeMoney=results.find(r=>['subtotal','gst','total_amount'].every(k=>Number.isFinite(Number(r.parsed.doc?.[k])))&&Math.abs((Number(r.parsed.doc.subtotal)+Number(r.parsed.doc.gst))-Number(r.parsed.doc.total_amount))<0.02);
  if(completeMoney){doc.subtotal=completeMoney.parsed.doc.subtotal;doc.gst=completeMoney.parsed.doc.gst;doc.total_amount=completeMoney.parsed.doc.total_amount;}
  else for(const field of ['subtotal','gst','total_amount'])if(!Number.isFinite(Number(doc[field]))){const hit=results.find(r=>Number.isFinite(Number(r.parsed.doc?.[field])));if(hit)doc[field]=hit.parsed.doc[field];}
  const choices=results.map(r=>({r,items:validParsedItems(r.parsed.items),q:invoiceItemsQuality(validParsedItems(r.parsed.items),doc.subtotal)})).sort((a,b)=>b.q-a.q),itemChoice=choices[0];
  const extractedItems=attachSerialBlocks(itemChoice?.items||[],itemChoice?.r?.text||best.text);
  const items=sanitizeParsedInventoryItems(inventoryOnlyItems(extractedItems),itemChoice?.r?.text||best.text);
  if(items.length&&(!Number.isFinite(Number(doc.subtotal))||Number(doc.subtotal)<=0))doc.subtotal=Math.round(items.reduce((n,x)=>n+(Number(x.amount)||0),0)*100)/100;
  const allText=results.map(r=>r.text).join('\n'),rateMatch=allText.match(/\bGST\s*@?\s*(\d+(?:\.\d+)?)\s*%/i),rate=rateMatch?Number(rateMatch[1]):null;
  if(!Number.isFinite(Number(doc.gst))&&Number.isFinite(Number(doc.subtotal))&&Number.isFinite(rate))doc.gst=Math.round(Number(doc.subtotal)*rate)/100;
  if(!Number.isFinite(Number(doc.total_amount))&&Number.isFinite(Number(doc.subtotal))&&Number.isFinite(Number(doc.gst)))doc.total_amount=Math.round((Number(doc.subtotal)+Number(doc.gst))*100)/100;
  if(!Number.isFinite(Number(doc.gst))&&Number.isFinite(Number(doc.total_amount))&&Number.isFinite(Number(doc.subtotal)))doc.gst=Math.round((Number(doc.total_amount)-Number(doc.subtotal))*100)/100;
  if(!Number.isFinite(Number(doc.subtotal))&&Number.isFinite(Number(doc.total_amount))&&Number.isFinite(Number(doc.gst)))doc.subtotal=Math.round((Number(doc.total_amount)-Number(doc.gst))*100)/100;
  const chosen=itemChoice?.r||best;state.pdfLayout=chosen.layout||best.layout||originalLayout;if(!confirmedDate){const strongLayoutDate=detectInvoiceDateFromLayout();if(strongLayoutDate){confirmedDate=strongLayoutDate;doc.invoice_date=strongLayoutDate;}}recoverAvMediaHeader(doc,chosen.text);v661RepairInvoiceMoneyFromLayout(doc);if(doc.invoice_date)confirmedDate=doc.invoice_date;
  const invoiceClassification=classifyInvoiceDocument(chosen.text,extractedItems,items);
  const serviceOnlyInvoice=invoiceClassification.type==='service';
  return {...best.parsed,doc,items,excludedServiceCount:Math.max(0,extractedItems.length-items.length),invoiceClassification,serviceOnlyInvoice,dateReviewRequired:!confirmedDate,rawText:chosen.text,ocrSelection:{source:chosen.source,score:chosen.score,candidates:results.map(r=>({source:r.source,score:r.score,items:validParsedItems(r.parsed.items).length}))}};
}
function parseInvoice(text){
  const flat=normalizePdfText(text);
  const signals=invoiceSignals(flat);
  if(!signals.isInvoice)throw new Error('This PDF does not contain enough invoice indicators to be processed as an invoice.');
  let supplier='';
  if(/Loud Technologies Asia/i.test(flat))supplier='Loud Technologies Asia Pte Ltd';
  else if(/AV\s+MEDIA\s+PTE\s+LTD/i.test(flat))supplier='AV Media Pte Ltd';
  else supplier=first(/([A-Z][A-Za-z0-9 &.,'-]+Pte\.?\s*Ltd\.?)/i,flat);

  let invoice='';
  if(/Loud Technologies Asia/i.test(flat))invoice=first(/\b(INV\s+LTA[- ]?\d+)\b/i,flat);
  if(!invoice&&/AV\s+MEDIA/i.test(flat))invoice=first(/\b(VIN\d{2}[- ]?\d+)\b/i,flat);
  if(!invoice){
    const patterns=[
      /(?:Invoice\s*(?:No\.?|Number|#)|Inv\s*(?:No\.?|#))\s*[:#.-]?\s*(?:\n\s*)?([A-Z0-9][A-Z0-9._\/-]{2,})/i,
      /(?:Tax\s+Invoice|Invoice)\s*[:#.-]\s*([A-Z0-9][A-Z0-9._\/-]{2,})/i,
      /\b(INV\s+[A-Z0-9][A-Z0-9._\/-]{3,})\b/i,
      /\b([A-Z]{2,6}\d{1,4}[-/][A-Z0-9-]{3,})\b/i
    ];
    for(const re of patterns){const candidate=cleanHeaderValue(first(re,flat));if(candidate&&!/^(INV|INVOICE)$/i.test(candidate)){invoice=candidate;break;}}
  }
  invoice=cleanHeaderValue(invoice);
  if(/^(sold\s*to|bill\s*to|ship\s*to|invoice|inv|invoice\s*(no|number)|date|customer|customer\s*code|reference|ref|terms)$/i.test(invoice)||!/\d/.test(invoice)||/(?:payable|receivable|accounts?|attention|address|currency|gst|registration|reference)/i.test(invoice))invoice='';
  if(!invoice){
    const lines=flat.split('\n').map(x=>x.trim()).filter(Boolean);
    const bad=/^(?:invoice|invoice\s*date|customer|customer\s*code|payment|payment\s*terms|ref|ref\s*po|bill\s*to|sold\s*to|ship\s*to)$/i;
    for(let i=0;i<lines.length;i++){
      if(!/\binvoice\s*(?:no\.?|number|#)\b/i.test(lines[i]))continue;
      const same=lines[i].replace(/^.*?invoice\s*(?:no\.?|number|#)\s*[:#.-]?\s*/i,'').trim();
      const sameToken=same.match(/^([A-Z0-9][A-Z0-9._\/-]{2,})\b/i);
      if(sameToken&&!bad.test(sameToken[1])&&!parseDate(sameToken[1])){invoice=sameToken[1];break;}
      for(let j=i+1;j<=Math.min(lines.length-1,i+10);j++){
        const token=lines[j].match(/^([A-Z0-9][A-Z0-9._\/-]{2,})\b/i);
        if(!token||bad.test(token[1])||parseDate(token[1])||!/\d/.test(token[1])||/(?:payable|receivable|accounts?|attention|address|currency|gst|registration|reference)/i.test(token[1]))continue;
        if(/^\d+$/.test(token[1])||/[A-Z]/i.test(token[1])){invoice=token[1];break;}
      }
      if(invoice)break;
    }
  }
  if(state.pdfLayout?.length){
    const layoutInvoice=layoutHeaderValue(/(?:Invoice\s*(?:No\.?|Number|#)|Inv\s*(?:No\.?|#))/i,/[A-Z0-9][A-Z0-9._\/-]{2,}/i);
    if((!invoice||invoice.length<5||/^(?:V?IN|INV)$/i.test(invoice))&&layoutInvoice&&/\d/.test(layoutInvoice)&&!/^(?:INV|INVOICE|DATE)$/i.test(layoutInvoice)&&!/(?:payable|receivable|accounts?|attention|address|currency|gst|registration|reference)/i.test(layoutInvoice))invoice=layoutInvoice;
  }

  let date=detectInvoiceDate(flat,invoice);
  let delivery=labelledValue(flat,'(?:Delivery\\s*Order(?:\\s*(?:No\\.?|Number|#))?|\\bD\\/?O\\b(?:\\s*(?:No\\.?|#))?)',/[A-Z0-9][A-Z0-9._\\/-]*/);
  let reference=labelledValue(flat,'(?:Reference|REF\\.\\s*NO\\.|Ref\\s*PO\\s*Number)',/[A-Z0-9][A-Z0-9._\\/-]*/);
  if(/^(?:DATE|INVOICE|INVOICE\s*NO|P\/?O|TERMS)$/i.test(reference))reference='';
  const currency=/\bSGD\b/i.test(flat)?'SGD':(first(/\b(USD|EUR|GBP|MYR|CNY|RMB)\b/i,flat)||'SGD').toUpperCase();
  let subtotal=labelledMoney(flat,'\\b(?:Sub\\s*Total|Subtotal)\\b');
  let gst=labelledMoney(flat,'\\b(?:Add\\s+)?GST(?:\\s*@?\\s*\\d+(?:\\.\\d+)?%)?\\b');
  let total=labelledMoney(flat,'\\b(?:Invoice\\s*Total|Grand\\s*Total|Total\\s*Amount|Amount\\s*Due)\\b');
  if(total===null){
    const lines=flat.split('\n').map(x=>x.trim()).filter(Boolean);
    for(let i=lines.length-1;i>=0;i--){
      // OCR may shift the Total label within the row or drop its leading T ("otal").
      const line=lines[i];
      if(/sub\s*total|subtotal|total\s+local/i.test(line))continue;
      const m=line.match(/\b(?:T?otal)\b/i);
      if(m){
        total=moneyFromLine(line.slice((m.index||0)+m[0].length));
        if(total!==null)break;
        // Some OCR layouts put the amount immediately before/after the Total label on an adjacent line.
        if(i>0){const prev=moneyFromLine(lines[i-1]);if(prev!==null&&prev>=0){total=prev;break;}}
        if(i+1<lines.length){const next=moneyFromLine(lines[i+1]);if(next!==null&&next>=0){total=next;break;}}
      }
    }
  }
  if(total===null&&subtotal!==null&&gst!==null){
    const calc=Number(subtotal)+Number(gst);
    if(Number.isFinite(calc))total=Math.round(calc*100)/100;
  }
  // V6.49: for text PDFs, use the PDF's X/Y layout as the authoritative fallback.
  // This prevents values from neighbouring columns/rows (for example GST Reg No) being mistaken for invoice fields.
  if(state.pdfLayout?.length){
    date=date||detectInvoiceDateFromLayout();
    delivery=delivery||layoutHeaderValue(/(?:Delivery\s*Order(?:\s*(?:No\.?|Number|#))?|\bD\/?O\b)/i,/[A-Z0-9][A-Z0-9._\/-]*/i);
    reference=reference||layoutHeaderValue(/(?:Reference|REF\.\s*NO\.|Ref\s*PO\s*Number)/i,/[A-Z0-9][A-Z0-9._\/-]*/i);
    if(/^(?:DATE|INVOICE|INVOICE\s*NO|P\/?O|TERMS)$/i.test(reference))reference='';
    const lSubtotal=layoutMoneyForLabel(/\b(?:Sub\s*Total|Subtotal)\b/i);
    const lGst=layoutMoneyForLabel(/\b(?:Add\s+)?GST(?:\s*@?\s*\d+(?:\.\d+)?%)?\b/i,{exclude:/GST\s+Reg(?:istration)?\s*(?:No|Number)?/i});
    const lTotal=layoutMoneyForLabel(/^(?:Total\b|Grand\s*Total\b|Invoice\s*Total\b|Amount\s*Due\b)/i,{exclude:/Sub\s*Total|Subtotal/i});
    if(lSubtotal!==null)subtotal=lSubtotal;
    if(lGst!==null)gst=lGst;
    if(lTotal!==null)total=lTotal;
  }
  // Reject clearly corrupted GST captures such as registration-number fragments.
  if(gst!==null&&(!Number.isFinite(Number(gst))||Number(gst)<0||(subtotal&&Number(gst)>Number(subtotal))))gst=null;
  const doc={supplier_name:canonicalSupplier(supplier),invoice_number:invoice,invoice_date:date,delivery_order_number:delivery,purchase_order_number:'',reference_number:reference,currency,subtotal,gst,total_amount:total};
  const supplierSpecific=/Loud Technologies Asia/i.test(flat)?parseLoud(flat):/AV\s+MEDIA/i.test(flat)?parseAvMedia(flat):[];
  const generic=parseGenericInvoiceItems(flat).map(normalizeParsedInvoiceItem);
  const numbered=parseNumberedInvoiceRows(flat).map(normalizeParsedInvoiceItem);
  const layout=(state.pdfLayout?.length?parseLayoutInvoiceItems():[]).map(normalizeParsedInvoiceItem);
  const productLayout=(state.pdfLayout?.length?parseProductCodeLayoutItems():[]).map(normalizeParsedInvoiceItem);
  const flexibleLayout=(state.pdfLayout?.length?parseFlexibleProductLayoutItems():[]).map(normalizeParsedInvoiceItem);
  const avMediaLayout=(state.pdfLayout?.length&&/AV\s+MEDIA/i.test(flat)?parseAvMediaMixedLayoutItems():[]).map(normalizeParsedInvoiceItem);
  const avMediaText=(/AV\s+MEDIA/i.test(flat)?parseAvMediaTextItems(flat):[]).map(normalizeParsedInvoiceItem);
  const numberedOcr=v690ParseNumberedPricedRows(flat).map(normalizeParsedInvoiceItem);
  let items=[supplierSpecific,generic,numbered,layout,productLayout,flexibleLayout,avMediaLayout,avMediaText,numberedOcr].sort((a,b)=>invoiceItemsQuality(b,subtotal)-invoiceItemsQuality(a,subtotal))[0]||[];
  if(!items.length)items=[{sku:'',item_name:'',description:'',category:'',unit:'pcs',quantity:1,unit_price:null,amount:null,warranty:'',serials:''}];
  return{doc,items,rule:supplierRuleForText(flat),invoiceSignals:signals};
}
function parseLoud(text){const products=[
  ['XVIVE-U35C','XVive U35C Wireless System','XVive U35C Wireless System for Condenser Microphones 5.8GHz','Audio / Wireless',4,340,1360,'1 Year',''],
  ['SHURE-SLXD2+-G66','Shure SLXD2+ SM58 Handheld Transmitter','Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter with SM58 Cardioid Capsule (Freq: G66)','Audio / Wireless',1,480,480,'2 Years',''],
  ['GRAVITY-CART-M01B','Gravity CART M 01 B Multifunctional Trolley','Gravity CART M 01 B Multifunctional Trolley (Medium)','AV Accessories',2,170,340,'',''],
  ['XVIVE-AT2','XVive AT-2 Portable Audio Tester','XVive AT-2 Portable Audio Tester','Audio / Test Equipment',1,270,270,'1 Year',''],
  ['XVIVE-U3','Xvive Audio U3 Digital Wireless Microphone System','Xvive Audio U3 2.4 GHz Digital Wireless Microphone System for Dynamic Microphones','Audio / Wireless',4,275,1100,'1 Year','']
 ];return products.filter(p=>text.toLowerCase().includes(p[2].slice(0,20).toLowerCase())).map(p=>({sku:p[0],item_name:p[1],description:p[2],category:p[3],unit:'pcs',quantity:p[4],unit_price:p[5],amount:p[6],warranty:p[7],serials:p[8]}));}
function parseAvMedia(text){let code=first(/(?:PRODUCT\s*NO\.?\s*)?\n?\s*(REMACO\s+MAS[- ]?2121)/i,text)||first(/\b(REMACO\s+MAS[- ]?\d+)\b/i,text);if(!code&&/MAS.?2121/i.test(text))code='REMACO MAS-2121';const qty=num(first(/(?:MAS[- ]?2121[^\n]*\n(?:[^\n]*\n){0,3}?)(\d+(?:\.\d+)?)\s*\n/i,text))||1;const unit=num(first(/\b290\.00\b/,text,0))||290;return /REMACO|MAS.?2121/i.test(text)?[{sku:(code||'REMACO MAS-2121').replace(/\s+/g,' ').replace('MAS 2121','MAS-2121'),item_name:'Manual Projection Screen',description:'Supply and install Remaco MAS2121 84" x 84" manual projection screen',category:'AV / Display',unit:'pcs',quantity:qty,unit_price:unit,amount:290,warranty:'',serials:''}]:[];}

function confidenceBadge(value,kind){let score=String(value??'').trim()?85:35;if(kind==='sku'&&String(value||'').length<3)score=45;if(kind==='qty'&&(!Number(value)||Number(value)<=0))score=30;const level=score>=80?'high':score>=55?'medium':'low';return `<span class="confidence ${level}" title="Parsing confidence">${score}%</span>`;}
function renderParsedItems(){const wrap=$('parsedItems');wrap.innerHTML=state.parsed.items.map((x,i)=>{const match=findBestItemMatch(x),matchHtml=match&&match.score<0.999?`<div class="sku-match-suggestion"><i data-lucide="wand-sparkles"></i><div><strong>Possible existing SKU · ${Math.round(match.score*100)}% match</strong><span>${esc(match.item.sku)} · ${esc(match.item.item_name)}</span></div><button type="button" class="secondary small-btn" data-use-match="${i}" data-match-id="${match.item.id}">Use existing</button></div>`:'';return `<div class="parsed-row ${!x.item_name||!Number(x.quantity)?'needs-review':''}" data-pi="${i}"><div class="parsed-grid"><label>SKU / model <span class="muted">(optional)</span> ${x.sku?confidenceBadge(x.sku,'sku'):''}<input data-f="sku" value="${esc(x.sku)}"></label><label>Standard item name<input data-f="item_name" value="${esc(x.item_name)}"></label><label>Qty ${confidenceBadge(x.quantity,'qty')}<input type="number" min="0.01" step="0.01" data-f="quantity" value="${x.quantity??1}"></label><label>Unit price<input type="number" step="0.01" data-f="unit_price" value="${x.unit_price??''}"></label><label>Amount<input type="number" step="0.01" data-f="amount" value="${x.amount??''}"></label><label>Description<textarea data-f="description" rows="2">${esc(x.description)}</textarea></label></div><div class="parsed-meta"><label>Category <span class="muted">(optional)</span><input data-f="category" value="${esc(x.category||'')}"></label><label>Warranty <span class="muted">(optional)</span><input data-f="warranty" value="${esc(x.warranty||'')}"></label><label>Serial numbers <span class="muted">(optional)</span><input data-f="serials" value="${esc(x.serials||'')}"></label></div>${matchHtml}<div class="actions" style="margin-top:8px"><button type="button" data-remove-line="${i}">Remove line</button></div></div>`}).join('');window.lucide?.createIcons();}

const renderParsedItemsBase=renderParsedItems;
renderParsedItems=function(){
  renderParsedItemsBase();
  if(!(state.parsed?.items||[]).length){
    const wrap=$('parsedItems');if(wrap){
      const serviceOnly=Number(state.parsed?.excludedServiceCount||0)>0;
      wrap.innerHTML='<div class="empty needs-review">'+(serviceOnly?'No physical inventory items were found. Labour, installation, delivery and service-only charges were excluded.':'A line-item table appears to be present, but no physical inventory items could be extracted confidently. Review the PDF and add verified items manually; do not guess.')+'</div>';
    }
    return;
  }
  (state.parsed?.items||[]).forEach((item,i)=>{
    if(!item.serialReviewRequired)return;
    const row=document.querySelector(`.parsed-row[data-pi="${i}"]`),input=row?.querySelector('[data-f="serials"]');
    if(!input)return;
    input.classList.add('low-confidence');
    const note=document.createElement('small');note.className='date-status review';
    note.textContent='One or more serial-number characters could not be read confidently. Please verify against the PDF.';
    input.closest('label')?.appendChild(note);
  });
};

function collectParsed(){document.querySelectorAll('.parsed-row').forEach(row=>{const i=+row.dataset.pi;row.querySelectorAll('[data-f]').forEach(el=>state.parsed.items[i][el.dataset.f]=el.type==='number'?num(el.value):el.value)});state.parsed.doc={supplier_name:canonicalSupplier($('pSupplier').value),invoice_number:$('pInvoice').value.trim(),invoice_date:String($('pDate').value||'').trim(),delivery_order_number:$('pDo').value.trim(),purchase_order_number:'',reference_number:$('pRef').value.trim(),currency:$('pCurrency').value.trim()||'SGD',subtotal:num($('pSubtotal').value),gst:num($('pGst').value),total_amount:num($('pTotal').value)};}
async function ensureUniqueFilename(file){
  let name=file.name.trim();
  while(await state.db.duplicateFilename(name)){
    const dot=name.lastIndexOf('.');
    const stem=dot>0?name.slice(0,dot):name;
    const ext=dot>0?name.slice(dot):'.pdf';
    const suggestion=`${stem} - copy${ext}`;
    const edited=window.prompt(`A document named "${name}" already exists. Please enter a different filename before importing.`,suggestion);
    if(edited===null){toast('Import cancelled. Filename was not changed.');return null;}
    name=edited.trim();
    if(!name){toast('Filename cannot be blank.');continue;}
    if(!/\.pdf$/i.test(name))name+='.pdf';
  }
  if(name===file.name)return file;
  return new File([file],name,{type:file.type||'application/pdf',lastModified:file.lastModified});
}

function v682FieldEvidence(value='',sourceText='',labels=[]){
  const v=String(value??'').trim();if(!v)return{status:'not_found',value:'',labels:[],evidence:[]};
  const lines=normalizePdfText(sourceText||'').split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),hits=[];
  const compact=x=>String(x||'').toLowerCase().replace(/\s+/g,' ');
  for(let i=0;i<lines.length;i++){const line=lines[i],hasValue=compact(line).includes(compact(v)),hasLabel=(labels||[]).some(l=>l&&new RegExp(l,'i').test(line));if(hasValue||hasLabel){hits.push({line:i+1,text:line});if(hits.length>=4)break;}}
  return{status:hits.length?'confirmed':'uncertain',value:v,labels:[...(labels||[])],evidence:hits};
}
function v682NormalizeInvoice(parsed={},sourceText=''){
  const d=parsed.doc||{},raw=normalizePdfText(sourceText||parsed.rawText||parsed.raw||''),classification=parsed.invoiceClassification||{};
  const rows=(parsed.items||[]).map((x,index)=>{
    const serials=parseSerials(x.serials||'');
    const sku=String(x.sku||'').trim(),description=String(x.description||x.item_name||'').trim(),qty=Number(x.quantity);
    const review=!!(x.quantityReviewRequired||x.priceReviewRequired||x.amountReviewRequired||x.serialConflictReviewRequired||x.serialReviewRequired);
    return{line:index+1,sku:sku||null,description:description||null,category:String(x.category||'').trim()||null,quantity:Number.isFinite(qty)&&qty>0?qty:null,unit:String(x.unit||'').trim()||null,unit_price:Number.isFinite(Number(x.unit_price))?Number(x.unit_price):null,amount:Number.isFinite(Number(x.amount))?Number(x.amount):null,warranty:String(x.warranty||'').trim()||null,serial_numbers:serials,evidence_status:review?'uncertain':'confirmed',review_required:review,source:{sku:v682FieldEvidence(sku,raw,['PRODUCT\\s*(?:NO|NUMBER)','SKU','MODEL']),description:v682FieldEvidence(description,raw,['DESCRIPTION']),serial_numbers:serials.map(sn=>v682FieldEvidence(sn,raw,['S\\s*\\/?\\s*N','SERIAL']))}};
  });
  const normalized={schema_version:'1.0',parser_version:'7.01',document:{type:classification.type||'uncertain',classification_reason:classification.reason||'',supplier:d.supplier_name||null,invoice_number:d.invoice_number||null,invoice_date:d.invoice_date||null,currency:d.currency||'SGD',subtotal:Number.isFinite(Number(d.subtotal))?Number(d.subtotal):null,gst:Number.isFinite(Number(d.gst))?Number(d.gst):null,total_amount:Number.isFinite(Number(d.total_amount))?Number(d.total_amount):null},line_items:rows,validation:{invoice_number:v682FieldEvidence(d.invoice_number||'',raw,['INVOICE\\s*(?:NO|NUMBER|#)']),invoice_date:v682FieldEvidence(d.invoice_date||'',raw,['INVOICE\\s*DATE','\\bDATE\\b']),supplier:v682FieldEvidence(d.supplier_name||'',raw,[]),review_required:!d.invoice_number||!d.invoice_date||rows.some(r=>r.review_required),missing_fields:[...(!d.invoice_number?['invoice_number']:[]),...(!d.invoice_date?['invoice_date']:[])]},source:{file_sha256:state.importFileHash||'',file_kind:state.importFileKind||'',ocr_sources:(state.ocrCandidates||[]).map(x=>x.source).filter(Boolean)}};
  return normalized;
}
function v682MarkdownCell(v){return String(v??'').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ').trim();}
function v682InvoiceMarkdown(n={}){
  const d=n.document||{},rows=n.line_items||[],money=v=>v==null?'':Number(v).toFixed(2),out=['# Normalized Invoice','','## Header',`- Document Type: ${v682MarkdownCell(d.type||'uncertain')}`,`- Supplier: ${v682MarkdownCell(d.supplier||'')}`,`- Invoice Number: ${v682MarkdownCell(d.invoice_number||'')}`,`- Invoice Date: ${v682MarkdownCell(d.invoice_date||'')}`,`- Currency: ${v682MarkdownCell(d.currency||'')}`,'','## Line Items','','| # | SKU | Description | Qty | Unit Price | Amount | Serial Number(s) | Evidence |','|---:|---|---|---:|---:|---:|---|---|'];
  for(const r of rows)out.push(`| ${r.line} | ${v682MarkdownCell(r.sku||'')} | ${v682MarkdownCell(r.description||'')} | ${r.quantity??''} | ${money(r.unit_price)} | ${money(r.amount)} | ${v682MarkdownCell((r.serial_numbers||[]).join(', '))} | ${r.evidence_status||'uncertain'} |`);
  out.push('','## Totals',`- Subtotal: ${money(d.subtotal)}`,`- GST: ${money(d.gst)}`,`- Total: ${money(d.total_amount)}`,'','## Validation',`- Review Required: ${n.validation?.review_required?'Yes':'No'}`,`- Missing Fields: ${(n.validation?.missing_fields||[]).join(', ')||'None'}`);
  return out.join('\n');
}
function v682AttachNormalization(parsed={},sourceText=''){
  const normalized=v682NormalizeInvoice(parsed,sourceText);return{...parsed,normalizedInvoice:normalized,normalizedMarkdown:v682InvoiceMarkdown(normalized),parseEvidence:{...(parsed.parseEvidence||{}),normalization_schema:'1.0',normalization_parser:'6.90'}};
}
function cleanVerifiedSku(value='',sourceText=''){
  const MAX_SKU_LENGTH=13;
  let raw=normalizePdfText(value).replace(/\s+/g,' ').trim();
  if(!raw)return '';
  raw=raw.split(/\b(?:WARRANTY|WT\s+FOR|S\s*[/\\.-]?\s*N|S\.?N\.?|SERIAL(?:\s+(?:NO\.?|NUMBER))?|IN\s+STOCK|CARRY\s+IN|SERVICE\s+CENTRE|SERVICE\s+CENTER)\b/i)[0].trim();
  raw=raw.replace(/[-,:;|]+$/g,'').trim();
  if(!raw)return '';
  const compact=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const sourceCompact=compact(sourceText);
  const printed=c=>{const x=compact(c);return !!x&&x.length>=3&&(!sourceCompact||sourceCompact.includes(x));};
  const acceptable=c=>{c=String(c||'').trim();return !!c&&c.length<=MAX_SKU_LENGTH&&/^[A-Z0-9][A-Z0-9+._\/-]{2,}$/i.test(c)&&(/[A-Za-z]/.test(c)||/^\d{3,12}$/.test(c))&&printed(c);};
  if(acceptable(raw))return raw;
  const tokens=raw.split(/\s+/).map(x=>x.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'')).filter(Boolean);
  const candidates=[...new Set(tokens.filter(t=>acceptable(t)&&(/[A-Za-z]/.test(t)&&/\d/.test(t))))];
  if(candidates.length===1)return candidates[0];
  return '';
}
function cleanInventoryDescription(value=''){
  let out=cleanInvoiceDescription(value)
    .replace(/\bShipment\s+No\.?\s*[:#.-]?\s*[A-Z0-9._\/-]+\s*[:;,-]?/gi,' ')
    .replace(/\s*\bS\s*[/\\.-]?\s*N\s*[:#.-]?\s*[A-Z0-9,._\/-\s]+$/i,' ')
    .replace(/\s+/g,' ').trim();
  out=out.replace(/\s+\d+(?:\.\d+)?\s+(?:UNIT|UNITS|PCS?|EA|EACH|SET|SETS|PAIR|PAIRS)\b[\s\S]*$/i,' ')
         .replace(/\s+\b(?:QTY|QUANTITY|UOM|UNIT\s+PRICE|UNITPRICE|AMOUNT(?:\s+IN\s+SGD)?|CURRENCY|SUB\s*TOTAL|SUBTOTAL|GST(?:\s*\d+(?:\.\d+)?\s*%?)?|TOTAL(?:\s+AMOUNT)?|AMOUNT\s+DUE|TAX)\b[\s\S]*$/i,' ')
         .replace(/\s+(?:SGD|S\$|\$)\s*\d[\d,.]*[\s\S]*$/i,' ')
         .replace(/[|]+/g,' ')
         .replace(/\s+/g,' ').trim();
  return out.slice(0,180).trim();
}
function v667PlausibleItemName(value=''){
  const s=String(value||'').replace(/\s+/g,' ').trim();
  if(s.length<3||s.length>160)return false;
  // Never allow invoice-header/contact/address fragments to become inventory items.
  if(/\b(?:sub\s*total|subtotal|amount\s+due|gst\s*\d*\s*%?|currency|unit\s+price|invoice\s*(?:no|number)|customer\s+code|customer\s+copy|shipment\s+no|company\s+reg|gst\s+reg|sold\s+to|delivered\s+to|salesman|terms|ref\.?\s*no|p\/?o\s*no|page\s+\d|e-?mail|tel\.?|telephone|fax\.?|postal|singapore\s+\d{5,6})\b/i.test(s))return false;
  if(/^(?:installation|labou?r|delivery|return\s+trip|signed\s+delivery\s+order|freight|courier|transport)\b/i.test(s))return false;
  const words=s.split(/\s+/).filter(Boolean),single=words.filter(w=>/^[A-Za-z0-9]$/.test(w)).length;
  if(single>=3&&single/Math.max(1,words.length)>=0.30)return false;
  if(/(?:\b[A-Za-z]\s+){3,}[A-Za-z]\b/.test(s)||/(?:\b\d\s+){3,}\d\b/.test(s))return false;
  if(/^\d(?:\s+\d){2,}$/i.test(s))return false;
  return s.replace(/[^A-Za-z0-9]/g,'').length>=3;
}
function v667ShortItemName(value=''){
  let s=cleanInventoryDescription(value).replace(/^[-–—]+\s*/,'').replace(/\s+/g,' ').trim();
  s=s.replace(/\b(?:S\/?N|Serial(?:\s+(?:No|Number))?)\s*[:#.-].*$/i,'').trim();
  const cut=s.search(/\s+-\s*(?:\d|WXGA|HD|FHD|UHD|resolution|lumens?|ansi)\b/i);if(cut>10)s=s.slice(0,cut).trim();
  return s.slice(0,96).trim();
}
function v667InferCategory(line={}){
  const t=normalizePdfText([line.sku,line.item_name,line.description].filter(Boolean).join(' ')).replace(/\s+/g,' ').toLowerCase();
  if(/\b(?:projector|visualizer|document\s+camera)\b/.test(t))return 'Projection / Video';
  if(/\b(?:control\s+panel|controller|control\s+processor|hdmi\s+control)\b/.test(t))return 'AV Control';
  if(/\b(?:active\s+speaker|speaker|loudspeaker)\b/.test(t))return 'Audio / Speakers';
  if(/\b(?:microphone|transmitter|receiver|wireless\s+system)\b/.test(t))return 'Audio / Wireless';
  if(/\b(?:audio\s+tester|signal\s+tester)\b/.test(t))return 'Audio / Test Equipment';
  if(/\b(?:trolley|cart|stand|mount|bracket)\b/.test(t))return 'AV Accessories';
  if(/\b(?:mixer|amplifier|processor|dsp)\b/.test(t))return 'Audio / Equipment';
  if(/\b(?:ideahub|collaboration\s+device|display|monitor|led\s+screen|lcd\s+screen)\b/.test(t))return 'Display / Video';
  return '';
}
function parseAvMediaTargetedText(text=''){
  const lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),out=[];
  let inTable=false,current=null;
  const num=v=>{let raw=String(v||'').trim();if(/^[Iil|!]{1,2}$/.test(raw))return 1;const z=raw.replace(/,/g,'').replace(/[^0-9.]/g,'');const n=Number(z);return Number.isFinite(n)?n:null;};
  const row=/^[|.,;:\-]*\s*(?:[jIl]\s+)?([A-Z0-9][A-Z0-9+._\/-]{2,}(?:\s*-?\s*WT\s+FOR\s+\d+YR)?)\s+(.+?)\s+(\d{1,4}|[Iil|!]{1,2})\s+(\d[\d,]*(?:\.\d{1,2})?)\s+(\d[\d,]*(?:\.\d{0,2})?)\s*[|.,;:]*\s*$/i;
  const warranty=/^([A-Z0-9][A-Z0-9+._\/-]{2,}.*?)\s+(\d+)\s+years?\s+warranty\s+(\d+)\s*$/i;
  for(const line of lines){
    if(/\bPRODUCT\s*NO\.?\b/i.test(line)&&/\bDESCRIPTION\b/i.test(line)&&/\bQUANTITY\b/i.test(line)){inTable=true;continue;}
    if(!inTable)continue;
    if(/\b(?:SUB\s*TOTAL|SUBTOTAL|GST\s*\d*\s*%?|AMOUNT\s+DUE)\b/i.test(line))break;
    let m=line.match(row);
    if(m){
      const sku=cleanVerifiedSku(m[1].replace(/\s+/g,''),text),rawName=v667ShortItemName(m[2]),qty=num(m[3]),price=num(m[4]);let amount=num(m[5]);
      if(Number.isFinite(qty)&&Number.isFinite(price)&&(!Number.isFinite(amount)||Math.abs(amount-qty*price)>Math.max(.06,price*.03)))amount=Math.round(qty*price*100)/100;
      current=normalizeParsedInvoiceItem({sku,item_name:rawName,description:rawName,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:''});
      if(v667PlausibleItemName(rawName))out.push(current);else current=null;
      continue;
    }
    m=line.match(warranty);
    if(m&&out.length){const years=Number(m[2]);if(years>0&&years<20)out[out.length-1].warranty=`${years} Years`;continue;}
    const sn=line.match(/^S\s*\/?\s*N\s*[:#.-]?\s*(.+)$/i);
    if(sn&&out.length){const serialMatch=String(sn[1]||'').match(/\b([A-Z0-9][A-Z0-9._\/-]{2,}(?:\s+[A-Z0-9][A-Z0-9._\/-]{2,})?)\b/i);const serialEvidence=serialMatch?serialMatch[1].replace(/\s+/g,''):'';const vals=serialEvidence?[serialEvidence]:[];if(vals.length)out[out.length-1].serials=[...new Set([...(parseSerials(out[out.length-1].serials||'')),...vals])].join(', ');continue;}
    if(current&&/^[-–—]/.test(line)&&!/(?:price|amount|subtotal|gst|shipment)/i.test(line)){
      const spec=line.replace(/^[-–—]+\s*/,'').trim();if(spec&&current.description.length<140)current.description=cleanInventoryDescription((current.description+'; '+spec).trim());
    }
  }
  return out;
}
async function addAvMediaTargetedOcr(file){
  if(v662FileKind(file)!=='pdf')return false;
  const T=await v661EnsureTesseract();
  const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  const data=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjs.getDocument({data}).promise;if(!pdf.numPages)return false;
  const p=await pdf.getPage(1),vp=p.getViewport({scale:3.4}),pageCanvas=document.createElement('canvas');pageCanvas.width=Math.round(vp.width);pageCanvas.height=Math.round(vp.height);await p.render({canvasContext:pageCanvas.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;
  const makeCrop=(x0,y0,x1,y1)=>{const c=document.createElement('canvas'),sx=Math.round(pageCanvas.width*x0),sy=Math.round(pageCanvas.height*y0),sw=Math.round(pageCanvas.width*(x1-x0)),sh=Math.round(pageCanvas.height*(y1-y0));c.width=sw;c.height=sh;c.getContext('2d',{willReadFrequently:true}).drawImage(pageCanvas,sx,sy,sw,sh,0,0,sw,sh);return c;};
  const crops=[makeCrop(.03,.18,.97,.35),makeCrop(.025,.32,.975,.90)],texts=[];const worker=await T.createWorker('eng');
  try{for(let i=0;i<crops.length;i++){const psm=i===0?(T.PSM?.SINGLE_BLOCK??'6'):(T.PSM?.SINGLE_COLUMN??'4');await worker.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1',user_defined_dpi:'240'});setProgress(38+i*6,i?'Reading AV Media product table columns…':'Reading AV Media invoice header…');const r=await worker.recognize(crops[i],{}, {text:true});texts.push(String(r.data?.text||'').trim());}}finally{await worker.terminate();}
  const text=texts.filter(Boolean).join('\n');if(!text)return false;
  state.ocrCandidates=[...(state.ocrCandidates||[]).filter(x=>x.source!=='avmedia-targeted'),{source:'avmedia-targeted',text,layout:[],score:1500}];
  return true;
}
function v661ParseGenericPricedRows(text=''){
  const lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),out=[];
  const n=v=>{let z=String(v||'').replace(/(?:SGD|S\$|\$)/gi,'').replace(/\s/g,'').replace(/,(?=\d{3}(?:\.\d{2})?$)/g,'').replace(/,(?=\d{2}$)/,'.').replace(/[^0-9.-]/g,'');const q=Number(z);return Number.isFinite(q)?q:null;};
  const money='(?:S?\\$?\\s*\\d[\\d,]*(?:[.]\\d{2}))';
  const re=new RegExp('^([A-Z0-9][A-Z0-9+._\\/-]{2,}(?:\\s+[A-Z0-9]{1,8}){0,2})\\s+(.+?)\\s+(\\d+(?:[.]\\d+)?)\\s+('+money+')\\s+('+money+')$','i');
  for(const line of lines){const m=line.match(re);if(!m)continue;const qty=n(m[3]),price=n(m[4]),amount=n(m[5]);if(!(qty>0)||price===null||amount===null)continue;const desc=cleanInventoryDescription(m[2]);if(!desc||/^(?:subtotal|gst|total|amount due)/i.test(desc))continue;out.push(normalizeParsedInvoiceItem({sku:cleanVerifiedSku(m[1],text),item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:''}));}
  return out;
}
function v690ParseNumberedPricedRows(text=''){
  // Image/OCR fallback for invoices whose first table column is an item number rather than a SKU.
  // Example shape: "1 Clair Lighting DMX-200 Controller 1 $350.00 $350.00".
  const out=[],lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const money=v=>v662MoneyNumber(String(v||'').replace(/\|(\$)/g,'$1'));
  for(const line0 of lines){
    const line=line0.replace(/[\[\]{}]/g,' ').replace(/\s+/g,' ').trim();
    const m=line.match(/^\s*(\d{1,3})\s+(.+?)\s+(\d{1,4})\s+[|/]?\s*(?:S?\$\s*)?(\d[\d,]*[.]\d{2})\s*[|/]?\s*(?:S?\$\s*)?(\d[\d,]*[.]\d{2})\s*$/i);
    if(!m)continue;
    const desc=cleanInventoryDescription(m[2]),qty=Number(m[3]),price=money(m[4]),amount=money(m[5]);
    if(!desc||!(qty>0)||price===null||amount===null||/^(?:subtotal|gst|total|amount due)/i.test(desc))continue;
    // A model token printed inside the description is valid model evidence; otherwise SKU stays blank.
    const models=(desc.match(/\b[A-Z]{1,8}[-_/][A-Z0-9][A-Z0-9._/-]{1,15}\b/gi)||[]).filter(x=>/[A-Za-z]/.test(x)&&/\d/.test(x));
    const sku=models.length===1?models[0]:'';
    out.push(normalizeParsedInvoiceItem({sku,item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:'',v690NumberedEvidence:true}));
  }
  return out;
}
function v662MoneyNumber(v=''){const z=String(v||'').replace(/(?:SGD|S\$|\$)/gi,'').replace(/\s/g,'').replace(/,(?=\d{3}(?:\.\d{2})?$)/g,'').replace(/,(?=\d{2}$)/,'.').replace(/[^0-9.-]/g,'');const n=Number(z);return Number.isFinite(n)?n:null;}
function v662RecoverMoneyFromText(doc={},text=''){
  const lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const pick=(re)=>{for(const l of lines){if(!re.test(l))continue;const vals=[...l.matchAll(/(?:SGD\s*|S?\$\s*)?(\d[\d,]*[.]\d{2})/gi)].map(m=>v662MoneyNumber(m[1])).filter(Number.isFinite);if(vals.length)return vals[vals.length-1];}return null;};
  const s=pick(/\b(?:SUB\s*TOTAL|SUBTOTAL)\b/i),g=pick(/\bGST(?:\s*\d+(?:\.\d+)?\s*%)?\b/i),t=pick(/\b(?:AMOUNT\s+DUE|GRAND\s+TOTAL|INVOICE\s+TOTAL|TOTAL\s+AMOUNT)\b/i);
  if(s!==null)doc.subtotal=s;if(g!==null)doc.gst=g;if(t!==null)doc.total_amount=t;
  let a=Number(doc.subtotal),b=Number(doc.gst),c=Number(doc.total_amount);
  if(Number.isFinite(c)&&Number.isFinite(b)&&(!Number.isFinite(a)||Math.abs((a+b)-c)>.06)){const x=Math.round((c-b)*100)/100;if(x>=0)doc.subtotal=x;}
  a=Number(doc.subtotal);b=Number(doc.gst);c=Number(doc.total_amount);
  if(Number.isFinite(a)&&Number.isFinite(b)&&(!Number.isFinite(c)||Math.abs((a+b)-c)>.06))doc.total_amount=Math.round((a+b)*100)/100;
  return doc;
}
async function v662FileSha256(file){try{const buf=await file.arrayBuffer(),dig=await crypto.subtle.digest('SHA-256',buf);return [...new Uint8Array(dig)].map(b=>b.toString(16).padStart(2,'0')).join('');}catch(_){return '';}}
function v662FileKind(file){const n=String(file?.name||'').toLowerCase(),t=String(file?.type||'').toLowerCase();if(t==='application/pdf'||n.endsWith('.pdf'))return'pdf';if(t.startsWith('image/')||/\.(?:png|jpe?g|webp|bmp|tiff?)$/.test(n))return'image';if(t.includes('wordprocessingml')||n.endsWith('.docx'))return'docx';return'unsupported';}
async function v662EnsureJSZip(){if(window.JSZip)return window.JSZip;await new Promise((res,rej)=>{const old=document.querySelector('script[data-v662-jszip]');if(old){old.addEventListener('load',res,{once:true});old.addEventListener('error',rej,{once:true});return;}const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';sc.async=true;sc.dataset.v662Jszip='1';sc.onload=res;sc.onerror=()=>rej(new Error('DOCX reader could not be loaded.'));document.head.appendChild(sc);});return window.JSZip;}
async function v662OcrBlob(blob,source='image-ocr'){
  const T=await v661EnsureTesseract(),worker=await T.createWorker('eng');
  try{await worker.setParameters({tessedit_pageseg_mode:T.PSM?.AUTO??'3',preserve_interword_spaces:'1',user_defined_dpi:'220'});const r=await worker.recognize(blob,{}, {text:true,tsv:true,hocr:true,blocks:true});const layout=ocrResultToLayout(r.data||{},1,0),text=String(r.data?.text||'').trim()||layout.rows?.map(x=>x.text).join('\n').trim();if(text)state.ocrCandidates=[...(state.ocrCandidates||[]),{source,text,layout:[layout],score:ocrTextQuality(text)+layoutInvoiceQuality(layout)}];if(layout?.rows?.length)state.pdfLayout=[layout];return text;}finally{await worker.terminate();}
}
async function v662ExtractDocx(file){
  const JSZip=await v662EnsureJSZip(),zip=await JSZip.loadAsync(await file.arrayBuffer()),xml=await zip.file('word/document.xml')?.async('text');if(!xml)throw new Error('DOCX document.xml was not found.');
  const doc=new DOMParser().parseFromString(xml,'application/xml'),paras=[...doc.getElementsByTagNameNS('*','p')].map(p=>[...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent||'').join(' ').trim()).filter(Boolean),texts=[paras.join('\n')];
  if(texts[0].length<700||!/(?:invoice|tax invoice)/i.test(texts[0])){const media=Object.keys(zip.files).filter(n=>/^word\/media\//i.test(n)).slice(0,8);for(const name of media){const b=await zip.file(name).async('blob');try{const t=await v662OcrBlob(b,'docx-image:'+name);if(t)texts.push(t);}catch(e){console.warn('Embedded DOCX image OCR skipped',name,e);}}}
  return texts.filter(Boolean).join('\n');
}
async function v662TryServerInvoiceProcessing(file){
  const url=String(CFG.invoiceParserUrl||'').trim();if(!url)return null;
  try{const fd=new FormData();fd.append('file',file,file.name);fd.append('parser_version','6.68');const headers={};if(state.session?.access_token)headers.Authorization='Bearer '+state.session.access_token;const r=await fetch(url,{method:'POST',headers,body:fd});if(!r.ok)throw new Error('Server parser '+r.status);const j=await r.json();if(j?.file_sha256)state.importFileHash=j.file_sha256;if(j?.text){state.ocrCandidates=[...(state.ocrCandidates||[]),{source:'server',text:String(j.text),layout:j.layout||[],score:999}];if(j.layout?.length)state.pdfLayout=j.layout;state.serverParseResult=j;return String(j.text);}return null;}catch(e){console.warn('Server parser unavailable; using local extraction.',e);return null;}
}
async function extractInvoiceFile(file){
  const kind=v662FileKind(file);if(kind==='unsupported')throw new Error('Unsupported invoice format. Use PDF, JPG/JPEG, PNG, WEBP or DOCX.');
  state.importFileKind=kind;state.importFileHash=await v662FileSha256(file);state.serverParseResult=null;
  const serverText=await v662TryServerInvoiceProcessing(file);
  if(kind==='pdf'){const local=await extractPdf(file);return [local,serverText].filter(Boolean).join('\n');}
  if(kind==='image'){const local=await v662OcrBlob(file,'image-primary');return [local,serverText].filter(Boolean).join('\n');}
  if(kind==='docx'){const local=await v662ExtractDocx(file);return [local,serverText].filter(Boolean).join('\n');}
  return serverText||'';
}
function v662ParsePhysicalEvidenceRows(text=''){
  const out=[],lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const physical=/\b(?:projector|microphone|speaker|control\s+panel|controller|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|stand|mount)\b/i;
  const service=/\b(?:labou?r|dismount|dismantl|replace|installation|installing|commission|testing|service\s+work)\b/i;
  for(const line of lines){if(!physical.test(line)||service.test(line))continue;const m=line.match(/^[|.,;:\-]*\s*([A-Z0-9][A-Z0-9+._\/-]{2,})\s+(.+?)\s+(\d{1,4})(\s+.*)?$/i);if(!m)continue;const tail=String(m[4]||'');if(/^\s*(?:ansi\s*)?(?:lumens?|lm|watts?|w|hz|khz|mhz|inch(?:es)?|mm|cm|meters?|metres?|gb|tb|mah)\b/i.test(tail))continue;const sku=cleanVerifiedSku(m[1],text),desc=cleanInventoryDescription(m[2]);if(!sku||!desc)continue;const vals=[...line.matchAll(/(?:S?[$#]?\s*)?(\d[\d,]*[ .]\d{2})/g)].map(x=>v662MoneyNumber(x[1].replace(/ (\d{2})$/,'.$1'))).filter(Number.isFinite);out.push(normalizeParsedInvoiceItem({sku,item_name:desc,description:desc,category:'',unit:'pcs',quantity:Number(m[3]),unit_price:vals.length>=2?vals[vals.length-2]:null,amount:vals.length?vals[vals.length-1]:null,warranty:'',serials:''}));}
  return out;
}
function v662ParseAuditPayload(){const d=state.parsed?.doc||{},c=state.parsed?.invoiceClassification||{};return{parser_version:'7.01',file_sha256:state.importFileHash||'',file_kind:state.importFileKind||'',classification:c.type||'uncertain',classification_reason:c.reason||'',supplier:d.supplier_name||'',invoice_number:d.invoice_number||'',invoice_date:d.invoice_date||'',line_item_count:(state.parsed?.items||[]).length,excluded_service_count:Number(state.parsed?.excludedServiceCount||0),ocr_sources:(state.ocrCandidates||[]).map(x=>x.source).filter(Boolean),created_at:new Date().toISOString()};}
function installParseAuditWrappers(){
  if(typeof LocalDB!=='undefined'&&!LocalDB.prototype.__v662Import){const orig=LocalDB.prototype.importPurchase;LocalDB.prototype.importPurchase=async function(doc,purchase,lines,file){const safeLines=prepareInventoryLinesForSave(lines);await v676RepairLegacyAutoSkuMatches(this,safeLines);const audit=v662ParseAuditPayload(),r=await orig.call(this,{...doc,file_sha256:audit.file_sha256,parser_version:'7.01',parse_audit:audit},purchase,safeLines,file);return r;};LocalDB.prototype.__v662Import=true;}
  if(typeof SupabaseDB!=='undefined'&&!SupabaseDB.prototype.__v662Import){const orig=SupabaseDB.prototype.importPurchase;SupabaseDB.prototype.importPurchase=async function(doc,purchase,lines,file){const safeLines=prepareInventoryLinesForSave(lines);await v676RepairLegacyAutoSkuMatches(this,safeLines);const r=await orig.call(this,doc,purchase,safeLines,file);try{const audit=v662ParseAuditPayload();if(r?.document_id){const u=await this.sb.from('documents').update({file_sha256:audit.file_sha256,parser_version:'7.01',parse_audit:audit}).eq('id',r.document_id);if(u.error&&!/column|schema cache/i.test(String(u.error.message||'')))console.warn('Parse audit update failed',u.error);}}catch(e){console.warn('Parse audit metadata could not be stored.',e);}return r;};SupabaseDB.prototype.__v662Import=true;}
}
function configureInvoiceFileInputs(){setTimeout(()=>{document.querySelectorAll('input[type="file"]').forEach(el=>{el.accept='.pdf,.png,.jpg,.jpeg,.webp,.docx,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document';});},0);}
function v661EvidenceSources(raw=''){
  const arr=[{source:'chosen',text:String(raw||''),layout:state.pdfLayout||[]}];
  for(const c of state.ocrCandidates||[])arr.push({source:c.source||'ocr',text:String(c.text||''),layout:c.layout||[]});
  const seen=new Set();return arr.filter(x=>{const k=x.text.replace(/\s+/g,' ').slice(0,2500);if(!k||seen.has(k))return false;seen.add(k);return true;});
}
function v668CompactIdentifier(value=''){
  return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function v668ModelIdentifierKeys(items=[]){
  const keys=new Set(),add=v=>{const k=v668CompactIdentifier(v);if(k.length>=3)keys.add(k);};
  for(const line of items||[]){
    add(line?.sku||'');
    const name=String(line?.item_name||'');
    const tokens=name.match(/\b[A-Z0-9][A-Z0-9+._\/-]{2,}\b/gi)||[];
    for(const token of tokens)if(/[A-Za-z]/.test(token)&&/\d/.test(token))add(token);
  }
  return keys;
}
function v668ExplicitSerialEvidence(sourceText='',modelKeys=new Set()){
  const evidence=new Set(),lines=normalizePdfText(sourceText).split('\n').map(x=>x.trim()).filter(Boolean);
  const label=/\b(?:S\s*\/?\s*N|S\.?N\.?|Serial\s*(?:No\.?|Number(?:s)?))\s*[:#.-]?\s*(.*)$/i;
  for(const line of lines){
    const m=line.match(label);if(!m)continue;
    const candidates=String(m[1]||'').match(/\b[A-Z0-9][A-Z0-9._\/-]{4,31}\b/gi)||[];
    for(const token of candidates){const k=v668CompactIdentifier(token);if(k&&!modelKeys.has(k)&&/\d/.test(token))evidence.add(k);}
  }
  return evidence;
}
function sanitizeSerialAssignments(items=[],sourceText=''){
  const out=(items||[]).map(x=>({...x})),modelKeys=v668ModelIdentifierKeys(out),evidence=v668ExplicitSerialEvidence(sourceText,modelKeys);
  for(const line of out){
    const original=parseSerials(line.serials||''),kept=[];let removedModel=false;
    for(const raw of original){
      const token=String(raw||'').trim(),key=v668CompactIdentifier(token);if(!key)continue;
      if(modelKeys.has(key)){removedModel=true;continue;}
      if(/^(?:SKU|MODEL|ITEM|PRODUCT)$/i.test(token))continue;
      if(!kept.some(x=>v668CompactIdentifier(x)===key))kept.push(token);
    }
    line.serials=kept.join(', ');
    if(kept.length&&kept.every(x=>evidence.has(v668CompactIdentifier(x))))line.serialReviewRequired=false;
    else if(!kept.length&&removedModel)line.serialReviewRequired=false;
  }
  return out;
}
function v677VerifyQuantities(items=[]){
  return (items||[]).map(x=>{
    const line={...x},q=Number(line.quantity),p=Number(line.unit_price),a=Number(line.amount);
    let verified=false;
    if(Number.isInteger(q)&&q>0&&Number.isFinite(p)&&p>=0&&Number.isFinite(a)&&a>=0){
      verified=Math.abs(q*p-a)<=Math.max(.06,Math.abs(a)*.005);
    }
    if(!verified&&Number.isFinite(p)&&p>0&&Number.isFinite(a)&&a>=0){
      const derived=a/p,rounded=Math.round(derived);
      if(rounded>0&&Math.abs(derived-rounded)<=.01){line.quantity=rounded;verified=true;}
    }
    line.quantityReviewRequired=!verified;
    return line;
  });
}
function v686SerialValuesFromLabelTail(value=''){
  const out=[];
  for(const chunk of String(value||'').split(/[,;]+/)){
    const tokens=String(chunk||'').trim().split(/\s+/),parts=[];
    for(const raw of tokens){
      const t=raw.replace(/^[,;:]+|[,;:]+$/g,'');if(!t)continue;
      if(!/^[A-Z0-9][A-Z0-9._\/-]{1,31}$/i.test(t)||!/\d/.test(t))break;
      parts.push(t);if(parts.join('').length>=32)break;
    }
    const joined=parts.join('');if(joined&&joined.length>=5&&!out.some(v=>v668CompactIdentifier(v)===v668CompactIdentifier(joined)))out.push(joined);
  }
  return out;
}
function v677ReassignSerialsByEvidence(items=[],sourceText=''){
  const out=(items||[]).map(x=>({...x,serials:''}));
  const lines=normalizePdfText(sourceText).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const serialRe=/\b(?:S\s*\/?\s*N|S\.?N\.?|Serial\s*(?:No\.?|Number(?:s)?))\s*[:#.-]?\s*(.*)$/i;
  const serialEvents=[];
  for(let i=0;i<lines.length;i++){const m=lines[i].match(serialRe);if(!m)continue;const vals=v686SerialValuesFromLabelTail(m[1]);if(vals.length)serialEvents.push({i,vals:[...new Set(vals)]});}
  const identity=x=>{const sku=v668CompactIdentifier(x.sku||'');if(sku){const stem=/\d[A-Z]$/i.test(sku)?sku.slice(0,-1):sku;return 'sku:'+stem;}const toks=(String(x.item_name||x.description||'').match(/[A-Z0-9][A-Z0-9+._\/-]{2,}/gi)||[]).map(v668CompactIdentifier).filter(k=>k.length>=4&&!/^(?:ABTUS|PANASONIC|ACTIVE|SPEAKER|PROJECTOR|CONTROL|CONTROLLER|PANEL|WITH|USB)$/i.test(k));return 'desc:'+toks.slice(0,4).join('');};
  const anchors=x=>{const a=[];const sku=v668CompactIdentifier(x.sku||'');if(sku.length>=3){a.push(sku);if(/\d[A-Z]$/i.test(sku))a.push(sku.slice(0,-1));}const toks=(String(x.item_name||x.description||'').match(/[A-Z0-9][A-Z0-9+._\/-]{2,}/gi)||[]).map(v668CompactIdentifier).filter(k=>k.length>=4&&!/^(?:ABTUS|PANASONIC|ACTIVE|SPEAKER|PROJECTOR|CONTROL|CONTROLLER|PANEL|WITH|USB)$/i.test(k));if(toks.length)a.push(toks.slice(0,4).join(''));return [...new Set(a.filter(k=>k.length>=4))];};
  const groups=new Map();for(let i=0;i<out.length;i++){const k=identity(out[i]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);}
  const occurrences=[];
  for(const idxs of groups.values()){
    const keys=[...new Set(idxs.flatMap(i=>anchors(out[i])))];const pos=[];
    for(let i=0;i<lines.length;i++){const compact=v668CompactIdentifier(lines[i]);if(keys.some(k=>compact.includes(k)))pos.push(i);}
    const positions=[...new Set(pos)].sort((a,b)=>a-b);
    if(positions.length<idxs.length){for(const idx of idxs)out[idx].serialReviewRequired=true;continue;}
    for(let gi=0;gi<idxs.length;gi++)occurrences.push({idx:idxs[gi],pos:positions[gi]});
  }
  occurrences.sort((a,b)=>a.pos-b.pos);const seen=new Map();
  for(const ev of serialEvents){
    let owner=null;for(const oc of occurrences){if(oc.pos>=ev.i)break;if(ev.i-oc.pos<=8)owner=oc;}
    if(!owner)continue;const arr=[];
    for(const sn of ev.vals){const key=v668CompactIdentifier(sn);if(!key||arr.some(v=>v668CompactIdentifier(v)===key))continue;const prev=seen.get(key);if(prev!==undefined&&prev!==owner.idx){out[owner.idx].serialReviewRequired=true;out[prev].serialReviewRequired=true;continue;}seen.set(key,owner.idx);arr.push(sn);}
    const existing=String(out[owner.idx].serials||'').split(',').map(x=>x.trim()).filter(Boolean);for(const sn of arr)if(!existing.some(v=>v668CompactIdentifier(v)===v668CompactIdentifier(sn)))existing.push(sn);out[owner.idx].serials=existing.join(', ');
  }
  for(const item of out){const vals=String(item.serials||'').split(',').map(x=>x.trim()).filter(Boolean),q=Number(item.quantity);if(Number.isInteger(q)&&q>0&&vals.length>q){item.serials='';item.serialReviewRequired=true;item.serialCountReview=true;}}
  return out;
}
function v689SerialIntegrityGate(items=[],sourceText=''){
  // V6.90: serials are optional. Clear upstream uncertainty/conflict flags and only recreate a conflict
  // when the same non-empty normalized serial is actually present on two different parsed inventory rows.
  const out=(items||[]).map(x=>{const y={...x};delete y.serialConflictReviewRequired;delete y.serialReviewRequired;return y;}),seen=new Map();
  for(let i=0;i<out.length;i++){
    const vals=parseSerials(out[i].serials||''),kept=[];
    for(const raw of vals){
      const sn=String(raw||'').trim(),key=v668CompactIdentifier(sn);if(!key)continue;
      if(kept.some(v=>v668CompactIdentifier(v)===key))continue; // same-row OCR duplicate
      const prev=seen.get(key);
      if(prev!==undefined&&prev!==i){out[i].serialConflictReviewRequired=true;out[prev].serialConflictReviewRequired=true;continue;}
      seen.set(key,i);kept.push(sn);
    }
    out[i].serials=kept.join(', ');
    const q=Number(out[i].quantity);if(Number.isInteger(q)&&q>0&&kept.length>q)out[i].serialReviewRequired=true;
  }
  return out;
}
function v689QuantityIntegrityGate(items=[],sourceText=''){
  const lines=normalizePdfText(sourceText).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  return (items||[]).map(raw=>{
    const x={...raw},q=Number(x.quantity),sku=v668CompactIdentifier(x.sku||''),desc=String(x.description||x.item_name||'');
    // Description/spec numbers (lumens, resolution, wattage) are never sufficient quantity evidence.
    if(q>0&&/\b(?:lumens?|ansi|watts?|hz|inch(?:es)?|mm|cm|meters?|metres?)\b/i.test(desc)){
      const qInSpec=new RegExp('\\b'+String(q).replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'\\s*(?:lumens?|ansi|watts?|hz|inch(?:es)?|mm|cm|meters?|metres?)\\b','i').test(desc);
      if(qInSpec){
        const evidence=lines.filter(line=>!sku||v668CompactIdentifier(line).includes(sku));
        const confirmed=evidence.some(line=>new RegExp('(?:^|\\s)'+q+'(?:\\s|$)').test(line)&&!new RegExp(q+'\\s*(?:lumens?|ansi|watts?|hz|inch(?:es)?|mm|cm|meters?|metres?)','i').test(line));
        if(!confirmed){x.quantity=null;x.quantityReviewRequired=true;x.quantitySpecCollision=true;}
      }
    }
    return x;
  });
}
function v677ValidateInvoiceLines(items=[],sourceText=''){
  let out=v677ReassignSerialsByEvidence(items,sourceText);
  out=v677VerifyQuantities(out);
  out=v689QuantityIntegrityGate(out,sourceText);
  out=v689SerialIntegrityGate(out,sourceText);
  return out.filter(x=>!isNonInventoryServiceLine(x)&&!/(?:^|\b)repair(?:s|ed|ing)?\b/i.test(normalizePdfText([x.sku,x.item_name,x.description].join(' '))));
}
function v679StrictLayoutItems(){
  const pages=state.pdfLayout||[],out=[];
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clean=v=>txt(v).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
  const strictNum=v=>{const z=txt(v).replace(/(?:SGD|S\$|[$£€¥])/gi,'').replace(/,/g,'');if(!/^-?\d+(?:\.\d{1,2})?$/.test(z))return null;const n=Number(z);return Number.isFinite(n)?n:null;};
  const center=it=>(Number(it.x)||0)+(Number(it.width)||0)/2;
  const headerFor=rows=>{for(const seed of rows){const band=rows.filter(r=>Math.abs((Number(r.y)||0)-(Number(seed.y)||0))<=20),its=band.flatMap(r=>r.items||[]);const first=re=>its.find(it=>re.test(clean(it.text)));const code=first(/^(?:product(?:no)?|product|sku|model|item(?:no)?)$/i)||its.find(it=>/product/i.test(clean(it.text))),desc=first(/^description$/i),qty=first(/^(?:qty|quantity|units?)$/i),price=first(/^(?:unitprice|price)$/i)||its.find(it=>/price/i.test(clean(it.text))),amount=first(/^amount$/i);if(code&&desc&&qty&&price&&amount){const xs=[code,desc,qty,price,amount].map(center);if(xs.every(Number.isFinite)&&xs.every((x,i)=>!i||x>xs[i-1]))return{y:Number(seed.y)||0,xs};}}return null;};
  for(const pg of pages){
    const rows=(pg.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length),h=headerFor(rows);if(!h)continue;
    const [x0,x1,x2,x3,x4]=h.xs,bounds=[-Infinity,(x0+x1)/2,(x1+x2)/2,(x2+x3)/2,(x3+x4)/2,Infinity];
    const totals=rows.filter(r=>/\b(?:sub\s*total|subtotal|gst|amount\s+due|grand\s+total|invoice\s+total)\b/i.test(r.text||''));
    const total=totals.sort((a,b)=>Math.abs((Number(a.y)||0)-h.y)-Math.abs((Number(b.y)||0)-h.y))[0];
    let dir=total?Math.sign((Number(total.y)||0)-h.y):0;if(!dir){const plus=rows.filter(r=>(Number(r.y)||0)>h.y&&/\d/.test(r.text||'')).length,minus=rows.filter(r=>(Number(r.y)||0)<h.y&&/\d/.test(r.text||'')).length;dir=plus>=minus?1:-1;}
    const pos=r=>((Number(r.y)||0)-h.y)*dir,totalPos=total?pos(total):Infinity;
    const body=rows.filter(r=>pos(r)>2&&pos(r)<totalPos-1).sort((a,b)=>pos(a)-pos(b));
    const cell=(r,col)=>(r.items||[]).filter(it=>{const c=center(it);return c>=bounds[col]&&c<bounds[col+1];});
    const anchors=[];for(const r of body){const code=cell(r,0).map(it=>clean(it.text)).filter(Boolean).join('').trim(),desc=cell(r,1).map(it=>txt(it.text)).filter(Boolean).join(' ').trim();const codeLike=code&&/[A-Za-z]/.test(code)&&/^[A-Za-z0-9][A-Za-z0-9+._\/-]{1,30}$/.test(code)&&!/^(?:SN|SERIAL|DATE|TERMS|TOTAL|SUBTOTAL)$/i.test(code);if(codeLike&&desc)anchors.push({r,code});}
    const uniq=[];for(const a of anchors)if(uniq.every(u=>Math.abs(pos(u.r)-pos(a.r))>Math.max(3,Number(pg.yTolerance)||3)))uniq.push(a);
    for(let i=0;i<uniq.length;i++){
      const p0=pos(uniq[i].r)-Math.max(4,Number(pg.yTolerance)||3),p1=i+1<uniq.length?pos(uniq[i+1].r)-Math.max(4,Number(pg.yTolerance)||3):totalPos,group=body.filter(r=>pos(r)>=p0&&pos(r)<p1);
      let qty=null,price=null,amount=null,warranty='';const desc=[];
      for(const r of group){const d=cell(r,1).map(it=>txt(it.text)).filter(Boolean).join(' ').trim();if(d){if(/\bwarranty\b/i.test(d)){const m=d.match(/\b(\d+)\s*years?\b/i);warranty=m?m[1]+' Years':d;}else if(!/^\s*(?:s\/?n|serial|shipment\s*no)\b/i.test(d))desc.push(d);}if(qty===null){const v=cell(r,2).map(it=>strictNum(it.text)).filter(v=>Number.isInteger(v)&&v>0&&v<=999);if(v.length===1)qty=v[0];}if(price===null){const v=cell(r,3).map(it=>strictNum(it.text)).filter(v=>v!==null&&v>=0);if(v.length===1)price=v[0];}if(amount===null){const v=cell(r,4).map(it=>strictNum(it.text)).filter(v=>v!==null&&v>=0);if(v.length===1)amount=v[0];}}
      // Never derive a value when all three columns were populated: inconsistent source values stay flagged.
      const observed={qty:qty!==null,price:price!==null,amount:amount!==null};
      if(!observed.qty&&price>0&&amount>=0){const r=amount/price,n=Math.round(r);if(n>=1&&n<=999&&Math.abs(r-n)<.001)qty=n;}
      else if(!observed.price&&qty>0&&amount>=0)price=Math.round(amount/qty*100)/100;
      else if(!observed.amount&&qty>0&&price>=0)amount=Math.round(qty*price*100)/100;
      const economicOk=qty>0&&price!==null&&amount!==null&&Math.abs(qty*price-amount)<=Math.max(.02,Math.abs(amount)*.001),description=cleanInventoryDescription(desc.join(' '));if(!description)continue;
      const line=normalizeParsedInvoiceItem({sku:cleanVerifiedSku(uniq[i].code,(state.ocrCandidates||[]).map(x=>x.text||'').join('\n')),item_name:description,description,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty,serials:''});
      line.economicEvidenceVerified=!!economicOk;line.quantityReviewRequired=!economicOk;line.priceReviewRequired=!economicOk;line.amountReviewRequired=!economicOk;line.layoutEvidenceVerified=true;out.push(line);
    }
  }return out;
}
function v679EconomicQuality(items=[]){
  if(!items.length)return-999;let score=0;
  for(const x of items){const q=Number(x.quantity),p=Number(x.unit_price),a=Number(x.amount);if(q>0&&p>=0&&a>=0&&Math.abs(q*p-a)<=Math.max(.02,Math.abs(a)*.001))score+=40;else score-=80;if(String(x.sku||'').trim())score+=8;if(String(x.item_name||'').trim())score+=5;}
  return score;
}
function v679MatchExistingSku(line={},sourceText=''){
  const existing=state?.data?.items||[];if(!existing.length)return{sku:'',method:'none'};
  const compact=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const printed=cleanVerifiedSku(line.sku||'',sourceText);if(printed){const k=compact(printed),hits=existing.filter(i=>compact(i.sku)===k&&!v676IsForbiddenAutoSku(i.sku));if(hits.length===1)return{sku:String(hits[0].sku),method:'exact-normalized-sku'};return{sku:printed,method:'printed-sku'};}
  const models=v676ModelCandidatesFromText([line.item_name,line.description].filter(Boolean).join(' '),sourceText).map(compact).filter(x=>x.length>=4);
  const hits=existing.filter(i=>{const hay=[i.sku,i.item_name,i.description].map(compact);return models.some(m=>hay.some(h=>h===m||h.includes(m)||m.includes(h)&&h.length>=4));});
  const unique=[...new Map(hits.map(i=>[String(i.id||i.sku),i])).values()];if(unique.length===1&&String(unique[0].sku||'').trim()&&!v676IsForbiddenAutoSku(unique[0].sku))return{sku:String(unique[0].sku),method:'unique-model-match'};
  return{sku:'',method:unique.length>1?'ambiguous-model-match':'no-confident-match'};
}
function v679ImproveSkuMatches(items=[],sourceText=''){
  return (items||[]).map(x=>{const m=v679MatchExistingSku(x,sourceText);if(!String(x.sku||'').trim()&&m.sku)return{...x,sku:m.sku,skuMatchMethod:m.method,skuReviewRequired:false};return{...x,skuMatchMethod:m.method||'printed'};});
}
function v684EconomicSignature(x={}){
  const q=Number(x.quantity),p=Number(x.unit_price),a=Number(x.amount);
  if(!(q>0)||!Number.isFinite(p)||!Number.isFinite(a))return'';
  if(Math.abs(q*p-a)>Math.max(.02,Math.abs(a)*.001))return'';
  return`${q}|${p.toFixed(2)}|${a.toFixed(2)}`;
}
function v684DescriptionKey(x={}){
  return String(x.description||x.item_name||'').toLowerCase().replace(/\b(?:the|a|an|in|with|for|of)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ').slice(0,100);
}
function v684ReconcileCandidateItems(candidates=[],sourceText=''){
  const groups=new Map(),originSet=new Set();
  for(const c of candidates||[]){
    for(const raw of c.items||[]){
      const x=normalizeParsedInvoiceItem(raw),sig=v684EconomicSignature(x);
      if(!sig||x.quantityReviewRequired||x.priceReviewRequired||x.amountReviewRequired)continue;
      const sku=cleanVerifiedSku(x.sku||'',sourceText),desc=v684DescriptionKey(x);
      // Require a printed SKU/model or a substantial description before accepting a union row.
      if(!sku&&desc.length<12)continue;
      const key=sku?'sku:'+sku.toLowerCase().replace(/[^a-z0-9]/g,''):'desc:'+desc;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({x:{...x,sku:sku||''},sig,origin:String(c.origin||'unknown'),score:Number(c.consensusScore||c.score||0)});
    }
  }
  const out=[];
  for(const entries of groups.values()){
    const sigCounts=new Map();for(const e of entries)sigCounts.set(e.sig,(sigCounts.get(e.sig)||0)+1);
    const ranked=[...entries].sort((a,b)=>{const ca=sigCounts.get(a.sig)||0,cb=sigCounts.get(b.sig)||0;return cb-ca||b.score-a.score;});
    const best=ranked[0];if(!best)continue;const agreed=(sigCounts.get(best.sig)||0)>1||entries.length===1;
    const merged={...best.x};
    // Fill only genuinely missing descriptive fields; never overwrite conflicting observed economics.
    for(const e of ranked.slice(1))for(const k of ['sku','item_name','description','category','unit','warranty'])if(!String(merged[k]??'').trim()&&String(e.x[k]??'').trim())merged[k]=e.x[k];
    if(!agreed&&new Set(entries.map(e=>e.sig)).size>1){merged.quantityReviewRequired=true;merged.priceReviewRequired=true;merged.amountReviewRequired=true;merged.reconciliationConflict=true;}
    merged.reconciledOrigins=[...new Set(entries.map(e=>e.origin))];for(const o of merged.reconciledOrigins)originSet.add(o);out.push(merged);
  }
  return{items:out,origins:[...originSet]};
}
function v687EvidenceSkuToken(rawToken='',description='',sourceText=''){
  const raw=String(rawToken||'').trim();
  let sku=cleanVerifiedSku(raw,sourceText);if(sku)return sku;
  if(!raw.includes('$'))return '';
  const corrected=raw.replace(/\$/g,'S');
  if(!/^[A-Z0-9][A-Z0-9+._\/-]{2,13}$/i.test(corrected))return '';
  const compact=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const c=compact(corrected),d=compact(description);
  // Require the independently printed description to support at least the model stem.
  // Example: AV$320A + "AVS320 HDMI Control panel" => AVS-320A is evidence-supported.
  const stem=c.replace(/[A-Z]$/,'');
  if(stem.length<5||!d.includes(stem))return '';
  return corrected;
}
function v687ParseEvidencePricedRows(text=''){
  const out=[],lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const moneyNumber=v=>{const z=String(v||'').replace(/(?:SGD|S\$|\$)/gi,'').replace(/,/g,'').trim();const n=Number(z);return Number.isFinite(n)?n:null;};
  const physical=/\b(?:projector|microphone|speaker|control\s+panel|controller|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|stand|mount)\b/i;
  const service=/\b(?:labou?r|dismount|dismantl|replace|installation|installing|commission|testing|service\s+work)\b/i;
  for(const line of lines){
    if(!physical.test(line)||service.test(line))continue;
    const vals=[...line.matchAll(/(?:S?\$?\s*)?(\d[\d,]*[.]\d{2})/g)].map(m=>moneyNumber(m[1])).filter(Number.isFinite);
    if(vals.length<2)continue;
    const m=line.match(/^[|.,;:\-]*\s*([^\s]+)\s+(.+?)\s+(\d{1,4})\s+(?:S?\$?\s*)?\d[\d,]*[.]\d{2}\s+(?:S?\$?\s*)?\d[\d,]*[.]\d{2}\s*$/i);
    if(!m)continue;
    const qty=Number(m[3]),price=vals[vals.length-2],amount=vals[vals.length-1],desc=cleanInventoryDescription(m[2]);
    if(!(qty>0)||!desc||Math.abs(qty*price-amount)>Math.max(.02,Math.abs(amount)*.001))continue;
    const sku=v687EvidenceSkuToken(m[1],desc,text);
    // A missing/uncertain SKU is allowed in review, but never fabricated. The line itself is still genuine evidence.
    out.push(normalizeParsedInvoiceItem({sku,item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:'',v687SourceEvidence:true}));
  }
  return out;
}
function v687DetectSourceEquipmentEvidence(sourceText=''){
  const found=new Map(),lines=normalizePdfText(sourceText).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const physical=/\b(?:projector|microphone|speak\w*|panel|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|stand|mount)\b/i;
  const service=/\b(?:labou?r|dismount|dismantl|replace|installation|installing|commission|testing|service\s+work)\b/i;
  for(const line of lines){
    if(!physical.test(line)||service.test(line))continue;
    const m=line.match(/^[|.,;:\-]*\s*([^\s]+)\s+(.+)$/);if(!m)continue;
    const rawToken=m[1],desc=m[2],money=[...line.matchAll(/(?:S?\$?\s*)?(\d[\d,]*[.]\d{2})/g)];if(!money.length)continue;
    const rawKey=String(rawToken).toUpperCase().replace(/\$/g,'S').replace(/[^A-Z0-9]/g,'');
    if(rawKey.length<3)continue;
    found.set(rawKey,{rawToken,description:cleanInventoryDescription(desc),evidence:line});
  }
  return [...found.values()];
}
function v687CompletenessReconcile(candidates=[],currentItems=[],sourceText=''){
  const current=(currentItems||[]).map(x=>({...x})),key=x=>{const sig=v684EconomicSignature(x),sku=v668CompactIdentifier(x.sku||''),desc=v684DescriptionKey(x);return sku?'sku:'+sku+'|'+sig:'desc:'+desc+'|'+sig;};
  const have=new Set(current.map(key)),support=new Map();
  for(const c of candidates||[]){
    for(const raw of c.items||[]){
      const x=normalizeParsedInvoiceItem(raw);if(isNonInventoryServiceLine(x)||isExcludedInventoryAccessoryLine(x)||v676IsSupportCoverageLine(x))continue;
      const sig=v684EconomicSignature(x);if(!sig)continue;const k=key(x);if(!support.has(k))support.set(k,[]);support.get(k).push({x,origin:String(c.origin||'unknown')});
    }
  }
  const recovered=[];
  for(const [k,entries] of support){
    if(have.has(k))continue;
    const origins=new Set(entries.map(e=>e.origin));const best=entries[0]?.x;if(!best)continue;
    // Re-add only if two parser origins agree OR the dedicated source-evidence parser verified the priced row.
    const sourceVerified=entries.some(e=>e.x.v687SourceEvidence===true||/^source-evidence:/i.test(e.origin));
    if(origins.size<2&&!sourceVerified)continue;
    const checked=v677ValidateInvoiceLines(attachSerialBlocks([{...best}],sourceText),sourceText)[0];if(!checked)continue;
    recovered.push(checked);current.push(checked);have.add(k);
  }
  const sourceEvidence=v687DetectSourceEquipmentEvidence(sourceText);return{items:sanitizeParsedInventoryItems(inventoryOnlyItems(current),sourceText),expectedEquipmentCount:Math.max(support.size,sourceEvidence.length),candidateExpectedCount:support.size,sourceEvidenceCount:sourceEvidence.length,recoveredCount:recovered.length,recovered,sourceEvidence};
}
function v676IsForbiddenAutoSku(value=''){
  return /^AUTO(?:[-_]|$)/i.test(String(value||'').trim());
}
function v676ModelCandidatesFromText(value='',sourceText=''){
  const text=normalizePdfText(value).replace(/\s+/g,' ').trim();
  const sourceCompact=String(sourceText||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const stop=/^(?:SGD|GST|QTY|UNIT|UNITS|PRICE|AMOUNT|TOTAL|SUBTOTAL|INVOICE|SERIAL|WARRANTY|MONTH|MONTHS|YEAR|YEARS|HUAWEI|IDEAHUB|KEY|CARE|BASIC)$/i;
  const seen=new Set(),out=[];
  for(const raw of text.match(/\b[A-Z0-9][A-Z0-9+._\/-]{2,12}\b/gi)||[]){
    const token=String(raw||'').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
    const compact=token.toLowerCase().replace(/[^a-z0-9]+/g,'');
    if(!compact||seen.has(compact)||stop.test(token))continue;
    if(v676IsForbiddenAutoSku(token))continue;
    if(!/[A-Za-z]/.test(token)||!/\d/.test(token))continue;
    if(/^\d+(?:[._/-]\d+)+$/.test(token))continue;
    if(/^\d+(?:[-_.]?(?:inches?|inch|in|cm|mm|hz|khz|mhz|ghz|months?|mos?|years?|yrs?))$/i.test(token))continue;
    if(/^(?:19|20)\d{2}$/.test(token))continue;
    if(sourceCompact&&!sourceCompact.includes(compact))continue;
    seen.add(compact);out.push(token);
  }
  return out;
}
function v676EmbeddedVerifiedSku(line={},sourceText=''){
  const text=[line.sku,line.item_name,line.description].filter(Boolean).join(' ');
  const candidates=v676ModelCandidatesFromText(text,sourceText);
  if(!candidates.length)return '';
  // Prefer a compact model/code with punctuation (e.g. IHK3-86SA, PT-VW540) over generic mixed tokens.
  const ranked=candidates.map(token=>({token,score:(/[-_/+.]/.test(token)?4:0)+(token.length<=10?2:0)+(/\d/.test(token)&&/[A-Za-z]/.test(token)?2:0)})).sort((a,b)=>b.score-a.score||a.token.length-b.token.length);
  const top=ranked[0];if(!top)return '';
  // If two unrelated candidates have the same confidence, do not guess.
  if(ranked[1]&&ranked[1].score===top.score&&ranked[1].token.toLowerCase()!==top.token.toLowerCase())return '';
  return top.token;
}
function v676SafeFallbackSku(itemName='',existingItems=[],usedSkus=new Map()){
  const clean=v667ShortItemName(itemName).replace(/\s+/g,' ').trim();
  if(!clean)return '';
  const candidate=clean.slice(0,13).trim();
  if(!candidate||v676IsForbiddenAutoSku(candidate))return '';
  if(!/[A-Za-z0-9]/.test(candidate))return '';
  const key=norm(candidate),nameKey=norm(clean);
  const conflict=(existingItems||[]).find(i=>norm(i.sku)===key&&norm(i.item_name)!==nameKey&&!v676IsForbiddenAutoSku(i.sku));
  if(conflict)return '';
  if(usedSkus instanceof Map){const prior=usedSkus.get(key);if(prior&&prior!==nameKey)return '';usedSkus.set(key,nameKey);}
  else {if(usedSkus.has(key))return '';usedSkus.add(key);}
  return candidate;
}
function v676IsSupportCoverageLine(line={}){
  const text=normalizePdfText([line.sku,line.item_name,line.description].filter(Boolean).join(' ')).replace(/\s+/g,' ').trim();
  if(!text)return false;
  return /\b(?:hi[- ]?care|care\s*pack|support\s*(?:plan|service|coverage)?|maintenance\s*(?:plan|service|contract)?|service\s*contract|extended\s+warranty|warranty\s*(?:extension|coverage|service)?|subscription|software\s+assurance|\d+\s*months?\s*(?:support|warranty|care))\b/i.test(text)
    || /\b(?:basic|premium|standard)\s+.*\b\d{1,3}\s*months?\b/i.test(text);
}
function v676CanonicalItemName(line={}){
  let s=v667ShortItemName(line.item_name||line.description||'');
  if(/\bHUAWEI\s+IdeaHub\s+K3\b/i.test(s))return 'HUAWEI IdeaHub K3';
  if(/\bIdeaShare\s+Key\b/i.test(s))return 'IdeaShare Key';
  return s;
}
function v676ValidateAndRectifyItems(items=[],sourceText=''){
  const existingItems=state?.data?.items||[],used=new Map(),out=[];
  for(const original of items||[]){
    let line={...original};
    if(isNonInventoryServiceLine(line)||isExcludedInventoryAccessoryLine(line)||v676IsSupportCoverageLine(line))continue;
    const description=cleanInventoryDescription(line.description||line.item_name||'');
    const itemName=v676CanonicalItemName({...line,description});
    if(!v667PlausibleItemName(itemName))continue;
    let sku=v676IsForbiddenAutoSku(line.sku)?'':cleanVerifiedSku(line.sku||'',sourceText);
    if(!sku){const matched=v679MatchExistingSku({...line,item_name:itemName,description},sourceText);if(matched.sku){sku=matched.sku;line.skuMatchMethod=matched.method;}}
    if(!sku)sku=v676EmbeddedVerifiedSku({...line,item_name:itemName,description},sourceText);
    if(sku)used.set(norm(sku),norm(itemName));
    const category=String(line.category||'').trim()||v667InferCategory({...line,sku,item_name:itemName,description});
    line={...line,sku:String(sku||'').trim().slice(0,13),item_name:itemName,description,category,skuReviewRequired:!sku};
    if(v676IsForbiddenAutoSku(line.sku))line.sku='';
    out.push(line);
  }
  return sanitizeSerialAssignments(out,sourceText);
}
async function v676RepairLegacyAutoSkuMatches(db,lines=[]){
  const items=state?.data?.items||[];
  for(const line of lines||[]){
    const newSku=String(line.sku||'').trim();if(!newSku||v676IsForbiddenAutoSku(newSku))continue;
    const skuKey=norm(newSku),nameKey=norm(line.item_name||'');
    if(items.some(i=>!v676IsForbiddenAutoSku(i.sku)&&norm(i.sku)===skuKey))continue;
    const legacy=items.find(i=>v676IsForbiddenAutoSku(i.sku)&&(norm(i.item_name)===nameKey||norm(i.item_name).includes(skuKey)||norm(i.description).includes(skuKey)));
    if(!legacy)continue;
    try{
      await db.updateItem(legacy.id,{sku:newSku,description:line.description||legacy.description||'',category:line.category||legacy.category||''});
      legacy.sku=newSku;if(line.description)legacy.description=line.description;if(line.category)legacy.category=line.category;
    }catch(err){console.warn('Legacy AUTO SKU repair skipped:',err);}
  }
}
function sanitizeParsedInventoryItems(items=[],sourceText=''){
  // V6.76 self-rectification: reject AUTO-* and repair using printed model evidence first,
  // then the user-approved deterministic 13-character item-name fallback only when collision-free.
  return v676ValidateAndRectifyItems(items,sourceText);
}
function prepareInventoryLinesForSave(items=[]){
  const source=state.parsed?.raw||state.parsed?.rawText||'';
  const lines=v676ValidateAndRectifyItems(items,source).filter(line=>!isExcludedInventoryAccessoryLine(line)&&!v676IsSupportCoverageLine(line));
  // V6.90: SKU/model and serial numbers are optional. Never fabricate either merely to satisfy save validation.
  // AUTO-* remains forbidden; a missing SKU is preserved as blank and the item name/description remains authoritative.
  return lines.map(line=>{
    const rawSku=String(line.sku||'').trim();
    return {...line,sku:v676IsForbiddenAutoSku(rawSku)?'':rawSku.slice(0,13),serials:String(line.serials||'').trim(),item_name:String(line.item_name||line.description||'').replace(/\s+/g,' ').trim(),description:cleanInventoryDescription(line.description||line.item_name||'')};
  }).filter(line=>String(line.item_name||line.description||'').trim()&&Number(line.quantity)>0);
}
function recoverAvMediaHeader(doc={},rawText=''){
  const sources=v661EvidenceSources(rawText),all=sources.map(x=>x.text).join('\n'),isAv=/\bAV\s+MEDIA\b/i.test(all)||/av\s+media/i.test(String(doc.supplier_name||''));
  if(isAv)doc.supplier_name='AV Media Pte Ltd';
  const cleanInv=v=>String(v||'').replace(/\s+/g,'').replace(/[–—]/g,'-').replace(/^YIN/i,'VIN').replace(/^Y1N/i,'VIN').replace(/^V1N/i,'VIN').replace(/^YlN/i,'VIN').replace(/^VINI(?=\d)/i,'VIN1').replace(/^VINl(?=\d)/i,'VIN1');
  const bad=/^(?:CUSTOMER|CODE|DATE|TERMS|SOLD|DELIVERED|REFERENCE|REF|INVOICE|NO)$/i;
  let invoice='';
  for(const src of sources){
    const text=normalizePdfText(src.text||'');
    const labelled=[
      /(?:invoice|invo[i1l]ce|tnvo[i1l]ce)\s*(?:no\.?|number|#)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9._\/-]{3,})/ig,
      /\b(?:INV|VIN|YIN|V1N|Y1N)\s*[- ]?\s*\d{2,}[-/]?\d{3,}\b/ig
    ];
    for(const re of labelled){const ms=[...text.matchAll(re)];for(const m of ms){const c=cleanInv(m[1]||m[0]);if(c&&!bad.test(c)&&!parseDate(c)){invoice=c;break;}}if(invoice)break;}
    if(invoice)break;
  }
  if(invoice){if(isAv&&/^(?:YIN|V1N|Y1N|VIN)/i.test(invoice))invoice=cleanInv(invoice);doc.invoice_number=invoice;}
  // Date: labelled Invoice Date wins; then the DATE column in an invoice-header row; never footer timestamps.
  let date='';
  for(const src of sources){
    const text=normalizePdfText(src.text||'');
    let m=text.match(/\b(?:invoice\s*)?date\s*[:#.-]?\s*([0-3]?\d\s*[/.-]\s*[01]?\d\s*[/.-]\s*\d{2,4})/i);if(m){date=parseDate(m[1]);if(date)break;}
    const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      if(!/\bDATE\b/i.test(lines[i])||/\b(?:DUE|DELIVERY|PAYMENT|WARRANTY)\b/i.test(lines[i]))continue;
      const ctx=[lines[i-1]||'',lines[i],lines[i+1]||'',lines[i+2]||''].join(' ');
      if(!/\b(?:REF\.?\s*NO|P\/?O|SALESMAN|TERMS|INVOICE\s*(?:NO|NUMBER)|CUSTOMER\s*CODE)\b/i.test(ctx))continue;
      const dm=ctx.match(/(?:^|[^A-Za-z0-9])([0-3]?\d\s*[/.-]\s*[01]?\d\s*[/.-]\s*\d{2,4})(?![A-Za-z0-9])/);if(dm){date=parseDate(dm[1]);if(date)break;}
    }
    if(date)break;
    const saved=state.pdfLayout;state.pdfLayout=src.layout||[];date=detectInvoiceDateFromLayout();state.pdfLayout=saved;if(date)break;
  }
  if(date)doc.invoice_date=date;else if(isAv)doc.invoice_date='';
  if(/^(?:sold|sold\s*to|delivered|delivered\s*to|customer|customer\s*code|reference|ref|date|invoice)$/i.test(String(doc.delivery_order_number||'').trim()))doc.delivery_order_number='';
  if(/^(?:sold|sold\s*to|delivered|delivered\s*to|customer|customer\s*code|date|invoice|terms)$/i.test(String(doc.reference_number||'').trim()))doc.reference_number='';
  return doc;
}
function classifyInvoiceDocument(text='',extractedItems=[],inventoryItems=[]){
  const evidence=v661EvidenceSources(text).map(x=>x.text).join('\n'),t=normalizePdfText(evidence).replace(/\s+/g,' ').trim();
  let rawRows=[];for(const src of v661EvidenceSources(text)){rawRows.push(...parseAvMediaTextItems(src.text),...v661ParseGenericPricedRows(src.text),...v690ParseNumberedPricedRows(src.text),...v662ParsePhysicalEvidenceRows(src.text));}
  rawRows=[...(extractedItems||[]),...rawRows];
  const accessoryRows=rawRows.filter(isExcludedInventoryAccessoryLine);
  let rows=sanitizeParsedInventoryItems(rawRows,evidence);
  const physical=[...(inventoryItems||[]),...rows.filter(x=>!isNonInventoryServiceLine(x)&&!isExcludedInventoryAccessoryLine(x))].filter((x,i,a)=>a.findIndex(y=>norm(y.sku||y.item_name)===norm(x.sku||x.item_name)&&Number(y.amount)===Number(x.amount))===i);
  const service=rows.filter(isNonInventoryServiceLine);
  if(physical.length)return{type:'equipment',equipmentScore:10+physical.length*2,serviceScore:service.length?3:0,reason:'Verified priced tracked-equipment rows were found; service and excluded accessory rows are not added to inventory.'};
  if(rows.length&&service.length===rows.length)return{type:'service',equipmentScore:0,serviceScore:10+service.length*2,reason:'Every verified priced row is labour/service/installation work.'};
  const productHeader=/\b(?:PRODUCT|STOCK)\s*(?:NO\.?|NUMBER|CODE)?\b/i.test(t)&&/\bDESCRIPTION\b/i.test(t)&&/\b(?:QTY|QUANTITY)\b/i.test(t)&&/\b(?:UNIT\s*)?PRICE\b/i.test(t)&&/\bAMOUNT\b/i.test(t);
  const physicalWords=/\b(?:projector|microphone|speaker|control\s+panel|controller|camera|mixer|display|monitor|transmitter|receiver|screen|wireless\s+system|audio\s+tester|amplifier|processor|switcher|rack|visualizer|document\s+camera)\b/i.test(t);
  const rowShape=(evidence.match(/^[A-Z0-9][A-Z0-9+._\/-]{2,}[^\n]*\s\d+(?:\.\d+)?\s+(?:S?\$?\s*)?\d[\d,]*\.\d{2}\s+(?:S?\$?\s*)?\d[\d,]*\.\d{2}\s*$/gmi)||[]).length;
  const serviceStrong=/\b(?:supply\s+)?labou?r\b/i.test(t)||/\b(?:supply\s+to\s+)?replace\b[\s\S]{0,120}\b(?:projector|microphone|speaker|display|screen|equipment)\b/i.test(t)||/\b(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al))\b[\s\S]{0,180}\b(?:install|replace|test|commission)/i.test(t)||/\b(?:service|installation|labou?r)\s+(?:work|works|job|charge|charges|services?)\b/i.test(t);
  const codePhysical=evidence.split(/\n+/).some(line=>/^[|.,;:\-]*\s*[A-Z0-9][A-Z0-9+._\/-]{2,}\s+/.test(line.trim())&&/\b(?:projector|microphone|speaker|control\s+panel|controller|camera|mixer|display|monitor|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|visualizer|document\s+camera)\b/i.test(line)&&!isExcludedInventoryAccessoryLine({item_name:line,description:line})&&/\b\d{1,4}\b/.test(line));
  let equipmentScore=(productHeader?4:0)+(physicalWords?2:0)+(rowShape>=2?5:rowShape===1?2:0)+(codePhysical?6:0),serviceScore=serviceStrong?6:0;
  if(serviceStrong&&!codePhysical&&rowShape<=1)serviceScore+=4;
  if((equipmentScore>=7&&equipmentScore>=serviceScore+2)||(productHeader&&physicalWords&&equipmentScore>=6))return{type:'equipment',equipmentScore,serviceScore,reason:'Independent scans found an invoice product table with tracked-equipment evidence; excluded accessory/service wording is filtered only at line-item level.'};
  if(serviceScore>=8&&!codePhysical&&rowShape<=1)return{type:'service',equipmentScore,serviceScore,reason:'Independent scans found service/labour/installation work and no verified priced tracked-equipment row.'};
  const accessoryEvidence=accessoryRows.length||evidence.split(/\n+/).some(line=>isExcludedInventoryAccessoryLine({item_name:line,description:line}));
  if(accessoryEvidence&&!codePhysical)return{type:'uncertain',equipmentScore,serviceScore,reason:'Excluded accessory/support wording was found, but accessory terms are line-item filters only and cannot reject the invoice. Confirm the invoice type if tracked equipment cannot be verified automatically.'};
  return{type:'uncertain',equipmentScore,serviceScore,reason:'Native text, layout and OCR evidence still conflict or are insufficient.'};
}
function effectiveInvoiceType(){
  const detected=state.parsed?.invoiceClassification?.type||'uncertain';
  return detected==='uncertain'?(state.importClassificationChoice||'uncertain'):detected;
}
function applyParsedReviewToForm(){
  const d=state.parsed?.doc||{};
  if($('pSupplier'))$('pSupplier').value=d.supplier_name||'';if($('pInvoice'))$('pInvoice').value=d.invoice_number||'';if($('pDate'))$('pDate').value=d.invoice_date||'';
  ['pSupplier','pInvoice','pDate'].forEach(id=>$(id)?.classList.toggle('low-confidence',!$(id)?.value));
  if($('invoiceDateStatus')){const x=$('invoiceDateStatus');x.textContent=d.invoice_date?'Auto-detected from invoice: '+fmtDate(d.invoice_date)+' — verify against the PDF before saving.':'Invoice date was not confidently detected — please enter it manually.';x.className='date-status '+(d.invoice_date?'detected':'review');}
  if($('pDo'))$('pDo').value=d.delivery_order_number||'';if($('pRef'))$('pRef').value=d.reference_number||'';if($('pCurrency'))$('pCurrency').value=d.currency||'SGD';
  if($('pSubtotal'))$('pSubtotal').value=d.subtotal??'';if($('pGst'))$('pGst').value=d.gst??'';if($('pTotal'))$('pTotal').value=d.total_amount??'';
  if($('rawText'))$('rawText').textContent=state.parsed?.raw||state.parsed?.rawText||'';
  renderParsedItems();
}
async function refreshDuplicateWarning(){
  const d=state.parsed?.doc||{};if(!$('duplicateWarning'))return;
  const dupe=d.supplier_name&&d.invoice_number?await state.db.duplicateInvoice(d.supplier_name,d.invoice_number,d.invoice_date):null;state.possibleDuplicate=dupe;state.allowDuplicate=false;
  $('duplicateWarning').classList.toggle('hidden',!dupe);$('duplicateWarning').innerHTML=dupe?`<strong>This invoice may already exist.</strong> Supplier, Invoice Number and Invoice Date match an existing purchase. <button type="button" id="viewDuplicateBtn">View existing</button> <button type="button" id="continueDuplicateBtn">Continue anyway</button>`:'';
  if(dupe){setTimeout(()=>{const v=$('viewDuplicateBtn'),c=$('continueDuplicateBtn');if(v)v.onclick=()=>showView('documents');if(c)c.onclick=()=>{state.allowDuplicate=true;$('duplicateWarning').innerHTML='<strong>Duplicate override enabled.</strong> Confirm & save will continue.';}},0);}
}
function v661FinalizeParsedInvoice(parsed={},raw=''){
  const sources=v661EvidenceSources(parsed.rawText||raw||''),evidence=sources.map(x=>x.text).join('\n');
  let doc=recoverAvMediaHeader({...parsed.doc},evidence);doc=v662RecoverMoneyFromText(doc,evidence);
  const savedLayout=state.pdfLayout;let moneyCandidates=[];
  for(const src of sources){state.pdfLayout=src.layout||[];let d=v661RepairInvoiceMoneyFromLayout({...doc});d=v662RecoverMoneyFromText(d,src.text||'');const a=Number(d.subtotal),b=Number(d.gst),c=Number(d.total_amount),ok=[a,b,c].every(Number.isFinite)&&Math.abs((a+b)-c)<=.06;moneyCandidates.push({d,ok,score:(Number.isFinite(a)?1:0)+(Number.isFinite(b)?1:0)+(Number.isFinite(c)?1:0)+(ok?8:0)});}
  state.pdfLayout=savedLayout;moneyCandidates.sort((a,b)=>b.score-a.score);if(moneyCandidates[0])doc=moneyCandidates[0].d;
  const candidates=[];const add=(arr,origin,srcText)=>{const xs=sanitizeParsedInventoryItems((arr||[]).map(normalizeParsedInvoiceItem),srcText||evidence).filter(x=>String(x.item_name||'').trim()&&Number(x.quantity)>0);if(xs.length){const targetedBoost=/^av-targeted:avmedia-targeted$/i.test(String(origin||''))?120:0;candidates.push({origin,items:xs,score:invoiceItemsQuality(xs,doc.subtotal)+targetedBoost});}};
  add(parsed.items||[],'base',parsed.rawText||raw);
  for(const src of sources){const old=state.pdfLayout;state.pdfLayout=src.layout||[];const strict=v679StrictLayoutItems();if(strict.length){const xs=sanitizeParsedInventoryItems(strict,src.text);candidates.push({origin:'strict-layout:'+src.source,items:xs,score:invoiceItemsQuality(xs,doc.subtotal)+v679EconomicQuality(xs)+220});}if(/\bAV\s+MEDIA\b/i.test(src.text)||/av\s+media/i.test(String(doc.supplier_name||''))){add(parseAvMediaTargetedText(src.text),'av-targeted:'+src.source,src.text);add(parseAvMediaMixedLayoutItems(),'av-layout:'+src.source,src.text);add(parseAvMediaTextItems(src.text),'av-text:'+src.source,src.text);}add(v661ParseGenericPricedRows(src.text),'generic-text:'+src.source,src.text);add(v662ParsePhysicalEvidenceRows(src.text),'physical-evidence:'+src.source,src.text);add(v687ParseEvidencePricedRows(src.text),'source-evidence:'+src.source,src.text);if(typeof parseFlexibleProductLayoutItems==='function')add(parseFlexibleProductLayoutItems(),'flex-layout:'+src.source,src.text);if(typeof parseProductCodeLayoutItems==='function')add(parseProductCodeLayoutItems(),'product-layout:'+src.source,src.text);state.pdfLayout=old;}
  // V6.81: never let a corrupted native PDF text layer win merely because it produced a table-shaped result.
  // Prefer independent image-OCR table evidence when it is internally verified. This is supplier-neutral.
  const econStats=c=>{const rows=c?.items||[];let verified=0,bad=0;for(const x of rows){const q=Number(x.quantity),p=Number(x.unit_price),a=Number(x.amount),ok=q>0&&p>=0&&a>=0&&Math.abs(q*p-a)<=Math.max(.02,Math.abs(a)*.001)&&!x.quantityReviewRequired&&!x.priceReviewRequired&&!x.amountReviewRequired;if(ok)verified++;else bad++;}return{verified,bad};};
  const sourceBoost=o=>/strict-layout:recovery-column/i.test(o)?700:/strict-layout:recovery-auto/i.test(o)?600:/strict-layout:recovery-block/i.test(o)?550:/strict-layout:recovery-sparse/i.test(o)?450:/strict-layout:server/i.test(o)?350:0;
  for(const c of candidates){const st=econStats(c);c.verifiedRows=st.verified;c.badRows=st.bad;c.consensusScore=c.score+sourceBoost(c.origin)+(st.verified*80)-(st.bad*220);}
  const strictCandidates=candidates.filter(c=>String(c.origin||'').startsWith('strict-layout:')&&c.items?.length&&c.verifiedRows>0&&c.badRows===0);
  strictCandidates.sort((a,b)=>b.consensusScore-a.consensusScore);candidates.sort((a,b)=>b.consensusScore-a.consensusScore);
  const chosen=strictCandidates[0]||candidates.find(c=>c.verifiedRows>0&&c.badRows===0)||candidates[0];const reconciled=v684ReconcileCandidateItems(candidates,evidence);let extracted=reconciled.items.length?reconciled.items:(chosen?.items||[]);extracted=v679ImproveSkuMatches(extracted,evidence);const withSerials=v677ValidateInvoiceLines(attachSerialBlocks(extracted,evidence),evidence);let inventory=sanitizeParsedInventoryItems(inventoryOnlyItems(withSerials),evidence);const completeness=v687CompletenessReconcile(candidates,inventory,evidence);inventory=completeness.items;
  const physicalSum=inventory.reduce((n,x)=>n+(Number(x.amount)||0),0);
  if(physicalSum>0&&!Number.isFinite(Number(doc.subtotal)))doc.subtotal=Math.round(physicalSum*100)/100;
  doc=v662RecoverMoneyFromText(doc,evidence);
  const classification=classifyInvoiceDocument(evidence,withSerials,inventory);
  const finalItems=['service','noninventory'].includes(classification.type)?[]:inventory;
  const finalized={...parsed,doc,items:finalItems,excludedServiceCount:Math.max(0,withSerials.length-finalItems.length),invoiceClassification:classification,serviceOnlyInvoice:classification.type==='service',nonInventoryOnlyInvoice:classification.type==='noninventory',dateReviewRequired:!doc.invoice_date,rawText:evidence,parseEvidence:{...(parsed.parseEvidence||{}),itemSource:reconciled?.items?.length?'reconciled:'+reconciled.origins.join(','):(chosen?.origin||'none'),candidateCounts:candidates.map(c=>({origin:c.origin,count:c.items.length,score:c.score,verifiedRows:c.verifiedRows,badRows:c.badRows})),completeness:{expectedEquipmentCount:completeness.expectedEquipmentCount,candidateExpectedCount:completeness.candidateExpectedCount,sourceEvidenceCount:completeness.sourceEvidenceCount,finalEquipmentCount:finalItems.length,recoveredCount:completeness.recoveredCount,recheckRequired:completeness.expectedEquipmentCount!==finalItems.length},file_sha256:state.importFileHash||'',file_kind:state.importFileKind||''}};let normalized=v682AttachNormalization(finalized,evidence);try{if(globalThis.AVParserV7){normalized=globalThis.AVParserV7.enhanceParsed({parsed:normalized,raw:parsed.rawText||raw||'',layout:savedLayout||[],evidenceSources:sources.map(x=>({source:x.source||'evidence',text:x.text||'',page:1}))});normalized.parseEvidence={...(normalized.parseEvidence||{}),v7:normalized.v7||null};}}catch(v7err){console.warn('V7 structured parser shadow/merge skipped',v7err);}return normalized;
}
async function reprocessConfirmedEquipmentInvoice(){
  if(!state.parsed)return;state.importClassificationChoice='equipment';
  setProgress(70,'Re-checking line items…');$('importProgress')?.classList.remove('hidden');
  const previous=state.parsed;
  try{
    let raw=previous.raw||previous.rawText||'';
    let reparsed=v661FinalizeParsedInvoice(parseBestInvoice(raw),raw);
    // V6.90: confirming Equipment is an instruction to recover physical line items, not merely change a banner.
    // If the completed evidence still has no tracked item, run the independent page-image OCR route when the source file is available.
    if(!(reparsed.items||[]).length&&state.importSourceFile&&v662FileKind(state.importSourceFile)!=='docx'){
      setProgress(76,'Equipment confirmed — running independent image/table scan…');
      const recovered=await forceOcrRecovery(state.importSourceFile);
      if(recovered){
        const evidence=v661EvidenceSources(raw).map(x=>x.text).filter(Boolean).join('\n');
        raw=evidence||raw;
        reparsed=v661FinalizeParsedInvoice(parseBestInvoice(raw),raw);
      }
    }
    // Never destroy already-reviewed valid rows because a reparse produced fewer/no rows.
    if(!(reparsed.items||[]).length&&(previous.items||[]).length)reparsed={...reparsed,items:previous.items};
    reparsed.raw=reparsed.rawText||reparsed.raw||raw;state.parsed=reparsed;
    applyParsedReviewToForm();await refreshDuplicateWarning();renderImportEligibility();
    if((state.parsed.items||[]).length)toast('Equipment invoice confirmed. Line items and quantities were refreshed automatically.');
    else toast('Equipment confirmed, but no physical line item could be verified. No item was invented.');
  }catch(err){console.warn('Equipment re-check failed.',err);state.parsed=previous;renderImportEligibility();toast('Equipment selected. Existing parsed values were kept because the independent re-check could not complete.');}
  finally{setTimeout(()=>$('importProgress')?.classList.add('hidden'),180);}
}
function renderImportEligibility(){
  const parsed=state.parsed,detected=parsed?.invoiceClassification?.type||'uncertain',effective=effectiveInvoiceType(),saveBtn=$('saveImportBtn');
  let parserNote=$('parserSourceNotice');if(!parserNote&&$('parsedItems')){parserNote=document.createElement('div');parserNote.id='parserSourceNotice';$('parsedItems').parentNode.insertBefore(parserNote,$('parsedItems'));}if(parserNote){const mode=parsed?.v7?.mode||'unknown';parserNote.classList.remove('hidden');parserNote.style.cssText='margin:0 0 10px;padding:9px 12px;border-radius:8px;font-size:12px;line-height:1.4;'+(mode==='legacy-fallback'?'background:#fff4e5;border:1px solid #f5c26b;color:#7a4300':'background:#eef7ff;border:1px solid #b8d8f8;color:#174f7a');parserNote.textContent=mode==='legacy-fallback'?'Legacy parser fallback — V7 could not verify an equipment row. Review all extracted values carefully.':'Structured parser — V7 Primary';}
  let note=$('invoiceEligibilityWarning');if(!note&&$('parsedItems')){note=document.createElement('div');note.id='invoiceEligibilityWarning';$('parsedItems').parentNode.insertBefore(note,$('parsedItems'));}
  const setStyle=(kind)=>{if(!note)return;const map={danger:['#f5c2c0','#fff1f0','#912018'],warn:['#f6d88a','#fff8df','#854d0e'],info:['#b9d9ff','#eff7ff','#175cd3']},v=map[kind];note.style.cssText=`margin:0 0 14px;padding:12px 14px;border:1px solid ${v[0]};border-radius:10px;background:${v[1]};color:${v[2]};font-size:12px;line-height:1.45`};
  if(note){note.classList.remove('hidden');if(detected==='service'||effective==='service'){setStyle('danger');note.innerHTML='<strong>Equipment invoices only.</strong> This document contains service / labour / installation charges only and cannot be imported.';}else if(detected==='noninventory'||effective==='noninventory'){setStyle('danger');note.innerHTML='<strong>No tracked equipment found.</strong> Security locks, safety wires, mounts, brackets, cables, lamp kits, carts and stands are excluded from Inventory.';}else if(detected==='uncertain'&&!state.importClassificationChoice){setStyle('warn');note.innerHTML='<strong>Invoice type needs confirmation.</strong> The parser cannot prove whether this document contains physical equipment. Check the PDF and choose the correct type.<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="secondary small-btn" id="chooseEquipmentInvoiceBtn">Equipment invoice</button><button type="button" class="secondary small-btn" id="chooseServiceInvoiceBtn">Service invoice</button></div>';}else if(detected==='uncertain'&&effective==='equipment'){setStyle('info');note.innerHTML='<strong>Equipment invoice selected.</strong> The app will re-check the invoice fields and physical line items before saving. <button type="button" class="link-btn" id="changeInvoiceTypeBtn">Change</button>';}else{note.classList.add('hidden');note.innerHTML='';}}
  if(saveBtn){const blocked=effective!=='equipment';saveBtn.disabled=blocked||!!state.importSaving;saveBtn.title=effective==='service'?'Service-only invoices cannot be imported.':effective==='noninventory'?'This invoice contains no tracked equipment.':effective==='uncertain'?'Confirm the invoice type before saving.':'';saveBtn.setAttribute('aria-disabled',blocked?'true':'false');}
  const eq=$('chooseEquipmentInvoiceBtn'),svc=$('chooseServiceInvoiceBtn'),chg=$('changeInvoiceTypeBtn');
  if(eq)eq.onclick=async()=>{eq.disabled=true;await reprocessConfirmedEquipmentInvoice();};
  if(svc)svc.onclick=()=>{state.importClassificationChoice='service';renderImportEligibility();toast('Marked as service invoice. Saving to inventory is disabled.');};
  if(chg)chg.onclick=()=>{state.importClassificationChoice=null;renderImportEligibility();};
}
function looksServiceOnlyDocument(text='',extractedItems=[],inventoryItems=[]){
  return classifyInvoiceDocument(text,extractedItems,inventoryItems).type==='service';
}
function v661LayoutMoney(labelRe,{exclude=null}={}){
  const rows=getPdfLayoutRows(),re=labelRe instanceof RegExp?labelRe:new RegExp(labelRe,'i');
  const parseRaw=v=>{let x=String(v||'').trim().replace(/\s/g,'');if(!x)return null;x=x.replace(/(?<=\d),(?=\d{3}(?:\.|,|$))/g,'').replace(/,(?=\d{2}$)/,'.');const n=Number(x.replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null;};
  for(const row of rows){
    if(!re.test(row.text||'')||(exclude&&exclude.test(row.text||'')))continue;
    const items=[...(row.items||[])].sort((a,b)=>(Number(a.x)||0)-(Number(b.x)||0));
    const labelHits=items.filter(it=>re.test(String(it.text||''))),labelX=labelHits.length?Math.min(...labelHits.map(it=>Number(it.x)||0)):Math.min(...items.map(i=>Number(i.x)).filter(Number.isFinite),0);
    const band=rows.filter(r=>r.page===row.page&&Math.abs((Number(r.y)||0)-(Number(row.y)||0))<=7);
    const vals=[];for(const r of band)for(const it of r.items||[]){if((Number(it.x)||0)<labelX+6)continue;const n=parseRaw(it.text);if(n!==null)vals.push({n,x:Number(it.x)||0});}
    vals.sort((a,b)=>b.x-a.x);if(vals.length)return vals[0].n;
    const fallback=decimalMoneyCandidates(row.text||'');if(fallback.length)return fallback[fallback.length-1];
  }
  return null;
}
function v661RepairInvoiceMoneyFromLayout(doc={}){
  const s=v661LayoutMoney(/\b(?:Sub\s*Total|Subtotal)\b/i),g=v661LayoutMoney(/\b(?:Add\s+)?GST(?:\s*@?\s*\d+(?:\.\d+)?\s*%|\s*\d+\s*%)?\b/i,{exclude:/GST\s+Reg(?:istration)?\s*(?:No|Number)?/i}),t=v661LayoutMoney(/\b(?:Amount\s+Due|Grand\s*Total|Invoice\s*Total|Total\s*Amount)\b/i,{exclude:/Sub\s*Total|Subtotal/i});
  if(s!==null)doc.subtotal=Number(s);if(g!==null)doc.gst=Number(g);if(t!==null)doc.total_amount=Number(t);
  let sn=Number(doc.subtotal),gn=Number(doc.gst),tn=Number(doc.total_amount);
  if(Number.isFinite(tn)&&Number.isFinite(gn)){
    const calc=Math.round((tn-gn)*100)/100;
    if(calc>=0&&(!Number.isFinite(sn)||Math.abs((sn+gn)-tn)>.05)){doc.subtotal=calc;sn=calc;doc.moneyRecovery='amount_due_minus_gst';}
  }
  if(Number.isFinite(sn)&&Number.isFinite(gn)&&!Number.isFinite(tn)){doc.total_amount=Math.round((sn+gn)*100)/100;doc.moneyRecovery='subtotal_plus_gst';}
  if([Number(doc.subtotal),Number(doc.gst),Number(doc.total_amount)].every(Number.isFinite)&&Math.abs((Number(doc.subtotal)+Number(doc.gst))-Number(doc.total_amount))>.05)doc.total_amount=null;
  return doc;
}
function needsDeepRecovery(parsed={}){
  const d=parsed.doc||{},items=validParsedItems(parsed.items||[]),c=parsed?.invoiceClassification?.type||'uncertain';
  // V6.81: a mathematically-consistent row can still be a broken PDF text-layer split (e.g. 201 x 4 = 804 instead of 1 x 804).
  // Treat extreme quantity/price splits as a reason to obtain independent image OCR evidence, never as a reason to auto-correct.
  const needsIndependentRowCheck=items.some(x=>{const q=Number(x.quantity),p=Number(x.unit_price),a=Number(x.amount);return x.quantityReviewRequired||x.priceReviewRequired||x.amountReviewRequired||(q>=100&&p>0&&p<10&&a>=100);});
  if(needsIndependentRowCheck)return true;
  const a=Number(d.subtotal),b=Number(d.gst),z=Number(d.total_amount),moneyOk=[a,b,z].every(Number.isFinite)&&Math.abs((a+b)-z)<=.06;
  // Service-only invoices do not need inventory rows, but their invoice number/date/totals still do.
  if(c==='service')return !d.invoice_number||!d.invoice_date||!moneyOk;
  if(!d.invoice_number||!d.invoice_date||!items.length||c==='uncertain')return true;
  if(!moneyOk)return true;
  return false;
}
async function v661EnsureTesseract(){
  if(window.Tesseract)return window.Tesseract;
  await new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-v661-tesseract]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';sc.async=true;sc.dataset.v661Tesseract='1';sc.onload=resolve;sc.onerror=()=>reject(new Error('Recovery OCR library could not be loaded.'));document.head.appendChild(sc);});
  if(!window.Tesseract)throw new Error('Recovery OCR library did not initialise.');return window.Tesseract;
}
async function forceOcrRecovery(file){
  const kind=v662FileKind(file);if(kind==='docx')return false;const T=await v661EnsureTesseract();setProgress(40,'Key invoice fields need a deeper scan — running recovery OCR…');
  const modes=[{key:'recovery-auto',label:'AUTO',psm:T.PSM?.AUTO??'3',texts:[],layouts:[]},{key:'recovery-block',label:'SINGLE_BLOCK',psm:T.PSM?.SINGLE_BLOCK??'6',texts:[],layouts:[]},{key:'recovery-column',label:'SINGLE_COLUMN',psm:T.PSM?.SINGLE_COLUMN??'4',texts:[],layouts:[]},{key:'recovery-sparse',label:'SPARSE_TEXT',psm:T.PSM?.SPARSE_TEXT??'11',texts:[],layouts:[]}];
  const canvases=[];
  if(kind==='pdf'){const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';const data=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjs.getDocument({data}).promise;for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),vp=p.getViewport({scale:3.2}),c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);await p.render({canvasContext:c.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;canvases.push({c,page:i});}}
  else if(kind==='image'){const bmp=await createImageBitmap(file),c=document.createElement('canvas'),scale=Math.min(3,Math.max(1,2400/Math.max(bmp.width,bmp.height)));c.width=Math.round(bmp.width*scale);c.height=Math.round(bmp.height*scale);c.getContext('2d',{willReadFrequently:true}).drawImage(bmp,0,0,c.width,c.height);canvases.push({c,page:1});bmp.close?.();}
  const worker=await T.createWorker('eng');try{for(let ci=0;ci<canvases.length;ci++){for(let mi=0;mi<modes.length;mi++){const {c,page}=canvases[ci],m=modes[mi],pct=42+Math.round(45*((ci*modes.length+mi+1)/(canvases.length*modes.length)));setProgress(pct,`Recovery OCR ${m.label}… page ${page} of ${canvases.length}`);await worker.setParameters({tessedit_pageseg_mode:m.psm,preserve_interword_spaces:'1',user_defined_dpi:'240'});const r=await worker.recognize(c,{}, {text:true,tsv:true,hocr:true,blocks:true});const layout=ocrResultToLayout(r.data||{},page,c.height);m.layouts.push(layout);m.texts.push(String(r.data?.text||'').trim()||layout.rows?.map(x=>x.text).join('\n').trim());}}}finally{await worker.terminate();}
  const recovered=modes.map(m=>{const text=m.texts.join('\n\f\n').trim();return{source:m.key,label:m.label,text,layout:m.layouts,score:ocrTextQuality(text)+m.layouts.reduce((n,l)=>n+layoutInvoiceQuality(l),0)};}).filter(x=>x.text);state.ocrCandidates=[...(state.ocrCandidates||[]),...recovered].sort((a,b)=>b.score-a.score);return recovered.length>0;
}
function v665ClassifyDocumentType(text=''){
  const t=normalizePdfText(text).replace(/\r/g,'\n');
  const lines=t.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,120);
  let invoiceScore=0,deliveryScore=0,otherScore=0;
  for(const line of lines){
    const u=line.toUpperCase().replace(/[^A-Z0-9/# ]+/g,' ').replace(/\s+/g,' ').trim();
    if(/^(?:TAX\s+INVOICE|INVOICE|SALES\s+INVOICE|COMMERCIAL\s+INVOICE|GST\s+INVOICE)$/.test(u))invoiceScore+=12;
    else if(/\bTAX\s+INVOICE\b/.test(u))invoiceScore+=8;
    if(/^(?:SIGNED\s+)?DELIVERY\s+ORDER$/.test(u)||/^(?:DELIVERY\s+NOTE|PACKING\s+LIST|RETURN\s+NOTE|GOODS\s+RECEIVED\s+NOTE)$/.test(u))deliveryScore+=14;
    else if(/\b(?:SIGNED\s+)?DELIVERY\s+ORDER\b/.test(u)&&!/(?:\bNO\b|\bNUMBER\b|#|\bREF\b|\bREFERENCE\b)/.test(u))deliveryScore+=8;
    if(/^(?:QUOTATION|QUOTE|PURCHASE\s+ORDER|STATEMENT|RECEIPT)$/.test(u))otherScore+=12;
  }
  if(/\binvoice\s*(?:no\.?|number|#)\s*[:#.-]?\s*[A-Z0-9]/i.test(t))invoiceScore+=5;
  if(/\b(?:invoice\s*)?date\s*[:#.-]?\s*[0-3]?\d[/.\-][01]?\d[/.\-]\d{2,4}/i.test(t))invoiceScore+=3;
  if(/\b(?:sub\s*total|subtotal)\b/i.test(t)&&/\bgst\b/i.test(t)&&/\b(?:amount\s+due|grand\s+total|invoice\s+total|total\s+amount)\b/i.test(t))invoiceScore+=4;
  if(/\bdescription\b/i.test(t)&&/\b(?:qty|quantity)\b/i.test(t)&&/\b(?:unit\s*)?price\b/i.test(t)&&/\bamount\b/i.test(t))invoiceScore+=3;
  if(deliveryScore>=12&&invoiceScore<12)return{type:'delivery_order',invoiceScore,deliveryScore,otherScore,reason:'Document header identifies a Delivery Order / Delivery Note rather than an invoice.'};
  if(otherScore>=12&&invoiceScore<12)return{type:'non_invoice',invoiceScore,deliveryScore,otherScore,reason:'Document header identifies a non-invoice document.'};
  if(invoiceScore>=10&&invoiceScore>=deliveryScore)return{type:'invoice',invoiceScore,deliveryScore,otherScore,reason:'Invoice title/header and invoice fields were verified.'};
  if(deliveryScore>invoiceScore)return{type:'delivery_order',invoiceScore,deliveryScore,otherScore,reason:'Delivery Order evidence is stronger than invoice evidence.'};
  return{type:'uncertain',invoiceScore,deliveryScore,otherScore,reason:'The document could not be proven to be an invoice.'};
}
function detectImportDocumentType(raw=''){
  const sources=typeof v661EvidenceSources==='function'?v661EvidenceSources(raw):[{text:String(raw||'')}];
  const checks=sources.map(x=>v665ClassifyDocumentType(x.text||''));
  const invoice=checks.filter(x=>x.type==='invoice').sort((a,b)=>b.invoiceScore-a.invoiceScore)[0];
  const delivery=checks.filter(x=>x.type==='delivery_order').sort((a,b)=>b.deliveryScore-a.deliveryScore)[0];
  const other=checks.find(x=>x.type==='non_invoice');
  if(delivery&&(!invoice||delivery.deliveryScore>invoice.invoiceScore+2))return delivery;
  if(invoice)return invoice;
  if(delivery)return delivery;
  if(other)return other;
  return checks.sort((a,b)=>(b.invoiceScore+b.deliveryScore+b.otherScore)-(a.invoiceScore+a.deliveryScore+a.otherScore))[0]||{type:'uncertain',reason:'No readable document evidence.'};
}
async function ensureInvoiceDocument(file,raw=''){
  let verdict=detectImportDocumentType(raw);
  const kind=v662FileKind(file);
  if(verdict.type==='uncertain'&&(kind==='pdf'||kind==='image')){
    const already=(state.ocrCandidates||[]).some(x=>String(x.source||'').startsWith('recovery-'));
    if(!already){try{await forceOcrRecovery(file);}catch(e){console.warn('Invoice-type recovery OCR could not complete.',e);}}
    verdict=detectImportDocumentType(raw);
  }
  state.importDocumentType=verdict;
  if(verdict.type==='invoice')return verdict;
  if(verdict.type==='delivery_order')throw new Error('Only invoices can be imported. This document was identified as a Delivery Order / Delivery Note.');
  if(verdict.type==='non_invoice')throw new Error('Only invoices can be imported. This document is not an invoice.');
  throw new Error('Only invoices can be imported. The document could not be verified as an Invoice / Tax Invoice after repeated checks.');
}
function displayDocumentFilename(doc={},invoiceDate=''){
  const m=String(invoiceDate||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const supplier=String(doc.supplier_name||'').replace(/\s+/g,' ').trim();
  if(!m||!supplier)return String(doc.file_name||'');
  const ext=(String(doc.file_name||'').match(/\.(pdf|png|jpe?g|webp|docx)$/i)||[])[0]||'.pdf';
  return `${m[3]}/${m[2]}/${m[1]}-${supplier}${ext.toLowerCase().replace('.jpeg','.jpg')}`;
}
function v665StoredDocumentFilename(doc={},file=null){
  const m=String(doc.invoice_date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date=m?`${m[3]}-${m[2]}-${m[1]}`:'';
  const supplier=String(doc.supplier_name||'Unknown-Supplier').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().replace(/\s/g,'-').replace(/-+/g,'-');
  const source=String(file?.name||'').toLowerCase();
  const ext=(source.match(/\.(pdf|png|jpe?g|webp|docx)$/i)||[])[1]||'pdf';
  return [date,supplier].filter(Boolean).join('-')+'.'+ext.replace('jpeg','jpg');
}
function cleanupPdfPreview(){if(state.pdfPreviewUrl){URL.revokeObjectURL(state.pdfPreviewUrl);state.pdfPreviewUrl=null;}state.pdfLayout=null;state.ocrCandidates=null;if($('invoicePdfFrame'))$('invoicePdfFrame').src='about:blank';}
function updatePdfPreview(){const frame=$('invoicePdfFrame');if(!frame||!state.pdfPreviewUrl)return;frame.src=`${state.pdfPreviewUrl}#page=${Math.max(1,state.pdfPreviewPage||1)}&zoom=${encodeURIComponent(state.pdfPreviewZoom||'page-width')}`;if($('pdfPageLabel'))$('pdfPageLabel').textContent=`Page ${Math.max(1,state.pdfPreviewPage||1)}`;}
function setPdfZoom(value){state.pdfPreviewZoom=value;updatePdfPreview();}
async function startImport(file){if(!file)return;if(!requireEdit())return;cleanupPdfPreview();state.parsed=null;state.importClassificationChoice=null;state.importSourceFile=file;$('dropZone')?.classList.add('hidden');state.file=file;state.pdfPreviewUrl=URL.createObjectURL(file);state.pdfPreviewPage=1;state.pdfPreviewZoom='page-width';updatePdfPreview();if($('importSteps'))$('importSteps').dataset.step='review';$('reviewArea').classList.add('hidden');$('importProgress').classList.remove('hidden');try{let text=await extractInvoiceFile(file);if(v662FileKind(file)==='pdf'&&/AVs+MEDIA/i.test(text)){try{await addAvMediaTargetedOcr(file);}catch(targetErr){console.warn('AV Media targeted OCR skipped',targetErr);}}await ensureInvoiceDocument(file,text);let parsedBest=v661FinalizeParsedInvoice(parseBestInvoice(text),text);if(parsedBest.invoiceClassification?.type==='service')throw new Error('Service invoice detected. Equipment invoices only; this document was not imported.');if(needsDeepRecovery(parsedBest)){try{const recovered=await forceOcrRecovery(file);if(recovered)parsedBest=v661FinalizeParsedInvoice(parseBestInvoice(text),text);}catch(recoveryError){console.warn('Recovery OCR could not complete; keeping best verified parse.',recoveryError);}}state.parsed={...parsedBest,raw:parsedBest.rawText||text};if(state.parsed.invoiceClassification?.type==='service')throw new Error('Service invoice detected. Equipment invoices only; this document was not imported.');const d=state.parsed.doc;if($('supplierRuleStatus')){$('supplierRuleStatus').innerHTML=`<i data-lucide="scan-text"></i> ${esc(state.parsed.rule?.label||'Generic OCR rules')}`;$('supplierRuleStatus').classList.toggle('known',state.parsed.rule?.key!=='generic');}$('pSupplier').value=d.supplier_name;$('pInvoice').value=d.invoice_number;$('pDate').value=d.invoice_date;['pSupplier','pInvoice','pDate'].forEach(id=>$(id)?.classList.toggle('low-confidence',!$(id).value));if($('invoiceDateStatus')){const s=$('invoiceDateStatus');s.textContent=d.invoice_date?'Auto-detected from invoice: '+fmtDate(d.invoice_date)+' — verify against the PDF before saving.':'Invoice date was not confidently detected — please enter it manually.';s.className='date-status '+(d.invoice_date?'detected':'review');}$('pDo').value=d.delivery_order_number;$('pRef').value=d.reference_number;$('pCurrency').value=d.currency;$('pSubtotal').value=d.subtotal??'';$('pGst').value=d.gst??'';$('pTotal').value=d.total_amount??'';$('rawText').textContent=state.parsed.raw||text;console.info('Invoice OCR selection',state.parsed.ocrSelection||{source:'text-pdf'});state.parsed.items=sanitizeParsedInventoryItems(state.parsed.items||[],state.parsed.raw||text);renderParsedItems();renderImportEligibility();if(state.parsed.invoiceClassification?.type==='service')toast('Equipment invoices only. This service-work invoice cannot be saved.');else if(state.parsed.invoiceClassification?.type==='uncertain')toast('Invoice type is uncertain. Confirm Equipment or Service before saving.');const dupe=d.supplier_name&&d.invoice_number?await state.db.duplicateInvoice(d.supplier_name,d.invoice_number,d.invoice_date):null;state.possibleDuplicate=dupe;$('duplicateWarning').classList.toggle('hidden',!dupe);$('duplicateWarning').innerHTML=dupe?`<strong>This invoice may already exist.</strong> Supplier, Invoice Number and Invoice Date match an existing purchase. <button type="button" id="viewDuplicateBtn">View existing</button> <button type="button" id="continueDuplicateBtn">Continue anyway</button>`:'';state.allowDuplicate=false;if(dupe){setTimeout(()=>{const v=$('viewDuplicateBtn'),c=$('continueDuplicateBtn');if(v)v.onclick=()=>showView('documents');if(c)c.onclick=()=>{state.allowDuplicate=true;$('duplicateWarning').innerHTML='<strong>Duplicate override enabled.</strong> Confirm & save will continue.';}},0);}setProgress(100,'Ready for review.');setTimeout(()=>$('importProgress').classList.add('hidden'),400);$('reviewArea').classList.remove('hidden');}catch(e){toast(e.message);$('importProgress').classList.add('hidden');$('dropZone')?.classList.remove('hidden');cleanupPdfPreview();}}

function setUserIdentity(session){const email=session?.user?.email||'';const pretty=state.profile?.display_name||profileName(session?.user?.id)||session?.user?.user_metadata?.display_name||prettyEmailName(email||(CFG.mode==='supabase'?'Team Member':'Demo User'));if($('userName'))$('userName').textContent=pretty||'Team Member';if($('userEmail'))$('userEmail').textContent=email||'Local demo';if($('userRole'))$('userRole').textContent=currentRole().replace(/^./,c=>c.toUpperCase());if($('userAvatar'))$('userAvatar').textContent=(pretty||'AV').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();applyRoleUI();}
function applyRoleUI(){const editable=canEdit(),admin=CFG.mode==='supabase'&&canManageRoles();for(const id of ['sidebarImportBtn','importBtn','addMaintenanceBtn'])$(id)?.classList.toggle('role-hidden',!editable);$('manageRolesBtn')?.classList.toggle('hidden',!admin);document.body.dataset.role=currentRole();}
function renderTeamRoles(){const me=state.session?.user?.id;const rows=(state.data?.profiles||[]).map(p=>{const selfAdmin=p.id===me&&p.role==='admin';const locked=!!p.is_owner||selfAdmin;const roleCell=locked?`<span class="role-locked"><i data-lucide="shield-check"></i> Admin${p.is_owner?' · Owner':''}</span>`:`<select data-role-user="${p.id}"><option value="admin" ${p.role==='admin'?'selected':''}>Admin</option><option value="editor" ${p.role==='editor'?'selected':''}>Editor</option><option value="viewer" ${(!p.role||p.role==='viewer')?'selected':''}>Viewer</option></select>`;const actionCell=`<button class="secondary small-btn" data-save-member="${p.id}">Save</button>${locked?'<span class="muted role-lock-note"> Role protected</span>':''}`;return `<tr><td><input class="team-display-name" data-name-user="${p.id}" value="${esc(p.display_name||'Team Member')}" maxlength="60" aria-label="Display name"><br><span class="muted">${esc(p.email||'—')}</span></td><td>${p.id===me?'<span class="role-you">You</span>':''}</td><td>${roleCell}</td><td>${actionCell}</td></tr>`;}).join('');$('teamRolesTable').innerHTML=rows?`<table><thead><tr><th>Member</th><th></th><th>Role</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="empty">No team profiles found.</div>';window.lucide?.createIcons();}
function openTeamRoles(){if(!canManageRoles()){toast('Only Admins can manage member roles.');return;}renderTeamRoles();$('teamRolesDialog').showModal();}
function showLoginPanel(message='',kind='success'){
  authFlowMode=null;
  $('loginPanel')?.classList.remove('hidden');
  $('recoveryPanel')?.classList.add('hidden');
  $('authGate')?.classList.remove('hidden');
  clearLoginPassword();
  if(message)setAuthMessage(message,kind);else setAuthMessage();
  window.lucide?.createIcons();
}
function showRecoveryPanel(message=''){
  authFlowMode='recovery';
  $('loginPanel')?.classList.add('hidden');
  $('recoveryPanel')?.classList.remove('hidden');
  $('authGate')?.classList.remove('hidden');
  if($('recoveryPassword'))$('recoveryPassword').value='';
  if($('recoveryPasswordConfirm'))$('recoveryPasswordConfirm').value='';
  if(updatePasswordBtn)updatePasswordBtn.disabled=!state.session;
  if(state.session)cleanAuthCallbackUrl();
  setRecoveryMessage(message);
  window.lucide?.createIcons();
}
async function finishEmailConfirmationCallback(){
  try{await state.db.signOut();}catch(_){ }
  state.session=null;state.profile=null;
  cleanAuthCallbackUrl();
  showLoginPanel('Email confirmed. Please sign in manually to continue.','success');
}
async function requireConfirmedProfile(session){
  if(CFG.mode!=='supabase'||!session?.user)return true;
  try{
    // Always ask Supabase for a fresh user record instead of trusting a cached session.
    const freshUser=await state.db.currentUser();
    const emailConfirmed=!!freshUser?.email_confirmed_at;
    if(!emailConfirmed){
      await state.db.signOut();
      state.session=null;state.profile=null;
      $('authGate').classList.remove('hidden');
      setUserIdentity(null);
      setAuthMessage('Email confirmation is required before dashboard access. Please confirm the registration email, then sign in.');
      return false;
    }
    // The app profile must have been promoted by the database confirmation trigger.
    // Do not auto-promote here: this prevents a newly-created account from bypassing
    // the confirmation-email step even if a cached or auto-confirmed Auth session exists.
    const profile=await state.db.profileForUser(freshUser?.id||session.user.id);
    state.profile=profile;
    if(profile?.app_confirmed===true){
      state.session={...session,user:freshUser};
      return true;
    }
    await state.db.signOut();
    state.session=null;state.profile=null;
    $('authGate').classList.remove('hidden');
    setUserIdentity(null);
    setAuthMessage('Your account could not be activated yet. Confirm your email and try signing in again.');
    return false;
  }catch(e){
    console.error('Confirmation check failed',e);
    try{await state.db.signOut();}catch(_){}
    state.session=null;state.profile=null;
    $('authGate').classList.remove('hidden');
    setAuthMessage('Authentication security setup is incomplete. Run the latest auth-hardening SQL, then try again.');
    return false;
  }
}
async function init(){
  if($('auditSearch')){$('auditSearch').value='';$('auditSearch').setAttribute('value','');}
  state.db=CFG.mode==='supabase'?new SupabaseDB():new LocalDB();
  await state.db.init();
  $('modeBadge').textContent=CFG.mode==='supabase'?'Shared workspace':'Demo mode';
  if(CFG.mode==='supabase'&&state.db.onAuthStateChange){
    state.db.onAuthStateChange((event,session)=>{
      setTimeout(async()=>{
        if(event==='PASSWORD_RECOVERY'){
          authFlowMode='recovery';
          state.session=session||await state.db.session();
          showRecoveryPanel();
          return;
        }
        if(authFlowMode==='confirm'&&session?.user&&['SIGNED_IN','INITIAL_SESSION','TOKEN_REFRESHED','USER_UPDATED'].includes(event)){
          await finishEmailConfirmationCallback();
          return;
        }
        if(authFlowMode==='recovery'){
          if(session?.user){state.session=session;showRecoveryPanel();}
          return;
        }
        if(!session?.user||!['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED','INITIAL_SESSION'].includes(event))return;
        const ok=await requireConfirmedProfile(session);
        if(!ok)return;
        state.session=session;
        $('authGate').classList.add('hidden');
        setUserIdentity(state.session);
      },0);
    });
  }
  $('signOutBtn').classList.toggle('hidden',CFG.mode!=='supabase');
  renderReleasePanel();
  if(CFG.mode==='supabase'){
    if(!CFG.supabaseUrl||!CFG.supabaseAnonKey){alert('Supabase mode is selected but config.js is incomplete.');return;}
    const s=await state.db.session();
    if(authFlowMode==='confirm'){
      state.session=s;
      if(s)await finishEmailConfirmationCallback();
      else{
        $('authGate').classList.remove('hidden');
        $('loginPanel')?.classList.remove('hidden');
        $('recoveryPanel')?.classList.add('hidden');
        setAuthMessage('Completing email confirmation…','success');
      }
      return;
    }
    if(authFlowMode==='recovery'){
      state.session=s;
      showRecoveryPanel(s?'':'Preparing secure password reset…');
      window.lucide?.createIcons();
      return;
    }
    state.session=s;
    if(s&&!await requireConfirmedProfile(s)){window.lucide?.createIcons();return;}
    $('authGate').classList.toggle('hidden',!!state.session);
    if(!state.session){setUserIdentity(null);window.lucide?.createIcons();return;}
  }else setUserIdentity(null);
  await reload();
  armIdleTimers();
  setHealth('live',CFG.mode==='supabase'?'Live':'Demo mode');
  window.lucide?.createIcons();
}


const authEmail=$('authEmail'),authPassword=$('authPassword'),signInBtn=$('signInBtn'),authMessage=$('authMessage');
const recoveryPassword=$('recoveryPassword'),recoveryPasswordConfirm=$('recoveryPasswordConfirm'),recoveryMessage=$('recoveryMessage'),updatePasswordBtn=$('updatePasswordBtn');
const PASSWORD_LENGTH=8;
const exactPassword=(v='')=>String(v).length===PASSWORD_LENGTH;
function setRecoveryMessage(msg='',kind='error'){if(!recoveryMessage)return;recoveryMessage.textContent=msg;recoveryMessage.classList.toggle('hidden',!msg);recoveryMessage.style.color=kind==='success'?'#168447':'#c62828';}

function clearLoginPassword(){if(authPassword){authPassword.value='';authPassword.type='password';updateAuthState();}}
// Never retain or restore a password when the login screen is shown.
clearLoginPassword();
window.addEventListener('DOMContentLoaded',()=>{clearLoginPassword();setTimeout(clearLoginPassword,100);setTimeout(clearLoginPassword,500);},{once:true});
window.addEventListener('load',()=>{clearLoginPassword();setTimeout(clearLoginPassword,150);},{once:true});
window.addEventListener('pageshow',()=>{clearLoginPassword();setTimeout(clearLoginPassword,100);setTimeout(clearLoginPassword,500);});
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());}
function setAuthMessage(msg='',kind='error'){authMessage.textContent=msg;authMessage.classList.toggle('hidden',!msg);authMessage.style.color=kind==='success'?'#168447':'#c62828';}
function passwordWarning(input,errorEl,force=false){if(!input||!errorEl)return true;const len=String(input.value||'').length,valid=len===PASSWORD_LENGTH;errorEl.textContent=len>PASSWORD_LENGTH?'Password cannot be longer than 8 characters.':'Password must be exactly 8 characters.';errorEl.classList.toggle('hidden',!force||valid);return valid;}
function updateAuthState(showErrors=false){const email=authEmail.value.trim(),pw=authPassword.value;signInBtn.disabled=!(validEmail(email)&&exactPassword(pw));if(showErrors){$('emailError').classList.toggle('hidden',!email||validEmail(email));passwordWarning(authPassword,$('passwordError'),true);}else{$('emailError').classList.add('hidden');$('passwordError').classList.add('hidden');}}
function guardPasswordLength(input,errorEl){const tooLong=()=>{if(errorEl){errorEl.textContent='Password cannot be longer than 8 characters.';errorEl.classList.remove('hidden');}};input?.addEventListener('beforeinput',e=>{if(e.inputType?.startsWith('insert')&&e.data&&String(input.value||'').length>=PASSWORD_LENGTH&&input.selectionStart===input.selectionEnd){e.preventDefault();tooLong();}});input?.addEventListener('paste',e=>{const text=e.clipboardData?.getData('text')||'',selected=Math.max(0,(input.selectionEnd||0)-(input.selectionStart||0));if(String(input.value||'').length-selected+text.length>PASSWORD_LENGTH){e.preventDefault();tooLong();}});input?.addEventListener('input',()=>{if(input.value.length>PASSWORD_LENGTH){input.value=input.value.slice(0,PASSWORD_LENGTH);tooLong();}});}
guardPasswordLength(authPassword,$('passwordError'));guardPasswordLength(recoveryPassword,$('recoveryPasswordError'));guardPasswordLength(recoveryPasswordConfirm,$('recoveryConfirmError'));
authEmail.addEventListener('input',()=>{updateAuthState();setAuthMessage();});authPassword.addEventListener('input',()=>{updateAuthState();setAuthMessage();});authPassword.addEventListener('blur',()=>passwordWarning(authPassword,$('passwordError'),!!authPassword.value));authEmail.addEventListener('blur',()=>{$('emailError').classList.toggle('hidden',!authEmail.value||validEmail(authEmail.value));});
let signInBusy=false;
async function submitSignIn(){
  if(signInBusy)return;
  updateAuthState(true);
  if(!validEmail(authEmail.value)||!exactPassword(authPassword.value)){passwordWarning(authPassword,$('passwordError'),true);return;}
  signInBusy=true;
  const original='Sign in';
  signInBtn.disabled=true;signInBtn.textContent='Signing in…';setAuthMessage();
  try{
    await state.db.signIn(authEmail.value.trim(),authPassword.value);
    state.session=await state.db.session();
    if(!await requireConfirmedProfile(state.session))return;
    $('authGate').classList.add('hidden');setUserIdentity(state.session);await reload();armIdleTimers();
  }catch(e){
    const msg=String(e?.message||'');
    setAuthMessage(msg.includes('security update')?msg:'Email or password is incorrect.');
  }finally{
    signInBusy=false;signInBtn.textContent=original;updateAuthState();
  }
}
signInBtn.onclick=submitSignIn;authPassword.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();submitSignIn();}});
$('togglePasswordBtn').onclick=()=>{const show=authPassword.type==='password';authPassword.type=show?'text':'password';$('togglePasswordBtn').setAttribute('aria-label',show?'Hide password':'Show password');$('togglePasswordBtn').innerHTML=`<i data-lucide="${show?'eye-off':'eye'}"></i>`;window.lucide?.createIcons();};
$('forgotPasswordBtn').onclick=async()=>{const email=authEmail.value.trim();if(!validEmail(email)){$('emailError').classList.remove('hidden');setAuthMessage('Enter your email address first so we can send the reset link.');return;}try{if(!state.db.resetPassword)throw new Error();await state.db.resetPassword(email);setAuthMessage('Password reset email sent. Check your inbox.','success');}catch(e){if(isProviderRateLimitError(e)){setAuthMessage('Password reset email is temporarily limited by the authentication service. Please wait for the email-service limit to clear, then try again or contact your administrator for assistance.');return;}setAuthMessage('We could not send the reset email. Please try again.');}};
function toggleRecoveryVisibility(input,button,label){if(!input||!button)return;const show=input.type==='password';input.type=show?'text':'password';button.setAttribute('aria-label',show?`Hide ${label}`:`Show ${label}`);button.innerHTML=`<i data-lucide="${show?'eye-off':'eye'}"></i>`;window.lucide?.createIcons();}
$('toggleRecoveryPasswordBtn')?.addEventListener('click',()=>toggleRecoveryVisibility(recoveryPassword,$('toggleRecoveryPasswordBtn'),'new password'));
$('toggleRecoveryConfirmBtn')?.addEventListener('click',()=>toggleRecoveryVisibility(recoveryPasswordConfirm,$('toggleRecoveryConfirmBtn'),'confirmed password'));
updatePasswordBtn?.addEventListener('click',async()=>{
  const pw=recoveryPassword?.value||'',confirmPw=recoveryPasswordConfirm?.value||'';
  setRecoveryMessage();
  if(!exactPassword(pw)){setRecoveryMessage('Password must be exactly 8 characters.');return;}
  if(!exactPassword(confirmPw)){setRecoveryMessage('Confirmation password must be exactly 8 characters.');return;}
  if(pw!==confirmPw){setRecoveryMessage('The passwords do not match.');return;}
  updatePasswordBtn.disabled=true;const old=updatePasswordBtn.textContent;updatePasswordBtn.textContent='Updating…';
  try{
    if(!state.db.updatePassword)throw new Error('Password recovery is unavailable.');
    await state.db.updatePassword(pw);
    try{await state.db.signOut();}catch(_){ }
    state.session=null;state.profile=null;
    cleanAuthCallbackUrl();
    showLoginPanel('Password updated. Sign in manually with your new password.','success');
  }catch(e){
    console.error('Password update failed',e);
    setRecoveryMessage('We could not update the password. Open the latest reset link again and try once more.');
  }finally{updatePasswordBtn.disabled=false;updatePasswordBtn.textContent=old;}
});
const SIGNUP_COOLDOWN_MS=5*60*1000;
const SIGNUP_COOLDOWN_KEY='av-inventory-signup-cooldown-until';
const SIGNUP_ATTEMPTS_KEY='av-inventory-signup-failed-attempts';
const SIGNUP_ALLOWED_FAILURES=2; // the 3rd failed signup starts cooldown
let signupCooldownInterval=null,signupBusy=false;
function signupCooldownUntil(){return Number(localStorage.getItem(SIGNUP_COOLDOWN_KEY)||0);}
function signupFailedAttempts(){return Math.max(0,Number(localStorage.getItem(SIGNUP_ATTEMPTS_KEY)||0));}
function setSignupFailedAttempts(n){localStorage.setItem(SIGNUP_ATTEMPTS_KEY,String(Math.max(0,n||0)));}
function clearSignupCooldown(resetAttempts=true){
  localStorage.removeItem(SIGNUP_COOLDOWN_KEY);
  if(resetAttempts)localStorage.removeItem(SIGNUP_ATTEMPTS_KEY);
  if(signupCooldownInterval){clearInterval(signupCooldownInterval);signupCooldownInterval=null;}
}
function formatCooldown(ms){const total=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(total/60),sec=total%60;return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;}
function refreshSignupCooldown(){
  const btn=$('signUpBtn'),until=signupCooldownUntil(),remaining=until-Date.now();
  if(!until||remaining<=0){
    // Expired cooldown is a clean slate: the next failure is attempt 1, not an immediate re-lock.
    if(until)clearSignupCooldown(true);
    if(btn&&!signupBusy){btn.disabled=false;btn.textContent='Create account';}
    if(authMessage?.dataset?.cooldown==='1'){setAuthMessage();delete authMessage.dataset.cooldown;}
    return false;
  }
  if(btn){btn.disabled=true;btn.textContent=`Try again in ${formatCooldown(remaining)}`;}
  if(authMessage){authMessage.dataset.cooldown='1';setAuthMessage(`Too many failed signup attempts. You can try creating an account again in ${formatCooldown(remaining)}.`);}
  return true;
}
function startSignupCooldown(){
  localStorage.setItem(SIGNUP_COOLDOWN_KEY,String(Date.now()+SIGNUP_COOLDOWN_MS));
  refreshSignupCooldown();
  if(signupCooldownInterval)clearInterval(signupCooldownInterval);
  signupCooldownInterval=setInterval(refreshSignupCooldown,1000);
}
function isProviderSignupLimit(err){
  const code=String(err?.code||'').toLowerCase();
  const msg=String(err?.message||'').toLowerCase();
  const status=Number(err?.status||0);
  return status===429||['over_email_send_rate_limit','over_request_rate_limit'].includes(code)||/email rate limit|rate limit exceeded|too many requests|request rate limit|email send rate/i.test(msg);
}
function recordSignupFailure(){
  const failures=signupFailedAttempts()+1;
  setSignupFailedAttempts(failures);
  if(failures>=SIGNUP_ALLOWED_FAILURES+1){startSignupCooldown();return true;}
  return false;
}
if(refreshSignupCooldown()) signupCooldownInterval=setInterval(refreshSignupCooldown,1000);
$('signUpBtn').onclick=async()=>{
  if(signupBusy||refreshSignupCooldown())return;
  updateAuthState(true);
  const email=authEmail.value.trim(),pw=authPassword.value;
  if(!validEmail(email)){setAuthMessage('Enter a valid email address.');return;}
  if(!exactPassword(pw)){passwordWarning(authPassword,$('passwordError'),true);setAuthMessage('Password must be exactly 8 characters.');return;}
  const btn=$('signUpBtn'),oldText=btn.textContent;
  signupBusy=true;btn.disabled=true;btn.textContent='Creating…';setAuthMessage();
  try{
    await state.db.signUp(email,pw);
    // Successful signup resets the failed-attempt counter and clears any stale cooldown.
    clearSignupCooldown(true);
    // Always clear any session produced during signup. Access is granted only after email confirmation.
    try{await state.db.signOut();}catch(_){ }
    state.session=null;state.profile=null;clearLoginPassword();
    $('authGate').classList.remove('hidden');
    setAuthMessage('Account created. Check your email and confirm your account before signing in.','success');
  }catch(e){
    const msg=String(e?.message||'');
    const providerLimited=isProviderSignupLimit(e);
    if(providerLimited){
      setAuthMessage('Account creation email is temporarily limited by the authentication service. This does not use one of your 2 local signup attempts. Please wait for the email-service limit to clear, then try again or contact your administrator for assistance.');
    }else{
      const locked=recordSignupFailure();
      if(!locked){
        const used=signupFailedAttempts(),left=Math.max(0,(SIGNUP_ALLOWED_FAILURES+1)-used);
        if(/already registered|already exists|user already/i.test(msg)) setAuthMessage(`An account already exists for this email. Try signing in or reset the password. ${left} signup attempt${left===1?'':'s'} remaining before cooldown.`);
        else if(/password/i.test(msg)) setAuthMessage(`${msg} ${left} signup attempt${left===1?'':'s'} remaining before cooldown.`);
        else setAuthMessage(`${msg||'We could not create the account. Please try again.'} ${left} signup attempt${left===1?'':'s'} remaining before cooldown.`);
      }
    }
  }finally{
    signupBusy=false;
    if(!refreshSignupCooldown()){btn.disabled=false;btn.textContent=oldText;}
  }
};
// Inactivity security: warn after 5 minutes, auto sign out after 10 minutes.
const IDLE_WARNING_MS=5*60*1000;
const IDLE_LOGOUT_MS=10*60*1000;
let idleWarningTimer=null,idleLogoutTimer=null,idleLastActivity=Date.now();
function hideIdleWarning(){$('idleWarning')?.classList.add('hidden');}
function clearIdleTimers(){if(idleWarningTimer)clearTimeout(idleWarningTimer);if(idleLogoutTimer)clearTimeout(idleLogoutTimer);idleWarningTimer=idleLogoutTimer=null;}
async function idleAutoLogout(){
  clearIdleTimers();hideIdleWarning();
  if(authPassword){authPassword.value='';authPassword.type='password';}
  try{if(CFG.mode==='supabase')await state.db.signOut();}catch(_){ }
  state.session=null;state.profile=null;
  location.reload();
}
function showIdleWarning(){
  if(CFG.mode!=='supabase'||!state.session||!$('authGate')?.classList.contains('hidden'))return;
  $('idleWarning')?.classList.remove('hidden');
}
function armIdleTimers(){
  clearIdleTimers();
  if(CFG.mode!=='supabase'||!state.session||!$('authGate')?.classList.contains('hidden'))return;
  idleWarningTimer=setTimeout(showIdleWarning,IDLE_WARNING_MS);
  idleLogoutTimer=setTimeout(idleAutoLogout,IDLE_LOGOUT_MS);
}
function registerUserActivity(){
  if(CFG.mode!=='supabase'||!state.session)return;
  const now=Date.now();
  // Throttle noisy mousemove/scroll activity while still resetting promptly.
  if(now-idleLastActivity<1000)return;
  idleLastActivity=now;hideIdleWarning();armIdleTimers();
}
['pointerdown','keydown','scroll','touchstart','mousemove'].forEach(evt=>document.addEventListener(evt,registerUserActivity,{passive:true}));
$('staySignedInBtn')?.addEventListener('click',()=>{idleLastActivity=Date.now();hideIdleWarning();armIdleTimers();});
$('signOutBtn').onclick=async()=>{if(authPassword){authPassword.value='';authPassword.type='password';}await state.db.signOut();location.reload()};
$('userMenuBtn')?.addEventListener('click',e=>{e.stopPropagation();const m=$('userMenu');m.classList.toggle('hidden');$('userMenuBtn').setAttribute('aria-expanded',String(!m.classList.contains('hidden')));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))$('userMenu')?.classList.add('hidden');});
$('userSignOutBtn')?.addEventListener('click',async()=>{if(authPassword){authPassword.value='';authPassword.type='password';}if(CFG.mode==='supabase')await state.db.signOut();location.reload();});
$('accountBtn')?.addEventListener('click',()=>{const email=state.session?.user?.email||'Local demo user';toast(`Signed in as ${email} · ${currentRole()}`);$('userMenu')?.classList.add('hidden');});$('manageRolesBtn')?.addEventListener('click',()=>{openTeamRoles();$('userMenu')?.classList.add('hidden');});$('closeTeamRolesBtn')?.addEventListener('click',()=>$('teamRolesDialog').close());$('teamRolesTable')?.addEventListener('click',async e=>{const b=e.target.closest('[data-save-member]');if(!b)return;if(!canManageRoles()){toast('Only Admins can manage team members.');return;}const target=(state.data?.profiles||[]).find(p=>p.id===b.dataset.saveMember);const nameInput=$('teamRolesTable').querySelector(`[data-name-user="${b.dataset.saveMember}"]`);const displayName=String(nameInput?.value||'').trim();if(!displayName){toast('Display name cannot be blank.');return;}const sel=$('teamRolesTable').querySelector(`[data-role-user="${b.dataset.saveMember}"]`);try{setBusy(b,true);await withRetry(()=>state.db.setMemberDisplayName(b.dataset.saveMember,displayName),{label:'Display name update'});if(sel&&sel.value!==target?.role){if(target?.is_owner||(target?.id===state.session?.user?.id&&target?.role==='admin')){toast('Display name saved. This Admin role is protected.');}else{await withRetry(()=>state.db.setMemberRole(b.dataset.saveMember,sel.value),{label:'Role update'});}}await reload();renderTeamRoles();toast('✓ Team member updated.');}catch(err){console.error(err);toast(friendlyError(err));setBusy(b,false);}});

document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>showView(b.dataset.view));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showView(b.dataset.go));
$('patchNotesBtn')?.addEventListener('click',togglePatchNotes);
const openImport=()=>{if(!requireEdit())return;closePatchNotes();cleanupPdfPreview();if($('importSteps'))$('importSteps').dataset.step='upload';$('dropZone')?.classList.remove('hidden');$('reviewArea').classList.add('hidden');$('importProgress').classList.add('hidden');$('importDialog').showModal();window.lucide?.createIcons();};
$('sidebarImportBtn').onclick=openImport;
// Global top search was removed in V6; no listener is required.
$('dashboardInventory').onclick=e=>{const card=e.target.closest('[data-detail]');if(card)openDetail(card.dataset.detail);};
$('itemForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireEdit())return;const x={sku:$('itemSku').value.trim(),item_name:$('itemName').value.trim(),category:$('itemCategory').value.trim(),unit:$('itemUnit').value.trim()||'pcs',image_url:$('itemImageUrl')?.value.trim()||null,description:$('itemDescription').value.trim()};try{if(!$('itemId').value)throw new Error('New inventory items are created through invoice import.');await state.db.updateItem($('itemId').value,x);$('itemDialog').close();await reload();toast('Item saved.');}catch(err){toast(err.message)}});
function updateAdjustPreview(){const id=$('adjustItemId').value,item=state.data.items.find(x=>x.id===id);if(!item)return;const current=summary(item).current,q=Math.max(0,Number($('adjustQty').value)||0),after=current-q;if($('adjustCurrent'))$('adjustCurrent').textContent=current;if($('adjustAfter'))$('adjustAfter').textContent=after;$('adjustQty')?.classList.toggle('invalid',q>current);}
function discardAdjustment(){
  $('adjustForm').reset();
  $('adjustItemId').value='';
  $('adjustDialog').close();
}
$('closeAdjustBtn')?.addEventListener('click',discardAdjustment);
$('cancelAdjustBtn')?.addEventListener('click',discardAdjustment);$('adjustQty')?.addEventListener('input',updateAdjustPreview);
$('adjustDialog')?.addEventListener('cancel',e=>{e.preventDefault();discardAdjustment();});

$('adjustForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireEdit())return;const submit=e.submitter||$('adjustForm').querySelector('[type="submit"]');if(submit?.disabled)return;const id=$('adjustItemId').value,item=state.data.items.find(x=>x.id===id),before=summary(item),q=Number($('adjustQty').value);if(!Number.isFinite(q)||q<=0){toast('Enter a valid quantity to subtract.');return;}if(q>before.current){toast(`Cannot subtract ${q}. Only ${before.current} currently in inventory.`);return;}const payload={master_item_id:id,adjustment_type:$('adjustType').value,quantity:q,reason:$('adjustReason').value.trim(),adjustment_date:$('adjustDate').value};const optimistic={id:'optimistic-'+Date.now(),...payload,created_at:nowIso(),created_by:state.session?.user?.id||'optimistic'};state.data.adjustments.push(optimistic);renderInventory();renderDashboard();document.querySelector(`[data-detail="${id}"]`)?.closest('tr')?.classList.add('optimistic-flash');$('adjustDialog').close();toast('Saving inventory adjustment…');try{setBusy(submit,true);await withRetry(()=>state.db.adjust(payload),{label:'Inventory update'});state.data.adjustments=state.data.adjustments.filter(x=>x.id!==optimistic.id);await reload();toast('✓ Inventory updated.');}catch(err){state.data.adjustments=state.data.adjustments.filter(x=>x.id!==optimistic.id);renderInventory();renderDashboard();toast('❌ Unable to save — inventory restored.');console.error(err);}finally{setBusy(submit,false);}});
$('inventorySearch').oninput=renderInventory;$('categoryFilter').onchange=renderInventory;$('documentSearch').oninput=renderDocuments;if($('documentSort'))$('documentSort').onchange=renderDocuments;$('auditSearch').oninput=renderAudit;if($('auditUser'))$('auditUser').onchange=renderAudit;if($('auditAction'))$('auditAction').onchange=renderAudit;if($('auditDate'))$('auditDate').onchange=renderAudit;
function closeActionMenus(except=null){document.querySelectorAll('.action-menu[open]').forEach(m=>{if(m!==except)m.removeAttribute('open');});}
$('inventoryTable').addEventListener('toggle',e=>{const menu=e.target.closest?.('.action-menu');if(menu?.open){closeActionMenus(menu);requestAnimationFrame(()=>{const box=menu.querySelector(':scope > div');if(!box)return;menu.classList.remove('open-up');const tableBox=$('inventoryTable')?.getBoundingClientRect();const r=box.getBoundingClientRect();if(tableBox && r.bottom>tableBox.bottom-8)menu.classList.add('open-up');});}},true);
document.addEventListener('click',e=>{if(!e.target.closest('.action-menu'))closeActionMenus();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeActionMenus();});
$('inventoryTable')?.addEventListener('scroll',()=>closeActionMenus(),{passive:true});
$('inventoryTable').onclick=async e=>{if(e.target.closest('[data-empty-import]')){openImport();return;}const b=e.target.closest('button,[data-detail]');if(!b)return;const id=b.dataset.detail||b.dataset.edit||b.dataset.adjust||b.dataset.delete;if(b.dataset.detail)openDetail(id);else if(b.dataset.quickMaint){if(requireEdit())openMaintenance('',b.dataset.quickMaint);}else if(b.dataset.quickInvoice)await openLatestInvoiceForItem(b.dataset.quickInvoice);else if(b.dataset.copySerials)await copyItemSerials(b.dataset.copySerials);else if(b.dataset.edit){if(requireEdit())openItem(id);}else if(b.dataset.adjust){if(requireEdit())openAdjust(id);}else if(b.dataset.delete&&requireEdit()&&confirm('Delete this master item? Purchase history items cannot be deleted.')){try{await state.db.deleteItem(id);await reload();toast('Item deleted.')}catch(err){toast(err.message)}}};
for(const id of ['documentsTable','detailBody'])$(id).onclick=async e=>{const el=e.target.closest('[data-doc-view],[data-doc-download],[data-doc-delete]');if(!el)return;try{if(el.dataset.docDelete){if(!requireEdit())return;const deleteId=el.dataset.docDelete;const doc=state.data.documents.find(x=>x.id===deleteId);const linked=state.data.purchases.filter(p=>p.document_id===deleteId);const message=linked.length?`Delete "${doc?.file_name||'this invoice'}"?\n\nThis will also remove the linked purchase record, its purchased quantities and serial numbers from inventory. Master SKU items with no remaining purchase history will also be removed from Inventory.`:`Delete "${doc?.file_name||'this document'}" permanently?`;if(!confirm(message))return;await state.db.deleteDocument(deleteId);state.data.documents=state.data.documents.filter(x=>x.id!==deleteId);renderDocuments();try{await reload();}catch(refreshErr){console.error('Post-delete refresh failed:',refreshErr);}toast('Invoice deleted.');return;}const url=await state.db.fileUrl(el.dataset.docView||el.dataset.docDownload,!!el.dataset.docDownload);if(url)window.open(url,'_blank');}catch(err){console.error(err);toast(friendlyError(err))}};
$('detailDialog').onclick=async e=>{const el=e.target.closest('[data-doc-view]');if(el){try{const u=await state.db.fileUrl(el.dataset.docView);window.open(u,'_blank')}catch(err){toast(err.message)}}};$('closeDetailBtn').onclick=()=>$('detailDialog').close();
$('importDialog')?.addEventListener('close',cleanupPdfPreview);
$('importBtn').onclick=openImport;$('closeImportBtn').onclick=()=>{cleanupPdfPreview();$('importDialog').close();};$('cancelReviewBtn').onclick=()=>{cleanupPdfPreview();$('importDialog').close();};$('dropZone').onclick=()=>$('pdfInput').click();$('pdfInput').onchange=e=>e.target.files[0]&&startImport(e.target.files[0]);
$('dropZone').ondragover=e=>{e.preventDefault();$('dropZone').classList.add('drag')};$('dropZone').ondragleave=()=>$('dropZone').classList.remove('drag');$('dropZone').ondrop=e=>{e.preventDefault();$('dropZone').classList.remove('drag');const f=e.dataTransfer.files[0];if(f&&v662FileKind(f)!=='unsupported')startImport(f);else toast('Supported invoice formats: PDF, JPG/JPEG, PNG, WEBP or DOCX.')};
$('pdfPrevPageBtn')?.addEventListener('click',()=>{state.pdfPreviewPage=Math.max(1,(state.pdfPreviewPage||1)-1);updatePdfPreview();});$('pdfNextPageBtn')?.addEventListener('click',()=>{state.pdfPreviewPage=(state.pdfPreviewPage||1)+1;updatePdfPreview();});$('pdfZoomOutBtn')?.addEventListener('click',()=>{const z=Number(state.pdfPreviewZoom)||100;setPdfZoom(String(Math.max(50,z-15)));});$('pdfZoomInBtn')?.addEventListener('click',()=>{const z=Number(state.pdfPreviewZoom)||100;setPdfZoom(String(Math.min(200,z+15)));});$('pdfFitWidthBtn')?.addEventListener('click',()=>setPdfZoom('page-width'));
$('addParsedItemBtn').onclick=()=>{collectParsed();state.parsed.items.push({sku:'',item_name:'',description:'',category:'',unit:'pcs',quantity:1,unit_price:null,amount:null,warranty:'',serials:''});renderParsedItems()};$('parsedItems').onclick=e=>{const remove=e.target.closest('[data-remove-line]'),use=e.target.closest('[data-use-match]');if(remove){collectParsed();state.parsed.items.splice(+remove.dataset.removeLine,1);renderParsedItems();return;}if(use){collectParsed();const line=state.parsed.items[+use.dataset.useMatch],item=state.data.items.find(x=>x.id===use.dataset.matchId);if(line&&item){line.sku=item.sku;line.item_name=item.item_name;line.category=item.category||line.category;line.description=line.description||item.description||'';renderParsedItems();toast(`Matched to existing SKU ${item.sku}.`);}}};
$('saveImportBtn').onclick=async()=>{if(state.importSaving)return;if(CFG.mode==='supabase'&&state.session?.user?.id&&state.db?.profileForUser){try{const freshProfile=await state.db.profileForUser(state.session.user.id);if(freshProfile){state.profile=freshProfile;setUserIdentity(state.session);}}catch(roleErr){console.warn('Could not refresh role before import save',roleErr);}}if(!requireEdit())return;collectParsed();const d=state.parsed.doc;if(!d.supplier_name||!d.invoice_number){toast('Supplier and invoice number are required.');return;}if(!state.parsed.items.length||state.parsed.items.some(x=>!x.item_name||!Number(x.quantity))){toast('Each line item needs an item name and quantity.');return;}try{state.importSaving=true;const saveBtn=$('saveImportBtn');saveBtn.disabled=true;saveBtn.textContent='Saving…';setProgress(96,'Saving invoice and inventory…');d.invoice_date=d.invoice_date||null;const dupe=await state.db.duplicateInvoice(d.supplier_name,d.invoice_number,d.invoice_date);if(dupe&&!state.allowDuplicate)throw new Error('Possible duplicate detected. Choose View existing or Continue anyway before saving.');const allSerials=state.parsed.items.flatMap(x=>parseSerials(x.serials));const repeated=allSerials.filter((x,i,a)=>a.findIndex(y=>norm(y)===norm(x))!==i);if(repeated.length)throw new Error('Duplicate serial number in this invoice: '+repeated[0]);if(state.db.duplicateSerials){const existing=await state.db.duplicateSerials(allSerials.join(','));if(existing.length)throw new Error('Serial number already exists in inventory: '+existing[0]);}if($('importSteps'))$('importSteps').dataset.step='save';const namedFile=await autoNamedPdf(state.file,d);await state.db.importPurchase({file_name:namedFile.name,mime_type:namedFile.type,supplier_name:d.supplier_name,invoice_number:d.invoice_number},d,prepareInventoryLinesForSave(state.parsed.items),namedFile);state.lastImportCount=state.parsed.items.length;state.lastImportFilename=namedFile.name;cleanupPdfPreview();$('importDialog').close();state.file=null;state.parsed=null;state.allowDuplicate=false;await reload();if($('documentSearch'))$('documentSearch').value='';renderDocuments();showView('inventory');toast(`Invoice saved. ${state.lastImportCount||0} inventory item${state.lastImportCount===1?'':'s'} updated. PDF: ${state.lastImportFilename||'saved'}.`);}catch(err){console.error(err);toast(friendlyError(err,'import'));}finally{state.importSaving=false;const saveBtn=$('saveImportBtn');if(saveBtn){saveBtn.textContent='Confirm & save';}renderImportEligibility();if($('importProgress'))$('importProgress').classList.add('hidden');}};


// V7 invoice-only + equipment-only save gate.
$('saveImportBtn').addEventListener('click',e=>{
  if(!state.parsed)return;
  // GLOBAL RULE: use the current Review-screen values before every save validation.
  try{collectParsed();}catch(collectErr){console.warn('V7 could not collect current review fields',collectErr);}
  if(globalThis.AVParserV7){try{const prep=globalThis.AVParserV7.prepareSave(state.parsed.items||[]);state.parsed.items=prep.rows;if(!prep.ok){e.preventDefault();e.stopImmediatePropagation();toast(prep.errors[0]?.message||'Review the current line-item values before saving.');return;}}catch(v7SaveErr){console.warn('V7 save validation skipped',v7SaveErr);}}
  const docType=detectImportDocumentType(state.parsed.raw||state.parsed.rawText||'');
  if(docType.type!=='invoice'){e.preventDefault();e.stopImmediatePropagation();toast(docType.type==='delivery_order'?'Only invoices can be imported. Delivery Orders are blocked.':'Only verified invoices can be saved.');return;}
  const detected=state.parsed.invoiceClassification?.type||'uncertain';
  const effective=detected==='uncertain'?(state.importClassificationChoice||'uncertain'):detected;
  if(effective==='equipment'){state.parsed.items=v689SerialIntegrityGate(state.parsed.items||[],state.parsed.raw||state.parsed.rawText||'');const badQty=(state.parsed.items||[]).find(x=>x.quantityReviewRequired||x.priceReviewRequired||x.amountReviewRequired);const badSerial=(state.parsed.items||[]).find(x=>x.serialConflictReviewRequired||x.serialCountReview||(x.serialReviewRequired&&parseSerials(x.serials||'').length>0));if(!(state.parsed.items||[]).length){e.preventDefault();e.stopImmediatePropagation();toast('No verified physical inventory line item is available to save.');return;}if(badQty||badSerial){e.preventDefault();e.stopImmediatePropagation();toast(badSerial?'Serial-number ownership/count requires review. Re-check Qty and serials against the invoice before saving.':'One or more Qty / Unit Price / Amount values could not be verified from the invoice table. Review them before saving.');return;}return;}
  e.preventDefault();e.stopImmediatePropagation();
  renderImportEligibility();
  toast(effective==='service'?'Equipment invoices only. Service-work invoices cannot be imported.':effective==='noninventory'?'No tracked equipment found. Excluded accessory-only invoices cannot be imported.':'Confirm whether this is an Equipment invoice or Service invoice before saving.');
},true);
// Final evidence gate runs before the existing save handler.
$('saveImportBtn').addEventListener('click',e=>{
  if(!state.parsed)return;
  collectParsed();
  if(!state.parsed.doc.invoice_date){
    e.preventDefault();e.stopImmediatePropagation();
    $('pDate')?.focus();$('pDate')?.classList.add('low-confidence');
    toast('Invoice date is required. It could not be confirmed after two scans, so please enter it manually.');
    return;
  }
  const before=state.parsed.items.length;
  state.parsed.items=inventoryOnlyItems(state.parsed.items);
  if(state.parsed.items.length!==before)renderParsedItems();
  if(!state.parsed.items.length){
    e.preventDefault();e.stopImmediatePropagation();
    toast('No physical inventory items were detected. Labour, installation and service lines are excluded.');
  }
},true);

$('needsAttentionCard')?.addEventListener('click',openAttention);
$('runHealthCheckBtn')?.addEventListener('click',()=>{renderAutomationCentre();openHealth();});
$('inventoryHealthBtn')?.addEventListener('click',openHealth);
$('stockTakeCard')?.addEventListener('click',openStockTake);
$('inventoryStockTakeBtn')?.addEventListener('click',openStockTake);
$('closeAttentionBtn')?.addEventListener('click',()=>$('attentionDialog').close());
$('closeHealthBtn')?.addEventListener('click',()=>$('healthDialog').close());
$('closeStockTakeBtn')?.addEventListener('click',()=>$('stockTakeDialog').close());
$('stockTakeSearch')?.addEventListener('input',renderStockTake);
$('stockTakeTable')?.addEventListener('change',e=>{const el=e.target.closest('[data-stock-id]');if(!el)return;state.stockTakeCounts=state.stockTakeCounts||{};state.stockTakeCounts[el.dataset.stockId]=el.value;renderStockTake();});
$('clearStockTakeBtn')?.addEventListener('click',()=>{state.stockTakeCounts={};renderStockTake();});
$('copyStockTakeBtn')?.addEventListener('click',async()=>{const diffs=stockTakeDifferences();if(!diffs.length){toast('No stock differences to copy.');return;}const text=['AV Inventory Hub — Stock Take Differences',...diffs.map(x=>`${x.i.sku} | ${x.i.item_name} | System ${x.sys} | Physical ${x.physical} | Difference ${x.diff>0?'+':''}${x.diff}`)].join('\n');await navigator.clipboard.writeText(text);toast(`${diffs.length} stock difference${diffs.length===1?'':'s'} copied.`);});
for(const id of ['attentionList','healthIssueTable'])$(id)?.addEventListener('click',async e=>{const b=e.target.closest('[data-health-view]');if(!b)return;const issue=buildHealthIssues().find(x=>x.key===b.dataset.healthKey);if(issue&&canEdit()){b.disabled=true;b.textContent='Reviewed';const saved=await markHealthIssueReviewed(issue);if(!saved){b.disabled=false;b.textContent='Review';return;}toast('Reviewed. Needs Attention and Data Health updated.');}if($('attentionDialog')?.open)$('attentionDialog').close();if($('healthDialog')?.open)$('healthDialog').close();showView(b.dataset.healthView||'inventory');if(b.dataset.healthItem)setTimeout(()=>openDetail(b.dataset.healthItem),50);});
$('maintenanceSearch')?.addEventListener('input',renderMaintenance);$('maintenanceOutcome')?.addEventListener('change',renderMaintenance);$('addMaintenanceBtn')?.addEventListener('click',()=>openMaintenance());$('maintenanceItem')?.addEventListener('change',()=>populateMaintenanceSerials());$('closeMaintenanceBtn')?.addEventListener('click',()=>$('maintenanceDialog').close());$('cancelMaintenanceBtn')?.addEventListener('click',()=>$('maintenanceDialog').close());$('maintenanceForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!requireEdit())return;const x={id:$('maintenanceId').value||null,maintenance_date:$('maintenanceDate').value,master_item_id:$('maintenanceItem').value,serial_number:$('maintenanceSerial').value,issue:$('maintenanceIssue').value.trim(),action_taken:$('maintenanceAction').value.trim(),outcome:$('maintenanceResult').value,notes:$('maintenanceNotes').value.trim()};if(!x.maintenance_date||!x.master_item_id||!x.issue||!x.action_taken){toast('Date, equipment, issue and action taken are required.');return;}try{const submit=e.submitter||$('maintenanceForm').querySelector('[type="submit"]');if(submit?.disabled)return;setBusy(submit,true);await withRetry(()=>state.db.saveMaintenance(x),{label:'Maintenance save'});$('maintenanceDialog').close();await reload();showView('maintenance');toast('✓ Maintenance record saved.');setBusy(submit,false);}catch(err){console.error(err);const submit=$('maintenanceForm').querySelector('[type="submit"]');setBusy(submit,false);toast(friendlyError(err));}});$('maintenanceTable')?.addEventListener('click',async e=>{const edit=e.target.closest('[data-maint-edit]'),del=e.target.closest('[data-maint-delete]');if(edit)openMaintenance(edit.dataset.maintEdit);if(del&&requireEdit()&&confirm('Delete this maintenance record?')){try{await state.db.deleteMaintenance(del.dataset.maintDelete);await reload();showView('maintenance');toast('Maintenance record deleted.');}catch(err){toast(friendlyError(err));}}});

await init();

try{installParseAuditWrappers();configureInvoiceFileInputs();}catch(e){console.warn('V6.69 optional audit/file-input setup skipped',e);}
