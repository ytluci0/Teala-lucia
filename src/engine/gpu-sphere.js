import SphereRenderer from './sphere.js';
import { sampleFilament } from './motion.js';

const TAU = Math.PI * 2;
const colours = [[26,155,255], [90,218,255], [144,102,255], [255,190,130]];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const LINE_VERT = `attribute vec2 position;attribute float edge;attribute float halfWidth;attribute vec4 colour;uniform vec2 resolution;varying float vEdge;varying float vWidth;varying vec4 vColour;void main(){gl_Position=vec4(position/resolution*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);vEdge=edge;vWidth=halfWidth;vColour=colour;}`;
const LINE_FRAG = `precision mediump float;varying float vEdge;varying float vWidth;varying vec4 vColour;void main(){float alpha=vColour.a*(1.-smoothstep(max(0.,vWidth-.6),vWidth+.6,abs(vEdge)));gl_FragColor=vec4(vColour.rgb*alpha,alpha);}`;
const IMAGE_VERT = `attribute vec2 position;attribute vec2 texcoord;attribute float opacity;uniform vec2 resolution;varying vec2 vUV;varying float vOpacity;void main(){gl_Position=vec4(position/resolution*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);vUV=texcoord;vOpacity=opacity;}`;
const IMAGE_FRAG = `precision mediump float;uniform sampler2D image;varying vec2 vUV;varying float vOpacity;void main(){gl_FragColor=texture2D(image,vUV)*vOpacity;}`;
const DOT_VERT = `attribute vec2 position;attribute float radius;attribute vec4 colour;uniform vec2 resolution;varying float vRadius;varying vec4 vColour;void main(){gl_Position=vec4(position/resolution*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);gl_PointSize=2.*(radius+1.);vRadius=radius;vColour=colour;}`;
const DOT_FRAG = `precision mediump float;varying float vRadius;varying vec4 vColour;void main(){float d=length(gl_PointCoord-.5)*2.*(vRadius+1.);float a=vColour.a*(1.-smoothstep(max(0.,vRadius-.5),vRadius+.5,d));gl_FragColor=vec4(vColour.rgb*a,a);}`;

class Vertices {
  constructor(capacity = 600000) { this.data = new Float32Array(capacity); this.length = 0; }
  reset() { this.length = 0; }
  vertex(x,y,edge,half,r,g,b,a) {
    const p=this.length,d=this.data;d[p]=x;d[p+1]=y;d[p+2]=edge;d[p+3]=half;d[p+4]=r;d[p+5]=g;d[p+6]=b;d[p+7]=a;this.length+=8;
  }
}

// Reuses the supplied renderer's XYZ paths, projection, lighting, glyph textures,
// colours and activity states. Only the draw submission backend changes.
class GpuSphereRenderer extends SphereRenderer {
  constructor(canvas, fallback) {
    const scratch = document.createElement('canvas');
    super(scratch, null, fallback, { anchor: canvas.closest('.core'), deferDraw: true });
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error('WebGL core unavailable');
    this.listeners = new AbortController();
    this.mode = 'gpu-projected-3d-sphere';
    this.lineVertices = new Vertices();
    this.imageVertices = new Float32Array(30);
    this.dotVertices = new Float32Array(390 * 7);
    this.trail = new Float32Array(6 * 4);
    this.scratchPoint = new Float32Array(4);
    this.bodyCanvas = document.createElement('canvas');
    this.glassCanvas = document.createElement('canvas');
    this.bodyContext = this.bodyCanvas.getContext('2d');
    this.glassContext = this.glassCanvas.getContext('2d');
    this.paths.forEach(p => p.normals = new Float32Array((p.samples + 1) * 2));
    this.setupGPU(); this.resize(); this.draw(0,.1);
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault(); this.ready=false; this.lost=true;
      this.anchor.classList.remove('sphere-rendered');
    }, { signal: this.listeners.signal });
    canvas.addEventListener('webglcontextrestored', () => {
      this.setupGPU(); this.surfaceKey=''; this.ready=true; this.lost=false; this.firstDraw=false;
      this.anchor.classList.add('sphere-rendered');
      window.dispatchEvent(new Event('lucia-visual-ready'));
    }, { signal: this.listeners.signal });
  }

  compile(vertex, fragment, attributes) {
    const g=this.gl,p=g.createProgram();
    for(const [type,source] of [[g.VERTEX_SHADER,vertex],[g.FRAGMENT_SHADER,fragment]]) {
      const shader=g.createShader(type);g.shaderSource(shader,source);g.compileShader(shader);
      if(!g.getShaderParameter(shader,g.COMPILE_STATUS))throw new Error(g.getShaderInfoLog(shader));
      g.attachShader(p,shader);g.deleteShader(shader);
    }
    g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(p));
    const result={program:p,resolution:g.getUniformLocation(p,'resolution'),attributes:{}};
    attributes.forEach(a=>result.attributes[a]=g.getAttribLocation(p,a));
    return result;
  }

  setupGPU() {
    const g=this.gl;this.textures=new Map();
    this.linesProgram=this.compile(LINE_VERT,LINE_FRAG,['position','edge','halfWidth','colour']);
    this.imagesProgram=this.compile(IMAGE_VERT,IMAGE_FRAG,['position','texcoord','opacity']);
    this.dotsProgram=this.compile(DOT_VERT,DOT_FRAG,['position','radius','colour']);
    this.imagesProgram.image=g.getUniformLocation(this.imagesProgram.program,'image');
    this.lineBuffer=g.createBuffer();this.imageBuffer=g.createBuffer();this.dotBuffer=g.createBuffer();
    g.disable(g.DEPTH_TEST);g.disable(g.CULL_FACE);g.enable(g.BLEND);
    this.ready=true;
  }

  resize() {
    const previousSize=this.width;
    super.resize();
    if(!this.gl)return;
    if(previousSize!==this.width&&this.textures){
      for(const [image,entry]of this.textures){
        if(![this.bodyCanvas,this.glassCanvas,this.particleSprite,this.goldSprite,this.purpleSprite].includes(image)){
          this.gl.deleteTexture(entry.texture);this.textures.delete(image);
        }
      }
    }
    this.gl.viewport(0,0,this.width,this.width);
    this.surfaceKey='';
    // The environment receives the GPU canvas directly: no intermediate CPU copy.
    this.reflectionCanvas=this.canvas;
  }

  blend(screen=true) {
    const g=this.gl;
    g.blendFuncSeparate(g.ONE,screen?g.ONE_MINUS_SRC_COLOR:g.ONE_MINUS_SRC_ALPHA,g.ONE,g.ONE_MINUS_SRC_ALPHA);
  }

  use(program, buffer) {
    const g=this.gl;g.useProgram(program.program);g.bindBuffer(g.ARRAY_BUFFER,buffer);
    g.uniform2f(program.resolution,this.width,this.width);
    // All shaders use at most four attribute locations. Avoid stale enables.
    for(let i=0;i<4;i++)g.disableVertexAttribArray(i);
  }

  attribute(location,size,stride,offset) {
    const g=this.gl;g.enableVertexAttribArray(location);g.vertexAttribPointer(location,size,g.FLOAT,false,stride,offset);
  }

  texture(image, refresh=false) {
    const g=this.gl;let entry=this.textures.get(image);
    if(!entry){entry={texture:g.createTexture(),width:0,height:0};this.textures.set(image,entry);refresh=true;}
    g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,entry.texture);
    if(refresh){
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
      if(entry.width===image.width&&entry.height===image.height)g.texSubImage2D(g.TEXTURE_2D,0,0,0,g.RGBA,g.UNSIGNED_BYTE,image);
      else {
        g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,image);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
        entry.width=image.width;entry.height=image.height;
      }
    }
  }

  image(image, x,y,ax,ay,bx,by,opacity=1) {
    const g=this.gl,p=this.imagesProgram,v=this.imageVertices;
    const corners=[[x,y,0,0],[x+ax,y+ay,1,0],[x+bx,y+by,0,1],[x+bx,y+by,0,1],[x+ax,y+ay,1,0],[x+ax+bx,y+ay+by,1,1]];
    for(let i=0;i<6;i++){const c=corners[i],j=i*5;v[j]=c[0];v[j+1]=c[1];v[j+2]=c[2];v[j+3]=c[3];v[j+4]=opacity;}
    this.use(p,this.imageBuffer);g.bufferData(g.ARRAY_BUFFER,v,g.STREAM_DRAW);
    this.attribute(p.attributes.position,2,20,0);this.attribute(p.attributes.texcoord,2,20,8);this.attribute(p.attributes.opacity,1,20,16);
    this.texture(image);g.uniform1i(p.image,0);g.drawArrays(g.TRIANGLES,0,6);
  }

  surfaces(time,activity) {
    const key=`${this.width}:${this.yaw.toFixed(4)}:${this.pitch.toFixed(4)}`;
    if(key===this.surfaceKey)return;
    const size=this.width;
    if(this.bodyCanvas.width!==size){this.bodyCanvas.width=this.bodyCanvas.height=size;this.glassCanvas.width=this.glassCanvas.height=size;}
    this.bodyContext.clearRect(0,0,size,size);this.glassContext.clearRect(0,0,size,size);
    super.body(this.bodyContext,time,activity);super.glass(this.glassContext,time);
    this.texture(this.bodyCanvas,true);this.texture(this.glassCanvas,true);this.surfaceKey=key;
  }

  normals(q,count,closed,output) {
    for(let j=0;j<count;j++) {
      const before=(j===0?(closed?count-1:0):j-1)*4,after=(j===count-1?(closed?0:count-1):j+1)*4;
      const dx=q[after]-q[before],dy=q[after+1]-q[before+1],len=Math.hypot(dx,dy)||1;
      output[j*2]=-dy/len;output[j*2+1]=dx/len;
    }
    if(closed){output[count*2]=output[0];output[count*2+1]=output[1];}
  }

  segment(q,a,b,normals,half,col,alpha) {
    const v=this.lineVertices,w=half+.65,ai=a*4,bi=b*4;
    const anx=normals[a*2]*w,any=normals[a*2+1]*w,bnx=normals[b*2]*w,bny=normals[b*2+1]*w;
    const r=col[0]/255,g=col[1]/255,bl=col[2]/255;
    const ax=q[ai],ay=q[ai+1],bx=q[bi],by=q[bi+1];
    v.vertex(ax+anx,ay+any,w,half,r,g,bl,alpha);v.vertex(ax-anx,ay-any,-w,half,r,g,bl,alpha);v.vertex(bx+bnx,by+bny,w,half,r,g,bl,alpha);
    v.vertex(bx+bnx,by+bny,w,half,r,g,bl,alpha);v.vertex(ax-anx,ay-any,-w,half,r,g,bl,alpha);v.vertex(bx-bnx,by-bny,-w,half,r,g,bl,alpha);
  }

  flushLines() {
    const g=this.gl,p=this.linesProgram,v=this.lineVertices;
    if(!v.length)return;
    this.use(p,this.lineBuffer);g.bufferData(g.ARRAY_BUFFER,v.data.subarray(0,v.length),g.STREAM_DRAW);
    this.attribute(p.attributes.position,2,32,0);this.attribute(p.attributes.edge,1,32,8);
    this.attribute(p.attributes.halfWidth,1,32,12);this.attribute(p.attributes.colour,4,32,16);
    g.drawArrays(g.TRIANGLES,0,v.length/8);
  }

  projectGeometry(rotation) {
    for(const path of this.paths){
      const p=path.pts,q=path.screen;
      for(let j=0;j<=path.samples;j++)this.project(p[j*3],p[j*3+1],p[j*3+2],rotation,q,j*4);
      this.normals(q,path.samples,true,path.normals);
    }
  }

  strands(front,activity) {
    const scale=this.width/640;
    for(const glow of [true,false]) {
      this.lineVertices.reset();
      for(const path of this.paths)for(let j=1;j<=path.samples;j++) {
        const q=path.screen,z=(q[j*4+2]+q[(j-1)*4+2])*.5;
        if((z>0)!==front)continue;
        const depth=clamp(Math.floor(Math.abs(z)*5.6),0,5)/5;
        const alpha=front?(.46-.17*depth):(.085+.025*(1-depth));
        const width=glow?(front?7.5:3.5):(front?1.03:.72);
        this.segment(q,j-1,j,path.normals,width*scale/2,colours[path.colour],alpha*(glow?.17:1+activity*.14));
      }
      this.flushLines();
    }
  }

  energyPulses(time,front) {
    const normals=new Float32Array(12),head=this.scratchPoint,scale=this.width/640,sprites=[];
    for(const glow of [true,false]) {
      this.lineVertices.reset();
      for(const path of this.paths) {
        const index=(((time*path.pulseSpeed+path.phase)%1+1)%1)*path.samples;
        sampleFilament(path.screen,path.samples,index,head);
        if((head[2]>=0)!==front)continue;
        if(glow&&path.index%4===0)sprites.push([path.colour,head[0],head[1],24*scale*head[3]]);
        for(let chunk=0;chunk<4;chunk++) {
          for(let n=0;n<=5;n++){sampleFilament(path.screen,path.samples,index-chunk*5-n,head);this.trail.set(head,n*4);}
          this.normals(this.trail,6,false,normals);
          const width=(glow?6-chunk*.65:1.95-chunk*.24)*scale;
          const alpha=(1-chunk/4)*(front?.78:.13)*(glow?.22:1);
          for(let j=1;j<6;j++)this.segment(this.trail,j-1,j,normals,width/2,colours[path.colour],alpha);
        }
      }
      this.flushLines();
    }
    for(const [k,x,y,size]of sprites)this.image(k===3?this.goldSprite:k===2?this.purpleSprite:this.particleSprite,x-size/2,y-size/2,size,0,0,size,front?.88:.19);
  }

  particlesGPU(rotation,time,front) {
    const p=this.dotsProgram,g=this.gl,v=this.dotVertices,scale=this.width/640,point=this.scratchPoint,sprites=[];let count=0;
    for(const dot of this.particles) {
      this.project(...dot.p,rotation,point);if((point[2]>0)!==front)continue;
      const alpha=(front?.44:.10)*(.85+.15*Math.sin(time*.65+dot.phase)),r=dot.size*scale*point[3],col=colours[dot.colour];
      v.set([point[0],point[1],Math.max(.35,r),col[0]/255,col[1]/255,col[2]/255,alpha],count*7);count++;
      if(dot.size>1.3)sprites.push([dot.colour,point[0],point[1],r*8,alpha]);
    }
    this.use(p,this.dotBuffer);g.bufferData(g.ARRAY_BUFFER,v.subarray(0,count*7),g.STREAM_DRAW);
    this.attribute(p.attributes.position,2,28,0);this.attribute(p.attributes.radius,1,28,8);this.attribute(p.attributes.colour,4,28,12);
    g.drawArrays(g.POINTS,0,count);
    for(const [k,x,y,size,a]of sprites)this.image(k===3?this.goldSprite:this.particleSprite,x-size/2,y-size/2,size,0,0,size,a);
  }

  copyGPU(rotation,time,activity) {
    const scale=this.width/640;
    const title=this.labelTexture('title','LUCIA',`400 ${46*scale}px "Segoe UI",Arial,sans-serif`,9*scale,'#e9f9ff');
    const sub=this.labelTexture('status',document.getElementById('core-status')?.textContent||'Ready when you are',`400 ${15*scale}px "Segoe UI",Arial,sans-serif`,0,'#b8def2');
    const cap=this.labelTexture('caption','YOUR PERSONAL AI COMMAND CENTER',`500 ${6.8*scale}px "Segoe UI",Arial,sans-serif`,1.1*scale,'#70a7c6');
    const p=new Float32Array(4),ex=new Float32Array(4),ey=new Float32Array(4);
    for(const [image,centre,key]of [[cap,[0,-.49,-.10],'caption'],[sub,[0,-.055,.17],'status'],[title,[0,.20,.42],'title']]){
      this.project(...centre,rotation,p);this.project(centre[0]+image.width/this.radius,centre[1],centre[2],rotation,ex);this.project(centre[0],centre[1]-image.height/this.radius,centre[2],rotation,ey);
      this.image(image,p[0]-(ex[0]-p[0])*.5-(ey[0]-p[0])*.5,p[1]-(ex[1]-p[1])*.5-(ey[1]-p[1])*.5,ex[0]-p[0],ex[1]-p[1],ey[0]-p[0],ey[1]-p[1]);
      this.projectedLabels[key]={x:p[0]/this.width,y:p[1]/this.width,z:p[2]};
    }
    this.lineVertices.reset();const line=new Float32Array(8),norm=new Float32Array(4),bars=25;
    for(let i=0;i<bars;i++) {
      const x=(i-(bars-1)/2)*.0165,envelope=Math.pow(1-Math.abs(i-(bars-1)/2)/((bars+1)/2),1.3);
      const h=.013+envelope*(.038+activity*.055)*(.7+.3*Math.sin(time*(activity>.5?7:2)+i*.75));
      this.project(x,-.285+h,.55,rotation,line);this.project(x,-.285-h,.55,rotation,line,4);
      this.normals(line,2,false,norm);this.segment(line,0,1,norm,Math.max(1,2.2*scale)/2,[176,199,255],.55+envelope*.45);
    }
    this.flushLines();this.project(0,-.285,.55,rotation,p);this.projectedLabels.waveform={x:p[0]/this.width,y:p[1]/this.width,z:p[2]};
  }

  labelTexture(...args) {
    const previous=this.labels.get(args[0])?.canvas,result=super.labelTexture(...args);
    if(previous&&previous!==result&&this.textures?.has(previous)){this.gl.deleteTexture(this.textures.get(previous).texture);this.textures.delete(previous);}
    return result;
  }

  draw(time,activity) {
    if(!this.gl||!this.ready||this.lost)return;
    const start=performance.now(),g=this.gl,s=this.width;
    const copyRotation=this.matrix(this.yaw,-this.pitch),rotation=this.matrix(this.yaw+time*.055,-this.pitch+.14,.10+Math.sin(time*.11)*.035);
    this.surfaces(time,activity);g.viewport(0,0,s,s);g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT);
    this.blend(false);this.image(this.bodyCanvas,0,0,s,0,0,s);
    this.projectGeometry(rotation);this.blend(true);
    this.strands(false,activity);this.particlesGPU(rotation,time,false);this.energyPulses(time,false);
    this.blend(false);this.copyGPU(copyRotation,time,activity);
    this.blend(true);this.strands(true,activity);this.particlesGPU(rotation,time,true);this.energyPulses(time,true);this.image(this.glassCanvas,0,0,s,0,0,s);
    this.frames++;this.lastTime=time;
    if(time-this.reflectionTime>=1/30){this.reflectionTime=time;this.reflectionVersion=(this.reflectionVersion||0)+1;}
    this.drawCosts.push(performance.now()-start);if(this.drawCosts.length>120)this.drawCosts.shift();
  }

  destroy() {
    this.listeners?.abort();const g=this.gl;
    if(g){for(const p of [this.linesProgram,this.imagesProgram,this.dotsProgram])if(p)g.deleteProgram(p.program);for(const b of [this.lineBuffer,this.imageBuffer,this.dotBuffer])if(b)g.deleteBuffer(b);for(const t of this.textures?.values()||[])g.deleteTexture(t.texture);}
    super.destroy();
  }
}

export default function createSphereRenderer(canvas, fallback) {
  try { return new GpuSphereRenderer(canvas, fallback); }
  catch(error) {
    console.warn('Lucia core is using its original Canvas fallback:', error.message);
    // A canvas cannot change context types after acquiring WebGL. Preserve the
    // React-owned element and clean up the fallback sibling on unmount.
    const replacement=document.createElement('canvas'),id=canvas.id;
    replacement.id=id;canvas.removeAttribute('id');canvas.hidden=true;canvas.after(replacement);
    const renderer=new SphereRenderer(replacement,null,fallback),dispose=renderer.destroy.bind(renderer);
    renderer.destroy=()=>{dispose();replacement.remove();canvas.id=id;canvas.hidden=false;};
    return renderer;
  }
}
