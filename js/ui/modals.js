export const modals = {
    /**
     * Display a screenshot in a modal
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
    }
  };
  