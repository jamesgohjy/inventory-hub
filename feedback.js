(()=>{
'use strict';
const $=id=>document.getElementById(id);
const cfg=window.INVENTORY_CONFIG||{};
let client=null,currentUser=null,currentRole='viewer',items=[],adminNotices=[],active=null,previewUrl='',authSubscription=null,realtimeChannel=null,broadcastChannel=null,identitySeq=0,liveFallbackTimer=null,lastUnread=0,realtimeReconnectTimer=null;
const wordCount=v=>String(v||'').trim()?String(v).trim().split(/\s+/).filter(Boolean).length:0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>{try{return new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}catch{return String(v||'');}};
const setError=msg=>{const e=$('feedbackFormError');if(!e)return;e.textContent=msg||'';e.classList.toggle('hidden',!msg);};
function toast(msg){const t=$('toast');if(!t)return;t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3000);}
async function ensureClient(){
 if(client)return client;
 if(!window.supabase?.createClient||!cfg.supabaseUrl||!cfg.supabaseAnonKey)return null;
 client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 return client;
}
async function applyIdentity(user){
 const seq=++identitySeq;currentUser=user||null;let role='viewer';
 if(currentUser){
  const {data,error}=await client.from('profiles').select('role').eq('id',currentUser.id).maybeSingle();
  if(error)console.warn('Feedback profile lookup',error);
  role=String(data?.role||'viewer').trim().toLowerCase();
 }
 if(seq!==identitySeq)return;
 currentRole=role;
 const bell=$('feedbackBellBtn'),openBtn=$('feedbackOpenBtn'),importBtn=$('reportImportIssueBtn');
 if(bell)bell.classList.toggle('hidden',currentRole!=='admin');
 // Feedback submission controls are for Editor/Viewer only. Admin receives/manages submissions instead.
 const canSubmit=currentRole==='editor'||currentRole==='viewer';
 if(openBtn)openBtn.classList.toggle('hidden',!canSubmit);
 if(importBtn)importBtn.classList.toggle('hidden',!canSubmit);
 await syncRealtime();
 syncFallback();
 if(currentRole==='admin')await loadInbox(false);else updateBadge(0);
}
async function refreshIdentity(){
 const c=await ensureClient();if(!c)return;
 // getSession reads the persisted session immediately and avoids the initial getUser race seen after page navigation/login.
 const {data,error}=await c.auth.getSession();
 if(error)console.warn('Feedback session lookup',error);
 await applyIdentity(data?.session?.user||null);
}
async function syncRealtime(){
 if(!client)return;
 if(realtimeReconnectTimer){clearTimeout(realtimeReconnectTimer);realtimeReconnectTimer=null;}
 if(realtimeChannel){try{await client.removeChannel(realtimeChannel);}catch{}realtimeChannel=null;}
 if(broadcastChannel){try{await client.removeChannel(broadcastChannel);}catch{}broadcastChannel=null;}
 if(currentRole!=='admin'||!currentUser)return;
 const reconnect=()=>{
  if(realtimeReconnectTimer)clearTimeout(realtimeReconnectTimer);
  realtimeReconnectTimer=setTimeout(()=>{if(currentRole==='admin'&&currentUser)syncRealtime();},2000);
 };
 // Primary DB change stream.
 realtimeChannel=client.channel('inventory-feedback-db-'+currentUser.id)
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'feedback_submissions'},async payload=>{console.info('[Feedback Live] DB INSERT',payload?.new?.id||'');await loadInbox(false,true);})
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'feedback_submissions'},async()=>{await loadInbox(false,false);})
  .on('postgres_changes',{event:'DELETE',schema:'public',table:'feedback_submissions'},async()=>{await loadInbox(false,false);})
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'admin_notifications'},async payload=>{console.info('[Admin Live] account notification',payload?.new?.id||'');await loadInbox(false,true);})
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'admin_notifications'},async()=>{await loadInbox(false,false);})
  .subscribe(status=>{
    console.info('[Feedback Live] DB channel',status);
    if(status==='SUBSCRIBED')loadInbox(false,false);
    if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')reconnect();
  });
 // Immediate lightweight signal from the submitting browser. No feedback content is broadcast; Admin re-queries under RLS.
 broadcastChannel=client.channel('inventory-feedback-signal')
  .on('broadcast',{event:'feedback-created'},async payload=>{console.info('[Feedback Live] broadcast',payload?.payload?.id||'');await loadInbox(false,true);})
  .subscribe(status=>{console.info('[Feedback Live] broadcast channel',status);if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')reconnect();});
}
async function broadcastFeedbackCreated(id){
 if(!client||!currentUser)return;
 let ch=broadcastChannel;
 let temporary=false;
 if(!ch){
  temporary=true;ch=client.channel('inventory-feedback-signal');
  await new Promise(resolve=>{let done=false;const finish=()=>{if(!done){done=true;resolve();}};ch.subscribe(status=>{if(status==='SUBSCRIBED'||status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')finish();});setTimeout(finish,1500);});
 }
 try{await ch.send({type:'broadcast',event:'feedback-created',payload:{id:String(id)}});}catch(err){console.warn('[Feedback Live] broadcast send failed',err);}
 if(temporary){setTimeout(()=>{try{client.removeChannel(ch);}catch{}},500);}
}
function syncFallback(){
 if(liveFallbackTimer){clearInterval(liveFallbackTimer);liveFallbackTimer=null;}
 if(currentRole==='admin'&&currentUser)liveFallbackTimer=setInterval(()=>{if(!document.hidden)loadInbox(false,false);},3000);
}
function animateBell(){const bell=$('feedbackBellBtn');if(!bell||currentRole!=='admin')return;bell.classList.remove('feedback-bell-ring');void bell.offsetWidth;bell.classList.add('feedback-bell-ring');setTimeout(()=>bell.classList.remove('feedback-bell-ring'),1800);}
function openFeedback(context='general'){
 if(!currentUser){toast('Sign in before submitting feedback.');return;}
 if(currentRole==='admin'){toast('Admin accounts manage feedback from the notification bell.');return;}
 if(currentRole!=='editor'&&currentRole!=='viewer'){toast('Feedback submission is available to Editor and Viewer accounts only.');return;}
 const dlg=$('feedbackDialog');if(!dlg)return;
 $('feedbackForm').reset();$('feedbackWordCount').textContent='0 / 150';$('feedbackWordCount').classList.remove('over');setError('');
 if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}$('feedbackImagePreview').innerHTML='';$('feedbackImagePreview').classList.add('hidden');
 if(context==='invoice')$('feedbackType').value='Missing parsed details';
 dlg.showModal();
}
function updateBadge(n,animate=false){const b=$('feedbackBadge'),bell=$('feedbackBellBtn');if(!b)return;b.textContent=n>99?'99+':String(n);b.classList.toggle('hidden',!n);if(bell)bell.classList.toggle('feedback-bell-unread',n>0);if(animate&&n>lastUnread)animateBell();lastUnread=n;}
async function uploadAttachment(file,feedbackId){
 if(!file)return null;
 const ext=(file.name.split('.').pop()||'png').toLowerCase().replace(/[^a-z0-9]/g,'');
 const path=`${currentUser.id}/${feedbackId}.${ext}`;
 const {error}=await client.storage.from('feedback-attachments').upload(path,file,{contentType:file.type,upsert:false});
 if(error)throw error;return path;
}
async function submitFeedback(ev){
 ev.preventDefault();setError('');
 const message=$('feedbackMessage').value.trim(),words=wordCount(message),file=$('feedbackImage').files?.[0]||null;
 if(!message){setError('Describe the issue before submitting.');return;}
 if(words>150){setError('Feedback is limited to 150 words.');return;}
 if(file&&file.size>5*1024*1024){setError('Attachment must be 5 MB or smaller.');return;}
 if(file&&!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type)){setError('Attachment must be PNG, JPG, WebP or PDF.');return;}
 const btn=$('submitFeedbackBtn');btn.disabled=true;btn.textContent='Submitting…';
 try{
  const feedbackId=crypto.randomUUID();let attachmentPath=null;
  if(file)attachmentPath=await uploadAttachment(file,feedbackId);
  const payload={id:feedbackId,submitted_by:currentUser.id,submitter_name:String(currentUser.user_metadata?.full_name||currentUser.user_metadata?.name||'').trim()||null,submitter_email:currentUser.email||null,issue_type:$('feedbackType').value,message,status:'new',is_read:false,source_context:$('importDialog')?.open?'invoice_review':'general',attachment_path:attachmentPath};
  const {error}=await client.from('feedback_submissions').insert(payload);if(error){if(attachmentPath){try{await client.storage.from('feedback-attachments').remove([attachmentPath]);}catch{}}throw error;}
  await broadcastFeedbackCreated(feedbackId);
  $('feedbackDialog').close();toast('Feedback submitted to Admin.');
 }catch(err){console.error(err);setError(err?.message||'Unable to submit feedback.');}
 finally{btn.disabled=false;btn.innerHTML='<i data-lucide="send"></i> Submit feedback';window.lucide?.createIcons?.();}
}
async function loadInbox(open=false,animate=false){
 if(currentRole!=='admin')return;
 const filter=$('feedbackStatusFilter')?.value||'';let q=client.from('feedback_submissions').select('id,submitted_by,submitter_name,submitter_email,issue_type,message,status,is_read,attachment_path,source_context,created_at,updated_at').order('created_at',{ascending:false}).limit(100);if(filter)q=q.eq('status',filter);
 const {data,error}=await q;if(error){console.error('Feedback inbox',error);return;}items=data||[];
 const {data:noticeData,error:noticeError}=await client.from('admin_notifications').select('id,type,title,message,user_email,is_read,created_at').order('created_at',{ascending:false}).limit(100);
 if(noticeError){console.warn('Admin notifications',noticeError);adminNotices=[];}else adminNotices=noticeData||[];
 updateBadge(items.filter(x=>!x.is_read).length+adminNotices.filter(x=>!x.is_read).length,animate);renderInbox();if(open)$('feedbackInboxDialog')?.showModal();
}
function renderInbox(){
 const host=$('feedbackInboxList');if(!host)return;const unread=items.filter(x=>!x.is_read).length+adminNotices.filter(x=>!x.is_read).length;$('feedbackUnreadSummary').textContent=`${unread} unread`;
 const notices=adminNotices.map(x=>`<article class="feedback-inbox-item admin-account-notice" data-admin-notice-id="${esc(x.id)}"><span class="feedback-unread-dot ${x.is_read?'read':''}"></span><div class="feedback-inbox-main"><strong>${esc(x.title||'New account created')}</strong><p>${esc(x.message||x.user_email||'A new account was created.')}</p><span class="feedback-status reviewing">account</span></div><div class="feedback-inbox-meta">${esc(x.user_email||'New user')}<br>${esc(fmtDate(x.created_at))}</div></article>`).join('');
 const feedback=items.map(x=>`<article class="feedback-inbox-item" data-feedback-id="${esc(x.id)}"><span class="feedback-unread-dot ${x.is_read?'read':''}"></span><div class="feedback-inbox-main"><strong>${esc(x.issue_type||'Feedback')}</strong><p>${esc(x.message)}</p><span class="feedback-status ${esc(x.status)}">${esc(x.status)}</span></div><div class="feedback-inbox-meta">${esc(x.submitter_name||x.submitter_email||'Team member')}<br>${esc(fmtDate(x.created_at))}</div></article>`).join('');
 host.innerHTML=notices+feedback||'<div class="feedback-empty">No Admin notifications yet.</div>';
 host.querySelectorAll('[data-feedback-id]').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.feedbackId)));
 host.querySelectorAll('[data-admin-notice-id]').forEach(el=>el.addEventListener('click',()=>markAdminNoticeRead(el.dataset.adminNoticeId)));
}

async function markAdminNoticeRead(id){
 if(currentRole!=='admin')return;
 const notice=adminNotices.find(x=>String(x.id)===String(id));if(!notice)return;
 if(!notice.is_read){const {error}=await client.from('admin_notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('id',notice.id);if(error){toast(error.message);return;}notice.is_read=true;}
 updateBadge(items.filter(x=>!x.is_read).length+adminNotices.filter(x=>!x.is_read).length,false);renderInbox();toast(notice.title||'Notification read.');
}

async function openDetail(id){
 if(currentRole!=='admin')return;active=items.find(x=>String(x.id)===String(id));if(!active)return;
 if(!active.is_read){const {error}=await client.from('feedback_submissions').update({is_read:true,read_at:new Date().toISOString()}).eq('id',active.id);if(!error){active.is_read=true;updateBadge(items.filter(x=>!x.is_read).length);renderInbox();}}
 $('feedbackDetailTitle').textContent=active.issue_type||'Feedback';$('feedbackDetailMeta').textContent=`${active.submitter_name||active.submitter_email||'Team member'} · ${fmtDate(active.created_at)}`;$('feedbackDetailStatus').value=active.status||'new';syncDeleteButton();
 let attachment='';if(active.attachment_path){const {data}=await client.storage.from('feedback-attachments').createSignedUrl(active.attachment_path,300);if(data?.signedUrl){const isPdf=/\.pdf$/i.test(active.attachment_path);attachment=isPdf?`<a class="feedback-detail-pdf" href="${esc(data.signedUrl)}" target="_blank" rel="noopener"><span>PDF attachment</span><small>Open securely in a new tab</small></a>`:`<img class="feedback-detail-image" src="${esc(data.signedUrl)}" alt="Feedback attachment">`;}}
 $('feedbackDetailBody').innerHTML=`<div class="feedback-detail-message">${esc(active.message)}</div>${attachment}`;$('feedbackDetailDialog').showModal();window.lucide?.createIcons?.();
}
async function saveStatus(){if(currentRole!=='admin'||!active)return;const status=$('feedbackDetailStatus').value;const {error}=await client.from('feedback_submissions').update({status}).eq('id',active.id);if(error){toast(error.message);return;}active.status=status;syncDeleteButton();await loadInbox(false,false);active=items.find(x=>String(x.id)===String(active?.id))||active;active.status=status;$('feedbackDetailStatus').value=status;syncDeleteButton();window.lucide?.createIcons?.();toast(status==='resolved'?'Feedback resolved. Delete resolved is now available.':'Feedback status updated.');}
function syncDeleteButton(){const btn=$('deleteFeedbackBtn');if(btn)btn.classList.toggle('hidden',!(currentRole==='admin'&&active?.status==='resolved'));}
async function deleteResolvedFeedback(){
 if(currentRole!=='admin'||!active||active.status!=='resolved')return;
 if(!window.confirm('Permanently delete this resolved feedback? This cannot be undone.'))return;
 const btn=$('deleteFeedbackBtn');if(btn)btn.disabled=true;
 try{
  if(active.attachment_path){const {error:storageError}=await client.storage.from('feedback-attachments').remove([active.attachment_path]);if(storageError)throw storageError;}
  const {error}=await client.from('feedback_submissions').delete().eq('id',active.id).eq('status','resolved');if(error)throw error;
  $('feedbackDetailDialog').close();active=null;await loadInbox(false,false);toast('Resolved feedback deleted.');
 }catch(err){console.error(err);toast(err?.message||'Unable to delete feedback.');}
 finally{if(btn)btn.disabled=false;}
}
function install(){
 $('feedbackOpenBtn')?.addEventListener('click',()=>openFeedback('general'));$('reportImportIssueBtn')?.addEventListener('click',()=>openFeedback('invoice'));$('closeFeedbackBtn')?.addEventListener('click',()=>$('feedbackDialog').close());$('cancelFeedbackBtn')?.addEventListener('click',()=>$('feedbackDialog').close());$('feedbackForm')?.addEventListener('submit',submitFeedback);
 $('feedbackMessage')?.addEventListener('input',e=>{const n=wordCount(e.target.value),el=$('feedbackWordCount');el.textContent=`${n} / 150`;el.classList.toggle('over',n>150);$('submitFeedbackBtn').disabled=n>150;});
 $('feedbackImage')?.addEventListener('change',e=>{const f=e.target.files?.[0],host=$('feedbackImagePreview');if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}if(!f){host.innerHTML='';host.classList.add('hidden');return;}if(f.type==='application/pdf'){host.innerHTML=`<div class="feedback-file-preview"><strong>PDF</strong><span>${esc(f.name)}</span></div>`;host.classList.remove('hidden');return;}previewUrl=URL.createObjectURL(f);host.innerHTML=`<img src="${previewUrl}" alt="Attachment preview"><small>${esc(f.name)}</small>`;host.classList.remove('hidden');});
 $('feedbackBellBtn')?.addEventListener('click',()=>loadInbox(true));$('closeFeedbackInboxBtn')?.addEventListener('click',()=>$('feedbackInboxDialog').close());$('feedbackStatusFilter')?.addEventListener('change',()=>loadInbox(false));$('closeFeedbackDetailBtn')?.addEventListener('click',()=>$('feedbackDetailDialog').close());$('saveFeedbackStatusBtn')?.addEventListener('click',saveStatus);$('deleteFeedbackBtn')?.addEventListener('click',deleteResolvedFeedback);
 window.lucide?.createIcons?.();
 ensureClient().then(c=>{if(!c)return;refreshIdentity();const {data}=c.auth.onAuthStateChange((_event,session)=>{queueMicrotask(()=>applyIdentity(session?.user||null));});authSubscription=data?.subscription||null;});
 // Visibility refresh is only a safety reconciliation; auth visibility no longer depends on a page reload.
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshIdentity();if(currentRole==='admin')loadInbox(false,false);}});
 window.addEventListener('focus',()=>{if(currentRole==='admin')loadInbox(false,false);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
