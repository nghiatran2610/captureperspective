// ui/thumbnails.js
import { elements } from "./elements.js";
import { utils } from "./utils.js";
import { modals } from "./modals.js";
import urlFetcher from "../url-fetcher.js"; // << ADD THIS LINE

export const thumbnails = {
  /**
   * Create container for live thumbnails (initially hidden via CSS)
   * @returns {HTMLElement} - The created container
   */
  createLiveThumbnailsContainer() {
    // --- MODIFIED: Get output container reference ---
    const outputContainer = elements.output;
    if (!outputContainer) {
      console.error(
        "Cannot create thumbnails container: #output element not found."
      );
      return null;
    }
    // --- END MODIFICATION ---

    // Avoid creating multiple containers if already exists
    if (document.getElementById("liveThumbnails")) {
      elements.liveThumbnails = document.getElementById("liveThumbnails");
      elements.thumbnailsContent = document.getElementById("thumbnailsContent");
      return elements.liveThumbnails;
    }

    const container = document.createElement("div");
    container.id = "liveThumbnails";
    container.className = "live-thumbnails-container"; // CSS will hide this by default

    // Create header with more compact styling
    const headerSection = document.createElement("div");
    headerSection.className = "thumbnails-header";

    // Create content area that will hold the thumbnails
    const contentSection = document.createElement("div");
    contentSection.className = "thumbnails-content";
    contentSection.id = "thumbnailsContent";

    // Create footer for the PDF button (initially hidden)
    const footerSection = document.createElement("div");
    footerSection.className = "combine-all-pdf-container"; // CSS might hide this too initially

    const combinePdfBtn = document.createElement("button");
    combinePdfBtn.className = "btn combine-all-pdf-btn";
    combinePdfBtn.textContent = "Combine All Screenshots to PDF"; // Keep text for this one
    combinePdfBtn.disabled = true; // Start disabled

    // Fix the event listener to use a proper reference to the thumbnails object
    const self = this; // Store a reference to thumbnails
    combinePdfBtn.addEventListener("click", function () {
      // Get all categories
      const allCategories = document.querySelectorAll(".thumbnail-category");
      if (allCategories.length === 0) {
        utils.showStatus("No screenshots available", true);
        return;
      }
      // Use the stored reference to call the function
      self.generateAllCategoriesPDF(allCategories);
    });

    footerSection.appendChild(combinePdfBtn);

    // Assemble the container
    container.appendChild(headerSection);
    container.appendChild(contentSection);
    container.appendChild(footerSection);

    // --- MODIFIED: Append to output container ---
    outputContainer.appendChild(container);
    // --- END MODIFICATION ---

    // Keep references
    elements.liveThumbnails = container;
    elements.thumbnailsContent = contentSection;

    return container;
  },

  /**
   * Add a live thumbnail to the container, organized by category
   * @param {Object} result - Screenshot result object
   * @param {string} fileName - Filename for the screenshot
   * @param {string} sequenceName - Optional name for action sequence
   * @param {boolean} isRetry - Whether this is a retry screenshot
   * @param {boolean} isToolbarAction - Whether this is from a toolbar action
   * @returns {HTMLElement} - The created thumbnail element
   */
  addLiveThumbnail(
    result,
    fileName,
    sequenceName = null,
    isRetry = false,
    isToolbarAction = false
  ) {
    // --- MODIFIED: Ensure container exists and make it visible on first thumbnail ---
    let liveThumbnailsContainer =
      elements.liveThumbnails || document.getElementById("liveThumbnails");
    if (!liveThumbnailsContainer) {
      liveThumbnailsContainer = this.createLiveThumbnailsContainer();
      if (!liveThumbnailsContainer) return null; // Stop if container creation failed
    }

    // Check if the container is currently hidden (using computed style for reliability)
    const isHidden =
      window.getComputedStyle(liveThumbnailsContainer).display === "none";
    if (isHidden) {
      console.log(
        "First thumbnail added, making thumbnails container visible."
      );
      liveThumbnailsContainer.style.display = "flex"; // Or 'block', depending on your desired layout
    }
    // --- END MODIFICATION ---

    // Parse category info from fileName or sequenceName
    const { parentCategory, category } = this.parseCategoryFromFileName(
      sequenceName || fileName
    );

    // Get appropriate category container
    const categoryContainer = this.getCategoryContainer(
      category,
      parentCategory
    );
    if (!categoryContainer) return null; // Stop if category container failed
    const categoryContent =
      categoryContainer.querySelector(".category-content");

    // Create thumbnail container
    const thumbnailContainer = document.createElement("div");
    thumbnailContainer.className = "thumbnail-container";

    if (isToolbarAction) {
      thumbnailContainer.classList.add("toolbar-action");
    }

    if (result.error) {
      thumbnailContainer.classList.add("error-thumbnail");
    }

    // Add retry badge if needed
    if (isRetry) {
      const retryBadge = document.createElement("div");
      retryBadge.textContent = "Retry";
      retryBadge.className = "retry-badge";
      thumbnailContainer.appendChild(retryBadge);
    }

    // Add error badge if this is an error result
    if (result.error) {
      const errorBadge = document.createElement("div");
      errorBadge.textContent = "Error";
      errorBadge.className = "error-badge";
      thumbnailContainer.appendChild(errorBadge);
    }

    // Thumbnail image (or error placeholder)
    const thumbImg = document.createElement("img");

    if (result.error) {
      // Use a placeholder for error thumbnails
      thumbImg.src =
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="%23f8d7da"/><text x="60" y="45" font-family="Arial" font-size="12" fill="%23721c24" text-anchor="middle">Mount Error</text></svg>';
      thumbImg.className = "thumbnail-image error-image";
      thumbImg.title = result.errorMessage || "Error capturing screenshot"; // Add error message as tooltip
    } else {
      thumbImg.src = result.thumbnail;
      thumbImg.className = "thumbnail-image";

      // Make thumbnail clickable to view full screenshot
      thumbImg.addEventListener("click", () => {
        modals.viewScreenshotFromImage(
          result.screenshot,
          fileName,
          result.width,
          result.height,
          result.timeTaken,
          result.url || "N/A" // Pass the URL of the screenshot
        );
      });
    }

    // File name label
    const nameLabel = document.createElement("div");
    nameLabel.textContent = utils.truncateText(fileName, 20);
    nameLabel.title = fileName;
    nameLabel.className = "thumbnail-filename";

    // Add sequence name if provided
    if (sequenceName && sequenceName !== fileName) {
      // Only add if different from filename
      const seqLabel = document.createElement("div");
      seqLabel.textContent = utils.truncateText(sequenceName, 20);
      seqLabel.title = sequenceName;
      seqLabel.className = "thumbnail-sequence-name";

      thumbnailContainer.appendChild(thumbImg);
      thumbnailContainer.appendChild(seqLabel);
      thumbnailContainer.appendChild(nameLabel);
    } else {
      thumbnailContainer.appendChild(thumbImg);
      thumbnailContainer.appendChild(nameLabel);
    }

    // Add error message if applicable
    if (result.error && result.errorMessage) {
      const errorMsg = document.createElement("div");
      errorMsg.textContent = "No view configured";
      errorMsg.className = "thumbnail-error-message";
      errorMsg.title = result.errorMessage;
      thumbnailContainer.appendChild(errorMsg);
    }

    // Add download button only for non-error thumbnails
    if (!result.error && result.screenshot) {
      // Also check if screenshot data exists
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "thumbnail-download-btn";
      downloadBtn.title = "Download this screenshot";
      downloadBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg>';
      downloadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.downloadSingleScreenshot(result.screenshot, fileName);
      });

      thumbnailContainer.appendChild(downloadBtn);

      // Store filename and screenshot data in the container for zip/pdf creation
      thumbnailContainer.dataset.filename = fileName;
      thumbnailContainer.dataset.screenshot = result.screenshot;
    }

    categoryContent.appendChild(thumbnailContainer);

    // Update the count of thumbnails in this category
    const countElement = categoryContainer.querySelector(".thumbnail-count");
    if (countElement) {
      const newCount = categoryContent.querySelectorAll(
        ".thumbnail-container"
      ).length;
      countElement.textContent = `(${newCount})`;
    }

    // --- MODIFIED: Show and Enable Combine All PDF button ---
    const pdfContainer = liveThumbnailsContainer?.querySelector(
      ".combine-all-pdf-container"
    );
    if (pdfContainer) {
      pdfContainer.style.display = "flex"; // Ensure container is visible
      const pdfButton = pdfContainer.querySelector(".combine-all-pdf-btn");
      if (pdfButton) {
        pdfButton.disabled = false; // Enable the button
      }
    }
    // --- END MODIFICATION ---

    // Smart scroll: only scroll if the new thumbnail would be out of view
    const thumbnailRect = thumbnailContainer.getBoundingClientRect();
    const outputRect = liveThumbnailsContainer.getBoundingClientRect(); // Use container bounds

    // If the thumbnail is below the visible part of the output container
    if (thumbnailRect.bottom > outputRect.bottom) {
      // Scroll the container itself, not the window
      liveThumbnailsContainer.scrollTop +=
        thumbnailRect.bottom - outputRect.bottom + 20; // 20px padding
    } else if (thumbnailRect.top < outputRect.top) {
      // Scroll up if thumbnail is above the visible area
      liveThumbnailsContainer.scrollTop -=
        outputRect.top - thumbnailRect.top + 20;
    }

    return thumbnailContainer;
  },

  /**
   * Create or get a category container for organizing thumbnails
   * @param {string} categoryName - Name of the category (page name)
   * @param {string} parentName - Name of the parent category (e.g., module name)
   * @returns {HTMLElement | null} - The category container or null if creation fails
   */
  getCategoryContainer(categoryName, parentName = null) {
    // --- MODIFIED: Ensure main container exists first ---
    let liveThumbnailsContainer =
      elements.liveThumbnails || document.getElementById("liveThumbnails");
    if (!liveThumbnailsContainer) {
      liveThumbnailsContainer = this.createLiveThumbnailsContainer();
      if (!liveThumbnailsContainer) return null; // Stop if container creation failed
    }
    // --- END MODIFICATION ---

    const contentSection = document.getElementById("thumbnailsContent"); // Get content section dynamically
    if (!contentSection) {
      console.error("Cannot find thumbnailsContent section");
      return null;
    }

    const categoryId = `category-${
      parentName ? `${parentName}-` : ""
    }${categoryName}`
      .replace(/[^a-zA-Z0-9-_]/g, "-") // Allow underscore and hyphen
      .toLowerCase();
    let categoryContainer = document.getElementById(categoryId);

    if (!categoryContainer) {
      // Create a new category container
      categoryContainer = document.createElement("div");
      categoryContainer.id = categoryId;
      categoryContainer.className = "thumbnail-category";

      // Create header for the category
      const categoryHeader = document.createElement("div");
      categoryHeader.className = "category-header";

      // Add collapsible functionality
      categoryHeader.addEventListener("click", (e) => {
        // Prevent collapsing if the PDF button was clicked
        if (e.target.closest(".combine-pdf-btn")) return;

        const content = categoryContainer.querySelector(".category-content");
        const isCollapsed = content.style.display === "none";
        content.style.display = isCollapsed ? "flex" : "none";
        categoryHeader.classList.toggle("collapsed", !isCollapsed);
        // Update toggle icon
        const toggleIcon = categoryHeader.querySelector(".toggle-icon");
        if (toggleIcon) toggleIcon.innerHTML = isCollapsed ? "▼" : "►";
      });

      // --- Add Toggle Icon ---
      const toggleIcon = document.createElement("span");
      toggleIcon.className = "toggle-icon";
      toggleIcon.innerHTML = "▼"; // Default to expanded
      categoryHeader.appendChild(toggleIcon);
      // --- End Add ---

      const categoryTitle = document.createElement("h4");
      categoryTitle.textContent = parentName
        ? `${parentName} - ${categoryName}`
        : categoryName;
      categoryHeader.appendChild(categoryTitle);

      const thumbnailCount = document.createElement("span");
      thumbnailCount.className = "thumbnail-count";
      thumbnailCount.textContent = "(0)";
      categoryHeader.appendChild(thumbnailCount);

      // Create content container (for actual thumbnails)
      const categoryContent = document.createElement("div");
      categoryContent.className = "category-content";

      // Add PDF button for this category
      const combinePdfBtn = document.createElement("button");
      combinePdfBtn.className = "btn btn-small combine-pdf-btn";
      combinePdfBtn.textContent = "Combine to PDF"; // Keep text label

      // Fix the event listener using a reference to the thumbnails object
      const self = this;
      combinePdfBtn.addEventListener("click", function (e) {
        e.stopPropagation(); // Prevent header click when clicking button
        // Use the stored reference to call the method
        self.generatePDF(categoryContainer);
      });

      categoryHeader.appendChild(combinePdfBtn); // Add button to header
      categoryContainer.appendChild(categoryHeader);
      categoryContainer.appendChild(categoryContent);

      contentSection.appendChild(categoryContainer);
    }

    return categoryContainer;
  },

  // --- parseCategoryFromFileName remains the same ---
  parseCategoryFromFileName(fileName) {
    // Default to 'Other' if no pattern matches
    let parentCategory = "Other";
    let category = "General";

    if (!fileName) return { parentCategory, category };

    // Try to extract module and page from the filename
    // Pattern like: Parent - Child - Details_timestamp.png OR Parent - Child_timestamp.png
    const parts = fileName.split("_")[0].split(" - "); // Split before timestamp, then by ' - '

    if (parts.length >= 2) {
      parentCategory = parts[0].trim();
      category = parts[1].trim();
      // Ignore further parts like button names for categorization
    } else if (parts.length === 1 && parts[0]) {
      parentCategory = parts[0].trim();
      category = "Main"; // Assign a default child category if only one part
    }

    // Handle cases where splitting might result in empty strings
    if (!parentCategory) parentCategory = "Other";
    if (!category) category = "General";

    return { parentCategory, category };
  },

  // --- addCombineAllToPDFButton is redundant, combine button is created in createLiveThumbnailsContainer ---
  // addCombineAllToPDFButton() { ... }

  // --- downloadSingleScreenshot remains the same ---
  downloadSingleScreenshot(screenshotData, fileName) {
    const link = document.createElement("a");
    link.href = screenshotData;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Show status message
    utils.showStatus(`Downloaded: ${fileName}`, false, 3000); // Auto-hide success message
  },

  // --- optimizeImageForPDF remains the same ---
  optimizeImageForPDF(dataURL) {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();

        img.onload = () => {
          try {
            // Check if we have valid dimensions
            if (
              !img.width ||
              !img.height ||
              isNaN(img.width) ||
              isNaN(img.height)
            ) {
              console.warn("Invalid image dimensions:", img.width, img.height);
              resolve(dataURL); // Return original on invalid dimensions
              return;
            }

            // Determine target size based on original dimensions
            let targetWidth = img.width;
            let targetHeight = img.height;

            // Maximum dimensions - increased for better quality
            const MAX_DIMENSION = 1800;

            if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
              if (targetWidth > targetHeight) {
                const ratio = targetHeight / targetWidth;
                targetWidth = MAX_DIMENSION;
                targetHeight = Math.round(MAX_DIMENSION * ratio);
              } else {
                const ratio = targetWidth / targetHeight;
                targetHeight = MAX_DIMENSION;
                targetWidth = Math.round(MAX_DIMENSION * ratio);
              }
            }

            // Ensure dimensions are integers and valid
            targetWidth = Math.max(1, Math.round(targetWidth));
            targetHeight = Math.max(1, Math.round(targetHeight));

            // Create canvas for resizing
            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            // Draw image with high-quality settings
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.fillStyle = "#FFFFFF"; // Fill with white background
            ctx.fillRect(0, 0, targetWidth, targetHeight); // Ensure canvas is not transparent
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            // Higher quality compression - use PNG for small images and high-quality JPEG for larger ones
            let optimizedData;

            if (targetWidth * targetHeight < 250000) {
              // For smaller images, use PNG for better quality
              optimizedData = canvas.toDataURL("image/png");
            } else {
              // For larger images, use high-quality JPEG
              // Increased quality from 0.6/0.75 to 0.85/0.92
              const quality = targetWidth > 1000 ? 0.85 : 0.92;
              optimizedData = canvas.toDataURL("image/jpeg", quality);
            }

            // Clean up to free memory
            canvas.width = 1;
            canvas.height = 1;

            resolve(optimizedData);
          } catch (err) {
            console.warn("Error during image optimization:", err);
            // Return original on error
            resolve(dataURL);
          }
        };

        img.onerror = () => {
          console.warn("Failed to load image for optimization");
          resolve(dataURL); // Return original on error
        };

        img.src = dataURL;
      } catch (err) {
        console.warn("Exception in optimization:", err);
        resolve(dataURL); // Return original on error
      }
    });
  },

  // --- getValidImageDimensions remains the same ---
  getValidImageDimensions(img) {
    let width = img.width || img.naturalWidth;
    let height = img.height || img.naturalHeight;

    // Ensure dimensions are valid
    if (!width || !height || isNaN(width) || isNaN(height)) {
      // Default to a small, valid size if dimensions are invalid
      console.warn("Invalid image dimensions, using defaults");
      width = 100;
      height = 100;
    }

    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  },

  // --- generatePDF remains the same ---
  generatePDF(categoryContainer) {
    // Get category name for PDF title
    const categoryTitleElement = categoryContainer.querySelector(
      ".category-header h4"
    );
    const categoryTitle = categoryTitleElement
      ? categoryTitleElement.textContent
      : "Screenshots"; // Fallback title

    const thumbnailContainers = categoryContainer.querySelectorAll(
      ".category-content .thumbnail-container"
    );

    if (thumbnailContainers.length === 0) {
      utils.showStatus("No screenshots found in this category", true);
      return;
    }

    // Filter out error thumbnails for PDF generation
    const validThumbnails = Array.from(thumbnailContainers).filter(
      (container) =>
        !container.classList.contains("error-thumbnail") &&
        container.dataset.screenshot
    );

    if (validThumbnails.length === 0) {
      utils.showStatus(
        "No valid screenshots to generate PDF in this category",
        true
      );
      return;
    }

    // Show status message
    utils.showStatus(`Generating PDF for ${categoryTitle}...`, false, 0); // Keep message visible

    // Create new jsPDF instance with better quality settings
    const pdf = new jspdf.jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true,
      precision: 4, // Higher precision for better quality
      putOnlyUsedFonts: true,
    });

    // Add title to first page
    pdf.setFontSize(18); // Slightly smaller title
    pdf.text(categoryTitle, 20, 20);
    pdf.setFontSize(10); // Smaller subtitle
    pdf.text(`Generated on ${new Date().toLocaleString()}`, 20, 28);
    pdf.setLineWidth(0.2);
    pdf.line(20, 32, pdf.internal.pageSize.width - 20, 32); // Line below subtitle

    // Define page dimensions
    const leftMargin = 15;
    const rightMargin = 15;
    const topMargin = 40; // Increased top margin for title/header
    const bottomMargin = 20;
    const pageWidth = pdf.internal.pageSize.width - leftMargin - rightMargin;
    const pageHeight = pdf.internal.pageSize.height - topMargin - bottomMargin;

    // Process each screenshot one at a time to avoid memory issues
    let currentIndex = 0;
    let pageCount = 1;

    // Start processing
    const self = this; // Reference to thumbnails object
    processNextScreenshot();

    function processNextScreenshot() {
      if (currentIndex >= validThumbnails.length) {
        // All screenshots processed, save the PDF
        try {
          const sanitizedTitle = categoryTitle.replace(/[^a-zA-Z0-9]/g, "_");
          pdf.save(
            `${sanitizedTitle}_${new Date().toISOString().slice(0, 10)}.pdf`
          );
          utils.showStatus(
            `PDF generated for ${categoryTitle} with ${pageCount} pages`,
            false,
            5000
          );
        } catch (error) {
          console.error("Error saving PDF:", error);
          utils.showStatus("Error saving PDF", true);
        } finally {
          // Hide the "Generating..." message
          utils.showStatus("", false, 1); // Show empty message with short delay to clear
        }
        return;
      }

      const container = validThumbnails[currentIndex];
      const screenshotData = container.dataset.screenshot;
      const filename = container.dataset.filename || `Page ${currentIndex + 1}`; // Fallback filename

      if (!screenshotData) {
        // Skip this one and move to next (shouldn't happen due to filtering, but good practice)
        currentIndex++;
        processNextScreenshot();
        return;
      }

      // Add a new page for each screenshot *after* the first one
      if (currentIndex > 0) {
        pdf.addPage();
        pageCount++;
      }

      // Optimize the image first
      self
        .optimizeImageForPDF(screenshotData)
        .then((optimizedData) => {
          // Create an image element to get dimensions
          const img = new Image();
          img.onload = () => {
            try {
              // Get valid image dimensions
              const imgDimensions = self.getValidImageDimensions(img);

              // Calculate dimensions to fit on page while maintaining aspect ratio
              let imgWidthOnPage, imgHeightOnPage;
              const imgRatio = imgDimensions.width / imgDimensions.height;
              const pageRatio = pageWidth / pageHeight;

              if (imgRatio > pageRatio) {
                // Image is wider than page area relative to height
                imgWidthOnPage = pageWidth;
                imgHeightOnPage = pageWidth / imgRatio;
              } else {
                // Image is taller than page area relative to width
                imgHeightOnPage = pageHeight;
                imgWidthOnPage = pageHeight * imgRatio;
              }

              // Ensure dimensions are valid numbers and > 0
              imgWidthOnPage = Math.max(1, Math.round(imgWidthOnPage));
              imgHeightOnPage = Math.max(1, Math.round(imgHeightOnPage));

              if (
                isNaN(imgWidthOnPage) ||
                isNaN(imgHeightOnPage) ||
                imgWidthOnPage <= 0 ||
                imgHeightOnPage <= 0
              ) {
                console.error(
                  "Invalid calculated image dimensions for PDF:",
                  imgWidthOnPage,
                  imgHeightOnPage
                );
                currentIndex++;
                setTimeout(processNextScreenshot, 10); // Process next even on error
                return;
              }

              // Calculate position to center the image (optional, default is top-left placement)
              const xPos = leftMargin; // + (pageWidth - imgWidthOnPage) / 2; // Center horizontally
              const yPos = topMargin; // Place image starting at top margin

              // Add the image to the PDF
              pdf.addImage(
                optimizedData,
                optimizedData.includes("data:image/png") ? "PNG" : "JPEG",
                xPos,
                yPos,
                imgWidthOnPage,
                imgHeightOnPage,
                null, // alias
                "FAST" // compression FAST is usually good enough visually and faster
              );

              // Add caption below the image
              pdf.setFontSize(8); // Smaller font for caption
              const captionY = yPos + imgHeightOnPage + 5; // Position caption below image

              // Truncate filename if too long
              const truncatedFilename =
                filename.length > 120
                  ? filename.substring(0, 117) + "..."
                  : filename;

              pdf.text(truncatedFilename, leftMargin, captionY, {
                maxWidth: pageWidth,
              }); // Add max width

              // Process next screenshot
              currentIndex++;
              // Small delay to allow UI updates
              setTimeout(processNextScreenshot, 10);
            } catch (error) {
              console.error("Error adding image to PDF:", error);
              // Continue with next screenshot
              currentIndex++;
              processNextScreenshot();
            }
          };

          img.onerror = () => {
            console.error("Failed to load optimized image for PDF");
            currentIndex++;
            processNextScreenshot();
          };

          img.src = optimizedData; // Start loading the optimized image
        })
        .catch((error) => {
          console.error("Error optimizing image:", error);
          currentIndex++;
          processNextScreenshot(); // Continue even if optimization fails
        });
    }
  },

  generateAllCategoriesPDF(categoryContainers) {
    utils.showStatus(
      "Generating comprehensive PDF with all screenshots...",
      false,
      0
    ); // Keep message visible

    try {
      const pdf = new jspdf.jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
        precision: 4, // Higher precision can sometimes help rendering
        putOnlyUsedFonts: true,
      });

      // --- Get the Project URL ---
      const projectUrl =
        urlFetcher.baseClientUrl || "Project URL not available";
      const generatedDateString = `Generated on ${new Date().toLocaleString()}`;

      // --- Define Page Margins & Width ---
      const leftMargin = 15;
      const rightMargin = 15;
      const pageContentWidth =
        pdf.internal.pageSize.width - leftMargin - rightMargin; // Usable width

      // --- Add PDF Header - Compacted & Realigned ---
      let currentY = 18; // Starting Y position near the top

      // Main Title (Smaller)
      pdf.setFontSize(14); // Reduced from 18
      pdf.text("Ignition Perspective Screenshot Capture", leftMargin, currentY);
      currentY += 6; // Move down for next line (adjust 6mm spacing as needed)

      // Project URL (Smaller, Grey)
      pdf.setFontSize(8); // Reduced from 10
      pdf.setTextColor(100); // Keep it grey to de-emphasize slightly
      pdf.text(`Project URL: ${projectUrl}`, leftMargin, currentY);
      // Note: We don't increment currentY here yet, placing "Generated on" on the same horizontal level

      // Generated On (Smallest, Aligned Right)
      pdf.setFontSize(7); // Reduced from 10
      pdf.setTextColor(150); // Optional: Lighter grey
      const generatedWidth = pdf.getTextWidth(generatedDateString); // Calculate text width
      const generatedX =
        pdf.internal.pageSize.width - rightMargin - generatedWidth; // Calculate X for right alignment
      pdf.text(generatedDateString, generatedX, currentY); // Add text at calculated X, same Y as URL
      pdf.setTextColor(0); // Reset text color to black for subsequent text
      currentY += 4; // Move down past the URL/Generated line

      // --- Draw line below all header text ---
      pdf.setLineWidth(0.2);
      pdf.line(
        leftMargin,
        currentY,
        pdf.internal.pageSize.width - rightMargin,
        currentY
      ); // Draw line
      currentY += 4; // Add a little space below the line

      // --- Adjust top margin for actual page content (screenshots) ---
      const topMargin = currentY; // Content starts here now

      // Page dimensions for images (recalculate based on new topMargin)
      const bottomMargin = 20;
      const pageWidth = pageContentWidth; // Use calculated content width
      const pageHeight =
        pdf.internal.pageSize.height - topMargin - bottomMargin;

      // --- Initialize Loop Variables ---
      let pageCount = 1;
      let totalScreenshotsProcessed = 0;
      let hasAnyScreenshots = false; // Track if any valid screenshot is added

      // Define the asynchronous function to process categories
      const processCategory = async (categoryIndex) => {
        if (categoryIndex >= categoryContainers.length) {
          // All categories done
          if (hasAnyScreenshots) {
            finalizeAndSaveAll(); // Call the final save function
          } else {
            utils.showStatus(
              "No valid screenshots found to generate PDF.",
              true
            );
            // Clear generating message if nothing was generated
            utils.showStatus("", false, 1);
          }
          return;
        }

        const categoryContainer = categoryContainers[categoryIndex];
        const categoryTitleElement = categoryContainer.querySelector(
          ".category-header h4"
        );
        const categoryTitle = categoryTitleElement
          ? categoryTitleElement.textContent
          : `Category ${categoryIndex + 1}`;

        // Filter out error thumbnails and those without data
        const validThumbnails = Array.from(
          categoryContainer.querySelectorAll(
            ".category-content .thumbnail-container"
          )
        ).filter(
          (container) =>
            !container.classList.contains("error-thumbnail") &&
            container.dataset.screenshot
        );

        if (validThumbnails.length === 0) {
          // Skip empty categories
          await processCategory(categoryIndex + 1); // Move to the next category
          return;
        }

        // Process screenshots in this category
        for (let i = 0; i < validThumbnails.length; i++) {
          const container = validThumbnails[i];
          const screenshotData = container.dataset.screenshot;
          const filename = container.dataset.filename || `Page ${i + 1}`;

          if (!screenshotData) continue; // Skip if somehow data is missing

          // Add page (except for the very first image overall)
          if (totalScreenshotsProcessed > 0) {
            pdf.addPage();
            pageCount++;
          }
          hasAnyScreenshots = true; // Mark that we have content

          // Add Category Title on the page (adjust Y position relative to new topMargin)
          pdf.setFontSize(10); // Slightly smaller category title
          pdf.setTextColor(120); // Slightly darker grey
          pdf.text(categoryTitle, leftMargin, topMargin - 4); // Position just above image start
          pdf.setTextColor(0); // Reset color

          try {
            // Optimize and add image (using await for Promises)
            const optimizedData = await this.optimizeImageForPDF(
              screenshotData
            ); // Use 'this' as it's part of the thumbnails object
            const img = await new Promise((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = (err) =>
                reject(new Error("Image loading failed")); // Provide an Error object
              image.src = optimizedData;
            });

            const imgDimensions = this.getValidImageDimensions(img); // Use 'this'
            let imgWidthOnPage, imgHeightOnPage;
            const imgRatio = imgDimensions.width / imgDimensions.height;
            const pageRatio = pageWidth / pageHeight;

            // Calculate image dimensions on page
            if (imgRatio > pageRatio) {
              imgWidthOnPage = pageWidth;
              imgHeightOnPage = pageWidth / imgRatio;
            } else {
              imgHeightOnPage = pageHeight;
              imgWidthOnPage = pageHeight * imgRatio;
            }

            // Ensure valid dimensions
            imgWidthOnPage = Math.max(1, Math.round(imgWidthOnPage));
            imgHeightOnPage = Math.max(1, Math.round(imgHeightOnPage));

            if (
              isNaN(imgWidthOnPage) ||
              isNaN(imgHeightOnPage) ||
              imgWidthOnPage <= 0 ||
              imgHeightOnPage <= 0
            ) {
              console.error(
                "Invalid calculated image dimensions:",
                imgWidthOnPage,
                imgHeightOnPage
              );
              continue; // Skip this image
            }

            // Define image position
            const xPos = leftMargin;
            const yPos = topMargin; // Starts below the header section

            // Add image to PDF
            pdf.addImage(
              optimizedData,
              optimizedData.includes("data:image/png") ? "PNG" : "JPEG",
              xPos,
              yPos,
              imgWidthOnPage,
              imgHeightOnPage,
              null,
              "FAST" // Compression FAST
            );

            // Add filename caption (adjust Y position and spacing)
            pdf.setFontSize(7); // Smaller caption
            const captionY = yPos + imgHeightOnPage + 4; // Position caption below image (reduced gap)
            const truncatedFilename =
              filename.length > 120
                ? filename.substring(0, 117) + "..."
                : filename;
            // Ensure caption doesn't go off page
            if (captionY < pdf.internal.pageSize.height - bottomMargin + 2) {
              // Allow slightly closer to bottom margin
              pdf.text(truncatedFilename, leftMargin, captionY, {
                maxWidth: pageWidth,
              });
            } else {
              console.warn(
                `Caption for ${filename} skipped as it would exceed page height.`
              );
            }

            totalScreenshotsProcessed++;
            // Update status less frequently if needed, or keep as is
            utils.showStatus(
              `Generating PDF: Processed ${totalScreenshotsProcessed} screenshots...`,
              false,
              0
            );
          } catch (error) {
            console.error(`Error processing screenshot ${filename}:`, error);
            // Optionally add a placeholder or note about the error on the PDF page
            pdf.setFontSize(8);
            pdf.setTextColor(255, 0, 0); // Red color for error
            pdf.text(
              `Error loading image: ${filename}`,
              leftMargin,
              topMargin + 5
            );
            pdf.setTextColor(0);
          }
          // Brief delay to prevent freezing UI during intensive loop
          await new Promise((res) => setTimeout(res, 5));
        } // End loop through thumbnails in category

        // Move to next category recursively
        await processCategory(categoryIndex + 1);
      }; // End processCategory function definition

      // Define the function to finalize and save the PDF
      const finalizeAndSaveAll = () => {
        try {
          // Save the PDF
          pdf.save(
            `All_Screenshots_${new Date().toISOString().slice(0, 10)}.pdf`
          );
          utils.showStatus(
            `Combined PDF generated with ${pageCount} pages`,
            false,
            5000
          );
        } catch (error) {
          console.error("Error saving combined PDF:", error);
          utils.showStatus("Error saving combined PDF", true);
        } finally {
          utils.showStatus("", false, 1); // Clear status
        }
      }; // End finalizeAndSaveAll function definition

      // Start processing the first category
      processCategory(0);
    } catch (error) {
      console.error("Error generating comprehensive PDF:", error);
      utils.showStatus(
        "Error generating comprehensive PDF: " + error.message,
        true
      );
    }
  },
};

export default thumbnails;
