import '@toba/test';
import { pm } from './proxy';
import { basicSchema, Item } from '../schema/';
import { makeTestItems, TestItemMaker, takeAttrs } from './test-maker';

const items = makeTestItems(basicSchema, {
   p: { type: Item.Paragraph },
   hr: { type: Item.Line }
});

const doc = items.node['doc'];
const p = items.node['p'];
const hr = items.node['hr'];

describe('duplicate ProseMirror functionality', () => {
   /**
    * Retrieve `EditorNode` and `Mark` test item makers for Toba and the
    * original ProseMirror.
    *
    * TODO: consider using same schema or write schema converter
    */
   const getItemMakers = (): [TestItemMaker, any] => [
      makeTestItems(basicSchema, { p: { type: Item.Paragraph } }),
      pm.mock.builders(basicSchema, { p: { nodeType: Item.Paragraph } })
   ];

   it('creates the same maker collections from schema', () => {
      const [makers, pm_makers] = getItemMakers();
      // both makers have schema property in the root but but the local instance
      // separates node and mark makers into child containers
      expect(
         Object.keys(makers.node).length + Object.keys(makers.mark).length + 1
      ).toBe(Object.keys(pm_makers).length);
   });

   it('hoists the same test item attributes', () => {
      const children = [p()];
      const pm_children = [pm.mock.p()];
      const attrs = takeAttrs(undefined, children);
      const pm_attrs = pm.takeAttrs(undefined, pm_children);

      expect(attrs).toBeUndefined();
      expect(pm_attrs).toBeUndefined();
      expect(children.length).toBe(pm_children.length);
   });

   it('item makers produce the same output', () => {
      const node = doc(p());
      const pm_node = pm.mock.doc(pm.mock.p());

      expect(node.childCount).toBe(pm_node.childCount);
      expect(node.isText).toBe(pm_node.isText);
      expect(node.isLeaf).toBe(pm_node.isLeaf);
      expect(node.isBlock).toBe(pm_node.isBlock);
      expect(node.marks.length).toBe(pm_node.marks.length);
   });
});
