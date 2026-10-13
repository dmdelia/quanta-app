import type { InstalledPlugin, Notebook } from './types';
export interface PluginCommand {id:string;title:string;pluginId:string;}
export class PluginHost {
  private workers=new Map<string,Worker>();
  private commands:PluginCommand[]=[];
  constructor(private changed:(commands:PluginCommand[])=>void,private insert:(markdown:string)=>void,private notice:(message:string)=>void){}
  load(plugin:InstalledPlugin) {
    this.unload(plugin.manifest.id);const id=plugin.manifest.id;
    // No eval in the application window. Plugins run without DOM, filesystem, or Tauri globals.
    const prelude=`"use strict";const commands=new Map();const quanta={registerCommand(command,run){if(!command||typeof command.id!=="string"||typeof command.title!=="string"||typeof run!=="function")throw Error("Invalid command");commands.set(command.id,run);postMessage({type:"register",id:command.id,title:command.title});}};self.onmessage=async(event)=>{const m=event.data;if(m.type!=="run")return;const permissions=m.permissions;const api={getNotebook(){if(!permissions.includes("read-note"))throw Error("read-note permission required");return structuredClone(m.note);},insertMarkdown(text){if(!permissions.includes("insert-content"))throw Error("insert-content permission required");postMessage({type:"insert",markdown:String(text)});},notify(text){postMessage({type:"notice",message:String(text)});}};try{const run=commands.get(m.id);if(!run)throw Error("Unknown command");await run(api);}catch(e){postMessage({type:"error",message:String(e?.message||e)});}};\n`;
    const url=URL.createObjectURL(new Blob([prelude,plugin.source],{type:'text/javascript'}));const worker=new Worker(url,{name:'quanta-plugin-'+id});URL.revokeObjectURL(url);
    worker.onmessage=(event:MessageEvent)=> {
      const m=event.data;
      if(m?.type==='register'&&typeof m.id==='string'&&typeof m.title==='string'&&m.id.length<100&&m.title.length<100){this.commands.push({id:m.id,title:m.title,pluginId:id});this.changed([...this.commands]);}
      if(m?.type==='insert'&&plugin.manifest.permissions.includes('insert-content')&&typeof m.markdown==='string'&&m.markdown.length<=50000)this.insert(m.markdown);
      if((m?.type==='notice'||m?.type==='error')&&typeof m.message==='string')this.notice(`${plugin.manifest.name}: ${m.message.slice(0,500)}`);
    };
    worker.onerror=()=>this.notice(`${plugin.manifest.name} could not start. Disable it in Settings and check its source.`);this.workers.set(id,worker);
  }
  run(command:PluginCommand,note:Notebook,plugin:InstalledPlugin){this.workers.get(command.pluginId)?.postMessage({type:'run',id:command.id,permissions:plugin.manifest.permissions,note:plugin.manifest.permissions.includes('read-note')?note:null});}
  unload(id:string){this.workers.get(id)?.terminate();this.workers.delete(id);this.commands=this.commands.filter(c=>c.pluginId!==id);this.changed([...this.commands]);}
  destroy(){for(const w of this.workers.values())w.terminate();this.workers.clear();}
}
