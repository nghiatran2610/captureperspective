// screenshot/core.js - Core screenshot functionality
import config from '../config.js';
import * as errorHandling from '../errors.js';
import * as events from '../events.js';
import * as actions from './actions.js';
import * as utils from './utils.js';

// Private variable for timeout ID
let _waitTimeout = null;

/**
 * Take a screenshot of a URL using iframe
 * @param {string} url - URL to capture
 * @param {string} preset - Size preset to use
 * @param {Array} actionsList - Optional array of actions to perform before capturing
 * @returns {Promise<Object>} - Promise resolving to screenshot data
 */
export async function takeScreenshot(url, preset = 'fullHD', actionsList = []) {
  // Clear any existing timeout
  if (_waitTimeout) {
    clearTimeout(_waitTimeout);
    _waitTimeout = null;
  }
  
  const startTime = performance.now();
  const iframe = document.getElementById('screenshotIframe');
  
  // Get dimensions from preset
  const sizePreset = config.screenshot.presets[preset] || config.screenshot.presets.fullHD;
  const width = sizePreset.width;
  const height = sizePreset.height;
  
  // Set iframe size to chosen preset
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  
  try {
    // Emit event
    events.emit(events.events.CAPTURE_STARTED, { url, preset });
    
    // Load URL in iframe
    await loadUrlInIframe(iframe, url);
    
    // Wait for rendering
    await waitForRendering(url);
    
    // Perform actions if provided
    if (actionsList && actionsList.length > 0) {
      await actions.performActions(iframe.contentDocument, actionsList);
    }
    
    // Take the actual screenshot
    const { screenshotData, actualHeight } = await captureScreenshot(iframe, preset, width, height);
    
    // Create thumbnail
    const thumbnailData = await utils.createThumbnail(
      screenshotData, 
      config.screenshot.thumbnailSize.width, 
      config.screenshot.thumbnailSize.height
    );
    
    const endTime = performance.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);
    
    // Create result object
    const result = { 
      screenshot: screenshotData, 
      thumbnail: thumbnailData, 
      timeTaken,
      preset: preset,
      width: width,
      height: preset === 'fullPage' ? actualHeight : height
    };
    
    // Clean up
    iframe.src = 'about:blank';
    
    // Emit event
    events.emit(events.events.SCREENSHOT_TAKEN, { url, result });
    
    return result;
  } catch (error) {
    // Clean up
    iframe.src = 'about:blank';
    
    // Create a proper error object
    const captureError = new errorHandling.ScreenshotError(
      `Failed to capture screenshot for ${url}: ${error.message}`,
      url,
      error.message
    );
    
    // Emit event
    events.emit(events.events.CAPTURE_FAILED, { url, error: captureError });
    
    // Propagate the error
    throw captureError;
  }
}

/**
 * Load a URL in an iframe
 * @param {HTMLIFrameElement} iframe - The iframe element
 * @param {string} url - URL to load
 * @returns {Promise<void>} - Resolves when URL is loaded
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
 * Wait for page rendering to complete
 * @param {string} url - URL being captured
 * @returns {Promise<void>} - Resolves when rendering is complete
 */
function waitForRendering(url) {
  return new Promise((resolve) => {
    const waitTimeInSeconds = parseInt(document.getElementById('waitTime').value) || 10;
    let secondsLeft = waitTimeInSeconds;
    
    // Update message initially
    events.emit(events.events.CAPTURE_PROGRESS, {
      message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`
    });
    
    const startWait = () => {
      if (secondsLeft <= 0) {
        // Countdown complete
        resolve();
        return;
      }
      
      // Update countdown
      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`
      });
      
      secondsLeft--;
      
      // Schedule next update
      _waitTimeout = setTimeout(startWait, 1000);
    };
    
    // Start the process
    _waitTimeout = setTimeout(startWait, 1000);
  });
}

/**
 * Capture a screenshot using html2canvas
 * @param {HTMLIFrameElement} iframe - The iframe
 * @param {string} preset - Size preset
 * @param {number} width - Capture width
 * @param {number} height - Capture height
 * @returns {Promise<Object>} - Promise resolving to screenshot data
 */
async function captureScreenshot(iframe, preset, width, height) {
  // Get document to capture
  const doc = iframe.contentDocument;
  const docElement = doc.documentElement;
  
  events.emit(events.events.CAPTURE_PROGRESS, {
    message: `Capturing screenshot (${width}x${height})...`
  });
  
  let actualHeight = height;
  let options = { ...config.screenshot.html2canvasOptions };
  
  // Handle full page preset differently
  if (preset === 'fullPage') {
    const docBody = doc.body;
    
    // Measure the full page height
    actualHeight = Math.max(
      docElement.scrollHeight || 0,
      docBody ? docBody.scrollHeight : 0
    );
    
    // Use html2canvas with full page height
    options = {
      ...options,
      width: width,
      height: actualHeight,
      windowWidth: width,
      windowHeight: actualHeight,
      onclone: function(clonedDoc) {
        // Make sure the content is fully visible in the clone
        const style = clonedDoc.createElement('style');
        style.textContent = `
          body, html { height: auto !important; overflow: visible !important; }
          div, section, article, main { overflow: visible !important; }
        `;
        clonedDoc.head.appendChild(style);
      }
    };
  } else {
    // For fixed-size presets
    options = {
      ...options,
      width: width,
      height: height,
      windowWidth: width,
      windowHeight: height
    };
  }
  
  // Take the screenshot
  const canvas = await html2canvas(docElement, options);
  const screenshotData = canvas.toDataURL('image/png');
  
  return { screenshotData, actualHeight };
}

/**
 * Download screenshot as a file
 * @param {string} screenshotData - Base64 screenshot data
 * @param {string} filename - Filename to save as
 */
export function downloadScreenshot(screenshotData, filename) {
  const link = document.createElement('a');
  link.href = screenshotData;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Emit event
  events.emit(events.events.SCREENSHOT_SAVED, { filename });
}

/**
 * Take a series of screenshots after performing different actions
 * @param {string} url - Base URL to capture
 * @param {string} preset - Size preset to use
 * @param {Array} actionSequences - Array of action sequences
 * @returns {Promise<Array>} - Promise resolving to array of screenshot data
 */
export async function takeSequentialScreenshots(url, preset = 'fullHD', actionSequences = []) {
  const results = [];
  
  try {
    // For each sequence in the action sequences
    for (let i = 0; i < actionSequences.length; i++) {
      const sequence = actionSequences[i];
      const sequenceName = sequence.name || `Step ${i+1}`;
      
      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Starting sequence: ${sequenceName} (${i+1}/${actionSequences.length})`
      });
      
      // Take screenshot after performing the sequence actions
      const screenshotData = await takeScreenshot(url, preset, sequence.actions);
      
      // Add sequence info to the result
      results.push({
        ...screenshotData,
        sequenceName: sequenceName,
        sequenceIndex: i
      });
      
      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Completed sequence: ${sequenceName} (${i+1}/${actionSequences.length})`
      });
    }
    
    return results;
  } catch (error) {
    // Create and throw a proper error
    const sequentialError = new errorHandling.ScreenshotError(
      `Error in sequential screenshots for ${url}: ${error.message}`,
      url,
      error.message
    );
    
    throw sequentialError;
  }
}