import fs from 'fs';
import path from 'path';

const libDir = path.join(process.cwd(), 'lib');
const loggerTs = path.join(libDir, 'logger.ts');
const loggerJs = path.join(libDir, 'logger.js');
const txParsingTs = path.join(libDir, 'txParsing.ts');
const txParsingJs = path.join(libDir, 'txParsing.js');

try {
  // Create lib directory if it doesn't exist
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }

  // Copy logger.ts to logger.js if it exists and logger.js doesn't
  if (fs.existsSync(loggerTs) && !fs.existsSync(loggerJs)) {
    fs.copyFileSync(loggerTs, loggerJs);
    console.log('✅ Copied lib/logger.ts to lib/logger.js');
  }

  // Copy txParsing.ts to txParsing.js if it exists and txParsing.js doesn't
  if (fs.existsSync(txParsingTs) && !fs.existsSync(txParsingJs)) {
    fs.copyFileSync(txParsingTs, txParsingJs);
    console.log('✅ Copied lib/txParsing.ts to lib/txParsing.js');
  }
} catch (error) {
  console.error('❌ Error in prebuild script:', error.message);
  process.exit(1);
}
