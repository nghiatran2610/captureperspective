/**
 * Screenshot Capture Module
 * Handles screenshot creation, thumbnails, and saving
 */
const ScreenshotCapture = {
  // Store timeout ID so we can cancel it
  _waitTimeout: null,
  
  // Preset screen sizes
  presetSizes: {
    fullHD: { width: 1920, height: 1080, name: "Full HD (1920x1080)" },
    mobile: { width: 375, height: 812, name: "Mobile (iPhone X/11/12)" },
    tablet: { width: 768, height: 1024, name: "Tablet (iPad)" }
  },
  
  /**
   * Take a screenshot of a URL using iframe
   * @param {string} url - URL to capture
   * @param {string} preset - Size preset to use ('fullHD', 'mobile', or 'tablet')
   * @returns {Promise<Object>} - Promise resolving to screenshot data
   */
  takeScreenshot(url, preset = 'fullHD') {
    // Clear any existing timeout
    if (this._waitTimeout) {
      clearTimeout(this._waitTimeout);
      this._waitTimeout = null;
    }
    
    const startTime = performance.now();
    const iframe = UI.elements.iframe;
    
    // Get dimensions from preset
    const sizePreset = this.presetSizes[preset] || this.presetSizes.fullHD;
    const width = sizePreset.width;
    const height = sizePreset.height;
    
    // Set iframe size to chosen preset
    iframe.style.width = `${width}px`;
    iframe.style.height = `${height}px`;
    
    return new Promise((resolve, reject) => {
      // Define a clean-up function
      const cleanup = () => {
        if (this._waitTimeout) {
          clearTimeout(this._waitTimeout);
          this._waitTimeout = null;
        }
        iframe.src = 'about:blank';
      };
      
      // Handle iframe load
      const handleLoad = () => {
        try {
          // Remove the load handler to prevent multiple triggers
          iframe.removeEventListener('load', handleLoad);
          
          // Start countdown display
          this._startCountdown(url, () => {
            try {
              UI.updateProgressMessage(`Capturing ${sizePreset.name} screenshot for ${url}...`);
              
              // Simply capture the entire document without any style modifications
              html2canvas(iframe.contentDocument.documentElement, {
                allowTaint: true,
                backgroundColor: null,
                useCORS: true,
                width: width,
                height: height,
                windowWidth: width,
                windowHeight: height,
                scale: 1,
                logging: true
              }).then(canvas => {
                const screenshotData = canvas.toDataURL('image/png');
                
                // Create thumbnail
                this.createThumbnail(screenshotData).then(thumbnailData => {
                  const endTime = performance.now();
                  const timeTaken = ((endTime - startTime) / 1000).toFixed(2);
                  
                  console.log(`${sizePreset.name} screenshot taken for ${url} in ${timeTaken}s`);
                  
                  // Clean up and resolve
                  cleanup();
                  resolve({ 
                    screenshot: screenshotData, 
                    thumbnail: thumbnailData, 
                    timeTaken,
                    preset: preset,
                    width: width,
                    height: height
                  });
                });
              }).catch(error => {
                console.error('Error during html2canvas:', error);
                cleanup();
                reject(error);
              });
            } catch (error) {
              console.error('Error setting up screenshot capture:', error);
              cleanup();
              reject(error);
            }
          });
        } catch (error) {
          console.error('Error in iframe load handler:', error);
          cleanup();
          reject(error);
        }
      };
      
      // Add error handler
      const handleError = (event) => {
        console.error(`Failed to load ${url} in iframe`);
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('error', handleError);
        cleanup();
        reject(new Error(`Failed to load ${url} in iframe`));
      };
      
      // Add event listeners
      iframe.addEventListener('load', handleLoad);
      iframe.addEventListener('error', handleError);
      
      // Start loading the URL
      UI.updateProgressMessage(`Loading ${url} in iframe (${sizePreset.name})...`);
      iframe.src = url;
    });
  },
  
  /**
   * Start countdown and call the callback when complete
   * @param {string} url - URL being captured
   * @param {Function} callback - Function to call when countdown completes
   */
  _startCountdown(url, callback) {
    const maxWaitSeconds = parseInt(UI.elements.waitTime.value) || 33;
    let secondsLeft = maxWaitSeconds;
    
    // Update message initially
    UI.updateProgressMessage(`Waiting for ${url} to render... (${secondsLeft}s remaining)`);
    
    // Use a single timeout instead of a loop or interval
    const startWait = () => {
      if (secondsLeft <= 0) {
        // Countdown complete, execute callback
        callback();
        return;
      }
      
      // Update countdown
      UI.updateProgressMessage(`Waiting for ${url} to render... (${secondsLeft}s remaining)`);
      secondsLeft--;
      
      // Schedule next update
      this._waitTimeout = setTimeout(startWait, 1000);
    };
    
    // Start the process
    this._waitTimeout = setTimeout(startWait, 1000);
  },
  
  /**
   * Create a thumbnail from a screenshot
   * @param {string} screenshotData - Base64 screenshot data
   * @param {number} width - Thumbnail width
   * @param {number} height - Thumbnail height
   * @returns {Promise<string>} - Promise resolving to thumbnail data
   */
  createThumbnail(screenshotData, width = 50, height = 50) {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = screenshotData;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
    });
  },
  
  /**
   * Download screenshot as a file
   * @param {string} screenshotData - Base64 screenshot data
   * @param {string} filename - Filename to save as
   */
  downloadScreenshot(screenshotData, filename) {
    const link = document.createElement('a');
    link.href = screenshotData;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};