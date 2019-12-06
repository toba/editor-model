export { pm } from './proxy';
export {
   makeTestItems,
   TestNode,
   NodeMaker,
   typeSequence,
   repeatType
} from './test-maker';

import {
   expectSameMatch,
   expectSameNode,
   expectSameNodeContext,
   expectSameNodeType,
   expectSameParseContext,
   expectSameNFA,
   expectSameStep,
   expectSameStepResult,
   expectSameLocation
} from './expect-same';

import {
   makeStreams,
   makeExpressions,
   makeNFA,
   makeNodeTypes,
   makeParseContext,
   makeParseMatch,
   makeFragMatch,
   makeReplaceStep,
   makeTextFragment,
   makeTextDoc
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
   parseContext: makeParseContext,
   parseMatch: makeParseMatch,
   fragMatch: makeFragMatch,
   replaceStep: makeReplaceStep,
   textFragment: makeTextFragment,
   textDoc: makeTextDoc
};

/**
 * Expect objects created by Toba and ProseMirror to match.
 */
export const expectSame = {
   match: expectSameMatch,
   NFA: expectSameNFA,
   node: expectSameNode,
   nodeContext: expectSameNodeContext,
   nodeType: expectSameNodeType,
   parseContext: expectSameParseContext,
   step: expectSameStep,
   stepResult: expectSameStepResult,
   location: expectSameLocation
};
