const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'vendor');
const copies = [
  {
    src: path.join(__dirname, '..', 'node_modules', 'lottie-web', 'build', 'player', 'lottie.min.js'),
    dst: path.join(outDir, 'lottie.min.js'),
    label: 'lottie.min.js'
  },
  {
    src: path.join(__dirname, '..', 'node_modules', 'gif.js', 'dist', 'gif.js'),
    dst: path.join(outDir, 'gif.js'),
    label: 'gif.js'
  },
  {
    src: path.join(__dirname, '..', 'node_modules', 'gif.js', 'dist', 'gif.worker.js'),
    dst: path.join(outDir, 'gif.worker.js'),
    label: 'gif.worker.js'
  }
];

fs.mkdirSync(outDir, { recursive: true });

for (const file of copies) {
  if (!fs.existsSync(file.src)) {
    console.error(`${file.label} not found: ${file.src}`);
    process.exit(1);
  }
  fs.copyFileSync(file.src, file.dst);
  console.log(`Copied ${file.label}`);
}
