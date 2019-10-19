import { forEach } from '@toba/tools';
import { Schema } from '../schema/';
import { EditorNode, Fragment, Slice } from '../node/';
import { ParseRule } from './parse-rule';
import { ParseContext } from './parse-context';
import { ParseOptions } from './parse-options';

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

      forEach(rules, rule => {
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

   /**
    * Retrieve standard parsing rule for the given HTML Element.
    */
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

   /**
    * Infer parsing rules from schema marks and nodes.
    */
   static schemaRules(schema: Schema): ParseRule[] {
      const defaultPriority = 50;
      const result: ParseRule[] = [];

      /**
       * Insert rule positioned according to its priority.
       */
      function insert(rule: ParseRule): void {
         const priority =
            rule.priority === undefined ? defaultPriority : rule.priority;
         let i = 0;

         for (; i < result.length; i++) {
            const next: ParseRule = result[i];
            const nextPriority =
               next.priority === undefined ? defaultPriority : next.priority;

            if (nextPriority < priority) {
               break;
            }
         }
         result.splice(i, 0, rule);
      }

      function updateRule(fn: (rule: ParseRule) => void, rules?: ParseRule[]) {
         if (rules !== undefined) {
            forEach(rules, r => {
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
    * Build a `DOMParser` using schema `EditorNode` and `Mark` specs sorted by
    * `ParseRule.priority`.
    */
   static fromSchema(schema: Schema): DOMParser {
      let parser: DOMParser = schema.cached.domParser;

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
