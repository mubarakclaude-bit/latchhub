/* LatchHub – SVG studio: pick a vector logo of a brand, recolour it using ONLY the brand's approved colours, download it as SVG or PNG.
   Nothing is uploaded: the file is read, recoloured and exported in the browser. */
const SVGS=(()=>{
const norm=v=>{const c=LOGOV.rgba(v);if(!c||c[3]===0)return null;return{hex:'#'+[c[0],c[1],c[2]].map(x=>Math.round(x).toString(16).padStart(2,'0')).join(''),a:c[3]}};
const rgbOf=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const PROPS=['fill','stroke','stop-color'],DECL=/(^|[;{\s])(fill|stroke|stop-color)\s*:\s*([^;}!]+)/gi,SHAPES='path,rect,circle,ellipse,polygon,polyline,text,tspan';
function parse(text){
  const doc=new DOMParser().parseFromString(text,'image/svg+xml');
  if(doc.querySelector('parsererror')||!doc.documentElement||doc.documentElement.localName!=='svg')return null;
  doc.querySelectorAll('script').forEach(s=>s.remove());                       // never carry scripts into a download
  doc.querySelectorAll('*').forEach(el=>{[...el.attributes].forEach(a=>{if(/^on/i.test(a.name))el.removeAttribute(a.name)})});
  return doc}
/* every colour the file paints with, most used first (a shape with no colour at all paints black, so black is listed then) */
function inventory(doc){
  const m=new Map(),add=v=>{const n=norm(v);if(n)m.set(n.hex,(m.get(n.hex)||0)+1)};
  doc.querySelectorAll('*').forEach(el=>{
    PROPS.forEach(p=>{if(el.hasAttribute(p))add(el.getAttribute(p))});
    (el.getAttribute('style')||'').replace(DECL,(x,pre,p,v)=>{add(v.trim());return x});
    if(el.localName==='style')el.textContent.replace(DECL,(x,pre,p,v)=>{add(v.trim());return x})});
  let implicit=false;
  doc.querySelectorAll(SHAPES).forEach(el=>{
    if(implicit||el.closest('defs,clipPath,mask'))return;
    if(el.hasAttribute('fill')||/fill\s*:/.test(el.getAttribute('style')||'')||el.getAttribute('class'))return;
    for(let p=el.parentElement;p;p=p.parentElement)if(p.hasAttribute&&p.hasAttribute('fill'))return;
    implicit=true});
  if(implicit)m.set('#000000',(m.get('#000000')||0)+1);
  return[...m].map(([hex,count])=>({hex,count})).sort((a,b)=>b.count-a.count)}
/* map = {originalHex: newHex}; transparency of the original colour is kept */
function recolour(text,map){
  const doc=parse(text);if(!doc)return text;
  const f=v=>{const n=norm(v);if(!n)return null;const to=map[n.hex];if(!to||to===n.hex)return null;const c=rgbOf(to);return n.a<1?`rgba(${c[0]},${c[1]},${c[2]},${+n.a.toFixed(3)})`:to};
  doc.querySelectorAll('*').forEach(el=>{
    PROPS.forEach(p=>{if(el.hasAttribute(p)){const o=f(el.getAttribute(p));if(o)el.setAttribute(p,o)}});
    if(el.hasAttribute('style'))el.setAttribute('style',el.getAttribute('style').replace(DECL,(m,pre,p,v)=>{const o=f(v.trim());return o?pre+p+':'+o:m}));
    if(el.localName==='style')el.textContent=el.textContent.replace(DECL,(m,pre,p,v)=>{const o=f(v.trim());return o?pre+p+':'+o:m})});
  const to=map['#000000'];if(to&&to!=='#000000'){const root=doc.documentElement;if(!root.hasAttribute('fill'))root.setAttribute('fill',to)}   // shapes that had no colour inherit the new one
  return new XMLSerializer().serializeToString(doc)}
/* near-identical colours (compression noise, #fefefe next to #fff) are one row for the designer: [{hex(main one), members:[…], count}] */
function grouped(inv){
  const out=[];
  for(const c of inv){
    const g=out.find(x=>dE(labOfHex(x.hex),labOfHex(c.hex))<5);
    if(g){g.members.push(c.hex);g.count+=c.count}else out.push({hex:c.hex,members:[c.hex],count:c.count})}
  return out}
function size(doc){
  const root=doc.documentElement,vb=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(parseFloat);
  if(vb.length===4&&vb.every(isFinite)&&vb[2]>0&&vb[3]>0)return[vb[2],vb[3]];
  return[parseFloat(root.getAttribute('width'))||300,parseFloat(root.getAttribute('height'))||150]}
const dataUrl=t=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(t);
/* PNG at a chosen width; transparent unless a background colour is given */
async function png(text,width,bg){
  const doc=parse(text),[w,h]=size(doc),root=doc.documentElement;
  root.setAttribute('width',w);root.setAttribute('height',h);
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('This SVG could not be drawn'));i.src=dataUrl(new XMLSerializer().serializeToString(doc))});
  const W=Math.min(8000,Math.max(16,Math.round(width))),H=Math.max(1,Math.round(W*h/w)),c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  if(bg){x.fillStyle=bg;x.fillRect(0,0,W,H)}x.drawImage(img,0,0,W,H);
  return await new Promise(r=>c.toBlob(r,'image/png'))}
/* the SVG a logo record offers (own file, a Zoho link, or inline data) */
const srcOf=l=>{const f=(l.formats||[]).find(x=>x.label==='SVG');return(f&&f.url)||l.svg||(/^data:image\/svg/.test(l.data||'')?l.data:null)};
const listOf=b=>(b.logos||[]).filter(l=>!isRef(l)&&srcOf(l));
/* approved = the brand's own palette, plus white and black when the brand allows neutrals */
function approved(b){
  const out=[],seen=new Set(),add=(hex,name,role)=>{const n=norm(hex);if(n&&!seen.has(n.hex)){seen.add(n.hex);out.push({hex:n.hex,name,role})}};
  (b.colors||[]).forEach(c=>add(c.hex,c.name||c.hex,c.role||''));
  if((b.rules||{}).neutrals!==false){add('#ffffff','White','Neutral');add('#000000','Black','Neutral')}
  return out}

/* ---------- the section on the brand page ---------- */
function section(b){
  const L=listOf(b);if(!L.length)return'';
  return`<section id="s-svg"><div class="sh"><h3>SVG<span class="hint">Pick a vector logo, recolour it with approved brand colours, then download it as SVG or PNG</span></h3></div>
  <div class="lbg-${ui.lbg||'light'}"><div class="lgrid">${L.map(l=>`<div class="lt"><div class="sq"><img loading="lazy" src="${esc(l.preview||srcOf(l))}" alt="${esc(l.name)}"></div><div class="lc"><b>${esc(l.name)}</b></div><div class="row" style="padding:0 12px 12px"><button class="btn sm pri" data-a="svgCustom" data-id="${l.id}">Customise &amp; download</button></div></div>`).join('')}</div></div></section>`}

/* ---------- the customise window ---------- */
async function open(b,l){
  document.getElementById('modal')?.remove();
  const text=await svgTextOf(srcOf(l));
  if(!text){toast('Could not read this SVG file',6000);return}
  const doc=parse(text);if(!doc){toast('This SVG file could not be read',6000);return}
  const inv=grouped(inventory(doc)),pal=approved(b),hasImg=!!doc.querySelector('image'),map={};let bg=ui.lbg||'light';
  const m=document.createElement('div');m.id='modal';
  const sw=(attr,on,c)=>`<button class="svsw${on?' on':''}" ${attr} title="${esc(c.name)} ${c.hex.toUpperCase()}${c.role?' · '+esc(c.role):''}" style="background:${c.hex}"><span>${esc(c.name)}</span></button>`;
  const body=()=>{
    if(!pal.length)return'<div class="none">This brand has no approved colours yet. Add its colours first (Colors section), then come back.</div>';
    return`<div class="fs">Colours in this file</div>${inv.length?inv.map(o=>`<div class="svrow"><span class="svo"><i style="background:${o.hex}"></i><b>${o.hex.toUpperCase()}</b><small>${o.members.length>1?'+'+(o.members.length-1)+' similar · ':''}used ${o.count}×</small></span><span class="svpal"><button class="svkeep${map[o.hex]?'':' on'}" data-keep="${o.hex}">Keep</button>${pal.map(c=>sw(`data-pick="${o.hex}|${c.hex}"`,map[o.hex]===c.hex,c)).join('')}</span></div>`).join(''):'<div class="none">No colours were found in this file – it may be built from pictures.</div>'}
      <div class="fs">Or use one approved colour for the whole logo</div><div class="svpal">${pal.map(c=>sw(`data-one="${c.hex}"`,false,c)).join('')}</div>`};
  m.innerHTML=`<div class="mp" style="width:min(980px,100%)"><div class="mh"><h2>${esc(l.name)}</h2><button class="btn sm" data-m="close">✕ Close</button></div><div class="mb">
    <p class="muted" style="margin:0 0 12px">Only <b>${esc(b.name)}</b>'s approved colours are offered, so the result stays on brand.${hasImg?' This file also contains a picture; picture colours cannot be changed.':''}</p>
    <div class="svgrid"><div><div class="svprev bg-${bg}" id="sv-prev"><img alt=""></div>
      <div class="seg" style="margin-top:10px">${['light','dark','check'].map(k=>`<button data-bg="${k}" class="${bg===k?'on':''}">${{light:'Light',dark:'Dark',check:'Transparent'}[k]}</button>`).join('')}</div></div>
      <div id="sv-ctl">${body()}</div></div>
    <div class="svfoot"><button class="btn" data-reset>Reset colours</button><span style="flex:1"></span>
      <select id="sv-w" title="PNG width"><option value="512">PNG 512 px</option><option value="1000">PNG 1000 px</option><option value="2000" selected>PNG 2000 px</option><option value="4000">PNG 4000 px</option></select>
      <button class="btn" data-dl="png">⬇ PNG</button><button class="btn pri" data-dl="svg">⬇ SVG</button></div></div></div>`;
  document.body.appendChild(m);
  const prev=m.querySelector('#sv-prev'),img=prev.querySelector('img'),expand=()=>{const f={};inv.forEach(g=>{if(map[g.hex])g.members.forEach(h=>{f[h]=map[g.hex]})});return f},cur=()=>recolour(text,expand());
  const draw=()=>{img.src=dataUrl(cur());prev.className='svprev bg-'+bg;
    m.querySelectorAll('[data-pick]').forEach(b2=>{const[o,c]=b2.dataset.pick.split('|');b2.classList.toggle('on',map[o]===c)});
    m.querySelectorAll('[data-keep]').forEach(b2=>b2.classList.toggle('on',!map[b2.dataset.keep]));
    m.querySelectorAll('[data-bg]').forEach(b2=>b2.classList.toggle('on',b2.dataset.bg===bg))};
  const base=slug2(b.name)+'_'+slug2(l.name)+'_custom';
  m.addEventListener('click',async e=>{
    if(e.target===m){m.remove();return}
    const t=e.target.closest('button');if(!t)return;
    if(t.dataset.m==='close'){m.remove();return}
    if(t.dataset.pick){const[o,c]=t.dataset.pick.split('|');if(map[o]===c)delete map[o];else map[o]=c;draw()}
    else if(t.dataset.keep){delete map[t.dataset.keep];draw()}
    else if(t.dataset.one){inv.forEach(o=>{map[o.hex]=t.dataset.one});draw()}
    else if('reset' in t.dataset){Object.keys(map).forEach(k=>delete map[k]);draw()}
    else if(t.dataset.bg){bg=t.dataset.bg;draw()}
    else if(t.dataset.dl==='svg'){download(base+'.svg',[cur()],'image/svg+xml;charset=utf-8');toast('SVG downloaded')}
    else if(t.dataset.dl==='png'){try{const blob=await png(cur(),+m.querySelector('#sv-w').value,null);download(base+'.png',[blob],'image/png');toast('PNG downloaded')}catch(err){toast('⚠ '+err.message,6000)}}});
  draw()}
return{section,open,list:listOf,src:srcOf,approved,inventory,grouped,recolour,parse,png,size}})();
