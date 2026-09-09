const test=require('node:test');
const assert=require('node:assert/strict');
const {dictionarySelectionMarkup,coreMeaning}=require('../wordbook.js');
test('meaning picker separates senses, retains POS and escapes external content',()=>{
  const data={meanings:['n. 字；话语','v. <措辞>']};
  const html=dictionarySelectionMarkup(data,'n. 字\nv. <措辞>');
  assert.equal((html.match(/data-meaning-choice/g)||[]).length,3);
  assert.equal((html.match(/ checked/g)||[]).length,2);
  assert.ok(html.includes('v. &lt;措辞&gt;'));
  assert.equal(coreMeaning({id:1,translationZh:'n. 字',dictionary:{meanings:['n. 字','v. 措辞']}}),'n. 字');
});
