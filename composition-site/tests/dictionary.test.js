const test = require('node:test');
const assert = require('node:assert/strict');
const { dictionaryMarkup, dictionaryGroups, coreMeaning } = require('../wordbook.js');
test('dictionary preserves all senses, folds later meanings, and escapes external text', () => {
  const html = dictionaryMarkup({ ukPhonetic: 'test', usPhonetic: 'test', meanings: ['n. 一；三；<script>四</script>', 'v. 二'], wordForms: [{ name: '过去式', value: '<img onerror=alert(1)>' }] });
  assert.ok(html.includes('<details'));
  assert.ok(html.includes('&lt;script&gt;四&lt;/script&gt;'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('词形变化'));
  assert.equal(dictionaryMarkup(null), '');
});
test('long noun senses fold independently and never hide another part of speech', () => {
  const dictionary = { meanings: ['n. 单词；话语；交谈；命令；消息', 'v. 措辞，用词', 'int. 说得对'], wordForms: [] };
  const html = dictionaryMarkup(dictionary);
  const outsideDetails = html.replace(/<details[\s\S]*?<\/details>/g, '');
  assert.ok(outsideDetails.includes('措辞，用词'));
  assert.ok(outsideDetails.includes('说得对'));
  assert.ok(!outsideDetails.includes('命令'));
  assert.equal(dictionaryGroups(dictionary)[0].senses.length, 5);
  assert.equal(coreMeaning({ dictionary, translationZh: dictionary.meanings[0] }), 'n. 单词\nv. 措辞，用词\nint. 说得对');
  assert.equal(coreMeaning({ dictionary, translationZh: 'n. 单词 · v. 措辞，用词 · int. 说得对' }), 'n. 单词\nv. 措辞，用词\nint. 说得对');
  assert.equal(coreMeaning({ dictionary, translationZh: '我自己写的意思' }), '我自己写的意思');
});
