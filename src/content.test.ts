import '@toba/test';
import { is } from '@toba/tools';
import { Schema } from './schema';
import { ContentMatch } from './content';
import { doc, p, hr } from './__mocks__/';
import {
   basicSchema,
   SchemaType,
   typeSequence
} from './__mocks__/basic-schema';
import { NodeType } from './node-type';
import { EditorNode } from './node';
import { Fragment } from './fragment';

// https://github.com/ProseMirror/prosemirror-model/blob/master/test/test-content.js

const schema = new Schema({
   nodes: basicSchema.spec.nodes,
   marks: basicSchema.spec.marks
});

const get = (pattern: string): ContentMatch =>
   ContentMatch.parse(pattern, schema.nodes);

function match(pattern: string, types?: string): boolean {
   const ts: NodeType[] = is.empty(types)
      ? []
      : types.split(' ').map(t => schema.nodes[t]);

   let m: ContentMatch | undefined = get(pattern);

   for (let i = 0; m !== undefined && i < ts.length; i++) {
      m = m.matchType(ts[i]);
   }
   return m !== undefined && m.validEnd;
}

function valid(pattern: string, types: string) {
   expect(match(pattern, types)).toBe(true);
}
function invalid(pattern: string, types: string) {
   expect(match(pattern, types)).toBe(false);
}

function fill(
   pattern: string,
   before: EditorNode,
   after: EditorNode,
   result?: EditorNode
) {
   const m: ContentMatch | undefined = get(pattern).matchFragment(
      before.content
   );
   const filled: Fragment | undefined =
      m !== undefined ? m.fillBefore(after.content, true) : Fragment.empty;

   if (result !== undefined) {
      expect(filled).toEqual(result.content);
   } else {
      expect(filled).not.toBeDefined();
   }
}

function fill3(
   expr: string,
   before: EditorNode,
   mid: EditorNode,
   after: EditorNode,
   left?: EditorNode,
   right?: EditorNode
) {
   const m = get(expr);
   const aMatch = m.matchFragment(before.content);

   let a: Fragment | undefined;
   let b: Fragment | undefined;

   if (aMatch !== undefined) {
      a = aMatch.fillBefore(mid.content);
   }

   if (a !== undefined) {
      const bMatch = m.matchFragment(
         before.content.append(a).append(mid.content)
      );
      if (bMatch !== undefined) {
         b = bMatch.fillBefore(after.content, true);
      }
   }

   if (left !== undefined && right !== undefined) {
      expect(a).toEqual(left.content);
      expect(b).toEqual(right.content);
   } else {
      expect(b).not.toBeDefined();
   }
}

describe('matchType', () => {
   it('accepts empty content for the empty expr', () => valid('', ''));
   it("doesn't accept content in the empty expr", () =>
      invalid('', SchemaType.Image));
   it('matches nothing to an asterisk', () => valid('image*', ''));
   it('matches one element to an asterisk', () =>
      valid('image*', SchemaType.Image));
   it('matches multiple elements to an asterisk', () =>
      valid('image*', 'image image image image'));
   it('only matches appropriate elements to an asterisk', () =>
      invalid('image*', 'image text'));

   it('matches group members to a group', () => valid('inline*', 'image text'));
   it("doesn't match non-members to a group", () =>
      invalid('inline*', SchemaType.Paragraph));
   it('matches an element to a choice expression', () =>
      valid('(paragraph | heading)', SchemaType.Paragraph));
   it("doesn't match unmentioned elements to a choice expr", () =>
      invalid(`(paragraph | heading)`, SchemaType.Image));

   it('matches a simple sequence', () => {
      const seq = typeSequence(
         SchemaType.Paragraph,
         SchemaType.Line,
         SchemaType.Paragraph
      );
      valid(seq, seq);
   });
   it('fails when a sequence is too long', () =>
      invalid(
         'paragraph horizontal_rule',
         'paragraph horizontal_rule paragraph'
      ));
   it('fails when a sequence is too short', () =>
      invalid(
         'paragraph horizontal_rule paragraph',
         typeSequence(SchemaType.Paragraph, SchemaType.Line)
      ));
   it('fails when a sequence starts incorrectly', () =>
      invalid(
         'paragraph horizontal_rule',
         'horizontal_rule paragraph horizontal_rule'
      ));

   it('accepts a sequence asterisk matching zero elements', () =>
      valid('heading paragraph*', SchemaType.Heading));
   it('accepts a sequence asterisk matching multiple elts', () =>
      valid(
         'heading paragraph*',
         typeSequence(
            SchemaType.Heading,
            SchemaType.Paragraph,
            SchemaType.Paragraph
         )
      ));
   it('accepts a sequence plus matching one element', () =>
      valid(
         'heading paragraph+',
         typeSequence(SchemaType.Heading, SchemaType.Paragraph)
      ));
   it('accepts a sequence plus matching multiple elts', () =>
      valid(
         'heading paragraph+',
         typeSequence(
            SchemaType.Heading,
            SchemaType.Paragraph,
            SchemaType.Paragraph
         )
      ));
   it('fails when a sequence plus has no elements', () =>
      invalid('heading paragraph+', SchemaType.Heading));
   it('fails when a sequence plus misses its start', () =>
      invalid(
         'heading paragraph+',
         typeSequence(SchemaType.Paragraph, SchemaType.Paragraph)
      ));

   it('accepts an optional element being present', () =>
      valid('image?', SchemaType.Image));
   it('accepts an optional element being missing', () => valid('image?', ''));
   it('fails when an optional element is present twice', () =>
      invalid('image?', typeSequence(SchemaType.Image, SchemaType.Image)));

   it('accepts a nested repeat', () =>
      valid(
         '(heading paragraph+)+',
         'heading paragraph heading paragraph paragraph'
      ));
   it('fails on extra input after a nested repeat', () =>
      invalid(
         '(heading paragraph+)+',
         'heading paragraph heading paragraph paragraph horizontal_rule'
      ));

   it('accepts a matching count', () =>
      valid('hard_break{2}', typeSequence(SchemaType.Break, SchemaType.Break)));
   it('rejects a count that comes up short', () =>
      invalid('hard_break{2}', SchemaType.Break));
   it('rejects a count that has too many elements', () =>
      invalid('hard_break{2}', 'hard_break hard_break hard_break'));
   it('accepts a count on the lower bound', () =>
      valid(
         'hard_break{2, 4}',
         typeSequence(SchemaType.Break, SchemaType.Break)
      ));
   it('accepts a count on the upper bound', () =>
      valid('hard_break{2, 4}', 'hard_break hard_break hard_break hard_break'));
   it('accepts a count between the bounds', () =>
      valid(
         'hard_break{2, 4}',
         typeSequence(SchemaType.Break, SchemaType.Break, SchemaType.Break)
      ));
   it('rejects a sequence with too few elements', () =>
      invalid('hard_break{2, 4}', SchemaType.Break));
   it('rejects a sequence with too many elements', () =>
      invalid(
         'hard_break{2, 4}',
         'hard_break hard_break hard_break hard_break hard_break'
      ));
   it('rejects a sequence with a bad element after it', () =>
      invalid('hard_break{2, 4} text*', 'hard_break hard_break image'));
   it('accepts a sequence with a matching element after it', () =>
      valid(
         'hard_break{2, 4} image?',
         typeSequence(SchemaType.Break, SchemaType.Break, SchemaType.Image)
      ));
   it('accepts an open range', () =>
      valid(
         'hard_break{2,}',
         typeSequence(SchemaType.Break, SchemaType.Break)
      ));
   it('accepts an open range matching many', () =>
      valid('hard_break{2,}', 'hard_break hard_break hard_break hard_break'));
   it('rejects an open range with too few elements', () =>
      invalid('hard_break{2,}', SchemaType.Break));
});

describe('fillBefore', () => {
   it('returns the empty fragment when things match', () =>
      fill(
         typeSequence(
            SchemaType.Paragraph,
            SchemaType.Line,
            SchemaType.Paragraph
         ),
         doc(p(), hr),
         doc(p()),
         doc()
      ));

   it('adds a node when necessary', () =>
      fill(
         typeSequence(
            SchemaType.Paragraph,
            SchemaType.Line,
            SchemaType.Paragraph
         ),
         doc(p()),
         doc(p()),
         doc(hr)
      ));
});
