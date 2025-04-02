// screenshot/utils.js - Screenshot utility functions
import { ScreenshotError } from '../errors.js';

/**
 * Create a thumbnail from a screenshot
 * @param {string} screenshotData - Base64 screenshot data
 * @param {number} width - Thumbnail width
 * @param {number} height - Thumbnail height
 * @returns {Promise<string>} - Promise resolving to thumbnail data
 */
export function createThumbnail(screenshotData, width = 50, height = 50) {
  return new Promise((resolve, reject) => {
    if (!screenshotData) {
      reject(new ScreenshotError('No screenshot data provided for thumbnail creation', null, 'missing-data'));
      return;
    }
    
    try {
      const img = new Image();
      
      // Handle load event
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          // Draw the image at the right size
          ctx.drawImage(img, 0, 0, width, height);
          
          // Get the data URL
          const thumbnailData = canvas.toDataURL('image/png');
          resolve(thumbnailData);
        } catch (error) {
          reject(new ScreenshotError(`Error creating thumbnail: ${error.message}`, null, 'canvas-error'));
        }
      };
      
      // Handle error event
      img.onerror = () => {
        reject(new ScreenshotError('Failed to load image for thumbnail creation', null, 'image-load-error'));
      };
      
      // Set the source to the screenshot data
      img.src = screenshotData;
    } catch (error) {
      reject(new ScreenshotError(`Thumbnail creation failed: ${error.message}`, null, 'general-error'));
    }
  });
}

/**
 * Convert data URL to Blob
 * @param {string} dataURL - Data URL to convert
 * @returns {Blob} - Converted Blob
 */
export function dataURLtoBlob(dataURL) {
  // Split the data URL to get the content type and base64 data
  const parts = dataURL.split(';base64,');
  
  if (parts.length !== 2) {
    throw new ScreenshotError('Invalid data URL format', null, 'invalid-data-url');
  }
  
  const contentType = parts[0].split(':')[1];
  const byteString = atob(parts[1]);
  
  // Create an array buffer to store the binary data
  const arrayBuffer = new ArrayBuffer(byteString.length);
  
  // Create a view into the buffer
  const uintArray = new Uint8Array(arrayBuffer);
  
  // Set the bytes of the buffer to the correct values
  for (let i = 0; i < byteString.length; i++) {
    uintArray[i] = byteString.charCodeAt(i);
  }
  
  // Create a blob from the array buffer
  return new Blob([arrayBuffer], { type: contentType });
}

/**
 * Create an image element from a data URL
 * @param {string} dataURL - Data URL for the image
 * @returns {Promise<HTMLImageElement>} - Promise resolving to an image element
 */
export function createImageFromDataURL(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ScreenshotError('Failed to create image from data URL', null, 'image-creation-error'));
    
    img.src = dataURL;
  });
}

/**
 * Get dimensions of an image from data URL
 * @param {string} dataURL - Data URL of the image
 * @returns {Promise<Object>} - Promise resolving to {width, height}
 */
export function getImageDimensions(dataURL) {
  return createImageFromDataURL(dataURL)
    .then(img => ({
      width: img.naturalWidth,
      height: img.naturalHeight
    }));
}

/**
 * Compress an image to reduce file size
 * @param {string} dataURL - Data URL of the image
 * @param {number} quality - Quality (0-1)
 * @returns {Promise<string>} - Promise resolving to compressed data URL
 */
export function compressImage(dataURL, quality = 0.8) {
  return createImageFromDataURL(dataURL)
    .then(img => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      // Return compressed data URL
      return canvas.toDataURL('image/jpeg', quality);
    });
}

/**
 * Check if a data URL is valid
 * @param {string} dataURL - Data URL to check
 * @returns {boolean} - True if valid
 */
export function isValidDataURL(dataURL) {
  return typeof dataURL === 'string' && 
         dataURL.startsWith('data:') && 
         dataURL.includes(';base64,');
}

/**
 * Apply a watermark to an image
 * @param {string} dataURL - Data URL of the image
 * @param {string} watermarkText - Text to use as watermark
 * @returns {Promise<string>} - Promise resolving to watermarked image data URL
 */
export function applyWatermark(dataURL, watermarkText) {
  return createImageFromDataURL(dataURL)
    .then(img => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      const ctx = canvas.getContext('2d');
      
      // Draw the original image
      ctx.drawImage(img, 0, 0);
      
      // Set up watermark style
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = `${Math.floor(img.naturalHeight / 20)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Draw the watermark text
      ctx.fillText(
        watermarkText,
        img.naturalWidth / 2,
        img.naturalHeight / 2
      );
      
      // Return the watermarked image
      return canvas.toDataURL('image/png');
    });
}