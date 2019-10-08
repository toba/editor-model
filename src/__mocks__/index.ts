import { basicSchema as basic, SchemaType } from './basic-schema';
//import { addListNodes } from 'prosemirror-schema-list';
import { Schema } from '../schema';
import { makeMockers } from './mocker';

const testSchema = new Schema({
   nodes: basic.spec.nodes,
   marks: basic.spec.marks
});

/**
 * @see https://github.com/ProseMirror/prosemirror-test-builder/blob/master/src/index.js
 */
export const mock = makeMockers(testSchema, {
   p: { type: SchemaType.Paragraph },
   pre: { type: SchemaType.CodeBlock },
   h1: { type: SchemaType.Heading, attrs: { level: 1 } },
   h2: { type: SchemaType.Heading, attrs: { level: 2 } },
   h3: { type: SchemaType.Heading, attrs: { level: 3 } },
   //li: { type: 'list_item' },
   //ul: { type: 'bullet_list' },
   //ol: { type: 'ordered_list' },
   br: { type: SchemaType.Break },
   img: { type: SchemaType.Image, attrs: { src: 'img.png' } },
   hr: { type: SchemaType.Line },
   a: { type: SchemaType.Link, isMark: true, attrs: { href: 'foo' } }
});

// from basic schema
/** Root node */
export const doc = mock.node['doc'];
export const blockquote = mock.node['blockquote'];

//
export const p = mock.node['p'];
export const pre = mock.node['pre'];
export const h1 = mock.node['h1'];
export const h2 = mock.node['h2'];
export const h3 = mock.node['h3'];
export const br = mock.node['br'];
export const img = mock.node['img'];
export const hr = mock.node['hr'];
export const a = mock.mark['a'];
export const em = mock.mark['em'];

// from list schema
// export const li = mock.node['li'];
// export const ul = mock.node['ul'];
// export const ol = mock.node['ol'];
