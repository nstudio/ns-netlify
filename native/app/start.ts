import '@valor/nativescript-websockets';
import { Application, type View } from '@nativescript/core';
import createRoot from './main';

// Local builds only: on the edge, the shell owns Application.run and imports app/main.ts.
Application.run({ create: () => createRoot() as View });
