/* Finance Tracker 3.0 — stable unified navigation, no child remount on tab switch. */
(() => {
  if(!window.FTDialog){
    const openDialog=({title='Finance Tracker',message='',kind='confirm',value='',confirmText, cancelText='Abbrechen'})=>new Promise(resolve=>{
      const dlg=document.createElement('dialog');
      dlg.setAttribute('aria-label',title);
      dlg.innerHTML=`<style>
        dialog{border:0;padding:0;background:transparent;color:var(--primary-text-color,#e8edf3);max-width:min(92vw,520px);width:100%}
        dialog::backdrop{background:rgba(0,0,0,.58);backdrop-filter:blur(1.5px)}
        .ftd{background:var(--card-background-color,#1e1e1e);border:1px solid var(--divider-color,#3a3a3a);border-radius:15px;box-shadow:0 18px 55px rgba(0,0,0,.45);overflow:hidden}
        .ftd-head{padding:14px 18px 10px;border-bottom:1px solid var(--divider-color,#343434)}
        .ftd-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--primary-color,#38a6d1);font-weight:800}
        .ftd-title{margin-top:3px;font-size:16px;font-weight:750}
        .ftd-body{padding:18px;white-space:pre-wrap;line-height:1.45;color:var(--primary-text-color,#e8edf3)}
        .ftd-input{width:100%;margin-top:14px;padding:11px 12px;border-radius:10px;border:1px solid var(--divider-color,#4a4a4a);background:var(--secondary-background-color,#151515);color:inherit;font:inherit}
        .ftd-actions{display:flex;justify-content:flex-end;gap:9px;padding:0 18px 18px}
        button{font:inherit;min-height:40px;padding:9px 16px;border-radius:10px;border:1px solid var(--divider-color,#454545);background:transparent;color:inherit;cursor:pointer}
        button.primary{background:var(--primary-color,#38a6d1);color:#fff;border-color:transparent;font-weight:700}
        button:focus-visible,.ftd-input:focus-visible{outline:2px solid var(--primary-color,#38a6d1);outline-offset:2px}
      </style><section class="ftd"><header class="ftd-head"><div class="ftd-kicker">Finance Tracker</div><div class="ftd-title"></div></header><div class="ftd-body"><div class="ftd-message"></div></div><div class="ftd-actions"></div></section>`;
      dlg.querySelector('.ftd-title').textContent=title;
      dlg.querySelector('.ftd-message').textContent=message;
      const body=dlg.querySelector('.ftd-body'),actions=dlg.querySelector('.ftd-actions');
      let input=null;
      if(kind==='prompt'){input=document.createElement('input');input.className='ftd-input';input.value=value??'';input.autocomplete='off';body.appendChild(input);}
      const finish=result=>{if(dlg.open)dlg.close();dlg.remove();resolve(result);};
      if(kind!=='alert'){const cancel=document.createElement('button');cancel.type='button';cancel.textContent=cancelText;cancel.addEventListener('click',()=>finish(kind==='prompt'?null:false));actions.appendChild(cancel);}
      const ok=document.createElement('button');ok.type='button';ok.className='primary';ok.textContent=confirmText||(kind==='prompt'?'Übernehmen':kind==='alert'?'OK':'Bestätigen');ok.addEventListener('click',()=>finish(kind==='prompt'?input.value:true));actions.appendChild(ok);
      dlg.addEventListener('cancel',e=>{e.preventDefault();finish(kind==='prompt'?null:kind==='alert'?true:false);});
      document.body.appendChild(dlg);dlg.showModal();queueMicrotask(()=>{(input||ok).focus();});
    });
    window.FTDialog={
      confirm:(title,message,opts={})=>openDialog({title,message,kind:'confirm',...opts}),
      prompt:(title,message,opts={})=>openDialog({title,message,kind:'prompt',value:opts.value??'',...opts}),
      alert:(title,message,opts={})=>openDialog({title,message,kind:'alert',...opts})
    };
  }
  const tag = 'finance-tracker-unified-panel';
  if (customElements.get(tag)) return;
  class Unified extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:'open'});
      this.active='ledger'; this.planningSubview='planning'; this.ledgerSubview='overview'; this.masterSubview='accounts'; this.ready=false; this.started=false;
      this.error=''; this._hass=null;
    }
    connectedCallback() {
      this.renderShell();
      this._headerCollapsed=false;
      this._scrollOrigin=null;
      this._scrollAnchor=0;
      this._lastDirection=0;
      this._headerTransitionUntil=0;
      this._scrollListener=e=>this._handleHeaderScroll(e);
      // One capture listener; window + document listeners caused duplicate/conflicting samples.
      document.addEventListener('scroll',this._scrollListener,{capture:true,passive:true});
      this._syncHeader();
      if(this._hass && !this.started)this.load();
    }
    disconnectedCallback(){
      document.removeEventListener('scroll',this._scrollListener,true);
      this._dialogObserver?.disconnect();
      this._headerObserver?.disconnect();
      for(const observer of this._subnavObservers?.values()||[])observer.disconnect();
    }
    _syncDialogLayer(){
      const ledger=this.shadowRoot.querySelector('#ledger > *');
      const root=ledger?.shadowRoot;
      const picker=root?.querySelector('#account-modal:not([hidden])');
      const booking=root?.querySelector('.ft22-quick-modal');
      const proposalAfterwork=root?.querySelector('.proposal-afterwork-modal');
      const active=this.active==='ledger' && !!(picker||booking||proposalAfterwork);
      if(active===this._dialogLayerActive)return;
      this._dialogLayerActive=active;
      const bar=this.shadowRoot.querySelector('.bar');
      if(bar){bar.style.visibility=active?'hidden':'';bar.style.pointerEvents=active?'none':'';}
      if(active){this._headerCollapsed=false;this._syncHeader();}
      else {this._scrollOrigin=null;this._scrollAnchor=0;this._lastDirection=0;this._syncHeader();}
    }
    _syncHeader(){
      const bar=this.shadowRoot.querySelector('.bar');if(!bar)return;
      // Transform only: NEVER change margin, height or layout flow during scrolling.
      const height=bar.offsetHeight||0;
      bar.style.transform=this._headerCollapsed?'translate3d(0,-100%,0)':'translate3d(0,0,0)';
      // One-pixel opaque overlap prevents content shining through at fractional zoom/device pixel ratios.
      const top=this._headerCollapsed?'0px':`${Math.max(0,Math.ceil(height)-1)}px`;
      if(this._lastStickyTop!==top){this.style.setProperty('--ft-sticky-top',top);this._lastStickyTop=top;}
    }
    _handleHeaderScroll(e){
      if(this._dialogLayerActive)return;
      const target=e.target;
      if(target!==document&&target!==document.scrollingElement&&target!==document.documentElement&&target!==document.body){
        // Only scroll events originating from the primary page scroll container.
        const node=target;
        if(!(node instanceof HTMLElement)||node.scrollHeight<=node.clientHeight+2)return;
        const panel=this.shadowRoot.querySelector('#content');
        if(!panel?.contains(node)&&!node.contains(this))return;
      }
      const y=Math.max(0,Number(target?.scrollTop??document.scrollingElement?.scrollTop??window.scrollY)||0);
      if(this._scrollOrigin!==target){this._scrollOrigin=target;this._scrollAnchor=y;this._lastDirection=0;return;}
      if(y<32){if(this._headerCollapsed){this._headerCollapsed=false;this._syncHeader();}this._scrollAnchor=y;return;}
      const delta=y-this._scrollAnchor;
      const direction=Math.sign(delta);
      if(!direction)return;
      if(direction!==this._lastDirection){this._lastDirection=direction;this._scrollAnchor=y;return;}
      // A single 55px movement in the same direction is required; no pixel-level oscillation.
      if(Math.abs(delta)<55||performance.now()<this._headerTransitionUntil)return;
      const collapsed=direction>0&&y>130;
      if(collapsed!==this._headerCollapsed){
        this._headerCollapsed=collapsed;
        this._headerTransitionUntil=performance.now()+380;
        this._syncHeader();
      }
      this._scrollAnchor=y;
    }
    set hass(h) {
      this._hass=h;
      if (h && this.isConnected && !this.started) this.load();
      else this.passHass();
    }
    async load() {
      if(this.started) return;
      this.started=true;
      this.error='';
      const modules=[
        ['finance-tracker-panel-2-3-1-s22','/api/finance_tracker/ui/ledger.js?v=41_1_1_J12_HF1'],
        ['finance-tracker-planning-panel-s22','/api/finance_tracker/ui/planning.js?v=41_1_1_J12_HF1'],
        ['finance-tracker-templates-panel-s24','/api/finance_tracker/ui/templates.js?v=41_1_1_J12_HF1'],
        ['finance-tracker-closing-panel-v21','/api/finance_tracker/ui/closing.js?v=41_1_1_J12_HF1']
      ];
      try {
        for(const [name,url] of modules) {
          if(!customElements.get(name)) {
            await new Promise((resolve,reject)=>{
              const script=document.createElement('script');
              const timer=setTimeout(()=>{script.remove();reject(new Error('Zeitüberschreitung beim Laden: '+url));},12000);
              script.src=url; script.onload=()=>{clearTimeout(timer);resolve();};
              script.onerror=()=>{clearTimeout(timer);reject(new Error('Frontend-Modul nicht ladbar: '+url));};
              document.head.appendChild(script);
            });
          }
          if(!customElements.get(name)) await Promise.race([customElements.whenDefined(name),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Modul nicht registriert: '+name)),12000))]);
        }
        this.ready=true;
        this.mountOnce();
      } catch(e) {
        this.error=e.message||String(e);
        this.started=false;
        const status=this.shadowRoot.getElementById('status');
        if(status) {status.replaceChildren(document.createTextNode('Finance Tracker konnte nicht geladen werden: '+this.error+' '));const retry=document.createElement('button');retry.textContent='Erneut versuchen';retry.type='button';retry.addEventListener('click',()=>this.load());status.appendChild(retry);status.setAttribute('role','alert');}
      }
    }
    renderShell() {
      // Only rebuild on initial connection; never rebuild on a tab change.
      if(this.shadowRoot.getElementById('content')) return;
      this.shadowRoot.innerHTML=`<style>
        :host{display:block;min-height:100vh;background:var(--primary-background-color,#111827);color:var(--primary-text-color,#e8edf3);font:inherit}
        *{box-sizing:border-box}
        .bar{position:sticky;top:0;z-index:200000;transition:transform .28s cubic-bezier(.22,1,.36,1);will-change:transform;background:var(--card-background-color,#1e293b);border-bottom:1px solid var(--divider-color,#394657);padding:12px clamp(12px,3vw,26px)}
        .inner{max-width:1180px;margin:auto;display:flex;align-items:center;gap:14px;flex-wrap:wrap;position:relative;padding-right:48px}
        .brand{font-size:18px;font-weight:750;letter-spacing:.1px}
        .tag{font-size:11px;color:var(--secondary-text-color,#98a4b7)}
        .nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-left:auto;min-width:min(100%,360px)}
        button{font:inherit;padding:9px 15px;border-radius:10px;border:1px solid var(--divider-color,#394657);background:transparent;color:inherit;cursor:pointer;min-height:40px}
        button[aria-selected="true"]{background:var(--primary-color,#4c9aff);color:#fff;border-color:transparent}
        button:focus-visible{outline:2px solid var(--primary-color,#4c9aff);outline-offset:2px}
        .subnav{display:none!important}
        .help-button{position:absolute;right:0;top:0;width:40px;min-width:40px;height:40px;padding:0;border-radius:50%;display:grid;place-items:center;font-size:20px;font-weight:800;background:var(--secondary-background-color,#29364a)}
        .help-overlay{position:fixed;inset:0;z-index:300000;display:flex;align-items:center;justify-content:center;padding:14px}
        .help-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.74)}
        .help-dialog{position:relative;width:min(100%,720px);max-height:min(88dvh,820px);display:flex;flex-direction:column;background:var(--card-background-color,#1b2633);border:1px solid var(--divider-color,#3d4b59);border-radius:17px;overflow:hidden;box-shadow:0 18px 70px #0009}
        .help-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px 17px;border-bottom:1px solid var(--divider-color,#394657)}
        .help-head strong{font-size:18px}.help-head button{border:0;background:transparent;padding:5px 9px}
        .help-body{overflow-y:auto;overscroll-behavior:contain;padding:17px;line-height:1.45}
        .help-body h3{font-size:15px;margin:20px 0 7px;color:var(--primary-color,#4c9aff)}.help-body h3:first-child{margin-top:0}
        .help-body p{margin:5px 0 10px;color:var(--secondary-text-color,#a8b2c1)}.help-body ol,.help-body ul{margin:7px 0 12px;padding-left:22px}.help-body li{margin:5px 0}
        .help-note{padding:11px 12px;border:1px solid var(--divider-color,#394657);border-radius:10px;background:var(--secondary-background-color,#29364a)}
        .info{max-width:1180px;margin:20px auto;padding:15px;border:1px solid var(--divider-color,#394657);border-radius:12px}
        [hidden]{display:none!important}
        @media(max-width:540px){.bar{padding:10px}.inner{gap:8px;padding-right:44px}.brand{font-size:16px}.nav{width:100%;margin-left:0}.nav button{padding:9px 5px;font-size:12px;min-width:0}.help-dialog{max-height:92dvh}.help-body{padding:14px}}
      </style>
      <header class="bar"><div class="inner"><div><div class="brand">Finance Tracker <span class="tag">4.1.1</span></div><div class="tag">Haushaltsfinanzen · HA2.0</div></div><button type="button" id="help-open" class="help-button" aria-label="Hilfe öffnen" title="Hilfe">?</button>
      <nav class="nav" aria-label="Finance Tracker Bereiche">
      <button type="button" data-tab="master" aria-selected="false" aria-controls="ledger">Stammdaten</button>
      <button type="button" data-tab="planning" aria-selected="false" aria-controls="planning">Finanzplanung</button>
      <button type="button" data-tab="ledger" aria-selected="true" aria-controls="ledger">Monatsübersicht</button>
      <button type="button" data-tab="closing" aria-selected="false" aria-controls="closing">Abschluss</button>
      </nav></div></header>
      <div id="status" class="info" role="status">Oberfläche wird geladen …</div>
      <div id="content" hidden><section id="templates" aria-label="Monatsvorlage" hidden></section><section id="planning" aria-label="Finanzplanung" hidden></section><section id="ledger" aria-label="Monatsübersicht"></section><section id="closing" aria-label="Abschluss" hidden></section></div>
      <div id="help-overlay" class="help-overlay" hidden><div class="help-backdrop" data-help-close></div><section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><header class="help-head"><div><div class="tag">Finance Tracker 4.1.1</div><strong id="help-title">Hilfe & Ersteinrichtung</strong></div><button type="button" data-help-close aria-label="Hilfe schließen">✕</button></header><div class="help-body"><h3>Ersteinrichtung</h3><ol><li>Unter <strong>Stammdaten → Kontoinhaber</strong> zuerst alle benötigten Inhaber anlegen.</li><li>Unter <strong>Stammdaten → Kontenverwaltung</strong> die Konten mit Inhaber, Kontotyp, Bank, Eröffnungsdatum und Eröffnungsbestand anlegen.</li><li>Unter <strong>Stammdaten → Kategorien</strong> die benötigten Ober- und Unterkategorien prüfen oder ergänzen.</li><li>Danach kann unter <strong>Finanzplanung</strong> ein Monatsplan aufgebaut oder eine Monatsvorlage gepflegt werden.</li></ol><div class="help-note"><strong>Eröffnungsbestand:</strong> Der Stand gilt zum angegebenen Eröffnungsdatum und bildet die Ausgangsbasis für alle späteren Buchungen.</div><h3>Konten & Inhaber verwalten</h3><p>Kontoinhaber können angelegt, umbenannt und gelöscht werden. Löschen ist nur möglich, wenn kein Konto mehr zugeordnet ist.</p><p>Konten können angelegt und bearbeitet werden. Ein Konto kann nur vollständig gelöscht werden, solange keine Buchungen, Planungen, Vorlagen oder Monatsabschlüsse darauf verweisen. So bleiben historische Daten und Plan-Ist-Zuordnungen intakt.</p><h3>Buchungen</h3><p>Neue Buchungen werden in der Monatsübersicht erfasst. Einnahme/Ausgabe bestimmt das Vorzeichen; der Betrag selbst wird positiv eingegeben. Umbuchungen verschieben Geld zwischen zwei Konten.</p><h3>Finanzplanung & Plan-Ist</h3><p>Monatspositionen bilden den Plan. Buchungen können bereits beim Erfassen oder später im Plan-Ist-Vergleich einer Planposition zugeordnet werden. Vorlagen dienen als wiederverwendbare Grundlage für weitere Monate.</p><h3>Monatsabschluss</h3><p>Vor dem Abschluss Kontenstände, offene Planpositionen, Abweichungen und Zuordnungslücken prüfen. Abgeschlossene Monate sind geschützt und sollen nur über nachvollziehbare Korrekturen verändert werden.</p><h3>Empfohlene Reihenfolge</h3><p>Kontoinhaber → Konten → Kategorien → Monatsplanung/Vorlage → Buchungen → Plan-Ist-Prüfung → Monatsabschluss.</p></div></section></div>`;
      if(typeof ResizeObserver!=='undefined'){this._headerObserver?.disconnect();this._headerObserver=new ResizeObserver(()=>this._syncHeader());this._headerObserver.observe(this.shadowRoot.querySelector('.bar'));}
      this.shadowRoot.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>this.selectTab(b.dataset.tab)));
      const help=this.shadowRoot.getElementById('help-overlay');
      const closeHelp=()=>{if(!help)return;help.hidden=true;this.shadowRoot.getElementById('help-open')?.focus();};
      this.shadowRoot.getElementById('help-open')?.addEventListener('click',()=>{if(!help)return;this._headerCollapsed=false;this._syncHeader();help.hidden=false;requestAnimationFrame(()=>help.querySelector('[data-help-close]')?.focus());});
      help?.querySelectorAll('[data-help-close]').forEach(b=>b.addEventListener('click',closeHelp));
      help?.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeHelp();}});
      this.shadowRoot.addEventListener('ft-open-plan-actual',e=>{
        const planning=this.shadowRoot.querySelector('#planning > *');
        if(!planning)return;
        const detail=e.detail||{};
        planning.month=detail.month||planning.month;
        planning.section='actual';planning.view='actual';this.planningSubview='actual';
        planning.matchTransaction='';planning.matchPosition='';
        this.selectTab('planning');
        Promise.resolve(planning.refresh?.()).then(()=>{
          const position=detail.position_id;
          const transaction=detail.transaction_id;
          if(transaction){
            const tx=planning.planActual?.transactions?.find(t=>t.id===transaction);
            if(tx&&Number(tx.unallocated_cents)>0){planning.matchTransaction=transaction;planning.matchPosition=position||'';}
          }
          planning.render?.();
          const root=planning.shadowRoot;
          const target=position?[...root?.querySelectorAll('.plan-actual-item')||[]].find(el=>el.querySelector(`[data-match-position="${CSS.escape(position)}"]`)):null;
          (target||root?.getElementById('plan-actual-form')||root?.querySelector('.plan-actual-list'))?.scrollIntoView({behavior:'smooth',block:'center'});
        }).catch(e=>console.warn('Plan-Ist-Absprung fehlgeschlagen',e));
      });
      this.shadowRoot.addEventListener('ft-open-ledger',e=>{
        const ledger=this.shadowRoot.querySelector('#ledger > *');
        if(ledger){ledger.month=e.detail?.month||ledger.month;ledger.tab='by_account';ledger.focusAccountId=e.detail?.account_id||'';this.ledgerSubview='by_account';ledger.message='Buchungen zur Kontokorrektur prüfen. Eine Korrektur erfolgt ausschließlich über eine nachvollziehbare Buchung; bestätigte Konten sind gesperrt.';}
        this.selectTab('ledger');
      });
      this.shadowRoot.addEventListener('ft-booking-search',()=>{if(this.active==='ledger')this._openBookingSearch();});
      this.shadowRoot.addEventListener('ft-dialog-request',e=>{
        const owner=e.detail?.owner;
        for(const el of this.shadowRoot.querySelectorAll('#templates > *, #planning > *, #ledger > *, #closing > *')){
          if(el!==owner)el.abortTransient?.();
        }
      });

    }
    mountOnce() {
      const content=this.shadowRoot.getElementById('content');
      if(!content || content.dataset.mounted==='yes') return;
      content.dataset.mounted='yes';
      const templates=document.createElement('finance-tracker-templates-panel-s24');
      const planning=document.createElement('finance-tracker-planning-panel-s22');
      const ledger=document.createElement('finance-tracker-panel-2-3-1-s22');
      const closing=document.createElement('finance-tracker-closing-panel-v21');
      content.querySelector('#templates').appendChild(templates);
      content.querySelector('#planning').appendChild(planning);
      content.querySelector('#ledger').appendChild(ledger);
      content.querySelector('#closing').appendChild(closing);
      content.hidden=false;
      this.shadowRoot.getElementById('status').hidden=true;
      // Observe the ledger's own shadow tree: CSS z-index cannot outrank
      // the unified header across the separate shadow-root stacking contexts.
      this._dialogObserver?.disconnect();
      this._dialogObserver=new MutationObserver(()=>this._syncDialogLayer());
      this._dialogObserver.observe(ledger.shadowRoot,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
      this._syncDialogLayer();
      this._installSubnavObservers();
      this.selectTab(this.active);
      this.passHass();
    }
    selectTab(tab) {
      if(!['templates','planning','ledger','master','closing'].includes(tab)) return;
      const targetTab=tab==='master'?'ledger':tab;
      const old=this.active;
      const oldPanel=this.shadowRoot.querySelector('#'+(old==='master'?'ledger':old)+' > *');
      const targetPanel=this.shadowRoot.querySelector('#'+targetTab+' > *');
      if(old!==tab){
        // Close transient editors before a view switch; no pending form is saved.
        oldPanel?.abortTransient?.();
        if(['planning','ledger','closing','master'].includes(old)&&['planning','ledger','closing','master'].includes(tab)&&oldPanel?.month&&targetPanel?.month!==oldPanel.month){
          targetPanel.month=oldPanel.month;
        }
      }
      this.active=tab;
      this._syncDialogLayer();
      const switchToken=this._switchToken=(this._switchToken||0)+1;
      this._reconcileMonth(tab,targetPanel,switchToken);
      for(const key of ['templates','planning','ledger','closing']) {
        const section=this.shadowRoot.getElementById(key);
        const button=this.shadowRoot.querySelector(`[data-tab="${key}"]`);
        if(section) section.hidden=(key!==targetTab);
        if(button) button.setAttribute('aria-selected',String(key===tab));
      }
      const masterButton=this.shadowRoot.querySelector('[data-tab="master"]');if(masterButton)masterButton.setAttribute('aria-selected',String(tab==='master'));
      if(tab==='master'||tab==='ledger'){
        targetPanel.context=tab==='master'?'master':'ledger';
        targetPanel.tab=tab==='master'?this.masterSubview:this.ledgerSubview;
        targetPanel.render?.();
      }
      if(tab==='planning'){const planning=this.shadowRoot.querySelector('#planning > *');if(planning)planning.section=this.planningSubview==='templates'?'planning':this.planningSubview;}
      this.renderSubnav();
      // Refresh the newly visible area on every main-view switch, even when
      // its month was already selected. Preserve the shared month and avoid
      // remounting the child element (which would reset the user's navigation).
      // Refresh is performed by _reconcileMonth after allowed periods are resolved.
      if(old===tab&&this.ready&&targetPanel?._hass){
        if(tab==='ledger')targetPanel.collapseLedgerGroups?.(false);
        targetPanel.refresh?.();
      }
    }
    async _reconcileMonth(tab,panel,token){
      if(!this._hass||!panel)return;
      try{
        const data=await this._hass.callWS({type:'finance_tracker/planning_v3'});
        if(token!==this._switchToken)return;
        const periods=(data.periods||[]).filter(p=>/^\d{4}-(0[1-9]|1[0-2])$/.test(p.period));
        const released=(data.released_plan_months||[]).slice().sort();
        const planned=periods.filter(p=>['draft','released'].includes(p.status)).map(p=>p.period).sort();
        const following=planned.length?this._nextMonth(planned[planned.length-1]):null;
        this._allowedMonths={released,planning:[...new Set([...planned,...(following?[following]:[])])].sort()};
        // No forced month switch. The visible month must always equal the loaded data month.
        panel.allowedMonths=null;
        panel.releasedPlanMonths=released;
        if(tab==='planning'){
          const tpl=this.shadowRoot.querySelector('#templates > *');
          if(tpl&&tpl.month!==panel.month)tpl.month=panel.month;
        }
      }catch(e){console.warn('Finance Tracker: Planstatus nicht verfügbar',e);}
      if(token===this._switchToken&&panel?._hass)await panel.refresh?.();
    }
    _nextMonth(m){const [y,n]=m.split('-').map(Number);return n===12?`${y+1}-01`:`${y}-${String(n+1).padStart(2,'0')}`;}
    _choices(){
      return this.active==='planning'?[['planning','Monatsplanung'],['templates','Monatsvorlage'],['development','Monatsentwicklung'],['actual','Plan-Ist-Vergleich']]:
        this.active==='ledger'?[['overview','Buchungen nach Kategorie'],['by_account','Buchungen nach Konto'],['proposals','Vorschläge aus Planung'],['changes','Änderungen']]:
        this.active==='master'?[['accounts','Kontenverwaltung'],['owners','Kontoinhaber'],['categories','Kategorien']]:[];
    }
    _installSubnavObservers(){
      this._subnavObservers??=new Map();
      for(const key of ['planning','templates','ledger','closing']){
        const child=this.shadowRoot.querySelector('#'+key+' > *');
        if(!child?.shadowRoot||this._subnavObservers.has(key))continue;
        const observer=new MutationObserver(()=>this._placeSubnav(key));
        observer.observe(child.shadowRoot,{childList:true,subtree:false});
        this._subnavObservers.set(key,observer);
        this._placeSubnav(key);
      }
    }
    _placeSubnav(key){
      const child=this.shadowRoot.querySelector('#'+key+' > *');
      const root=child?.shadowRoot;
      const main=root?.querySelector('main.wrap');
      if(!main)return;
      if(key==='closing'){if(!root.getElementById('ft-closing-sticky')){const style=document.createElement('style');style.id='ft-closing-sticky';style.textContent='.header{position:sticky!important;top:var(--ft-sticky-top,0px)!important;z-index:1000!important;background:var(--primary-background-color,#111827)}';root.append(style);}return;}
      // The child's render() replaces its shadow DOM. Restore the navigation
      // immediately after the month/header row without modifying child logic.
      if(!root.getElementById('ft-inline-nav-style')){
        const style=document.createElement('style');style.id='ft-inline-nav-style';
        style.textContent=`.sticky-header-group,.finance-head,.ft-page-head,.head{position:sticky!important;top:var(--ft-sticky-top,0px)!important;z-index:1000!important;transform:none!important;background:var(--primary-background-color,#111827)}
          .ft-inline-subnav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0 16px;width:100%;min-width:0}
          .ft-inline-subnav button{min-width:0;min-height:39px;padding:8px 7px;border-radius:10px;border:1px solid var(--divider-color,#394657);background:var(--card-background-color,#1e293b);color:var(--primary-text-color,#e8edf3);font:inherit;font-size:12px;line-height:1.3;overflow-wrap:anywhere;cursor:pointer}
          .ft-inline-subnav button.active{background:var(--primary-color,#4c9aff);color:white;border-color:transparent}
          .ft-inline-subnav button:focus-visible{outline:2px solid var(--primary-color,#4c9aff);outline-offset:2px}`;
        root.appendChild(style);
      }
      let nav=main.querySelector('.ft-inline-subnav');
      if(!nav){
        nav=document.createElement('nav');nav.className='ft-inline-subnav';nav.setAttribute('aria-label','Unteransichten');
        const header=main.querySelector('.sticky-header-group')||main.querySelector('.ft-page-head')||main.querySelector('header');
        if(header)header.insertAdjacentElement('afterend',nav);else main.prepend(nav);
        nav.addEventListener('click',e=>{
          const button=e.target.closest('button[data-sub]');if(button)this._chooseSubnav(button.dataset.sub);
        });
      }
      const belongs=(this.active==='planning'&&(key==='planning'||key==='templates'))||
        ((this.active==='master'||this.active==='ledger')&&key==='ledger');
      nav.hidden=!belongs;
      if(!belongs)return;
      const selected=this.active==='planning'?this.planningSubview:this.active==='master'?this.masterSubview:this.ledgerSubview;
      const choices=this._choices();
      const html=choices.map(([id,label])=>`<button type="button" data-sub="${id}" class="${selected===id?'active':''}" aria-current="${selected===id?'page':'false'}">${label}</button>`).join('');
      if(nav.innerHTML!==html)nav.innerHTML=html;
    }
    _chooseSubnav(id){
      if(!this._choices().some(([key])=>key===id))return;
      if(this.active==='planning'){
        this.planningSubview=id;
        for(const key of ['planning','templates'])this.shadowRoot.getElementById(key).hidden=(id==='templates'?key!=='templates':key!=='planning');
        const panel=this.shadowRoot.querySelector('#'+(id==='templates'?'templates':'planning')+' > *');
        if(id!=='templates'){panel.section=id;panel.view=id==='actual'?'actual':id==='development'?'history':'overview';}
        panel?.refresh?.();
      }else{
        const ledger=this.shadowRoot.querySelector('#ledger > *');
        if(this.active==='master')this.masterSubview=id;else this.ledgerSubview=id;
        if(id==='by_account')ledger.focusAccountId='';
        ledger.tab=id;ledger.context=this.active==='master'?'master':'ledger';ledger.render?.();
      }
      this.renderSubnav();
    }
    _searchNormalize(value){return String(value??'').toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
    _searchDistance(a,b){
      if(Math.abs(a.length-b.length)>3)return 4;
      let prev=Array.from({length:b.length+1},(_,i)=>i);
      for(let i=1;i<=a.length;i++){
        const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=next;
      }return prev[b.length];
    }
    _searchScore(transaction,query){
      const fields=[transaction.description,transaction.category_name,transaction.account_name,transaction.from_name,transaction.to_name];
      const normalized=this._searchNormalize(fields.filter(Boolean).join(' '));
      const terms=this._searchNormalize(query).split(' ').filter(Boolean);
      if(!terms.length)return 1;
      const words=normalized.split(' ');
      let score=0;
      for(const term of terms){
        if(normalized.includes(term)){score+=term.length>=3?12:6;continue;}
        if(term.length<3)return 0;
        const best=Math.min(4,...words.map(w=>this._searchDistance(term,w)));
        if(best<=Math.min(2,Math.floor(term.length/4)))score+=5-best;
        else return 0;
      }
      return score;
    }
    _openBookingSearch(){
      const ledger=this.shadowRoot.querySelector('#ledger > *');
      ledger?.collapseLedgerGroups?.(true);
      const month=ledger?.month;
      const records=ledger?.data?.transactions;
      if(!month||!Array.isArray(records)){return;}
      this.shadowRoot.getElementById('ft-booking-search')?.remove();
      const overlay=document.createElement('div');overlay.id='ft-booking-search';
      overlay.innerHTML=`<style>
        #ft-booking-search{position:fixed;inset:0;z-index:300000;display:grid;place-items:center;padding:12px;background:#0009}
        .ft-search-dialog{background:var(--card-background-color,#1e293b);color:var(--primary-text-color,#e8edf3);border:1px solid var(--divider-color,#394657);border-radius:14px;width:min(620px,100%);max-height:min(85dvh,780px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 50px #0006}
        .ft-search-head{padding:16px;display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid var(--divider-color,#394657)}
        .ft-search-head h2{font-size:18px;margin:0}.ft-search-head small{display:block;font-size:12px;opacity:.75;margin-top:4px}
        .ft-search-input{margin:14px 16px;padding:12px;border:1px solid var(--divider-color,#394657);border-radius:10px;background:var(--primary-background-color,#111827);color:inherit;font:inherit;min-width:0}
        .ft-search-results{padding:0 16px 16px;overflow:auto;overscroll-behavior:contain}
        .ft-search-result{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;margin:6px 0;padding:11px;border-radius:10px;border:1px solid var(--divider-color,#394657);background:transparent;color:inherit;cursor:pointer}
        .ft-search-result span{min-width:0;overflow-wrap:anywhere}.ft-search-result small{display:block;opacity:.75;margin-top:4px;font-size:12px}.ft-search-result strong{white-space:nowrap;text-align:right}
        .ft-search-result:focus-visible{outline:2px solid var(--primary-color,#4c9aff)}
      </style><div class="ft-search-dialog" role="dialog" aria-modal="true" aria-labelledby="ft-search-title"><div class="ft-search-head"><div><h2 id="ft-search-title">Buchungssuche</h2><small>${ledger.label?.(month)||month} · Stichwort und ähnliche Begriffe</small></div><button type="button" data-search-close aria-label="Suche schließen">✕</button></div><input class="ft-search-input" type="search" placeholder="Beschreibung, Kategorie oder Konto suchen …" aria-label="Buchungen durchsuchen"/><div class="ft-search-results" role="list"></div></div>`;
      this.shadowRoot.append(overlay);
      const input=overlay.querySelector('input'),results=overlay.querySelector('.ft-search-results');
      const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const close=()=>{overlay.remove();document.removeEventListener('keydown',onKey,true);};
      const onKey=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
      document.addEventListener('keydown',onKey,true);
      overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-search-close]'))close();});
      const render=()=>{
        const query=input.value.trim();
        const found=records.map(t=>({t,score:this._searchScore(t,query)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||String(b.t.booked).localeCompare(String(a.t.booked))).slice(0,100);
        results.innerHTML=found.length?found.map(({t})=>`<button type="button" class="ft-search-result" data-search-id="${escape(t.id)}"><span><b>${escape(t.description)}</b><small>${escape(t.booked)} · ${escape(t.category_name||'Umbuchung')} · ${escape(t.account_name||t.from_name||'')}</small></span><strong>${escape(ledger.money?.(t.amount_cents)||'')}</strong></button>`).join(''):'<p>Keine passenden Buchungen im ausgewählten Monat.</p>';
      };
      input.addEventListener('input',render);
      results.addEventListener('click',e=>{
        const btn=e.target.closest('[data-search-id]');
        if(!btn)return;
        const tx=records.find(t=>String(t.id)===btn.dataset.searchId);
        if(!tx)return;
        // Use the same navigation path as a manual click on "Buchungen nach Konto".
        // The child ledger then opens the selected transaction directly by ID; no DOM-button lookup.
        close();
        this._chooseSubnav('by_account');
        if(typeof ledger.openTransactionFromSearch!=='function'){
          ledger.message='Buchung konnte nicht geöffnet werden: Frontend-Modul nicht auf dem erwarteten Versionsstand.';
          ledger.render();
          this.renderSubnav();
          return;
        }
        Promise.resolve(ledger.openTransactionFromSearch(tx.id)).then(()=>{
          this.ledgerSubview='by_account';
          this.renderSubnav();
        }).catch(error=>{
          ledger.message='Buchung konnte nicht geöffnet werden: '+(error.message||String(error));
          ledger.render();
          this.ledgerSubview='by_account';
          this.renderSubnav();
        });
      });
      render();input.focus();
    }
    renderSubnav(){
      if(this.active==='planning')for(const key of ['planning','templates'])this.shadowRoot.getElementById(key).hidden=(this.planningSubview==='templates'?key!=='templates':key!=='planning');
      for(const key of ['planning','templates','ledger','closing'])this._placeSubnav(key);
    }
    passHass() {
      if(!this.ready || !this._hass) return;
      for(const child of this.shadowRoot.querySelectorAll('#templates > *, #planning > *, #ledger > *, #closing > *')) child.hass=this._hass;
    }
  }
  customElements.define(tag,Unified);
})();
