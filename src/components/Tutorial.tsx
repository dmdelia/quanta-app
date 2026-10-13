import { useEffect, useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
const steps=[
  {target:'sidebar',title:'A home for your thinking',text:'Create a notebook, give it a project, and keep related ideas together. The search field finds titles, tags, and note content.',action:'Try creating a notebook',kind:'create'},
  {target:'paper',title:'Write like a notebook',text:'Click the page and write. Format text with the floating toolbar or use familiar Markdown shortcuts: ##, -, >, and code fences.',action:'Insert a short example',kind:'text'},
  {target:'toolbar',title:'Keep the mathematics close',text:'Open Equation to choose a template or type LaTeX. Click any equation on the page to edit it visually.',action:'Try the equation editor',kind:'equation'},
  {target:'export',title:'Share the result',text:'Export PDF, PNG, SVG, Markdown, HTML, text, or LaTeX. Your editable .quanta notebook remains separate.',action:'Explore export options',kind:'export'},
  {target:'settings',title:'Make the space yours',text:'Change the theme, typeface, glass effects, and password. Connect Google Drive when you want your notebooks on both computers.',action:'Open settings',kind:'settings'},
  {target:'focus',title:'A quieter view',text:'Focus mode removes navigation and keeps your page in view. Press the shortcut or use the focus button to return.',action:'Try focus mode',kind:'focus'},
] as const;
export function Tutorial({onDone,onAction}:{onDone:()=>void;onAction:(kind:string)=>void}) {
  const [step,setStep]=useState(0);const item=steps[step];
  useEffect(()=>{const el=document.querySelector(`[data-tutorial="${item.target}"]`);el?.classList.add('tutorial-target');return()=>el?.classList.remove('tutorial-target');},[item.target]);
  return <aside className="tutorial-card glass" aria-label="QUANTA guided tour"><div className="tutorial-top"><span>WELCOME TO QUANTA</span><button className="icon-button" aria-label="Skip tutorial" onClick={onDone}><X size={16}/></button></div><div className="tour-progress">{steps.map((_,i)=><span key={i} className={i<=step?'complete':''}/>)}</div><h3>{item.title}</h3><p>{item.text}</p><button className="tutorial-action" onClick={()=>onAction(item.kind)}>{item.action}<ArrowRight size={14}/></button><div className="tutorial-bottom"><button className="text-button" onClick={onDone}>Skip tour</button><span>{step+1} of {steps.length}</span><button className="primary-button" onClick={()=>step===steps.length-1?onDone():setStep(step+1)}>{step===steps.length-1?<><Check size={14}/>Done</>:<>Next<ArrowRight size={14}/></>}</button></div></aside>;
}
