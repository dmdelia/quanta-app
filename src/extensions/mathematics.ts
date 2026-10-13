import { Node, mergeAttributes } from '@tiptap/core';
import { MathfieldElement } from 'mathlive';
import 'mathlive/fonts.css';

MathfieldElement.fontsDirectory = null; // Fonts are bundled by Vite through fonts.css.
MathfieldElement.soundsDirectory = null;

export const mathExtension = (inline: boolean) => Node.create({
  name: inline ? 'mathInline' : 'mathBlock', group: inline ? 'inline' : 'block', inline,
  atom: true, selectable: true, draggable: !inline,
  addAttributes() { return { latex: { default: '', parseHTML: el => el.getAttribute('data-latex'), renderHTML: attrs => ({'data-latex': attrs.latex}) } }; },
  parseHTML() { return [{ tag: `${inline?'span':'div'}[data-type="math-${inline?'inline':'block'}"]` }]; },
  renderHTML({HTMLAttributes}) { return [inline?'span':'div', mergeAttributes(HTMLAttributes, {'data-type':`math-${inline?'inline':'block'}`})]; },
  addNodeView() {
    return ({node, getPos, editor}) => {
      const dom = document.createElement(inline?'span':'div'); dom.className = inline?'math-inline':'math-block';
      dom.setAttribute('data-type', `math-${inline?'inline':'block'}`); dom.contentEditable = 'false';
      const field = new MathfieldElement(); field.value = node.attrs.latex;
      field.mathVirtualKeyboardPolicy = 'manual'; field.setAttribute('aria-label', 'Editable equation');
      field.placeholder = inline ? 'x' : 'Click to write an equation';
      const handleInput = () => {
        const pos = getPos(); if (typeof pos !== 'number' || editor.isDestroyed) return;
        const current = editor.state.doc.nodeAt(pos); if (!current) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, {...current.attrs,latex:field.value}));
      };
      field.addEventListener('input', handleInput);
      field.addEventListener('focus', ()=>dom.classList.add('math-focused'));
      field.addEventListener('blur', ()=>dom.classList.remove('math-focused'));
      dom.append(field);
      if (!inline) { const hint = document.createElement('span'); hint.className = 'equation-hint'; hint.textContent = 'EQUATION'; dom.append(hint); }
      return { dom, stopEvent: event => field.contains(event.target as globalThis.Node) || event.target === field,
        ignoreMutation: ()=>true,
        update: updated => { if(updated.type.name!==node.type.name)return false; if(field.value!==updated.attrs.latex)field.setValue(updated.attrs.latex,{silenceNotifications:true}); return true; },
        destroy: ()=>field.removeEventListener('input',handleInput),
      };
    };
  },
});

export const MathInline = mathExtension(true);
export const MathBlock = mathExtension(false);
