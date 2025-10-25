import { defineTransform } from '../../src/types.js';

/**
 * Example transformer that demonstrates async transformations
 * This could be used to call external APIs, format with tools, etc.
 */
export default defineTransform(async (tag, meta, code) => {
  // Example: Simulate calling an external formatting API
  if (tag === 'js' || tag === 'javascript') {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 10));

    // Simple formatting example (in real use, you might call prettier, eslint, etc.)
    return code
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n')
      .trim();
  }

  // Example: Simulate calling an AI API for code review
  if (meta.region === 'review') {
    await new Promise(resolve => setTimeout(resolve, 10));

    // Add review comments (placeholder)
    return `// AI Review: This code looks good!\n${code}`;
  }

  return code;
});
