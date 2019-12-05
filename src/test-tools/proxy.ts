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
   DOMParser,
   Fragment,
   Slice
} from '@toba/test-prosemirror-model';
import { ReplaceStep } from '@toba/test-prosemirror-transform';

/**
 * Original ProseMirror methods and types for comparison, renamed to match
 * Toba.
 */
export const pm = {
   ContentMatch,
   Parser: DOMParser,
   nfaToDFA: dfa,
   mock,
   parseNFA: nfa,
   NodeType,
   nullFrom,
   ParseContext,
   parseExpr,
   takeAttrs,
   testSchema,
   TokenStream,
   Fragment,
   Slice,
   ReplaceStep
};
