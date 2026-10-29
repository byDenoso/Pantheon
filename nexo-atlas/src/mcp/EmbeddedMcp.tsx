import {McpAtlasApp} from './McpAtlasApp.tsx';
import '../styles/product-foundation.css';
import './mcp-atlas.css';

export default function EmbeddedMcp({theme,onThemeToggle}:{theme:string;onThemeToggle:()=>void}){
  return <McpAtlasApp themeOverride={theme} onThemeToggle={onThemeToggle} embedded/>;
}
