const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
function create(width,height,size){if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid image');const base=Math.max(size/width,size/height);return {width,height,size,base,zoom:1,x:(size-width*base)/2,y:(size-height*base)/2}}
function constrain(g){const scale=g.base*g.zoom;g.x=clamp(g.x,g.size-g.width*scale,0);g.y=clamp(g.y,g.size-g.height*scale,0);return g}
function move(g,dx,dy){g.x+=dx;g.y+=dy;return constrain(g)}
function zoom(g,value,x=g.size/2,y=g.size/2){const old=g.base*g.zoom,next=clamp(value,1,4),scale=g.base*next;g.x=x-(x-g.x)/old*scale;g.y=y-(y-g.y)/old*scale;g.zoom=next;return constrain(g)}
function source(g){const scale=g.base*g.zoom;return {x:-g.x/scale,y:-g.y/scale,size:g.size/scale}}
module.exports={create,constrain,move,zoom,source};
