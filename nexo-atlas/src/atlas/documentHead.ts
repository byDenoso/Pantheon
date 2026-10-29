// Keeps the document metadata in step with the page being shown. The static
// index.html describes the home page; an investigation page must not keep
// advertising the home address as its canonical URL.
const set=(selector:string,attribute:string,value:string)=>{document.head.querySelector(selector)?.setAttribute(attribute,value);};
/** Sentence-safe shortening for meta descriptions; never cuts inside a word. */
export function metaDescription(text:string,max=200){
 const clean=text.replace(/\s+/g,' ').trim();
 if(clean.length<=max)return clean;
 const cut=clean.slice(0,max+1),stop=cut.lastIndexOf(' ');
 return `${cut.slice(0,stop>60?stop:max).replace(/[\s,;:·–—-]+$/,'')}…`;
}
export function syncDocumentHead({title,path,description}:{title:string;path:string;description?:string}){
 document.title=title;
 const link=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
 let origin=location.origin;try{if(link?.href)origin=new URL(link.href).origin;}catch{/* keep the current origin */}
 const url=origin+path;
 set('link[rel="canonical"]','href',url);set('meta[property="og:url"]','content',url);set('meta[property="og:title"]','content',title);
 if(description){set('meta[name="description"]','content',description);set('meta[property="og:description"]','content',description);}
}
