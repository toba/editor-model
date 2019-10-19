export { pm } from './proxy';
export { makeTestItems, TestNode } from './test-maker';
export {
   Item,
   Group,
   typeSequence,
   repeatType,
   testSchema
} from './test-schema';
import { expectSameMatch } from './expect';

import {
   makeStreams,
   makeExpressions,
   makeNFA,
   makeNodeTypes
} from './compare';

/**
 * Methods that create Toba and ProseMirror instances of the same types for
 * comparison.
 */
export const compare = {
   streams: makeStreams,
   expressions: makeExpressions,
   nfa: makeNFA,
   nodeTypes: makeNodeTypes,
   expectSameMatch
};
