import { Mark } from './mark';
import { NodeContext, Whitespace } from './node-context';
import { DOMParser, ParseOptions, NodesToFind } from './parse-dom';
import { HtmlNodeType } from './constants';

function wsOptionsFor(preserveWhitespace?: boolean | 'full') {
   return (
      (preserveWhitespace ? Whitespace.Preserve : 0) |
      (preserveWhitespace === 'full' ? Whitespace.Full : 0)
   );
}

/**
 * Tokenize a style attribute into property/value pairs.
 */
function parseStyles(style: string): string[] {
   const re = /\s*([\w-]+)\s*:\s*([^;]+)/g;
   const result: string[] = [];
   let m;

   while ((m = re.exec(style))) {
      result.push(m[1], m[2].trim());
   }
   return result;
}

export class ParseContext {
   private parser: DOMParser;
   private options: ParseOptions;
   private isOpen: boolean;
   private pendingMarks: Mark[];
   private nodes: NodeContext[];
   /**
    * [Mark] The current set of marks
    * TODO: this comment seems wrong
    */
   private open: number;
   private find: NodesToFind[] | undefined;
   private needsBlock: boolean;

   constructor(parser: DOMParser, options: ParseOptions, open: boolean) {
      this.parser = parser;
      // : Object The options passed to this parse.
      this.options = options;
      this.isOpen = open;
      this.pendingMarks = [];

      let topNode = options.topNode;
      let topContext: NodeContext;
      let topOptions =
         wsOptionsFor(options.preserveWhitespace) |
         (open ? Whitespace.OpenLeft : 0);

      if (topNode) {
         topContext = new NodeContext(
            topNode.type,
            topNode.attrs,
            Mark.none,
            true,
            options.topMatch || topNode.type.contentMatch,
            topOptions
         );
      } else if (open) {
         topContext = new NodeContext(
            null,
            null,
            Mark.none,
            true,
            null,
            topOptions
         );
      } else {
         topContext = new NodeContext(
            parser.schema.topNodeType,
            null,
            Mark.none,
            true,
            null,
            topOptions
         );
      }
      this.nodes = [topContext];
      this.open = 0;
      this.find = options.findPositions;
      this.needsBlock = false;
   }

   get top() {
      return this.nodes[this.open];
   }

   /**
    * Add a DOM node to the content. Text is inserted as text node, otherwise,
    * the node is passed to `addElement` or, if it has a `style` attribute,
    * `addElementWithStyles`.
    */
   addDOM(node: Node) {
      if (node.nodeType == HtmlNodeType.Text) {
         this.addTextNode(node);
      } else if (node.nodeType == HtmlNodeType.Element) {
         const el = node as Element;
         const style = el.getAttribute('style');
         const marks = style ? this.readStyles(parseStyles(style)) : null;

         if (marks !== null) {
            marks.forEach(this.addPendingMark);
         }
         this.addElement(node);

         if (marks !== null) {
            marks.forEach(this.removePendingMark);
         }
      }
   }

   addTextNode(dom: Node) {
      const value = dom.nodeValue;
      const top = this.top;
      if (
         (top.type
            ? top.type.inlineContent
            : top.content.length && top.content[0].isInline) ||
         /\S/.test(value)
      ) {
         if (!(top.options & Whitespace.Preserve)) {
            value = value.replace(/\s+/g, ' ');
            // If this starts with whitespace, and there is no node before it, or
            // a hard break, or a text node that ends with whitespace, strip the
            // leading space.
            if (/^\s/.test(value) && this.open == this.nodes.length - 1) {
               let nodeBefore = top.content[top.content.length - 1];
               let domNodeBefore = dom.previousSibling;
               if (
                  !nodeBefore ||
                  (domNodeBefore && domNodeBefore.nodeName == 'BR') ||
                  (nodeBefore.isText && /\s$/.test(nodeBefore.text))
               )
                  value = value.slice(1);
            }
         } else if (!(top.options & OPT_PRESERVE_WS_FULL)) {
            value = value.replace(/\r?\n|\r/g, ' ');
         }
         if (value) this.insertNode(this.parser.schema.text(value));
         this.findInText(dom);
      } else {
         this.findInside(dom);
      }
   }

   // : (dom.Element)
   // Try to find a handler for the given tag and use that to parse. If
   // none is found, the element's content nodes are added directly.
   addElement(dom) {
      let name = dom.nodeName.toLowerCase();
      if (listTags.hasOwnProperty(name)) normalizeList(dom);
      let rule =
         (this.options.ruleFromNode && this.options.ruleFromNode(dom)) ||
         this.parser.matchTag(dom, this);
      if (rule ? rule.ignore : ignoreTags.hasOwnProperty(name)) {
         this.findInside(dom);
      } else if (!rule || rule.skip) {
         if (rule && rule.skip.nodeType) dom = rule.skip;
         let sync,
            top = this.top,
            oldNeedsBlock = this.needsBlock;
         if (blockTags.hasOwnProperty(name)) {
            sync = true;
            if (!top.type) this.needsBlock = true;
         } else if (!dom.firstChild) {
            this.leafFallback(dom);
            return;
         }
         this.addAll(dom);
         if (sync) this.sync(top);
         this.needsBlock = oldNeedsBlock;
      } else {
         this.addElementByRule(dom, rule);
      }
   }

   // Called for leaf DOM nodes that would otherwise be ignored
   leafFallback(dom) {
      if (dom.nodeName == 'BR' && this.top.type && this.top.type.inlineContent)
         this.addTextNode(dom.ownerDocument.createTextNode('\n'));
   }

   // Run any style parser associated with the node's styles. Either
   // return an array of marks, or null to indicate some of the styles
   // had a rule with `ignore` set.
   readStyles(styles) {
      let marks = Mark.none;
      for (let i = 0; i < styles.length; i += 2) {
         let rule = this.parser.matchStyle(styles[i], styles[i + 1], this);
         if (!rule) continue;
         if (rule.ignore) return null;
         marks = this.parser.schema.marks[rule.mark]
            .create(rule.attrs)
            .addToSet(marks);
      }
      return marks;
   }

   // : (dom.Element, ParseRule) → bool
   // Look up a handler for the given node. If none are found, return
   // false. Otherwise, apply it, use its return value to drive the way
   // the node's content is wrapped, and return true.
   addElementByRule(dom, rule) {
      let sync, nodeType, markType, mark;
      if (rule.node) {
         nodeType = this.parser.schema.nodes[rule.node];
         if (!nodeType.isLeaf) {
            sync = this.enter(nodeType, rule.attrs, rule.preserveWhitespace);
         } else if (!this.insertNode(nodeType.create(rule.attrs))) {
            this.leafFallback(dom);
         }
      } else {
         markType = this.parser.schema.marks[rule.mark];
         mark = markType.create(rule.attrs);
         this.addPendingMark(mark);
      }
      let startIn = this.top;

      if (nodeType && nodeType.isLeaf) {
         this.findInside(dom);
      } else if (rule.getContent) {
         this.findInside(dom);
         rule
            .getContent(dom, this.parser.schema)
            .forEach(node => this.insertNode(node));
      } else {
         let contentDOM = rule.contentElement;
         if (typeof contentDOM == 'string')
            contentDOM = dom.querySelector(contentDOM);
         else if (typeof contentDOM == 'function') contentDOM = contentDOM(dom);
         if (!contentDOM) contentDOM = dom;
         this.findAround(dom, contentDOM, true);
         this.addAll(contentDOM, sync);
      }
      if (sync) {
         this.sync(startIn);
         this.open--;
      }
      if (mark) this.removePendingMark(mark);
   }

   // : (dom.Node, ?NodeBuilder, ?number, ?number)
   // Add all child nodes between `startIndex` and `endIndex` (or the
   // whole node, if not given). If `sync` is passed, use it to
   // synchronize after every block element.
   addAll(parent, sync, startIndex, endIndex) {
      let index = startIndex || 0;
      for (
         let dom = startIndex
               ? parent.childNodes[startIndex]
               : parent.firstChild,
            end = endIndex == null ? null : parent.childNodes[endIndex];
         dom != end;
         dom = dom.nextSibling, ++index
      ) {
         this.findAtPoint(parent, index);
         this.addDOM(dom);
         if (sync && blockTags.hasOwnProperty(dom.nodeName.toLowerCase()))
            this.sync(sync);
      }
      this.findAtPoint(parent, index);
   }

   // Try to find a way to fit the given node type into the current
   // context. May add intermediate wrappers and/or leave non-solid
   // nodes that we're in.
   findPlace(node) {
      let route, sync;
      for (let depth = this.open; depth >= 0; depth--) {
         let cx = this.nodes[depth];
         let found = cx.findWrapping(node);
         if (found && (!route || route.length > found.length)) {
            route = found;
            sync = cx;
            if (!found.length) break;
         }
         if (cx.solid) break;
      }
      if (!route) return false;
      this.sync(sync);
      for (let i = 0; i < route.length; i++)
         this.enterInner(route[i], null, false);
      return true;
   }

   // : (Node) → ?Node
   // Try to insert the given node, adjusting the context when needed.
   insertNode(node) {
      if (node.isInline && this.needsBlock && !this.top.type) {
         let block = this.textblockFromContext();
         if (block) this.enterInner(block);
      }
      if (this.findPlace(node)) {
         this.closeExtra();
         let top = this.top;
         this.applyPendingMarks(top);
         if (top.match) top.match = top.match.matchType(node.type);
         let marks = top.activeMarks;
         for (let i = 0; i < node.marks.length; i++)
            if (!top.type || top.type.allowsMarkType(node.marks[i].type))
               marks = node.marks[i].addToSet(marks);
         top.content.push(node.mark(marks));
         return true;
      }
      return false;
   }

   applyPendingMarks(top) {
      for (let i = 0; i < this.pendingMarks.length; i++) {
         let mark = this.pendingMarks[i];
         if (
            (!top.type || top.type.allowsMarkType(mark.type)) &&
            !mark.isInSet(top.activeMarks)
         ) {
            top.activeMarks = mark.addToSet(top.activeMarks);
            this.pendingMarks.splice(i--, 1);
         }
      }
   }

   // : (NodeType, ?Object) → bool
   // Try to start a node of the given type, adjusting the context when
   // necessary.
   enter(type, attrs, preserveWS) {
      let ok = this.findPlace(type.create(attrs));
      if (ok) {
         this.applyPendingMarks(this.top);
         this.enterInner(type, attrs, true, preserveWS);
      }
      return ok;
   }

   // Open a node of the given type
   enterInner(type, attrs, solid, preserveWS) {
      this.closeExtra();
      let top = this.top;
      top.match = top.match && top.match.matchType(type, attrs);
      let options =
         preserveWS == null
            ? top.options & ~OPT_OPEN_LEFT
            : wsOptionsFor(preserveWS);
      if (top.options & OPT_OPEN_LEFT && top.content.length == 0)
         options |= OPT_OPEN_LEFT;
      this.nodes.push(
         new NodeContext(type, attrs, top.activeMarks, solid, null, options)
      );
      this.open++;
   }

   // Make sure all nodes above this.open are finished and added to
   // their parents
   closeExtra(openEnd) {
      let i = this.nodes.length - 1;
      if (i > this.open) {
         for (; i > this.open; i--)
            this.nodes[i - 1].content.push(this.nodes[i].finish(openEnd));
         this.nodes.length = this.open + 1;
      }
   }

   finish() {
      this.open = 0;
      this.closeExtra(this.isOpen);
      return this.nodes[0].finish(this.isOpen || this.options.topOpen);
   }

   sync(to: NodeContext) {
      for (let i = this.open; i >= 0; i--) {
         if (this.nodes[i] == to) {
            this.open = i;
            return;
         }
      }
   }

   addPendingMark(mark: Mark): void {
      this.pendingMarks.push(mark);
   }

   removePendingMark(mark: Mark): void {
      const found = this.pendingMarks.lastIndexOf(mark);

      if (found > -1) {
         this.pendingMarks.splice(found, 1);
      } else {
         const top = this.top;
         top.activeMarks = mark.removeFromSet(top.activeMarks);
      }
   }

   get currentPos(): number {
      this.closeExtra();
      let pos = 0;
      for (let i = this.open; i >= 0; i--) {
         let content = this.nodes[i].content;
         for (let j = content.length - 1; j >= 0; j--)
            pos += content[j].nodeSize;
         if (i) pos++;
      }
      return pos;
   }

   findAtPoint(parent, offset) {
      if (this.find)
         for (let i = 0; i < this.find.length; i++) {
            if (this.find[i].node == parent && this.find[i].offset == offset)
               this.find[i].pos = this.currentPos;
         }
   }

   findInside(parent) {
      if (this.find)
         for (let i = 0; i < this.find.length; i++) {
            if (
               this.find[i].pos == null &&
               parent.nodeType == 1 &&
               parent.contains(this.find[i].node)
            )
               this.find[i].pos = this.currentPos;
         }
   }

   findAround(parent, content, before) {
      if (parent != content && this.find)
         for (let i = 0; i < this.find.length; i++) {
            if (
               this.find[i].pos == null &&
               parent.nodeType == 1 &&
               parent.contains(this.find[i].node)
            ) {
               let pos = content.compareDocumentPosition(this.find[i].node);
               if (pos & (before ? 2 : 4)) this.find[i].pos = this.currentPos;
            }
         }
   }

   findInText(textNode) {
      if (this.find)
         for (let i = 0; i < this.find.length; i++) {
            if (this.find[i].node == textNode)
               this.find[i].pos =
                  this.currentPos -
                  (textNode.nodeValue.length - this.find[i].offset);
         }
   }

   // : (string) → bool
   // Determines whether the given [context
   // string](#ParseRule.context) matches this context.
   matchesContext(context) {
      if (context.indexOf('|') > -1)
         return context.split(/\s*\|\s*/).some(this.matchesContext, this);

      let parts = context.split('/');
      let option = this.options.context;
      let useRoot =
         !this.isOpen && (!option || option.parent.type == this.nodes[0].type);
      let minDepth = -(option ? option.depth + 1 : 0) + (useRoot ? 0 : 1);
      let match = (i, depth) => {
         for (; i >= 0; i--) {
            let part = parts[i];
            if (part == '') {
               if (i == parts.length - 1 || i == 0) continue;
               for (; depth >= minDepth; depth--)
                  if (match(i - 1, depth)) return true;
               return false;
            } else {
               let next =
                  depth > 0 || (depth == 0 && useRoot)
                     ? this.nodes[depth].type
                     : option && depth >= minDepth
                     ? option.node(depth - minDepth).type
                     : null;
               if (
                  !next ||
                  (next.name != part && next.groups.indexOf(part) == -1)
               )
                  return false;
               depth--;
            }
         }
         return true;
      };
      return match(parts.length - 1, this.open);
   }

   textblockFromContext() {
      let $context = this.options.context;
      if ($context)
         for (let d = $context.depth; d >= 0; d--) {
            let deflt = $context.node(d).contentMatchAt($context.indexAfter(d))
               .defaultType;
            if (deflt && deflt.isTextblock && deflt.defaultAttrs) return deflt;
         }
      for (let name in this.parser.schema.nodes) {
         let type = this.parser.schema.nodes[name];
         if (type.isTextblock && type.defaultAttrs) return type;
      }
   }
}
