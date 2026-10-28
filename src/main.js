import './style.css';
import {makeProject,partialsAt,synthesize,analyze,shape,renderBank,resizeProject,splineSamples,validateProject,clamp,TAU} from './dsp.js';
import {encodeWav,encodeHeader,decodeWav,importCycles,download} from './formats.js';
import {Waterfall} from './view.js';
import {Audition} from './audio.js';
import {CanvasWaterfall} from './fallback-view.js';
const $=id=>document.getElementById(id), STORAGE='morph-lab-v1';
let project=makeProject(),position=0,mode='amplitude',bank,view,scanning=false,lastTick=0,lastAudio=0,drawing=false,drawPoints=[],drawDirty=false,undo=[],redo=[],pendingRefresh=0,saveTimer,toastTimer,held=false;
const audio=new Audition();
try {const saved=localStorage.getItem(STORAGE);if(saved)project=validateProject(JSON.parse(saved));}catch{/* Invalid or unavailable local storage does not block editing. */}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4000);}
function save(){clearTimeout(saveTimer);$('save-status').textContent='● Saving locally…';saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(project));$('save-status').textContent='● Saved locally';}catch{$('save-status').textContent='● Save JSON to keep changes';}},350);}
function checkpoint(){undo.push(JSON.stringify(project));if(undo.length>60)undo.shift();redo=[];historyButtons();}
function historyButtons(){$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;}
function restore(from,to){if(!from.length)return;to.push(JSON.stringify(project));project=validateProject(JSON.parse(from.pop()));position=clamp(position,0,project.frameCount-1);drawing=false;drawDirty=false;refresh();toast('Project restored');}
function current(){return partialsAt(project,position);}
function keyAtPosition(){return project.keyframes.find(k=>k.frame===Math.round(position));}
function editable(){position=Math.round(position);let key=keyAtPosition();if(!key){key={frame:position,...current()};key.frame=position;project.keyframes.push(key);project.keyframes.sort((a,b)=>a.frame-b.frame);}return key;}
function updateKey(partials){const key=editable();key.amplitudes=[...partials.amplitudes];key.phases=[...partials.phases];}
function scheduleRefresh(){if(pendingRefresh)return;pendingRefresh=requestAnimationFrame(()=>{pendingRefresh=0;refresh(false);});}
function refresh(syncSliders=true){
 bank=renderBank(project);view?.update(bank.frames);syncProjectControls();renderKeys();updatePosition(syncSliders);save();historyButtons();
}
function syncProjectControls(){
 $('project-name').value=project.name;$('frame-count').value=project.frameCount;$('interpolation').value=project.interpolation;$('suppress').checked=project.suppress;$('normalize').checked=project.normalize;$('position').max=project.frameCount-1;$('stat-frames').textContent=project.frameCount;
 $('draw-toggle').setAttribute('aria-pressed',String(drawing));$('apply-drawing').disabled=!drawing||!drawDirty;
 updateExportInfo();
}
function updateExportInfo(){const target=$('export-target').value,count=target==='single'?1:target==='modwave'?Math.min(64,project.frameCount):project.frameCount;$('export-size').textContent=`${(count*2048*4/1048576).toFixed(2)} MiB`;$('export-hint').textContent=target==='modwave'?`${count} evenly spaced frames for modwave. Import through its Editor/Librarian.`:target==='single'?'One cycle from the selected position, with table normalization.':'Packed cycles with Serum-style frame metadata.';}
function updatePosition(sync=true){
 position=clamp(position,0,project.frameCount-1);$('position').value=position;$('position-label').innerHTML=`${String(Math.round(position)+1).padStart(3,'0')} <span>/ ${project.frameCount}</span>`;
 $('edit-frame').textContent=`FRAME ${String(Math.round(position)+1).padStart(3,'0')}`;
 $('delete-key').disabled=!keyAtPosition()||project.keyframes.length===1;
 for(const el of $('keyframes').children)el.classList.toggle('active',Number(el.dataset.frame)===Math.round(position));
 view?.select(position);if(sync)updateSliders();if(!drawing)drawWave();if(performance.now()-lastAudio>35){audio.update(current(),project.suppress,bank.gain);lastAudio=performance.now();}
}
function stopScan(){scanning=false;$('scan').textContent='▶';$('scan').setAttribute('aria-pressed','false');$('scan').setAttribute('aria-label','Start morph scan');}
function setPosition(value){stopScan();position=Number(value);if(drawing){drawing=false;drawDirty=false;syncProjectControls();}updatePosition();}
function renderKeys(){
 const wrap=$('keyframes');wrap.replaceChildren();$('key-count').textContent=`${project.keyframes.length} KEYS`;
 project.keyframes.forEach((key,i)=>{const button=document.createElement('button');button.className='keyframe';button.dataset.frame=key.frame;button.setAttribute('aria-label',`Select keyframe ${key.frame+1}`);const label=document.createElement('span');label.textContent=String(key.frame+1).padStart(3,'0');const title=document.createElement('b');title.textContent=`KEY ${String(i+1).padStart(2,'0')}`;const c=document.createElement('canvas');c.width=200;c.height=50;button.append(label,title,c);button.onclick=()=>setPosition(key.frame);wrap.append(button);paintWave(c,synthesize(key,{size:256,suppress:project.suppress}),bank.gain,false);});
}
const sliderNodes=[];
for(let k=0;k<64;k++){
 const input=document.createElement('input');input.type='range';input.className='partial';input.dataset.partial=k;input.min=0;input.max=1;input.step=.001;input.setAttribute('aria-label',`Partial ${k+1} amplitude`);
 let gesture=false;
 input.addEventListener('pointerdown',()=>{stopScan();checkpoint();gesture=true;});
 input.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key)&&!gesture){stopScan();checkpoint();gesture=true;}});
 input.addEventListener('input',()=>{if(!gesture){checkpoint();gesture=true;}const key=editable();if(mode==='amplitude')key.amplitudes[k]=Number(input.value);else key.phases[k]=Number(input.value)*Math.PI/180;input.style.setProperty('--fill',`${mode==='amplitude'?Number(input.value)/Number(input.max)*100:(Number(input.value)+180)/3.6}%`);$('partial-readout').textContent=`PARTIAL ${String(k+1).padStart(2,'0')} · ${mode==='amplitude'?Number(input.value).toFixed(3):`${Number(input.value).toFixed(1)}°`}`;drawing=false;scheduleRefresh();});
 const end=()=>{gesture=false;};input.addEventListener('change',end);input.addEventListener('pointerup',end);input.addEventListener('keyup',end);input.addEventListener('blur',end);
 $('harmonics').append(input);sliderNodes.push(input);
}
function updateSliders(){const p=current();sliderNodes.forEach((s,k)=>{const phase=mode==='phase',value=phase?p.phases[k]*180/Math.PI:p.amplitudes[k];s.min=phase?-180:0;s.max=phase?180:Math.max(1,Math.ceil(value));s.step=phase?1:.001;s.value=value;s.title=`Partial ${k+1}: ${phase?value.toFixed(1)+'°':value.toFixed(3)}`;s.setAttribute('aria-label',`Partial ${k+1} ${phase?'phase':'amplitude'}`);s.style.setProperty('--fill',`${phase?(value+180)/3.6:value/Number(s.max)*100}%`);});}
function setMode(next){mode=next;$('amplitude-tab').setAttribute('aria-pressed',String(mode==='amplitude'));$('amplitude-tab').classList.toggle('selected',mode==='amplitude');$('phase-tab').setAttribute('aria-pressed',String(mode==='phase'));$('phase-tab').classList.toggle('selected',mode==='phase');$('partial-readout').textContent=mode==='phase'?'Phase angles · −180° to +180°':'64 partials · drag a slider to sculpt';updateSliders();}
function paintWave(canvas,samples,gain=1,grid=true){
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
 if(grid){ctx.strokeStyle='#253a40';ctx.lineWidth=1;for(let i=1;i<8;i++){ctx.beginPath();ctx.moveTo(w*i/8,0);ctx.lineTo(w*i/8,h);ctx.stroke();}for(let j=1;j<4;j++){ctx.beginPath();ctx.moveTo(0,h*j/4);ctx.lineTo(w,h*j/4);ctx.stroke();}}
 ctx.beginPath();for(let i=0;i<=samples.length;i++){const x=i/samples.length*w,y=h/2-samples[i%samples.length]*gain*h*.36;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.strokeStyle=grid?'#bdf58d':'#73cdb1';ctx.lineWidth=grid?2*devicePixelRatio:1.8;ctx.stroke();
}
function drawWave(){
 const c=$('waveform'),rect=c.getBoundingClientRect();c.width=Math.round(rect.width*devicePixelRatio);c.height=Math.round(rect.height*devicePixelRatio);
 const wave=drawing?splineSamples(drawPoints):synthesize(current(),{suppress:project.suppress});const gain=drawing?1:bank.gain;paintWave(c,wave,gain,true);
 if(drawing){const ctx=c.getContext('2d');ctx.fillStyle='#d8ffa9';drawPoints.forEach((y,i)=>{ctx.beginPath();ctx.arc(i/32*c.width,c.height/2-y*c.height*.36,3*devicePixelRatio,0,TAU);ctx.fill();});}
 let peak=0,sum=0;for(const v of wave){peak=Math.max(peak,Math.abs(v*gain));sum+=(v*gain)**2;}$('wave-stats').textContent=`PEAK ${peak.toFixed(3)} · RMS ${Math.sqrt(sum/wave.length).toFixed(3)}`;$('canvas-caption').textContent=drawing?'DRAW A CYCLE · APPLY TO COMMIT':'A SINGLE CYCLE · 2,048 SAMPLES';
}
function enableDrawing(){if(drawing)return;stopScan();drawing=true;const wave=synthesize(current(),{suppress:project.suppress});drawPoints=Array.from({length:32},(_,i)=>clamp(wave[i*64]*bank.gain,-1,1));drawDirty=false;syncProjectControls();drawWave();}
let drag=false,lastDrawIndex=null;
function drawAt(e){const r=$('waveform').getBoundingClientRect(),index=clamp(Math.round((e.clientX-r.left)/r.width*32),0,31),value=clamp((.5-(e.clientY-r.top)/r.height)/.36,-1,1);if(lastDrawIndex!==null){const a=Math.min(lastDrawIndex,index),b=Math.max(lastDrawIndex,index),previous=drawPoints[lastDrawIndex];for(let j=a;j<=b;j++){const t=index===lastDrawIndex?1:(j-lastDrawIndex)/(index-lastDrawIndex);drawPoints[j]=previous+(value-previous)*t;}}drawPoints[index]=value;lastDrawIndex=index;drawDirty=true;$('apply-drawing').disabled=false;drawWave();}
$('waveform').addEventListener('pointerdown',e=>{if(!drawing)return;drag=true;lastDrawIndex=null;$('waveform').setPointerCapture(e.pointerId);drawAt(e);});$('waveform').addEventListener('pointermove',e=>{if(drag)drawAt(e);});$('waveform').addEventListener('pointerup',()=>{drag=false;lastDrawIndex=null;});$('waveform').addEventListener('pointercancel',()=>{drag=false;lastDrawIndex=null;});
for(let i=0;i<32;i++)$('handle-index').add(new Option(String(i+1).padStart(2,'0'),i));
$('set-handle').onclick=()=>{const v=Number($('handle-value').value);if(!Number.isFinite(v)||v<-1||v>1){toast('Handle amplitude must be between −1 and 1.');return;}enableDrawing();drawPoints[Number($('handle-index').value)]=v;drawDirty=true;$('apply-drawing').disabled=false;drawWave();};
$('handle-index').onchange=()=>{if(drawing)$('handle-value').value=drawPoints[Number($('handle-index').value)].toFixed(3);};
$('draw-toggle').onclick=()=>{if(drawing){drawing=false;drawDirty=false;syncProjectControls();drawWave();}else enableDrawing();};
$('apply-drawing').onclick=()=>{if(!drawDirty)return;checkpoint();updateKey(analyze(splineSamples(drawPoints)));drawing=false;drawDirty=false;refresh();toast('Spline converted to 64 harmonics; DC removed');};
$('position').oninput=e=>setPosition(e.target.value);
$('scan').onclick=()=>{if(scanning){stopScan();return;}drawing=false;drawDirty=false;syncProjectControls();scanning=true;lastTick=performance.now();$('scan').textContent='Ⅱ';$('scan').setAttribute('aria-pressed','true');$('scan').setAttribute('aria-label','Pause morph scan');};
function tick(now){if(scanning){const dt=Math.min(100,now-lastTick);position=(position+dt/(Number($('scan-speed').value)*1000)*(project.frameCount-1))%(project.frameCount-1);updatePosition();}lastTick=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);
$('amplitude-tab').onclick=()=>setMode('amplitude');$('phase-tab').onclick=()=>setMode('phase');
$('apply-shape').onclick=()=>{stopScan();checkpoint();updateKey(shape($('shape-select').value));drawing=false;refresh();toast('Shape applied to current keyframe');};
$('clear-partials').onclick=()=>{stopScan();checkpoint();const key=editable();key.amplitudes.fill(0);key.phases.fill(0);drawing=false;refresh();};
$('frame-count').onchange=e=>{stopScan();checkpoint();const count=Number(e.target.value);position=Math.round(position*(count-1)/(project.frameCount-1));resizeProject(project,count);refresh();};
$('interpolation').onchange=e=>{checkpoint();project.interpolation=e.target.value;refresh();};
$('suppress').onchange=e=>{checkpoint();project.suppress=e.target.checked;refresh();};$('normalize').onchange=e=>{checkpoint();project.normalize=e.target.checked;refresh();};
$('project-name').onchange=e=>{checkpoint();project.name=e.target.value.trim()||'Untitled wavetable';save();};
$('add-key').onclick=()=>{stopScan();if(keyAtPosition()){toast('This frame already has a keyframe');return;}checkpoint();editable();refresh();};
$('delete-key').onclick=()=>{if(project.keyframes.length<2||!keyAtPosition())return;checkpoint();project.keyframes=project.keyframes.filter(k=>k.frame!==Math.round(position));refresh();};
$('undo').onclick=()=>restore(undo,redo);$('redo').onclick=()=>restore(redo,undo);
$('view-mode').onchange=e=>view?.setMode(e.target.value);$('lighting').onchange=e=>view?.setLighting(e.target.checked);$('reset-view').onclick=()=>view?.reset();
$('volume').oninput=e=>{audio.setVolume(Number(e.target.value));$('volume-label').textContent=`${Math.round(Number(e.target.value)*200)}%`;};
const activeNotes=new Set();
async function startNote(id,midi){if(activeNotes.has(id))return;activeNotes.add(id);try{await audio.start(id,midi,current(),project.suppress,bank.gain);if(!activeNotes.has(id))audio.stop(id);}catch(e){activeNotes.delete(id);toast(`Audio unavailable: ${e.message}`);}}
function stopNote(id){activeNotes.delete(id);audio.stop(id);}
function stopAll(){activeNotes.clear();audio.stopAll();held=false;$('audition').textContent='▶ Hold tone';$('audition').setAttribute('aria-pressed','false');document.querySelectorAll('.piano-key').forEach(k=>k.classList.remove('active'));}
$('audition').onclick=()=>{held=!held;$('audition').setAttribute('aria-pressed',String(held));$('audition').textContent=held?'■ Stop tone':'▶ Hold tone';if(held)startNote('hold',(Number($('octave').value)+1)*12);else stopNote('hold');};
$('octave').onchange=stopAll;
const keyCodes=['a','w','s','e','d','f','t','g','y','h','u','j','k'],noteNames=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B','C'];let whiteIndex=0;
keyCodes.forEach((code,i)=>{const button=document.createElement('button'),black=[1,3,6,8,10].includes(i);button.className=`piano-key${black?' black':''}`;button.textContent=code.toUpperCase();button.setAttribute('aria-label',`Play ${noteNames[i]} (${code.toUpperCase()})`);button.dataset.note=i;if(black)button.style.left=`${whiteIndex/8*100-4}%`;else whiteIndex++;
 const start=()=>{button.classList.add('active');startNote(`pointer-${i}`,(Number($('octave').value)+1)*12+i);};const end=()=>{button.classList.remove('active');stopNote(`pointer-${i}`);};
 button.onpointerdown=e=>{button.setPointerCapture(e.pointerId);start();};button.onpointerup=end;button.onpointercancel=end;button.onkeydown=e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();start();}};button.onkeyup=e=>{if(e.key===' '||e.key==='Enter')end();};button.onblur=end;$('keyboard').append(button);
});
window.addEventListener('keydown',e=>{
 const editableTarget=['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||$('help').open;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!editableTarget){e.preventDefault();e.shiftKey?restore(redo,undo):restore(undo,redo);return;}
 const i=keyCodes.indexOf(e.key.toLowerCase());if(i<0||editableTarget||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;e.preventDefault();$('keyboard').children[i].classList.add('active');startNote(`key-${i}`,(Number($('octave').value)+1)*12+i);
});
window.addEventListener('keyup',e=>{const i=keyCodes.indexOf(e.key.toLowerCase());if(i<0)return;stopNote(`key-${i}`);$('keyboard').children[i].classList.remove('active');});window.addEventListener('blur',()=>{stopAll();stopScan();});document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAll();stopScan();}});
const filename=()=>project.name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'')||'wavetable';
function exportFrames(){const target=$('export-target').value;if(target==='single'){const f=synthesize(current(),{suppress:project.suppress});for(let i=0;i<f.length;i++)f[i]*=bank.gain;return [f];}if(target==='modwave'&&project.frameCount>64)return renderBank(project,64).frames;return bank.frames;}
$('export-target').onchange=updateExportInfo;
$('export-wav').onclick=()=>{try{const frames=exportFrames();download(encodeWav(frames),`${filename()}-${frames.length}x2048.wav`,'audio/wav');toast(`${frames.length} frames exported as 32-bit float WAV`);}catch(e){toast(e.message);}};
$('export-header').onclick=()=>{const frames=exportFrames();download(encodeHeader(frames),`${filename()}.h`,'text/plain');toast(`C/C++ array exported · ${(frames.length*2048*4/1024).toFixed(0)} KiB of float data`);};
function savePreset(){download(JSON.stringify(project,null,2),`${filename()}.json`,'application/json');toast('Portable preset saved');}
$('save-preset').onclick=savePreset;$('export-json').onclick=savePreset;$('open-preset').onclick=()=>$('preset-input').click();
$('preset-input').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>2*1024*1024)throw Error('Preset is larger than 2 MiB.');const next=validateProject(JSON.parse(await file.text()));stopAll();stopScan();checkpoint();project=next;position=0;drawing=false;refresh();toast(`Opened ${project.name}`);}catch(err){toast(err.message);}};
$('import-wav').onclick=()=>$('wav-input').click();
$('wav-input').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>64*1024*1024)throw Error('Use a WAV file under 64 MiB.');const samples=decodeWav(await file.arrayBuffer()),keys=importCycles(samples,Number($('cycle-size').value),project.frameCount);stopAll();stopScan();checkpoint();project.keyframes=keys;project.name=file.name.replace(/\.wav$/i,'');position=0;drawing=false;refresh();toast(`Imported ${keys.length} cycles as harmonic keyframes`);}catch(err){toast(err.message);}};
$('help-button').onclick=()=>$('help').showModal();$('close-help').onclick=()=>$('help').close();
try{view=new Waterfall($('viewport'));}catch{view=new CanvasWaterfall($('viewport'));$('view-mode').disabled=true;$('lighting').disabled=true;$('viewport').previousElementSibling.querySelector('.badge').textContent='CANVAS 3D';$('view-mode').title='Surface and lighting require WebGL; this browser is using a Canvas fallback.';}
new ResizeObserver(()=>{if(bank)drawWave();}).observe($('waveform').parentElement);
refresh();
