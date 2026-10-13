/** Import of the documented core StarMath expression grammar, with explicit unsupported-command errors. */
const symbols:Record<string,string>={
  times:'\\times',cdot:'\\cdot',div:'\\div',plusminus:'\\pm',minusplus:'\\mp',
  leslant:'\\leqslant',geslant:'\\geqslant',le:'\\le',ge:'\\ge',neq:'\\ne',approx:'\\approx',sim:'\\sim',simeq:'\\simeq',equiv:'\\equiv',prop:'\\propto',
  in:'\\in',notin:'\\notin',owns:'\\ni',union:'\\cup',intersection:'\\cap',setminus:'\\setminus',subset:'\\subset',supset:'\\supset',subseteq:'\\subseteq',supseteq:'\\supseteq',nsubset:'\\nsubseteq',nsupset:'\\nsupseteq',emptyset:'\\emptyset',
  infinity:'\\infty',infty:'\\infty',partial:'\\partial',nabla:'\\nabla',forall:'\\forall',exists:'\\exists',notexists:'\\nexists',neg:'\\neg',and:'\\land',or:'\\lor',
  rightarrow:'\\rightarrow',leftarrow:'\\leftarrow',leftrightarrow:'\\leftrightarrow',toward:'\\to',drarrow:'\\Rightarrow',dlrarrow:'\\Leftrightarrow',dlarr:'\\Leftarrow',
  dotsaxis:'\\cdots',dotslow:'\\ldots',dotsvert:'\\vdots',dotsup:'\\ddots',dotsdown:'\\ddots',
  aleph:'\\aleph',hbar:'\\hbar',lambdabar:'\\bar{\\lambda}',Re:'\\Re',Im:'\\Im',wp:'\\wp',
  setN:'\\mathbb{N}',setZ:'\\mathbb{Z}',setQ:'\\mathbb{Q}',setR:'\\mathbb{R}',setC:'\\mathbb{C}',
  sin:'\\sin',cos:'\\cos',tan:'\\tan',cot:'\\cot',sinh:'\\sinh',cosh:'\\cosh',tanh:'\\tanh',coth:'\\coth',arcsin:'\\arcsin',arccos:'\\arccos',arctan:'\\arctan',ln:'\\ln',log:'\\log',exp:'\\exp',lim:'\\lim',liminf:'\\liminf',limsup:'\\limsup',min:'\\min',max:'\\max',
  sum:'\\sum',prod:'\\prod',coprod:'\\coprod',int:'\\int',iint:'\\iint',iiint:'\\iiint',lint:'\\oint',llint:'\\oiint',lllint:'\\oiiint',
};
const accents:Record<string,string>={acute:'acute',grave:'grave',breve:'breve',circle:'mathring',dot:'dot',ddot:'ddot',dddot:'dddot',bar:'bar',vec:'vec',tilde:'tilde',hat:'hat',check:'check',widevec:'overrightarrow',widetilde:'widetilde',widehat:'widehat',overline:'overline',underline:'underline',overstrike:'cancel',bold:'mathbf',italic:'mathit',nitalic:'mathrm',phantom:'phantom'};
const delimiters:Record<string,string>={'(':'(',')':')','[':'[',']':']',lbrace:'\\{',rbrace:'\\}',langle:'\\langle',rangle:'\\rangle',lceil:'\\lceil',rceil:'\\rceil',lfloor:'\\lfloor',rfloor:'\\rfloor',lline:'|',rline:'|',ldline:'\\lVert',rdline:'\\rVert',none:'.'};
const unsupported=new Set(['color','font','size','alignl','alignc','alignr','oper','uoper','boper','nbold']);
const greek=new Set('alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi omicron pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega'.split(' '));
export function starMathToLatex(source:string):string {
  const clean=source.replace(/%%[^\n]*/g,'');
  const tokens=clean.match(/"(?:[^"\\]|\\.)*"|##|#|%[A-Za-z]+|[A-Za-z][A-Za-z0-9]*|\d+(?:[.,]\d+)?|<=|>=|<>|!=|[{}()[\]^_~`+\-=*/<>|!.,:;]|\S/g)??[];
  let index=0;const peek=()=>tokens[index];const take=()=>tokens[index++];
  function atom():string {
    const token=take();if(!token)throw new Error('The StarMath expression ended before an argument.');
    if(token==='{'){const result=expression(new Set(['}']));if(take()!=='}')throw new Error('Unclosed StarMath group.');return '{'+result+'}';}
    if(token==='matrix'||token==='stack'){
      if(take()!=='{')throw new Error(`${token} requires a braced group.`);
      const rows:string[][]=[[]];
      while(peek()&&peek()!=='}') {rows.at(-1)!.push(expression(new Set(['#','##','}'])));if(peek()==='#')take();else if(peek()==='##'){take();rows.push([]);}}
      if(take()!=='}')throw new Error('Unclosed matrix or stack.');
      return token==='matrix'?`\\begin{matrix}${rows.map(r=>r.join(' & ')).join(' \\\\ ')}\\end{matrix}`:`\\begin{gathered}${rows.flat().join(' \\\\ ')}\\end{gathered}`;
    }
    if(token==='sqrt')return '\\sqrt{'+atom()+'}';
    if(token==='nroot'){const degree=atom();return '\\sqrt['+degree+']{'+atom()+'}';}
    if(token==='abs')return '\\left|'+atom()+'\\right|';
    if(token==='fact')return atom()+'!';
    if(token==='binom'){const a=atom();return '\\binom{'+a+'}{'+atom()+'}';}
    if(token==='left') {const l=delimiters[take()];if(l===undefined)throw new Error('Unknown left delimiter.');const body=expression(new Set(['right']));if(take()!=='right')throw new Error('left needs a matching right delimiter.');const r=delimiters[take()];if(r===undefined)throw new Error('Unknown right delimiter.');return '\\left'+l+body+'\\right'+r;}
    if(token==='overbrace'||token==='underbrace'){const body=atom();const annotation=atom();return `\\${token}{${body}}${token==='overbrace'?'^':'_'}{${annotation}}`;}
    if(accents[token])return `\\${accents[token]}{${atom()}}`;
    if(unsupported.has(token))throw new Error(`StarMath '${token}' formatting is not imported. Use the visual editor or LaTeX source for this expression.`);
    if(token.startsWith('"'))return '\\text{'+token.slice(1,-1).replace(/[{}]/g,c=>'\\'+c)+'}';
    if(token.startsWith('%')){const name=token.slice(1);if(!greek.has(name.toLowerCase()))throw new Error(`Unknown StarMath symbol: ${token}`);return '\\'+name;}
    if(symbols[token])return symbols[token];
    if(token==='~')return '\\quad ';if(token==='`')return '\\, ';
    if(token==='<=' )return '\\le ';if(token==='>=')return '\\ge ';if(token==='<> '||token==='!='||token==='<>')return '\\ne ';
    if(['}','#','##','right','over','from','to','^','_','rsup','rsub','csup','csub','lsup','lsub'].includes(token))throw new Error(`Unexpected StarMath token: ${token}`);
    return token;
  }
  function expression(stops:Set<string>):string {
    const values:string[]=[];
    while(peek()&&!stops.has(peek())) {
      const next=peek();
      if(next==='over'){take();const numerator=values.join(' ');if(!numerator)throw new Error('A fraction needs a numerator.');const denominator=expression(stops);if(!denominator)throw new Error('A fraction needs a denominator.');return `\\frac{${numerator}}{${denominator}}`;}
      if(['^','_','rsup','rsub','csup','csub','lsup','lsub','from','to'].includes(next)){
        take();if(!values.length)throw new Error(`'${next}' needs a base.`);const arg=atom();const sup=['^','rsup','csup','lsup','to'].includes(next);let base=values.pop()!;
        if(next==='lsup'||next==='lsub')base=`{}${sup?'^':'_'}{${arg}}${base}`;else base+=`${sup?'^':'_'}{${arg}}`;values.push(base);continue;
      }
      values.push(atom());
    }return values.join(' ');
  }
  const result=expression(new Set());if(index!==tokens.length)throw new Error('Unexpected StarMath tokens.');return result;
}
