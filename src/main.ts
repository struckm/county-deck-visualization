import {CountyMapApp} from './App';
import './styles.css';

const root = document.getElementById('root');
if (!(root instanceof HTMLDivElement)) {
  throw new Error('Missing application root');
}

const app = new CountyMapApp(root);
void app.start();
window.addEventListener('beforeunload', () => app.destroy(), {once: true});
