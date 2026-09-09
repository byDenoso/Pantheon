import {useEffect,useRef,type ReactNode} from 'react';
export function Modal({title,children,onClose,className=''}:{title:string;children:ReactNode;onClose:()=>void;className?:string}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close();},[]);
  return <dialog ref={ref} className={`modal ${className}`} onCancel={onClose} aria-label={title}><div className="modal-head"><span className="eyebrow">{title}</span><button className="icon-btn" onClick={onClose} aria-label="Fechar painel">×</button></div>{children}</dialog>;
}
