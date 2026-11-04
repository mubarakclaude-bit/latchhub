/* LatchHub – automatic white (reversed) and greyscale versions of a vector logo.
   White: the coloured parts become white and the parts that were white become see-through cut-outs (done with an SVG mask),
   so a logo with a white bolt on a red box stays readable on a dark background. Greyscale: every colour becomes its grey equivalent. */
const LOGOV=(()=>{
const cx=document.createElement('canvas').getContext('2d');
/* any CSS colour -> [r,g,b,a] or null (none, url(), currentColor, unknown) */
const rgba=s=>{
  s=String(s||'').trim();if(!s||/^(none|transparent|currentcolor|inherit|initial|unset)$/i.test(s)||/^url\(/i.test(s))return null;
  cx.fillStyle='#010203';cx.fillStyle=s;const a=cx.fillStyle;cx.fillStyle='#fefdfc';cx.fillStyle=s;const b=cx.fillStyle;
  if(a!==b)return null;                                   // not a colour the browser understands
  if(a[0]==='#')return[1,3,5].map(i=>parseInt(a.slice(i,i+2),16)).concat(1);
  const m=a.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x));return[p[0],p[1],p[2],p.length>3?p[3]:1]};
const lum=c=>.299*c[0]+.587*c[1]+.114*c[2];
const isWhite=c=>lum(c)>=235&&Math.max(c[0],c[1],c[2])-Math.min(c[0],c[1],c[2])<22;
const isNeutral=c=>Math.max(c[0],c[1],c[2])-Math.min(c[0],c[1],c[2])<14;
const css=(r,g,b,a)=>a<1?`rgba(${r},${g},${b},${+a.toFixed(3)})`:'#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const mapGrey=s=>{const c=rgba(s);if(!c)return null;const g=Math.round(lum(c));return css(g,g,g,c[3])};
const mapMask=s=>{const c=rgba(s);if(!c)return null;return isWhite(c)?'#000000':'#ffffff'};   // inside the mask: white = shows, black = cut out
const PROPS=['fill','stroke','stop-color','flood-color','lighting-color'];
const fixDecl=(txt,map)=>txt.replace(/(^|[;{\s])(fill|stroke|stop-color|flood-color|lighting-color)\s*:\s*([^;}!]+)/gi,(m,pre,prop,val)=>{const o=map(val);return o==null?m:pre+prop+':'+o});
const KEEP=new Set(['defs','style','title','desc','metadata','clipPath','linearGradient','radialGradient','pattern','symbol','filter','mask','marker']);

function parse(text){
  const doc=new DOMParser().parseFromString(text,'image/svg+xml');
  if(doc.querySelector('parsererror'))return null;const root=doc.documentElement;if(!root||root.localName!=='svg')return null;
  if(doc.querySelector('image,foreignObject'))return null;          // pictures or HTML inside cannot be recoloured honestly
  return doc}
function recolour(doc,map){
  doc.querySelectorAll('*').forEach(el=>{
    for(const p of PROPS)if(el.hasAttribute(p)){const o=map(el.getAttribute(p));if(o!=null)el.setAttribute(p,o)}
    if(el.hasAttribute('style'))el.setAttribute('style',fixDecl(el.getAttribute('style'),map));
    if(el.localName==='style')el.textContent=fixDecl(el.textContent,map)})}
const ser=doc=>new XMLSerializer().serializeToString(doc);
/* the colours a logo actually uses */
function coloursOf(doc){
  const set=[];const add=v=>{const c=rgba(v);if(c&&c[3]>0)set.push(c)};
  doc.querySelectorAll('*').forEach(el=>{for(const p of['fill','stroke','stop-color'])if(el.hasAttribute(p))add(el.getAttribute(p));
    const st=(el.getAttribute('style')||'')+(el.localName==='style'?el.textContent:'');st.replace(/(?:fill|stroke|stop-color)\s*:\s*([^;}!]+)/gi,(m,v)=>{add(v.trim());return m})});
  return set}
function box(root){
  const vb=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(parseFloat);
  if(vb.length===4&&vb.every(isFinite))return vb;
  const w=parseFloat(root.getAttribute('width'))||300,h=parseFloat(root.getAttribute('height'))||150;return[0,0,w,h]}

/* returns {white, grey} (SVG text or null when that version makes no sense / cannot be built) */
function make(svgText){
  const out={white:null,grey:null};
  const probe=parse(svgText);if(!probe)return out;
  const cols=coloursOf(probe),visible=cols.length?cols:[[0,0,0,1]];     // no explicit colour = default black
  const allWhite=visible.every(isWhite),allNeutral=visible.every(isNeutral);
  /* greyscale */
  if(!allNeutral){const d=parse(svgText);recolour(d,mapGrey);out.grey=ser(d)}
  /* white / reversed */
  if(!allWhite){
    const d=parse(svgText),root=d.documentElement,NS='http://www.w3.org/2000/svg',[x,y,w,h]=box(root);
    recolour(d,mapMask);
    const content=[...root.childNodes].filter(n=>n.nodeType===1&&!KEEP.has(n.localName));
    if(content.length){
      let defs=[...root.childNodes].find(n=>n.nodeType===1&&n.localName==='defs');
      if(!defs){defs=d.createElementNS(NS,'defs');root.insertBefore(defs,root.firstChild)}
      const mk=d.createElementNS(NS,'mask');mk.setAttribute('id','lh-reverse');mk.setAttribute('maskUnits','userSpaceOnUse');['x','y','width','height'].forEach((k,i)=>mk.setAttribute(k,[x,y,w,h][i]));
      const g=d.createElementNS(NS,'g');g.setAttribute('fill','#ffffff');content.forEach(n=>g.appendChild(n));mk.appendChild(g);defs.appendChild(mk);
      const r=d.createElementNS(NS,'rect');['x','y','width','height'].forEach((k,i)=>r.setAttribute(k,[x,y,w,h][i]));r.setAttribute('fill','#ffffff');r.setAttribute('mask','url(#lh-reverse)');root.appendChild(r);
      out.white=ser(d)}}
  return out}
return{make,rgba}})();

/* ---------- glue: turn a processed logo into its white / greyscale siblings ---------- */
const svgTextOf=async src=>{if(!src)return null;if(src.startsWith('data:')){const i=src.indexOf(',');return/;base64/.test(src.slice(0,i))?atob(src.slice(i+1)):decodeURIComponent(src.slice(i+1))}try{return await (await fetch(src)).text()}catch{return null}};
/* l = a logo from processLogo (svg data URL) or a stored logo entry; siblings = [{name,group}] already in the brand */
async function logoVariants(l,siblings=[]){
  const text=await svgTextOf(l.svg||(l.formats||[]).find(f=>f.label==='SVG')?.url||(/^data:image\/svg/.test(l.data||'')?l.data:null));if(!text)return[];
  const sib=siblings.filter(x=>x.group===l.group).map(x=>String(x.name||'').toLowerCase()).join('|');
  const v=LOGOV.make(text),out=[];
  const base=String(l.name||'Logo').replace(/\s*[–-]\s*(white|grey|gray|greyscale|reversed).*$/i,'');
  const build=async(svg,suffix)=>{try{const p=await processLogo(new File([svg],'logo-'+suffix.toLowerCase()+'.svg',{type:'image/svg+xml'}));p.group=l.group;p.name=base+' – '+suffix;p.auto=true;if(l.fid)p.fid=l.fid;out.push(p)}catch(e){console.warn('variant',suffix,e)}};
  if(v.white&&!/white|reversed/.test(sib))await build(v.white,'White');
  if(v.grey&&!/gr[ae]y/.test(sib))await build(v.grey,'Greyscale');
  return out}
