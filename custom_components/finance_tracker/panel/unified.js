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
      button.ft-pencil,button.ft-trash{box-sizing:border-box!important;display:inline-grid!important;place-items:center!important;flex:0 0 32px!important;width:32px!important;min-width:32px!important;max-width:32px!important;height:32px!important;min-height:32px!important;max-height:32px!important;padding:0!important;margin:0!important;font-size:17px!important;line-height:1!important;border-radius:8px!important}button.ft-trash{color:#fca5a5!important;border:1px solid #b45353!important}
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
  const tag = 'finance-tracker-unified-panel-v422';
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
      bar.style.transform=this._headerCollapsed?`translate3d(0,-${height}px,0)`:'translate3d(0,0,0)';
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
        this._headerTransitionUntil=performance.now()+460;
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
        ['finance-tracker-panel-v422','/api/finance_tracker/ui/ledger.js?v=4_2_2'],
        ['finance-tracker-planning-panel-v422','/api/finance_tracker/ui/planning.js?v=4_2_2'],
        ['finance-tracker-templates-panel-v422','/api/finance_tracker/ui/templates.js?v=4_2_2'],
        ['finance-tracker-closing-panel-v422','/api/finance_tracker/ui/closing.js?v=4_2_2']
      ];
      try {
        for(const [name,url] of modules) {
          if(customElements.get(name))continue;
          let lastError=null;
          // A loaded script is not necessarily an executed/registered component.
          // Reload with a unique URL when a stale intermediary cache returns old JS.
          for(let attempt=0;attempt<2&&!customElements.get(name);attempt++){
            const requestUrl=url+'&ft_retry='+Date.now()+'_'+attempt;
            let runtimeError=null;
            const capture=e=>{if(!runtimeError)runtimeError=e.message||String(e.error||e);};
            window.addEventListener('error',capture);
            try{
              await new Promise((resolve,reject)=>{
                const script=document.createElement('script');
                const timer=setTimeout(()=>{script.remove();reject(new Error('Zeitüberschreitung beim Laden: '+requestUrl));},12000);
                script.src=requestUrl;
                script.onload=()=>{clearTimeout(timer);resolve();};
                script.onerror=()=>{clearTimeout(timer);reject(new Error('Frontend-Modul nicht ladbar: '+requestUrl));};
                document.head.appendChild(script);
              });
              // customElements.define() runs synchronously for these classic scripts.
              if(!customElements.get(name))lastError=new Error('Modul nicht registriert: '+name+(runtimeError?' ('+runtimeError+')':''));
            }catch(e){lastError=e;}
            finally{window.removeEventListener('error',capture);}
          }
          if(!customElements.get(name))throw lastError||new Error('Modul nicht registriert: '+name);
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
        .bar{position:sticky;top:0;z-index:200000;transition:transform .42s cubic-bezier(.4,0,.2,1)!important;will-change:transform;backface-visibility:hidden;background:var(--card-background-color,#1e293b);border-bottom:1px solid var(--divider-color,#394657);padding:12px clamp(12px,3vw,26px)}
        @media (prefers-reduced-motion:reduce){.bar{transition:none!important}}
        .inner{max-width:1180px;margin:auto;display:flex;align-items:center;gap:14px;flex-wrap:wrap;position:relative;padding-right:0}
        .brand{font-size:18px;font-weight:750;letter-spacing:.1px}
        .tag{font-size:11px;color:var(--secondary-text-color,#98a4b7)}
        .nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-left:0;width:100%;min-width:0;flex:0 0 100%}
        button{font:inherit;padding:9px 15px;border-radius:10px;border:1px solid var(--divider-color,#394657);background:transparent;color:inherit;cursor:pointer;min-height:40px}
        button[aria-selected="true"]{background:var(--primary-color,#4c9aff);color:#fff;border-color:transparent}
        button:focus-visible{outline:2px solid var(--primary-color,#4c9aff);outline-offset:2px}
        .subnav{display:none!important}
        .help-button{position:absolute;right:0;top:0;width:28px;min-width:28px;height:28px;min-height:28px;padding:0;border-radius:50%;display:grid;place-items:center;font-size:15px;font-weight:800;background:var(--secondary-background-color,#29364a)}
        .help-overlay{position:fixed;inset:0;z-index:300000;display:flex;align-items:center;justify-content:center;padding:clamp(4px,1vw,12px)}
        .help-backdrop{position:absolute;inset:0;background:#000b}
        .help-dialog{position:relative;width:min(100%,1200px);height:100%;min-height:0;display:flex;flex-direction:column;background:var(--card-background-color,#1b2633);border:1px solid var(--divider-color,#394657);border-radius:14px;overflow:hidden;box-shadow:0 18px 70px #0009}
        .help-head{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--divider-color,#394657);flex:none}.help-head strong{font-size:18px}.help-head button{width:40px;padding:0}
        .help-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:8px 12px;border-bottom:1px solid var(--divider-color,#394657);flex:none}.help-nav button{min-width:0;padding:6px;font-size:13px;overflow-wrap:anywhere}.help-nav button:first-child{grid-column:1/-1}
        .help-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:clamp(12px,3vw,28px);line-height:1.55;touch-action:pan-y}.help-page{max-width:920px;margin:auto;outline:none}.help-page h2{font-size:clamp(21px,4vw,30px);line-height:1.2;margin:5px 0 10px}.help-page p{margin:8px 0;color:var(--secondary-text-color,#a8b2c1)}.help-kicker{font-size:11px;letter-spacing:1.2px;font-weight:700;color:var(--primary-color,#4c9aff)}
        .help-section{margin:18px 0;padding:14px;border:1px solid var(--divider-color,#394657);border-radius:12px;min-width:0}.help-section h3{margin:0 0 12px;font-size:17px}.help-flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:8px}.help-flow>div{display:grid;grid-template-columns:30px 1fr;gap:3px 8px;align-items:center;padding:10px;border:1px solid var(--divider-color,#394657);border-radius:10px;background:var(--secondary-background-color,#29364a)}.help-step{grid-row:span 2;color:var(--primary-color,#4c9aff);font-weight:800;font-size:19px}.help-flow small{grid-column:2;color:var(--secondary-text-color,#a8b2c1)}
        .help-example,.help-note{margin:12px 0;padding:12px;border:1px solid var(--divider-color,#394657);border-radius:10px;background:var(--secondary-background-color,#29364a)}.help-example>strong{display:block;margin:6px 0}.help-note{border-left:3px solid var(--primary-color,#4c9aff)}.help-note p{margin-bottom:0}.help-rows{margin:8px 0 0}.help-rows>div{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:10px;padding:8px 0;border-bottom:1px solid var(--divider-color,#394657)}.help-rows dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.help-rows dt{overflow-wrap:anywhere}.help-meter{height:10px;border-radius:8px;background:var(--divider-color,#394657);overflow:hidden}.help-meter span{display:block;height:100%;background:#299b78}.help-meter.over span{background:#d85a4e}.help-months{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}.help-months span{text-align:center;border:1px solid var(--divider-color,#394657);border-radius:7px;padding:5px 0;font-size:11px}.help-months .on{background:#166e61;color:white}.help-chart{display:block;width:100%;max-width:600px;margin:auto}.help-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px}.help-transfer,.help-decision>div{display:flex;align-items:center;justify-content:space-around;gap:8px;flex-wrap:wrap;text-align:center}.help-transfer span,.help-decision span{padding:10px;border:1px solid var(--divider-color,#394657);border-radius:8px}.help-decision{text-align:center;padding:10px}.help-decision>div{margin-top:10px}
        @media (orientation:landscape) and (max-height:520px){.help-dialog{display:grid;grid-template-columns:minmax(150px,25%) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.help-head{grid-column:1/-1}.help-nav{grid-template-columns:1fr;align-content:start;border-bottom:0;border-right:1px solid var(--divider-color,#394657);padding:5px;gap:4px}.help-nav button{min-height:32px;font-size:12px}.help-body{padding:12px}}
        .info{max-width:1180px;margin:20px auto;padding:15px;border:1px solid var(--divider-color,#394657);border-radius:12px}
        [hidden]{display:none!important}
        @media(max-width:540px){.bar{padding:10px}.inner{gap:8px;padding-right:0}.brand{font-size:16px}.nav{width:100%;margin-left:0}.nav button{padding:9px 5px;font-size:12px;min-width:0}.help-body{padding:12px}}
      button.ft-pencil,button.ft-trash{box-sizing:border-box!important;display:inline-grid!important;place-items:center!important;flex:0 0 32px!important;width:32px!important;min-width:32px!important;max-width:32px!important;height:32px!important;min-height:32px!important;max-height:32px!important;padding:0!important;margin:0!important;font-size:17px!important;line-height:1!important;border-radius:8px!important}button.ft-trash{color:#fca5a5!important;border:1px solid #b45353!important}
</style>
      <header class="bar"><div class="inner"><div><div class="brand">Finance Tracker <span class="tag">__FT_MANIFEST_VERSION__</span></div><div class="tag">Haushaltsfinanzen · HA2.0</div></div><button type="button" id="help-open" class="help-button" aria-label="Hilfe öffnen" title="Hilfe">?</button>
      <nav class="nav" aria-label="Finance Tracker Bereiche">
      <button type="button" data-tab="master" aria-selected="false" aria-controls="ledger">Stammdaten</button>
      <button type="button" data-tab="planning" aria-selected="false" aria-controls="planning">Finanzplanung</button>
      <button type="button" data-tab="ledger" aria-selected="true" aria-controls="ledger">Monatsübersicht</button>
      <button type="button" data-tab="closing" aria-selected="false" aria-controls="closing">Abschluss</button>
      </nav></div></header>
      <div id="status" class="info" role="status">Oberfläche wird geladen …</div>
      <div id="content" hidden><section id="templates" aria-label="Monatsvorlage" hidden></section><section id="planning" aria-label="Finanzplanung" hidden></section><section id="ledger" aria-label="Monatsübersicht"></section><section id="closing" aria-label="Abschluss" hidden></section></div>
      <div id="help-overlay" class="help-overlay" hidden><div class="help-backdrop" data-help-close></div><section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><header class="help-head"><div><div class="tag">Finance Tracker __FT_MANIFEST_VERSION__</div><strong id="help-title">Anwenderhandbuch</strong></div><button type="button" data-help-close aria-label="Hilfe schließen">✕</button></header><nav class="help-nav" role="tablist" aria-label="Hilfekapitel"><button type="button" role="tab" id="help-tab-0" data-help-tab="0" aria-controls="help-page-0" aria-selected="false" tabindex="-1"><span aria-hidden="true">◎</span> Ersteinrichtung & Grundlagen</button><button type="button" role="tab" id="help-tab-1" data-help-tab="1" aria-controls="help-page-1" aria-selected="false" tabindex="-1"><span aria-hidden="true">▤</span> Stammdaten</button><button type="button" role="tab" id="help-tab-2" data-help-tab="2" aria-controls="help-page-2" aria-selected="false" tabindex="-1"><span aria-hidden="true">▥</span> Finanzplanung</button><button type="button" role="tab" id="help-tab-3" data-help-tab="3" aria-controls="help-page-3" aria-selected="false" tabindex="-1"><span aria-hidden="true">▣</span> Monatsübersicht</button><button type="button" role="tab" id="help-tab-4" data-help-tab="4" aria-controls="help-page-4" aria-selected="false" tabindex="-1"><span aria-hidden="true">✓</span> Abschluss</button></nav><div class="help-body"><article class="help-page" id="help-page-0" role="tabpanel" aria-labelledby="help-tab-0" tabindex="0" hidden><div class="help-kicker">KAPITEL 00</div><h2>Erste Schritte</h2><p>Vom Startsaldo zum ersten abgeschlossenen Monat.</p><section class="help-section"><h3>0.1 Einrichtung</h3><div class="help-flow" role="list"><div role="listitem"><span class="help-step">01</span><strong>Inhaber</strong><small>Personen anlegen</small></div><div role="listitem"><span class="help-step">02</span><strong>Konten</strong><small>Bank, Konto und Startsaldo</small></div><div role="listitem"><span class="help-step">03</span><strong>Kategorien</strong><small>Einnahmen und Ausgaben strukturieren</small></div><div role="listitem"><span class="help-step">04</span><strong>Planung</strong><small>Vorlage und Monatsplan</small></div><div role="listitem"><span class="help-step">05</span><strong>Buchen</strong><small>Geldbewegungen erfassen</small></div><div role="listitem"><span class="help-step">06</span><strong>Abschluss</strong><small>Salden abgleichen</small></div></div><aside class="help-note"><strong>ⓘ Gut zu wissen</strong><p>Startsaldo zum Eröffnungsdatum erfassen. Bereits darin enthaltene Umsätze nicht erneut buchen.</p></aside></section><section class="help-section"><h3>0.2 Das Datenmodell</h3><div class="help-example"><div class="help-kicker">BEISPIEL · FIKTIVE DATEN</div><strong>Ein Konto, zwei Buchungen</strong><dl class="help-rows"><div><dt>Startsaldo</dt><dd>1.000 €</dd></div><div><dt>Einnahme</dt><dd>+ 500 €</dd></div><div><dt>Ausgabe</dt><dd>− 200 €</dd></div><div><dt>Saldo</dt><dd>1.300 €</dd></div></dl></div><p>Konten zeigen, wo Geld liegt. Kategorien zeigen, wofür Geld verwendet wird. Planpositionen zeigen, was erwartet wird. Eine Umbuchung verändert die Verteilung zwischen Konten, nicht das Gesamtvermögen.</p></section><section class="help-section"><h3>0.3 Symbole und Bedienung</h3><dl class="help-rows"><div><dt>✎</dt><dd>Bearbeiten</dd></div><div><dt>🗑</dt><dd>Löschen / Storno / Archivierung je Kontext</dd></div><div><dt>＋</dt><dd>Hinzufügen</dd></div><div><dt>⌕</dt><dd>Buchung suchen</dd></div><div><dt>↻</dt><dd>Aktualisieren</dd></div><div><dt>＋ / −</dt><dd>Gruppe öffnen / schließen</dd></div></dl></section></article><article class="help-page" id="help-page-1" role="tabpanel" aria-labelledby="help-tab-1" tabindex="0" hidden><div class="help-kicker">KAPITEL 01</div><h2>Stammdaten verwalten</h2><p>Stabile Grundlagen für Buchungen, Planung und historische Auswertungen.</p><section class="help-section"><h3>1.1 Kontoinhaber und Konten</h3><div class="help-flow" role="list"><div role="listitem"><span class="help-step">01</span><strong>Inhaber</strong><small>Person zuordnen</small></div><div role="listitem"><span class="help-step">02</span><strong>Bank</strong><small>Konten gruppieren</small></div><div role="listitem"><span class="help-step">03</span><strong>Konto</strong><small>Typ, Datum, Startbestand</small></div></div><p>Favoriten erleichtern die Auswahl. Kontospezifische Toleranz und Automatikfreigabe im Bearbeitungsdialog pflegen. Inhaber mit Konten können nicht gelöscht werden.</p></section><section class="help-section"><h3>1.2 Konten löschen oder archivieren</h3><p>Papierkorb für unreferenzierte Konten ohne Eröffnungsbestand. Bei historischen Buchungen Konto ausgleichen und im Bearbeitungsdialog archivieren; weitere Referenzen können dies sperren. Archivierte Konten lassen sich reaktivieren.</p><aside class="help-note"><strong>ⓘ Gut zu wissen</strong><p>Umbuchungen benötigen zwei unterschiedliche Konten; automatische Umbuchungen benötigen beide Freigaben.</p></aside></section><section class="help-section"><h3>1.3 Kategorien und Hierarchie</h3><div class="help-example"><div class="help-kicker">BEISPIEL · FIKTIVE DATEN</div><strong>Ausgaben</strong><dl class="help-rows"><div><dt>Oberkategorie</dt><dd>Versicherungen</dd></div><div><dt>Unterkategorie</dt><dd>Kfz-Versicherung</dd></div><div><dt>Unterkategorie</dt><dd>Hausrat</dd></div></dl></div><p>Ober- und Unterkategorien nach Buchungsart pflegen. Stift bearbeitet, Plus ergänzt, Papierkorb prüft Referenzen.</p><div class="help-decision"><strong>Bestehende Referenzen?</strong><div><span>Nein → Löschen</span><span>Ja → Archivieren</span></div></div><p>Archivierte Kategorien bleiben historisch erhalten und stehen für neue Zuordnungen nicht zur Verfügung. Bei archivierter Oberkategorie zuerst diese reaktivieren.</p></section></article><article class="help-page" id="help-page-2" role="tabpanel" aria-labelledby="help-tab-2" tabindex="0" hidden><div class="help-kicker">KAPITEL 02</div><h2>Finanzen vorausschauend planen</h2><p>Vorlagen, Monatsplan, tatsächliche Buchungen und Abweichungen im Zusammenhang.</p><section class="help-section"><h3>2.1 Planungskreislauf</h3><div class="help-flow" role="list"><div role="listitem"><span class="help-step">01</span><strong>Monatsvorlage</strong><small>Wiederkehrende Positionen</small></div><div role="listitem"><span class="help-step">02</span><strong>Monatsplanung</strong><small>Individueller Entwurf</small></div><div role="listitem"><span class="help-step">03</span><strong>Freigabe</strong><small>Vorschläge erzeugen</small></div><div role="listitem"><span class="help-step">04</span><strong>Buchungen</strong><small>Ist erfassen und zuordnen</small></div><div role="listitem"><span class="help-step">05</span><strong>Plan-Ist</strong><small>Abweichungen auswerten</small></div></div></section><section class="help-section"><h3>2.2 Monatsvorlage und Monatsplanung</h3><p>Vorlage individuell oder aus Planentwurf erstellen. Gültige Kalendermonate auswählen. Neuen Monatsplan aus aktuellen Vorlagen erstellen, Positionen prüfen und ergänzen.</p><div class="help-example"><div class="help-kicker">BEISPIEL · FIKTIVE DATEN</div><strong>Quartalsweise Zahlung</strong><div class="help-months"><span class="on">Jan</span><span class="">Feb</span><span class="">Mär</span><span class="on">Apr</span><span class="">Mai</span><span class="">Jun</span><span class="on">Jul</span><span class="">Aug</span><span class="">Sep</span><span class="on">Okt</span><span class="">Nov</span><span class="">Dez</span></div></div><p>Grün markiert die gewählten Monate. Bei Lastschrift Konto und Buchungstag, bei Umbuchung zusätzlich Zielkonto angeben. Automatik nur bei verlässlichen Beträgen und freigegebenen Konten verwenden.</p></section><section class="help-section"><h3>2.3 Plan-Ist-Vergleich</h3><div class="help-example"><div class="help-kicker">BEISPIEL · FIKTIVE DATEN</div><strong>Lebensmittel · Plan 400 € / Ist 320 €</strong><div class="help-meter"><span style="width:80%"></span></div><dl class="help-rows"><div><dt>Verbraucht</dt><dd>80 %</dd></div><div><dt>Verfügbar</dt><dd>80 €</dd></div></dl></div><div class="help-example"><div class="help-kicker">BEISPIEL · FIKTIVE DATEN</div><strong>Mobilität · Plan 200 € / Ist 240 €</strong><div class="help-meter over"><span style="width:100%"></span></div><dl class="help-rows"><div><dt>Überschreitung</dt><dd>40 €</dd></div></dl></div><p>Planpositionen und Ist-Buchungen vergleichen; fehlende Zuordnungen im Buchungsdialog ergänzen. Einnahmen und Ausgaben getrennt bewerten.</p></section><section class="help-section"><h3>2.4 Monatsentwicklung</h3><div class="help-example"><div class="help-kicker">BEISPIEL · FIKTIVE DATEN</div><strong>Kategorieentwicklung</strong><svg class="help-chart" viewBox="0 0 320 150" role="img" aria-label="Beispiel: Ausgaben Wohnen konstant, Mobilität schwankend; April Plan"><g stroke="currentColor" opacity=".15"><path d="M38 20H306M38 55H306M38 90H306M38 125H306"/></g><g fill="currentColor" font-size="10"><text x="3" y="23">600 €</text><text x="3" y="93">200 €</text><text x="20" y="128">0</text><text x="45" y="144">Jan</text><text x="125" y="144">Feb</text><text x="205" y="144">Mär</text><text x="285" y="144">Apr</text></g><path d="M55 38L135 38L215 38" stroke="#38a6d1" stroke-width="3" fill="none"/><path d="M215 38L295 38" stroke="#38a6d1" stroke-width="3" stroke-dasharray="5 4"/><path d="M55 90L135 73L215 99" stroke="#e5a34b" stroke-width="3" fill="none"/><path d="M215 99L295 82" stroke="#e5a34b" stroke-width="3" stroke-dasharray="5 4"/></svg><div class="help-legend"><span style="color:#38a6d1">● Wohnen</span><span style="color:#e5a34b">● Mobilität</span></div></div><p>Separate Diagramme für Einnahmen und Ausgaben. Kategorie-Buttons im 3-Spalten-Raster filtern die Linien. Das 6×2-Raster lässt sich über drei Kalenderjahre verschieben; maximal zwölf Monate sind gleichzeitig auswählbar. Januar trägt die Jahreszahl. Durchgezogen und gefüllt: Abschlusswerte; gestrichelt und offen: Planwerte. Fehlende Monate bleiben Lücken. Umbuchungen sind ausgeschlossen.</p><aside class="help-note"><strong>ⓘ Gut zu wissen</strong><p>Die aktuelle Kategoriehierarchie bestimmt die historische Gruppierung. Die beiden weiteren Kacheln heißen Monatsbilanz und Monatsvergleich. Alle drei Kacheln sind beim Aufruf und Aktualisieren geschlossen.</p></aside></section></article><article class="help-page" id="help-page-3" role="tabpanel" aria-labelledby="help-tab-3" tabindex="0" hidden><div class="help-kicker">KAPITEL 03</div><h2>Geldbewegungen erfassen</h2><p>Buchungen korrekt erfassen, zuordnen und nachvollziehen.</p><section class="help-section"><h3>3.1 Buchungen und Zuordnung</h3><div class="help-flow" role="list"><div role="listitem"><span class="help-step">01</span><strong>Art</strong><small>Einnahme, Ausgabe oder Umbuchung</small></div><div role="listitem"><span class="help-step">02</span><strong>Datum und Konto</strong><small>Buchungszeitpunkt und Geldquelle</small></div><div role="listitem"><span class="help-step">03</span><strong>Betrag und Text</strong><small>Positiver Betrag, Beschreibung</small></div><div role="listitem"><span class="help-step">04</span><strong>Kategorie / Plan</strong><small>Passende Zuordnung</small></div><div role="listitem"><span class="help-step">05</span><strong>Speichern</strong><small>Buchung kontrollieren</small></div></div><div class="help-example"><div class="help-kicker">BEISPIEL · FIKTIVE DATEN</div><strong>Umbuchung 150 €</strong><div class="help-transfer"><span>Girokonto<br><b>−150 €</b></span><strong>→</strong><span>Sparkonto<br><b>+150 €</b></span></div><dl class="help-rows"><div><dt>Gesamtveränderung</dt><dd>0 €</dd></div></dl></div><p>Buchungen nach Kategorie oder Konto öffnen; Stift bearbeitet, Papierkorb startet Storno mit Bestätigung. Beide Seiten einer Umbuchung werden gemeinsam storniert.</p></section><section class="help-section"><h3>3.2 Vorschläge aus Planung</h3><div class="help-flow" role="list"><div role="listitem"><span class="help-step">01</span><strong>Offen</strong><small>Freigegebene Planposition prüfen</small></div><div role="listitem"><span class="help-step">02</span><strong>Bestätigen</strong><small>Konto, Betrag und Kategorie prüfen</small></div><div role="listitem"><span class="help-step">03</span><strong>Gebucht / entfällt</strong><small>Status kontrollieren und bei Bedarf nacharbeiten</small></div></div><aside class="help-note"><strong>ⓘ Gut zu wissen</strong><p>Automatische Verbuchung ist keine Bankbestätigung.</p></aside></section><section class="help-section"><h3>3.3 Kontostände</h3><div class="help-example"><div class="help-kicker">BEISPIEL · FIKTIVE DATEN</div><strong>Monatlicher Kontosaldo</strong><dl class="help-rows"><div><dt>Monatsbeginn</dt><dd>1.000 €</dd></div><div><dt>Zuflüsse</dt><dd>+ 500 €</dd></div><div><dt>Abflüsse</dt><dd>− 200 €</dd></div><div><dt>Stichtag</dt><dd>1.300 €</dd></div></dl></div><p>Kontoinhaber und Bankgruppen öffnen. Konto antippen öffnet die gefilterte Buchungshistorie. Saldenbestätigung erfolgt im Abschluss.</p></section><section class="help-section"><h3>3.4 Buchungshistorie und Suche</h3><p>Monat, Inhaber und Konto filtern. Beide Filter wirken auf Chronik und Änderungen. Umbuchungen erscheinen bei Quell- und Zielkonto. Aktualisieren setzt die Filter zurück.</p><dl class="help-rows"><div><dt>Chronik</dt><dd>Aktive Buchungen nach Datum, neueste zuerst; Ersteller soweit erfasst</dd></div><div><dt>Änderungen</dt><dd>Vorher/Nachher, Grund, Bearbeiter und Zeitpunkt; maximal 500 Ereignisse</dd></div><div><dt>Suche</dt><dd>Bezeichnung oder Betrag suchen; Treffer zur Bearbeitung öffnen</dd></div></dl><aside class="help-note"><strong>ⓘ Gut zu wissen</strong><p>Gesperrte oder stornierte Buchungen sind nicht bearbeitbar. Storno entfernt aktive Saldenwirkung und löst Plan-Ist-Verknüpfungen.</p></aside></section></article><article class="help-page" id="help-page-4" role="tabpanel" aria-labelledby="help-tab-4" tabindex="0" hidden><div class="help-kicker">KAPITEL 04</div><h2>Monat prüfen und abschließen</h2><p>Ein geführter Abgleich zwischen Finanztracker und tatsächlichen Kontoständen.</p><section class="help-section"><h3>4.1 Abschlussworkflow</h3><div class="help-flow" role="list"><div role="listitem"><span class="help-step">01</span><strong>Kontenabgleich</strong><small>Berechneten und tatsächlichen Saldo vergleichen</small></div><div role="listitem"><span class="help-step">02</span><strong>Prüfbefunde</strong><small>Abweichungen und Lastschriften prüfen</small></div><div role="listitem"><span class="help-step">03</span><strong>Ergebnis</strong><small>Bilanz und Plan-Ist-Abweichung bewerten</small></div><div role="listitem"><span class="help-step">04</span><strong>Abschluss</strong><small>Voraussetzungen erfüllen und bestätigen</small></div></div></section><section class="help-section"><h3>4.2 Kontenabgleich</h3><div class="help-example"><div class="help-kicker">BEISPIEL · FIKTIVE DATEN</div><strong>Differenz erkennen</strong><dl class="help-rows"><div><dt>Berechneter Saldo</dt><dd>1.300 €</dd></div><div><dt>Kontoauszug</dt><dd>1.280 €</dd></div><div><dt>Differenz</dt><dd>−20 €</dd></div></dl></div><p>Tatsächlichen Monatsendsaldo eingeben. Differenzen anhand des Kontoauszugs prüfen. Buchungen prüfen / korrigieren öffnet die passende Buchungshistorie. Bestätigte Konten sind gesperrt.</p></section><section class="help-section"><h3>4.3 Prüfbefunde</h3><p>Gruppen nach Inhaber öffnen. Detaildialog erklärt den Befund. Je nach Befund stehen Stift und Papierkorb zur Verfügung. Erwartete Lastschriften und tatsächliche Buchungen vergleichen; Plan-Ist-Zuordnungen kontrollieren. Aktualisieren lädt den Prüfstand neu.</p></section><section class="help-section"><h3>4.4 Abschluss und Korrekturen</h3><p>Abschlussstatus, erfasste Konten und offene Fehler prüfen. Abschluss bestätigen ist nur bei erfüllten Voraussetzungen verfügbar. Abschlusskorrekturen zeigen protokollierte Änderungen und Differenzen vorher/nachher.</p><aside class="help-note"><strong>ⓘ Gut zu wissen</strong><p>Keine Bankbestätigung durch Automatik ersetzen. Bei gesperrten Buchungen die vorgesehenen Abschluss- und Korrekturwege verwenden.</p></aside></section></article></div></section></div>`;
      if(typeof ResizeObserver!=='undefined'){this._headerObserver?.disconnect();this._headerObserver=new ResizeObserver(()=>this._syncHeader());this._headerObserver.observe(this.shadowRoot.querySelector('.bar'));}
      this.shadowRoot.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>this.selectTab(b.dataset.tab)));
      const help=this.shadowRoot.getElementById('help-overlay');
      const helpTabs=[...help.querySelectorAll('[data-help-tab]')];
      const selectHelp=(index,focus=false)=>{helpTabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;help.querySelector('#help-page-'+i).hidden=i!==index;});help.querySelector('.help-body').scrollTop=0;if(focus)helpTabs[index].focus();};
      const closeHelp=()=>{help.hidden=true;this.shadowRoot.getElementById('content').inert=false;this.shadowRoot.querySelector('.bar').inert=false;this.shadowRoot.getElementById('help-open')?.focus();};
      this.shadowRoot.getElementById('help-open')?.addEventListener('click',()=>{this._headerCollapsed=false;this._syncHeader();help.hidden=false;this.shadowRoot.getElementById('content').inert=true;this.shadowRoot.querySelector('.bar').inert=true;selectHelp(({master:1,planning:2,ledger:3,closing:4})[this.active]??0);requestAnimationFrame(()=>help.querySelector('button[data-help-close]')?.focus());});
      helpTabs.forEach((tab,i)=>tab.addEventListener('click',()=>selectHelp(i,true)));
      help?.querySelectorAll('[data-help-close]').forEach(b=>b.addEventListener('click',closeHelp));
      help?.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeHelp();return;}const i=helpTabs.indexOf(e.target);if(i>=0&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();selectHelp(e.key==='Home'?0:e.key==='End'?4:(i+(['ArrowLeft','ArrowUp'].includes(e.key)?4:1))%5,true);}if(e.key==='Tab'){const items=[...help.querySelectorAll('button:not([tabindex="-1"]),[role="tabpanel"]:not([hidden])')];const first=items[0],last=items[items.length-1];if(e.shiftKey&&e.target===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&e.target===last){e.preventDefault();first.focus();}}});
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
      this.shadowRoot.addEventListener('ft-finding-plan',async e=>{
        const {month,position_id,action}=e.detail||{};const planning=this.shadowRoot.querySelector('#planning > *');if(!planning)return;
        this.planningSubview='planning';planning.section='planning';this.selectTab('planning',{deferRefresh:true});planning.month=month;
        try{await planning.refresh();const selector=action==='void'?'data-plan-exclude':'data-plan-edit';const button=planning.shadowRoot.querySelector(`[${selector}="${CSS.escape(position_id)}"]`);if(!button||button.disabled)throw Error('Planposition ist nicht bearbeitbar. Gegebenenfalls zuerst Planfreigabe zurücknehmen.');button.click();}catch(error){await window.FTDialog.alert('Planposition',error.message||String(error));}
      });
      this.shadowRoot.addEventListener('ft-open-ledger',e=>{
        const ledger=this.shadowRoot.querySelector('#ledger > *');
        if(ledger){ledger.month=e.detail?.month||ledger.month;ledger.tab='changes';ledger.historyAccount=e.detail?.account_id||'';ledger.historyOwner='';this.ledgerSubview='changes';ledger.message='Buchungen zur Kontokorrektur prüfen. Eine Korrektur erfolgt ausschließlich über eine nachvollziehbare Buchung; bestätigte Konten sind gesperrt.';}
        this.selectTab('ledger');
      });
      this.shadowRoot.addEventListener('ft-open-actual-booking',async e=>{
        const {month,transaction_id,action}=e.detail||{};
        const ledger=this.shadowRoot.querySelector('#ledger > *');
        if(!ledger||!transaction_id)return;
        ledger.month=month||ledger.month;
        ledger.tab='changes';ledger.historyOwner='';ledger.historyAccount='';
        this.ledgerSubview='changes';
        this.selectTab('ledger',{deferRefresh:true});
        this.renderSubnav();
        try{
          await ledger.refresh();
          await ledger.openTransactionFromSearch(transaction_id,action==='void'?'void':'edit');
          this.ledgerSubview='changes';this.renderSubnav();
        }catch(error){ledger.message='Buchung konnte nicht geöffnet werden: '+(error.message||String(error));ledger.render();}
      });
      this.shadowRoot.addEventListener('ft-ledger-subview',e=>{
        const ledger=this.shadowRoot.querySelector('#ledger > *');
        if(this.active!=='ledger'||e.target!==ledger||e.detail?.tab!=='changes')return;
        this.ledgerSubview='changes';this.renderSubnav();
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
      const templates=document.createElement('finance-tracker-templates-panel-v422');
      const planning=document.createElement('finance-tracker-planning-panel-v422');
      const ledger=document.createElement('finance-tracker-panel-v422');
      const closing=document.createElement('finance-tracker-closing-panel-v422');
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
    selectTab(tab,{deferRefresh=false}={}) {
      if(!['templates','planning','ledger','master','closing'].includes(tab)) return;
      const targetTab=tab==='master'?'ledger':tab;
      const old=this.active;
      const oldPanel=this.shadowRoot.querySelector('#'+(old==='master'?'ledger':old)+' > *');
      const targetPanel=this.shadowRoot.querySelector('#'+targetTab+' > *');
      if(!targetPanel){console.warn('Finance Tracker: Unteransicht noch nicht initialisiert:',tab);return;}
      if(old!==tab){
        // Close transient editors before a view switch; no pending form is saved.
        oldPanel?.abortTransient?.();
        if(oldPanel===targetPanel)targetPanel?.abortTransient?.();
        if(['planning','ledger','closing','master'].includes(old)&&['planning','ledger','closing','master'].includes(tab)&&oldPanel?.month&&targetPanel?.month!==oldPanel.month){
          targetPanel.month=oldPanel.month;
        }
      }
      this.active=tab;
      this._syncDialogLayer();
      const switchToken=this._switchToken=(this._switchToken||0)+1;
      this._reconcileMonth(tab,targetPanel,switchToken,deferRefresh);
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
      if(!deferRefresh&&old===tab&&this.ready&&targetPanel?._hass){
        if(tab==='ledger')targetPanel.collapseLedgerGroups?.(false);
        targetPanel.refresh?.();
      }
    }
    async _reconcileMonth(tab,panel,token,deferRefresh=false){
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
      if(!deferRefresh&&token===this._switchToken&&panel?._hass)await panel.refresh?.();
    }
    _nextMonth(m){const [y,n]=m.split('-').map(Number);return n===12?`${y+1}-01`:`${y}-${String(n+1).padStart(2,'0')}`;}
    _choices(){
      return this.active==='planning'?[['planning','Monatsplanung'],['templates','Monatsvorlage'],['development','Monatsentwicklung'],['actual','Plan-Ist-Vergleich']]:
        this.active==='ledger'?[['overview','Buchungen nach Kategorie'],['proposals','Vorschläge aus Planung'],['changes','Buchungshistorie'],['balances','Kontostände']]:
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
      if(key==='closing'){if(!root.getElementById('ft-closing-sticky')){const style=document.createElement('style');style.id='ft-closing-sticky';style.textContent='.header{position:sticky!important;top:var(--ft-sticky-top,0px)!important;transition:top .42s cubic-bezier(.4,0,.2,1)!important;z-index:1000!important;background:var(--primary-background-color,#111827)}';root.append(style);}return;}
      // The child's render() replaces its shadow DOM. Restore the navigation
      // immediately after the month/header row without modifying child logic.
      if(!root.getElementById('ft-inline-nav-style')){
        const style=document.createElement('style');style.id='ft-inline-nav-style';
        style.textContent=`.sticky-header-group,.finance-head,.ft-page-head,.head{position:sticky!important;top:var(--ft-sticky-top,0px)!important;transition:top .42s cubic-bezier(.4,0,.2,1)!important;z-index:1000!important;transform:none!important;background:var(--primary-background-color,#111827)}
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
      const current=this.active==='planning'?this.planningSubview:this.active==='master'?this.masterSubview:this.ledgerSubview;
      if(current!==id){
        // A sub-view change must dismiss all unsaved editors and temporary pickers.
        for(const panel of this.shadowRoot.querySelectorAll('#templates > *, #planning > *, #ledger > *, #closing > *'))panel.abortTransient?.();
      }
      if(this.active==='planning'){
        this.planningSubview=id;
        for(const key of ['planning','templates'])this.shadowRoot.getElementById(key).hidden=(id==='templates'?key!=='templates':key!=='planning');
        const panel=this.shadowRoot.querySelector('#'+(id==='templates'?'templates':'planning')+' > *');
        if(id!=='templates'){panel.section=id;panel.view=id==='actual'?'actual':id==='development'?'history':'overview';}
        panel?.refresh?.();
      }else{
        const ledger=this.shadowRoot.querySelector('#ledger > *');
        if(this.active==='master')this.masterSubview=id;else this.ledgerSubview=id;
        if(id==='changes'&&current!==id){ledger.historyOwner='';ledger.historyAccount='';}
        ledger.tab=id;ledger.context=this.active==='master'?'master':'ledger';
        // Re-entering a subview reloads data and closes all groups.
        if(ledger._hass)ledger.refresh?.();else ledger.render?.();
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
      const raw=String(query??'').trim().replace(/\s*€\s*$/,'').trim();
      const numeric=/^([+-]?)(\d+)(?:[,.](\d{1,2}))?$/.exec(raw);
      if(numeric){const cents=Number(numeric[2])*100+Number((numeric[3]||'').padEnd(2,'0'));const amount=Number(transaction.amount_cents);if(Number.isSafeInteger(cents)&&Math.abs(amount)===cents&&(!numeric[1]||(numeric[1]==='-'?amount<0:amount>0)))return 100;if(numeric[1]||numeric[3]||raw!==String(query).trim())return 0;}
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
      button.ft-pencil,button.ft-trash{box-sizing:border-box!important;display:inline-grid!important;place-items:center!important;flex:0 0 32px!important;width:32px!important;min-width:32px!important;max-width:32px!important;height:32px!important;min-height:32px!important;max-height:32px!important;padding:0!important;margin:0!important;font-size:17px!important;line-height:1!important;border-radius:8px!important}button.ft-trash{color:#fca5a5!important;border:1px solid #b45353!important}
</style><div class="ft-search-dialog" role="dialog" aria-modal="true" aria-labelledby="ft-search-title"><div class="ft-search-head"><div><h2 id="ft-search-title">Buchungssuche</h2><small>${ledger.label?.(month)||month} · Stichwort, ähnliche Begriffe und Betrag</small></div><button type="button" data-search-close aria-label="Suche schließen">✕</button></div><input class="ft-search-input" type="search" placeholder="Betrag, Beschreibung, Kategorie oder Konto suchen …" aria-label="Buchungen durchsuchen"/><div class="ft-search-results" role="list"></div></div>`;
      this.shadowRoot.append(overlay);
      const input=overlay.querySelector('input'),results=overlay.querySelector('.ft-search-results');
      const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const close=()=>{overlay.remove();document.removeEventListener('keydown',onKey,true);};
      const onKey=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
      document.addEventListener('keydown',onKey,true);
      overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-search-close]'))close();});
      const render=()=>{
        const query=input.value.trim();
        const source=/^[+-]/.test(query.trim())?(ledger.data.account_transactions||records):records;
        const found=source.map(t=>({t,score:this._searchScore(t,query)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||String(b.t.booked).localeCompare(String(a.t.booked))).slice(0,100);
        results.innerHTML=found.length?found.map(({t})=>`<button type="button" class="ft-search-result" data-search-id="${escape(t.id)}"><span><b>${escape(t.description)}</b><small>${escape(t.booked)} · ${escape(t.category_name||'Umbuchung')} · ${escape(t.account_name||t.from_name||'')}</small></span><strong>${escape(ledger.money?.(t.amount_cents)||'')}</strong></button>`).join(''):'<p>Keine passenden Buchungen im ausgewählten Monat.</p>';
      };
      input.addEventListener('input',render);
      results.addEventListener('click',e=>{
        const btn=e.target.closest('[data-search-id]');
        if(!btn)return;
        const tx=[...records,...(ledger.data.account_transactions||[])].find(t=>String(t.id)===btn.dataset.searchId);
        if(!tx)return;
        // Open the existing booking editor without changing the current view.
        // The child ledger then opens the selected transaction directly by ID; no DOM-button lookup.
        close();
        // The loaded month is already available; do not start a competing refresh.
        if(typeof ledger.openTransactionFromSearch!=='function'){
          ledger.message='Buchung konnte nicht geöffnet werden: Frontend-Modul nicht auf dem erwarteten Versionsstand.';
          ledger.render();
          this.renderSubnav();
          return;
        }
        Promise.resolve(ledger.openTransactionFromSearch(tx.id)).then(()=>{
          this.renderSubnav();
        }).catch(error=>{
          ledger.message='Buchung konnte nicht geöffnet werden: '+(error.message||String(error));
          ledger.render();
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
