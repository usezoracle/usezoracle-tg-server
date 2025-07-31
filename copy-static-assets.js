import fs from 'fs';
import path from 'path';

// Create dist directory if it doesn't exist
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Copy openapi.yaml to dist folder
fs.copyFileSync('openapi.yaml', path.join('dist', 'openapi.yaml'));

console.log('Static assets copied successfully');