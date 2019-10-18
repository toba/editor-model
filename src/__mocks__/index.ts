import '@toba/test';
import { testSchema, Item } from '../test-schema';
import { makeTestItems } from '../test-maker';
import { ContentMatch } from '../match';

/**
 * @see https://github.com/ProseMirror/prosemirror-test-builder/blob/master/src/index.js
 */
export const items = makeTestItems(testSchema, {
   p: { type: Item.Paragraph },
   pre: { type: Item.CodeBlock },
   h1: { type: Item.Heading, attrs: { level: 1 } },
   h2: { type: Item.Heading, attrs: { level: 2 } },
   h3: { type: Item.Heading, attrs: { level: 3 } },
   // li: { type: TestTypeName.ListItem },
   // ul: { type: TestTypeName.BulletList },
   // ol: { type: TestTypeName.OrderedList },
   br: { type: Item.Break },
   img: { type: Item.Image, attrs: { src: 'img.png' } },
   hr: { type: Item.Line },
   a: { type: Item.Link, isMark: true, attrs: { href: 'foo' } }
});

/** Root node */
export const doc = items.node['doc'];
export const blockquote = items.node['blockquote'];
export const p = items.node['p'];
export const pre = items.node['pre'];
export const h1 = items.node['h1'];
export const h2 = items.node['h2'];
export const h3 = items.node['h3'];
export const br = items.node['br'];
export const img = items.node['img'];
export const hr = items.node['hr'];
export const li = items.node['list_item'];
export const ol = items.node['ordered_list'];
export const ul = items.node['bullet_list'];
export const a = items.mark['a'];
export const em = items.mark['em'];
export const code = items.mark['code'];
export const strong = items.mark['strong'];

export function expectSameMatch(
   match: ContentMatch | undefined,
   pm_match: any
): void {
   expect(match).toBeDefined();

   if (match === undefined) {
      return;
   }
   let recurseCount = 0;

   const compareMatch = (m1: ContentMatch, m2: any) => {
      expect(m1.edgeCount).toBe(m2.edgeCount);
      expect(m1.validEnd).toBe(m2.validEnd);

      if (m1.defaultType !== undefined) {
         expect(m1.defaultType.name).toBe(m2.defaultType.name);
      } else {
         expect(m2.defaultType).toBeUndefined();
      }

      expect(m1.next.size()).toBe(m2.next.length / 2);

      m1.next.each((node, m, index) => {
         const pm_node = m2.next[index * 2];
         const pm_m = m2.next[index * 2 + 1];

         expect(node.name).toBe(pm_node.name);

         if (recurseCount < 25) {
            compareMatch(m, pm_m);
         }
         recurseCount++;
      });
   };

   compareMatch(match, pm_match);
}
