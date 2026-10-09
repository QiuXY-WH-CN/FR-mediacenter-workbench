const I=require('./localization'),api=require('../services/api'),R=require('./recovery');
const language=()=>{const value=api.getState()?.settings?.language||R.safeRead('fr.language','zh-CN');return value==='en'?'en':'zh-CN'};
function translateData(value,key=''){
 if(typeof value==='string')return /^(label|section|title|subtitle|submitText|placeholder|display|priorityLabel|statusLabel|roleLabel|role|syncError|error|templateHint|tokenLabel)$/.test(key)?I.translate(value,language()):value;
 if(Array.isArray(value))return value.map(v=>translateData(v,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,(value.kind==='personOption'&&k==='label'||value.containsNames&&k==='display')?v:translateData(v,k)]));return value;
}
function fontScale(settings={}){return R.normalizeSettings(settings).fontScale}
function style(settings={}){const s=R.normalizeSettings(settings);return `--accent:${s.themeColor};--font-scale:${s.fontScale};`}
function safeNative(fn){try{return fn()}catch(e){R.capture(e,'render');return null}}
function pointer(owner,e){try{owner.selectComponent?.('#particle-field')?.pointer?.(e?.touches||[])}catch(error){R.capture(error,'canvas')}}
function install(page){
 if(page.interfaceInstalled)return;page.interfaceInstalled=true;const original=page.setData.bind(page);
 page.setData=function(data,callback){try{const lang=language(),labels=page.interfaceLanguage===lang?{}:{ui:I.ui(lang),language:lang},depts=data.depts||page.data.depts;if(Array.isArray(depts))labels.deptLabels=depts.map(v=>I.translate(v,lang));page.interfaceLanguage=lang;original({...translateData(data),...labels},callback);return true}catch(e){page.interfaceFailure=true;R.capture(e,'render');try{original({interfaceFailure:true,motion:false,particles:'off',readOnly:true,syncError:language()==='en'?'The interface entered safe mode. Open Local Safety Center to repair it.':'界面已进入安全模式，可在本机安全中心修复。'})}catch{}return false}};
 page.particleTouchStart||=function(e){pointer(this,e)};page.particleTouchMove||=function(e){pointer(this,e)};page.particleTouchEnd||=function(e){pointer(this,e)};
 const settings=R.applySettings(api.getState()?.settings||R.displaySettings());let systemTheme='light';try{systemTheme=wx.getSystemInfoSync?.().theme||'light'}catch{}
 page.setData({...page.data,themeStyle:style(settings),fontScale:fontScale(settings),motion:settings.motion,particleTheme:settings.themeColor,particles:settings.particles,particleStyle:settings.particles,particleDensity:settings.particleDensity,particleSystem:settings.particleSystem,rotationMinutes:settings.rotationMinutes,dark:settings.appearance==='dark'||settings.appearance==='auto'&&systemTheme==='dark'});
}
function navigation(page,s){
 // Hidden tab subscriptions may update their cards, but only the visible page owns native chrome.
 if(typeof getCurrentPages==='function'){try{const pages=getCurrentPages();if(pages.length&&pages[pages.length-1]!==page)return}catch{R.capture(null,'render');return}}
 const settings=R.normalizeSettings(s.settings),lang=settings.language;R.safeWrite('fr.language',lang);R.saveDisplay(settings);
 const dark=s.dark,bg=dark?'#101010':'#ffffff',titles={home:'工作概览',tasks:'我的任务',events:'所有任务',calendar:'日历安排',members:'成员与权限',templates:'流程模板',sop:'知识库',profile:'个人中心',rewards:'成果与贡献',editor:'设置',task:'任务',event:'活动',security:lang==='en'?'Local Safety Center':'本机安全中心'};const name=page.route?.split('/')[1];
 if(titles[name])safeNative(()=>wx.setNavigationBarTitle?.({title:I.translate(titles[name],lang)+(s._localReadOnly?(lang==='en'?' · Read only':' · 只读'):'')}));
 safeNative(()=>wx.setNavigationBarColor?.({frontColor:dark?'#ffffff':'#000000',backgroundColor:bg}));safeNative(()=>wx.setBackgroundColor?.({backgroundColor:bg}));safeNative(()=>wx.setTabBarStyle?.({backgroundColor:bg,color:dark?'#b5b5b5':'#707070',selectedColor:settings.themeColor,borderStyle:dark?'black':'white'}));['工作概览','我的任务','日历安排','个人中心'].forEach((text,index)=>safeNative(()=>wx.setTabBarItem?.({index,text:I.translate(text,lang)})));
}
module.exports={install,navigation,language,translateData,style,fontScale,pointer,t:s=>I.translate(s,language())};
