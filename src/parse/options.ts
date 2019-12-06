import { EditorNode } from '../node';
import { ContentMatch } from '../match';
import { ParseRule } from './rule';
import { Location } from '../location';

export interface NodesToFind {
   node: Node;
   pos?: number;
   offset: number;
}

/**
 * Options recognized by the `parse` and `parseSlice` methods.
 */
export interface ParseOptions {
   /**
    * By default, whitespace is collapsed as per HTML's rules. Pass `true` to
    * preserve whitespace, but normalize newlines to spaces, and `"full"` to
    * preserve whitespace entirely.
    */
   preserveSpace?: boolean | 'full';

   /**
    * When given, the parser will, beside parsing the content, record the
    * document positions of the given DOM positions. It will do so by writing
    * to the objects, adding a `pos` property that holds the document position.
    * DOM positions that are not in the parsed content will not be written to.
    */
   findPositions?: NodesToFind[];

   /**
    * The child node index to start parsing from.
    */
   from?: number;

   /**
    * The child node index to stop parsing at.
    */
   to?: number;

   /**
    * By default, content is parsed into the schema's default `topNodeType`. You
    * can pass this option to use the type and attributes from a different node
    * as the top container.
    */
   topNode?: EditorNode;

   /**
    * TODO: this wasn't documented
    */
   topOpen?: any;

   /**
    * Provide the starting content match that content parsed into the top node
    * is matched against.
    */
   topMatch?: ContentMatch;

   /**
    * A set of additional nodes to count as `ParseRule.context` when parsing,
    * above the given `ParseOptions.topNode`.
    * TODO: this comment doesn't make sense
    */
   context?: Location;

   /**
    * Custom method to return a parsing rule for a specific DOM node.
    */
   ruleFromNode?: (n: Node) => ParseRule;
}
