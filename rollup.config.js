const { nodeResolve } = require('@rollup/plugin-node-resolve');
const terser = require('@rollup/plugin-terser');
const obfuscator = require('rollup-plugin-obfuscator');

// Check if we're in production mode
const production = process.env.NODE_ENV === 'production';

module.exports = {
  input: 'js/index.js',
  output: {
    file: production 
      ? 'dist/perspective-screenshot-capture.min.js' 
      : 'dist/perspective-screenshot-capture.js',
    format: 'iife',
    name: 'PerspectiveScreenshot',
    sourcemap: !production // Only include source maps in development
  },
  plugins: [
    nodeResolve(),
    // Only include minification and obfuscation in production
    ...(production ? [
      terser(),
      obfuscator({
        // Obfuscation options
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        debugProtection: false, // Set to false to allow debugging in browser
        debugProtectionInterval: false, // Set to false to allow debugging in browser
        disableConsoleOutput: false, // Set to false to keep console logs
        identifierNamesGenerator: 'hexadecimal',
        rotateStringArray: true,
        selfDefending: true,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        transformObjectKeys: true,
        unicodeEscapeSequence: false
      })
    ] : [])
  ]
};