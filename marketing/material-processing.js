/** Local-only preparation. Returned strings are untrusted text, never HTML. */
export const limits = Object.freeze({ maxBytes: 15 * 1024 * 1024, maxPages: 80 });

const MAX_PIXELS = 4_000_000;
const MAX_IMAGE_PIXELS = 50_000_000;
const MAX_TEXT = 40_000;
const TIMEOUT_MS = 60_000;
const vendorUrl = path => new URL('../vendor/' + path, import.meta.url).href;
const invalidImage = () => new Error('This image is damaged or unsupported. Choose a static PNG, JPG, or WebP file.');
const text = (value, maximum = MAX_TEXT) => String(value || '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
  .replace(/\s+/g, ' ').trim().slice(0, maximum);

function progressContext(onProgress, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort(new DOMException('Processing cancelled.', 'AbortError'));
  const timer = setTimeout(() => controller.abort(new DOMException('Processing took too long. Try a smaller or simplified file.', 'TimeoutError')), TIMEOUT_MS);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  // A cancellation can happen between awaited operations.
  aborted.catch(() => {});
  const onAbort = () => rejectAbort(controller.signal.reason);
  if (controller.signal.aborted) onAbort();
  else controller.signal.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    check() { if (controller.signal.aborted) throw controller.signal.reason; },
    wait(promise) { this.check(); return Promise.race([promise, aborted]); },
    report(percent, message) { this.check(); onProgress?.({ percent, message }); },
    close() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', onAbort);
    },
  };
}

function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw invalidImage();
  if (width > 32_767 || height > 32_767 || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('This image is too large to process. Use an image under 50 megapixels and 32,768 pixels per side.');
  }
  return { width, height };
}

function identify(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (ascii(0, 5) === '%PDF-' && /^\d\.\d/.test(ascii(5, 3))) return { type: 'application/pdf' };
  if (bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    if (view.getUint32(8) !== 13 || ascii(12, 4) !== 'IHDR') throw invalidImage();
    const size = dimensions(view.getUint32(16), view.getUint32(20));
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset), chunk = ascii(offset + 4, 4);
      if (length > bytes.length - offset - 12) throw invalidImage();
      if (chunk === 'acTL' || chunk === 'fcTL' || chunk === 'fdAT') throw new Error('Animated images are not supported. Export a single static image first.');
      if (chunk === 'IEND') return { type: 'image/png', ...size };
      offset += length + 12;
    }
    throw invalidImage();
  }
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const end = view.getUint32(4, true) + 8;
    if (end !== bytes.length) throw invalidImage();
    let size, offset = 12;
    while (offset + 8 <= end) {
      const chunk = ascii(offset, 4), length = view.getUint32(offset + 4, true), data = offset + 8;
      if (length > end - data) throw invalidImage();
      if (chunk === 'ANIM' || chunk === 'ANMF' || (chunk === 'VP8X' && length >= 10 && (bytes[data] & 2))) {
        throw new Error('Animated images are not supported. Export a single static image first.');
      }
      if (chunk === 'VP8X' && length >= 10) {
        const u24 = start => bytes[start] | (bytes[start + 1] << 8) | (bytes[start + 2] << 16);
        size = dimensions(u24(data + 4) + 1, u24(data + 7) + 1);
      } else if (chunk === 'VP8 ' && length >= 10 && bytes[data + 3] === 157 && bytes[data + 4] === 1 && bytes[data + 5] === 42) {
        const frame = dimensions(view.getUint16(data + 6, true) & 16383, view.getUint16(data + 8, true) & 16383);
        size ||= frame;
      } else if (chunk === 'VP8L' && length >= 5 && bytes[data] === 47) {
        const bits = view.getUint32(data + 1, true);
        const frame = dimensions((bits & 16383) + 1, ((bits >>> 14) & 16383) + 1);
        size ||= frame;
      }
      offset = data + length + (length % 2);
    }
    if (!size || offset !== end) throw invalidImage();
    return { type: 'image/webp', ...size };
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 255) throw invalidImage();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) throw invalidImage();
      const length = view.getUint16(offset);
      if (length < 2 || length > bytes.length - offset) throw invalidImage();
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (length < 8) throw invalidImage();
        return { type: 'image/jpeg', ...dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3)) };
      }
      offset += length;
    }
    throw invalidImage();
  }
  throw new Error('Choose a PDF, PNG, JPG, or static WebP file. Renaming another file does not convert it.');
}

function canvasFor(width, height, maximumWidth = 1000) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('This document has invalid page dimensions.');
  const scale = Math.min(maximumWidth / width, Math.sqrt(MAX_PIXELS / (width * height)), 16_000 / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  return { canvas, scale };
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob || blob.type !== type) reject(new Error('Your browser could not create the preview. Try an up-to-date browser.'));
    else resolve(blob);
  }, type, quality));
}

function suggestions(originalName, sourceTitle, searchText) {
  const filename = text(originalName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), 100);
  const candidate = text(sourceTitle, 100);
  const title = candidate.length >= 3 && !/[<>]/.test(candidate) && !/^(untitled|document\d*|microsoft (word|powerpoint).*)$/i.test(candidate)
    ? candidate : filename || 'Marketing material';
  const description = text(searchText.match(/^.{20,399}?[.!?](?:\s|$)/)?.[0] || searchText, 400);
  const ignored = new Set('about above after again against also been before being below between both could does each from have here into itself more most must northstar other over same should some such than that their them then there these they this those through under until very were what when where which while will with would your'.split(' '));
  const counts = new Map();
  for (const word of searchText.toLowerCase().match(/[a-z][a-z-]{3,29}\b/g) || []) {
    if (!ignored.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  }
  const keywords = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15).map(([word]) => word).join(', ');
  return { title, description, keywords, searchText };
}

async function checkPdfObjects(bytes, context) {
  // PDF.js's JavaScript helpers do not include every annotation action. Inspect
  // parsed PDF objects too, including unreferenced objects retained in the download.
  const { PDFDocument, PDFDict, PDFArray, PDFName, PDFStream } = await context.wait(import('../vendor/pdf-lib/pdf-lib.min.mjs?v=c3b0a324dcbd'));
  let parsed;
  try {
    parsed = await context.wait(PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true }));
  } catch (error) {
    context.check();
    throw new Error('This PDF could not be validated. Export a new static PDF and try again.', { cause: error });
  }
  const queue = parsed.context.enumerateIndirectObjects().map(([, object]) => object);
  const visited = new WeakSet();
  let examined = 0;
  while (queue.length) {
    const object = queue.pop();
    if (!object || typeof object !== 'object' || visited.has(object)) continue;
    visited.add(object);
    if (++examined > 100_000) throw new Error('This PDF is too complex to validate. Export a simplified PDF and try again.');
    if (examined % 1000 === 0) await context.wait(new Promise(resolve => setTimeout(resolve, 0)));
    if (object instanceof PDFDict) {
      if (object.has(PDFName.of('JS')) || object.has(PDFName.of('JavaScript'))) {
        throw new Error('This PDF contains scripts. Export a static PDF without JavaScript first.');
      }
      if (object.has(PDFName.of('XFA'))) throw new Error('Dynamic XFA forms are not supported. Export a static PDF first.');
      for (const [, value] of object.entries()) queue.push(value);
    } else if (object instanceof PDFArray) {
      for (let index = 0; index < object.size(); index++) queue.push(object.get(index));
    } else if (object instanceof PDFStream) {
      queue.push(object.dict);
    } else if (object instanceof PDFName && ['JavaScript', 'Launch', 'RichMediaExecute'].includes(object.decodeText())) {
      throw new Error('This PDF contains scripts or active content. Export a static PDF first.');
    }
  }
}

async function readPageText(page, previous, context) {
  if (previous.length >= MAX_TEXT) return previous;
  const reader = page.streamTextContent({ disableNormalization: false }).getReader();
  let done = false;
  const cancelReason = new Error('Text extraction finished.');
  const cancel = () => { reader.cancel(cancelReason).catch(() => {}); };
  context.signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      const next = await context.wait(reader.read());
      if (next.done) { done = true; break; }
      // Drain chunks without accumulating after the cap. PDF.js's current
      // stream implementation cannot safely cancel while chunks are in flight.
      if (previous.length >= MAX_TEXT) continue;
      for (const item of next.value.items) {
        if (typeof item.str !== 'string') continue;
        previous += (' ' + item.str).slice(0, MAX_TEXT - previous.length);
        if (previous.length >= MAX_TEXT) break;
      }
    }
    return previous;
  } finally {
    context.signal.removeEventListener('abort', cancel);
    if (!done) cancel();
    reader.releaseLock();
  }
}

async function preparePdf(bytes, context) {
  const pdfjs = await context.wait(import('../vendor/pdfjs/pdf.min.mjs?v=c3b0a324dcbd'));
  context.check();
  pdfjs.GlobalWorkerOptions.workerSrc = vendorUrl('pdfjs/pdf.worker.min.mjs');
  const loading = pdfjs.getDocument({
    data: bytes.slice(), isEvalSupported: false, enableXfa: false, useSystemFonts: false,
    standardFontDataUrl: vendorUrl('pdfjs/standard_fonts/'), cMapUrl: vendorUrl('pdfjs/cmaps/'), cMapPacked: true,
    wasmUrl: vendorUrl('pdfjs/wasm/'), maxImageSize: MAX_IMAGE_PIXELS,
    canvasMaxAreaInBytes: MAX_PIXELS * 4, stopAtErrors: true, verbosity: 0,
  });
  let documentPdf, renderTask, destruction;
  const destroy = () => {
    renderTask?.cancel();
    destruction ||= loading.destroy();
    // Destruction can reject when parsing was already interrupted.
    destruction.catch(() => {});
  };
  const passwordError = new Error('Password-protected PDFs are not supported. Export an unencrypted PDF first.');
  let rejectPassword;
  const password = new Promise((_, reject) => { rejectPassword = reject; });
  loading.onPassword = () => { rejectPassword(passwordError); destroy(); };
  context.signal.addEventListener('abort', destroy, { once: true });
  let firstCanvas;
  try {
    documentPdf = await context.wait(Promise.race([loading.promise, password]));
    if (!Number.isInteger(documentPdf.numPages) || documentPdf.numPages < 1 || documentPdf.numPages > limits.maxPages) {
      throw new Error('Choose a PDF with between 1 and ' + limits.maxPages + ' pages.');
    }
    const [metadata, permissions, actions, fieldActions] = await context.wait(Promise.all([
      documentPdf.getMetadata(), documentPdf.getPermissions(), documentPdf.getJSActions(), documentPdf.hasJSActions(),
    ]));
    if (permissions !== null) throw passwordError;
    if (metadata.info?.IsXFAPresent || documentPdf.isPureXfa) throw new Error('Dynamic XFA forms are not supported. Export a static PDF first.');
    if (actions || fieldActions) throw new Error('This PDF contains scripts. Export a static PDF without JavaScript first.');
    await checkPdfObjects(bytes, context);
    let searchText = '';
    let cover;
    for (let number = 1; number <= documentPdf.numPages; number++) {
      context.report(12 + Math.round(70 * (number - 1) / documentPdf.numPages), 'Reading page ' + number + ' of ' + documentPdf.numPages);
      const page = await context.wait(documentPdf.getPage(number));
      try {
        const viewport = page.getViewport({ scale: 1 });
        if (![viewport.width, viewport.height].every(value => Number.isFinite(value) && value >= 1 && value <= 14_400)) {
          throw new Error('This PDF has unsupported page dimensions. Export it at a standard page size.');
        }
        if (await context.wait(page.getJSActions())) throw new Error('This PDF contains scripts. Export a static PDF without JavaScript first.');
        searchText = await readPageText(page, searchText, context);
        if (number === 1) {
          const { canvas, scale } = canvasFor(viewport.width, viewport.height);
          firstCanvas = canvas;
          renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale }), annotationMode: pdfjs.AnnotationMode.DISABLE, background: 'rgb(255,255,255)' });
          await context.wait(renderTask.promise);
          renderTask = null;
          cover = await context.wait(canvasBlob(canvas, 'image/webp', 0.88));
          canvas.width = canvas.height = 1;
        }
      } finally {
        if (!renderTask) page.cleanup();
      }
    }
    return { pdf: new Blob([bytes], { type: 'application/pdf' }), cover, pages: documentPdf.numPages, sourceTitle: metadata.info?.Title, searchText: text(searchText) };
  } catch (error) {
    context.check();
    if (error.name === 'PasswordException') throw passwordError;
    if (['InvalidPDFException', 'UnknownErrorException', 'FormatError'].includes(error.name)) {
      throw new Error('This PDF could not be read. Export a new PDF and try again.', { cause: error });
    }
    throw error;
  } finally {
    context.signal.removeEventListener('abort', destroy);
    destroy();
    await destruction.catch(() => {});
    if (firstCanvas) firstCanvas.width = firstCanvas.height = 1;
  }
}

async function prepareImage(bytes, kind, context) {
  context.report(15, 'Preparing the image');
  const blob = new Blob([bytes], { type: kind.type });
  const bitmap = await context.wait(createImageBitmap(blob).then(value => {
    if (context.signal.aborted) { value.close(); context.check(); }
    return value;
  }).catch(error => { context.check(); throw new Error('This image could not be decoded. Export a new PNG or JPG and try again.', { cause: error }); }));
  let canvas, coverCanvas;
  try {
    dimensions(bitmap.width, bitmap.height);
    ({ canvas } = canvasFor(bitmap.width, bitmap.height, 4000));
    const drawing = canvas.getContext('2d', { alpha: false });
    drawing.fillStyle = '#ffffff';
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    ({ canvas: coverCanvas } = canvasFor(bitmap.width, bitmap.height));
    coverCanvas.getContext('2d').drawImage(canvas, 0, 0, coverCanvas.width, coverCanvas.height);
    const cover = await context.wait(canvasBlob(coverCanvas, 'image/webp', 0.88));
    // Re-encoding strips EXIF/location metadata and preserves a static image only.
    const jpg = await context.wait(canvasBlob(canvas, 'image/jpeg', 0.94));
    context.report(60, 'Creating a downloadable PDF');
    const { PDFDocument } = await context.wait(import('../vendor/pdf-lib/pdf-lib.min.mjs?v=c3b0a324dcbd'));
    const pdfDocument = await context.wait(PDFDocument.create());
    pdfDocument.setProducer('NorthStar Marketing Library');
    pdfDocument.setCreator('NorthStar Marketing Library');
    const embedded = await context.wait(pdfDocument.embedJpg(await context.wait(jpg.arrayBuffer())));
    const fit = Math.min(612 / canvas.width, 792 / canvas.height);
    const page = pdfDocument.addPage([canvas.width * fit, canvas.height * fit]);
    page.drawImage(embedded, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    const pdf = new Blob([await context.wait(pdfDocument.save())], { type: 'application/pdf' });
    return { pdf, cover, pages: 1, sourceTitle: '', searchText: '' };
  } finally {
    bitmap.close();
    if (canvas) canvas.width = canvas.height = 1;
    if (coverCanvas) coverCanvas.width = coverCanvas.height = 1;
  }
}

/**
 * @param {File} file PDF, PNG, JPEG, or static WebP (actual file signature checked).
 * @param {{onProgress?: (progress: {percent: number, message: string}) => void, signal?: AbortSignal}} options
 * @returns {Promise<{pdf: Blob, cover: Blob, pages: number, bytes: number, sha256: string, title: string, description: string, keywords: string, searchText: string, originalName: string}>}
 */
export async function processMaterial(file, { onProgress, signal } = {}) {
  const context = progressContext(onProgress, signal);
  try {
    context.check();
    if (!(file instanceof Blob) || !file.size) throw new Error('Choose a non-empty PDF or image file.');
    if (file.size > limits.maxBytes) throw new Error('This file exceeds the 15 MB upload limit. Export a smaller file and try again.');
    context.report(2, 'Checking the file');
    const bytes = new Uint8Array(await context.wait(file.arrayBuffer()));
    const kind = identify(bytes);
    const prepared = kind.type === 'application/pdf' ? await preparePdf(bytes, context) : await prepareImage(bytes, kind, context);
    if (prepared.pdf.size > limits.maxBytes) throw new Error('The prepared PDF exceeds 15 MB. Try a smaller source image.');
    context.report(92, 'Finishing the preview and search details');
    const hash = await context.wait(crypto.subtle.digest('SHA-256', await context.wait(prepared.pdf.arrayBuffer())));
    const sha256 = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
    const originalName = text((file.name || 'marketing-material').split(/[\\/]/).pop(), 255);
    const metadata = suggestions(originalName, prepared.sourceTitle, prepared.searchText);
    context.report(100, 'Ready to review');
    return { pdf: prepared.pdf, cover: prepared.cover, pages: prepared.pages, bytes: prepared.pdf.size, sha256, ...metadata, originalName };
  } finally {
    context.close();
  }
}
