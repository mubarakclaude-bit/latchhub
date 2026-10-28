/* LatchHub – Design Lens: reads a creative the way a senior designer would (colour, logo clear space, spacing, alignment, type, style). */
const LC={cache:new Map()};
const lab5=(r,g,b)=>{const k=(r>>3)<<10|(g>>3)<<5|(b>>3);let v=LC.cache.get(k);if(!v){v=rgb2lab((k>>10&31)*8+4,(k>>5&31)*8+4,(k&31)*8+4);LC.cache.set(k,v)}return v};
const lumRel=(r,g,b)=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
const contrastRatio=(a,b)=>{const la=lumRel(...a),lb=lumRel(...b);return(Math.max(la,lb)+.05)/(Math.min(la,lb)+.05)};
const mixRgb=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[s.length>>1]:0};
const px8=(v,sc)=>Math.round(v/sc/8)*8;
/* ---------- scenario (format) ---------- */
function lensFormat(w,h){const r=w/h,f=(name,note,o={})=>({name,note,margin:o.margin||.045,safe:o.safe||null});
  if(r>.95&&r<1.05)return f('Square social post (1:1)','Feed post – keep key content inside a 4.5% margin; it is also cropped to a circle/grid tile in profiles.');
  if(r>.77&&r<.83)return f('Portrait social post (4:5)','Feed post – the grid crops 4:5 to 3:4 in profiles, so keep the headline and logo in the central 80%.');
  if(r>.54&&r<.58)return f('Story / Reel (9:16)','Full-screen vertical – app buttons cover the top ~14% and bottom ~20%; keep text and logo out of those zones.',{margin:.06,safe:{top:.14,bottom:.2,side:.06}});
  if(r>1.7&&r<1.85)return f('Widescreen (16:9)','Slide, video frame or thumbnail – thumbnails are viewed tiny, so keep text large and the logo in a corner with clear space.',{margin:.05});
  if(r>=1.85&&r<2.05)return f('Link-preview landscape (1.91:1)','Facebook / LinkedIn / website share image – platforms crop the edges, keep content 6% inside.',{margin:.06});
  if(r>.68&&r<.75)return f('A-series print (portrait)','Print layout – keep 5% (≈10 mm on A4) inside the trim and 3 mm bleed beyond it.',{margin:.05});
  if(r>1.35&&r<1.47)return f('A-series print (landscape)','Print layout – keep 5% inside the trim.',{margin:.05});
  if(r>=2.6)return f('Web banner / header','Wide banner – everything sits on one band; use a strict left or centre axis and a small, clear logo.',{margin:.03});
  if(r<=.4)return f('Tall / skyscraper banner','Narrow vertical banner – stack elements on one centre axis.',{margin:.06});
  return f('Custom format','No standard platform recognised – using general layout rules.')}
/* ---------- colour (shade-aware) ---------- */
function mergeClusters(cl){const out=[];for(const c of cl){const lab=labOfHex(c.hex),h=out.find(o=>dE(o.lab,lab)<6);if(h)h.pct+=c.pct;else out.push({...c,lab})}return out.sort((a,b)=>b.pct-a.pct)}
function relateColour(c,pal,tol,allowNeutral){
  const lab=c.lab,chroma=Math.hypot(lab[1],lab[2]);let best={d:1e9};
  for(const p of pal){const d=dE(lab,p.lab);if(d<best.d)best={d,p}}
  if(best.p&&best.d<=tol)return{kind:'match',p:best.p,d:best.d};
  if(allowNeutral&&chroma<10)return{kind:'neutral'};
  let tint=null,shade=null;
  for(const p of pal){if(p.chroma<10)continue;for(let t=.03;t<=.95;t+=.03){const dw=dE(lab,rgb2lab(...mixRgb(p.rgb,[255,255,255],t))),db=dE(lab,rgb2lab(...mixRgb(p.rgb,[0,0,0],t)));if(!tint||dw<tint.d)tint={d:dw,p,t};if(!shade||db<shade.d)shade={d:db,p,t}}}
  if(tint&&tint.d<=8&&(!shade||tint.d<=shade.d))return{kind:'tint',p:tint.p,t:tint.t,d:tint.d};
  if(shade&&shade.d<=8)return{kind:'shade',p:shade.p,t:shade.t,d:shade.d};
  const h=Math.atan2(lab[2],lab[1]);let fam=null;
  for(const p of pal){if(p.chroma<10)continue;const ph=Math.atan2(p.lab[2],p.lab[1]);let dh=Math.abs(h-ph);dh=Math.min(dh,2*Math.PI-dh)*180/Math.PI;if(dh<=22&&chroma>8&&(!fam||dh<fam.dh))fam={p,dh}}
  if(fam){const dl=lab[0]-fam.p.lab[0];
    if(dl>5&&chroma<=fam.p.chroma*1.15)return{kind:'tint',p:fam.p,loose:true,d:best.d};
    if(dl<-5)return{kind:'shade',p:fam.p,loose:true,d:best.d};
    if(Math.abs(dl)<=5)return best.d<=15?{kind:'near',p:best.p,d:best.d}:{kind:'off',p:fam.p,d:best.d}}
  return best.d<=15&&best.p?{kind:'near',p:best.p,d:best.d}:{kind:'off',d:best.d}}
function lensColours(cv,brand){
  const rules=brand.rules||{},tol=+rules.tol||6,pal=brand.colors.map(c=>{const lab=labOfHex(c.hex);return{...c,rgb:hexToRgb(c.hex),lab,chroma:Math.hypot(lab[1],lab[2])}});
  const cl=mergeClusters(clustersOf(cv,.004)).filter(c=>c.pct>=.012),photo=cl.slice(0,8).reduce((s,c)=>s+c.pct,0)<.55,items=[];
  const forb=(rules.forbidden||'').split(/[\s,;]+/).map(normHex).filter(Boolean).map(h=>({hex:h,lab:labOfHex(h)}));
  const groups={match:[],tint:[],shade:[],near:[],off:[],forb:[],neutral:[]};
  for(const c of cl){const f=forb.find(f=>dE(c.lab,f.lab)<10);if(f){c.status='forbidden';c.note='forbidden '+f.hex;groups.forb.push(c);continue}
    if(!pal.length){c.status='';continue}
    const r=relateColour(c,pal,tol,rules.neutrals!==false);c.rel=r;c.status=r.kind;
    c.note=r.kind==='match'?r.p.name:r.kind==='tint'?'light shade of '+r.p.name+(r.t?' (~'+Math.round(r.t*100)+'% tint)':''):r.kind==='shade'?'darker shade of '+r.p.name+(r.t?' (~'+Math.round(r.t*100)+'% black)':''):r.kind==='near'?'off-shade of '+(r.p&&r.p.name)+' (ΔE '+r.d.toFixed(1)+')':r.kind==='neutral'?'neutral':'not in palette';
    groups[r.kind==='neutral'?'neutral':r.kind].push(c)}
  const pct=a=>(a.reduce((s,c)=>s+c.pct,0)*100);
  if(!pal.length)items.push({cat:'Colour',level:'info',title:'No brand colours defined',detail:'Add the client colours first so the lens can judge shades.'});
  else{
    const brandPct=pct(groups.match),tintPct=pct(groups.tint);
    if(groups.match.length||groups.tint.length)items.push({cat:'Colour',level:'pass',title:'Brand colour present',detail:[...groups.match.map(c=>c.rel.p.name+' '+c.rel.p.hex+' ('+(c.pct*100).toFixed(1)+'%)'),...[]].join(', ')||'Only lighter shades of brand colours are used.'+' (that is allowed)'});
    else items.push({cat:'Colour',level:'fail',title:'No brand colour detected',detail:'None of the palette colours (ΔE ≤ '+tol+') or their light shades cover at least 1% of the creative.',fix:'Use '+pal.filter(p=>p.chroma>=10).slice(0,2).map(p=>p.name+' '+p.hex).join(' or ')+' for the main shapes or text.'});
    if(groups.tint.length)items.push({cat:'Colour',level:'pass',title:'Light shades of brand colours – fine',detail:groups.tint.map(c=>c.hex+' = '+c.note+' · '+(c.pct*100).toFixed(1)+'%').join(' | ')+'. Tints add depth and are allowed; just keep the full-strength colour present as the anchor.'});
    groups.shade.forEach(c=>items.push({cat:'Colour',level:'fail',title:'Darker shade of '+c.rel.p.name+' – not allowed ('+c.hex+')',detail:'Covers '+(c.pct*100).toFixed(1)+'%. Darkening a brand colour changes its identity.',fix:'Replace with '+c.rel.p.name+' '+c.rel.p.hex+', or use a lighter tint of it.'}));
    if(!photo)groups.near.forEach(c=>items.push({cat:'Colour',level:c.pct>=.03?'fail':'warn',title:'Off-shade colour '+c.hex,detail:'Covers '+(c.pct*100).toFixed(1)+'% and sits close to '+c.rel.p.name+' without matching it ('+c.note+').',fix:'Use exactly '+c.rel.p.hex+' (click the swatch in the client page to copy it).'}));
    groups.forb.forEach(c=>items.push({cat:'Colour',level:'fail',title:'Forbidden colour '+c.hex,detail:'Covers '+(c.pct*100).toFixed(1)+'% – '+c.note+'.',fix:'Remove it or swap it for a palette colour.'}));
    if(!photo)groups.off.filter(c=>c.pct>=.02).forEach(c=>items.push({cat:'Colour',level:'warn',title:'Colour outside the palette '+c.hex,detail:'Covers '+(c.pct*100).toFixed(1)+'%. Not a brand colour or a shade of one.',fix:'Confirm it is intentional (photo, partner logo, client-approved accent) or replace it.'}));
    if(photo)items.push({cat:'Colour',level:'info',title:'Photographic / gradient content',detail:'Many blended colours, so only brand presence and shades are judged – off-palette colours inside photos are not flagged.'});
    if(!items.some(i=>i.level==='fail'||i.level==='warn'))items.push({cat:'Colour',level:'pass',title:'Colours are on brand',detail:'Palette adherence '+Math.round(brandPct+tintPct+pct(groups.neutral))+'% of the visible colour area.'})}
  return{items,clusters:cl,photo}}
/* ---------- layout scan ---------- */
function dilate(m,W,H,rx,ry){const a=new Uint8Array(W*H),b=new Uint8Array(W*H);
  for(let y=0;y<H;y++){let last=-1e9;for(let x=0;x<W;x++){if(m[y*W+x])last=x;if(x-last<=rx)a[y*W+x]=1}last=1e9;for(let x=W-1;x>=0;x--){if(m[y*W+x])last=x;if(last-x<=rx)a[y*W+x]=1}}
  for(let x=0;x<W;x++){let last=-1e9;for(let y=0;y<H;y++){if(a[y*W+x])last=y;if(y-last<=ry)b[y*W+x]=1}last=1e9;for(let y=H-1;y>=0;y--){if(a[y*W+x])last=y;if(last-y<=ry)b[y*W+x]=1}}return b}
function scanLayout(cv){
  const sc=Math.min(1,560/Math.max(cv.width,cv.height)),W=Math.max(16,Math.round(cv.width*sc)),H=Math.max(16,Math.round(cv.height*sc)),c=document.createElement('canvas');c.width=W;c.height=H;
  const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,W,H);x.drawImage(cv,0,0,W,H);const d=x.getImageData(0,0,W,H).data,N=W*H;
  const cl=mergeClusters(clustersOf(c,.003)),bg=cl[0],bgLab=bg.lab;
  let near=0;const lum=new Float32Array(N);for(let i=0;i<N;i++){const o=i*4;lum[i]=.299*d[o]+.587*d[o+1]+.114*d[o+2];if(dE(lab5(d[o],d[o+1],d[o+2]),bgLab)<9)near++}
  const edge=new Uint8Array(N);let ec=0;for(let y=1;y<H-1;y++)for(let xx=1;xx<W-1;xx++){const i=y*W+xx,gx=lum[i+1]-lum[i-1],gy=lum[i+W]-lum[i-W];if(Math.abs(gx)+Math.abs(gy)>46){edge[i]=1;ec++}}
  const nearBg=near/N,edgeShare=ec/N,flat=nearBg>=.3,photo=!flat&&edgeShare>.16;
  const ink=new Uint8Array(N);
  if(flat){for(let i=0;i<N;i++){const o=i*4;if(dE(lab5(d[o],d[o+1],d[o+2]),bgLab)>11)ink[i]=1}}else if(!photo){ink.set(edge)}
  return{W,H,sc,d,ink,flat,photo,smooth:!flat&&!photo,nearBg,edgeShare,bg,cl,lum}}
function blocksOf(S){
  const{W,H,ink}=S,N=W*H,rx=Math.max(2,Math.round(W*.012)),ry=Math.max(2,Math.round(H*.006)),m=dilate(ink,W,H,rx,ry),lab=new Int32Array(N),st=new Int32Array(N),comps=[];let n=0;
  for(let i=0;i<N;i++){if(!m[i]||lab[i])continue;n++;let sp=0,x0=W,y0=H,x1=0,y1=0,cnt=0,ic=0;st[sp++]=i;lab[i]=n;
    while(sp){const p=st[--sp],px=p%W,py=(p-px)/W;cnt++;if(ink[p]){ic++;if(px<x0)x0=px;if(px>x1)x1=px;if(py<y0)y0=py;if(py>y1)y1=py}
      for(const q of[p-1,p+1,p-W,p+W]){if(q<0||q>=N||(q===p-1&&px===0)||(q===p+1&&px===W-1))continue;if(m[q]&&!lab[q]){lab[q]=n;st[sp++]=q}}}
    if(ic<5||x1<x0)continue;comps.push({id:n,x0,y0,x1:x1+1,y1:y1+1,ink:ic,cnt})}
  comps.forEach(c=>{c.w=c.x1-c.x0;c.h=c.y1-c.y0;c.cx=(c.x0+c.x1)/2;c.cy=(c.y0+c.y1)/2;c.area=c.w*c.h;c.dens=c.ink/c.area;c.hero=c.area>N*.5||(c.w>W*.9&&c.h>H*.4);c.full=c.w>W*.92});
  S.lab=lab;S.dil=m;return comps.filter(c=>c.area>N*.00025)}
function linesOf(S,c){const{W,ink,lab}=S,rows=[];for(let y=c.y0;y<c.y1;y++){let n=0;for(let x=c.x0;x<c.x1;x++){const p=y*W+x;if(ink[p]&&lab[p]===c.id)n++}rows.push(n)}
  const thr=Math.max(1,c.w*.03),bands=[];let cur=null;rows.forEach((n,i)=>{if(n>=thr){if(cur&&i-cur.y1<=1)cur.y1=i+1;else{cur={y0:i,y1:i+1};bands.push(cur)}}});
  return bands.map(b=>({y0:c.y0+b.y0,y1:c.y0+b.y1,h:b.y1-b.y0}))}
/* ---------- logo: variants, clear space ---------- */
function lensLogoList(brand){
  const set=[brand,...S.brands.filter(y=>y.parent===brand.id)];const par=S.brands.find(x=>x.id===brand.parent);if(par)set.push(par);
  const out=[];set.forEach(b=>b.logos.forEach(l=>{if(/pattern|reference/i.test(l.group||''))return;const png=(l.formats||[]).find(f=>f.label==='PNG'),url=png?png.url:(l.check?l.data:null);if(url)out.push({id:l.id,name:(b===brand?'':b.name+' – ')+l.name,check:true,w:l.w||0,h:l.h||0,data:url})}));
  return out.slice(0,12)}
function lensClearSpace(S,box,rules,items,marks){
  const sc=S.sc,{W,H}=S;let bx0=box.x*sc,by0=box.y*sc,bx1=(box.x+box.w)*sc,by1=(box.y+box.h)*sc,lw=bx1-bx0,lh=by1-by0;const o=v=>Math.round(v/sc);
  const reqH=rules.clear!=null&&rules.clear!==''?+rules.clear:(rules.clearW?0:.4);let C=Math.max(reqH*lh,(+rules.clearW||0)*lw);
  if(S.photo){items.push({cat:'Logo',level:'info',title:'Clear space – busy background',detail:'The logo sits on a photo or textured area, so spacing cannot be measured reliably. Keep roughly '+o(C)+' px of calm space around it.'});return}
  let ex0=bx0,ey0=by0,ex1=bx1,ey1=by1;const gapH=Math.max(3,Math.max(lw,lh)*.16),gapV=Math.max(2,Math.min(lw,lh)*.05),maxW=lw*4.2,maxH=lh*1.4;
  for(let it=0;it<3;it++){let n0=ex0,m0=ey0,n1=ex1,m1=ey1;for(let y=Math.max(0,Math.floor(ey0-gapV));y<Math.min(H,Math.ceil(ey1+gapV));y++)for(let x=Math.max(0,Math.floor(ex0-gapH));x<Math.min(W,Math.ceil(ex1+gapH));x++){if(!S.ink[y*W+x])continue;if(x<n0)n0=x;if(x>n1)n1=x;if(y<m0)m0=y;if(y>m1)m1=y}
    if(n1-n0>maxW||m1-m0>maxH)break;ex0=n0;ey0=m0;ex1=n1;ey1=m1}
  const bx0o=bx0,by0o=by0,bx1o=bx1,by1o=by1;bx0=ex0;by0=ey0;bx1=ex1;by1=ey1;lw=bx1-bx0;lh=by1-by0;C=Math.max(reqH*lh,(+rules.clearW||0)*lw);
  const pad=Math.max(lw,lh)*.07,{ink}=S;let minD=1e9,np=null,vx0=1e9,vy0=1e9,vx1=-1,vy1=-1;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!ink[y*W+x])continue;if(x>bx0-pad&&x<bx1+pad&&y>by0-pad&&y<by1+pad)continue;
    const dx=Math.max(bx0-x,x-bx1,0),dy=Math.max(by0-y,y-by1,0),dd=Math.max(dx,dy);if(dd<minD){minD=dd;np=[x,y]}if(dd<C){if(x<vx0)vx0=x;if(y<vy0)vy0=y;if(x>vx1)vx1=x;if(y>vy1)vy1=y}}
  const edges=[['left',bx0],['top',by0],['right',W-bx1],['bottom',H-by1]].sort((a,b)=>a[1]-b[1])[0];
  const tight=Math.min(minD,edges[1]),ratio=tight/C,zone={t:'rect',x:(bx0-C)/W,y:(by0-C)/H,w:(lw+2*C)/W,h:(lh+2*C)/H,c:ratio>=1?'#22c55e':'#ef4444',dash:1};marks.push(zone);
  const side=np?(np[1]>by1?'below':np[1]<by0?'above':np[0]>bx1?'to the right of':'to the left of'):'';
  if(ratio>=1)items.push({cat:'Logo',level:'pass',title:'Logo clear space respected',detail:'Nearest element is '+o(Math.min(minD,edges[1]))+' px away (needs '+o(C)+' px = '+(C/lh).toFixed(2)+' × logo height).'});
  else{if(vx1>=0)marks.push({t:'rect',x:vx0/W,y:vy0/H,w:(vx1-vx0)/W,h:(vy1-vy0)/H,c:'#ef4444'});
    const edgeBad=edges[1]<minD&&edges[1]<C;
    items.push({cat:'Logo',level:ratio>=.6?'warn':'fail',title:edgeBad?'Logo is too close to the '+edges[0]+' edge':'Logo clear space is violated',detail:edgeBad?'Only '+o(edges[1])+' px between the logo and the '+edges[0]+' edge; the brand needs '+o(C)+' px.':'Something sits '+o(minD)+' px '+side+' the logo; the clear zone needs '+o(C)+' px ('+(C/lh).toFixed(2)+' × logo height) on every side.',fix:edgeBad?'Move the logo inward by at least '+o(C-edges[1])+' px.':'Move that element ≥ '+o(C-minD)+' px away or reduce the logo – the dashed box on the preview shows the protected zone.'})}}
/* ---------- design knowledge base ---------- */
const LENS_KB={
  styles:[
   {id:'minimal',name:'Minimal / Swiss editorial',test:f=>f.ws>.55&&f.colors<=4&&f.blocks<=9?.9:0,advice:['Everything snaps to one axis – keep a single left edge for all text.','Use one accent colour at most and let one element lead.','Generous space is the style: keep margins equal and avoid decorative extras.']},
   {id:'bold',name:'Bold typographic poster',test:f=>(f.topText>.18||(f.levels>=2&&f.ratio>=2.4))&&f.ws<.7?.8:0,advice:['Limit to two type sizes plus one small line; the headline should dominate.','Tighten headline leading to ~100–110% and keep ≤ 8 words.','Keep to 2–3 colours with strong contrast.']},
   {id:'gradient',name:'Gradient / mesh modern',test:f=>f.grad?.85:0,advice:['Build the gradient from brand colours only (use the Elements → Gradients tile when the client has one).','Check text contrast at the lightest and darkest point of the gradient.','Place text on the calmest part and keep the logo on a stable area.']},
   {id:'dark',name:'Dark mode / night look',test:f=>f.bgL<28?.75:0,advice:['Use off-white (#F2F2F2) for body text rather than pure white to avoid glare.','Keep accent colour to 1–2 elements; add 5–10% more line spacing than on light.','Avoid pure #000 backgrounds next to bright accents.']},
   {id:'photo',name:'Photo-led layout',test:f=>f.photo?.9:0,advice:['Place text on calm areas or add a 30–60% brand-colour scrim for 4.5:1 contrast.','Keep faces and subjects out of text zones; put the logo on the cleanest corner.','Use one text alignment only over photos.']},
   {id:'pastel',name:'Soft / pastel',test:f=>f.avgL>78&&f.sat<.28?.7:0,advice:['Set text in the darkest brand colour – pastel-on-pastel fails contrast.','Limit to three soft tones and add one strong anchor shape.']},
   {id:'bento',name:'Bento / card grid',test:f=>f.bento?.9:0,advice:['Keep one gutter value between every card and one corner radius.','Align card edges to the same columns; vary size, not spacing.']},
   {id:'maximal',name:'Maximalist / collage',test:f=>f.blocks>14&&f.colors>=5?.7:0,advice:['Create order with a grid: equal gutters and repeated shapes.','Pick one focal point and keep the logo zone completely clear.']},
   {id:'duotone',name:'Duotone / two-colour',test:f=>f.colors===2?.6:0,advice:['Take both colours from the palette (or tints of them) so the pair is recognisably the brand.']},
   {id:'clean',name:'Clean corporate',test:()=>.3,advice:['Use a modular grid: consistent margins, consistent gutters (multiples of 8 px).','Two to three type sizes, one clear call-to-action, logo in a fixed corner.']}],
  general:['Spacing: use a base unit (8 px) – margins, gaps and line-heights as multiples.','Alignment: one dominant axis per layout; mix centred and left-aligned text only on purpose.','Hierarchy: neighbouring type sizes should differ by ≥ 1.25×; headline ≈ 2–3× body.','Contrast: body text ≥ 4.5:1, large text ≥ 3:1.','Brand: logo clear space, correct variant for the background, full-strength brand colour present.']};
function readStyle(f){const sc=LENS_KB.styles.map(s=>({s,v:s.test(f)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);return{main:sc[0].s,second:sc[1]&&sc[1].s.id!=='clean'?sc[1].s:null}}
/* ---------- layout checks ---------- */
function lensLayout(S,comps,fmt,logoBox,items,marks,feat,brand){
  const{W,H,sc,d}=S,N=W*H,o=v=>Math.round(v/sc),short=Math.min(W,H),body=comps.filter(c=>!c.hero),mv=(x0,y0,x1,y1,c,dash)=>marks.push({t:'rect',x:x0/W,y:y0/H,w:(x1-x0)/W,h:(y1-y0)/H,c,dash});
  if(!body.length){items.push({cat:'Composition',level:'info',title:'Nothing to measure',detail:'The creative is a single image/background with no separate elements.'});return}
  const content=body.filter(c=>!c.full),minM=fmt.margin*short;
  /* margins */
  if(content.length){const L=Math.min(...content.map(c=>c.x0)),R=W-Math.max(...content.map(c=>c.x1)),T=Math.min(...body.map(c=>c.y0)),B=H-Math.max(...body.map(c=>c.y1));
    const sides=[['left',L],['right',R],['top',T],['bottom',B]].filter(([,v])=>v<minM);
    sides.forEach(([n,v])=>items.push({cat:'Spacing',level:v<minM*.45?'fail':'warn',title:'Content is very close to the '+n+' edge',detail:'Nearest element is '+o(v)+' px from the '+n+' edge; this format needs about '+o(minM)+' px ('+Math.round(fmt.margin*100)+'% of the short side).',fix:'Pull everything inside a '+px8(minM,sc)+' px margin.'}));
    if(Math.abs(L-R)>W*.035&&L>=minM*.6&&R>=minM*.6)items.push({cat:'Spacing',level:'warn',title:'Left and right margins are uneven',detail:'Left margin '+o(L)+' px vs right margin '+o(R)+' px.',fix:'Set both to '+px8((L+R)/2,sc)+' px so the layout sits square on the canvas.'});
    else if(!sides.length)items.push({cat:'Spacing',level:'pass',title:'Margins are healthy',detail:'Left '+o(L)+' · right '+o(R)+' · top '+o(T)+' · bottom '+o(B)+' px.'});
    mv(L,T,W-R,H-B,'rgba(99,102,241,.8)',1)}
  /* story safe zones */
  if(fmt.safe){const z=fmt.safe,bad=[];body.forEach(c=>{if(c.full&&c.h>H*.3)return;if(c.y0<z.top*H)bad.push(['top',c]);else if(c.y1>(1-z.bottom)*H)bad.push(['bottom',c])});
    marks.push({t:'rect',x:0,y:0,w:1,h:z.top,c:'rgba(245,158,11,.9)',dash:1},{t:'rect',x:0,y:1-z.bottom,w:1,h:z.bottom,c:'rgba(245,158,11,.9)',dash:1});
    if(bad.length){bad.slice(0,3).forEach(([w,c])=>mv(c.x0,c.y0,c.x1,c.y1,'#ef4444'));items.push({cat:'Spacing',level:'warn',title:'Content in the app-UI zone ('+[...new Set(bad.map(b=>b[0]))].join(' & ')+')',detail:'Story/Reel buttons, captions and the progress bar cover roughly the top '+Math.round(z.top*100)+'% and bottom '+Math.round(z.bottom*100)+'%.',fix:'Move text and logo between y='+o(z.top*H)+' px and y='+o((1-z.bottom)*H)+' px.'})}
    else items.push({cat:'Spacing',level:'pass',title:'Safe zones respected',detail:'Nothing important sits under the story/reel interface.'})}
  /* alignment */
  const tight=W*.005,loose=W*.026,cand=body.filter(c=>!c.full);
  const group=(arr,key)=>{const s=[...arr].sort((a,b)=>a[key]-b[key]),gs=[];let cur=[];s.forEach(c=>{if(cur.length&&c[key]-cur[cur.length-1][key]>loose){gs.push(cur);cur=[]}cur.push(c)});if(cur.length)gs.push(cur);return gs.filter(g=>g.length>=2)};
  let misaligned=0,aligned=0;
  const cdev=cand.map(c=>({c,dev:Math.abs(c.cx-W/2)})).filter(x=>x.dev<=loose&&x.c.w>W*.08),edgeCand=cdev.length>=2?cand.filter(c=>!cdev.some(x=>x.c===c)):cand;
  [['x0','left'],['x1','right']].forEach(([k,name])=>group(edgeCand,k).forEach(g=>{const v=g.map(c=>c[k]),sp=Math.max(...v)-Math.min(...v);
    if(sp<=tight)aligned++;else{misaligned++;const tx=Math.round(median(v));g.forEach(c=>mv(c.x0,c.y0,c.x1,c.y1,'#f59e0b'));marks.push({t:'vline',x:tx/W,c:'#f59e0b'});
      items.push({cat:'Alignment',level:sp>loose*.6?'fail':'warn',title:g.length+' elements are almost '+name+'-aligned but off by '+o(sp)+' px',detail:'Their '+name+' edges sit between x='+o(Math.min(...v))+' and x='+o(Math.max(...v))+' px.',fix:'Snap all '+name+' edges to x='+o(tx)+' px (use Align in your design tool, not nudging by eye).'})}}));
  if(cdev.length){const mx=Math.max(...cdev.map(x=>x.dev));if(mx>tight&&(cdev.length>=2||cdev[0].c.w>W*.2)){misaligned++;cdev.forEach(x=>mv(x.c.x0,x.c.y0,x.c.x1,x.c.y1,'#f59e0b'));marks.push({t:'vline',x:.5,c:'#f59e0b'});
      items.push({cat:'Alignment',level:mx>loose*.6?'fail':'warn',title:'Centred elements are off the centre line by up to '+o(mx)+' px',detail:cdev.length+' element(s) are meant to be centred but their centres differ from the canvas centre.',fix:'Centre them on x='+o(W/2)+' px.'})}else aligned++}
  const leftG=group(cand,'x0').filter(g=>Math.max(...g.map(c=>c.x0))-Math.min(...g.map(c=>c.x0))<=tight),centred=cdev.filter(x=>x.dev<=tight&&x.c.w<W*.8);
  if(leftG.length&&centred.length>=2&&leftG[0].length>=2)items.push({cat:'Alignment',level:'info',title:'Mixed alignment: left-aligned and centred elements',detail:'Part of the layout hangs from a left edge and part from the centre line.',fix:'Fine when deliberate (e.g. centred logo over left-aligned copy); otherwise pick one axis.'});
  if(!misaligned&&aligned)items.push({cat:'Alignment',level:'pass',title:'Edges line up',detail:aligned+' alignment group(s) share an exact axis – the layout reads as ordered.'});
  /* vertical rhythm */
  const col=[...cand].sort((a,b)=>a.y0-b.y0),gaps=[];for(let i=1;i<col.length;i++){const g=col[i].y0-col[i-1].y1;if(g>=0)gaps.push({g,a:col[i-1],b:col[i]})}
  if(gaps.length>=2){const gv=gaps.map(x=>x.g),mean=gv.reduce((a,b)=>a+b,0)/gv.length,cv=Math.sqrt(gv.reduce((s,v)=>s+(v-mean)**2,0)/gv.length)/mean;
    if(cv>.42&&Math.max(...gv)>H*.03){const target=px8(mean,sc);gaps.forEach(x=>{if(Math.abs(x.g-mean)>mean*.45)marks.push({t:'rect',x:Math.min(x.a.x0,x.b.x0)/W,y:x.a.y1/H,w:Math.abs(Math.max(x.a.x1,x.b.x1)-Math.min(x.a.x0,x.b.x0))/W,h:x.g/H,c:'rgba(244,63,94,.35)',fill:1})});
      items.push({cat:'Spacing',level:'warn',title:'Vertical spacing between blocks is uneven',detail:'Gaps between stacked blocks: '+gv.map(v=>o(v)+' px').join(', ')+'.',fix:'Use one gap – about '+target+' px (a multiple of 8) – between related blocks, and larger only to separate groups.'})}
    else items.push({cat:'Spacing',level:'pass',title:'Even vertical rhythm',detail:'Gaps between blocks: '+gv.map(v=>o(v)+' px').join(', ')+'.'})}
  /* typography from line bands */
  const textComps=body.filter(c=>c.dens>.05&&c.dens<.85&&c.h<H*.5&&c.w>c.h*.35),lines=[];
  textComps.forEach(c=>{const b=linesOf(S,c);if(b.length&&b.every(x=>x.h<H*.2))lines.push({c,bands:b})});
  const heights=lines.flatMap(l=>l.bands.map(b=>b.h)).filter(h=>h>=Math.max(3,H*.008));
  let levels=[],ratio=1;
  if(heights.length){const s=[...heights].sort((a,b)=>b-a);s.forEach(h=>{const L=levels[levels.length-1];if(L&&L.min/h<1.18){L.min=h;L.n++}else levels.push({max:h,min:h,n:1})});levels=levels.filter(l=>l.n>=1);ratio=levels.length>1?levels[0].max/levels[1].max:1}
  feat.levels=levels.length;feat.ratio=ratio;
  const textLines=lines.reduce((a,l)=>a+l.bands.length,0);
  if(textLines>=3){
    if(levels.length===1)items.push({cat:'Typography',level:'warn',title:'Flat hierarchy – all text is one size',detail:'Every line measures about '+o(levels[0].max)+' px tall, so nothing leads the eye.',fix:'Make the headline 2–3× the body size and keep a small tertiary level for details.'});
    else if(levels.length>=5)items.push({cat:'Typography',level:'warn',title:'Too many text sizes ('+levels.length+')',detail:'Sizes found (px tall): '+levels.map(l=>o(l.max)).join(', ')+'.',fix:'Reduce to 3 sizes – headline, body, small – on a clear scale (≈1.25–1.5× steps).'});
    else if(ratio<1.3)items.push({cat:'Typography',level:'warn',title:'Headline and next size are too close ('+ratio.toFixed(2)+'×)',detail:'The largest text is only slightly bigger than the next level, so hierarchy is weak.',fix:'Scale the headline to at least 1.5× (ideally 2×) the next level.'});
    else items.push({cat:'Typography',level:'pass',title:'Clear type hierarchy',detail:levels.length+' text levels; headline is '+ratio.toFixed(1)+'× the next size.'})}
  const leadBad=[];lines.forEach(l=>{if(l.bands.length<3)return;const hs=l.bands.map(b=>b.h),ph=median(hs),p=[];for(let i=1;i<l.bands.length;i++)p.push(l.bands[i].y0-l.bands[i-1].y0);const mean=p.reduce((a,b)=>a+b,0)/p.length,cv=Math.sqrt(p.reduce((s,v)=>s+(v-mean)**2,0)/p.length)/mean,g=(mean-ph)/ph;
    if(g<.1)leadBad.push({l,msg:'very tight line spacing (lines almost touching)',fix:'Increase line-height – about 120–150% for body, 105–115% for large headlines.'});else if(g>1.15)leadBad.push({l,msg:'very loose line spacing',fix:'Reduce line-height so the lines read as one block (≈ 130–150%).'});else if(cv>.14)leadBad.push({l,msg:'uneven line spacing ('+p.map(v=>o(v)).join(', ')+' px pitch)',fix:'Use one fixed leading value for the whole paragraph.'})});
  leadBad.slice(0,2).forEach(x=>{const c=x.l.c;mv(c.x0,c.y0,c.x1,c.y1,'#f59e0b');items.push({cat:'Typography',level:'warn',title:'Text block with '+x.msg,detail:'The multi-line block at x='+o(c.x0)+' px, y='+o(c.y0)+' px.',fix:x.fix})});
  if(lines.some(l=>l.bands.length>=3)&&!leadBad.length)items.push({cat:'Typography',level:'pass',title:'Consistent line spacing',detail:'Multi-line text keeps an even, readable leading.'});
  const lowC=[];textComps.forEach(c=>{let fr=0,fg=0,fb=0,n=0,br=0,bg=0,bb=0,m=0;for(let y=c.y0;y<c.y1;y++)for(let x=c.x0;x<c.x1;x++){const p=y*W+x,o2=p*4;if(S.ink[p]&&S.lab[p]===c.id){fr+=d[o2];fg+=d[o2+1];fb+=d[o2+2];n++}else if(!S.ink[p]){br+=d[o2];bg+=d[o2+1];bb+=d[o2+2];m++}}
    if(!n||!m)return;const cr=contrastRatio([fr/n,fg/n,fb/n],[br/m,bg/m,bb/m]),small=(c.h<H*.06);if(cr<3||(cr<4.5&&small))lowC.push({c,cr,small})});
  lowC.slice(0,3).forEach(x=>{mv(x.c.x0,x.c.y0,x.c.x1,x.c.y1,'#ef4444');items.push({cat:'Typography',level:x.cr<3?'fail':'warn',title:'Low text contrast ('+x.cr.toFixed(1)+':1)',detail:'The text at x='+o(x.c.x0)+' px, y='+o(x.c.y0)+' px is hard to read ('+(x.small?'small text needs 4.5:1':'needs at least 3:1')+').',fix:'Darken the text or lighten the background; the brand\'s darkest colour on its lightest tint works well.'})});
  if(textComps.length&&!lowC.length)items.push({cat:'Typography',level:'pass',title:'Text contrast is readable',detail:'No text block falls below the recommended contrast.'});
  if((brand.fonts||[]).length)items.push({cat:'Typography',level:'info',title:'Brand typefaces to confirm: '+brand.fonts.slice(0,3).map(f=>f.name).join(', '),detail:'An exported image cannot reveal which font was used.',fix:'Check the text styles in your source file (Figma / PSD / AI) against these.'});
  /* balance & whitespace */
  let wsum=0,cx=0,cy=0;body.forEach(c=>{wsum+=c.ink;cx+=c.cx*c.ink;cy+=c.cy*c.ink});
  if(wsum){cx/=wsum;cy/=wsum;const dx=(cx-W/2)/W,dy=(cy-H/2)/H;feat.dx=dx;
    if(Math.abs(dx)>.2)items.push({cat:'Composition',level:'warn',title:'Visual weight pulls to the '+(dx<0?'left':'right'),detail:'The centre of mass sits '+Math.round(Math.abs(dx)*100)+'% off-centre horizontally.',fix:'Balance it with a lighter element, a logo or a graphic on the '+(dx<0?'right':'left')+' – unless the asymmetry is the concept.'});
    else if(Math.abs(dy)>.24)items.push({cat:'Composition',level:'info',title:'Content is '+(dy<0?'top':'bottom')+'-heavy',detail:'The centre of mass is '+Math.round(Math.abs(dy)*100)+'% off-centre vertically.'});
    else items.push({cat:'Composition',level:'pass',title:'Visual weight is balanced',detail:'The layout feels stable around the centre.'})}
  let covered=0;for(let i=0;i<N;i++)if(S.dil[i]&&!body.every(c=>S.lab[i]!==c.id))covered++;const ws=1-covered/N;feat.ws=ws;
  if(ws<.15)items.push({cat:'Composition',level:'warn',title:'Crowded layout – only '+Math.round(ws*100)+'% breathing space',detail:'Elements fill almost the whole canvas.',fix:'Remove or shrink something; aim for at least 25–30% empty space unless the style is deliberately dense.'});
  else if(ws>.88)items.push({cat:'Composition',level:'info',title:'Very sparse layout ('+Math.round(ws*100)+'% empty)',detail:'Elements are small relative to the canvas.',fix:'Scale the key message up so it can be read at thumbnail size.'});
  else items.push({cat:'Composition',level:'pass',title:'Good use of white space ('+Math.round(ws*100)+'% open)',detail:'There is enough breathing room around the elements.'});
  /* bento detection */
  const cards=body.filter(c=>c.dens>.5&&c.w>W*.14&&c.h>H*.08&&!c.full);if(cards.length>=4){const ws2=cards.map(c=>c.w),hs=cards.map(c=>c.h);feat.bento=(Math.max(...ws2)/Math.min(...ws2)<1.6||Math.max(...hs)/Math.min(...hs)<1.6)}
  feat.blocks=body.length;feat.topText=Math.max(0,...textComps.map(c=>c.area/N))}
/* ---------- the analyser ---------- */
async function lensAnalyze(canvas,brand,label){
  const fmt=lensFormat(canvas.width,canvas.height),items=[],marks=[],feat={ws:.5,colors:0,blocks:0,levels:0,ratio:1,topText:0,bgL:50,avgL:50,sat:.3,grad:false,photo:false,bento:false};
  items.push({cat:'Scenario',level:'info',title:'Reading this as: '+fmt.name,detail:fmt.note});
  const col=lensColours(canvas,brand);items.push(...col.items);await tickI();
  feat.colors=col.clusters.filter(c=>c.pct>=.03).length;const top=col.clusters.slice(0,3);feat.avgL=top.reduce((s,c)=>s+c.lab[0]*c.pct,0)/(top.reduce((s,c)=>s+c.pct,0)||1);feat.sat=top.reduce((s,c)=>s+Math.min(1,Math.hypot(c.lab[1],c.lab[2])/80)*c.pct,0)/(top.reduce((s,c)=>s+c.pct,0)||1);
  const S=scanLayout(canvas);feat.photo=S.photo;feat.bgL=S.bg.lab[0];try{feat.grad=!S.flat&&!!gradientFrom(canvas)}catch{}
  /* logo */
  const logos=lensLogoList(brand);let logoRes=null;
  if(logos.length){const imgs={};for(const l of logos){try{imgs[l.id]=await loadImg(l.data)}catch{}}
    try{logoRes=await analyzeLogo2(canvas,logos,imgs,brand.rules||{},{complexBg:!S.flat})}catch(e){items.push({cat:'Logo',level:'info',title:'Logo detection failed',detail:e.message})}}
  else items.push({cat:'Logo',level:'info',title:'No logo files to look for',detail:'Add PNG/SVG logos to this client so the lens can check placement and clear space.'});
  if(logoRes){items.push({cat:'Logo',level:logoRes.level,title:logoRes.title,detail:logoRes.detail,fix:logoRes.level==='fail'||logoRes.level==='warn'?'Use the correct, unstretched logo from the Logos section.':''});
    if(logoRes.box){marks.push({t:'rect',x:logoRes.box.x/canvas.width,y:logoRes.box.y/canvas.height,w:logoRes.box.w/canvas.width,h:logoRes.box.h/canvas.height,c:logoRes.boxOk?'#22c55e':'#f59e0b'});
      if(logoRes.boxOk){const cx=(logoRes.box.x+logoRes.box.w/2)/canvas.width,cy=(logoRes.box.y+logoRes.box.h/2)/canvas.height;items.push({cat:'Logo',level:'info',title:'Logo placement: '+(cy<.33?'top':cy>.66?'bottom':'middle')+' '+(cx<.33?'left':cx>.66?'right':'centre'),detail:'Keep the logo in the same position across a campaign so it becomes a recognisable anchor.'});lensClearSpace(S,logoRes.box,brand.rules||{},items,marks)}}}
  /* layout */
  let comps=[];
  if(S.photo)items.push({cat:'Composition',level:'info',title:'Photo-led image',detail:'Spacing and alignment are judged only where elements stand apart from the photo, so these checks are limited here.',fix:'Check text placement on a calm area and keep the logo on the cleanest corner.'});
  else{comps=blocksOf(S);if(logoRes&&logoRes.box&&logoRes.boxOk){const lb=logoRes.box,sc=S.sc;comps=comps.filter(c=>!(c.cx>lb.x*sc&&c.cx<(lb.x+lb.w)*sc&&c.cy>lb.y*sc&&c.cy<(lb.y+lb.h)*sc&&c.area<lb.w*lb.h*sc*sc*2.2))}
    lensLayout(S,comps,fmt,logoRes&&logoRes.box,items,marks,feat,brand)}
  /* style read */
  const st=readStyle(feat);items.push({cat:'Composition',level:'info',title:'Style read: '+st.main.name+(st.second?' (with '+st.second.name.toLowerCase()+' cues)':''),detail:'Detected from layout and colour behaviour – '+st.main.advice.join(' ')});
  /* score */
  const order=['Scenario','Colour','Logo','Spacing','Alignment','Typography','Composition'];items.sort((a,b)=>order.indexOf(a.cat)-order.indexOf(b.cat));
  let score=100;items.forEach(i=>{if(i.level==='fail')score-=14;else if(i.level==='warn')score-=5});score=Math.max(0,score);
  const worst=items.reduce((m,i)=>LEVEL_RANK[i.level]>LEVEL_RANK[m]?i.level:m,'pass');
  /* thumbnail with overlay marks */
  const tw=Math.min(640,canvas.width),tf=tw/canvas.width,tc=document.createElement('canvas');tc.width=tw;tc.height=Math.round(canvas.height*tf);const x=tc.getContext('2d');x.drawImage(canvas,0,0,tc.width,tc.height);
  marks.forEach(m=>{x.lineWidth=2;x.strokeStyle=m.c;x.setLineDash(m.dash?[6,4]:[]);if(m.t==='rect'){if(m.fill){x.fillStyle=m.c;x.fillRect(m.x*tc.width,m.y*tc.height,m.w*tc.width,m.h*tc.height)}else x.strokeRect(m.x*tc.width,m.y*tc.height,m.w*tc.width,m.h*tc.height)}else if(m.t==='vline'){x.beginPath();x.moveTo(m.x*tc.width,0);x.lineTo(m.x*tc.width,tc.height);x.stroke()}});x.setLineDash([]);
  return{label,items,clusters:col.clusters.slice(0,12),level:worst==='info'?'pass':worst,score,fmt:fmt.name,style:st.main.name,thumb:tc.toDataURL('image/jpeg',.88),w:canvas.width,h:canvas.height}}
/* ---------- logo detection v2: shape + tone correlation + colour verification ---------- */
function renderTpl2(img,lw,lh,tw,asp=1){
  const th=Math.max(2,Math.round(tw*lh/lw*asp)),pad=Math.max(2,Math.round(tw*.08)),W=tw+2*pad,H=th+2*pad,c=document.createElement('canvas');c.width=W;c.height=H;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,pad,pad,tw,th);const d=x.getImageData(0,0,W,H).data,opaqueCorner=d[(pad*W+pad)*4+3]>250&&d[((pad+th-1)*W+pad+tw-1)*4+3]>250;
  const mask=new Uint8Array(W*H);let cnt=0,mr=0,mg=0,mb=0;
  for(let i=0;i<W*H;i++){const o=i*4,px=i%W,py=(i-px)/W;let m;
    if(opaqueCorner){const o0=(pad*W+pad)*4;m=(Math.abs(d[o]-d[o0])+Math.abs(d[o+1]-d[o0+1])+Math.abs(d[o+2]-d[o0+2]))>90&&px>=pad&&px<pad+tw&&py>=pad&&py<pad+th}else m=d[o+3]>128;
    if(m){mask[i]=1;cnt++;mr+=d[o];mg+=d[o+1];mb+=d[o+2]}}
  if(cnt<6||cnt>W*H*.97)return null;
  const step=Math.max(1,Math.ceil(Math.sqrt(W*H/420))),xs=[],ys=[],ts=[],gxs=[],gys=[],gt=[],cxs=[],cys=[],cr=[],cg=[],cb=[];let sT=0;
  for(let y=0;y<H;y+=step)for(let xx=0;xx<W;xx+=step){const i=y*W+xx,o=i*4;xs.push(xx);ys.push(y);ts.push(mask[i]);sT+=mask[i];
    if(mask[i]){gxs.push(xx);gys.push(y);gt.push((.299*d[o]+.587*d[o+1]+.114*d[o+2])/255);if(d[o+3]>200||opaqueCorner){cxs.push(xx);cys.push(y);cr.push(d[o]);cg.push(d[o+1]);cb.push(d[o+2])}}}
  const n=xs.length;if(sT<3||sT>n-3)return null;
  const te=new Uint8Array(W*H),lumT=new Float32Array(W*H);for(let i=0;i<W*H;i++){const o=i*4;lumT[i]=(.299*d[o]+.587*d[o+1]+.114*d[o+2])*(d[o+3]/255)+(1-d[o+3]/255)*128}
  for(let y=0;y<H-1;y++)for(let xx=0;xx<W-1;xx++){const i=y*W+xx,o=i*4;if(Math.abs(lumT[i]-lumT[i+1])>38||Math.abs(lumT[i]-lumT[i+W])>38||Math.abs(d[o+3]-d[o+7])>90||Math.abs(d[o+3]-d[o+W*4+3])>90)te[i]=1}
  const ted=new Uint8Array(W*H);for(let y=1;y<H-1;y++)for(let xx=1;xx<W-1;xx++){if(te[y*W+xx]){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)ted[(y+dy)*W+xx+dx]=1}}
  const exs=[],eys=[];{const all=[];for(let i=0;i<W*H;i++)if(te[i])all.push(i);const st=Math.max(1,Math.floor(all.length/400));for(let k=0;k<all.length;k+=st){exs.push(all[k]%W);eys.push((all[k]/W)|0)}}
  const gn=gt.length,sG=gt.reduce((a,b)=>a+b,0),sGG=gt.reduce((a,b)=>a+b*b,0),gv=gn?sGG/gn-(sG/gn)**2:0;
  return{W,H,pad,tw,th,xs:Int16Array.from(xs),ys:Int16Array.from(ys),ts:Uint8Array.from(ts),n,sT,mask,mean:[mr/cnt,mg/cnt,mb/cnt],cnt,
    ted,exs:Int16Array.from(exs),eys:Int16Array.from(eys),g:gv>.012&&gn>=12,gn,gxs:Int16Array.from(gxs),gys:Int16Array.from(gys),gt:Float32Array.from(gt),sG,sGG,cn:cxs.length,cxs:Int16Array.from(cxs),cys:Int16Array.from(cys),cr:Uint8Array.from(cr),cg:Uint8Array.from(cg),cb:Uint8Array.from(cb)}}
function matchTpl2(g,GW,GH,t,stride,x0,x1,y0,y1,ii){
  let best={s:0,sb:0,sg:0,x:0,y:0};const{xs,ys,ts,n,sT}=t,den0=n*sT-sT*sT;x0=Math.max(0,x0);y0=Math.max(0,y0);x1=Math.min(GW-t.W,x1);y1=Math.min(GH-t.H,y1);
  const S1=ii.s,S2=ii.s2,P=GW+1,area=t.W*t.H;
  for(let y=y0;y<=y1;y+=stride)for(let x=x0;x<=x1;x+=stride){
    const a=y*P+x,b=a+t.W,c=(y+t.H)*P+x,dd=c+t.W,m1=(S1[dd]-S1[b]-S1[c]+S1[a])/area,v=(S2[dd]-S2[b]-S2[c]+S2[a])/area-m1*m1;if(v<.0004)continue;
    let sI=0,sII=0,sIT=0;for(let k=0;k<n;k++){const q=g[(y+ys[k])*GW+x+xs[k]];sI+=q;sII+=q*q;if(ts[k])sIT+=q}
    const dn=den0*(n*sII-sI*sI),sb=dn>1e-9?Math.abs((n*sIT-sI*sT)/Math.sqrt(dn)):0;let s=sb,sg=0;
    if(t.g){s=0;if(sb>.2){const gn=t.gn;let a2=0,b2=0,c2=0;for(let k=0;k<gn;k++){const q=g[(y+t.gys[k])*GW+x+t.gxs[k]];a2+=q;b2+=q*q;c2+=q*t.gt[k]}const dg=(gn*t.sGG-t.sG*t.sG)*(gn*b2-a2*a2);if(dg>1e-9){sg=(gn*c2-a2*t.sG)/Math.sqrt(dg);s=Math.max(0,sg)}}}
    if(s>best.s)best={s,sb,sg,x,y}}
  return best}
function edgeF1(t,Ed,E,GW,GH,x,y){const n=t.exs.length;if(n<12)return 0;let cov=0;for(let k=0;k<n;k++)if(Ed[(y+t.eys[k])*GW+x+t.exs[k]])cov++;cov/=n;let tot=0,hit=0;
  for(let py=0;py<t.H;py++){const row=(y+py)*GW+x;for(let px2=0;px2<t.W;px2++){if(E[row+px2]){tot++;if(t.ted[py*t.W+px2])hit++}}}
  const prec=tot?hit/tot:0;return cov+prec?2*cov*prec/(cov+prec):0}
const ringAt=(t,g,GW,x,y)=>{let a=0,na=0,b=0,b2=0,nb=0;for(let k=0;k<t.n;k++){const v=g[(y+t.ys[k])*GW+x+t.xs[k]];if(t.ts[k]){a+=v;na++}else{b+=v;b2+=v*v;nb++}}if(!na||nb<4)return{vis:1,std:0};const mb=b/nb;return{vis:Math.abs(a/na-mb),std:Math.sqrt(Math.max(0,b2/nb-mb*mb))}};
function matchSad(px,g,GW,GH,t,stride,x0,x1,y0,y1,ii,cut){let best={sad:1e9,x:0,y:0};const n=t.cn;if(n<20)return best;x0=Math.max(0,x0);y0=Math.max(0,y0);x1=Math.min(GW-t.W,x1);y1=Math.min(GH-t.H,y1);const S1=ii.s,S2=ii.s2,P=GW+1,area=t.W*t.H;
  for(let y=y0;y<=y1;y+=stride)for(let x=x0;x<=x1;x+=stride){const a=y*P+x,b=a+t.W,c=(y+t.H)*P+x,dd=c+t.W,m1=(S1[dd]-S1[b]-S1[c]+S1[a])/area,v=(S2[dd]-S2[b]-S2[c]+S2[a])/area-m1*m1;if(v<.0004)continue;
    let sum=0,k=0;const lim=Math.min(cut,best.sad)*n;for(;k<n;k++){const o=((y+t.cys[k])*GW+x+t.cxs[k])*4;sum+=(Math.abs(px[o]-t.cr[k])+Math.abs(px[o+1]-t.cg[k])+Math.abs(px[o+2]-t.cb[k]))/3;if(sum>lim)break}
    if(k===n&&sum/n<best.sad)best={sad:sum/n,x,y}}
  return best}

const sadSoft=(t,px,GW,GH,x,y)=>{const n=t.cn;if(n<4)return 120;let tot=0;for(let k=0;k<n;k++){let best=1e9;const bx=x+t.cxs[k],by=y+t.cys[k];for(let dy=-1;dy<=1;dy++){const yy=by+dy;if(yy<0||yy>=GH)continue;for(let dx=-1;dx<=1;dx++){const xx=bx+dx;if(xx<0||xx>=GW)continue;const o=(yy*GW+xx)*4,v=(Math.abs(px[o]-t.cr[k])+Math.abs(px[o+1]-t.cg[k])+Math.abs(px[o+2]-t.cb[k]))/3;if(v<best)best=v}}tot+=best}return tot/n};
const sadAt=(t,px,GW,x,y)=>{const n=t.cn;if(n<4)return 120;let s=0;for(let k=0;k<n;k++){const o=((y+t.cys[k])*GW+x+t.cxs[k])*4;s+=(Math.abs(px[o]-t.cr[k])+Math.abs(px[o+1]-t.cg[k])+Math.abs(px[o+2]-t.cb[k]))/3}return s/n};
async function analyzeLogo2(canvas,logos,imgs,rules,opts={}){
  const sc=Math.min(1,640/Math.max(canvas.width,canvas.height)),W=Math.max(8,Math.round(canvas.width*sc)),H=Math.max(8,Math.round(canvas.height*sc)),wc=document.createElement('canvas');wc.width=W;wc.height=H;
  const wx=wc.getContext('2d',{willReadFrequently:true});wx.fillStyle='#fff';wx.fillRect(0,0,W,H);wx.drawImage(canvas,0,0,W,H);
  const px=wx.getImageData(0,0,W,H).data,g=new Float32Array(W*H);for(let i=0;i<W*H;i++)g[i]=(.299*px[i*4]+.587*px[i*4+1]+.114*px[i*4+2])/255;
  const P=W+1,ii={s:new Float64Array(P*(H+1)),s2:new Float64Array(P*(H+1))};for(let y=0;y<H;y++){let rs=0,rs2=0;for(let x=0;x<W;x++){const v=g[y*W+x];rs+=v;rs2+=v*v;const i=(y+1)*P+x+1;ii.s[i]=ii.s[i-P]+rs;ii.s2[i]=ii.s2[i-P]+rs2}}
  const E=new Uint8Array(W*H),Ed=new Uint8Array(W*H);for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(Math.abs(g[i+1]-g[i-1])+Math.abs(g[i+W]-g[i-W])>.16)E[i]=1}
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){if(E[y*W+x]){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)Ed[(y+dy)*W+x+dx]=1}}
  const stdLim=opts.complexBg?1:.2,minLogo0=+rules.minLogo||0;
  const sadFind=async(L,asp,step,top)=>{const img=imgs[L.id];if(!img)return null;const lw=L.w||img.naturalWidth||300,lh=L.h||img.naturalHeight||100,cs=[];
    for(let tw=14;tw<=W*.92;tw=Math.round(tw*step)+(tw<20?1:0)){const t=renderTpl2(img,lw,lh,tw,asp);if(!t||t.W>W||t.H>H||t.cn<20)continue;const stride=Math.max(1,Math.round(tw/(asp===1?16:9))),m=matchSad(px,g,W,H,t,stride,0,W,0,H,ii,70);if(m.sad<70)cs.push({...m,tw,stride,t})}
    await tickI();cs.sort((a,b)=>a.sad-b.sad);let fin=null;
    for(const b of cs.slice(0,top)){for(const f of[1,.94,1.06,.88,1.12]){const tw=Math.round(b.tw*f),t=f===1?b.t:renderTpl2(img,lw,lh,tw,asp);if(!t||t.W>W||t.H>H||t.cn<20)continue;const cx=b.x+b.t.W/2-t.W/2,cy=b.y+b.t.H/2-t.H/2,r=b.stride+2,m=matchSad(px,g,W,H,t,1,Math.round(cx-r),Math.round(cx+r),Math.round(cy-r),Math.round(cy+r),ii,70);
        if(m.sad>=70)continue;const rg=ringAt(t,g,W,m.x,m.y);if(rg.vis<.05||rg.std>stdLim)continue;if(!fin||m.sad<fin.sad)fin={sad:m.sad,x:m.x,y:m.y,t,tw}}}
    if(!fin)return null;let bst={sad:sadSoft(fin.t,px,W,H,fin.x,fin.y),x:fin.x,y:fin.y,t:fin.t};
    for(const f of[1,.97,1.03]){const tw=Math.round(fin.tw*f),t=f===1?fin.t:renderTpl2(img,lw,lh,tw,asp);if(!t||t.W>W||t.H>H||t.cn<20)continue;const cx=fin.x+fin.t.W/2-t.W/2,cy=fin.y+fin.t.H/2-t.H/2;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=Math.round(cx)+dx,y=Math.round(cy)+dy;if(x<0||y<0||x+t.W>W||y+t.H>H)continue;const v=sadSoft(t,px,W,H,x,y);if(v<bst.sad)bst={sad:v,x,y,t}}}
    const rg=ringAt(bst.t,g,W,bst.x,bst.y);if(rg.vis<.15||rg.std>stdLim)return null;
    return{L,asp,sad:bst.sad,vis:rg.vis,box:{x:(bst.x+bst.t.pad)/sc,y:(bst.y+bst.t.pad)/sc,w:bst.t.tw/sc,h:bst.t.th/sc},wPct:bst.t.tw/W*100}};
  const sadHits=[];for(const L of logos){const h=await sadFind(L,1,1.2,4);if(h)sadHits.push(h)}
  const okHits=sadHits.filter(h=>h.sad<=22),minSad=Math.min(...okHits.map(h=>h.sad)),sadOk=okHits.filter(h=>h.sad<=minSad+8).sort((a,b)=>b.box.w*b.box.h-a.box.w*a.box.h)[0];
  if(sadOk){let lvl='pass',det='Matched "'+sadOk.L.name+'" (colour-exact), about '+Math.round(sadOk.box.w)+' px wide = '+sadOk.wPct.toFixed(1)+'% of the width.';if(minLogo0&&sadOk.wPct<minLogo0){lvl='fail';det+=' Brand rule: logo must be at least '+minLogo0+'% of the width.'}return{level:lvl,title:lvl==='pass'?'Logo found':'Logo too small',detail:det,box:sadOk.box,boxOk:true}}
  const results=[];let bestComb=0;
  for(const L of logos.slice(0,4)){const img=imgs[L.id];if(!img)continue;const lw=L.w||img.naturalWidth||300,lh=L.h||img.naturalHeight||100,cands=[];
    for(let tw=14;tw<=W*.92;tw=Math.round(tw*1.22)+(tw<20?1:0)){const t=renderTpl2(img,lw,lh,tw);if(!t||t.W>W||t.H>H)continue;const stride=Math.max(1,Math.round(tw/14)),m=matchTpl2(g,W,H,t,stride,0,W,0,H,ii);cands.push({...m,tw,stride,t})}
    await tickI();cands.sort((a,b)=>b.s-a.s);let fin=null;
    for(const b of cands.slice(0,9)){if(b.s<.2)break;
      for(const f of[1,.93,1.07,.86,1.14]){const tw=Math.round(b.tw*f),t=f===1?b.t:renderTpl2(img,lw,lh,tw);if(!t||t.W>W||t.H>H)continue;const cx=b.x+b.t.W/2-t.W/2,cy=b.y+b.t.H/2-t.H/2,r=b.stride*2+2,m=matchTpl2(g,W,H,t,1,Math.round(cx-r),Math.round(cx+r),Math.round(cy-r),Math.round(cy+r),ii);
        const sad=sadAt(t,px,W,m.x,m.y),rg=ringAt(t,g,W,m.x,m.y),vis=rg.vis,comb=m.s*(1-Math.min(1,sad/90))*Math.min(1,vis/.07);if(!fin||comb>fin.comb)fin={...m,tw,t,asp:1,sad,vis,rstd:rg.std,comb}}}
    if(!fin)continue;fin.s1=fin.s;
    const t=fin.t;let r=0,gg=0,b=0,c=0;for(let yy=0;yy<t.H;yy++)for(let xx=0;xx<t.W;xx++){if(!t.mask[yy*t.W+xx])continue;const o=((fin.y+yy)*W+fin.x+xx)*4;r+=px[o];gg+=px[o+1];b+=px[o+2];c++}
    results.push({L,ef:edgeF1(fin.t,Ed,E,W,H,fin.x,fin.y),s:fin.s,sb:fin.sb,vis:fin.vis,rstd:fin.rstd,s1:fin.s1,sad:fin.sad,comb:fin.comb,asp:fin.asp,distorted:fin.asp!==1&&fin.s-fin.s1>.03,found:rgbToHex(r/c,gg/c,b/c),want:rgbToHex(...t.mean),box:{x:(fin.x+t.pad)/sc,y:(fin.y+t.pad)/sc,w:t.tw/sc,h:t.th/sc},wPct:t.tw/W*100})}
  const minLogo=+rules.minLogo||0,ok=results.filter(r=>!r.distorted&&r.s1>=.42&&r.sad<=42&&r.vis>=.05&&r.rstd<=stdLim&&r.ef>=.4&&r.wPct>=6).sort((a,b)=>b.comb-a.comb)[0];
  if(ok){let lvl='pass',det='Matched "'+ok.L.name+'" (confidence '+Math.round(ok.s*100)+'%), about '+Math.round(ok.box.w)+' px wide = '+ok.wPct.toFixed(1)+'% of the width.';if(minLogo&&ok.wPct<minLogo){lvl='fail';det+=' Brand rule: logo must be at least '+minLogo+'% of the width.'}return{level:lvl,title:lvl==='pass'?'Logo found':'Logo too small',detail:det,box:ok.box,boxOk:true}}
  const dist=results.filter(r=>r.distorted&&r.s>=.55&&r.sad<=70&&r.vis>=.05&&r.rstd<=stdLim&&r.ef>=.45).sort((a,b)=>b.comb-a.comb)[0];
  if(dist)return{level:'fail',title:'Logo looks stretched or squashed',detail:'"'+dist.L.name+'" fits best when its height is ~'+Math.round(dist.asp*100)+'% of the correct proportion. Always scale the logo proportionally (hold Shift).',box:dist.box,boxOk:false};
  const wrong=results.filter(r=>Math.max(r.s,r.sb*.9)>=.7&&r.sad>42&&r.sad<=120&&r.vis>=.05&&r.rstd<=stdLim&&r.ef>=.45&&r.wPct>=6).sort((a,b)=>b.sb-a.sb)[0];
  if(wrong)return{level:'fail',title:'Logo shape found, but colour is wrong',detail:'Closest to "'+wrong.L.name+'", but its colour reads '+wrong.found+' instead of ~'+wrong.want+'. Looks recoloured or the wrong variant for this background.',box:wrong.box,boxOk:false};
  const poss=results.filter(r=>r.s>=.45&&r.vis>=.05&&r.rstd<=stdLim&&r.ef>=.4&&r.wPct>=6).sort((a,b)=>b.s-a.s)[0];
  if(poss)return{level:'warn',title:'Possible logo – please verify',detail:'Weak match with "'+poss.L.name+'" ('+Math.round(poss.s*100)+'%). Could be stretched, cropped, effects applied, or not the logo.',box:poss.box,boxOk:false};
  return{level:rules.requireLogo===false?'info':'fail',title:'Logo not found',detail:'No approved logo variant detected. It may be missing, stretched/distorted, heavily cropped, or have effects (shadow, outline) applied.'}}
