/* LatchHub – PDF tools (run in the browser, nothing leaves the computer):
   - PDFT.compress(file)      shrinks a heavy PDF to a sensible size
   - PDFT.extractLogos(file)  finds vector logos in a PDF and returns each as SVG + PDF (PNG/JPG come from the normal logo converter)  */
const PDFT=(()=>{
const f2=n=>String(Math.round(n*100)/100),u8=s=>new TextEncoder().encode(s);
const mul=(A,B)=>[A[0]*B[0]+A[1]*B[2],A[0]*B[1]+A[1]*B[3],A[2]*B[0]+A[3]*B[2],A[2]*B[1]+A[3]*B[3],A[4]*B[0]+A[5]*B[2]+B[4],A[4]*B[1]+A[5]*B[3]+B[5]];
const ap=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const hex3=c=>'#'+[c[0],c[1],c[2]].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const hexRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const inter=(a,b)=>a[0]<=b[2]&&b[0]<=a[2]&&a[1]<=b[3]&&b[1]<=a[3];
const gap=(a,b)=>Math.hypot(Math.max(0,a[0]-b[2],b[0]-a[2]),Math.max(0,a[1]-b[3],b[1]-a[3]));
const area=b=>Math.max(0,b[2]-b[0])*Math.max(0,b[3]-b[1]);

/* ---------- a tiny PDF writer (images per page, or vector content) ---------- */
class PdfW{
  constructor(){this.parts=[];this.pos=0;this.off=[];this.pages=[];this.add(u8('%PDF-1.5\n%'),new Uint8Array([0xE2,0xE3,0xCF,0xD3,10]))}
  add(...bs){for(const b of bs){this.parts.push(b);this.pos+=b.length}}
  obj(n,dict,stream){this.off[n]=this.pos;this.add(u8(n+' 0 obj\n'));
    if(stream)this.add(u8('<< '+dict+' /Length '+stream.length+' >>\nstream\n'),stream,u8('\nendstream\n'));else this.add(u8('<< '+dict+' >>\n'));
    this.add(u8('endobj\n'))}
  /* one page whose whole area is a JPEG */
  imagePage(w,h,jpeg,pw,ph){const n=3+this.pages.length*3;this.pages.push(n);
    this.obj(n,`/Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(w)} ${f2(h)}] /Contents ${n+1} 0 R /Resources << /XObject << /Im0 ${n+2} 0 R >> >>`);
    this.obj(n+1,'',u8(`q ${f2(w)} 0 0 ${f2(h)} 0 0 cm /Im0 Do Q`));
    this.obj(n+2,`/Type /XObject /Subtype /Image /Width ${pw} /Height ${ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,jpeg)}
  /* one page drawn with vector operators */
  vectorPage(w,h,content){const n=3+this.pages.length*3;this.pages.push(n);
    this.obj(n,`/Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(w)} ${f2(h)}] /Contents ${n+1} 0 R /Resources << >>`);
    this.obj(n+1,'',u8(content))}
  finish(title){
    const last=3+this.pages.length*3;
    this.obj(1,'/Type /Catalog /Pages 2 0 R');
    this.obj(2,`/Type /Pages /Kids [${this.pages.map(n=>n+' 0 R').join(' ')}] /Count ${this.pages.length}`);
    const info=last;this.obj(info,'/Producer (LatchHub)'+(title?' /Title ('+title.replace(/[()\\]/g,'')+')':''));
    const xs=this.pos;let x='xref\n0 '+(info+1)+'\n0000000000 65535 f \n';
    for(let i=1;i<=info;i++)x+=String(this.off[i]??0).padStart(10,'0')+' 00000 n \n';
    this.add(u8(x+'trailer\n<< /Size '+(info+1)+' /Root 1 0 R /Info '+info+' 0 R >>\nstartxref\n'+xs+'\n%%EOF\n'));
    return new Blob(this.parts,{type:'application/pdf'})}
}

/* ---------- compression ---------- */
const canvasOf=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c};
const toJpeg=(cv,q)=>new Promise(r=>cv.toBlob(b=>r(b),'image/jpeg',q));
/* Re-draws every page as a compressed picture. Big brand books drop from tens of MB to a few MB; text stays readable but is no longer selectable. */
async function compress(file,opt={}){
  const min=opt.min||3e6,target=opt.target||12e6,prog=opt.prog||(()=>{});
  if(file.size<min)return{file,skipped:'already small'};
  const lib=await loadPdfjs(),pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,N=pdf.numPages;
  let best=null;
  for(const[dpi,q]of[[150,.75],[120,.66],[96,.58]]){
    const w=new PdfW();
    for(let i=1;i<=N;i++){
      prog('Compressing PDF… page '+i+' of '+N+(best?' (extra pass)':''));await new Promise(r=>setTimeout(r,0));
      const pg=await pdf.getPage(i),v0=pg.getViewport({scale:1});
      let sc=dpi/72;const mx=Math.max(v0.width,v0.height)*sc;if(mx>3800)sc*=3800/mx;
      const vp=pg.getViewport({scale:sc}),cv=canvasOf(vp.width,vp.height),ctx=cv.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);
      await pg.render({canvasContext:ctx,viewport:vp}).promise;
      const blob=await toJpeg(cv,q);w.imagePage(v0.width,v0.height,new Uint8Array(await blob.arrayBuffer()),cv.width,cv.height);cv.width=cv.height=1;pg.cleanup()}
    const out=w.finish((file.name||'').replace(/\.pdf$/i,''));
    if(!best||out.size<best.size)best=out;
    if(out.size<=target)break}
  pdf.destroy();
  if(!best||best.size>file.size*.85)return{file,skipped:'no real saving'};
  return{file:new File([best],file.name,{type:'application/pdf'}),before:file.size,after:best.size}}

/* ---------- vector items of a page ---------- */
async function pageItems(pg,OPS){
  const ol=await pg.getOperatorList(),fn=ol.fnArray,ar=ol.argsArray,items=[],imgs=[],flags={};
  let ctm=[1,0,0,1,0,0],fill='#000000',stroke='#000000',lw=1,fillPat=false,clip=null,pendClip=false,path=[],cur=[0,0];const stack=[];
  const bboxOf=segs=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const s of segs)for(let i=1;i<s.length;i+=2){if(s[i]<x0)x0=s[i];if(s[i]>x1)x1=s[i];if(s[i+1]<y0)y0=s[i+1];if(s[i+1]>y1)y1=s[i+1]}return[x0,y0,x1,y1]};
  const isRect=segs=>segs.length>=4&&segs.length<=6&&segs.every(s=>s[0]==='M'||s[0]==='L'||s[0]==='Z')&&segs.filter(s=>s[0]!=='Z').length<=5&&(()=>{const p=segs.filter(s=>s[0]!=='Z');return p.every((s,i)=>i===0||Math.abs(s[1]-p[i-1][1])<.01||Math.abs(s[2]-p[i-1][2])<.01)})();
  const scale=()=>Math.sqrt(Math.abs(ctm[0]*ctm[3]-ctm[1]*ctm[2]));
  const col=a=>hex3([a[0],a[1],a[2]]);
  const doPath=(args)=>{const o=args[0],c=args[1];let k=0;const P=(x,y)=>ap(ctm,x,y);
    for(const op of o){
      if(op===OPS.moveTo){const p=P(c[k],c[k+1]);k+=2;path.push(['M',...p]);cur=p}
      else if(op===OPS.lineTo){const p=P(c[k],c[k+1]);k+=2;path.push(['L',...p]);cur=p}
      else if(op===OPS.curveTo){const a=P(c[k],c[k+1]),b=P(c[k+2],c[k+3]),e=P(c[k+4],c[k+5]);k+=6;path.push(['C',...a,...b,...e]);cur=e}
      else if(op===OPS.curveTo2){const b=P(c[k],c[k+1]),e=P(c[k+2],c[k+3]);k+=4;path.push(['C',...cur,...b,...e]);cur=e}
      else if(op===OPS.curveTo3){const a=P(c[k],c[k+1]),e=P(c[k+2],c[k+3]);k+=4;path.push(['C',...a,...e,...e]);cur=e}
      else if(op===OPS.closePath)path.push(['Z']);
      else if(op===OPS.rectangle){const x=c[k],y=c[k+1],w=c[k+2],h=c[k+3];k+=4;const a=P(x,y),b=P(x+w,y),d=P(x+w,y+h),e=P(x,y+h);path.push(['M',...a],['L',...b],['L',...d],['L',...e],['Z']);cur=a}}};
  const paint=(f,s,eo,close)=>{
    if(close&&path.length)path.push(['Z']);
    if(path.length){
      const bb=bboxOf(path.filter(p=>p.length>1));
      if(!(clip&&!inter(bb,clip))&&items.length<30000)items.push({segs:path,bb,fill:f?fill:null,stroke:s?stroke:null,lw:lw*scale(),eo,pat:!!(f&&fillPat),rect:isRect(path)});
    }
    path=[]};
  const end=()=>{if(pendClip&&path.length&&isRect(path)){const bb=bboxOf(path.filter(p=>p.length>1));clip=clip?[Math.max(clip[0],bb[0]),Math.max(clip[1],bb[1]),Math.min(clip[2],bb[2]),Math.min(clip[3],bb[3])]:bb}pendClip=false;path=[]};
  for(let i=0;i<fn.length;i++){
    const op=fn[i],a=ar[i];
    switch(op){
      case OPS.save:stack.push({ctm:ctm.slice(),fill,stroke,lw,fillPat,clip:clip&&clip.slice()});break;
      case OPS.restore:{const s=stack.pop();if(s){ctm=s.ctm;fill=s.fill;stroke=s.stroke;lw=s.lw;fillPat=s.fillPat;clip=s.clip}break}
      case OPS.transform:ctm=mul(a,ctm);break;
      case OPS.paintFormXObjectBegin:stack.push({ctm:ctm.slice(),fill,stroke,lw,fillPat,clip:clip&&clip.slice()});if(a&&a[0])ctm=mul(a[0],ctm);break;
      case OPS.paintFormXObjectEnd:{const s=stack.pop();if(s){ctm=s.ctm;fill=s.fill;stroke=s.stroke;lw=s.lw;fillPat=s.fillPat;clip=s.clip}break}
      case OPS.setFillRGBColor:fill=col(a);fillPat=false;break;
      case OPS.setStrokeRGBColor:stroke=col(a);break;
      case OPS.setLineWidth:lw=a[0];break;
      case OPS.setFillColorN:case OPS.setFillColorSpace:
        if(a&&a[0]==='RadialAxial'){fillPat=true;flags.gradient=true;const st=a[3];if(st&&st.length){const m=st[Math.floor(st.length/2)];if(m&&typeof m[1]==='string'&&/^#/.test(m[1]))fill=m[1]}}
        else if(a&&a[0]&&typeof a[0]==='string'&&a[0]!==''){fillPat=true;flags.pattern=true}
        break;
      case OPS.shadingFill:flags.gradient=true;break;
      case OPS.setGState:if(a&&a[0])for(const g of a[0]){if((g[0]==='ca'||g[0]==='CA')&&g[1]<1)flags.alpha=true;if(g[0]==='SMask'&&g[1])flags.mask=true}break;
      case OPS.constructPath:doPath(a);break;
      case OPS.fill:paint(true,false,false);break;
      case OPS.eoFill:paint(true,false,true);break;
      case OPS.stroke:paint(false,true,false);break;
      case OPS.closeStroke:paint(false,true,false,true);break;
      case OPS.fillStroke:paint(true,true,false);break;
      case OPS.eoFillStroke:paint(true,true,true);break;
      case OPS.closeFillStroke:paint(true,true,false,true);break;
      case OPS.closeEOFillStroke:paint(true,true,true,true);break;
      case OPS.endPath:end();break;
      case OPS.clip:case OPS.eoClip:pendClip=true;break;
      case OPS.paintImageXObject:case OPS.paintInlineImageXObject:case OPS.paintImageMaskXObject:{const p=[ap(ctm,0,0),ap(ctm,1,0),ap(ctm,1,1),ap(ctm,0,1)];imgs.push([Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))]);break}
    }}
  return{items,imgs,flags}}

/* ---------- grouping items into logo candidates ---------- */
function groupItems(items,W,H){
  const n=items.length,par=new Int32Array(n).map((_,i)=>i),find=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x]}return x},uni=(a,b)=>{a=find(a);b=find(b);if(a!==b)par[a]=b};
  const M=Math.max(W,H),eps=M*.004,cell=M/40,grid=new Map();
  for(let i=0;i<n;i++){const b=items[i].bb,x0=Math.floor((b[0]-eps)/cell),x1=Math.floor((b[2]+eps)/cell),y0=Math.floor((b[1]-eps)/cell),y1=Math.floor((b[3]+eps)/cell);
    if((x1-x0+1)*(y1-y0+1)>400)continue;
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const k=x+','+y;let l=grid.get(k);if(!l){l=[];grid.set(k,l)}for(const j of l){const c=items[j].bb;if(b[0]-eps<=c[2]&&c[0]-eps<=b[2]&&b[1]-eps<=c[3]&&c[1]-eps<=b[3])uni(i,j)}l.push(i)}}
  let cl=new Map();for(let i=0;i<n;i++){const r=find(i);if(!cl.has(r))cl.set(r,[]);cl.get(r).push(i)}
  let groups=[...cl.values()].map(ix=>({ix,bb:ix.reduce((b,i)=>{const t=items[i].bb;return[Math.min(b[0],t[0]),Math.min(b[1],t[1]),Math.max(b[2],t[2]),Math.max(b[3],t[3])]},[1e9,1e9,-1e9,-1e9])}));
  /* second pass: parts of one lockup (symbol + wordmark, letters with wide tracking) sit close compared with their own size */
  for(let pass=0;pass<6&&groups.length<2500;pass++){
    const m=groups.length,p2=new Int32Array(m).map((_,i)=>i),f2_=x=>{while(p2[x]!==x){p2[x]=p2[p2[x]];x=p2[x]}return x};let merged=false;
    const dim=g=>Math.max(g.bb[2]-g.bb[0],g.bb[3]-g.bb[1]);
    for(let a=0;a<m;a++)for(let b=a+1;b<m;b++){const A=groups[a],B=groups[b],g=gap(A.bb,B.bb);
      if(g<=Math.min(.3*Math.min(dim(A),dim(B)),M*.04)){const ra=f2_(a),rb=f2_(b);if(ra!==rb){p2[ra]=rb;merged=true}}}
    if(!merged)break;
    const nm=new Map();for(let i=0;i<m;i++){const r=f2_(i);if(!nm.has(r))nm.set(r,[]);nm.get(r).push(groups[i])}
    groups=[...nm.values()].map(gs=>({ix:gs.flatMap(g=>g.ix),bb:gs.reduce((b,g)=>[Math.min(b[0],g.bb[0]),Math.min(b[1],g.bb[1]),Math.max(b[2],g.bb[2]),Math.max(b[3],g.bb[3])],[1e9,1e9,-1e9,-1e9])}))}
  return groups}

/* ---------- SVG and vector-PDF output ---------- */
function svgOf(its,bb){
  const w=bb[2]-bb[0],h=bb[3]-bb[1],X=x=>f2(x-bb[0]),Y=y=>f2(bb[3]-y);
  const ps=its.map(it=>{let d='';for(const s of it.segs){if(s[0]==='M')d+='M'+X(s[1])+' '+Y(s[2]);else if(s[0]==='L')d+='L'+X(s[1])+' '+Y(s[2]);else if(s[0]==='C')d+='C'+X(s[1])+' '+Y(s[2])+' '+X(s[3])+' '+Y(s[4])+' '+X(s[5])+' '+Y(s[6]);else d+='Z'}
    return `<path d="${d}" fill="${it.fill||'none'}"${it.fill&&it.eo?' fill-rule="evenodd"':''}${it.stroke?` stroke="${it.stroke}" stroke-width="${f2(Math.max(.01,it.lw))}"`:''}/>`}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f2(w)} ${f2(h)}" width="${f2(w)}" height="${f2(h)}">${ps}</svg>`}
function pdfOf(its,bb){
  const w=bb[2]-bb[0],h=bb[3]-bb[1],X=x=>f2(x-bb[0]),Y=y=>f2(y-bb[1]);let c='';
  for(const it of its){
    if(it.fill){const r=hexRgb(it.fill);c+=`${f2(r[0])} ${f2(r[1])} ${f2(r[2])} rg\n`}
    if(it.stroke){const r=hexRgb(it.stroke);c+=`${f2(r[0])} ${f2(r[1])} ${f2(r[2])} RG ${f2(Math.max(.01,it.lw))} w\n`}
    for(const s of it.segs){if(s[0]==='M')c+=X(s[1])+' '+Y(s[2])+' m\n';else if(s[0]==='L')c+=X(s[1])+' '+Y(s[2])+' l\n';else if(s[0]==='C')c+=X(s[1])+' '+Y(s[2])+' '+X(s[3])+' '+Y(s[4])+' '+X(s[5])+' '+Y(s[6])+' c\n';else c+='h\n'}
    c+=(it.fill&&it.stroke?(it.eo?'B*':'B'):it.fill?(it.eo?'f*':'f'):it.stroke?'S':'n')+'\n'}
  const wr=new PdfW();wr.vectorPage(w,h,c);return wr.finish('Logo')}

/* ---------- logo candidates ---------- */
const svgImg=svg=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('svg'));i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});
async function maskOf(svg){
  try{const im=await svgImg(svg),S=40,k=S/Math.max(im.naturalWidth||1,im.naturalHeight||1),c=canvasOf(S,S),x=c.getContext('2d');x.drawImage(im,0,0,(im.naturalWidth||1)*k,(im.naturalHeight||1)*k);
    const d=x.getImageData(0,0,S,S).data,m=new Uint8Array(S*S);for(let i=0;i<S*S;i++)m[i]=d[i*4+3]>40?1:0;return m}catch{return null}}
const iou=(a,b)=>{let i=0,u=0;for(let k=0;k<a.length;k++){if(a[k]&&b[k])i++;if(a[k]||b[k])u++}return u?i/u:0};
const lum=h=>{const r=hexRgb(h);return(.299*r[0]+.587*r[1]+.114*r[2])*255};
function colourClass(cols){if(!cols.length)return'Black';if(cols.every(c=>lum(c)>235))return'White';if(cols.every(c=>lum(c)<45))return'Black';return'Full colour'}
const LOGO_WORDS=/logo|brand ?mark|logotype|logo ?type|wordmark|word ?mark|lock-?up|symbol|emblem|monogram|primary mark/i;

/* returns [{svg, pdf(Blob), page, w, h, colors, notes, faithful, group, cls, score}] best first */
async function extractLogos(file,opt={}){
  const prog=opt.prog||(()=>{}),maxPages=opt.maxPages||60,single=!!opt.single;
  const lib=await loadPdfjs(),OPS=lib.OPS,pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,N=Math.min(pdf.numPages,maxPages),found=[];
  for(let p=1;p<=N;p++){
    prog('Looking for logos… page '+p+' of '+N);await new Promise(r=>setTimeout(r,0));
    const pg=await pdf.getPage(p),vw=pg.view,W=vw[2]-vw[0],H=vw[3]-vw[1];
    let data;try{data=await pageItems(pg,OPS)}catch{pg.cleanup();continue}
    const pageArea=W*H,tc=await pg.getTextContent().catch(()=>({items:[]})),txt=tc.items.map(t=>t.str).join(' '),hint=LOGO_WORDS.test(txt);
    const words=tc.items.filter(t=>t.str&&t.str.trim()).map(t=>[t.transform[4],t.transform[5],t.transform[4]+(t.width||0),t.transform[5]+(t.height||t.transform[3]||10),t.str.length]);
    /* page furniture (backgrounds, panels, hairlines) is not a logo */
    const its=data.items.filter(it=>area(it.bb)<pageArea*.4&&!(it.stroke&&!it.fill&&Math.min(it.bb[2]-it.bb[0],it.bb[3]-it.bb[1])<.4));
    if(!its.length){pg.cleanup();continue}
    const groups=groupItems(its,W,H);
    for(const g of groups){
      const gi=g.ix.map(i=>its[i]),w=g.bb[2]-g.bb[0],h=g.bb[3]-g.bb[1],M=Math.max(W,H);
      if(Math.max(w,h)<M*.03||area(g.bb)>pageArea*.8||w<=0||h<=0)continue;
      const asp=w/h;if(asp>9||asp<.25)continue;                       // slivers and rules, not logos
      const nseg=gi.reduce((s,i)=>s+i.segs.length,0);if(nseg<8)continue;
      if(gi.every(i=>i.rect))continue;                                   // boxes and swatches
      const cols=[...new Set(gi.flatMap(i=>[i.fill,i.stroke]).filter(Boolean))];if(cols.length>7)continue;
      /* a layout, mock-up or colour panel set is not a logo: several big flat panels, or many strong colours */
      const ga=area(g.bb),bigRects=gi.filter(i=>i.rect&&i.fill&&area(i.bb)>ga*.3).length;if(bigRects>=2)continue;
      const byCol={};gi.forEach(i=>{if(i.fill)byCol[i.fill]=(byCol[i.fill]||0)+area(i.bb)});const tot=Object.values(byCol).reduce((a,b)=>a+b,0)||1,major=Object.values(byCol).filter(v=>v>=tot*.12).length;
      if(major>4)continue;
      const liveText=words.filter(t=>{const cx=(t[0]+t[2])/2,cy=(t[1]+t[3])/2;return cx>=g.bb[0]&&cx<=g.bb[2]&&cy>=g.bb[1]&&cy<=g.bb[3]}).reduce((s,t)=>s+t[4],0);
      const photo=data.imgs.some(b=>inter(b,g.bb)&&area([Math.max(b[0],g.bb[0]),Math.max(b[1],g.bb[1]),Math.min(b[2],g.bb[2]),Math.min(b[3],g.bb[3])])>area(g.bb)*.3);
      const notes=[];if(liveText>0)notes.push('contains live (non-outlined) text – some letters may be missing');if(gi.some(i=>i.pat))notes.push('gradient fill approximated by one colour');if(photo)notes.push('overlaps a photo');
      const score=Math.pow(area(g.bb)/pageArea,.3)*(1+Math.min(nseg,300)/150)*(hint?1.8:1)*(cols.length<=3?1.3:1)*(major<=2?1.2:1)*(liveText>0?.5:1)*(photo?.5:1);
      found.push({gi,bb:g.bb,page:p,w,h,nseg,cols,notes,score,major,hint,faithful:!notes.length})}
    pg.cleanup()}
  pdf.destroy();
  found.sort((a,b)=>b.score-a.score);
  /* in a single-logo file just the biggest group counts */
  let cands=single?found.slice(0,1):found.slice(0,24),out=[];
  for(const c of cands){
    const svg=svgOf(c.gi,c.bb),mask=await maskOf(svg);if(!mask||!mask.some(Boolean))continue;
    const cls=colourClass(c.cols);
    if(out.some(o=>Math.abs(Math.log(o.w/o.h/(c.w/c.h)))<.18&&o.mask&&iou(o.mask,mask)>.88&&(o.cls===cls)))continue;     // the same logo again
    out.push({...c,svg,mask,cls});if(out.length>=(single?1:12))break}
  /* name shapes: wide → primary logo, squarish → symbol */
  return out.map((o,i)=>({svg:o.svg,pdf:pdfOf(o.gi,o.bb),page:o.page,w:o.w,h:o.h,colors:o.cols,notes:o.notes,faithful:o.faithful,cls:o.cls,score:o.score,hint:o.hint,confident:o.faithful&&o.cols.length<=4&&o.major<=3&&o.nseg>=15,group:o.w/o.h>2.2?'Primary logo':(o.w/o.h>.75&&o.w/o.h<1.35?'Icon / symbol':'Primary logo')}))}

return{compress,extractLogos,PdfW}})();

/* ---------- glue to the rest of the app ---------- */
const _du=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(b)});
/* a logo record the way brands store it: SVG + PNG + JPG + square versions + vector PDF */
function logoEntry(l,bs){
  const base=`${bs}_${slug2(l.group)}_${slug2(l.name)}`,F=[];
  if(l.svg)F.push({label:'SVG',url:l.svg,filename:base+'.svg'});
  F.push({label:'PNG',url:l.png,filename:base+'.png'},{label:'JPG',url:l.jpg,filename:base+'.jpg'},{label:'Square PNG',url:l.sqpng,filename:base+'_square.png'},{label:'Square JPG',url:l.sqjpg,filename:base+'_square.jpg'});
  if(l.source&&/^(pdf|ai)$/.test(l.ext))F.push({label:l.ext.toUpperCase()+' (source)',url:l.source,filename:base+'.'+l.ext});
  return{id:uid(),name:l.name,group:l.group,filename:base,preview:l.preview,formats:F,w:l.w,h:l.h}}
/* the vector logos found in a brand-book PDF, converted: [{...processLogo result, svg, source(vector pdf)}] */
async function logosFromPdf(file,prog){
  const found=await PDFT.extractLogos(file,{prog}),anyHint=found.some(x=>x.hint),pick=found.filter(x=>x.confident&&(!anyHint||x.hint)).slice(0,8),out=[];let n=0;
  for(const x of pick){n++;
    try{const l=await processLogo(new File([x.svg],'logo-'+n+'.svg',{type:'image/svg+xml'}));
      l.group=x.group;l.name=l.name+' – page '+x.page;l.source=await _du(x.pdf);l.ext='pdf';l.fromPdf=true;out.push(l)}catch{}}
  return{logos:out,found:found.length}}
/* SVG of a single-logo PDF when it is real vector artwork (otherwise null) */
async function vectorSvgOf(file){try{const v=await PDFT.extractLogos(file,{single:true});return v[0]&&v[0].faithful?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(v[0].svg):null}catch{return null}}
const _mb=n=>(n/1048576).toFixed(1)+' MB';
/* a PDF dropped onto an existing client: a brand book (compress it, pull out its logos) or a single logo file */
async function addPdfToBrand(b,file,prog){
  let pages=1;try{pages=await pdfPages(file)}catch{}
  const bs=slug2(b.name);b.logos=b.logos||[];
  if(!(pages>=4||file.size>2.5e6)){const l=await processLogo(file);const s=await vectorSvgOf(file);if(s)l.svg=s;b.logos.push(logoEntry(l,bs));return 'Logo added'+(s?' (with SVG)':'')}
  const r=await logosFromPdf(file,prog);r.logos.forEach(l=>b.logos.push(logoEntry(l,bs)));
  const c=await PDFT.compress(file,{prog}),f=c.file,key='blob:'+uid();await DB.set(key,f);
  b.book={title:guessName(file.name)+' brand book',blobKey:key,filename:bs+'_brand-book.pdf',mb:Math.round(f.size/104857.6)/10,pages};
  return 'Brand book added – '+r.logos.length+' logo'+(r.logos.length===1?'':'s')+' found'+(c.after?' · PDF '+_mb(c.before)+' → '+_mb(c.after):'')}
