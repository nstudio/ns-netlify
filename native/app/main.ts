import { createElement } from 'react';
import { render } from '@nativescript-community/react';
import { document } from 'dominative';
import App from './App';

// Called by the edge shell on boot and after every hot update.
export default function createRoot() {
  const frame = document.createElement('frame');
  render(createElement(App), frame);
  return frame;
}
