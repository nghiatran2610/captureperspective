/**
 * UI Module
 * Handles all UI-related operations and DOM manipulation
 */
const UI = {
  elements: {
    urlList: document.getElementById('urlList'),
    screenshotWidth: document.getElementById('screenshotWidth'),
    screenshotHeight: document.getElementById('screenshotHeight'),
    waitTime: document.getElementById('waitTime'),
    namingPattern: document.getElementById('namingPattern'),
    customText: document.getElementById('customText'),
    urlRegex: document.getElementById('urlRegex'),
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
    totalTime: document.getElementById('totalTime')
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
    this.elements.output.innerHTML = '';
    
    if (AppState.orderedUrls.length === 0) {
      this.showStatus('No URLs to display.', true);
      return;
    }
    
    const listContainer = document.createElement('div');
    
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
    title.textContent = `Screenshot of: ${url} (Time Taken: ${data.timeTaken}s)`;
    
    const img = document.createElement('img');
    img.src = data.screenshot;
    
    modalContent.appendChild(closeButton);
    modalContent.appendChild(title);
    modalContent.appendChild(img);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  }
};