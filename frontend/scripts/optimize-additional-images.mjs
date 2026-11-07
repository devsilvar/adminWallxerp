#!/usr/bin/env node
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '../public');
const SIZES = { sm: 640, md: 768, lg: 1024 };
const QUALITY = 82;

async function optimizeImage(inputPath, outputDir, name) {
  console.log(`Processing: ${name}`);
  
  for (const [sizeName, width] of Object.entries(SIZES)) {
    const outputPath = path.join(outputDir, `${name}-${sizeName}.webp`);
    await sharp(inputPath)
      .resize(width, null, { withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(outputPath);
    console.log(`  ✓ Created ${name}-${sizeName}.webp (${width}px)`);
  }
}

async function main() {
  const additionalImages = [
    'step-1-account.jpg',
    'step-2-transactions.jpg',
    'step-3-file-tax.jpg',
    'analytics-feature.jpg',
    'team-collaboration.jpg'
  ];

  const optimizedDir = path.join(PUBLIC_DIR, 'images-optimized');

  console.log('🖼️  Optimizing additional images...\n');
  
  for (const img of additionalImages) {
    const inputPath = path.join(PUBLIC_DIR, 'images', img);
    if (fs.existsSync(inputPath)) {
      const name = path.basename(img, '.jpg');
      await optimizeImage(inputPath, optimizedDir, name);
    } else {
      console.log(`⚠️  ${img} not found, skipping`);
    }
  }

  console.log('\n✅ Additional optimization complete!');
}

main().catch(console.error);
