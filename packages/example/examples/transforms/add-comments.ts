import { defineTransform } from '../../src/types.js';

/**
 * Example transformer that adds file header comments based on metadata
 */
export default defineTransform((tag, meta, code) => {
  const lines: string[] = [];

  // Add file header if file metadata is present
  if (meta.file) {
    // Determine comment style based on language
    const commentStyle = getCommentStyle(tag);
    lines.push(`${commentStyle} File: ${meta.file}`);

    // Add region if present
    if (meta.region) {
      lines.push(`${commentStyle} Region: ${meta.region}`);
    }

    lines.push('');
  }

  // Add original code
  lines.push(code);

  return lines.join('\n');
});

/**
 * Get comment style for a language
 */
function getCommentStyle(lang: string): string {
  const styles: Record<string, string> = {
    js: '//',
    javascript: '//',
    ts: '//',
    typescript: '//',
    py: '#',
    python: '#',
    rb: '#',
    ruby: '#',
    sh: '#',
    bash: '#',
    sql: '--',
    html: '<!--',
    css: '/*',
  };

  return styles[lang.toLowerCase()] || '//';
}
