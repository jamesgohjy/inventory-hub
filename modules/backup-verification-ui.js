// Inventory Hub backup verification UI — v7.03.3.14t
(function(global){
  'use strict';
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v)=>{if(!v)return '—';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-SG',{dateStyle:'medium',timeStyle:'short'}):String(v);};
  const status=(v)=>String(v||'UNKNOWN').toUpperCase();
  const badge=(v)=>'<span class="badge">'+esc(status(v))+'</span>';

  function ensure(){
    let card=document.getElementById('backupVerificationCard');
    if(!card){
      const grid=document.querySelector('#automationCentre .automation-grid');
      if(grid){
        card=document.createElement('button');
        card.id='backupVerificationCard';
        card.type='button';
        card.className='automation-card backup-verification hidden';
        card.innerHTML='<span class="automation-icon"><i data-lucide="database-backup"></i></span><span><small>Backup Verification · Admin</small><strong id="backupVerificationStatus">Setup required</strong><em id="backupVerificationSummary">No verification history yet</em></span>';
        grid.appendChild(card);
      }
    }

    let dialog=document.getElementById('backupVerificationDialog');
    if(!dialog){
      dialog=document.createElement('dialog');
      dialog.id='backupVerificationDialog';
      dialog.className='dialog';
      dialog.innerHTML='<div class="dialog-head"><div><h2>Backup Verification</h2><p>Managed database backup, database integrity and document Storage checks.</p></div><button id="backupVerificationCloseX" class="icon-btn" type="button" aria-label="Close"><i data-lucide="x"></i></button></div><div id="backupVerificationDialogBody"></div><div class="dialog-actions"><button id="backupVerificationRefreshBtn" class="secondary" type="button"><i data-lucide="refresh-cw"></i> Refresh</button><button id="backupVerificationCloseBtn" class="primary" type="button">Close</button></div>';
      document.body.appendChild(dialog);
    }
    global.lucide?.createIcons();
    return {card,dialog};
  }

  function renderCard({role='viewer',latest=null,setupRequired=false,error=''}={}){
    const {card}=ensure();
    if(!card)return;
    const admin=String(role).toLowerCase()==='admin';
    card.classList.toggle('hidden',!admin);
    if(!admin)return;
    const statusEl=document.getElementById('backupVerificationStatus');
    const summaryEl=document.getElementById('backupVerificationSummary');
    if(setupRequired){
      statusEl.textContent='Setup required';
      summaryEl.textContent='Install 14t SQL + configure secure verifier secrets';
      return;
    }
    if(error&&!latest){
      statusEl.textContent='Unavailable';
      summaryEl.textContent='Backup verification status could not be loaded';
      return;
    }
    if(!latest){
      statusEl.textContent='Not verified';
      summaryEl.textContent='No automated verification run recorded yet';
      return;
    }
    statusEl.textContent=status(latest.overall_status);
    const age=latest.latest_backup_age_hours==null?'backup age unknown':Number(latest.latest_backup_age_hours).toFixed(1)+'h backup age';
    summaryEl.textContent=age+' · '+fmt(latest.verified_at);
  }

  function renderDialog({latest=null,runs=[],setupRequired=false,error='',schedule='',storageNote=''}={}){
    ensure();
    const body=document.getElementById('backupVerificationDialogBody');
    if(!body)return;
    if(setupRequired){
      body.innerHTML='<div class="empty-state"><strong>Backup verification setup is incomplete.</strong><span>Run <code>supabase-v7-03-3-14t-backup-verification.sql</code>, then configure the two GitHub Actions secrets described in <code>BACKUP_VERIFICATION_SETUP-v7.03.3.14t.md</code>.</span></div>';
      return;
    }
    if(error&&!latest){
      body.innerHTML='<div class="empty-state"><strong>Status unavailable.</strong><span>'+esc(error)+'</span></div>';
      return;
    }
    if(!latest){
      body.innerHTML='<div class="empty-state"><strong>No verification run has been recorded yet.</strong><span>'+esc(schedule||'Run the configured backup verification workflow once.')+'</span></div>';
      return;
    }
    const ds=latest.document_summary||{},content=ds.content_verification||{},integrity=latest.integrity_summary||{};
    const criticalIntegrity=[
      'purchase_items_without_purchase','purchase_items_without_master_item','serials_without_purchase_item',
      'serials_without_master_item','adjustments_without_master_item','maintenance_without_master_item','duplicate_serial_groups'
    ].reduce((n,k)=>n+Number(integrity[k]||0),0);
    const history=(Array.isArray(runs)?runs:[]).map(r=>'<tr><td>'+fmt(r.verified_at)+'</td><td>'+badge(r.overall_status)+'</td><td>'+esc(status(r.managed_backup_status))+'</td><td>'+esc(status(r.database_status))+'</td><td>'+esc(status(r.document_status))+'</td></tr>').join('');
    body.innerHTML=
      '<div class="form-grid">'+
        '<label>Overall<div class="readonly-field">'+badge(latest.overall_status)+'</div></label>'+
        '<label>Latest managed backup<div class="readonly-field">'+esc(latest.latest_backup_at?fmt(latest.latest_backup_at):'Not found')+'</div></label>'+
        '<label>Managed backup<div class="readonly-field">'+badge(latest.managed_backup_status)+'</div></label>'+
        '<label>Database integrity<div class="readonly-field">'+badge(latest.database_status)+' · '+criticalIntegrity+' integrity issue'+(criticalIntegrity===1?'':'s')+'</div></label>'+
        '<label>Documents<div class="readonly-field">'+badge(latest.document_status)+' · '+Number(content.checked||ds.document_rows||0)+' checked</div></label>'+
        '<label>SHA-256<div class="readonly-field">'+Number(content.hash_matches||0)+' verified · '+Number(content.hash_mismatches||0)+' mismatch · '+Number(content.unhashed||ds.documents_without_sha256||0)+' unhashed</div></label>'+
      '</div>'+
      '<p class="muted">'+esc(schedule||'')+'</p>'+
      '<p class="muted">'+esc(storageNote||'')+'</p>'+
      '<div class="table-wrap"><table><thead><tr><th>Verified</th><th>Overall</th><th>Managed backup</th><th>Database</th><th>Documents</th></tr></thead><tbody>'+history+'</tbody></table></div>';
  }

  function open(){const {dialog}=ensure();dialog?.showModal();}
  function close(){document.getElementById('backupVerificationDialog')?.close();}

  global.InventoryHubBackupVerificationUI=Object.freeze({
    version:'7.03.3.14t',
    ensure,renderCard,renderDialog,open,close
  });
})(window);
