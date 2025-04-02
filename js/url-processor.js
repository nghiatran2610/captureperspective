// url-processor.js - Refactored URL processing module
import config from './config.js';
import { URLProcessingError } from './errors.js';

/**
 * URL Processor Module
 * Handles URL validation, processing, and filename generation
 */
class URLProcessor {
  /**
   * Process a list of URLs - clean, deduplicate, and validate
   * @param {string} raw - Raw URL list as string with newlines
   * @returns {string[]} - Cleaned, deduplicated, and validated URLs
   */
  processUrlList(raw) {
    if (!raw || typeof raw !== 'string') {
      throw new URLProcessingError('Invalid URL list provided', raw);
    }
    
    // Split by newlines, trim each URL, and filter out empty ones
    const lines = raw.split('\n')
      .map(url => url.trim())
      .filter(url => url);
    
    // Deduplicate URLs
    const uniqueUrls = [...new Set(lines)];
    
    // Validate each URL
    const validatedUrls = [];
    const invalidUrls = [];
    
    for (const url of uniqueUrls) {
      if (this.isValidUrl(url)) {
        validatedUrls.push(url);
      } else {
        invalidUrls.push(url);
      }
    }
    
    // If there are invalid URLs, log them
    if (invalidUrls.length > 0) {
      console.warn(`Found ${invalidUrls.length} invalid URLs:`, invalidUrls);
    }
    
    return validatedUrls;
  }
  
  /**
   * Check if a URL is valid for processing
   * @param {string} url - URL to check
   * @returns {boolean} - True if URL is valid
   */
  isValidUrl(url) {
    // Check for localhost or other valid patterns
    // This can be customized based on the application requirements
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    // Basic validation - URL must include localhost or be a valid web URL
    return url.includes('localhost') || 
           /^https?:\/\//.test(url) ||
           /^file:\/\//.test(url);
  }
  
  /**
   * Apply regex to extract part of URL for filename
   * @param {string} url - URL to process
   * @param {string} regexPattern - Regex pattern to apply
   * @returns {string} - Extracted URL segment
   */
  applyRegexToUrl(url, regexPattern) {
    if (!url) {
      throw new URLProcessingError('No URL provided for regex extraction', url);
    }
    
    // Default behavior if no regex pattern is provided
    if (!regexPattern || regexPattern.trim() === '') {
      return this.extractDefaultUrlSegment(url);
    }
    
    try {
      const regex = new RegExp(regexPattern);
      const match = url.match(regex);
      
      if (match) {
        // If we have capture groups, join them
        const groups = match.slice(1).filter(Boolean);
        if (groups.length > 0) {
          return groups.join('_');
        }
        // Otherwise use the whole match
        return match[0];
      }
      
      // Fallback to default extraction if regex didn't match
      return this.extractDefaultUrlSegment(url);
      
    } catch (error) {
      console.error(`Invalid regex pattern: ${regexPattern}`, error);
      // Fallback to default extraction if regex is invalid
      return this.extractDefaultUrlSegment(url);
    }
  }
  
  /**
   * Extract a default URL segment for filename generation
   * @param {string} url - URL to process
   * @returns {string} - Extracted URL segment
   */
  extractDefaultUrlSegment(url) {
    // Extract the last two parts of the URL path
    const parts = url.split('/').filter(part => part.trim() !== '');
    const lastParts = parts.slice(-2);
    return lastParts.join('_');
  }
  
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
    
    // Get custom text from UI or use default
    const customTextElement = document.getElementById('customText');
    const customText = customTextElement ? customTextElement.value.trim() : 'Screenshot';
    
    // Use default pattern if none provided
    if (!pattern || pattern === '{url}') {
      return `${this.sanitizeFilename(urlSegment)}_${timestamp}.png`;
    }
    
    // Process the provided pattern
    let filename = pattern;
    
    // Replace placeholders with actual values
    const replacements = {
      '{url}': urlSegment,
      '{timestamp}': timestamp,
      '{index}': index + 1,
      '{custom}': customText
    };
    
    // Apply all replacements
    for (const [placeholder, value] of Object.entries(replacements)) {
      filename = filename.replace(new RegExp(placeholder, 'g'), value);
    }
    
    // Ensure filename ends with .png
    if (!filename.toLowerCase().endsWith('.png')) {
      filename += '.png';
    }
    
    return this.sanitizeFilename(filename);
  }
  
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
  }
  
  /**
   * Sanitize filename by removing invalid characters
   * @param {string} filename - Filename to sanitize
   * @returns {string} - Sanitized filename
   */
  sanitizeFilename(filename) {
    if (!filename) return 'screenshot';
    
    // Replace invalid characters with underscores
    let sanitized = filename.replace(config.urlProcessing.filenameCharPattern, '_');
    
    // Replace multiple consecutive underscores with a single one
    sanitized = sanitized.replace(config.urlProcessing.multipleUnderscoresPattern, '_');
    
    // Trim underscores from start and end
    return sanitized.replace(/^_+|_+$/g, '');
  }
  
  /**
   * Parse and validate a URL
   * @param {string} url - The URL to parse
   * @returns {Object} - Parsed URL information
   */
  parseUrl(url) {
    if (!this.isValidUrl(url)) {
      throw new URLProcessingError('Invalid URL format', url);
    }
    
    try {
      // For localhost URLs that might not have http/https
      const normalizedUrl = url.startsWith('http') ? url : `http://${url}`;
      const parsedUrl = new URL(normalizedUrl);
      
      return {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        pathname: parsedUrl.pathname,
        search: parsedUrl.search,
        hash: parsedUrl.hash,
        isLocalhost: parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1'
      };
    } catch (error) {
      throw new URLProcessingError(`Failed to parse URL: ${error.message}`, url);
    }
  }
}

// Export a singleton instance
export default new URLProcessor();