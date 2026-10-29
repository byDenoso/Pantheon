// Language of the current document, live. Inside the private frame <html lang> is set by the guarded host when the shell sends its language
// preference, so a view using this hook switches language in place: no remount, no reload, nothing but words changes.
import {useEffect, useState} from 'react';
import {documentLang, type Lang} from './state-language.ts';

export function useDocumentLang(): Lang {
  const [lang, setLang] = useState<Lang>(documentLang);
  useEffect(() => {
    const mo = new MutationObserver(() => setLang(documentLang())); mo.observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
    setLang(documentLang()); return () => mo.disconnect();
  }, []);
  return lang;
}
