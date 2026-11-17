/* LatchHub – Files: a file manager for each client, stored in the client's Zoho WorkDrive folder.
   - shows the folder exactly as it is in Zoho (files added by hand in WorkDrive appear too)
   - upload files or whole folders of any size: they go up in small pieces that are each confirmed by the server,
     so a dropped connection, a sleeping laptop or a Retry continue where they stopped instead of starting again
   - uploads run in the background (list in the corner) while you keep working; two files at a time
   Only active when signed in through the server (LHsync.on). */
const FILES={
  st:{key:'',client:null,folder:'',trail:[],items:[],linked:[],loading:false,error:'',at:0},
  on(){return typeof LHsync!=='undefined'&&LHsync.on},
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  size(n){if(n==null)return'';if(n<1024)return n+' B';const u=['KB','MB','GB','TB'];let i=-1;do{n/=1024;i++}while(n>=1024&&i<3);return(n<10?n.toFixed(1):Math.round(n))+' '+u[i]},
  when(it){if(it.modified_ms){const d=new Date(it.modified_ms);return d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:d.getFullYear()===new Date().getFullYear()?undefined:'numeric'})}return it.modified||''},
  IMG:/^(jpe?g|png|gif|webp|svg|avif)$/i,
  extOf(it){return(it.ext||(it.name.match(/\.([^.]+)$/)||['',''])[1]||'').toLowerCase()},
  async api(path,body){
    const o={credentials:'same-origin',headers:{}};
    if(body!==undefined){o.method='POST';o.headers['Content-Type']='application/json';o.headers['X-LH-CSRF']=LHsync.csrf;o.body=JSON.stringify(body)}
    const r=await fetch('api/'+path,o);let j={};try{j=await r.json()}catch{}
    if(!r.ok)throw Object.assign(new Error(j.error||('Server error '+r.status)),{status:r.status,data:j});
    return j},

  /* ---------- the section on the brand page ---------- */
  section(b){
    if(!this.on())return'';
    return`<section id="s-files"><div class="sh"><h3>Files<span class="hint">This client's Zoho folder – any file, any size. Drop files or whole folders here.</span></h3>
      <div class="row"><button class="btn sm pri" data-f="pick">⇪ Upload files</button><button class="btn sm" data-f="pickdir">⇪ Upload a folder</button><button class="btn sm" data-f="mkdir">＋ New folder</button><button class="btn sm" data-f="refresh" title="Show changes made in WorkDrive">↻ Refresh</button></div></div>
      <input type="file" id="fm-in" multiple hidden><input type="file" id="fm-dir" webkitdirectory multiple hidden>
      <div class="fm" id="fm-box"></div></section>`},
  mount(){
    const box=document.getElementById('fm-box');if(!box)return;
    const b=typeof brand==='function'?brand():null;if(!b)return;
    const sec=document.getElementById('s-files');
    if(!sec.dataset.wired){sec.dataset.wired='1';
      $('#fm-in').onchange=e=>{this.addFiles([...e.target.files].map(f=>({file:f,rel:''})));e.target.value=''};
      $('#fm-dir').onchange=e=>{this.addFiles([...e.target.files].map(f=>({file:f,rel:(f.webkitRelativePath||'').split('/').slice(0,-1).join('/')})));e.target.value=''};
      sec.addEventListener('dragover',e=>{if(![...(e.dataTransfer?.types||[])].includes('Files'))return;e.preventDefault();sec.classList.add('fm-over');const row=e.target.closest&&e.target.closest('.fm-row.is-dir');sec.querySelectorAll('.fm-row.drop').forEach(r=>r!==row&&r.classList.remove('drop'));row&&row.classList.add('drop')});
      sec.addEventListener('dragleave',e=>{if(!sec.contains(e.relatedTarget)){sec.classList.remove('fm-over');sec.querySelectorAll('.fm-row.drop').forEach(r=>r.classList.remove('drop'))}});
      sec.addEventListener('drop',async e=>{e.preventDefault();sec.classList.remove('fm-over');const row=e.target.closest&&e.target.closest('.fm-row.is-dir');sec.querySelectorAll('.fm-row.drop').forEach(r=>r.classList.remove('drop'));
        const list=await this.fromDrop(e.dataTransfer);this.addFiles(list,row?{id:row.dataset.id,name:row.dataset.name}:null)})}
    const key=b.id;
    if(this.st.key!==key){this.st={key,client:{id:b.id,name:b.name},folder:'',trail:[],items:[],linked:[],loading:false,error:'',at:0}}
    this.st.client.name=b.name;
    if(!this.st.at&&!this.st.loading)this.load();else this.draw()},
  async load(folder){
    const s=this.st,key=s.key;if(folder!==undefined)s.folder=folder;
    s.loading=true;s.error='';this.draw();
    try{
      const j=await this.api('fm.php?client='+encodeURIComponent(s.client.id)+'&name='+encodeURIComponent(s.client.name)+(s.folder?'&folder='+encodeURIComponent(s.folder):''));
      if(this.st.key!==key)return;
      Object.assign(s,{root:j.root,folder:j.folder||'',trail:j.trail||[],items:j.items||[],linked:j.linked||[],more:!!j.more,at:Date.now()});
      if(s.folder===s.root)s.folder='';
    }catch(e){if(this.st.key!==key)return;
      if(e.data&&e.data.gone&&s.folder){toast('That folder is no longer in Zoho – back to the client folder',5000);s.loading=false;return this.load('')}
      if(s.items.length&&s.at&&!e.status){s.loading=false;s.at=Date.now();this.draw();toast('Could not refresh the file list (connection problem) – showing the last one',4000);return}   /* keep what we have: the network is only briefly away */
      s.error=e.message;s.at=Date.now()}
    s.loading=false;this.draw();
    clearTimeout(this.pt);if(s.items.some(i=>i.pending))this.pt=setTimeout(()=>{if(this.st.key===key&&document.getElementById('fm-box'))this.load()},15000)},
  draw(){
    const box=document.getElementById('fm-box');if(!box)return;const s=this.st,E=this.esc;
    const crumbs=[{id:'',name:s.client?s.client.name:'Client'}].concat(s.trail);
    const bc=`<div class="fm-bc">${crumbs.map((c,i)=>i===crumbs.length-1?`<b>${E(c.name)}</b>`:`<button data-f="open" data-id="${E(c.id)}">${E(c.name)}</button><span>›</span>`).join('')}${s.loading?'<span class="muted fm-ld">Loading…</span>':''}</div>`;
    if(s.error){box.innerHTML=bc+`<div class="none">Could not open this folder: ${E(s.error)} <button class="btn sm" data-f="refresh">Try again</button></div>`;return}
    const linked=new Set(s.linked),isAdmin=['admin','pm'].includes(LHsync.role);   /* folders: admin and project managers */
    const rows=s.items.map(it=>{
      const ext=this.extOf(it),link=linked.has(it.id),dl=it.pending?(it.dl||''):'api/download.php?id='+encodeURIComponent(it.id);
      const ico=it.folder?'<span class="fm-ico dir"></span>':(!it.pending&&this.IMG.test(ext)&&it.size!=null&&it.size<6e6?`<img class="fm-th" loading="lazy" src="${dl}" alt="" onerror="this.outerHTML='<span class=&quot;fm-ico&quot;>${E(ext.toUpperCase())}</span>'">`:`<span class="fm-ico">${E((ext||'file').slice(0,4).toUpperCase())}</span>`);
      return`<div class="fm-row ${it.folder?'is-dir':''}" data-id="${E(it.id)}" data-name="${E(it.name)}">
        <span class="fm-c0">${ico}</span>
        ${it.folder?`<button class="fm-n" data-f="open" data-id="${E(it.id)}">${E(it.name)}</button>`:(dl?`<a class="fm-n" href="${dl}" target="_blank" rel="noopener" title="Open">${E(it.name)}</a>`:`<span class="fm-n">${E(it.name)}</span>`)}
        ${link?'<span class="fm-tag" title="Shown on the brand page (logo, font, element or brand book). Remove it there.">On brand page</span>':''}
        <span class="fm-sz">${it.folder?'':this.size(it.size)}</span><span class="fm-dt">${E(this.when(it))}</span>
        <span class="fm-act">${it.folder||!dl?'':`<a class="btn sm" href="${dl}&dl=1" download="${E(it.name)}" title="Download">⬇</a>`}${it.pending?'<span class="fm-sync" title="Just uploaded – available in a moment for renaming"></span>':`<button class="btn sm" data-f="rename" data-id="${E(it.id)}">Rename</button>${link||(it.folder&&!isAdmin)?'':`<button class="btn sm del" data-f="del" data-id="${E(it.id)}">Delete</button>`}`}</span></div>`}).join('');
    box.innerHTML=bc+(s.items.length?`<div class="fm-list"><div class="fm-row fm-head"><span class="fm-c0"></span><span class="fm-n">Name</span><span class="fm-sz">Size</span><span class="fm-dt">Modified</span><span class="fm-act"></span></div>${rows}</div>${s.more?'<p class="muted" style="font-size:12px">Showing the first 1000 items – open the folder in WorkDrive to see the rest.</p>':''}`
      :(s.loading?'':`<div class="fm-empty"><b>${s.folder?'This folder is empty.':'No files yet.'}</b><span>Drop files or whole folders here, or use <b>Upload files</b>. Any size – big files continue where they stopped if the connection drops.</span></div>`))
      +`<p class="muted fm-upn" id="fm-upn"></p>`;this.upNote()},
  upNote(){const el=document.getElementById('fm-upn');if(!el||!this.st.client)return;const s=this.st,up=UPL.items.filter(u=>u.client.id===s.client.id&&u.folder===(s.folder||'')&&!/done|cancelled/.test(u.state)).length;
    el.textContent=up?up+' upload'+(up>1?'s':'')+' in progress into this folder – see the list in the corner.':''},
  item(id){return this.st.items.find(x=>x.id===id)},
  async act(a,el){
    const s=this.st,id=el.dataset.id,base={client:s.client.id,name:s.client.name,folder:s.folder};
    if(a==='open'){return this.load(id)}
    if(a==='refresh'){return this.load()}
    if(a==='pick'){$('#fm-in').click();return}
    if(a==='pickdir'){$('#fm-dir').click();return}
    try{
      if(a==='mkdir'){const n=prompt('New folder name');if(!n||!n.trim())return;await this.api('fm.php',{...base,action:'mkdir',folder_name:n.trim()});toast('Folder created');return this.load()}
      if(a==='rename'){const it=this.item(id);if(!it)return;const n=prompt('New name',it.name);if(!n||!n.trim()||n.trim()===it.name)return;const r=await this.api('fm.php',{...base,action:'rename',id,new_name:n.trim()});toast('Renamed to '+r.name);return this.load()}
      if(a==='del'){const it=this.item(id);if(!it)return;if(!confirm('Delete "'+it.name+'"'+(it.folder?' and everything inside it':'')+'?\n\nIt is moved to the WorkDrive trash, where it can be restored for a while.'))return;
        const r=await this.api('fm.php',{...base,action:'trash',ids:[id]});if(r.refused&&r.refused.length)toast('Not deleted: '+r.refused[0].why,7000);else toast('Moved to the WorkDrive trash',4000);return this.load()}
    }catch(e){toast('⚠ '+e.message,7000)}},
  /* files and folders dropped from the computer: [{file, rel:'Folder/Sub'}] */
  async fromDrop(dt){
    const out=[],items=[...(dt.items||[])].filter(i=>i.kind==='file');
    const entries=items.map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean);
    if(!entries.length)return[...(dt.files||[])].map(f=>({file:f,rel:''}));
    const walk=async(en,path)=>{
      if(en.isFile){const f=await new Promise((res,rej)=>en.file(res,rej)).catch(()=>null);if(f)out.push({file:f,rel:path});return}
      if(en.isDirectory){const rd=en.createReader(),sub=path?path+'/'+en.name:en.name;let batch;
        do{batch=await new Promise(res=>rd.readEntries(res,()=>res([])));for(const c of batch)await walk(c,sub)}while(batch.length)}};
    for(const en of entries)await walk(en,'');
    return out},
  addFiles(list,into){
    const s=this.st;if(!s.client)return;
    list=list.filter(x=>x.file&&!/^(\.DS_Store|Thumbs\.db|desktop\.ini|\._.*)$/i.test(x.file.name));
    if(!list.length){toast('Nothing to upload');return}
    const folder=into?into.id:(s.folder||''),label=[s.client.name].concat(s.trail.map(t=>t.name)).concat(into?[into.name]:[]).join(' › ');
    list.forEach(x=>UPL.add({file:x.file,rel:x.rel,client:{...s.client},folder,label}));
    toast(list.length+' file'+(list.length>1?'s':'')+' added to the upload list',3000)}
};

/* ---------- uploads: background queue, pieces, resume ---------- */
const UPL={
  items:[],active:0,MAX:2,startChain:Promise.resolve(),seq:0,open:true,
  KEY:'lh-uploads-v1',
  add(o){
    const u=Object.assign({id:++this.seq,state:'queued',received:0,size:o.file.size,err:'',tries:0,rate:0,t0:0},o);
    this.items.push(u);this.forgetInterrupted(u.file);this.remember();this.pump();this.draw()},
  pump(){
    for(const u of this.items){if(this.active>=this.MAX)break;if(u.state==='queued'){this.active++;this.run(u).finally(()=>{this.active--;this.remember();this.pump();this.draw()})}}},
  async run(u){
    try{
      if(!u.token){u.state='starting';this.draw();
        /* starts go one after another, so files of one dropped folder never create the same new folder twice */
        const start=this.startChain.then(()=>FILES.api('fmupload.php?action=start',{client:u.client.id,client_name:u.client.name,folder:u.folder,path:u.rel,name:u.file.name,size:u.file.size,last_modified:u.file.lastModified||0}));
        this.startChain=start.catch(()=>{});
        const j=await start;u.token=j.token;u.piece=j.piece;u.received=j.received||0;u.mode=j.mode;u.have=j.have||'';if(j.resumed)u.note='continued from '+FILES.size(u.received)}
      if(u.state==='paused'||u.state==='cancelled')return;
      for(let i=0;i<4;i++){
        await this.send(u);
        if(u.state==='paused'||u.state==='cancelled')return;
        if(await this.finish(u)!=='again')break}
    }catch(e){if(u.state==='cancelled'||u.state==='paused')return;u.state='error';u.err=e.message||String(e);try{LHtrack('client_error',null,'Files upload of '+u.file.name+' failed: '+u.err)}catch{}}
    this.draw()},
  wait(ms){return new Promise(r=>setTimeout(r,ms))},
  async online(){if(navigator.onLine!==false)return;await new Promise(r=>window.addEventListener('online',r,{once:true}))},
  /* pieces go up three at a time, in any order; the server keeps a list of what it has ("have"), so a retry or a reload sends only what is missing */
  PAR:3,
  async send(u){
    if(u.state==='paused'||u.state==='cancelled')return;
    u.state='sending';u.t0=Date.now();u.b0=u.received;this.draw();
    const n=Math.ceil(u.size/u.piece),have=u.have&&u.have.length===n?u.have.split('').map(c=>c==='1'):new Array(n).fill(false);
    const todo=[];for(let i=0;i<n;i++)if(!have[i])todo.push(i);
    u.acs=new Set();let fails=0,fatal=null;
    const one=async idx=>{
      while(true){
        if(u.state!=='sending'||fatal)return;
        const off=idx*u.piece,ac=new AbortController();u.acs.add(ac);let r=null,j={};
        try{r=await fetch('api/fmupload.php?action=piece&token='+u.token+'&offset='+off,{method:'POST',credentials:'same-origin',headers:{'X-LH-CSRF':LHsync.csrf,'Content-Type':'application/octet-stream'},body:u.file.slice(off,Math.min(u.size,off+u.piece)),signal:ac.signal});try{j=await r.json()}catch{}}
        catch(e){r=null}
        u.acs.delete(ac);
        if(u.state!=='sending')return;
        if(r&&r.ok){have[idx]=true;fails=0;u.received=Math.max(u.received,j.received||0);const dt=(Date.now()-u.t0)/1000;if(dt>1)u.rate=(u.received-u.b0)/dt;u.note='';this.draw();return}
        if(r&&r.status===503){await this.wait(1000*(j.retry_after||5));continue}                         /* the server asks us to slow down a moment */
        if(r&&r.status===401){fatal=new Error('You were signed out – sign in again in another tab, then press Retry');return}
        if(r&&r.status===409){fatal=Object.assign(new Error(j.error||'Upload closed'),{closed:true});return}
        if(r&&r.status>=400&&r.status<500){fatal=new Error(j.error||('Refused (HTTP '+r.status+')'));return}
        if(++fails>12){fatal=new Error((j.error||'The connection keeps failing')+' – press Retry to continue where it stopped');return}
        u.note='connection problem – trying again…';this.draw();
        await this.online();await this.wait(Math.min(30000,800*2**Math.min(fails,6)))}};
    const workers=[];for(let w=0;w<this.PAR;w++)workers.push((async()=>{while(todo.length&&u.state==='sending'&&!fatal)await one(todo.shift())})());
    await Promise.all(workers);
    u.have=have.map(x=>x?'1':'0').join('');
    if(fatal&&!fatal.closed)throw fatal},
  async finish(u){
    u.state='finishing';u.note='';this.draw();
    let j=null;
    for(let i=0;i<6&&!j;i++){
      try{j=await FILES.api('fmupload.php?action=finish&token='+u.token,{})}
      catch(e){
        if(e.status===409&&e.data&&typeof e.data.have==='string'){u.have=e.data.have;u.received=e.data.received;return'again'}   /* a piece is missing: send it, then finish */
        if(e.status===409&&e.data&&/done|queued/.test(e.data.state||'')){j=e.data;break}
        if(e.status&&e.status<500)throw e;
        await this.online();await this.wait(2000*(i+1))}}
    if(!j)throw new Error('No answer from the server – press Retry');
    u.state='done';u.note='';u.fileId=j.id||null;this.draw();   /* every byte is on our server: the designer is done, delivery to Zoho continues there */
    if(FILES.st.client&&FILES.st.client.id===u.client.id)clearTimeout(this.rt),this.rt=setTimeout(()=>FILES.load(),500)},
  pause(u){if(/queued|starting|sending/.test(u.state)){u.state='paused';u.acs&&u.acs.forEach(a=>a.abort());this.draw()}},
  resume(u){if(/paused|error/.test(u.state)){u.state='queued';u.err='';u.note='';this.pump();this.draw()}},
  async cancel(u){const was=u.state;u.state='cancelled';u.acs&&u.acs.forEach(a=>a.abort());if(u.token&&was!=='done')FILES.api('fmupload.php?action=cancel&token='+u.token,{}).catch(()=>{});this.items=this.items.filter(x=>x!==u);this.remember();this.draw()},
  clearDone(){this.items=this.items.filter(u=>u.state!=='done');this.draw()},
  busy(){return this.items.some(u=>/queued|starting|sending|finishing/.test(u.state))},
  /* unfinished uploads survive a page reload: choose the same file again and it continues where it stopped */
  remember(){try{const keep=this.items.filter(u=>!/done|cancelled/.test(u.state)).map(u=>({name:u.file.name,size:u.file.size,lm:u.file.lastModified||0,client:u.client,folder:u.folder,rel:u.rel,label:u.label}));
    const old=this.interrupted().filter(o=>!keep.some(k=>k.name===o.name&&k.size===o.size&&k.lm===o.lm));localStorage.setItem(this.KEY,JSON.stringify(old.concat(keep).slice(-200)))}catch{}},
  interrupted(){try{return JSON.parse(localStorage.getItem(this.KEY)||'[]')}catch{return[]}},
  forgetInterrupted(f){try{localStorage.setItem(this.KEY,JSON.stringify(this.interrupted().filter(o=>!(o.name===f.name&&o.size===f.size&&o.lm===(f.lastModified||0)))))}catch{}},
  orphans(){return this.interrupted().filter(o=>!this.items.some(u=>u.file.name===o.name&&u.file.size===o.size&&(u.file.lastModified||0)===o.lm))},
  pickAgain(){const i=document.createElement('input');i.type='file';i.multiple=true;i.onchange=()=>{const or=this.orphans();let n=0;
    for(const f of i.files){const o=or.find(x=>x.name===f.name&&x.size===f.size&&x.lm===(f.lastModified||0));if(o){this.add({file:f,rel:o.rel,client:o.client,folder:o.folder,label:o.label});n++}}
    toast(n?n+' upload'+(n>1?'s':'')+' continuing':'Those are not the interrupted files (same name, size and date are needed)',5000)};i.click()},
  forgetOrphans(){try{localStorage.setItem(this.KEY,JSON.stringify(this.interrupted().filter(o=>this.items.some(u=>u.file.name===o.name&&u.file.size===o.size))))}catch{};this.draw()},
  draw(){
    let t=document.getElementById('fm-tray');const E=FILES.esc,orph=this.orphans();
    if(!this.items.length&&!orph.length){if(t)t.remove();return}
    if(!t){t=document.createElement('div');t.id='fm-tray';document.body.appendChild(t);t.addEventListener('click',e=>{const b=e.target.closest('[data-u]');if(!b)return;const a=b.dataset.u,u=this.items.find(x=>x.id===+b.dataset.id);
      if(a==='min'){this.open=!this.open;this.draw()}else if(a==='clear')this.clearDone();else if(a==='again')this.pickAgain();else if(a==='forget')this.forgetOrphans();else if(u){if(a==='pause')this.pause(u);else if(a==='resume')this.resume(u);else if(a==='cancel')this.cancel(u)}})}
    const act=this.items.filter(u=>/starting|sending|finishing/.test(u.state)),done=this.items.filter(u=>u.state==='done').length,left=this.items.filter(u=>!/done/.test(u.state));
    const rate=act.reduce((a,u)=>a+(u.state==='sending'?u.rate:0),0),rem=left.reduce((a,u)=>a+(u.size-u.received),0);
    const eta=s=>s<60?Math.max(1,Math.round(s))+' s':s<3600?Math.round(s/60)+' min':(s/3600).toFixed(1)+' h';
    const head=left.length?`Uploading ${left.length} file${left.length>1?'s':''}${rate>0?' · '+FILES.size(rate)+'/s · '+eta(rem/rate)+' left':''}`:(orph.length&&!this.items.length?'Interrupted uploads':`✓ ${done} upload${done>1?'s':''} done`);
    const row=u=>{const pct=u.size?Math.floor(u.received/u.size*100):0,st={queued:'Waiting',starting:'Preparing…',sending:pct+'% · '+FILES.size(u.received)+' of '+FILES.size(u.size)+(u.rate>0?' · '+eta((u.size-u.received)/u.rate)+' left':''),finishing:'Finishing…',paused:'Paused · '+pct+'%',done:'✓ Uploaded',error:'⚠ '+u.err}[u.state]||u.state;
      return`<div class="up-r ${u.state}"><div class="up-t"><b title="${E(u.file.name)}">${E(u.file.name)}</b><span class="up-b">${/sending|paused|queued|starting/.test(u.state)?`<button data-u="${u.state==='paused'?'resume':'pause'}" data-id="${u.id}" title="${u.state==='paused'?'Continue':'Pause'}">${u.state==='paused'?'▶':'❚❚'}</button>`:''}${u.state==='error'?`<button data-u="resume" data-id="${u.id}">Retry</button>`:''}${u.state!=='done'?`<button data-u="cancel" data-id="${u.id}" title="Cancel">✕</button>`:''}</span></div>
        <div class="up-p"><i style="width:${u.state==='done'?100:pct}%"></i></div><div class="up-s">${E(st)}${u.note&&!/error|done/.test(u.state)?' · '+E(u.note):''}</div><div class="up-w">${E(u.label+(u.rel?' › '+u.rel.split('/').join(' › '):''))}</div></div>`};
    t.className=this.open?'':'min';
    t.innerHTML=`<div class="up-h"><span>${E(head)}</span><span>${done?'<button data-u="clear">Clear done</button>':''}<button data-u="min">${this.open?'–':'+'}</button></span></div>
      ${this.open?`<div class="up-l">${this.items.slice().reverse().map(row).join('')}${orph.length?`<div class="up-o"><b>${orph.length} upload${orph.length>1?'s were':' was'} interrupted</b> (page closed or reloaded): ${E(orph.slice(0,3).map(o=>o.name).join(', '))}${orph.length>3?'…':''}<div><button data-u="again">Choose the same files to continue</button><button data-u="forget">Forget</button></div></div>`:''}</div>`:''}`;
    FILES.upNote()}
};
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('[data-f]');if(!t||!FILES.on())return;e.preventDefault();FILES.act(t.dataset.f,t)});
window.addEventListener('online',()=>{if(FILES.on()&&document.getElementById('fm-box'))FILES.load()});
window.addEventListener('beforeunload',e=>{if(UPL.busy()){e.preventDefault();e.returnValue='Uploads are still running. If you leave, choose the same files again later to continue.'}});
setTimeout(()=>{if(FILES.on()&&UPL.orphans().length)UPL.draw()},1500);
