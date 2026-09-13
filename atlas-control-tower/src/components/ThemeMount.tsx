import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {ThemeToggle} from './ThemeToggle';

export function ThemeMount(){
  const [target,setTarget]=useState<Element|null>(null);
  useEffect(()=>{
    const resolve=()=>setTarget(document.querySelector('.top-actions'));
    resolve();
    if(document.querySelector('.top-actions'))return;
    const observer=new MutationObserver(()=>{if(document.querySelector('.top-actions')){resolve();observer.disconnect()}});
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);
  return target?createPortal(<ThemeToggle/>,target):null;
}
