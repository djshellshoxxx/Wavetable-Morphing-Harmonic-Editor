import * as THREE from 'three';
// Canvas projection keeps the instrument usable when WebGL is disabled.
// Three.js still supplies the camera and perspective transform.
export class CanvasWaterfall {
 constructor(container){
  this.container=container;this.canvas=document.createElement('canvas');container.append(this.canvas);this.canvas.setAttribute('aria-label','Canvas waterfall fallback: drag to orbit, right-drag to pan, scroll to zoom');this.ctx=this.canvas.getContext('2d');
  this.camera=new THREE.PerspectiveCamera(38,1,.1,100);this.angle=.7;this.elevation=.48;this.distance=13;this.panX=0;this.panY=0;this.position=0;this.drag=null;
  this.canvas.addEventListener('pointerdown',e=>{this.drag={x:e.clientX,y:e.clientY,pan:e.button===2||e.shiftKey};this.canvas.setPointerCapture(e.pointerId);});
  this.canvas.addEventListener('pointermove',e=>{if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;if(this.drag.pan){this.panX+=dx;this.panY+=dy;}else{this.angle-=dx*.007;this.elevation=Math.max(.1,Math.min(1.4,this.elevation+dy*.006));}this.drag.x=e.clientX;this.drag.y=e.clientY;this.draw();});
  this.canvas.addEventListener('pointerup',()=>this.drag=null);this.canvas.addEventListener('pointercancel',()=>this.drag=null);this.canvas.addEventListener('contextmenu',e=>e.preventDefault());this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance=Math.max(7,Math.min(23,this.distance+e.deltaY*.01));this.draw();},{passive:false});
  this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(container);
 }
 update(frames){this.frames=frames;this.position=Math.min(this.position,frames.length-1);this.draw();}
 select(position){this.position=Math.max(0,Math.min(position,this.frames.length-1));this.draw();}
 reset(){this.angle=.7;this.elevation=.48;this.distance=13;this.panX=0;this.panY=0;this.draw();}
 draw(){
  if(!this.frames)return;const w=this.container.clientWidth,h=this.container.clientHeight,dpr=Math.min(devicePixelRatio,2);if(this.canvas.width!==w*dpr||this.canvas.height!==h*dpr){this.canvas.width=w*dpr;this.canvas.height=h*dpr;}const ctx=this.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  this.camera.aspect=w/h;this.camera.position.set(Math.sin(this.angle)*Math.cos(this.elevation)*this.distance,Math.sin(this.elevation)*this.distance,Math.cos(this.angle)*Math.cos(this.elevation)*this.distance);this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  const project=(x,y,z)=>{const v=new THREE.Vector3(x,y,z).project(this.camera);return [(v.x*.5+.5)*w+this.panX,(-v.y*.5+.5)*h+this.panY];};
  ctx.lineWidth=.65;ctx.strokeStyle='#294047';for(let i=-5;i<=5;i++){for(const points of [[[i,-1.65,-5],[i,-1.65,5]],[[-5,-1.65,i],[5,-1.65,i]]]){ctx.beginPath();points.forEach((p,j)=>{const q=project(...p);j?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.stroke();}}
  const rows=Math.min(48,this.frames.length);
  const line=(index,color,width)=>{const f=this.frames[index],z=3-index/(this.frames.length-1)*6;ctx.beginPath();for(let j=0;j<=192;j++){const p=project((j/192-.5)*8,f[Math.floor(j/192*f.length)%f.length]*1.45,z);j?ctx.lineTo(...p):ctx.moveTo(...p);}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
  for(let r=rows-1;r>=0;r--)line(Math.round(r*(this.frames.length-1)/(rows-1)),`hsla(${155+r/(rows-1)*42},60%,${52-r/(rows-1)*13}%,.85)`,.8);
  line(Math.round(this.position),'#d6ffa2',1.6);
 }
}
