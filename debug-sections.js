const mammoth = require('mammoth');
const path = require('path');
const docxPath = path.join(process.cwd(), 'public', 'sotaynhanvien.docx');

mammoth.convertToHtml({path: docxPath}).then(({value: html}) => {
  // Count h1-h6 tags in original HTML
  const headings = html.match(/<h[1-6][^>]*>.*?<\/h[1-6]>/gi) || [];
  console.log('Total headings in DOCX:', headings.length);
  headings.slice(0, 10).forEach(h => console.log(' ', h.substring(0, 120)));

  // Annotate with section IDs
  let si = 0;
  const annotated = html.replace(/<(h[1-6])([^>]*)>/gi, (m, tag, attrs) => {
    const id = 'section-' + si++;
    if (/id=/.test(attrs)) return m;
    return '<' + tag + attrs + ' id="' + id + '">';
  });
  console.log('\nAnnotated sections:', si);

  // Insert markers
  let sHtml = annotated;
  const markerRegex = /<h([1-6])([^>]*)id="(section-\d+)"([^>]*)>/gi;
  sHtml = sHtml.replace(markerRegex, (m, _tag, _before, id, _after) => {
    return '⸻SECTION:' + id + '⸻\n' + m;
  });

  // Strip to text
  const text = sHtml
    .replace(/<tr[^>]*>/gi, '\n').replace(/<\/tr>/gi, '')
    .replace(/<t[dh][^>]*>/gi, '').replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<h([1-6])[^>]*>/gi, '\n\n### ').replace(/<\/h[1-6]>/gi, ' ###\n')
    .replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/\n{4,}/g, '\n\n\n').trim();

  const markers = text.match(/⸻SECTION:section-\d+⸻/g) || [];
  console.log('\nMarkers in text:', markers.length);
  console.log('Unique:', [...new Set(markers)]);

  // Show lines with markers
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('⸻SECTION')) {
      console.log(`  Line ${i}: ${line.substring(0, 100)}`);
    }
  });
});
