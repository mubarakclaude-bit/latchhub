/* LatchHub – shared brands. When you are signed in through the server (index.php), every designer sees the same clients:
   - a changed or new brand is saved on the server,
   - files added to it (logos, fonts, elements, brand book) are uploaded to the client's Zoho folder first and replaced by a link,
   - changes made by other designers are picked up every minute and when you return to the tab.
   Without the server (opened locally) none of this runs and the app behaves as before. */
const LHsync={
  on:false,csrf:'',role:'',ver:{},hash:{},busy:false,again:false,timer:null,
  init(){
    const bar=document.getElementById('lh-user');
    if((typeof DEMO!=='undefined'&&DEMO)||!bar)return false;
    this.csrf=bar.dataset.csrf||'';this.role=bar.dataset.role||'designer';this.on=true;
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){this.refresh();if(this.failed)this.flush()}});
    setInterval(()=>this.refresh(),60000);
    return true},
  h(o){const s=JSON.stringify(o);let x=5381;for(let i=0;i<s.length;i++)x=((x<<5)+x+s.charCodeAt(i))|0;return x+':'+s.length},
  status(t){const e=document.getElementById('lh-sync');if(e)e.textContent=t},
  async api(path,body){
    const o={credentials:'same-origin',headers:{}};
    if(body!==undefined){o.method='POST';o.headers['Content-Type']='application/json';o.headers['X-LH-CSRF']=this.csrf;o.body=JSON.stringify(body)}
    const r=await fetch('api/'+path,o);let j={};try{j=await r.json()}catch{}
    if(!r.ok)throw Object.assign(new Error(j.error||('Server error '+r.status)),{status:r.status,data:j});
    return j},
  /* first load: true = the server has brands (they replace the local copy), false = the server is empty */
  async load(){
    const j=await this.api('brands.php'),srv=j.brands;
    if(!srv.length)return false;
    const ids=new Set(srv.map(x=>x.id)),local=(S.brands||[]).filter(b=>b.user&&!ids.has(b.id));   /* brands made in this browser before the server existed are kept and pushed */
    S.brands=srv.map(x=>x.brand).concat(local);
    this.ver={};this.hash={};srv.forEach(x=>{this.ver[x.id]=x.version;this.hash[x.id]=this.h(x.brand)});
    if(local.length)setTimeout(()=>this.flush(),800);
    return true},
  onSave(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),700)},
  /* every file still stored inside the brand as inline data, with where it belongs in Zoho */
  collect(b){
    const jobs=[],add=(holder,key,name,folder)=>{const v=holder&&holder[key];if(typeof v==='string'&&v.startsWith('data:')&&v.length>8000)jobs.push({holder,key,name,folder})};
    (b.logos||[]).forEach(l=>{const folder='Brand assets/'+(l.group||'Logos');add(l,'data',l.filename||l.name,folder);add(l,'source',(l.filename||l.name)+'.'+(l.ext||'pdf'),folder);(l.formats||[]).forEach(f=>add(f,'url',f.filename||l.name,folder))});
    (b.elements||[]).forEach(e=>{(e.formats||[]).forEach(f=>add(f,'url',f.filename||e.name,'Brand assets/Elements'));add(e,'file',e.name,'Brand assets/Elements')});
    (b.fonts||[]).forEach(f=>add(f,'file',(f.name||'font')+(f.ext||'.ttf'),'Brand assets/Fonts'));
    return jobs},
  extFor(mime){return({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg','image/gif':'gif','application/pdf':'pdf','font/ttf':'ttf','font/otf':'otf','font/woff':'woff','font/woff2':'woff2'})[mime]||''},
  async uploadBlob(b,blob,filename,folder){
    const ext=this.extFor(blob.type);if(ext&&!/\.[A-Za-z0-9]{2,5}$/.test(filename))filename+='.'+ext;
    const MB=n=>(n/1048576).toFixed(1)+' MB',what='"'+filename+'" ('+MB(blob.size)+')',kind=blob.type==='application/pdf'?'auto':'asset';
    const fields=fd=>{fd.append('client',b.id);fd.append('client_name',b.name);fd.append('kind',kind);fd.append('folder',folder)};
    /* network hiccups and server errors are retried; refusals (4xx) are final */
    const post=async fd=>{let last={};for(let t=0;t<3;t++){try{const r=await fetch('api/upload.php',{method:'POST',credentials:'same-origin',headers:{'X-LH-CSRF':this.csrf},body:fd});let j={};try{j=await r.json()}catch{}last={r,j};if(r.status<500)return last}catch(e){last={err:e}}await new Promise(x=>setTimeout(x,900*(t+1)))}return last};
    const fail=res=>{const r=res.r,j=res.j||{};try{LHtrack('client_error',null,'Upload of '+what+' failed: '+(res.err?res.err.message:(j.error||j.warning||('HTTP '+r.status))))}catch{}throw new Error('could not upload '+what+' to Zoho: '+(res.err?'the connection to the server failed ('+res.err.message+')':(j.error||j.warning||('server answered '+r.status+(r.status===413?' – the file is bigger than the server allows':''))))+(j.detail?' – Zoho said: '+j.detail:''))};
    let res;
    if(blob.size>12*1048576){                       /* big files go up in pieces, so no single request is too large for the host or its CDN */
      const id=[...crypto.getRandomValues(new Uint8Array(12))].map(x=>x.toString(16).padStart(2,'0')).join(''),CH=6*1048576,n=Math.ceil(blob.size/CH);
      for(let i=0;i<n;i++){
        this.status('Saving '+filename+' to Zoho… piece '+(i+1)+'/'+n);
        const fd=new FormData();fields(fd);fd.append('filename',filename);fd.append('chunk_id',id);fd.append('chunk_index',i);fd.append('chunk_total',n);fd.append('file',blob.slice(i*CH,(i+1)*CH),'piece');
        res=await post(fd);if(!res.r||!res.r.ok)fail(res)}
    }else{const fd=new FormData();fields(fd);fd.append('file',blob,filename);res=await post(fd);if(!res.r||!res.r.ok)fail(res)}
    if(!res.j.id)throw new Error('could not upload '+what+' to Zoho: '+(res.j.warning||'Zoho gave no file id'));
    return 'api/download.php?id='+encodeURIComponent(res.j.id)},
  /* move this brand's inline files into Zoho; the brand then only holds links */
  async pushFiles(b){
    const failed=[],jobs=this.collect(b),book=b.book&&b.book.blobKey&&!b.book.url?b.book:null,total=jobs.length+(book?1:0);let n=0;
    for(const j of jobs){this.status('Saving files to Zoho… '+(++n)+'/'+total);
      try{const blob=await (await fetch(j.holder[j.key])).blob();j.holder[j.key]=await this.uploadBlob(b,blob,j.name,j.folder)}catch(e){failed.push(e.message)}}
    if(book){this.status('Saving files to Zoho… '+(++n)+'/'+total);
      try{
        let f=await DB.get(book.blobKey);if(!f)throw new Error('The brand book file is no longer in this browser');
        if(f.size>8e6&&typeof PDFT!=='undefined'){try{const c=await PDFT.compress(f,{min:8e6,target:12e6,prog:t=>this.status(t)});f=c.file}catch{}}   /* safety net: a brand book that is still heavy is shrunk before it goes to Zoho */
        book.url=await this.uploadBlob(b,f,book.filename||'brand-book.pdf','Brand book');delete book.blobKey
      }catch(e){failed.push(e.message)}}
    if(total)DB.set('state',S).catch(()=>{});
    return failed},
  /* a copy of the brand without the files that are still only inside this browser, so the client can already be saved for the whole team */
  stripInline(b){
    const c=JSON.parse(JSON.stringify(b)),big=v=>typeof v==='string'&&v.startsWith('data:')&&v.length>8000;
    c.logos=(c.logos||[]).map(l=>{if(big(l.data))l.data='';if(big(l.source))l.source=null;l.formats=(l.formats||[]).filter(f=>!big(f.url));return l}).filter(l=>(l.formats&&l.formats.length)||l.data);
    c.elements=(c.elements||[]).map(e=>{e.formats=(e.formats||[]).filter(f=>!big(f.url));if(big(e.file))e.file=null;return e}).filter(e=>(e.formats&&e.formats.length)||e.css||e.preview);
    (c.fonts||[]).forEach(f=>{if(big(f.file))f.file=null});
    if(c.book&&c.book.blobKey&&!c.book.url)delete c.book;
    return c},
  async flush(){
    if(!this.on)return;
    if(this.busy){this.again=true;return}
    this.busy=true;this.failed=false;let trashed=0,renamed=false;const partial=[];const el0=document.getElementById('lh-sync');if(el0){el0.onclick=null;el0.style.cursor='';el0.style.textDecoration=''}
    try{
      const ids=new Set(S.brands.map(b=>b.id));
      for(const id of Object.keys(this.ver)){if(ids.has(id))continue;
        try{this.status('Deleting…');const r=await this.api('brands.php',{action:'delete',id});delete this.ver[id];delete this.hash[id];if(r.warning)toast(r.warning,12000);else if(r.trashed_folder)toast('Client deleted – its Zoho folder is now in the WorkDrive trash (restorable there)',7000)}
        catch(e){toast(e.status===403?'Only the admin can delete a client':e.message);this.status('');this.busy=false;await this.refresh(true);return}}
      for(const b of S.brands.slice()){
        if(this.hash[b.id]===this.h(b))continue;
        try{
          this.status('Saving…');const bad=await this.pushFiles(b);
          const r=await this.api('brands.php',{action:'save',brand:bad.length?this.stripInline(b):b,base_version:this.ver[b.id]||0});
          this.ver[b.id]=r.version;if(bad.length)partial.push({b,bad});else this.hash[b.id]=this.h(b);trashed+=r.trashed||0;if(r.warning)toast(r.warning,12000);if(r.renamed)renamed=true;
        }catch(e){
          if(e.status===409){
            const cur=e.data&&e.data.current,i=S.brands.findIndex(x=>x.id===b.id);
            if(cur&&i>=0){S.brands[i]=cur.brand;this.ver[b.id]=cur.version;this.hash[b.id]=this.h(cur.brand);toast('Someone else just changed "'+b.name+'" – showing their version');this.afterChange()}
            else if(!cur&&i>=0){S.brands.splice(i,1);delete this.ver[b.id];delete this.hash[b.id];toast('"'+b.name+'" was deleted by the admin');this.afterChange()}
          }else{this.fail(b,e);this.busy=false;return}}}
      if(partial.length){this.fail(partial[0].b,new Error(partial.flatMap(p=>p.bad).join(' | ')),true);return}
      DB.set('state',S).catch(()=>{});this.status('✓ saved'+(trashed?' · '+trashed+' file'+(trashed>1?'s':'')+' moved to the Zoho trash':'')+(renamed?' · Zoho folder renamed':''));setTimeout(()=>{if(!this.busy)this.status('')},2500);
    }finally{this.busy=false;if(this.again){this.again=false;this.flush()}}},
  /* make a failure impossible to miss: stays in the corner, click it for details and to retry */
  fail(b,e,partial){
    this.failed=true;this.lastError='"'+b.name+'": '+e.message;
    toast((partial?'Client saved, but some files are not in Zoho yet – ':'Not saved to the server – ')+this.lastError,12000);this.status(partial?'⚠ saved, but files not uploaded – click for details':'⚠ not saved – click for details');
    const el=document.getElementById('lh-sync');if(el){el.style.cursor='pointer';el.style.textDecoration='underline';el.onclick=()=>{alert((partial?'The client is saved and your team can see it, but these files could not be uploaded to Zoho yet:':'This change is NOT on the server yet.')+'\n\n'+this.lastError+'\n\nYour work and the files are still in this browser. Fix the cause (or tell the admin), then press OK to retry.');this.flush()}}},
  safeRender(){
    const a=document.activeElement;
    if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))return;
    if(document.querySelector('[data-m]'))return;
    render()},
  afterChange(){
    S.brands.forEach(b=>(b.fonts||[]).forEach(f=>f.file&&registerFont(f)));
    if(ui.brandId&&!S.brands.find(b=>b.id===ui.brandId))ui.brandId=S.brands[0]?.id||null;
    DB.set('state',S).catch(()=>{});this.safeRender()},
  /* pick up other designers' work */
  async refresh(force){
    if(!this.on||this.busy)return;
    try{
      const j=await this.api('brands.php'),ids=new Set(j.brands.map(x=>x.id));let changed=false;
      for(const x of j.brands){
        const i=S.brands.findIndex(b=>b.id===x.id);
        if(i<0){S.brands.push(x.brand);changed=true}
        else if(x.version>(this.ver[x.id]||0)){
          const dirty=this.hash[x.id]!==undefined&&this.h(S.brands[i])!==this.hash[x.id];
          if(dirty&&!force)continue;
          S.brands[i]=x.brand;changed=true}
        else continue;
        this.ver[x.id]=x.version;this.hash[x.id]=this.h(x.brand)}
      for(const id of Object.keys(this.ver)){
        if(ids.has(id))continue;
        const i=S.brands.findIndex(b=>b.id===id);
        if(i>=0&&this.h(S.brands[i])===this.hash[id]){S.brands.splice(i,1);changed=true}
        delete this.ver[id];delete this.hash[id]}
      if(changed)this.afterChange();
    }catch{}}
};
/* Activity log: tell the server about things only the browser sees. Best effort – never blocks or breaks the screen. */
window.LHtrack=function(action,brand,details){try{if(typeof LHsync==='undefined'||!LHsync.on)return;let b=brand;if(!b&&typeof S!=='undefined'&&typeof ui!=='undefined')b=S.brands.find(x=>x.id===ui.brandId);fetch('api/activity.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-LH-CSRF':LHsync.csrf},body:JSON.stringify({action,client_id:b?b.id:'',client_name:b?b.name:'',details:String(details||'').slice(0,600)})}).catch(()=>{})}catch{}};
/* Every download, opened link and copied value is recorded for the admin's activity log: which file, of which client, in which section. */
(function(){
  const SEC={'s-logos':'logo_download','s-elements':'element_download','s-fonts':'font_download','s-book':'brand_book_download','s-colors':'swatch_download','s-svg':'logo_download'};
  const labelOf=el=>{let n=el.parentElement;for(let i=0;i<5&&n;i++,n=n.parentElement){const b=n.querySelector(':scope > b, :scope > .lc > b, :scope b');if(b&&b.textContent.trim())return b.textContent.trim()}return''};
  document.addEventListener('click',e=>{
    const a=e.target.closest&&e.target.closest('a[href]');if(!a||!window.LHtrack)return;
    const sec=a.closest('section'),sid=sec?sec.id:'',href=a.getAttribute('href')||'',file=a.getAttribute('download')||'',txt=a.textContent.trim().replace(/\s+/g,' ').slice(0,60);
    if(sid==='s-links'||(!file&&a.target==='_blank'&&sid!=='s-book'&&sid!=='s-fonts')){let host='';try{host=new URL(href,location.href).host}catch{}LHtrack('link_opened',null,(txt||'link')+(host?' · '+host:''));return}
    if(sid==='s-fonts'&&!file){LHtrack('font_download',null,(labelOf(a)||'font')+' · '+txt);return}
    if(sid==='s-book'&&!file){LHtrack('brand_book_download',null,(labelOf(a)||'Brand book')+' (opened)');return}
    if(!file&&!/download\.php|^assets\/|^data:|^blob:/.test(href))return;
    const what=labelOf(a),fmt=txt&&txt!==file?' · '+txt:'';
    LHtrack(SEC[sid]||'asset_download',null,(file||txt||'file')+(what&&!(file||'').includes(what)?' – '+what:'')+fmt)},true);
})();
