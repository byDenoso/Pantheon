import {useEffect,useState} from 'react';
import type {SystemStore} from '../data/useSystem.ts';
import {LoadingState} from '../components/states.tsx';
import {ensureAtlasG6} from './g6-loader.ts';
import {Atlas3DContent} from './Atlas3DApp.tsx';
import '../styles/product-foundation.css';
import '../components/GalaxyThree3D.css';
import './atlas3d.css';

export default function EmbeddedAtlas3D({system}:{system:SystemStore}){
  const [ready,setReady]=useState(()=>Boolean((window as any).G6?.Graph));
  useEffect(()=>{
    let active=true;
    void ensureAtlasG6().then(()=>{if(active)setReady(true);});
    return()=>{active=false;};
  },[]);
  if(!ready)return <LoadingState label="Preparando o Atlas…"/>;
  return <Atlas3DContent system={system}/>;
}
