// @vitest-environment jsdom
import { describe,it,expect } from 'vitest';
import { escapeTex,nodeHtml,nodeMarkdown,nodeTex,markdownToHtml } from '../src/lib/document';
import { validateNotebook,newNotebook } from '../src/lib/types';
import { starMathToLatex } from '../src/lib/starmath';

describe('Notebook interchange and exports',()=>{
  it('retains LaTeX in Markdown and TeX exports',()=>{
    const note=newNotebook();note.content={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Energy: '},{type:'mathInline',attrs:{latex:'mc^2'}}]},{type:'mathBlock',attrs:{latex:'E=mc^2'}}]};
    expect(nodeMarkdown(note.content)).toContain('$mc^2$');expect(nodeMarkdown(note.content)).toContain('$$\nE=mc^2\n$$');expect(nodeTex(note.content)).toContain('\\(mc^2\\)');expect(nodeTex(note.content)).toContain('\\[\nE=mc^2');
  });
  it('preserves underscores in imported mathematics',()=>{const html=markdownToHtml('A value $x_i$ and:\n\n$$\n\\frac{a}{b}\n$$');expect(html).toContain('data-latex="x_i"');expect(html).toContain('data-type="math-block"');expect(html).not.toContain('<em>');});
  it('sanitizes Markdown and exported links',()=>{expect(markdownToHtml('<img src=x onerror=alert(1)><script>alert(1)</script>')).not.toContain('onerror');const html=nodeHtml({type:'text',text:'unsafe',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]});expect(html).toContain('href="#"');});
  it('escapes TeX text without destroying equations',()=>{expect(escapeTex('50% & a_b')).toBe('50\\% \\& a\\_b');});
  it('rejects unsupported or malformed notebook files',()=>{expect(()=>validateNotebook({format:'quanta.notebook',schemaVersion:99})).toThrow();expect(()=>validateNotebook({...newNotebook(),updatedAt:'bad'})).toThrow();expect(validateNotebook(newNotebook()).content.type).toBe('doc');});
});
describe('LibreOffice Math expression import',()=>{
  it('converts grouped fractions and roots',()=>{expect(starMathToLatex('{a+b} over {sqrt c}')).toBe('\\frac{{a + b}}{{\\sqrt{c}}}');});
  it('converts matrices, limits, and Greek symbols',()=>{expect(starMathToLatex('matrix {a # b ## c # d}')).toBe('\\begin{matrix}a & b \\\\ c & d\\end{matrix}');expect(starMathToLatex('sum from {i=1} to n %alpha_i')).toContain('\\sum_{{i = 1}}^{n}');});
  it('reports unsupported formatting and invalid groups',()=>{expect(()=>starMathToLatex('color red x')).toThrow('formatting');expect(()=>starMathToLatex('{x')).toThrow('Unclosed');});
});
