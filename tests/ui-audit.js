/* LatchHub UI audit – interface only, changes nothing.
   Run before every push: open the app (signed in, or index.html on a local server), open the browser console,
   paste this whole file and press Enter. Read the report; every line must say OK. */
(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),out=[],bad=[];
  const ok=(c,m)=>{(c?out:bad).push((c?'OK   ':'FAIL ')+m)};
  const keepView={view:ui.view,brandId:ui.brandId};
  document.documentElement.style.scrollBehavior='auto';
  /* home */
  ui.view='home';render();await wait(900);
  const top=S.brands.filter(x=>!x.parent||!S.brands.some(y=>y.id===x.parent));
  ok(document.querySelectorAll('.hx').length===top.length,'home: one row per brand ('+top.length+')');
  document.querySelectorAll('.hx .hxl img').forEach(i=>ok(i.complete&&i.naturalWidth>0,'home: logo loads – '+i.closest('.hx').querySelector('.hxn').firstChild.textContent));
  ok(document.documentElement.scrollWidth<=innerWidth+1,'home: no sideways scroll');
  /* every brand */
  for(const b of S.brands){
    ui.view='brand';ui.brandId=b.id;render();await wait(500);
    const n=b.name+': ',secs=[...document.querySelectorAll('main section')].map(s=>s.id),pills=[...document.querySelectorAll('.pill')].map(p=>p.dataset.id);
    ok(JSON.stringify(secs.filter(x=>pills.includes(x)))===JSON.stringify(pills),n+'menu order = page order');
    pills.forEach(id=>ok(!!document.getElementById(id),n+'menu item '+id+' has a section'));
    const lg=document.querySelector('#s-logos');
    const real=b.logos.filter(l=>!isRef(l)&&!isPat(l)).length;
    ok(!b.logos.length||(lg&&lg.querySelectorAll('.lt').length===real),n+'Logos section shows only real logos ('+real+')');
    ok(document.querySelectorAll('main .lt').length===b.logos.length,n+'all '+b.logos.length+' logo files shown somewhere');
    ok(!lg||![...lg.querySelectorAll('.grp')].some(g=>/reference|pattern/i.test(g.textContent)),n+'no colour reference / pattern under Logos');
    ok(document.querySelectorAll('#s-colors .cs').length===b.colors.length,n+b.colors.length+' colours');
    ok(document.querySelectorAll('#s-fonts .ft').length===b.fonts.length,n+b.fonts.length+' fonts');
    ok(!(b.elements||[]).length||document.querySelectorAll('#s-elements .it,#s-elements .gt').length===b.elements.length,n+(b.elements||[]).length+' elements');
    ok(!b.book||!!document.querySelector('#s-book .bookcard'),n+'brand book');
    ok(!b.rules.notes||!!document.querySelector('#s-guide .rule'),n+'guidelines');
    ok(!!document.querySelector('#s-links'),n+'links section');
    ok(S.brands.filter(y=>y.parent===b.id).length===document.querySelectorAll('#s-kids .kid').length,n+'sub-brands');
    await wait(400);
    document.querySelectorAll('main img').forEach(i=>{if(i.complete&&!i.naturalWidth)bad.push('FAIL '+n+'broken image '+i.src.slice(-60))});
    ok(document.documentElement.scrollWidth<=innerWidth+1,n+'no sideways scroll');
  }
  /* tools */
  ui.view='check';render();await wait(300);ok(!!document.querySelector('#drop'),'Design Lens opens');
  ok(!!document.querySelector('.tb [data-a=home]')&&!!document.querySelector('.tb [data-c=edit]')&&!!document.querySelector('#imp'),'top bar: home, edit mode, restore present');
  ui.view=keepView.view;ui.brandId=keepView.brandId;render();
  console.log(out.length+' checks OK, '+bad.length+' problems\n'+bad.join('\n'));
  return {ok:out.length,problems:bad};
})();
