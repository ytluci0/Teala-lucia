import { resolutionFor } from './motion.js';

/* LUCIA / live spatial environment.
 * No photograph, panorama, screenshot or baked floor is used here.
 * WebGL renders ray/plane/cylinder intersections in world space, with a
 * fixed perspective camera. Only the isolated Lucia core follows the pointer.
 * Ring and card reflections are deliberately softened approximations,
 * not a claim of full physically based refraction or global illumination.
 */

  const VERT = `attribute vec2 a;varying vec2 uv;void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}`;
  const FRAG = `precision highp float;
  varying vec2 uv;
  uniform vec2 resolution;
  uniform vec2 cameraOffset;
  uniform float clock;
  uniform float activity;
  uniform float focal;
  uniform float horizon;
  uniform vec4 core; // x, centre height, z, half-size
  uniform vec2 coreGaze; // CSS yaw, pitch in radians; room camera remains fixed
  uniform float radius;
  uniform vec4 panel[6]; // x, centre height, z, half-width
  uniform vec3 shape[6]; // half-height, yaw, intensity
  uniform sampler2D ringTexture;
  uniform sampler2D cardAtlas;
  const vec3 BLUE=vec3(.045,.47,1.);
  const vec3 ICE=vec3(.38,.86,1.);
  const vec3 GOLD=vec3(1.,.60,.26);
  float line(float d,float w){return exp(-abs(d)/max(w,.0001));}
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float roundBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
  vec3 environment(vec3 ro,vec3 rd){
    // A distant back wall and two side walls, projected in the same space.
    float t=(-48.-ro.z)/rd.z;
    vec3 p=ro+rd*t;
    float x=p.x,y=p.y;
    float central=exp(-abs(x)*.075-abs(y-4.)*.16);
    vec3 col=vec3(.007,.016,.028)+vec3(.006,.018,.030)*central;
    float panelSeam=line(mod(x+3.6,7.2)-3.6,.026);
    float ribs=exp(-pow((mod(x+3.6,7.2)-3.6)/.20,2.));
    float ribFade=exp(-abs(y-7.)*.09);
    col+=vec3(.020,.105,.18)*ribs*ribFade;
    float slab=exp(-pow((mod(x+3.6,7.2)-3.6)/1.05,4.));
    col+=vec3(.004,.014,.025)*slab*exp(-abs(y-7.)*.12);
    col+=BLUE*panelSeam*.035*ribFade;
    float rearFoot=line(y,.08)*exp(-abs(x)*.025);
    col+=BLUE*rearFoot*.12;
    // Warm architectural light slots, not a blurred image layer.
    float slots=exp(-pow((mod(x+4.8,9.6)-4.8)/1.15,2.));
    col+=GOLD*slots*exp(-pow((y-2.8)/.16,2.))*.38;
    col+=GOLD*slots*exp(-pow((y-2.8)/.85,2.))*.035;
    col+=BLUE*slots*exp(-pow((y-6.5)/.20,2.))*.15;
    col+=BLUE*slots*exp(-pow((y-6.5)/1.3,2.))*.024;
    float sideT=rd.x>0.?(19.-ro.x)/rd.x:(-19.-ro.x)/rd.x;
    if(sideT>0. && sideT<t){
      vec3 w=ro+rd*sideT;
      float v=mod(w.z+3.,8.)-4.;
      vec3 wall=vec3(.008,.020,.034);
      wall+=BLUE*line(v,.06)*exp(-abs(w.y-5.)*.15)*.28;
      wall+=BLUE*line(v,.6)*exp(-abs(w.y-4.)*.2)*.06;
      wall+=GOLD*exp(-pow((v-1.8)/.65,2.))*exp(-pow((w.y-2.2)/.10,2.))*.23;
      wall*=.5+.5*exp(-sideT*.012);col=wall;
    }
    // Soft core light disperses into the room, not a flat full-screen halo.
    vec3 delta=vec3(core.x,core.y,core.z)-ro;
    float along=dot(delta,rd);
    float nearRay=length(delta-rd*along)/max(core.w,.2);
    col+=BLUE*exp(-nearRay*nearRay*1.65)*(.060+activity*.025);
    return col;
  }
  vec3 ringReflection(vec3 p,vec3 r){
    // CSS rotateX(pitch) rotateY(yaw), mapped into world Y-up coordinates.
    float cy=cos(coreGaze.x),sy=sin(coreGaze.x);
    float cp=cos(coreGaze.y),sp=sin(coreGaze.y);
    vec3 right=vec3(cy,-sp*sy,-cp*sy);
    vec3 up=vec3(0.,cp,-sp);
    vec3 normal=vec3(sy,sp*cy,cp*cy);
    float den=dot(r,normal);
    if(abs(den)<.0001)return vec3(0.);
    float t=dot(core.xyz-p,normal)/den;
    if(t<=0.)return vec3(0.);
    vec3 hit=p+r*t-core.xyz;
    vec2 q=vec2(dot(hit,right),dot(hit,up))/(2.*core.w)+.5;
    if(min(q.x,q.y)<0. || max(q.x,q.y)>1.)return vec3(0.);
    vec2 v=q-.5;float rad=length(v),theta=atan(v.y,v.x);
    float rim=smoothstep(.18,.33,rad)*(1.-smoothstep(.47,.56,rad));
    float a=theta+clock*.028+rim*(.023*sin(rad*24.-clock*.34)+.011*sin(theta*4.+clock*.28));
    float rr=rad+(sin(theta*3.+clock*.52)*.005+sin(theta*5.-clock*.31)*.003+sin(clock*.65)*.002)*rim;
    vec2 tq=.5+vec2(cos(a),sin(a))*rr;
    vec4 tex=texture2D(ringTexture,clamp(tq,.001,.999));
    vec4 tex2=texture2D(ringTexture,clamp(tq+vec2(.008,.006),.001,.999));
    return (tex.rgb*tex.a+tex2.rgb*tex2.a)*.14*(1.+activity*.15);
  }
  vec3 reflections(vec3 p,vec3 r){
    vec3 col=ringReflection(p,r);
    for(int i=0;i<6;i++){
      vec3 ce=panel[i].xyz;
      float yaw=shape[i].y;
      vec3 n=vec3(sin(yaw),0.,cos(yaw)),right=vec3(cos(yaw),0.,-sin(yaw));
      float den=dot(r,n);
      if(abs(den)>.001){
        float t=dot(ce-p,n)/den;
        if(t>0.){
          vec3 hit=p+r*t-ce;
          vec2 q=vec2(dot(hit,right)/(2.*panel[i].w),hit.y/(2.*shape[i].x))+.5;
          if(q.x>0. && q.x<1. && q.y>0. && q.y<1.){
            vec2 at=vec2((q.x+float(i))/6.,q.y);
            vec4 tex=texture2D(cardAtlas,at);
            vec4 blur=texture2D(cardAtlas,at+vec2(.0008,.007));
            float fade=pow(1.-q.y,.80)*.38;
            col+=(tex.rgb*tex.a+blur.rgb*blur.a)*.5*fade*shape[i].z;
          }
        }
      }
    }
    return col;
  }
  vec3 surface(vec3 ro,vec3 rd,vec3 p,bool platform){
    vec2 local=p.xz-vec2(core.x,core.z);
    float r=length(local),theta=atan(local.y,local.x);
    float coreLight=exp(-r*r/(radius*radius*1.7));
    vec3 col=vec3(.009,.020,.035)+vec3(.005,.021,.036)*coreLight;
    float grain=hash(floor(p.xz*110.));col+=vec3(grain*.002);
    // Subtle machined floor joints with distance attenuation.
    float dist=length(p-ro),aa=.0015*dist;
    float gx=abs(mod(p.x+1.8,3.6)-1.8),gz=abs(mod(p.z+1.8,3.6)-1.8);
    float seams=max(line(gx,.012+aa),line(gz,.012+aa));
    col+=vec3(.01,.034,.055)*seams*exp(-dist*.019)*.65;
    col+=BLUE*coreLight*(.045+activity*.025);
    if(platform){
      col=vec3(.012,.028,.047)+BLUE*coreLight*.065;
      // Solid dark circular dais with inset rings and tapered light channels.
      float ring1=line(r-radius*.97,.024);
      float ring2=line(r-radius*.85,.014);
      float ring3=line(r-radius*.64,.009);
      float ring4=line(r-radius*.47,.008);
      float rings=ring1*.8+ring2*.45+ring3*.30+ring4*.20;
      float sweep=pow(.5+.5*cos(theta*2.-clock*.18),12.);
      col+=BLUE*rings*(.70+sweep*1.8);
      col+=ICE*line(r-radius*.97,.010)*(.38+sweep*.9);
      col+=BLUE*line(r-radius*.97,.24)*.12;
      col+=BLUE*line(r-radius*.85,.14)*.05;
      float ticks=line(fract((theta+3.14159)*12.732)-.5,.035);
      col+=ICE*ticks*smoothstep(radius*.88,radius*.89,r)*(1.-smoothstep(radius*.915,radius*.925,r))*.18;
      float amber=pow(.5+.5*cos(theta-2.2),80.)+pow(.5+.5*cos(theta+.7),90.);
      col+=GOLD*amber*line(r-radius*.85,.030)*1.6;
      col+=GOLD*amber*line(r-radius*.85,.26)*.14;
    }
    // Warm, world-space floor fittings. Their reflections remain attached.
    for(int s=0;s<2;s++){
      float side=s==0?-1.:1.;
      vec2 at=vec2(side*(radius+1.1),core.z+.8);
      float g=length(p.xz-at);
      col+=GOLD*exp(-g*g/.20)*.18;
      col+=GOLD*exp(-g*g/2.)*.022;
    }
    vec3 reflected=reflect(rd,vec3(0.,1.,0.));
    float fresnel=.20+.72*pow(1.-max(-rd.y,0.),3.);
    col+=reflections(p,reflected)*(platform?.65:1.)*fresnel;
    col+=environment(p+vec3(0.,.005,0.),reflected)*.38*fresnel;
    // Foot lighting linked to the current panel positions, including scrolling.
    for(int i=0;i<6;i++){
      vec2 d=p.xz-panel[i].xz;
      float spread=exp(-d.x*d.x/(panel[i].w*panel[i].w*1.5)-d.y*d.y/2.5);
      vec3 tint=i==2?GOLD:(i==5?vec3(1.,.20,.51):BLUE);
      col+=tint*spread*.022*shape[i].z;
    }
    float fog=1.-exp(-dist*.013);
    return mix(col,vec3(.008,.018,.032),fog);
  }
  void main(){
    float aspect=resolution.x/resolution.y;
    vec3 ro=vec3(cameraOffset.x,3.4+cameraOffset.y,10.);
    vec3 rd=normalize(vec3((uv.x-.5)*aspect,uv.y-(1.-horizon),-focal));
    vec3 col=environment(ro,rd);
    if(rd.y<-.0001){
      float ground=-ro.y/rd.y;
      vec3 p=ro+rd*ground;
      if(p.z>-48. && abs(p.x)<19.){
      float td=(.14-ro.y)/rd.y;
      vec3 disk=ro+rd*td;
      bool platform=length(disk.xz-vec2(core.x,core.z))<radius;
      if(platform){p=disk;ground=td;}
      col=surface(ro,rd,p,platform);
      // Finite cylindrical sidewall: an actual thickness, not another ellipse.
      vec2 oc=ro.xz-vec2(core.x,core.z);
      float A=dot(rd.xz,rd.xz),B=dot(oc,rd.xz),C=dot(oc,oc)-radius*radius;
      float disc=B*B-A*C;
      if(disc>0.){
        float t=(-B-sqrt(disc))/A;
        vec3 wall=ro+rd*t;
        if(t>0. && t<ground && wall.y>=0. && wall.y<.14){
          float band=line(wall.y-.105,.013);
          col=vec3(.012,.031,.052)+BLUE*band*.64+ICE*line(wall.y-.135,.004)*.32;
          col+=BLUE*line(wall.y-.025,.01)*.10;
        }
      }
    }
    }
    // Gentle vignette retains foreground visibility.
    float vig=1.-.24*smoothstep(.3,.85,length((uv-.5)*vec2(1.,.82)));
    col*=vig;col=1.-exp(-max(col,0.)*1.25);
    gl_FragColor=vec4(pow(col,vec3(.82)),1.);
  }`;
  const POINT_VERT=`attribute vec4 point;uniform vec2 res;uniform vec2 cam;uniform float time;uniform float focal;uniform float horizon;varying float alpha;varying float warmth;void main(){
    vec3 pos=point.xyz;pos.y+=sin(time*.13+point.w*8.)*.16;pos.x+=sin(time*.09+point.w*12.)*.12;
    vec3 d=pos-vec3(cam.x,3.4+cam.y,10.);float depth=-d.z;vec2 p=vec2(d.x*focal/depth/(res.x/res.y),d.y*focal/depth)+(vec2(.5,1.-horizon));
    gl_Position=vec4(p*2.-1.,0.,1.);gl_PointSize=clamp((2.+point.w*3.)*10./depth,1.,5.);alpha=.16+point.w*.29;warmth=step(.88,point.w);
  }`;
  const POINT_FRAG=`precision mediump float;varying float alpha;varying float warmth;void main(){float d=length(gl_PointCoord-.5);float a=exp(-d*d*28.)*alpha;gl_FragColor=vec4(mix(vec3(.22,.67,1.),vec3(1.,.64,.3),warmth)*a,a);}`;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  class SpatialEnvironment{
    constructor(canvas,ringURL){
      this.quality=new URLSearchParams(location.search).get('quality')||'high';this.textureSizes=new Map();this.originalCanvas=canvas;this.originalId=canvas.id;this.listeners=new AbortController();this.canvas=canvas;this.width=innerWidth;this.height=innerHeight;this.focal=1.14;this.horizon=.34;
      this.reduced=matchMedia('(prefers-reduced-motion: reduce)');this.pointer={x:0,y:0};this.target={x:0,y:0};this.shift={stageX:0,stageY:0,cardsX:0,cardsY:0};
      this.cardData=new Float32Array(24);this.cardShape=new Float32Array(18);this.core=new Float32Array([0,5,-6,3]);
      this.mode='initializing';this.resolutionScale=1;this.stats={mode:this.mode,shaderErrors:[],frames:0};this.stage=document.querySelector('.lucia-stage');this.workspace=document.querySelector('.workspace');
      // Camera and HTML layout are deliberately independent of pointer movement.
      this.stage.style.removeProperty('translate');this.workspace.style.removeProperty('translate');
      this.gaze={yaw:0,pitch:0};
      // The reflection is supplied from the live sphere renderer; no ring artwork.
      this.ringImage=document.createElement('canvas');
      this.ringImage.width=this.ringImage.height=256;this.textureReady=true;
      this.atlas=this.createAtlas();
      try{
        this.gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
        if(!this.gl)throw new Error('WebGL unavailable');
        this.setupGL();this.mode='webgl-spatial';
      }catch(e){this.stats.shaderErrors.push(String(e));this.startFallback();}
      this.resize();
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.mode='context-lost';this.startFallback();this.resize();window.dispatchEvent(new Event('lucia-scene-ready'));},{signal:this.listeners.signal});
      document.documentElement.dataset.scene=this.mode;this.stats.mode=this.mode;
      const label=document.querySelector(".preview-label");if(label)label.title=this.mode==='webgl-spatial'?'Live WebGL environment · UI demonstration':'Reduced projected-canvas fallback · WebGL unavailable';
    }
    destroy(){
      this.listeners.abort();
      const g=this.gl;
      if(g){for(const p of [this.main,this.points])if(p)g.deleteProgram(p);for(const b of [this.quad,this.pointBuffer])if(b)g.deleteBuffer(b);for(const t of [this.ringTex,this.atlasTex])if(t)g.deleteTexture(t);}
      if(this.canvas!==this.originalCanvas)this.canvas.remove();
      this.originalCanvas.hidden=false;this.originalCanvas.id=this.originalId;
    }
    shader(type,code){const g=this.gl,s=g.createShader(type);g.shaderSource(s,code);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw new Error(g.getShaderInfoLog(s));return s;}
    program(vs,fs){const g=this.gl,p=g.createProgram(),v=this.shader(g.VERTEX_SHADER,vs),f=this.shader(g.FRAGMENT_SHADER,fs);g.attachShader(p,v);g.attachShader(p,f);g.linkProgram(p);g.deleteShader(v);g.deleteShader(f);if(!g.getProgramParameter(p,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(p));return p;}
    setupGL(){
      const g=this.gl;this.main=this.program(VERT,FRAG);this.points=this.program(POINT_VERT,POINT_FRAG);
      this.quad=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,this.quad);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),g.STATIC_DRAW);
      this.u={};['resolution','cameraOffset','clock','activity','focal','horizon','core','coreGaze','radius','panel[0]','shape[0]','ringTexture','cardAtlas'].forEach(n=>this.u[n]=g.getUniformLocation(this.main,n));
      this.ringTex=g.createTexture();this.atlasTex=g.createTexture();this.uploadTexture(this.ringTex,new Uint8Array([0,0,0,0]),true);this.uploadTexture(this.atlasTex,this.atlas);
      this.particles=[];for(let i=0;i<64;i++){const n=(i*.61803398875)%1,m=(i*.41421356237)%1,z=(i*.732050808)%1;this.particles.push((n-.5)*32,1.+m*12,-4-z*34,(i*.754877)%1);}
      this.pointBuffer=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,this.pointBuffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(this.particles),g.STATIC_DRAW);
      this.pu={};['res','cam','time','focal','horizon'].forEach(n=>this.pu[n]=g.getUniformLocation(this.points,n));
      g.disable(g.DEPTH_TEST);g.disable(g.CULL_FACE);
      this.mainAttribute=g.getAttribLocation(this.main,'a');this.pointAttribute=g.getAttribLocation(this.points,'point');
    }
    uploadTexture(tex,image,blank=false){
      const g=this.gl;g.bindTexture(g.TEXTURE_2D,tex);
      const size=blank?'1x1':`${image.width}x${image.height}`;
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      if(!blank&&this.textureSizes.get(tex)===size)g.texSubImage2D(g.TEXTURE_2D,0,0,0,g.RGBA,g.UNSIGNED_BYTE,image);
      else {
        if(blank)g.texImage2D(g.TEXTURE_2D,0,g.RGBA,1,1,0,g.RGBA,g.UNSIGNED_BYTE,image);
        else g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,image);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
        this.textureSizes.set(tex,size);
      }
    }
    createAtlas(){
      const c=document.createElement('canvas');c.width=1536;c.height=160;const x=c.getContext('2d');
      const rows=[['Email','12 new','3 require reply','#62dfff'],['Projects','8 active','2 due this week','#63dcff'],['Tasks','24 open','6 high priority','#ffd17a'],['Calendar','3 today','2 tomorrow','#69ddff'],['Knowledge','147 items','12 new this week','#82bcff'],['Approvals','3 pending','1 urgent','#ff80b6']];
      rows.forEach((d,i)=>{x.save();x.translate(i*256,0);x.beginPath();x.roundRect(3,3,250,154,12);const fill=x.createLinearGradient(0,0,250,160);fill.addColorStop(0,'#24435c');fill.addColorStop(.45,'#04182c');fill.addColorStop(1,'#073359');x.fillStyle=fill;x.fill();x.strokeStyle='#51c5ff';x.lineWidth=1.4;x.stroke();x.fillStyle='#17598e';x.beginPath();x.roundRect(18,22,42,42,10);x.fill();x.fillStyle='#d4f3ff';x.font='26px Segoe UI';x.fillText(['✉','⬡','☷','▦','▤','✓'][i],26,52);x.fillStyle='#eff7ff';x.font='600 16px Segoe UI';x.fillText(d[0],75,38);x.fillStyle='#b6d3ea';x.font='12px Segoe UI';x.fillText(d[1],75,63);x.fillText(d[2],75,83);x.fillStyle=d[3];x.shadowColor=d[3];x.shadowBlur=6;x.fillRect(17,143,102,2);x.restore();});return c;
    }
    startFallback(){
      if(this.gl){const replacement=document.createElement('canvas');replacement.id='scene-canvas';replacement.setAttribute('aria-hidden','true');this.originalCanvas.hidden=true;this.originalCanvas.removeAttribute('id');this.originalCanvas.after(replacement);this.canvas=replacement;}
      this.gl=null;this.ctx=this.canvas.getContext('2d',{alpha:false});this.mode='canvas-projected-fallback';document.documentElement.dataset.scene=this.mode;this.stats.mode=this.mode;
    }
    resize(){
      this.width=innerWidth;this.height=innerHeight;
      const scale=resolutionFor(this.width,this.height,devicePixelRatio||1,this.quality)*this.resolutionScale;
      this.canvas.width=Math.max(1,Math.round(this.width*scale));this.canvas.height=Math.max(1,Math.round(this.height*scale));
      if(this.gl)this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
      this.stats.renderSize=[this.canvas.width,this.canvas.height];this.stats.pixelRatio=scale;
    }
    measure(coreElement,carousel,cards){
      this.resize();const r=coreElement.getBoundingClientRect(),w=carousel.getBoundingClientRect();
      this.horizon=this.width<801?.30:.34;
      const cy=r.top+r.height*.5-this.shift.stageY,cx=r.left+r.width*.5-this.shift.stageX;
      const lower=r.bottom-this.shift.stageY;
      this.coreDepth=clamp((3.4-.48)*this.focal*this.height/Math.max(70,lower-this.horizon*this.height),8,28);
      this.core[0]=(cx-this.width/2)*this.coreDepth/(this.focal*this.height);
      this.core[1]=3.4+(this.horizon*this.height-cy)*this.coreDepth/(this.focal*this.height);
      this.core[2]=10-this.coreDepth;
      this.core[3]=r.width*this.coreDepth/(2*this.focal*this.height);
      this.platformRadius=this.core[3]*1.2;
      this.cardW=cards[0].offsetWidth;this.cardH=cards[0].offsetHeight;
      this.carouselTop=w.top-this.shift.cardsY;this.cardTop=cards[0].offsetTop;
      this.cardDepth=(3.4-.22)*this.focal*this.height/Math.max(100,this.carouselTop+this.cardTop+this.cardH-this.horizon*this.height);
      this.setCards(this.position??2,this.step??this.cardW+12);
    }
    setCards(position,step){
      this.position=position;this.step=step;
      if(!this.cardW)return;
      const f=this.focal*this.height;
      for(let i=0;i<6;i++){
        const d=i-position,n=Math.min(Math.abs(d),3.5),s=1.025-n*.028;
        // Align the reflected plane with the same positional yaw/scale as HTML.
        const z=this.cardDepth+n*.075;
        const centreY=this.carouselTop+this.cardTop+this.cardH/2+n*5;
        this.cardData.set([d*step*z/f,3.4+(this.horizon*this.height-centreY)*z/f,10-z,this.cardW*s*z/(2*f)],i*4);
        this.cardShape.set([this.cardH*s*z/(2*f),Math.sign(d)*Math.min(Math.abs(d)*14,25)*Math.PI/180,Math.max(.56,1-Math.abs(d)*.055)],i*3);
      }
    }
    project(x,y,z){const d=10-z;return [this.width/2+(x-this.pointer.x)*this.focal*this.height/d,this.horizon*this.height-(y-3.4-this.pointer.y)*this.focal*this.height/d];}
    updateCamera(){
      // Locked camera: no global parallax, stage translation, or carousel shift.
      this.pointer.x=0;this.pointer.y=0;
    }
    setCoreGaze(yaw,pitch){
      this.gaze.yaw=yaw;this.gaze.pitch=pitch;
    }
    adapt(elapsed,motion){
      if(!motion||elapsed>250||elapsed<3)return;
      this.slow=elapsed>32?(this.slow||0)+1:Math.max(0,(this.slow||0)-1);
      this.fast=elapsed<18?(this.fast||0)+1:0;
      if(this.slow>90&&this.resolutionScale>.75){this.resolutionScale=Math.max(.75,this.resolutionScale-.1);this.slow=0;this.fast=0;this.resize();}
      else if(this.fast>600&&this.resolutionScale<1){this.resolutionScale=Math.min(1,this.resolutionScale+.05);this.fast=0;this.resize();}
    }
    draw(time,dt,activity,motion){
      this.updateCamera(dt,motion);if(this.lastActivity!==activity){document.querySelector('#app').style.setProperty('--core-glow',String(.16+activity*.08));this.lastActivity=activity;}this.stats.frames++;this.stats.camera=[this.pointer.x,this.pointer.y];this.stats.coreGaze=[this.gaze.yaw,this.gaze.pitch];
      if(!this.gl){this.drawFallback(time,activity);return;}
      const g=this.gl;g.disable(g.BLEND);g.useProgram(this.main);g.bindBuffer(g.ARRAY_BUFFER,this.quad);
      const a=this.mainAttribute;g.enableVertexAttribArray(a);g.vertexAttribPointer(a,2,g.FLOAT,false,0,0);
      g.uniform2f(this.u.resolution,this.width,this.height);g.uniform2f(this.u.cameraOffset,this.pointer.x,this.pointer.y);
      g.uniform1f(this.u.clock,time);g.uniform1f(this.u.activity,activity);g.uniform1f(this.u.focal,this.focal);g.uniform1f(this.u.horizon,this.horizon);
      g.uniform4fv(this.u.core,this.core);g.uniform2f(this.u.coreGaze,this.gaze.yaw,this.gaze.pitch);g.uniform1f(this.u.radius,this.platformRadius||3.6);g.uniform4fv(this.u['panel[0]'],this.cardData);g.uniform3fv(this.u['shape[0]'],this.cardShape);
      g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.ringTex);g.uniform1i(this.u.ringTexture,0);
      g.activeTexture(g.TEXTURE1);g.bindTexture(g.TEXTURE_2D,this.atlasTex);g.uniform1i(this.u.cardAtlas,1);g.drawArrays(g.TRIANGLES,0,6);
      g.enable(g.BLEND);g.blendFunc(g.ONE,g.ONE_MINUS_SRC_ALPHA);g.useProgram(this.points);g.bindBuffer(g.ARRAY_BUFFER,this.pointBuffer);
      const at=this.pointAttribute;g.enableVertexAttribArray(at);g.vertexAttribPointer(at,4,g.FLOAT,false,0,0);
      g.uniform2f(this.pu.res,this.width,this.height);g.uniform2f(this.pu.cam,this.pointer.x,this.pointer.y);g.uniform1f(this.pu.time,time);g.uniform1f(this.pu.focal,this.focal);g.uniform1f(this.pu.horizon,this.horizon);g.drawArrays(g.POINTS,0,64);g.disable(g.BLEND);
    }
    drawFallback(time,activity){
      const c=this.ctx;if(!c)return;const sx=this.canvas.width/this.width,sy=this.canvas.height/this.height;
      c.setTransform(sx,0,0,sy,0,0);const w=this.width,h=this.height;
      c.fillStyle='#030b14';c.fillRect(0,0,w,h);
      const base=this.project(0,0,this.core[2]);let glow=c.createRadialGradient(base[0],base[1],0,base[0],base[1],w*.6);glow.addColorStop(0,'#0b3150');glow.addColorStop(.5,'#061323');glow.addColorStop(1,'#020710');c.fillStyle=glow;c.fillRect(0,0,w,h);
      for(let i=-4;i<=4;i++){const p=this.project(i*7,0,-48),top=this.project(i*7,15,-48);c.strokeStyle='#16425b55';c.lineWidth=2;c.beginPath();c.moveTo(...p);c.lineTo(...top);c.stroke();}
      c.strokeStyle='#214c6744';c.lineWidth=.65;for(let x=-28;x<=28;x+=3.5){c.beginPath();c.moveTo(...this.project(x,0,-45));c.lineTo(...this.project(x,0,5));c.stroke();}for(let z=-45;z<7;z+=3.5){c.beginPath();c.moveTo(...this.project(-45,0,z));c.lineTo(...this.project(45,0,z));c.stroke();}
      for(const ratio of [1,.97,.85,.64,.47]){c.beginPath();for(let a=0;a<=128;a++){const t=a/128*Math.PI*2,p=this.project(Math.cos(t)*this.platformRadius*ratio,.14,this.core[2]+Math.sin(t)*this.platformRadius*ratio);a?c.lineTo(...p):c.moveTo(...p);}if(ratio===1){c.fillStyle='#051425';c.fill();}c.strokeStyle=ratio===.97?'#29bcf9bb':'#3087b46b';c.lineWidth=ratio===.97?1.8:1;c.stroke();}
      // Reduced, projected reflection fallback; never restores a static photo.
      for(let i=0;i<6;i++){const [x,y,z,hw]=this.cardData.slice(i*4,i*4+4),hh=this.cardShape[i*3];const top=this.project(x,-y+hh,z),bottom=this.project(x,-y-hh,z);const ww=hw*2*this.focal*h/(10-z);c.save();c.globalAlpha=.16;c.translate(top[0]-ww/2,bottom[1]);c.scale(1,-1);c.drawImage(this.atlas,i*256,0,256,160,0,0,ww,Math.max(1,bottom[1]-top[1]));c.restore();}
      if(this.ringImage.complete||this.ringImage instanceof HTMLCanvasElement){const p=this.project(0,-this.core[1]+this.core[3],this.core[2]),b=this.project(0,-this.core[1]-this.core[3],this.core[2]);const ww=this.core[3]*2*this.focal*h/this.coreDepth;c.save();c.globalAlpha=.08;c.translate(p[0]-ww/2,b[1]);c.scale(1,-1);c.drawImage(this.ringImage,0,0,ww,b[1]-p[1]);c.restore();}
    }
  }
export default SpatialEnvironment;
