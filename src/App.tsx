import { lazy, Suspense, Component, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BookOpen, Plus, Search, Settings2, PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2, Download, Cloud, CloudOff, Check, Circle, MoreHorizontal, Star, LockKeyhole, ChevronRight, ArrowUpRight, FileCode2, FileText, Trash2, History, Folder, Command, X, Upload, LoaderCircle, Tag, Sparkles } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { backend, native } from './lib/backend';
import { defaultSettings, newNotebook, validateNotebook, type Notebook, type Settings, type SyncStatus, type Bootstrap, type InstalledPlugin, type Version } from './lib/types';
import { welcomeNotebook } from './lib/sample';
import { textContent } from './lib/document';
import { bytesToBase64, safeFilename } from './lib/export';
import { SaveQueue } from './lib/save-queue';
import { PluginHost, type PluginCommand } from './lib/plugin-host';
import type { EditorHandle } from './components/NotebookEditor';
const NotebookEditor=lazy(()=>import('./components/NotebookEditor').then(m=>({default:m.NotebookEditor})));
import { Modal } from './components/Modal';
const EquationDialog=lazy(()=>import('./components/EquationDialog').then(m=>({default:m.EquationDialog})));
import { SettingsDialog } from './components/SettingsDialog';
import { ExportDialog } from './components/ExportDialog';
const SourcePanel=lazy(()=>import('./components/SourcePanel').then(m=>({default:m.SourcePanel})));
import { Tutorial } from './components/Tutorial';

type Dialog='settings'|'equation'|'export'|'markdown'|'details'|'trash'|'versions'|'commands'|null;
const initialSync:SyncStatus={connected:false,state:'disconnected',lastSync:null,pending:0,message:'Saved on this computer',account:''};
class ErrorBoundary extends Component<{children:ReactNode},{error:string}> {
  state={error:''};static getDerivedStateFromError(error:Error){return {error:error.message};}
  render(){return this.state.error?<div className="startup-error"><img src={import.meta.env.BASE_URL+'quanta.svg'} alt="" width="64"/><h1>QUANTA needs a fresh start.</h1><p>Your saved notebooks are still on this computer.</p><pre>{this.state.error}</pre><button className="primary-button" onClick={()=>location.reload()}>Restart interface</button></div>:this.props.children;}
}
export default function App(){return <ErrorBoundary><Suspense fallback={<div className="loading-screen">Opening your workspace…</div>}><QuantaApp/></Suspense></ErrorBoundary>;}
function QuantaApp() {
  const [boot,setBoot]=useState<Bootstrap|null>(null);const [startupError,setStartupError]=useState('');
  const [unlocked,setUnlocked]=useState(false);const [settings,setSettings]=useState<Settings>(defaultSettings);
  const settingsRef=useRef(settings);const settingsWrites=useRef(Promise.resolve());
  const [notes,setNotes]=useState<Notebook[]>([]);const notesRef=useRef(notes);const [activeId,setActiveId]=useState('');
  const activeRef=useRef(activeId);const [sidebar,setSidebar]=useState(true);const [focus,setFocus]=useState(false);
  const [view,setView]=useState<'notebook'|'latex'>('notebook');const [search,setSearch]=useState('');const [filter,setFilter]=useState('All notebooks');
  const [dialog,setDialog]=useState<Dialog>(null);const closeDialog=useCallback(()=>setDialog(null),[]);
  const [saveState,setSaveState]=useState<'saved'|'unsaved'|'saving'|'error'>('saved');const [toast,setToast]=useState('');
  const [sync,setSync]=useState<SyncStatus>(initialSync);const [busySync,setBusySync]=useState(false);const syncRunning=useRef(false);
  const [tutorial,setTutorial]=useState(false);const [plugins,setPlugins]=useState<InstalledPlugin[]>([]);const [pluginCommands,setPluginCommands]=useState<PluginCommand[]>([]);
  const pluginHost=useRef<PluginHost|null>(null);const editor=useRef<EditorHandle>(null);const [markdown,setMarkdown]=useState('');
  const [trash,setTrash]=useState<Notebook[]>([]);const [versions,setVersions]=useState<Version[]>([]);const [commandQuery,setCommandQuery]=useState('');
  const notify=useCallback((message:string)=>setToast(message),[]);
  const [queue]=useState(()=>new SaveQueue(backend.saveNote,(state,error)=>{setSaveState(state);if(error)notify(String(error));}));
  const note=notes.find(n=>n.id===activeId);
  const noteRef=useRef(note);noteRef.current=note;notesRef.current=notes;activeRef.current=activeId;settingsRef.current=settings;
  useEffect(()=>{void backend.bootstrap().then(b=>{setBoot(b);setSettings({...defaultSettings,...b.settings});setUnlocked(b.unlocked);}).catch(e=>setStartupError(String(e)));},[]);
  useEffect(()=>{
    const media=matchMedia('(prefers-color-scheme: dark)');const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const apply=()=> {
      const current=settingsRef.current;document.documentElement.dataset.theme=current.theme==='system'?(media.matches?'graphite':'pearl'):current.theme;
      document.documentElement.dataset.accent=current.accent;
      const hardware=(navigator as Navigator&{deviceMemory?:number}).deviceMemory;const slow=(hardware!==undefined&&hardware<=4)||navigator.hardwareConcurrency<=4;
      document.documentElement.dataset.performance=current.performance==='auto'?(slow?'economy':'full'):current.performance;
      document.documentElement.dataset.motion=current.reduceMotion||motion.matches?'reduced':'full';
    };apply();media.addEventListener('change',apply);motion.addEventListener('change',apply);
    return()=>{media.removeEventListener('change',apply);motion.removeEventListener('change',apply);};
  },[settings]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),6500);return()=>clearTimeout(timer);},[toast]);
  useEffect(()=>{const handle=(e:Event)=>notify(String((e as CustomEvent).detail));window.addEventListener('quanta-error',handle);return()=>window.removeEventListener('quanta-error',handle);},[notify]);
  async function saveSettings(next:Settings){
    setSettings(next);settingsRef.current=next;
    const snapshot=structuredClone(next);const task=settingsWrites.current.catch(()=>{}).then(()=>backend.saveSettings(snapshot));settingsWrites.current=task;
    try{await task;}catch(e){notify('Settings could not be saved: '+String(e));throw e;}
  }
  async function loadWorkspace(){
    let list=await backend.listNotes();const b=await backend.bootstrap();const prefs={...defaultSettings,...b.settings};setSettings(prefs);settingsRef.current=prefs;
    if(!list.length){const welcome=welcomeNotebook();await backend.saveNote(welcome);list=[welcome];}
    setNotes(list);notesRef.current=list;const id=list.some(n=>n.id===prefs.lastNotebook)?prefs.lastNotebook:list[0].id;setActiveId(id);activeRef.current=id;
    setSync(await backend.syncStatus());setPlugins(await backend.listPlugins());if(!prefs.tutorialDone)setTutorial(true);
    if(native){const {invoke}=await import('@tauri-apps/api/core');const notices=await invoke<string[]>('recovery_notices');if(notices.length)notify(`${notices.length} damaged notebook file(s) were preserved for recovery. Healthy notebooks are available.`);}
  }
  useEffect(()=>{if(unlocked)void loadWorkspace().catch(e=>notify(String(e)));},[unlocked]); // Only initialize after the password gate.
  function edit(patch:Partial<Notebook>){
    const current=noteRef.current;if(!current)return;
    const next={...current,...patch,updatedAt:new Date().toISOString(),revision:current.revision+1};noteRef.current=next;
    notesRef.current=notesRef.current.map(n=>n.id===next.id?next:n);setNotes(notesRef.current);setSaveState('unsaved');queue.enqueue(next,settingsRef.current.autosaveMs);
  }
  async function rescueDraft(){
    const current=noteRef.current;if(!current)return;
    const copy={...current,id:crypto.randomUUID(),title:current.title+' (working copy)',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:0};
    try{await backend.saveNote(copy);queue.discard(current.id);const list=await backend.listNotes();notesRef.current=list;setNotes(list);setActiveId(copy.id);activeRef.current=copy.id;noteRef.current=copy;setSaveState('saved');notify('Your working draft was saved as a separate notebook.');}catch(e){notify(String(e));}
  }
  async function chooseNote(id:string){
    if(id===activeRef.current)return;
    try{await queue.flush();const selected=notesRef.current.find(n=>n.id===id);if(!selected)return;setActiveId(id);activeRef.current=id;noteRef.current=selected;setView('notebook');await saveSettings({...settingsRef.current,lastNotebook:id});}
    catch(e){notify('The current notebook must save before switching: '+String(e));}
  }
  async function createNote(){
    try{await queue.flush();const created=newNotebook('Untitled notebook',filter==='All notebooks'||filter==='Favorites'?'':filter);await backend.saveNote(created);
      notesRef.current=[created,...notesRef.current];setNotes(notesRef.current);setActiveId(created.id);activeRef.current=created.id;noteRef.current=created;setView('notebook');setFilter('All notebooks');setSearch('');await saveSettings({...settingsRef.current,lastNotebook:created.id});
    }catch(e){notify(String(e));}
  }
  async function lockApp(){try{await queue.flush();await settingsWrites.current;await backend.lock();setUnlocked(false);setNotes([]);notesRef.current=[];noteRef.current=undefined;setDialog(null);setTutorial(false);}catch(e){notify('Could not finish saving before locking: '+String(e));}}
  async function handleSync(){
    if(syncRunning.current)return;
    syncRunning.current=true;setBusySync(true);
    try{await queue.flush();const status=await backend.syncStatus();setSync(status);if(!status.connected)return;
      const after=await backend.syncNow();setSync(after);
      // Keep an in-progress editor draft in memory. A stale disk write is refused by Rust.
      if(!queue.dirty){const list=await backend.listNotes();setNotes(list);notesRef.current=list;const current=list.find(n=>n.id===activeRef.current);if(!current){setActiveId(list[0]?.id??'');}else if(noteRef.current&&JSON.stringify(current.content)!==JSON.stringify(noteRef.current.content)){setActiveId('');requestAnimationFrame(()=>setActiveId(current.id));}noteRef.current=current;}
    }catch(e){setSync(await backend.syncStatus().catch(()=>({...initialSync,state:'error' as const,message:String(e)})));notify(String(e));}
    finally{syncRunning.current=false;setBusySync(false);}
  }
  useEffect(()=>{
    if(!unlocked)return;const timer=setInterval(()=>{void handleSync();},15*60*1000);
    const online=()=>{void handleSync();};window.addEventListener('online',online);return()=>{clearInterval(timer);window.removeEventListener('online',online);};
  },[unlocked]);
  useEffect(()=>{
    if(!unlocked||!settings.lockMinutes)return;let last=Date.now();const activity=()=>{last=Date.now();};
    const events=['pointerdown','keydown','input'];events.forEach(event=>window.addEventListener(event,activity));const timer=setInterval(()=>{if(Date.now()-last>=settings.lockMinutes*60000)void lockApp();},10000);
    return()=>{clearInterval(timer);events.forEach(event=>window.removeEventListener(event,activity));};
  },[unlocked,settings.lockMinutes]);
  useEffect(()=>{
    if(!unlocked)return;let unlisten:(()=>void)|undefined;let disposing=false;
    const onClose=async()=>{try{await queue.flush();await settingsWrites.current;await getCurrentWindow().destroy();}catch(e){notify('QUANTA kept the window open because the latest edits could not be saved: '+String(e));}};
    if(native)getCurrentWindow().onCloseRequested(event=>{event.preventDefault();void onClose();}).then(fn=>{if(disposing)fn();else unlisten=fn;});
    const unload=(event:BeforeUnloadEvent)=>{if(queue.dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',unload);
    const hide=()=>{if(document.visibilityState==='hidden')void queue.flush().catch(()=>{});};document.addEventListener('visibilitychange',hide);
    return()=>{disposing=true;unlisten?.();window.removeEventListener('beforeunload',unload);document.removeEventListener('visibilitychange',hide);};
  },[unlocked,queue,notify]);
  useEffect(()=>{
    pluginHost.current?.destroy();if(!unlocked)return;
    const host=new PluginHost(setPluginCommands,source=>editor.current?.insertMarkdown(source),notify);pluginHost.current=host;
    for(const plugin of plugins)if(settings.pluginIds.includes(plugin.manifest.id))host.load(plugin);
    return()=>{host.destroy();pluginHost.current=null;};
  },[unlocked,plugins,settings.pluginIds,notify]);
  useEffect(()=>{
    if(!unlocked)return;const handler=(e:KeyboardEvent)=>{if(!(e.metaKey||e.ctrlKey)||e.altKey)return;
      if(e.key.toLowerCase()==='s'){e.preventDefault();void queue.flush().catch(err=>notify(String(err)));}
      if(e.key.toLowerCase()==='n'){e.preventDefault();void createNote();}
      if(e.key.toLowerCase()==='k'){e.preventDefault();setDialog('commands');setCommandQuery('');}
      if(e.shiftKey&&e.key.toLowerCase()==='e'){e.preventDefault();setView('notebook');setDialog('equation');}
      if(e.shiftKey&&e.key.toLowerCase()==='f'){e.preventDefault();setFocus(f=>!f);}
    };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[unlocked,queue,notify,filter]);
  useEffect(()=>{if(native&&unlocked&&note)void getCurrentWindow().setTitle(`${note.title} · QUANTA`).catch(()=>{});},[unlocked,note?.title]);
  async function exportEditable(){
    const current=noteRef.current;if(!current)return;try{try{await queue.flush();}catch{notify('Exporting the working draft while local saving needs attention.');}const bytes=new TextEncoder().encode(JSON.stringify(current,null,2));
      if(native){const path=await saveDialog({defaultPath:safeFilename(current.title)+'.quanta',filters:[{name:'QUANTA notebook',extensions:['quanta']}]});if(!path)return;await backend.writeExport(path,bytesToBase64(bytes));}
      else{const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.quanta.notebook+json'}));const a=document.createElement('a');a.href=url;a.download=safeFilename(current.title)+'.quanta';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}notify('Editable notebook copy saved.');
    }catch(e){notify(String(e));}
  }
  function importNote(){const input=document.createElement('input');input.type='file';input.accept='.quanta,.md,.markdown,text/markdown,application/json';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{if(file.size>32*1024*1024)throw new Error('Choose a notebook below 32 MB.');const text=await file.text();if(/\.(md|markdown)$/i.test(file.name)){setMarkdown(text);setDialog('markdown');return;}const imported=validateNotebook(JSON.parse(text));await queue.flush();if(notesRef.current.some(n=>n.id===imported.id)){imported.id=crypto.randomUUID();imported.title+=' (imported copy)';}await backend.saveNote(imported);notesRef.current=[imported,...notesRef.current];setNotes(notesRef.current);setActiveId(imported.id);activeRef.current=imported.id;noteRef.current=imported;setView('notebook');notify('Notebook imported.');}catch(e){notify(String(e));}};input.click();}
  async function trashCurrent(){if(!noteRef.current)return;try{await queue.flush();const id=noteRef.current.id;await backend.trashNote(id);const list=notesRef.current.filter(n=>n.id!==id);notesRef.current=list;setNotes(list);setActiveId(list[0]?.id??'');noteRef.current=list[0];setDialog(null);notify('Moved to Trash. You can restore it from the sidebar.');}catch(e){notify(String(e));}}
  async function showTrash(){try{setTrash(await backend.listTrash());setDialog('trash');}catch(e){notify(String(e));}}
  async function showVersions(){try{await queue.flush();if(noteRef.current){setVersions(await backend.versions(noteRef.current.id));setDialog('versions');}}catch(e){notify(String(e));}}
  const projects=useMemo(()=>[...new Set(notes.map(n=>n.project).filter(Boolean))].sort(),[notes]);
  const visibleNotes=useMemo(()=>notes.filter(n=>(filter==='All notebooks'||filter==='Favorites'&&n.favorite||n.project===filter)&&(!search||[n.title,n.project,...n.tags,textContent(n.content)].join(' ').toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.updatedAt.localeCompare(a.updatedAt)),[notes,filter,search]);
  const wordCount=useMemo(()=>note?textContent(note.content).trim().split(/\s+/).filter(Boolean).length:0,[note]);
  const equationCount=useMemo(()=>note?(JSON.stringify(note.content).match(/"type":"math(Block|Inline)"/g)??[]).length:0,[note]);
  const commands=[
    {title:'New notebook',hint:'⌘/Ctrl N',run:()=>{void createNote();}},
    {title:'Insert equation',hint:'⌘/Ctrl Shift E',run:()=>{setView('notebook');setDialog('equation');}},
    {title:'Insert Markdown',hint:'',run:()=>{setMarkdown('');setDialog('markdown');}},
    {title:'Export notebook',hint:'',run:()=>setDialog('export')},
    {title:'Import .quanta or Markdown',hint:'',run:importNote},
    {title:'Toggle focus mode',hint:'⌘/Ctrl Shift F',run:()=>setFocus(v=>!v)},
    {title:'Open full LaTeX editor',hint:'',run:()=>setView('latex')},
    {title:'Settings',hint:'',run:()=>setDialog('settings')},
    {title:'View saved versions',hint:'',run:()=>{void showVersions();}},
    ...pluginCommands.map(c=>({title:c.title,hint:'Plugin',run:()=>{const p=plugins.find(p=>p.manifest.id===c.pluginId);if(p&&noteRef.current)pluginHost.current?.run(c,noteRef.current,p);}})),
  ].filter(c=>c.title.toLowerCase().includes(commandQuery.toLowerCase()));
  const style={'--paper-width':settings.paperWidth+'px','--editor-size':settings.fontSize+'px','--editor-line-height':settings.lineHeight,'--editor-font':settings.font==='serif'?'Georgia, "Times New Roman", serif':settings.font==='mono'?'ui-monospace, SFMono-Regular, Consolas, monospace':'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'} as CSSProperties;
  if(startupError)return <div className="startup-error"><h1>QUANTA could not open its workspace.</h1><p>{startupError}</p><button className="primary-button" onClick={()=>location.reload()}>Retry</button></div>;
  if(!boot)return <div className="loading-screen"><img src={import.meta.env.BASE_URL+'quanta.svg'} alt="QUANTA" width="64"/><LoaderCircle className="spin" size={22}/></div>;
  if(!unlocked)return <PasswordGate create={boot.needsPassword} onUnlock={async password=>{await backend.unlock(password,boot.needsPassword);setBoot({...boot,needsPassword:false,unlocked:true});setUnlocked(true);}}/>;
  return <div className={`quanta-shell ${focus?'focus-mode':''} ${sidebar?'':'sidebar-hidden'}`} style={style}>
    <aside className="sidebar glass" data-tutorial="sidebar"><div className="brand" data-tauri-drag-region><img src={import.meta.env.BASE_URL+'quanta.svg'} alt="" width="34"/><span>QUANTA</span><button className="icon-button" title="Hide sidebar" aria-label="Hide sidebar" onClick={()=>setSidebar(false)}><PanelLeftClose size={17}/></button></div><div className="sidebar-search"><Search size={15}/><input aria-label="Search notebooks" placeholder="Find a thought…" value={search} onChange={e=>setSearch(e.target.value)}/><kbd>⌘ K</kbd></div><button className="new-note-button" onClick={()=>{void createNote();}}><Plus size={17}/>New notebook</button><nav className="library-nav" aria-label="Library"><button className={filter==='All notebooks'?'active':''} onClick={()=>setFilter('All notebooks')}><BookOpen size={16}/>All notebooks<span>{notes.length}</span></button><button className={filter==='Favorites'?'active':''} onClick={()=>setFilter('Favorites')}><Star size={16}/>Favorites<span>{notes.filter(n=>n.favorite).length}</span></button></nav>{projects.length>0&&<><div className="sidebar-section-label">PROJECTS</div><nav className="project-nav">{projects.map(project=><button className={filter===project?'active':''} key={project} onClick={()=>setFilter(project)}><Folder size={15}/><span>{project}</span></button>)}</nav></>}<div className="sidebar-section-label notes-label">{filter==='All notebooks'?'YOUR NOTEBOOKS':filter.toUpperCase()}<button className="icon-button" aria-label="Import notebook" title="Import .quanta or Markdown" onClick={importNote}><Upload size={14}/></button></div><div className="note-list">{visibleNotes.map(n=><button className={`note-item ${n.id===activeId?'selected':''}`} key={n.id} onClick={()=>{void chooseNote(n.id);}}><div className="note-item-heading"><FileText size={16}/><strong>{n.title}</strong>{n.favorite&&<Star size={12} className="favorite-star"/>}</div><p>{textContent(n.content).slice(0,78)||'An open space for a new idea'}</p><small>{new Date(n.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}{n.project&&<> · {n.project}</>}</small></button>)}{!visibleNotes.length&&<p className="empty-message">{search?'No matching notebooks.':'This space is ready for your first idea.'}</p>}</div><div className="sidebar-footer"><button onClick={()=>{void showTrash();}}><Trash2 size={15}/>Trash</button><button onClick={()=>setDialog('settings')} data-tutorial="settings"><Settings2 size={16}/>Settings</button><button className="icon-button" title="Lock QUANTA" aria-label="Lock QUANTA" onClick={()=>{void lockApp();}}><LockKeyhole size={15}/></button></div><div className="local-first-label"><span className="status-dot"/>A quiet place for clear thinking</div></aside>
    <main className="main-workspace"><header className="topbar" data-tauri-drag-region><div className="breadcrumbs">{(!sidebar||focus)&&<button className="icon-button" aria-label="Show sidebar" onClick={()=>{setSidebar(true);setFocus(false);}}><PanelLeftOpen size={18}/></button>}<span>Workspace</span><ChevronRight size={13}/><strong>{note?.project||'Personal notebooks'}</strong></div><div className="topbar-actions"><button className={`sync-button ${sync.state==='error'||sync.state==='offline'?'sync-warning':''}`} title={sync.message} disabled={busySync} onClick={()=>{if(sync.connected)void handleSync();else setDialog('settings');}}>{busySync?<LoaderCircle className="spin" size={15}/>:sync.connected?<Cloud size={16}/>:<CloudOff size={16}/>}<span>{busySync?'Syncing':sync.connected?'Drive':'Local'}</span></button><button className="icon-button" title="Focus mode · ⌘/Ctrl Shift F" aria-label={focus?'Exit focus mode':'Enter focus mode'} data-tutorial="focus" onClick={()=>setFocus(v=>!v)}>{focus?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button><button className="export-button glass" data-tutorial="export" disabled={!note} onClick={async()=>{try{await queue.flush();setDialog('export');}catch(e){notify(String(e));}}}><Download size={15}/><span>Export</span><ArrowUpRight size={13}/></button></div></header>
    {note?<><div className="workspace-scroller"><div className={`paper ${view==='latex'?'paper-source':''}`} data-tutorial="paper"><div className="note-eyebrow"><span>{note.project||'PERSONAL NOTEBOOK'}</span><div><button className={`icon-button ${note.favorite?'is-favorite':''}`} title="Favorite" aria-label="Toggle favorite" onClick={()=>edit({favorite:!note.favorite})}><Star size={16} fill={note.favorite?'currentColor':'none'}/></button><button className="icon-button" title="Notebook details" aria-label="Notebook details" onClick={()=>setDialog('details')}><MoreHorizontal size={20}/></button></div></div><input className="notebook-title" aria-label="Notebook title" value={note.title} maxLength={500} onChange={e=>edit({title:e.target.value})} placeholder="Untitled notebook"/><div className="note-meta"><span>{new Date(note.createdAt).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})}</span><span className="meta-dot"/>{note.tags.length?<div className="tag-list">{note.tags.map(tag=><span key={tag}>{tag}</span>)}</div>:<button className="add-tags" onClick={()=>setDialog('details')}><Tag size={12}/>Add tags</button>}<div className="editor-mode-switch" role="group" aria-label="Editor mode"><button className={view==='notebook'?'active':''} onClick={()=>setView('notebook')}><BookOpen size={13}/>Notebook</button><button className={view==='latex'?'active':''} onClick={()=>setView('latex')}><FileCode2 size={13}/>LaTeX</button></div></div>{view==='notebook'?<NotebookEditor key={note.id} ref={editor} content={note.content} settings={settings} onChange={content=>edit({content})} onEquation={()=>setDialog('equation')}/>:<SourcePanel key={note.id} note={note} settings={settings} onChange={texSource=>edit({texSource})} notify={notify}/>}<div className="paper-ending"><span/><Sparkles size={12}/><span/></div></div></div><footer className="statusbar"><button className={`save-status save-${saveState}`} onClick={()=>{void queue.flush().catch(e=>notify(String(e)));}}>{saveState==='saved'?<Check size={13}/>:saveState==='saving'?<LoaderCircle className="spin" size={13}/>:saveState==='error'?<Circle size={13}/>:<Circle size={10}/>}<span>{saveState==='saved'?'Saved on this computer':saveState==='saving'?'Saving…':saveState==='error'?'Could not save · retry':'Saving shortly'}</span></button>{saveState==='error'&&<button className="text-button" onClick={()=>{void rescueDraft();}}>Keep draft as new notebook</button>}<div><span>{wordCount} words</span><span>{equationCount} equations</span><button title="Command palette · ⌘/Ctrl K" aria-label="Open command palette" onClick={()=>{setDialog('commands');setCommandQuery('');}}><Command size={12}/><span>Commands</span></button></div></footer></>:<div className="empty-workspace"><img src={import.meta.env.BASE_URL+'quanta.svg'} alt="" width="72"/><h1>A little space to think.</h1><p>Create a notebook for a question worth exploring.</p><button className="primary-button" onClick={()=>{void createNote();}}><Plus size={16}/>New notebook</button></div>}</main>
    {dialog==='equation'&&<EquationDialog macros={settings.customMacros} onClose={closeDialog} onInsert={(latex,inline)=>editor.current?.insertEquation(latex,inline)}/>}
    {dialog==='settings'&&<SettingsDialog settings={settings} onSettings={saveSettings} onClose={closeDialog} sync={sync} onSync={handleSync} onTutorial={()=>setTutorial(true)} plugins={plugins} onPlugins={async()=>setPlugins(await backend.listPlugins())} notify={notify}/>}
    {dialog==='export'&&note&&<ExportDialog note={note} settings={settings} onClose={closeDialog} notify={notify} onEditableExport={exportEditable}/>}
    {dialog==='markdown'&&<Modal title="Bring Markdown into your notebook" onClose={closeDialog} wide><p className="muted">Headings, lists, tables, code, $inline math$, and $$display equations$$.</p><textarea className="code-input markdown-input" aria-label="Markdown to insert" rows={12} value={markdown} onChange={e=>setMarkdown(e.target.value)} spellCheck={false} placeholder="## A new observation"/><div className="modal-footer"><span className="muted">Inserted at the current cursor position</span><button className="primary-button" disabled={!markdown.trim()} onClick={()=>{setView('notebook');requestAnimationFrame(()=>editor.current?.insertMarkdown(markdown));setDialog(null);}}>Insert Markdown</button></div></Modal>}
    {dialog==='details'&&note&&<Modal title="Notebook details" onClose={closeDialog}><label className="field-label">Project<input value={note.project} onChange={e=>edit({project:e.target.value})} placeholder="e.g. Flight systems, Chemistry, Thesis" list="project-list"/><datalist id="project-list">{projects.map(p=><option key={p} value={p}/>)}</datalist></label><label className="field-label">Tags, separated with commas<input defaultValue={note.tags.join(', ')} onBlur={e=>edit({tags:[...new Set(e.target.value.split(',').map(t=>t.trim()).filter(Boolean))].slice(0,30)})} placeholder="experiment, draft, measurements"/></label><div className="details-actions"><button className="secondary-button" onClick={()=>{void showVersions();}}><History size={16}/>Saved versions</button><button className="secondary-button" onClick={()=>{void exportEditable();}}><Download size={16}/>Editable copy</button><button className="danger-button" onClick={()=>{void trashCurrent();}}><Trash2 size={16}/>Move to Trash</button></div><p className="muted">Created {new Date(note.createdAt).toLocaleString()}<br/>Revision {note.revision} · Editable .quanta format</p></Modal>}
    {dialog==='trash'&&<Modal title="Trash" onClose={closeDialog}><p className="muted">These notebooks can be restored. QUANTA does not automatically empty your trash.</p><div className="restore-list">{trash.map(n=><div key={n.id}><FileText size={17}/><span><strong>{n.title}</strong><small>{n.project}</small></span><button className="secondary-button" onClick={async()=>{try{await backend.restoreNote(n.id);const list=await backend.listNotes();setNotes(list);notesRef.current=list;setTrash(await backend.listTrash());if(!activeId)setActiveId(list[0]?.id??'');notify('Notebook restored.');}catch(e){notify(String(e));}}}>Restore</button></div>)}{!trash.length&&<p className="empty-message">Nothing in Trash.</p>}</div></Modal>}
    {dialog==='versions'&&note&&<Modal title="Saved versions" onClose={closeDialog}><p className="muted">QUANTA retains up to 20 local snapshots, at most one per minute. Restoring a snapshot saves it as the current revision.</p><div className="restore-list">{versions.map(v=><div key={v.file}><History size={16}/><span><strong>{new Date(v.updatedAt).toLocaleString()}</strong><small>Revision {v.revision}</small></span><button className="secondary-button" onClick={async()=>{try{await queue.flush();const restored=await backend.restoreVersion(note.id,v.file);await backend.saveNote(restored);setNotes(old=>old.map(n=>n.id===restored.id?restored:n));setActiveId('');requestAnimationFrame(()=>setActiveId(restored.id));setDialog(null);notify('Version restored.');}catch(e){notify(String(e));}}}>Restore</button></div>)}{!versions.length&&<p className="empty-message">Snapshots will appear as you continue editing.</p>}</div></Modal>}
    {dialog==='commands'&&<Modal title="Find a thought or an action" onClose={closeDialog}><div className="command-search"><Search size={18}/><input autoFocus aria-label="Search commands and notebooks" placeholder="Search notebooks and commands…" value={commandQuery} onChange={e=>setCommandQuery(e.target.value)}/></div><div className="command-results">{commands.map(c=><button key={c.title} onClick={()=>{setDialog(null);c.run();}}><Command size={15}/><span>{c.title}</span><kbd>{c.hint}</kbd></button>)}{notes.filter(n=>n.title.toLowerCase().includes(commandQuery.toLowerCase())).slice(0,8).map(n=><button key={n.id} onClick={()=>{setDialog(null);void chooseNote(n.id);}}><FileText size={15}/><span>{n.title}</span><small>Notebook</small></button>)}</div></Modal>}
    {tutorial&&<Tutorial onDone={()=>{setTutorial(false);void saveSettings({...settingsRef.current,tutorialDone:true});}} onAction={kind=>{if(kind==='create')void createNote();if(kind==='text')editor.current?.insertMarkdown('## An observation\n\nThe question, the assumptions, and the result.');if(kind==='equation')setDialog('equation');if(kind==='export')setDialog('export');if(kind==='settings')setDialog('settings');if(kind==='focus')setFocus(f=>!f);}}/>}
    {toast&&<div className="toast glass" role="status"><span>{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}

function PasswordGate({create,onUnlock}:{create:boolean;onUnlock:(password:string)=>Promise<void>}) {
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  return <div className="password-screen"><div className="password-orbit orbit-one"/><div className="password-orbit orbit-two"/><form className="password-card glass" onSubmit={async e=>{e.preventDefault();setError('');if(create&&password!==confirm){setError('The passwords do not match.');return;}setBusy(true);try{await onUnlock(password);}catch(err){setError(String(err));}finally{setBusy(false);}}}><img src={import.meta.env.BASE_URL+'quanta.svg'} alt="" width="70"/><div className="brand-name">QUANTA</div><h1>{create?'A quiet place for your thinking.':'Welcome back.'}</h1><p>{create?'Set a local password to make this space yours. You can start writing immediately.':'Unlock your notebooks and pick up where you left off.'}</p><label className="field-label" htmlFor="unlock-password">{create?'Choose a password':'Password'}</label><input id="unlock-password" type="password" autoFocus autoComplete={create?'new-password':'current-password'} minLength={create?6:undefined} required value={password} onChange={e=>setPassword(e.target.value)} placeholder={create?'At least 6 characters':'Your local QUANTA password'}/>{create&&<><label className="field-label" htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></>}{error&&<p className="error-line" role="alert">{error}</p>}<button type="submit" className="primary-button" disabled={busy}>{busy?<><LoaderCircle className="spin" size={16}/>Opening…</>:<>{create?'Create my workspace':'Unlock QUANTA'}<ChevronRight size={16}/></>}</button><small>Local first. Your ideas have room to grow.</small></form></div>;
}
