import {SAMPLES,analyze,clamp} from './dsp.js';
const ascii=(view,offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
const readText=(view,offset,n)=>Array.from({length:n},(_,i)=>String.fromCharCode(view.getUint8(offset+i))).join('');
export function encodeWav(frames) {
 const metadata='<!>2048 10000000 Morph Lab';
 const metaSize=metadata.length, padded=metaSize+(metaSize%2), dataSize=frames.length*SAMPLES*4;
 const buffer=new ArrayBuffer(12+26+12+8+padded+8+dataSize),v=new DataView(buffer);
 ascii(v,0,'RIFF');v.setUint32(4,buffer.byteLength-8,true);ascii(v,8,'WAVE');
 ascii(v,12,'fmt ');v.setUint32(16,18,true);v.setUint16(20,3,true);v.setUint16(22,1,true);v.setUint32(24,44100,true);v.setUint32(28,176400,true);v.setUint16(32,4,true);v.setUint16(34,32,true);v.setUint16(36,0,true);
 ascii(v,38,'fact');v.setUint32(42,4,true);v.setUint32(46,frames.length*SAMPLES,true);
 ascii(v,50,'clm ');v.setUint32(54,metaSize,true);ascii(v,58,metadata);
 let offset=58+padded;ascii(v,offset,'data');v.setUint32(offset+4,dataSize,true);offset+=8;
 for(const frame of frames){if(frame.length!==SAMPLES)throw Error('Each frame must contain 2048 samples.');for(const sample of frame){v.setFloat32(offset,sample,true);offset+=4;}}
 return buffer;
}
export function encodeHeader(frames) {
 const rows=frames.map(f=>'  {\n'+Array.from({length:Math.ceil(f.length/8)},(_,i)=>'    '+Array.from(f.slice(i*8,i*8+8),v=>`${(Math.abs(v)<1e-10?0:v).toExponential(8)}f`).join(', ')).join(',\n')+'\n  }');
 return `#ifndef MORPH_LAB_WAVETABLE_H\n#define MORPH_LAB_WAVETABLE_H\n\n#define NUM_FRAMES ${frames.length}\n#define WAVETABLE_SAMPLES 2048\n\n/* Mono float32; ${frames.length*2048*4} bytes. */\nstatic const float wavetable[NUM_FRAMES][2048] = {\n${rows.join(',\n')}\n};\n\n#endif\n`;
}
export function decodeWav(buffer) {
 const v=new DataView(buffer);if(v.byteLength<44||readText(v,0,4)!=='RIFF'||readText(v,8,4)!=='WAVE')throw Error('Choose an uncompressed RIFF/WAVE file.');
 let format,channels,bits,block,dataOffset,dataSize;
 const end=v.getUint32(4,true)+8;if(end>v.byteLength)throw Error('Truncated WAV file.');
 for(let off=12;off+8<=end;){
  const id=readText(v,off,4),size=v.getUint32(off+4,true),start=off+8;if(start+size>end)throw Error('Truncated WAV chunk.');
  if(id==='fmt '){if(size<16)throw Error('Invalid WAV format.');format=v.getUint16(start,true);channels=v.getUint16(start+2,true);block=v.getUint16(start+12,true);bits=v.getUint16(start+14,true);if(format===65534&&size>=40)format=v.getUint16(start+24,true);}
  if(id==='data'){dataOffset=start;dataSize=size;}
  off=start+size+(size%2);
 }
 if(!dataOffset||!channels||channels>32||![1,3].includes(format)||!(format===3?[32,64]:[8,16,24,32]).includes(bits)||block!==channels*bits/8||dataSize%block)throw Error('Supported WAV: PCM 8/16/24/32-bit or IEEE float 32/64-bit, mono/stereo/multichannel.');
 const n=dataSize/block;if(n<64||n>8388608)throw Error('Use audio between 64 samples and 8 million samples.');
 const samples=new Float32Array(n),bytes=bits/8;
 for(let i=0;i<n;i++){
  let value=0;
  for(let ch=0;ch<channels;ch++){
   const p=dataOffset+i*block+ch*bytes;let x;
   if(format===3)x=bits===32?v.getFloat32(p,true):v.getFloat64(p,true);
   else if(bits===8)x=(v.getUint8(p)-128)/128;
   else if(bits===16)x=v.getInt16(p,true)/32768;
   else if(bits===24){let raw=v.getUint8(p)|(v.getUint8(p+1)<<8)|(v.getUint8(p+2)<<16);if(raw&0x800000)raw-=0x1000000;x=raw/8388608;}
   else x=v.getInt32(p,true)/2147483648;
   if(!Number.isFinite(x))throw Error('WAV contains non-finite samples.');value+=clamp(x,-4,4);
  }
  samples[i]=value/channels;
 }
 return samples;
}
export function importCycles(samples,cycleSize,count) {
 if(!Number.isInteger(cycleSize)||cycleSize<64||cycleSize>16384||samples.length<cycleSize)throw Error('Cycle length must be 64–16384 samples and fit inside the file.');
 const available=Math.floor(samples.length/cycleSize),used=Math.min(count,available);
 return Array.from({length:used},(_,i)=>{
  const source=Math.round(i*(available-1)/Math.max(1,used-1))*cycleSize;
  const cycle=Float32Array.from({length:SAMPLES},(_,j)=>{const pos=j/SAMPLES*cycleSize,l=Math.floor(pos),t=pos-l;return samples[source+l]*(1-t)+samples[source+(l+1)%cycleSize]*t;});
  return {frame:Math.round(i*(count-1)/Math.max(1,used-1)),...analyze(cycle)};
 });
}
export function download(data,name,type) {
 const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
