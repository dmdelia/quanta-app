import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=> {
    const previous=document.activeElement as HTMLElement|null;
    const dialog=ref.current!; const focusable=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"],math-field'));
    focusable()[0]?.focus();
    const handler=(e:KeyboardEvent)=> {
      if(e.key==='Escape'){e.preventDefault();onClose();}
      if(e.key==='Tab'){const elements=focusable();const first=elements[0];const last=elements.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    };
    document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);previous?.focus();};
  },[onClose]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`modal glass ${wide?'modal-wide':''}`}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label={`Close ${title}`} onClick={onClose}><X size={18}/></button></div>{children}</div></div>;
}
