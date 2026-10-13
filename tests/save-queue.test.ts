import { describe,it,expect,vi } from 'vitest';
import { SaveQueue } from '../src/lib/save-queue';
import { newNotebook } from '../src/lib/types';

describe('Durable save scheduling',()=>{
  it('keeps a newer edit made while an older revision is saving',async()=>{
    let release!:()=>void;const started=new Promise<void>(r=>{release=r;});const seen:number[]=[];
    const save=async(n:ReturnType<typeof newNotebook>)=>{seen.push(n.revision);if(n.revision===1)await started;};
    const queue=new SaveQueue(save,()=>{});const note=newNotebook();queue.enqueue({...note,revision:1},10000);const flush=queue.flush();queue.enqueue({...note,revision:2},10000);release();await flush;
    expect(seen).toEqual([1,2]);expect(queue.dirty).toBe(false);
  });
  it('retains a failed draft and retries it successfully',async()=>{
    const save=vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);const queue=new SaveQueue(save,()=>{});const note=newNotebook();queue.enqueue(note,10000);
    await expect(queue.flush()).rejects.toThrow('disk full');expect(queue.dirty).toBe(true);await queue.flush();expect(queue.dirty).toBe(false);expect(save).toHaveBeenCalledTimes(2);
  });
  it('serializes concurrent flush requests',async()=>{
    let active=0,max=0;const save=async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;};const queue=new SaveQueue(save,()=>{});
    queue.enqueue(newNotebook(),10000);await Promise.all([queue.flush(),queue.flush(),queue.flush()]);expect(max).toBe(1);
  });
});
