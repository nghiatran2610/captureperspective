// screenshot/core.js - Centralized screenshot capture functionality
import config from '../config.js';
import * as errorHandling from '../errors.js';
import * as events from '../events.js';
import * as actions from './actions.js';
import * as utils from './utils.js';

// Private variable for timeout ID
let _waitTimeout = null;

/**
 * Capture a screenshot of a URL with optional actions.
 * This version includes enhanced error detection.
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
  let mountErrorDetected = false;
  
  // Set up a MutationObserver to watch for mount errors in the DOM
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check each added node for error messages
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) { // Element node
            const text = node.textContent || '';
            if (text.includes('No view configured for center mount') || 
                text.includes('Mount definition should contain a property')) {
              mountErrorDetected = true;
              console.log('Mount error detected by observer:', text);
            }
            
            // Check children for error messages too
            const errorEls = node.querySelectorAll('.error-message, .warning-message, .error');
            for (const el of errorEls) {
              const elText = el.textContent || '';
              if (elText.includes('No view configured for center mount') || 
                  elText.includes('Mount definition should contain a property')) {
                mountErrorDetected = true;
                console.log('Mount error detected in child element:', elText);
              }
            }
          }
        }
      }
    }
  });

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

    // Start observing the iframe for changes
    observer.observe(iframe.contentDocument || iframe.contentWindow.document, {
      childList: true,
      subtree: true
    });

    // Load the URL into the iframe and wait for it to render.
    await loadUrlInIframe(iframe, url);
    
    // Wait a bit to ensure any mount errors are caught
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Check if a mount error was detected during loading
    if (mountErrorDetected) {
      observer.disconnect();
      throw new errorHandling.ScreenshotError(
        'Failed to capture screenshot: No view configured for center mount error detected',
        url,
        'Mount error detected during loading'
      );
    }
    
    const renderResult = await waitForRendering(url, iframe);
    
    // If rendering failed due to specific errors, abort screenshot capture
    if (!renderResult.success) {
      observer.disconnect();
      throw new errorHandling.ScreenshotError(
        `Failed to capture screenshot: ${renderResult.error}`,
        url,
        renderResult.error
      );
    }

    // Perform any action sequences (e.g., navigating to submenus)
    if (actionsList && actionsList.length > 0) {
      await actions.performActions(iframe.contentDocument, actionsList);
      
      // Check again for mount errors after actions
      if (mountErrorDetected) {
        observer.disconnect();
        throw new errorHandling.ScreenshotError(
          'Failed to capture screenshot: No view configured for center mount error detected after actions',
          url,
          'Mount error detected after actions'
        );
      }
    }

    // Stop observing now that we're past the error-prone part
    observer.disconnect();

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
    // Clean up observer
    observer.disconnect();
    
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
 * Also checks for specific errors like "No view configured for center mount"
 *
 * @param {string} url - The URL being captured.
 * @param {HTMLIFrameElement} iframe - The iframe containing the page.
 * @returns {Promise<{success: boolean, error: string|null}>} - Resolves when the rendering wait time is complete.
 */
function waitForRendering(url, iframe) {
  return new Promise((resolve) => {
    const waitTimeInSeconds = parseInt(document.getElementById('waitTime').value) || 10;
    let secondsLeft = waitTimeInSeconds;
    let consoleErrorFound = false;

    events.emit(events.events.CAPTURE_PROGRESS, {
      message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`
    });

    // Override console.warn and console.error to catch mount errors
    const originalWarn = console.warn;
    const originalError = console.error;
    
    console.warn = function(...args) {
      originalWarn.apply(console, args);
      
      // Check if this is a mount error
      const warningText = args.join(' ');
      if (warningText.includes('No view configured for center mount') || 
          warningText.includes('Mount definition should contain a property')) {
        consoleErrorFound = true;
        console.warn = originalWarn; // Restore original
        resolve({ success: false, error: 'No view configured for center mount error in console' });
      }
    };
    
    console.error = function(...args) {
      originalError.apply(console, args);
      
      // Check if this is a mount error
      const errorText = args.join(' ');
      if (errorText.includes('No view configured for center mount') || 
          errorText.includes('Mount definition should contain a property')) {
        consoleErrorFound = true;
        console.error = originalError; // Restore original
        resolve({ success: false, error: 'No view configured for center mount error in console' });
      }
    };

    // Function to check for specific error messages in the DOM
    const checkForErrors = () => {
      try {
        if (!iframe.contentDocument) return { found: false };
        
        // Check for "No view configured for center mount" warning
        const errorElements = iframe.contentDocument.querySelectorAll('.error-message, .warning-message, .error');
        for (const el of errorElements) {
          const text = el.textContent || '';
          if (text.includes('No view configured for center mount') || 
              text.includes('Mount definition should contain a property')) {
            return {
              found: true,
              message: 'No view configured for center mount error detected in DOM'
            };
          }
        }
        
        // Check for other common error indicators
        const notFoundElements = iframe.contentDocument.querySelectorAll(
          '.not-found, .error-page, [data-error="not-found"]'
        );
        if (notFoundElements.length > 0) {
          return {
            found: true,
            message: 'Page not found or error page detected'
          };
        }
        
        return { found: false };
      } catch (e) {
        console.warn('Error checking for page errors:', e);
        return { found: false };
      }
    };

    const countdown = () => {
      // Check for errors immediately
      const errorCheck = checkForErrors();
      if (errorCheck.found) {
        // Restore original console methods
        console.warn = originalWarn;
        console.error = originalError;
        resolve({ success: false, error: errorCheck.message });
        return;
      }
      
      // Check if countdown finished
      if (secondsLeft <= 0 || consoleErrorFound) {
        // Restore original console methods
        console.warn = originalWarn; 
        console.error = originalError;
        
        if (consoleErrorFound) {
          resolve({ success: false, error: 'No view configured for center mount error detected' });
        } else {
          resolve({ success: true, error: null });
        }
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
 * When "fullPage" is selected, temporarily modify the target element's style
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
      
      try {
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
      } catch (sequenceError) {
        // If this is a mount error, log it and continue with the next sequence
        if (sequenceError.message && (
          sequenceError.message.includes('No view configured for center mount') ||
          sequenceError.message.includes('Mount definition should contain a property')
        )) {
          console.warn(`Skipping sequence "${sequenceName}" due to mount error:`, sequenceError.message);
          events.emit(events.events.CAPTURE_PROGRESS, {
            message: `Skipped sequence: ${sequenceName} due to mount error (${i + 1}/${actionSequences.length})`
          });
          
          // Add placeholder result for UI consistency
          results.push({
            sequenceName: sequenceName + " (Error: No view configured)",
            sequenceIndex: i,
            error: true,
            errorMessage: sequenceError.message
          });
          
          continue; // Skip to next sequence
        }
        
        // For other errors, propagate them up
        throw sequenceError;
      }
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