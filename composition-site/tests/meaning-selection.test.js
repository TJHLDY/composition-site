const test=require('node:test');
const assert=require('node:assert/strict');
const {dictionarySelectionMarkup,coreMeaning}=require('../wordbook.js');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'..','wordbook.js'),'utf8');
test('meaning picker separates senses, retains POS and escapes external content',()=>{
  const data={meanings:['n. 字；话语','v. <措辞>']};
  const html=dictionarySelectionMarkup(data,'n. 字\nv. <措辞>');
  assert.equal((html.match(/data-meaning-choice/g)||[]).length,3);
  assert.equal((html.match(/ checked/g)||[]).length,2);
  assert.ok(html.includes('v. &lt;措辞&gt;'));
  assert.equal(coreMeaning({id:1,translationZh:'n. 字',dictionary:{meanings:['n. 字','v. 措辞']}}),'n. 字');
});

test('choosing a dictionary sense is observable but collection remains a separate completed action',()=>{
  assert.match(source,/vocabnote:wordbook-meaning-selected/);
  assert.match(source,/vocabnote:wordbook-saved/);
  const selectionHandler=source.slice(
    source.indexOf("$('#wb-editor-dictionary').addEventListener('change'"),
    source.indexOf("$('#wb-translation').addEventListener('input'")
  );
  assert.match(selectionHandler,/vocabnote:wordbook-meaning-selected/);
  assert.doesNotMatch(selectionHandler,/vocabnote:wordbook-saved/);
});

test('guided lookup can bypass personal matches when replaying the full tutorial',()=>{
  assert.match(source,/forcePreview/);
});
