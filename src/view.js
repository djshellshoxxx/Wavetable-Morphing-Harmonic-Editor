import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export class Waterfall {
 constructor(container){
  this.container=container;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#0a1013');
  this.camera=new THREE.PerspectiveCamera(38,1,0.1,100);this.camera.position.set(8,6.3,9);
  this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));container.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','Interactive 3D wavetable waterfall: drag to orbit, right-drag to pan, scroll to zoom');
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,0,0);this.controls.enableDamping=true;this.controls.minDistance=5;this.controls.maxDistance=24;this.controls.maxPolarAngle=Math.PI*0.85;
  this.group=new THREE.Group();this.scene.add(this.group);
  const grid=new THREE.GridHelper(10,20,0x314247,0x1a292e);grid.position.y=-1.65;this.scene.add(grid);
  this.ambient=new THREE.AmbientLight(0x9bded8,1.3);this.scene.add(this.ambient);this.light=new THREE.DirectionalLight(0xc1ffe8,3);this.light.position.set(2,7,4);this.scene.add(this.light);
  this.highlight=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xe4ffa9}));this.scene.add(this.highlight);
  this.resize=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();});this.resize.observe(container);
  this.renderer.setAnimationLoop(()=>{this.controls.update();this.renderer.render(this.scene,this.camera);});
 }
 update(frames){
  this.frames=frames;while(this.group.children.length){const c=this.group.children[0];c.geometry.dispose();c.material.dispose();this.group.remove(c);}
  const rows=Math.min(48,frames.length),cols=192,positions=[],colors=[],indices=[];
  for(let r=0;r<rows;r++){
   const frame=frames[Math.round(r*(frames.length-1)/(rows-1))],z=3-r/(rows-1)*6,points=[],color=new THREE.Color().setHSL(0.43+r/(rows-1)*0.13,0.65,0.45);
   for(let j=0;j<=cols;j++){const y=frame[Math.floor(j/cols*frame.length)%frame.length]*1.45;points.push(new THREE.Vector3((j/cols-0.5)*8,y,z));positions.push((j/cols-0.5)*8,y,z);colors.push(color.r,color.g,color.b);if(r<rows-1&&j<cols){const a=r*(cols+1)+j,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1);}}
   this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity:0.76})));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  this.surface=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:0.58,roughness:0.6,metalness:0.2}));this.group.add(this.surface);this.setMode(this.mode||'waterfall');
 }
 select(position){if(!this.frames)return;const index=Math.max(0,Math.min(this.frames.length-1,Math.round(position))),f=this.frames[index],z=3-index/(this.frames.length-1)*6;const points=Array.from({length:257},(_,i)=>new THREE.Vector3((i/256-0.5)*8,f[Math.floor(i/256*f.length)%f.length]*1.45+0.015,z));this.highlight.geometry.dispose();this.highlight.geometry=new THREE.BufferGeometry().setFromPoints(points);}
 setMode(mode){this.mode=mode;if(this.surface){this.surface.visible=mode!=='waterfall';this.surface.material.wireframe=mode==='wireframe';for(const c of this.group.children)if(c!==this.surface)c.visible=mode==='waterfall';}}
 setLighting(enabled){this.light.intensity=enabled?3:0;this.ambient.intensity=enabled?1.3:2;}
 reset(){this.camera.position.set(8,6.3,9);this.controls.target.set(0,0,0);this.controls.update();}
}
