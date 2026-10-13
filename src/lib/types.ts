import type { JSONContent } from '@tiptap/core';

export interface Notebook {
  format: 'quanta.notebook'; schemaVersion: 1; id: string; title: string;
  project: string; tags: string[]; favorite: boolean; createdAt: string;
  updatedAt: string; revision: number; content: JSONContent; texSource: string;
}
export type Theme = 'system' | 'pearl' | 'graphite' | 'midnight' | 'sand' | 'contrast';
export interface Settings {
  theme: Theme; accent: 'blue' | 'teal' | 'violet' | 'bronze';
  performance: 'auto' | 'economy' | 'full'; reduceMotion: boolean;
  font: 'serif' | 'sans' | 'mono'; fontSize: number; lineHeight: number;
  paperWidth: number; spellcheck: boolean; autosaveMs: number;
  lockMinutes: number; tutorialDone: boolean; lastNotebook: string;
  author: string; paperSize: 'a4' | 'letter'; exportScale: number;
  googleClientId: string; googleClientSecret: string; googleWebClientId: string; pluginIds: string[];
  customMacros: Record<string, string>;
}
export interface SyncStatus {
  connected: boolean; state: 'disconnected' | 'idle' | 'syncing' | 'offline' | 'error';
  lastSync: string | null; pending: number; message: string; account: string;
}
export interface Bootstrap { needsPassword: boolean; unlocked: boolean; settings: Settings; }
export type ExportFormat = 'pdf' | 'png' | 'svg' | 'md' | 'tex' | 'html' | 'txt';
export type ExportTarget = 'local' | 'localAs' | 'drive' | 'driveAs';
export interface Version { file: string; updatedAt: string; title: string; revision: number; }
export interface PluginManifest {
  id: string; name: string; version: string; description: string; apiVersion: 1;
  author?: string; entry: string; permissions: ('read-note' | 'insert-content')[];
}
export interface InstalledPlugin { manifest: PluginManifest; source: string; }

export const defaultSettings: Settings = {
  theme: 'system', accent: 'blue', performance: 'auto', reduceMotion: false,
  font: 'serif', fontSize: 18, lineHeight: 1.8, paperWidth: 780, spellcheck: true,
  autosaveMs: 600, lockMinutes: 15, tutorialDone: false, lastNotebook: '',
  author: '', paperSize: 'a4', exportScale: 2, googleClientId: '',
  googleClientSecret: '', googleWebClientId: '', pluginIds: [], customMacros: {},
};

export function newNotebook(title = 'Untitled notebook', project = ''): Notebook {
  const now = new Date().toISOString();
  return { format: 'quanta.notebook', schemaVersion: 1, id: crypto.randomUUID(), title,
    project, tags: [], favorite: false, createdAt: now, updatedAt: now, revision: 0,
    content: { type: 'doc', content: [{ type: 'paragraph' }] }, texSource: '' };
}

export function validateNotebook(value: unknown): Notebook {
  const n = value as Partial<Notebook>;
  if (!n || n.format !== 'quanta.notebook' || n.schemaVersion !== 1 ||
      typeof n.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n.id) ||
      typeof n.title !== 'string' || !n.content || n.content.type !== 'doc' ||
      !Array.isArray(n.content.content) || !Number.isSafeInteger(n.revision) || (n.revision??-1)<0 ||
      (n.project!==undefined&&typeof n.project!=='string') ||
      (n.tags!==undefined&&(!Array.isArray(n.tags)||n.tags.some(t=>typeof t!=='string'))) ||
      (n.texSource!==undefined&&typeof n.texSource!=='string') ||
      typeof n.createdAt !== 'string' || !Number.isFinite(Date.parse(n.createdAt)) ||
      typeof n.updatedAt !== 'string' || !Number.isFinite(Date.parse(n.updatedAt))) {
    throw new Error('This is not a supported QUANTA notebook. Your existing notes were not changed.');
  }
  return {format:'quanta.notebook',schemaVersion:1,id:n.id,title:n.title,content:n.content,
    createdAt:n.createdAt,updatedAt:n.updatedAt,revision:n.revision!,project:n.project??'',
    tags:n.tags??[],favorite:!!n.favorite,texSource:n.texSource??''};
}
