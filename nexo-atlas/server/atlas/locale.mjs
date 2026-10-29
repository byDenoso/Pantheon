// Locale is a presentation hint, never an authorization or identity signal.
// Read only the country supplied by the existing Vercel runtime; never resolve,
// return, log or persist an IP address or exact location.
export const ATLAS_LOCALES=Object.freeze(['pt-BR','en']);
const PORTUGUESE_COUNTRIES=new Set(['BR','PT','AO','MZ','CV','GW','ST','TL']);
function browserLocale(value){
  if(typeof value!=='string'||value.length>2048)return null;
  const preferences=value.split(',').slice(0,30).map((entry,index)=>{
    const [language,...params]=entry.trim().split(';');
    if(!/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(language))return null;
    let q=1;
    if(params.length){
      if(params.length!==1||!/^\s*q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/.test(params[0]))return null;
      q=Number(params[0].trim().slice(2));
    }
    const primary=language.toLowerCase().split('-')[0];
    return q>0&&['pt','en'].includes(primary)?{locale:primary==='pt'?'pt-BR':'en',q,index}:null;
  }).filter(Boolean).sort((a,b)=>b.q-a.q||a.index-b.index);
  return preferences[0]?.locale||null;
}
export function atlasLocale(req,env={}){
  const url=new URL(req.url||'/','https://local.invalid');
  const choices=url.searchParams.getAll('lang');
  const preference=choices.length===1&&ATLAS_LOCALES.includes(choices[0])?choices[0]:null;
  const browser=browserLocale(req.headers?.['accept-language']);
  // This platform environment flag cannot be enabled by request headers.
  // On another host/proxy, country hints remain disabled until a separately
  // reviewed trusted-edge adapter exists. Geolocation is approximate.
  const rawCountry=env.VERCEL==='1'?req.headers?.['x-vercel-ip-country']:null;
  const country=typeof rawCountry==='string'&&/^[A-Z]{2}$/.test(rawCountry)&&rawCountry!=='XX'?rawCountry:null;
  const locale=preference||browser||(country?(PORTUGUESE_COUNTRIES.has(country)?'pt-BR':'en'):'pt-BR');
  const source=preference?'preference':browser?'browser':country?'country':'default';
  return {contract:'ATLAS_LOCALE_V1',locale,source,supported:[...ATLAS_LOCALES]};
}
