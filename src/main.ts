import {CountyMapApp} from './App';
import {initializeColorScaleWasm} from './map/colorScale';
import './styles.css';

const root = document.getElementById('root');
if (!(root instanceof HTMLDivElement)) {
  throw new Error('Missing application root');
}

let app: CountyMapApp | null = null;
void initializeColorScaleWasm().then(() => {
  app = new CountyMapApp(root);
  return app.start();
});
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) app?.destroy();
});
