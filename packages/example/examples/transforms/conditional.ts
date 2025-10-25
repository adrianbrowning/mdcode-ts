import { defineTransform } from '../../src/types.js';

/**
 * Example transformer that demonstrates conditional transformation
 * based on language tag, metadata, and code content
 */
export default defineTransform((tag, meta, code) => {
  // Example 1: Transform test files
  if (meta.file?.includes('.test.') || meta.file?.includes('.spec.')) {
    return `// AUTO-GENERATED TEST FILE\n// Do not edit manually\n\n${code}`;
  }

  // Example 2: Transform specific regions
  if (meta.region === 'example') {
    return `/* EXAMPLE CODE */\n${code}\n/* END EXAMPLE */`;
  }

  // Example 3: Transform TypeScript interfaces to add readonly
  if ((tag === 'ts' || tag === 'typescript') && code.includes('interface')) {
    return code.replace(/(\s+)(\w+):/g, '$1readonly $2:');
  }

  // Example 4: Add strict mode to JavaScript
  if ((tag === 'js' || tag === 'javascript') && !code.includes('use strict')) {
    return `'use strict';\n\n${code}`;
  }

  // Example 5: Replace console.log with a logger in production code
  if (meta.file && !meta.file.includes('example') && !meta.file.includes('demo')) {
    return code.replace(/console\.log/g, 'logger.info');
  }

  // Return unchanged
  return code;
});
