// @ts-check
import { h, render } from './libraries.bundle.js';
import { useState, useEffect } from './libraries.bundle.js';
import { htm } from './libraries.bundle.js';
import EditorPage from './components/EditorPage.js';
import ReceivePage from './components/ReceivePage.js';
import AboutPage from './components/AboutPage.js';

const html = htm.bind(h);

function App() {
	const [route, setRoute] = useState(getRoute());

	useEffect(() => {
		const onPop = () => setRoute(getRoute());
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	}, []);

	if (route === '/receive') return html`<${ReceivePage} />`;
	if (route === '/about') return html`<${AboutPage} />`;
	return html`<${EditorPage} />`;
}

function getRoute() {
	return window.location.pathname;
}

const root = document.getElementById('app');
if (!root) throw new Error('No #app element');
render(html`<${App} />`, root);
