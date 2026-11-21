/* Finance Tracker 2.3 - self-contained Home Assistant panel */
(() => {
  const tag = 'finance-tracker-panel-2-3-1-s22';
  if (customElements.get(tag)) return;
  class FinancePanel extends HTMLElement {
    constructor() { super(); this.attachShadow({mode:'open'});this.shadowRoot.addEventListener('click',event=>{
  const button=event.composedPath().find(x=>x instanceof HTMLElement&&x.matches?.('button'));
  if(!button)return;
  if(button.matches('[data-edit],[data-proposal-edit],[data-proposal-afterwork],[data-edit-account]')){
    this.editId=null;this.proposalEdit=null;this.planLinkId=null;this.detail=null;this.editAccountId=null;this.quickExpanded=false;this.quickModal=false;
  }
  if(button.matches('#month-open')){
    this.editId=null;this.proposalEdit=null;this.planLinkId=null;this.detail=null;
    this.shadowRoot.querySelectorAll('.booking-editor-row,#proposal-form').forEach(x=>x.hidden=true);
  }
  if(button.matches('[data-edit],[data-plan-edit],[data-edit-account],[data-proposal-edit],[data-proposal-afterwork],[data-match-position],[data-match-transaction],#new,#add-plan-position,#plan-create,#month-open,#month-grid-open,[data-account-open],[data-plan-open],[data-tpl-account],#choose-category')){
   this.dispatchEvent(new CustomEvent('ft-dialog-request',{bubbles:true,composed:true,detail:{owner:this}}));
  }
 },true); this.month = new Date().toLocaleDateString('sv-SE').slice(0,7); this.tab='overview'; this.context='ledger'; this.focusAccountId=''; this.data=null; this.editId=null; this.detail=null; this.summary=null; this.audit=null; this.budgets=null; this.yearData=null; this.proposals=null; this.accountMeta={}; this.accountOwners=[]; this.editAccountId=null; this.editOwnerName=null; this.newOwnerExpanded=false; this.accountEditMode=false; this.accountGroupEditing={}; this.accountGroupOpen={}; this.expandedBookingGroups=new Set(); this.proposalStatusOpen=new Set(); this.changeGroupsOpen=new Set(); this.newSubGroupId=null; this.quickExpanded=false; this.quickModal=false; this.newGroupExpanded=false; this.newSubExpanded=false; this.newAccountExpanded=false; this.availablePlanMonths=[]; this.monthListReady=false; this.monthValidation=null; this.monthValidationLoading=false; this.monthValidationError=''; this.monthValidationRequest=0; }

    collapseLedgerGroups(render=false){
      this.expandedBookingGroups?.clear();
      this.proposalStatusOpen?.clear();
      this.changeGroupsOpen?.clear();
      if(render&&this.data)this.render();
    }
   
    abortTransient(){
      this.editId=null;this.detail=null;this.proposalEdit=null;this.proposalAfterwork=null;this.planLinkId=null;this.editAccountId=null;this.editOwnerName=null;
      this.quickExpanded=false;this.quickModal=false;this.newAccountExpanded=false;this.newOwnerExpanded=false;this.newGroupExpanded=false;this.newSubExpanded=false;
      this.shadowRoot.querySelectorAll('.account-modal,.ft-month-overlay,.account-picker-modal').forEach(x=>{x.hidden=true;});
      if(this.data)this.render();
    }
    async openTransactionFromSearch(transactionId){
      const tx=(this.data?.transactions||[]).find(t=>String(t.id)===String(transactionId));
      if(!tx)throw new Error('Die ausgewählte Buchung ist im geladenen Monat nicht mehr vorhanden.');
      this.dispatchEvent(new CustomEvent('ft-dialog-request',{bubbles:true,composed:true,detail:{owner:this}}));
      this.context='ledger';this.tab='by_account';this.focusAccountId='';
      this.proposalEdit=null;this.planLinkId=null;this.editAccountId=null;this.quickExpanded=false;this.quickModal=false;
      this.expandedBookingGroups??=new Set();
      const accounts=(this.data?.accounts||[]).filter(x=>x.active);
      const accountId=tx.from_id||tx.account_id;
      const account=accounts.find(a=>String(a.id)===String(accountId));
      const group=(account?this.owner(account):'Unbekannt')+' / '+(account?this.accountLabel(account):(tx.account_name||accountId||'Ohne Konto'));
      this.expandedBookingGroups.add(group);
      const locked=new Set(this.data?.locked_accounts??[]);
      const editable=!locked.has(tx.account_id)&&(tx.kind!=='transfer'||!locked.has(tx.to_id));
      this.detail=null;
      if(editable){
        this.editId=tx.id;
        this.render();
        requestAnimationFrame(()=>{
          const editor=this.shadowRoot.querySelector('[data-op="edit_transaction"],[data-op="edit_transfer"]');
          const row=editor?.closest('tr')?.previousElementSibling;
          const target=row||editor;
          if(target){target.style.scrollMarginTop='145px';target.scrollIntoView({behavior:'smooth',block:'start'});}
        });
        return {mode:'edit',transaction_id:tx.id,tab:this.tab,group};
      }
      this.editId=null;
      this.detail=null;
      this.message='Die ausgewählte Buchung ist durch den Monatsabschluss gesperrt und kann nicht bearbeitet werden.';
      this.render();
      requestAnimationFrame(()=>{
        const target=this.shadowRoot.querySelector(`[data-transaction-id="${CSS.escape(String(tx.id))}"]`);
        if(target){target.style.scrollMarginTop='145px';target.scrollIntoView({behavior:'smooth',block:'start'});}
      });
      return {mode:'locked',transaction_id:tx.id,tab:this.tab,group};
    }
 set hass(value) { this._hass=value; if(value && !this.loaded){this.loaded=true;this.refresh();} }
    async api(op,data={}) { return this._hass.callWS({type:'finance_tracker/v2',op,data}); }
    async refresh() {
      if(!this._hass)return;
      // A view refresh always starts from a compact, closed grouping state.
      this.expandedBookingGroups=new Set();
      this.proposalStatusOpen=new Set();
      this.changeGroupsOpen=new Set();
      const seq=this._ledgerRefreshSeq=(this._ledgerRefreshSeq||0)+1,month=this.month;
      this.data=null;this.planActual=null;this.planActualError=null;this.audit=null;this.render();
      try {
        // Months are sourced from persisted plans/values, never from a synthetic date range.
        // The ledger remains usable when planning is temporarily unavailable.
        try {
          const plan=await this._hass.callWS({type:'finance_tracker/planning_v3'});
          this.availablePlanMonths=(plan.released_plan_months||[]).filter(m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m)).sort((a,b)=>b.localeCompare(a));
          // Keep the explicitly selected month, including months without a released plan.
          this.monthListReady=true;
        }catch(planError){console.warn('Finance Tracker: month list unavailable',planError);}
        // The ledger must remain usable even if an optional dashboard endpoint fails.
        const overview=await this.api('overview',{month});
        if(seq!==this._ledgerRefreshSeq||month!==this.month)return;
        this.data=overview;
        try{const actual=await this._hass.callWS({type:'finance_tracker/plan_actual',op:'list',data:{month}});if(seq!==this._ledgerRefreshSeq||month!==this.month)return;this.planActual=actual;this.planActualError=null;}catch(e){this.planActual=null;this.planActualError=e?.message||String(e);console.error('Finance Tracker: Plan-Ist-Abruf fehlgeschlagen',e);}
        this.message='';
        this.render();
      } catch(e) {
        this.message='Kontenübersicht konnte nicht geladen werden: '+(e.message||String(e));
        this.render();
        return;
      }
      const optional=[
        ['categoryAdmin',()=>this._hass.callWS({type:'finance_tracker/category_admin',op:'list',data:{}})],
        ['accountMeta',()=>this._hass.callWS({type:'finance_tracker/account_meta',op:'list',data:{}})],
        ['summary',()=>this.api('month_summary',{month:this.month})],
        ['budgets',()=>this.api('budget_summary',{month:this.month})],
        ['yearData',()=>this.api('year_summary',{year:this.month.slice(0,4)})],
        ['proposals',()=>this._hass.callWS({type:'finance_tracker/proposals',op:'list',data:{month:this.month}})],
        ['audit',()=>this.api('audit_log',{month:this.month,limit:500,scope:'booking_changes'})]
      ];
      const results=await Promise.allSettled(optional.map(([,fn])=>fn()));
      if(seq!==this._ledgerRefreshSeq||month!==this.month)return;
      const warnings=[];
      results.forEach((result,i)=>{
        const key=optional[i][0];
        if(result.status==='fulfilled') {
          if(key==='categoryAdmin')this.categoryAdmin=result.value;
          else if(key==='accountMeta'){this.accountMeta=Object.fromEntries((result.value?.accounts||[]).map(a=>[a.account_id,a]));this.accountOwners=result.value?.owners||[];}
          else this[key]=result.value;
        } else warnings.push(key+': '+(result.reason?.message||String(result.reason)));
      });
      if(this.tab==='closing')this.loadMonthValidation();
      if(warnings.length)this.message='Einige Zusatzdaten sind nicht verfügbar: '+warnings.join('; ');
      this.render();
    }
    async loadMonthValidation(){
      if(!this._hass)return;
      const month=this.month, request=++this.monthValidationRequest;
      this.monthValidation=null;this.monthValidationError='';this.monthValidationLoading=true;this.render();
      try{
        const result=await this._hass.callWS({type:'finance_tracker/month_validation',month});
        if(request!==this.monthValidationRequest||month!==this.month)return;
        this.monthValidation=result;
      }catch(error){
        if(request!==this.monthValidationRequest||month!==this.month)return;
        this.monthValidationError=error?.message||String(error);
      }finally{
        if(request===this.monthValidationRequest&&month===this.month){this.monthValidationLoading=false;this.render();}
      }
    }
    renderMonthValidation(){
      const report=this.monthValidation;
      const esc=x=>this.esc(x),money=x=>this.money(x);
      if(this.monthValidationLoading)return '<section class="panel"><h2>Monatsabschluss · Prüfung</h2><p class="muted">Monatsprüfung wird ausgeführt …</p></section>';
      if(this.monthValidationError)return `<section class="panel"><h2>Monatsabschluss · Prüfung</h2><div class="notice" role="alert">Prüfung fehlgeschlagen: ${esc(this.monthValidationError)}</div><button type="button" data-validation-retry>Erneut prüfen</button></section>`;
      if(!report)return '<section class="panel"><h2>Monatsabschluss · Prüfung</h2><p class="muted">Prüfung noch nicht gestartet.</p><button type="button" data-validation-retry>Monat prüfen</button></section>';
      const counts=report.counts||{};
      const accounts=(report.accounts||[]).map(a=>{
        const status=a.status==='error'?'Fehler':a.status==='not_checkable'?'Nicht prüfbar':a.status==='warning'?'Toleriert':'Bestanden';
        const tone=a.status==='error'?'#fca5a5':a.status==='not_checkable'||a.status==='warning'?'#facc15':'#86efac';
        return `<tr><td>${esc(a.name||a.account_id)}</td><td class="num">${money(a.calculated_cents)}</td><td class="num">${a.confirmed_cents==null?'–':money(a.confirmed_cents)}</td><td class="num">${a.difference_cents==null?'–':money(a.difference_cents)}</td><td class="num">${money(a.tolerance_cents||0)}</td><td style="color:${tone}">${status}</td></tr>`;
      }).join('');
      const findings=(report.findings||[]).map(f=>{
        const tone=f.severity==='error'?'#fca5a5':f.severity==='not_checkable'?'#facc15':'#facc15';
        const level=f.severity==='error'?'Fehler':f.severity==='not_checkable'?'Nicht prüfbar':'Hinweis';
        const reference=f.account_id?'Konto: '+f.account_id:f.transaction_id?'Buchung: '+f.transaction_id:f.transfer_id?'Umbuchung: '+f.transfer_id:f.link_id?'Zuordnung: '+f.link_id:'';
        return `<div style="padding:10px 0;border-bottom:1px solid var(--divider-color,#394657)"><div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><strong>${esc(f.code)} · ${esc(f.message)}</strong><span style="color:${tone};font-weight:700">${level}</span></div>${reference?`<small class="muted">${esc(reference)}</small>`:''}${f.amount_cents!=null?`<div>${money(f.amount_cents)}</div>`:''}</div>`;
      }).join('')||'<p class="muted">Keine Auffälligkeiten festgestellt.</p>';
      return `<section class="panel"><div class="top"><div><div class="eyebrow">Finance Tracker 4.1.1 · Monatsprüfung</div><h2>Monatsprüfung · ${esc(report.month)}</h2></div><button type="button" data-validation-retry>↻ Erneut prüfen</button></div><div class="notice" style="border-left:4px solid ${report.ready?'#86efac':'#fca5a5'}"><strong>${report.ready?'Abschlussprüfung freigabefähig':'Abschlussprüfung nicht freigabefähig'}</strong><p class="muted" style="margin:5px 0 0">${Number(counts.error||0)} Fehler · ${Number(counts.warning||0)} Hinweise · ${Number(counts.not_checkable||0)} nicht prüfbar · ${Number(report.checked_transactions||0)} geprüfte Buchungen</p></div><p class="muted">Die Prüfung ist schreibgeschützt. Ein Monatsabschluss wird hier noch nicht ausgelöst.</p></section><section class="panel"><h2>Kontenabstimmung</h2><div class="scroll"><table><thead><tr><th>Konto</th><th class="num">Berechnet</th><th class="num">Bestätigt</th><th class="num">Differenz</th><th class="num">Toleranz</th><th>Status</th></tr></thead><tbody>${accounts||'<tr><td colspan="6">Keine Konten vorhanden.</td></tr>'}</tbody></table></div></section><section class="panel"><h2>Prüfbefunde (${(report.findings||[]).length})</h2>${findings}</section>`;
    }
    money(cents){return (Number(cents)/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});}
    expressionCents(value){
      const source=String(value??'').trim().replace(/\s/g,'').replace(/,/g,'.').replace(/:/g,'/');
      if(!source||source.length>160||!/^[0-9.+\-*/()]+$/.test(source))throw Error('Ungültige Berechnung');
      const tokens=source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/]/g)||[];
      if(tokens.join('')!==source)throw Error('Ungültige Berechnung');
      let index=0;
      const primary=()=>{const t=tokens[index++];if(t==='+'||t==='-'){const v=primary();return t==='-'?-v:v;}if(t==='('){const v=add();if(tokens[index++]!==')')throw Error('Klammer fehlt');return v;}if(t&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t))return Number(t);throw Error('Ungültige Berechnung');};
      const mul=()=>{let v=primary();while(tokens[index]==='*'||tokens[index]==='/'){const op=tokens[index++],b=primary();if(op==='/'&&b===0)throw Error('Division durch null');v=op==='*'?v*b:v/b;}return v;};
      const add=()=>{let v=mul();while(tokens[index]==='+'||tokens[index]==='-'){const op=tokens[index++],b=mul();v=op==='+'?v+b:v-b;}return v;};
      const result=add();if(index!==tokens.length||!Number.isFinite(result)||Math.abs(result)>1e9)throw Error('Ungültiges Ergebnis');return Math.round(result*100);
    }
    cents(value){const s=String(value).trim().replace(/\s/g,'').replace(',','.');if(!/^-?\d+(\.\d{1,2})?$/.test(s))throw Error('Bitte einen gültigen Euro-Betrag eingeben');return Math.round(Number(s)*100);}
    esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    options(items,selected){return items.map(x=>`<option value="${this.esc(x.id)}" ${selected===x.id?'selected':''}>${this.esc(x.name)}</option>`).join('');}
    preference(key,value){try{if(value===undefined)return localStorage.getItem('ft14_'+key)||'';localStorage.setItem('ft14_'+key,String(value));}catch(e){return '';}}
    owner(a){return this.accountMeta[a.id]?.owner||'Nicht zugeordnet';}
    ownerNames(accounts=[]){const stored=(this.accountOwners||[]).map(o=>o.name).filter(Boolean),used=(accounts||[]).map(a=>this.owner(a)).filter(Boolean);return [...new Set([...stored,...used])].sort((a,b)=>a.localeCompare(b,'de',{sensitivity:'base'}));}
    accountTypes(){return ['Girokonto','Kreditkarte','PayPal','Guthabenkarte','Bargeld','Tagesgeld','Spardose','Depot-Verrechnung','Depot','Bausparen','Sonstiges'];}
    ledgerKind(type){if(type==='Bargeld')return 'cash';if(['Tagesgeld','Spardose','Depot-Verrechnung','Depot','Bausparen'].includes(type))return 'savings';return 'checking';}
    accountType(a){const custom=this.accountMeta[a.id]?.account_type;if(custom)return custom;const n=a.name;if(/depot(?!konto)|privatdepot/i.test(n))return 'Depot';if(/bausparkasse/i.test(n))return 'Bausparen';if(/tagesgeld/i.test(n))return 'Tagesgeld';if(/spardose/i.test(n))return 'Spardose';if(/barvermögen/i.test(n))return 'Bargeld';if(/visa/i.test(n))return 'Kreditkarte';if(/paypal/i.test(n))return 'PayPal';if(/guthabenkarte/i.test(n))return 'Guthabenkarte';if(/depotkonto/i.test(n))return 'Depot-Verrechnung';return 'Girokonto';}
    accountLabel(a){const custom=this.accountMeta[a.id]?.display_name;if(custom)return custom;let n=a.name.replace(/^Kontostand\s+/i,'').replace(/^Girokonto\s+/i,'').replace(/^Giro\s+/i,'').trim();n=n.replace(/^Barvermögen/i,'Bargeld').replace(/\s+Girokonto$/i,' Giro').replace(/\s+Tagesgeld$/i,' Tagesgeld');if(!n)return a.name;return n;}
    bank(a){return this.accountMeta[a.id]?.bank||"Ohne Bankangabe";}
    isFavorite(a){return this.accountMeta[a.id]?.favorite===1 || (this.accountMeta[a.id]?.favorite==null && this.preference('fav_'+a.id)==='1');}
    paymentAccount(a){return !['Depot','Bausparen','Depot-Verrechnung'].includes(this.accountType(a));}
    rankAccounts(accounts){const owners=this.ownerNames(accounts);const ix=a=>{const i=owners.indexOf(this.owner(a));return i<0?owners.length:i;};return [...accounts].sort((a,b)=>ix(a)-ix(b)||this.bank(a).localeCompare(this.bank(b),'de',{sensitivity:'base'})||this.accountLabel(a).localeCompare(this.accountLabel(b),'de',{sensitivity:'base'}));}
    accountOption(a,selected){return `<option value="${this.esc(a.id)}" ${selected===a.id?'selected':''}>${this.isFavorite(a)?'★ ':''}${this.esc(this.bank(a))} · ${this.esc(this.accountLabel(a))}</option>`;}
    accountChoices(accounts,selected){const sorted=this.rankAccounts(accounts);const owners=this.ownerNames(accounts);let html='<option value="">Konto auswählen</option>';for(const owner of owners){const arr=sorted.filter(a=>this.owner(a)===owner);if(arr.length)html+=`<optgroup label="${this.esc(owner)}">${arr.map(a=>this.accountOption(a,selected)).join('')}</optgroup>`;}return html;}
    accountPicker(field,accounts,selected){
      const a=accounts.find(x=>x.id===selected);
      return `<div class="account-picker"><select class="account-native" id="${field}" name="${field==='quick-target'||field==='transfer-edit-to'?'to_id':field==='transfer-edit-from'?'from_id':'account_id'}" ${field==='quick-target'?'disabled':'required'}>${this.accountChoices(accounts,selected)}</select><button type="button" class="account-trigger" data-account-open="${field}" aria-haspopup="dialog"><span><strong data-account-title="${field}">${a?this.esc(this.accountLabel(a)):'Konto auswählen'}</strong><small data-account-subtitle="${field}">${a?this.esc(this.owner(a)+' · '+this.bank(a)):'Tippen zum Auswählen'}</small></span><span class="account-chevron">⌄</span></button></div>`;
    }
    masterPicker(field,name,choices,selected,label){
      const values=(choices||[]).filter(Boolean),current=values.includes(selected)?selected:(values[0]||'');
      return `<div class="account-picker"><select class="account-native" id="${this.esc(field)}" name="${this.esc(name)}" required>${values.length?values.map(v=>`<option value="${this.esc(v)}" ${v===current?'selected':''}>${this.esc(v)}</option>`).join(''):'<option value="">Keine Auswahl vorhanden</option>'}</select><button type="button" class="account-trigger" data-master-picker="${this.esc(field)}" data-master-picker-label="${this.esc(label)}" aria-haspopup="dialog" ${values.length?'':'disabled'}><span><strong id="${this.esc(field)}-title">${this.esc(current||'Nicht verfügbar')}</strong><small>${this.esc(label)} auswählen</small></span><span class="account-chevron">⌄</span></button></div>`;
    }
    openMasterPicker(field,label){
      const select=this.shadowRoot.getElementById(field),modal=this.shadowRoot.getElementById('account-modal');if(!select||!modal||select.disabled)return;
      const choices=[...select.options].map(o=>({value:o.value,label:o.textContent})).filter(x=>x.value);
      modal.innerHTML=`<div class="account-modal-backdrop" data-account-close></div><div class="account-dialog" role="dialog" aria-modal="true" aria-label="${this.esc(label)} auswählen"><div class="account-dialog-head"><strong>${this.esc(label)} auswählen</strong><button type="button" data-account-close aria-label="Schließen">✕</button></div><div class="account-dialog-list">${choices.map(c=>`<button type="button" class="account-picker-row ${select.value===c.value?'selected':''}" data-master-value="${this.esc(c.value)}"><span class="account-picker-info"><strong>${this.esc(c.label)}</strong></span><span class="account-picker-check">${select.value===c.value?'✓':''}</span></button>`).join('')}</div><div class="ft-harmonized-actions" style="padding:12px"><button type="button" data-account-close>Abbrechen</button></div></div>`;
      modal.hidden=false;const close=()=>{modal.hidden=true;modal.innerHTML='';};
      modal.querySelectorAll('[data-account-close]').forEach(b=>b.addEventListener('click',close));
      modal.querySelectorAll('[data-master-value]').forEach(b=>b.addEventListener('click',()=>{select.value=b.dataset.masterValue;select.dispatchEvent(new Event('change',{bubbles:true}));const title=this.shadowRoot.getElementById(field+'-title');if(title)title.textContent=select.selectedOptions[0]?.textContent||b.dataset.masterValue;close();}));
    }
    openAccountPicker(field,accounts){
      const select=this.shadowRoot.getElementById(field);if(!select)return;
      const modal=this.shadowRoot.getElementById('account-modal');if(!modal)return;
      const sorted=this.rankAccounts(accounts), fav=[];
      const owners=this.ownerNames(accounts);
      const groups=owners.map(name=>({name,items:sorted.filter(a=>this.owner(a)===name)})).filter(g=>g.items.length);
      const rows=groups.map(g=>`<section class="account-picker-group" ><h3>${this.esc(g.name)}</h3>${g.items.map(a=>`<button type="button" class="account-picker-row ${select.value===a.id?'selected':''}" data-account-id="${this.esc(a.id)}" ${fav.length&&!this.isFavorite(a)?'data-other-row hidden':''} data-search="${this.esc((g.name+' '+this.owner(a)+' '+this.accountLabel(a)+' '+this.accountType(a)+' '+this.bank(a)+' '+a.name).toLocaleLowerCase('de'))}"><span class="account-picker-info"><strong>${this.esc(this.owner(a)+' · '+this.bank(a)+' · '+this.accountLabel(a))}</strong><small>${this.esc(this.accountType(a))}${this.isFavorite(a)?' · ★ Favorit':''}</small></span><span class="account-picker-check">${select.value===a.id?'✓':' '}</span></button>`).join('')}</section>`).join('');
      modal.innerHTML=`<div class="account-modal-backdrop" data-account-close></div><div class="account-dialog" role="dialog" aria-modal="true" aria-label="Konto auswählen"><div class="account-dialog-head"><strong>Konto auswählen</strong><button type="button" data-account-close aria-label="Schließen">✕</button></div><div class="account-dialog-search"><input type="search" placeholder="Konto oder Inhaber suchen …" aria-label="Konten durchsuchen"/></div><div class="account-dialog-list">${rows}${fav.length?`<button type="button" class="account-more" data-show-other>Weitere Konten anzeigen ▾</button>`:""}</div><div class="ft-harmonized-actions" style="padding:12px"><button type="button" data-account-close>Abbrechen</button></div></div>`;
      modal.hidden=false;modal.querySelectorAll('.account-picker-group').forEach(g=>g.hidden=![...g.querySelectorAll('.account-picker-row')].some(r=>!r.hidden));const search=modal.querySelector('input[type=search]');
      const close=()=>{modal.hidden=true;modal.innerHTML='';};
      modal.querySelector('[data-show-other]')?.addEventListener('click',e=>{const expanded=e.currentTarget.dataset.expanded==='1';e.currentTarget.dataset.expanded=expanded?'0':'1';e.currentTarget.textContent=expanded?'Weitere Konten anzeigen ▾':'Weitere Konten ausblenden ▴';modal.querySelectorAll('[data-other-row]').forEach(r=>r.hidden=expanded);modal.querySelectorAll('.account-picker-group').forEach(g=>g.hidden=![...g.querySelectorAll('.account-picker-row')].some(r=>!r.hidden));});
      modal.querySelectorAll('[data-account-close]').forEach(b=>b.addEventListener('click',close));
      modal.querySelectorAll('[data-account-id]').forEach(b=>b.addEventListener('click',()=>{select.value=b.dataset.accountId;select.dispatchEvent(new Event('change',{bubbles:true}));const a=accounts.find(x=>x.id===select.value);this.shadowRoot.querySelector(`[data-account-title="${field}"]`).textContent=this.accountLabel(a);this.shadowRoot.querySelector(`[data-account-subtitle="${field}"]`).textContent=this.owner(a)+' · '+this.bank(a);close();}));
      search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase('de');modal.querySelectorAll('.account-picker-group').forEach(g=>{let count=0;g.querySelectorAll('.account-picker-row').forEach(r=>{const match=r.dataset.search.includes(q);r.hidden=!match||(!q&&r.hasAttribute('data-other-row')&&modal.querySelector('[data-show-other]')?.dataset.expanded!=='1');if(!r.hidden)count++;});g.hidden=!count;});});
      if(window.matchMedia?.('(pointer:fine)').matches)search.focus({preventScroll:true});
    }
    categoryPicker(categories,selected='',field='quick-category',kind=null){
      const c=categories.find(x=>x.id===selected);
      return `<div class="account-picker"><select class="account-native" id="${field}" name="category_id"><option value="">Kategorie wählen</option>${this.options(categories,selected)}</select><button type="button" class="account-trigger" id="${field}-trigger" data-category-open="${field}"><span><strong id="${field}-title">${c?this.esc(c.name):'Kategorie wählen'}</strong><small>Ausgabenkategorie oder Einnahmekategorie</small></span><span class="account-chevron">⌄</span></button></div>`;
    }
    openCategoryPicker(field='quick-category'){
      const select=this.shadowRoot.getElementById(field),modal=this.shadowRoot.getElementById('account-modal');
      if(!select||select.disabled||!modal)return;
      const pickerKind=field==='proposal-category'?this.shadowRoot.getElementById('proposal-kind')?.value:field==='proposal-afterwork-category'?this.shadowRoot.getElementById('proposal-afterwork-kind')?.value:field==='edit-category'?this.shadowRoot.getElementById('edit-kind')?.value:this.shadowRoot.getElementById('quick-kind')?.value;const cats=(this.data?.categories||[]).filter(c=>c.kind===pickerKind).sort((a,b)=>a.name.localeCompare(b.name,'de'));
      const groups=new Map();for(const c of cats){const group=c.name.includes(' · ')?c.name.split(' · ')[0]:'Weitere Kategorien';if(!groups.has(group))groups.set(group,[]);groups.get(group).push(c);}
      const rows=[...groups].map(([group,items])=>`<section class="account-picker-group"><h3 class="category-group-title">${this.esc(group)}</h3>${items.map(c=>`<button type="button" class="account-picker-row ${select.value===c.id?'selected':''}" data-category-id="${this.esc(c.id)}" data-search="${this.esc(c.name.toLocaleLowerCase('de'))}"><span class="account-picker-info"><strong>${this.esc(c.name.split(' · ').pop())}</strong></span><span class="account-picker-check">${select.value===c.id?'✓':''}</span></button>`).join('')}</section>`).join('');
      modal.innerHTML=`<div class="account-modal-backdrop" data-account-close></div><div class="account-dialog" role="dialog" aria-modal="true" aria-label="Kategorie auswählen"><div class="account-dialog-head"><strong>Kategorie auswählen</strong><button type="button" data-account-close aria-label="Schließen">✕</button></div><div class="account-dialog-search"><input type="search" placeholder="Kategorie suchen …" aria-label="Kategorien durchsuchen"/></div><div class="account-dialog-list"><button type="button" class="account-picker-row" data-category-id=""><strong>Ohne Kategorie</strong></button>${rows}</div></div>`;
      modal.hidden=false;const close=()=>{modal.hidden=true;modal.innerHTML='';};
      modal.querySelectorAll('[data-account-close]').forEach(b=>b.addEventListener('click',close));
      modal.querySelectorAll('[data-category-id]').forEach(b=>b.addEventListener('click',()=>{select.value=b.dataset.categoryId;select.dataset.userChosen='1';select.dispatchEvent(new Event('change',{bubbles:true}));close();}));
      const search=modal.querySelector('input[type=search]');search.addEventListener('input',()=>{const q=search.value.toLocaleLowerCase('de').trim();modal.querySelectorAll('.account-picker-group').forEach(g=>{let count=0;g.querySelectorAll('[data-search]').forEach(r=>{r.hidden=!r.dataset.search.includes(q);if(!r.hidden)count++;});g.hidden=!count;});});if(window.matchMedia?.('(pointer:fine)').matches)search.focus({preventScroll:true});
    }
    ft22NormalizeText(value){return String(value||'').toLocaleLowerCase('de').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
    ft22TextSimilarity(a,b){
      const x=this.ft22NormalizeText(a),y=this.ft22NormalizeText(b);
      if(!x||!y)return 0;
      if(x===y)return 100;
      // Teiltreffer nur bei ausreichend spezifischem Buchungstext.
      if(Math.min(x.length,y.length)>=5&&(x.includes(y)||y.includes(x)))return 55;
      const tx=new Set(x.split(' ').filter(w=>w.length>=4));
      const ty=new Set(y.split(' ').filter(w=>w.length>=4));
      const overlap=[...tx].filter(w=>ty.has(w)).length;
      return overlap&&overlap>=Math.min(tx.size,ty.size)?30:0;
    }
    suggestCategory(kind,description,categories,transactions){
      const s=this.ft22NormalizeText(description);if(!s)return '';
      const relevant=(transactions||[]).filter(t=>t.kind===kind&&t.category_id&&categories.some(c=>c.id===t.category_id&&c.kind===kind));
      const scored=relevant.map(t=>({id:t.category_id,score:this.ft22TextSimilarity(description,t.description)})).filter(x=>x.score>=55);
      if(scored.length){
        const totals=new Map();for(const x of scored)totals.set(x.id,(totals.get(x.id)||0)+x.score);
        const ranked=[...totals].sort((a,b)=>b[1]-a[1]);
        if(ranked.length===1||ranked[0][1]>ranked[1][1])return ranked[0][0];
      }
      const key=this.preference('category_'+kind+'_'+String(description||'').trim().toLocaleLowerCase('de'));
      if(categories.some(c=>c.id===key&&c.kind===kind))return key;
      return '';
    }

    async saveAccountMeta(a,changes){
      const prev=this.accountMeta[a.id]||{};
      const data={account_id:a.id,display_name:changes.display_name??prev.display_name??'',owner:changes.owner??prev.owner??this.owner(a),account_type:changes.account_type??prev.account_type??this.accountType(a),bank:changes.bank??prev.bank??'',favorite:changes.favorite??this.isFavorite(a),tolerance_cents:changes.tolerance_cents??prev.tolerance_cents??0};
      await this._hass.callWS({type:'finance_tracker/account_meta',op:'save',data});
      this.accountMeta[a.id]={...data,favorite:data.favorite?1:0};this.render();
    }
    async submit(event,op,convert){event.preventDefault();const btn=event.target.querySelector('button[type=submit]');btn.disabled=true;try{const data=Object.fromEntries(new FormData(event.target));if(convert)convert(data);await this.api(op,data);this.message='Gespeichert';this.editId=null;this.proposalAfterwork=null;await this.refresh();}catch(e){this.message=e.message||String(e);this.render();}finally{btn.disabled=false;}}

    monthChoices(){const current=this.month||new Date().toLocaleDateString('sv-SE').slice(0,7);const years=[Number(current.slice(0,4))-1,Number(current.slice(0,4)),Number(current.slice(0,4))+1];return [...new Set([...years.flatMap(y=>Array.from({length:12},(_,i)=>`${y}-${String(i+1).padStart(2,'0')}`)),...(this.availablePlanMonths||[])])].sort();}
    label(m){const [y,n]=String(m).split('-');return new Date(+y,+n-1,1).toLocaleDateString('de-DE',{month:'long',year:'numeric'});}
    monthPickerMarkup(){return `<div class="ft-month-picker"><button type="button" id="month-open" class="ft-month-trigger" aria-haspopup="dialog" aria-label="Monat auswählen">${this.esc(this.label(this.month))} <span aria-hidden="true">⌄</span></button></div><div id="ft-month-overlay" class="ft-month-overlay" hidden></div>`;}
   
 openMonthGrid(){
  const select=this.shadowRoot.getElementById('month');if(!select)return;
  let overlay=this.shadowRoot.getElementById('ft-month-overlay');
  if(!overlay){overlay=document.createElement('div');overlay.id='ft-month-overlay';overlay.className='ft-month-overlay';this.shadowRoot.append(overlay);}
  const allowed=new Map([...select.options].filter(o=>/^\d{4}-\d{2}$/.test(o.value)).map(o=>[o.value,o.textContent]));
  let year=Number((this.month||new Date().toISOString().slice(0,7)).slice(0,4));
  const allYears=[...new Set([...allowed.keys()].map(m=>Number(m.slice(0,4))))].sort();
  const draw=()=>{
   overlay.hidden=false;
   overlay.innerHTML=`<div class="ft-month-backdrop" data-ft-close></div><section class="ft-month-dialog" role="dialog" aria-modal="true" aria-label="Monat auswählen"><div class="ft-month-top"><strong>Monat auswählen</strong><button type="button" data-ft-close aria-label="Schließen">✕</button></div><div class="ft-harmonized-actions" style="justify-content:space-between;margin:12px 0"><button type="button" data-ft-year="-1" ${allYears.length&&year<=allYears[0]?'disabled':''}>‹</button><strong>${year}</strong><button type="button" data-ft-year="1" ${allYears.length&&year>=allYears[allYears.length-1]?'disabled':''}>›</button></div><div class="month-grid-standard">${Array.from({length:12},(_,i)=>{const m=year+'-'+String(i+1).padStart(2,'0');const label=new Date(year,i,1).toLocaleDateString('de-DE',{month:'short'});return `<button type="button" data-ft-month="${m}" aria-selected="${m===this.month}" ${allowed.has(m)?'':'disabled'}>${label}</button>`;}).join('')}</div><div class="ft-harmonized-actions" style="margin-top:14px"><button type="button" data-ft-close>Abbrechen</button></div></section>`;
   overlay.querySelectorAll('[data-ft-close]').forEach(b=>b.addEventListener('click',()=>{overlay.hidden=true;}));
   overlay.querySelectorAll('[data-ft-year]').forEach(b=>b.addEventListener('click',()=>{year+=Number(b.dataset.ftYear);draw();}));
   overlay.querySelectorAll('[data-ft-month]').forEach(b=>b.addEventListener('click',()=>{const m=b.dataset.ftMonth;if(!allowed.has(m))return;overlay.hidden=true;select.value=m;select.dispatchEvent(new Event('change',{bubbles:true}));}));
  };draw();
 }
 openMonthPicker(){
      const select=this.shadowRoot.getElementById('month'),overlay=this.shadowRoot.getElementById('ft-month-overlay');
      if(!select||!overlay)return;
      const options=Array.from(select.options).map(o=>({value:o.value,label:o.textContent}));
      overlay.hidden=false;
      overlay.innerHTML=`<div class="ft-month-backdrop" data-month-close></div><section class="ft-month-dialog" role="dialog" aria-modal="true" aria-label="Monat auswählen"><div class="ft-month-top"><strong>Monat auswählen</strong><button type="button" data-month-close aria-label="Schließen">✕</button></div><input id="ft-month-search" type="search" placeholder="Monat oder Jahr suchen …" aria-label="Monat suchen"/><div id="ft-month-list" class="ft-month-list"></div></section>`;
      const list=overlay.querySelector('#ft-month-list'),search=overlay.querySelector('#ft-month-search');
      const draw=()=>{const q=search.value.toLocaleLowerCase('de-DE').trim();list.innerHTML=options.filter(o=>o.label.toLocaleLowerCase('de-DE').includes(q)||o.value.includes(q)).map(o=>`<button type="button" class="ft-month-option ${o.value===this.month?'is-current':''}" data-month-value="${this.esc(o.value)}"><span>${this.esc(o.label)}</span><span>${o.value===this.month?'✓':''}</span></button>`).join('')||'<p class="ft-month-empty">Kein Monat gefunden</p>';list.querySelectorAll('[data-month-value]').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.monthValue;overlay.hidden=true;select.value=v;select.dispatchEvent(new Event('change',{bubbles:true}));}));};
      overlay.querySelectorAll('[data-month-close]').forEach(b=>b.addEventListener('click',()=>overlay.hidden=true));
      overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){overlay.hidden=true;this.shadowRoot.getElementById('month-open')?.focus();}});
      search.addEventListener('input',draw);draw();if(window.matchMedia?.('(pointer:fine)').matches)search.focus({preventScroll:true});
    }

    renderPlanWorkspace(){
      const model=this.planActual;
      if(!model)return `<section class="panel" role="alert"><strong>Plan-Ist-Daten konnten nicht geladen werden.</strong><p>${this.esc(this.planActualError||'Die Anfrage wurde noch nicht erfolgreich abgeschlossen.')}</p><p>Die vorhandenen Buchungen bleiben unverändert.</p></section>`;
      const esc=x=>this.esc(x),money=x=>this.money(x);
      this.planWorkspaceOpen??=new Set();
      const positions=model.positions||[],transactions=model.transactions||[];
      const labels=[['expense','Ausgaben'],['saving_transfer','Umbuchungen / Sparen'],['income','Einnahmen']];
      const card=p=>{
        const opened=this.planWorkspaceOpen.has(p.position_id),pct=p.plan_cents?Math.round(p.actual_cents/p.plan_cents*100):0;
        const links=p.links||[];
        const linked=links.map(l=>`<div class="ft22-line"><span>${esc(l.description)} <small>${esc(l.booked)}</small></span><span>${money(l.amount_cents)}</span></div>`).join('');
        const options=transactions.filter(t=>t.unallocated_cents>0&&('saving_transfer'===p.kind?'transfer':p.kind)===t.kind).map(t=>`<option value="${esc(t.id)}" data-amount="${t.unallocated_cents}">${esc(t.description)} · ${money(t.unallocated_cents)}</option>`).join('');
        return `<article class="ft22-position"><button type="button" class="ft22-position-head" data-ft22-toggle="${esc(p.position_id)}" aria-expanded="${opened}"><span><strong>${esc(p.name)}</strong><small>${links.length} Zuordnung(en) · ${pct}% des Plans</small></span><span class="ft22-position-sums"><strong>${money(p.actual_cents)} / ${money(p.plan_cents)}</strong><small class="${p.remaining_cents<0?'ft22-over':''}">${p.remaining_cents>=0?money(p.remaining_cents)+' offen':money(-p.remaining_cents)+' über Plan'}</small></span><span class="ft22-expand-indicator" aria-hidden="true">${opened?'⌃':'⌄'}</span></button><div class="ft22-track"><span style="width:${Math.min(100,Math.max(0,pct))}%;background:${pct>100?'#d97757':'#2fa885'}"></span></div>${opened?`<div class="ft22-details">${linked||'<p class="muted">Noch keine Buchung zugeordnet.</p>'}${options?`<form class="ft22-assign" data-ft22-assign="${esc(p.position_id)}"><label>Buchung zuordnen<div class="account-picker ft22-picker"><select class="account-native" name="transaction_id" required><option value="">Buchung auswählen</option>${options}</select><button type="button" class="account-trigger" data-ft22-picker="transaction" aria-haspopup="dialog"><span><strong data-ft22-picker-title>Buchung auswählen</strong><small>Offene Buchungen durchsuchen</small></span><span class="account-chevron">⌄</span></button></div></label><button type="submit">Zuordnen</button></form>`:'<small class="muted">Keine passenden offenen Buchungen.</small>'}<button type="button" class="primary" data-ft22-book-plan="${esc(p.position_id)}">⇢ Aus Plan buchen</button><button type="button" data-ft22-create="${esc(p.position_id)}">＋ Buchung hinzufügen</button></div>`:''}</article>`;
      };
      const sections=labels.map(([kind,label])=>{const items=positions.filter(p=>p.kind===kind),plan=items.reduce((a,p)=>a+p.plan_cents,0),actual=items.reduce((a,p)=>a+p.actual_cents,0);return `<section class="ft22-section"><h3>${label} <small>${money(actual)} / ${money(plan)}</small></h3>${items.map(card).join('')||'<p class="muted">Keine Planpositionen vorhanden.</p>'}</section>`;}).join('');
      const unassigned=transactions.filter(t=>t.unallocated_cents>0);
      const orphan=unassigned.map(t=>{const candidates=positions.filter(p=>p.kind===(t.kind==='transfer'?'saving_transfer':t.kind));return `<form class="ft22-unassigned" data-ft22-unassigned="${esc(t.id)}"><div><strong>${esc(t.description)}</strong><small>${esc(t.booked)} · ${money(t.unallocated_cents)} nicht zugeordnet</small></div><div class="account-picker ft22-picker"><select class="account-native" name="position_id" required><option value="">Planposition auswählen</option>${candidates.map(p=>`<option value="${esc(p.position_id)}">${esc(p.name)}</option>`).join('')}</select><button type="button" class="account-trigger" data-ft22-picker="position" aria-haspopup="dialog"><span><strong data-ft22-picker-title>Planposition auswählen</strong><small>Passende Planposition suchen</small></span><span class="account-chevron">⌄</span></button></div><button type="submit" ${!candidates.length?'disabled':''}>Zuordnen</button></form>`;}).join('');
      return `<div class="ft22-workspace"><div class="ft22-workspace-title"><strong>Monatspositionen & Buchungen</strong></div>${sections}<section class="ft22-section"><h3>Ohne Planposition <small>${unassigned.length} Buchung(en)</small></h3>${orphan||'<p class="muted">Alle Buchungen sind vollständig zugeordnet.</p>'}</section></div>`;
    }
    render(){
      const d=this.data;const accounts=d?.accounts.filter(x=>x.active)??[];const categories=d?.categories??[];
      const today=new Date().toLocaleDateString('sv-SE');
      // Stufe 2.2: Buchungsmonat ist maßgeblich; Datum bleibt optional korrigierbar.
      const defaultBookingDate=(month)=>{const current=today.slice(0,7);if(month===current)return today;if(month<current){const [year,mon]=month.split('-').map(Number);return new Date(Date.UTC(year,mon,0)).toISOString().slice(0,10);}return month+'-01';};
      const accountSelect=this.accountChoices(accounts);
      const categorySelect=(kind)=>this.options(categories.filter(x=>x.kind===kind));
      const locked = new Set(d?.locked_accounts??[]);
      const editable = t => !locked.has(t.account_id) && (t.kind!=='transfer'||!locked.has(t.to_id));
      const card=(title,value)=>`<section class="metric"><small>${title}</small><strong>${value}</strong></section>`;
      const stage22Style=`<style>
.ft22-main-create{min-height:44px!important;padding:10px 16px!important;font-weight:700!important;border-radius:11px!important;white-space:nowrap}
@media(max-width:480px){.ft22-main-create{min-height:46px!important;padding:10px 12px!important}}

/* Phase F: Buchungsdialog bleibt im Sichtbereich; kein Scrollsprung zur Schnellbuchung. */
.quick-create.ft22-quick-modal{position:fixed!important;inset:4dvh max(8px,calc((100vw - 620px)/2))!important;z-index:99980!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;max-height:92dvh!important;margin:0!important;padding:16px!important;border-radius:16px!important;background:var(--card-background-color,#192637)!important;border:1px solid var(--divider-color,#415266)!important;box-shadow:0 16px 70px #000b!important}
.quick-panel:has(.ft22-quick-modal)::before{content:"";position:fixed;inset:0;z-index:99970;background:rgba(2,8,20,.72)}
.ft22-quick-modal .ft22-quick-backdrop{display:none}
.ft22-quick-modal #quick-book{overflow-y:auto!important;overscroll-behavior:contain;min-height:0;padding:2px 3px 8px;display:block}
.ft22-quick-modal #quick-save{position:sticky;bottom:0;z-index:2;width:100%;min-height:46px;margin-top:12px}
.ft22-quick-modal .top{flex-shrink:0}
/* Auswahl-Dialog erhält während der Auswahl den Vordergrund. */
/* I.2: the full-screen booking scrim must never intercept picker interactions. */
.wrap:has(#account-modal:not([hidden])) .quick-panel:has(.ft22-quick-modal)::before{display:none!important;pointer-events:none!important}
#account-modal:not([hidden]){z-index:100100!important;pointer-events:auto!important;visibility:visible!important}
#account-modal[hidden]{display:none!important}
.wrap:has(#account-modal:not([hidden])) .ft22-quick-modal{visibility:hidden!important}
.wrap:has(#account-modal:not([hidden])) .ft22-quick-modal .ft22-quick-backdrop{visibility:hidden!important}

      .ft22-workspace{display:grid;gap:12px;margin-top:12px}.ft22-workspace-title{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.ft22-section{display:grid;gap:8px}.ft22-section h3{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:16px;margin:10px 0 2px}.ft22-section h3 small{font-size:12px;color:var(--secondary-text-color,#aab3c2)}.ft22-position{border:1px solid var(--divider-color,#394657);border-radius:12px;padding:10px;min-width:0}.ft22-position-head{display:grid;grid-template-columns:minmax(0,1fr) auto 34px;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:inherit;text-align:left;padding:0;min-height:43px}.ft22-expand-indicator{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--secondary-background-color,rgba(130,150,170,.16));font-size:22px;font-weight:600;line-height:1}.ft22-details>[data-ft22-create],.ft22-details>[data-ft22-book-plan]{min-height:44px;padding:10px 14px;border-radius:9px;font-weight:600}.ft22-position-head span:first-child,.ft22-position-sums{display:grid;gap:4px;min-width:0}.ft22-position-head small,.ft22-unassigned small{font-size:11px;color:var(--secondary-text-color,#9daab9)}.ft22-position-sums{text-align:right;white-space:nowrap}.ft22-over{color:#f3a08d!important}.ft22-track{height:5px;background:var(--divider-color,#394657);border-radius:6px;overflow:hidden;margin-top:8px}.ft22-track span{display:block;height:100%;border-radius:6px}.ft22-details{display:grid;gap:10px;padding-top:12px}.ft22-line{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--divider-color,#394657);padding:6px 0;font-size:13px}.ft22-line span:first-child{display:grid;gap:2px}.ft22-line small{font-size:11px;color:var(--secondary-text-color,#9daab9)}.ft22-assign,.ft22-unassigned{display:flex;align-items:end;gap:8px;flex-wrap:wrap}.ft22-assign label{flex:1 1 180px}.ft22-assign select,.ft22-unassigned select{min-width:0;max-width:100%;width:100%;min-height:40px}.ft22-unassigned{border:1px solid var(--divider-color,#394657);border-radius:10px;padding:10px}.ft22-unassigned div{display:grid;gap:3px;flex:1 1 100%}.ft22-unassigned select{flex:1 1 170px;width:auto}.ft22-unassigned button{min-height:40px}@media(max-width:480px){.ft22-position-head{grid-template-columns:minmax(0,1fr) auto 34px}.ft22-position-head strong{font-size:13px}.ft22-position-sums strong{font-size:12px}.ft22-unassigned select{flex:1 1 100%}}
      .quick-panel .ft-quick-advanced{border:1px solid var(--divider-color,#394657);border-radius:10px;padding:9px 11px;margin:5px 0}.ft-quick-advanced summary{cursor:pointer;color:var(--secondary-text-color,#98a4b7);font-size:13px;font-weight:600}.ft-quick-advanced[open]{display:grid;gap:10px}.ft-quick-advanced[open] summary{margin-bottom:10px}.quick-create .account-note{display:none}.quick-panel .top{margin-bottom:9px}.quick-panel .quick-tabs{margin:8px 0}.quick-panel #quick-save{position:sticky;bottom:calc(env(safe-area-inset-bottom,0px) + 6px);z-index:6;box-shadow:0 0 0 7px var(--card-background-color,#1e293b)}
      .quick-panel .ft22-quick-footer{position:sticky;bottom:0;z-index:7;display:grid;gap:8px;margin-top:12px;padding:8px 0 calc(env(safe-area-inset-bottom,0px) + 2px);background:var(--card-background-color,#1e293b);box-shadow:0 -8px 18px var(--card-background-color,#1e293b)}
      .quick-panel .ft22-quick-footer #quick-save{position:static!important;bottom:auto!important;margin:0!important;box-shadow:none!important;width:100%;min-height:46px}
      .quick-panel .ft22-quick-close{width:100%;min-height:42px;margin:0;font-weight:600}
      @media(max-width:520px){.quick-panel{padding:12px}.quick-panel .quick-create{gap:8px}}
      </style>`;
      const style=`<style>.category-group-title{color:#5ccbc4!important;font-weight:750!important;letter-spacing:.045em}.category-inline{margin:8px 0 16px;padding:12px;border:1px solid var(--divider-color,#394657);border-radius:12px}:host{display:block;color:var(--primary-text-color,#e8edf3);background:var(--primary-background-color,#111827);min-height:100vh;font:inherit}*{box-sizing:border-box}.wrap{width:100%;max-width:1180px;margin:auto;padding:20px 16px 70px;min-width:0}.wrap>*,.booking-list,.account-groups,.category-tree{width:100%;max-width:100%;min-width:0}.booking-list{margin-top:14px}.account-groups{display:grid!important;gap:14px;margin-top:14px}.account-groups>.panel{margin:0}.owner-group-total{text-align:right;font-weight:750;font-size:20px;font-variant-numeric:tabular-nums;padding:0 0 10px;border-bottom:1px solid var(--divider-color,#394657);margin-bottom:7px}.owner-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.category-tree-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,285px),1fr));gap:12px;margin-top:12px;align-items:start}.category-kind-block{margin-top:16px}.category-kind-title{margin:0 0 10px;font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#5ccbc4}.category-owner{height:100%}.category-owner{border:1px solid var(--divider-color,#394657);border-radius:12px;padding:14px;min-width:0}.category-owner h3{margin:4px 0}.category-children{padding-left:14px;margin-top:9px;border-left:2px solid rgba(45,212,191,.25)}.category-children .cat-row{min-width:0}.finance-head{position:sticky;top:0px;z-index:8;background:var(--primary-background-color,#111827);padding:12px 4px;border-bottom:1px solid var(--divider-color,#394657);margin:-12px -4px 16px;box-shadow:0 6px 14px rgba(0,0,0,.16)}.finance-head h1{font-size:25px;font-weight:760;letter-spacing:-.5px;margin:4px 0}.finance-head .month-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.finance-head .month-controls button,.finance-head .month-controls select{min-height:42px;padding:10px 12px;border-radius:10px}.ft-header-search{position:absolute;right:4px;top:8px;width:38px;min-width:38px;height:38px;padding:0!important;border-color:transparent!important;background:transparent!important;display:grid;place-items:center;z-index:2}.ft-header-search:hover{background:color-mix(in srgb,var(--primary-text-color,#e8edf3) 8%,transparent)!important}.ft-header-search svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.ft-page-head>.month-controls{padding-top:28px}.ft22-header-identity{min-width:0}.change-workspace{display:grid;gap:14px}.change-intro{margin:0}.change-day{display:grid;gap:9px}.change-day-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#5ccbc4;margin:8px 2px 0}.change-card{display:grid;grid-template-columns:minmax(0,1fr) max-content;gap:8px 14px;padding:14px 15px;border:1px solid var(--divider-color,#394657);border-radius:13px;background:var(--card-background-color,#1e293b)}.change-main{min-width:0}.change-action{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#5ccbc4}.change-subject{font-size:15px;font-weight:750;margin-top:3px;overflow-wrap:anywhere}.change-detail{font-size:12px;color:var(--secondary-text-color,#98a4b7);margin-top:4px;line-height:1.45}.change-meta{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.change-meta strong,.change-meta small{display:block}.change-meta small{margin-top:4px}.change-empty{padding:18px;border:1px dashed var(--divider-color,#394657);border-radius:12px;color:var(--secondary-text-color,#98a4b7)}.balance-row{display:grid;grid-template-columns:minmax(0,1fr) max-content;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--divider-color,#394657)}.balance-row .balance-name{min-width:0;overflow-wrap:anywhere}.balance-row .balance-value{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}.account-line .balance-value{flex:0 0 auto;white-space:nowrap;text-align:right;margin-left:auto;font-variant-numeric:tabular-nums}.account-line .account-name{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:0 0 15px}p,small,.muted{color:var(--secondary-text-color,#98a4b7)}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px}.tabs{display:flex;gap:7px;overflow-x:auto;margin:18px 0}.tabs button{white-space:nowrap}.tabs button.active{background:var(--primary-color,#4c9aff);color:white;border-color:transparent}button,input,select{font:inherit}button{background:var(--card-background-color,#1e293b);color:inherit;border:1px solid var(--divider-color,#394657);border-radius:10px;padding:10px 13px;cursor:pointer}button.primary{background:var(--primary-color,#4c9aff);color:white;border:0}button.danger{border-color:#c65f5f;color:#ffb4b4;background:transparent}button:disabled{opacity:.55}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.metric,.panel{background:var(--card-background-color,#1e293b);border:1px solid var(--divider-color,#394657);border-radius:15px;padding:18px}.metric strong{display:block;font-size:25px;margin-top:8px;font-variant-numeric:tabular-nums}.panel{margin:14px 0}.forms{display:grid;grid-template-columns:repeat(auto-fit,minmax(275px,1fr));gap:14px}.forms .panel{margin:0}form{display:grid;gap:10px}label{display:grid;gap:5px;font-size:13px;color:var(--secondary-text-color,#98a4b7)}input,select{width:100%;min-width:0;background:var(--primary-background-color,#111827);color:var(--primary-text-color,#fff);border:1px solid var(--divider-color,#45536a);border-radius:9px;padding:10px}table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;color:var(--secondary-text-color,#98a4b7);font-weight:500}td,th{padding:11px 8px;border-bottom:1px solid var(--divider-color,#394657)}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.scroll{overflow-x:auto}.notice{padding:12px;border-radius:10px;background:var(--secondary-background-color,#29364a);margin:12px 0}.actions{display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap}.actions button{padding:6px 8px;font-size:12px}.positive{color:#43c48a}.negative{color:#fa8d8d}.account-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.account-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:12px}.account-line{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--divider-color,#394657)}.account-line:last-child{border:0}.account-line span{min-width:0;overflow-wrap:anywhere}.account-line strong{white-space:nowrap;font-variant-numeric:tabular-nums}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--secondary-text-color,#98a4b7)}.account-total{font-size:25px;font-weight:750;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.account-note{font-size:12px;line-height:1.5}.account-groups .panel{margin:0}.cat-row{display:flex;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid var(--divider-color,#394657)}@media(min-width:780px){.grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:520px){.wrap{padding:15px 10px 55px}.metric{padding:12px}.metric strong{font-size:19px}td,th{padding:9px 5px;font-size:12px}}.quick-panel{max-width:760px;margin:0 auto 18px}.quick-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:14px 0}.quick-tabs button{padding:12px 5px;font-size:13px}.quick-tabs button.active{background:var(--primary-color,#4c9aff);border-color:transparent;color:#fff}.quick-amount{font-size:27px;font-weight:700;padding:13px 14px;font-variant-numeric:tabular-nums}.quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.quick-grid label{min-width:0}.quick-panel #quick-save{min-height:48px;font-weight:700}@media(max-width:520px){.quick-grid{grid-template-columns:1fr}.quick-tabs button{font-size:12px}}[hidden]{display:none!important}.account-field{display:grid;gap:5px;min-width:0}.account-field-label{font-size:13px;color:var(--secondary-text-color,#98a4b7)}.account-native{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}.account-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;text-align:left;padding:10px 13px;min-height:55px;background:var(--primary-background-color,#111827);border:1px solid var(--divider-color,#45536a)}.account-trigger strong,.account-trigger small{display:block;line-height:1.35}.account-trigger strong{font-size:14px;font-weight:600}.account-trigger small{font-size:11px;margin-top:3px}.account-chevron{font-size:23px;color:#75c7c4}.account-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px}.account-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.75)}.account-dialog{position:relative;width:min(100%,480px);max-height:min(82dvh,720px);display:flex;flex-direction:column;background:var(--card-background-color,#1b2633);border:1px solid var(--divider-color,#3d4b59);border-radius:17px;overflow:hidden;box-shadow:0 18px 70px #0009}.account-dialog-head{padding:13px 15px;display:flex;justify-content:space-between;align-items:center}.account-dialog-head strong{font-size:16px}.account-dialog-head button{border:0;padding:5px 9px;background:transparent}.account-dialog-search{padding:0 13px 10px}.account-dialog-search input{font-size:14px;padding:10px 12px}.account-dialog-list{overflow-y:auto;overscroll-behavior:contain;padding:0 9px 12px}.account-picker-group h3{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--secondary-text-color,#9aa8b6);margin:14px 7px 4px}.account-picker-row{width:100%;border:0;border-bottom:1px solid var(--divider-color,#344353);border-radius:0;display:flex;align-items:center;justify-content:space-between;text-align:left;gap:8px;padding:10px 9px;min-height:52px;background:transparent}.account-picker-row.selected{background:rgba(78,191,187,.12);border-radius:8px}.account-picker-info{min-width:0}.account-picker-info strong,.account-picker-info small{display:block;overflow-wrap:anywhere}.account-picker-info strong{font-size:14px;font-weight:600;line-height:1.3}.account-picker-info small{font-size:11px;margin-top:3px}.account-picker-check{color:#72c9c5;font-size:18px}.account-modal [hidden]{display:none!important}@media(max-width:520px){.account-modal{padding:9px}.account-dialog{max-height:85dvh}}.finance-head{margin-bottom:19px}.finance-head h1{font-size:25px;letter-spacing:-.035em;margin:4px 0}.month-controls{display:flex;gap:6px;align-items:center}.month-controls select{width:auto;min-width:155px;max-width:210px}.month-controls button{min-width:36px;padding:9px 8px}.account-more{width:100%;text-align:left;font-size:13px;color:#78c8c6;border:1px solid var(--divider-color,#394657);margin:8px 0}.check-label{display:flex;flex-direction:row;align-items:center}.check-label input{width:auto}@media(max-width:520px){.finance-head{align-items:flex-start}.month-controls{width:100%}.month-controls select{flex:1;min-width:0}.change-card{grid-template-columns:minmax(0,1fr) max-content;gap:7px 10px;padding:12px}.change-subject{font-size:14px}}.change-type-group{border-top:1px solid var(--divider-color,#394657)}.change-type-group:last-child{border-bottom:1px solid var(--divider-color,#394657)}.change-type-toggle{width:100%;border:0;border-radius:0;background:transparent;padding:14px 4px;display:flex;align-items:center;justify-content:space-between;text-align:left}.change-type-toggle span:first-child{display:flex;align-items:baseline;gap:10px;min-width:0}.change-type-toggle strong{font-size:15px;color:#5ccbc4}.change-type-toggle small{font-size:12px;color:var(--secondary-text-color,#98a4b7)}.change-type-symbol{font-size:22px;color:#5ccbc4}.change-type-list{display:grid;gap:10px;padding:0 0 14px}.change-card{display:grid;grid-template-columns:minmax(0,1fr) max-content;gap:8px 14px;border:1px solid var(--divider-color,#394657);border-radius:12px;padding:13px;background:color-mix(in srgb,var(--card-background-color,#1e293b) 76%,transparent)}.change-subject{font-weight:700;font-size:15px}.change-diff{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:7px;align-items:center;margin-top:7px;color:var(--secondary-text-color,#98a4b7);font-size:13px}.change-diff span:last-child{color:var(--primary-text-color,#e8edf3)}.change-diff strong{color:#5ccbc4}.change-reason{margin-top:7px;font-size:12px;color:var(--secondary-text-color,#98a4b7)}.change-meta{display:flex;flex-direction:column;align-items:flex-end;gap:5px;white-space:nowrap;font-size:11px;color:var(--secondary-text-color,#98a4b7)}@media(max-width:520px){.change-card{grid-template-columns:1fr}.change-meta{align-items:flex-start;flex-direction:row;flex-wrap:wrap}.change-diff{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}.change-type-toggle span:first-child{gap:7px}} .sticky-subnav{position:sticky;top:var(--ft-subnav-top,180px);z-index:9;background:var(--primary-background-color,#111827);padding:8px 0;margin:0 0 16px;border-bottom:1px solid var(--divider-color,#394657)}.proposal-line{display:grid;grid-template-columns:minmax(0,1fr) max-content;gap:12px;align-items:start}.proposal-name{min-width:0;overflow-wrap:anywhere}.proposal-amount{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}.inline-editor-cell{padding:8px!important}.inline-editor-cell .panel{margin:0}.account-line+.panel{margin:8px 0 16px}.account-picker-row{width:100%} .sticky-header-group{position:sticky;top:0px;z-index:30;background:var(--primary-background-color,#111827);isolation:isolate}.sticky-header-group .finance-head,.sticky-header-group .sticky-subnav{position:static;top:auto;margin-bottom:0}.sticky-header-group .tabs{scrollbar-width:none;overscroll-behavior-x:contain}.sticky-header-group .tabs::-webkit-scrollbar{display:none}
.ft-month-picker{display:inline-flex;min-width:0}.ft-month-trigger{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:145px;max-width:100%;border:1px solid var(--divider-color,#415266)!important;background:var(--card-background-color,#172536)!important;color:var(--primary-text-color,#edf3fa)!important;border-radius:11px!important;padding:9px 12px!important;font:inherit;cursor:pointer}.ft-month-trigger span{color:var(--primary-color,#38bdf8)}#month{display:none!important}.ft-month-overlay:not([hidden]){position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px}.ft-month-backdrop{position:absolute;inset:0;background:rgba(2,8,20,.72)}.ft-month-dialog{position:relative;display:flex;flex-direction:column;gap:12px;width:min(420px,100%);max-height:min(75vh,650px);padding:16px;background:var(--card-background-color,#192637);color:var(--primary-text-color,#edf3fa);border:1px solid var(--divider-color,#415266);border-radius:17px;box-shadow:0 20px 55px #0008}.ft-month-top{display:flex;align-items:center;justify-content:space-between}.ft-month-top button{border:0;background:transparent;color:inherit;font-size:19px;cursor:pointer}.ft-month-dialog input{width:100%;padding:11px 12px;border:1px solid var(--divider-color,#415266);border-radius:10px;background:var(--primary-background-color,#101722);color:inherit;font:inherit}.ft-month-list{overflow-y:auto;min-height:0;display:grid;gap:3px}.ft-month-option{display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;padding:11px 12px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;cursor:pointer}.ft-month-option:hover,.ft-month-option.is-current{background:rgba(20,184,166,.16)}.ft-month-option.is-current{color:#4de0d1;font-weight:700}.ft-month-empty{padding:12px;color:var(--secondary-text-color,#9ca3af)}

/* Stufe 30: consistent content widths and compact category editing */
.quick-panel{max-width:100%!important;width:100%!important;margin:16px 0 18px!important;box-sizing:border-box}
.wrap{width:100%;max-width:1180px;min-width:0;margin:0 auto;box-sizing:border-box}
.wrap>.tabs,.wrap>.booking-list,.wrap>.panel,.wrap>.grid{max-width:100%;min-width:0}
.booking-list{width:100%;max-width:100%;min-width:0;margin:16px 0 0!important;box-sizing:border-box}
.booking-list>.scroll{width:100%;max-width:100%;overflow-x:auto}
.tabs{margin-bottom:16px!important}
.category-children .cat-row{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:29px;padding:3px 0;line-height:1.3}
.category-children .cat-row .cat-edit-mini{font-size:13px!important;line-height:1!important;padding:4px 7px!important;min-height:24px!important;min-width:26px!important;border-radius:6px!important;flex:0 0 auto}

/* HF7: Buchungen hochkant ohne horizontales Scrollen */
.booking-list,.booking-list .scroll,.booking-list table{max-width:100%;min-width:0}
.booking-list .scroll{overflow-x:auto}
.booking-list td,.booking-list th{overflow-wrap:anywhere}
.booking-list .actions{min-width:0}
.booking-list .inline-editor-cell{white-space:normal}
.booking-list .inline-editor-cell .panel{max-width:100%;min-width:0}
@media(max-width:600px){
 .booking-list .scroll{overflow-x:hidden}
 .booking-list table,.booking-list tbody{display:block;width:100%;min-width:0}
 .booking-list thead{display:none}
 .booking-list tbody>tr:not(.booking-editor-row){display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 9px;margin:0 0 11px;padding:12px;border:1px solid var(--divider-color,#394657);border-radius:12px;min-width:0;max-width:100%;}
 .booking-list tbody>tr:not(.booking-editor-row)>td{border:0;padding:0;min-width:0;white-space:normal;}
 .booking-list tbody>tr:not(.booking-editor-row)>td:nth-child(1){grid-column:1;grid-row:1;color:var(--secondary-text-color,#98a4b7);font-size:12px;}
 .booking-list tbody>tr:not(.booking-editor-row)>td:nth-child(2){grid-column:1/-1;grid-row:2;overflow-wrap:anywhere;}
 .booking-list tbody>tr:not(.booking-editor-row)>td:nth-child(3){grid-column:1/-1;grid-row:3;color:var(--secondary-text-color,#98a4b7);font-size:12px;overflow-wrap:anywhere;}
 .booking-list tbody>tr:not(.booking-editor-row)>td:nth-child(4){grid-column:2;grid-row:1;text-align:right;font-weight:700;white-space:nowrap;}
 .booking-list tbody>tr:not(.booking-editor-row)>td:nth-child(5){grid-column:1/-1;grid-row:4;text-align:left;margin-top:7px;border-top:1px solid var(--divider-color,#394657);padding-top:9px;}
 .booking-list .actions{justify-content:flex-start;gap:7px;flex-wrap:wrap}
 .booking-list .actions button{min-height:34px;padding:7px 9px}
 .booking-list tbody>tr.booking-editor-row{display:block;max-width:100%;width:100%;margin:0 0 13px;}
 .booking-list tbody>tr.booking-editor-row>td{display:block;width:100%;max-width:100%;padding:0;border:0;}
 .booking-list .inline-editor-cell>.panel{margin:0;padding:13px}
}
/* HF7: einziger Fortschreibungsdialog */
.propagation-options{display:grid;gap:11px;padding:14px;border:1px solid var(--divider-color,#394657);border-radius:12px}
.propagation-options label{display:flex;align-items:center;gap:10px;font-size:14px;line-height:1.4;cursor:pointer}
.propagation-options input[type=checkbox]{width:18px;height:18px;flex:0 0 18px;margin:0;accent-color:#5ccbc4}
.propagation-months{display:grid;grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:7px;max-height:175px;overflow-y:auto}
.propagation-months label{padding:8px;border:1px solid var(--divider-color,#394657);border-radius:9px;font-size:12px}
.propagation-dialog .account-dialog{width:min(100%,510px)}
.propagation-body{padding:4px 16px 16px;overflow-y:auto}
.propagation-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:15px}

/* HF8: unified transaction cards, right-aligned dates beneath amounts */
.booking-list .booking-amount{min-width:105px;text-align:right;white-space:nowrap}
.booking-date{display:block;color:var(--secondary-text-color,#98a4b7);font-size:11px;font-weight:400;margin-top:4px;letter-spacing:.02em}
.booking-pencil{display:inline-grid;place-items:center;width:35px;min-width:35px;height:35px;padding:0!important;font-size:18px;line-height:1}
.proposal-line{display:grid;grid-template-columns:minmax(0,1fr);gap:7px;align-items:center;margin:2px 0 12px}
.proposal-name{grid-column:1/-1;min-width:0;overflow-wrap:anywhere}
.proposal-name strong{display:block;font-size:15px;line-height:1.3}
.proposal-tail{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;min-width:0}
.proposal-line + .actions{margin-top:12px;gap:10px;flex-wrap:wrap}
.proposal-workspace>.proposal-status-group{border-top:1px solid var(--divider-color,#394657)}
.proposal-workspace>.proposal-status-group:first-of-type{margin-top:14px}
.proposal-status-toggle{display:flex!important;width:100%;min-height:48px;align-items:center;justify-content:space-between;gap:12px;padding:9px 4px!important;border:0!important;border-radius:0!important;background:transparent!important;color:inherit!important;text-align:left!important}
.proposal-status-toggle>span:first-child{display:flex;align-items:baseline;gap:9px;min-width:0}
.proposal-status-toggle strong{font-size:15px;color:#5eead4}
.proposal-status-toggle small{font-size:11px;white-space:nowrap}
.proposal-status-symbol{width:26px;height:26px;flex:0 0 26px;display:grid;place-items:center;border:1px solid var(--divider-color,#344154);border-radius:7px;font-size:17px;color:#5eead4}
.proposal-status-list{padding:1px 0 8px}
.proposal-status-list[hidden]{display:none!important}
.proposal-item{padding:12px!important;margin:8px 0!important}
.proposal-values{display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0}.proposal-values small{text-align:right;line-height:1.25}
.proposal-linked-list{display:grid;gap:8px;margin:12px 0}.proposal-linked-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid var(--divider-color,#415266);border-radius:10px}.proposal-linked-row span{display:flex;flex-direction:column;min-width:0}.proposal-linked-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.proposal-pencil{align-self:center}
.proposal-afterwork-modal{position:fixed;inset:0;z-index:99985;display:flex;align-items:center;justify-content:center;padding:14px}
.proposal-afterwork-backdrop{position:absolute;inset:0;background:rgba(2,8,20,.72)}
.proposal-afterwork-dialog{position:relative;width:min(100%,560px);max-height:min(88dvh,760px);overflow-y:auto;overscroll-behavior:contain;background:var(--card-background-color,#192637);border:1px solid var(--divider-color,#415266);border-radius:16px;padding:17px;box-shadow:0 16px 70px #000b}
.proposal-afterwork-dialog .top{margin-bottom:13px}
.proposal-afterwork-dialog form{display:grid;gap:10px}
.proposal-afterwork-dialog .afterwork-note{padding:11px 12px;border-radius:10px;background:var(--secondary-background-color,#223044);line-height:1.45}
.wrap:has(#account-modal:not([hidden])) .proposal-afterwork-modal{visibility:hidden!important}
.proposal-empty{padding:8px 4px 12px;margin:0}
@media(max-width:520px){.proposal-item{padding:11px!important}.proposal-line{gap:6px}.proposal-name strong{font-size:14px}.proposal-amount{white-space:normal}.proposal-pencil{align-self:center}}
.booking-list .booking-data-row{vertical-align:top}
@media(max-width:600px){
 .booking-list tbody>tr.booking-data-row{grid-template-columns:minmax(0,1fr) auto!important;gap:8px 12px!important;}
 .booking-list tbody>tr.booking-data-row>td:nth-child(1){grid-column:1;grid-row:1;min-width:0;font-size:14px;color:inherit}
 .booking-list tbody>tr.booking-data-row>td:nth-child(2){grid-column:1/-1;grid-row:2;color:var(--secondary-text-color,#98a4b7);font-size:12px}
 .booking-list tbody>tr.booking-data-row>td:nth-child(3){grid-column:2;grid-row:1;text-align:right;min-width:0}
 .booking-list tbody>tr.booking-data-row>td:nth-child(4){grid-column:1/-1;grid-row:3;border-top:1px solid var(--divider-color,#394657);padding-top:9px}
 .booking-list tbody>tr.booking-editor-row{width:100%}
}

.ha-sidebar-toggle{display:inline-grid;place-items:center;flex:0 0 36px;width:36px;height:36px;min-width:36px;padding:0!important;border-radius:9px;font-size:21px;line-height:1;cursor:pointer;align-self:center}
.sticky-header-group,.finance-head,.head{transform:none!important;top:var(--ft-sticky-top,0px)!important}.sticky-header-group{position:sticky;top:var(--ft-sticky-top,0px)!important}.finance-head{position:sticky;top:var(--ft-sticky-top,0px)!important;z-index:30}.ft-harmonized-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.ft-harmonized-actions button{width:auto;flex:0 0 auto;min-width:90px;max-width:100%}.panel h2{line-height:1.3}.panel .top{margin-bottom:14px}/* HA2.0 dialog/action standards */
 .panel .actions,.panel .controls,.draft-dialog .controls,.match-inline-form .controls,.form .controls{gap:9px;align-items:center;flex-wrap:wrap}
 .panel .actions>button,.panel .controls>button,.draft-dialog .controls>button,.match-inline-form .controls>button,.form .controls>button{width:auto;flex:0 0 auto;min-width:92px;max-width:100%;border-radius:9px}
 [role="dialog"] button{border-radius:9px}
 .month-grid-standard{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
 .month-grid-standard button{min-width:0;padding:10px 5px;text-align:center}
 .month-grid-standard button[aria-selected="true"]{background:rgba(20,184,166,.17);border-color:#14b8a6;color:#5eead4;font-weight:700}
 @media(max-width:480px){.panel .controls,.panel .actions{gap:7px}.panel .controls>button,.panel .actions>button{min-width:0}.month-grid-standard{gap:5px}}
 
/* Hotfix 11: einheitliche, quadratische Symbolschaltflächen; unabhängig von Breakpoint und Aktionsleisten. */
.category-children .cat-row button.ft-pencil,button.ft-pencil{
 box-sizing:border-box!important;display:inline-grid!important;place-items:center!important;
 flex:0 0 32px!important;width:32px!important;min-width:32px!important;max-width:32px!important;
 height:32px!important;min-height:32px!important;max-height:32px!important;
 padding:0!important;margin:0!important;line-height:1!important;font-size:17px!important;
 border-radius:8px!important;white-space:nowrap!important;aspect-ratio:1/1!important;
}
/* Der Abstand zum Hauptheader gleitet mit dessen Ein- und Ausblenden. */
.finance-head,.head,.sticky-subnav,.sticky-header-group{transition:top .28s cubic-bezier(.22,1,.36,1)}

/* Hotfix 14: kompakter Kategorie-Akkordeon-Standard für Buchungslisten */
.booking-list .booking-category-header>td{padding:6px 9px!important;border:0!important;width:100%}
.booking-list .booking-category-header{background:var(--card-background-color,#1d2734)}
.booking-list .ft-list-group-toggle{display:flex!important;justify-content:space-between;align-items:center;width:100%;min-height:30px;gap:8px;text-align:left;border:0!important;background:transparent!important;color:#5eead4!important;font-weight:750;padding:2px 3px!important}
.booking-list .ft-list-group-toggle>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.booking-list .ft-list-group-symbol{width:24px;height:24px;flex:0 0 24px;display:grid;place-items:center;border:1px solid var(--divider-color,#344154);border-radius:7px;font-size:17px}
.booking-list .ft-booking-group-item[hidden]{display:none!important}
@media(max-width:600px){
 .booking-list tbody>tr.booking-category-header{display:block!important;padding:5px 9px!important;margin:0 0 8px!important}
 .booking-list tbody>tr.booking-category-header>td{display:block!important;width:100%!important;padding:0!important}
 .booking-list tbody>tr.ft-booking-group-item[hidden]{display:none!important}
}

/* Hotfix 17: Buchungen nach Konto – zweizeilige 70/30-Karten ohne redundante Konto-/Planbezug-Zeile. */
.account-booking-list .scroll{overflow-x:hidden!important}
.account-booking-list table,.account-booking-list tbody{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important}
.account-booking-list .booking-category-header{display:block!important;width:100%!important}
.account-booking-list .booking-category-header>td{display:block!important;width:100%!important}
.account-booking-list tbody>tr.account-booking-row{display:block!important;width:100%!important;max-width:100%!important;margin:0 0 11px!important;padding:0!important;border:1px solid var(--divider-color,#394657)!important;border-radius:12px!important;background:var(--card-background-color,#1d2734)!important;overflow:hidden!important}
.account-booking-list tbody>tr.account-booking-row>td.account-booking-card-cell{display:block!important;width:100%!important;max-width:100%!important;padding:0!important;border:0!important;white-space:normal!important}
.account-booking-card{padding:13px 14px 11px;min-width:0}
.account-booking-main{display:grid;grid-template-columns:minmax(0,7fr) minmax(92px,3fr);grid-template-areas:"title value" "category date";column-gap:12px;row-gap:5px;align-items:start;min-width:0}
.account-booking-title{grid-area:title;display:block!important;min-width:0!important;width:100%!important;max-width:100%!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:var(--primary-text-color,#e8edf3)!important;text-align:left!important;text-decoration:none!important;font-weight:650!important;line-height:1.35!important;overflow-wrap:anywhere!important}
.account-booking-value{grid-area:value;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;line-height:1.35}
.account-booking-category{grid-area:category;min-width:0;color:var(--secondary-text-color,#98a4b7);line-height:1.35;overflow-wrap:anywhere}
.account-booking-date{grid-area:date;text-align:right;white-space:nowrap;color:var(--secondary-text-color,#98a4b7);font-variant-numeric:tabular-nums;line-height:1.35}
.account-booking-actions{margin-top:11px;padding-top:10px;border-top:1px solid var(--divider-color,#394657)}
.account-booking-actions .actions{justify-content:flex-start!important;gap:9px!important;flex-wrap:wrap!important}
.account-booking-actions .actions button{min-height:34px;padding:7px 10px}
.account-booking-list tbody>tr.booking-editor-row{display:block!important;width:100%!important;max-width:100%!important;margin:0 0 13px!important}
.account-booking-list tbody>tr.booking-editor-row>td{display:block!important;width:100%!important;max-width:100%!important;padding:0!important;border:0!important}
@media(max-width:520px){.account-booking-card{padding:12px}.account-booking-main{grid-template-columns:minmax(0,7fr) minmax(82px,3fr);column-gap:9px}.account-booking-title{font-size:14px!important}.account-booking-value,.account-booking-category,.account-booking-date{font-size:12px}}

/* Ein einziges Auswahlkonzept: native Selects bleiben nur als Formularwert erhalten. */
.account-picker>.account-native,.account-picker>select.account-native{position:absolute!important;width:1px!important;height:1px!important;min-width:0!important;min-height:0!important;max-width:1px!important;padding:0!important;margin:0!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important;clip-path:inset(50%)!important;border:0!important}
.account-picker{position:relative!important}
.account-picker>.account-trigger{display:flex!important;width:100%!important;min-height:44px!important;align-items:center!important;justify-content:space-between!important;box-sizing:border-box!important}
.account-dialog-list .account-picker-row{min-height:44px!important}

/* Phase E.1: Zuordnungsfelder verwenden denselben Dialog wie Konto/Kategorie. */
.ft22-picker{position:relative;min-width:0;width:100%}
.ft22-picker>.account-native{position:absolute!important;width:1px!important;height:1px!important;min-width:0!important;min-height:0!important;max-width:1px!important;opacity:0!important;pointer-events:none!important;clip-path:inset(50%)!important;padding:0!important;border:0!important}
.ft22-picker>.account-trigger{width:100%!important;min-height:44px!important;box-sizing:border-box!important}
.ft22-unassigned>.ft22-picker{flex:1 1 170px}
@media(max-width:480px){.ft22-unassigned>.ft22-picker{flex:1 1 100%}}
/* HA2.0 global subheader specification — shared across the three views */
.ft-page-head{
  display:grid!important;grid-template-columns:36px minmax(0,1fr) auto;
  align-items:center!important;gap:10px 12px!important;
  width:100%!important;max-width:100%!important;min-height:94px;
  padding:12px 4px!important;margin:0 0 16px!important;
  border-bottom:1px solid var(--divider-color,#344154)!important;
  background:var(--primary-background-color,#101722)!important;
}
.sticky-header-group>.ft-page-head{margin:0!important}
.ft-page-head>:nth-child(2){min-width:0;align-self:center}
.ft-page-head .eyebrow{font-size:11px!important;line-height:1.25!important;letter-spacing:.1em!important;text-transform:uppercase;font-weight:700!important;margin:0 0 5px!important;color:var(--secondary-text-color,#9baaba)}
.ft-page-head .title{font-size:25px!important;font-weight:760!important;line-height:1.18!important;letter-spacing:-.5px!important;margin:0 0 4px!important;overflow-wrap:anywhere}
.ft-page-head .sub{font-size:12px!important;line-height:1.35!important;color:var(--secondary-text-color,#9baaba)!important;margin:0!important}
.ft-page-head>.controls,.ft-page-head>.month-controls{display:flex!important;gap:7px!important;align-items:center!important;justify-content:flex-end!important;flex-wrap:wrap!important;min-width:0}
.ft-page-head>.controls button,.ft-page-head>.month-controls button,.ft-page-head>.controls select,.ft-page-head>.month-controls select{min-height:40px!important;border-radius:10px!important;box-sizing:border-box}
.ft-page-head>.ha-sidebar-toggle{width:36px!important;height:36px!important;min-width:36px!important;min-height:36px!important;max-width:36px!important;max-height:36px!important;padding:0!important;place-items:center!important}
@media(max-width:720px){
 .ft-page-head{grid-template-columns:36px minmax(0,1fr);row-gap:10px!important;min-height:0;padding:12px 4px!important}
 .ft-page-head>.controls,.ft-page-head>.month-controls{grid-column:1/-1;justify-content:flex-end!important;width:100%!important;padding-top:0!important}
 .ft-page-head .title{font-size:23px!important}
 .ft22-header-identity{padding-right:46px}
 .ft-header-search{right:4px;top:12px}
}
@media(max-width:380px){
 .ft-page-head>.controls,.ft-page-head>.month-controls{gap:5px!important}
 .ft-page-head>.controls button,.ft-page-head>.month-controls button{padding:7px!important}
}

/* compact, initially collapsed account-owner groups */
.ft-owner-group{min-width:0!important}
.ft-owner-group .ft-owner-head{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:10px!important;margin:0!important}
.ft-owner-toggle{border:0!important;background:transparent!important;text-align:left!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;padding:3px 0!important;min-width:0!important;flex:1 1 auto!important;min-height:38px!important;color:inherit!important}
.ft-owner-toggle>span:first-child{display:flex;flex-direction:column;gap:2px;min-width:0}
.ft-owner-toggle .eyebrow{font-size:10px;line-height:1.2;letter-spacing:.07em}
.ft-owner-title{font-size:17px;line-height:1.3;font-weight:700;overflow-wrap:anywhere}
.ft-owner-symbol{font-size:21px;font-weight:600;color:var(--secondary-text-color,#9baaba);min-width:23px;text-align:center}
.ft-owner-group>.owner-group-total{margin:2px 0 0!important;text-align:right!important;line-height:1.35!important}
.ft-owner-list[hidden]{display:none!important}
.ft-owner-list{margin-top:12px;min-width:0}
.ft-owner-group .owner-actions{flex:0 0 auto}
@media(max-width:440px){.ft-owner-group .owner-actions button{font-size:12px;padding:7px 9px;min-width:0}.ft-owner-title{font-size:16px}}
</style>`;
      const tabs=''; // Unteransichten werden einheitlich vom SuperHeader gesteuert
      let body='';
      if(d){
        if(this.tab==='overview'||this.tab==='by_account')body=`<div class="grid">${card('Einnahmen',this.money(d.income_cents))}${card('Ausgaben',this.money(d.expense_cents))}${card('Monatssaldo',this.money(d.income_cents-d.expense_cents))}</div>`;
        if(this.tab==='closing')body=this.renderMonthValidation();
        if(this.tab==='owners'){
          const owners=(this.accountOwners||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'de',{sensitivity:'base'}));
          const ownerRows=owners.map(o=>{
            const editing=this.editOwnerName===o.name;
            return `<section class="panel"><div class="top"><div><div class="eyebrow">Kontoinhaber</div><h3 style="margin:4px 0 0">${this.esc(o.name)}</h3><small>${Number(o.account_count||0)} Konto/Konten zugeordnet</small></div><div class="owner-actions"><button type="button" data-edit-owner="${this.esc(o.name)}" class="ft-pencil" aria-label="${this.esc(o.name)} bearbeiten">✎</button><button type="button" data-delete-owner="${this.esc(o.name)}" class="ft-trash" aria-label="${this.esc(o.name)} löschen">🗑</button></div></div>${editing?`<form id="edit-owner-form" class="category-inline"><input type="hidden" name="old_name" value="${this.esc(o.name)}"/><label>Name des Kontoinhabers<input name="name" maxlength="80" required value="${this.esc(o.name)}" autofocus/></label><div class="ft-harmonized-actions"><button type="submit" class="primary">Änderung speichern</button><button type="button" id="cancel-owner-edit">Abbrechen</button></div></form>`:''}</section>`;
          }).join('');
          body=`<section class="panel"><div class="top"><div><div class="eyebrow">Stammdaten</div><h2 style="margin:4px 0 0">Kontoinhaber</h2></div><button type="button" id="toggle-new-owner" aria-expanded="${this.newOwnerExpanded}">${this.newOwnerExpanded?'✕ Schließen':'＋ Kontoinhaber anlegen'}</button></div><p class="muted">Kontoinhaber strukturieren die Konten und alle Kontoauswahlen. Ein Inhaber kann erst gelöscht werden, wenn ihm kein Konto mehr zugeordnet ist.</p>${this.newOwnerExpanded?`<form id="new-owner-form" class="category-inline"><label>Name des Kontoinhabers<input name="name" maxlength="80" required autofocus placeholder="z. B. Haushalt"/></label><div class="ft-harmonized-actions"><button type="submit" class="primary">Kontoinhaber anlegen</button><button type="button" id="cancel-new-owner">Abbrechen</button></div></form>`:''}</section>${ownerRows||'<section class="panel"><p class="muted">Noch keine Kontoinhaber vorhanden. Für die Ersteinrichtung zuerst einen Kontoinhaber anlegen.</p></section>'}`;
        }
        if(this.tab==='accounts'){
          const sorted=this.rankAccounts(accounts),sum=items=>items.reduce((n,a)=>n+Number(a.balance_cents||0),0),owners=this.ownerNames(accounts),storedOwners=(this.accountOwners||[]).map(o=>o.name).filter(Boolean),types=this.accountTypes();
          const groups=owners.map(owner=>{const list=sorted.filter(a=>this.owner(a)===owner);if(!list.length)return '';let previous='';return `<section class="panel ft-owner-group"><div class="top ft-owner-head"><button type="button" class="ft-owner-toggle" data-account-collapse="${this.esc(owner)}" aria-expanded="${!!this.accountGroupOpen[owner]}" aria-label="${this.esc(owner)} Konten ${this.accountGroupOpen[owner]?'einklappen':'aufklappen'}"><span><span class="eyebrow">Kontoinhaber</span><strong class="ft-owner-title">${this.esc(owner)}</strong></span><span class="ft-owner-symbol">${this.accountGroupOpen[owner]?'−':'+'}</span></button><div class="owner-actions"><button type="button" data-account-group="${this.esc(owner)}" class="${this.accountGroupEditing[owner]?'primary':''}">${this.accountGroupEditing[owner]?'✓ Fertig':'✎ Bearbeiten'}</button></div></div><div class="owner-group-total">${this.money(sum(list))}</div><div class="ft-owner-list" ${this.accountGroupOpen[owner]?'':'hidden'}>${list.map(a=>{const bank=this.bank(a),heading=bank!==previous?`<div class="eyebrow" style="margin-top:9px;padding-bottom:3px">${this.esc(bank)}</div>`:'';previous=bank;const editing=this.accountGroupEditing[owner]&&this.editAccountId===a.id;return `${heading}<div class="account-line"><button type="button" data-favorite="${this.esc(a.id)}" ${this.accountGroupEditing[owner]?'':'disabled'} aria-label="Favorit ändern" title="Als Favorit markieren" style="padding:3px;border:0;background:transparent;color:${this.isFavorite(a)?'#f6c94c':'var(--secondary-text-color,#98a4b7)'};font-size:21px">${this.isFavorite(a)?'★':'☆'}</button>${this.accountGroupEditing[owner]?`<button type="button" data-edit-account="${this.esc(a.id)}" class="ft-pencil" title="Kontodaten bearbeiten" aria-label="Kontodaten bearbeiten" style="padding:3px 7px">✎</button>`:''}<span class="account-name"><strong style="white-space:normal">${this.esc(this.accountLabel(a))}</strong><br><small>${this.esc(a.name)}</small></span><strong class="balance-value ${a.balance_cents<0?'negative':''}">${this.money(a.balance_cents)}</strong></div>${editing?`<section class="panel" id="account-edit"><h2>Kontostammdaten bearbeiten</h2><p class="muted">Konto-ID bleibt unverändert. Änderungen an Eröffnungsdaten werden technisch auf bestehende Buchungen und Monatsabschlüsse geprüft.</p><form id="edit-account-form"><label>Kontoname<input name="name" maxlength="100" value="${this.esc(a.name)}" required/></label><label>Anzeigename (optional)<input name="display_name" maxlength="80" value="${this.esc(this.accountMeta[a.id]?.display_name||'')}" placeholder="Leer = Kontoname verwenden"/></label><label>Inhaber${this.masterPicker('edit-account-owner','owner',storedOwners,this.owner(a),'Kontoinhaber')}</label><label>Kontotyp${this.masterPicker('edit-account-type','account_type',types,this.accountType(a),'Kontotyp')}</label><label>Bank / Institut<input name="bank" maxlength="100" value="${this.esc(this.accountMeta[a.id]?.bank||'')}" placeholder="z. B. Sparkasse"/></label><label>Eröffnungsdatum<input name="opening_date" type="date" required value="${this.esc(a.opening_date)}"/></label><label>Eröffnungsbestand (€)<input name="opening_eur" inputmode="decimal" required value="${(Number(a.opening_cents||0)/100).toFixed(2)}"/></label><label>Maximal zulässige Kontodifferenz (€)<input name="tolerance_eur" type="number" min="0" max="1000000" step="0.01" required value="${((this.accountMeta[a.id]?.tolerance_cents||0)/100).toFixed(2)}"/><small class="muted">0,00 € = centgenauer Abgleich. Tolerierte Differenzen bleiben sichtbar.</small></label><label class="check-label"><input type="checkbox" name="favorite" ${this.isFavorite(a)?'checked':''}/> Favorit</label><div class="ft-harmonized-actions"><button class="primary" type="submit">Kontodaten speichern</button><button type="button" id="cancel-account-edit">Abbrechen</button><button type="button" data-delete-account="${this.esc(a.id)}" class="danger">Konto löschen</button></div></form></section>`:''}`;}).join('')}</div></section>`;}).join('');
          const newForm=this.newAccountExpanded?`<form id="new-account-form" class="category-inline"><label>Kontoname<input name="name" maxlength="100" required autofocus placeholder="z. B. Girokonto"/></label><label>Anzeigename (optional)<input name="display_name" maxlength="80" placeholder="Leer = Kontoname verwenden"/></label><label>Inhaber${this.masterPicker('new-account-owner','owner',storedOwners,storedOwners[0]||'','Kontoinhaber')}</label><label>Kontotyp${this.masterPicker('new-account-type','account_type',types,'Girokonto','Kontotyp')}</label><label>Bank / Institut<input name="bank" maxlength="100" placeholder="z. B. Sparkasse"/></label><label>Eröffnungsdatum<input name="opening_date" type="date" required value="${today}"/></label><label>Eröffnungsbestand (€)<input name="opening_eur" inputmode="decimal" required value="0.00"/></label><label>Maximal zulässige Kontodifferenz (€)<input name="tolerance_eur" type="number" min="0" max="1000000" step="0.01" required value="0.00"/></label><label class="check-label"><input type="checkbox" name="favorite"/> Favorit</label><div class="ft-harmonized-actions"><button type="submit" class="primary" ${storedOwners.length?'':'disabled'}>Konto anlegen</button><button type="button" id="cancel-new-account">Abbrechen</button></div>${storedOwners.length?'':'<small class="muted">Vor dem ersten Konto muss unter „Kontoinhaber“ mindestens ein Inhaber angelegt werden.</small>'}</form>`:'';
          body=`<section class="panel"><div class="top"><div><div class="eyebrow">Kontenverwaltung</div><div class="account-total">${this.money(sum(accounts))}</div></div><button type="button" id="toggle-new-account" aria-expanded="${this.newAccountExpanded}" ${storedOwners.length?'':'title="Zuerst Kontoinhaber anlegen"'}>${this.newAccountExpanded?'✕ Schließen':'＋ Konto anlegen'}</button></div><p class="muted account-note">Nach Inhaber, Bank und Kontoname sortiert. Konten können angelegt, bearbeitet und – solange keine Finanzdaten darauf verweisen – gelöscht werden.</p><div class="account-summary"><div><small>Konten</small><strong style="display:block;font-size:20px">${accounts.length}</strong></div><div><small>Kontoinhaber</small><strong style="display:block;font-size:20px">${storedOwners.length}</strong></div></div>${newForm}</section><div class="account-groups" style="display:block">${groups||'<section class="panel"><p class="muted">Noch keine Konten vorhanden.</p></section>'}</div>`;
        }
        if(this.tab==='categories'){
          const model=this.categoryAdmin||{groups:[],categories:[]};
          const groupOptions=(kind,chosen='')=>model.groups.filter(g=>g.kind===kind).map(g=>`<option value="${this.esc(g.id)}" ${g.id===chosen?'selected':''}>${this.esc(g.name)}</option>`).join('');
          const makeGroup=g=>{
            const children=model.categories.filter(c=>c.group_id===g.id).sort((a,b)=>a.sub_name.localeCompare(b.sub_name,'de'));
            const rows=children.map(c=>{
              const editor=this.editSubId===c.category_id?`<form class="category-inline" data-category-op="save_sub"><input type="hidden" name="category_id" value="${this.esc(c.category_id)}"/><label>Unterkategorie<input name="name" value="${this.esc(c.sub_name)}" required maxlength="100"/></label><label>Oberkategorie<select name="group_id" required>${groupOptions(c.kind,c.group_id)}</select></label><button class="primary">Speichern</button><button type="button" data-cancel-category>Abbrechen</button></form>`:'';
              return `<div class="cat-row"><span>${this.esc(c.sub_name)}</span><button type="button" data-edit-sub="${this.esc(c.category_id)}" class="cat-edit-mini ft-pencil" title="Unterkategorie bearbeiten" aria-label="${this.esc(c.sub_name)} bearbeiten">✎</button></div>${editor}`;
            }).join('')||'<p class="muted">Noch keine Unterkategorien</p>';
            const groupEditor=this.editGroupId===g.id?`<form class="category-inline" data-category-op="rename_group"><input type="hidden" name="group_id" value="${this.esc(g.id)}"/><label>Oberkategorie<input name="name" value="${this.esc(g.name)}" required maxlength="100"/></label><label>Typ<div class="account-picker"><select class="account-native" name="kind" id="category-edit-kind-${this.esc(g.id)}"><option value="expense" ${g.kind==='expense'?'selected':''}>Ausgabe</option><option value="saving_transfer" ${g.kind==='saving_transfer'?'selected':''}>Umbuchung</option><option value="income" ${g.kind==='income'?'selected':''}>Einnahme</option></select><button type="button" class="account-trigger" data-category-kind-picker="category-edit-kind-${this.esc(g.id)}" aria-haspopup="dialog"><span><strong id="category-edit-kind-${this.esc(g.id)}-title">${g.kind==='income'?'Einnahme':g.kind==='saving_transfer'?'Umbuchung':'Ausgabe'}</strong><small>Kategorietyp auswählen</small></span><span class="account-chevron">⌄</span></button></div></label><button class="primary">Speichern</button><button type="button" data-cancel-category>Abbrechen</button></form>`:'';
            const subEditor=this.newSubGroupId===g.id?`<form class="category-inline" data-category-op="add_sub"><input type="hidden" name="group_id" value="${this.esc(g.id)}"/><label>Neue Unterkategorie für ${this.esc(g.name)}<input name="name" maxlength="100" required autofocus/></label><div class="actions"><button class="primary">Unterkategorie anlegen</button><button type="button" data-cancel-new-sub>Abbrechen</button></div></form>`:'';
            return `<section class="category-owner"><div class="top"><div><span class="eyebrow">${g.kind==='income'?'Einnahmen':g.kind==='saving_transfer'?'Umbuchungen':'Ausgaben'}</span><h3>${this.esc(g.name)} <small class="muted">(${children.length})</small></h3></div><div class="owner-actions"><button type="button" data-edit-group="${this.esc(g.id)}" class="ft-pencil" aria-label="Oberkategorie bearbeiten">✎</button><button type="button" data-new-sub-group="${this.esc(g.id)}" aria-label="Unterkategorie zu ${this.esc(g.name)} anlegen">＋</button></div></div>${groupEditor}${subEditor}<div class="category-children">${rows}</div></section>`;
          };
          const groupRows=['expense','saving_transfer','income'].map(kind=>{const groups=model.groups.filter(g=>g.kind===kind).sort((a,b)=>a.name.localeCompare(b.name,'de'));return `<div class="category-kind-block"><h3 class="category-kind-title">${kind==='expense'?'Ausgaben':kind==='saving_transfer'?'Umbuchungen':'Einnahmen'} · ${groups.length} Oberkategorien</h3><div class="category-tree-list">${groups.map(makeGroup).join('')||'<p class="muted">Keine Oberkategorien</p>'}</div></div>`;}).join('');
          body=`<section class="panel category-tree"><div class="top"><h2>Kategorien</h2><button type="button" id="toggle-new-group" aria-expanded="${this.newGroupExpanded}">${this.newGroupExpanded?'✕ Schließen':'＋ Oberkategorie anlegen'}</button></div>${this.newGroupExpanded?`<form class="category-inline" data-category-op="add_group"><label>Name<input name="name" maxlength="100" required/></label><label>Typ<div class="account-picker"><select class="account-native" name="kind" id="category-new-kind"><option value="expense">Ausgabe</option><option value="saving_transfer">Umbuchung</option><option value="income">Einnahme</option></select><button type="button" class="account-trigger" data-category-kind-picker="category-new-kind" aria-haspopup="dialog"><span><strong id="category-new-kind-title">Ausgabe</strong><small>Kategorietyp auswählen</small></span><span class="account-chevron">⌄</span></button></div></label><button class="primary">Oberkategorie anlegen</button></form>`:''}${groupRows}</section>`;
        }
        if(this.tab==='proposals'){
          const proposals=this.proposals?.released?this.proposals.proposals:[];
          const selected=proposals.find(x=>x.source_name===this.proposalEdit?.name&&x.kind===this.proposalEdit?.kind);
          this.proposalStatusOpen??=new Set();
          const proposalMarkup=x=>{
            const plan=Math.abs(Number(x.planned_cents||0)),actual=Math.max(0,Number(x.actual_cents||0)),remaining=Math.max(0,Number(x.remaining_cents??(plan-actual)));
            const signed=value=>(x.kind==='expense'?-1:1)*Math.abs(Number(value||0));
            const pencil=x.status==='confirmed'||x.status==='skipped'?`<button type="button" data-proposal-afterwork="${this.esc(x.source_name)}" data-proposal-kind="${x.kind}" class="booking-pencil ft-pencil proposal-pencil" title="${x.status==='confirmed'?'Gebuchte Position nacharbeiten':'Entfallene Position nacharbeiten'}" aria-label="${x.status==='confirmed'?'Gebuchte Position nacharbeiten':'Entfallene Position nacharbeiten'}">✎</button>`:'';
            const primaryAmount=x.status==='open'?remaining:x.status==='confirmed'?actual:plan;
            const primaryLabel=x.status==='open'?'Offen':x.status==='confirmed'?'Gebucht':'Plan';
            const secondary=x.status==='open'?(actual>0?`Plan ${this.money(signed(plan))} · bereits gebucht ${this.money(signed(actual))}`:`Planbetrag ${this.money(signed(plan))}`):x.status==='confirmed'?`Plan ${this.money(signed(plan))}${actual>plan?' · '+this.money(signed(actual-plan))+' über Plan':' · vollständig zugeordnet'}`:`Planbetrag ${this.money(signed(plan))}`;
            const proposalForm=this.proposalEdit?.name===x.source_name&&this.proposalEdit?.kind===x.kind&&x.status==='open'?`<section class="panel" id="proposal-form"><h2>Zahlung bestätigen</h2><p>${this.esc(selected.source_name)} · Plan: ${this.money(selected.planned_cents)} · bereits gebucht: ${this.money((selected.kind==='expense'?-1:1)*Math.abs(Number(selected.actual_cents||0)))} · offen: ${this.money((selected.kind==='expense'?-1:1)*Math.abs(Number(selected.remaining_cents??Math.abs(selected.planned_cents||0))))}</p><form id="confirm-proposal"><label>Tatsächliches Buchungsdatum<input type="date" name="booked" value="${this.esc(today.startsWith(d.month)?today:d.month+'-01')}" min="${this.esc(d.month)}-01" max="${this.esc(d.month)}-31" required/></label><label>Abbuchungs- / Eingangskonto${this.accountPicker("proposal-account",accounts,selected.account_id||"")}</label><label>Tatsächlicher Betrag (€)<input name="amount_eur" value="${(Math.abs(Number(selected.remaining_cents??selected.planned_cents??0))/100).toFixed(2).replace('.',',')}" inputmode="decimal" required/></label><label>Beschreibung<input name="description" maxlength="240" value="${this.esc(selected.source_name)}" required/></label><label>Buchungsart<select name="booking_kind" id="proposal-kind"><option value="expense" ${selected.kind==='expense'?'selected':''}>Ausgabe</option><option value="income" ${selected.kind==='income'?'selected':''}>Einnahme</option></select></label><label>Kategorie${this.categoryPicker(categories.filter(c=>c.kind===selected.kind),selected.category_id||'','proposal-category')}</label><button type="submit" class="primary">✓ Als Ist-Buchung übernehmen</button><button type="button" id="cancel-proposal">Abbrechen</button></form></section>`:'';
            const openActions=x.status==='open'?`<div class="actions" style="justify-content:flex-start"><button data-proposal-edit="${this.esc(x.source_name)}" data-proposal-kind="${x.kind}" class="primary">✓ Prüfen & bestätigen</button>${actual===0?`<button data-proposal-skip="${this.esc(x.source_name)}" data-proposal-kind="${x.kind}">Entfällt</button>`:''}</div>`:'';
            return `<div class="panel proposal-item"><div class="proposal-line"><div class="proposal-name"><strong>${this.esc(x.source_name)}</strong></div><div class="proposal-tail"><span class="proposal-values"><strong class="proposal-amount ${x.kind==='income'?'positive':'negative'}">${primaryLabel}: ${this.money(signed(primaryAmount))}</strong><small class="muted">${secondary}</small></span>${pencil}</div></div>${proposalForm}${openActions}</div>`;
          };
          const statusGroups=[['open','Offen'],['confirmed','Gebucht'],['skipped','Entfallen']];
          const grouped=statusGroups.map(([status,label])=>{
            const kindOrder={expense:0,saving_transfer:1,transfer:1,income:2};
            const items=proposals.filter(x=>x.status===status).sort((a,b)=>(kindOrder[a.kind]??9)-(kindOrder[b.kind]??9)||String(a.source_name||'').localeCompare(String(b.source_name||''),'de',{sensitivity:'base'})),expanded=this.proposalStatusOpen.has(status);
            return `<section class="proposal-status-group"><button type="button" class="proposal-status-toggle" data-proposal-status="${status}" aria-expanded="${expanded}"><span><strong>${label}</strong><small>${items.length} ${items.length===1?'Position':'Positionen'}</small></span><span class="proposal-status-symbol">${expanded?'−':'+'}</span></button><div class="proposal-status-list" ${expanded?'':'hidden'}>${items.map(proposalMarkup).join('')||'<p class="muted proposal-empty">Keine Positionen in diesem Status.</p>'}</div></section>`;
          }).join('');
          const afterworkProposal=this.proposalAfterwork?proposals.find(x=>x.source_name===this.proposalAfterwork.name&&x.kind===this.proposalAfterwork.kind):null;
          const afterworkLinks=afterworkProposal?.linked_transactions||[];
          const afterworkTx=afterworkProposal?.status==='confirmed'?(this.proposalAfterwork?.transaction||null):null;
          const afterworkEditable=afterworkTx?editable(afterworkTx):false;
          const linkedChoiceMarkup=afterworkLinks.length?`<div class="proposal-linked-list">${afterworkLinks.map(link=>`<div class="proposal-linked-row"><span><strong>${this.esc(link.description||'Buchung')}</strong><small>${this.esc(link.booked||'')} · dieser Planposition zugeordnet ${this.money((afterworkProposal.kind==='expense'?-1:1)*Math.abs(Number(link.linked_cents||0)))}</small></span><button type="button" class="ft-pencil" data-proposal-afterwork-transaction="${this.esc(link.transaction_id)}" title="Buchung bearbeiten" aria-label="Buchung bearbeiten">✎</button></div>`).join('')}</div>`:'';
          const afterworkModal=afterworkProposal?`<div class="proposal-afterwork-modal" role="dialog" aria-modal="true" aria-label="${afterworkProposal.status==='confirmed'?'Gebuchte Position nacharbeiten':'Entfallene Position nacharbeiten'}"><div class="proposal-afterwork-backdrop" data-proposal-afterwork-close></div><section class="proposal-afterwork-dialog"><div class="top"><div><div class="eyebrow">Vorschläge aus Planung</div><h2>${afterworkProposal.status==='confirmed'?'Gebuchte Position nacharbeiten':'Entfallene Position nacharbeiten'}</h2></div><button type="button" data-proposal-afterwork-close aria-label="Schließen">✕</button></div><div class="afterwork-note"><strong>${this.esc(afterworkProposal.source_name)}</strong><br><small>Plan ${this.money(afterworkProposal.planned_cents)} · zugeordnet ${this.money((afterworkProposal.kind==='expense'?-1:1)*Math.abs(Number(afterworkProposal.actual_cents||0)))}</small></div>${afterworkProposal.status==='confirmed'?(afterworkTx?(afterworkEditable?`<form data-op="edit_transaction" id="proposal-afterwork-form"><input type="hidden" name="id" value="${this.esc(afterworkTx.id)}"/><label>Art<select id="proposal-afterwork-kind" name="kind"><option value="expense" ${afterworkTx.kind==='expense'?'selected':''}>Ausgabe</option><option value="income" ${afterworkTx.kind==='income'?'selected':''}>Einnahme</option></select></label><label>Datum<input name="booked" type="date" value="${this.esc(afterworkTx.booked)}" required/></label><label>Konto${this.accountPicker('proposal-afterwork-account',accounts,afterworkTx.account_id)}</label><label>Betrag (€)<input name="amount_eur" value="${this.esc(afterworkTx.amount_expression||(Math.abs(afterworkTx.amount_cents)/100).toFixed(2).replace('.',','))}" required type="text" inputmode="text" autocomplete="off"/></label><label>Beschreibung<input name="description" value="${this.esc(afterworkTx.description)}" maxlength="240" required/></label><label>Kategorie${this.categoryPicker(categories.filter(c=>c.kind===afterworkTx.kind),afterworkTx.category_id,'proposal-afterwork-category')}</label><label>Änderungsgrund<input name="reason" required maxlength="240" placeholder="Warum wird die Buchung korrigiert?"/></label><div class="actions"><button type="submit" class="primary">Änderung speichern</button>${afterworkLinks.length>1?'<button type="button" data-proposal-afterwork-back>Andere Buchung wählen</button>':''}<button type="button" data-proposal-afterwork-close>Abbrechen</button></div></form>`:`<p class="muted">Die ausgewählte Ist-Buchung ist durch einen Monatsabschluss gesperrt und kann hier nicht verändert werden.</p><div class="actions">${afterworkLinks.length>1?'<button type="button" data-proposal-afterwork-back>Andere Buchung wählen</button>':''}<button type="button" data-proposal-afterwork-close>Schließen</button></div>`):`${afterworkLinks.length>1?'<p>Mehrere Ist-Buchungen sind mit dieser Planposition verknüpft. Bitte die zu bearbeitende Buchung auswählen.</p>':afterworkLinks.length===1?'<p>Die zugeordnete Ist-Buchung auswählen und nacharbeiten.</p>':'<p class="muted">Keine aktive Ist-Buchung konnte zu dieser Planposition aufgelöst werden.</p>'}${linkedChoiceMarkup}<div class="actions"><button type="button" data-proposal-afterwork-close>Schließen</button></div>`):`<p>Für eine entfallene Position existiert keine Ist-Buchung. Die Nacharbeit setzt ausschließlich die Entscheidung zurück; anschließend kann die Position erneut geprüft und gebucht werden.</p><div class="actions"><button type="button" class="primary" data-proposal-reopen>Zurück auf offen</button><button type="button" data-proposal-afterwork-close>Schließen</button></div>`}</section></div>`:'';
          body=`<section class="panel proposal-workspace"><h2>Buchungsvorschläge · ${this.esc(d.month)}</h2><p>${this.proposals?.released?'Planpositionen werden mit ausdrücklich zugeordneten Ist-Buchungen abgeglichen. Bereits gebuchte Beträge werden angerechnet; nur der verbleibende Rest wird noch als offen angeboten.':'Für diesen Monat ist kein freigegebener Plan vorhanden. Erst nach Freigabe erscheinen Buchungsvorschläge.'}</p>${this.proposals?.released?grouped:'<p class="muted">Keine Vorschläge verfügbar.</p>'}</section>${afterworkModal}`;

        }
        if(this.tab==='changes'){
          const events=(this.audit?.events||[]).slice().sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
          this.changeGroupsOpen??=new Set();
          const groupOrder=['account','amount','category','plan_position','date','description','kind','void'];
          const groupLabels={account:'Konto',amount:'Wert',category:'Kategorie',plan_position:'Planentwurfsposition',date:'Datum',description:'Beschreibung',kind:'Buchungsart',void:'Storno'};
          const dateTimeLabel=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};
          const valueText=(event,value)=>{if(value===null||value===undefined||value==='')return '—';if(event.change_type==='amount'){const cents=Number(value);return Number.isFinite(cents)?this.money(cents):String(value);}if(event.change_type==='date'){const d=new Date(String(value)+'T00:00:00');return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('de-DE');}return String(value);};
          const eventMarkup=event=>{const before=valueText(event,event.before_text),after=valueText(event,event.after_text);const reason=event.reason?`<div class="change-reason">Grund: ${this.esc(event.reason)}</div>`:'';const bookingDate=event.booked?`<span>Buchungsdatum ${this.esc(new Date(event.booked+'T00:00:00').toLocaleDateString('de-DE'))}</span>`:'';return `<article class="change-card"><div class="change-main"><div class="change-subject">${this.esc(event.subject||'Buchung')}</div><div class="change-diff"><span>${this.esc(before)}</span><strong>→</strong><span>${this.esc(after)}</span></div>${reason}</div><div class="change-meta"><small>${this.esc(dateTimeLabel(event.at))}</small>${bookingDate}</div></article>`;};
          const grouped=groupOrder.map(type=>({type,label:groupLabels[type],events:events.filter(e=>e.change_type===type)})).filter(g=>g.events.length);
          const other=events.filter(e=>!groupOrder.includes(e.change_type));if(other.length)grouped.push({type:'other',label:'Weitere Änderungen',events:other});
          const feed=grouped.map(group=>{const open=this.changeGroupsOpen.has(group.type);return `<section class="change-type-group"><button type="button" class="change-type-toggle" data-change-group="${this.esc(group.type)}" aria-expanded="${open}"><span><strong>${this.esc(group.label)}</strong><small>${group.events.length} ${group.events.length===1?'Änderung':'Änderungen'}</small></span><span class="change-type-symbol">${open?'−':'+'}</span></button><div class="change-type-list" ${open?'':'hidden'}>${group.events.map(eventMarkup).join('')}</div></section>`;}).join('');
          body=`<section class="panel change-workspace"><div><h2>Buchungsänderungen · ${this.esc(this.label(this.month))}</h2><p class="change-intro">Nur nachträgliche Änderungen an bestehenden Buchungen. Neuanlagen werden nicht aufgeführt. Die Gruppen sind nach Änderungsinhalt gegliedert und innerhalb jeder Gruppe nach Änderungszeitpunkt sortiert.</p></div>${events.length?feed:'<div class="change-empty">Für diesen Monat sind keine nachträglichen Buchungsänderungen protokolliert.</div>'}${this.audit?.truncated?'<p class="muted">Es werden maximal 500 Änderungen angezeigt.</p>':''}</section>`;
        }
        if(this.tab==='overview'||this.tab==='by_account'){
          const ordered=this.rankAccounts(accounts), preferred=ordered.find(a=>a.id===this.preference('account')&&this.paymentAccount(a))||ordered.find(a=>this.isFavorite(a)&&this.paymentAccount(a))||ordered.find(a=>this.paymentAccount(a));
          const source=preferred?.id||'';
          const accountOptions=this.accountChoices(accounts,source);
          const targetOptions=this.accountChoices(accounts,ordered.find(a=>a.id!==source&&this.paymentAccount(a))?.id||'');
          body=`<section class="panel quick-panel"><div class="top"><div><h2 style="margin:3px 0">Buchungen</h2></div><button type="button" class="primary ft22-main-create" id="toggle-quick" aria-haspopup="dialog" aria-expanded="${this.quickExpanded}">＋ Neue Buchung</button></div>${this.quickExpanded?`<div class="quick-create ${this.quickModal?'ft22-quick-modal':''}">${this.quickModal?'<button type="button" class="ft22-quick-backdrop" data-ft22-close-quick aria-label="Buchungserfassung schließen"></button>':''}<div class="top"><h2>Neue Buchung</h2></div>
          <div class="quick-tabs"><button type="button" data-quick-kind="expense" class="active">− Ausgabe</button><button type="button" data-quick-kind="income">+ Einnahme</button><button type="button" data-quick-kind="transfer">⇄ Umbuchung</button></div>
          <form id="quick-book" autocomplete="off"><input type="hidden" name="kind" id="quick-kind" value="expense"/>
          <label>Betrag (€)<input name="amount_eur" id="quick-amount" class="quick-amount" type="text" inputmode="text" autocomplete="off" placeholder="z. B. 120/3+5" required/><small id="quick-amount-result" aria-live="polite">Rechnung eingeben – Ergebnis wird als Betrag gebucht</small></label>
          <label>Beschreibung<input name="description" id="quick-description" maxlength="240" placeholder="z. B. REWE, Drogerie, Tankstelle" required/></label>
          <div class="quick-grid"><div class="account-field" id="quick-from-label"><span class="account-field-label">Zahlungskonto</span>${this.accountPicker("quick-account",accounts,source)}</div>
          <div class="account-field" id="quick-category-label"><span class="account-field-label">Kategorie</span>${this.categoryPicker(categories.filter(c=>c.kind==='expense'))}</div>
          <div class="account-field" id="quick-to-label" hidden><span class="account-field-label">Zielkonto</span>${this.accountPicker("quick-target",accounts,ordered.find(a=>a.id!==source&&this.paymentAccount(a))?.id||"")}</div>
          </div><details class="ft-quick-advanced"><summary>Weitere Angaben · Buchungsdatum & Vorlage</summary><label>Datum<input name="booked" id="quick-date" type="date" value="${defaultBookingDate(this.month)}" required/></label>
          </details><div id="quick-plan-box" class="quick-plan-box"><label>Planposition (Plan-Ist-Abgleich)<div class="account-picker"><select class="account-native" id="quick-plan-position" name="plan_position_id"><option value="">Ohne Planbezug buchen</option></select><button type="button" class="account-trigger" data-plan-open="quick-plan-position" aria-haspopup="dialog"><span><strong id="quick-plan-title">Ohne Planbezug buchen</strong><small id="quick-plan-subtitle">Planposition auswählen</small></span><span class="account-chevron">⌄</span></button></div></label><small id="quick-plan-hint">Passende Positionen des Buchungsmonats werden vorgeschlagen. Die Zuordnung erfolgt beim Speichern.</small></div>
          <p class="muted account-note">Letztes Zahlungskonto, danach Favorit, wird vorausgewählt. Bekannte Beschreibungen schlagen die Kategorie vor. Konten sind nach Inhaber und Typ sortiert; Favoriten stehen oben.</p>
          <details class="ft-quick-advanced"><summary>Als Monatsvorlage speichern (optional)</summary><label style="display:flex;align-items:center;gap:9px"><input type="checkbox" id="quick-as-template" style="width:auto">Als Planungsvorlage für ausgewählte Monate speichern</label><div id="quick-template-months" hidden><p class="muted">Jährlich wiederkehrende Kalendermonate (Januar–Dezember). Keine automatische Ist-Buchung.</p><style>.quick-month-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.quick-month-chip{display:flex;align-items:center;gap:7px;min-width:0;padding:9px 8px;border:1px solid #344657;border-radius:9px;cursor:pointer}.quick-month-chip input{width:16px;height:16px;flex-shrink:0;margin:0}.quick-month-chip span{font-size:12px;white-space:normal}@media(max-width:420px){.quick-month-grid{gap:5px}.quick-month-chip{padding:7px 4px;gap:4px}}</style><div class="quick-month-grid">${Array.from({length:12},(_,i)=>{const m=String(i+1).padStart(2,'0');return `<label class="quick-month-chip"><input type="checkbox" name="template_month" value="${m}"><span>${new Date(2024,i,1).toLocaleDateString('de-DE',{month:'short'})}</span></label>`;}).join('')}</div></div></details><div class="ft22-quick-footer"><button type="submit" class="primary" id="quick-save" ${accounts.length?'':'disabled'}>✓ Ausgabe buchen</button><button type="button" class="ft22-quick-close" data-ft22-close-quick>✕ Schließen</button></div></form></div>`:''}`;
        }
        if(this.tab==='overview'||this.tab==='by_account'){
          this.expandedBookingGroups??=new Set();
          const bookingGroup=t=>{if(this.tab==='by_account'){const id=t.from_id||t.account_id;const a=accounts.find(x=>x.id===id);return (a?this.owner(a):'Unbekannt')+' / '+(a?this.accountLabel(a):(t.account_name||id));}const type=t.kind==='transfer'?'Umbuchungen':t.kind==='income'?'Einnahmen':'Ausgaben';const category=t.kind==='transfer'?'Konten':(t.category_name||'Ohne Kategorie').split(' · ')[0].trim();return type+' / '+category;};
          const bookingKindRank=k=>this.tab==='by_account'?0:k.startsWith('Ausgaben /')?0:k.startsWith('Umbuchungen /')?1:2;
          const arrangedTransactions=[...(d.transactions||[])].filter(t=>this.tab!=='by_account'||!this.focusAccountId||[t.account_id,t.from_id,t.to_id].includes(this.focusAccountId)).sort((a,b)=>{const aa=bookingGroup(a),bb=bookingGroup(b);return bookingKindRank(aa)-bookingKindRank(bb)||aa.localeCompare(bb,'de')||b.booked.localeCompare(a.booked);});
          let previousBookingGroup='';
          const rows=arrangedTransactions.map(t=>{
            const bookingGroupKey=bookingGroup(t),groupStart=bookingGroupKey!==previousBookingGroup;previousBookingGroup=bookingGroupKey;
            const groupExpanded=this.expandedBookingGroups.has(bookingGroupKey);
            const groupHead=groupStart?`<tr class="booking-category-header"><td colspan="4"><button type="button" class="ft-list-group-toggle" data-booking-group="${this.esc(bookingGroupKey)}" aria-expanded="${groupExpanded}"><span>${this.esc(bookingGroupKey)}</span><span class="ft-list-group-symbol">${groupExpanded?'−':'+'}</span></button></td></tr>`:'';

            const transfer=t.kind==='transfer';
            const amt=transfer?Math.abs(t.amount_cents):t.amount_cents;
            const day=this.esc(t.booked.slice(8,10)+'.'+t.booked.slice(5,7)+'.');
            const categoryLabel=transfer?'Umbuchung':this.esc(t.category_name||'Ohne Kategorie');
            const actions=editable(t)?`<div class="actions"><button type="button" data-edit="${this.esc(t.id)}" class="booking-pencil ft-pencil" title="Buchung bearbeiten" aria-label="${transfer?'Umbuchung':'Buchung'} bearbeiten">✎</button><button type="button" data-void="${this.esc(t.id)}">Stornieren</button></div>`:'<small>Gesperrt</small>';
            const cell=`<td colspan="4" class="account-booking-card-cell"><div class="account-booking-card"><div class="account-booking-main"><div class="account-booking-title">${this.esc(t.description)}</div><strong class="account-booking-value ${transfer?'':t.amount_cents>=0?'positive':'negative'}">${this.money(amt)}</strong><div class="account-booking-category">${categoryLabel}</div><div class="account-booking-date">${day}</div></div><div class="account-booking-actions">${actions}</div></div></td>`;
            const edit=transfer?`<tr class="booking-editor-row"><td colspan="4" class="inline-editor-cell"><section class="panel"><h2>Umbuchung bearbeiten</h2><p>Ursprungs- und Zielkonto werden gemeinsam geändert. Beide Kontobewegungen bleiben erhalten.</p><form data-op="edit_transfer"><input type="hidden" name="id" value="${this.esc(t.id)}"/><label>Datum<input name="booked" type="date" value="${this.esc(t.booked)}" required/></label><label>Ursprungskonto${this.accountPicker('transfer-edit-from',accounts,t.from_id||t.account_id)}</label><label>Zielkonto${this.accountPicker('transfer-edit-to',accounts,t.to_id||'')}</label><label>Betrag (€)<input name="amount_eur" value="${(Math.abs(t.amount_cents)/100).toFixed(2).replace('.',',')}" inputmode="decimal" required/></label><label>Beschreibung<input name="description" value="${this.esc(t.description)}" maxlength="240" required/></label><label>Änderungsgrund<input name="reason" required maxlength="240" placeholder="Warum wird die Umbuchung korrigiert?"/></label><div class="actions"><button type="submit" class="primary">Änderung speichern</button><button type="button" id="cancel-edit">Abbrechen</button></div></form></section></td></tr>`:
            `<tr class="booking-editor-row"><td colspan="4" class="inline-editor-cell"><section class="panel"><h2>Buchung korrigieren</h2><p>Änderungen werden mit Begründung im Prüfprotokoll gespeichert.</p><form data-op="edit_transaction"><input type="hidden" name="id" value="${this.esc(t.id)}"/><label>Art<select id="edit-kind" name="kind"><option value="expense" ${t.kind==='expense'?'selected':''}>Ausgabe</option><option value="income" ${t.kind==='income'?'selected':''}>Einnahme</option></select></label><label>Datum<input name="booked" type="date" value="${this.esc(t.booked)}" required/></label><label>Konto${this.accountPicker('edit-account',accounts,t.account_id)}</label><label>Betrag (€)<input name="amount_eur" value="${this.esc(t.amount_expression||(Math.abs(t.amount_cents)/100).toFixed(2).replace('.',','))}" required type="text" inputmode="text" autocomplete="off"/></label><label>Beschreibung<input name="description" value="${this.esc(t.description)}" maxlength="240" required/></label><label>Kategorie${this.categoryPicker(categories.filter(c=>c.kind===t.kind),t.category_id,'edit-category')}</label><label>Änderungsgrund<input name="reason" required maxlength="240" placeholder="Warum wird die Buchung korrigiert?"/></label><div class="actions"><button type="submit" class="primary">Änderung speichern</button><button type="button" id="cancel-edit">Abbrechen</button></div></form></section></td></tr>`;
            return `${groupHead}<tr class="account-booking-row ft-booking-group-item" data-booking-group-item="${this.esc(bookingGroupKey)}" data-transaction-id="${this.esc(t.id)}" ${groupExpanded?'':'hidden'}>${cell}</tr>${this.editId===t.id&&editable(t)?edit.replace('class="booking-editor-row"',`class="booking-editor-row ft-booking-group-item" data-booking-group-item="${this.esc(bookingGroupKey)}" ${groupExpanded?'':'hidden'}`):''}`;
          }).join('')||'<tr><td colspan="4">Noch keine Buchungen.</td></tr>';
          if(this.tab==='overview'){
            body+=this.renderPlanWorkspace();
          }else{
          body+=`<div class="booking-list account-booking-list"><div class="scroll"><table><tbody>${rows}</tbody></table></div>${d.transactions_truncated?'<p>Es werden maximal 500 Buchungen angezeigt.</p>':''}</div>`;

          }
        }
      }
      const previousTabScroll=this._tabScrollLeft??this.shadowRoot.querySelector('.tabs')?.scrollLeft??0;
      if(this.context!=='master'&&!(this.availablePlanMonths||[]).includes(this.month)){body='<section class="panel" role="status"><strong>Keine freigegebene Monatsplanung</strong><p>Für '+this.esc(this.label(this.month))+' wurde noch kein Plan freigegeben. Buchungsansichten und Planungsvorschläge bleiben für diesen Monat leer.</p></section>'; }
      if(this.context!=='master'&&!(this.availablePlanMonths||[]).includes(this.month))body='<section class="panel" role="status"><h2>Keine freigegebene Monatsplanung</h2><p>Für den ausgewählten Monat liegt keine freigegebene Planung vor. Es werden keine Buchungsinhalte eines anderen Monats angezeigt.</p></section>';
      this.shadowRoot.innerHTML=style+stage22Style+`<main class="wrap"><div class="sticky-header-group"><header class="top finance-head ft-page-head"><button type="button" class="ha-sidebar-toggle" data-ha-sidebar title="Home-Assistant-Seitenleiste öffnen" aria-label="Home-Assistant-Seitenleiste einblenden">☰</button><div class="ft22-header-identity">${this.context==='master'?`<div class="title">Stammdaten</div>`:`<div class="eyebrow">HA2.0 / Monatsübersicht</div><div class="title">Monatsübersicht</div><div class="sub">Buchungen, Konten und Planungsvorschläge</div>`}</div>${this.context==='master'?'':`<button type="button" id="header-booking-search" class="ft-header-search" aria-label="Buchungssuche" title="Buchungssuche"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg></button><div class="month-controls"><button type="button" id="prev-month" aria-label="Vorheriger Monat">‹</button>${this.monthPickerMarkup()}<select id="month" aria-label="Monat auswählen">${this.monthChoices().slice().sort((a,b)=>b.localeCompare(a)).map(m=>`<option value="${this.esc(m)}" ${m===this.month?'selected':''}>${this.esc(this.label(m))}</option>`).join('')}</select><button type="button" id="next-month" aria-label="Nächster Monat">›</button><button type="button" id="refresh-month" aria-label="Aktualisieren">↻</button></div>`}</header></div>${this.message?`<div class="notice">${this.esc(this.message)}</div>`:''}${d?body:'<section class="panel">Daten werden geladen …</section>'}<div id="account-modal" class="account-modal" hidden></div></main>`;
      if(this.shadowRoot.querySelector('.tabs')){const nav=this.shadowRoot.querySelector('.tabs');nav.scrollLeft=previousTabScroll;nav.addEventListener('scroll',()=>{this._tabScrollLeft=nav.scrollLeft;},{passive:true});}
      this.shadowRoot.querySelectorAll('[data-proposal-edit]').forEach(b=>b.addEventListener('click',()=>{this.proposalEdit={name:b.dataset.proposalEdit,kind:b.dataset.proposalKind};this.render();const form=this.shadowRoot.getElementById('proposal-form');if(!form){this.message='Bestätigungsformular konnte nicht geöffnet werden';this.render();return;}form.scrollIntoView({behavior:'smooth',block:'center'});}));
      this.shadowRoot.getElementById('edit-kind')?.addEventListener('change',e=>{const select=this.shadowRoot.getElementById('edit-category');if(!select)return;const eligible=categories.filter(c=>c.kind===e.target.value).sort((a,b)=>a.name.localeCompare(b.name,'de'));select.innerHTML='<option value="">Ohne Kategorie</option>'+this.options(eligible);const title=this.shadowRoot.getElementById('edit-category-title');if(title)title.textContent='Kategorie wählen';});
      this.shadowRoot.getElementById('proposal-afterwork-kind')?.addEventListener('change',e=>{const select=this.shadowRoot.getElementById('proposal-afterwork-category');if(!select)return;const eligible=categories.filter(c=>c.kind===e.target.value).sort((a,b)=>a.name.localeCompare(b.name,'de'));select.innerHTML='<option value="">Ohne Kategorie</option>'+this.options(eligible);const title=this.shadowRoot.getElementById('proposal-afterwork-category-title');if(title)title.textContent='Kategorie wählen';});
      this.shadowRoot.getElementById('proposal-kind')?.addEventListener('change',e=>{const select=this.shadowRoot.getElementById('proposal-category');if(!select)return;const eligible=categories.filter(c=>c.kind===e.target.value).sort((a,b)=>a.name.localeCompare(b.name,'de'));select.innerHTML='<option value="">Ohne Kategorie</option>'+this.options(eligible);const label=this.shadowRoot.getElementById('proposal-category-title');if(label)label.textContent='Kategorie wählen';});
      this.shadowRoot.getElementById('cancel-proposal')?.addEventListener('click',()=>{this.proposalEdit=null;this.render();});
      this.shadowRoot.querySelectorAll('[data-proposal-afterwork]').forEach(b=>b.addEventListener('click',async()=>{
        const proposal=this.proposals?.proposals?.find(x=>x.source_name===b.dataset.proposalAfterwork&&x.kind===b.dataset.proposalKind);if(!proposal)return;
        let transaction=null;
        const links=proposal.linked_transactions||[];
        const singleId=links.length===1?links[0].transaction_id:(links.length===0?proposal.transaction_id:null);
        if(proposal.status==='confirmed'&&singleId){
          transaction=(d.transactions||[]).find(t=>String(t.id)===String(singleId))||null;
          if(!transaction){try{transaction=(await this.api('transaction_detail',{id:singleId}))?.transaction||null;}catch(error){console.warn('Finance Tracker: gebuchte Vorschlagsposition nicht mehr auflösbar',error);}}
        }
        this.proposalAfterwork={name:proposal.source_name,kind:proposal.kind,transaction};this.render();
        requestAnimationFrame(()=>this.shadowRoot.querySelector('.proposal-afterwork-dialog input:not([type=hidden]),.proposal-afterwork-dialog button')?.focus({preventScroll:true}));
      }));
      this.shadowRoot.querySelectorAll('[data-proposal-afterwork-transaction]').forEach(b=>b.addEventListener('click',async()=>{
        try{const transaction=(await this.api('transaction_detail',{id:b.dataset.proposalAfterworkTransaction}))?.transaction||null;if(!transaction)throw Error('Buchung nicht gefunden');this.proposalAfterwork={...this.proposalAfterwork,transaction};this.render();requestAnimationFrame(()=>this.shadowRoot.querySelector('.proposal-afterwork-dialog input:not([type=hidden])')?.focus({preventScroll:true}));}
        catch(error){this.message='Buchung konnte nicht zur Nacharbeit geöffnet werden: '+(error.message||String(error));this.render();}
      }));
      this.shadowRoot.querySelectorAll('[data-proposal-afterwork-back]').forEach(b=>b.addEventListener('click',()=>{if(this.proposalAfterwork){this.proposalAfterwork={...this.proposalAfterwork,transaction:null};this.render();}}));
      this.shadowRoot.querySelectorAll('[data-proposal-afterwork-close]').forEach(b=>b.addEventListener('click',()=>{this.proposalAfterwork=null;this.render();}));
      this.shadowRoot.querySelector('[data-proposal-reopen]')?.addEventListener('click',async e=>{
        const proposal=this.proposals?.proposals?.find(x=>x.source_name===this.proposalAfterwork?.name&&x.kind===this.proposalAfterwork?.kind);if(!proposal)return;
        e.currentTarget.disabled=true;
        try{await this._hass.callWS({type:'finance_tracker/proposals',op:'decide',data:{action:'reopen',month:this.month,source_name:proposal.source_name,kind:proposal.kind}});this.proposalAfterwork=null;await this.refresh();this.proposalStatusOpen.add('open');this.proposalEdit={name:proposal.source_name,kind:proposal.kind};this.message='Entfallene Position wieder geöffnet';this.render();}
        catch(error){this.message=error.message||String(error);this.render();}
      });
      this.shadowRoot.querySelectorAll('[data-proposal-skip]').forEach(b=>b.addEventListener('click',async()=>{if(!await window.FTDialog.confirm('Vorschläge aus Planung','Diesen Zahlungsvorschlag als entfallen markieren?',{confirmText:'Entfällt'}))return;try{await this._hass.callWS({type:'finance_tracker/proposals',op:'decide',data:{action:'skip',month:this.month,source_name:b.dataset.proposalSkip,kind:b.dataset.proposalKind}});this.message='Vorschlag als entfallen markiert';this.proposalEdit=null;await this.refresh();}catch(e){this.message=e.message||String(e);this.render();}}));
      this.shadowRoot.getElementById('confirm-proposal')?.addEventListener('submit',async e=>{
        e.preventDefault();
        const form=e.currentTarget;
        const f=Object.fromEntries(new FormData(form));
        let amount;
        try{amount=Math.abs(this.cents(f.amount_eur));if(amount<=0)throw Error('Betrag muss größer als null sein');if(!f.account_id)throw Error('Bitte ein Konto wählen');if(!f.description?.trim())throw Error('Beschreibung fehlt');}
        catch(err){this.message=err.message||String(err);this.render();return;}
        const source=this.proposals?.proposals?.find(x=>x.source_name===this.proposalEdit?.name&&x.kind===this.proposalEdit?.kind);
        const sourcePosition=source?.position_id||null;
        const canPropagate=Boolean(sourcePosition&&f.booking_kind===this.proposalEdit.kind);
        const proposal=this.proposalEdit;
        const modal=this.shadowRoot.getElementById('account-modal');
        if(!modal)return;
        let future=[];if(canPropagate){try{const planning=await this._hass.callWS({type:'finance_tracker/planning_v3'});future=(planning.periods||[]).filter(p=>p.status==='draft'&&p.period>this.month).map(p=>p.period).sort((a,b)=>a.localeCompare(b));}catch(_){future=[];}}
        let hasTemplate=false;
        if(canPropagate){try{const data=await this._hass.callWS({type:'finance_tracker/templates',op:'list',data:{}});const templates=data.templates||[];hasTemplate=templates.some(t=>t.position_id===sourcePosition||('tpl:'+t.id)===sourcePosition||t.id===sourcePosition);}catch(_){hasTemplate=false;}}
        modal.classList.add('propagation-dialog');
        modal.innerHTML=`<div class="account-modal-backdrop" data-propagate-cancel></div><div class="account-dialog" role="dialog" aria-modal="true" aria-label="Buchung bestätigen und fortschreiben"><div class="account-dialog-head"><strong>Buchung bestätigen</strong><button type="button" data-propagate-cancel aria-label="Schließen">✕</button></div><div class="propagation-body"><p>Diese Ist-Buchung jetzt speichern?</p><section class="propagation-options"><strong>${this.esc(f.description)} · ${this.money((f.booking_kind==='expense'?-1:1)*amount)}</strong><small>Die Buchung wird unabhängig von der Fortschreibung gespeichert.</small>${canPropagate?`<label><input type="checkbox" id="propagate-future" ${future.length?'':'disabled'}> Auch in zukünftige Planentwürfe übernehmen</label><div id="propagate-month-box" hidden><div class="propagation-months">${future.map(m=>`<label><input type="checkbox" name="propagate_month" value="${this.esc(m)}">${this.esc(this.label(m))}</label>`).join('')}</div><small>Nur nicht freigegebene Entwürfe werden geändert.</small></div><label><input type="checkbox" id="propagate-template" ${hasTemplate?'':'disabled'}> Zugehörige Monatsvorlage aktualisieren</label>${!hasTemplate?'<small>Keine zugehörige Vorlage vorhanden; eine Änderung ist hier nicht möglich.</small>':''}`:'<small>Bei abweichender Buchungsart ist keine automatische Fortschreibung möglich.</small>'}</section><div class="propagation-actions"><button type="button" data-propagate-cancel>Abbrechen</button><button type="button" class="primary" id="propagate-confirm">✓ Buchung speichern</button></div></div></div>`;
        modal.hidden=false;
        const dismiss=()=>{modal.hidden=true;modal.innerHTML='';modal.classList.remove('propagation-dialog');};
        modal.querySelectorAll('[data-propagate-cancel]').forEach(b=>b.addEventListener('click',dismiss));
        const futureCheckbox=modal.querySelector('#propagate-future');
        futureCheckbox?.addEventListener('change',()=>{modal.querySelector('#propagate-month-box').hidden=!futureCheckbox.checked;});
        modal.querySelector('#propagate-confirm').addEventListener('click',async ev=>{
          const button=ev.currentTarget;if(button.disabled)return;
          const chosen=futureCheckbox?.checked?[...modal.querySelectorAll('input[name="propagate_month"]:checked')].map(c=>c.value):[];
          if(futureCheckbox?.checked&&!chosen.length){this.message='Bitte Zielmonate wählen oder die Fortschreibung deaktivieren';dismiss();this.render();return;}
          button.disabled=true;
          const updateTemplate=Boolean(modal.querySelector('#propagate-template')?.checked);
          try{
            await this._hass.callWS({type:'finance_tracker/proposals',op:'decide',data:{action:'confirm',month:this.month,source_name:proposal.name,kind:proposal.kind,booked:f.booked,account_id:f.account_id,amount_cents:amount,description:f.description,category_id:f.category_id||null,booking_kind:f.booking_kind}});
            let message='Ist-Buchung erfolgreich übernommen';
            if(canPropagate&&(chosen.length||updateTemplate)){
              try{const result=await this._hass.callWS({type:'finance_tracker/templates',op:'propagate',data:{from_month:this.month,position_id:sourcePosition,months:chosen,template:updateTemplate,amount_cents:proposal.kind==='expense'?-amount:amount,category_id:f.category_id||null,account_id:f.account_id}});message+=' · Entwürfe aktualisiert: '+(result.updated||[]).join(', ');}
              catch(err){message+=' · Achtung: Fortschreibung fehlgeschlagen: '+(err.message||String(err));}
            }
            dismiss();this.proposalEdit=null;await this.refresh();this.message=message;this.render();
          }catch(err){dismiss();this.message=err.message||String(err);this.render();}
        });
      });
      this.shadowRoot.querySelectorAll('[data-edit-group]').forEach(b=>b.addEventListener('click',()=>{this.editGroupId=b.dataset.editGroup;this.editSubId=null;this.render();}));
      this.shadowRoot.querySelectorAll('[data-edit-sub]').forEach(b=>b.addEventListener('click',()=>{this.editSubId=b.dataset.editSub;this.editGroupId=null;this.render();}));
      this.shadowRoot.querySelectorAll('[data-cancel-category]').forEach(b=>b.addEventListener('click',()=>{this.editSubId=null;this.editGroupId=null;this.render();}));
      this.shadowRoot.querySelectorAll('[data-category-op]').forEach(form=>form.addEventListener('submit',async ev=>{ev.preventDefault();const button=form.querySelector('button[type=submit],button.primary');if(button)button.disabled=true;try{const data=Object.fromEntries(new FormData(form));const result=await this._hass.callWS({type:'finance_tracker/category_admin',op:form.dataset.categoryOp,data});this.categoryAdmin=result;this.editSubId=null;this.editGroupId=null;this.newSubGroupId=null;this.newGroupExpanded=false;await this.refresh();}catch(err){this.message=err.message||String(err);this.render();}}));
      this.shadowRoot.getElementById('toggle-quick')?.addEventListener('click',()=>{const open=!(this.quickExpanded&&this.quickModal);this.quickExpanded=open;this.quickModal=open;this.render();if(open)this.shadowRoot.getElementById('quick-amount')?.focus({preventScroll:true});});
      this.shadowRoot.querySelectorAll('[data-ft22-close-quick]').forEach(b=>b.addEventListener('click',()=>{this.quickExpanded=false;this.quickModal=false;this.render();}));
      this.shadowRoot.querySelectorAll('[data-account-collapse]').forEach(b=>b.addEventListener('click',()=>{const owner=b.dataset.accountCollapse;this.accountGroupOpen[owner]=!this.accountGroupOpen[owner];if(!this.accountGroupOpen[owner]){this.accountGroupEditing[owner]=false;this.editAccountId=null;}this.render();}));
      this.shadowRoot.querySelectorAll('[data-account-group]').forEach(b=>b.addEventListener('click',()=>{const owner=b.dataset.accountGroup;this.accountGroupOpen[owner]=true;this.accountGroupEditing[owner]=!this.accountGroupEditing[owner];this.editAccountId=null;this.render();}));
      this.shadowRoot.getElementById('toggle-new-account')?.addEventListener('click',()=>{this.newAccountExpanded=!this.newAccountExpanded;this.editAccountId=null;this.render();});
      this.shadowRoot.getElementById('cancel-new-account')?.addEventListener('click',()=>{this.newAccountExpanded=false;this.render();});
      this.shadowRoot.getElementById('toggle-new-owner')?.addEventListener('click',()=>{this.newOwnerExpanded=!this.newOwnerExpanded;this.editOwnerName=null;this.render();});
      this.shadowRoot.getElementById('cancel-new-owner')?.addEventListener('click',()=>{this.newOwnerExpanded=false;this.render();});
      this.shadowRoot.getElementById('cancel-owner-edit')?.addEventListener('click',()=>{this.editOwnerName=null;this.render();});
      this.shadowRoot.querySelectorAll('[data-edit-owner]').forEach(b=>b.addEventListener('click',()=>{this.editOwnerName=b.dataset.editOwner;this.newOwnerExpanded=false;this.render();}));
      this.shadowRoot.getElementById('new-owner-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await this._hass.callWS({type:'finance_tracker/account_meta',op:'owner_add',data:{name:f.name}});this.newOwnerExpanded=false;this.message='Kontoinhaber angelegt';await this.refresh();}catch(err){this.message=err.message||String(err);this.render();}});
      this.shadowRoot.getElementById('edit-owner-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await this._hass.callWS({type:'finance_tracker/account_meta',op:'owner_save',data:{old_name:f.old_name,name:f.name}});this.editOwnerName=null;this.message='Kontoinhaber gespeichert';await this.refresh();}catch(err){this.message=err.message||String(err);this.render();}});
      this.shadowRoot.querySelectorAll('[data-delete-owner]').forEach(b=>b.addEventListener('click',async()=>{const name=b.dataset.deleteOwner;if(!await window.FTDialog.confirm('Kontoinhaber löschen',`Kontoinhaber „${name}“ wirklich löschen? Dies ist nur möglich, wenn kein Konto mehr zugeordnet ist.`))return;try{await this._hass.callWS({type:'finance_tracker/account_meta',op:'owner_delete',data:{name}});this.editOwnerName=null;this.message='Kontoinhaber gelöscht';await this.refresh();}catch(err){this.message=err.message||String(err);this.render();}}));
      this.shadowRoot.getElementById('new-account-form')?.addEventListener('submit',async e=>{
        e.preventDefault();
        const form=e.currentTarget instanceof HTMLFormElement?e.currentTarget:null;
        if(!form){this.message='Kontoformular ist nicht verfügbar';this.render();return;}
        const f=Object.fromEntries(new FormData(form));
        const favorite=Boolean(form.elements.namedItem('favorite')?.checked);
        let created=null;
        try{
          const opening=this.cents(f.opening_eur);
          const tolerance=Math.round(Number(f.tolerance_eur)*100);
          if(!Number.isFinite(tolerance)||tolerance<0)throw new Error('Ungültige Kontotoleranz');
          created=await this.api('add_account',{name:f.name,kind:this.ledgerKind(f.account_type),opening_cents:opening,opening_date:f.opening_date});
          const account={id:created.id,name:f.name};
          try{
            await this.saveAccountMeta(account,{display_name:f.display_name,owner:f.owner,account_type:f.account_type,bank:f.bank,tolerance_cents:tolerance,favorite});
          }catch(metaError){
            try{await this.api('delete_account',{id:created.id});}catch(rollbackError){console.error('Finance Tracker: Konto-Rollback fehlgeschlagen',rollbackError);}
            throw metaError;
          }
          this.newAccountExpanded=false;
          this.message='Konto angelegt';
          await this.refresh();
        }catch(err){this.message=err.message||String(err);this.render();}
      });
      this.shadowRoot.querySelectorAll('[data-master-picker]').forEach(b=>b.addEventListener('click',()=>this.openMasterPicker(b.dataset.masterPicker,b.dataset.masterPickerLabel||'Auswahl')));
      this.shadowRoot.getElementById('toggle-new-group')?.addEventListener('click',()=>{this.newGroupExpanded=!this.newGroupExpanded;this.render();});
      this.shadowRoot.querySelectorAll('[data-new-sub-group]').forEach(b=>b.addEventListener('click',()=>{this.newSubGroupId=this.newSubGroupId===b.dataset.newSubGroup?null:b.dataset.newSubGroup;this.render();}));this.shadowRoot.querySelectorAll('[data-cancel-new-sub]').forEach(b=>b.addEventListener('click',()=>{this.newSubGroupId=null;this.render();}));
      this.shadowRoot.querySelectorAll('[data-booking-group]').forEach(b=>b.addEventListener('click',()=>{const key=b.dataset.bookingGroup;const open=!this.expandedBookingGroups.has(key);if(open)this.expandedBookingGroups.add(key);else this.expandedBookingGroups.delete(key);b.setAttribute('aria-expanded',String(open));b.querySelector('.ft-list-group-symbol').textContent=open?'−':'+';this.shadowRoot.querySelectorAll('[data-booking-group-item]').forEach(r=>{if(r.dataset.bookingGroupItem===key)r.hidden=!open;});}));
      this.shadowRoot.querySelectorAll('[data-proposal-status]').forEach(b=>b.addEventListener('click',()=>{const status=b.dataset.proposalStatus;const open=!this.proposalStatusOpen.has(status);if(open)this.proposalStatusOpen.add(status);else this.proposalStatusOpen.delete(status);this.render();}));
      this.shadowRoot.querySelectorAll('[data-change-group]').forEach(b=>b.addEventListener('click',()=>{const key=b.dataset.changeGroup;const open=!this.changeGroupsOpen.has(key);if(open)this.changeGroupsOpen.add(key);else this.changeGroupsOpen.delete(key);this.render();}));
      this.shadowRoot.querySelectorAll('[data-ft22-toggle]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.ft22Toggle;this.planWorkspaceOpen??=new Set();const anchor=b.getBoundingClientRect().top;
        const scrollers=[];let node=this;
        while(node){if(node.scrollTop!==undefined&&node.scrollHeight>node.clientHeight+1)scrollers.push([node,node.scrollTop]);node=node.parentNode||node.getRootNode?.()?.host;}
        const pageY=window.scrollY;
        this.planWorkspaceOpen.has(id)?this.planWorkspaceOpen.delete(id):this.planWorkspaceOpen.add(id);
        this.render();
        for(const [el,top] of scrollers)el.scrollTop=top;
        window.scrollTo({top:pageY,behavior:'instant'});
        const current=Array.from(this.shadowRoot.querySelectorAll('[data-ft22-toggle]')).find(x=>x.dataset.ft22Toggle===id);
        if(current){const delta=current.getBoundingClientRect().top-anchor;
          const scrolling=scrollers.find(([el])=>el.scrollHeight>el.clientHeight+1);
          if(scrolling)scrolling[0].scrollTop+=delta;
          else if(Math.abs(delta)>1)window.scrollBy({top:delta,behavior:'instant'});
        }}));
      this.shadowRoot.querySelectorAll('[data-ft22-book-plan]').forEach(b=>b.addEventListener('click',()=>{
        const position=(this.planActual?.positions||[]).find(p=>p.position_id===b.dataset.ft22BookPlan);
        if(!position)return;
        this.quickExpanded=true;this.quickModal=true;this.render();
        const form=this.shadowRoot.getElementById('quick-book');
        form?.dispatchEvent(new CustomEvent('ft22-prefill-plan',{detail:{position_id:position.position_id}}));
        form?.querySelector('#quick-amount')?.focus({preventScroll:true});
      }));
      this.shadowRoot.querySelectorAll('[data-ft22-create]').forEach(b=>b.addEventListener('click',()=>{this.quickExpanded=true;this.quickModal=true;this.render();const form=this.shadowRoot.getElementById('quick-book');const pos=form?.querySelector('#quick-plan-position');if(pos){pos.value=b.dataset.ft22Create;pos.dispatchEvent(new Event('change',{bubbles:true}));}form?.querySelector('#quick-amount')?.focus({preventScroll:true});}));
      // Phase E.1: Einheitlicher Suchdialog für Zuordnung direkt im Monatsarbeitsbereich.
      this.shadowRoot.querySelectorAll('[data-ft22-picker]').forEach(trigger=>trigger.addEventListener('click',()=>{
        const picker=trigger.closest('.ft22-picker');
        const select=picker?.querySelector('select');
        const modal=this.shadowRoot.getElementById('account-modal');
        if(!select||!modal)return;
        const choices=[...select.options].filter(o=>o.value).map(o=>({id:o.value,label:o.textContent}));
        const heading=trigger.dataset.ft22Picker==='transaction'?'Buchung auswählen':'Planposition auswählen';
        modal.innerHTML=`<div class="account-modal-backdrop" data-account-close></div><div class="account-dialog" role="dialog" aria-modal="true" aria-label="${heading}"><div class="account-dialog-head"><strong>${heading}</strong><button type="button" data-account-close aria-label="Schließen">✕</button></div><div class="account-dialog-search"><input type="search" aria-label="${heading}" placeholder="Suchen …"/></div><div class="account-dialog-list">${choices.map(c=>`<button type="button" class="account-picker-row ${select.value===c.id?'selected':''}" data-ft22-choice="${this.esc(c.id)}" data-search="${this.esc(c.label.toLocaleLowerCase('de'))}"><span class="account-picker-info"><strong>${this.esc(c.label)}</strong></span><span class="account-picker-check">${select.value===c.id?'✓':''}</span></button>`).join('')}</div></div>`;
        modal.hidden=false;
        const close=()=>{modal.hidden=true;modal.innerHTML='';trigger.focus();};
        modal.querySelectorAll('[data-account-close]').forEach(b=>b.addEventListener('click',close));
        modal.querySelectorAll('[data-ft22-choice]').forEach(b=>b.addEventListener('click',()=>{
          select.value=b.dataset.ft22Choice;
          select.dispatchEvent(new Event('change',{bubbles:true}));
          const title=picker.querySelector('[data-ft22-picker-title]');
          if(title)title.textContent=select.selectedOptions[0]?.textContent||heading;
          close();
        }));
        const search=modal.querySelector('input[type=search]');
        search.addEventListener('input',()=>{const q=search.value.toLocaleLowerCase('de');modal.querySelectorAll('[data-search]').forEach(b=>b.hidden=!b.dataset.search.includes(q));});
        if(window.matchMedia?.('(pointer:fine)').matches)search.focus({preventScroll:true});
      }));
      this.shadowRoot.querySelectorAll('[data-ft22-assign],[data-ft22-unassigned]').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const positionId=f.dataset.ft22Assign||f.querySelector('[name=position_id]')?.value;const transactionId=f.dataset.ft22Unassigned||f.querySelector('[name=transaction_id]')?.value;const tx=(this.planActual?.transactions||[]).find(t=>t.id===transactionId);if(!positionId||!tx||tx.unallocated_cents<=0)return;const button=f.querySelector('[type=submit]');if(button)button.disabled=true;try{await this._hass.callWS({type:'finance_tracker/plan_actual',op:'assign',data:{month:this.month,position_id:positionId,transaction_id:transactionId,amount_cents:tx.unallocated_cents}});this.message='Buchung zugeordnet';await this.refresh();}catch(err){this.message='Zuordnung fehlgeschlagen: '+(err.message||String(err));this.render();}}));
      this.shadowRoot.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{this.tab=b.dataset.tab;this.quickExpanded=false;this.quickModal=false;this.message='';this.proposalEdit=null;this.proposalAfterwork=null;this.editId=null;this.planLinkId=null;this.detail=null;this.editAccountId=null;this.editOwnerName=null;this.newAccountExpanded=false;this.newOwnerExpanded=false;this.newSubExpanded=false;this.newGroupExpanded=false;this.render();if(this.tab==='closing')this.loadMonthValidation();}));
      this.shadowRoot.querySelectorAll('[data-validation-retry]').forEach(b=>b.addEventListener('click',()=>this.loadMonthValidation()));
      this.shadowRoot.querySelector('[data-ha-sidebar]')?.addEventListener('click',()=>this.dispatchEvent(new Event('hass-toggle-menu',{bubbles:true,composed:true})));
 this.shadowRoot.getElementById('month-open')?.addEventListener('click',()=>this.openMonthGrid());
      this.shadowRoot.getElementById('month')?.addEventListener('change',e=>{this.month=e.target.value;this.message='';this.refresh();});for(const [id,step] of [['prev-month',-1],['next-month',1]])this.shadowRoot.getElementById(id)?.addEventListener('click',()=>{const d=new Date(Number(this.month.slice(0,4)),Number(this.month.slice(5))-1+step,1);this.month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');this.refresh();});this.shadowRoot.getElementById('refresh-month')?.addEventListener('click',()=>this.refresh());
      this.shadowRoot.getElementById('header-booking-search')?.addEventListener('click',()=>{this.collapseLedgerGroups(false);this.dispatchEvent(new CustomEvent('ft-booking-search',{bubbles:true,composed:true}));});
      this.shadowRoot.querySelectorAll('[data-post]').forEach(b=>b.addEventListener('click',async()=>{if(!await window.FTDialog.confirm('Monatsübersicht','Wiederkehrende Buchung für '+this.month+' wirklich erzeugen?'))return;try{await this.api('post_recurring',{id:b.dataset.post,month:this.month});this.message='Buchung erstellt';await this.refresh();}catch(e){this.message=e.message||String(e);this.render();}}));
      this.shadowRoot.querySelectorAll('[data-active]').forEach(b=>b.addEventListener('click',async()=>{try{await this.api('set_recurring_active',{id:b.dataset.active,active:b.dataset.value==='true'});await this.refresh();}catch(e){this.message=e.message||String(e);this.render();}}));
      this.shadowRoot.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{this.editId=b.dataset.edit;this.render();const editor=this.shadowRoot.querySelector('[data-op="edit_transaction"],[data-op="edit_transfer"]');const bookingRow=editor?.closest('tr')?.previousElementSibling;if(bookingRow){bookingRow.style.scrollMarginTop='145px';bookingRow.scrollIntoView({behavior:'smooth',block:'start'});}else{editor?.scrollIntoView({behavior:'smooth',block:'nearest'});}}));
      this.shadowRoot.getElementById('cancel-edit')?.addEventListener('click',()=>{this.editId=null;this.render();});
      this.shadowRoot.querySelectorAll('[data-void]').forEach(b=>b.addEventListener('click',async()=>{
        const t=d.transactions.find(x=>x.id===b.dataset.void);
        const reason=await window.FTDialog.prompt('Buchung stornieren',`Stornogrund für ${t?.kind==='transfer'?'die gesamte Umbuchung':'diese Buchung'} eingeben:`);
        if(!reason?.trim())return;
        if(!await window.FTDialog.confirm('Buchung stornieren','Buchung wirklich stornieren? Dieser Vorgang wird protokolliert.'))return;
        try{await this.api('void_transaction',{id:b.dataset.void,reason:reason.trim()});this.editId=null;this.message='Buchung storniert';await this.refresh();}
        catch(e){this.message=e.message||String(e);this.render();}
      }));
      this.shadowRoot.querySelectorAll('[data-edit-account]').forEach(b=>b.addEventListener('click',()=>{const a=accounts.find(x=>x.id===b.dataset.editAccount);if(!a||!this.accountGroupEditing[this.owner(a)])return;this.editAccountId=b.dataset.editAccount;this.render();const editor=this.shadowRoot.getElementById('account-edit');const row=editor?.previousElementSibling;if(row){row.style.scrollMarginTop='145px';row.scrollIntoView({behavior:'smooth',block:'start'});}else{editor?.scrollIntoView({behavior:'smooth',block:'nearest'});}}));
      this.shadowRoot.getElementById('cancel-account-edit')?.addEventListener('click',()=>{this.editAccountId=null;this.render();});
      this.shadowRoot.getElementById('edit-account-form')?.addEventListener('submit',async e=>{
        e.preventDefault();
        const form=e.currentTarget instanceof HTMLFormElement?e.currentTarget:null;
        if(!form){this.message='Kontenformular ist nicht verfügbar';this.render();return;}
        const a=accounts.find(x=>x.id===this.editAccountId);if(!a)return;
        const f=Object.fromEntries(new FormData(form));
        const favorite=Boolean(form.elements.namedItem('favorite')?.checked);
        try{
          const opening=this.cents(f.opening_eur);
          const tolerance=Math.round(Number(f.tolerance_eur)*100);
          if(!Number.isFinite(tolerance)||tolerance<0)throw new Error('Ungültige Kontotoleranz');
          await this.api('update_account',{id:a.id,name:f.name,kind:this.ledgerKind(f.account_type),opening_cents:opening,opening_date:f.opening_date});
          await this.saveAccountMeta(a,{display_name:f.display_name,owner:f.owner,account_type:f.account_type,bank:f.bank,tolerance_cents:tolerance,favorite});
          this.editAccountId=null;
          this.message='Kontostammdaten gespeichert';
          await this.refresh();
        }catch(err){this.message=err.message||String(err);this.render();}
      });
      this.shadowRoot.querySelectorAll('[data-delete-account]').forEach(b=>b.addEventListener('click',async()=>{const a=accounts.find(x=>x.id===b.dataset.deleteAccount);if(!a)return;if(!await window.FTDialog.confirm('Konto löschen',`Konto „${this.accountLabel(a)}“ wirklich löschen? Das Konto kann nur gelöscht werden, wenn keine Buchungen, Planungen, Vorlagen oder Abschlüsse darauf verweisen.`))return;try{await this.api('delete_account',{id:a.id});this.editAccountId=null;this.message='Konto gelöscht';await this.refresh();}catch(err){this.message=err.message||String(err);this.render();}}));
      this.shadowRoot.querySelectorAll('[data-favorite]').forEach(b=>b.addEventListener('click',async()=>{const id=b.dataset.favorite;const a=accounts.find(x=>x.id===id);if(!a)return;try{await this.saveAccountMeta(a,{favorite:!this.isFavorite(a)});}catch(e){this.message=e.message||String(e);this.render();}}));
      this.shadowRoot.querySelectorAll('[data-category-kind-picker]').forEach(b=>b.addEventListener('click',()=>{
        const select=this.shadowRoot.getElementById(b.dataset.categoryKindPicker),modal=this.shadowRoot.getElementById('account-modal');if(!select||!modal)return;
        const options=[['expense','Ausgabe'],['saving_transfer','Umbuchung'],['income','Einnahme']];
        modal.innerHTML=`<div class="account-modal-backdrop" data-account-close></div><div class="account-dialog" role="dialog" aria-modal="true" aria-label="Kategorietyp auswählen"><div class="account-dialog-head"><strong>Kategorietyp auswählen</strong><button type="button" data-account-close aria-label="Schließen">✕</button></div><div class="account-dialog-list">${options.map(([v,t])=>`<button type="button" class="account-picker-row ${select.value===v?'selected':''}" data-kind-value="${v}"><strong>${t}</strong><span>${select.value===v?'✓':''}</span></button>`).join('')}</div></div>`;
        modal.hidden=false;const close=()=>{modal.hidden=true;modal.innerHTML='';};modal.querySelectorAll('[data-account-close]').forEach(x=>x.addEventListener('click',close));
        modal.querySelectorAll('[data-kind-value]').forEach(x=>x.addEventListener('click',()=>{select.value=x.dataset.kindValue;this.shadowRoot.getElementById(select.id+'-title').textContent=options.find(([v])=>v===select.value)[1];select.dispatchEvent(new Event('change',{bubbles:true}));close();}));
      }));
      this.shadowRoot.querySelectorAll('[data-category-open]').forEach(b=>b.addEventListener('click',()=>this.openCategoryPicker(b.dataset.categoryOpen)));
      this.shadowRoot.querySelectorAll('#quick-category,#proposal-category,#edit-category,#proposal-afterwork-category').forEach(sel=>sel.addEventListener('change',e=>{const c=categories.find(x=>x.id===e.target.value);const title=this.shadowRoot.getElementById(e.target.id+'-title');if(title)title.textContent=c?.name||'Kategorie wählen';}));
      this.shadowRoot.querySelectorAll('[data-plan-open]').forEach(b=>b.addEventListener('click',()=>{
        const select=this.shadowRoot.getElementById(b.dataset.planOpen);
        const modal=this.shadowRoot.getElementById('account-modal');if(!select||!modal)return;
        const choices=[...select.options].map(o=>({id:o.value,label:o.textContent}));const currentTitle=this.shadowRoot.getElementById(select.id==='booking-plan-position'?'booking-plan-position-title':'quick-plan-title');if(currentTitle&&select.value)currentTitle.textContent=select.selectedOptions[0]?.textContent||'Position auswählen';
        modal.innerHTML=`<div class="account-modal-backdrop" data-account-close></div><div class="account-dialog" role="dialog" aria-modal="true" aria-label="Planposition auswählen"><div class="account-dialog-head"><strong>Planposition auswählen</strong><button type="button" data-account-close aria-label="Schließen">✕</button></div><div class="account-dialog-search"><input type="search" aria-label="Planposition suchen" placeholder="Planposition suchen …"/></div><div class="account-dialog-list">${choices.map(c=>`<button type="button" class="account-picker-row ${select.dataset.confirmed==='yes'&&select.value===c.id?'selected':''}" data-plan-id="${this.esc(c.id)}" data-search="${this.esc(c.label.toLocaleLowerCase('de'))}"><span class="account-picker-info"><strong>${this.esc(c.label)}</strong></span><span class="account-picker-check">${select.dataset.confirmed==='yes'&&select.value===c.id?'✓':''}</span></button>`).join('')}</div></div>`;
        modal.hidden=false;const close=()=>{modal.hidden=true;modal.innerHTML='';};
        modal.querySelectorAll('[data-account-close]').forEach(x=>x.addEventListener('click',close));
        modal.querySelectorAll('[data-plan-id]').forEach(x=>x.addEventListener('click',()=>{select.value=x.dataset.planId;select.dataset.confirmed='yes';select.dispatchEvent(new Event('change',{bubbles:true}));const title=this.shadowRoot.getElementById(select.id==='booking-plan-position'?'booking-plan-position-title':'quick-plan-title');if(title)title.textContent=select.selectedOptions[0]?.textContent||'Position auswählen';close();}));
        modal.querySelector('input[type=search]').addEventListener('input',e=>{const q=e.target.value.toLocaleLowerCase('de');modal.querySelectorAll('[data-search]').forEach(row=>row.hidden=!row.dataset.search.includes(q));});
        if(window.matchMedia?.('(pointer:fine)').matches)modal.querySelector('input[type=search]').focus({preventScroll:true});
      }));
      this.shadowRoot.querySelectorAll('[data-account-open]').forEach(b=>b.addEventListener('click',()=>this.openAccountPicker(b.dataset.accountOpen,accounts)));
      this.shadowRoot.getElementById('quick-as-template')?.addEventListener('change',e=>{this.shadowRoot.getElementById('quick-template-months').hidden=!e.target.checked;});
      const quick=this.shadowRoot.getElementById('quick-book');
      if(quick){
        const k=this.shadowRoot.getElementById('quick-kind'),desc=this.shadowRoot.getElementById('quick-description'),cat=this.shadowRoot.getElementById('quick-category'),acct=this.shadowRoot.getElementById('quick-account'),target=this.shadowRoot.getElementById('quick-target');
        const planSelect=this.shadowRoot.getElementById('quick-plan-position');
        const planHint=this.shadowRoot.getElementById('quick-plan-hint');
        const planBox=this.shadowRoot.getElementById('quick-plan-box');
        let positionsMonth=null,positions=[],planGeneration=0,manuallySelected=false,categoryManual=false;
        const hintDefault='Passende Positionen werden nach Kategorie, Konto und Beschreibung priorisiert. Auswahl vor dem Buchen prüfen.';
        const updatePlanChoice=()=>{
          const kind=k.value, selected=planSelect.value,category=cat.value,account=acct.value;
          const descText=desc.value.trim().toLocaleLowerCase('de');
          const candidates=positions.filter(p=>p.kind===(kind==='transfer'?'saving_transfer':kind));
          const ranked=candidates.map(p=>{
            const history=(p.links||[]).map(l=>this.ft22TextSimilarity(desc.value,l.description));
            const historyScore=history.length?Math.max(...history):0;
            const titleScore=this.ft22TextSimilarity(desc.value,p.name);
            return {p,score:(category&&p.category_id===category?60:0)+(account&&p.account_id===account?25:0)+Math.round(historyScore*0.9)+Math.round(titleScore*0.45),historyScore};
          }).sort((a,b)=>b.score-a.score||a.p.name.localeCompare(b.p.name,'de'));
          planSelect.innerHTML='<option value="">Ohne Planbezug buchen</option>'+ranked.map(x=>`<option value="${this.esc(x.p.position_id)}">${x.score>=60?'★ ':''}${this.esc(x.p.name)} · offen ${this.money(x.p.remaining_cents)}</option>`).join('');
          if(manuallySelected&&candidates.some(p=>p.position_id===selected)){planSelect.value=selected;}
          else if(!manuallySelected&&ranked.length&&ranked[0].score>=60&&(!ranked[1]||ranked[0].score>ranked[1].score)){planSelect.value=ranked[0].p.position_id;}
          else planSelect.value='';
          const chosen=ranked.find(r=>r.p.position_id===planSelect.value)?.p;const title=this.shadowRoot.getElementById('quick-plan-title');if(title)title.textContent=chosen?chosen.name:'Ohne Planbezug buchen';const sub=this.shadowRoot.getElementById('quick-plan-subtitle');if(sub)sub.textContent=chosen?'Offen: '+this.money(chosen.remaining_cents):'Planposition auswählen';
          planHint.textContent=!candidates.length?'Für diesen Buchungsmonat sind keine passenden Planpositionen vorhanden.':manuallySelected?'Manuell gewählte Planposition – die Auswahl wird nicht automatisch überschrieben.':planSelect.value?'Vorschlag aus Planmerkmalen und bereits zugeordneten Buchungen. Bitte prüfen.':ranked.length&&ranked[0].score>=60&&ranked[1]&&ranked[0].score===ranked[1].score?'Mehrere gleichwertige Planpositionen gefunden – bitte selbst auswählen.':hintDefault;
        };
        const loadQuickPlan=async()=>{
          const transfer=k.value==='transfer',month=this.shadowRoot.getElementById('quick-date').value.slice(0,7);
          planBox.hidden=false;planSelect.disabled=false;
          if(month===positionsMonth){updatePlanChoice();return;}
          const generation=++planGeneration;positionsMonth=month;positions=[];
          planHint.textContent='Planpositionen werden geladen …';
          try{
            const result=month===this.month&&this.planActual?this.planActual:await this._hass.callWS({type:'finance_tracker/plan_actual',op:'list',data:{month}});
            if(generation!==planGeneration)return;
            positions=result?.positions||[];
          }catch(error){if(generation!==planGeneration)return;planHint.textContent='Planpositionen nicht verfügbar: '+(error.message||String(error));}
          manuallySelected=false;updatePlanChoice();
        };
        planSelect.addEventListener('change',()=>{manuallySelected=true;updatePlanChoice();});
        cat.addEventListener('change',e=>{if(e.isTrusted||cat.dataset.userChosen==='1')categoryManual=true;});
        this.shadowRoot.getElementById('quick-date').addEventListener('change',loadQuickPlan);
        [cat,acct,desc].forEach(el=>el.addEventListener(el===desc?'input':'change',()=>{if(!planSelect.disabled)updatePlanChoice();}));
        const sync=()=>{categoryManual=false;delete cat.dataset.userChosen;manuallySelected=false;const transfer=k.value==='transfer';cat.disabled=transfer;target.disabled=!transfer;this.shadowRoot.getElementById('quick-category-label').hidden=transfer;this.shadowRoot.getElementById('quick-to-label').hidden=!transfer;this.shadowRoot.getElementById('quick-from-label').querySelector('.account-field-label').textContent=transfer?'Von Konto':'Zahlungskonto';this.shadowRoot.getElementById('quick-save').textContent=transfer?'⇄ Umbuchung buchen':k.value==='income'?'+ Einnahme buchen':'✓ Ausgabe buchen';if(!transfer){cat.innerHTML='<option value="">Kategorie wählen</option>'+categorySelect(k.value);cat.value=this.suggestCategory(k.value,desc.value,categories,d.transactions)||'';cat.dispatchEvent(new Event('change',{bubbles:true}));}};
        this.shadowRoot.querySelectorAll('[data-quick-kind]').forEach(b=>b.addEventListener('click',()=>{k.value=b.dataset.quickKind;this.shadowRoot.querySelectorAll('[data-quick-kind]').forEach(x=>x.classList.toggle('active',x===b));sync();loadQuickPlan();}));
        loadQuickPlan();
        quick.addEventListener('ft22-prefill-plan',async event=>{
          const p=(this.planActual?.positions||[]).find(x=>x.position_id===event.detail.position_id);
          if(!p)return;
          categoryManual=false;delete cat.dataset.userChosen;manuallySelected=false;
          const kind=p.kind==='saving_transfer'?'transfer':p.kind;
          const kindButton=this.shadowRoot.querySelector(`[data-quick-kind="${kind}"]`);
          kindButton?.click();
          desc.value=p.name;
          const value=p.remaining_cents>0?p.remaining_cents:p.plan_cents;
          this.shadowRoot.getElementById('quick-amount').value=(value/100).toFixed(2).replace('.',',');
          if(p.account_id&&[...acct.options].some(x=>x.value===p.account_id)){
            acct.value=p.account_id;
            acct.dispatchEvent(new Event('change',{bubbles:true}));
            const account=accounts.find(x=>x.id===p.account_id);
            const title=this.shadowRoot.querySelector('[data-account-title="quick-account"]');
            const subtitle=this.shadowRoot.querySelector('[data-account-subtitle="quick-account"]');
            if(title)title.textContent=account?this.accountLabel(account):'Konto auswählen';
            if(subtitle&&account)subtitle.textContent=this.owner(account)+' · '+this.bank(account);
          }
          if(kind==='transfer'&&p.to_account_id){const dest=this.shadowRoot.getElementById('quick-target');if(dest&&[...dest.options].some(x=>x.value===p.to_account_id)){dest.value=p.to_account_id;dest.dispatchEvent(new Event('change',{bubbles:true}));const account=accounts.find(x=>x.id===p.to_account_id);const title=this.shadowRoot.querySelector('[data-account-title="quick-target"]');const subtitle=this.shadowRoot.querySelector('[data-account-subtitle="quick-target"]');if(title)title.textContent=account?this.accountLabel(account):'Zielkonto auswählen';if(subtitle&&account)subtitle.textContent=this.owner(account)+' · '+this.bank(account);}}
          if(kind!=='transfer'&&p.category_id&&[...cat.options].some(x=>x.value===p.category_id)){
            cat.value=p.category_id;cat.dispatchEvent(new Event('change',{bubbles:true}));
          }
          await loadQuickPlan();
          if([...planSelect.options].some(x=>x.value===p.position_id)){
            planSelect.value=p.position_id;manuallySelected=true;
            const title=this.shadowRoot.getElementById('quick-plan-title');
            const subtitle=this.shadowRoot.getElementById('quick-plan-subtitle');
            if(title)title.textContent=p.name;
            if(subtitle)subtitle.textContent='Aus Plan übernommen · vor Speichern prüfen';
          }
          const existing=quick.querySelector('#ft22-prefill-note');if(existing)existing.remove();
          const note=document.createElement('p');note.id='ft22-prefill-note';note.className='notice';
          note.textContent=p.remaining_cents>0
            ?`Aus Plan „${p.name}“: ${this.money(value)} vorgeschlagen. Planbetrag ${this.money(p.plan_cents)}, bereits zugeordnet ${this.money(p.actual_cents)}. Alle Angaben prüfen und anschließend speichern.`
            :`Achtung: „${p.name}“ ist bereits vollständig gebucht oder überschritten. Erneute Buchung über ${this.money(value)} nur nach Prüfung bestätigen.`;
          planBox.after(note);
          if(kind==='transfer'&&!p.account_id)note.textContent+=' Quell- und Zielkonto bitte auswählen.';
          if(kind==='transfer')note.textContent+=' Zielkonto bitte ausdrücklich prüfen.';
        });
        desc.addEventListener('input' ,()=>{if(k.value!=='transfer'&&!categoryManual){const suggestion=this.suggestCategory(k.value,desc.value,categories,d.transactions);if(suggestion&&cat.value!==suggestion){cat.value=suggestion;cat.dispatchEvent(new Event('change',{bubbles:true}));}}});
        const amountInput=quick.querySelector('#quick-amount'),amountResult=quick.querySelector('#quick-amount-result');
        amountInput?.addEventListener('input',()=>{if(!amountResult)return;try{amountResult.textContent='Ergebnis: '+this.money(Math.abs(this.expressionCents(amountInput.value)));}catch(err){amountResult.textContent=amountInput.value?'Berechnung prüfen: '+err.message:'Rechnung eingeben – Ergebnis wird als Betrag gebucht';}});
        quick.addEventListener('submit',async e=>{e.preventDefault();const btn=this.shadowRoot.getElementById('quick-save');if(btn.disabled)return;btn.disabled=true;try{const f=Object.fromEntries(new FormData(quick));const cents=Math.abs(this.expressionCents(f.amount_eur));if(cents<=0)throw Error('Betrag muss größer als null sein');if(!f.account_id)throw Error('Zahlungskonto fehlt');const transfer=k.value==='transfer';if(transfer&&(!f.to_id||f.to_id===f.account_id))throw Error('Bitte ein anderes Zielkonto wählen');const payload={booked:f.booked,description:f.description.trim(),amount_cents:cents,amount_expression:f.amount_eur.trim()};if(!payload.description)throw Error('Beschreibung fehlt');if(payload.booked.slice(0,7)!==this.month&&!await window.FTDialog.confirm('Neue Buchung','Das Buchungsdatum liegt außerhalb des ausgewählten Monats. Trotzdem in '+payload.booked.slice(0,7)+' buchen?'))return;if(transfer){payload.from_id=f.account_id;payload.to_id=f.to_id;}else{payload.account_id=f.account_id;payload.kind=k.value;payload.category_id=f.category_id||null;}
          const asTemplate=this.shadowRoot.getElementById('quick-as-template')?.checked;
          const months=asTemplate?[...quick.querySelectorAll('[name="template_month"]:checked')].map(x=>x.value):[];
          if(asTemplate&&!months.length)throw Error('Bitte mindestens einen Kalendermonat auswählen');
          const savedBooking=await this.api(transfer?'transfer':'add_transaction',payload);
          if(asTemplate){
            const saved=await this._hass.callWS({type:'finance_tracker/templates',op:'save',data:{name:payload.description,kind:transfer?'saving_transfer':payload.kind,amount_cents:payload.kind==='income'?cents:-cents,category_id:transfer?null:payload.category_id,account_id:transfer?payload.from_id:payload.account_id,to_account_id:transfer?payload.to_id:null,months}});
          }
          this.preference('account',f.account_id);if(transfer)this.preference('transfer_target',f.to_id);else if(f.category_id)this.preference('category_'+k.value+'_'+payload.description.toLocaleLowerCase('de'),f.category_id);
          this.message='Buchung erfolgreich gespeichert';
          const planPosition=quick.querySelector('#quick-plan-position')?.value||'';
          if(planPosition&&(savedBooking?.id||savedBooking?.from_transaction_id)){
            try{await this._hass.callWS({type:'finance_tracker/plan_actual',op:'assign',data:{month:payload.booked.slice(0,7),transaction_id:transfer?savedBooking.from_transaction_id:savedBooking.id,position_id:planPosition,amount_cents:cents,origin:'booking_create'}});this.message='Buchung gespeichert und Planposition zugeordnet';}
            catch(linkError){this.message='Buchung gespeichert, Planbezug nicht übernommen: '+(linkError.message||String(linkError));}
          }
          const savedMessage=this.message;this.month=payload.booked.slice(0,7);await this.refresh();this.message=savedMessage;this.render();
        }catch(err){this.message=err.message||String(err);this.render();}finally{btn.disabled=false;}});
      }
      const kind=this.shadowRoot.getElementById('kind');if(kind)kind.addEventListener('change',()=>{const c=this.shadowRoot.getElementById('category');c.innerHTML='<option value="">Ohne Kategorie</option>'+categorySelect(kind.value);});
      this.shadowRoot.querySelectorAll('form[data-op]').forEach(f=>f.addEventListener('submit',e=>this.submit(e,f.dataset.op,data=>{if('opening_eur'in data){data.opening_cents=this.cents(data.opening_eur);delete data.opening_eur;}if('amount_eur'in data){data.amount_expression=String(data.amount_eur).trim();data.amount_cents=Math.abs(this.expressionCents(data.amount_eur));delete data.amount_eur;}if('actual_eur'in data){data.actual_cents=this.cents(data.actual_eur);delete data.actual_eur;}})));
    }
    connectedCallback(){this.render();}
  }
  customElements.define(tag,FinancePanel);
})();
