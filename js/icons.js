/* LatchHub – icon generator. Draws new icons in a brand's icon theme (bold outline, chamfered corners, accent bars). */
const IconGen=(()=>{
  const f=n=>+n.toFixed(2),pts=a=>a.map(p=>f(p[0])+' '+f(p[1])).join('L');
  const open=(...p)=>({k:'m',d:'M'+pts(p)}),shut=(...p)=>({k:'m',d:'M'+pts(p)+'Z'});
  const apoly=(...p)=>({k:'a',d:'M'+pts(p)+'Z'});
  const bar=(x,y,w,t=5,s=3)=>apoly([x+s,y],[x+w,y],[x+w-s,y+t],[x,y+t]);
  const arect=(x,y,w,h)=>apoly([x,y],[x+w,y],[x+w,y+h],[x,y+h]);
  const cbox=(x,y,w,h,c=5)=>shut([x+c,y],[x+w-c,y],[x+w,y+c],[x+w,y+h-c],[x+w-c,y+h],[x+c,y+h],[x,y+h-c],[x,y+c]);
  const octP=(cx,cy,r)=>{const c=r*.414;return[[cx-c,cy-r],[cx+c,cy-r],[cx+r,cy-c],[cx+r,cy+c],[cx+c,cy+r],[cx-c,cy+r],[cx-r,cy+c],[cx-r,cy-c]]};
  const oct=(cx,cy,r)=>shut(...octP(cx,cy,r)),aoct=(cx,cy,r)=>apoly(...octP(cx,cy,r));
  const line=(a,b,c,d)=>open([a,b],[c,d]);
  const abar=(x1,y1,x2,y2,t=5)=>{const dx=x2-x1,dy=y2-y1,l=Math.hypot(dx,dy),nx=-dy/l*t/2,ny=dx/l*t/2;return apoly([x1+nx,y1+ny],[x2+nx,y2+ny],[x2-nx,y2-ny],[x1-nx,y1-ny])};
  const star=()=>{const p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?11:25;p.push([32+Math.cos(a)*r,34+Math.sin(a)*r])}return shut(...p)};
  const L=[
   ['home','home house building start main',()=>[open([8,32],[32,10],[56,32]),open([14,28],[14,54],[50,54],[50,28]),arect(28,40,8,14)]],
   ['mail','mail email message envelope inbox letter',()=>[cbox(6,14,52,36,5),open([10,18],[32,36],[54,18]),bar(14,40,14,4)]],
   ['user','user person profile account people member',()=>[oct(32,22,9),open([10,56],[10,46],[18,38],[46,38],[54,46],[54,56]),bar(26,48,12,4)]],
   ['phone','phone mobile call smartphone contact',()=>[cbox(18,6,28,52,6),bar(26,48,12,4)]],
   ['calendar','calendar date schedule event booking',()=>[cbox(8,14,48,42,5),line(8,28,56,28),line(20,8,20,18),line(44,8,44,18),bar(16,36,10,4),bar(30,36,10,4),bar(16,46,10,4)]],
   ['clock','clock time timer watch hour',()=>[oct(32,32,24),line(32,16,32,32),abar(32,32,44,40,5)]],
   ['chart','chart graph analytics growth stats report data',()=>[open([8,8],[8,56],[56,56]),arect(16,38,8,12),arect(28,26,8,24),arect(40,14,8,36)]],
   ['settings','settings gear config configuration preferences tools',()=>[oct(32,32,20),line(32,4,32,10),line(32,54,32,60),line(4,32,10,32),line(54,32,60,32),aoct(32,32,6)]],
   ['lock','lock secure security private password',()=>[cbox(12,28,40,28,5),open([20,28],[20,18],[26,10],[38,10],[44,18],[44,28]),arect(29,38,6,10)]],
   ['bell','bell notification alert alarm reminder',()=>[open([14,46],[14,28],[22,10],[42,10],[50,28],[50,46]),line(8,46,56,46),bar(26,53,12,4)]],
   ['cart','cart shop shopping basket store buy ecommerce',()=>[open([6,10],[14,10],[22,40],[50,40],[54,20],[16,20]),aoct(24,52,4),aoct(46,52,4)]],
   ['heart','heart love like favourite favorite care health',()=>[shut([32,54],[10,32],[10,20],[18,12],[26,12],[32,20],[38,12],[46,12],[54,20],[54,32]),bar(17,21,8,4)]],
   ['star','star rating review quality best featured',()=>[star(),aoct(32,34,3)]],
   ['pin','pin location map place address navigate gps',()=>[shut([32,58],[12,34],[12,24],[22,8],[42,8],[52,24],[52,34]),aoct(32,26,6)]],
   ['document','document file page report paper text doc invoice',()=>[shut([14,8],[38,8],[50,20],[50,56],[14,56]),bar(22,28,20,4),bar(22,38,20,4),bar(22,48,12,4)]],
   ['folder','folder directory files archive projects',()=>[shut([8,14],[26,14],[32,22],[56,22],[56,52],[8,52]),bar(16,34,18,4)]],
   ['download','download save import get arrow down',()=>[open([10,44],[10,56],[54,56],[54,44]),arect(29,8,6,24),apoly([18,30],[46,30],[32,46])]],
   ['upload','upload export publish send arrow up',()=>[open([10,44],[10,56],[54,56],[54,44]),arect(29,22,6,24),apoly([18,24],[46,24],[32,8])]],
   ['camera','camera photo picture image photography',()=>[cbox(6,18,52,36,5),line(22,12,42,12),oct(32,36,9),arect(46,24,6,4)]],
   ['play','play video movie media start watch',()=>[oct(32,32,24),apoly([26,20],[46,32],[26,44])]],
   ['chip','chip processor cpu semiconductor electronics hardware',()=>[cbox(16,16,32,32,4),line(26,6,26,16),line(38,6,38,16),line(26,48,26,58),line(38,48,38,58),line(6,26,16,26),line(6,38,16,38),line(48,26,58,26),line(48,38,58,38),arect(26,26,12,12)]],
   ['circuit','circuit board pcb network connection nodes',()=>[open([8,20],[26,20],[26,44],[44,44]),open([56,20],[38,20],[38,32]),aoct(10,20,4),aoct(54,20,4),aoct(46,44,4)]],
   ['battery','battery power charge energy',()=>[cbox(6,18,44,28,4),line(56,28,56,36),arect(12,24,8,16),arect(24,24,8,16)]],
   ['wifi','wifi wireless signal internet connectivity',()=>[open([10,28],[32,14],[54,28]),open([18,40],[32,30],[46,40]),aoct(32,50,5)]],
   ['shield','shield protection safe guard insurance trust',()=>[shut([32,6],[54,14],[54,32],[32,58],[10,32],[10,14]),apoly([22,32],[27,28],[31,34],[41,22],[46,26],[31,42])]],
   ['check','check tick done success approved complete verify',()=>[oct(32,32,24),apoly([18,32],[23,27],[29,33],[43,19],[48,24],[29,43])]],
   ['close','close cross cancel delete remove exit x',()=>[line(14,14,50,50),line(50,14,14,50),aoct(32,32,3)]],
   ['plus','plus add new create',()=>[line(32,10,32,54),line(10,32,54,32),aoct(32,32,3)]],
   ['search','search find magnifier lookup explore zoom',()=>[cbox(8,8,34,34,8),abar(44,44,56,56,6)]],
   ['edit','edit pencil write modify compose design',()=>[cbox(8,12,40,44,6),abar(28,36,54,10,6)]],
   ['share','share send forward social',()=>[open([14,36],[14,56],[50,56],[50,36]),arect(29,8,6,30),apoly([18,16],[46,16],[32,4])]],
   ['chat','chat message comment talk conversation support bubble',()=>[shut([8,10],[56,10],[56,40],[30,40],[18,52],[18,40],[8,40]),bar(16,20,24,4),bar(16,29,14,4)]],
   ['globe','globe world international global web earth language',()=>[oct(32,32,24),line(32,8,32,56),line(8,32,56,32),aoct(32,32,4)]],
   ['bulb','bulb idea light innovation tip lamp',()=>[shut([32,6],[46,12],[50,24],[46,36],[40,42],[40,48],[24,48],[24,42],[18,36],[14,24],[18,12]),line(26,56,38,56),bar(24,20,10,4)]],
   ['cloud','cloud storage hosting server backup',()=>[shut([14,48],[8,40],[8,32],[14,26],[20,26],[24,16],[40,16],[44,26],[52,26],[58,32],[58,42],[52,48]),bar(22,36,20,4)]],
   ['link','link chain url connect attach',()=>[cbox(6,18,34,20,8),cbox(24,28,34,20,8),bar(26,34,12,4)]],
   ['trophy','trophy award winner achievement cup prize champion',()=>[shut([16,8],[48,8],[48,28],[40,38],[24,38],[16,28]),line(32,38,32,50),line(20,56,44,56),open([16,14],[8,14],[8,22],[16,28]),open([48,14],[56,14],[56,22],[48,28]),aoct(32,22,5)]],
   ['key','key access login unlock',()=>[oct(20,32,12),line(32,32,56,32),line(48,32,48,42),aoct(20,32,3)]],
   ['tag','tag price label offer discount sale',()=>[shut([8,32],[28,8],[56,8],[56,36],[32,58]),aoct(44,20,4)]],
   ['eye','eye view visible watch preview vision',()=>[shut([6,32],[20,16],[44,16],[58,32],[44,48],[20,48]),aoct(32,32,8)]],
   ['trash','trash delete bin garbage waste',()=>[line(8,16,56,16),open([24,16],[24,8],[40,8],[40,16]),shut([14,16],[50,16],[46,56],[18,56]),arect(29,26,6,20)]],
   ['bolt','bolt lightning flash fast speed power electric energy',()=>[shut([36,6],[14,34],[30,34],[26,58],[50,26],[34,26]),aoct(31,33,3)]],
   ['bookmark','bookmark save later saved ribbon',()=>[shut([16,6],[48,6],[48,58],[32,44],[16,58]),bar(24,16,16,4)]],
   ['filter','filter funnel sort refine',()=>[shut([6,10],[58,10],[38,34],[38,56],[26,48],[26,34]),bar(22,18,20,4)]],
   ['menu','menu hamburger navigation list lines',()=>[line(8,16,56,16),line(8,32,56,32),bar(8,46,30,5)]],
   ['arrow','arrow right next forward go direction',()=>[line(8,32,52,32),open([38,18],[54,32],[38,46]),bar(8,44,14,4)]],
   ['graduation','graduation education school student college university learning academic cap',()=>[shut([32,10],[58,24],[32,38],[6,24]),open([16,32],[16,44],[32,52],[48,44],[48,32]),abar(58,26,58,46,4)]],
   ['book','book read library study course notebook',()=>[shut([8,12],[30,12],[32,16],[34,12],[56,12],[56,50],[34,50],[32,54],[30,50],[8,50]),bar(14,24,12,4),bar(38,24,12,4)]],
   ['team','team group users people community staff',()=>[oct(22,20,7),oct(44,22,6),open([6,54],[6,44],[12,36],[32,36],[38,44],[38,54]),open([44,54],[58,54],[58,46],[52,40])]],
   ['megaphone','megaphone marketing campaign announce advertising promote',()=>[shut([8,26],[24,26],[48,10],[48,50],[24,38],[8,38]),bar(14,44,8,4),abar(52,24,58,24,4)]],
   ['target','target goal aim focus objective',()=>[oct(32,32,24),oct(32,32,11),aoct(32,32,3)]],
   ['rocket','rocket launch startup boost',()=>[shut([32,4],[46,22],[46,42],[38,50],[26,50],[18,42],[18,22]),apoly([24,52],[40,52],[32,62]),aoct(32,26,4)]]
  ];
  const STOP=new Set(['icon','icons','for','a','an','the','of','symbol','sign','to','and','with','in','on','my','new','add']);
  const tok=q=>q.toLowerCase().replace(/[^a-z\s]/g,' ').split(/\s+/).filter(w=>w&&!STOP.has(w)).map(w=>w.length>3?w.replace(/(ies|es|s)$/,m=>m==='ies'?'y':''):w);
  function match(q){const t=tok(q),sc=L.map(([id,words,draw])=>{const ws=words.split(' ').map(w=>w.length>3?w.replace(/(ies|es|s)$/,m=>m==='ies'?'y':''):w);let s=0;t.forEach(w=>{if(ws.includes(w))s+=ws[0]===w?3:2;else if(ws.some(x=>x.length>3&&w.length>3&&(x.startsWith(w)||w.startsWith(x))))s+=1});return{id,draw,s,words}}).sort((a,b)=>b.s-a.s);
    return{hits:sc.filter(x=>x.s>0).slice(0,4),all:sc}}
  const svg=(els,th,light)=>{const stroke=light?'#111111':th.stroke,w=th.w||6;
    return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256"><g fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="miter" stroke-miterlimit="10" stroke-linecap="butt">${els.filter(e=>e.k==='m').map(e=>`<path d="${e.d}"/>`).join('')}</g><g fill="${th.accent}">${els.filter(e=>e.k==='a').map(e=>`<path d="${e.d}"/>`).join('')}</g></svg>`};
  const toPng=(svgText,size,bg)=>new Promise((res,rej)=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');if(bg){x.fillStyle=bg;x.fillRect(0,0,size,size)}x.drawImage(img,0,0,size,size);res(c.toDataURL('image/png'))};img.onerror=rej;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgText)});
  const dataSvg=s=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
  /* ---- optional AI mode: asks Claude to draw an icon in the same style (needs the user's own API key) ---- */
  const clean=(text,th)=>{const m=text.match(/<svg[\s\S]*<\/svg>/i);if(!m)throw new Error('No SVG in reply');const doc=new DOMParser().parseFromString(m[0],'image/svg+xml'),root=doc.documentElement;if(root.nodeName!=='svg')throw new Error('Bad SVG');
    const OK=new Set(['path','rect','circle','polygon','polyline','line','g']),AT=new Set(['d','points','x','y','width','height','cx','cy','r','x1','y1','x2','y2','fill','stroke','stroke-width','stroke-linejoin','stroke-linecap','stroke-miterlimit']);
    const col=v=>{v=(v||'').trim().toLowerCase();return v==='none'?'none':(v===th.accent.toLowerCase()?th.accent:th.stroke)};
    const walk=n=>{let o='';for(const c of n.children){if(!OK.has(c.nodeName))continue;let a='';for(const at of c.attributes){if(!AT.has(at.name))continue;let v=at.value;if(at.name==='fill'||at.name==='stroke')v=col(v);a+=` ${at.name}="${v.replace(/"/g,'')}"`}o+=c.nodeName==='g'?`<g${a}>${walk(c)}</g>`:`<${c.nodeName}${a}/>`}return o};
    return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">${walk(root)}</svg>`};
  async function ai(query,th,key){
    const ex=['document','search','share'].map(id=>{const e=L.find(x=>x[0]===id);return`${id}: ${svg(e[2](),th).replace(/ width="256" height="256"/,'')}`}).join('\n');
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-5-5',max_tokens:1500,
      system:`You draw UI icons as SVG on a 64x64 grid. Style: bold outline strokes (stroke-width ${th.w||6}, stroke ${th.stroke}, linejoin miter, butt caps, fill none), corners are chamfered (cut at 45°, never round), shapes slightly open or broken, plus 1-3 solid accent shapes (slanted bars or small octagons) filled with ${th.accent}. Use only path/rect/polygon/polyline/line/g elements. Keep 6px padding. Reply with the SVG only.`,
      messages:[{role:'user',content:`Existing icons in this set:\n${ex}\n\nDraw a new icon for: "${query}". Reply with one <svg viewBox="0 0 64 64"> element only.`}]})});
    if(!r.ok)throw new Error('API error '+r.status);const j=await r.json();return clean(j.content.map(c=>c.text||'').join(''),th)}
  return{L,match,svg,toPng,dataSvg,ai};
})();
