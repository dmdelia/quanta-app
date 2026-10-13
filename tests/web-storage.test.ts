// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe,it,expect } from 'vitest';
import { webRead,webWrite } from '../src/lib/web-store';
describe('Browser storage',()=>{
  it('stores a notebook payload larger than the localStorage quota',async()=>{const value={image:'a'.repeat(6*1024*1024),revision:7};await webWrite('large-test',value);expect((await webRead('large-test',{image:'',revision:0})).image.length).toBe(6*1024*1024);});
  it('does not report a save before the IndexedDB transaction commits',async()=>{await webWrite('atomic-test',{revision:1});expect(await webRead('atomic-test',{})).toEqual({revision:1});await webWrite('atomic-test',{revision:2});expect(await webRead('atomic-test',{})).toEqual({revision:2});});
});
