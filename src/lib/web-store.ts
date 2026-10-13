const DATABASE='quanta-workspace';const TABLE='records';
let connection:Promise<IDBDatabase>|null=null;
const pending=new Map<string,Promise<unknown>>();
export async function webWithLock<T>(name:string,operation:()=>Promise<T>):Promise<T>{
  if(navigator.locks)return navigator.locks.request('quanta-'+name,operation);
  // Serialize within this window when the browser has no Web Locks implementation.
  const previous=pending.get(name)??Promise.resolve();
  const next=previous.catch(()=>{}).then(operation);pending.set(name,next);
  try{return await next;}finally{if(pending.get(name)===next)pending.delete(name);}
}
function database():Promise<IDBDatabase>{
  if(!connection)connection=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);request.onupgradeneeded=()=>request.result.createObjectStore(TABLE);
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>{connection=null;reject(new Error('Browser storage could not open. Allow site storage for QUANTA.'));};
    request.onblocked=()=>reject(new Error('Another QUANTA tab is updating storage. Close it and retry.'));
  });return connection;
}
export async function webRead<T>(key:string,fallback:T):Promise<T>{
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction(TABLE,'readonly');const request=tx.objectStore(TABLE).get(key);
    request.onsuccess=()=>{
      if(request.result!==undefined){resolve(request.result as T);return;}
      // Preserve notebooks from early browser previews when upgrading to IndexedDB.
      try{const legacy=localStorage.getItem('quanta.'+key);resolve(legacy?JSON.parse(legacy):fallback);}catch{resolve(fallback);}
    };request.onerror=()=>reject(new Error('QUANTA could not read browser storage.'));
  });
}
export async function webWrite(key:string,value:unknown):Promise<void>{
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction(TABLE,'readwrite');tx.objectStore(TABLE).put(structuredClone(value),key);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('QUANTA could not save locally. Your browser storage may be full. Export an editable copy before closing.'));tx.onabort=()=>reject(new Error('The local save was interrupted. Keep QUANTA open and retry.'));
  });
}
export async function requestPersistentStorage(){if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);}
