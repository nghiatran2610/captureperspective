// js/config.js
// config.js - Centralized configuration
export const config = {
  // UI related settings
  ui: {
    defaultWaitTime: 4,
    defaultNamingPattern: "{url}_{custom}", // Kept for URLProcessor, though not directly used by screenshot naming now
    defaultCustomText: "Screenshot", // Kept for potential future use
    defaultUrlRegex: "client/([^/]+)/([^/]+)/([^/]+)/([^/]+)", // Kept for URLProcessor
    cssClasses: {
      btn: "btn",
      btnSmall: "btn btn-small",
      card: "card",
      error: "error",
      success: "success",
    },
  },

  // Screenshot related settings
  screenshot: {
    presets: {
      // Presets define the base viewport size (width and height IF fullPage is not checked)
      fullHD: { width: 1920, height: 1080, name: "Full HD (1920x1080)" },
      mobile: { width: 375, height: 812, name: "Mobile (iPhone X/11/12)" },
      tablet: { width: 768, height: 1024, name: "Tablet (iPad)" },
    },
    defaultPreset: "fullHD", // Default selection in the dropdown
    thumbnailSize: {
      width: 120,
      height: 90,
    },
    // html2canvasOptions removed
    // dom-to-image-more options will be set dynamically in core.js
    // but we can define some defaults if needed.
    domToImageOptions: {
      bgcolor: "#ffffff", // Default background color
      // Default quality for toJpeg or toBlob, not directly for toPng
      quality: 0.92,
      imagePlaceholder:
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", // Tiny transparent gif
      cacheBust: true, // Good for ensuring fresh images
      // filter, width, height will be set dynamically
    },
  },

  // URL processing settings (remains the same)
  urlProcessing: {
    validationPattern: /localhost/,
    filenameCharPattern: /[^a-zA-Z0-9_-]/g,
    filenameCharReplacement: "_",
    multipleUnderscoresPattern: /_+/g,
  },

  // URL prefill configuration (remains the same)
  prefill: {
    enabled: true,
    sourcePattern: /http(s)?:\/\/([^\/]+)\/system\/webdev\/([^\/]+)/,
    targetTemplate: "http$1://$2/data/perspective/client/$3",
    fallbackUrl: "http://localhost:8088/data/perspective/client/",
  },

  // Timing settings (remains the same)
  timing: {
    minWaitTime: 1000, // 1 second
    maxWaitTime: 120000, // 2 minutes
    typingDelay: 30, // 30ms between characters when typing
    scrollCompletionDelay: 500, // wait after scrolling
    highlightDuration: 200, // how long to highlight clicked elements
  },
  debug: false, // Default debug state
};

export default config;
