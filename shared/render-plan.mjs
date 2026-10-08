import { validatePlan } from './design-plan.mjs';
export function renderPlan(penpot, raw) {
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
