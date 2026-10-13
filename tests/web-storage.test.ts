// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe,it,expect,vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { webRead,webWrite } from '../src/lib/web-store';
import { backend } from '../src/lib/backend';
import { newNotebook } from '../src/lib/types';
import { webDrive } from '../src/lib/web-drive';
describe('Browser storage',()=>{
  it('stores a notebook payload larger than the localStorage quota',async()=>{const value={image:'a'.repeat(6*1024*1024),revision:7};await webWrite('large-test',value);expect((await webRead('large-test',{image:'',revision:0})).image.length).toBe(6*1024*1024);});
  it('does not report a save before the IndexedDB transaction commits',async()=>{await webWrite('atomic-test',{revision:1});expect(await webRead('atomic-test',{})).toEqual({revision:1});await webWrite('atomic-test',{revision:2});expect(await webRead('atomic-test',{})).toEqual({revision:2});});
  it('retains both notebooks and queued exports during concurrent writes',async()=>{
    vi.stubGlobal('crypto',webcrypto);
    try {
      await backend.unlock('test-workspace-2026',true);
      const first=newNotebook('First experiment');const second=newNotebook('Second experiment');
      await Promise.all([backend.saveNote(first),backend.saveNote(second)]);
      expect((await backend.listNotes()).map(note=>note.id).sort()).toEqual([first.id,second.id].sort());
      await Promise.all([webDrive.queue('first.pdf','YQ==','application/pdf',false),webDrive.queue('second.pdf','Yg==','application/pdf',false)]);
      expect((await webRead<{name:string}[]>('export-queue',[])).map(job=>job.name).sort()).toEqual(['first.pdf','second.pdf']);
    } finally {vi.unstubAllGlobals();}
  });
});
