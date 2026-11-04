/* LatchHub – Smart import: reads a brand-book PDF (colours, fonts, rules, gradients) and prepares logo files automatically. */
let _pdfjs;
async function loadPdfjs(){
  if(_pdfjs)return _pdfjs;
  try{_pdfjs=await import('../vendor/pdf.min.mjs')}catch(e){throw new Error('PDF reader not available – open LatchHub from the local server (http://localhost:8000), not as a file.')}
  _pdfjs.GlobalWorkerOptions.workerSrc=new URL('vendor/pdf.worker.min.mjs',document.baseURI).href;return _pdfjs}
const NAMED_RAW=[['Black','#000000'],['White','#FFFFFF'],['Grey','#808080'],['Light grey','#D9D9D9'],['Charcoal','#333333'],['Navy','#14234B'],['Blue','#2255CC'],['Sky blue','#5BB5E8'],['Teal','#0E8A8A'],['Green','#2E9B4E'],['Emerald','#34C969'],['Dark green','#0B3D26'],['Olive','#7F8030'],['Lime','#A6D61F'],['Yellow','#F5D000'],['Gold','#C9A227'],['Orange','#F07C1E'],['Red','#D12B2B'],['Brown red','#AC212F'],['Maroon','#6E1423'],['Pink','#F06FA0'],['Purple','#6E46C8'],['Violet','#8F7AB8'],['Brown','#6B4226'],['Beige','#E8D9BE'],['Cream','#F6ECE7']];
let NAMED_L;const colourName=hex=>{NAMED_L=NAMED_L||NAMED_RAW.map(([n,h])=>[n,labOfHex(h)]);const l=labOfHex(hex);let b=NAMED_L[0][0],d=1e9;for(const[n,x]of NAMED_L){const v=dE(l,x);if(v<d){d=v;b=n}}return b};
const tickI=()=>new Promise(r=>setTimeout(r,0));
const ROLE_RE=/^(primary|secondary|tertiary|accent|neutral|supporting|background|highlight)$/i;
const LABEL_RE=/^(hex|rgb|cmyk|pantone|colou?rs?|palette|primary|secondary|tertiary|accent|neutral|supporting|background|highlight|brand|logo|usage|typography|code|value|values)$/i;
function guessName(fn){let t=fn.replace(/\.[^.]+$/,'').replace(/\(.*?\)/g,' ').replace(/[_\-]+/g,' ');t=t.replace(/\b(brand|book|style|guide|guidelines|stylescape|identity|manual|final|copy|v\d+|version|\d{4}|new|logo|logos|kit|pdf)\b/gi,' ').replace(/\s+/g,' ').trim();return t?t.replace(/\b\w/g,c=>c.toUpperCase()):'New brand'}
function cvNew(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c}
/* ---------- brand-book analysis ---------- */
function gradientFrom(cv){
  const ctx=cv.getContext('2d',{willReadFrequently:true}),W=cv.width,H=cv.height,N=40;
  const px=(x,y)=>{const d=ctx.getImageData(Math.max(0,Math.min(W-3,Math.round(x)-1)),Math.max(0,Math.min(H-3,Math.round(y)-1)),3,3).data;let r=0,g=0,b=0;for(let i=0;i<36;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2]}return[r/9,g/9,b/9]};
  const lines=[['top',i=>px(W*(.04+.92*i/(N-1)),H*.03),90],['bottom',i=>px(W*(.04+.92*i/(N-1)),H*.97),90],['left',i=>px(W*.03,H*(.04+.92*i/(N-1))),180],['right',i=>px(W*.97,H*(.04+.92*i/(N-1))),180]];
  for(const[,f,ang]of lines){const cols=Array.from({length:N},(_,i)=>f(i)),labs=cols.map(c=>rgb2lab(...c));let step=0;for(let i=1;i<N;i++)step=Math.max(step,dE(labs[i-1],labs[i]));
    let span=0;for(let i=0;i<N;i+=4)for(let j=i+4;j<N;j+=4)span=Math.max(span,dE(labs[i],labs[j]));
    if(step<9&&span>38){const idx=[0,.2,.4,.6,.8,1].map(t=>Math.round(t*(N-1)));return{angle:ang,stops:idx.map(i=>({hex:rgbToHex(...cols[i]),pos:Math.round(i/(N-1)*100)}))}}}
  return null}
function clustersOf(cv,min=.08){const w=Math.min(cv.width,160),h=Math.round(cv.height*w/cv.width),c=cvNew(w,h),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(cv,0,0,w,h);const d=x.getImageData(0,0,w,h).data,map=new Map();let n=0;
  for(let i=0;i<d.length;i+=4){if(d[i+3]<200)continue;n++;const k=(d[i]>>4)<<8|(d[i+1]>>4)<<4|(d[i+2]>>4);let b=map.get(k);if(!b){b={n:0,r:0,g:0,b:0};map.set(k,b)}b.n++;b.r+=d[i];b.g+=d[i+1];b.b+=d[i+2]}
  return[...map.values()].filter(b=>b.n>=n*min).sort((a,b)=>b.n-a.n).map(b=>({hex:rgbToHex(b.r/b.n,b.g/b.n,b.b/b.n),pct:b.n/n}))}
function mergeRuns(raw){
  const a=[...raw].sort((p,q)=>(q.y-p.y)||(p.x-q.x)),out=[];
  for(const t of a){const L=out[out.length-1];if(L&&Math.abs(L.y-t.y)<2&&t.x-L.x2<Math.max(1.5,.3*(t.h||10))&&t.x>=L.x-1){L.s+=t.s;L.x2=t.x+t.w}else out.push({s:t.s,x:t.x,y:t.y,x2:t.x+t.w,h:t.h})}
  return out}
const HEX_RE=/#([0-9A-Za-z]{6})(?![0-9A-Za-z])/;
function colourHits(runs,nameOk,roleOk){
  const hex=[],names=runs.filter(r=>nameOk(r.s.trim())),roles=runs.filter(r=>roleOk(r.s.trim()));
  for(const r of runs){const m=r.s.match(HEX_RE);if(!m)continue;const h=m[1].replace(/[Oo]/g,'0');if(!/^[0-9A-Fa-f]{6}$/.test(h))continue;hex.push({h:'#'+h,r})}
  const used=new Set(),res=[];
  for(const{h,r}of hex){
    const role=roles.filter(x=>Math.abs(x.y-r.y)<40&&x.x>=r.x-5&&Math.abs(x.x-r.x)<1300).sort((p,q)=>Math.abs(p.x-r.x)-Math.abs(q.x-r.x))[0];
    let nm=names.filter(n=>n.x>=r.x-135&&n.x<=r.x+75&&n.y-r.y>=12&&n.y-r.y<=330).sort((p,q)=>(p.y-r.y)-(q.y-r.y))[0];            // column layout: name above the code
    if(!nm){const rr=role?role.x2:r.x;nm=names.filter(n=>n.y-r.y>=-70&&n.y-r.y<=520&&!used.has(n)).sort((p,q)=>(Math.hypot(p.x2-rr,(p.y-r.y)*.6)-Math.hypot(q.x2-rr,(q.y-r.y)*.6)))[0]}                // tile layout: name right-aligned with the role
    if(nm)used.add(nm);res.push({h,name:nm?nm.s.trim():'',role:role?role.s.trim():''})}
  return res}
async function pdfPages(file){const lib=await loadPdfjs(),pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;const n=pdf.numPages;pdf.destroy();return n}
async function analyzePdf(file,prog=()=>{}){
  const lib=await loadPdfjs();prog('Opening PDF…');await tickI();
  const pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,N=pdf.numPages;
  const out={pages:N,colors:[],fonts:[],rules:[],grads:[],name:guessName(file.name)},byHex=new Map(),fontUse=new Map(),sentences=[],fallback=[];
  const add=(hex,name,role,page)=>{hex=normHex(hex);if(!hex)return;const o=byHex.get(hex);if(o){if(!o.name&&name)o.name=name;if(!o.role&&role)o.role=role}else byHex.set(hex,{hex,name,role,page})};
  const cleanSeg=s=>s.replace(/^[\s\d.:–\-•]+|[\s:–\-•]+$/g,'').trim();
  const BAD=/\b(colou?rs?|palette|primary|secondary|tertiary|version|brand|guidelines?|logo|usage|typography|pantone|cmyk|rgb|hex|page|contents?|the|and|for|with|this)\b|&\s*$/i;
  const nameOk=s=>/^[A-Za-z][A-Za-z '’&\-]{1,30}$/.test(s)&&!LABEL_RE.test(s)&&!BAD.test(s);
  for(let i=1;i<=Math.min(N,80);i++){
    prog(`Reading page ${i} of ${N}…`);await tickI();
    const pg=await pdf.getPage(i),tc=await pg.getTextContent(),items=tc.items.filter(t=>t.str&&t.str.trim()),runs=mergeRuns(items.map(t=>({s:t.str,x:t.transform[4],y:t.transform[5],w:t.width,h:t.height||10})));
    const vp0=pg.getViewport({scale:1}),vp=pg.getViewport({scale:Math.min(1.2,420/vp0.width)}),cv=cvNew(vp.width,vp.height),ctx=cv.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);
    try{await pg.render({canvasContext:ctx,viewport:vp}).promise}catch{}
    const text=runs.map(r=>r.s.trim()).join(' | ');
    for(const t of items){const id=t.fontName;let u=fontUse.get(id);if(!u){let nm='';try{if(pg.commonObjs.has(id))nm=pg.commonObjs.get(id).name||''}catch{}u={name:nm,n:0};fontUse.set(id,u)}if(!u.name){try{if(pg.commonObjs.has(id))u.name=pg.commonObjs.get(id).name||''}catch{}}u.n+=t.str.length}
    colourHits(runs,nameOk,x=>ROLE_RE.test(x)).forEach(x=>add(x.h,x.name,x.role,i));
    for(const m of text.matchAll(/HEX\s*[:\-]?\s*([0-9A-Fa-f]{6})\b/g))add('#'+m[1],'','',i);
    for(const m of text.matchAll(/\b(?:RGB|R)\b\s*[:\-]?\s*(\d{1,3})[\s,\/|]+(?:G\s*[:\-]?\s*)?(\d{1,3})[\s,\/|]+(?:B\s*[:\-]?\s*)?(\d{1,3})\b/g)){
      const v=[m[1],m[2],m[3]].map(Number);if(v.some(x=>x>255))continue;const pre=text.slice(Math.max(0,m.index-60),m.index).split('|').map(cleanSeg).filter(Boolean).reverse();add(rgbToHex(...v),pre.find(nameOk)||'','',i)}
    const g=gradientFrom(cv);if(g&&!out.grads.some(o=>o.stops.length&&dE(labOfHex(o.stops[0].hex),labOfHex(g.stops[0].hex))<10&&dE(labOfHex(o.stops.at(-1).hex),labOfHex(g.stops.at(-1).hex))<10)){g.page=i;out.grads.push(g)}
    clustersOf(cv,.035).filter(c=>{const[r,g,b]=hexToRgb(c.hex);return .299*r+.587*g+.114*b<235}).slice(0,6).forEach(c=>fallback.push({...c,page:i}));
    for(const s of text.replace(/\s*\|\s*/g,' ').split(/(?<=[.!?])\s+/)){const t=s.trim();if(t.length>28&&t.length<230&&!/#[0-9A-F]{6}/i.test(t)&&/\b(never|do not|don'?t|avoid|must|should not|minimum|at least|clear ?space|always|only use|not be|no more than|do use)\b/i.test(t))sentences.push(t)}
    pg.cleanup()}
  const tc2=n=>n===n.toUpperCase()?n.charAt(0)+n.slice(1).toLowerCase():n.replace(/^./,x=>x.toUpperCase());
  out.colors=[...byHex.values()].map(c=>({hex:c.hex,name:c.name?tc2(c.name):colourName(c.hex),role:c.role?c.role.replace(/^./,x=>x.toUpperCase()):'',page:c.page}));
  if(out.colors.length<2){const seen=[];for(const c of fallback.sort((a,b)=>b.pct-a.pct)){if(seen.some(h=>dE(labOfHex(h),labOfHex(c.hex))<9))continue;seen.push(c.hex);out.colors.push({hex:c.hex,name:colourName(c.hex),role:'From artwork – confirm',page:c.page});if(seen.length>=8)break}}
  // fonts
  const fam=new Map();let tot=0;for(const u of fontUse.values())tot+=u.n;
  for(const u of fontUse.values()){if(!u.name||/symbol|dingbat|wingding|icon/i.test(u.name))continue;const raw=u.name.replace(/^[A-Z]{6}\+/,''),[f,...st]=raw.split(/[-,]/);let family=f.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/MT$/,'').trim(),style=(st.join(' ')||'Regular').replace(/([a-z])([A-Z])/g,'$1 $2');
    if(!family||/^(TT|g_d|C2_|Type)\d*/.test(family))continue;const o=fam.get(family)||{family,n:0,styles:new Set()};o.n+=u.n;o.styles.add(style);fam.set(family,o)}
  out.fonts=[...fam.values()].filter(o=>o.n>=Math.max(8,tot*.01)).sort((a,b)=>b.n-a.n).slice(0,5).map((o,i)=>({name:o.family,role:i===0?'Primary typeface':i===1?'Secondary typeface':'Supporting',weights:[...o.styles].join(', '),url:'https://fonts.google.com/?query='+encodeURIComponent(o.family)}));
  const seenS=new Set();out.rules=sentences.filter(s=>{const k=s.toLowerCase().slice(0,50);if(seenS.has(k))return false;seenS.add(k);return true}).slice(0,12);
  out.grads=out.grads.slice(0,4);pdf.destroy();return out}
/* ---------- logo processing ---------- */
async function artworkCanvas(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(ext==='svg'){let t=await file.text();const vb=t.match(/viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i),w=vb?+vb[1]:300,h=vb?+vb[2]:150;if(!/<svg[^>]*\swidth=/i.test(t))t=t.replace(/<svg/i,`<svg width="${w}" height="${h}"`);
    const url=URL.createObjectURL(new Blob([t],{type:'image/svg+xml'}));const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('Bad SVG'));i.src=url});
    const k=2400/Math.max(w,h),cv=cvNew(w*k,h*k);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);URL.revokeObjectURL(url);return{cv,svg:t}}
  if(ext==='pdf'||ext==='ai'){const lib=await loadPdfjs(),pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,pg=await pdf.getPage(1),v0=pg.getViewport({scale:1}),sc=Math.min(8,2400/Math.max(v0.width,v0.height)),vp=pg.getViewport({scale:sc}),cv=cvNew(vp.width,vp.height);
    await pg.render({canvasContext:cv.getContext('2d'),viewport:vp,background:'rgba(0,0,0,0)'}).promise;pdf.destroy();return{cv}}
  const bmp=await createImageBitmap(file),k=Math.min(1,3000/Math.max(bmp.width,bmp.height)),cv=cvNew(bmp.width*k,bmp.height*k);cv.getContext('2d').drawImage(bmp,0,0,cv.width,cv.height);return{cv}}
const dataOf=(cv,type,q)=>cv.toDataURL(type,q);
async function processLogo(file){
  const{cv,svg}=await artworkCanvas(file),ctx=cv.getContext('2d',{willReadFrequently:true}),W=cv.width,H=cv.height,img=ctx.getImageData(0,0,W,H),d=img.data;
  const co=(x,y)=>{const o=(y*W+x)*4;return[d[o],d[o+1],d[o+2],d[o+3]]},cs=[co(0,0),co(W-1,0),co(0,H-1),co(W-1,H-1)],opaque=cs.every(c=>c[3]>250),whiteBg=opaque&&cs.every(c=>Math.min(c[0],c[1],c[2])>245);
  let x0=W,y0=H,x1=0,y1=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const o=(y*W+x)*4,a=d[o+3];if(whiteBg&&Math.min(d[o],d[o+1],d[o+2])>=250){d[o+3]=0;continue}if(a>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
  if(x1<=x0||y1<=y0){x0=0;y0=0;x1=W-1;y1=H-1}
  if(whiteBg)ctx.putImageData(img,0,0);
  const full=opaque&&!whiteBg,pad=full?0:Math.round(Math.max(x1-x0,y1-y0)*.04),sx=Math.max(0,x0-pad),sy=Math.max(0,y0-pad),sw=Math.min(W,x1+pad+1)-sx,sh=Math.min(H,y1+pad+1)-sy;
  const crop=cvNew(sw,sh);crop.getContext('2d').drawImage(cv,sx,sy,sw,sh,0,0,sw,sh);
  // colour facts
  const cl=clustersOf(crop,.03),bgHex=full?rgbToHex(cs[0][0],cs[0][1],cs[0][2]):null;
  const ink=cl.filter(c=>!bgHex||dE(labOfHex(c.hex),labOfHex(bgHex))>12);
  const lum=hex=>{const[r,g,b]=hexToRgb(hex);return .299*r+.587*g+.114*b},top=ink[0]?ink[0].hex:'#000000',light=!full&&lum(top)>225;
  const flat=cvv=>{const o=cvNew(cvv.width,cvv.height),x=o.getContext('2d');x.fillStyle=full?bgHex:light?'#101014':'#ffffff';x.fillRect(0,0,o.width,o.height);x.drawImage(cvv,0,0);return o};
  const S=1600,sq=cvNew(S,S),sx2=sq.getContext('2d');if(full){sx2.fillStyle=bgHex;sx2.fillRect(0,0,S,S)}
  const k=(full?(Math.abs(sw-sh)/Math.max(sw,sh)<.02?1:.8):.74)*S/Math.max(sw,sh),lw=sw*k,lh=sh*k;sx2.drawImage(crop,(S-lw)/2,(S-lh)/2,lw,lh);
  const th=cvNew(420,420),tx=th.getContext('2d');if(full){tx.fillStyle=bgHex;tx.fillRect(0,0,420,420)}tx.drawImage(sq,0,0,420,420);
  const nm=colourName(top),variant=full?`${light||lum(top)>200?'White':ink.length>1?'Full colour':nm} on ${colourName(bgHex).toLowerCase()}`:light?'White':!ink.length?'Black':(ink.length<2&&isNeutral(labOfHex(top)))?(lum(top)<110?'Black':'Grey'):ink.filter(c=>!isNeutral(labOfHex(c.hex))).length<2&&ink.length<3?nm:'Full colour';
  const fn=file.name.toLowerCase();let group='Primary logo';
  if(/wordmark|word-?mark|woedmark/.test(fn))group='Wordmark';else if(/icon|symbol|brandmark|\bmark\b|favicon|emblem|monogram|seal/.test(fn))group='Icon / symbol';else if(/stack|vertical/.test(fn))group='Stacked';else if(/horizontal|landscape|lockup/.test(fn))group='Horizontal';else if(/pattern/.test(fn))group='Pattern';
  return{name:variant.charAt(0).toUpperCase()+variant.slice(1),group,w:sw,h:sh,preview:dataOf(th,'image/png'),png:dataOf(crop,'image/png'),jpg:dataOf(flat(crop),'image/jpeg',.93),sqpng:dataOf(sq,'image/png'),sqjpg:dataOf(flat(sq),'image/jpeg',.93),svg:svg?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg):null,ink:ink.filter(c=>!isNeutral(labOfHex(c.hex))).slice(0,3).map(c=>c.hex),source:file.size<3e6?await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(file)}):null,ext:(file.name.split('.').pop()||'').toLowerCase()}}
const gradCss=g=>`linear-gradient(${g.angle}deg, ${g.stops.map(s=>`${s.hex} ${s.pos}%`).join(', ')})`;
function gradPng(g,w=1600,h=900){const c=cvNew(w,h),x=c.getContext('2d'),vert=g.angle===180,gr=vert?x.createLinearGradient(0,0,0,h):x.createLinearGradient(0,0,w,0);g.stops.forEach(s=>gr.addColorStop(s.pos/100,s.hex));x.fillStyle=gr;x.fillRect(0,0,w,h);return c.toDataURL('image/png')}
/* ---------- the "New brand" form ---------- */
function openNewBrand(){
  $('#modal')?.remove();const m=document.createElement('div');m.id='modal';
  const st={files:[],logos:[],book:null,grads:[]};
  m.innerHTML=`<div class="mp"><div class="mh"><h2>Add a new brand</h2><button class="btn sm" data-m="close">✕ Close</button></div><div class="mb">
  <div class="smart"><b>Smart import</b><p class="muted" style="margin:4px 0 10px;font-size:13px">Drop the brand-book PDF and the logo files. LatchHub reads colours, fonts, rules and gradients from the PDF, and prepares every logo as SVG, PNG, JPG and a centred square version.</p>
   <label class="drop" id="nb-drop" style="display:block">Drop files here or click to choose<br><span style="font-size:12px">PDF brand book · SVG / PNG / JPG / WebP / AI / PDF logos</span><input type="file" id="nb-files" multiple hidden accept=".pdf,.svg,.png,.jpg,.jpeg,.webp,.ai"></label>
   <div id="nb-flist"></div><div id="nb-status" class="muted" style="margin-top:6px"></div></div>
  <div class="fs">Brand details</div><div class="mrow"><div><input type="text" id="nb-name" placeholder="Brand name *"></div><div><select id="nb-parent"><option value="">Standalone brand</option>${S.brands.filter(x=>!x.parent).map(x=>`<option value="${x.id}">Sub-brand of ${esc(x.name)}</option>`).join('')}</select></div></div>
  <input type="text" id="nb-desc" placeholder="Short description (optional)" style="margin-top:10px">
  <div class="fs">Colours <span class="muted" style="font-weight:400;font-size:12px">one per line: Name #HEX | Role</span></div><textarea id="nb-cols" placeholder="Brand Blue #2B5FAA | Primary&#10;#EC7123, #DFE7F2"></textarea><div class="chips" id="nb-prev"></div>
  <div id="nb-gwrap" hidden><div class="fs">Gradients found</div><div id="nb-grads" class="ggrid2"></div></div>
  <div class="fs">Logos</div><div id="nb-logos"><span class="muted">Logo files you add above appear here, already converted.</span></div>
  <div class="fs">Fonts <span class="muted" style="font-weight:400;font-size:12px">Font | Role | Weights | Link</span></div><textarea id="nb-fonts" placeholder="Poppins | Heading | 600, 400 | https://fonts.google.com/specimen/Poppins"></textarea>
  <div class="fs">Do's &amp; don'ts</div><textarea id="nb-rules" placeholder="One rule per line, e.g. Never place the logo on red."></textarea>
  <div class="mf"><button class="btn" data-m="close">Cancel</button><button class="btn pri" data-m="create">Create brand</button></div></div></div>`;
  document.body.appendChild(m);
  const q=s=>m.querySelector(s),stat=t=>{q('#nb-status').textContent=t};
  const prev=()=>{q('#nb-prev').innerHTML=parseColours(q('#nb-cols').value,'Primary').map(c=>`<span class="chip"><i style="background:${c.hex}"></i>${esc(c.name)} ${c.hex}</span>`).join('')};
  const append=(sel,lines)=>{const t=q(sel),cur=t.value.trim();t.value=(cur?cur+'\n':'')+lines.join('\n')};
  const drawFiles=()=>{q('#nb-flist').innerHTML=st.files.map(e=>`<div class="frow"><span class="fn">${esc(e.file.name)}</span><select data-fid="${e.id}" data-k="role"><option value="book" ${e.role==='book'?'selected':''}>Brand book</option><option value="logo" ${e.role==='logo'?'selected':''}>Logo</option><option value="skip" ${e.role==='skip'?'selected':''}>Skip</option></select><span class="muted fs2">${esc(e.status||'')}</span><button class="btn sm del" data-m="rmfile" data-fid="${e.id}">✕</button></div>`).join('')};
  const drawLogos=()=>{q('#nb-logos').innerHTML=st.logos.length?st.logos.map((l,i)=>`<div class="mlogo2"><div class="t"><img src="${l.preview}"></div><div class="lcol"><input type="text" data-i="${i}" data-k="name" value="${esc(l.name)}"><div class="muted fs2">${[l.svg?'SVG':'','PNG','JPG','Square PNG','Square JPG'].filter(Boolean).join(' · ')}</div></div><select data-i="${i}" data-k="group">${[...new Set([...LOGO_GROUPS,l.group])].map(g=>`<option ${g===l.group?'selected':''}>${g}</option>`).join('')}</select><button class="btn sm del" data-m="rmlogo" data-i="${i}">✕</button></div>`).join(''):'<span class="muted">Logo files you add above appear here, already converted.</span>'};
  const drawGrads=()=>{q('#nb-gwrap').hidden=!st.grads.length;q('#nb-grads').innerHTML=st.grads.map((g,i)=>`<label class="gchk"><span class="gsw2" style="background:${gradCss(g)}"></span><span><input type="checkbox" data-gi="${i}" ${g.on?'checked':''}> <b>${esc(g.name)}</b><br><span class="muted fs2">page ${g.page}</span></span></label>`).join('')};
  const apply=a=>{
    if(!q('#nb-name').value.trim())q('#nb-name').value=a.name;
    const have=new Set(parseColours(q('#nb-cols').value,'').map(c=>c.hex)),nc=a.colors.filter(c=>!have.has(c.hex));append('#nb-cols',nc.map(c=>`${c.name} ${c.hex} | ${c.role||'Primary'}`));prev();
    if(a.fonts.length)append('#nb-fonts',a.fonts.map(f=>`${f.name} | ${f.role} | ${f.weights} | ${f.url}`));
    if(a.rules.length)append('#nb-rules',a.rules);
    a.grads.forEach((g,i)=>st.grads.push({...g,name:'Gradient '+(st.grads.length+1),on:true}));drawGrads()};
  const run=async e=>{
    e.status='Working…';drawFiles();
    try{
      if(e.role==='book'){const a=await analyzePdf(e.file,t=>{e.status=t;drawFiles()});apply(a);
        let nl=0,sz='';
        try{const r=await logosFromPdf(e.file,t=>{e.status=t;drawFiles()});r.logos.forEach(l=>{l.fid=e.id;st.logos.push(l)});nl=r.logos.length;drawLogos()}catch(err){console.warn('logo extraction',err)}
        let bookFile=e.file;
        try{const c=await PDFT.compress(e.file,{prog:t=>{e.status=t;drawFiles()}});if(c.file!==e.file){bookFile=c.file;sz=' · PDF '+_mb(c.before)+' → '+_mb(c.after)}}catch(err){console.warn('compress',err)}
        st.book={title:guessName(e.file.name)+' brand book',file:bookFile,pages:a.pages};e.status=`${a.colors.length} colours · ${a.fonts.length} fonts · ${a.rules.length} rules · ${a.grads.length} gradients · ${nl} logo${nl===1?'':'s'} from the PDF${sz}`}
      else if(e.role==='logo'){const l=await processLogo(e.file);l.fid=e.id;if(/\.pdf$/i.test(e.file.name)){const sv=await vectorSvgOf(e.file);if(sv)l.svg=sv}st.logos.push(l);drawLogos();
        if(!q('#nb-cols').value.trim()&&l.ink.length){append('#nb-cols',l.ink.map(h=>`${colourName(h)} ${h} | From logo – confirm`));prev()}
        if(!q('#nb-name').value.trim())q('#nb-name').value=guessName(e.file.name);e.status='Converted ✓'}
      else e.status='Skipped'
    }catch(err){e.status='⚠ '+err.message}
    drawFiles()};
  const add=async files=>{for(const f of files){const ext=(f.name.split('.').pop()||'').toLowerCase(),e={id:uid(),file:f,role:'logo',status:'Reading…'};st.files.push(e);drawFiles();
    if(ext==='pdf'){try{const n=await pdfPages(f);e.role=n>=4?'book':'logo'}catch(err){e.status='⚠ '+err.message;drawFiles();continue}}
    await run(e)}};
  m.addEventListener('input',e=>{const t=e.target;if(t.id==='nb-cols')prev();if(t.dataset.k&&t.dataset.i!=null)st.logos[+t.dataset.i][t.dataset.k]=t.value});
  m.addEventListener('change',async e=>{const t=e.target;
    if(t.id==='nb-files'){const fs=[...t.files];t.value='';await add(fs)}
    else if(t.dataset.fid&&t.dataset.k==='role'){const en=st.files.find(x=>x.id===t.dataset.fid);en.role=t.value;st.logos=st.logos.filter(l=>l.fid!==en.id);if(en.role!=='book'&&st.book&&st.book.file===en.file)st.book=null;drawLogos();await run(en)}
    else if(t.dataset.gi!=null)st.grads[+t.dataset.gi].on=t.checked;
    else if(t.dataset.k&&t.dataset.i!=null)st.logos[+t.dataset.i][t.dataset.k]=t.value});
  m.addEventListener('dragover',e=>{if(e.target.closest('#nb-drop')){e.preventDefault();q('#nb-drop').classList.add('over')}});m.addEventListener('dragleave',()=>q('#nb-drop')?.classList.remove('over'));
  m.addEventListener('drop',async e=>{if(e.target.closest('#nb-drop')){e.preventDefault();q('#nb-drop').classList.remove('over');await add([...e.dataTransfer.files])}});
  m.addEventListener('click',async e=>{const t=e.target.closest('[data-m]');if(e.target===m){m.remove();return}if(!t)return;const a=t.dataset.m;
    if(a==='close')m.remove();
    else if(a==='rmfile'){st.files=st.files.filter(x=>x.id!==t.dataset.fid);st.logos=st.logos.filter(l=>l.fid!==t.dataset.fid);drawFiles();drawLogos()}
    else if(a==='rmlogo'){st.logos.splice(+t.dataset.i,1);drawLogos()}
    else if(a==='create'){const name=q('#nb-name').value.trim();if(!name){toast('Enter a brand name');q('#nb-name').focus();return}
      const nb=newBrand(name);nb.user=true;const par=q('#nb-parent').value;if(par)nb.parent=par;nb.notes=q('#nb-desc').value.trim();
      nb.colors=parseColours(q('#nb-cols').value,'Primary');nb.fonts=parseFonts(q('#nb-fonts').value);nb.rules.notes=q('#nb-rules').value.trim();
      const bs=slug2(name);
      nb.logos=st.logos.map(l=>logoEntry(l,bs));
      nb.elements=st.grads.filter(g=>g.on).map((g,i)=>{const css=gradCss(g),png=gradPng(g);return{id:uid(),type:'gradient',name:g.name,css,note:'Found on page '+g.page+' of the brand book',stops:g.stops.filter((s,i)=>i%2===0||i===g.stops.length-1).map(s=>({name:colourName(s.hex),hex:s.hex})),preview:png,formats:[{label:'PNG',url:png,filename:`${bs}_gradient_${i+1}.png`}],user:true}});
      if(st.book){const key='blob:'+uid();try{await DB.set(key,st.book.file)}catch{}nb.book={title:st.book.title,blobKey:key,filename:`${bs}_brand-book.pdf`,mb:Math.round(st.book.file.size/104857.6)/10,pages:st.book.pages}}
      if(!nb.elements.length)delete nb.elements;
      S.brands.push(nb);ui.view='brand';ui.brandId=nb.id;ui.anim=true;save();m.remove();render();toast('Brand created')}});
  setTimeout(()=>q('#nb-name').focus(),50)}
