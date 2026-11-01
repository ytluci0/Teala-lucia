
/* Isolated, bounded cursor gaze for Lucia's core.
 * No device orientation, microphone access, network, or second animation loop.
 * The outer #core is the fixed layout anchor; only its inner face rotates.
 */

  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  class LuciaCoreGaze {
    constructor(anchor,face,textureURL) {
      this.anchor=anchor;
      this.face=face;
      this.yaw=0;
      this.pitch=0;
      this.targetYaw=0;
      this.targetPitch=0;
      this.maxYaw=22;
      this.maxPitch=15;
      this.response=8.5;
      this.pointerInside=false;
      this.lastPointer=null;
      this.lastApplied='';
      this.fine=matchMedia('(any-hover: hover) and (any-pointer: fine)');
      this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
      this.listeners=new AbortController();
      const opts={passive:true,signal:this.listeners.signal};
      // No texture layers: renderer consumes yaw/pitch as a 3D rotation.
      this.onPointer=e=>{
        if(e.pointerType!=='mouse'&&e.pointerType!=='pen') { this.release();return; }
        if(this.reduced.matches||!this.fine.matches)return;
        this.pointerInside=true;
        this.lastPointer={x:e.clientX,y:e.clientY};
        this.aim();
        window.LuciaUI?.wake();
      };
      window.addEventListener('pointermove',this.onPointer,opts);
      document.documentElement.addEventListener('pointerleave',()=>this.release(),opts);
      window.addEventListener('pointerout',e=>{if(!e.relatedTarget)this.release();},opts);
      window.addEventListener('blur',()=>this.release(),opts);
      document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release();},opts);
      document.addEventListener('focusin',()=>window.LuciaUI?.wake(),opts);
      document.addEventListener('focusout',()=>window.LuciaUI?.wake(),opts);
      this.fine.addEventListener('change',()=>this.release(),{signal:this.listeners.signal});
      this.measure();
    }
    measure() {
      // Measure the FIXED anchor on resize, not the transformed face per frame.
      const r=this.anchor.getBoundingClientRect();
      this.cx=r.left+r.width/2;
      this.cy=r.top+r.height/2;
      this.spanX=Math.max(r.width*.8,innerWidth*.42);
      this.spanY=Math.max(r.height*.75,innerHeight*.44);

      if(this.pointerInside)this.aim();
    }
    aim() {
      if(!this.lastPointer)return;
      const x=clamp((this.lastPointer.x-this.cx)/this.spanX,-1,1);
      const y=clamp((this.lastPointer.y-this.cy)/this.spanY,-1,1);
      // CSS positive yaw points the face right; negative pitch points it down.
      this.targetYaw=x*this.maxYaw;
      this.targetPitch=-y*this.maxPitch;
    }
    release() {
      this.pointerInside=false;
      this.lastPointer=null;
      this.targetYaw=0;
      this.targetPitch=0;
      window.LuciaUI?.wake();
    }
    update(dt,{enabled=true,reduced=false,blocked=false}={}) {
      if(reduced||!this.fine.matches){
        this.yaw=0;this.pitch=0;
      } else if(enabled) {
        const ty=blocked?0:this.targetYaw,tp=blocked?0:this.targetPitch;
        // Time-based damping: same response at different display refresh rates.
        const alpha=1-Math.exp(-this.response*clamp(dt,0,.15));
        this.yaw+=(ty-this.yaw)*alpha;
        this.pitch+=(tp-this.pitch)*alpha;
        if(Math.abs(ty-this.yaw)<.003)this.yaw=ty;
        if(Math.abs(tp-this.pitch)<.003)this.pitch=tp;
      }
      const key=`${this.yaw.toFixed(4)}:${this.pitch.toFixed(4)}`;
      if(key===this.lastApplied)return;
      this.lastApplied=key;
      // Keep the outer canvas square. Geometry, not CSS planes, rotates.

    }
    get state() {
      return {yaw:this.yaw,pitch:this.pitch,targetYaw:this.targetYaw,targetPitch:this.targetPitch,
        maxYaw:this.maxYaw,maxPitch:this.maxPitch,pointerInside:this.pointerInside};
    }
    destroy() {
      this.listeners.abort();
      this.face.style.removeProperty('--gaze-yaw');
      this.face.style.removeProperty('--gaze-pitch');
      this.face.style.removeProperty('--gaze-reveal');
    }
  }
export default LuciaCoreGaze;
