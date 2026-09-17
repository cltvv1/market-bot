import { Worker } from 'node:worker_threads';

// Parse away from the HTTP thread, with byte-range guards before native allocations.
// The worker only parses bytes with a pinned library; it never executes/decodes media.
const SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const localRequire = require('node:module').createRequire(workerData.anchor);
const { parseFromTokenizer } = localRequire('music-metadata');
const { fromBuffer } = localRequire('strtok3');
const { join, dirname } = require('node:path');
(async () => {
  const buffer = Buffer.from(workerData.bytes);
  const tokenizer = fromBuffer(buffer);
  let invalidRange = false;
  const checkRange = (length, position) => {
    if (!Number.isSafeInteger(length) || length < 0 || !Number.isSafeInteger(position) || position < 0 || length > buffer.length - position) {
      invalidRange = true;
      throw new Error('Invalid media byte range');
    }
  };
  for (const method of ['readToken', 'peekToken']) {
    const original = tokenizer[method].bind(tokenizer);
    tokenizer[method] = (token, position = tokenizer.position) => {
      checkRange(token.len, position);
      return original(token, position);
    };
  }
  // Pinned parser internals: EBML binary values allocate before calling the tokenizer.
  // This guard is local to the disposable worker, never a process-wide vendor patch.
  const { EbmlIterator } = localRequire(join(dirname(localRequire.resolve('music-metadata')), 'ebml/EbmlIterator.js'));
  const readBinary = EbmlIterator.prototype.readBuffer;
  EbmlIterator.prototype.readBuffer = function (element) {
    checkRange(element.len, this.tokenizer.position);
    return readBinary.call(this, element);
  };
  const { format: f, quality } = await parseFromTokenizer(tokenizer, { skipCovers: true, skipPostHeaders: true, duration: true });
  if (invalidRange) return null;
  // The parser reports legal zero padding after ID3 frames as an invalid frame ID.
  const paddingWarning = /^Invalid ID3v2[.]4 frame-header-ID: \\x00{4}$/;
  if (quality.warnings.some(w => !paddingWarning.test(w.message) && /error|invalid|truncat|unexpected|end.of.stream/i.test(w.message))) return null;
  const at = (n, s) => buffer.subarray(n, n + s.length).toString('latin1') === s;
  const audio = f.sampleRate > 0 && f.numberOfChannels > 0;
  const tracks = f.trackInfo || [];
  const video = f.hasVideo === true || tracks.some(t => t.type === 1 && t.video && t.video.pixelWidth > 0 && t.video.pixelHeight > 0);
  if (at(4, 'ftyp')) {
    if (!tracks.length || !tracks.some(t => t.codecName)) return null;
    if (at(8, 'qt  ')) return video ? 'video/quicktime' : null;
    return video ? 'video/mp4' : audio ? 'audio/mp4' : null;
  }
  if (at(0, 'OggS')) return audio && /Opus|Vorbis|Speex/i.test(f.codec || '') ? 'audio/ogg' : null;
  if (buffer.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'))) {
    if (!/webm/i.test(f.container || '') || !tracks.length) return null;
    return video ? 'video/webm' : audio ? 'audio/webm' : null;
  }
  return audio && /MPEG.*Layer 3/i.test(f.codec || '') && f.duration > 0 ? 'audio/mpeg' : null;
})().then(value => parentPort.postMessage(value), () => parentPort.postMessage(null));
`;

export function inspectMedia(buffer: Buffer): Promise<string | null> {
    return new Promise((resolve) => {
        const worker = new Worker(SOURCE, {
            eval: true,
            workerData: { bytes: buffer, anchor: __filename },
            resourceLimits: { maxOldGenerationSizeMb: 96, stackSizeMb: 2 },
        });
        let finished = false;
        const finish = (result: string | null) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            void worker.terminate().then(
                () => resolve(result),
                () => resolve(null),
            );
        };
        const timer = setTimeout(() => finish(null), 5000);
        worker.once('message', (value: unknown) =>
            finish(typeof value === 'string' ? value : null),
        );
        worker.once('error', () => finish(null));
        worker.once('exit', () => finish(null));
    });
}
