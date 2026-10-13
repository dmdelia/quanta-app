import type { Notebook } from './types';

/** Serializes disk writes and retains the newest unsaved revision after a failed write. */
export class SaveQueue {
  private pending = new Map<string,Notebook>();
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private save:(note:Notebook)=>Promise<void>,private status:(state:'saving'|'saved'|'error',error?:unknown)=>void) {}
  enqueue(note:Notebook,delay:number) {
    this.pending.set(note.id,structuredClone(note));
    if(this.timer)clearTimeout(this.timer);
    this.timer=setTimeout(()=>{this.flush().catch(()=>{});},delay);
  }
  get dirty() {return this.pending.size>0||this.running!==null;}
  discard(id:string){if(this.running)throw new Error('Wait for the current save attempt before resolving this draft.');this.pending.delete(id);}
  async flush():Promise<void> {
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    if(this.running){await this.running;if(this.pending.size)return this.flush();return;}
    const run=async()=> {
      while(this.pending.size) {
        const batch=[...this.pending.values()];this.pending.clear();this.status('saving');
        for(let i=0;i<batch.length;i++) {
          try {await this.save(batch[i]);}
          catch(error) {
            for(const note of batch.slice(i))if(!this.pending.has(note.id))this.pending.set(note.id,note);
            this.status('error',error);throw error;
          }
        }
      }
      this.status('saved');
    };
    const promise=run();this.running=promise;
    try {await promise;}finally {this.running=null;}
  }
}
