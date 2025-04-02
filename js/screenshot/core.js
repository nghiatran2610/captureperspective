import config from '../config.js';
import * as errorHandling from '../errors.js';
import * as events from '../events.js';
import * as actions from './actions.js';
import * as utils from './utils.js';

// Private variable for timeout ID
let _waitTimeout = null;

/**
 * Capture a screenshot of a URL with optional actions.
 * For the "fullPage" preset, bypass the dummy config height by using a fixed width (e.g., 1920)
 * and dynamically calculating the actual content height by temporarily modifying styles.
 *
 * @param {string} url - The URL to capture.
 * @param {string} [preset='fullHD'] - The size preset to use.
 * @param {Array} [actionsList=[]] - Optional array of actions to perform before capturing.
 * @returns {Promise<Object>} - An object containing the screenshot, thumbnail, time taken, etc.
 */
export async function takeScreenshot(url, preset = 'fullHD', actionsList = []) {
  // Clear any existing timeout
  if (_waitTimeout) {
    clearTimeout(_waitTimeout);
    _waitTimeout = null;
  }

  const startTime = performance.now();
  const iframe = document.getElementById('screenshotIframe');

  let width, height;
  if (preset === 'fullPage') {
    // Use fixed width; dummy height will be recalculated later.
    width = 1920;
    height = 1080;
  } else {
    const sizePreset = config.screenshot.presets[preset] || config.screenshot.presets.fullHD;
    width = sizePreset.width;
    height = sizePreset.height;
  }

  // Set initial dimensions for the iframe.
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;

  try {
    events.emit(events.events.CAPTURE_STARTED, { url, preset });

    // Load the URL into the iframe and wait for it to render.
    await loadUrlInIframe(iframe, url);
    await waitForRendering(url);

    // Perform any action sequences (e.g., navigating to submenus)
    if (actionsList && actionsList.length > 0) {
      await actions.performActions(iframe.contentDocument, actionsList);
    }

    // Retrieve the current URL from the iframe after navigation.
    const currentUrl = iframe.contentWindow.location.href;

    // For fullPage, recalculate the actual height.
    let actualHeight = height;
    if (preset === 'fullPage') {
      const doc = iframe.contentDocument;
      const docElement = doc.documentElement;
      const docBody = doc.body;
      actualHeight = Math.max(
        docElement.scrollHeight || 0,
        docBody ? docBody.scrollHeight : 0
      );
      console.log('Calculated full page height:', actualHeight);
      // Update the iframe height so that all content is visible.
      iframe.style.height = `${actualHeight}px`;
    }

    // Capture the screenshot (with full-page style adjustments if needed)
    const { screenshotData, actualHeight: finalHeight } = await captureScreenshot(
      iframe,
      currentUrl,
      preset,
      width,
      actualHeight
    );

    // Create a thumbnail for display.
    const thumbnailData = await utils.createThumbnail(
      screenshotData,
      config.screenshot.thumbnailSize.width,
      config.screenshot.thumbnailSize.height
    );

    const endTime = performance.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

    const result = {
      screenshot: screenshotData,
      thumbnail: thumbnailData,
      timeTaken,
      preset,
      width,
      height: preset === 'fullPage' ? finalHeight : height,
    };

    // Clean up by resetting the iframe and emit the completion event.
    iframe.src = 'about:blank';
    events.emit(events.events.SCREENSHOT_TAKEN, { url: currentUrl, result });

    return result;
  } catch (error) {
    // On error, reset the iframe and propagate the error.
    iframe.src = 'about:blank';
    const captureError = new errorHandling.ScreenshotError(
      `Failed to capture screenshot for ${url}: ${error.message}`,
      url,
      error.message
    );
    events.emit(events.events.CAPTURE_FAILED, { url, error: captureError });
    throw captureError;
  }
}

/**
 * Load a URL into the iframe.
 *
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @param {string} url - The URL to load.
 * @returns {Promise<void>} - Resolves when the URL is loaded.
 */
function loadUrlInIframe(iframe, url) {
  return new Promise((resolve, reject) => {
    const handleLoad = () => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
      resolve();
    };

    const handleError = () => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
      reject(new Error(`Failed to load ${url} in iframe`));
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);
    iframe.src = url;
  });
}

/**
 * Wait for the page to render.
 *
 * @param {string} url - The URL being captured.
 * @returns {Promise<void>} - Resolves when the rendering wait time is complete.
 */
function waitForRendering(url) {
  return new Promise((resolve) => {
    const waitTimeInSeconds = parseInt(document.getElementById('waitTime').value) || 10;
    let secondsLeft = waitTimeInSeconds;

    events.emit(events.events.CAPTURE_PROGRESS, {
      message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`
    });

    const countdown = () => {
      if (secondsLeft <= 0) {
        resolve();
        return;
      }
      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`
      });
      secondsLeft--;
      _waitTimeout = setTimeout(countdown, 1000);
    };
    _waitTimeout = setTimeout(countdown, 1000);
  });
}

/**
 * Capture a screenshot using html2canvas and overlay the URL.
 * When "fullPage" is selected, temporarily modify the target element’s style
 * to force full height and visible overflow before capturing.
 *
 * @param {HTMLIFrameElement} iframe - The iframe containing the page.
 * @param {string} url - The URL to overlay on the screenshot.
 * @param {string} preset - The size preset.
 * @param {number} width - The capture width.
 * @param {number} height - The capture height (may be recalculated).
 * @returns {Promise<Object>} - An object containing the screenshot data and the actual height.
 */
async function captureScreenshot(iframe, url, preset, width, height) {
  const doc = iframe.contentDocument;
  // Choose the target element for capture.
  // You may adjust this if you want a specific container.
  let targetElement = doc.body;
  if (!targetElement) {
    targetElement = doc.documentElement;
  }

  events.emit(events.events.CAPTURE_PROGRESS, {
    message: `Capturing screenshot (${width}x${height})...`
  });

  let originalOverflow, originalHeight;
  // For fullPage, temporarily modify styles so the full content is visible.
  if (preset === 'fullPage') {
    originalOverflow = targetElement.style.overflow;
    originalHeight = targetElement.style.height;
    targetElement.style.overflow = 'visible';
    targetElement.style.height = 'auto';
  }

  // Define html2canvas options.
  let options = { ...config.screenshot.html2canvasOptions };
  if (preset === 'fullPage') {
    // Use the target element's bounding rectangle for dimensions.
    const rect = targetElement.getBoundingClientRect();
    options = {
      ...options,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      windowWidth: rect.width,
      windowHeight: rect.height,
      scrollX: 0,
      scrollY: 0
    };
  } else {
    options = {
      ...options,
      width: width,
      height: height,
      windowWidth: width,
      windowHeight: height
    };
  }

  // Generate the canvas using html2canvas on the target element.
  const canvas = await html2canvas(targetElement, options);

  // Restore the original styles if modified.
  if (preset === 'fullPage') {
    targetElement.style.overflow = originalOverflow;
    targetElement.style.height = originalHeight;
  }

  // Overlay the URL onto the canvas.
  const ctx = canvas.getContext('2d');
  const overlayHeight = 30;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);
  ctx.font = '16px Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(url, 10, canvas.height - overlayHeight / 2);

  const screenshotData = canvas.toDataURL('image/png');
  return { screenshotData, actualHeight: canvas.height };
}

/**
 * Download the screenshot as a file.
 *
 * @param {string} screenshotData - The Base64 screenshot data.
 * @param {string} filename - The filename to save the screenshot as.
 */
export function downloadScreenshot(screenshotData, filename) {
  const link = document.createElement('a');
  link.href = screenshotData;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  events.emit(events.events.SCREENSHOT_SAVED, { filename });
}

/**
 * Take sequential screenshots by executing different action sequences.
 *
 * @param {string} url - The base URL to capture.
 * @param {string} [preset='fullHD'] - The size preset to use.
 * @param {Array} [actionSequences=[]] - An array of action sequences.
 * @returns {Promise<Array>} - An array of screenshot results.
 */
export async function takeSequentialScreenshots(url, preset = 'fullHD', actionSequences = []) {
  const results = [];
  try {
    for (let i = 0; i < actionSequences.length; i++) {
      const sequence = actionSequences[i];
      const sequenceName = sequence.name || `Step ${i + 1}`;
      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Starting sequence: ${sequenceName} (${i + 1}/${actionSequences.length})`
      });
      const screenshotData = await takeScreenshot(url, preset, sequence.actions);
      results.push({
        ...screenshotData,
        sequenceName: sequenceName,
        sequenceIndex: i
      });
      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Completed sequence: ${sequenceName} (${i + 1}/${actionSequences.length})`
      });
    }
    return results;
  } catch (error) {
    const sequentialError = new errorHandling.ScreenshotError(
      `Error in sequential screenshots for ${url}: ${error.message}`,
      url,
      error.message
    );
    throw sequentialError;
  }
}
