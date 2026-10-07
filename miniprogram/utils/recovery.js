const Engine=require('./particle-engine');

// Only presentation preferences and fixed diagnostic codes reach local storage.
// This module never serializes an Error, a page, an account or workspace content.
const DISPLAY='fr.interface',DIAGNOSTICS='fr.localDiagnostics',OVERRIDE='fr.localAppearance';
const APPROVED_KEYS=new Set(['fr.token','fr.connection','fr.language',DISPLAY,DIAGNOSTICS,OVERRIDE]);
const CATEGORIES={runtime:'JS_RUNTIME',promise:'PROMISE_REJECTION',render:'UI_RENDER',canvas:'CANVAS_FALLBACK',storageRead:'STORAGE_READ',storageWrite:'STORAGE_WRITE',storageRemove:'STORAGE_REMOVE',schema:'CACHE_SCHEMA'};
const TYPES=new Set(['Error','TypeError','RangeError','SyntaxError','ReferenceError']);
const STYLE_VALUES=['off','constellation','fireflies','snow','petals','rain','orbits','stars','bubbles','random','rotate'];
const ACTIONS=new Set(['startup','repair','resetAppearance','clearDisplay','restart']);
const clamp=(n,min,max,fallback)=>n!==null&&n!==''&&typeof n!=='boolean'&&typeof n!=='object'&&Number.isFinite(Number(n))?Math.max(min,Math.min(max,Number(n))):fallback;
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const minute=()=>new Date(Math.floor(Date.now()/60000)*60000).toISOString();
let entries=[],lastRecovery=null,loaded=false,storageAvailable=null,canvasStatus='unknown',renderStatus='unknown',volatileAppearance=null,ignoreStoredOverride=false;

function normalizeSettings(raw){
 const s=plain(raw)?raw:{};
 return {workspace:['','办公室','新媒体运营部','视觉传达部','创意设计部'].includes(s.workspace)?s.workspace:'',language:s.language==='en'?'en':'zh-CN',themeColor:typeof s.themeColor==='string'&&/^#[0-9a-f]{6}$/i.test(s.themeColor)?s.themeColor.toLowerCase():'#e77b24',appearance:['light','dark','auto'].includes(s.appearance)?s.appearance:'light',fontScale:clamp(s.fontScale,.85,1.35,1),motion:typeof s.motion==='boolean'?s.motion:true,particles:STYLE_VALUES.includes(s.particles)?s.particles:'constellation',particleDensity:Math.round(clamp(s.particleDensity,10,80,48)),rotationMinutes:clamp(s.rotationMinutes,1,60,5),particleSystem:Engine.normalize(s.particleSystem)};
}
function normalizeConnection(raw,defaults){
 const s=plain(raw)?raw:{},base=typeof s.directBaseUrl==='string'?s.directBaseUrl.replace(/\/+$/,''):'';
 const safeUrl=/^https?:\/\/(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d{1,5})?(?:\/[a-z0-9/_~!$&'()*+,;=.%\-]*)?$/i;
 return {transport:['direct','cloud'].includes(s.transport)?s.transport:defaults.transport,directBaseUrl:safeUrl.test(base)?base:defaults.directBaseUrl,cloudEnv:typeof s.cloudEnv==='string'&&/^[a-z0-9_-]{0,100}$/i.test(s.cloudEnv)?s.cloudEnv:defaults.cloudEnv,cloudFunction:typeof s.cloudFunction==='string'&&/^[a-z0-9_-]{1,60}$/i.test(s.cloudFunction)?s.cloudFunction:defaults.cloudFunction,pollMs:Math.round(clamp(s.pollMs,15000,120000,defaults.pollMs||30000))};
}
function safeType(error){try{return TYPES.has(error?.name)?error.name:'Error'}catch{return 'Error'}}
function sanitizeDiagnostics(raw){
 const codes=new Set(Object.values(CATEGORIES)),valid=plain(raw)?raw:{};
 const items=Array.isArray(valid.entries)?valid.entries:[];
 const cleaned=items.filter(x=>plain(x)&&codes.has(x.code)).slice(-12).map(x=>({code:x.code,type:TYPES.has(x.type)?x.type:'Error',count:Math.round(clamp(x.count,1,99,1)),last:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(x.last||'')?x.last:minute()}));
 const r=valid.lastRecovery;
 return {entries:cleaned,lastRecovery:plain(r)&&ACTIONS.has(r.action)&&['done','partial'].includes(r.result)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(r.when||'')?{action:r.action,result:r.result,when:r.when}:null};
}
function native(){return typeof wx==='object'?wx:null}
function persistDiagnostics(){try{const w=native();if(typeof w?.setStorageSync==='function')w.setStorageSync(DIAGNOSTICS,{entries,lastRecovery});else storageAvailable=false}catch{storageAvailable=false}}
function capture(error,category='runtime'){
 const code=CATEGORIES[category]||CATEGORIES.runtime,type=safeType(error),existing=entries.find(x=>x.code===code&&x.type===type);
 if(existing){existing.count=Math.min(99,existing.count+1);existing.last=minute()}else entries.push({code,type,count:1,last:minute()});entries=entries.slice(-12);
 if(category==='canvas')canvasStatus='fallback';if(category==='render')renderStatus='fallback';
 persistDiagnostics();return code;
}
function safeRead(key,fallback){try{const w=native();if(typeof w?.getStorageSync!=='function')return fallback;const value=w.getStorageSync(key);return value===undefined||value===null||value===''?fallback:value}catch(e){capture(e,'storageRead');storageAvailable=false;return fallback}}
function safeWrite(key,value){try{const w=native();if(typeof w?.setStorageSync!=='function')return false;w.setStorageSync(key,value);return true}catch(e){capture(e,'storageWrite');storageAvailable=false;return false}}
function safeRemove(key){try{const w=native();if(typeof w?.removeStorageSync!=='function')return false;w.removeStorageSync(key);return true}catch(e){capture(e,'storageRemove');storageAvailable=false;return false}}
function load(){if(loaded)return;loaded=true;const cleaned=sanitizeDiagnostics(safeRead(DIAGNOSTICS,{}));entries=cleaned.entries;lastRecovery=cleaned.lastRecovery;persistDiagnostics()}
function noteRecovery(action,result='done'){lastRecovery={action:ACTIONS.has(action)?action:'repair',result:result==='partial'?'partial':'done',when:minute()};persistDiagnostics();return {...lastRecovery}}
function displaySettings(){const raw=safeRead(DISPLAY,{});return normalizeSettings({...plain(raw)?raw:{},language:plain(raw)&&['en','zh-CN'].includes(raw.language)?raw.language:safeRead('fr.language','zh-CN')})}
function saveDisplay(raw){return safeWrite(DISPLAY,normalizeSettings(raw))}
function appearanceOverride(){if(volatileAppearance)return volatileAppearance;if(ignoreStoredOverride)return null;const s=safeRead(OVERRIDE,null);return plain(s)?normalizeSettings(s):null}
function clearOverride(){volatileAppearance=null;ignoreStoredOverride=true;return safeRemove(OVERRIDE)}
function applySettings(raw){const normalized=normalizeSettings(raw),override=appearanceOverride();return override?{...normalized,...override,language:normalized.language,workspace:normalized.workspace}:normalized}
function purgeUnapprovedCaches(){let ok=true;try{const info=native()?.getStorageInfoSync?.();if(Array.isArray(info?.keys))for(const key of info.keys)if(typeof key==='string'&&key.startsWith('fr.')&&!APPROVED_KEYS.has(key))ok=safeRemove(key)&&ok}catch(e){capture(e,'storageRead');ok=false}return ok}
function bootRepair(){
 load();const original=safeRead(DISPLAY,null),normalized=normalizeSettings({...plain(original)?original:{},language:plain(original)&&['en','zh-CN'].includes(original.language)?original.language:safeRead('fr.language','zh-CN')});let changed=original!==null&&JSON.stringify(original)!==JSON.stringify(normalized),ok=purgeUnapprovedCaches();
 if(changed){capture(null,'schema');ok=saveDisplay(normalized)&&ok}
 const lang=safeRead('fr.language','zh-CN');if(!['zh-CN','en'].includes(lang)){changed=true;ok=safeWrite('fr.language','zh-CN')&&ok}
 const override=safeRead(OVERRIDE,null);if(override!==null&&(!plain(override)||JSON.stringify(override)!==JSON.stringify(normalizeSettings(override)))){changed=true;ok=safeRemove(OVERRIDE)&&ok;capture(null,'schema')}
 if(changed)noteRecovery('startup',ok?'done':'partial');return {changed,ok};
}
function clearDisplay(){volatileAppearance=null;ignoreStoredOverride=true;const ok=[safeRemove(DISPLAY),safeRemove(OVERRIDE),purgeUnapprovedCaches()].every(Boolean);noteRecovery('clearDisplay',ok?'done':'partial');return ok}
function repair(options={}){
 load();let ok=purgeUnapprovedCaches();if(options.clearDisplay)ok=safeRemove(DISPLAY)&&ok;
 const normalized=normalizeSettings(safeRead(DISPLAY,{}));ok=saveDisplay(normalized)&&ok;
 if(options.resetAppearance){const reset=normalizeSettings({language:safeRead('fr.language','zh-CN'),particles:'off',motion:false});volatileAppearance=reset;ignoreStoredOverride=false;const resetResults=[safeWrite(OVERRIDE,reset),saveDisplay(reset)];ok=resetResults.every(Boolean)&&ok}
 else if(canvasStatus==='fallback'||renderStatus==='fallback'){const safe=normalizeSettings({...normalized,particles:'off',motion:false});volatileAppearance=safe;ignoreStoredOverride=false;const safeResults=[safeWrite(OVERRIDE,safe),saveDisplay(safe)];ok=safeResults.every(Boolean)&&ok}
 if(ok){entries=[];canvasStatus='unknown';renderStatus='unknown'}
 return noteRecovery(options.resetAppearance?'resetAppearance':'repair',ok?'done':'partial');
}
function markSuccess(kind){if(kind==='canvas')canvasStatus='ready';if(kind==='render')renderStatus='ready'}
function localStorageProbe(){const w=native();if(!w?.setStorageSync||!w?.getStorageSync||!w?.removeStorageSync)return false;try{w.setStorageSync('fr.localProbe',true);const ok=w.getStorageSync('fr.localProbe')===true;w.removeStorageSync('fr.localProbe');storageAvailable=ok;return ok}catch(e){storageAvailable=false;capture(e,'storageRead');try{w.removeStorageSync?.('fr.localProbe')}catch{}return false}}
function health(version=''){
 load();const available=localStorageProbe(),raw=safeRead(DISPLAY,null),schemaValid=raw===null||plain(raw)&&JSON.stringify(raw)===JSON.stringify(normalizeSettings(raw));let cacheKB=0;
 try{for(const key of [DISPLAY,OVERRIDE,DIAGNOSTICS])cacheKB+=JSON.stringify(safeRead(key,null)||null).length*2/1024}catch{capture(null,'schema')}
 let canvas='unknown';try{canvas=native()?.canIUse?.('canvas.type.2d')===true?'supported':'fallback'}catch{canvas='fallback'}
 return {version:/^v?\d+\.\d+\.\d+$/.test(version)?version:'unknown',storage:available?'available':'limited',presentation:schemaValid?'valid':'needsRepair',canvas:canvasStatus==='fallback'?'fallback':canvas,renderer:renderStatus,cacheKB:Number(cacheKB.toFixed(2)),errors:entries.map(x=>({...x})),errorCount:entries.reduce((n,x)=>n+x.count,0),lastRecovery:lastRecovery?{...lastRecovery}:null};
}
function diagnostic(version=''){const h=health(version);return JSON.stringify({schema:1,platform:'miniapp',version:h.version,storage:h.storage,presentation:h.presentation,canvas:h.canvas,renderer:h.renderer,cacheKB:h.cacheKB,errors:h.errors,lastRecovery:h.lastRecovery},null,2)}
module.exports={normalizeSettings,normalizeConnection,sanitizeDiagnostics,capture,safeRead,safeWrite,safeRemove,bootRepair,displaySettings,saveDisplay,appearanceOverride,clearOverride,applySettings,clearDisplay,repair,noteRecovery,markSuccess,health,diagnostic};
