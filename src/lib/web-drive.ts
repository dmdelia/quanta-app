import { webRead, webWrite, webWithLock } from './web-store';
import { defaultSettings, validateNotebook, type Notebook, type Settings, type SyncStatus } from './types';

interface Remote {id:string;name:string;createdTime:string;appProperties:Record<string,string>;}
interface Index {entries:Record<string,{remoteId:string;baseHash:string}>;lastSync:string|null;account:string;tombstones:Record<string,string>;}
interface ExportJob {id:string;name:string;data:string;mime:string;replace:boolean;}
interface GoogleClient {requestAccessToken:(options:{prompt:string})=>void;}
interface GoogleIdentity {accounts:{oauth2:{initTokenClient:(options:{client_id:string;scope:string;callback:(r:{access_token?:string;expires_in:number;error?:string})=>void;error_callback:(e:{type:string})=>void})=>GoogleClient;revoke:(token:string,callback:()=>void)=>void}};}
let accessToken='';let expiresAt=0;let status:SyncStatus={connected:false,state:'disconnected',lastSync:null,pending:0,account:'',message:'Connect Google Drive to sync your notebooks.'};
let gisLoading:Promise<GoogleIdentity>|null=null;let running:Promise<SyncStatus>|null=null;
const freshIndex=():Index=>({entries:{},lastSync:null,account:'',tombstones:{}});
async function sha(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
// Rust serde serializes struct fields in this exact order; keeping it here makes web/native hashes identical.
function canonical(n:Notebook){return JSON.stringify({format:n.format,schemaVersion:n.schemaVersion,id:n.id,title:n.title,project:n.project,tags:n.tags,favorite:n.favorite,createdAt:n.createdAt,updatedAt:n.updatedAt,revision:n.revision,content:sortJson(n.content),texSource:n.texSource});}
function sortJson(value:unknown):unknown {if(Array.isArray(value))return value.map(sortJson);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,sortJson(v)]));return value;}
export const noteHash=(n:Notebook)=>sha(canonical(n));
export async function conflictId(note:Notebook):Promise<string>{
  const ns=Uint8Array.from('6ba7b8119dad11d180b400c04fd430c8'.match(/../g)!,s=>parseInt(s,16));
  const name=new TextEncoder().encode(`quanta-conflict:${note.id}:${await noteHash(note)}`);
  const input=new Uint8Array(ns.length+name.length);input.set(ns);input.set(name,ns.length);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-1',input)).slice(0,16);digest[6]=(digest[6]&15)|80;digest[8]=(digest[8]&63)|128;
  const hex=[...digest].map(b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function google():Promise<GoogleIdentity>{
  const existing=(window as Window&{google?:GoogleIdentity}).google;if(existing)return existing;
  if(!gisLoading)gisLoading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onload=()=>{const loaded=(window as Window&{google?:GoogleIdentity}).google;if(loaded)resolve(loaded);else reject(new Error('Google sign-in did not load.'));};
    script.onerror=()=>{gisLoading=null;reject(new Error('Google sign-in is unavailable. Your notebooks are saved locally.'));};document.head.append(script);
  });return gisLoading;
}
function token(){if(!accessToken||Date.now()>expiresAt-30000){status={...status,connected:false,state:'disconnected',message:'Connect your Google account to authorize this browser session.'};throw new Error(status.message);}return accessToken;}
async function api(path:string,init:RequestInit={}):Promise<Response>{
  const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+token());
  let response:Response;try{response=await fetch(path.startsWith('https:')?path:'https://www.googleapis.com/drive/v3/'+path,{...init,headers,signal:AbortSignal.timeout(45000)});}catch{throw new Error('Google Drive could not be reached. Your local notes and queued exports are safe.');}
  if(!response.ok){if(response.status===401){accessToken='';status.connected=false;}throw new Error(response.status===403?'Google Drive refused access. Check the Drive API and your Web OAuth client.':response.status===429?'Google Drive requested a slower sync. QUANTA will retry in 15 minutes.':'Google Drive returned an error. No local files were deleted.');}return response;
}
async function list(q:string):Promise<Remote[]>{const files:Remote[]=[];let page='';do{const params=new URLSearchParams({q,fields:'nextPageToken,files(id,name,createdTime,appProperties)',pageSize:'1000',spaces:'drive'});if(page)params.set('pageToken',page);const value=await(await api('files?'+params)).json();files.push(...value.files.map((f:Remote)=>({...f,appProperties:f.appProperties??{}})));page=value.nextPageToken??'';}while(page);return files;}
async function folder(parent:string|null,name:string,kind:string):Promise<string>{const q=`trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='quantaFolder' and value='${kind}' }${parent?` and '${parent}' in parents`:''}`;const folders=await list(q);if(folders.length)return folders[0].id;const metadata={name,mimeType:'application/vnd.google-apps.folder',appProperties:{quantaFolder:kind},...(parent?{parents:[parent]}:{})};return (await(await api('files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(metadata)})).json()).id;}
async function upload(parent:string,name:string,mime:string,data:Blob,props:Record<string,string>,replaceId?:string):Promise<Remote>{
  const boundary='quanta-'+crypto.randomUUID();const meta={name,mimeType:mime,appProperties:props,...(!replaceId?{parents:[parent]}:{})};
  const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,data,`\r\n--${boundary}--\r\n`]);
  return(await api(`https://www.googleapis.com/upload/drive/v3/files${replaceId?'/'+replaceId:''}?uploadType=multipart&fields=id,name,createdTime,appProperties`,{method:replaceId?'PATCH':'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body})).json();
}
async function download(file:Remote):Promise<Notebook>{const response=await api('files/'+file.id+'?alt=media');const text=await response.text();if(text.length>32*1024*1024)throw new Error('A Drive notebook exceeds 32 MB.');const note=validateNotebook(JSON.parse(text));if(note.id!==file.appProperties.quantaId||await noteHash(note)!==file.appProperties.quantaHash)throw new Error('A Drive revision is damaged. QUANTA kept your local copy.');return note;}
function heads(files:Remote[]):Remote[]{const parents=new Set(files.map(f=>f.appProperties.quantaParent).filter(Boolean));return files.filter(f=>!parents.has(f.appProperties.quantaHash)).sort((a,b)=>a.createdTime.localeCompare(b.createdTime)||a.id.localeCompare(b.id));}
async function preserve(note:Notebook,notes:Notebook[]){
  // A stable, valid UUID prevents repeated conflict copies after retries.
  const id=await conflictId(note);
  if(!notes.some(n=>n.id===id))notes.push({...note,id,title:note.title+' (conflict copy)',tags:[...note.tags,'sync-conflict']});
}
async function withNotes<T>(operation:(notes:Notebook[])=>Promise<T>):Promise<T>{return webWithLock('notes-write',async()=>{const notes=await webRead<Notebook[]>('notes',[]);const result=await operation(notes);await webWrite('notes',notes);return result;});}
async function commitIndex(index:Index,processed?:{id:string;date:string}){return webWithLock('sync-index',async()=>{const current=await webRead<Index>('sync',freshIndex());index.tombstones=current.tombstones;if(processed&&index.tombstones[processed.id]===processed.date)delete index.tombstones[processed.id];await webWrite('sync',index);});}
export const webDrive={
  async connect():Promise<SyncStatus>{
    return webWithLock('drive-sync',async()=>{
    const settings={...defaultSettings,...await webRead<Partial<Settings>>('settings',{})};
    if(!settings.googleWebClientId.endsWith('.apps.googleusercontent.com'))throw new Error('Enter a Web OAuth client ID in Google Drive settings first. Add this site origin as an authorized JavaScript origin in Google Cloud.');
    const identity=await google();await new Promise<void>((resolve,reject)=>{
      const client=identity.accounts.oauth2.initTokenClient({client_id:settings.googleWebClientId,scope:'https://www.googleapis.com/auth/drive.file openid email',callback:r=>{if(!r.access_token){reject(new Error('Google sign-in was declined or could not complete.'));return;}accessToken=r.access_token;expiresAt=Date.now()+r.expires_in*1000;resolve();},error_callback:()=>reject(new Error('Google sign-in did not open. Allow the sign-in popup and try again.'))});client.requestAccessToken({prompt:'select_account'});
    });
    const profile=await(await api('https://www.googleapis.com/oauth2/v3/userinfo')).json();let index=await webRead<Index>('sync',freshIndex());if(index.account&&index.account!==profile.email)index=freshIndex();index.account=profile.email;await webWrite('sync',index);status={...status,connected:true,state:'idle',account:index.account,message:'Google Drive is connected to this browser session.'};return this.status();
    });
  },
  async disconnect(){return webWithLock('drive-sync',async()=>{if(accessToken){const identity=await google();const old=accessToken;accessToken='';expiresAt=0;identity.accounts.oauth2.revoke(old,()=>{});}status={...status,connected:false,state:'disconnected',message:'Google Drive disconnected.'};});},
  async status():Promise<SyncStatus>{const index=await webRead<Index>('sync',freshIndex());const notes=await webRead<Notebook[]>('notes',[]);let dirty=0;for(const n of notes)if(index.entries[n.id]?.baseHash!==await noteHash(n))dirty++;return {...status,connected:!!accessToken&&Date.now()<expiresAt-30000,lastSync:index.lastSync,account:index.account,pending:dirty+(await webRead<ExportJob[]>('export-queue',[])).length+Object.keys(index.tombstones).length};},
  async queue(name:string,data:string,mime:string,replace:boolean){if(!name||/[\/\\\0]/.test(name))throw new Error('Choose a plain export filename.');return webWithLock('export-queue',async()=>{const jobs=await webRead<ExportJob[]>('export-queue',[]);jobs.push({id:crypto.randomUUID(),name,data,mime,replace});await webWrite('export-queue',jobs);});},
  async tombstone(id:string){return webWithLock('sync-index',async()=>{const index=await webRead<Index>('sync',freshIndex());index.tombstones[id]=new Date().toISOString();await webWrite('sync',index);});},
  async restore(id:string){return webWithLock('sync-index',async()=>{const index=await webRead<Index>('sync',freshIndex());delete index.tombstones[id];await webWrite('sync',index);});},
  async run():Promise<SyncStatus>{
    if(running)return running;
    const execute=async()=>{
      token();status={...status,state:'syncing'};const root=await folder(null,'QUANTA','root');const notesFolder=await folder(root,'Notebooks','notebooks');const exportsFolder=await folder(root,'Exports','exports');
      const remote=await list(`trashed=false and '${notesFolder}' in parents`);let index=await webRead<Index>('sync',freshIndex());
      for(const [id,date] of Object.entries(index.tombstones)){const hash='deleted:'+date;const exists=remote.find(f=>f.appProperties.quantaId===id&&f.appProperties.quantaHash===hash);const file=exists??await upload(notesFolder,id+'.qtrash','application/json',new Blob([JSON.stringify({id,deletedAt:date})]),{quantaId:id,quantaHash:hash,quantaParent:index.entries[id]?.baseHash??'',quantaDeleted:'true'});index.entries[id]={remoteId:file.id,baseHash:hash};remote.push(file);await commitIndex(index,{id,date});}
      const groups=new Map<string,Remote[]>();for(const f of remote){const id=f.appProperties.quantaId;if(id){groups.set(id,[...groups.get(id)??[],f]);}}
      for(const [id,files] of groups){const leaves=heads(files);const winner=leaves.pop();if(!winner)continue;
        for(const losing of leaves.filter(f=>f.appProperties.quantaDeleted!=='true')){const n=await download(losing);await withNotes(async notes=>preserve(n,notes));}
        const base=index.entries[id]?.baseHash;
        if(winner.appProperties.quantaDeleted==='true'){
          const local=(await webRead<Notebook[]>('notes',[])).find(n=>n.id===id);if(local&&base===winner.appProperties.quantaHash)continue;
          await withNotes(async notes=>{const n=notes.find(n=>n.id===id);if(n){if(await noteHash(n)!==winner.appProperties.quantaParent)await preserve(n,notes);const trash=await webRead<Notebook[]>('trash',[]);await webWrite('trash',[n,...trash.filter(t=>t.id!==id)]);notes.splice(notes.findIndex(n=>n.id===id),1);}});
          index.entries[id]={remoteId:winner.id,baseHash:winner.appProperties.quantaHash};
        }else{
          const local=(await webRead<Notebook[]>('notes',[])).find(n=>n.id===id);const localHash=local?await noteHash(local):'';const remoteHash=winner.appProperties.quantaHash;
          if(localHash===remoteHash)index.entries[id]={remoteId:winner.id,baseHash:remoteHash};
          else if(!local||base!==remoteHash){const downloaded=await download(winner);await withNotes(async notes=>{const i=notes.findIndex(n=>n.id===id);if(i>=0){const current=await noteHash(notes[i]);if(current!==remoteHash&&current!==base)await preserve(notes[i],notes);notes[i]=downloaded;}else notes.push(downloaded);});index.entries[id]={remoteId:winner.id,baseHash:remoteHash};}
        }
        await commitIndex(index);
      }
      const notes=await webRead<Notebook[]>('notes',[]);
      for(const note of notes){const hash=await noteHash(note);if(index.entries[note.id]?.baseHash===hash)continue;const existing=remote.find(f=>f.appProperties.quantaId===note.id&&f.appProperties.quantaHash===hash);const file=existing??await upload(notesFolder,note.title.replace(/[<>:"\/\\|?*]/g,'_')+' - r'+note.revision+'.quanta','application/vnd.quanta.notebook+json',new Blob([JSON.stringify(note,null,2)]),{quantaId:note.id,quantaHash:hash,quantaParent:index.entries[note.id]?.baseHash??''});index.entries[note.id]={remoteId:file.id,baseHash:hash};await commitIndex(index);}
      const exports=await list(`trashed=false and '${exportsFolder}' in parents`);const jobs=await webRead<ExportJob[]>('export-queue',[]);
      for(const job of jobs){if(!exports.some(f=>f.appProperties.quantaJob===job.id)){const bytes=Uint8Array.from(atob(job.data),c=>c.charCodeAt(0));const file=await upload(exportsFolder,job.name,job.mime,new Blob([bytes]),{quantaJob:job.id},job.replace?exports.find(f=>f.name===job.name)?.id:undefined);exports.push(file);}await webWithLock('export-queue',async()=>{const current=await webRead<ExportJob[]>('export-queue',[]);await webWrite('export-queue',current.filter(j=>j.id!==job.id));});}
      index.lastSync=new Date().toISOString();await commitIndex(index);status={...status,state:'idle',message:'Your notebooks are up to date.'};return this.status();
    };
    running=webWithLock('drive-sync',execute);try{return await running;}catch(e){status={...status,state:'offline',message:String(e)};throw e;}finally{running=null;}
  },
};
