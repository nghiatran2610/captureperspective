
import { elements } from './elements.js';
import { utils } from './utils.js';
import { modals } from './modals.js';

export const thumbnails = {
  /**
   * Create container for live thumbnails
   * @returns {HTMLElement} - The created container
   */
  createLiveThumbnailsContainer() {
    const container = document.createElement('div');
    container.id = 'liveThumbnails';
    container.className = 'live-thumbnails-container';
    
    const title = document.createElement('h3');
    title.textContent = 'Live Thumbnails';
    title.style.width = '100%';
    title.style.marginBottom = '10px';
    
    container.appendChild(title);
    
    // Add to output before any status messages
    elements.output.appendChild(container);
    
    // Keep a reference to the container
    elements.liveThumbnails = container;
    
    return container;
  },
  
  /**
   * Add a live thumbnail to the container
   * @param {Object} result - Screenshot result object
   * @param {string} fileName - Filename for the screenshot
   * @param {string} sequenceName - Optional name for action sequence
   * @param {boolean} isRetry - Whether this is a retry screenshot
   * @returns {HTMLElement} - The created thumbnail element
   */
  addLiveThumbnail(result, fileName, sequenceName = null, isRetry = false) {
    if (!elements.liveThumbnails) {
      this.createLiveThumbnailsContainer();
    }
    
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'thumbnail-container';
    
    // Add retry badge if needed
    if (isRetry) {
      const retryBadge = document.createElement('div');
      retryBadge.textContent = 'Retry';
      retryBadge.className = 'retry-badge';
      thumbnailContainer.appendChild(retryBadge);
    }
    
    // Thumbnail image
    const thumbImg = document.createElement('img');
    thumbImg.src = result.thumbnail;
    thumbImg.className = 'thumbnail-image';
    
    // Make thumbnail clickable to view full screenshot
    thumbImg.addEventListener('click', () => {
      modals.viewScreenshotFromImage(result.screenshot, fileName, result.width, result.height, result.timeTaken);
    });
    
    // File name label
    const nameLabel = document.createElement('div');
    nameLabel.textContent = utils.truncateText(fileName, 20);
    nameLabel.title = fileName;
    nameLabel.className = 'thumbnail-filename';
    
    // Add sequence name if provided
    if (sequenceName) {
      const seqLabel = document.createElement('div');
      seqLabel.textContent = utils.truncateText(sequenceName, 20);
      seqLabel.title = sequenceName;
      seqLabel.className = 'thumbnail-sequence-name';
      
      thumbnailContainer.appendChild(thumbImg);
      thumbnailContainer.appendChild(seqLabel);
      thumbnailContainer.appendChild(nameLabel);
    } else {
      thumbnailContainer.appendChild(thumbImg);
      thumbnailContainer.appendChild(nameLabel);
    }
    
    // Store filename in the data for zip creation
    thumbnailContainer.dataset.filename = fileName;
    thumbnailContainer.dataset.screenshot = result.screenshot;
    
    elements.liveThumbnails.appendChild(thumbnailContainer);
    
    return thumbnailContainer;
  }
};