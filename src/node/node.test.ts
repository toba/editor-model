import '@toba/test';
import { compare, expectSame, pm } from '../test-tools/';
import { Slice } from './slice';

describe('duplicate ProseMirror functionality', () => {
   it('resolves positions the same', () => {
      const [testDoc, pm_testDoc] = compare.textDoc('foobar');

      [2, 3].forEach(p => {
         expectSame.location(testDoc.resolve(p), pm_testDoc.resolve(p));
      });
   });

   it('deletes content the same', () => {
      const [testDoc, pm_testDoc] = compare.textDoc('foobar');
      const node = testDoc.replace(2, 3, Slice.empty);
      const pm_node = pm_testDoc.replace(2, 3, pm.Slice.empty);

      expectSame.node(node, pm_node);
   });
});
