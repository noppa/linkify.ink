// @ts-check
import { h, render, Fragment } from './libraries.bundle.js';
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

	// If on root with a hash payload, redirect to /receive
	useEffect(() => {
		if (route === '/' && window.location.hash.length > 1) {
			window.history.replaceState(null, '', '/receive' + window.location.hash);
			setRoute('/receive');
		}
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
