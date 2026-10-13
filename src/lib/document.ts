import type { JSONContent } from '@tiptap/core';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { Notebook, Settings } from './types';

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const safeHref = (s: string) => /^(https?:|mailto:|#)/i.test(s) ? escapeHtml(s) : '#';
export const escapeTex = (s: string) => s.replace(/[\\{}$&#%_^~]/g, c => ({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','%':'\\%','_':'\\_','^':'\\textasciicircum{}','~':'\\textasciitilde{}'}[c]!));

export function textContent(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'mathBlock' || node.type === 'mathInline') return node.attrs?.latex ?? '';
  if (node.type === 'hardBreak') return '\n';
  const separator = ['doc','bulletList','orderedList','table','tableRow'].includes(node.type ?? '') ? '\n' : '';
  return (node.content ?? []).map(textContent).join(separator);
}
function mathHtml(latex: string, display: boolean, macros: Record<string,string>): string {
  try { return katex.renderToString(latex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, macros: {...macros}, output: 'htmlAndMathml' }); }
  catch { return `<code>${escapeHtml(latex)}</code>`; }
}
export function nodeHtml(node: JSONContent, macros: Record<string,string> = {}): string {
  const children = () => (node.content ?? []).map(n => nodeHtml(n, macros)).join('');
  if (node.type === 'text') {
    let s = escapeHtml(node.text ?? '');
    for (const m of node.marks ?? []) {
      if (m.type === 'bold') s = `<strong>${s}</strong>`;
      if (m.type === 'italic') s = `<em>${s}</em>`;
      if (m.type === 'strike') s = `<s>${s}</s>`;
      if (m.type === 'underline') s = `<u>${s}</u>`;
      if (m.type === 'code') s = `<code>${s}</code>`;
      if (m.type === 'link') s = `<a href="${safeHref(m.attrs?.href ?? '')}">${s}</a>`;
    }
    return s;
  }
  switch (node.type) {
    case 'doc': return children();
    case 'paragraph': return `<p>${children() || '<br/>'}</p>`;
    case 'heading': { const level = Math.max(1, Math.min(6, Number(node.attrs?.level) || 2)); return `<h${level}>${children()}</h${level}>`; }
    case 'bulletList': return `<ul>${children()}</ul>`;
    case 'orderedList': return `<ol>${children()}</ol>`;
    case 'listItem': return `<li>${children()}</li>`;
    case 'blockquote': return `<blockquote>${children()}</blockquote>`;
    case 'codeBlock': return `<pre><code>${escapeHtml(textContent(node))}</code></pre>`;
    case 'hardBreak': return '<br/>';
    case 'horizontalRule': return '<hr/>';
    case 'mathBlock': return `<div class="equation">${mathHtml(node.attrs?.latex ?? '', true, macros)}</div>`;
    case 'mathInline': return mathHtml(node.attrs?.latex ?? '', false, macros);
    case 'table': return `<table><tbody>${children()}</tbody></table>`;
    case 'tableRow': return `<tr>${children()}</tr>`;
    case 'tableHeader': return `<th>${children()}</th>`;
    case 'tableCell': return `<td>${children()}</td>`;
    case 'image': { const src = node.attrs?.src ?? ''; return /^data:image\/(png|jpeg|webp|gif);base64,/i.test(src) ? `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(node.attrs?.alt ?? '')}"/></figure>` : ''; }
    default: return children();
  }
}
function inlineMarkdown(node: JSONContent): string {
  if (node.type === 'mathInline') return `$${node.attrs?.latex ?? ''}$`;
  if (node.type === 'hardBreak') return '  \n';
  if (node.type !== 'text') return (node.content ?? []).map(inlineMarkdown).join('');
  let s = (node.text ?? '').replace(/([\\`*_\[\]])/g, '\\$1');
  for (const m of node.marks ?? []) {
    if (m.type === 'bold') s = `**${s}**`;
    if (m.type === 'italic') s = `*${s}*`;
    if (m.type === 'strike') s = `~~${s}~~`;
    if (m.type === 'code') s = '`' + (node.text ?? '').replace(/`/g,'\\`') + '`';
    if (m.type === 'link' && /^(https?:|mailto:|#)/i.test(m.attrs?.href ?? '')) s = `[${s}](${String(m.attrs?.href).replace(/[()]/g, c=>encodeURIComponent(c))})`;
  }
  return s;
}
export function nodeMarkdown(node: JSONContent, indent = ''): string {
  const children = () => (node.content ?? []).map(n => nodeMarkdown(n, indent)).join('');
  switch (node.type) {
    case 'doc': return children();
    case 'heading': return '#'.repeat(Number(node.attrs?.level) || 2) + ' ' + inlineMarkdown(node) + '\n\n';
    case 'paragraph': return inlineMarkdown(node) + '\n\n';
    case 'mathBlock': return '$$\n' + (node.attrs?.latex ?? '') + '\n$$\n\n';
    case 'blockquote': return children().trim().split('\n').map(s=>'> '+s).join('\n') + '\n\n';
    case 'bulletList': case 'orderedList': return (node.content ?? []).map((n,i)=> {
      const prefix = indent + (node.type === 'orderedList' ? `${i+1}. ` : '- ');
      return prefix + (n.content ?? []).map(c=>nodeMarkdown(c,indent+'  ')).join('').trim().replace(/\n/g,'\n'+indent+'  ') + '\n';
    }).join('') + '\n';
    case 'codeBlock': return '```' + (node.attrs?.language ?? '') + '\n' + textContent(node) + '\n```\n\n';
    case 'horizontalRule': return '---\n\n';
    case 'table': {
      const rows = (node.content ?? []).map(r => '| '+(r.content ?? []).map(c=>inlineMarkdown(c).replace(/\|/g,'\\|')).join(' | ')+' |');
      if (rows.length) rows.splice(1,0,'| '+(node.content?.[0].content ?? []).map(()=>'---').join(' | ')+' |');
      return rows.join('\n')+'\n\n';
    }
    case 'image': return `![${node.attrs?.alt ?? 'Image'}](${node.attrs?.src ?? ''})\n\n`;
    default: return inlineMarkdown(node);
  }
}
function inlineTex(node: JSONContent): string {
  if (node.type === 'mathInline') return `\\(${node.attrs?.latex ?? ''}\\)`;
  if (node.type === 'hardBreak') return '\\\\\n';
  if (node.type !== 'text') return (node.content ?? []).map(inlineTex).join('');
  let s = escapeTex(node.text ?? '');
  for (const m of node.marks ?? []) {
    if (m.type === 'bold') s = `\\textbf{${s}}`;
    if (m.type === 'italic') s = `\\textit{${s}}`;
    if (m.type === 'underline') s = `\\underline{${s}}`;
    if (m.type === 'code') s = `\\texttt{${s}}`;
    if (m.type === 'link' && /^(https?:|mailto:)/i.test(m.attrs?.href ?? '')) s = `\\href{${escapeTex(m.attrs?.href ?? '')}}{${s}}`;
  }
  return s;
}
export function nodeTex(node: JSONContent): string {
  const children = () => (node.content ?? []).map(nodeTex).join('');
  switch (node.type) {
    case 'doc': return children();
    case 'paragraph': return inlineTex(node)+'\n\n';
    case 'heading': { const command = ['section','subsection','subsubsection','paragraph'][Math.min(3,Math.max(0,Number(node.attrs?.level)-1))]; return `\\${command}{${inlineTex(node)}}\n`; }
    case 'mathBlock': return `\\[\n${node.attrs?.latex ?? ''}\n\\]\n\n`;
    case 'bulletList': return `\\begin{itemize}\n${children()}\\end{itemize}\n`;
    case 'orderedList': return `\\begin{enumerate}\n${children()}\\end{enumerate}\n`;
    case 'listItem': return '\\item '+children();
    case 'blockquote': return `\\begin{quote}\n${children()}\\end{quote}\n`;
    case 'codeBlock': return '\\begin{verbatim}\n'+textContent(node).replace(/\\end\{verbatim\}/g,'[end verbatim]')+'\n\\end{verbatim}\n';
    case 'horizontalRule': return '\\noindent\\rule{\\linewidth}{0.4pt}\n';
    case 'table': { const cols = node.content?.[0].content?.length ?? 1; return `\\begin{center}\n\\begin{tabular}{${'l'.repeat(cols)}}\n\\toprule\n`+(node.content??[]).map(r=>(r.content??[]).map(inlineTex).join(' & ')+' \\\\\n').join('')+'\\bottomrule\n\\end{tabular}\n\\end{center}\n'; }
    case 'image': return `\\textit{[Figure: ${escapeTex(node.attrs?.alt ?? 'embedded image')}. The image is included in HTML/PDF/PNG export.]}\n\n`;
    default: return inlineTex(node);
  }
}
export function notebookTex(note: Notebook, settings: Settings): string {
  const macros = Object.entries(settings.customMacros).filter(([name])=>/^\\[a-zA-Z]+$/.test(name)).map(([name,value])=>{
    const count=Math.max(0,...Array.from(value.matchAll(/#([1-9])/g),m=>Number(m[1])));
    return `\\providecommand{${name}}${count?'['+count+']':''}{${value}}`;
  }).join('\n');
  return `\\documentclass[11pt,${settings.paperSize === 'letter' ? 'letterpaper' : 'a4paper'}]{article}\n\\usepackage{amsmath,amssymb,mathtools,booktabs}\n\\usepackage[margin=25mm]{geometry}\n\\usepackage{hyperref}\n${macros}\n\\title{${escapeTex(note.title)}}\n\\author{${escapeTex(settings.author)}}\n\\date{}\n\\begin{document}\n\\maketitle\n${nodeTex(note.content)}\\end{document}\n`;
}
export function markdownToHtml(source: string): string {
  // Preserve math before Markdown parses underscores and backslashes.
  const equations: {latex:string; display:boolean}[] = [];
  const replaced = source.replace(/\$\$([\s\S]*?)\$\$|\$([^\n$]+)\$/g, (_match, block:string, inline:string)=> {
    equations.push({latex:block ?? inline, display:block !== undefined}); return `QUANTAMATHPLACEHOLDER${equations.length-1}END`;
  });
  let html = DOMPurify.sanitize(marked.parse(replaced, {async:false}) as string);
  html = html.replace(/<p>QUANTAMATHPLACEHOLDER(\d+)END<\/p>/g, (_m,i:string)=>`<div data-type="math-block" data-latex="${escapeHtml(equations[Number(i)].latex)}"></div>`);
  return html.replace(/QUANTAMATHPLACEHOLDER(\d+)END/g, (_m,i:string)=>`<span data-type="math-inline" data-latex="${escapeHtml(equations[Number(i)].latex)}"></span>`);
}
export const exportCss = `body{margin:0;color:#172331;background:#fff;font:16px/1.7 Georgia,"Times New Roman",serif}article{max-width:760px;margin:auto;padding:48px}h1{font-size:36px;line-height:1.2;margin:0 0 16px}h2{font-size:24px;margin:32px 0 12px}h3{font-size:20px}p{margin:0 0 16px}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{border:1px solid #d6dce3;padding:10px;text-align:left}th{background:#f5f7fa}blockquote{border-left:3px solid #9db5ce;margin:24px 0;padding-left:20px;color:#586a7d}code,pre{font:13px/1.6 ui-monospace,monospace;background:#f4f6f8}pre{padding:16px;white-space:pre-wrap}img{max-width:100%;height:auto}figure{margin:24px 0}.equation{padding:16px 0;overflow:hidden}.meta{font:12px/1.6 system-ui,sans-serif;color:#6a7684;margin-bottom:32px}a{color:#33618b}.katex{font-size:1.1em}.katex-display{margin:0;overflow:hidden}@media print{article{padding:0;max-width:none}body{font-size:11pt}h1,h2,h3{break-after:avoid}p,li,figure,.equation,tr{break-inside:avoid}a{color:inherit}}`;
export function exportBody(note: Notebook, settings: Settings): string {
  return `<h1>${escapeHtml(note.title)}</h1><div class="meta">${[settings.author,note.project].filter(Boolean).map(escapeHtml).join(' · ')}</div>${nodeHtml(note.content, settings.customMacros)}`;
}
