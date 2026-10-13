import { invoke, isTauri } from '@tauri-apps/api/core';
import { defaultSettings, validateNotebook, type Bootstrap, type Notebook, type Settings, type SyncStatus, type Version, type InstalledPlugin } from './types';
import { webDrive } from './web-drive';

export const native = isTauri();
import { webRead as read, webWrite as write, webWithLock, requestPersistentStorage } from './web-store';
let previewUnlocked = false;
function guard() { if (!previewUnlocked) throw new Error('Unlock QUANTA to continue.'); }
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
async function passwordKey(password: string, salt: string): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 310000, hash: 'SHA-256' }, material, 256);
  return toB64(new Uint8Array(bits));
}

export const backend = {
  async bootstrap(): Promise<Bootstrap> {
    if (native) return invoke('bootstrap');
    return { needsPassword: !await read('password', null), unlocked: previewUnlocked,
      settings: { ...defaultSettings, ...await read<Partial<Settings>>('settings', {}) } };
  },
  async unlock(password: string, create: boolean): Promise<void> {
    if (native) return invoke('unlock', { password, create });
    if (create) {
      if (await read('password', null)) throw new Error('A password already exists.');
      if (password.length < 6) throw new Error('Use at least 6 characters.');
      const salt = crypto.randomUUID(); await write('password', { salt, hash: await passwordKey(password, salt) });
    } else {
      const record = await read<{salt: string; hash: string} | null>('password', null);
      if (!record || await passwordKey(password, record.salt) !== record.hash) throw new Error('The password does not match.');
    }
    previewUnlocked = true; await requestPersistentStorage();
  },
  async lock(): Promise<void> { if (native) return invoke('lock'); previewUnlocked = false; },
  async changePassword(current: string, next: string): Promise<void> {
    if (native) return invoke('change_password', { current, next });
    guard(); await this.unlock(current, false);
    if (next.length < 6) throw new Error('Use at least 6 characters.');
    const salt = crypto.randomUUID(); await write('password', { salt, hash: await passwordKey(next, salt) });
  },
  async listNotes(): Promise<Notebook[]> { if (native) return invoke('list_notes'); guard(); return read<Notebook[]>('notes', []); },
  async saveNote(note: Notebook): Promise<void> {
    if (native) return invoke('save_note', { note });
    guard();return webWithLock('notes-write',()=>saveWebNote(note));
  },
  async trashNote(id: string): Promise<void> {
    if (native) return invoke('trash_note', { id }); guard();
    return webWithLock('notes-write',async()=>{
      const notes = await read<Notebook[]>('notes', []); const note = notes.find(n => n.id === id);
      if (note) await write('trash', [note, ...await read<Notebook[]>('trash', []).then(trash=>trash.filter(n=>n.id!==id))]);
      await webDrive.tombstone(id);
      await write('notes', notes.filter(n => n.id !== id));
    });
  },
  async listTrash(): Promise<Notebook[]> { if (native) return invoke('list_trash'); guard(); return read('trash', []); },
  async restoreNote(id: string): Promise<void> {
    if (native) return invoke('restore_note', { id }); guard();
    return webWithLock('notes-write',async()=>{
      const trash = await read<Notebook[]>('trash', []); const n = trash.find(n => n.id === id);
      if (n) { await saveWebNote({...n,revision:n.revision+1,updatedAt:new Date().toISOString()}); await write('trash', trash.filter(n => n.id !== id)); await webDrive.restore(id); }
    });
  },
  async saveSettings(settings: Settings): Promise<void> {
    if (native) return invoke('save_settings', { settings }); guard(); await write('settings', settings);
  },
  async versions(id: string): Promise<Version[]> {
    if (native) return invoke('list_versions', { id }); guard();
    return (await read<Notebook[]>('versions.' + id, [])).map((n, i) => ({ file: String(i), updatedAt: n.updatedAt, title: n.title, revision: n.revision }));
  },
  async restoreVersion(id: string, file: string): Promise<Notebook> {
    if (native) return invoke('restore_version', { id, file }); guard();
    const n = (await read<Notebook[]>('versions.' + id, []))[Number(file)];
    if (!n) throw new Error('That version is no longer available.');
    const current=(await read<Notebook[]>('notes',[])).find(note=>note.id===id);
    return { ...n, updatedAt: new Date().toISOString(), revision: (current?.revision??n.revision) + 1 };
  },
  async syncStatus(): Promise<SyncStatus> {
    if (native) return invoke('sync_status');
    return webDrive.status();
  },
  async syncNow(): Promise<SyncStatus> { if (native) return invoke('sync_now'); guard(); return webDrive.run(); },
  async connectDrive(): Promise<SyncStatus> { if (native) return invoke('connect_drive'); guard(); return webDrive.connect(); },
  async disconnectDrive(): Promise<void> { if (native) return invoke('disconnect_drive'); guard(); return webDrive.disconnect(); },
  async writeExport(path: string, data: string): Promise<void> { return invoke('write_export', { path, data }); },
  async queueExport(name: string, data: string, mime: string, replace: boolean): Promise<void> {
    if (native) return invoke('queue_export', { name, data, mime, replace });
    guard(); return webDrive.queue(name,data,mime,replace);
  },
  async compileTex(source: string): Promise<{ data: string; log: string }> {
    if (native) return invoke('compile_tex', { source });
    guard(); const {compileWebTex}=await import('./web-tex'); return compileWebTex(source);
  },
  async listPlugins(): Promise<InstalledPlugin[]> { if (native) return invoke('list_plugins'); return read('plugins', []); },
  async installPlugin(bundle: string): Promise<InstalledPlugin> {
    if (native) return invoke('install_plugin', { bundle });
    const plugin = JSON.parse(bundle) as InstalledPlugin;
    if (plugin.manifest.apiVersion !== 1 || !/^[a-z][a-z0-9.-]{2,80}$/.test(plugin.manifest.id)) throw new Error('Invalid plugin manifest.');
    await write('plugins', [...(await read<InstalledPlugin[]>('plugins', [])).filter(p => p.manifest.id !== plugin.manifest.id), plugin]); return plugin;
  },
  async uninstallPlugin(id: string): Promise<void> { if (native) return invoke('uninstall_plugin', { id }); await write('plugins', (await read<InstalledPlugin[]>('plugins', [])).filter(p => p.manifest.id !== id)); },
};

async function saveWebNote(note:Notebook):Promise<void>{
    validateNotebook(note);
    const notes = await read<Notebook[]>('notes', []); const i = notes.findIndex(n => n.id === note.id);
    if (i >= 0) {
      if (note.revision <= notes[i].revision && JSON.stringify(note)!==JSON.stringify(notes[i])) throw new Error('A newer notebook revision exists locally. Keep your working draft as a new notebook.');
      const versions = await read<Notebook[]>('versions.' + note.id, []);
      const captured=await read<number>('snapshot-time.'+note.id,0);
      if (!versions[0] || Date.now()-captured>=60000) {await write('versions.'+note.id,[notes[i],...versions].slice(0,20));await write('snapshot-time.'+note.id,Date.now());}
      notes[i] = note;
    } else notes.push(note);
    await write('notes', notes);
}
