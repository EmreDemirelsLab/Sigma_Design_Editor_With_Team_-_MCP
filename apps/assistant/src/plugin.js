penpot.ui.open('Sigma · Tasarım yardımcısı', '__SIGMA_UI_URL__', {width:420,height:680});
penpot.ui.onMessage(message=>{
  try {
    if(message?.type==='context') {
      const shapes=penpot.selection.slice(0,40).map(s=>({name:s.name,type:s.type,x:s.x,y:s.y,width:s.width,height:s.height}));
      penpot.ui.sendMessage({type:'context',pageId:penpot.currentPage?.id,shapes});
    }
    if(message?.type==='apply') {
      if(message.pageId !== penpot.currentPage?.id) throw new Error('Sayfa değişti. Bağlamı yenileyip yeniden oluştur.');
      const boardId=renderPlan(penpot,message.plan);
      penpot.ui.sendMessage({type:'applied',boardId});
    }
  } catch(error) {penpot.ui.sendMessage({type:'error',message:error.message});}
});
