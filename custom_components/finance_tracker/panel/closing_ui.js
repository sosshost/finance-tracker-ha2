/* Finance Tracker 4.0 · Monatsabschluss: separate responsive fourth main view. */
(() => {
  const tag='finance-tracker-closing-panel-v431';
  if(customElements.get(tag))return;
  class ClosingPanel extends HTMLElement {
    constructor(){super();this.attachShadow({mode:'open'});this.month=new Date().toLocaleDateString('sv-SE').slice(0,7);this._hass=null;this.report=null;this.error='';this.busy=false;this.groupOpen={};this.findingGroupOpen={};this.edits={};this.request=0;this.view='accounts';this.debitDiagnosticsRequest=0;this.debitDiagnostics=null;this.debitDiagnosticsLoading=false;this.debitDiagnosticsError='';}
    set hass(h){this._hass=h;if(h&&!this.loaded){this.loaded=true;this.refresh();}}
    abortTransient(){this.edits={};this.render();}
    money(v){return v==null?'—':(Number(v)/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});}
    esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    cents(v){const raw=String(v).trim().replace(/\s/g,'').replace(/\./g,'').replace(',','.');if(!/^-?\d+(\.\d{1,2})?$/.test(raw))throw Error('Bitte einen gültigen Eurobetrag mit maximal zwei Nachkommastellen eingeben.');return Math.round(Number(raw)*100);}
    async refresh(){if(!this._hass)return;this.resetGroups();this.debitDiagnostics=null;this.debitDiagnosticsError='';this.debitDiagnosticsLoading=false;++this.debitDiagnosticsRequest;const seq=++this.request,month=this.month;this.busy=true;this.error='';this.render();try{const data=await this._hass.callWS({type:'finance_tracker/month_validation',month});if(seq!==this.request)return;const plan=await this._hass.callWS({type:'finance_tracker/plan_actual',op:'list',data:{month}});const history=await this._hass.callWS({type:'finance_tracker/v2',op:'closing_history',data:{month}});if(seq!==this.request)return;this.report=data;this.plan=plan;this.history=history;}catch(e){if(seq!==this.request)return;this.error=e.message||String(e);this.report=null;}finally{if(seq===this.request){this.busy=false;this.render();if(this.view==='checks'&&this.report)this.loadDebitDiagnostics();}}}
    async loadDebitDiagnostics(){
      if(!this._hass)return;
      const month=this.month, request=++this.debitDiagnosticsRequest;
      this.debitDiagnostics=null;this.debitDiagnosticsError='';this.debitDiagnosticsLoading=true;this.render();
      try{
        const [info,plan,planning]=await Promise.all([
          this._hass.callWS({type:'finance_tracker/direct_debit',op:'info',data:{month}}),
          this._hass.callWS({type:'finance_tracker/plan_edit',op:'info',data:{month}}),
          this._hass.callWS({type:'finance_tracker/planning_v3',month})
        ]);
        if(request!==this.debitDiagnosticsRequest||month!==this.month)return;
        this.debitDiagnostics={info,plan,planning};
      }catch(error){
        if(request!==this.debitDiagnosticsRequest||month!==this.month)return;
        this.debitDiagnosticsError=error?.message||String(error);
      }finally{
        if(request===this.debitDiagnosticsRequest&&month===this.month){this.debitDiagnosticsLoading=false;this.render();}
      }
    }
    renderDebitDiagnostics(){
      const data=this.debitDiagnostics;
      const historical=data?.info?.failures||[];
      const failures=[...historical];
      for(const r of data?.planning?.rows||[]){
        if(!['income','expense','saving_transfer'].includes(r.kind))continue;
        const id=String(r.position_id||'');
        const cfg=data.info.positions?.[id]||(id.startsWith('tpl:')?data.plan.debit_templates?.[id.slice(4)]:null)||{};
        const aid=data.plan.account_assignments?.[id];
        const target=id.startsWith('tpl:')?data.plan.template_transfer_targets?.[id.slice(4)]:data.plan.manual_transfer_targets?.[id];
        if(cfg.enabled&&(!aid||aid!==cfg.account_id||(r.kind==='saving_transfer'&&(!target||target!==cfg.to_account_id)))&&!failures.some(f=>f.position_id===id&&String(f.reason).includes('Kontozuordnung der Planposition stimmt nicht')))failures.push({position_id:id,reason:'Kontozuordnung der Planposition stimmt nicht mit Lastschriftmerkmal überein',current:true});
      }
      const rows=data?.planning?.rows||[];
      const positions=data?.plan?.positions||[];
      const accountNames=new Map((data?.plan?.accounts||[]).map(a=>[String(a.id),a.name]));
      const accountLabel=id=>id?this.esc(accountNames.get(String(id))||'Konto nicht mehr vorhanden'):'Nicht zugeordnet';
      const missingAccounts=rows.filter(r=>['income','expense','saving_transfer'].includes(r.kind)&&!data.plan.account_assignments?.[r.position_id]);
      const missingCategories=rows.filter(r=>['income','expense'].includes(r.kind)&&!(data.plan.categories?.[r.position_id]||data.plan.mapped_categories?.[r.position_id]));
      const missingList=(title,list)=>`<details class="ft-debit-finding"><summary><span>${title} · ${list.length}</span><span aria-hidden="true">⌄</span></summary><div class="ft-debit-finding-body"><p class="muted">Fachlich prüfen; nicht jede fehlende Zuordnung ist ein Fehler.</p>${list.map(r=>`<p>${this.esc(r.name)}</p>`).join('')||'<p>Keine offenen Zuordnungen.</p>'}</div></details>`;
      const items=failures.map(f=>{
        const id=String(f.position_id||'');
        const pos=rows.find(r=>String(r.position_id)===id)||positions.find(r=>String(r.id)===id)||{};
        const title=pos.name||'Planposition nicht mehr vorhanden';
        const config=data.info.positions?.[id]||(id.startsWith('tpl:')?data.plan.debit_templates?.[id.slice(4)]:null)||data.plan.debit_positions?.[id]||{};
        const planned=id.startsWith('tpl:')?data.plan.template_items?.find(x=>String(x.template_id)===id.slice(4))?.account_id:data.plan.account_assignments?.[id];
        const debitAccount=config.account_id;
        const mismatch=String(f.reason||'').includes('Kontozuordnung der Planposition stimmt nicht');
        const target=id.startsWith('tpl:')?data.plan.template_transfer_targets?.[id.slice(4)]:data.plan.manual_transfer_targets?.[id];
        const currentMismatch=Boolean(config.enabled&&(!planned||planned!==debitAccount||(pos.kind==='saving_transfer'&&(!target||target!==config.to_account_id))));
        const status=mismatch?(currentMismatch?'Aktueller Zuordnungskonflikt':'Historischer Befund – Kontokonflikt derzeit nicht nachweisbar'):'Gespeicherter Prüfbefund';
        const explanation=mismatch?`<div class="ft-debit-compare"><span>Plan-Konto: <strong>${accountLabel(planned)}</strong></span><span>Lastschriftkonto: <strong>${accountLabel(debitAccount)}</strong></span></div><p class="muted">Prüfen unter Finanzplanung → Monatspositionen → Planposition bearbeiten: zugeordnetes Konto und Lastschrift-Einstellungen müssen übereinstimmen. Keine automatische Änderung.</p>`:`<p class="muted">Die Planposition und ihre Lastschrift-Freigabe prüfen; bei einer Kontofreigabe unter Kontenverwaltung → Kontostammdaten nachsehen.</p>`;
        return `<details class="ft-debit-finding"><summary><span>${this.esc(title)}</span><span aria-hidden="true">⌄</span></summary><div class="ft-debit-finding-body"><p><strong>${this.esc(status)}</strong></p><p>${this.esc(f.reason||'Unbekannter Prüfbefund')}</p>${explanation}</div></details>`;
      }).join('');
      return `<section class="panel ft-debit-diagnostics"><details><summary class="ft-debit-diagnostics-toggle"><span><strong>Lastschriftstatus · Prüfbefunde</strong><small>${this.debitDiagnosticsLoading?'Wird geladen …':this.debitDiagnosticsError?'Diagnose nicht verfügbar':`${failures.length} Prüfbefunde · ${Object.keys(data?.info?.runs||{}).length} automatisch verbucht`}</small></span><span class="ft-debit-diagnostics-symbol" aria-hidden="true">⌄</span></summary><div class="ft-debit-diagnostics-content">${this.debitDiagnosticsLoading?'<p class="muted">Diagnose wird geladen …</p>':this.debitDiagnosticsError?`<p role="alert">${this.esc(this.debitDiagnosticsError)}</p><button type="button" data-debit-diagnostics-retry>Erneut prüfen</button>`:!data?'<p class="muted">Noch keine Diagnosedaten geladen.</p>':`<p class="muted">Prüfprotokoll für ${this.esc(this.month)}. Aktuelle Kontokonflikte und historische Automatik-Prüfbefunde werden getrennt gekennzeichnet. Fehlende Konten ohne Lastschrift sind nicht automatisch Fehler. Keine Buchungen oder Konten werden geändert.</p>${items||'<p class="muted">Keine Prüfbefunde.</p>'}${missingList('Planpositionen ohne Konto',missingAccounts)}${missingList('Einnahmen/Ausgaben ohne Kategorie',missingCategories)}<button type="button" data-debit-diagnostics-retry>Erneut prüfen</button>`}</div></details></section>`;
    }
    resetGroups(){this.groupOpen={};this.findingGroupOpen={};}
    async confirmAccount(id){const account=(this.report?.accounts||[]).find(a=>a.account_id===id);if(!account)return;try{const cents=this.cents(this.edits[id]??(account.confirmed_cents!=null?(account.confirmed_cents/100).toFixed(2).replace('.',','):''));await this._hass.callWS({type:'finance_tracker/v2',op:account.closed_at?'close_month':'save_closing_draft',data:{month:this.month,account_id:id,actual_cents:cents}});delete this.edits[id];await this.refresh();}catch(e){this.error=e.message;this.render();}}
    async finish(){if(!await window.FTDialog.confirm('Monatsabschluss','Monat mit den ausgewiesenen Differenzen abschließen? Nachträgliche Korrekturen bleiben möglich.'))return;try{await this._hass.callWS({type:'finance_tracker/v2',op:'confirm_closing',data:{month:this.month}});await this.refresh();}catch(e){this.error=e.message;this.render();}}
    render(){const r=this.report?.month===this.month?this.report:null,esc=x=>this.esc(x),m=x=>this.money(x);const dateLabel=month=>{const [y,mm]=month.split('-').map(Number);return new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,mm-1,1));};
      const hasReleasedPlan=r?.month===this.month;const rows=hasReleasedPlan?(r?.accounts||[]):[];const groups=new Map();for(const a of rows){const owner=a.owner||'Nicht zugeordnet';if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push(a);}
      const complete=Boolean(r&&rows.length&&rows.every(a=>a.confirmed_cents!=null));
      const real=complete?Number(r.booked_cents)+rows.reduce((v,a)=>v+Number(a.difference_cents),0):null;
      const planned=this.plan?.month===this.month?(this.plan.positions||[]).reduce((v,p)=>v+(p.kind==='income'?Number(p.plan_cents):p.kind==='expense'?-Number(p.plan_cents):0),0):null;
      const variance=real==null||planned==null?null:real-planned;
      const metric=(label,value)=>`<div><span>${label}</span><strong class="${value==null?'muted':value<0?'bad':value>0?'good':''}">${m(value)}</strong></div>`;
      const totals=arr=>arr.reduce((s,a)=>s+Number(a.calculated_cents||0),0);
      const prevTotals=arr=>arr.every(a=>a.previous_confirmed_cents!=null)?m(arr.reduce((s,a)=>s+Number(a.previous_confirmed_cents),0)):'Nicht vollständig bestätigt';
      const accountsMarkup=[...groups].sort((a,b)=>a[0].localeCompare(b[0],'de')).map(([owner,accounts])=>{
        const opened=this.groupOpen[owner]===true;
        const head=`<button type="button" class="owner-toggle" data-owner="${esc(owner)}" aria-expanded="${opened}"><span>${esc(owner)} <small>(${accounts.length} Konten)</small></span><span class="owner-value"><strong>${m(totals(accounts))}</strong><span class="owner-symbol">${opened?'−':'+'}</span></span></button>`;
        const items=accounts.sort((a,b)=>a.bank.localeCompare(b.bank)||a.name.localeCompare(b.name)).map(a=>{const done=a.confirmed_cents!=null;const diff=a.difference_cents;
          const tone=a.status==='error'?'bad':a.status==='warning'?'warn':done?'good':'muted';
          const status=done?(a.closed_at?'Bestätigt':'Erfasst'):'Offen';
          return `<article class="account"><div class="account-head"><div class="account-identity"><strong>${esc(a.name)}</strong><small>${esc([a.bank,a.account_type].filter(Boolean).join(' · ')||'Bank / Kontotyp nicht hinterlegt')}</small></div><span class="state ${tone}">${status}</span></div>
            <div class="compare"><div class="column"><div class="col-title">Vormonat · ${esc(a.previous_month||'')}</div><div class="metric"><span>Bestätigt</span><strong>${m(a.previous_confirmed_cents)}</strong></div><div class="metric"><span>Berechnet</span><span>${m(a.previous_calculated_cents)}</span></div></div>
            <div class="column"><div class="col-title">${esc(r.month)}</div><div class="metric"><span>Berechnet</span><strong>${m(a.calculated_cents)}</strong></div><div class="metric"><span>Ist / bestätigt</span><span>${m(a.confirmed_cents)}</span></div></div></div>
            <div class="detail"><div class="metric"><span>Monatsbewegung</span><strong>${m(a.movement_cents)}</strong></div><div class="metric"><span>Kontodifferenz</span><strong class="${tone}">${m(diff)}</strong></div><div class="metric"><span>Zulässige Toleranz</span><strong>${m(a.tolerance_cents)}</strong></div></div>
            ${true?`<div class="confirm"><label for="actual-${esc(a.account_id)}">Tatsächlichen Monatsendsaldo eingeben (€)</label><div class="actions"><input id="actual-${esc(a.account_id)}" inputmode="decimal" data-actual="${esc(a.account_id)}" value="${esc(this.edits[a.account_id]??(done?(a.confirmed_cents/100).toFixed(2).replace('.',','):''))}" placeholder="z. B. 1234,56" aria-label="Istsaldo ${esc(a.name)}"/><button type="button" data-confirm="${esc(a.account_id)}" ${this.busy?'disabled':''}>Saldo speichern</button></div><small>Nachträgliche Korrekturen bleiben möglich.</small></div>`:`<small class="footnote">Abgeschlossen am ${esc((a.closed_at||'').slice(0,19).replace('T',' '))}. Eine Korrektur nach Abschluss erfordert eine gesonderte, protokollierte Wiederöffnung.</small>`}
            <button type="button" class="link" data-correct="${esc(a.account_id)}">${done?'Buchungen korrigieren':'Buchungen prüfen / korrigieren'}</button></article>`;
        }).join('');
        return `<section class="owner">${head}<div ${opened?'':'hidden'} class="owner-content"><div class="owner-totals"><div><small>Vormonat bestätigt</small><strong>${prevTotals(accounts)}</strong></div><div><small>${esc(r.month)} · berechnet</small><strong>${m(totals(accounts))}</strong></div><div><small>Kontendifferenz</small><strong>${accounts.every(a=>a.confirmed_cents!=null)?m(accounts.reduce((v,a)=>v+a.difference_cents,0)):'—'}</strong></div></div>${items}</div></section>`;
      }).join('');
      const accountMap=new Map(rows.map(a=>[a.account_id,a]));
      const txAccounts=r?.transaction_accounts||{};
      const findingsByOwner=new Map();
      for(const f of r?.findings||[]){
        const accountId=f.account_id||txAccounts[f.transaction_id];
        const owner=accountMap.get(accountId)?.owner||'Allgemein';
        if(!findingsByOwner.has(owner))findingsByOwner.set(owner,[]);
        findingsByOwner.get(owner).push(f);
      }
      const findingGroups=[...new Set([...groups.keys(),...findingsByOwner.keys()])].sort((a,b)=>a.localeCompare(b,'de')).map(owner=>{
        const entries=findingsByOwner.get(owner)||[];
        const confirmed=(groups.get(owner)||[]).filter(a=>a.confirmed_cents!=null).length;
        const errors=entries.filter(f=>f.severity==='error').length;
        const warnings=entries.filter(f=>f.severity==='warning'||f.severity==='not_checkable').length;
        const opened=this.findingGroupOpen[owner]===true;
        const head=`<button type="button" class="owner-toggle finding-toggle" data-finding-owner="${esc(owner)}" aria-expanded="${opened}"><span>${esc(owner)} <small>(${entries.length} Befunde)</small></span><span class="finding-counts"><span class="bad" title="Fehler">${errors}</span><span class="warn" title="Hinweise / nicht prüfbar">${warnings}</span><span class="good" title="Konten bestätigt">${confirmed}</span><span class="owner-symbol">${opened?'−':'+'}</span></span></button>`;
        const items=entries.map((f,i)=>{
          const tx=f.transaction_detail;const account=accountMap.get(f.account_id||txAccounts[f.transaction_id]);
          const booking=Boolean(f.transaction_id&&tx&&!tx.voided&&!account?.closed_at&&account?.confirmed_cents==null);
          const plan=Boolean(!f.transaction_id&&f.position_id&&(this.plan?.positions||[]).some(p=>p.position_id===f.position_id));
          const balance=Boolean(!f.transaction_id&&!f.position_id&&f.account_id&&account);
          const edit=!r.closed&&(booking||plan||balance),del=!r.closed&&(booking||plan);
          return `<div class="finding-action-row"><button type="button" class="finding finding-link" data-finding-owner-target="${esc(owner)}" data-finding-index="${i}" aria-haspopup="dialog"><span class="finding-text"><strong>${esc(f.code)} · ${esc(f.message)}</strong>${f.amount_cents!=null?`<small>Betrag: ${m(f.amount_cents)}</small>`:''}</span><span class="finding-right"><span class="state ${f.severity==='error'?'bad':'warn'}">${f.severity==='error'?'Fehler':f.severity==='not_checkable'?'Nicht prüfbar':'Hinweis'}</span><span aria-hidden="true">ⓘ</span></span></button><button type="button" class="ft-pencil" data-finding-action="edit" data-owner-key="${esc(owner)}" data-index="${i}" aria-label="Ursache bearbeiten" ${edit?'':'disabled'}>✎</button><button type="button" class="ft-trash" data-finding-action="void" data-owner-key="${esc(owner)}" data-index="${i}" aria-label="Ursache löschen oder stornieren" ${del?'':'disabled'}>🗑</button></div>`;
        }).join('');
        return `<section class="owner">${head}<div class="owner-content" ${opened?'':'hidden'}>${items||'<p class="note">Keine Auffälligkeiten.</p>'}</div></section>`;
      }).join('');
      this.shadowRoot.innerHTML=`<style>
      .finding-action-row{display:grid;grid-template-columns:minmax(0,1fr) 32px 32px;gap:6px;align-items:center}.finding-action-row .finding{min-width:0;width:100%}button.ft-pencil,button.ft-trash{box-sizing:border-box!important;display:inline-grid!important;place-items:center!important;width:32px!important;min-width:32px!important;height:32px!important;min-height:32px!important;padding:0!important;margin:0!important;font-size:17px!important;line-height:1!important;border-radius:8px!important}button.ft-trash{color:#fca5a5!important;border:1px solid #b45353!important}button:disabled{opacity:.4;cursor:not-allowed}
      :host{display:block;color:var(--primary-text-color,#e5edf6);background:var(--primary-background-color,#111827);font:inherit;min-width:0;max-width:100%;overflow-x:clip}*{box-sizing:border-box}[hidden]{display:none!important}
      .wrap{width:min(1180px,100%);margin:auto;padding:14px clamp(10px,2.6vw,25px);min-width:0;overflow-wrap:anywhere}
      .header{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:14px;align-items:center;min-height:94px;padding:12px 4px;margin-bottom:16px}.eyebrow{font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--secondary-text-color,#9baaba)}.title{font-family:inherit;font-size:25px;font-weight:760;line-height:1.18;letter-spacing:-.5px;margin:0 0 4px}.sub{font-size:12px;color:var(--secondary-text-color,#9baaba)}
      button,input{font:inherit;color:inherit;min-width:0}button{cursor:pointer;min-height:40px;border:1px solid var(--divider-color,#394657);background:var(--card-background-color,#1c2838);border-radius:10px;padding:8px 12px}button:disabled{opacity:.5;cursor:not-allowed}input{width:100%;padding:10px;border:1px solid var(--divider-color,#394657);background:var(--primary-background-color,#111827);border-radius:9px;min-height:42px}.months{display:flex;gap:6px;align-items:center}.months input{width:110px}.sidebar{width:36px;height:36px;padding:0}.panel{border:1px solid var(--divider-color,#394657);background:var(--card-background-color,#1c2838);border-radius:14px;padding:14px;margin:0 0 14px;min-width:0;overflow:hidden}.panel h2{font-size:17px;margin:0 0 13px}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.summary>div{padding:12px;background:var(--primary-background-color,#111827);border-radius:10px;min-width:0}.summary strong,.summary small{display:block}.summary strong{font-size:21px;font-variant-numeric:tabular-nums}.summary small{font-size:11px;color:var(--secondary-text-color,#9baaba)}
      .owner{border:1px solid var(--divider-color,#394657);border-radius:12px;margin:12px 0;overflow:hidden;min-width:0}.owner-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;text-align:left;border:0;border-radius:0;gap:8px;padding:13px;background:var(--primary-background-color,#111827)}.owner-toggle strong{font-variant-numeric:tabular-nums}.owner-value,.finding-counts{display:flex;align-items:center;gap:12px;flex-shrink:0}.owner-symbol{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid var(--divider-color,#394657);border-radius:7px;font-size:18px;font-weight:700}.finding-counts{gap:14px;font-size:14px;font-weight:800;font-variant-numeric:tabular-nums}.owner-content{padding:10px;min-width:0}.owner-totals,.compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.owner-totals>div,.column{padding:10px;background:var(--primary-background-color,#111827);border-radius:9px;min-width:0}.owner-totals small,.owner-totals strong{display:block}.owner-totals small,.col-title{font-size:11px;color:var(--secondary-text-color,#9baaba)}.owner-totals strong{font-size:14px;margin-top:5px;overflow-wrap:anywhere}.account{padding:14px 0;border-bottom:1px solid var(--divider-color,#394657);min-width:0}.account:last-child{border-bottom:0}.account-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.account-head strong{overflow-wrap:anywhere}.account-identity{display:flex;flex-direction:column;gap:4px;min-width:0}.account-identity small{color:var(--secondary-text-color,#9baaba);font-size:11px;overflow-wrap:anywhere}.state{font-size:11px;font-weight:700;white-space:nowrap}.good{color:#86efac}.warn{color:#facc15}.bad{color:#fca5a5}.muted{color:var(--secondary-text-color,#9baaba)}.metric{display:flex;flex-direction:column;gap:4px;padding:7px 0;font-size:12px;min-width:0}.metric strong,.metric span{overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.detail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0}.detail .metric{padding:9px;background:var(--primary-background-color,#111827);border-radius:8px}.confirm{margin-top:12px;padding:12px;border:1px solid var(--divider-color,#394657);border-radius:9px}.confirm label{font-size:12px;display:block;margin-bottom:8px}.actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.actions button{white-space:normal}.confirm small,.footnote{display:block;margin-top:8px;color:var(--secondary-text-color,#9baaba);font-size:11px}.link{margin-top:8px;border:0;background:none;padding:5px 0;color:#77c7e7;min-height:32px;text-align:left}.finding{padding:10px 0;border-bottom:1px solid var(--divider-color,#394657);display:flex;justify-content:space-between;gap:10px;font-size:12px}.finding strong{min-width:0;overflow-wrap:anywhere}.finding-link{width:100%;border:0;border-radius:0;background:none;text-align:left;min-height:0}.finding-link:hover{background:rgba(125,180,220,.08)}.finding-text{display:grid;gap:4px;min-width:0}.finding-text small{color:var(--secondary-text-color,#9baaba)}.finding-right{display:flex;align-items:center;gap:9px;flex-shrink:0}.error{padding:12px;border-left:3px solid #fca5a5;background:#7f1d1d33;margin-bottom:12px;overflow-wrap:anywhere}.note{font-size:12px;color:var(--secondary-text-color,#9baaba)}
      @media(max-width:720px){.header{grid-template-columns:36px minmax(0,1fr);min-height:0}.months{grid-column:1/-1;justify-content:flex-end}.title{font-size:23px}.summary strong{font-size:18px}.owner-content{padding:8px}.detail{grid-template-columns:1fr}.detail .metric{flex-direction:row;justify-content:space-between;gap:8px}.actions{grid-template-columns:1fr}.finding{flex-wrap:wrap}.owner-totals strong{font-size:12px}}@media(max-width:360px){.summary{grid-template-columns:1fr 1fr}.owner-totals,.compare{gap:5px}.column{padding:7px}}
      .month-trigger{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:145px;background:var(--card-background-color,#172536);border-radius:11px;padding:9px 12px}.month-trigger span{color:var(--primary-color,#38bdf8)}.month-overlay:not([hidden]){position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px}.month-backdrop{position:absolute;inset:0;background:rgba(2,8,20,.72)}.month-dialog{position:relative;display:grid;gap:12px;width:min(420px,100%);padding:16px;background:var(--card-background-color,#192637);border:1px solid var(--divider-color,#415266);border-radius:17px;box-shadow:0 20px 55px #0008}.month-dialog-head{display:flex;justify-content:space-between;align-items:center}.month-year-nav{display:flex;justify-content:space-between;align-items:center;gap:12px}.month-year-nav button{min-width:44px}.month-dialog label{display:grid;gap:6px}.month-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.month-grid button.selected{background:var(--primary-color,#4c9aff);color:white}.months{min-width:0;flex-wrap:wrap;justify-content:flex-end}

      .header{grid-template-columns:36px minmax(0,1fr) auto;gap:10px 14px;min-height:94px;padding:12px 4px;margin:0;border-bottom:1px solid var(--divider-color,#344154);background:var(--primary-background-color,#111827)}
      .closing-controls{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 12px;align-items:center;min-width:0}
      .closing-confirm{grid-column:2;justify-self:end;background:var(--primary-color,#4c9aff);color:white;border-color:transparent;font-size:12px;min-height:39px}
      .closing-confirm:disabled{opacity:.5}.closing-status{grid-column:2;justify-self:end;font-size:12px;color:var(--secondary-text-color)}
      .closing-metrics{grid-column:1;grid-row:1/3;display:grid;gap:4px;align-self:end;min-width:0;font-size:12px}.closing-metrics>div{display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap}.closing-metrics span{color:var(--secondary-text-color,#9baaba)}.closing-metrics strong{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:650}
      .closing-controls .months{grid-column:2;grid-row:2;gap:7px;flex-wrap:nowrap;min-width:0}.closing-controls .months>button{min-height:40px;border-radius:10px}.closing-controls .month-trigger{min-width:0;white-space:nowrap}
      .ft-inline-subnav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0 16px;width:100%;min-width:0}.ft-inline-subnav button{min-width:0;min-height:39px;padding:8px 7px;border-radius:10px;border:1px solid var(--divider-color,#394657);background:var(--card-background-color,#1e293b);color:var(--primary-text-color,#e8edf3);font:inherit;font-size:12px;line-height:1.3;overflow-wrap:anywhere;cursor:pointer}.ft-inline-subnav button.active{background:var(--primary-color,#4c9aff);color:white;border-color:transparent}.ft-inline-subnav button:focus-visible{outline:2px solid var(--primary-color,#4c9aff);outline-offset:2px}
      @media(max-width:720px){.header{grid-template-columns:36px minmax(0,1fr)}.closing-controls{gap:7px}.closing-metrics>div{display:grid;gap:1px}.closing-controls .months{gap:5px}.closing-controls .months>button{padding:7px}.closing-controls .month-trigger{gap:4px;font-size:12px}.closing-metrics{font-size:11px}}
      @media(max-width:380px){.closing-controls{grid-template-columns:minmax(0,1fr) auto;gap:5px}.closing-controls .months>button{padding:5px;min-height:36px}.closing-controls .month-trigger{font-size:11px}.closing-metrics{font-size:10px}.closing-confirm{padding:6px;font-size:11px}}
      .closing-controls .months>[data-refresh]{box-sizing:border-box;width:40px;height:40px;min-width:40px;min-height:40px;flex:0 0 40px;padding:0;display:grid;place-items:center}
.ft-debit-diagnostics{margin:0 0 13px!important;min-width:0}
.ft-debit-diagnostics details>summary{cursor:pointer;list-style:none}
.ft-debit-diagnostics details>summary::-webkit-details-marker{display:none}
.ft-debit-diagnostics-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:42px}
.ft-debit-diagnostics-toggle>span:first-child{display:grid;gap:4px;min-width:0}
.ft-debit-diagnostics-toggle strong{font-size:15px}
.ft-debit-diagnostics-toggle small{font-size:12px;color:var(--secondary-text-color,#98a4b7)}
.ft-debit-diagnostics-symbol{font-size:20px;color:#5ccbc4}
.ft-debit-diagnostics details[open]>.ft-debit-diagnostics-toggle .ft-debit-diagnostics-symbol{transform:rotate(180deg)}
.ft-debit-diagnostics-content{border-top:1px solid var(--divider-color,#394657);margin-top:10px;padding-top:12px;display:grid;gap:9px}
.ft-debit-finding{border:1px solid var(--divider-color,#394657);border-radius:11px;min-width:0}
.ft-debit-finding>summary{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 12px;min-height:42px;overflow-wrap:anywhere}
.ft-debit-finding>summary span:first-child{min-width:0;font-weight:600}
.ft-debit-finding-body{border-top:1px solid var(--divider-color,#394657);padding:11px 12px;font-size:13px;overflow-wrap:anywhere}
.ft-debit-finding-body p{margin:0 0 8px}
.ft-debit-compare{display:grid;gap:5px;margin:8px 0}
@media(max-width:420px){.ft-debit-diagnostics-toggle strong{font-size:14px}.ft-debit-finding>summary{padding:9px 10px}}
.ft-inline-subnav{grid-template-columns:repeat(3,minmax(0,1fr));margin:0;padding:8px 0;border-bottom:1px solid var(--divider-color,#394657)}
      button.ft-pencil,button.ft-trash{box-sizing:border-box!important;display:inline-grid!important;place-items:center!important;flex:0 0 32px!important;width:32px!important;min-width:32px!important;max-width:32px!important;height:32px!important;min-height:32px!important;max-height:32px!important;padding:0!important;margin:0!important;font-size:17px!important;line-height:1!important;border-radius:8px!important}button.ft-trash{color:#fca5a5!important;border:1px solid #b45353!important}
</style><main class="wrap"><header class="header"><button type="button" class="sidebar" data-sidebar aria-label="Home Assistant Seitenleiste">☰</button><div><div class="title">Abschluss</div><div class="sub">Kontenabstimmung · Prüfbericht</div></div><div class="closing-controls"><div class="closing-metrics" aria-label="Monatsbilanz">${metric('Bilanz gesamt',real)}${metric('Abweichung zum Plan',variance)}</div>${this.view!=='finish'?'':r?.closed?'<span class="closing-status">Abgeschlossen</span>':`<button type="button" class="closing-confirm" data-finish ${!r?.ready||!rows.length||this.busy?'disabled':''}>Abschluss bestätigen</button>`}<div class="months"><button type="button" class="month-trigger" data-month-open aria-haspopup="dialog" aria-label="Monat auswählen">${esc(dateLabel(this.month))} <span aria-hidden="true">⌄</span></button><div class="month-overlay" data-month-overlay hidden><div class="month-backdrop" data-month-close></div><div class="month-dialog" role="dialog" aria-modal="true" aria-label="Monat auswählen"><div class="month-dialog-head"><strong>Monat auswählen</strong><button type="button" data-month-close aria-label="Schließen">✕</button></div><div class="month-year-nav"><button type="button" data-year-prev title="Vorheriges Jahr" aria-label="Vorheriges Jahr">‹</button><strong data-year-label>${esc(this.month.slice(0,4))}</strong><button type="button" data-year-next title="Nächstes Jahr" aria-label="Nächstes Jahr">›</button></div><div class="month-grid">${Array.from({length:12},(_,i)=>`<button type="button" data-month-choice="${String(i+1).padStart(2,'0')}" class="${Number(this.month.slice(5))===i+1?'selected':''}" >${esc(new Intl.DateTimeFormat('de-DE',{month:'short'}).format(new Date(2026,i,1)))}</button>`).join('')}</div></div></div><button type="button" data-refresh title="Ansicht aktualisieren" aria-label="Aktualisieren">↻</button></div></div><nav class="ft-inline-subnav" style="grid-column:1/-1" aria-label="Unteransichten">${[['accounts','Kontenabgleich'],['checks','Prüfungen'],['finish','Monatsabschluss']].map(([id,label])=>`<button type="button" data-view="${id}" class="${this.view===id?'active':''}" aria-current="${this.view===id?'page':'false'}">${label}</button>`).join('')}</nav></header>
      ${this.error?`<div class="error" role="alert">${esc(this.error)}</div>`:''}
      ${this.busy&&!r?'<section class="panel">Monatsprüfung läuft …</section>':''}
      ${r?this.view==='accounts'?`<section class="panel"><h2>Kontenabgleich</h2>${accountsMarkup}</section>`:this.view==='checks'?`<section class="panel"><h2>Prüfbefunde</h2>${findingGroups}</section>${this.renderDebitDiagnostics()}${rows.every(a=>a.confirmed_cents!=null)?`<section class="panel"><h2>Plan-Ist-Abweichungen</h2>${(this.plan?.positions||[]).filter(p=>p.remaining_cents).sort((a,b)=>Math.abs(b.remaining_cents)-Math.abs(a.remaining_cents)).map(p=>`<article class="account"><div class="metric"><strong>${esc(p.name)}</strong><strong>${m(p.remaining_cents)}</strong></div><div class="metric"><span>Plan / Ist</span><span>${m(p.plan_cents)} / ${m(p.actual_cents)}</span></div><button data-position="${esc(p.position_id)}">Prüfen / zuordnen</button></article>`).join('')}</section>`:''}`:`<section class="panel"><h2>Abschlussstatus</h2><p>${r.closed?'Abgeschlossen':r.ready&&rows.length?'Abschluss freigabefähig':'Abschluss noch nicht freigabefähig'}</p><p>${rows.filter(a=>a.confirmed_cents!=null).length} / ${rows.length} Konten erfasst</p><p>${(r.findings||[]).filter(f=>f.severity==='error').length} Fehler · ${(r.findings||[]).filter(f=>f.severity!=='error').length} weitere Befunde</p></section><section class="panel"><h2>Abschlusskorrekturen</h2>${(this.history||[]).map(h=>{const p=JSON.parse(h.payload);return `<article class="account"><strong>${esc(h.action)}</strong><small>${esc(h.created)} · ${esc(h.actor)}</small><div>${esc(rows.find(a=>a.account_id===p.account_id)?.name||p.account_id)}</div><div class="metric"><span>Kontendifferenz vorher / nachher</span><strong>${m(p.before.actual-p.before.calculated)} → ${m(p.after.actual-p.after.calculated)}</strong></div><details><summary>Details</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(p.events,null,2))}</pre></details></article>`;}).join('')||'Keine nachträglichen Änderungen'}</section>`:''}</main>`;
      const root=this.shadowRoot;
      root.querySelectorAll('[data-debit-diagnostics-retry]').forEach(b=>b.addEventListener('click',()=>this.loadDebitDiagnostics()));
      root.querySelector('[data-finish]')?.addEventListener('click',()=>this.finish());
      root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{this.view=b.dataset.view;this.render();if(this.view==='checks'&&!this.busy)this.loadDebitDiagnostics();}));
      root.querySelectorAll('[data-position]').forEach(b=>b.addEventListener('click',()=>this.dispatchEvent(new CustomEvent('ft-open-plan-actual',{bubbles:true,composed:true,detail:{month:this.month,position_id:b.dataset.position}}))));
      root.querySelector('[data-sidebar]')?.addEventListener('click',()=>{const ev=new Event('hass-toggle-menu',{bubbles:true,composed:true});this.dispatchEvent(ev);});
      root.querySelector('[data-refresh]')?.addEventListener('click',()=>{this.resetGroups();this.refresh();});
      root.querySelector('[data-month-open]')?.addEventListener('click',()=>{root.querySelector('[data-month-overlay]').hidden=false;});
      root.querySelectorAll('[data-month-close]').forEach(b=>b.addEventListener('click',()=>{root.querySelector('[data-month-overlay]').hidden=true;}));
      for(const [selector,delta] of [['[data-year-prev]',-1],['[data-year-next]',1]])root.querySelector(selector)?.addEventListener('click',()=>{
        const label=root.querySelector('[data-year-label]');const next=Number(label.textContent)+delta;
        if(next<2000||next>2100)return;label.textContent=String(next);
        root.querySelectorAll('[data-month-choice]').forEach(b=>{b.classList.toggle('selected',next===Number(this.month.slice(0,4))&&Number(b.dataset.monthChoice)===Number(this.month.slice(5)));b.disabled=false;});
      });
      root.querySelectorAll('[data-month-choice]').forEach(b=>b.addEventListener('click',()=>{const year=Number(root.querySelector('[data-year-label]').textContent);if(!Number.isInteger(year)||year<2000||year>2100)return;const target=String(year)+'-'+b.dataset.monthChoice;this.month=target;this.edits={};this.resetGroups();this.refresh();}));
      root.querySelectorAll('[data-owner]').forEach(b=>b.addEventListener('click',()=>{const o=b.dataset.owner;this.groupOpen[o]=!this.groupOpen[o];this.render();}));
      root.querySelectorAll('[data-finding-owner]').forEach(b=>b.addEventListener('click',()=>{const o=b.dataset.findingOwner;this.findingGroupOpen[o]=!this.findingGroupOpen[o];this.render();}));
      root.querySelectorAll('[data-finding-action]').forEach(b=>b.addEventListener('click',()=>{
        const f=findingsByOwner.get(b.dataset.ownerKey)?.[Number(b.dataset.index)];if(!f||b.disabled)return;
        const action=b.dataset.findingAction;
        if(f.transaction_id)this.dispatchEvent(new CustomEvent('ft-open-actual-booking',{bubbles:true,composed:true,detail:{month:this.month,transaction_id:f.transaction_id,action}}));
        else if(f.position_id)this.dispatchEvent(new CustomEvent('ft-finding-plan',{bubbles:true,composed:true,detail:{month:this.month,position_id:f.position_id,action}}));
        else if(f.account_id){this.view='accounts';const a=accountMap.get(f.account_id);this.groupOpen[a?.owner||'Allgemein']=true;this.render();this.shadowRoot.querySelector(`[data-actual="${CSS.escape(f.account_id)}"]`)?.focus();}
      }));
      root.querySelectorAll('[data-finding-owner-target]').forEach(b=>b.addEventListener('click',()=>{
        const f=findingsByOwner.get(b.dataset.findingOwnerTarget)?.[Number(b.dataset.findingIndex)];if(!f)return;
        const account=accountMap.get(f.account_id||txAccounts[f.transaction_id]);
        const position=(this.plan?.positions||[]).find(p=>p.position_id===f.position_id);
        const isPlan=String(f.code||'').startsWith('PI-')||Boolean(f.position_id||f.link_id);
        let path, advice;
        if(f.code==='KO-02'){path='Monatsabschluss → Abschluss → Kontenabgleich';advice='Den tatsächlichen Kontostand zum Monatsende erfassen und speichern.';}
        else if(isPlan){path='Finanzplanung → Plan-Ist-Vergleich';advice=f.code==='PI-01'?'Die Buchung mit einer passenden Planposition abgleichen und bei Bedarf zuordnen.':'Die betroffene Zuordnung, den Buchungsmonat und den Zuordnungsbetrag prüfen. Fehlerhafte Zuordnungen korrigieren.';}
        else if(f.transfer_id||String(f.code||'').startsWith('UB-')){path='Monatsübersicht → Buchungen nach Konto';advice='Quell- und Zielbuchung der Umbuchung prüfen: Konten, Datum, Beträge und Vollständigkeit beider Seiten. Falls nicht über die Oberfläche korrigierbar, technische Prüfung veranlassen.';}
        else {path='Monatsübersicht → Buchungen nach Konto';advice=f.code==='BK-03'?'Die Buchung bearbeiten und eine passende Kategorie auswählen.':'Konto, Kategorie, Buchungstyp und Betrag der betroffenen Buchung prüfen; falls nicht bearbeitbar, technische Prüfung veranlassen.';}
        const dayLabel=value=>{const parts=String(value||'').split('-');return parts.length===3?`${parts[2]}.${parts[1]}.${parts[0]}`:String(value||'Nicht verfügbar');};
        const accountLabel=a=>a?[a.name,a.owner,a.bank].filter(Boolean).join(' · '):'Konto nicht verfügbar';
        const transactionLines=(t,label)=>t?[`${label}: ${t.description||'Ohne Bezeichnung'}`,`Datum: ${dayLabel(t.booked)}`,`Buchungsart: ${({income:'Einnahme',expense:'Ausgabe',transfer:'Umbuchung'})[t.kind]||'Ungültiger Buchungstyp'}`,`Buchungsbetrag: ${m(t.amount_cents)}`,`Konto: ${accountLabel(t.account)}`,`Kategorie: ${t.category|| (t.category_unknown?'Ungültige Kategorie':t.kind==='transfer'?'Nicht erforderlich':'Nicht zugeordnet')}`,t.voided?'Buchungsstatus: Storniert':null]:[`${label}: Nicht verfügbar (fehlend oder nicht abrufbar)`];
        const details=[f.message,`Monat: ${dateLabel(this.month)}`,`Status: ${f.severity==='error'?'Fehler':f.severity==='not_checkable'?'Nicht prüfbar':'Hinweis'}`];
        if(f.transaction_id)details.push('',...transactionLines(f.transaction_detail,'Buchung'));
        else if(f.account_id)details.push(`Konto: ${accountLabel(f.account_detail||account)}`);
        if(f.transfer_id){const legs=f.transfer_details||[];if(!legs.length)details.push('Umbuchungsseiten nicht verfügbar');for(const leg of legs)details.push('',...transactionLines(leg,leg?.amount_cents<0?'Ausgangsseite':leg?.amount_cents>0?'Eingangsseite':'Umbuchungsseite'));}
        if(f.position_id)details.push(`Planposition: ${position?.name||'Nicht verfügbar oder anderer Planmonat'}`);
        if(f.allocation_detail)details.push(`Zuordnungsmonat: ${dateLabel(f.allocation_detail.month)}`,`Zuordnungsbetrag: ${m(f.allocation_detail.amount_cents)}`);
        if(f.amount_cents!=null)details.push(`${f.code==='PI-01'?'Noch nicht zugeordneter Betrag':'Befundbetrag'}: ${m(f.amount_cents)}`);
        if(f.allocated_cents!=null)details.push(`Zugeordneter Gesamtbetrag: ${m(f.allocated_cents)}`);
        details.push('',`Wo prüfen: ${path}`,advice);
        const detailText=details.filter(x=>x!==null).join('\n');
        window.FTDialog.alert(`Prüfbefund · ${f.code}`,detailText,{confirmText:'Schließen'}).then(()=>{if(b.isConnected)b.focus();});
      }));
      root.querySelectorAll('[data-actual]').forEach(el=>el.addEventListener('input',()=>{this.edits[el.dataset.actual]=el.value;}));
      root.querySelectorAll('[data-confirm]').forEach(b=>b.addEventListener('click',()=>this.confirmAccount(b.dataset.confirm)));
      root.querySelectorAll('[data-correct]').forEach(b=>b.addEventListener('click',()=>this.dispatchEvent(new CustomEvent('ft-open-ledger',{bubbles:true,composed:true,detail:{account_id:b.dataset.correct,month:this.month}}))));
    }
  }
  customElements.define(tag,ClosingPanel);
})();
