export const PARTIALS = 64;
export const SAMPLES = 2048;
export const TAU = 2 * Math.PI;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const emptyPartials = () => ({ amplitudes: Array(PARTIALS).fill(0), phases: Array(PARTIALS).fill(0) });
const bases = new Map();
function basis(size) {
  if (!bases.has(size)) {
    bases.set(size, Array.from({length: PARTIALS}, (_, k) => ({
      s: Float64Array.from({length:size}, (_,i) => Math.sin(TAU*(k+1)*i/size)),
      c: Float64Array.from({length:size}, (_,i) => Math.cos(TAU*(k+1)*i/size))
    })));
  }
  return bases.get(size);
}
export function coefficients(partials, suppress = true) {
  const real = new Float64Array(65), imag = new Float64Array(65);
  for (let k=1;k<=PARTIALS;k++) {
    const x = Math.PI*k/(PARTIALS+1);
    const a = partials.amplitudes[k-1]*(suppress ? Math.sin(x)/x : 1);
    real[k] = a*Math.sin(partials.phases[k-1]);
    imag[k] = a*Math.cos(partials.phases[k-1]);
  }
  return {real, imag};
}
export function synthesize(partials, {size=SAMPLES, suppress=true}={}) {
  const out = new Float32Array(size), b=basis(size), {real,imag}=coefficients(partials,suppress);
  for(let k=1;k<=PARTIALS;k++) {
    if(Math.abs(real[k])+Math.abs(imag[k])<1e-10) continue;
    for(let i=0;i<size;i++) out[i]+=real[k]*b[k-1].c[i]+imag[k]*b[k-1].s[i];
  }
  const mean=out.reduce((a,v)=>a+v,0)/size;
  for(let i=0;i<size;i++) out[i]-=mean;
  return out;
}
export function analyze(samples) {
  const p=emptyPartials(), n=samples.length, b=basis(n);
  for(let k=0;k<PARTIALS;k++) {
    let re=0,im=0;
    for(let i=0;i<n;i++){ re+=samples[i]*b[k].c[i]; im+=samples[i]*b[k].s[i]; }
    p.amplitudes[k]=Math.hypot(re,im)*2/n;
    p.phases[k]=Math.atan2(re,im);
  }
  return p;
}
export function shape(name) {
  const p=emptyPartials();
  for(let k=1;k<=64;k++) {
    if(name==='sine') p.amplitudes[k-1]=k===1?1:0;
    if(name==='saw') p.amplitudes[k-1]=0.65/k;
    if(name==='square') p.amplitudes[k-1]=k%2?0.85/k:0;
    if(name==='triangle') {p.amplitudes[k-1]=k%2?0.9/(k*k):0;p.phases[k-1]=k%4===3?Math.PI:0;}
    if(name==='formant') {p.amplitudes[k-1]=(0.75*Math.exp(-(((k-7)/3)**2))+0.45*Math.exp(-(((k-20)/5)**2)))/3+(k===1?0.4:0);p.phases[k-1]=Math.sin(k*1.7)*0.7;}
    if(name==='organ') p.amplitudes[k-1]=[1,2,3,4,6,8].includes(k)?0.7/Math.sqrt(k):0;
  }
  return p;
}
export function makeProject() {
 return {schema:'morph-lab',version:1,name:'Spectral drift',frameCount:256,interpolation:'cosine',suppress:true,normalize:true,keyframes:[{frame:0,...shape('sine')},{frame:128,...shape('formant')},{frame:255,...shape('saw')}]};
}
const mix = (a,b,t)=>a+(b-a)*t;
function hermite(a,b,m0,m1,t) {const t2=t*t,t3=t2*t;return (2*t3-3*t2+1)*a+(t3-2*t2+t)*m0+(-2*t3+3*t2)*b+(t3-t2)*m1;}
export function partialsAt(project, position) {
 const keys=project.keyframes, x=clamp(position,0,project.frameCount-1);
 if(x<=keys[0].frame) return structuredClone(keys[0]);
 if(x>=keys.at(-1).frame) return structuredClone(keys.at(-1));
 const right=keys.findIndex(k=>k.frame>=x), left=right-1, a=keys[left],b=keys[right], prev=keys[Math.max(0,left-1)],next=keys[Math.min(keys.length-1,right+1)], span=b.frame-a.frame;
 let t=(x-a.frame)/span;
 if(project.interpolation==='cosine')t=(1-Math.cos(Math.PI*t))/2;
 // Interpolate sine/cosine coefficients, so phases cross ±π without an artificial spin.
 const out=emptyPartials();
 for(let k=0;k<64;k++) {
   const component=(key,fn)=>key.amplitudes[k]*fn(key.phases[k]);
   const interp=(fn)=>{
     const av=component(a,fn),bv=component(b,fn);
     if(project.interpolation!=='hermite')return mix(av,bv,t);
     const m0=(bv-component(prev,fn))*span/(b.frame-prev.frame);
     const m1=(component(next,fn)-av)*span/(next.frame-a.frame);
     return hermite(av,bv,m0,m1,t);
   };
   const re=interp(Math.sin),im=interp(Math.cos);
   out.amplitudes[k]=Math.hypot(re,im);out.phases[k]=Math.atan2(re,im);
 }
 return out;
}
export function renderBank(project, count=project.frameCount, size=SAMPLES) {
 const frames=Array.from({length:count},(_,i)=>synthesize(partialsAt(project,i*(project.frameCount-1)/Math.max(1,count-1)),{size,suppress:project.suppress}));
 let peak=0;
 for(const f of frames)for(const v of f)peak=Math.max(peak,Math.abs(v));
 const gain=project.normalize&&peak>1e-9?1/peak:1;
 for(const f of frames)for(let i=0;i<f.length;i++)f[i]*=gain;
 return {frames, gain,peak};
}
export function resizeProject(project,count) {
 const keys=new Map();
 for(const k of project.keyframes){const frame=Math.round(k.frame*(count-1)/(project.frameCount-1));keys.set(frame,{...k,frame});}
 project.keyframes=[...keys.values()].sort((a,b)=>a.frame-b.frame);project.frameCount=count;
}
export function splineSamples(points, size=SAMPLES) {
 // Periodic Catmull-Rom spline through equally spaced drawing handles.
 return Float32Array.from({length:size},(_,i)=>{
  const x=i/size*points.length,j=Math.floor(x),t=x-j,n=points.length;
  const p0=points[(j-1+n)%n],p1=points[j],p2=points[(j+1)%n],p3=points[(j+2)%n];
  return hermite(p1,p2,(p2-p0)/2,(p3-p1)/2,t);
 });
}
export function validateProject(input) {
 const bad=()=>{throw Error('Invalid preset. Use a Morph Lab v1 JSON with 64 amplitudes and phases per keyframe.');};
 if(!input||input.schema!=='morph-lab'||input.version!==1||![16,64,256].includes(input.frameCount)||!['linear','cosine','hermite'].includes(input.interpolation))bad();
 if(typeof input.suppress!=='boolean'||typeof input.normalize!=='boolean'||!Array.isArray(input.keyframes)||!input.keyframes.length||input.keyframes.length>input.frameCount)bad();
 const seen=new Set();
 for(const k of input.keyframes){
  if(!Number.isInteger(k.frame)||k.frame<0||k.frame>=input.frameCount||seen.has(k.frame))bad();seen.add(k.frame);
  if(!Array.isArray(k.amplitudes)||!Array.isArray(k.phases)||k.amplitudes.length!==64||k.phases.length!==64)bad();
  if(k.amplitudes.some(v=>!Number.isFinite(v)||v<0||v>4)||k.phases.some(v=>!Number.isFinite(v)||Math.abs(v)>TAU))bad();
 }
 return {schema:'morph-lab',version:1,name:String(input.name||'Imported table').slice(0,80),frameCount:input.frameCount,interpolation:input.interpolation,suppress:input.suppress,normalize:input.normalize,keyframes:input.keyframes.map(k=>({frame:k.frame,amplitudes:[...k.amplitudes],phases:[...k.phases]})).sort((a,b)=>a.frame-b.frame)};
}
