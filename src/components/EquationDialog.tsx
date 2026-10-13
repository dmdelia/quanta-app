import { useEffect, useRef, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import { Modal } from './Modal';
import { equationGroups } from '../lib/equations';
import { starMathToLatex } from '../lib/starmath';
import { applyMathMacros } from '../lib/math-macros';

export function EquationDialog({onClose,onInsert,macros}:{onClose:()=>void;onInsert:(latex:string,inline:boolean)=>void;macros:Record<string,string>}) {
  const host=useRef<HTMLDivElement>(null);const field=useRef<MathfieldElement|null>(null);
  const [latex,setLatex]=useState('');const [group,setGroup]=useState(0);const [inline,setInline]=useState(false);
  const [starMath,setStarMath]=useState('');const [error,setError]=useState('');
  useEffect(()=>{
    const mf=new MathfieldElement();mf.mathVirtualKeyboardPolicy='manual';mf.placeholder='Your equation starts here';mf.setAttribute('aria-label','Equation preview editor');
    const handle=()=>setLatex(mf.value);mf.addEventListener('input',handle);host.current!.append(mf);field.current=mf;
    return()=>{mf.removeEventListener('input',handle);mf.remove();field.current=null;};
  },[]);
  useEffect(()=>{if(field.current)applyMathMacros(field.current,macros);},[macros]);
  function setSource(value:string){setLatex(value);field.current?.setValue(value,{silenceNotifications:true});}
  return <Modal title="Write an equation" onClose={onClose} wide><p className="muted">Type naturally, use a template, or write LaTeX. Your equation stays editable.</p><div className="equation-preview" ref={host}/><div className="equation-tabs">{equationGroups.map((g,i)=><button className={group===i?'active':''} key={g.name} onClick={()=>setGroup(i)}>{g.name}</button>)}</div><div className="equation-palette">{equationGroups[group].items.map(([name,value])=><button key={name} title={value} onClick={()=>{field.current?.insert(value);setLatex(field.current?.value??'');field.current?.focus();}}>{name}</button>)}</div><label className="field-label" htmlFor="equation-source">LaTeX source</label><textarea id="equation-source" className="code-input" rows={3} value={latex} onChange={e=>setSource(e.target.value)} spellCheck={false} placeholder="\frac{a}{b} + \int_0^1 f(x)\,dx"/><details className="setup-details"><summary>Import a LibreOffice Math expression</summary><p>Core StarMath syntax: fractions, roots, matrices, sums, accents, brackets, symbols, and scripts. Unsupported formatting is reported explicitly.</p><textarea className="code-input" aria-label="StarMath expression" rows={3} value={starMath} onChange={e=>setStarMath(e.target.value)} placeholder="{a + b} over {sqrt c}"/><button className="secondary-button" onClick={()=>{try{setSource(starMathToLatex(starMath));setError('');}catch(e){setError(String(e));}}}>Convert to editable equation</button>{error&&<p className="error-line" role="alert">{error}</p>}</details><div className="modal-footer"><label className="check-label"><input type="checkbox" checked={inline} onChange={e=>setInline(e.target.checked)}/>Inline with text</label><button className="primary-button" onClick={()=>{onInsert(latex,inline);onClose();}} disabled={!latex.trim()}>Insert equation</button></div></Modal>;
}
