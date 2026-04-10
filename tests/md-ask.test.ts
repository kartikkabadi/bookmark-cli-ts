import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { withIsolatedDataDir } from './helpers.js';
import {
  extractWikiUpdatesForTest as extractWikiUpdates,
  stripWikiUpdatesSectionForTest as stripWikiUpdatesSection,
  scorePageNameForTest as scorePageName
} from '../src/md-ask.js';

// ── extractWikiUpdates ─────────────────────────────────────────────────

describe('extractWikiUpdates', () => {
  test('extracts valid wiki update lines', () => {
    const answer = `Here is the answer to your question.

## Wiki Updates
- [[categories/ai]]: Add note about transformer architecture
- [[domains/ml]]: Update key insights section with new findings
- [[entities/karpathy]]: Add connection to AI safety

## Related Topics
Some other content`;
    const updates = extractWikiUpdates(answer);
    assert.equal(updates.length, 3, '3 updates extracted');
    assert.equal(updates[0], '[[categories/ai]]: Add note about transformer architecture');
    assert.equal(updates[1], '[[domains/ml]]: Update key insights section with new findings');
    assert.equal(updates[2], '[[entities/karpathy]]: Add connection to AI safety');
  });

  test('returns empty array when no Wiki Updates section', () => {
    const answer = 'This is just an answer without any wiki updates section.';
    const updates = extractWikiUpdates(answer);
    assert.deepEqual(updates, [], 'no updates when section absent');
  });

  test('returns empty array when answer is empty', () => {
    const updates = extractWikiUpdates('');
    assert.deepEqual(updates, []);
  });

  test('ignores lines without dash prefix or wikilink brackets', () => {
    const answer = `## Wiki Updates
- valid update without brackets
not a valid line
  - indent but no page path
- [[domains/test]]: valid update`;
    const updates = extractWikiUpdates(answer);
    // Only the last line has BOTH dash prefix AND [[...]]
    assert.equal(updates.length, 1, 'only lines with both dash and [[ collected');
    assert.equal(updates[0], '[[domains/test]]: valid update');
  });

  test('ignores lines without wikilink brackets', () => {
    const answer = `## Wiki Updates
- valid line with [[brackets]]
- invalid line without brackets
- [[valid]]: note here
  - nested indent`;
    const updates = extractWikiUpdates(answer);
    assert.equal(updates.length, 2, 'lines without [[...]] excluded');
  });

  test('handles Wiki Updates at end of answer without trailing sections', () => {
    const answer = `## Wiki Updates
- [[categories/security]]: CVE updates needed
- [[domains/infosec]]: Add new vulnerability patterns`;
    const updates = extractWikiUpdates(answer);
    assert.equal(updates.length, 2);
    assert.ok(updates[0].includes('[[categories/security]]'));
  });

  test('handles whitespace around lines', () => {
    const answer = `## Wiki Updates
  - [[categories/tool]]: note
   - [[domains/ai]]: another note
    - [[entities/user]]: final note`;
    const updates = extractWikiUpdates(answer);
    assert.equal(updates.length, 3, 'whitespace trimmed');
  });

  test('strips leading dash and whitespace from each line', () => {
    const answer = `## Wiki Updates
-   [[categories/test]]: content here
- [[domains/foo]]: more content`;
    const updates = extractWikiUpdates(answer);
    assert.equal(updates[0], '[[categories/test]]: content here');
    assert.equal(updates[1], '[[domains/foo]]: more content');
  });

  test('only matches at start of line or after whitespace', () => {
    const answer = `Text containing - [[categories/test]]: not a line item because no newline before dash
## Wiki Updates
- [[entities/user]]: this is valid`;
    const updates = extractWikiUpdates(answer);
    assert.equal(updates.length, 1);
  });

  test('handles multiline Wiki Updates content', () => {
    const answer = `## Wiki Updates
- [[categories/ai]]: Added section on transformers
  with additional details spanning multiple lines
  continuing the note
- [[domains/ml]]: Simple update`;
    // The regex captures until next ## or end, so multiline content is captured
    const updates = extractWikiUpdates(answer);
    // The implementation splits on newlines and filters each line, so multiline is NOT captured
    assert.equal(updates.length, 2, 'only first line of multiline is captured');
    assert.ok(updates[0].includes('Added section on transformers'));
  });
});

// ── stripWikiUpdatesSection ────────────────────────────────────────────

describe('stripWikiUpdatesSection', () => {
  test('removes Wiki Updates section and everything after it', () => {
    const answer = `Here is the answer.

## Wiki Updates
- [[categories/test]]: note
## Related
More text here`;
    const stripped = stripWikiUpdatesSection(answer);
    assert.ok(!stripped.includes('Wiki Updates'), 'Wiki Updates section removed');
    assert.ok(stripped.includes('Here is the answer'), 'answer content preserved');
    assert.ok(!stripped.includes('## Related'), 'sections after Wiki Updates also removed');
    assert.ok(!stripped.includes('More text here'), 'content after Wiki Updates removed');
  });

  test('leaves answer unchanged when no Wiki Updates section', () => {
    const answer = 'Just a simple answer with no wiki updates.';
    const stripped = stripWikiUpdatesSection(answer);
    assert.equal(stripped, answer, 'unchanged when no section');
  });

  test('handles answer with only Wiki Updates section', () => {
    // With leading newline — matches the \n## Wiki Updates pattern
    const answer = `\n## Wiki Updates
- [[categories/ai]]: note`;
    const stripped = stripWikiUpdatesSection(answer);
    assert.equal(stripped, '', 'everything stripped when only section');
  });

  test('Wiki Updates at start of string (no leading newline) is preserved as-is', () => {
    // When ## Wiki Updates is at position 0, there's no preceding \n, so
    // the pattern \n## Wiki Updates does not match — section is preserved
    const answer = `## Wiki Updates\n- [[categories/ai]]: note`;
    const stripped = stripWikiUpdatesSection(answer);
    assert.equal(stripped, answer, 'unchanged when no leading newline before ## Wiki Updates');
  });

  test('trims trailing whitespace after stripping', () => {
    const answer = `Answer content here.

## Wiki Updates
- [[test]]: note


`;
    const stripped = stripWikiUpdatesSection(answer);
    assert.equal(stripped, 'Answer content here.', 'trailing whitespace trimmed');
  });

  test('handles empty string', () => {
    const stripped = stripWikiUpdatesSection('');
    assert.equal(stripped, '');
  });

  test('greedy regex strips all content after first Wiki Updates section (to end of string)', () => {
    const answer = `Some content

## Wiki Updates
- [[test]]: note

More content

## Wiki Updates
- [[test2]]: another`;
    const stripped = stripWikiUpdatesSection(answer);
    // The regex \n## Wiki Updates[\s\S]*$ is greedy — matches from first ## Wiki Updates
    // to the END OF STRING, consuming everything after it including the second section
    assert.ok(stripped.includes('Some content'), 'content before first Wiki Updates preserved');
    assert.ok(!stripped.includes('## Wiki Updates'), 'no Wiki Updates sections remain');
    assert.ok(!stripped.includes('[[test]]: note'), 'first section content removed');
    assert.ok(!stripped.includes('More content'), 'content after first section removed');
    assert.ok(!stripped.includes('[[test2]]: another'), 'second section removed');
    assert.equal(stripped, 'Some content', 'exactly preserved content before first section');
  });
});

// ── scorePageName ──────────────────────────────────────────────────────

describe('scorePageName', () => {
  test('scores based on matching words (case insensitive)', () => {
    const score = scorePageName('machine-learning', new Set(['machine', 'learning']));
    assert.equal(score, 2, 'both words match');
  });

  test('replaces hyphens and underscores with spaces before splitting', () => {
    const score = scorePageName('machine_learning_tools', new Set(['machine', 'learning']));
    assert.equal(score, 2, 'underscore treated as space');
  });

  test('scores zero when no words match', () => {
    const score = scorePageName('web-development', new Set(['machine', 'learning']));
    assert.equal(score, 0, 'no matches');
  });

  test('scores partial matches', () => {
    const score = scorePageName('web-development', new Set(['web', 'learning']));
    assert.equal(score, 1, 'one word matches');
  });

  test('ignores words shorter than 3 characters', () => {
    const words = new Set(['we', 'ml', 'ai']);
    const score = scorePageName('web-development', words);
    assert.equal(score, 0, 'short words ignored in questionWords set');
  });

  test('handles empty question word set', () => {
    const score = scorePageName('some-page', new Set());
    assert.equal(score, 0, 'no words to match');
  });

  test('handles empty page name', () => {
    const score = scorePageName('', new Set(['test', 'words']));
    assert.equal(score, 0, 'empty page name scores zero');
  });

  test('handles page name with only punctuation', () => {
    const score = scorePageName('---test---', new Set(['test']));
    // ---test--- split by /\s+/ gives ['---test---'] (no spaces), so one word
    assert.equal(score, 1, 'punctuation-only word matched');
  });

  test('counts each occurrence of matching word separately', () => {
    const score = scorePageName('machine machine machine', new Set(['machine']));
    assert.equal(score, 3, 'each occurrence of the word is counted');
  });
});
