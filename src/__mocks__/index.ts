import { testSchema, TestTypeName } from '../test-schema';
import { makeTestItems } from '../test-maker';

/**
 * @see https://github.com/ProseMirror/prosemirror-test-builder/blob/master/src/index.js
 */
export const items = makeTestItems(testSchema, {
   p: { type: TestTypeName.Paragraph },
   pre: { type: TestTypeName.CodeBlock },
   h1: { type: TestTypeName.Heading, attrs: { level: 1 } },
   h2: { type: TestTypeName.Heading, attrs: { level: 2 } },
   h3: { type: TestTypeName.Heading, attrs: { level: 3 } },
   //li: { type: 'list_item' },
   //ul: { type: 'bullet_list' },
   //ol: { type: 'ordered_list' },
   br: { type: TestTypeName.Break },
   img: { type: TestTypeName.Image, attrs: { src: 'img.png' } },
   hr: { type: TestTypeName.Line },
   a: { type: TestTypeName.Link, isMark: true, attrs: { href: 'foo' } }
});

// from basic schema
/** Root node */
export const doc = items.node['doc'];
export const blockquote = items.node['blockquote'];

//
export const p = items.node['p'];
export const pre = items.node['pre'];
export const h1 = items.node['h1'];
export const h2 = items.node['h2'];
export const h3 = items.node['h3'];
export const br = items.node['br'];
export const img = items.node['img'];
export const hr = items.node['hr'];
export const a = items.mark['a'];
export const em = items.mark['em'];

// from list schema
// export const li = mock.node['li'];
// export const ul = mock.node['ul'];
// export const ol = mock.node['ol'];
