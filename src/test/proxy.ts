import mock, { testSchema, takeAttrs } from '@toba/test-prosemirror-tester';
import {
   nfa,
   dfa,
   nullFrom,
   TokenStream,
   parseExpr,
   NodeType,
   ContentMatch,
   ParseContext,
   DOMParser
} from '@toba/test-prosemirror-model';

/**
 * Original ProseMirror methods and types for comparison.
 */
export const pm = {
   ContentMatch,
   DOMParser,
   nfaToDFA: dfa,
   mock,
   parseNFA: nfa,
   NodeType,
   nullFrom,
   ParseContext,
   parseExpr,
   takeAttrs,
   testSchema,
   TokenStream
};
