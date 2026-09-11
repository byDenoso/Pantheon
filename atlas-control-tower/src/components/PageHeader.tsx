type Props={eyebrow?:string;title:string;description:string;actions?:React.ReactNode};

export function PageHeader({eyebrow='NEXO ATLAS',title,description,actions}:Props){
  return <header className="nexo-page-header">
    <div>
      <p className="nexo-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="nexo-lead">{description}</p>
    </div>
    {actions&&<div className="nexo-page-actions">{actions}</div>}
  </header>;
}
