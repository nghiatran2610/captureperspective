/**
 * URL Processor Module
 * Handles URL validation, processing, and filename generation
 */
const URLProcessor = {
  /**
   * Process a list of URLs - clean, deduplicate, and validate
   * @param {string} raw - Raw URL list as string with newlines
   * @returns {string[]} - Cleaned, deduplicated, and validated URLs
   */
  processUrlList(raw) {
    const lines = raw.split('\n').map(url => url.trim()).filter(url => url);
    const uniqueUrls = [...new Set(lines)];
    return uniqueUrls.filter(url => this.isValidUrl(url));
  },
  
  /**
   * Check if a URL is valid for processing
   * @param {string} url - URL to check
   * @returns {boolean} - True if URL is valid
   */
  isValidUrl(url) {
    return url.includes('localhost');
  },
  
  /**
   * Apply regex to extract part of URL for filename
   * @param {string} url - URL to process
   * @param {string} regexPattern - Regex pattern to apply
   * @returns {string} - Extracted URL segment
   */
  applyRegexToUrl(url, regexPattern) {
    if (!regexPattern) {
      // Default behavior: extract last two parts of the URL
      const parts = url.split('/').filter(part => part.trim() !== '');
      const lastParts = parts.slice(-2); // Get the last two parts
      return lastParts.join('_');
    }
    
    try {
      const regex = new RegExp(regexPattern);
      const match = url.match(regex);
      if (match) {
        const groups = match.slice(1).filter(Boolean);
        if (groups.length > 0) {
          return groups.join('_');
        } else if (match[0]) {
          return match[0];
        }
      }
      // If regex doesn't match, fall back to last two parts of URL
      const parts = url.split('/').filter(part => part.trim() !== '');
      const lastParts = parts.slice(-2);
      return lastParts.join('_');
    } catch (error) {
      console.error(`Invalid regex pattern: ${regexPattern}`, error);
      // Fallback to the last two segments if regex is invalid
      const parts = url.split('/').filter(part => part.trim() !== '');
      const lastParts = parts.slice(-2);
      return lastParts.join('_');
    }
  },
  
  /**
   * Generate filename based on pattern
   * @param {string} url - URL of the page
   * @param {number} index - Index in the URL list
   * @param {string} pattern - Filename pattern
   * @param {string} regexPattern - Regex pattern for URL extraction
   * @returns {string} - Generated filename
   */
  generateFilename(url, index, pattern, regexPattern) {
    const timestamp = this.getTimestamp();
    const urlSegment = this.applyRegexToUrl(url, regexPattern);
    const customText = UI.elements.customText.value.trim() || 'Screenshot';
    
    // Use default pattern if none provided
    if (!pattern || pattern === '{url}') {
      return `${this.sanitizeFilename(urlSegment)}_${timestamp}.png`;
    }
    
    // Otherwise use the provided pattern
    let filename = pattern;
    filename = filename.replace('{url}', urlSegment);
    filename = filename.replace('{timestamp}', timestamp);
    filename = filename.replace('{index}', index + 1);
    filename = filename.replace('{custom}', customText);
    
    return `${this.sanitizeFilename(filename)}.png`;
  },
  
  /**
   * Get current timestamp in format YYYYMMDD_HHMMSS
   * @returns {string} - Formatted timestamp
   */
  getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  },
  
  /**
   * Sanitize filename by removing invalid characters
   * @param {string} filename - Filename to sanitize
   * @returns {string} - Sanitized filename
   */
  sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  }
};