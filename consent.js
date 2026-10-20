/* Convernatics Consent v1 — dependency-free, per-service, fail closed. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.ConvernaticsConsent = api;
    const start = () => { if (root.ConvernaticsConsentConfig && !root.cc) root.cc = api.mount(root.ConvernaticsConsentConfig); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  }
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const translations = {
    de: ['Ihre Privatsphäre', 'Notwendige Funktionen sind immer aktiv. Statistik, Marketing/Tracking und externe Medien werden nur mit Ihrer Einwilligung geladen. Sie können Ihre Auswahl jederzeit ändern oder widerrufen.', 'Alle akzeptieren', 'Nur notwendige', 'Einstellungen', 'Auswahl speichern', 'Einwilligung widerrufen', 'Schließen', 'Notwendig', 'Statistik', 'Marketing', 'Externe Medien', 'Anbieter', 'Zweck', 'Datenschutz', 'Cookies', 'Name', 'Laufzeit', 'Einmal laden', 'Immer erlauben', 'Dieser Inhalt ist deaktiviert. Beim Laden werden Daten an den Anbieter übermittelt.', 'Cookie-Einstellungen', 'Ihre Auswahl konnte nicht gespeichert werden. Bitte erneut versuchen.', 'Keine Cookies im Quellverzeichnis angegeben.', 'Ihre Auswahl wird gespeichert …'],
    en: ['Your privacy', 'Necessary functions are always active. Statistics, marketing/tracking and external media load only with your consent. You can change or withdraw your choice at any time.', 'Accept all', 'Necessary only', 'Settings', 'Save selection', 'Withdraw consent', 'Close', 'Necessary', 'Statistics', 'Marketing', 'External media', 'Provider', 'Purpose', 'Privacy policy', 'Cookies', 'Name', 'Lifetime', 'Load once', 'Always allow', 'This content is disabled. Loading it transfers data to the provider.', 'Cookie settings', 'Your choice could not be saved. Please try again.', 'No cookies specified in the source inventory.', 'Saving your choice …'],
    sk: ['Vaše súkromie', 'Nevyhnutné funkcie sú vždy aktívne. Štatistika, marketing/sledovanie a externé médiá sa načítajú iba s vaším súhlasom. Svoj výber môžete kedykoľvek zmeniť alebo odvolať.', 'Prijať všetko', 'Len nevyhnutné', 'Nastavenia', 'Uložiť výber', 'Odvolať súhlas', 'Zavrieť', 'Nevyhnutné', 'Štatistika', 'Marketing', 'Externé médiá', 'Poskytovateľ', 'Účel', 'Ochrana súkromia', 'Súbory cookie', 'Názov', 'Doba platnosti', 'Načítať raz', 'Vždy povoliť', 'Tento obsah je deaktivovaný. Načítaním sa údaje odovzdajú poskytovateľovi.', 'Nastavenia súborov cookie', 'Výber sa nepodarilo uložiť. Skúste to znova.', 'V zdrojovom registri nie sú uvedené žiadne súbory cookie.', 'Ukladá sa váš výber …']
  };
  const groups = ['necessary', 'statistics', 'marketing', 'external-media'];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  function validRecord(r, c, now) {
    return !!r && Object.keys(r).sort().join() === 'id,services,time,version' && uuid.test(r.id) && r.version === c.version && Number.isInteger(r.time) && r.time <= now + 60 && r.time > now - (c.maxAge || 15552000) && Array.isArray(r.services) && new Set(r.services).size === r.services.length && r.services.every(k => c.services.some(s => s.key === k && s.group !== 'necessary'));
  }
  function mode(services, selected) {
    const grant = key => services.some(s => selected.includes(s.key) && (s.consentMode || []).includes(key)) ? 'granted' : 'denied';
    return { ad_storage: grant('ad_storage'), analytics_storage: grant('analytics_storage'), ad_user_data: grant('ad_user_data'), ad_personalization: grant('ad_personalization'), functionality_storage: 'denied', personalization_storage: 'denied', security_storage: 'granted' };
  }
  function mount(config) {
    const doc = document, win = window;
    const c = { cookie: 'convernatics_consent', maxAge: 15552000, language: 'de', services: [], ...config };
    const t = [...(translations[c.language] || translations.de)];
    const usaNote = {"de": " Bei Diensten mit „(inkl. USA)“ können Daten wie Ihre IP-Adresse in die USA übermittelt werden.", "en": " For services marked “(incl. USA)”, data such as your IP address may be transferred to the USA.", "sk": " Pri službách označených „(vrátane USA)“ môžu byť údaje, napríklad vaša IP adresa, prenesené do USA."};
    if (c.services.some(sv => (sv.thirdCountries || []).includes('USA'))) t[1] = t[1].replace(/(\.)( [^.]*\.)$/, '.' + (usaNote[c.language] || usaNote.de) + '$2');
    let record = null, selected = [], draft = [], busy = false, focusReturn = null;
    let temporary = new WeakSet();
    const running = new Map();
    const now = () => Math.floor(Date.now() / 1000);
    const optional = () => c.services.filter(s => s.group !== 'necessary').map(s => s.key);
    const allowed = key => c.services.some(s => s.key === key && (s.group === 'necessary' || selected.includes(key)));
    const svcLabel = sv => sv.name + (sv.storedIn ? ' (' + text(sv.storedIn) + ')' : '') + ((sv.thirdCountries || []).includes('USA') ? ({de:' (inkl. USA)',en:' (incl. USA)',sk:' (vrátane USA)'})[c.language] || ' (inkl. USA)' : '');
    const text = value => typeof value === 'object' && value ? value[c.language] || value.de || value.en || '' : String(value || '');
    function el(tag, value, attrs = {}) { const node = doc.createElement(tag); if (value) node.textContent = value; Object.entries(attrs).forEach(([k,v]) => node.setAttribute(k,v)); return node; }
    function read() { try { const raw = doc.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(c.cookie + '=')); const r = raw && JSON.parse(decodeURIComponent(raw.slice(c.cookie.length + 1))); return validRecord(r,c,now()) ? r : null; } catch (_) { return null; } }
    function store(r) { doc.cookie = c.cookie + '=' + encodeURIComponent(JSON.stringify(r)) + '; Path=/; Max-Age=' + c.maxAge + '; SameSite=Lax' + (win.location.protocol === 'https:' ? '; Secure' : ''); if (JSON.stringify(read()) !== JSON.stringify(r)) throw new Error('Cookie unavailable'); record = r; }
    function updateMode(type = 'update') { win.dataLayer = win.dataLayer || []; win.gtag = win.gtag || function () { win.dataLayer.push(arguments); }; win.gtag('consent',type,mode(c.services,selected)); }
    // The WP adapter also emits denied defaults before any page scripts.
    if (!win.__ccDefaults) { updateMode('default'); win.__ccDefaults = true; }
    const dialog = el('dialog', '', { id: 'cc-dialog', class: 'cc-dialog', 'aria-labelledby': 'cc-title', 'aria-describedby': 'cc-description' });
    dialog.append(el('h2',c.title ? text(c.title) : t[0],{id:'cc-title'}),el('p',c.description ? text(c.description) : t[1],{id:'cc-description'}));
    const settings = el('div','',{id:'cc-settings'}); settings.hidden = true;
    const serviceInputs = new Map(), groupInputs = new Map();
    function information(s) {
      const box = el('details'); box.append(el('summary',({de:'Details',en:'Details',sk:'Podrobnosti'})[c.language] || 'Details'));
      box.append(el('p',text(s.description)),el('p',t[12]+': '+text(s.provider)),el('p',t[13]+': '+text(s.purpose || s.description)));
      if (/^https:\/\//.test(s.privacy || '')) box.append(el('a',t[14],{href:s.privacy,target:'_blank',rel:'noopener noreferrer'}));
      if ((s.cookies || []).length) {
        const table = el('table'), caption = el('caption',t[15]), head = el('tr');
        [t[16],t[13],t[17]].forEach(h=>head.append(el('th',h,{scope:'col'}))); table.append(caption,head);
        for (const cookie of s.cookies) { const row = el('tr'); [cookie.name,text(cookie.description || cookie.purpose),text(cookie.lifetime)].forEach(v=>row.append(el('td',v))); table.append(row); } box.append(table);
      } else box.append(el('p',t[23]));
      return box;
    }
    groups.forEach((group,index) => {
      const items = c.services.filter(s=>s.group === group);
      if (!items.length) return;
      const fieldset = el('fieldset'), legend = el('legend'), label = el('label'), input = el('input','',{type:'checkbox','data-cc-group':group});
      if (group === 'necessary') { input.checked = true; input.disabled = true; }
      label.append(input,doc.createTextNode(t[8+index])); legend.append(label); fieldset.append(legend); groupInputs.set(group,input);
      input.addEventListener('change',()=>{ for (const s of items) serviceInputs.get(s.key).checked = input.checked; groupState(); });
      for (const s of items) {
        const row = el('div','',{class:'cc-service'}), label = el('label'), input = el('input','',{type:'checkbox',role:'switch','data-cc-toggle':s.key});
        if (group === 'necessary') { input.checked=true;input.disabled=true; }
        input.addEventListener('change',groupState); label.append(input,doc.createTextNode(svcLabel(s))); row.append(label,information(s)); fieldset.append(row); serviceInputs.set(s.key,input);
      }
      settings.append(fieldset);
    });
    function groupState() {
      for (const [group,input] of groupInputs) {
        const members = c.services.filter(s=>s.group===group).map(s=>serviceInputs.get(s.key));
        input.checked=members.every(i=>i.checked);input.indeterminate=members.some(i=>i.checked)&&!input.checked;input.setAttribute('aria-checked',input.indeterminate?'mixed':String(input.checked));
      }
    }
    const status = el('p','',{role:'status','aria-live':'polite',class:'cc-status'}), actions = el('div','',{class:'cc-actions'});
    const button = (label, action) => el('button',label,{type:'button','data-cc-action':action});
    [['all',2],['necessary',3],['settings',4],['save',5],['withdraw',6],['close',7]].forEach(([a,i])=>{const b=button(t[i],a);if(a==='save') b.hidden=true;actions.append(b);});
    dialog.append(settings,status,actions);doc.body.append(dialog);
    const footer = el('div','',{class:'cc-footer'}), link=el('a',t[21],{href:'#cc-dialog','data-cc-open':''}); footer.append(link);if(c.footer!==false)doc.body.append(footer);
    const usTag = ({de:' (inkl. USA)',en:' (incl. USA)',sk:' (vrátane USA)'})[c.language] || ' (inkl. USA)';
    const provName = sv => (typeof sv.provider === 'string' ? sv.provider : text(sv.provider)).replace(/ Germany GmbH| Insights OÜ| \(.*\)$/, '');
    const listOf = arr => [...new Map(arr.map(sv => [provName(sv), provName(sv) + (sv.storedIn ? ' (' + text(sv.storedIn) + ')' : '') + ((sv.thirdCountries || []).includes('USA') ? usTag : '')])).values()].join(', ');
    const optionalSv = c.services.filter(sv => sv.group !== 'necessary');
    const anon = optionalSv.filter(sv => sv.anonymous), named = optionalSv.filter(sv => !sv.anonymous);
    const media = optionalSv.filter(sv => sv.group === 'external-media').map(sv => sv.name);
    const has = g => optionalSv.some(sv => sv.group === g);
    const join = (list, and) => list.length < 2 ? list.join('') : list.slice(0,-1).join(', ') + ' ' + and + ' ' + list[list.length-1];
    const L = {
      de: { stat: 'eine anonymisierte Web-Analyse', mkt: 'Tracking zu Marketingzwecken', media: 'externe Inhalte', and: 'und', lead: 'Mit „Alle akzeptieren“ erlauben Sie ', anon: p => 'Die Web-Analyse betreibt ' + p + ' selbst: ohne Cookies, ohne personenbezogene Profile, keine Weitergabe an Dritte.', named: p => 'Für externe Inhalte werden Daten wie Ihre IP-Adresse an folgende Anbieter übermittelt: ' + p + '.', tail: 'Freiwillig und jederzeit in den Cookie-Einstellungen widerrufbar.', title: 'Cookies und Tracking' },
      en: { stat: 'anonymised web analytics', mkt: 'tracking for marketing purposes', media: 'external content', and: 'and', lead: 'By clicking “Accept all” you allow ', anon: p => 'The web analytics is operated by ' + p + ' itself: no cookies, no personal profiles, no disclosure to third parties.', named: p => 'For external content, data such as your IP address is transferred to these providers: ' + p + '.', tail: 'Voluntary and revocable at any time in the cookie settings.', title: 'Cookies and tracking' },
      sk: { stat: 'anonymizovanú webovú analytiku', mkt: 'sledovanie na marketingové účely', media: 'externý obsah', and: 'a', lead: 'Kliknutím na „Prijať všetko“ povoľujete ', anon: p => 'Webovú analytiku prevádzkuje priamo ' + p + ': bez súborov cookie, bez osobných profilov, bez odovzdávania tretím stranám.', named: p => 'Pri externom obsahu sa údaje, napríklad vaša IP adresa, odovzdávajú týmto poskytovateľom: ' + p + '.', tail: 'Dobrovoľné a kedykoľvek odvolateľné v nastaveniach súborov cookie.', title: 'Súbory cookie a sledovanie' }
    }[c.language];
    const intro = L && optionalSv.length ? [L.title, L.lead + join([has('statistics') && L.stat, has('marketing') && L.mkt, media.length && L.media + ' (' + media.join(', ') + ')'].filter(Boolean), L.and) + '. ' + [anon.length && L.anon(listOf(anon)), named.length && L.named(listOf(named)), L.tail].filter(Boolean).join(' ')] : null;
    function showSettings(visible) {
      if(dialog.open)dialog.close();
      settings.hidden=!visible;dialog.classList.toggle('cc-banner',!visible);
      dialog.querySelector('#cc-title').textContent=visible?(c.title?text(c.title):t[21]):(intro||{0:t[0]})[0];
      dialog.querySelector('#cc-description').textContent=visible?(c.description?text(c.description):t[1]):(intro||{1:t[1]})[1];
      for(const action of ['save','withdraw','close'])dialog.querySelector('[data-cc-action='+action+']').hidden=!visible;
      for(const action of ['necessary','settings'])dialog.querySelector('[data-cc-action='+action+']').hidden=visible;
      dialog.querySelector('[data-cc-action=settings]').setAttribute('aria-expanded',String(visible));
      if(visible)dialog.showModal();else dialog.show();
    }
    function open(details=true) { focusReturn=doc.activeElement;draft=[...selected];for(const s of c.services)serviceInputs.get(s.key).checked=s.group==='necessary'||draft.includes(s.key);groupState();showSettings(details);status.textContent='';if(details)(settings.querySelector('input:not(:disabled)')||actions.querySelector('button')).focus(); }
    function close() { dialog.close();if(focusReturn?.isConnected)focusReturn.focus(); }
    function urlSafe(raw) { try {const u=new URL(raw,win.location.href);return ['https:','http:'].includes(u.protocol) && !u.username && !u.password && (u.protocol==='https:'||u.origin===win.location.origin) ? u.href : null;}catch(_){return null;} }
    function blocks() {
      doc.querySelectorAll('[data-cc-service]').forEach(node=>{
        if(node.tagName==='SCRIPT') {
          if(node.type!=='text/plain'||running.has(node)||!allowed(node.dataset.ccService))return;
          const script=doc.createElement('script');script.dataset.ccActive=node.dataset.ccService;for(const a of node.attributes){if(!['type','data-cc-service','data-cc-src'].includes(a.name))script.setAttribute(a.name,a.value);}
          if(node.dataset.ccSrc) {const url=urlSafe(node.dataset.ccSrc);if(!url)return;script.src=url;script.async=false;}else script.textContent=node.textContent;
          running.set(node,script);node.after(script);return;
        }
        if(!['IFRAME','EMBED','OBJECT'].includes(node.tagName))return;
        const s=c.services.find(s=>s.key===node.dataset.ccService); if(!s)return;
        const source=node.dataset.ccSrc;if(!source)return;
        let holder=node.previousElementSibling;
        if(!holder?.hasAttribute('data-cc-placeholder')) {
          holder=el('div','',{class:'cc-placeholder','data-cc-placeholder':s.key});holder.append(el('strong',svcLabel(s)),el('p',t[20]),information(s));
          const once=button(({de:'Inhalt laden',en:'Load content',sk:'Načítať obsah'})[c.language] || 'Load content','once'),always=button(t[19],'always');
          once.addEventListener('click',()=>{temporary.add(holder.nextElementSibling);blocks();});always.addEventListener('click',()=>save([...new Set([...selected,s.key])]));holder.append(once,always);node.before(holder);
        }
        const active=allowed(s.key)||temporary.has(node), url=urlSafe(source);
        if(active&&url) {node.hidden=false;holder.hidden=true;if(node.getAttribute(node.tagName==='OBJECT'?'data':'src')!==url)node.setAttribute(node.tagName==='OBJECT'?'data':'src',url);}
        else {
          if(node.hasAttribute('src')||node.hasAttribute('srcdoc')||node.hasAttribute('data')) {
            const replacement=node.cloneNode(false);replacement.removeAttribute('src');replacement.removeAttribute('srcdoc');replacement.removeAttribute('data');replacement.hidden=true;node.replaceWith(replacement);
          } else node.hidden=true;
          holder.hidden=false;
        }
      });
    }
    function expireCookies(keys) {
      const names=doc.cookie.split(';').map(x=>x.trim().split('=')[0]);const host=win.location.hostname.split('.');const domains=[''];for(let i=0;i<host.length-1;i++)domains.push(host.slice(i).join('.'),'.'+host.slice(i).join('.'));
      for(const s of c.services.filter(s=>keys.includes(s.key)))for(const cookie of s.cookies||[]) {
        const pattern=new RegExp('^'+cookie.name.split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$');
        for(const name of names.filter(n=>n!==c.cookie&&pattern.test(n)&&!/[;\r\n=]/.test(n)))for(const domain of domains)for(const path of new Set(['/',cookie.path||'/']))if(!/[;\r\n]/.test(path))doc.cookie=name+'=; Max-Age=0; Path='+path+(domain?'; Domain='+domain:'')+'; SameSite=Lax';
      }
    }
    async function log(candidate) {
      if(!c.endpoint)return candidate;
      const endpoint=new URL(c.endpoint,win.location.href);if(endpoint.origin!==win.location.origin&&!c.allowCrossOriginEndpoint)throw new Error('Endpoint origin');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
      try {
        const send=()=>fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CC-Nonce':c.nonce||''},body:JSON.stringify(candidate),signal:controller.signal});
        let response=await send();
        if(response.status===403&&c.nonceEndpoint) {const u=new URL(c.nonceEndpoint,win.location.href);if(u.origin!==win.location.origin)throw new Error('Nonce origin');const refresh=await fetch(u,{credentials:'same-origin',cache:'no-store',signal:controller.signal});const body=await refresh.json();if(!refresh.ok||typeof body.nonce!=='string')throw new Error('Nonce');c.nonce=body.nonce;response=await send();}
        const body=await response.json();if(!response.ok||body.ok!==true||!validRecord(body.record,c,now())||body.record.id!==candidate.id||JSON.stringify(body.record.services)!==JSON.stringify(candidate.services))throw new Error('Log failed');return body.record;
      }finally{clearTimeout(timer);}
    }
    async function save(keys) {
      if(busy)return false;busy=true;status.textContent=t[24];actions.querySelectorAll('button').forEach(b=>b.disabled=true);
      const previous=[...selected],next=optional().filter(k=>keys.includes(k)),removed=previous.filter(k=>!next.includes(k));
      const candidate={id:record?.id||win.crypto.randomUUID(),version:c.version,time:now(),services:next};
      let revoked=removed.length>0||keys.length===0;
      try {
        // Revocation is effective even when the log server is unavailable.
        if(revoked){temporary=new WeakSet();selected=previous.filter(k=>next.includes(k));store({...candidate,services:selected});updateMode();expireCookies(removed);blocks();for(const [node,script] of running)if(!allowed(node.dataset.ccService))script.remove();}
        const confirmed=await log(candidate);store(confirmed);selected=next;updateMode();
        if(revoked&&running.size) {win.location.reload();return true;}
        blocks();close();win.dispatchEvent(new CustomEvent('cc:change',{detail:confirmed}));
        try{win.localStorage.setItem('cc:change',JSON.stringify(confirmed));}catch(_){}
        return true;
      }catch(_){status.textContent=t[22];if(revoked&&running.size)win.location.reload();return false;}
      finally {busy=false;actions.querySelectorAll('button').forEach(b=>b.disabled=false);}
    }
    doc.addEventListener('click',e=>{
      if(e.target.closest('[data-cc-open],[data-consent-open],a[href="#cookie-einstellungen"],a[href="#schicker-consent-dialog"]')){e.preventDefault();open(true);return;}
      const b=e.target.closest('[data-cc-action]');if(!b||!dialog.contains(b))return;
      const action=b.dataset.ccAction;if(action==='settings'){showSettings(true);settings.querySelector('input:not(:disabled)')?.focus();}if(action==='close')close();
      if(action==='all')void save(optional());if(action==='necessary'||action==='withdraw')void save([]);if(action==='save')void save([...serviceInputs].filter(([k,i])=>i.checked&&optional().includes(k)).map(([k])=>k));
    });
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    dialog.addEventListener('keydown',e=>{if(e.key!=='Tab'||dialog.classList.contains('cc-banner'))return;const nodes=[...dialog.querySelectorAll('button,input,a[href],summary')].filter(n=>!n.disabled&&n.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}});
    record=read();selected=record?[...record.services]:[];updateMode();blocks();if(!record)open(false);
    const observer=new MutationObserver(changes=>{if(changes.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('[data-cc-service]')||n.querySelector('[data-cc-service]')))))blocks();});observer.observe(doc.body,{childList:true,subtree:true});
    win.addEventListener('storage',e=>{if(e.key==='cc:change')win.location.reload();});
    win.addEventListener('pageshow',e=>{if(e.persisted)win.location.reload();});
    setInterval(()=>{if(record&&!read()&&!busy)win.location.reload();},60000);
    return {open,save,withdraw:()=>save([]),getServices:()=>[...selected],config:c};
  }
  return {mount,validRecord,mode,translations,groups};
});
