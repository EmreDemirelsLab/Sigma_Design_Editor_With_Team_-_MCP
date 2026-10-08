import test from 'node:test';import assert from 'node:assert/strict';
import {validatePlan,parsePlan} from '../shared/design-plan.mjs';
import {renderPlan} from '../shared/render-plan.mjs';
export const sample={board:{name:'Demo',width:400,height:800,fill:'#FFFFFF'},nodes:[{type:'text',name:'Title',x:20,y:20,width:200,height:40,fill:'#101827',text:'Merhaba',fontSize:24}]};
test('accepts structured plan, strips arbitrary executable properties',()=>{const p=validatePlan({...sample,nodes:[{...sample.nodes[0],code:'evil()'}]});assert.equal(p.nodes[0].code,undefined);assert.deepEqual(parsePlan('```json\n'+JSON.stringify(sample)+'\n```'),sample);});
test('rejects scripts, overflow, huge counts and invalid text before mutation',()=>{for(const patch of [{type:'script'},{width:500},{x:NaN},{fill:'url(javascript:evil)'},{fontSize:500},{text:''}])assert.throws(()=>validatePlan({...sample,nodes:[{...sample.nodes[0],...patch}]}));assert.throws(()=>validatePlan({...sample,nodes:Array(181).fill(sample.nodes[0])}));});
function fake(fail=false){const log=[];const board={id:'b',x:0,y:0,resize(){},appendChild(){},remove(){log.push('removed');}};return {log,board,selection:[],history:{undoBlockBegin(){log.push('begin');return Symbol();},undoBlockFinish(){log.push('finish');}},createBoard(){log.push('board');return board;},createText(){if(fail)throw Error('Failed');return {resize(){}};}};}
test('creates editable objects in one undo block',()=>{const p=fake();assert.equal(renderPlan(p,sample),'b');assert.deepEqual(p.log,['begin','board','finish']);assert.equal(p.selection[0],p.board);});
test('cleans partial board and closes undo block on API failure',()=>{const p=fake(true);assert.throws(()=>renderPlan(p,sample));assert.deepEqual(p.log,['begin','board','removed','finish']);});
test('invalid plan never touches Penpot',()=>{const p=fake();assert.throws(()=>renderPlan(p,{}));assert.deepEqual(p.log,[]);});
