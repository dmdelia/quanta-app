quanta.registerCommand({id:'si-reference',title:'Insert SI reference'},async api=>{
  api.insertMarkdown('## SI reference\n\n| Quantity | Symbol | SI unit |\n| --- | --- | --- |\n| Length | $l$ | m |\n| Mass | $m$ | kg |\n| Time | $t$ | s |\n| Temperature | $T$ | K |\n| Force | $F$ | N |\n| Energy | $E$ | J |\n\n');
  api.notify('SI reference inserted.');
});
