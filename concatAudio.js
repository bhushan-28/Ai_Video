import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const audioDir = path.resolve(__dirname, 'outputs/audio');
const files = fs.readdirSync(audioDir).filter(f => f.startsWith('scene_proj-ruby-apple-01_') && f.endsWith('.mp3'));
files.sort((a,b) => {
  const ma = a.match(/scene_proj-ruby-apple-01_(\d+)/);
  const mb = b.match(/scene_proj-ruby-apple-01_(\d+)/);
  return parseInt(ma[1]) - parseInt(mb[1]);
});

console.log('Found scene audio files:', files);

const listContent = files.map(f => `file '${path.join(audioDir, f).replace(/\\/g, '/')}'`).join('\n');
const listPath = path.join(audioDir, 'concat_list.txt');
fs.writeFileSync(listPath, listContent, 'utf8');
console.log('Concat list file created at:', listPath);

import ffmpegPath from 'ffmpeg-static';

const outAudio = path.join(audioDir, 'the_rabbit_who_shared_his_apple_full_audio.mp3');
try {
  execSync(`"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}" -c copy "${outAudio}"`, { stdio: 'inherit' });
  const stat = fs.statSync(outAudio);
  console.log('SUCCESS: Full audio merged at:', outAudio, 'Bytes:', stat.size);
} catch (err) {
  console.error('Concat error:', err.message);
}
