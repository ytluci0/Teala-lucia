import createSphereRenderer from './gpu-sphere.js';
import SpatialEnvironment from './environment.js';
import LuciaCoreGaze from './gaze.js';
import { data, agents, svg, row, cardDetails, agentDetails } from '../data/preview.js';

/* Lucia UI-only preview. All counts, tasks and agent outcomes are demo data.
   No fetch(), backend, model calls, microphones, email or production systems. */
export function createLuciaController(root, ui) {
  const lifecycle = new AbortController();
  let disposed = false;
  const $=(q,scope=root)=>scope.querySelector(q), $$=(q,scope=root)=>[...scope.querySelectorAll(q)];
  function listen(target,type,handler,options={}) { target.addEventListener(type,handler,{...options,signal:lifecycle.signal}); }
  const app=root, carousel=$('.lucia-carousel'), dialog=$('dialog'), core=$('#core');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const cards=$$('.carousel-card'), dots=$$('.page-dot'), agentButtons=$$('.agent-glass');
  dots.forEach((b,i)=>b.onclick=()=>go(i));
  agentButtons.forEach((b,i)=>b.onclick=()=>openSpotlight(agentDetails(agents[i]),b));
  $$('[data-shortcut]').forEach(b=>b.onclick=()=>selectCard(data.findIndex(x=>x.key===b.dataset.shortcut)));
  const scene = new SpatialEnvironment($('#scene-canvas'));
  const renderer=createSphereRenderer($('#energy-canvas'),$('.core-fallback'));
  const gaze=new LuciaCoreGaze(core,$('#core-attitude'));
  let position=2,target=2,step=280,carouselWidth=0,raf=0,last=0,clock=0,paused=false,dirty=true,drag=null,pendingOpen=null,source=null,closing=false,openAnimation=null;
  let activeAgent=-1,pulseDirection=1,pulseStart=0,mode='idle',demoToken=0,wheelTimer=0,toastTimer=0;
  const geometry=[], metrics={frameIntervals:[],jsFrameCosts:[],ringCosts:[],sceneCosts:[],ringRenderer:'initializing'};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function renderCards(){
    const nearest=clamp(Math.round(position),0,data.length-1);
    cards.forEach((card,i)=>{
      const d=i-position,n=Math.min(Math.abs(d),3.5),f=Math.max(0,1-Math.abs(d)/1.25);
      // Neutral card geometry; all perspective is positional, not baked into the artwork.
      const css={'--x':`${d*step}px`,'--y':`${n*5}px`,'--z':`${-n*17}px`,'--yaw':`${Math.sign(d)*Math.min(Math.abs(d)*14,25)}deg`,'--scale':`${1.025-n*.028}`,'--opacity':`${Math.max(.56,1-Math.abs(d)*.055)}`,'--layer':`${Math.round(100-Math.abs(d)*10)}`,'--focus':`${f}`};
      for(const [k,v] of Object.entries(css))card.style.setProperty(k,v);
      const visible=Math.abs(d*step)<carouselWidth/2+step/2;
      card.inert=!visible;$('button',card).tabIndex=visible?0:-1;
      $('button',card).setAttribute('aria-current',i===nearest?'true':'false');
    });
    dots.forEach((dot,i)=>{dot.classList.toggle('active',i===nearest);dot.setAttribute('aria-current',i===nearest?'true':'false');});
    $('#prev').disabled=nearest===0;$('#next').disabled=nearest===data.length-1;
    scene.setCards(position,step);
  }
  const ns='http://www.w3.org/2000/svg';
  function node(name,attributes){const e=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attributes))e.setAttribute(k,v);return e;}
  function measure(){
    step=cards[0].offsetWidth+12;carouselWidth=carousel.clientWidth;
    const s=$('.lucia-stage').getBoundingClientRect(),c=core.getBoundingClientRect();
    const lines=$('#connection-lines'),pulses=$('#connection-pulses');lines.replaceChildren();pulses.replaceChildren();geometry.length=0;
    agentButtons.forEach((b,i)=>{
      const r=b.getBoundingClientRect(),left=i<3,idx=i%3;
      const from={x:c.left-s.left+c.width*(left?.15:.85),y:c.top-s.top+c.height*(.5+(idx-1)*.25)};
      const to={x:(left?r.right:r.left)-s.left,y:r.top-s.top+r.height*.5};
      const xgap=(to.x-from.x)*.55;
      const p=[from,{x:from.x+xgap,y:from.y},{x:to.x-xgap*.35,y:to.y},to];
      const d=`M${p[0].x},${p[0].y} C${p[1].x},${p[1].y} ${p[2].x},${p[2].y} ${p[3].x},${p[3].y}`;
      lines.append(node('path',{d,class:'connection-line'}));
      lines.append(node('path',{d:`M${from.x},${from.y+6} C${p[1].x},${p[1].y+15} ${p[2].x},${p[2].y-7} ${to.x},${to.y}`,class:'connection-secondary'}));
      lines.append(node('circle',{cx:to.x,cy:to.y,r:11,class:'connection-flare'}));lines.append(node('circle',{cx:to.x,cy:to.y,r:5,class:'connection-flare'}));lines.append(node('circle',{cx:to.x,cy:to.y,r:2.2,class:'connection-node'}));
      const pulse=node('circle',{cx:from.x,cy:from.y,r:3.3,class:'connection-pulse'});pulses.append(pulse);geometry.push({p,pulse});
    });
    gaze.measure();renderer.resize();scene.measure(core,carousel,cards);renderer.firstDraw=false;dirty=true;wake();
  }
  function updatePulse(){
    geometry.forEach((g,i)=>{
      if(i!==activeAgent||mode==='idle'){g.pulse.style.opacity='0';return;}
      const u0=((clock-pulseStart)*.48)%1,u=pulseDirection===1?u0:1-u0,v=1-u,p=g.p;
      const x=v*v*v*p[0].x+3*v*v*u*p[1].x+3*v*u*u*p[2].x+u*u*u*p[3].x;
      const y=v*v*v*p[0].y+3*v*v*u*p[1].y+3*v*u*u*p[2].y+u*u*u*p[3].y;
      g.pulse.setAttribute('cx',x);g.pulse.setAttribute('cy',y);g.pulse.style.opacity=String(Math.sin(u0*Math.PI)*.95);
    });
  }
  function frame(now){
    raf=0;const start=performance.now(),elapsed=last?now-last:16.67,dt=Math.min(elapsed/1000,.05);last=now;
    const canMove=!paused&&!reduced.matches;
    if(canMove)clock+=dt;
    let moving=!drag&&Math.abs(target-position)>.001;
    if(moving){position+=(target-position)*(reduced.matches?1:1-Math.exp(-dt*12.5));if(Math.abs(target-position)<.001){position=target;moving=false;}dirty=true;}
    if(dirty){renderCards();dirty=false;}
    gaze.update(Math.min(elapsed/1000,.15),{enabled:!paused,reduced:reduced.matches,blocked:dialog.open||!!drag||document.activeElement?.matches('input,textarea,[contenteditable=true]')});
    renderer.setGaze(gaze.yaw,gaze.pitch);
    scene.setCoreGaze(0,0); // Reflection is already rendered with the core's pose.
    if(canMove||!renderer.firstDraw){renderer.draw(clock,mode==='idle'?.1:mode==='listening'?.8:.5);renderer.firstDraw=renderer.ready;}
    if(renderer.reflectionVersion!==scene.lastOrbVersion&&renderer.reflectionCanvas){
      scene.ringImage=renderer.reflectionCanvas;scene.lastOrbVersion=renderer.reflectionVersion;
      if(scene.gl)scene.uploadTexture(scene.ringTex,renderer.reflectionCanvas);
    }
    scene.adapt(elapsed,canMove);
    scene.draw(clock,dt,mode==='idle'?.1:mode==='listening'?.8:.5,canMove);
    if(canMove&&activeAgent>=0)updatePulse();
    if(!moving&&!drag){carousel.classList.remove('is-moving');if(pendingOpen!==null){const i=pendingOpen;pendingOpen=null;openSpotlight(cardDetails(data[i]),$('button',cards[i]));}}
    metrics.ringRenderer=renderer.mode||'initializing';metrics.environment=scene.mode;metrics.scene=scene.stats;
    if(canMove&&elapsed<250){metrics.frameIntervals.push(elapsed);if(metrics.frameIntervals.length>180)metrics.frameIntervals.shift();}
    metrics.jsFrameCosts.push(performance.now()-start);if(metrics.jsFrameCosts.length>180)metrics.jsFrameCosts.shift();
    if((canMove||moving||dirty)&&!document.hidden)wake();
  }
  function wake(){if(!disposed&&!raf&&!document.hidden)raf=requestAnimationFrame(frame);}
  function go(n){pendingOpen=null;target=clamp(n,0,data.length-1);carousel.classList.add('is-moving');if(reduced.matches)position=target;dirty=true;wake();}
  function selectCard(i){go(i);pendingOpen=i;$('#carousel-announcement').textContent=`${data[i].name} selected.`;wake();}
  const resizeObserver=new ResizeObserver(measure);resizeObserver.observe($('.lucia-stage'));resizeObserver.observe(carousel);
  listen(carousel,'pointerdown',e=>{
    if(e.button!==0)return;clearTimeout(wheelTimer);pendingOpen=null;drag={id:e.pointerId,x:e.clientX,start:position,moved:false,button:e.target.closest('[data-index]')};
    target=position;carousel.setPointerCapture(e.pointerId);carousel.classList.add('is-dragging','is-moving');
  });
  listen(carousel,'pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>6)drag.moved=true;
    if(drag.moved){position=clamp(drag.start-dx/step,0,data.length-1);target=position;dirty=true;wake();}
  });
  function endDrag(e,cancelled=false){
    if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;carousel.classList.remove('is-dragging');
    if(carousel.hasPointerCapture(e.pointerId))carousel.releasePointerCapture(e.pointerId);
    if(!cancelled&&!d.moved&&d.button)selectCard(Number(d.button.dataset.index));else go(Math.round(position));
  }
  listen(carousel,'pointerup',e=>endDrag(e));listen(carousel,'pointercancel',e=>endDrag(e,true));
  listen(carousel,'click',e=>{if(e.detail===0){const b=e.target.closest('[data-index]');if(b)selectCard(Number(b.dataset.index));}});
  listen(carousel,'wheel',e=>{
    e.preventDefault();pendingOpen=null;let delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
    delta*=e.deltaMode===1?16:e.deltaMode===2?carousel.clientWidth:1;
    target=clamp(target+delta/step*.7,0,data.length-1);carousel.classList.add('is-moving');wake();clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>go(Math.round(target)),160);
  },{passive:false,signal:lifecycle.signal});
  listen(carousel,'keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();go(e.key==='Home'?0:e.key==='End'?data.length-1:Math.round(target)+(e.key==='ArrowRight'?1:-1));}});
  $('#prev').onclick=()=>go(Math.round(target)-1);$('#next').onclick=()=>go(Math.round(target)+1);

  function fillSpotlight(details) { ui.showDetails(details); }
  function morphTransform(from,to){return `translate(${from.left+from.width/2-to.left-to.width/2}px,${from.top+from.height/2-to.top-to.height/2}px) scale(${from.width/to.width},${from.height/to.height})`;}
  function openSpotlight(details,button){
    if(dialog.open)return;
    gaze.release();source=button||document.activeElement;closing=false;fillSpotlight(details);const origin=source?.getBoundingClientRect();dialog.showModal();
    const shell=$('.spotlight-shell'),content=$('.spotlight-content'),dest=dialog.getBoundingClientRect();
    if(!reduced.matches&&origin&&origin.width>0){
      shell.animate([{transform:morphTransform(origin,dest),opacity:.65},{transform:'none',opacity:1}],{duration:440,easing:'cubic-bezier(.18,.78,.22,1)'});
      openAnimation=content.animate([{opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'none'}],{duration:220,delay:150,fill:'backwards',easing:'ease-out'});
    }
    $('.spotlight-close').focus();
  }
  async function closeSpotlight(){
    if(!dialog.open||closing)return;closing=true;openAnimation?.cancel();
    const content=$('.spotlight-content'),shell=$('.spotlight-shell'),from=dialog.getBoundingClientRect(),to=source?.getBoundingClientRect();
    if(!reduced.matches&&to&&to.width>0){
      const fade=content.animate([{opacity:1},{opacity:0}],{duration:140,fill:'forwards'});
      const anim=shell.animate([{transform:'none',opacity:1},{transform:morphTransform(to,from),opacity:.4}],{duration:320,easing:'cubic-bezier(.5,0,.3,1)',fill:'forwards'});
      try{await anim.finished;}catch(_){}
      if(disposed)return;
      dialog.close();fade.cancel();anim.cancel();
    }else dialog.close();
    closing=false;source?.focus();
  }
  $$('.spotlight-close,.close-footer').forEach(b=>b.onclick=closeSpotlight);
  listen(dialog,'cancel',e=>{e.preventDefault();closeSpotlight();});
  listen(dialog,'click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeSpotlight();}});
  function toast(text){const box=$('.toast');$('.glass-content',box).textContent=text;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,3300);}
  $('#attach').onclick=()=>toast('Attachment control preview only. No file is selected or uploaded.');
  $('#about').onclick=e=>openSpotlight({key:'knowledge',title:'The Lucia interface',icon:'knowledge',description:'An offline, UI-only motion study. There are no AI, email, calendar, or production-system connections.',rows:[row('Explore the cards','Drag, swipe, scroll, or use the arrow controls.','Interactive','projects'),row('Open a spotlight','Select a card or agent. Press Escape to close.','Interactive','tasks'),row('Preview a task','Watch a simulated listening → delegation → result sequence.','Simulated','bolt')],note:'Move your mouse to let Lucia look toward it. Only the core tilts: agents, cards, composer, platform and room camera stay fixed. The core is now a perspective-projected sphere, with 3D filaments wrapping its front and back and the text embedded at different depths. The core recentres when the pointer leaves, when a spotlight opens, or while you type or drag. The renderer uses Canvas to project XYZ geometry. It does not rotate a PNG or a flat ring. Reflections are stylized, not physically traced. All activity is simulated.'},e.currentTarget);
  listen($('#composer'),'submit',e=>{
    e.preventDefault();const input=$('#prompt'),text=input.value.trim();if(!text)return;
    const i=data.findIndex(d=>text.toLowerCase().includes(d.key)||text.toLowerCase().includes(d.name.toLowerCase()));
    if(i>=0){selectCard(i);return;}
    if(/ob2|check|stream/i.test(text)){runDemo();return;}
    openSpotlight({key:'knowledge',title:'Your request',icon:'bolt',description:text,stats:[['UI only','Current mode'],['0','Requests sent'],['Demo','Response']],note:'This field demonstrates the interaction. It is not connected to Lucia, a language model, or any external service.'},input);
  });
  function setState(state,label,agent=-1,direction=1){
    mode=state;core.dataset.state=state;$('#core-status').textContent=label;activeAgent=agent;pulseDirection=direction;pulseStart=clock;renderer.firstDraw=false;
    agentButtons.forEach((b,i)=>{b.classList.toggle('working',i===agent);$('.agent-status span',b).textContent=i===agent?'Working · demo':'Ready · preview';});
    if(agent<0)geometry.forEach(g=>g.pulse.style.opacity='0');wake();
  }
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function runDemo(){
    if(dialog.open)return;const token=++demoToken;$('#demo').disabled=true;
    $('#stage-status').textContent='Simulated task · no systems are being checked';
    setState('listening','Listening · demonstration');await delay(reduced.matches?200:1900);if(disposed||token!==demoToken)return;
    setState('working','Delegating to Engineering',1);await delay(reduced.matches?200:2700);if(disposed||token!==demoToken)return;
    setState('working','Checking the sample signal',2);await delay(reduced.matches?200:2600);if(disposed||token!==demoToken)return;
    setState('working','Results returning to Lucia',2,-1);await delay(reduced.matches?200:1600);if(disposed||token!==demoToken)return;
    setState('idle','Your sample report is ready');$('#demo').disabled=false;
    openSpotlight({key:'engineering',title:'OB2 · Sample signal report',icon:'monitoring',description:'A demonstration of how Lucia could present an agent result. These values are fictional, not a measurement.',stats:[['11.4','Mb/s · example'],['145','ms RTT · example'],['0','Live checks run']],rows:[row('Engineering','Sample gateway connectivity check','Demo complete','engineering'),row('Monitoring','Sample stream health summary','Demo complete','monitoring')],note:'No gateway, broadcast device, or live stream was accessed.'},agentButtons[2]);
    $('#stage-status').textContent='Six specialists. One intelligence.';
  }
  $('#demo').onclick=runDemo;
  $('#mic').onclick=async()=>{if(mode!=='idle')return;setState('listening','Listening · visual preview');toast('Listening animation only. Your microphone is not accessed.');await delay(3000);if(!disposed&&mode==='listening')setState('idle','Ready when you are');};
  function syncMotion(){app.classList.toggle('motion-paused',paused||reduced.matches);$('#motion-toggle').innerHTML=svg(paused?'play':'pause');$('#motion-toggle').setAttribute('aria-label',paused?'Resume decorative motion':'Pause decorative motion');$('#motion-toggle').setAttribute('aria-pressed',String(paused));last=0;renderer.firstDraw=false;wake();}
  $('#motion-toggle').onclick=()=>{paused=!paused;syncMotion();};listen(reduced,'change',syncMotion);
  listen(document,'visibilitychange',()=>{if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;}else{last=0;wake();}});
  listen(window,'lucia-scene-ready',()=>{dirty=true;renderer.firstDraw=false;wake();});
  listen(window,'lucia-visual-ready',()=>{renderer.firstDraw=false;wake();});
  window.LuciaUI={get position(){return position;},get target(){return target;},get mode(){return mode;},get reducedMotion(){return reduced.matches;},metrics,scene,gaze,renderer,wake,select:selectCard,centre:go,pause:()=>{paused=true;syncMotion();},resume:()=>{paused=false;syncMotion();}};
  measure();syncMotion();
  return {
    ...window.LuciaUI,
    destroy() {
      disposed=true;demoToken++;lifecycle.abort();resizeObserver.disconnect();
      cancelAnimationFrame(raf);clearTimeout(wheelTimer);clearTimeout(toastTimer);
      gaze.destroy();scene.destroy?.();renderer.destroy?.();
      root.getAnimations({subtree:true}).forEach(a=>a.cancel());
      if(dialog.open)dialog.close();
      $$('button').forEach(b=>b.onclick=null);
      delete window.LuciaUI;
    }
  };
}

