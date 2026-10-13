import fs from 'node:fs';
const examples=[
  {id:'si-reference',name:'SI reference',description:'Insert a compact table of SI quantities and units.',permissions:['insert-content']},
  {id:'experiment-template',name:'Experiment structure',description:'Insert a reproducible structure for an experiment or scientific note.',permissions:['read-note','insert-content']},
];
for(const example of examples){const source=fs.readFileSync(`plugins/examples/${example.id}.js`,'utf8');const manifest={id:'quanta.'+example.id,name:example.name,version:'1.0.0',description:example.description,apiVersion:1,author:'QUANTA',entry:'plugin.js',permissions:example.permissions};fs.writeFileSync(`plugins/examples/${example.id}.qplugin`,JSON.stringify({manifest,source},null,2));}
console.log('Packaged two installable QUANTA plugins.');
