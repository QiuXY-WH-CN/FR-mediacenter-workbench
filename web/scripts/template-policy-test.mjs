import assert from 'node:assert/strict';
import Policy from '../../miniprogram/utils/template-policy.js';
const source={id:'synthetic',name:'宣传流程',steps:[{name:'预告推送',dept:'办公室',offset:3,time:'18:00',depends:[],rewardPoints:20,requirements:'核对文字'},{name:'视频制作',dept:'办公室',offset:-1,time:'18:00',depends:[0],rewardPoints:30,requirements:'交付成片'}]};
const optimized=Policy.optimizeTemplate(source);
assert.deepEqual(source.steps[0].depends,[],'Optimization cannot mutate source');
assert.equal(source.steps[0].dept,'办公室');
assert.ok(optimized.steps.some(s=>s.dept==='创意设计部'&&/封面/.test(s.name)));
assert.ok(optimized.steps.some(s=>s.dept==='办公室'&&/素材收集/.test(s.name)));
assert.equal(optimized.steps.find(s=>s.name==='预告推送').rewardPoints,20,'Preserve existing rewards');
assert.equal(optimized.steps.find(s=>s.name==='视频制作').dept,'视觉传达部');
assert.deepEqual(Policy.optimizeTemplate(optimized).steps,optimized.steps,'Repeated optimization is idempotent');
for(const [index,s] of optimized.steps.entries())for(const dep of s.depends){assert.ok(dep<index,'Dependency must precede stage');assert.ok(optimized.steps[dep].offset<=s.offset,'Prerequisite deadline cannot follow dependent');}
assert.ok(!Policy.applicableSteps(optimized,{rewardPoints:30}).some(x=>/脚本/.test(x.step.name)));
assert.ok(Policy.applicableSteps(optimized,{rewardPoints:31}).some(x=>/脚本/.test(x.step.name)));
assert.ok(Policy.applicableSteps(optimized,{rewardPoints:30}).every(x=>optimized.steps[x.index]===x.step),'Keep original assignment indices when script is omitted');
const many=Policy.optimizeTemplate({steps:Array.from({length:30},(_,i)=>({name:'推送'+i,dept:'新媒体运营部',offset:i,depends:[],rewardPoints:5}))});assert.equal(many.steps.length,30,'Do not exceed template limit');
const sample=Policy.suggestions(source,[{id:'visible',template:'synthetic',date:'2026-10-10'}],[{event:'visible',name:'预告推送',due:'2026-10-08T18:00',rewardPoints:12},{event:'hidden',name:'预告推送',due:'2026-10-20T18:00',rewardPoints:999}]);assert.equal(sample[0].offset,-2);assert.equal(sample[0].rewardPoints,12);assert.equal(sample[0].samples,1,'Suggestions use only visible schedules');
console.log('Template cooperation, dependency timing, reward preservation, script threshold and scoped suggestions passed.');
