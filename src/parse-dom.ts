import { Fragment } from './fragment';
import { Schema } from './schema';
import { AttributeMap } from './attribute';
import { Slice } from './slice';
import { ContentMatch } from './content';
import { HtmlNodeType } from './constants';
import { EditorNode } from './node';
import { ResolvedPos } from './resolved-pos';
import { ParseContext } from './parse-context';

type tagMap = { [key: string]: boolean };

export interface NodesToFind {
   node: Node;
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
   topNode?: Node;

   /**
    * Provide the starting content match that content parsed into the top node
    * is matched against.
    */
   topMatch?: ContentMatch;

   /**
    * A set of additional nodes to count as [context](#model.ParseRule.context)
    * when parsing, above the given [top node](#model.ParseOptions.topNode).
    */
   context?: ResolvedPos;
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
    * When true, ignore content that matches this rule.
    */
   ignore?: boolean;

   /**
    * When true, ignore the node that matches this rule, but do parse its
    * content.
    */
   skip?: boolean;

   /**
    * Attributes for the node or mark created by this rule. When `getAttrs` is
    * provided, it takes precedence.
    */
   attrs?: AttributeMap;

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
   getAttrs?: (match: Node | string) => AttributeMap | false;

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
   preserveWhitespace?: boolean | 'full';
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
   parse(dom: Node, options: ParseOptions = {}): EditorNode {
      const context = new ParseContext(this, options, false);
      context.addAll(dom, null, options.from, options.to);
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
   parseSlice(dom: Node, options: ParseOptions = {}): Slice {
      const context = new ParseContext(this, options, true);
      context.addAll(dom, null, options.from, options.to);
      return Slice.maxOpen(context.finish());
   }

   matchTag(dom: Node, context: ParseContext) {
      for (let i = 0; i < this.tags.length; i++) {
         let rule = this.tags[i];
         if (
            matches(dom, rule.tag) &&
            (rule.namespace === undefined ||
               dom.namespaceURI == rule.namespace) &&
            (!rule.context || context.matchesContext(rule.context))
         ) {
            if (rule.getAttrs) {
               const result = rule.getAttrs(dom);

               if (result === false) {
                  continue;
               }
               rule.attrs = result;
            }
            return rule;
         }
      }
   }

   matchStyle(prop, value, context) {
      for (let i = 0; i < this.styles.length; i++) {
         let rule = this.styles[i];
         if (
            rule.style.indexOf(prop) != 0 ||
            (rule.context && !context.matchesContext(rule.context)) ||
            // Test that the style string either precisely matches the prop,
            // or has an '=' sign after the prop, followed by the given
            // value.
            (rule.style.length > prop.length &&
               (rule.style.charCodeAt(prop.length) != 61 ||
                  rule.style.slice(prop.length + 1) != value))
         )
            continue;
         if (rule.getAttrs) {
            let result = rule.getAttrs(value);
            if (result === false) continue;
            rule.attrs = result;
         }
         return rule;
      }
   }

   static schemaRules(schema: Schema): ParseRule[] {
      const result: ParseRule[] = [];

      function insert(rule: ParseRule): void {
         const priority = rule.priority == null ? 50 : rule.priority;
         let i = 0;

         for (; i < result.length; i++) {
            const next = result[i];
            const nextPriority = next.priority == null ? 50 : next.priority;
            if (nextPriority < priority) {
               break;
            }
         }
         result.splice(i, 0, rule);
      }

      for (let name in schema.marks) {
         const rules = schema.marks[name].spec.parseDOM;

         if (rules !== undefined) {
            rules.forEach(rule => {
               insert((rule = copy(rule)));
               rule.mark = name;
            });
         }
      }

      for (let name in schema.nodes) {
         const rules = schema.nodes[name].spec.parseDOM;

         if (rules !== undefined) {
            rules.forEach(rule => {
               insert((rule = copy(rule)));
               rule.node = name;
            });
         }
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
 * The block-level tags in HTML5.
 */
const blockTags: tagMap = {
   address: true,
   article: true,
   aside: true,
   blockquote: true,
   canvas: true,
   dd: true,
   div: true,
   dl: true,
   fieldset: true,
   figcaption: true,
   figure: true,
   footer: true,
   form: true,
   h1: true,
   h2: true,
   h3: true,
   h4: true,
   h5: true,
   h6: true,
   header: true,
   hgroup: true,
   hr: true,
   li: true,
   noscript: true,
   ol: true,
   output: true,
   p: true,
   pre: true,
   section: true,
   table: true,
   tfoot: true,
   ul: true
};

/**
 * The tags that we normally ignore.
 */
const ignoreTags: tagMap = {
   head: true,
   noscript: true,
   object: true,
   script: true,
   style: true,
   title: true
};

/**
 * List tags.
 */
const listTags: tagMap = { ol: true, ul: true };

/**
 * Kludge to work around directly nested list nodes produced by some tools and
 * allowed by browsers to mean that the nested list is actually part of the list
 * item above it.
 */
function normalizeList(dom: Node) {
   for (
      let child = dom.firstChild, prevItem = null;
      child;
      child = child.nextSibling
   ) {
      const name: string | null =
         child.nodeType == HtmlNodeType.Element
            ? child.nodeName.toLowerCase()
            : null;

      if (name !== null && listTags.hasOwnProperty(name) && prevItem !== null) {
         prevItem.appendChild(child);
         child = prevItem;
      } else if (name == 'li') {
         prevItem = child;
      } else if (name !== null) {
         prevItem = null;
      }
   }
}

/**
 * Apply a CSS selector.
 */
function matches(dom: Node, selector: string): boolean {
   return (
      dom.matches ||
      dom.msMatchesSelector ||
      dom.webkitMatchesSelector ||
      dom.mozMatchesSelector
   ).call(dom, selector);
}

function copy(obj) {
   let copy = {};
   for (let prop in obj) copy[prop] = obj[prop];
   return copy;
}
