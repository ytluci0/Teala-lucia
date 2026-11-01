import { sampleFilament, sphereResolution } from './motion.js';

/* LUCIA / VOLUMETRIC CORE
 * A small software 3D renderer. All strands, particles and inner label planes
 * have XYZ coordinates and are projected from a fixed perspective camera.
 * No ring PNG, duplicated image planes, external dependency or second RAF loop.
 * Canvas is intentional: the same geometry works without a WebGL context.
 */

  const TAU = Math.PI * 2, CAMERA = 4.6;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const palettes = [[26,155,255], [90,218,255], [144,102,255], [255,190,130]];
  const normalize = v => { const n = Math.hypot(...v) || 1; return v.map(x => x/n); };
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const rgba = (c,a) => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a,0,1)})`;

  class SphereRenderer {
    constructor(canvas, _unusedTexture, fallback, options={}) {
      this.quality=new URLSearchParams(location.search).get('quality')||'high';
      this.canvas=canvas; this.ctx=canvas.getContext('2d',{alpha:true});
      this.anchor=options.anchor||canvas.closest('.core'); this.ready=!!this.ctx; this.lost=false;
      this.mode=this.ctx?'projected-3d-sphere':'unavailable'; this.firstDraw=false;
      this.yaw=0;this.pitch=0;this.frames=0;this.lastTime=0;
      this.width=0;this.radius=0;this.drawCosts=[];this.labels=new Map();
      this.projectedLabels={};this.rotation=new Float64Array(9);
      this.backBuckets=Array.from({length:24},()=>new Path2D());
      this.frontBuckets=Array.from({length:24},()=>new Path2D());
      this.projection=new Float32Array(4);
      this.particleSprite=this.makeSprite([101,220,255]);
      this.goldSprite=this.makeSprite([255,204,151]);
      this.purpleSprite=this.makeSprite([168,129,255]);
      this.paths=[];this.particles=[];
      this.makeGeometry();
      // Keep real text in the DOM for accessibility / application state updates.
      if(fallback) { fallback.hidden=true;fallback.removeAttribute('src'); }
      this.anchor.classList.add('render-ready','sphere-rendered');
      this.resize();
      this.reflectionCanvas=document.createElement('canvas');
      this.reflectionCanvas.width=this.reflectionCanvas.height=512;
      this.reflectionContext=this.reflectionCanvas.getContext('2d');
      this.reflectionTime=-Infinity;
      if(!options.deferDraw)this.draw(0,.1);
      queueMicrotask(()=>window.dispatchEvent(new Event('lucia-visual-ready')));
    }

    destroy() {
      this.ready=false;this.labels.clear();this.anchor.classList.remove('render-ready','sphere-rendered');
    }
    makeSprite(colour) {
      const c=document.createElement('canvas');c.width=c.height=48;
      const x=c.getContext('2d');const g=x.createRadialGradient(24,24,0,24,24,24);
      g.addColorStop(0,'rgba(242,253,255,1)');
      g.addColorStop(.09,rgba(colour,.96));g.addColorStop(.23,rgba(colour,.42));
      g.addColorStop(.55,rgba(colour,.09));g.addColorStop(1,rgba(colour,0));
      x.fillStyle=g;x.fillRect(0,0,48,48);return c;
    }

    makeGeometry() {
      // Each filament is a closed perturbed great circle in a different 3D
      // plane. The normals cover the sphere, not just its 2D perimeter.
      const count=48, samples=144;
      for(let k=0;k<count;k++) {
        const bundle=Math.floor(k/4), filament=k%4-1.5;
        const f=(bundle+.5)/12, z=1-2*f, angle=bundle*2.3999632297;
        const n=[Math.sqrt(1-z*z)*Math.cos(angle),Math.sqrt(1-z*z)*Math.sin(angle),z];
        const u=normalize(cross(n,Math.abs(n[1])>.85?[1,0,0]:[0,1,0]));
        const v=cross(n,u), phase=bundle*1.71+filament*.038;
        const pts=new Float32Array((samples+1)*3);
        for(let j=0;j<=samples;j++) {
          const t=j/samples*TAU;
          const ripple=.125*Math.sin(3*t+phase)+.052*Math.sin(6*t-phase*.53)+filament*.018;
          const wobble=.008*Math.sin(11*t+phase);
          const a=Math.cos(t),b=Math.sin(t);
          let p=[u[0]*a+v[0]*b+n[0]*ripple,u[1]*a+v[1]*b+n[1]*ripple,u[2]*a+v[2]*b+n[2]*ripple];
          const norm=Math.hypot(...p),r=1+wobble+filament*.003;
          pts.set(p.map(x=>x/norm*r),j*3);
        }
        this.paths.push({pts,screen:new Float32Array((samples+1)*4),samples,
          colour:bundle===11?3:bundle===3||bundle===8?2:bundle%3===0?1:0,phase,
          pulseSpeed:.024+(bundle%7)*.0028, index:k});
      }
      // Spherical surface points, plus a smaller population inside the orb.
      for(let k=0;k<390;k++) {
        const y=1-2*(k+.5)/390,a=k*2.39996323;
        const r=k%5===0?.55+(k%11)/30:1.003+(k%4)*.006;
        const s=Math.sqrt(1-y*y);
        this.particles.push({p:[s*Math.cos(a)*r,y*r,s*Math.sin(a)*r],size:k%27===0?1.8:k%8===0?1.1:.62,phase:k*.73,colour:k%43===0?3:k%14===0?2:0});
      }
    }

    resize() {
      if(!this.ctx)return;
      const css=this.anchor.clientWidth||420;
      const size=sphereResolution(css,devicePixelRatio||1,this.quality);
      if(this.canvas.width!==size||this.canvas.height!==size){this.canvas.width=this.canvas.height=size;this.labels.clear();}
      this.width=size;this.cssSize=css;this.radius=size*.416;
      this.screenRadius=this.radius*CAMERA/Math.sqrt(CAMERA*CAMERA-1);
      this.firstDraw=false;
    }
    setGaze(yaw,pitch) { this.yaw=yaw*Math.PI/180;this.pitch=pitch*Math.PI/180; }
    matrix(yaw,pitch,roll=0) {
      const cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch),cz=Math.cos(roll),sz=Math.sin(roll);
      // Rz * Rx * Ry, right-handed: +yaw turns front points to the right.
      return [cz*cy-sz*sx*sy,-sz*cx,cz*sy+sz*sx*cy,
              sz*cy+cz*sx*sy,cz*cx,sz*sy-cz*sx*cy,
              -cx*sy,sx,cx*cy];
    }
    project(x,y,z,m,out,offset=0) {
      const X=m[0]*x+m[1]*y+m[2]*z,Y=m[3]*x+m[4]*y+m[5]*z,Z=m[6]*x+m[7]*y+m[8]*z;
      const p=CAMERA/(CAMERA-Z);
      out[offset]=this.width*.5+X*this.radius*p;
      out[offset+1]=this.width*.5-Y*this.radius*p;
      out[offset+2]=Z;out[offset+3]=p;
    }

    body(c,time,activity) {
      const s=this.width,R=this.screenRadius,m=s*.5;
      c.save();
      // Soft atmospheric falloff, then one continuous convex sphere.
      let g=c.createRadialGradient(m,m,R*.76,m,m,R*1.18);
      g.addColorStop(0,'rgba(15,126,246,0)');g.addColorStop(.55,'rgba(12,128,250,.21)');
      g.addColorStop(.79,'rgba(44,178,255,.09)');g.addColorStop(1,'rgba(0,80,255,0)');
      c.fillStyle=g;c.fillRect(0,0,s,s);
      c.beginPath();c.arc(m,m,R,0,TAU);c.clip();
      // Directional illumination gives the entire centre a spherical surface.
      const hx=m-R*.35+Math.sin(this.yaw)*R*.17,hy=m-R*.4-Math.sin(this.pitch)*R*.15;
      g=c.createRadialGradient(hx,hy,R*.03,m+R*.15,m+R*.22,R*1.30);
      g.addColorStop(0,'rgba(30,100,147,.92)');
      g.addColorStop(.28,'rgba(12,55,89,.97)');
      g.addColorStop(.62,'rgba(4,22,43,.98)');
      g.addColorStop(.85,'rgba(5,33,65,.99)');
      g.addColorStop(1,'rgba(13,82,139,1)');
      c.fillStyle=g;c.fillRect(m-R,m-R,R*2,R*2);
      // Reflected cool light across the lower hemisphere.
      g=c.createRadialGradient(m+R*.44,m+R*.86,0,m+R*.44,m+R*.86,R*.95);
      g.addColorStop(0,'rgba(26,132,238,.31)');g.addColorStop(.6,'rgba(20,94,195,.08)');g.addColorStop(1,'rgba(14,54,110,0)');
      c.fillStyle=g;c.fillRect(m-R,m-R,R*2,R*2);
      // Broad, curved surface reflection: a sheet of light, not a white dot.
      c.save();c.translate(hx,hy);c.rotate(-.58+this.yaw*.22);c.scale(1,.48);
      g=c.createRadialGradient(0,0,0,0,0,R*.67);
      g.addColorStop(0,'rgba(154,223,255,.16)');g.addColorStop(.4,'rgba(77,175,239,.07)');g.addColorStop(1,'rgba(87,181,255,0)');
      c.fillStyle=g;c.fillRect(-R,-R,R*2,R*2);c.restore();
      c.restore();
    }

    buildPaths(rotation,time) {
      this.backBuckets=Array.from({length:24},()=>new Path2D());
      this.frontBuckets=Array.from({length:24},()=>new Path2D());
      for(const path of this.paths) {
        const q=path.screen,p=path.pts;
        for(let j=0;j<=path.samples;j++)this.project(p[j*3],p[j*3+1],p[j*3+2],rotation,q,j*4);
        for(let j=1;j<=path.samples;j++) {
          const i=j*4,l=i-4,z=(q[i+2]+q[l+2])*.5;
          const depth=clamp(Math.floor(Math.abs(z)*5.6),0,5);
          const bucket=(z>0?this.frontBuckets:this.backBuckets)[path.colour*6+depth];
          bucket.moveTo(q[l],q[l+1]);bucket.lineTo(q[i],q[i+1]);
        }
      }
    }
    drawPaths(c,front,activity) {
      const bucket=front?this.frontBuckets:this.backBuckets,scale=this.width/640;
      c.save();c.globalCompositeOperation='screen';c.lineCap='round';c.lineJoin='round';
      for(let i=0;i<bucket.length;i++) {
        const col=palettes[Math.floor(i/6)],z=(i%6)/5;
        // Far-side paths are dimmed by the glass volume. Near paths can cross
        // the centre; there is intentionally NO radial cutout or dark disc.
        const a=front?(.46-.17*z):(.085+.025*(1-z));
        c.strokeStyle=rgba(col,a*.17);c.lineWidth=(front?7.5:3.5)*scale;c.stroke(bucket[i]);
        c.strokeStyle=rgba(col,a*(1+activity*.14));c.lineWidth=(front?1.03:.72)*scale;c.stroke(bucket[i]);
      }
      c.restore();
    }
    pulses(c,time,front) {
      // Batch the same palette/trail styles. Original: up to 384 stroke submissions.
      // Batched: at most 64, with all 48 filaments and their original trail lengths.
      const buckets=Array.from({length:16},()=>new Path2D()),used=new Uint8Array(16);
      const sprites=[],head=new Float32Array(4),point=new Float32Array(4),sc=this.width/640;
      for(const path of this.paths) {
        const u=((time*path.pulseSpeed+path.phase)%1+1)%1;
        const index=u*path.samples,q=path.screen,k=path.colour;
        sampleFilament(q,path.samples,index,head);
        if((head[2]>=0)!==front)continue;
        for(let chunk=0;chunk<4;chunk++) {
          const b=buckets[k*4+chunk];used[k*4+chunk]=1;
          for(let n=0;n<=5;n++) {
            sampleFilament(q,path.samples,index-chunk*5-n,point);
            n?b.lineTo(point[0],point[1]):b.moveTo(point[0],point[1]);
          }
        }
        if(path.index%4===0)sprites.push([k,head[0],head[1],24*sc*head[3]]);
      }
      c.save();c.globalCompositeOperation='screen';c.lineCap='round';
      for(let k=0;k<4;k++)for(let chunk=0;chunk<4;chunk++) {
        if(!used[k*4+chunk])continue;
        const alpha=(1-chunk/4)*(front?.78:.13),col=palettes[k],b=buckets[k*4+chunk];
        c.strokeStyle=rgba(col,alpha*.22);c.lineWidth=(6-chunk*.65)*sc;c.stroke(b);
        c.strokeStyle=rgba(col,alpha);c.lineWidth=(1.95-chunk*.24)*sc;c.stroke(b);
      }
      c.globalAlpha=front?.88:.19;
      for(const [k,x,y,size] of sprites)c.drawImage(k===3?this.goldSprite:k===2?this.purpleSprite:this.particleSprite,x-size/2,y-size/2,size,size);
      c.restore();
    }
    dots(c,rotation,time,front) {
      const out=this.projection,scale=this.width/640;
      c.save();c.globalCompositeOperation='screen';
      for(const dot of this.particles) {
        const p=dot.p;this.project(p[0],p[1],p[2],rotation,out);
        if((out[2]>0)!==front)continue;
        const alpha=(front?.44:.10)*(.85+.15*Math.sin(time*.65+dot.phase));
        const r=dot.size*scale*out[3];
        c.fillStyle=rgba(palettes[dot.colour],alpha);c.beginPath();c.arc(out[0],out[1],Math.max(.35,r),0,TAU);c.fill();
        if(dot.size>1.3){const size=r*8;c.globalAlpha=alpha;c.drawImage(dot.colour===3?this.goldSprite:this.particleSprite,out[0]-size/2,out[1]-size/2,size,size);c.globalAlpha=1;}
      }
      c.restore();
    }

    labelTexture(key,text,font,spacing,colour) {
      const cacheKey=[text,font,spacing,colour,this.width].join('|');
      if(this.labels.get(key)?.key===cacheKey)return this.labels.get(key).canvas;
      const t=document.createElement('canvas'),x=t.getContext('2d');
      x.font=font;const letters=Array.from(text),w=letters.reduce((sum,v)=>sum+x.measureText(v).width,0)+Math.max(0,letters.length-1)*spacing;
      const fontSize=parseFloat(font.match(/([\d.]+)px/)[1]);
      const pad=fontSize*.7;t.width=Math.ceil(w+pad*2);t.height=Math.ceil(fontSize*2.1);
      x.font=font;x.textBaseline='middle';x.fillStyle=colour;x.shadowColor='rgba(93,191,255,.65)';x.shadowBlur=fontSize*.21;
      let pos=(t.width-w)*.5;
      for(const letter of letters){x.fillText(letter,pos,t.height*.5);pos+=x.measureText(letter).width+spacing;}
      this.labels.set(key,{key:cacheKey,canvas:t});return t;
    }
    plane(c,image,centre,width,height,rotation,key) {
      // Project a textured quad using its centre + tangent basis. The plane
      // is embedded at its own depth, not a screen-fixed HTML label.
      const p=new Float32Array(4),ex=new Float32Array(4),ey=new Float32Array(4);
      this.project(...centre,rotation,p);
      this.project(centre[0]+width,centre[1],centre[2],rotation,ex);
      this.project(centre[0],centre[1]-height,centre[2],rotation,ey);
      const ax=(ex[0]-p[0])/image.width,ay=(ex[1]-p[1])/image.width;
      const bx=(ey[0]-p[0])/image.height,by=(ey[1]-p[1])/image.height;
      c.save();c.transform(ax,ay,bx,by,p[0]-(ex[0]-p[0])*.5-(ey[0]-p[0])*.5,p[1]-(ex[1]-p[1])*.5-(ey[1]-p[1])*.5);
      c.drawImage(image,0,0);c.restore();
      this.projectedLabels[key]={x:p[0]/this.width,y:p[1]/this.width,z:p[2]};
    }
    copy(c,rotation,time,activity) {
      const scale=this.width/640;
      const title=this.labelTexture('title','LUCIA',`400 ${46*scale}px "Segoe UI",Arial,sans-serif`,9*scale,'#e9f9ff');
      const status=document.getElementById('core-status')?.textContent||'Ready when you are';
      const sub=this.labelTexture('status',status,`400 ${15*scale}px "Segoe UI",Arial,sans-serif`,0,'#b8def2');
      const cap=this.labelTexture('caption','YOUR PERSONAL AI COMMAND CENTER',`500 ${6.8*scale}px "Segoe UI",Arial,sans-serif`,1.1*scale,'#70a7c6');
      const draw=(image,point,key)=>this.plane(c,image,point,image.width/this.radius,image.height/this.radius,rotation,key);
      // Distinct z positions are visible when the ball follows the cursor.
      draw(cap,[0,-.49,-.10],'caption');
      draw(sub,[0,-.055,.17],'status');
      draw(title,[0,.20,.42],'title');
      const bars=25,p=new Float32Array(4),q=new Float32Array(4);
      c.save();c.lineCap='round';c.strokeStyle='#b0c7ff';c.lineWidth=Math.max(1,2.2*scale);
      for(let i=0;i<bars;i++) {
        const x=(i-(bars-1)/2)*.0165;
        const envelope=Math.pow(1-Math.abs(i-(bars-1)/2)/((bars+1)/2),1.3);
        const h=.013+envelope*(.038+activity*.055)*(.7+.3*Math.sin(time*(activity>.5?7:2)+i*.75));
        this.project(x,-.285+h,.55,rotation,p);this.project(x,-.285-h,.55,rotation,q);
        c.globalAlpha=.55+envelope*.45;c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(q[0],q[1]);c.stroke();
      }
      this.project(0,-.285,.55,rotation,p);this.projectedLabels.waveform={x:p[0]/this.width,y:p[1]/this.width,z:p[2]};
      c.restore();
    }
    glass(c,time) {
      const R=this.screenRadius,m=this.width*.5;
      c.save();c.globalCompositeOperation='screen';
      // Fresnel rim, continuously graded: a sphere edge, not a neon hoop.
      const g=c.createRadialGradient(m,m,R*.83,m,m,R*1.025);
      g.addColorStop(0,'rgba(28,104,235,0)');g.addColorStop(.66,'rgba(29,148,255,.035)');
      g.addColorStop(.87,'rgba(106,217,255,.24)');g.addColorStop(.96,'rgba(47,142,255,.12)');g.addColorStop(1,'rgba(26,85,220,0)');
      c.fillStyle=g;c.fillRect(0,0,this.width,this.width);
      // Curved highlight moves with gaze and is not attached to the UI.
      c.save();c.translate(m,m);c.rotate(-.5+this.yaw*.5);
      c.beginPath();c.ellipse(-R*.13,-R*.15,R*.91,R*.88,0,Math.PI*1.08,Math.PI*1.72);
      c.strokeStyle='rgba(132,218,255,.18)';c.lineWidth=1.4*this.width/640;c.stroke();c.restore();
      c.restore();
    }
    draw(time,activity) {
      if(!this.ready)return;
      const start=performance.now(),c=this.ctx,s=this.width;
      c.clearRect(0,0,s,s);
      // CSS pitch is inverted to convert from screen Y-down to world Y-up.
      const copyRotation=this.matrix(this.yaw,-this.pitch);
      const shellRotation=this.matrix(this.yaw+time*.055,-this.pitch+.14,.10+Math.sin(time*.11)*.035);
      this.body(c,time,activity);this.buildPaths(shellRotation,time);
      this.drawPaths(c,false,activity);this.dots(c,shellRotation,time,false);this.pulses(c,time,false);
      this.copy(c,copyRotation,time,activity);
      this.drawPaths(c,true,activity);this.dots(c,shellRotation,time,true);this.pulses(c,time,true);this.glass(c,time);
      this.frames++;this.lastTime=time;
      // Small reflection texture is copied infrequently, not a readback.
      if(this.reflectionCanvas&&time-this.reflectionTime>=1/30){
        const r=this.reflectionContext;r.clearRect(0,0,512,512);r.drawImage(this.canvas,0,0,512,512);this.reflectionTime=time;this.reflectionVersion=(this.reflectionVersion||0)+1;
      }
      this.drawCosts.push(performance.now()-start);if(this.drawCosts.length>120)this.drawCosts.shift();
    }
    get stats() {
      return {mode:this.mode,filaments:this.paths.length,points:this.particles.length,
        frames:this.frames,yaw:this.yaw,pitch:this.pitch,renderSize:this.width,
        labels:this.projectedLabels,hasRasterRing:false,
        meanRenderMs:this.drawCosts.length?this.drawCosts.reduce((a,b)=>a+b,0)/this.drawCosts.length:0};
    }
  }
export default SphereRenderer;
