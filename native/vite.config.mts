import { defineConfig } from 'vite';
import { reactConfig } from '@nativescript/vite/react';

export default defineConfig(({ mode }) => reactConfig({ mode }, { typeCheck: 'off' }));
