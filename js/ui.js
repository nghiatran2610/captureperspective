/**
 * UI Module
 * Handles all UI-related operations and DOM manipulation
 */
const UI = {
  elements: {
    urlList: document.getElementById('urlList'),
    capturePreset: document.getElementById('capturePreset'),
    waitTime: document.getElementById('waitTime'),
    namingPattern: document.getElementById('namingPattern'),
    customText: document.getElementById('customText'),
    urlRegex: document.getElementById('urlRegex'),
    actionsField: document.getElementById('actionsField'),  // Added for action sequences
    toggleAdvanced: document.getElementById('toggleAdvanced'),
    advancedOptions: document.getElementById('advancedOptions'),
    captureBtn: document.getElementById('captureBtn'),
    retryFailedBtn: document.getElementById('retryFailedBtn'),
    progress: document.getElementById('progress'),
    progressBar: document.getElementById('progressBar'),
    output: document.getElementById('output'),
    iframe: document.getElementById('screenshotIframe'),
    totalCount: document.getElementById('totalCount'),
    processedCount: document.getElementById('processedCount'),
    failedCount: document.getElementById('failedCount'),
    totalTime: document.getElementById('totalTime'),
    liveThumbnails: null  // Will be created dynamically
  },
  
  /**
   * Update progress bar
   * @param {number} completed - Number of completed operations
   * @param {number} total - Total number of operations
   */
  updateProgress(completed, total) {
    this.elements.progressBar.style.width = `${(completed / total) * 100}%`;
  },
  
  /**
   * Update statistics display
   * @param {number} total - Total number of URLs
   * @param {number} processed - Number of successfully processed URLs
   * @param {number} failed - Number of failed URLs
   * @param {number} time - Total time taken in seconds
   */
  updateStats(total, processed, failed, time) {
    this.elements.totalCount.textContent = total;
    this.elements.processedCount.textContent = processed;
    this.elements.failedCount.textContent = failed;
    this.elements.totalTime.textContent = `${time}s`;
  },
  
  /**
   * Reset UI for a new capture session
   */
  resetUI() {
    this.elements.progress.innerHTML = '';
    this.elements.progressBar.style.width = '0%';
    this.elements.output.innerHTML = '';
    this.updateStats(0, 0, 0, 0);
    
    // Remove existing live thumbnails container if it exists
    if (this.elements.liveThumbnails) {
      this.elements.liveThumbnails.remove();
      this.elements.liveThumbnails = null;
    }
    
    // Remove download all button if it exists
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    if (downloadAllBtn) {
      downloadAllBtn.remove();
    }
  },
  
  /**
   * Create container for live thumbnails
   */
  createLiveThumbnailsContainer() {
    const container = document.createElement('div');
    container.id = 'liveThumbnails';
    container.className = 'live-thumbnails-container';
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '10px';
    container.style.margin = '15px 0';
    
    const title = document.createElement('h3');
    title.textContent = 'Live Thumbnails';
    title.style.width = '100%';
    title.style.marginBottom = '10px';
    
    container.appendChild(title);
    
    // Add to output before any status messages
    this.elements.output.appendChild(container);
    
    // Keep a reference to the container
    this.elements.liveThumbnails = container;
  },
  
  /**
   * Add a live thumbnail to the container
   * @param {Object} result - Screenshot result object
   * @param {string} fileName - Filename for the screenshot
   * @param {string} sequenceName - Optional name for action sequence
   * @param {boolean} isRetry - Whether this is a retry screenshot
   */
  addLiveThumbnail(result, fileName, sequenceName = null, isRetry = false) {
    if (!this.elements.liveThumbnails) {
      this.createLiveThumbnailsContainer();
    }
    
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'thumbnail-container';
    thumbnailContainer.style.display = 'flex';
    thumbnailContainer.style.flexDirection = 'column';
    thumbnailContainer.style.alignItems = 'center';
    thumbnailContainer.style.width = '150px';
    thumbnailContainer.style.backgroundColor = '#f9f9f9';
    thumbnailContainer.style.padding = '8px';
    thumbnailContainer.style.borderRadius = '5px';
    thumbnailContainer.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    thumbnailContainer.style.position = 'relative';
    
    // Add retry badge if needed
    if (isRetry) {
      const retryBadge = document.createElement('div');
      retryBadge.textContent = 'Retry';
      retryBadge.style.position = 'absolute';
      retryBadge.style.top = '5px';
      retryBadge.style.right = '5px';
      retryBadge.style.backgroundColor = '#ff9800';
      retryBadge.style.color = 'white';
      retryBadge.style.padding = '2px 5px';
      retryBadge.style.borderRadius = '3px';
      retryBadge.style.fontSize = '10px';
      thumbnailContainer.appendChild(retryBadge);
    }
    
    // Thumbnail image
    const thumbImg = document.createElement('img');
    thumbImg.src = result.thumbnail;
    thumbImg.style.width = '120px';
    thumbImg.style.height = '90px';
    thumbImg.style.objectFit = 'cover';
    thumbImg.style.border = '1px solid #ddd';
    thumbImg.style.marginBottom = '5px';
    thumbImg.style.cursor = 'pointer';
    
    // Make thumbnail clickable to view full screenshot
    thumbImg.addEventListener('click', () => {
      this.viewScreenshotFromImage(result.screenshot, fileName, result.width, result.height, result.timeTaken);
    });
    
    // File name label
    const nameLabel = document.createElement('div');
    nameLabel.textContent = this.truncateText(fileName, 20);
    nameLabel.title = fileName;
    nameLabel.style.fontSize = '12px';
    nameLabel.style.textAlign = 'center';
    nameLabel.style.overflow = 'hidden';
    nameLabel.style.textOverflow = 'ellipsis';
    nameLabel.style.whiteSpace = 'nowrap';
    nameLabel.style.width = '100%';
    
    // Sequence name if provided
    if (sequenceName) {
      const seqLabel = document.createElement('div');
      seqLabel.textContent = this.truncateText(sequenceName, 20);
      seqLabel.title = sequenceName;
      seqLabel.style.fontSize = '11px';
      seqLabel.style.color = '#666';
      seqLabel.style.textAlign = 'center';
      seqLabel.style.overflow = 'hidden';
      seqLabel.style.textOverflow = 'ellipsis';
      seqLabel.style.whiteSpace = 'nowrap';
      seqLabel.style.width = '100%';
      
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
    
    this.elements.liveThumbnails.appendChild(thumbnailContainer);
  },
  
  /**
   * Display a screenshot from an image URL
   * @param {string} imageUrl - URL or data URI of the screenshot
   * @param {string} fileName - Name of the file
   * @param {number} width - Width of the image
   * @param {number} height - Height of the image
   * @param {string} timeTaken - Time taken to capture the screenshot
   */
  viewScreenshotFromImage(imageUrl, fileName, width, height, timeTaken) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    const closeButton = document.createElement('button');
    closeButton.className = 'close-button';
    closeButton.textContent = '✕';
    closeButton.onclick = () => document.body.removeChild(modal);
    
    const title = document.createElement('h3');
    title.textContent = `Screenshot: ${fileName} (${width}x${height}) (Time: ${timeTaken}s)`;
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.maxWidth = '100%';
    
    modalContent.appendChild(closeButton);
    modalContent.appendChild(title);
    modalContent.appendChild(img);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  },
  
  /**
   * Truncate text with ellipsis if it's too long
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length before truncating
   * @returns {string} - Truncated text
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength - 3) + '...';
  },
  
  /**
   * Add download all button to download a zip with all screenshots
   */
  addDownloadAllButton() {
    // Check if we already have a button
    if (document.getElementById('downloadAllBtn')) {
      return;
    }
    
    // Create button container
    const btnContainer = document.createElement('div');
    btnContainer.className = 'download-all-container';
    btnContainer.style.margin = '20px 0';
    btnContainer.style.textAlign = 'center';
    
    // Create button
    const downloadAllBtn = document.createElement('button');
    downloadAllBtn.id = 'downloadAllBtn';
    downloadAllBtn.className = 'btn';
    downloadAllBtn.textContent = 'Download All Screenshots (ZIP)';
    downloadAllBtn.style.backgroundColor = '#27ae60';
    
    // Add click handler
    downloadAllBtn.addEventListener('click', () => {
      this.downloadAllScreenshots();
    });
    
    btnContainer.appendChild(downloadAllBtn);
    
    // Add to output
    if (this.elements.liveThumbnails) {
      this.elements.liveThumbnails.parentNode.insertBefore(btnContainer, this.elements.liveThumbnails.nextSibling);
    } else {
      this.elements.output.appendChild(btnContainer);
    }
  },
  
  /**
   * Download all screenshots as a zip file
   */
  downloadAllScreenshots() {
    if (typeof JSZip === 'undefined') {
      // Load JSZip dynamically if not present
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => this.createScreenshotsZip();
      document.head.appendChild(script);
    } else {
      this.createScreenshotsZip();
    }
  },
  
  /**
   * Create a zip file with all screenshots
   */
  createScreenshotsZip() {
    const downloadBtn = document.getElementById('downloadAllBtn');
    if (!downloadBtn) return;
    
    // Update button to show progress
    downloadBtn.textContent = 'Preparing ZIP file...';
    downloadBtn.disabled = true;
    
    // Create a new JSZip instance
    const zip = new JSZip();
    
    // Function to convert data URL to blob
    const dataURLtoBlob = (dataURL) => {
      const binary = atob(dataURL.split(',')[1]);
      const array = [];
      for (let i = 0; i < binary.length; i++) {
        array.push(binary.charCodeAt(i));
      }
      return new Blob([new Uint8Array(array)], { type: 'image/png' });
    };
    
    // Add all screenshots to the zip
    const thumbnailContainers = document.querySelectorAll('.thumbnail-container');
    thumbnailContainers.forEach(container => {
      const fileName = container.dataset.filename;
      const screenshot = container.dataset.screenshot;
      
      if (fileName && screenshot) {
        // Convert data URL to blob
        const blob = dataURLtoBlob(screenshot);
        
        // Add to zip
        zip.file(fileName, blob);
      }
    });
    
    // Generate the zip
    zip.generateAsync({ type: 'blob' }).then(content => {
      // Create a download link
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `Screenshots_${URLProcessor.getTimestamp()}.zip`;
      document.body.appendChild(link);
      
      // Trigger download
      link.click();
      document.body.removeChild(link);
      
      // Reset button
      downloadBtn.textContent = 'Download All Screenshots (ZIP)';
      downloadBtn.disabled = false;
    }).catch(error => {
      console.error('Error creating ZIP file:', error);
      downloadBtn.textContent = 'Error creating ZIP. Try again.';
      downloadBtn.disabled = false;
    });
  },
  
  /**
   * Show status message in the output area
   * @param {string} message - Message to display
   * @param {boolean} isError - Whether this is an error message
   */
  showStatus(message, isError = false) {
    const status = document.createElement('div');
    status.className = `status-message ${isError ? 'error' : 'success'}`;
    status.textContent = message;
    this.elements.output.appendChild(status);
  },
  
  /**
   * Update progress message
   * @param {string} message - Progress message to display
   */
  updateProgressMessage(message) {
    this.elements.progress.innerHTML = message;
  },
  
  /**
   * Create a button element
   * @param {string} text - Button text
   * @param {string} title - Button tooltip
   * @param {Function} onClick - Click event handler
   * @returns {HTMLButtonElement} - Created button
   */
  createButton(text, title, onClick) {
    const button = document.createElement('button');
    button.className = 'btn btn-small';
    button.textContent = text;
    button.title = title;
    button.onclick = onClick;
    return button;
  },
  
  /**
   * Render the list of URLs with screenshots
   */
  renderUrlList() {
    // Don't clear output anymore since we want to keep live thumbnails
    // this.elements.output.innerHTML = '';
    
    if (AppState.orderedUrls.length === 0) {
      this.showStatus('No URLs to display.', true);
      return;
    }
    
    const listContainer = document.createElement('div');
    listContainer.className = 'url-list-container';
    listContainer.style.marginTop = '20px';
    
    const listTitle = document.createElement('h3');
    listTitle.textContent = 'Processed URLs';
    listContainer.appendChild(listTitle);
    
    AppState.orderedUrls.forEach((url, index) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'url-item';
      
      // Thumbnail
      const thumbnailImg = document.createElement('img');
      thumbnailImg.className = 'thumbnail';
      const data = AppState.screenshots.get(url);
      thumbnailImg.src = data && data.thumbnail ? data.thumbnail : '';
      
      // URL text
      const urlText = document.createElement('div');
      urlText.className = 'url-text';
      urlText.textContent = url;
      
      // Controls
      const controlsDiv = document.createElement('div');
      
      const upButton = this.createButton('↑', 'Move Up', () => this.moveUrl(index, 'up'));
      upButton.disabled = index === 0;
      
      const downButton = this.createButton('↓', 'Move Down', () => this.moveUrl(index, 'down'));
      downButton.disabled = index === AppState.orderedUrls.length - 1;
      
      const viewButton = this.createButton('📸', 'View Screenshot', () => this.viewScreenshot(url));
      
      controlsDiv.appendChild(upButton);
      controlsDiv.appendChild(downButton);
      controlsDiv.appendChild(viewButton);
      
      // Assemble item
      itemDiv.appendChild(thumbnailImg);
      itemDiv.appendChild(urlText);
      itemDiv.appendChild(controlsDiv);
      listContainer.appendChild(itemDiv);
    });
    
    this.elements.output.appendChild(listContainer);
  },
  
  /**
   * Move a URL up or down in the ordered list
   * @param {number} index - Current index of the URL
   * @param {string} direction - Direction to move ('up' or 'down')
   */
  moveUrl(index, direction) {
    if (direction === 'up' && index > 0) {
      [AppState.orderedUrls[index - 1], AppState.orderedUrls[index]] = 
        [AppState.orderedUrls[index], AppState.orderedUrls[index - 1]];
    } else if (direction === 'down' && index < AppState.orderedUrls.length - 1) {
      [AppState.orderedUrls[index + 1], AppState.orderedUrls[index]] = 
      [AppState.orderedUrls[index], AppState.orderedUrls[index + 1]];
    }
    
    // Find and remove the url-list-container if it exists
    const existingList = document.querySelector('.url-list-container');
    if (existingList) {
      existingList.remove();
    }
    
    // Re-render the list
    this.renderUrlList();
  },
  
  /**
   * Show screenshot in a modal
   * @param {string} url - URL of the screenshot to display
   */
  viewScreenshot(url) {
    const data = AppState.screenshots.get(url);
    if (!data || !data.screenshot) {
      alert(`No screenshot available for ${url}`);
      return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    const closeButton = document.createElement('button');
    closeButton.className = 'close-button';
    closeButton.textContent = '✕';
    closeButton.onclick = () => document.body.removeChild(modal);
    
    const title = document.createElement('h3');
    if (data.preset && data.width && data.height) {
      title.textContent = `Screenshot of: ${url} (${ScreenshotCapture.presetSizes[data.preset].name} - ${data.width}x${data.height}) (Time: ${data.timeTaken}s)`;
    } else {
      title.textContent = `Screenshot of: ${url} (Time: ${data.timeTaken}s)`;
    }
    
    const img = document.createElement('img');
    img.src = data.screenshot;
    img.style.maxWidth = '100%';
    
    modalContent.appendChild(closeButton);
    modalContent.appendChild(title);
    modalContent.appendChild(img);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  }
};
