import {validatePlan} from '../design-plan.mjs';
const $=id=>document.getElementById(id);
const status=t=>{$('status').textContent=t;};
let context=[],pageId=null,plan=null,pendingApply=false;
// Penpot plugin UI is a sandboxed iframe. Verify the sender window; no wildcard secrets are sent.
function send(message){parent.postMessage(message,'*');}
window.addEventListener('message',event=>{
  if(event.source!==parent)return;
  const m=event.data;
  if(m?.type==='context'){context=m.shapes;pageId=m.pageId;$('contextStatus').textContent=`${context.length} seçili nesne eklendi.`;}
  if(m?.type==='applied'){pendingApply=false;$('apply').disabled=false;status('Ekran tuvale eklendi. Geri al ile kaldırabilirsin.');plan=null;$('preview').hidden=true;}
  if(m?.type==='error'){pendingApply=false;$('apply').disabled=false;status(m.message);}
});
$('context').onclick=()=>{plan=null;$('preview').hidden=true;send({type:'context'});};
$('generate').onclick=async()=>{
  if(!pageId){status('Önce “Seçimi bağlama ekle” düğmesine bas. Seçim olmadan da kullanabilirsin.');send({type:'context'});return;}
  $('generate').disabled=true;plan=null;$('preview').hidden=true;
  status('Tasarım hazırlanıyor…');
  try{
    const res=await fetch('../api/generate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${$('token').value}`},body:JSON.stringify({prompt:$('prompt').value,context}),signal:AbortSignal.timeout(100000)});
    const data=await res.json();if(!res.ok)throw new Error(data.error);
    plan=validatePlan(data.plan);preview(plan);status('Önizleme hazır. Tuvale ekleyebilirsin.');
  }catch(error){status(error.name==='TimeoutError'?'İstek zaman aşımına uğradı. Yeniden dene.':error.message);}
  finally{$('generate').disabled=false;}
};
$('apply').onclick=()=>{if(plan&&!pendingApply){pendingApply=true;$('apply').disabled=true;send({type:'apply',plan,pageId});}};
function preview(p){
  const svg=$('canvas');svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${p.board.width} ${p.board.height}`);
  const make=(type,attrs,text)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',type);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text)el.textContent=text;svg.append(el);};
  make('rect',{width:p.board.width,height:p.board.height,fill:p.board.fill});
  for(const n of p.nodes){if(n.type==='text')make('text',{x:n.x,y:n.y+n.fontSize,fill:n.fill,'font-size':n.fontSize,'font-family':'Inter, sans-serif'},n.text);else if(n.type==='ellipse')make('ellipse',{cx:n.x+n.width/2,cy:n.y+n.height/2,rx:n.width/2,ry:n.height/2,fill:n.fill});else make('rect',{x:n.x,y:n.y,width:n.width,height:n.height,fill:n.fill});}
  $('count').textContent=`${p.nodes.length} nesne`;$('preview').hidden=false;
}
