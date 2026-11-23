// Shared, dependency-free ambient particle simulation. Units: CSS px and seconds.
module.exports=(()=>{
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const presets={
  aurora:{label:'极光流萤',labelEn:'Aurora glow',config:{colorStart:'#66d9c5',colorEnd:'#a38cff',colorMode:'gradient',gravityY:12,speed:32,twinkle:.35,interaction:'repel'}},
  sakura:{label:'樱花微风',labelEn:'Sakura breeze',config:{colorStart:'#ff9cbd',colorEnd:'#ffd6af',colorMode:'gradient',gravityX:7,gravityY:18,speed:22,randomness:.65,twinkle:.12,interaction:'repel'}},
  stardust:{label:'银河星尘',labelEn:'Galactic stardust',config:{colorStart:'#9fbaff',colorEnd:'#e0aaff',colorMode:'gradient',gravityY:0,speed:18,twinkle:.7,twinkleSpeed:1.4,life:28,interaction:'attract'}},
  fireflies:{label:'森林萤火',labelEn:'Forest fireflies',config:{colorStart:'#a8ed81',colorEnd:'#ffe59a',colorMode:'gradient',gravityY:-5,speed:25,randomness:.8,twinkle:.75,twinkleSpeed:1.2,interaction:'repel'}},
  ocean:{label:'海盐蓝绿',labelEn:'Ocean shimmer',config:{colorStart:'#51b8ee',colorEnd:'#69e2ce',colorMode:'gradient',gravityX:12,gravityY:0,speed:38,drag:.45,twinkle:.3,interaction:'attract'}},
  ember:{label:'日落流金',labelEn:'Sunset embers',config:{colorStart:'#ff8666',colorEnd:'#ffd76a',colorMode:'gradient',gravityY:-20,speed:34,twinkle:.5,life:12,interaction:'repel'}}
 };
 const defaults={preset:'aurora',collision:true,gravityX:0,gravityY:12,speed:32,drag:.3,bounce:.8,interaction:'repel',pointerForce:160,pointerRadius:140,life:18,lifeRandom:.4,size:3,sizeRandom:.6,randomness:.5,opacity:.6,brightness:1,twinkle:.35,twinkleSpeed:1,colorMode:'gradient',colorStart:'#66d9c5',colorEnd:'#a38cff',colorSpeed:.2,edgeBias:.9};
 const rules={preset:{values:Object.keys(presets)},collision:{type:'boolean'},gravityX:{min:-160,max:160},gravityY:{min:-160,max:160},speed:{min:0,max:180},drag:{min:0,max:3},bounce:{min:0,max:1},interaction:{values:['repel','attract','off']},pointerForce:{min:0,max:600},pointerRadius:{min:40,max:320},life:{min:4,max:60},lifeRandom:{min:0,max:1},size:{min:1,max:8},sizeRandom:{min:0,max:1},randomness:{min:0,max:1},opacity:{min:.05,max:1},brightness:{min:.2,max:2},twinkle:{min:0,max:1},twinkleSpeed:{min:0,max:4},colorMode:{values:['gradient','theme','custom','cycle']},colorStart:{type:'color'},colorEnd:{type:'color'},colorSpeed:{min:0,max:2},edgeBias:{min:0,max:1}};
 function normalize(input){
  const source=input&&typeof input==='object'&&!Array.isArray(input)?input:{},selected=presets[source.preset]||presets.aurora,out={...defaults,...selected.config};
  for(const key of Object.keys(rules)){const v=source[key],rule=rules[key];if(v===undefined)continue;if(rule.values){if(rule.values.includes(v))out[key]=v}else if(rule.type==='boolean'){if(typeof v==='boolean')out[key]=v}else if(rule.type==='color'){if(typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))out[key]=v.toLowerCase()}else if(typeof v==='number'&&Number.isFinite(v))out[key]=clamp(v,rule.min,rule.max)}
  return out;
 }
 function randomSource(seed){let state=Number.isFinite(seed)?seed>>>0:Math.floor(Math.random()*4294967296);if(!state)state=0x9e3779b9;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}}
 function dimension(v){return Number.isFinite(v)?Math.max(20,v):400}
 function create({width=400,height=800,count=48,settings,seed}={}){
  const system={width:dimension(width),height:dimension(height),settings:normalize(settings),time:0,particles:[],random:randomSource(seed),respawns:0,collisions:0};
  const n=clamp(Math.round(Number.isFinite(count)?count:48),1,160),edges=Math.ceil(n*system.settings.edgeBias);
  for(let i=0;i<n;i++){const particle={id:i,edge:i<edges,generation:-1};spawn(system,particle,true);system.particles.push(particle)}return system;
 }
 function spawn(s,p,initial=false){
  const r=s.random,c=s.settings,w=s.width,h=s.height,pad=Math.min(80,Math.min(w,h)*.14);p.sizeVariation=r()*2-1;p.lifeVariation=r()*2-1;p.r=Math.max(.5,c.size*(1+p.sizeVariation*c.sizeRandom));p.life=Math.max(.5,c.life*(1+p.lifeVariation*c.lifeRandom));p.age=initial?r()*p.life:0;p.phase=r()*Math.PI*2;p.colorPhase=r();p.inset=clamp(p.r+8+r()*pad,p.r,Math.min(w,h)/3);p.direction=r()<.5?-1:1;p.rotation=r()*Math.PI*2;p.generation++;
  let angle=r()*Math.PI*2;
  if(p.edge){const perimeter=2*(w+h),u=r()*perimeter;if(u<w){p.x=p.inset+r()*(w-2*p.inset);p.y=p.inset;angle=p.direction===1?0:Math.PI}else if(u<w+h){p.x=w-p.inset;p.y=p.inset+r()*(h-2*p.inset);angle=p.direction===1?Math.PI/2:-Math.PI/2}else if(u<2*w+h){p.x=p.inset+r()*(w-2*p.inset);p.y=h-p.inset;angle=p.direction===1?Math.PI:0}else{p.x=p.inset;p.y=p.inset+r()*(h-2*p.inset);angle=p.direction===1?-Math.PI/2:Math.PI/2}}
  else{p.x=p.r+r()*(w-2*p.r);p.y=p.r+r()*(h-2*p.r)}
  p.velocityFactor=.55+r()*.9;p.initialAngle=angle;const velocity=c.speed*p.velocityFactor;p.vx=Math.cos(angle)*velocity;p.vy=Math.sin(angle)*velocity;p.mass=Math.max(.25,p.r*p.r);p.alpha=0;p.color=c.colorStart;
 }
 function configure(s,settings){const old=s.settings,c=s.settings=normalize(settings),edges=Math.ceil(s.particles.length*c.edgeBias);for(const p of s.particles){p.r=Math.max(.5,c.size*(1+p.sizeVariation*c.sizeRandom));p.mass=Math.max(.25,p.r*p.r);if(c.life!==old.life||c.lifeRandom!==old.lifeRandom){const progress=p.age/p.life;p.life=Math.max(.5,c.life*(1+p.lifeVariation*c.lifeRandom));p.age=progress*p.life}if(c.speed!==old.speed){if(old.speed){p.vx*=c.speed/old.speed;p.vy*=c.speed/old.speed}else{p.vx=Math.cos(p.initialAngle)*c.speed*p.velocityFactor;p.vy=Math.sin(p.initialAngle)*c.speed*p.velocityFactor}}p.edge=p.id<edges}return s}
 function resize(s,width,height){const w=dimension(width),h=dimension(height);if(w===s.width&&h===s.height)return s;for(const p of s.particles){p.x=clamp(p.x/s.width*w,p.r,w-p.r);p.y=clamp(p.y/s.height*h,p.r,h-p.r);p.inset=Math.min(p.inset,Math.min(w,h)/3)}s.width=w;s.height=h;return s}
 function forces(s,p,pointers){
  const c=s.settings;let ax=c.gravityX,ay=c.gravityY;
  if(c.randomness){const f=c.randomness*25;ax+=Math.sin(s.time*.83+p.phase)*f;ay+=Math.cos(s.time*1.11+p.phase*1.7)*f}
  if(p.edge&&c.edgeBias){const distances=[p.y,s.width-p.x,s.height-p.y,p.x],nearest=distances.indexOf(Math.min(...distances)),error=distances[nearest]-p.inset,force=clamp(error*2.2,-100,100)*c.edgeBias;if(nearest===0)ay-=force;else if(nearest===1)ax+=force;else if(nearest===2)ay+=force;else ax-=force}
  if(c.interaction!=='off'&&c.pointerForce)for(const point of pointers){if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;let dx=p.x-point.x,dy=p.y-point.y,distance=Math.hypot(dx,dy);if(distance>=c.pointerRadius)continue;if(distance<.01){dx=Math.cos(p.phase);dy=Math.sin(p.phase);distance=1}const force=c.pointerForce*(1-distance/c.pointerRadius)*(c.interaction==='attract'?-1:1);ax+=dx/distance*force;ay+=dy/distance*force}
  return {ax,ay};
 }
 function collisions(s){
  const c=s.settings,particles=s.particles,cellSize=Math.max(2,...particles.map(p=>p.r*2)),cells=new Map();
  for(const p of particles){const x=Math.floor(p.x/cellSize),y=Math.floor(p.y/cellSize);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const nearby=cells.get((x+dx)+':'+(y+dy))||[];for(const q of nearby){let nx=q.x-p.x,ny=q.y-p.y,d=Math.hypot(nx,ny),min=p.r+q.r;if(d>=min)continue;if(d<.001){nx=1;ny=0;d=1}else{nx/=d;ny/=d}const ip=1/p.mass,iq=1/q.mass,total=ip+iq,overlap=(min-d+.001)/total;p.x-=nx*overlap*ip;p.y-=ny*overlap*ip;q.x+=nx*overlap*iq;q.y+=ny*overlap*iq;const closing=(q.vx-p.vx)*nx+(q.vy-p.vy)*ny;if(closing<0){const impulse=-(1+c.bounce)*closing/total;p.vx-=impulse*ip*nx;p.vy-=impulse*ip*ny;q.vx+=impulse*iq*nx;q.vy+=impulse*iq*ny;s.collisions++}}}const key=x+':'+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p)}
 }
 function boundary(s,p){const c=s.settings,w=s.width,h=s.height;if(c.collision){if(p.x<p.r){p.x=p.r;p.vx=Math.abs(p.vx)*c.bounce}else if(p.x>w-p.r){p.x=w-p.r;p.vx=-Math.abs(p.vx)*c.bounce}if(p.y<p.r){p.y=p.r;p.vy=Math.abs(p.vy)*c.bounce}else if(p.y>h-p.r){p.y=h-p.r;p.vy=-Math.abs(p.vy)*c.bounce}}
  else{if(p.x<-p.r)p.x=w+p.r;else if(p.x>w+p.r)p.x=-p.r;if(p.y<-p.r)p.y=h+p.r;else if(p.y>h+p.r)p.y=-p.r}
 }
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 const colorHex=channels=>'#'+channels.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
 function rainbow(t){const h=((t%1)+1)%1*6,x=1-Math.abs(h%2-1),colors=[[1,x,0],[x,1,0],[0,1,x],[0,x,1],[x,0,1],[1,0,x]][Math.floor(h)];return colors.map(v=>80+v*175)}
 function appearance(s,p,theme){const c=s.settings,progress=p.age/p.life,fade=Math.min(1,p.age/Math.min(1,p.life*.12),Math.max(0,(p.life-p.age)/Math.min(2,p.life*.22))),twinkle=1-c.twinkle*(.5+.5*Math.sin(s.time*c.twinkleSpeed*Math.PI*2+p.phase)),distance=Math.max(0,Math.min(p.x,s.width-p.x,p.y,s.height-p.y)),band=Math.max(50,Math.min(s.width,s.height)*.18),edgeAttenuation=1-c.edgeBias*.86*clamp((distance-band*.35)/(band*.9),0,1);p.alpha=clamp(c.opacity*fade*twinkle*edgeAttenuation,0,1);
  let channels;if(c.colorMode==='theme')channels=rgb(/^#[0-9a-f]{6}$/i.test(theme||'')?theme:'#e77b24');else if(c.colorMode==='custom')channels=rgb(c.colorStart);else if(c.colorMode==='cycle')channels=rainbow(p.colorPhase+s.time*c.colorSpeed*.08);else{const a=rgb(c.colorStart),b=rgb(c.colorEnd),blend=.5+.5*Math.sin((p.colorPhase+progress*.3+s.time*c.colorSpeed*.08)*Math.PI*2);channels=a.map((v,i)=>v+(b[i]-v)*blend)}p.color=colorHex(channels.map(v=>v*c.brightness));p.rotation+=.002;
 }
 function step(s,dt,pointers=[],theme='#e77b24'){
  if(!Number.isFinite(dt)||dt<=0)return s;dt=Math.min(.12,dt);const steps=Math.ceil(dt/(1/120)),small=dt/steps,c=s.settings,contacts=Array.isArray(pointers)?pointers.slice(0,10):[];
  for(let n=0;n<steps;n++){s.time+=small;for(const p of s.particles){p.age+=small;if(p.age>=p.life){spawn(s,p);s.respawns++}const f=forces(s,p,contacts),decay=Math.exp(-c.drag*small);p.vx=clamp((p.vx+f.ax*small)*decay,-900,900);p.vy=clamp((p.vy+f.ay*small)*decay,-900,900);p.x+=p.vx*small;p.y+=p.vy*small;boundary(s,p)}if(c.collision){collisions(s);for(const p of s.particles)boundary(s,p)}}for(const p of s.particles)appearance(s,p,theme);return s;
 }
 function ellipse(ctx,x,y,rx,ry,rotation){if(ctx.ellipse){ctx.ellipse(x,y,rx,ry,rotation,0,Math.PI*2);return}const cos=Math.cos(rotation),sin=Math.sin(rotation);for(let i=0;i<=20;i++){const a=i/20*Math.PI*2,dx=Math.cos(a)*rx,dy=Math.sin(a)*ry,px=x+dx*cos-dy*sin,py=y+dx*sin+dy*cos;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)}}
 function draw(ctx,s,style='constellation'){
  ctx.clearRect(0,0,s.width,s.height);ctx.lineWidth=1.2;
  for(const p of s.particles){ctx.globalAlpha=p.alpha;ctx.fillStyle=ctx.strokeStyle=p.color;ctx.beginPath();
   if(style==='rain'){const length=Math.max(9,Math.min(30,Math.hypot(p.vx,p.vy)*.3)),speed=Math.max(1,Math.hypot(p.vx,p.vy));ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx/speed*length,p.y-p.vy/speed*length);ctx.stroke()}
   else if(style==='petals'){ellipse(ctx,p.x,p.y,p.r*1.65,p.r,p.rotation);ctx.fill()}
   else if(style==='stars'){const r=p.r*1.7;ctx.moveTo(p.x-r,p.y);ctx.lineTo(p.x+r,p.y);ctx.moveTo(p.x,p.y-r);ctx.lineTo(p.x,p.y+r);ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,p.r*.45,0,Math.PI*2);ctx.fill()}
   else if(style==='fireflies'){for(let layer=4;layer>=1;layer--){ctx.globalAlpha=p.alpha*(layer===1?1:.18/layer);ctx.beginPath();ctx.arc(p.x,p.y,p.r*layer,0,Math.PI*2);ctx.fill()}}
   else if(style==='snow'){const r=p.r*1.6;for(let i=0;i<6;i++){const a=i*Math.PI/3,dx=Math.cos(a),dy=Math.sin(a);ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+dx*r,p.y+dy*r);for(const direction of [-1,1]){ctx.moveTo(p.x+dx*r*.6,p.y+dy*r*.6);ctx.lineTo(p.x+dx*r*.45-Math.sin(a)*r*.2*direction,p.y+dy*r*.45+Math.cos(a)*r*.2*direction)}}ctx.stroke()}
   else if(style==='orbits'){ellipse(ctx,p.x,p.y,p.r*2.1,p.r*.8,p.rotation+s.time*.24);ctx.stroke();ctx.beginPath();ellipse(ctx,p.x,p.y,p.r*2.1,p.r*.8,-p.rotation-s.time*.24);ctx.stroke()}
   else if(style==='bubbles'){ctx.arc(p.x,p.y,p.r*1.6,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=p.alpha*.65;ctx.beginPath();ctx.arc(p.x-p.r*.12,p.y-p.r*.12,p.r*1.2,-Math.PI*.9,-Math.PI*.2);ctx.stroke();ctx.globalAlpha=p.alpha*.12;ctx.beginPath();ctx.arc(p.x,p.y,p.r*1.5,0,Math.PI*2);ctx.fill()}
   else{ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}
  }
  if(style==='constellation')for(let i=0;i<s.particles.length;i++)for(let j=i+1;j<s.particles.length;j++){const a=s.particles[i],b=s.particles[j],d=Math.hypot(a.x-b.x,a.y-b.y);if(d<125){ctx.globalAlpha=Math.min(a.alpha,b.alpha)*(1-d/125)*.38;ctx.strokeStyle=a.color;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}
  ctx.globalAlpha=1;
 }
 return {defaults,rules,presets,normalize,create,configure,resize,step,draw};
})();
