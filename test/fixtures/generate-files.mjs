// Optional developer tool only. Never imported by the application or CI.
// Produces synthetic silence/color fixtures, never processes customer uploads.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./files/', import.meta.url));
mkdirSync(root, { recursive: true });
const ffmpeg = process.env.FFMPEG_FIXTURE_BINARY;
if (!ffmpeg) throw new Error('Set FFMPEG_FIXTURE_BINARY to a local ffmpeg executable');
function run(args, name) {
    const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args, root + name], { stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) throw new Error(`Fixture generation failed: ${name}`);
}
const image = ['-f', 'lavfi', '-i', 'color=c=white:s=16x16:r=5', '-frames:v', '1'];
for (const name of ['image.jpg', 'image.png', 'image.webp', 'image.gif']) run(image, name);
const audio = ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.2'];
run([...audio, '-c:a', 'libmp3lame'], 'audio-id3.mp3');
run([...audio, '-c:a', 'libmp3lame', '-id3v2_version', '0', '-write_xing', '0'], 'audio.mp3');
run([...audio, '-c:a', 'libopus'], 'audio.ogg');
run([...audio, '-c:a', 'aac'], 'audio.m4a');
run([...audio, '-c:a', 'libopus'], 'audio.webm');
const video = ['-f', 'lavfi', '-i', 'color=c=white:s=16x16:r=5', '-t', '0.4'];
run([...video, '-c:v', 'libx264', '-pix_fmt', 'yuv420p'], 'video.mp4');
run([...video, '-c:v', 'libvpx-vp9'], 'video.webm');
run([...video, '-c:v', 'libx264', '-pix_fmt', 'yuv420p'], 'video.mov');
