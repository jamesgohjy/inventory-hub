// Inventory Hub grouped company UI module — compact accordion view
(function(global){
  'use strict';

  function renderGroupedCompanyCards({host,groups,head,escapeHtml,itemLabel='item'}={}){
    if(!host||!groups||typeof groups.entries!=='function'||typeof escapeHtml!=='function')return false;
    const noun=String(itemLabel||'item').trim()||'item';
    const entries=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));

    host.innerHTML='<div class="v669-doc-groups ui-group-list">'+entries.map(([company,list])=>{
      const count=list.length;
      const countText=count+' '+noun+(count===1?'':'s');
      return `<section class="v669-doc-group inventory-company-group ui-group">
        <button type="button" class="v669-doc-group-toggle ui-group__toggle" aria-expanded="false">
          <strong class="ui-group__name">${escapeHtml(company)}</strong>
          <span class="ui-group__count">${escapeHtml(countText)} <span class="ui-group__chevron" aria-hidden="true">▸</span></span>
        </button>
        <div class="v669-doc-group-body ui-group__body hidden"><div class="ui-group__table-scroll"><table>${head}<tbody>${list.map(x=>x.html).join('')}</tbody></table></div></div>
      </section>`;
    }).join('')+'</div>';

    host.querySelectorAll('.inventory-company-group').forEach(section=>{
      const toggle=section.querySelector('.v669-doc-group-toggle');
      const body=section.querySelector('.v669-doc-group-body');
      const chevron=section.querySelector('.ui-group__chevron');
      if(!toggle||!body)return;
      const setExpanded=expanded=>{
        body.classList.toggle('hidden',!expanded);
        toggle.setAttribute('aria-expanded',String(expanded));
        if(chevron)chevron.textContent=expanded?'▾':'▸';
      };
      setExpanded(false);
      toggle.addEventListener('click',()=>setExpanded(toggle.getAttribute('aria-expanded')!=='true'));
    });
    return true;
  }

  global.InventoryHubGroupedCompanyUI=Object.freeze({
    version:'7.03.3.14v-grouping',
    renderGroupedCompanyCards
  });
})(window);
