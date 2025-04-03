// url-processor.js - Refactored URL processing module
import config from './config.js';
import { URLProcessingError } from './errors.js';

class URLProcessor {
  processUrlList(raw) {
    if (!raw || typeof raw !== 'string') {
      throw new URLProcessingError('Invalid URL list provided', raw);
    }
    const lines = raw.split('\n').map(url => url.trim()).filter(url => url);
    const uniqueUrls = [...new Set(lines)];
    const validatedUrls = [];
    const invalidUrls = [];
    for (const url of uniqueUrls) {
      if (this.isValidUrl(url)) {
        validatedUrls.push(url);
      } else {
        invalidUrls.push(url);
      }
    }
    if (invalidUrls.length > 0) {
      console.warn(`Found ${invalidUrls.length} invalid URLs:`, invalidUrls);
    }
    return validatedUrls;
  }
  
  isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return url.includes('localhost') || /^https?:\/\//.test(url) || /^file:\/\//.test(url);
  }
  
  applyRegexToUrl(url, regexPattern) {
    if (!url) {
      throw new URLProcessingError('No URL provided for regex extraction', url);
    }
    if (!regexPattern || regexPattern.trim() === '') {
      return this.extractDefaultUrlSegment(url);
    }
    try {
      const regex = new RegExp(regexPattern);
      const match = url.match(regex);
      if (match) {
        const groups = match.slice(1).filter(Boolean);
        if (groups.length > 0) {
          return groups.join('_');
        }
        return match[0];
      }
      return this.extractDefaultUrlSegment(url);
    } catch (error) {
      console.error(`Invalid regex pattern: ${regexPattern}`, error);
      return this.extractDefaultUrlSegment(url);
    }
  }
  
  extractDefaultUrlSegment(url) {
    const parts = url.split('/').filter(part => part.trim() !== '');
    const lastParts = parts.slice(-2);
    return lastParts.join('_');
  }
  
  /**
   * Generate filename using a fixed pattern.
   * The filename format is always: <urlSegment>_<timestamp>.png
   *
   * @param {string} url - URL of the page
   * @param {number} index - Index in the URL list (not used in filename here)
   * @param {string} regexPattern - Optional regex pattern for URL extraction
   * @returns {string} - Generated filename
   */
  generateFilename(url, index, regexPattern) {
    const timestamp = this.getTimestamp();
    const urlSegment = this.applyRegexToUrl(url, regexPattern);
    return `${this.sanitizeFilename(urlSegment)}_${timestamp}.png`;
  }
  
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
  
  sanitizeFilename(filename) {
    if (!filename) return 'screenshot';
    let sanitized = filename.replace(config.urlProcessing.filenameCharPattern, '_');
    sanitized = sanitized.replace(config.urlProcessing.multipleUnderscoresPattern, '_');
    return sanitized.replace(/^_+|_+$/g, '');
  }
  
  parseUrl(url) {
    if (!this.isValidUrl(url)) {
      throw new URLProcessingError('Invalid URL format', url);
    }
    try {
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

export default new URLProcessor();
