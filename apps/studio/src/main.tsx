import { render } from 'preact';
import 'katex/dist/katex.min.css';
import './styles.css';
import { App } from './App.jsx';

const root = document.getElementById('app');
if (root) render(<App />, root);
