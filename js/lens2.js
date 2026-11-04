/* LatchHub – Design Lens part 2: logo placement (corner margins), research-based content checks, brand assessment, click-to-locate overlay. */
const RR_=(S,x0,y0,x1,y1,k)=>({x:x0/S.W,y:y0/S.H,w:(x1-x0)/S.W,h:(y1-y0)/S.H,k});
const hueName=lab=>{const ch=Math.hypot(lab[1],lab[2]),h=(Math.atan2(lab[2],lab[1])*180/Math.PI+360)%360;
  if(lab[0]>92&&ch<12)return'white';if(lab[0]<15)return'black';if(ch<12)return'grey';if(ch<22)return null;
  return h>=15&&h<55?'red':h<82?'orange':h<118?'yellow':h<200?'green':h<235?'cyan':h<305?'blue':h<335?'purple':h<360||h<15?'pink':'pink'};

/* ---------- logo placement: corner, top vs side margin, centring, app-UI zones ---------- */
function lensLogoPlacement(S,b,C,fmt,items){
  const{W,H,sc}=S,o=v=>Math.round(v/sc),short=Math.min(W,H),rr=(x0,y0,x1,y1,k)=>RR_(S,x0,y0,x1,y1,k);
  const m={left:b.x0,right:W-b.x1,top:b.y0,bottom:H-b.y1},vert=m.top<=m.bottom?'top':'bottom',hor=m.left<=m.right?'left':'right',mv=m[vert],mh=m[hor];
  const cx=(b.x0+b.x1)/2/W,cy=(b.y0+b.y1)/2/H,nearV=mv<H*.2,nearH=mh<W*.2,logoR=rr(b.x0,b.y0,b.x1,b.y1,'ok');
  const strip=n=>n==='top'?rr(b.x0,0,b.x1,b.y0,'ref'):n==='bottom'?rr(b.x0,b.y1,b.x1,H,'ref'):n==='left'?rr(0,b.y0,b.x0,b.y1,'ref'):rr(b.x1,b.y0,W,b.y1,'ref');
  const need=Math.max(C*.75,fmt.margin*short*.6),ref='Logo exclusion-zone practice (brand identity guidelines); equal optical margins – Swiss/International style';
  if(nearV&&nearH){
    const where=vert+'-'+hor,hl=[logoR,strip(vert),strip(hor)],tight=[[vert,mv],[hor,mh]].filter(([,v])=>v<need);
    if(tight.length)items.push({cat:'Logo',level:tight.some(([,v])=>v<need*.5)?'fail':'warn',title:'Logo is too close to the '+tight.map(t=>t[0]).join(' and ')+' edge',detail:'It sits in the '+where+' corner: '+vert+' margin '+o(mv)+' px, '+hor+' margin '+o(mh)+' px. At least '+o(need)+' px is needed on each side so platform cropping or print trim cannot clip it.',fix:'Move the logo inwards until both margins are about '+px8(Math.max(need,(mv+mh)/2),sc)+' px.',hl,ref});
    else if(Math.abs(mv-mh)>Math.max(Math.max(mv,mh)*.2,short*.006))items.push({cat:'Logo',level:'warn',title:'Logo corner margins are uneven – '+vert+' '+o(mv)+' px vs '+hor+' '+o(mh)+' px',detail:'In the '+where+' corner the distance from the top/bottom edge and from the side edge should match, otherwise the logo looks pushed off its corner.',fix:'Use the same distance from both edges – about '+px8((mv+mh)/2,sc)+' px.',hl,ref});
    else items.push({cat:'Logo',level:'pass',title:'Logo sits correctly in the '+where+' corner',detail:vert+' margin '+o(mv)+' px · '+hor+' margin '+o(mh)+' px – even and above the minimum of '+o(need)+' px.',hl,ref});
    if(Math.max(mv,mh)>short*.14)items.push({cat:'Logo',level:'info',title:'Logo is a long way from its corner',detail:'Margins of '+o(mv)+' and '+o(mh)+' px are more than 14% of the short side, so it reads as floating rather than anchored.',fix:'Tuck it to about '+px8(Math.max(need,short*.05),sc)+' px from both edges if it should anchor the layout.',hl});
  }else if(nearV&&Math.abs(cx-.5)<.14){
    const off=Math.abs(cx-.5)*W;
    if(mv<need)items.push({cat:'Logo',level:mv<need*.5?'fail':'warn',title:'Logo is too close to the '+vert+' edge',detail:'Centred at the '+vert+' with only '+o(mv)+' px margin; at least '+o(need)+' px is needed.',fix:'Move it inwards by '+o(need-mv)+' px or more.',hl:[logoR,strip(vert)],ref});
    else if(off>Math.max(2,W*.008))items.push({cat:'Logo',level:'warn',title:'Centred logo is off-centre by '+o(off)+' px',detail:'Left margin '+o(m.left)+' px vs right margin '+o(m.right)+' px.',fix:'Centre it horizontally on x='+o(W/2)+' px.',hl:[logoR,strip('left'),strip('right')],ref});
    else items.push({cat:'Logo',level:'pass',title:'Logo is centred at the '+vert,detail:vert+' margin '+o(mv)+' px, left and right margins equal.',hl:[logoR],ref});
  }else if(nearH&&Math.abs(cy-.5)<.14){
    items.push({cat:'Logo',level:mh<need?'warn':'pass',title:mh<need?'Logo is too close to the '+hor+' edge':'Logo sits on the '+hor+' edge, vertically centred',detail:hor+' margin '+o(mh)+' px (needs '+o(need)+' px).',fix:mh<need?'Move it inwards by '+o(need-mh)+' px or more.':'',hl:[logoR,strip(hor)],ref})
  }else items.push({cat:'Logo',level:'info',title:'Logo floats inside the layout',detail:'It is '+Math.round(cx*100)+'% from the left and '+Math.round(cy*100)+'% from the top – not anchored to a corner. Social creatives are normally easiest to recognise with the logo fixed in one corner.',fix:'Move it to the same corner used across the client\'s campaign.',hl:[logoR]});
  if(fmt.safe&&(vert==='top'?m.top<fmt.safe.top*H:m.bottom<fmt.safe.bottom*H)&&nearV){
    const z=vert==='top'?rr(0,0,W,fmt.safe.top*H,'ref'):rr(0,H-fmt.safe.bottom*H,W,H,'ref');
    items.push({cat:'Logo',level:'warn',title:'Logo sits under the app interface',detail:'On Stories/Reels the '+vert+' ~'+Math.round(fmt.safe[vert]*100)+'% is covered by profile name, buttons or captions.',fix:'Move the logo '+(vert==='top'?'below y='+o(fmt.safe.top*H):'above y='+o((1-fmt.safe.bottom)*H))+' px.',hl:[logoR,z],ref:'Meta / TikTok / YouTube Shorts safe-zone guidelines'})}}

/* ---------- design science: checks grounded in published research ---------- */
function lensScience(S,comps,fmt,items,col,brand){
  const{W,H,sc}=S,N=W*H,o=v=>Math.round(v/sc),RC=c=>RR_(S,c.x0,c.y0,c.x1,c.y1),body=(comps||[]).filter(c=>!c.hero&&!c.full);
  const hueOf=l=>(Math.atan2(l[2],l[1])*180/Math.PI+360)%360,hd=(a,b)=>{const d=Math.abs(a-b);return Math.min(d,360-d)};
  /* 1 colour harmony (Itten / Albers) */
  if(!col.photo){
    const chrom=col.clusters.filter(c=>c.pct>=.03&&Math.hypot(c.lab[1],c.lab[2])>=14),fam=[];
    chrom.forEach(c=>{const h=hueOf(c.lab),f=fam.find(x=>hd(x.h,h)<28);if(f)f.pct+=c.pct;else fam.push({h,pct:c.pct})});
    const bh=(brand.colors||[]).map(c=>labOfHex(c.hex)).filter(l=>Math.hypot(l[1],l[2])>=14).map(hueOf),inBrand=fam.length&&fam.every(f=>bh.some(b=>hd(b,f.h)<30)),ref='Itten (Bauhaus) colour contrasts; Albers, Interaction of Color (Yale)',n=fam.length;
    if(n===1)items.push({cat:'Colour',level:'pass',title:'Colour harmony: monochromatic',detail:'One hue family dominates, which reads calm, premium and cohesive.',ref});
    else if(n===2){const d=hd(fam[0].h,fam[1].h);items.push({cat:'Colour',level:'pass',title:'Colour harmony: '+(d<=60?'analogous':d>=150?'complementary':'two-hue'),detail:d>=150?'Two opposite hues create maximum vibrancy – keep one dominant and the other as an accent.':d<=60?'Neighbouring hues feel natural and unified.':'Two distinct hues; make sure one clearly leads.',ref})}
    else if(n===3){const s=fam.map(f=>f.h).sort((a,b)=>a-b),gaps=[s[1]-s[0],s[2]-s[1],360-s[2]+s[0]].sort((a,b)=>a-b),tri=gaps[0]>=85&&gaps[2]<=155,ana=gaps[2]>=270;
      items.push({cat:'Colour',level:'pass',title:'Colour harmony: '+(tri?'triadic':ana?'analogous':'three-hue palette'),detail:tri?'Three evenly spaced hues are lively; one should dominate.':ana?'Three neighbouring hues feel harmonious.':'Three hues with no strict relationship – fine when they are the brand palette.',ref})}
    else if(n>=4)items.push({cat:'Colour',level:inBrand?'info':'warn',title:inBrand?'Rich palette: '+n+' hue families (all from the brand)':'Many competing hues ('+n+' hue families)',detail:inBrand?'Four or more hues is acceptable here because each belongs to the brand palette.':'More than three hue families usually looks busy and weakens recognition.',fix:inBrand?'':'Reduce to one dominant hue, one supporting hue and one accent.',ref})}
  /* 2 colour proportion & isolation effect (60-30-10, Von Restorff) */
  if(!col.photo&&col.clusters.length>=2){
    const tot=col.clusters.reduce((s,c)=>s+c.pct,0)||1,cl=col.clusters.map(c=>({c,sh:c.pct/tot,ch:Math.hypot(c.lab[1],c.lab[2])})),lead=cl[0],vivid=cl.filter(x=>x.sh>=.02).sort((a,b)=>b.ch-a.ch)[0],ref='60-30-10 proportion heuristic; Von Restorff isolation effect (1933)';
    if(lead.sh<.38)items.push({cat:'Colour',level:'warn',title:'No dominant colour – the largest covers only '+Math.round(lead.sh*100)+'%',detail:'Several colours share the area almost equally, so nothing sets the mood.',fix:'Let one colour own roughly 60% (usually the background), a second ~30%, and an accent ~10%.',hlColor:lead.c.hex,ref});
    else if(vivid&&vivid!==lead&&vivid.ch>=30&&vivid.sh>.35)items.push({cat:'Colour',level:'warn',title:'Most vivid colour covers '+Math.round(vivid.sh*100)+'% – it no longer works as an accent',detail:vivid.c.hex+' is the strongest colour in the design but takes over a third of it.',fix:'Shrink it to ~10–15% (buttons, highlights, one shape) and let a calmer colour carry the background.',hlColor:vivid.c.hex,ref});
    else if(vivid&&vivid!==lead&&vivid.ch>=30&&vivid.sh<=.18)items.push({cat:'Colour',level:'pass',title:'Accent colour stands out ('+Math.round(vivid.sh*100)+'% of the area)',detail:vivid.c.hex+' is rare enough to catch the eye first – the isolation effect.',hlColor:vivid.c.hex,ref})}
  if(!body.length)return;
  /* 3 focal point (feature integration, visual saliency) */
  const bgL=S.bg.lab[0],wt=body.map(c=>{let sum=0,n=0;for(let y=c.y0;y<c.y1;y+=2)for(let x=c.x0;x<c.x1;x+=2){const p=y*W+x;if(S.ink[p]&&S.lab[p]===c.id){const q=p*4;sum+=lab5(S.d[q],S.d[q+1],S.d[q+2])[0];n++}}
    const con=n?Math.abs(sum/n-bgL):20;return{c,w:c.ink*(.35+Math.min(1,con/60))}}).sort((a,b)=>b.w-a.w);
  if(wt.length>=2){const a=wt[0],b=wt[1],r12=a.w/b.w,dist=Math.hypot((a.c.cx-b.c.cx)/W,(a.c.cy-b.c.cy)/H),ref='Treisman & Gelade feature integration (1980); Itti, Koch & Niebur saliency model (1998); Wolfe guided search (Harvard)';
    if(r12<1.2&&dist>.28)items.push({cat:'Composition',level:'warn',title:'Two elements compete for the first glance',detail:'The two heaviest elements have almost equal visual weight ('+r12.toFixed(2)+'×) and sit far apart, so the eye does not know where to start.',fix:'Make one clearly dominant – scale it up ~1.5× or boost its contrast – and let the other support it.',hl:[RC(a.c),RC(b.c)],ref});
    else if(r12>=1.6)items.push({cat:'Composition',level:'pass',title:'One clear focal point',detail:'The leading element is '+r12.toFixed(1)+'× heavier than the next, so the eye lands there first.',hl:[{...RC(a.c),k:'ok'}],ref})}
  const f=wt[0].c,fx=f.cx/W,fy=f.cy/H,pts=[1/3,2/3,.382,.618],near=Math.min(...pts.flatMap(px=>pts.map(py=>Math.hypot(fx-px,fy-py))));
  if(near<=.1)items.push({cat:'Composition',level:'pass',title:'Focal element lands near a rule-of-thirds / golden-ratio point',detail:'Off-centre placement on a power point feels dynamic. (A heuristic – evidence for it is mixed, so it never costs points.)',hl:[{...RC(f),k:'ok'}],ref:'Rule of thirds (J. T. Smith, 1797); golden ratio'});
  else if(Math.abs(fx-.5)<.06&&Math.abs(fy-.5)<.06)items.push({cat:'Composition',level:'info',title:'Centred, static composition',detail:'The main element sits dead-centre: stable and formal, less dynamic than an off-centre layout.',hl:[RC(f)]});
  /* 4 reading flow (Gutenberg diagram, F-pattern eye tracking) */
  const textComps=body.filter(c=>c.dens>.05&&c.dens<.85&&c.h<H*.5&&c.w>c.h*.35),tl=textComps.map(c=>({c,b:linesOf(S,c)})).filter(x=>x.b.length);
  if(tl.length){const head=[...tl].sort((a,b)=>Math.max(...b.b.map(z=>z.h))-Math.max(...a.b.map(z=>z.h)))[0],cy=(head.c.y0+head.c.y1)/2/H,ref='Gutenberg diagram; F-pattern eye-tracking (Nielsen Norman Group, 2006)';
    if(cy<=.62)items.push({cat:'Composition',level:'pass',title:'Headline sits where eyes land first',detail:'Readers scan from the top-left first; the largest text is in the upper '+Math.round(cy*100)+'% of the canvas.',hl:[{...RC(head.c),k:'ok'}],ref});
    else if(cy>=.75)items.push({cat:'Composition',level:'info',title:'Headline sits low in the layout',detail:'The largest text is at '+Math.round(cy*100)+'% of the height, after the eye has already scanned the top.',fix:'In feeds, lead with the key message in the upper half, or make it unmistakably larger than everything above it.',hl:[RC(head.c)],ref})}
  /* 5 cognitive load (Miller, Cowan, Hick) */
  const ref5='Miller (Harvard, 1956) and Cowan (2001) working-memory limits; Hick\'s law (1952)';
  if(body.length>9)items.push({cat:'Composition',level:'warn',title:body.length+' separate elements – high cognitive load',detail:'People hold only about 4–7 chunks at once; above that a social creative stops being read at a glance.',fix:'Group related items into 3–5 chunks (headline, support, visual, brand) or remove the least important.',hl:body.map(RC),ref:ref5});
  else if(body.length>=2&&body.length<=7)items.push({cat:'Composition',level:'pass',title:'Few, clearly chunked elements ('+body.length+')',detail:'Within the 4–7 chunk range people can take in at a glance.',ref:ref5});
  const tShare=textComps.reduce((s,c)=>s+c.area,0)/N;
  if(tShare>.4)items.push({cat:'Typography',level:'warn',title:'Text-heavy layout ('+Math.round(tShare*100)+'% of the area)',detail:'Dense copy competes with the visual and is rarely read in a feed.',fix:'Cut copy to a headline plus one supporting line; move detail to the caption.',hl:textComps.map(RC),ref:'Cognitive load theory (Sweller, 1988); picture superiority effect (Nelson, 1976)'});
  /* 6 smallest readable text (mobile legibility) */
  const tiny=tl.filter(x=>Math.min(...x.b.map(z=>z.h).filter(h=>h>=3))/W<.018&&Math.min(...x.b.map(z=>z.h).filter(h=>h>=3))>=3);
  if(tiny.length){const mn=Math.min(...tiny.flatMap(x=>x.b.map(z=>z.h)).filter(h=>h>=3));
    items.push({cat:'Typography',level:tiny.length>=2?'warn':'info',title:tiny.length>=2?tiny.length+' text blocks may be unreadable on a phone':'Smallest text may be hard to read on a phone',detail:'Its line height is about '+o(mn)+' px = '+(mn/W*100).toFixed(1)+'% of the width. Feeds are viewed at roughly 35% scale, so text under ~1.8% of the width drops below the 11–12 pt minimum used by Apple and Google.',fix:'Raise it to at least '+Math.ceil(W*.02/sc/2)*2+' px line height, or delete it if it is only a disclaimer.',hl:tiny.map(x=>RC(x.c)),ref:'Apple Human Interface Guidelines (11 pt); Google Material Design (12 sp)'})}}

/* ---------- brand assessment: compares the creative with everything stored for the client ---------- */
const _lm=new WeakMap();
function logoMean(img){if(_lm.has(img))return _lm.get(img);const iw=img.naturalWidth||0,ih=img.naturalHeight||0;let res=null;
  if(iw&&ih){const k=Math.min(1,96/Math.max(iw,ih)),w=Math.max(4,Math.round(iw*k)),h=Math.max(4,Math.round(ih*k)),c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,w,h);
    const d=x.getImageData(0,0,w,h).data;let r=0,g=0,b=0,n=0;for(let i=0;i<w*h;i++){if(d[i*4+3]>200){r+=d[i*4];g+=d[i*4+1];b+=d[i*4+2];n++}}if(n>10)res=[r/n,g/n,b/n]}
  _lm.set(img,res);return res}
function ringColour(S,b){const{W,H,d}=S,pad=Math.max(3,Math.round(Math.min(b.x1-b.x0,b.y1-b.y0)*.14)),rs=[],gs=[],bs=[];
  for(let y=Math.max(0,Math.floor(b.y0-pad));y<Math.min(H,Math.ceil(b.y1+pad));y++)for(let x=Math.max(0,Math.floor(b.x0-pad));x<Math.min(W,Math.ceil(b.x1+pad));x++){if(x>=b.x0&&x<b.x1&&y>=b.y0&&y<b.y1)continue;const q=(y*W+x)*4;rs.push(d[q]);gs.push(d[q+1]);bs.push(d[q+2])}
  return rs.length?[median(rs),median(gs),median(bs)]:null}
function lensBrandFit(brand,col,S,logoRes,logos,imgs,lockup,feat,items){
  const rules=brand.rules||{},lines=(rules.notes||'').split('\n').map(x=>x.replace(/^[•\-\s]+/,'').trim()).filter(Boolean),pal=brand.colors||[];
  /* what we compared against */
  const roles=[...new Set(pal.map(c=>c.role).filter(Boolean))],bookOn=!!(brand.book&&Object.values(brand.book).some(Boolean));
  const adher=col.clusters.filter(c=>['match','tint','neutral'].includes(c.status)).reduce((s,c)=>s+c.pct,0)/(col.clusters.reduce((s,c)=>s+c.pct,0)||1);
  const manual=lines.filter(l=>!/logo|colou?r|#[0-9a-f]{3,6}|gradient|clear space/i.test(l)).slice(0,4);
  items.push({cat:'Brand fit',level:'info',title:'Assessed against '+pal.length+' colours'+(roles.length?' ('+roles.join(', ')+')':'')+', '+logos.length+' logo files, '+(brand.fonts||[]).length+' fonts and '+lines.length+' written rules'+(bookOn?' + brand book':''),
    detail:(pal.length&&!col.photo?'Palette adherence: '+Math.round(adher*100)+'% of the visible colour area is on-brand (exact, tint or neutral). ':'')+(manual.length?'A picture cannot show these rules, so check them by eye: '+manual.map(l=>'“'+l+'”').join(' · '):'All stored rules could be checked from the picture.')+(bookOn?' The brand book PDF is attached but its text is not machine-read yet.':'')});
  /* palette roles: accents should stay accents */
  col.clusters.filter(c=>c.status==='match'&&c.rel&&c.rel.p&&/accent|highlight/i.test(c.rel.p.role||'')&&c.pct>.3).forEach(c=>
    items.push({cat:'Brand fit',level:'warn',title:c.rel.p.name+' is an accent colour but covers '+Math.round(c.pct*100)+'%',detail:'In this brand\'s palette it is set up as "'+c.rel.p.role+'", meant for highlights rather than large areas.',fix:'Use a Primary or Secondary colour for the large areas and keep '+c.rel.p.name+' under ~15%.',hlColor:c.hex}));
  /* logo variant vs its background */
  if(logoRes&&logoRes.boxOk&&logoRes.box&&logoRes.L&&lockup){
    const bg=ringColour(S,lockup),L=logoRes.L,m=imgs[L.id]&&logoMean(imgs[L.id]);
    if(bg&&m){const cr=contrastRatio(m,bg),hl=[RR_(S,lockup.x0,lockup.y0,lockup.x1,lockup.y1)];
      if(cr<3){const alt=logos.map(l=>({l,c:imgs[l.id]&&logoMean(imgs[l.id])?contrastRatio(logoMean(imgs[l.id]),bg):0})).filter(x=>x.l.id!==L.id).sort((a,b)=>b.c-a.c)[0];
        items.push({cat:'Logo',level:cr<2?'fail':'warn',title:'Logo variant blends into its background ('+cr.toFixed(1)+':1)',detail:'"'+L.name+'" has too little contrast with the area behind it, so the logo is hard to see.',fix:alt&&alt.c>=3?'Switch to "'+alt.l.name+'" ('+alt.c.toFixed(1)+':1 on this background).':'Place the logo on a lighter or darker area, or use a contrasting variant.',hl,ref:'WCAG 2.1 non-text contrast (3:1)'})}
      else items.push({cat:'Logo',level:'pass',title:'Right logo variant for this background ('+cr.toFixed(1)+':1)',detail:'"'+L.name+'" stands out clearly from the area behind it.',hl,ref:'WCAG 2.1 non-text contrast (3:1)'})}
    /* written logo rules, e.g. "Never place the logo on orange" */
    const bgLab=bg?rgb2lab(...bg):null,bad=[];let checked=0;
    lines.forEach(l=>{const t=l.toLowerCase();if(!/logo/.test(t)||!/\b(never|not|don'?t|do not|avoid|no)\b/.test(t))return;const mt=t.match(/\b(on|over|against|onto)\b\s+(?:a |an |the |any |busy |bright )?(red|orange|yellow|green|blue|purple|pink|black|white|grey|gray|photo\w*|busy|image\w*|gradient\w*)/);if(!mt)return;
      const w=mt[2].replace('gray','grey');checked++;let hit=false;
      if(/^(photo|busy|image)/.test(w))hit=!!S.photo;else if(/^gradient/.test(w))hit=!!feat.grad;else if(bgLab)hit=hueName(bgLab)===w;
      if(hit)bad.push(l)});
    bad.forEach(l=>items.push({cat:'Logo',level:'fail',title:'Brand rule broken: “'+l+'”',detail:'The area behind the logo matches what this rule forbids.',fix:'Move the logo to an allowed background or swap the variant.',hl:[RR_(S,lockup.x0,lockup.y0,lockup.x1,lockup.y1)]}));
    if(checked&&!bad.length)items.push({cat:'Logo',level:'pass',title:'Written logo rules respected ('+checked+' checked)',detail:'The background behind the logo does not break any "never place the logo on…" rule saved for this client.'})}}

/* ---------- click-to-locate overlay ---------- */
const lensClamp=h=>{const x0=Math.max(0,h.x),y0=Math.max(0,h.y),x1=Math.min(1,h.x+h.w),y1=Math.min(1,h.y+h.h);return x1>x0&&y1>y0?{...h,x:x0,y:y0,w:x1-x0,h:y1-y0}:null};
function lensOverlayHTML(r){
  const it=r.sel!=null?r.items[r.sel]:null,hl=((it&&it.hl)||[]).map(lensClamp).filter(Boolean),uid='m'+(r.uid||(r.uid=Math.random().toString(36).slice(2,8)));let s='';
  if(r.guides&&r.marks)r.marks.forEach(m=>{const d=m.dash?' stroke-dasharray="6 4"':'';if(m.t==='rect')s+=`<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" fill="${m.fill?m.c:'none'}" stroke="${m.c}" stroke-width="2"${d} vector-effect="non-scaling-stroke"/>`;else if(m.t==='vline')s+=`<line x1="${m.x}" y1="0" x2="${m.x}" y2="1" stroke="${m.c}" stroke-width="2" vector-effect="non-scaling-stroke"/>`});
  if(it&&hl.length){const col=k=>k==='ok'?'#22c55e':k==='ref'?'#ffffff':'#ff3b6b';
    s+=`<defs><mask id="${uid}"><rect width="1" height="1" fill="#fff"/>${hl.filter(h=>h.k!=='ref').map(h=>`<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" fill="#000"/>`).join('')}</mask></defs><rect width="1" height="1" fill="rgba(8,8,16,.58)" mask="url(#${uid})"/>`;
    hl.forEach(h=>{const c=col(h.k);s+=h.k==='ref'?`<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" fill="rgba(255,59,107,.28)" stroke="#fff" stroke-width="1.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`:`<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" fill="none" stroke="#fff" stroke-width="5" vector-effect="non-scaling-stroke"/><rect class="pulse" x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" fill="none" stroke="${c}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`})}
  else if(it&&!it.hlColor)s+='<rect class="pulse" width="1" height="1" fill="none" stroke="#ff3b6b" stroke-width="8" vector-effect="non-scaling-stroke"/>';
  return`<svg class="ov" viewBox="0 0 1 1" preserveAspectRatio="none">${s}</svg>`+(it&&it.mask?`<img class="ovmask" src="${it.mask}" alt="">`:'')}
function lensCapHTML(r){const it=r.sel!=null?r.items[r.sel]:null;
  if(!it)return'<span class="muted">Click any item on the right to see exactly where it is on the design.</span>';
  const where=it.hlColor?'Darkened areas are <b>not</b> this colour; the clear areas are where '+esc(it.hlColor)+' appears.':(it.hl&&it.hl.length?'Highlighted on the design. Dashed white areas show the required space.':'This applies to the whole design.');
  return`<b>${esc(it.cat)} · ${esc(it.title)}</b><br><span class="muted">${where}</span>${it.fix?`<br>→ ${esc(it.fix)}`:''}`}
function lensRedraw(card,r){const w=card.querySelector('.ovwrap'),c=card.querySelector('.cap');if(w)w.innerHTML=lensOverlayHTML(r);if(c)c.innerHTML=lensCapHTML(r)}
async function lensColourMask(url,hex){
  const img=await loadImg(url),c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
  const id=x.getImageData(0,0,c.width,c.height),d=id.data,t=labOfHex(hex),memo=new Map();
  for(let i=0;i<d.length;i+=4){const k=(d[i]>>3)<<10|(d[i+1]>>3)<<5|(d[i+2]>>3);let m=memo.get(k);if(m===undefined){m=dE(lab5(d[i],d[i+1],d[i+2]),t)<10;memo.set(k,m)}
    if(m)d[i+3]=0;else{d[i]=12;d[i+1]=12;d[i+2]=24;d[i+3]=170}}
  x.putImageData(id,0,0);return c.toDataURL('image/png')}
document.addEventListener('click',async e=>{
  const g=e.target.closest('[data-lg]');
  if(g){const r=ui.check.results[+g.dataset.lg];if(r){r.guides=g.checked;lensRedraw(g.closest('.res'),r)}return}
  const li=e.target.closest('[data-ls]');if(!li)return;
  const[ri,ii]=li.dataset.ls.split(':').map(Number),r=ui.check.results[ri];if(!r)return;
  r.sel=r.sel===ii?null:ii;const card=li.closest('.res');card.querySelectorAll('li.it.sel').forEach(x=>x.classList.remove('sel'));if(r.sel!=null)li.classList.add('sel');
  lensRedraw(card,r);
  const it=r.items[ii];if(r.sel===ii&&it.hlColor&&!it.mask){try{it.mask=await lensColourMask(r.thumb,it.hlColor)}catch{}if(r.sel===ii)lensRedraw(card,r)}});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('li.it[data-ls]')){e.preventDefault();e.target.click()}});

/* ---------- the knowledge the Lens is built on ---------- */
const LENS_PRINCIPLES=[
 {g:'Measured on every creative',t:'m',n:'WCAG 2.1 contrast & non-text contrast',s:'W3C',u:'Text must reach 4.5:1 (3:1 for large text); logos and graphics 3:1. Fix suggestions name a brand colour pairing that passes.'},
 {g:'Measured on every creative',t:'m',n:'Colour harmony: mono, analogous, complementary, triadic',s:'Itten (Bauhaus); Albers, Interaction of Color (Yale)',u:'Groups the hues found into families and names the relationship; warns when four or more unrelated hues compete.'},
 {g:'Measured on every creative',t:'m',n:'60-30-10 proportion & isolation effect',s:'Design practice heuristic; Von Restorff (1933)',u:'Checks there is a dominant colour and that the strongest colour stays a small accent so it pops.'},
 {g:'Measured on every creative',t:'m',n:'Feature integration & visual saliency',s:'Treisman & Gelade (1980); Itti, Koch & Niebur (1998); Wolfe, guided search (Harvard)',u:'Weighs each element by size × contrast and warns when two compete for the first glance.'},
 {g:'Measured on every creative',t:'m',n:'Gutenberg diagram & F-pattern reading',s:'Edmund Arnold; Nielsen Norman Group eye-tracking (2006)',u:'Checks the headline sits where the eye lands first (upper area, left bias).'},
 {g:'Measured on every creative',t:'m',n:'Working-memory limits & Hick\'s law',s:'Miller (Harvard, 1956); Cowan (2001); Hick (1952)',u:'Counts separate elements and flags layouts beyond ~7–9 chunks; flags text-heavy layouts.'},
 {g:'Measured on every creative',t:'m',n:'Gestalt: proximity, similarity, common region',s:'Wertheimer, Köhler, Koffka (Berlin school, 1920s)',u:'Alignment axes and vertical rhythm: related items must share edges and consistent gaps.'},
 {g:'Measured on every creative',t:'m',n:'Visual weight & balance',s:'Arnheim, Art and Visual Perception (Harvard, 1954)',u:'Finds the centre of mass of all content (logo excluded) and warns when it pulls hard to one side.'},
 {g:'Measured on every creative',t:'m',n:'Typographic hierarchy & modular scale',s:'Bringhurst; Müller-Brockmann (Swiss style)',u:'Detects text size levels; wants 2–4 levels with ≥1.3× steps and headline ≈2× body; checks leading.'},
 {g:'Measured on every creative',t:'m',n:'Mobile legibility minimums',s:'Apple HIG (11 pt); Google Material (12 sp)',u:'Warns when text is under ~1.8% of the width, since feeds display creatives at about a third of size.'},
 {g:'Measured on every creative',t:'m',n:'8-point spacing grid & safe margins',s:'Google Material; Apple HIG',u:'Suggests margins and gaps as multiples of 8 px, with margins of ~4.5% of the short side.'},
 {g:'Measured on every creative',t:'m',n:'Platform safe zones',s:'Meta, TikTok, YouTube Shorts guidelines',u:'Stories/Reels: keeps logo and text out of the top ~14% and bottom ~20%.'},
 {g:'Measured on every creative',t:'m',n:'Whitespace',s:'Swiss/International style; Lidwell et al., Universal Principles of Design',u:'Warns below ~15% open space (crowded) and above ~88% (too sparse to read at thumbnail size).'},
 {g:'Measured on every creative',t:'m',n:'Rule of thirds / golden ratio (heuristic only)',s:'J. T. Smith (1797); classical proportion',u:'Notes when the focal element lands on a power point. Evidence is mixed, so it never costs points.'},
 {g:'Measured on every creative',t:'m',n:'Logo exclusion zone, corner anchoring, equal margins',s:'Brand identity guideline practice',u:'Finds the logo, confirms it is the right variant for its background, anchors it to a corner with equal top/side margins and keeps other content out of its clear space. The logo is never treated as content.'},
 {g:'Used as advice in the style read',t:'g',n:'Fitts\'s law',s:'Fitts (1954)',u:'Buttons and CTAs should be large and near the end of the reading path.'},
 {g:'Used as advice in the style read',t:'g',n:'Aesthetic–usability effect',s:'Kurosu & Kashimura (Hitachi, 1995)',u:'People judge tidy, well-aligned work as more trustworthy – the reason alignment and spacing count.'},
 {g:'Used as advice in the style read',t:'g',n:'Image memorability',s:'Isola et al. (MIT, 2011); Borkin et al. (Harvard/MIT, 2013)',u:'Distinctive, human-centred visuals and a clear focal subject are remembered; generic stock is not.'},
 {g:'Used as advice in the style read',t:'g',n:'Laws of Simplicity',s:'John Maeda (MIT Media Lab)',u:'Reduce, organise, then emphasise – behind the "remove something" advice.'},
 {g:'Used as advice in the style read',t:'g',n:'Dual coding & picture superiority',s:'Paivio (1971); Nelson (1976)',u:'Pair one strong image with minimal text instead of explaining everything in words.'},
 {g:'Used as advice in the style read',t:'g',n:'Cognitive load theory',s:'Sweller (UNSW, 1988)',u:'Every extra element costs attention – one message per creative.'},
 {g:'Used as advice in the style read',t:'g',n:'Data-ink ratio',s:'Tufte (Yale)',u:'Decoration that carries no information should go.'},
 {g:'Used as advice in the style read',t:'g',n:'Design-system practice',s:'Google Material, Apple HIG, IBM Carbon, Atlassian, Microsoft Fluent',u:'Token-based spacing, type scales and contrast rules that the checks above follow.'}];
function lensKnowledgeHTML(){const gs=[...new Set(LENS_PRINCIPLES.map(p=>p.g))];
  return`<details class="kb"><summary><b>Design science inside the Lens</b> <span class="muted">(${LENS_PRINCIPLES.length} principles – ${LENS_PRINCIPLES.filter(p=>p.t==='m').length} measured automatically)</span></summary>
  ${gs.map(g=>`<div class="lcat">${esc(g)}</div><div class="kbl">${LENS_PRINCIPLES.filter(p=>p.g===g).map(p=>`<div><b>${esc(p.n)}</b><small>${esc(p.s)}</small><span>${esc(p.u)}</span></div>`).join('')}</div>`).join('')}
  <p class="muted" style="font-size:12px;margin-top:12px">Sources are recalled from the published literature and design-system documentation, not looked up live – verify a citation before quoting it outside the team. <b>Limits:</b> the Lens works from an exported image, so it cannot identify fonts, judge copy or tone, or fully judge photo-led layouts.</p></details>`}

/* ---------- logo verification & corner-mark detection ---------- */
/* colour-agnostic shape comparison between a region of the creative and a logo image (white/reversed versions still match) */
function logoShapeScore(canvas,box,img){
  const iw=img.naturalWidth,ih=img.naturalHeight;if(!iw||!ih||box.w<4||box.h<4)return 0;
  const w=64,h=Math.max(8,Math.min(160,Math.round(w*box.h/box.w))),pad=8,m=4,W2=w+2*pad,H2=h+2*pad,W3=W2+2*m,H3=H2+2*m;
  const tc=document.createElement('canvas');tc.width=W2;tc.height=H2;const tx=tc.getContext('2d',{willReadFrequently:true});tx.drawImage(img,pad,pad,w,h);
  const td=tx.getImageData(0,0,W2,H2).data,T=new Uint8Array(W2*H2);let opq=0,tn=0;
  for(let y=pad;y<pad+h;y++)for(let x=pad;x<pad+w;x++)if(td[(y*W2+x)*4+3]>250)opq++;
  const solid=opq>w*h*.97,c0=(pad*W2+pad)*4;
  for(let y=pad;y<pad+h;y++)for(let x=pad;x<pad+w;x++){const q=(y*W2+x)*4;const on=solid?(Math.abs(td[q]-td[c0])+Math.abs(td[q+1]-td[c0+1])+Math.abs(td[q+2]-td[c0+2]))>90:td[q+3]>128;if(on){T[y*W2+x]=1;tn++}}
  if(tn<10)return 0;
  const rc=document.createElement('canvas');rc.width=W3;rc.height=H3;const rx=rc.getContext('2d',{willReadFrequently:true});rx.fillStyle='#fff';rx.fillRect(0,0,W3,H3);
  rx.drawImage(canvas,box.x-(pad+m)*box.w/w,box.y-(pad+m)*box.h/h,W3*box.w/w,H3*box.h/h,0,0,W3,H3);
  const rd=rx.getImageData(0,0,W3,H3).data,ring=[[],[],[]];
  for(let y=0;y<H3;y++)for(let x=0;x<W3;x++){if(x<2||y<2||x>=W3-2||y>=H3-2){const q=(y*W3+x)*4;ring[0].push(rd[q]);ring[1].push(rd[q+1]);ring[2].push(rd[q+2])}}
  const bg=ring.map(median),R=new Uint8Array(W3*H3);
  for(let i=0;i<W3*H3;i++){const q=i*4;if(Math.abs(rd[q]-bg[0])+Math.abs(rd[q+1]-bg[1])+Math.abs(rd[q+2]-bg[2])>60)R[i]=1}
  const blur=(a,W,H)=>{const o=new Float32Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let t=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<W&&yy<H){t+=a[yy*W+xx];n++}}o[y*W+x]=t/n}return o},TB=blur(T,W2,H2),RB=blur(R,W3,H3);
  let best=-1;
  for(let sy=-m;sy<=m;sy++)for(let sx=-m;sx<=m;sx++){let sT=0,sR=0,sTT=0,sRR=0,sTR=0,n=0;
    for(let y=pad;y<pad+h;y++)for(let x=pad;x<pad+w;x++){const a=TB[y*W2+x],b=RB[(y+m+sy)*W3+x+m+sx];sT+=a;sR+=b;sTT+=a*a;sRR+=b*b;sTR+=a*b;n++}
    const den=(n*sTT-sT*sT)*(n*sRR-sR*sR);if(den<=1e-9)continue;const r=(n*sTR-sT*sR)/Math.sqrt(den);if(r>best)best=r}
  return Math.max(0,best)}
/* a compact, self-contained mark sitting in a corner of the creative = probable logo (works on coloured header bands too) */
function cornerMark(S){
  if(S.photo)return null;
  const{W,H,d,sc}=S,ww=Math.round(W*.4),hh=Math.round(H*.14);let best=null;
  for(const[wx,wy,v,h]of[[0,0,'top','left'],[W-ww,0,'top','right'],[0,H-hh,'bottom','left'],[W-ww,H-hh,'bottom','right']]){
    const hist=new Map();for(let y=0;y<hh;y++)for(let x=0;x<ww;x++){const q=((wy+y)*W+wx+x)*4,k=(d[q]>>4)<<8|(d[q+1]>>4)<<4|(d[q+2]>>4);let e=hist.get(k);if(!e){e={n:0,r:0,g:0,b:0};hist.set(k,e)}e.n++;e.r+=d[q];e.g+=d[q+1];e.b+=d[q+2]}
    const dom=[...hist.values()].sort((a,b)=>b.n-a.n)[0],bg=[dom.r/dom.n,dom.g/dom.n,dom.b/dom.n],m=new Uint8Array(ww*hh);let cnt=0;
    for(let y=0;y<hh;y++)for(let x=0;x<ww;x++){const q=((wy+y)*W+wx+x)*4;if(Math.abs(d[q]-bg[0])+Math.abs(d[q+1]-bg[1])+Math.abs(d[q+2]-bg[2])>70){m[y*ww+x]=1;cnt++}}
    if(cnt<25||cnt>ww*hh*.45)continue;
    const comps=labelComps(dilate(m,ww,hh,Math.max(2,Math.round(ww*.025)),Math.max(2,Math.round(hh*.05))),ww,hh);let x0=ww,y0=hh,x1=-1,y1=-1,ink=0;
    for(const cp of comps){let a0=ww,b0=hh,a1=-1,b1=-1,ci=0;for(const p of cp.pix){if(!m[p])continue;const px=p%ww,py=(p-px)/ww;if(px<a0)a0=px;if(px>a1)a1=px;if(py<b0)b0=py;if(py>b1)b1=py;ci++}
      if(ci<12)continue;if((h==='left'?a1>=ww-2:a0<=1)||(v==='top'?b1>=hh-2:b0<=1))continue;
      x0=Math.min(x0,a0);y0=Math.min(y0,b0);x1=Math.max(x1,a1);y1=Math.max(y1,b1);ink+=ci}
    if(x1<0)continue;const bw=x1-x0+1,bh=y1-y0+1;if(bw>W*.38||bw<W*.03||bh<H*.006)continue;
    if(!best||ink>best.ink)best={ink,where:v+'-'+h,box:{x:(wx+x0)/sc,y:(wy+y0)/sc,w:bw/sc,h:bh/sc}}}
  return best}
/* is this creative actually another client's? (chromatic area explained by each palette) */
function lensPaletteFit(col,brand){const pal=(brand.colors||[]).map(c=>{const lab=labOfHex(c.hex);return{...c,rgb:hexToRgb(c.hex),lab,chroma:Math.hypot(lab[1],lab[2])}});if(pal.length<2)return null;
  const tol=+(brand.rules||{}).tol||6;let a=0,t=0;for(const c of col.clusters){if(Math.hypot(c.lab[1],c.lab[2])<14||c.lab[0]>90||c.lab[0]<12)continue;t+=c.pct;const r=relateColour(c,pal,tol,false);if((r.kind==='match'||r.kind==='tint'||r.kind==='near')&&!r.loose)a+=c.pct}
  return t>=.12?a/t:null}
function lensClientMismatch(brand,col,items){
  const mine=lensPaletteFit(col,brand);if(mine==null||mine>.3)return;
  const rel=b=>b.id===brand.id||b.parent===brand.id||b.id===brand.parent||(b.parent&&b.parent===brand.parent),best=S.brands.filter(b=>!rel(b)).map(b=>({b,f:lensPaletteFit(col,b)})).filter(x=>x.f!=null).sort((a,b)=>b.f-a.f)[0];
  if(best&&best.f>=.7&&best.f-mine>=.45)items.push({cat:'Brand fit',level:'fail',title:'This looks like a '+best.b.name+' creative, not '+brand.name,detail:'Only '+Math.round(mine*100)+'% of its coloured area belongs to '+brand.name+'\'s palette, but '+Math.round(best.f*100)+'% matches '+best.b.name+'. The rest of this report compares it with the wrong brand.',fix:'Switch the Client dropdown to '+best.b.name+' and run the check again.'})}
