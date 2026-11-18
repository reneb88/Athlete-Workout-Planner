// Forgot the coach password? Run:  npm run reset-password
// Removes the password only (all your data is kept). Next time you open the app it asks you to create a new one.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { initAuth } from './auth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = openDb(process.env.DB_FILE ?? path.join(ROOT, 'data', 'ropeworks.db'));
initAuth(store.db).reset();
console.log('Coach password removed. Open Ropeworks and create a new password.');
