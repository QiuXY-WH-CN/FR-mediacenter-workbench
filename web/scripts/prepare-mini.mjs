import {copyFile, readdir} from 'node:fs/promises';

const shared = new URL('../shared/', import.meta.url);
const utils = new URL('../../miniprogram/utils/', import.meta.url);
const files = (await readdir(shared)).filter(file => file.endsWith('.cjs')).sort();
await Promise.all(files.map(file => copyFile(new URL(file, shared), new URL(file.replace(/\.cjs$/, '.js'), utils))));
console.log('Prepared ' + files.length + ' shared modules for WeChat.');
