/* LatchHub – theme, home page, icon generator UI */
const slug2=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
/* ---------- theme ---------- */
/* Dark mode is switched off for now: set DARK_MODE to true to bring back the Light / Auto / Dark choice (and the CSS for dark is still in place). */
const DARK_MODE=false;
const THEME={get(){if(!DARK_MODE)return'light';try{return localStorage.getItem('lh-theme')||'auto'}catch{return'auto'}},
  set(v){try{localStorage.setItem('lh-theme',v)}catch{}this.apply()},
  apply(){const v=this.get(),r=document.documentElement;if(v==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',v)}};
THEME.apply();
/* ---------- home ---------- */
function viewHome(){
  const top=S.brands.filter(x=>!x.parent||!S.brands.some(y=>y.id===x.parent)),subs=S.brands.length-top.length;
  const n=(f)=>S.brands.reduce((a,b)=>a+f(b),0);
  
  const row=(x,i)=>{const ks=S.brands.filter(y=>y.parent===x.id),L=bestLogo(x);
    return`<button class="hx" data-a="open" data-id="${x.id}" data-name="${esc((x.name+' '+ks.map(k=>k.name).join(' ')).toLowerCase())}"><span class="no">${String(i+1).padStart(2,'0')}</span><span class="hxl">${L?`<img data-src="${L}" alt="">`:`<span class="ini">${esc((x.name[0]||'?').toUpperCase())}</span>`}</span><span class="hxn">${esc(x.name)}${ks.length?`<small>${ks.map(k=>esc(k.name)).join(' · ')}</small>`:''}</span><span class="pal"><span class="strip ${x.colors.length?'':'none'}" style="display:flex">${x.colors.slice(0,10).map(c=>`<i style="background:${c.hex}"></i>`).join('')}</span></span><span class="hxc">${x.logos.length} logos · ${x.colors.length} colours${(x.elements||[]).length?`<br>${x.elements.length} elements`:''}</span><span class="ar">→</span></button>`};
  return`<div class="home"><div class="hhead"><div><div class="eyebrow">01 — Select a brand</div><h1>Choose<br>a brand</h1></div><div class="row"><button class="btn pri" data-a="newBrand">＋ New brand</button><button class="btn" data-a="openCheck">Design Lens</button></div></div>
  <div class="hbar"><input type="text" id="hsearch" placeholder="Search brands" autocomplete="off"><span class="muted" id="hcount">${top.length} clients</span></div>
  ${top.length?`<div class="hx-h"><span>No.</span><span>Logo</span><span>Brand</span><span>Palette</span><span>Assets</span><span></span></div>${top.map(row).join('')}`:`<div class="none">No clients yet – add your first brand.</div>`}</div>`}
/* ---------- automatic logo pick + neat placement for the brand index ---------- */
function bestLogo(b){
  const c=(b.logos||[]).filter(l=>(l.check||l.preview)&&!/pattern|reference/i.test(l.group||''));if(!c.length)return'';
  const sc=l=>{const t=(l.name+' '+(l.group||'')+' '+(l.filename||'')).toLowerCase();let s=0;
    if(/primary|main|master/.test(t))s+=4;if(/full.?colou?r|colou?r|original/.test(t))s+=3;if(/horizontal|wordmark|lockup|logo/.test(t))s+=2;
    if(/white|reverse|negative|dark|mono|black|grey|gray|greyscale|on /.test(t))s-=6;if(/icon|symbol|mark only|seal|square|favicon|stacked|vertical/.test(t))s-=3;
    const r=l.w&&l.h?l.w/l.h:0;if(r>=1.4&&r<=6)s+=2;else if(r&&r<1.1)s-=1;if(l.preview)s+=1;return s};
  const l=c.map(x=>[sc(x),x]).sort((a,b)=>b[0]-a[0])[0][1];return hsrc(l)}
const _trim=new Map();
function trimLogo(src){if(_trim.has(src))return _trim.get(src);
  const p=new Promise(res=>{const i=new Image();i.onload=()=>{try{const sc=Math.min(1,600/Math.max(i.naturalWidth,i.naturalHeight)),W=Math.max(1,Math.round(i.naturalWidth*sc)),H=Math.max(1,Math.round(i.naturalHeight*sc)),c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(i,0,0,W,H);
      const d=x.getImageData(0,0,W,H).data,cr=d[0],cg=d[1],cb=d[2],ca=d[3],bgOpaque=ca>240;let x0=W,y0=H,x1=-1,y1=-1,lum=0,n=0;
      for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){const o=(y*W+xx)*4;if(d[o+3]<24)continue;if(bgOpaque&&Math.abs(d[o]-cr)+Math.abs(d[o+1]-cg)+Math.abs(d[o+2]-cb)<30)continue;
        if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(y<y0)y0=y;if(y>y1)y1=y;lum+=.299*d[o]+.587*d[o+1]+.114*d[o+2];n++}
      if(x1<0||n<20)return res({src,dark:false});
      const o=document.createElement('canvas');o.width=x1-x0+1;o.height=y1-y0+1;o.getContext('2d').drawImage(c,x0,y0,o.width,o.height,0,0,o.width,o.height);
      res({src:o.toDataURL('image/png'),dark:lum/n>225&&!bgOpaque})}catch{res({src,dark:false})}};i.onerror=()=>res({src,dark:false});i.src=src});
  _trim.set(src,p);return p}
async function homeLogos(){for(const im of document.querySelectorAll('.hx .hxl img[data-src]')){const r=await trimLogo(im.dataset.src);im.src=r.src;if(r.dark)im.parentElement.classList.add('ondark')}}
/* ---------- icon generator ---------- */
const AIKEY={get(){try{return localStorage.getItem('lh-ai-key')||''}catch{return''}},set(v){try{v?localStorage.setItem('lh-ai-key',v):localStorage.removeItem('lh-ai-key')}catch{}}};
const iconTheme=b=>b.iconTheme||{stroke:'#FFFFFF',accent:brandHex(b),bg:'#000000',w:6};
function openIconGen(bid){
  const b=S.brands.find(x=>x.id===bid),th=iconTheme(b);$('#modal')?.remove();
  const m=document.createElement('div');m.id='modal';
  m.innerHTML=`<div class="mp"><div class="mh"><h2>New icon for ${esc(b.name)}</h2><button class="btn sm" data-m="close">✕ Close</button></div><div class="mb">
   <p class="muted" style="margin:6px 0 12px">Describe the icon you need. It is drawn in the ${esc(b.name)} icon style: bold outline, cut corners and accent bars in ${th.accent}.</p>
   <div class="row"><input type="text" id="ig-q" placeholder="e.g. calendar, shopping cart, semiconductor chip, graduation…" style="flex:1;min-width:220px"><button class="btn pri" data-m="gen">Generate</button><button class="btn" data-m="ai" id="ig-ai" ${AIKEY.get()?'':'hidden'}>Draw with AI</button></div>
   <div id="ig-msg" class="muted" style="margin:10px 0"></div><div class="igen" id="ig-res"></div>
   <details style="margin-top:16px"><summary><b>Smart mode (optional)</b></summary><div style="padding-top:10px"><p class="muted" style="margin:0 0 8px;font-size:12.5px">Paste your own Anthropic API key to let Claude draw icons that are not in the built-in library. The key is stored only in this browser; only your description and the style examples are sent.</p><div class="row"><input type="text" id="ig-key" placeholder="sk-ant-…" value="${esc(AIKEY.get())}" style="flex:1;min-width:220px"><button class="btn sm" data-m="savekey">Save key</button></div></div></details></div></div>`;
  document.body.appendChild(m);const q=()=>$('#ig-q',m).value.trim(),res=$('#ig-res',m),msg=$('#ig-msg',m);
  const card=(id,svgText,label)=>`<div class="igc"><div class="igp" style="background:${th.bg}">${svgText}</div><input type="text" value="${esc(label)}" data-name><button class="btn sm pri" data-m="add">＋ Add to icons</button><textarea hidden data-svg>${esc(svgText)}</textarea></div>`;
  const show=hits=>{res.innerHTML=hits.map(h=>card(h.id,IconGen.svg(h.draw(),th),h.label||(q()||h.id).replace(/\b\w/g,c=>c.toUpperCase()))).join('')};
  m.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='ig-q')m.querySelector('[data-m=gen]').click()});
  m.addEventListener('click',async e=>{const t=e.target.closest('[data-m]');if(e.target===m){m.remove();return}if(!t)return;const a=t.dataset.m;
    if(a==='close')m.remove();
    else if(a==='savekey'){AIKEY.set($('#ig-key',m).value.trim());$('#ig-ai',m).hidden=!AIKEY.get();toast(AIKEY.get()?'Key saved':'Key removed')}
    else if(a==='gen'){const text=q();if(!text){msg.textContent='Type what the icon should show.';return}const r=IconGen.match(text);
      if(r.hits.length){msg.textContent=r.hits.length>1?'Best match first – pick the one you like, rename it, then add.':'';show(r.hits.map((h,i)=>({...h,label:i?h.id[0].toUpperCase()+h.id.slice(1):text.replace(/\b\w/g,c=>c.toUpperCase())})))}
      else{msg.innerHTML=`No built-in concept for “${esc(text)}” yet.${AIKEY.get()?' Use <b>Draw with AI</b>.':' Pick a similar concept below, or add a key in Smart mode to draw anything.'}`;res.innerHTML='';show(r.all.slice(0,0));
        res.innerHTML=`<div class="igchips">${r.all.map(h=>`<button class="stop" data-m="pick" data-id="${h.id}">${h.id}</button>`).join('')}</div>`}}
    else if(a==='pick'){const h=IconGen.L.find(x=>x[0]===t.dataset.id);res.innerHTML+=card(h[0],IconGen.svg(h[2](),th),q()||h[0])}
    else if(a==='ai'){const text=q();if(!text){msg.textContent='Type what the icon should show.';return}msg.textContent='Drawing…';try{const sv=await IconGen.ai(text,th,AIKEY.get());msg.textContent='Drawn by Claude – check it before adding.';res.insertAdjacentHTML('afterbegin',card('ai',sv,text.replace(/\b\w/g,c=>c.toUpperCase())))}catch(err){msg.textContent='Could not draw: '+err.message}}
    else if(a==='add'){const c=t.closest('.igc'),name=$('[data-name]',c).value.trim()||'Icon',sv=$('[data-svg]',c).value;t.disabled=true;t.textContent='Adding…';await addIcon(b,name,sv,th);m.remove()}});
  setTimeout(()=>$('#ig-q',m).focus(),50)}
async function addIcon(b,name,svgDark,th){
  const light=svgDark.replace(new RegExp(th.stroke.replace('#','#'),'gi'),'#111111'),base=`${slug2(b.name)}_icon_${slug2(name)}`;
  const [pd,pl,pt]=await Promise.all([IconGen.toPng(svgDark,1024),IconGen.toPng(light,1024),IconGen.toPng(svgDark,360)]);
  (b.elements=b.elements||[]).push({id:uid(),type:'icon',name,user:true,preview:pt,bg:th.bg,formats:[
    {label:'SVG',url:IconGen.dataSvg(svgDark),filename:base+'.svg'},{label:'PNG',url:pd,filename:base+'.png'},
    {label:'SVG · light bg',url:IconGen.dataSvg(light),filename:base+'_for-light-bg.svg'},{label:'PNG · light bg',url:pl,filename:base+'_for-light-bg.png'}]});
  save();render();toast('Icon added to '+b.name);setTimeout(()=>document.getElementById('s-elements')?.scrollIntoView(),50)}
