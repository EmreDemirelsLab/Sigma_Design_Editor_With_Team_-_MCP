export const MAX_NODES = 180;
export function validatePlan(value) {
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
export const SYSTEM_PROMPT = `You are a product UI designer. Return ONLY a JSON object, no Markdown, using this exact schema:
{"board":{"name":"Screen name","width":1440,"height":1024,"fill":"#101827"},"nodes":[{"type":"rectangle","name":"Card","x":40,"y":40,"width":300,"height":160,"fill":"#FFFFFF"},{"type":"text","name":"Heading","x":60,"y":60,"width":260,"height":40,"fill":"#101827","text":"Welcome","fontSize":24}]}
Types allowed: rectangle, ellipse, text. All positions relative to board, all nodes must fit inside board. Max 180 nodes. Colors are six digit hex. Text fontSize 8..120. Board width 100..4096 height 100..8192. Use useful content, deliberate spacing, readable contrast and visual hierarchy. Never return executable code, URLs, images or HTML. Existing selection is context only; generate a NEW board. Follow the user's language.`;
export function parsePlan(text) {
  if (typeof text !== 'string' || text.length > 150000) throw new Error('Invalid model output');
  const cleaned=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  return validatePlan(JSON.parse(cleaned));
}
