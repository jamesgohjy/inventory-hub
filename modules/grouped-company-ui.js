// Inventory Hub grouped company UI module — v7.03.3.14s
(function(global){
  'use strict';
  function renderGroupedCompanyCards({host,groups,head,escapeHtml}={}){
    if(!host||!groups||typeof groups.entries!=='function'||typeof escapeHtml!=='function')return false;
    host.innerHTML='<div class="v669-doc-groups">'+[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'})).map(([company,list])=>`<section class="v669-doc-group inventory-company-group"><button type="button" class="v669-doc-group-toggle" aria-expanded="false"><strong>${escapeHtml(company)}</strong><span>${list.length} item${list.length===1?'':'s'} ▸</span></button><div class="v669-doc-group-body hidden"><table>${head}<tbody>${list.map(x=>x.html).join('')}</tbody></table></div></section>`).join('')+'</div>';
    host.querySelectorAll('.inventory-company-group').forEach(section=>{const toggle=section.querySelector('.v669-doc-group-toggle'),body=section.querySelector('.v669-doc-group-body'),span=toggle?.querySelector('span');if(!toggle||!body)return;toggle.addEventListener('click',()=>{const hidden=body.classList.toggle('hidden');toggle.setAttribute('aria-expanded',String(!hidden));if(span)span.textContent=span.textContent.replace(/[▾▸]\s*$/,'').trim()+(hidden?' ▸':' ▾');});});
    return true;
  }
  global.InventoryHubGroupedCompanyUI=Object.freeze({version:'7.03.3.14s',renderGroupedCompanyCards});
})(window);
