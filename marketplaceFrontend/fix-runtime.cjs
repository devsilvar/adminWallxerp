// Fix Vercel runtime to use Node.js 24 instead of 18
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '.vercel', 'output', 'functions', '_render.func', '.vc-config.json');

try {
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.runtime && config.runtime.startsWith('nodejs18')) {
      config.runtime = 'nodejs24.x';
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log('✅ Fixed runtime to nodejs24.x');
    }
  }
} catch (error) {
  console.warn('⚠️  Could not fix runtime:', error.message);
}
