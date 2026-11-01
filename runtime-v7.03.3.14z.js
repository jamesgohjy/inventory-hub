Warning: truncated output (original token count: 168806)
Total output lines: 5866

// Inventory Hub direct application runtime — v7.03.3.14z
function v703314nPreprocessCanvas(input){
  const c=document.createElement('canvas');c.width=input.width;c.height=input.height;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(input,0,0);
  try{const img=ctx.getImageData(0,0,c.width,c.height),d=img.data,hist=new Uint32Array(256);let pixels=0;
    for(let i=0;i<d.length;i+=4){const g=Math.max(0,Math.min(255,Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2])));hist[g]++;pixels++;}
    const percentile=p=>{let n=0,target=Math.max(1,Math.floor(pixels*p));for(let i=0;i<256;i++){n+=hist[i];if(n>=target)return i;}return p<.5?0:255;};
    const low=percentile(.02),high=percentile(.98),span=Math.max(32,high-low);
    for(let i=0;i<d.length;i+=4){let g=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);g=Math.max(0,Math.min(255,Math.round((g-low)*255/span)));if(g>244)g=255;else if(g<18)g=0;d[i]=d[i+1]=d[i+2]=g;}ctx.putImageData(img,0,0);
  }catch(err){console.warn('OCR preprocessing could not complete; original image remains available.',err);}return c;
}
window.__AV_DIRECT_RUNTIME_READY__=(async function InventoryHubDirectRuntime14s(){
  if(!window.InventoryHubParserEvidenceEngine?.rankCandidateSets)throw new Error('Parser evidence engine did not initialise.');
  if(!window.InventoryHubCanonicalParser?.normalizeResult)throw new Error('Canonical parser API did not initialise.');
  if(!window.InventoryHubParserTable?.parseHeaderAlignedLayout)throw new Error('Parser table module did not initialise.');
  // Final canonical boundary: never expose installation/service descriptions as
  // inventory rows, even when a recovery candidate supplied a SKU-like token.
  const _canonicalFromPipeline=window.InventoryHubCanonicalParser.fromPipeline;
  if(!_canonicalFromPipeline.__serviceBoundary14z){
    const wrappedCanonical=function(...args){
      const out=_canonicalFromPipeline.apply(this,args);
      if(out&&Array.isArray(out.items))out.items=out.items.filter(item=>!isNonInventoryServiceLine({
        ...item,item_name:item?.item_name||item?.name||item?.standard_item_name||''
      }));
      return out;
    };wrappedCanonical.__serviceBoundary14z=true;window.InventoryHubCanonicalParser.fromPipeline=wrappedCanonical;
  }
  if(!window.InventoryHubGroupedCompanyUI?.renderGroupedCompanyCards)throw new Error('Grouped company UI module did not initialise.');
// AV Inventory Hub V7.00 — Structured parser core + regression-safe migration
const APP_VERSION='7.03.3.14z';
const RELEASE_CURRENT_NOTES=[
  'Parser V4 is now the production import engine after the full promotion regression gate passed.',
  'Invoice and Tax Invoice pages are authoritative; quotation, PO, DO and standalone schedule pages cannot create or repair inventory rows.',
  'Serial labels such as S/N, Serial No and Serial Number now preserve wrapped serial lists and bind them to the nearest verified equipment row.',
  'Recent Inventory Items now use 3D futuristic equipment artwork matched to supported AV equipment types.'
];
// Upcoming notes are intentionally manual. Edit only this list for the next release preview.
// Items already delivered in the current release must not remain here.
const RELEASE_UPCOMING_NOTES=[
  'Improve parsing across more invoice layouts.',
  'Improve automatic item matching and consolidation.',
  'Simplify review messages and workflow.'
];
const RELEASE_UPCOMING_VERSION='7.03.3.15';
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
      this.sb.from('master_items').select('*').order('item_name'),this.sb.from('purchases').select('*').order('invoice_date',{ascending:false}),this.sb.from('purchase_items').select('*'),this.sb.from('serial_numbers').select('*'),this.sb.from('inventory_adjustments').select('*'),this.sb.from('documents').select('*').order('uploaded_at',{ascending:false}),this.sb.from('maintenance_records').select('*').order('maintenance_date',{ascending:false}),this.sb.from('audit_log').select('*').order('changed_at',{ascending:false}).limit(500),this.sb.from('profiles').select('id,email,display_name,role,is_owner'),this.sb.from('health_issue_reviews').select('*').order('reviewed_at',{ascending:false})
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
      const rpcLines=lines.map(line=>({...line,quantity:Number(line.quantity),unit_price:line.unit_price===''||line.unit_price==null?'':String(line.unit_price),amount:line.amount===''||line.amount==null?'':String(line.amount),serial_numbers:parseSerials(line.serials),canonical_identity:line.canonical_identity||window.InventoryHubCanonicalParser.canonicalIdentity(line),invoice_evidence:line.invoice_evidence||{original_sku:line.sku||'',original_model:line.model||'',original_brand:line.brand||'',original_description:line.description||line.item_name||'',original_quantity:line.quantity??null,original_unit_price:line.unit_price??null,original_amount:line.amount??null}}));
      const atomic=await this.sb.rpc('confirm_and_save_invoice_v703314v',{p_document:{...doc,storage_path:path},p_purchase:cleanPurchase,p_lines:rpcLines});
      if(atomic.error){if(['42883','PGRST202'].includes(String(atomic.error.code||''))||String(atomic.error.message||'').includes('confirm_and_save_invoice_v703314v'))throw new Error('v7.03.3.14v database migration is required before Confirm & Save.');throw atomic.error;}
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

const state={db:null,data:null,parsed:null,file:null,session:null,profile:null,pdfPreviewUrl:null,pdfPreviewPage:1,pdfPreviewZoom:'page-width',pdfLayout:null,ocrCandidates:null,v2FullDocumentEvidence:null,v411NumericCellOcrEvidence:null,importHumanReviewApproved:false,masterDuplicateAutoMergeError:null};
const prettyEmailName=(email='')=>{const base=String(email||'').split('@')[0];return base.replace(/[._-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase()).trim()||'Team Member';};
const currentRole=()=>CFG.mode==='supabase'?String(state.profile?.role||'viewer').trim().toLowerCase():'admin';
const canEdit=()=>['admin','editor'].includes(currentRole());
const canManageRoles=()=>currentRole()==='admin';
const requireEdit=()=>{if(canEdit())return true;toast('Viewer access is read-only.');return false;};
const num=(v)=>v===null||v===undefined||v===''?null:Number(String(v).replace(/,/g,''));
const hasNumericValue=(v)=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v));
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

function v703314zMasterDuplicatePolicy(){
  const api=globalThis.V7033Patch;
  return api?.masterItemDuplicatePolicy?api.masterItemDuplicatePolicy(state.data?.items||[]):{autoMergeGroups:[],reviewGroups:[]};
}
function v703314zMergePayload(target={},source={}){
  const td=String(target.description||'').trim(),sd=String(source.description||'').trim();
  const description=td.length>=sd.length?td:sd;
  return {
    sku:String(target.sku||'').trim(),
    item_name:String(target.item_name||source.item_name||'').trim(),
    category:String(target.category||source.category||'').trim(),
    unit:String(target.unit||source.unit||'pcs').trim()||'pcs',
    description,
    image_url:target.image_url||source.image_url||null
  };
}
async function v703314zAutoMergeExactMasterDuplicates(){
  if(!canEdit())return {merged:0,groups:0,skipped:'role'};
  const policy=v703314zMasterDuplicatePolicy();
  if(!policy.autoMergeGroups.length){state.masterDuplicateAutoMergeError=null;return {merged:0,groups:0};}
  let merged=0;const failures=[];
  for(const group of policy.autoMergeGroups){
    const target=group.canonical;
    for(const source of group.duplicates||[]){
      try{
        await v703314dMergeMasterItems(source,target,v703314zMergePayload(target,source));
        merged++;
      }catch(err){
        const msg=String(err?.message||err||'');
        if(/Source Master Item was not found|Source or target item no longer exists|disappeared before merge/i.test(msg))continue;
        failures.push({source:source.id,target:target.id,message:msg});
      }
    }
  }
  state.masterDuplicateAutoMergeError=failures.length?failures:null;
  return {merged,groups:policy.autoMergeGroups.length,failures};
}
async function reload(){
  if(CFG.mode==='supabase')setHealth('reconnecting','Reconnecting');
  let refreshPhase='load';
  try{
    state.data=await state.db.load();
    if(state.session){
      const liveProfile=(state.data.profiles||[]).find(p=>p.id===state.session.user?.id);
      if(liveProfile)state.profile={...(state.profile||{}),...liveProfile};
      setUserIdentity(state.session);
    }
    refreshPhase='auto merge';
    const autoMerge=await v703314zAutoMergeExactMasterDuplicates();
    if(autoMerge.merged>0){
      state.data=await state.db.load();
      if(state.session){const liveProfile=(state.data.profiles||[]).find(p=>p.id===state.session.user?.id);if(liveProfile)state.profile={...(state.profile||{}),...liveProfile};}
      console.info('Auto-merged exact Standard Item Name + SKU/Model duplicates',autoMerge);
    }
    refreshPhase='render';
    renderAll();
    if(autoMerge.merged>0)toast('Merged '+autoMerge.merged+' exact duplicate Master Item'+(autoMerge.merged===1?'':'s')+'.');
    setHealth('live',CFG.mode==='supabase'?'Live':'Demo mode');
  }catch(e){
    console.error('Inventory refresh failed at '+refreshPhase+': '+String(e?.message||e),{code:e?.code||'',details:e?.details||''});
    setHealth('offline','Offline');
    throw e;
  }
}
async function refreshAfterCommittedImport(){
  for(let attempt=1;attempt<=3;attempt++){
    try{await reload();return true;}
    catch(err){
      console.warn('Invoice committed, but the post-save refresh failed',err);
      if(attempt<3)await new Promise(resolve=>setTimeout(resolve,350*attempt));
    }
  }
  return false;
}
function iconForItem(item){const c=norm([item.category,item.item_name,item.description].join(' '));if(c.includes('microphone')||c.includes('wireless')||c.includes('audio'))return'mic-2';if(c.includes('cable')||c.includes('hdmi'))return'cable';if(c.includes('display')||c.includes('monitor')||c.includes('screen'))return'monitor';if(c.includes('projector'))return'projector';if(c.includes('camera'))return'camera';if(c.includes('speaker'))return'speaker';return'package';}
const DASH_ASSETS={projector:'data:image/jpeg;base64,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',microphone:'data:image/jpeg;base64,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…118806 tokens truncated…   $('attentionList').innerHTML=issues.length?issues.map(issueRow14i).join(''):'<div class="empty">No active findings. Your records look healthy.</div>';
      $('attentionDialog').showModal();window.lucide?.createIcons();
    };

    function renderHealthOpen(){
      const issues=buildHealthIssues();
      const rows=issues.map(x=>'<tr><td><span class="health-pill '+esc(x.severity)+'">'+esc(x.severity)+'</span></td><td>'+(x.review?'<span class="health-history-status still">Reviewed · still detected</span>':'<span class="health-history-status open">Open</span>')+'</td><td>'+esc(x.type)+'</td><td>'+esc(x.title)+'</td><td>'+esc(x.detail)+'</td><td>'+issueReviewButton(x)+'</td></tr>').join('');
      $('healthIssueTable').innerHTML=rows?'<table><thead><tr><th>Priority</th><th>Status</th><th>Check</th><th>Record</th><th>Finding</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="empty">No active findings.</div>';
    }
    function renderHealthHistory(){
      const history=healthHistory();
      const rows=history.map(r=>{
        const current=r.current_issue;
        const status=r.resolution_status==='resolved'
          ?'<span class="health-history-status resolved">Resolved</span>'
          :'<span class="health-history-status still">Still detected</span>';
        const open=current?'<button class="secondary small-btn" type="button" data-health-open="'+esc(current.key)+'">Open current</button>':'';
        return '<tr><td>'+status+'</td><td>'+esc(r.issue_type||'Finding')+'</td><td>'+esc(r.title||'—')+'</td><td>'+esc(r.detail||'—')+'</td><td>'+esc(r.reviewed_by_name)+'<br><span class="muted">'+esc(fmtDT(r.reviewed_at))+'</span></td><td>'+open+'</td></tr>';
      }).join('');
      $('healthIssueTable').innerHTML=rows?'<table><thead><tr><th>Resolution</th><th>Check</th><th>Record</th><th>Reviewed finding</th><th>Reviewed by</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="empty">No reviewed Data Health history yet.</div>';
    }

    function renderHealthDialog14i(){
      const issues=buildHealthIssues(),score=healthScore(issues),history=healthHistory(),resolved=history.filter(x=>x.resolution_status==='resolved').length,still=history.length-resolved;
      $('healthDialogSummary').innerHTML='<div class="health-overview health-overview-14i"><div class="health-overview-score"><strong>'+score+'%</strong><span>'+esc(healthLabel(score))+'</span></div><div class="health-resolution-summary"><span><strong>'+issues.length+'</strong> active</span><span><strong>'+resolved+'</strong> resolved</span><span><strong>'+still+'</strong> reviewed / still detected</span></div><div class="health-tabs"><button type="button" class="'+(healthTab==='open'?'active':'')+'" data-health-tab="open">Open findings</button><button type="button" class="'+(healthTab==='history'?'active':'')+'" data-health-tab="history">Review history ('+history.length+')</button></div></div>';
      healthTab==='history'?renderHealthHistory():renderHealthOpen();
      window.lucide?.createIcons();
    }

    openHealth=function(){healthTab='open';renderHealthDialog14i();$('healthDialog').showModal();};

    function openCurrentIssue(key){
      const issue=(buildAllHealthIssues()||[]).find(x=>String(x.key)===String(key));
      if(!issue){toast('This finding is no longer detected. It is now resolved.');renderHealthDialog14i();return;}
      if($('attentionDialog')?.open)$('attentionDialog').close();
      if($('healthDialog')?.open)$('healthDialog').close();
      showView(issue.view||'inventory');
      if(issue.item_id)setTimeout(()=>openDetail(issue.item_id),50);
    }

    for(const id of ['attentionList','healthIssueTable','healthDialogSummary']){
      const el=document.getElementById(id);if(!el||el.dataset.v703314iHealthBound==='1')continue;
      el.dataset.v703314iHealthBound='1';
      el.addEventListener('click',async e=>{
        const tab=e.target.closest('[data-health-tab]');
        if(tab){e.preventDefault();e.stopImmediatePropagation();healthTab=tab.dataset.healthTab==='history'?'history':'open';renderHealthDialog14i();return;}
        const open=e.target.closest('[data-health-open]');
        if(open){e.preventDefault();e.stopImmediatePropagation();openCurrentIssue(open.dataset.healthOpen);return;}
        const review=e.target.closest('[data-health-review]');
        if(review){
          e.preventDefault();e.stopImmediatePropagation();
          const issue=(buildAllHealthIssues()||[]).find(x=>String(x.key)===String(review.dataset.healthReview));
          if(!issue){toast('This finding is no longer detected.');renderHealthDialog14i();return;}
          review.disabled=true;
          const saved=await markHealthIssueReviewed(issue);
          if(saved){
            toast('Review recorded. The finding stays open until the underlying condition is corrected.');
            if($('healthDialog')?.open)renderHealthDialog14i();
            if($('attentionDialog')?.open)openAttention();
          }else review.disabled=false;
          return;
        }
      },true);
    }

    function isMergeAudit(a){return a?.entity_type==='master_items_merge'||String(a?.action||'').toUpperCase()==='MERGE';}
    function mergeDetails(a){
      const o=a?.old_data||{},n=a?.new_data||{},source=o.source||{},targetBefore=o.target_before||{},target=n.target||{};
      const targetSku=target.sku||targetBefore.sku||'Master Item';
      const moved=n.moved_rows&&typeof n.moved_rows==='object'?n.moved_rows:{};
      return {
        sourceSku:source.sku||'Master Item',
        sourceName:source.item_name||'',
        targetSku,
        targetName:target.item_name||targetBefore.item_name||'',
        totalPurchased:Number(n.total_purchased||0),
        totalAdjusted:Number(n.total_adjusted||0),
        currentInventory:Number(n.current_inventory||0),
        serialCount:Number(n.serial_count||0),
        maintenanceCount:n.maintenance_count==null?null:Number(n.maintenance_count||0),
        movedRows:moved
      };
    }

    auditIcon=function(a){return isMergeAudit(a)?['git-merge','merge']:previousAuditIcon(a);};
    auditLabel=function(a){return isMergeAudit(a)?['Merged','merged']:previousAuditLabel(a);};
    friendlyAudit=function(a){
      if(!isMergeAudit(a))return previousFriendlyAudit(a);
      const d=mergeDetails(a);
      return 'Merged '+d.sourceSku+' into '+d.targetSku+' — '+d.totalPurchased+' purchased, '+d.currentInventory+' current, '+d.serialCount+' serial'+(d.serialCount===1?'':'s');
    };

    consolidatedAudit=function(){
      const list=previousConsolidatedAudit();
      const merges=list.filter(isMergeAudit);
      if(!merges.length)return list;
      return list.filter(row=>{
        if(isMergeAudit(row))return true;
        for(const merge of merges){
          if(!sameAuditActor(merge,row)||!nearAuditTime(merge,row,15000))continue;
          const d=mergeDetails(merge),o=row.old_data||{},n=row.new_data||{};
          const sourceId=String((merge.old_data||{}).source?.id||''),targetId=String((merge.new_data||{}).target?.id||(merge.old_data||{}).target_before?.id||'');
          const rowId=String(row.entity_id||n.id||o.id||'');
          if(row.entity_type==='master_items'&&row.action==='DELETE'&&sourceId&&rowId===sourceId)return false;
          if(row.entity_type==='master_items'&&row.action==='UPDATE'&&targetId&&rowId===targetId)return false;
          if(['purchase_items','serial_numbers','inventory_adjustments','maintenance_records'].includes(row.entity_type)&&row.action==='UPDATE'&&sourceId&&targetId&&String(o.master_item_id||'')===sourceId&&String(n.master_item_id||'')===targetId)return false;
        }
        return true;
      });
    };

    function mergeDetailHtml(a){
      const d=mergeDetails(a),moved=Object.entries(d.movedRows||{}).filter(([,v])=>Number(v)>0);
      const movedText=moved.length?moved.map(([k,v])=>esc(k.replaceAll('.master_item_id','').replaceAll('_',' '))+': <strong>'+Number(v)+'</strong>').join(' · '):'No relationship counts reported.';
      return '<div class="merge-audit-detail"><div><span>Removed source</span><strong>'+esc(d.sourceSku)+'</strong><small>'+esc(d.sourceName||'—')+'</small></div><div><span>Surviving item</span><strong>'+esc(d.targetSku)+'</strong><small>'+esc(d.targetName||'—')+'</small></div><div><span>Purchased</span><strong>'+d.totalPurchased+'</strong></div><div><span>Adjustments</span><strong>'+d.totalAdjusted+'</strong></div><div><span>Current inventory</span><strong>'+d.currentInventory+'</strong></div><div><span>Serials</span><strong>'+d.serialCount+'</strong></div><div><span>Maintenance</span><strong>'+(d.maintenanceCount==null?'—':d.maintenanceCount)+'</strong></div><p class="merge-audit-moved"><span>Relationships moved</span>'+movedText+'</p></div>';
    }

    renderAudit=function(){
      const q=norm($('auditSearch').value),uf=$('auditUser')?.value||'',af=$('auditAction')?.value||'',df=$('auditDate')?.value||'',prepared=consolidatedAudit();
      const list=prepared.filter(a=>{
        const actionGroup=isMergeAudit(a)?'MERGE':a.entity_type==='inventory_adjustments'?'ADJUST':a.action;
        return(!q||norm([friendlyAudit(a),auditWho(a),JSON.stringify(a.new_data),JSON.stringify(a.old_data)].join(' ')).includes(q))&&(!uf||auditWho(a)===uf)&&(!af||actionGroup===af)&&(!df||singaporeDateKey(a.changed_at)===df);
      });
      const users=[...new Set(prepared.map(auditWho).filter(Boolean))].sort();
      if($('auditUser')){const keep=$('auditUser').value;$('auditUser').innerHTML='<option value="">All users</option>'+users.map(u=>'<option '+(u===keep?'selected':'')+' value="'+esc(u)+'">'+esc(u)+'</option>').join('');}
      const rows=list.map(a=>{
        const [label,cls]=auditLabel(a),merge=isMergeAudit(a),detailId='mergeAudit-'+String(a.id||a.entity_id||Math.random()).replace(/[^a-zA-Z0-9_-]/g,'');
        return '<tr><td>'+fmtDT(a.changed_at)+'</td><td>'+esc(auditWho(a))+'</td><td><span class="badge '+cls+'">'+esc(label)+'</span></td><td>'+esc(friendlyAudit(a))+'</td><td>'+(merge?'<button type="button" class="secondary small-btn" data-merge-audit-toggle="'+detailId+'">Details</button>':'')+'</td></tr>'+(merge?'<tr id="'+detailId+'" class="merge-audit-detail-row hidden"><td colspan="5">'+mergeDetailHtml(a)+'</td></tr>':'');
      }).join('');
      $('auditTable').innerHTML=rows?'<table><thead><tr><th>Date / time</th><th>Who</th><th>Status</th><th>What</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="empty">No recent activities.</div>';
    };

    renderDashboard=function(){
      previousRenderDashboard();
      const list=consolidatedAudit().slice(0,6);
      $('recentAudit').innerHTML=list.map(a=>{const [icon,cls]=auditIcon(a);return '<div class="activity"><div class="activity-icon '+cls+'"><i data-lucide="'+icon+'"></i></div><div class="activity-body"><strong>'+esc(friendlyAudit(a))+'</strong><span>'+esc(auditWho(a))+' · '+fmtDT(a.changed_at)+'</span></div></div>';}).join('')||'<div class="empty">No activity yet.</div>';
      window.lucide?.createIcons();
    };

    const auditTable=document.getElementById('auditTable');
    if(auditTable&&auditTable.dataset.v703314iMergeBound!=='1'){
      auditTable.dataset.v703314iMergeBound='1';
      auditTable.addEventListener('click',e=>{
        const b=e.target.closest('[data-merge-audit-toggle]');if(!b)return;
        const row=document.getElementById(b.dataset.mergeAuditToggle);if(!row)return;
        const opening=row.classList.contains('hidden');row.classList.toggle('hidden',!opening);b.textContent=opening?'Hide details':'Details';
      });
    }

    try{renderAutomationCentre();renderAudit();renderDashboard();}catch(refreshErr){console.warn('V7.03.3.14i initial UI refresh skipped',refreshErr);}
    Object.assign(diagnostics,{installed:true,stage:'ready',currentIssues:()=>currentHealthIssues(),history:()=>healthHistory(),mergeDetails,consolidated:()=>consolidatedAudit()});
  }catch(err){
    diagnostics.stage='failed';diagnostics.error=String(err?.message||err);
    console.warn('V7.03.3.14i Data Health / merge-history enhancement failed non-fatally.',err);
  }
})();

(function v703314jInstallHealthManagementAndActivitySummaries(){
  const diagnostics=window.__AV_14J_DIAGNOSTICS__={version:'7.03.3.14j',installed:false,stage:'boot',error:null};
  try{
    if(window.__V703314J_HEALTH_ACTIVITY__){diagnostics.installed=true;diagnostics.stage='already-installed';return;}
    if(typeof state==='undefined'||!state?.data||typeof buildHealthIssues!=='function'||!window.__AV_14I_DIAGNOSTICS__?.installed){
      diagnostics.stage='dependencies-unavailable';
      diagnostics.error='V7.03.3.14i Data Health runtime is unavailable.';
      console.warn('V7.03.3.14j history/activity enhancement skipped: dependencies are unavailable.');
      return;
    }
    window.__V703314J_HEALTH_ACTIVITY__=true;

    if(typeof LocalDB!=='undefined'&&!LocalDB.prototype.manageHealthIssueReviews){
      LocalDB.prototype.manageHealthIssueReviews=async function(keys=[],action='delete'){
        const wanted=new Set((keys||[]).map(String).filter(Boolean)),d=this.data();
        d.healthReviews=d.healthReviews||[];
        const removed=d.healthReviews.filter(r=>wanted.has(String(r.issue_key)));
        d.healthReviews=d.healthReviews.filter(r=>!wanted.has(String(r.issue_key)));
        for(const r of removed)this.audit(d,'health_issue_reviews',String(r.issue_key||''),String(action||'delete').toUpperCase(),r,{management_action:String(action||'delete').toLowerCase()});
        this.save(d);
        return {affected:removed.length,action:String(action||'delete').toLowerCase()};
      };
    }
    if(typeof SupabaseDB!=='undefined'&&!SupabaseDB.prototype.manageHealthIssueReviews){
      SupabaseDB.prototype.manageHealthIssueReviews=async function(keys=[],action='delete'){
        const issueKeys=[...new Set((keys||[]).map(String).filter(Boolean))];
        if(!issueKeys.length)return {affected:0,action:String(action||'delete').toLowerCase()};
        const {data,error}=await this.sb.rpc('manage_health_issue_reviews_v703314j',{p_issue_keys:issueKeys,p_action:String(action||'delete').toLowerCase()});
        if(error)throw error;
        return data||{affected:issueKeys.length,action:String(action||'delete').toLowerCase()};
      };
    }

    const previousFriendlyAudit14j=friendlyAudit;
    const previousAuditIcon14j=auditIcon;
    const previousAuditLabel14j=auditLabel;
    const previousAuditWho14j=auditWho;
    const previousConsolidatedAudit14j=consolidatedAudit;

    function healthReviewWho14j(r){
      if(!r)return 'Team Member';
      try{return profileName(r.reviewed_by)||String(r.reviewed_by||'Team Member');}
      catch(_e){return String(r.reviewed_by||'Team Member');}
    }
    function currentHealthMap14j(){
      return new Map((buildAllHealthIssues()||[]).map(x=>[String(x.key),x]));
    }
    function healthHistory14j(){
      const current=currentHealthMap14j();
      return [...(state.data?.healthReviews||[])]
        .sort((a,b)=>new Date(b.reviewed_at||0)-new Date(a.reviewed_at||0))
        .map(r=>({...r,resolution_status:r.resolution_status==='resolved'?'resolved':(current.has(String(r.issue_key))?'still-detected':'resolved'),current_issue:r.resolution_status==='resolved'?null:(current.get(String(r.issue_key))||null),reviewed_by_name:healthReviewWho14j(r)}));
    }
    function virtualHealthAudits14j(){
      return healthHistory14j().map(r=>({
        id:'health-review:'+String(r.issue_key||'')+':'+String(r.reviewed_at||''),
        entity_type:'health_issue_reviews',
        entity_id:String(r.issue_key||''),
        action:'REVIEW',
        old_data:null,
        new_data:{...r,current_issue:undefined},
        changed_by:r.reviewed_by||null,
        changed_at:r.reviewed_at||nowIso(),
        _healthActorName:r.reviewed_by_name,
        _virtualHealthReview:true
      }));
    }
    function itemForAudit14j(d={}){
      const id=d.master_item_id||d.id;
      return (state.data?.items||[]).find(x=>String(x.id)===String(id||''))||null;
    }
    function purchaseForAudit14j(d={}){
      return (state.data?.purchases||[]).find(x=>String(x.id)===String(d.purchase_id||''))||null;
    }
    function shortValue14j(v){
      if(v===null||v===undefined||v==='')return '—';
      const s=String(v).replace(/\s+/g,' ').trim();
      return s.length>48?s.slice(0,45)+'…':s;
    }
    function changed14j(o={},n={},fields=[]){
      const labels={sku:'SKU',item_name:'Name',category:'Category',unit:'Unit',description:'Description',image_url:'Photo',quantity:'Quantity',raw_description:'Description',serial_number:'Serial',adjustment_type:'Type',reason:'Reason',outcome:'Outcome',issue:'Issue',action_taken:'Action',notes:'Notes'};
      const out=[];
      for(const k of fields){
        if(JSON.stringify(o?.[k])===JSON.stringify(n?.[k]))continue;
        if(k==='description'||k==='image_url'||k==='raw_description'||k==='notes')out.push((labels[k]||k)+' updated');
        else out.push((labels[k]||k)+': '+shortValue14j(o?.[k])+' → '+shortValue14j(n?.[k]));
      }
      return out;
    }
    function healthAuditText14j(a){
      const d=a.new_data?.issue_key?a.new_data:(a.old_data||a.new_data||{}),type=d.issue_type||'Data Health finding',title=d.title||d.entity_id||a.entity_id||'record';
      if(a.action==='REVIEW'){
        const status=d.resolution_status==='resolved'?'resolved':'still detected';
        return 'Reviewed Data Health: '+type+' — '+title+' ('+status+')';
      }
      if(a.action==='REOPEN')return 'Reopened Data Health review: '+type+' — '+title;
      if(a.action==='DELETE')return 'Removed Data Health history: '+type+' — '+title;
      return (a.action||'Updated')+' Data Health: '+type+' — '+title;
    }

    auditWho=function(a){return a?._healthActorName||previousAuditWho14j(a);};
    auditIcon=function(a){
      if(a?.entity_type==='health_issue_reviews'){
        if(a.action==='REOPEN')return['rotate-ccw','edited'];
        if(a.action==='DELETE')return['trash-2','delete'];
        return['shield-check',''];
      }
      return previousAuditIcon14j(a);
    };
    auditLabel=function(a){
      if(a?.entity_type==='health_issue_reviews'){
        if(a.action==='REOPEN')return['Reopened','edited'];
        if(a.action==='DELETE')return['Removed','deleted'];
        return['Reviewed','imported'];
      }
      return previousAuditLabel14j(a);
    };
    friendlyAudit=function(a){
      const n=a?.new_data||{},o=a?.old_data||{},d=a?.new_data||a?.old_data||{};
      if(a?.entity_type==='health_issue_reviews')return healthAuditText14j(a);
      if(a?.entity_type==='master_items'){
        const sku=n.sku||o.sku||'No SKU',name=n.item_name||o.item_name||'';
        if(a.action==='INSERT')return 'Added item '+sku+(name?' — '+name:'');
        if(a.action==='DELETE')return 'Deleted item '+sku+(name?' — '+name:'');
        if(a.action==='UPDATE'){
          const parts=changed14j(o,n,['sku','item_name','category','unit','description','image_url']);
          return 'Edited '+sku+(parts.length?' — '+parts.slice(0,4).join('; '):'');
        }
      }
      if(a?.entity_type==='inventory_adjustments'){
        const item=itemForAudit14j(d),sku=item?.sku||d.master_item_id||'inventory item',qty=Number(d.quantity||0),type=d.adjustment_type||'Adjustment',reason=String(d.reason||'').trim();
        if(a.action==='INSERT')return 'Recorded '+type+' adjustment for '+sku+' — −'+qty+(reason?' · '+reason:'');
        if(a.action==='DELETE')return 'Removed '+type+' adjustment for '+sku+' — '+qty;
        if(a.action==='UPDATE'){
          const parts=changed14j(o,n,['adjustment_type','quantity','reason']);
          return 'Edited inventory adjustment for '+sku+(parts.length?' — '+parts.join('; '):'');
        }
      }
      if(a?.entity_type==='purchase_items'){
        const item=itemForAudit14j(d),purchase=purchaseForAudit14j(d),sku=item?.sku||d.master_item_id||'item',qty=Number(d.quantity||0),inv=purchase?.invoice_number||'';
        if(a.action==='INSERT')return 'Added invoice line: '+sku+' × '+qty+(inv?' — '+inv:'');
        if(a.action==='DELETE')return 'Removed invoice line: '+sku+' × '+qty+(inv?' — '+inv:'');
        if(a.action==='UPDATE'){
          const parts=changed14j(o,n,['quantity','raw_description']);
          return 'Edited invoice line: '+sku+(parts.length?' — '+parts.join('; '):'');
        }
      }
      if(a?.entity_type==='serial_numbers'){
        const item=itemForAudit14j(d),sku=item?.sku||d.master_item_id||'item',serial=n.serial_number||o.serial_number||'';
        if(a.action==='INSERT')return 'Added serial '+serial+' to '+sku;
        if(a.action==='DELETE')return 'Removed serial '+serial+' from '+sku;
        if(a.action==='UPDATE'){
          const parts=changed14j(o,n,['serial_number']);
          return 'Edited serial for '+sku+(parts.length?' — '+parts.join('; '):'');
        }
      }
      if(a?.entity_type==='maintenance_records'&&a.action==='UPDATE'){
        const item=itemForAudit14j(d),sku=item?.sku||d.master_item_id||'equipment',parts=changed14j(o,n,['issue','action_taken','outcome','notes']);
        return 'Updated maintenance for '+sku+(parts.length?' — '+parts.slice(0,3).join('; '):'');
      }
      return previousFriendlyAudit14j(a);
    };
    consolidatedAudit=function(){
      const base=previousConsolidatedAudit14j();
      const actualReviews=new Set(base.filter(a=>a?.entity_type==='health_issue_reviews'&&a.action==='REVIEW').map(a=>String(a.entity_id||'')));
      const virtual=virtualHealthAudits14j().filter(a=>!actualReviews.has(String(a.entity_id||'')));
      return [...base,...virtual].sort((a,b)=>new Date(b.changed_at||0)-new Date(a.changed_at||0));
    };

    let healthTab14j='open';
    let healthSelection14j=new Set();
    const healthFilters14j={query:'',status:'',type:'',user:'',from:'',to:''};

    function filteredHistory14j(){
      const q=norm(healthFilters14j.query||'');
      return healthHistory14j().filter(r=>{
        const day=singaporeDateKey(r.reviewed_at);
        const hay=norm([r.issue_type,r.title,r.detail,r.reviewed_by_name,r.entity_type,r.entity_id].join(' '));
        return(!q||hay.includes(q))
          &&(!healthFilters14j.status||r.resolution_status===healthFilters14j.status)
          &&(!healthFilters14j.type||String(r.issue_type||'')===healthFilters14j.type)
          &&(!healthFilters14j.user||String(r.reviewed_by_name||'')===healthFilters14j.user)
          &&(!healthFilters14j.from||day>=healthFilters14j.from)
          &&(!healthFilters14j.to||day<=healthFilters14j.to);
      });
    }
    function options14j(values,current,label){
      return '<option value="">'+esc(label)+'</option>'+values.map(v=>'<option value="'+esc(v)+'" '+(String(v)===String(current)?'selected':'')+'>'+esc(v)+'</option>').join('');
    }
    function renderHealthOpen14j(){
      const issues=buildHealthIssues();
      const rows=issues.map(x=>'<tr><td><span class="health-pill '+esc(x.severity)+'">'+esc(x.severity)+'</span></td><td>'+(x.review?'<span class="health-history-status still">Reviewed · still detected</span>':'<span class="health-history-status open">Open</span>')+'</td><td>'+esc(x.type)+'</td><td>'+esc(x.title)+'</td><td>'+esc(x.detail)+'</td><td>'+issueReviewButton(x)+'</td></tr>').join('');
      $('healthIssueTable').innerHTML=rows?'<table><thead><tr><th>Priority</th><th>Status</th><th>Check</th><th>Record</th><th>Finding</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="empty">No active findings.</div>';
    }
    function renderHealthHistoryResults14j(){
      const host=document.getElementById('healthHistoryResults14j');if(!host)return;
      const history=filteredHistory14j(),canManage=canEdit()&&typeof state.db?.manageHealthIssueReviews==='function';
      for(const key of [...healthSelection14j])if(!history.some(r=>String(r.issue_key)===key))healthSelection14j.delete(key);
      const selected=history.filter(r=>healthSelection14j.has(String(r.issue_key))),reopenable=selected.filter(r=>r.resolution_status==='still-detected');
      const rows=history.map(r=>{
        const key=String(r.issue_key||''),checked=healthSelection14j.has(key),current=r.current_issue;
        const status=r.resolution_status==='resolved'?'<span class="health-history-status resolved">Resolved</span>':'<span class="health-history-status still">Still detected</span>';
        const open=current?'<button class="secondary small-btn" type="button" data-health-open="'+esc(current.key)+'">Open current</button>':'';
        const select=canManage?'<input type="checkbox" data-health14j-select="'+esc(key)+'" '+(checked?'checked':'')+' aria-label="Select history record">':'';
        return '<tr><td>'+select+'</td><td>'+status+'</td><td>'+esc(r.issue_type||'Finding')+'</td><td>'+esc(r.title||'—')+'</td><td>'+esc(r.detail||'—')+'</td><td>'+esc(r.reviewed_by_name)+'<br><span class="muted">'+esc(fmtDT(r.reviewed_at))+'</span></td><td>'+open+'</td></tr>';
      }).join('');
      const allChecked=!!history.length&&history.every(r=>healthSelection14j.has(String(r.issue_key)));
      const manage=canManage?'<div class="health-history-manage"><label><input type="checkbox" data-health14j-select-all '+(allChecked?'checked':'')+'> Select all shown</label><span>'+selected.length+' selected</span><button type="button" class="secondary small-btn" data-health14j-manage="reopen" '+(!reopenable.length?'disabled':'')+'>Reopen active ('+reopenable.length+')</button><button type="button" class="danger small-btn" data-health14j-manage="delete" '+(!selected.length?'disabled':'')+'>Delete history ('+selected.length+')</button></div>':'';
      host.innerHTML=manage+(rows?'<div class="table-wrap"><table><thead><tr><th></th><th>Resolution</th><th>Check</th><th>Record</th><th>Reviewed finding</th><th>Reviewed by</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class="empty">No Data Health history matches these filters.</div>');
    }
    function renderHealthHistory14j(){
      const history=healthHistory14j(),types=[...new Set(history.map(r=>r.issue_type).filter(Boolean))].sort(),users=[...new Set(history.map(r=>r.reviewed_by_name).filter(Boolean))].sort();
      $('healthIssueTable').innerHTML='<div class="health-history-toolbar"><div class="input-icon"><i data-lucide="search"></i><input id="healthHistorySearch14j" class="search" type="search" autocomplete="off" placeholder="Search history..." value="'+esc(healthFilters14j.query)+'"></div><select id="healthHistoryStatus14j">'+options14j(['resolved','still-detected'],healthFilters14j.status,'All statuses').replace('>resolved<','>Resolved<').replace('>still-detected<','>Still detected<')+'</select><select id="healthHistoryType14j">'+options14j(types,healthFilters14j.type,'All checks')+'</select><select id="healthHistoryUser14j">'+options14j(users,healthFilters14j.user,'All reviewers')+'</select><input id="healthHistoryFrom14j" type="date" title="From date" value="'+esc(healthFilters14j.from)+'"><input id="healthHistoryTo14j" type="date" title="To date" value="'+esc(healthFilters14j.to)+'"><button type="button" class="secondary small-btn" data-health14j-clear>Clear</button></div><div id="healthHistoryResults14j"></div>';
      renderHealthHistoryResults14j();
      window.lucide?.createIcons();
    }
    function renderHealthDialog14j(){
      const issues=buildHealthIssues(),score=healthScore(issues),history=healthHistory14j(),resolved=history.filter(x=>x.resolution_status==='resolved').length,still=history.length-resolved;
      $('healthDialogSummary').innerHTML='<div class="health-overview health-overview-14i"><div class="health-overview-score"><strong>'+score+'%</strong><span>'+esc(healthLabel(score))+'</span></div><div class="health-resolution-summary"><span><strong>'+issues.length+'</strong> active</span><span><strong>'+resolved+'</strong> resolved</span><span><strong>'+still+'</strong> reviewed / still detected</span></div><div class="health-tabs"><button type="button" class="'+(healthTab14j==='open'?'active':'')+'" data-health14j-tab="open">Open findings</button><button type="button" class="'+(healthTab14j==='history'?'active':'')+'" data-health14j-tab="history">Review history ('+history.length+')</button></div></div>';
      healthTab14j==='history'?renderHealthHistory14j():renderHealthOpen14j();
      window.lucide?.createIcons();
    }
    openHealth=function(){healthTab14j='open';healthSelection14j.clear();renderHealthDialog14j();$('healthDialog').showModal();};

    async function manageHealthSelection14j(action){
      if(!canEdit()||typeof state.db?.manageHealthIssueReviews!=='function')return;
      const selected=healthHistory14j().filter(r=>healthSelection14j.has(String(r.issue_key)));
      const records=action==='reopen'?selected.filter(r=>r.resolution_status==='still-detected'):selected;
      if(!records.length){toast(action==='reopen'?'Select at least one still-detected review.':'Select at least one history record.');return;}
      const verb=action==='reopen'?'reopen '+records.length+' active review'+(records.length===1?'':'s'):'delete '+records.length+' history record'+(records.length===1?'':'s');
      if(!confirm('Confirm '+verb+'?'))return;
      try{
        const result=await state.db.manageHealthIssueReviews(records.map(r=>r.issue_key),action);
        state.data=await state.db.load();
        healthSelection14j.clear();
        renderAll();
        healthTab14j='history';
        renderHealthDialog14j();
        toast((action==='reopen'?'Reopened ':'Deleted ')+Number(result?.affected??records.length)+' Data Health record'+(Number(result?.affected??records.length)===1?'':'s')+'.');
      }catch(err){
        console.error(err);
        const msg=String(err?.message||err||'');
        if(/manage_health_issue_reviews_v703314j|PGRST202|42883|schema cache|not found/i.test(msg))toast('Data Health management SQL is not installed yet. Run the v7.03.3.14j Supabase SQL patch.');
        else toast(friendlyError(err));
      }
    }

    document.addEventListener('click',e=>{
      const tab=e.target.closest?.('[data-health14j-tab]');
      if(tab){
        e.preventDefault();e.stopImmediatePropagation();
        healthTab14j=tab.dataset.health14jTab==='history'?'history':'open';
        healthSelection14j.clear();
        renderHealthDialog14j();
        return;
      }
      const clear=e.target.closest?.('[data-health14j-clear]');
      if(clear){
        e.preventDefault();e.stopImmediatePropagation();
        Object.assign(healthFilters14j,{query:'',status:'',type:'',user:'',from:'',to:''});
        healthSelection14j.clear();
        renderHealthHistory14j();
        return;
      }
      const all=e.target.closest?.('[data-health14j-select-all]');
      if(all){
        const shown=filteredHistory14j();
        if(all.checked)shown.forEach(r=>healthSelection14j.add(String(r.issue_key)));
        else shown.forEach(r=>healthSelection14j.delete(String(r.issue_key)));
        renderHealthHistoryResults14j();
        return;
      }
      const row=e.target.closest?.('[data-health14j-select]');
      if(row){
        const key=String(row.dataset.health14jSelect||'');
        row.checked?healthSelection14j.add(key):healthSelection14j.delete(key);
        renderHealthHistoryResults14j();
        return;
      }
      const manage=e.target.closest?.('[data-health14j-manage]');
      if(manage){
        e.preventDefault();e.stopImmediatePropagation();
        manageHealthSelection14j(manage.dataset.health14jManage);
        return;
      }
      if(e.target.closest?.('[data-health-review]')&&$('healthDialog')?.open){
        setTimeout(()=>{if($('healthDialog')?.open){healthTab14j='open';renderHealthDialog14j();}},250);
      }
    },true);
    document.addEventListener('input',e=>{
      if(e.target?.id!=='healthHistorySearch14j')return;
      healthFilters14j.query=e.target.value||'';
      healthSelection14j.clear();
      renderHealthHistoryResults14j();
    },true);
    document.addEventListener('change',e=>{
      const map={healthHistoryStatus14j:'status',healthHistoryType14j:'type',healthHistoryUser14j:'user',healthHistoryFrom14j:'from',healthHistoryTo14j:'to'};
      const key=map[e.target?.id];if(!key)return;
      healthFilters14j[key]=e.target.value||'';
      healthSelection14j.clear();
      renderHealthHistoryResults14j();
    },true);

    try{renderAudit();renderDashboard();}catch(refreshErr){console.warn('V7.03.3.14j initial activity refresh skipped',refreshErr);}
    Object.assign(diagnostics,{installed:true,stage:'ready',history:healthHistory14j,filteredHistory:filteredHistory14j,summary:friendlyAudit});
  }catch(err){
    diagnostics.stage='failed';diagnostics.error=String(err?.message||err);
    console.warn('V7.03.3.14j Data Health management/activity enhancement failed non-fatally.',err);
  }
})();

(function v703314lInstallParserDiagnostics(){
  if(window.__AV_14L_DIAGNOSTICS__?.installed)return;
  const api=globalThis.V7033Patch;
  const adminDiagnosticsVisible=()=>typeof currentRole==='function'&&currentRole()==='admin';
  const diagnostics=window.__AV_14L_DIAGNOSTICS__={version:'7.03.3.14n',installed:false,stage:'boot',last:null,error:null,behavioral:null,historical:null};
  try{
    if(!api||typeof api.buildParserDiagnostics14l!=='function'||typeof api.runHistoricalRegressionChecks!=='function'||typeof renderParsedItems!=='function'){
      diagnostics.stage='dependencies-unavailable';diagnostics.error='Parser diagnostic dependencies are unavailable.';console.warn('V7.03.3.14n parser diagnostics skipped: dependencies unavailable.');return;
    }
    function esc14l(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    function compactJson14l(v){try{return JSON.stringify(v,null,2);}catch(_e){return String(v);}}
    function statusClass14l(v){const s=String(v||'').toLowerCase();return s==='pass'?'pass':(s==='review'?'review':'block');}
    function render14l(){
      const existing=document.getElementById('v703314lParserDiagnostics');
      if(!adminDiagnosticsVisible()){if(existing)existing.remove();diagnostics.last=null;diagnostics.behavioral=null;diagnostics.historical=null;diagnostics.stage='hidden-for-role';return;}
      const parsed=state?.parsed;if(!parsed)return;
      const raw=String(parsed.raw||parsed.rawText||''),diag=parsed.v703314lDiagnostics||api.buildParserDiagnostics14l(parsed,raw,{});
      parsed.v703314lDiagnostics=diag;
      const behavior=diagnostics.behavioral||(diagnostics.behavioral=api.runRegressionChecks()),history=diagnostics.historical||(diagnostics.historical=api.runHistoricalRegressionChecks());
      diagnostics.last={generated_at:new Date().toISOString(),parse:diag};
      const pane=document.querySelector('.parsed-review-pane')||document.getElementById('reviewArea');if(!pane)return;
      let host=document.getElementById('v703314lParserDiagnostics');
      if(!host){host=document.createElement('details');host.id='v703314lParserDiagnostics';host.open=true;host.className='parser-diagnostics-14l ui-diagnostic';const rawDetails=document.getElementById('rawText')?.closest('details');if(rawDetails?.parentNode)rawDetails.parentNode.insertBefore(host,rawDetails);else pane.appendChild(host);}
      const actualDoc=diag.document?.classification?.type||'unclassified',actualFilter=(diag.filtering?.excluded_service_count||0)+' service / '+(diag.filtering?.excluded_accessory_count||0)+' accessory excluded',actualItems=(diag.final_items||[]).map(x=>(x.sku||'No SKU')+' — '+(x.item_name||'')).join('; ')||'No tracked items',actualReview=diag.verification?.level3_required?'Level 3 required':'No unresolved Level 3';
      const rawOutput={timestamp:diagnostics.last.generated_at,parse:diag,behavioral:{ok:behavior.ok,failures:behavior.failures,cases:behavior.cases},historical:{ok:history.ok,represented_files:history.represented_files,logical_cases:history.logical_cases,failures:history.failures,cases:history.cases.map(x=>({id:x.id,source_files:x.source_files,pass:x.pass,expected:x.expected,evidence:x.evidence,reason:x.reason}))}};
      host.innerHTML='<summary><span>Parser diagnostics</span><span class="parser-diag-status ui-diagnostic__status '+statusClass14l(diag.overall_status)+'">'+esc14l(diag.overall_status)+'</span></summary><div class="parser-diag-body ui-diagnostic__body"><div class="parser-diag-summary ui-diagnostic__summary"><div><b>Patch Focus</b><span>Golden invoices + evidence tracing + arithmetic validation + field confidence + OCR preprocessing + holdout testing</span></div><div><b>Test Suite / Input</b><span>Current invoice + '+behavior.cases.length+' behavioral checks + '+history.logical_cases+' historical cases / '+history.represented_files+' represented files</span></div><div><b>Overall Status</b><span>Current parse: '+esc14l(diag.overall_status)+' · Behavioral: '+(behavior.ok?'PASS':'FAIL')+' · Historical: '+(history.ok?'PASS':'FAIL')+'</span></div><div><b>Timestamp</b><span>'+esc14l(diagnostics.last.generated_at)+'</span></div></div><div class="table-wrap ui-table-wrap"><table class="parser-diag-table ui-diagnostic__table"><thead><tr><th>Check</th><th>Expected</th><th>Actual</th></tr></thead><tbody><tr><td>Document</td><td>Invoice / Tax Invoice</td><td>'+esc14l(actualDoc)+' — '+esc14l(diag.document?.classification?.reason||'')+'</td></tr><tr><td>Filtering</td><td>Exclude service/accessory rows only</td><td>'+esc14l(actualFilter)+'</td></tr><tr><td>Tracked items</td><td>Evidence-backed inventory rows</td><td>'+esc14l(actualItems)+'</td></tr><tr><td>Level 3</td><td>Only unresolved evidence needs review</td><td>'+esc14l(actualReview)+'</td></tr></tbody></table></div><div class="parser-diag-trace ui-diagnostic__trace"><b>Evidence trace</b><div class="parser-diag-chips ui-diagnostic__chips"><span>Input '+(diag.filtering?.incoming_count||0)+'</span><span>Final '+(diag.filtering?.tracked_count||0)+'</span><span>Recovered '+(diag.filtering?.recovered_equipment_count||0)+'</span><span>L1 '+(diag.verification?.level1?.length||0)+'</span><span>L2 '+(diag.verification?.level2?.length||0)+'</span></div><p>'+esc14l((diag.decision_reasons||[]).join(' '))+'</p></div><details class="parser-diag-raw ui-diagnostic__raw"><summary>Raw parser test execution output</summary><pre>'+esc14l(compactJson14l(rawOutput))+'</pre></details></div>';
    }
    const original=renderParsedItems;renderParsedItems=function(){const result=original.apply(this,arguments);try{render14l();}catch(err){console.warn('v7.03.3.14n diagnostic render failed',err);}return result;};
    document.addEventListener('click',e=>{if(e.target.closest?.('#addParsedItemBtn,#subtractParsedItemBtn,#chooseEquipmentInvoiceBtn,#chooseServiceInvoiceBtn,#changeInvoiceTypeBtn'))setTimeout(()=>{try{render14l();}catch(_e){}},200);},true);
    diagnostics.render=render14l;diagnostics.installed=true;if(adminDiagnosticsVisible()){diagnostics.behavioral=api.runRegressionChecks();diagnostics.historical=api.runHistoricalRegressionChecks();diagnostics.stage='ready';}else{diagnostics.behavioral=null;diagnostics.historical=null;diagnostics.last=null;diagnostics.stage='hidden-for-role';}try{if(state?.parsed)render14l();}catch(_e){}
  }catch(err){diagnostics.stage='failed';diagnostics.error=String(err?.message||err);console.warn('V7.03.3.14n parser diagnostics failed non-fatally.',err);}
})();

(function v703314oInstallParserIntelligence(){
  if(window.__AV_14O_DIAGNOSTICS__?.installed)return;
  const api=globalThis.V7033Patch;
  const diagnostics=window.__AV_14O_DIAGNOSTICS__={version:'7.03.3.14o',installed:false,stage:'boot',error:null};
  try{
    if(!api||typeof api.runIntelligenceRegressionChecks14o!=='function'){diagnostics.stage='dependencies-unavailable';diagnostics.error='V7.03.3.14o core intelligence helpers are unavailable.';return;}
    if(window.__V703314O_PARSER_INTELLIGENCE__){diagnostics.installed=true;diagnostics.stage='already-installed';return;}
    window.__V703314O_PARSER_INTELLIGENCE__=true;
    const intel=window.__AV_14O_STATE__={corrections:[],profiles:[],adminSnapshot:null,migrationReady:false,lastError:'',fingerprint:'',fingerprintDuplicate:null,fingerprintOverride:false,duplicateBlocks:0,parseSnapshot:null,parseSnapshotSig:'',pendingCorrections:[],lastRegression:null,lastRefresh:0,userTouched:false};
    const role14o=()=>{try{return typeof currentRole==='function'?String(currentRole()||'viewer').toLowerCase():'viewer';}catch(_e){return'viewer';}},isAdmin14o=()=>role14o()==='admin',canImport14o=()=>['admin','editor'].includes(role14o());
    const clean14o=v=>String(v??'').replace(/\s+/g,' ').trim(),norm14o=v=>clean14o(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),esc14o=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),clone14o=v=>{try{return JSON.parse(JSON.stringify(v));}catch(_e){return v;}};
    const localKey='av_inventory_parser_intelligence_14o',localData=()=>{try{return JSON.parse(localStorage.getItem(localKey)||'{"corrections":[],"profiles":[],"events":[]}');}catch(_e){return{corrections:[],profiles:[],events:[]};}},saveLocal=d=>{try{localStorage.setItem(localKey,JSON.stringify(d));}catch(_e){}};
    const supplierKey14o=v=>{try{return api.v703314oSupplierKey(v);}catch(_e){return norm14o(v);}},currentRaw14o=()=>String(state?.parsed?.raw||state?.parsed?.rawText||''),sqlUnavailable14o=err=>/function|schema cache|does not exist|42P01|42883|PGRST202|column .* does not exist/i.test(String(err?.message||err||''));
    async function rpc14o(name,args={}){if(CFG.mode!=='supabase'||!state?.db?.sb)throw new Error('Supabase is unavailable.');const {data,error}=await state.db.sb.rpc(name,args);if(error)throw error;return data;}
    async function refreshIntelligence14o(){
      try{if(CFG.mode==='supabase'&&state?.db?.sb){const data=await rpc14o('get_parser_intelligence_v703314o',{});intel.corrections=Array.isArray(data?.corrections)?data.corrections:[];intel.profiles=Array.isArray(data?.profiles)?data.profiles:[];intel.migrationReady=true;intel.lastError='';}else{const d=localData();intel.corrections=(d.corrections||[]).filter(x=>x.status==='approved');intel.profiles=(d.profiles||[]).filter(x=>x.status==='active');intel.migrationReady=true;}intel.lastRefresh=Date.now();}catch(err){intel.lastError=String(err?.message||err);if(sqlUnavailable14o(err))intel.migrationReady=false;console.warn('v7.03.3.14o parser intelligence load skipped',err);}if(isAdmin14o())await refreshAdminSnapshot14o(false);return intel;
    }
    async function refreshAdminSnapshot14o(render=true){
      if(!isAdmin14o())return null;try{if(CFG.mode==='supabase'&&state?.db?.sb){intel.adminSnapshot=await rpc14o('admin_parser_quality_snapshot_v703314o',{});intel.migrationReady=true;intel.lastError='';}else{const d=localData();intel.adminSnapshot={corrections:d.corrections||[],profiles:d.profiles||[],events:(d.events||[]).slice(-100).reverse()};}}catch(err){intel.lastError=String(err?.message||err);if(sqlUnavailable14o(err))intel.migrationReady=false;console.warn('v7.03.3.14o Admin parser snapshot unavailable',err);}if(render)return intel.adminSnapshot;
    }
    function applyCorrectionMemory14o(parsed={},raw=''){
      if(!parsed||!Array.isArray(intel.corrections)||!intel.corrections.length)return parsed;const out={...parsed,doc:{...(parsed.doc||{})},items:(parsed.items||[]).map(x=>({...x}))},supplier=out.doc.supplier_name||'',used=[],suggestions=[];
      for(const c of intel.corrections){const field=String(c.field_name||'');if(field==='invoice_number'){const decision=api.v703314oCorrectionDecision(c,{supplier_name:supplier,current_value:out.doc.invoice_number||'',raw});if(decision.autoApply){out.doc.invoice_number=c.corrected_value;used.push({id:c.id,field,from:c.source_value,to:c.corrected_value,reason:decision.reason});}else if(decision.supplierMatch&&decision.sourceMatch)suggestions.push({id:c.id,field,from:c.source_value,to:c.corrected_value,reason:decision.reason});continue;}for(const item of out.items){if(field!=='sku'){if(supplierKey14o(c.supplier_key)===supplierKey14o(supplier))suggestions.push({id:c.id,field,from:c.source_value,to:c.corrected_value,item:item.sku||item.item_name||'',reason:'Approved memory is suggestion-only for this field.'});continue;}const decision=api.v703314oCorrectionDecision(c,{supplier_name:supplier,current_value:item.sku||'',raw});if(decision.autoApply){const before=item.sku||'';item.sku=c.corrected_value;item.v703314oCorrectionMemory={id:c.id,from:before,to:c.corrected_value,evidence:'approved + printed'};used.push({id:c.id,field,from:before,to:c.corrected_value,item:item.item_name||'',reason:decision.reason});}}}
      if(used.length||suggestions.length)out.v703314oCorrectionMemory={used,suggestions};return out;
    }
    function activeProfile14o(parsed={},raw=''){const supplier=parsed?.doc?.supplier_name||'',key=supplierKey14o(supplier);return (intel.profiles||[]).find(p=>String(p.status||'active')==='active'&&(supplierKey14o(p.supplier_key||p.supplier_name||'')===key||(!key&&clean14o(p.supplier_name)&&norm14o(raw).includes(norm14o(p.supplier_name)))))||null;}
    function applySupplierProfile14o(parsed={},raw=''){
      if(!parsed)return parsed;const p=activeProfile14o(parsed,raw);if(!p)return parsed;const out={...parsed,doc:{...(parsed.doc||{})}},labels=p.labels||{},evidence=[];
      if(!clean14o(out.doc.invoice_number)){const hit=api.v703314oExtractProfileCandidate(raw,labels.invoice_labels||[],'invoice_number');if(hit){out.doc.invoice_number=hit.value;evidence.push({field:'invoice_number',...hit});}}
      if(!clean14o(out.doc.invoice_date)){const hit=api.v703314oExtractProfileCandidate(raw,labels.date_labels||[],'invoice_date');if(hit){try{const parsedDate=typeof parseDate==='function'?parseDate(hit.value):hit.value;if(parsedDate){out.doc.invoice_date=parsedDate;evidence.push({field:'invoice_date',...hit});}}catch(_e){}}}
      if(evidence.length)out.v703314oSupplierProfile={profile_id:p.id,supplier:p.supplier_name||p.supplier_key,evidence};return out;
    }
    if(typeof v661FinalizeParsedInvoice==='function'&&!v661FinalizeParsedInvoice.__v703314o){const prev=v661FinalizeParsedInvoice,wrapped=function(){let out=prev.apply(this,arguments);const raw=String(arguments[1]||out?.raw||out?.rawText||'');out=applySupplierProfile14o(out,raw);return out;};wrapped.__v703314o=true;v661FinalizeParsedInvoice=wrapped;}
    function parseSig14o(){const d=state?.parsed?.doc||{},items=state?.parsed?.items||[];return [d.supplier_name||'',d.invoice_number||'',d.invoice_date||'',items.length,...items.map(x=>[x.rowId||x.v7RowId||'',x.sku||'',x.item_name||'',x.quantity??''].join(':'))].join('|');}
    function snapshotParse14o(){if(intel.userTouched||!state?.parsed)return;const sig=parseSig14o();intel.parseSnapshot={doc:clone14o(state.parsed.doc||{}),items:clone14o(state.parsed.items||[])};intel.parseSnapshotSig=sig;intel.pendingCorrections=[];}
    function resetImportIntelligence14o(){intel.parseSnapshot=null;intel.parseSnapshotSig='';intel.pendingCorrections=[];intel.fingerprint='';intel.fingerprintDuplicate=null;intel.fingerprintOverride=false;intel.userTouched=false;renderFingerprintWarning14o();}
    function correctionDiff14o(){
      if(!intel.parseSnapshot||!state?.parsed)return[];const before=intel.parseSnapshot,after=state.parsed,supplier=after.doc?.supplier_name||before.doc?.supplier_name||'',invoice=after.doc?.invoice_number||before.doc?.invoice_number||'',out=[],add=(field,a,b,item='')=>{a=clean14o(a);b=clean14o(b);if(a===b||!b)return;out.push({field_name:field,source_value:a,corrected_value:b,item_identity:item,evidence_text:'',supplier_name:supplier,invoice_number:invoice});};
      for(const f of ['supplier_name','invoice_number','invoice_date'])add(f,before.doc?.[f],after.doc?.[f],'header');const oldItems=before.items||[],newItems=after.items||[];
      for(let i=0;i<Math.min(oldItems.length,newItems.length);i++){const a=oldItems[i],b=newItems[i],identity=clean14o(b.sku||a.sku||b.item_name||a.item_name||('row '+(i+1)));for(const f of ['sku','item_name','quantity','unit_price','amount','serials'])add(f,a?.[f],b?.[f],identity);}return out.slice(0,50);
    }
    function profileObservation14o(){
      const d=state?.parsed?.doc||{},raw=currentRaw14o(),lines=raw.replace(/\r/g,'').split('\n').map(clean14o).filter(Boolean),invoiceLabels=[],dateLabels=[];
      for(const line of lines.slice(0,120)){if(/^(?:invoice\s*(?:number|no\.?|#)|inv\s*(?:number|no\.?|#))\b/i.test(line)){const m=line.match(/^([^:#]{2,40}?)(?:\s*[:#.-]|\s{2,}|$)/);invoiceLabels.push(clean14o(m?.[1]||line.split(/\s{2,}/)[0]));}if(/^(?:invoice\s+date|date)\b/i.test(line)){const m=line.match(/^([^:#]{2,30}?)(?:\s*[:#.-]|\s{2,}|$)/);dateLabels.push(clean14o(m?.[1]||'Invoice Date'));}}
      const tableHeader=lines.find(x=>/\bdescription\b/i.test(x)&&/\b(?:qty|quantity)\b/i.test(x)&&/\b(?:price|unit price)\b/i.test(x)&&/\b(?:amount|total)\b/i.test(x))||'',uniq=a=>[...new Set(a.filter(Boolean))].slice(0,8);
      return {supplier_name:d.supplier_name||'',labels:{invoice_labels:uniq(invoiceLabels),date_labels:uniq(dateLabels),table_header_tokens:tableHeader?uniq(tableHeader.split(/\s+/).filter(x=>x.length>2)):[]}};
    }
    async function sha256File14o(file){if(!file||!globalThis.crypto?.subtle)return'';const buf=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',buf),hex=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');return api.v703314oValidFingerprint(hex)?hex:'';}
    async function findFingerprintDuplicate14o(hash){if(!api.v703314oValidFingerprint(hash)||!canImport14o())return null;try{if(CFG.mode==='supabase'&&state?.db?.sb){const q=await state.db.sb.from('documents').select('id,file_name,invoice_number,supplier_name').eq('file_sha256',hash).limit(1);if(q.error)throw q.error;return q.data?.[0]||null;}return (state?.data?.documents||[]).find(d=>String(d.file_sha256||'').toLowerCase()===hash.toLowerCase())||null;}catch(err){if(sqlUnavailable14o(err))intel.migrationReady=false;console.warn('Fingerprint duplicate check unavailable',err);return null;}}
    function renderFingerprintWarning14o(){
      const review=document.getElementById('reviewArea');if(!review)return;let box=document.getElementById('v703314oFingerprintWarning');if(!box){box=document.createElement('div');box.id='v703314oFingerprintWarning';box.className='warning-box hidden';const dupe=document.getElementById('duplicateWarning');(dupe?.parentNode||review).insertBefore(box,dupe||review.firstChild);}const d=intel.fingerprintDuplicate;
      if(!d){box.classList.add('hidden');box.innerHTML='';enforceFingerprintGate14o();return;}const override=isAdmin14o()&&!intel.fingerprintOverride?'<button type="button" class="secondary small-btn" data-14o-fingerprint-override>Admin override</button>':'';
      box.classList.remove('hidden');box.innerHTML='<strong>Exact PDF duplicate detected.</strong> This file has the same SHA-256 fingerprint as <b>'+esc14o(d.file_name||d.invoice_number||'an existing document')+'</b>.'+(intel.fingerprintOverride?' <b>Admin override enabled.</b>':' Import is blocked to prevent an accidental duplicate.')+' '+override;enforceFingerprintGate14o();
    }
    function enforceFingerprintGate14o(){const btn=document.getElementById('saveImportBtn'),blocked=!!intel.fingerprintDuplicate&&!intel.fingerprintOverride;if(btn&&blocked){btn.disabled=true;btn.setAttribute('aria-disabled','true');btn.title='Exact PDF duplicate detected. Admin override is required.';}}
    async function inspectFile14o(file){try{intel.fingerprint=await sha256File14o(file);intel.fingerprintDuplicate=intel.fingerprint?await findFingerprintDuplicate14o(intel.fingerprint):null;intel.fingerprintOverride=false;if(intel.fingerprintDuplicate)intel.duplicateBlocks++;renderFingerprintWarning14o();}catch(err){console.warn('PDF fingerprint check failed non-fatally',err);}}
    if(typeof v661RenderImportEligibility==='function'&&!v661RenderImportEligibility.__v703314o){const prevEligibility=v661RenderImportEligibility;v661RenderImportEligibility=function(){const r=prevEligibility.apply(this,arguments);try{renderFingerprintWarning14o();}catch(_e){}return r;};v661RenderImportEligibility.__v703314o=true;}
    if(typeof renderParsedItems==='function'&&!renderParsedItems.__v703314oSnapshot){const prevRender=renderParsedItems;renderParsedItems=function(){const r=prevRender.apply(this,arguments);try{if(!intel.userTouched)snapshotParse14o();}catch(_e){}return r;};renderParsedItems.__v703314oSnapshot=true;}
    async function persistCorrectionMemory14o(rows=[]){if(!rows.length)return;if(CFG.mode==='supabase'&&state?.db?.sb)await rpc14o('record_parser_corrections_v703314o',{p_supplier_name:state.parsed?.doc?.supplier_name||'',p_invoice_number:state.parsed?.doc?.invoice_number||'',p_corrections:rows});else{const d=localData(),now=new Date().toISOString();for(const x of rows)d.corrections.push({id:'local-'+Date.now()+'-'+Math.random(),supplier_key:supplierKey14o(x.supplier_name),supplier_name:x.supplier_name,status:'pending',created_at:now,...x});saveLocal(d);}}
    async function persistProfile14o(obs){if(!obs?.supplier_name)return;if(CFG.mode==='supabase'&&state?.db?.sb)await rpc14o('upsert_supplier_profile_observation_v703314o',{p_supplier_name:obs.supplier_name,p_labels:obs.labels});else{const d=localData(),key=supplierKey14o(obs.supplier_name),old=(d.profiles||[]).find(x=>x.supplier_key===key);if(old){old.labels={...(old.labels||{}),...(obs.labels||{})};old.sample_count=(old.sample_count||0)+1;old.last_seen=new Date().toISOString();}else d.profiles.push({id:'local-profile-'+Date.now(),supplier_key:key,supplier_name:obs.supplier_name,labels:obs.labels,status:'pending',sample_count:1,last_seen:new Date().toISOString()});saveLocal(d);}}
    async function recordQualityEvent14o(type,payload={}){try{if(CFG.mode==='supabase'&&state?.db?.sb)await rpc14o('record_parser_quality_event_v703314o',{p_event_type:type,p_supplier_name:state.parsed?.doc?.supplier_name||'',p_payload:payload});else{const d=localData();d.events=d.events||[];d.events.push({event_type:type,supplier_name:state.parsed?.doc?.supplier_name||'',payload,created_at:new Date().toISOString()});d.events=d.events.slice(-300);saveLocal(d);}}catch(err){console.warn('Parser quality event not recorded',err);}}
    async function persistFingerprint14o(){/* The fingerprint and parse audit are persisted in the atomic invoice-save RPC. */}
    function wrapImport14o(Proto){if(!Proto||Proto.prototype.__v703314oImport)return;const orig=Proto.prototype.importPurchase;if(typeof orig!=='function')return;Proto.prototype.importPurchase=async function(doc,purchase,lines,file){const profile=profileObservation14o(),fingerprint=intel.fingerprint,audit={...(doc?.parse_audit||{}),parser_version:'7.03.3.14o',file_sha256:fingerprint||doc?.file_sha256||'',quality:state.parsed?.v703314nQuality||null,correction_memory:state.parsed?.v703314oCorrectionMemory||null,supplier_profile:state.parsed?.v703314oSupplierProfile||null,created_at:new Date().toISOString()},atomicDoc={...doc,parser_version:'7.03.3.14o',file_sha256:audit.file_sha256,parse_audit:audit},result=await orig.call(this,atomicDoc,purchase,lines,file);try{await persistProfile14o(profile);await recordQualityEvent14o(state.parsed?.v7?.humanReviewRequired?'review':'pass',{invoice_number:purchase.invoice_number||'',line_items:(lines||[]).length,file_sha256:fingerprint||'',corrections_recorded:0});await refreshIntelligence14o();}catch(postErr){console.warn('v7.03.3.14o post-import intelligence update skipped',postErr);}return result;};Proto.prototype.__v703314oImport=true;}
    try{if(typeof LocalDB!=='undefined')wrapImport14o(LocalDB);if(typeof SupabaseDB!=='undefined')wrapImport14o(SupabaseDB);}catch(wrapErr){console.warn('v7.03.3.14o import wrapper skipped',wrapErr);}
    function runRegression14o(){const suites={behavioral:api.runRegressionChecks(),golden:api.runHistoricalRegressionChecks(),quality:api.runQualityRegressionChecks14n(),holdout:api.runHoldoutRegressionChecks14n(),intelligence:api.runIntelligenceRegressionChecks14o()},ok=Object.values(suites).every(x=>x?.ok===true);intel.lastRegression={ok,suites,at:new Date().toISOString()};return intel.lastRegression;}
    function qualityPanel14o(){const dash=document.getElementById('dashboardView');if(!dash)return null;let panel=document.getElementById('parserQualityDashboard14o');if(!isAdmin14o()){if(panel)panel.remove();return null;}if(!panel){panel=document.createElement('article');panel.id='parserQualityDashboard14o';panel.className='panel parser-quality-dashboard-14o';const auto=document.getElementById('automationCentre');(auto?.parentNode||dash).insertBefore(panel,auto?.nextSibling||dash.firstChild);}return panel;}
    function renderQualityDashboard14o(){
      const panel=qualityPanel14o();if(!panel)return;const reg=intel.lastRegression||runRegression14o(),snap=intel.adminSnapshot||{},profiles=snap.profiles||[],events=snap.events||[],active=profiles.filter(x=>x.status==='active').length,migration=intel.migrationReady?'<span style="color:#16794b;font-weight:700">Ready</span>':'<span style="color:#9a6700;font-weight:700">SQL patch required</span>';
      const profileRows=profiles.slice(0,12).map(x=>'<tr><td>'+esc14o(x.supplier_name||x.supplier_key||'—')+'</td><td>'+esc14o(x.status||'pending')+'</td><td>'+Number(x.sample_count||0)+'</td><td>'+esc14o((x.labels?.invoice_labels||[]).join(', ')||'—')+'</td><td><button class="secondary small-btn" data-14o-profile="'+esc14o(x.id)+'" data-action="'+(x.status==='active'?'disable':'activate')+'">'+(x.status==='active'?'Disable':'Activate')+'</button></td></tr>').join(''),lastEvents=events.slice(0,5).map(x=>esc14o((x.event_type||'event')+' · '+(x.supplier_name||'Unknown supplier'))).join('<br>')||'No parser quality events yet.';
      panel.innerHTML='<div class="panel-head"><div><h2>Parser Quality Dashboard <span style="font-size:11px;padding:3px 7px;border-radius:999px;background:#eef4ff;color:#2457a7;vertical-align:middle">Admin only</span></h2><p class="muted">Regression protection, supplier profiles and exact-file duplicate controls.</p></div><div><button type="button" class="secondary small-btn" data-14o-run-regression>Run regression</button> <button type="button" class="secondary small-btn" data-14o-refresh>Refresh</button></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0"><div class="metric"><div><span>Regression</span><strong>'+(reg.ok?'PASS':'FAIL')+'</strong><small>'+esc14o(reg.at||'')+'</small></div></div><div class="metric"><div><span>Supplier Profiles</span><strong>'+active+' active</strong><small>'+profiles.length+' total</small></div></div><div class="metric"><div><span>Exact PDF blocks</span><strong>'+intel.duplicateBlocks+'</strong><small>this session</small></div></div><div class="metric"><div><span>Database</span><strong>'+migration+'</strong><small>v7.03.3.14x schema</small></div></div></div>'+(!intel.migrationReady?'<div class="warning-box"><strong>Inventory Hub database schema is not ready.</strong> Required database components are unavailable. Core inventory remains available, but database-backed parser intelligence features stay disabled until the schema is restored.</div>':'')+'<details><summary><strong>Supplier Layout Profiles</strong></summary><div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Status</th><th>Samples</th><th>Invoice labels</th><th>Action</th></tr></thead><tbody>'+(profileRows||'<tr><td colspan="5">No supplier profiles recorded.</td></tr>')+'</tbody></table></div></details><details><summary><strong>Recent parser quality events</strong></summary><p class="muted">'+lastEvents+'</p></details><p class="muted" style="margin-top:10px">Known-good recovery baseline: <code>v7.03.3.14x · a079417dc164e68f878de825022b186afa2f69cb</code></p>';window.lucide?.createIcons();
    }
    async function clearCorrections14x(){if(!isAdmin14o())return;if(!confirm('Clear all Correction Memory entries? This cannot be undone. Supplier Layout Profiles and parser quality events will not be deleted.'))return;if(CFG.mode==='supabase'&&state?.db?.sb){const {data,error}=await state.db.sb.rpc('clear_parser_correction_memory_v703314x',{p_confirm:'CLEAR_CORRECTION_MEMORY'});if(error){console.error('Clear Correction Memory failed',error);throw new Error(error.message||error.details||error.hint||'Correction Memory could not be cleared.');}const cleared=Number(data?.cleared||0),remaining=Number(data?.remaining??-1);if(data?.verified!==true||remaining!==0)throw new Error('Correction Memory clear could not be verified. '+remaining+' entries remain.');await refreshIntelligence14o();const visible=Number(intel.adminSnapshot?.corrections?.length||0);if(visible!==0)throw new Error('Correction Memory database cleared, but dashboard refresh still reports '+visible+' entries.');toast('Correction Memory cleared and verified ('+cleared+' entries).');return;}const d=localData();const cleared=(d.corrections||[]).length;d.corrections=[];saveLocal(d);await refreshIntelligence14o();toast('Correction Memory cleared ('+cleared+' entries).');}
    async function reviewCorrection14o(id,action){if(!isAdmin14o())return;if(CFG.mode==='supabase'&&state?.db?.sb)await rpc14o('review_parser_correction_v703314o',{p_id:id,p_action:action});else{const d=localData(),x=(d.corrections||[]).find(r=>String(r.id)===String(id));if(x)x.status=action==='approve'?'approved':'rejected';saveLocal(d);}await refreshIntelligence14o();}
    async function reviewProfile14o(id,action){if(!isAdmin14o())return;if(CFG.mode==='supabase'&&state?.db?.sb)await rpc14o('review_supplier_profile_v703314o',{p_id:id,p_action:action});else{const d=localData(),x=(d.profiles||[]).find(r=>String(r.id)===String(id));if(x)x.status=action==='activate'?'active':'disabled';saveLocal(d);}await refreshIntelligence14o();}
    window.__AV_14O_PRECHECK_FILE__=async file=>{resetImportIntelligence14o();await inspectFile14o(file);};
    document.addEventListener('change',e=>{const el=e.target;if(el instanceof HTMLInputElement&&el.type==='file'&&el.files?.[0])resetImportIntelligence14o();},true);
    document.addEventListener('input',e=>{if(e.target?.closest?.('#reviewArea')&&e.target?.type!=='file')intel.userTouched=true;},true);
    document.addEventListener('click',e=>{const override=e.target.closest?.('[data-14o-fingerprint-override]');if(override){if(isAdmin14o()){intel.fingerprintOverride=true;renderFingerprintWarning14o();toast('Admin override enabled for this exact PDF duplicate.');}return;}const clear=e.target.closest?.('[data-14o-clear-corrections]');if(clear){e.preventDefault();e.stopPropagation();clearCorrections14x().catch(err=>toast(friendlyError(err)));return;}const run=e.target.closest?.('[data-14o-run-regression]');if(run){runRegression14o();return;}const refresh=e.target.closest?.('[data-14o-refresh]');if(refresh){refreshIntelligence14o();return;}const correction=e.target.closest?.('[data-14o-correction]');if(correction){reviewCorrection14o(correction.dataset['14oCorrection'],correction.dataset.action).catch(err=>toast(friendlyError(err)));return;}const profile=e.target.closest?.('[data-14o-profile]');if(profile){reviewProfile14o(profile.dataset['14oProfile'],profile.dataset.action).catch(err=>toast(friendlyError(err)));return;}const save=e.target.closest?.('#saveImportBtn');if(save){if(intel.fingerprintDuplicate&&!intel.fingerprintOverride){e.preventDefault();e.stopImmediatePropagation();intel.duplicateBlocks++;toast('Exact PDF duplicate blocked.');return;}try{if(typeof collectParsed==='function')collectParsed();intel.pendingCorrections=[];}catch(err){console.warn('Parsed state capture skipped',err);}}},true);
    const observeReview14o=()=>{const area=document.getElementById('reviewArea');if(!area)return;const capture=()=>{if(!area.classList.contains('hidden')&&state?.parsed&&!intel.userTouched)setTimeout(snapshotParse14o,120);};new MutationObserver(capture).observe(area,{attributes:true,attributeFilter:['class']});capture();};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observeReview14o,{once:true});else observeReview14o();
    if(typeof renderDashboard==='function'&&!renderDashboard.__v703314o){const prevDashboard=renderDashboard;renderDashboard=function(){const r=prevDashboard.apply(this,arguments);try{if(isAdmin14o()&&Date.now()-intel.lastRefresh>30000)refreshIntelligence14o();}catch(_e){}return r;};renderDashboard.__v703314o=true;}
    runRegression14o();setTimeout(()=>refreshIntelligence14o(),600);diagnostics.installed=true;diagnostics.stage='ready';diagnostics.state=intel;diagnostics.runRegression=runRegression14o;diagnostics.refresh=refreshIntelligence14o;
  }catch(err){diagnostics.stage='failed';diagnostics.error=String(err?.message||err);console.warn('V7.03.3.14o parser intelligence enhancement failed non-fatally.',err);}
})();

(function v703314pInstallAerospaceRecovery(){
  if(window.__AV_14P_DIAGNOSTICS__?.installed)return;
  const api=globalThis.V7033Patch,diagnostics=window.__AV_14P_DIAGNOSTICS__={version:'7.03.3.14p',installed:false,stage:'boot',error:null,lastTargetedOcr:null};
  try{
    if(!api||typeof api.v703314pReconcileHeader!=='function'||typeof api.runAerospaceRegressionChecks14p!=='function'){diagnostics.stage='dependencies-unavailable';diagnostics.error='14p recovery helpers unavailable.';return;}
    async function targetedRecovery14p(file){
      if(!file||typeof v662FileKind!=='function'||v662FileKind(file)!=='pdf')return false;
      const T=await v661EnsureTesseract(),pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
      const data=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjs.getDocument({data}).promise;if(!pdf.numPages)return false;
      const recoveryPage=v703316TargetedRecoveryPage(state,pdf.numPages);if(!recoveryPage){await pdf.destroy?.();return false;}
      const page=await pdf.getPage(recoveryPage),vp=page.getViewport({scale:4.8}),canvas=document.createElement('canvas');canvas.width=Math.round(vp.width);canvas.height=Math.round(vp.height);await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;
      const crop=(x,y,w,h)=>{const c=document.createElement('canvas'),sx=Math.round(canvas.width*x),sy=Math.round(canvas.height*y),sw=Math.max(1,Math.round(canvas.width*w)),sh=Math.max(1,Math.round(canvas.height*h));c.width=sw;c.height=sh;c.getContext('2d',{willReadFrequently:true}).drawImage(canvas,sx,sy,sw,sh,0,0,sw,sh);return c;};
      const specs=[
        {key:'recovery-header-hi',label:'HEADER HIGH RES',x:.02,y:.05,w:.96,h:.53,psm:T.PSM?.SPARSE_TEXT??'11',prep:false},
        {key:'recovery-header-prep-hi',label:'HEADER PREP HIGH RES',x:.02,y:.05,w:.96,h:.53,psm:T.PSM?.SPARSE_TEXT??'11',prep:true},
        {key:'recovery-header-right-hi',label:'HEADER RIGHT HIGH RES',x:.45,y:.30,w:.53,h:.31,psm:T.PSM?.SINGLE_BLOCK??'6',prep:false},
        {key:'recovery-table-hi',label:'TABLE HIGH RES',x:.02,y:.48,w:.96,h:.49,psm:T.PSM?.SINGLE_BLOCK??'6',prep:false},
        {key:'recovery-table-prep-hi',label:'TABLE PREP HIGH RES',x:.02,y:.48,w:.96,h:.49,psm:T.PSM?.SINGLE_BLOCK??'6',prep:true}
      ],out=[],worker=await T.createWorker('eng');
      try{
        for(let i=0;i<specs.length;i++){
          const s=specs[i],rawCrop=crop(s.x,s.y,s.w,s.h),input=s.prep&&typeof v703314nPreprocessCanvas==='function'?v703314nPreprocessCanvas(rawCrop):rawCrop;
          setProgress(86+Math.round(((i+1)/specs.length)*8),'Deep recovery '+s.label+'…');await worker.setParameters({tessedit_pageseg_mode:s.psm,preserve_interword_spaces:'1',user_defined_dpi:'300'});
          const r=await worker.recognize(input,{}, {text:true,tsv:true,hocr:true,blocks:true}),layout=typeof ocrResultToLayout==='function'?ocrResultToLayout(r.data||{},recoveryPage,input.height,input.width):null,text=String(r.data?.text||'').trim()||(layout?.rows||[]).map(x=>x.text).join('\n').trim();
          if(text)out.push({source:s.key,label:s.label,text,layout:layout?[layout]:[],score:1800+(typeof ocrTextQuality==='function'?ocrTextQuality(text):0)+(layout&&typeof layoutInvoiceQuality==='function'?layoutInvoiceQuality(layout):0)});
          if(input!==rawCrop){input.width=0;input.height=0;}rawCrop.width=0;rawCrop.height=0;
        }
      }finally{await worker.terminate();canvas.width=0;canvas.height=0;await pdf.destroy?.();}
      if(out.length){const existing=[...(state.ocrCandidates||[])],seen=new Set(existing.map(x=>String(x.source||'')+'|'+String(x.text||'').replace(/\s+/g,' ').slice(0,500)));for(const x of out){const key=x.source+'|'+x.text.replace(/\s+/g,' ').slice(0,500);if(!seen.has(key)){seen.add(key);existing.push(x);}}state.ocrCandidates=existing.sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));}
      diagnostics.lastTargetedOcr={at:new Date().toISOString(),candidates:out.map(x=>({source:x.source,chars:x.text.length,rows:x.layout?.[0]?.rows?.length||0}))};return out.length>0;
    }
    if(typeof forceOcrRecovery==='function'&&!forceOcrRecovery.__v703314p){
      const previousForce=forceOcrRecovery,wrapped=async function(file){let base=false,extra=false;try{base=await previousForce(file);}catch(err){console.warn('Base recovery OCR failed; 14p targeted recovery will still be attempted.',err);}const hasReferenceEvidence=(state.v411ReferenceOcrEvidence||[]).length>0;if(!hasReferenceEvidence){try{extra=await targetedRecovery14p(file);}catch(err){console.warn('14p targeted recovery OCR could not complete.',err);}}else console.info('Targeted recovery skipped: independent reference evidence already exists.');return !!(base||extra);};wrapped.__v703314p=true;forceOcrRecovery=wrapped;
    }
    function collectRecovered14p(sources=[]){
      const combined=(sources||[]).map(x=>String(x?.text||'')).filter(Boolean).join('\n'),rows=[];
      for(const src of sources||[]){
        rows.push(...(api.v703314pRecoverEquipmentRows(String(src?.text||''),String(src?.source||'evidence'))||[]));
        if(Array.isArray(src?.layout)&&src.layout.length){const old=state.pdfLayout;try{state.pdfLayout=src.layout;for(const fn of [typeof v679StrictLayoutItems==='function'?v679StrictLayoutItems:null,typeof v661ParseProductCodeLayoutItems==='function'?v661ParseProductCodeLayoutItems:null,typeof v661FlexibleProductLayoutItems==='function'?v661FlexibleProductLayoutItems:null]){if(fn)try{rows.push(...(fn()||[]));}catch(_e){}}}finally{state.pdfLayout=old;}}
      }
      let safe=rows;try{if(typeof inventoryOnlyItems==='function')safe=inventoryOnlyItems(safe);}catch(_e){}try{if(typeof sanitizeParsedInventoryItems==='function')safe=sanitizeParsedInventoryItems(safe,combined);}catch(_e){}try{if(typeof v677ValidateInvoiceLines==='function')safe=v677ValidateInvoiceLines(safe,combined);}catch(_e){}
      const seen=new Set(),out=[];for(const x of safe||[]){const key=[String(x.sku||'').toLowerCase().replace(/[^a-z0-9]/g,''),String(x.item_name||x.description||'').toLowerCase().replace(/[^a-z0-9]/g,''),Number(x.quantity)||0,Number(x.amount)||0].join('|');if(!key.replace(/[|0]/g,'')||seen.has(key))continue;seen.add(key);out.push(x);}return out;
    }
    function recoverBaselineCompatibleEquipment14x(sources=[]){
      const combined=sources.map(x=>String(x?.text||'')).filter(Boolean).join('\n'),rows=[],old=state.pdfLayout;
      const add=(arr,origin)=>{for(const raw of arr||[]){const x=normalizeParsedInvoiceItem(raw);if(!String(x.item_name||x.description||'').trim()||!(Number(x.quantity)>0))continue;if(isNonInventoryServiceLine(x)||isExcludedInventoryAccessoryLine(x)||v676IsSupportCoverageLine(x))continue;const q=Number(x.quantity),u=Number(x.unit_price),a=Number(x.amount);if(Number.isFinite(q)&&Number.isFinite(u)&&Number.isFinite(a)&&Math.abs(q*u-a)>Math.max(.06,Math.abs(a)*.01))continue;rows.push({...x,v703314xRecoveryOrigin:origin,v703314xBaselineCompatible:true});}};
      try{for(const src of sources){if(!Array.isArray(src.layout)||!src.layout.length)continue;state.pdfLayout=src.layout;for(const pair of [[typeof v679StrictLayoutItems==='function'?v679StrictLayoutItems:null,'strict-layout'],[typeof v661ParseProductCodeLayoutItems==='function'?v661ParseProductCodeLayoutItems:null,'product-layout'],[typeof v661FlexibleProductLayoutItems==='function'?v661FlexibleProductLayoutItems:null,'flex-layout']]){if(pair[0])try{add(pair[0](),String(src.source||'source')+'|'+pair[1]);}catch(_e){}}}}finally{state.pdfLayout=old;}
      const seen=new Set(),out=[];for(const x of rows){const key=[String(x.sku||'').toLowerCase().replace(/[^a-z0-9]/g,''),String(x.item_name||x.description||'').toLowerCase().replace(/[^a-z0-9]/g,''),Number(x.quantity)||0,Number(x.amount)||0].join('|');if(seen.has(key))continue;seen.add(key);out.push(x);}return out;
    }
    if(typeof v661FinalizeParsedInvoice==='function'&&!v661FinalizeParsedInvoice.__v703314p){
      const previousFinalizer=v661FinalizeParsedInvoice,wrapped=function(){let out=previousFinalizer.apply(this,arguments),raw=String(arguments[1]||out?.raw||out?.rawText||''),sources=typeof v661EvidenceSources==='function'?v661EvidenceSources(raw):[{source:'primary',text:raw,layout:[]}];out={...out,doc:api.v703314pReconcileHeader(out?.doc||{},sources)};
        if(!(out.items||[]).length){let recovered=collectRecovered14p(sources);if(!recovered.length)recovered=recoverBaselineCompatibleEquipment14x(sources);if(recovered.length)out={...out,items:recovered,excludedServiceCount:Number(out.excludedServiceCount)||0,v703314xRegressionRecovery:true};}
        const combined=sources.map(x=>String(x?.text||'')).filter(Boolean).join('\n'),strong=api.v703314pStrongEquipmentInvoice(combined),verifiedItems=(out.items||[]).filter(x=>String(x?.item_name||x?.description||'').trim()&&Number(x?.quantity)>0&&!isNonInventoryServiceLine(x)&&!isExcludedInventoryAccessoryLine(x)&&!v676IsSupportCoverageLine(x));if(strong.strong&&!['service','noninventory'].includes(out?.invoiceClassification?.type||'')){out.invoiceClassification={...(out.invoiceClassification||{}),type:verifiedItems.length?'equipment':'uncertain',reason:verifiedItems.length?strong.reason:'Equipment evidence detected, but no physical line item has passed verification yet.',v703314pEquipmentCandidate:true,v703314pAutoEquipment:verifiedItems.length>0,v703314pEquipmentVerified:verifiedItems.length>0};out.serviceOnlyInvoice=false;out.nonInventoryOnlyInvoice=false;}
        out.items=verifiedItems;
        const finalized=window.InventoryHubCanonicalParser.fromPipeline(out,{raw});
        finalized.items=validParsedItems(finalized.items||[]);
        return finalized;};wrapped.__v703314p=true;v661FinalizeParsedInvoice=wrapped;
    }
    if(typeof renderImportEligibility==='function'&&!renderImportEligibility.__v703314p){
      const previousEligibility=renderImportEligibility,wrapped=function(){const parsed=state?.parsed,raw=String(parsed?.raw||parsed?.rawText||''),strong=parsed?.invoiceClassification?.type==='equipment'||api.v703314pStrongEquipmentInvoice(raw).strong,items=(parsed?.items||[]).filter(x=>String(x?.item_name||x?.description||'').trim()&&Number(x?.quantity)>0&&!isNonInventoryServiceLine(x)&&!isExcludedInventoryAccessoryLine(x)&&!v676IsSupportCoverageLine(x)),verified=items.length>0&&(parsed?.invoiceClassification?.v703314pEquipmentVerified===true||parsed?.invoiceClassification?.type==='equipment');if(strong&&parsed&&!['service','noninventory'].includes(parsed?.invoiceClassification?.type||'')){parsed.invoiceClassification={...(parsed.invoiceClassification||{}),type:verified?'equipment':'uncertain',reason:verified?(parsed.invoiceClassification?.reason||'Verified physical equipment evidence.'):'Equipment evidence detected; physical line-item verification is still required.',v703314pEquipmentCandidate:true,v703314pAutoEquipment:verified,v703314pEquipmentVerified:verified};if(verified)state.importClassificationChoice='equipment';}
        const result=previousEligibility.apply(this,arguments);if(strong&&parsed){const note=document.getElementById('invoiceEligibilityWarning'),missingInvoice=!String(parsed.doc?.invoice_number||'').trim();if(note&&(!verified||missingInvoice)){note.classList.add('hidden');note.innerHTML='';}}return result;};wrapped.__v703314p=true;renderImportEligibility=wrapped;
    }
    diagnostics.regression=api.runAerospaceRegressionChecks14p();diagnostics.installed=true;diagnostics.stage=diagnostics.regression.ok?'ready':'regression-failed';
  }catch(err){diagnostics.stage='failed';diagnostics.error=String(err?.message||err);console.warn('V7.03.3.14p Aerospace recovery enhancement failed non-fatally.',err);}
})();

(function v703314qInstallMoneyAndGroupHardening(){
  if(window.__AV_14Q_DIAGNOSTICS__?.installed)return;
  const api=globalThis.V7033Patch,diagnostics=window.__AV_14Q_DIAGNOSTICS__={version:'7.03.3.14x',installed:false,stage:'boot',error:null};
  try{
    if(!api||typeof api.v703314qChooseMoneyCandidate!=='function'){diagnostics.stage='dependencies-unavailable';diagnostics.error='14q monetary consensus helpers unavailable.';return;}
    function candidateRows14q(raw=''){
      const sources=typeof v661EvidenceSources==='function'?v661EvidenceSources(raw):[{source:'chosen',text:raw,layout:state.pdfLayout||[]}],rows=[],oldLayout=state.pdfLayout;
      const add=(items,source,strict=false,observed=3)=>{for(const x of items||[])rows.push({...x,v703314qSource:source,v703314qStrictLayout:strict,v703314qObservedFields:observed});};
      try{
        for(const src of sources){
          if(Array.isArray(src.layout)&&src.layout.length){
            state.pdfLayout=src.layout;
            if(typeof v679StrictLayoutItems==='function')try{add(v679StrictLayoutItems(),src.source+'|strict-layout',true,3);}catch(_e){}
            if(typeof v661ParseProductCodeLayoutItems==='function')try{add(v661ParseProductCodeLayoutItems(),src.source+'|product-layout',/table.*hi/i.test(src.source),3);}catch(_e){}
            if(typeof v661FlexibleProductLayoutItems==='function')try{add(v661FlexibleProductLayoutItems(),src.source+'|flex-layout',/table.*hi/i.test(src.source),3);}catch(_e){}
          }
          if(typeof v662ParsePhysicalEvidenceRows==='function')try{add(v662ParsePhysicalEvidenceRows(src.text||''),src.source+'|text-physical',false,3);}catch(_e){}
          if(typeof v690ParseNumberedPricedRows==='function')try{add(v690ParseNumberedPricedRows(src.text||''),src.source+'|numbered-text',false,3);}catch(_e){}
        }
      }finally{state.pdfLayout=oldLayout;}
      return {sources,rows};
    }
    function reconcileMoney14q(parsed={},raw=''){
      if(!parsed||!Array.isArray(parsed.items)||!parsed.items.length)return parsed;
      const evidence=candidateRows14q(raw),out={...parsed,items:parsed.items.map(x=>({...x}))},repairs=[],reviews=[];
      for(let i=0;i<out.items.length;i++){
        const row=out.items[i];
        // A V2-promoted row has already passed independent geometry + arithmetic proof.
        // Do not let a weaker legacy money candidate overwrite that verified source row.
        if(row.parserV2Promoted===true&&row.layoutEvidenceVerified===true&&row.economicEvidenceVerified===true)continue;
        const choice=api.v703314qChooseMoneyCandidate(row,evidence.rows);
        if(choice.changed){
          const before={quantity:row.quantity,unit_price:row.unit_price,amount:row.amount};
          row.quantity=choice.values.quantity;row.unit_price=choice.values.unit_price;row.amount=choice.values.amount;
          row.quantityReviewRequired=false;row.priceReviewRequired=false;row.unit_priceReviewRequired=false;row.amountReviewRequired=false;
          if(row.v7033ReviewFields){delete row.v7033ReviewFields.quantity;delete row.v7033ReviewFields.unit_price;delete row.v7033ReviewFields.amount;}
          row.v703314qMoneyRecovery={before,after:{quantity:row.quantity,unit_price:row.unit_price,amount:row.amount},reason:choice.reason,evidence:choice.evidence};repairs.push({index:i,sku:row.sku||'',...row.v703314qMoneyRecovery});
        }else if(choice.review){
          const economics=api.v703314qEconomicValues(row);
          row.quantityReviewRequired=!!row.quantityReviewRequired||!economics.ok;row.priceReviewRequired=true;row.amountReviewRequired=true;row.humanReviewRequired=true;row.needsReview=true;
          row.v7033ReviewFields={...(row.v7033ReviewFields||{}),unit_price:{status:'review',reason:choice.reason},amount:{status:'review',reason:choice.reason}};reviews.push({index:i,sku:row.sku||'',reason:choice.reason});
        }
      }
      if(repairs.length||reviews.length)out.v703314qMoneyConsensus={repairs,reviews,candidate_rows:evidence.rows.length,sources:evidence.sources.map(x=>x.source)};
      return out;
    }
    if(typeof v661FinalizeParsedInvoice==='function'&&!v661FinalizeParsedInvoice.__v703314q){
      const previous=v661FinalizeParsedInvoice,wrapped=function(){let out=previous.apply(this,arguments);const raw=String(arguments[1]||out?.raw||out?.rawText||'');out=reconcileMoney14q(out,raw);return window.InventoryHubCanonicalParser.fromPipeline(out,{raw});};wrapped.__v703314q=true;v661FinalizeParsedInvoice=wrapped;
    }
    function collapseDocumentGroups14q(root=document){
      root.querySelectorAll?.('.v669-doc-group').forEach(section=>{if(section.dataset.v703314qCollapsed==='1')return;const toggle=section.querySelector('.v669-doc-group-toggle'),body=section.querySelector('.v669-doc-group-body');if(!toggle||!body)return;body.classList.add('hidden');toggle.setAttribute('aria-expanded','false');const span=toggle.querySelector('span');if(span)span.textContent=span.textContent.replace(/[▾▸]\s*$/,'').trim()+' ▸';section.dataset.v703314qCollapsed='1';});
    }
    function initialiseInventoryGroups14q(root=document){
      root.querySelectorAll?.('#inventoryTable .inventory-company-group').forEach(section=>{if(section.dataset.v703314qCollapsed==='1')return;const head=section.querySelector('.document-group-head'),table=section.querySelector('table');if(!head||!table)return;table.hidden=true;head.setAttribute('role','button');head.setAttribute('tabindex','0');head.setAttribute('aria-expanded','false');head.style.cursor='pointer';const count=head.querySelector('span');if(count)count.textContent=count.textContent.replace(/[▾▸]\s*$/,'').trim()+' ▸';const toggle=()=>{const hidden=!table.hidden;table.hidden=hidden;head.setAttribute('aria-expanded',String(!hidden));if(count)count.textContent=count.textContent.replace(/[▾▸]\s*$/,'').trim()+(hidden?' ▸':' ▾');};head.addEventListener('click',toggle);head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});section.dataset.v703314qCollapsed='1';});
    }
    function enforceCollapsedGroups14q(){collapseDocumentGroups14q();initialiseInventoryGroups14q();}
    const groupObserver=new MutationObserver(()=>queueMicrotask(enforceCollapsedGroups14q)),startObserver=()=>{const docs=document.getElementById('documentsTable'),inv=document.getElementById('inventoryTable');if(docs)groupObserver.observe(docs,{childList:true,subtree:true});if(inv)groupObserver.observe(inv,{childList:true,subtree:true});enforceCollapsedGroups14q();};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startObserver,{once:true});else startObserver();
    if(typeof renderInventory==='function'&&!renderInventory.__v703314q){const prev=renderInventory;renderInventory=function(){const r=prev.apply(this,arguments);initialiseInventoryGroups14q();return r;};renderInventory.__v703314q=true;}
    document.addEventListener('change',e=>{if(e.target?.id==='inventoryGroup')setTimeout(initialiseInventoryGroups14q,0);},true);
    document.addEventListener('click',e=>{if(e.target.closest?.('[data-v669-doc-layout="company"]'))setTimeout(collapseDocumentGroups14q,0);},true);
    diagnostics.regression=api.runMonetaryConsensusRegressionChecks14q();diagnostics.installed=true;diagnostics.stage=diagnostics.regression.ok?'ready':'regression-failed';diagnostics.reconcileMoney=reconcileMoney14q;diagnostics.enforceGroups=enforceCollapsedGroups14q;
  }catch(err){diagnostics.stage='failed';diagnostics.error=String(err?.message||err);console.warn('V7.03.3.14x money/group hardening failed non-fatally.',err);}
})();

(function v703314xInstallResolutionAndMergeFlow(){
  if(window.__V703314X_RESOLUTION_MERGE_FLOW__)return;
  window.__V703314X_RESOLUTION_MERGE_FLOW__=true;

  if(typeof LocalDB!=='undefined'){
    LocalDB.prototype.resolveHealthIssue=async function(issue,note=''){
      const d=this.data();d.healthReviews=d.healthReviews||[];
      let r=d.healthReviews.find(x=>String(x.issue_key)===String(issue.key));
      const now=nowIso(),actor=this.user||'Team Member';
      if(!r){r={issue_key:issue.key,issue_type:issue.type,entity_type:issue.entity_type||null,entity_id:issue.entity_id||null,title:issue.title||'',detail:issue.detail||'',reviewed_by:actor,reviewed_at:now};d.healthReviews.unshift(r);}
      Object.assign(r,{resolution_status:'resolved',resolution_note:String(note||''),resolved_at:now,resolved_by:actor});
      this.audit(d,'health_issue_reviews',String(issue.key),'RESOLVE',null,{...r});this.save(d);return r;
    };
  }
  if(typeof SupabaseDB!=='undefined'){
    const v703314xBaseLoad=SupabaseDB.prototype.load;
    SupabaseDB.prototype.load=async function(){
      const data=await v703314xBaseLoad.apply(this,arguments);
      const {data:reviews,error}=await this.sb.rpc('get_health_issue_reviews_v703314x');
      if(error)throw error;
      data.healthReviews=Array.isArray(reviews)?reviews:[];
      return data;
    };
    SupabaseDB.prototype.resolveHealthIssue=async function(issue,note=''){
      const {data,error}=await this.sb.rpc('resolve_health_issue_v703314x',{p_issue_key:issue.key,p_issue_type:issue.type,p_entity_type:issue.entity_type||null,p_entity_id:issue.entity_id||null,p_title:issue.title||'',p_detail:issue.detail||'',p_note:String(note||'')});
      if(error){const msg=String(error.message||error||'');if(/resolve_health_issue_v703314x|PGRST202|42883|schema cache/i.test(msg))throw new Error('Data Health Resolve database migration is not installed yet.');throw error;}
      return data;
    };
  }

  const reviewMap14x=()=>new Map((state.data?.healthReviews||[]).filter(r=>r?.issue_key).map(r=>[String(r.issue_key),r]));
  const unresolvedHealthIssues14x=()=>{
    const reviews=reviewMap14x();
    return (buildAllHealthIssues()||[]).filter(x=>String(reviews.get(String(x.key))?.resolution_status||'').toLowerCase()!=='resolved').map(x=>({...x,review:reviews.get(String(x.key))||null}));
  };
  buildHealthIssues=unresolvedHealthIssues14x;

  // Core init() has already completed before this 14x installer runs. Hydrate persisted
  // health reviews once now so a browser refresh cannot render raw findings as unresolved.
  const hydratePersistedHealthReviews14x=async()=>{
    if(CFG.mode!=='supabase'||!state?.db||typeof state.db.load!=='function')return state.data;
    const hydrated=await state.db.load();
    state.data=hydrated;
    return hydrated;
  };

  issueRow=function(x){
    const review=issueReviewButton(x);
    const resolve=(canEdit()&&x.type==='Possible duplicate SKU')?'<button class="secondary small-btn" data-health-resolve="'+esc(x.key)+'">Resolve</button>':'';
    return '<div class="attention-row '+esc(x.severity)+'"><span class="attention-severity"><i data-lucide="'+(x.severity==='high'?'triangle-alert':x.severity==='medium'?'circle-alert':'info')+'"></i></span><div><strong>'+esc(x.type)+' · '+esc(x.title)+'</strong><p>'+esc(x.detail)+'</p></div><div style="display:flex;gap:8px;align-items:center">'+review+resolve+'</div></div>';
  };
  function issueActions14x(x){
    if(x?.type==='Possible duplicate SKU'&&x?.entity_type==='master_items_pair'){
      const review=issueReviewButton(x);
      const resolve=canEdit()?'<button class="secondary small-btn" type="button" data-health-resolve="'+esc(x.key)+'">Resolve</button>':'';
      return '<div class="health-actions">'+review+resolve+'</div>';
    }
    const open='<button class="secondary small-btn" type="button" data-health-open="'+esc(x.key)+'">Open</button>';
    const reviewed=x?.review?'<span class="health-review-state reviewed">Reviewed</span>':'';
    const review=canEdit()&&!x?.review?'<button class="secondary small-btn" type="button" data-health-review="'+esc(x.key)+'">Mark reviewed</button>':'';
    const resolve=canEdit()?'<button class="secondary small-btn" type="button" data-health-resolve="'+esc(x.key)+'">Resolve</button>':'';
    return '<div class="health-actions">'+reviewed+open+review+resolve+'</div>';
  }
  function issueRow14x(x){
    return '<div class="attention-row '+esc(x.severity)+'"><span class="attention-severity"><i data-lucide="'+(x.severity==='high'?'triangle-alert':x.severity==='medium'?'circle-alert':'info')+'"></i></span><div><strong>'+esc(x.type)+' · '+esc(x.title)+'</strong><p>'+esc(x.detail)+'</p></div>'+issueActions14x(x)+'</div>';
  }
  function renderNeedsAttention14x(openDialog=false){
    const issues=unresolvedHealthIssues14x(),score=healthScore(issues),high=issues.filter(x=>x.severity==='high').length;
    if($('needsAttentionCount'))$('needsAttentionCount').textContent=issues.length;
    if($('needsAttentionSummary'))$('needsAttentionSummary').textContent=issues.length?`${high?high+' important · ':''}${issues.length} record${issues.length===1?'':'s'} to review`:'No issues detected';
    if($('dataHealthScore')){$('dataHealthScore').textContent=`${score}% ${healthLabel(score)}`;$('dataHealthScore').classList.toggle('warn',score<85);}
    if($('attentionSummary'))$('attentionSummary').innerHTML='<strong>'+issues.length+' item'+(issues.length===1?'':'s')+' need review</strong><span>Data health score: '+score+'%</span>';
    if($('attentionList'))$('attentionList').innerHTML=issues.length?issues.map(issueRow14x).join(''):'<div class="empty">No active findings. Your records look healthy.</div>';
    if(openDialog&&$('attentionDialog')&&!$('attentionDialog').open)$('attentionDialog').showModal();
    window.lucide?.createIcons();
    return issues;
  }
  renderAutomationCentre=function(){renderNeedsAttention14x(false);if($('importRuleSummary'))$('importRuleSummary').textContent='Loud + AV Media rules active';};
  openAttention=function(){renderNeedsAttention14x(true);};

  // Reconcile the already-rendered dashboard with persisted resolutions after 14x installs.
  hydratePersistedHealthReviews14x().then(()=>{
    renderNeedsAttention14x(false);
    if($('healthDialog')?.open){try{openHealth();}catch(_e){}}
  }).catch(err=>{
    console.error('v7.03.3.14x persisted Data Health hydration failed',err);
  });

  const previousIssueReviewButton14x=issueReviewButton;
  issueReviewButton=function(x){
    if(x?.type==='Possible duplicate SKU'&&x?.entity_type==='master_items_pair')return previousIssueReviewButton14x(x);
    const open='<button class="secondary small-btn" type="button" data-health-open="'+esc(x.key)+'">Open</button>';
    const reviewed=x?.review?'<span class="health-review-state reviewed">Reviewed</span>':'';
    const review=canEdit()&&!x?.review?'<button class="secondary small-btn" type="button" data-health-review="'+esc(x.key)+'">Mark reviewed</button>':'';
    const resolve=canEdit()?'<button class="secondary small-btn" type="button" data-health-resolve="'+esc(x.key)+'">Resolve</button>':'';
    return '<div class="health-actions">'+reviewed+open+review+resolve+'</div>';
  };

  document.addEventListener('click',async e=>{
    const b=e.target.closest?.('[data-health-resolve]');if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    const issue=(buildAllHealthIssues()||[]).find(x=>String(x.key)===String(b.dataset.healthResolve||''));
    if(!issue){toast('This finding is no longer detected.');return;}
    if(!canEdit()||typeof state.db?.resolveHealthIssue!=='function')return;
    if(!confirm('Resolve this Data Health finding? Use this when the record is valid as-is, for example equipment that does not have a serial number.'))return;
    b.disabled=true;
    try{
      await state.db.resolveHealthIssue(issue,'Confirmed valid as-is by user.');
      state.data=await state.db.load();renderAll();
      if($('healthDialog')?.open){try{openHealth();}catch(_e){}}
      toast('✓ Data Health finding resolved.');
    }catch(err){console.error(err);toast(friendlyError(err));b.disabled=false;}
  },true);
})();

function v411ReviewEvidenceForRow(row={},entries=[]){
  const words=text=>new Set(String(text||'').toLowerCase().match(/[a-z]{4,}/g)||[]);
  const label=words(row.item_name||row.description),ordinal=Number(row.cellOcrRecovery?.ordinal||String(row.sourceText||'').match(/^\s*(\d{1,2})\s+/)?.[1]||0);
  const scored=(entries||[]).filter(e=>e?.review_geometry&&Number(e.page)>0).map(e=>{
    const anchor=words(e.anchor_text),shared=[...label].filter(w=>anchor.has(w)).length;
    const similarity=label.size?shared/label.size:0;
    return {entry:e,score:similarity+(ordinal&&Number(e.ordinal)===ordinal?0.5:0),shared,similarity};
  }).filter(x=>x.shared>=2&&(x.similarity>=0.72||(ordinal&&Number(x.entry.ordinal)===ordinal&&x.similarity>=0.35)))
    .sort((a,b)=>b.score-a.score);
  // No guessed association when OCR produced multiple plausible table rows.
  return scored.length===1||scored[0]?.score>scored[1]?.score+0.25?scored[0]?.entry||null:null;
}

function v411InstallReviewEvidenceViewer(){
  const pane=$('parsedItems');if(!pane||pane.__v411EvidenceViewer)return;
  pane.__v411EvidenceViewer=true;
  const previousRender=renderParsedItems;
  renderParsedItems=function(){
    const result=previousRender.apply(this,arguments);
    if(state.parsed?.v411ParserDisposition==='ready')return result;
    for(const [index,row] of (state.parsed?.items||[]).entries()){
      const missing=['quantity','unit_price','amount'].filter(f=>row[f]===null||row[f]===undefined||row[f]==='');
      if(!row.sku)missing.unshift('description');
      if(!missing.length)continue;
      const host=pane.querySelector(`.parsed-row[data-pi="${index}"]`),entry=v411ReviewEvidenceForRow(row,state.v411NumericCellOcrEvidence);
      if(!host)continue;
      const details=document.createElement('details');details.className='review-source-evidence';
      const title=document.createElement('summary');title.textContent='Inspect source for '+missing.map(f=>({quantity:'Qty',unit_price:'Unit price',amount:'Amount',description:'Model'}[f])).join(', ');
      details.appendChild(title);
      const note=document.createElement('p');note.textContent=entry?'Original PDF crop and OCR readings are for comparison only. Threshold variants may share the same image and are not independent votes.':'No uniquely matched positioned crop. Compare this line in the PDF preview; leave unreadable fields blank.';
      details.appendChild(note);
      if(entry){
        for(const field of missing){
          const box=entry.review_geometry?.boxes?.[field];if(!box)continue;
          const button=document.createElement('button');button.type='button';button.className='secondary small-btn';button.dataset.reviewCrop=index;button.dataset.reviewField=field;
          button.textContent='View '+({quantity:'Qty',unit_price:'Unit price',amount:'Amount',description:'Model'}[field])+' crop';details.appendChild(button);
          const readings=(entry[field+'_ocr']||[]).filter(x=>String(x.text||'').trim());
          const evidence=document.createElement('small');evidence.className='review-source-readings';
          const unique=[...new Set(readings.map(x=>String(x.text).trim()+' ['+String(x.variant||'unknown')+']'))];
          evidence.textContent=unique.length?'OCR readings: '+unique.slice(0,12).join(' · ')+(unique.length>12?` · ${unique.length-12} more`:''):'OCR readings: no usable token';
          details.appendChild(evidence);
        }
      }
      const output=document.createElement('div');output.className='review-source-crop';details.appendChild(output);
      host.appendChild(details);
    }
    return result;
  };
  pane.addEventListener('click',async event=>{
    const button=event.target.closest?.('[data-review-crop]');if(!button)return;
    event.preventDefault();
    const index=Number(button.dataset.reviewCrop),field=button.dataset.reviewField;
    const row=state.parsed?.items?.[index],entry=v411ReviewEvidenceForRow(row,state.v411NumericCellOcrEvidence);
    const geometry=entry?.review_geometry,box=geometry?.boxes?.[field];
    const output=button.closest('details')?.querySelector('.review-source-crop');
    if(!row||!output||!box||!['description','quantity','unit_price','amount'].includes(field))return;
    output.textContent='Rendering original PDF crop…';button.disabled=true;
    try{
      const pdf=await ensurePdfPreviewDocument14x(),page=await pdf.getPage(Number(entry.page)),base=page.getViewport({scale:1});
      const scale=Number(geometry.width)/base.width;
      if(!Number.isFinite(scale)||scale<4.1||scale>10||!Number.isFinite(box.x+box.y+box.w+box.h)
        ||box.x<0||box.y<0||box.x+box.w>geometry.width||box.y+box.h>geometry.height)throw new Error('Crop geometry unavailable');
      const full=document.createElement('canvas'),vp=page.getViewport({scale});full.width=Math.round(vp.width);full.height=Math.round(vp.height);
      await page.render({canvasContext:full.getContext('2d'),viewport:vp}).promise;
      const padX=Math.max(28,Math.round(box.w*.22)),padY=Math.max(24,Math.round(box.h*.8));
      const x=Math.max(0,box.x-padX),y=Math.max(0,box.y-padY),w=Math.min(full.width-x,box.w+2*padX),h=Math.min(full.height-y,box.h+2*padY);
      const crop=document.createElement('canvas');crop.width=w;crop.height=h;crop.setAttribute('aria-label',`Original invoice page ${entry.page}, ${field} crop`);
      crop.getContext('2d').drawImage(full,x,y,w,h,0,0,w,h);
      output.replaceChildren(crop);
      state.pdfPreviewPage=Number(entry.page);updatePdfPreview().catch(console.error);
    }catch(error){output.textContent='Could not render this crop. Use the original PDF preview.';console.warn('Review crop unavailable',error);}
    finally{button.disabled=false;}
  });
}

v411InstallReviewEvidenceViewer();

// Final parser boundary: candidate/enrichment stages may contribute evidence, but only
// InventoryHubCanonicalParser publishes the normalized result consumed by UI/save code.
if(typeof v661FinalizeParsedInvoice==='function'&&!v661FinalizeParsedInvoice.__canonicalAuthorityV11){
  const candidateFinalizer=v661FinalizeParsedInvoice;
  v661FinalizeParsedInvoice=function(){
    const candidate=candidateFinalizer.apply(this,arguments);
    const raw=String(arguments[1]||candidate?.rawEvidence||candidate?.raw||candidate?.rawText||'');
    return window.InventoryHubCanonicalParser.fromPipeline(candidate,{raw});
  };
  v661FinalizeParsedInvoice.__canonicalAuthorityV11=true;
}

try{installParseAuditWrappers();configureInvoiceFileInputs();}catch(e){console.warn('V6.69 optional audit/file-input setup skipped',e);}

  window.__AV_DIRECT_RUNTIME_LOADED__='7.03.3.14z';
  return true;
})().catch(err=>{window.__AV_DIRECT_RUNTIME_ERROR__=String(err?.message||err);console.error('AV Inventory Hub v7.03.3.14z direct runtime failed',err);throw err;});

setInterval(()=>{try{if(window.state?.parsed?.items){const filtered=validParsedItems(window.state.parsed.items);if(filtered.length!==window.state.parsed.items.length){window.state.parsed.items=filtered;if(typeof renderParsedItems==='function')renderParsedItems();if(typeof renderImportEligibility==='function')renderImportEligibility();}}}catch(_e){}},250);
