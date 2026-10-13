quanta.registerCommand({id:'experiment-template',title:'Insert experiment structure'},async api=>{
  const note=api.getNotebook();
  api.insertMarkdown('## Question\n\nWhat are we trying to establish?\n\n## Assumptions\n\n- \n\n## Method\n\nDescribe the setup, units, and controls.\n\n## Measurements\n\n| Measurement | Value | Unit | Uncertainty |\n| --- | --- | --- | --- |\n| | | | |\n\n## Interpretation\n\nWhat would falsify the result?\n\n## Sources\n\n- \n');
  api.notify('Experiment structure inserted into '+note.title+'.');
});
