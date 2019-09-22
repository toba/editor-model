import { Fragment } from './fragment';
import { Schema } from './schema';
import { AttributeMap, Attributes } from './attribute';
import { Slice } from './slice';
import { ContentMatch } from './content';
import { EditorNode } from './node';
import { ResolvedPos } from './resolved-pos';
import { ParseContext, PreserveWhitespace } from './parse-context';

export interface NodesToFind {
   node: Node;
   pos?: number;
   offset: number;
}

/**
 * These are the options recognized by the [`parse`](#model.DOMParser.parse) and
 * [`parseSlice`](#model.DOMParser.parseSlice) methods.
 */
export interface ParseOptions {
   /**
    * By default, whitespace is collapsed as per HTML's rules. Pass `true` to
    * preserve whitespace, but normalize newlines to spaces, and `"full"` to
    * preserve whitespace entirely.
    */
   preserveWhitespace?: boolean | 'full';

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
    * By default, the content is parsed into the schema's default
    * [top node type](#model.Schema.topNodeType). You can pass this option to
    * use the type and attributes from a different node as the top container.
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
    * A set of additional nodes to count as [context](#model.ParseRule.context)
    * when parsing, above the given [top node](#model.ParseOptions.topNode).
    * TODO: this comment doesn't make sense
    */
   context?: ResolvedPos;

   ruleFromNode?: (n: Node) => ParseRule;
}

/**
 * A value that describes how to parse a given DOM node or inline style as a
 * node or mark.
 */
export interface ParseRule {
   /**
    * A CSS selector describing the kind of DOM elements to match. A single rule
    * should have _either_ a `tag` or a `style` property.
    */
   tag?: string;

   /**
    * The namespace to match. This should be used with `tag`. Nodes are only
    * matched when the namespace matches or this property is `null`.
    */
   namespace?: string | null;

   /**
    * A CSS property name to match. When given, this rule matches inline styles
    * that list that property. May also have the form `"property=value"`, in
    * which case the rule only matches if the propery's value exactly matches
    * the given value. (For more complicated filters,
    * use [`getAttrs`](#model.ParseRule.getAttrs) and return `false` to indicate
    * that the match failed.)
    */
   style?: string;

   /**
    * Can be used to change the order in which the parse rules in a schema are
    * tried. Those with higher priority come first. Rules without a priority are
    * counted as having priority 50. This property is only meaningful in a
    * schema—when directly constructing a parser, the order of the rule array is
    * used.
    */
   priority?: number;

   /**
    * When given, restricts this rule to only match when the current context—the
    * parent nodes into which the content is being parsed—matches this
    * expression. Should contain one or more node names or node group names
    * followed by single or double slashes. For example `"paragraph/"` means the
    * rule only matches when the parent node is a paragraph,
    * `"blockquote/paragraph/"` restricts it to be in a paragraph that is inside
    * a blockquote, and `"section//"` matches any position inside a section—a
    * double slash matches any sequence of ancestor nodes. To allow multiple
    * different contexts, they can be separated by a pipe (`|`) character, as in
    * `"blockquote/|list_item/"`.
    */
   context?: string;

   /**
    * The name of the node type to create when this rule matches. Only valid for
    * rules with a `tag` property, not for style rules. Each rule should have
    * one of a `node`, `mark`, or `ignore` property (except when it appears in a
    * [node](#model.NodeSpec.parseDOM) or [mark spec](#model.MarkSpec.parseDOM),
    * in which case the `node` or `mark` property will be derived from its
    * position).
    */
   node?: string;

   /**
    * The name of the mark type to wrap the matched content in.
    */
   mark?: string;

   /**
    * When `true`, ignore content that matches this rule.
    */
   ignore?: boolean;

   /**
    * When defined, ignore the node that matches this rule, but do parse its
    * content.
    */
   skip?: Node;

   /**
    * Attributes for the node or mark created by this rule. When `getAttrs` is
    * provided, it takes precedence.
    */
   attrs?: Attributes;

   /**
    * A function used to compute the attributes for the node or mark created by
    * this rule. Can also be used to describe further conditions the DOM element
    * or style must match. When it returns `false`, the rule won't match. When
    * it returns `null` or `undefined`, that is interpreted as an empty/default
    * set of attributes.
    *
    * Called with a DOM Element for `tag` rules, and with a string (the style's
    * value) for `style` rules.
    */
   getAttrs?: (match: HTMLElement | string) => Attributes | undefined | false;

   /**
    * For `tag` rules that produce non-leaf nodes or marks, by default the
    * content of the DOM element is parsed as content of the mark or node. If
    * the child nodes are in a descendent node, this may be a CSS selector
    * string that the parser must use to find the actual content element, or a
    * function that returns the actual content element to the parser.
    */
   contentElement?: string | ((n: Node) => Node);

   /**
    * Can be used to override the content of a matched node. When present,
    * instead of parsing the node's child nodes, the result of this function is
    * used.
    */
   getContent?: (node: Node, schema: Schema) => Fragment;

   /**
    * Controls whether whitespace should be preserved when parsing the content
    * inside the matched element. `false` means whitespace may be collapsed,
    * `true` means that whitespace should be preserved but newlines normalized
    * to spaces, and `"full"` means that newlines should also be preserved.
    */
   preserveWhitespace?: PreserveWhitespace;
}

function assignAttributes(
   rule: ParseRule,
   from: HTMLElement | string
): ParseRule {
   if (rule.getAttrs !== undefined) {
      const result = rule.getAttrs(from);

      if (result !== false) {
         rule.attrs = result;
      }
   }
   return rule;
}

/**
 * A DOM parser represents a strategy for parsing DOM content into a document
 * conforming to a given schema. Its behavior is defined by an array of
 * [rules](#model.ParseRule).
 */
export class DOMParser {
   /** Schema into which the parser parses */
   schema: Schema;
   /**
    * The set of [parse rules](#model.ParseRule) that the parser uses, in order
    * of precedence.
    */
   private rules: ParseRule[];
   private tags: ParseRule[];
   private styles: ParseRule[];

   /**
    * Create a parser that targets the given schema, using the given parsing
    * rules.
    */
   constructor(schema: Schema, rules: ParseRule[]) {
      this.schema = schema;
      this.rules = rules;
      this.tags = [];
      this.styles = [];

      rules.forEach(rule => {
         if (rule.tag !== undefined) {
            this.tags.push(rule);
         } else if (rule.style !== undefined) {
            this.styles.push(rule);
         }
      });
   }

   /**
    * Parse a document from the content of a DOM node.
    */
   parse(
      node: Node,
      options: ParseOptions = Object.create(null)
   ): EditorNode | Fragment {
      const context = new ParseContext(this, options, false);
      context.addAll(node, undefined, options.from, options.to);
      return context.finish();
   }

   /**
    * Parses the content of the given DOM node, like
    * [`parse`](#model.DOMParser.parse), and takes the same set of options. But
    * unlike that method, which produces a whole node, this one returns a slice
    * that is open at the sides, meaning that the schema constraints aren't
    * applied to the start of nodes to the left of the input and the end of
    * nodes at the end.
    */
   parseSlice(node: Node, options: ParseOptions = Object.create(null)): Slice {
      const context = new ParseContext(this, options, true);
      context.addAll(node, undefined, options.from, options.to);
      return Slice.maxOpen(context.finish() as Fragment);
   }

   matchTag(el: HTMLElement, context: ParseContext) {
      for (let i = 0; i < this.tags.length; i++) {
         const rule: ParseRule = this.tags[i];
         if (
            rule.tag !== undefined &&
            matches(el, rule.tag) &&
            (rule.namespace === undefined ||
               el.namespaceURI == rule.namespace) &&
            (rule.context === undefined || context.matches(rule.context))
         ) {
            return assignAttributes(rule, el);
         }
      }
   }

   matchStyle(
      key: string,
      value: string,
      context: ParseContext
   ): ParseRule | undefined {
      for (let i = 0; i < this.styles.length; i++) {
         const rule: ParseRule = this.styles[i];

         if (rule.style !== undefined) {
            if (rule.style.startsWith(key)) {
               return;
            }
            if (
               rule.style.length > key.length &&
               (rule.style.charCodeAt(key.length) != 61 ||
                  rule.style.slice(key.length + 1) != value)
            ) {
               // style string either precisely matches the prop or has an '='
               // sign after the prop, followed by the given value.
               return;
            }
         }

         if (rule.context !== undefined && !context.matches(rule.context)) {
            return;
         }
         return assignAttributes(rule, value);
      }
   }

   static schemaRules(schema: Schema): ParseRule[] {
      const result: ParseRule[] = [];

      function insert(rule: ParseRule): void {
         const priority = rule.priority == null ? 50 : rule.priority;
         let i = 0;

         for (; i < result.length; i++) {
            const next: ParseRule = result[i];
            const nextPriority = next.priority == null ? 50 : next.priority;

            if (nextPriority < priority) {
               break;
            }
         }
         result.splice(i, 0, rule);
      }

      function updateRule(fn: (rule: ParseRule) => void, rules?: ParseRule[]) {
         if (rules !== undefined) {
            rules.forEach(r => {
               insert((r = copy<ParseRule>(r)));
               fn(r);
            });
         }
      }

      for (let name in schema.marks) {
         updateRule(r => (r.mark = name), schema.marks[name].spec.parseDOM);
      }

      for (let name in schema.nodes) {
         updateRule(r => (r.node = name), schema.nodes[name].spec.parseDOM);
      }

      return result;
   }

   /**
    * Construct a DOM parser using the parsing rules listed in a schema's
    * [node specs](#model.NodeSpec.parseDOM), reordered by
    * [priority](#model.ParseRule.priority).
    */
   static fromSchema(schema: Schema): DOMParser {
      let parser = schema.cached.domParser;

      if (parser === undefined) {
         parser = new DOMParser(schema, DOMParser.schemaRules(schema));
         schema.cached.domParser = parser;
      }
      return parser;
   }
}

/**
 * Apply a CSS selector.
 */
function matches(el: Element, selector: string): boolean {
   return (
      el.matches ||
      el.webkitMatchesSelector ||
      (el as any).msMatchesSelector ||
      (el as any).mozMatchesSelector
   ).call(el, selector);
}

/**
 * Shallow object copy.
 */
function copy<T extends object>(obj: T): T {
   const copy = Object.create(null) as T;
   for (let prop in obj) {
      copy[prop] = obj[prop];
   }
   return copy;
}
