import fs from 'fs';
import path from 'path';

const distDir = path.join(process.cwd(), 'dist');

function addJsExtensionsToImports(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add .js extension to relative imports that don't already have it
    content = content.replace(
      /from\s+['"](\.\.?\/[^'"]*?)(?<!\.js)['"]/g,
      "from '$1.js'"
    );
    
    // Also handle dynamic imports
    content = content.replace(
      /import\s*\(\s*['"](\.\.?\/[^'"]*?)(?<!\.js)['"]/g,
      "import('$1.js'"
    );
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed imports in ${path.relative(process.cwd(), filePath)}`);
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processDirectory(filePath);
    } else if (file.endsWith('.js')) {
      addJsExtensionsToImports(filePath);
    }
  }
}

console.log('🔧 Adding .js extensions to compiled JavaScript files...');
processDirectory(distDir);
console.log('✅ Post-build processing complete!');
