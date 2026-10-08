(()=>{
const MAX_NODES = 180;
function validatePlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Plan must be an object');
  const {board, nodes} = value;
  const number = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const color = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const name = v => typeof v === 'string' && v.length > 0 && v.length <= 120;
  if (!board || !name(board.name) || !number(board.width, 100, 4096) || !number(board.height, 100, 8192) || !color(board.fill)) throw new Error('Invalid board');
  if (!Array.isArray(nodes) || !nodes.length || nodes.length > MAX_NODES) throw new Error('Invalid node count');
  const clean = nodes.map(n => {
    if (!n || !['rectangle','ellipse','text'].includes(n.type) || !name(n.name) || !number(n.x,0,board.width) || !number(n.y,0,board.height) || !number(n.width,1,board.width) || !number(n.height,1,board.height) || n.x+n.width > board.width || n.y+n.height > board.height || !color(n.fill)) throw new Error('Invalid node geometry or type');
    const item = {type:n.type,name:n.name,x:n.x,y:n.y,width:n.width,height:n.height,fill:n.fill};
    if (n.type === 'text') {
      if (typeof n.text !== 'string' || !n.text.trim() || n.text.length > 2000 || !number(n.fontSize,8,120)) throw new Error('Invalid text');
      item.text=n.text; item.fontSize=n.fontSize;
    }
    return item;
  });
  return {board:{name:board.name,width:board.width,height:board.height,fill:board.fill},nodes:clean};
}
const SYSTEM_PROMPT = `You are a product UI designer. Return ONLY a JSON object, no Markdown, using this exact schema:
{"board":{"name":"Screen name","width":1440,"height":1024,"fill":"#101827"},"nodes":[{"type":"rectangle","name":"Card","x":40,"y":40,"width":300,"height":160,"fill":"#FFFFFF"},{"type":"text","name":"Heading","x":60,"y":60,"width":260,"height":40,"fill":"#101827","text":"Welcome","fontSize":24}]}
Types allowed: rectangle, ellipse, text. All positions relative to board, all nodes must fit inside board. Max 180 nodes. Colors are six digit hex. Text fontSize 8..120. Board width 100..4096 height 100..8192. Use useful content, deliberate spacing, readable contrast and visual hierarchy. Never return executable code, URLs, images or HTML. Existing selection is context only; generate a NEW board. Follow the user's language.`;
function parsePlan(text) {
  if (typeof text !== 'string' || text.length > 150000) throw new Error('Invalid model output');
  const cleaned=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  return validatePlan(JSON.parse(cleaned));
}

function renderPlan(penpot, raw) {
  const plan=validatePlan(raw); // Validate everything before changing the document.
  const block=penpot.history.undoBlockBegin();
  let board;
  try {
    board=penpot.createBoard(); board.name=plan.board.name;
    board.resize(plan.board.width,plan.board.height);
    const selected=penpot.selection;
    board.x=selected.length ? Math.max(...selected.map(s=>s.x+s.width))+80 : 0;
    board.y=selected.length ? selected[0].y : 0;
    board.fills=[{fillColor:plan.board.fill,fillOpacity:1}];
    for (const n of plan.nodes) {
      const shape=n.type==='text' ? penpot.createText(n.text) : n.type==='ellipse' ? penpot.createEllipse() : penpot.createRectangle();
      if (!shape) throw new Error('Penpot could not create a shape');
      board.appendChild(shape); shape.name=n.name; shape.resize(n.width,n.height);
      shape.x=board.x+n.x; shape.y=board.y+n.y;
      shape.fills=[{fillColor:n.fill,fillOpacity:1}];
      if(n.type==='text') { shape.fontSize=String(n.fontSize); shape.fontFamily='Inter'; shape.growType='fixed'; }
    }
    penpot.selection=[board];
    return board.id;
  } catch(error) { if(board) board.remove(); throw error; }
  finally { penpot.history.undoBlockFinish(block); }
}

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

})();
