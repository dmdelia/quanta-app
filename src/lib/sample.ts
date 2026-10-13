import { newNotebook, type Notebook } from './types';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const h = (text: string) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });
const math = (latex: string) => ({ type: 'mathBlock', attrs: { latex } });

export function welcomeNotebook(): Notebook {
  return { ...newNotebook('A little space to think', 'Getting started'), tags: ['welcome'], content: {
    type: 'doc', content: [
      p('A notebook for the ideas that deserve a little room. Write naturally, keep the mathematics close, and let the details settle into place.'),
      h('From a question to an equation'),
      p('Begin with the question. What do you know, what are you assuming, and what would change your mind?'),
      math('E = mc^2'),
      p('Click an equation to edit it visually. Use the equation palette for fractions, matrices, integrals, Greek letters, and more. LaTeX input is always one click away.'),
      h('Make your thinking reproducible'),
      { type: 'bulletList', content: [
        { type: 'listItem', content: [p('Keep units, sources, and assumptions next to the calculation.')] },
        { type: 'listItem', content: [p('Use a table to compare measurements. Add images and code when they explain the work.')] },
        { type: 'listItem', content: [p('Export a finished result, while your editable .quanta notebook stays separate.')] },
      ] },
      math('\\mathbf{y} = \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} \\mathbf{x}'),
      h('Your work, wherever you are'),
      p('Notes save on this computer first. Connect Google Drive in Settings to sync with your other computer every 15 minutes. QUANTA keeps both versions when edits collide.'),
      { type: 'blockquote', content: [p('Clear thinking starts with a quiet place to put it.')] },
    ],
  } };
}

export const paperTemplate = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage{amsmath,amssymb,mathtools}
\usepackage{graphicx,booktabs,siunitx}
\usepackage[margin=25mm]{geometry}
\usepackage{hyperref}
\title{A scientific note}
\author{}
\date{\today}
\begin{document}
\maketitle
\section{Question}
State the question and the assumptions.
\begin{equation}
  \mathbf{F} = m\mathbf{a}
\end{equation}
\section{Method}
Describe the method, units, and measurements.
\section{Results}
\begin{align}
  E &= mc^2 \\
  \sigma^2 &= \frac{1}{N}\sum_{i=1}^{N}(x_i-\mu)^2
\end{align}
\end{document}
`;
