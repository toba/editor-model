import '@toba/test';
import { is } from '@toba/tools';
import { Schema } from './schema';
import { ContentMatch } from './match';
import { ContentMatch as pm_ContentMatch } from 'prosemirror-model';
import { doc, p, hr } from './__mocks__';
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

/**
 * Match nodes in the test schema.
 */
const matchNodes = (pattern: string): ContentMatch =>
   ContentMatch.parse(pattern, schema.nodes);

/**
 * @param typeNames Space-delimited `NodeType` names
 */
function match(pattern: string, typeNames?: string): boolean {
   const types: NodeType[] = is.empty(typeNames)
      ? []
      : typeNames.split(' ').map(t => schema.nodes[t]);

   let m: ContentMatch | undefined = matchNodes(pattern);

   for (let i = 0; m !== undefined && i < types.length; i++) {
      m = m.matchType(types[i]);
   }
   return m !== undefined && m.validEnd;
}

/**
 * Expect pattern to match node types within test schema.
 * @param typeNames Space-delimited `NodeType` names
 */
function expectMatch(pattern: string, typeNames: string) {
   expect(match(pattern, typeNames)).toBe(true);
}

/**
 * Expect pattern _not_ to match node types within test schema.
 * @param typeNames Space-delimited `NodeType` names
 */
function expectMismatch(pattern: string, typeNames: string) {
   expect(match(pattern, typeNames)).toBe(false);
}

function fill(
   pattern: string,
   before: EditorNode,
   after: EditorNode,
   result?: EditorNode
) {
   const m: ContentMatch | undefined = matchNodes(pattern).matchFragment(
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
   const m = matchNodes(expr);
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
   it('accepts empty content for the empty expr', () => expectMatch('', ''));
   it("doesn't accept content in the empty expr", () =>
      expectMismatch('', SchemaType.Image));
   it('matches nothing to an asterisk', () => expectMatch('image*', ''));
   it('matches one element to an asterisk', () =>
      expectMatch('image*', SchemaType.Image));
   it('matches multiple elements to an asterisk', () =>
      expectMatch('image*', 'image image image image'));
   it('only matches appropriate elements to an asterisk', () =>
      expectMismatch('image*', 'image text'));

   it('matches group members to a group', () =>
      expectMatch('inline*', 'image text'));
   it("doesn't match non-members to a group", () =>
      expectMismatch('inline*', SchemaType.Paragraph));
   it('matches an element to a choice expression', () =>
      expectMatch('(paragraph | heading)', SchemaType.Paragraph));
   it("doesn't match unmentioned elements to a choice expr", () =>
      expectMismatch(`(paragraph | heading)`, SchemaType.Image));

   it('matches a simple sequence', () => {
      const seq = typeSequence(
         SchemaType.Paragraph,
         SchemaType.Line,
         SchemaType.Paragraph
      );
      expectMatch(seq, seq);
   });
   it('fails when a sequence is too long', () =>
      expectMismatch(
         'paragraph horizontal_rule',
         'paragraph horizontal_rule paragraph'
      ));
   it('fails when a sequence is too short', () =>
      expectMismatch(
         'paragraph horizontal_rule paragraph',
         typeSequence(SchemaType.Paragraph, SchemaType.Line)
      ));
   it('fails when a sequence starts incorrectly', () =>
      expectMismatch(
         'paragraph horizontal_rule',
         'horizontal_rule paragraph horizontal_rule'
      ));

   it('accepts a sequence asterisk matching zero elements', () =>
      expectMatch('heading paragraph*', SchemaType.Heading));
   it('accepts a sequence asterisk matching multiple elts', () =>
      expectMatch(
         'heading paragraph*',
         typeSequence(
            SchemaType.Heading,
            SchemaType.Paragraph,
            SchemaType.Paragraph
         )
      ));
   it('accepts a sequence plus matching one element', () =>
      expectMatch(
         'heading paragraph+',
         typeSequence(SchemaType.Heading, SchemaType.Paragraph)
      ));
   it('accepts a sequence plus matching multiple elts', () =>
      expectMatch(
         'heading paragraph+',
         typeSequence(
            SchemaType.Heading,
            SchemaType.Paragraph,
            SchemaType.Paragraph
         )
      ));
   it('fails when a sequence plus has no elements', () =>
      expectMismatch('heading paragraph+', SchemaType.Heading));
   it('fails when a sequence plus misses its start', () =>
      expectMismatch(
         'heading paragraph+',
         typeSequence(SchemaType.Paragraph, SchemaType.Paragraph)
      ));

   it('accepts an optional element being present', () =>
      expectMatch('image?', SchemaType.Image));
   it('accepts an optional element being missing', () =>
      expectMatch('image?', ''));
   it('fails when an optional element is present twice', () =>
      expectMismatch(
         'image?',
         typeSequence(SchemaType.Image, SchemaType.Image)
      ));

   it('accepts a nested repeat', () =>
      expectMatch(
         '(heading paragraph+)+',
         'heading paragraph heading paragraph paragraph'
      ));
   it('fails on extra input after a nested repeat', () =>
      expectMismatch(
         '(heading paragraph+)+',
         'heading paragraph heading paragraph paragraph horizontal_rule'
      ));

   it('accepts a matching count', () =>
      expectMatch(
         'hard_break{2}',
         typeSequence(SchemaType.Break, SchemaType.Break)
      ));
   it('rejects a count that comes up short', () =>
      expectMismatch('hard_break{2}', SchemaType.Break));
   it('rejects a count that has too many elements', () =>
      expectMismatch('hard_break{2}', 'hard_break hard_break hard_break'));
   it('accepts a count on the lower bound', () =>
      expectMatch(
         'hard_break{2, 4}',
         typeSequence(SchemaType.Break, SchemaType.Break)
      ));
   it('accepts a count on the upper bound', () =>
      expectMatch(
         'hard_break{2, 4}',
         'hard_break hard_break hard_break hard_break'
      ));
   it('accepts a count between the bounds', () =>
      expectMatch(
         'hard_break{2, 4}',
         typeSequence(SchemaType.Break, SchemaType.Break, SchemaType.Break)
      ));
   it('rejects a sequence with too few elements', () =>
      expectMismatch('hard_break{2, 4}', SchemaType.Break));
   it('rejects a sequence with too many elements', () =>
      expectMismatch(
         'hard_break{2, 4}',
         'hard_break hard_break hard_break hard_break hard_break'
      ));
   it('rejects a sequence with a bad element after it', () =>
      expectMismatch('hard_break{2, 4} text*', 'hard_break hard_break image'));
   it('accepts a sequence with a matching element after it', () =>
      expectMatch(
         'hard_break{2, 4} image?',
         typeSequence(SchemaType.Break, SchemaType.Break, SchemaType.Image)
      ));
   it('accepts an open range', () =>
      expectMatch(
         'hard_break{2,}',
         typeSequence(SchemaType.Break, SchemaType.Break)
      ));
   it('accepts an open range matching many', () =>
      expectMatch(
         'hard_break{2,}',
         'hard_break hard_break hard_break hard_break'
      ));
   it('rejects an open range with too few elements', () =>
      expectMismatch('hard_break{2,}', SchemaType.Break));
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

   it.skip('adds nodes in the same way as ProseMirror', () => {
      const pattern = typeSequence(
         SchemaType.Paragraph,
         SchemaType.Line,
         SchemaType.Paragraph
      );
      const match = ContentMatch.parse(pattern, schema.nodes);
      const pm_match = pm_ContentMatch.parse(pattern, schema.nodes);

      expect(match.edgeCount).toBe(pm_match.edgeCount);
   });

   it.skip('adds a node when necessary', () =>
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
