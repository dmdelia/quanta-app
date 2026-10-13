import {it,expect} from 'vitest';
import fixture from './fixtures/hash-notebook.json';
import reference from './fixtures/hash-reference.json';
import {validateNotebook} from '../src/lib/types';
import {noteHash,conflictId} from '../src/lib/web-drive';
it('uses the same notebook hash and conflict identity as Rust',async()=>{
  const note=validateNotebook(fixture);expect(await noteHash(note)).toBe(reference.hash);expect(await conflictId(note)).toBe(reference.conflictId);
});
