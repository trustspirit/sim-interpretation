import sharp from 'sharp';
import { mkdir, readFile } from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const sizes = [16, 32, 64, 128, 256, 512, 1024];

async function generateIcons() {
  const svgPath = path.join(rootDir, 'assets', 'icon.svg');
  const iconsetDir = path.join(rootDir, 'assets', 'icon.iconset');
  
  // Create iconset directory
  await mkdir(iconsetDir, { recursive: true });
  
  const svgBuffer = await readFile(svgPath);
  
  // Generate PNG files for iconset
  for (const size of sizes) {
    // Normal resolution
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsetDir, `icon_${size}x${size}.png`));
    
    // Retina resolution (2x) - only for sizes up to 512
    if (size <= 512) {
      await sharp(svgBuffer)
        .resize(size * 2, size * 2)
        .png()
        .toFile(path.join(iconsetDir, `icon_${size}x${size}@2x.png`));
    }
    
    console.log(`Generated ${size}x${size} icons`);
  }
  
  // Generate main PNG for other platforms
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(rootDir, 'assets', 'icon.png'));
  
  console.log('Generated icon.png');
  
  // Create icns file using iconutil (macOS only)
  if (process.platform === 'darwin') {
    try {
      execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(rootDir, 'assets', 'icon.icns')}"`);
      console.log('Generated icon.icns');
    } catch (error) {
      console.error('Failed to create icns:', error.message);
    }
  }
  
  console.log('Icon generation complete!');
}

generateIcons().catch(console.error);
