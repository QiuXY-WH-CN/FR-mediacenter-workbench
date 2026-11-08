// Minimal markdown renderer for the knowledge-base page. Output is HTML for <rich-text>.
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function inline(s){
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\[([^\]]+)\]\(view:[^)]+\)/g,'$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,(m,label,url)=>`<a href="${esc(url)}">${label}</a>`);
}
function imageUrl(url,base){
  if(/^https?:\/\//i.test(url))return url;
  if(url.startsWith('/guide/'))return base.replace(/\/$/,'')+url;
  const file=url.replace(/^screenshots\//,'').split('/').pop();
  return base.replace(/\/$/,'')+'/guide/'+encodeURIComponent(file);
}
module.exports=function render(content,base=''){
  const lines=String(content||'').replace(/\r\n/g,'\n').split('\n');
  let html='';const checks=[];
  const push=(s)=>html+=s;
  let i=0;
  while(i<lines.length){
    const line=lines[i];
    if(!line.trim()){i++;continue}
    if(line.startsWith('@@sandbox ')){i++;continue}
    let m;
    if((m=line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/))){push(`<p style="text-align:center"><img src="${esc(imageUrl(m[2],base))}" style="width:100%;border-radius:8px" /><span style="color:#999;font-size:24rpx">${esc(m[1])}</span></p>`);i++;continue}
    if((m=line.match(/^######\s+(.*)$/))){push('<h6 style="margin:12rpx 0;font-size:26rpx;font-weight:600">'+inline(m[1])+'</h6>');i++;continue}
    if((m=line.match(/^#####\s+(.*)$/))){push('<h5 style="margin:12rpx 0;font-size:28rpx;font-weight:600">'+inline(m[1])+'</h5>');i++;continue}
    if((m=line.match(/^####\s+(.*)$/))){push('<h4 style="margin:14rpx 0;font-size:30rpx;font-weight:600">'+inline(m[1])+'</h4>');i++;continue}
    if((m=line.match(/^###\s+(.*)$/))){push('<h3 style="margin:16rpx 0 8rpx;font-size:32rpx;font-weight:650">'+inline(m[1])+'</h3>');i++;continue}
    if((m=line.match(/^##\s+(.*)$/))){push('<h2 style="margin:22rpx 0 10rpx;font-size:36rpx;font-weight:700">'+inline(m[1])+'</h2>');i++;continue}
    if((m=line.match(/^#\s+(.*)$/))){push('<h1 style="margin:24rpx 0 12rpx;font-size:42rpx;font-weight:700">'+inline(m[1])+'</h1>');i++;continue}
    if((m=line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/))){const items=[];while(i<lines.length&&(m=lines[i].match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/))){items.push(inline(m[2]));checks.push(inline(m[2]));i++}continue}
    if(line.startsWith('```')){let code='';i++;while(i<lines.length&&!lines[i].startsWith('```')){code+=(code?'\n':'')+lines[i];i++}i++;push('<pre style="background:#f5f0e8;padding:16rpx;border-radius:8rpx;overflow-x:auto">'+esc(code)+'</pre>');continue}
    if(line.startsWith('|')){const rows=[];while(i<lines.length&&lines[i].startsWith('|')){rows.push(lines[i]);i++}if(rows.length>=2&&/^[\s|:-]+$/.test(rows[1].replace(/\|/g,''))){const parseRow=r=>r.replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>inline(c.trim()));const head=parseRow(rows[0]);let body='';for(let r=2;r<rows.length;r++)body+='<tr>'+parseRow(rows[r]).map(c=>'<td style="border:1rpx solid #e4d9ca;padding:10rpx 12rpx">'+c+'</td>').join('')+'</tr>';push('<table style="border-collapse:collapse;width:100%;margin:16rpx 0"><thead><tr>'+head.map(c=>'<th style="border:1rpx solid #e4d9ca;padding:10rpx 12rpx;background:#f7f2eb">'+c+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table>');continue}}
    if(/^[-*]\s+/.test(line)){const items=[];while(i<lines.length&&/^[-*]\s+/.test(lines[i])){items.push('<li style="margin:6rpx 0">'+inline(lines[i].replace(/^[-*]\s+/,''))+'</li>');i++}push('<ul style="padding-left:36rpx;margin:10rpx 0">'+items.join('')+'</ul>');continue}
    if(/^\d+\.\s+/.test(line)){const items=[];while(i<lines.length&&/^\d+\.\s+/.test(lines[i])){items.push('<li style="margin:6rpx 0">'+inline(lines[i].replace(/^\d+\.\s+/,''))+'</li>');i++}push('<ol style="padding-left:36rpx;margin:10rpx 0">'+items.join('')+'</ol>');continue}
    if(line.startsWith('> ')){const items=[];while(i<lines.length&&lines[i].startsWith('> ')){items.push(inline(lines[i].slice(2)));i++}push('<blockquote style="margin:12rpx 0;padding:10rpx 16rpx;border-left:6rpx solid #ff861b;background:#fff8ef;color:#7a5a34">'+items.join('<br/>')+'</blockquote>');continue}
    const p=[];while(i<lines.length&&lines[i].trim()&&!/^(#{1,6}\s+|\||```|[-*]\s+|\d+\.\s+|>\s+|!\[)/.test(lines[i])){p.push(inline(lines[i]));i++}push('<p style="margin:10rpx 0;line-height:1.8">'+p.join('<br/>')+'</p>');
  }
  return {html,checks};
};
