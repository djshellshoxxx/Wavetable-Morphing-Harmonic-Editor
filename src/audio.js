import {coefficients} from './dsp.js';
export class Audition {
 constructor(){this.ctx=null;this.voices=new Map();this.volume=0.18;}
 async init(){if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.master.connect(this.ctx.destination);}await this.ctx.resume();}
 wave(partials,suppress,frequency,gain){
  const {real,imag}=coefficients(partials,suppress);
  for(let k=1;k<65;k++){const scale=k*frequency>=this.ctx.sampleRate*0.49?0:gain;real[k]*=scale;imag[k]*=scale;}
  return this.ctx.createPeriodicWave(Float32Array.from(real),Float32Array.from(imag),{disableNormalization:true});
 }
 async start(id,midi,partials,suppress,gain){
  await this.init();this.stop(id);
  const freq=440*2**((midi-69)/12),osc=this.ctx.createOscillator(),env=this.ctx.createGain();
  osc.frequency.value=freq;osc.setPeriodicWave(this.wave(partials,suppress,freq,gain));env.gain.setValueAtTime(0,this.ctx.currentTime);env.gain.linearRampToValueAtTime(0.5,this.ctx.currentTime+0.015);osc.connect(env);env.connect(this.master);osc.start();this.voices.set(id,{osc,env,freq});
 }
 update(partials,suppress,gain){if(!this.ctx)return;for(const {osc,freq} of this.voices.values())osc.setPeriodicWave(this.wave(partials,suppress,freq,gain));}
 stop(id){const v=this.voices.get(id);if(!v)return;const t=this.ctx.currentTime;v.env.gain.cancelScheduledValues(t);v.env.gain.setTargetAtTime(0,t,0.01);v.osc.stop(t+0.08);v.osc.onended=()=>{v.osc.disconnect();v.env.disconnect();};this.voices.delete(id);}
 stopAll(){for(const id of this.voices.keys())this.stop(id);}
 setVolume(value){this.volume=value;if(this.ctx)this.master.gain.setTargetAtTime(value,this.ctx.currentTime,0.02);}
}
