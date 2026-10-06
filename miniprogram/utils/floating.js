// Bounded springs keep native department nodes and their connecting lines in sync.
function create(positions){return positions.map(([x,y])=>({x,y,vx:0,vy:0}));}
function step(nodes,positions,time,dt,paused=[]){
 dt=Math.min(.04,Math.max(.001,dt));
 return nodes.map((n,i)=>{
  if(!paused.includes(i)){
   const [x,y]=positions[i],phase=i*1.63;
   const tx=Math.max(17,Math.min(83,x+Math.sin(time/2.4+phase)*6.5));
   const ty=Math.max(16,Math.min(82,y+Math.cos(time/2.8+phase)*8.5));
   n.vx+=(36*(tx-n.x)-10*n.vx)*dt;n.vy+=(36*(ty-n.y)-10*n.vy)*dt;
   n.x=Math.max(15,Math.min(85,n.x+n.vx*dt));n.y=Math.max(14,Math.min(84,n.y+n.vy*dt));
  }else {n.vx=0;n.vy=0;}
  return n;
 });
}
function line(x,y,width=340,height=370){const dx=(x-50)*width/100,dy=(y-50)*height/100;return {lineAngle:Math.atan2(dy,dx)*180/Math.PI,lineLength:Math.hypot(dx,dy)/width*100};}
module.exports={create,step,line};
