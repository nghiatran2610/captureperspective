export const modals = {
  /**
     * Display a screenshot in a modal
     * @param {string} imageUrl - URL or data URI of the screenshot
     * @param {string} fileName - Name of the file
     * @param {number} width - Width of the image
     * @param {number} height - Height of the image
     * @param {string} timeTaken - Time taken to capture the screenshot
     * @param {string} pageUrl - URL of the page where screenshot was taken

     */
  viewScreenshotFromImage(
    imageUrl,
    fileName,
    width,
    height,
    timeTaken,
    pageUrl
  ) {
    const modal = document.createElement("div");
    modal.className = "modal";

    const modalContent = document.createElement("div");
    modalContent.className = "modal-content";

    const closeButton = document.createElement("button");
    closeButton.className = "close-button";
    closeButton.textContent = "✕";
    closeButton.onclick = () => document.body.removeChild(modal);

    const title = document.createElement("h3");
    title.textContent = `Screenshot: ${fileName} (${width}x${height}) (Time: ${timeTaken}s)`;

    // Add URL link section
    const urlContainer = document.createElement("div");
    urlContainer.className = "screenshot-url-container";

    const urlLabel = document.createElement("span");
    urlLabel.textContent = "Page URL: ";
    urlLabel.className = "screenshot-url-label";

    const urlLink = document.createElement("a");
    urlLink.href = pageUrl;
    urlLink.textContent = pageUrl;
    urlLink.target = "_blank"; // Open in new tab
    urlLink.className = "screenshot-url-link";
    urlLink.title = "Open page in new tab";

    urlContainer.appendChild(urlLabel);
    urlContainer.appendChild(urlLink);

    const img = document.createElement("img");
    img.src = imageUrl;
    img.style.maxWidth = "100%";

    modalContent.appendChild(closeButton);
    modalContent.appendChild(title);
    modalContent.appendChild(urlContainer);
    modalContent.appendChild(img);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  },
};
