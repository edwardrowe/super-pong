import './style.css';
import { Shell } from './shell/shell';

const shell = new Shell(document.getElementById('screen') as HTMLCanvasElement);

// Dev-only handle for debugging from the browser console (stripped from production builds).
if (import.meta.env.DEV) (window as unknown as { __shell: Shell }).__shell = shell;
