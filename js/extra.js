/* LatchHub – theme, home page, icon generator UI */
const slug2=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
/* ---------- theme ---------- */
const THEME={get(){try{return localStorage.getItem('lh-theme')||'auto'}catch{return'auto'}},
  set(v){try{localStorage.setItem('lh-theme',v)}catch{}this.apply()},
  apply(){const v=this.get(),r=document.documentElement;if(v==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',v)}};
THEME.apply();
/* ---------- home ---------- */
function viewHome(){
  const top=S.brands.filter(x=>!x.parent||!S.brands.some(y=>y.id===x.parent)),subs=S.brands.length-top.length;
  const n=(f)=>S.brands.reduce((a,b)=>a+f(b),0);
  
  const card=x=>{const ks=S.brands.filter(y=>y.parent===x.id),hl=heroLogo(x),p=brandHex(x),ink=inkOn(p);
    return`<button class="hc" data-a="open" data-id="${x.id}" data-name="${esc((x.name+' '+ks.map(k=>k.name).join(' ')).toLowerCase())}"><span class="hc-top" style="background:${p};color:${ink}"><span class="hc-logo">${hl?`<img loading="lazy" src="${hsrc(hl)}" alt="">`:esc(x.name[0]||'?')}</span><span class="hc-arrow">→</span></span><span class="hc-body"><b>${esc(x.name)}</b><span class="muted">${x.logos.length} logos · ${x.colors.length} colours${(x.elements||[]).length?` · ${x.elements.length} elements`:''}</span><span class="dots">${x.colors.slice(0,8).map(c=>`<i style="background:${c.hex}"></i>`).join('')}</span>${ks.length?`<span class="hc-sub">${ks.map(k=>esc(k.name)).join(' · ')}</span>`:''}</span></button>`};
  return`<div class="home"><div class="hhead"><div><div class="eyebrow">Latch Infinity</div><h1>LatchHub</h1><p>Every client's brand assets in one place – colours, logos, fonts, elements and rules. Pick a client to start.</p></div><div class="row"><button class="btn pri" data-a="newBrand">＋ New brand</button><button class="btn" data-a="openCheck">Design Lens</button></div></div>
  <div class="hbar"><input type="text" id="hsearch" placeholder="Search clients…" autocomplete="off"><span class="muted" id="hcount">${top.length} clients</span></div>
  ${top.length?`<div class="hgrid">${top.map(card).join('')}</div>`:`<div class="none">No clients yet – add your first brand.</div>`}</div>`}
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
