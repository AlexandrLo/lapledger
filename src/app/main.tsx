import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { applyPalette } from '@app/theme/palette';

import App from './App.tsx';
import './app.css';

applyPalette(document.documentElement.style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
