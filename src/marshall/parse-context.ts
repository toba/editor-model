import { is, forEach, filterEach } from '@toba/tools';
import { Mark, MarkType } from '../mark/';
import {
   EditorNode,
   NodeContext,
   TextNode,
   NodeType,
   Attributes
} from '../node/';
import { DOMParser } from './parse-dom';
import { ParseOptions, NodesToFind } from './parse-options';
import { ParseRule } from './parse-rule';
import {
   HtmlNodeType,
   Whitespace,
   listTags,
   ignoreTags,
   blockTags
} from '../constants';
import { Position } from '../position';

export type PreserveWhitespace = boolean | 'full';

/**
 * @see https://github.com/ProseMirror/prosemirror-model/blob/07ee26e64d6f0c345d8912d894edf9ff113a5446/src/from_dom.js#L276
 */
const wsOptionsFor = (ws?: PreserveWhitespace) =>
   (ws ? Whitespace.Preserve : 0) | (ws === 'full' ? Whitespace.Full : 0);

/**
 * Tokenize a style attribute into key/value pairs.
 * @see https://github.com/ProseMirror/prosemirror-model/blob/07ee26e64d6f0c345d8912d894edf9ff113a5446/src/from_dom.js#L726
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

/**
 * Kludge to work around directly nested list nodes produced by some tools and
 * allowed by browsers to mean that the nested list is actually part of the list
 * item above it.
 */
function normalizeList(node: Node) {
   let child: ChildNode | null;
   let prevItem: ChildNode | null;

   for (
      child = node.firstChild, prevItem = null;
      child !== null;
      child = child.nextSibling
   ) {
      /** Element name */
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
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/from_dom.js
 */
export class ParseContext {
   private parser: DOMParser;
   private options: ParseOptions;
   /** Whether this is an open element */
   private isOpen: boolean;
   private pendingMarks: Mark[];
   private nodes: NodeContext[];
   private openElementCount: number;
   private find: NodesToFind[] | undefined;
   private needsBlock: boolean;

   constructor(
      parser: DOMParser,
      options: ParseOptions = {},
      open: boolean = false
   ) {
      this.parser = parser;
      this.options = options;
      this.isOpen = open;
      this.pendingMarks = [];

      let topNode = options.topNode;
      /** Context of root node */
      let topContext: NodeContext;
      /** Options bitmask */
      let topOptions =
         wsOptionsFor(options.preserveSpace) | (open ? Whitespace.OpenLeft : 0);

      if (topNode !== undefined) {
         topContext = new NodeContext(
            topNode.type,
            topNode.attrs,
            Mark.empty,
            true,
            options.topMatch || topNode.type.contentMatch,
            topOptions
         );
      } else if (open) {
         topContext = new NodeContext(
            null,
            undefined,
            Mark.empty,
            true,
            null,
            topOptions
         );
      } else {
         const topType = parser.schema.topNodeType;
         topContext = new NodeContext(
            topType === undefined ? null : topType,
            undefined,
            Mark.empty,
            true,
            null,
            topOptions
         );
      }
      this.nodes = [topContext];
      this.openElementCount = 0;
      this.find = options.findPositions;
      this.needsBlock = false;
   }

   get top() {
      return this.nodes[this.openElementCount];
   }

   /**
    * Add a DOM node to the content. Text is inserted as a text node, otherwise,
    * the node is passed to `addElement` or, if it has a `style` attribute, to
    * `addElementWithStyles`.
    */
   addDOM(node: Node): void {
      if (node.nodeType == HtmlNodeType.Text) {
         this.addTextNode(node);
      } else if (node.nodeType == HtmlNodeType.Element) {
         const el = node as HTMLElement;
         const style = el.getAttribute('style');
         const marks =
            style !== null ? this.readStyles(parseStyles(style)) : null;

         if (marks !== null) {
            forEach(marks, this.addPendingMark);
         }
         this.addElement(el);

         if (marks !== null) {
            forEach(marks, this.removePendingMark);
         }
      }
   }

   addTextNode(node: Node) {
      let value = node.nodeValue;

      const top: NodeContext = this.top;
      const isInline: boolean =
         top.type !== null
            ? top.type.inlineContent === true
            : top.content.length > 0 && top.content[0].isInline;

      if (isInline || (value !== null && /\S/.test(value))) {
         if (!(top.options & Whitespace.Preserve)) {
            if (value !== null) {
               value = value.replace(/\s+/g, ' ');
            }
            // If this starts with whitespace, and there is no node before it, or
            // a hard break, or a text node that ends with whitespace, strip the
            // leading space.
            if (
               value !== null &&
               /^\s/.test(value) &&
               this.openElementCount == this.nodes.length - 1
            ) {
               const nodeBefore: EditorNode | undefined =
                  top.content[top.content.length - 1];
               const domNodeBefore: Node | null = node.previousSibling;

               if (
                  nodeBefore === undefined ||
                  (domNodeBefore !== null && domNodeBefore.nodeName == 'BR') ||
                  (nodeBefore.isText &&
                     /\s$/.test((nodeBefore as TextNode).text))
               ) {
                  value = value.slice(1);
               }
            }
         } else if (value !== null && !(top.options & Whitespace.Full)) {
            value = value.replace(/\r?\n|\r/g, ' ');
         }
         if (value !== null) {
            this.insertNode(this.parser.schema.text(value));
         }
         this.findInText(node);
      } else {
         this.findInside(node);
      }
   }

   /**
    * Try to find a handler for the given tag and use that to parse. If none is
    * found, the element's content nodes are added directly.
    */
   addElement(el: HTMLElement) {
      let name = el.nodeName.toLowerCase();

      if (listTags.hasOwnProperty(name)) {
         normalizeList(el);
      }

      const rule: ParseRule | undefined =
         this.options.ruleFromNode !== undefined
            ? this.options.ruleFromNode(el)
            : this.parser.matchTag(el, this);

      if (rule !== undefined ? rule.ignore : ignoreTags.hasOwnProperty(name)) {
         this.findInside(el);
      } else if (rule === undefined || rule.skip !== undefined) {
         if (rule !== undefined && rule.skip !== undefined) {
            el = rule.skip as HTMLElement;
         }
         const didNeedBlock: boolean = this.needsBlock;
         const top: NodeContext = this.top;
         let sync = false;

         if (blockTags.hasOwnProperty(name)) {
            sync = true;
            if (top.type === null) {
               this.needsBlock = true;
            }
         } else if (el.firstChild === null) {
            this.leafFallback(el);
            return;
         }
         this.addAll(el);

         if (sync) {
            this.sync(top);
         }
         this.needsBlock = didNeedBlock;
      } else {
         this.addElementByRule(el, rule);
      }
   }

   /**
    * Called for leaf DOM nodes that would otherwise be ignored.
    */
   leafFallback(node: Node): void {
      if (
         node.nodeName == 'BR' &&
         node.ownerDocument !== null &&
         this.top.type &&
         this.top.type.inlineContent
      ) {
         this.addTextNode(node.ownerDocument.createTextNode('\n'));
      }
   }

   /**
    * Run any style parser associated with the node's styles. Either return an
    * array of marks, or null to indicate some of the styles had a rule with
    * `ignore` set.
    */
   readStyles(styles: string[]): Mark[] | null {
      let marks = Mark.empty;

      for (let i = 0; i < styles.length; i += 2) {
         let rule = this.parser.matchStyle(styles[i], styles[i + 1], this);

         if (rule === undefined) {
            continue;
         }
         if (rule.ignore) {
            return null;
         }
         const type: MarkType | undefined =
            rule.mark === undefined
               ? undefined
               : this.parser.schema.marks[rule.mark];

         if (type !== undefined) {
            const mark = type.create(rule.attrs);
            marks = mark.addToSet(marks);
         }
      }
      return marks;
   }

   /**
    * Look up a handler for the given node. If none are found, return `false`.
    * Otherwise, apply it, use its return value to drive the way the node's
    * content is wrapped, and return `true`.
    */
   addElementByRule(el: Element, rule: ParseRule): void {
      let sync: boolean = false;
      let nodeType: NodeType | undefined;
      let markType: MarkType | undefined;
      let mark: Mark | undefined = undefined;

      if (rule.node !== undefined) {
         nodeType = this.parser.schema.nodes[rule.node];

         if (nodeType !== undefined) {
            if (!nodeType.isLeaf) {
               sync = this.enter(nodeType, rule.attrs, rule.preserveWhitespace);
            } else if (!this.insertNode(nodeType.create(rule.attrs))) {
               this.leafFallback(el);
            }
         }
      } else if (rule.mark !== undefined) {
         markType = this.parser.schema.marks[rule.mark];

         if (markType !== undefined) {
            mark = markType.create(rule.attrs);
            this.addPendingMark(mark);
         }
      }
      const startIn: NodeContext = this.top;

      if (nodeType !== undefined && nodeType.isLeaf) {
         this.findInside(el);
      } else if (rule.getContent !== undefined) {
         this.findInside(el);
         const fragment = rule.getContent(el, this.parser.schema);
         fragment.forEachChild(this.insertNode);
      } else {
         /** CSS selector or method to select content element */
         const selector = rule.contentElement;
         let content: Element | null = null;

         if (is.text(selector)) {
            content = el.querySelector(selector);
         } else if (is.callable(selector)) {
            content = selector(el) as Element;
         }
         if (selector === undefined) {
            content = el;
         }
         if (content !== null) {
            this.findAround(el, content, true);
            // TODO: no longer pass sync since it's of the wrong type
            this.addAll(content);
         }
      }
      if (sync) {
         this.sync(startIn);
         this.openElementCount--;
      }
      if (mark !== undefined) {
         this.removePendingMark(mark);
      }
   }

   /**
    * Add all child nodes between `startIndex` and `endIndex` (or the whole
    * node, if not given). If `sync` is passed, use it to synchronize after
    * every block element.
    */
   addAll(
      parent: Node,
      sync?: NodeContext,
      startIndex?: number,
      endIndex?: number
   ) {
      let index = startIndex || 0;

      for (
         let dom = startIndex
               ? parent.childNodes[startIndex]
               : parent.firstChild,
            end = endIndex == null ? null : parent.childNodes[endIndex];
         dom !== null && dom !== end;
         dom = dom.nextSibling, ++index
      ) {
         this.findAtPoint(parent, index);
         this.addDOM(dom);

         if (
            sync !== undefined &&
            blockTags.hasOwnProperty(dom.nodeName.toLowerCase())
         ) {
            this.sync(sync);
         }
      }
      this.findAtPoint(parent, index);
   }

   /**
    * Try to find a way to fit the given node type into the current context.
    * May add intermediate wrappers and/or leave non-solid nodes that we're in.
    */
   findPlace(node: EditorNode): boolean {
      let route: NodeType[] | null = null;
      let syncTo: NodeContext | null = null;

      for (let depth = this.openElementCount; depth >= 0; depth--) {
         const context: NodeContext = this.nodes[depth];
         const found = context.findWrapping(node);

         if (
            found !== undefined &&
            (route === null || route.length > found.length)
         ) {
            route = found;
            syncTo = context;

            if (found.length == 0) {
               break;
            }
         }
         if (context.solid) {
            break;
         }
      }
      if (route === null) {
         return false;
      }
      if (syncTo !== null) {
         this.sync(syncTo);
      }

      forEach(route, r => this.enterInner(r, undefined, false));

      return true;
   }

   /**
    * Try to insert the given node, adjusting the context when needed.
    * @returns Whether node could be inserted
    */
   insertNode(node: EditorNode): boolean {
      if (node.isInline && this.needsBlock && this.top.type === null) {
         const block = this.textblockFromContext();
         if (block !== null) {
            this.enterInner(block);
         }
      }
      if (this.findPlace(node)) {
         this.closeExtra();
         let top: NodeContext = this.top;
         this.applyPendingMarks(top);

         if (top.match) {
            top.match = top.match.matchType(node.type);
         }
         let marks = top.activeMarks;

         for (let i = 0; i < node.marks.length; i++) {
            if (
               top.type === null ||
               top.type.allowsMarkType(node.marks[i].type)
            ) {
               marks = node.marks[i].addToSet(marks);
            }
         }
         top.content.push(node.mark(marks));

         return true;
      }
      return false;
   }

   applyPendingMarks(top: NodeContext) {
      for (let i = 0; i < this.pendingMarks.length; i++) {
         let mark = this.pendingMarks[i];
         if (
            (top.type === null || top.type.allowsMarkType(mark.type)) &&
            !mark.isInSet(top.activeMarks)
         ) {
            top.activeMarks = mark.addToSet(top.activeMarks);
            this.pendingMarks.splice(i--, 1);
         }
      }
   }

   /**
    * Try to start a node of the given type, adjusting the context when
    * necessary.
    */
   enter(type: NodeType, attrs?: Attributes, preserveWS?: PreserveWhitespace) {
      const ok = this.findPlace(type.create(attrs));

      if (ok) {
         this.applyPendingMarks(this.top);
         this.enterInner(type, attrs, true, preserveWS);
      }
      return ok;
   }

   /**
    * Open a node of the given type.
    */
   enterInner(
      type: NodeType,
      attrs?: Attributes,
      solid = false,
      preserveWS?: PreserveWhitespace
   ) {
      const top: NodeContext = this.top;
      this.closeExtra();

      // TODO: see why attrs were passed
      top.match = top.match && top.match.matchType(type); //, attrs);

      let options =
         preserveWS === undefined
            ? top.options & ~Whitespace.OpenLeft
            : wsOptionsFor(preserveWS);

      if (top.options & Whitespace.OpenLeft && top.content.length == 0) {
         options |= Whitespace.OpenLeft;
      }

      this.nodes.push(
         new NodeContext(type, attrs, top.activeMarks, solid, null, options)
      );
      this.openElementCount++;
   }

   /**
    * Make sure all nodes above `this.open` are finished and added to their
    * parents.
    */
   closeExtra(openEnd: boolean = false) {
      let i = this.nodes.length - 1;

      if (i > this.openElementCount) {
         for (; i > this.openElementCount; i--) {
            // TODO: shouldn't have to force EditorNode -- what is original doing?
            const node = this.nodes[i].finish(openEnd) as EditorNode;
            this.nodes[i - 1].content.push(node);
         }
         this.nodes.length = this.openElementCount + 1;
      }
   }

   finish() {
      this.openElementCount = 0;
      this.closeExtra(this.isOpen);

      return this.nodes[0].finish(this.isOpen || this.options.topOpen);
   }

   sync(to: NodeContext) {
      for (let i = this.openElementCount; i >= 0; i--) {
         if (this.nodes[i] === to) {
            this.openElementCount = i;
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
         const top: NodeContext = this.top;
         top.activeMarks = mark.removeFromSet(top.activeMarks);
      }
   }

   get currentPos(): number {
      this.closeExtra();

      let pos = 0;
      for (let i = this.openElementCount; i >= 0; i--) {
         let content = this.nodes[i].content;
         for (let j = content.length - 1; j >= 0; j--) pos += content[j].size;
         if (i) pos++;
      }
      return pos;
   }

   findAtPoint(parent: Node, offset: number) {
      if (this.find === undefined) {
         return;
      }
      filterEach(
         this.find,
         f => f.node === parent && f.offset == offset,
         f => {
            f.pos = this.currentPos;
         }
      );
   }

   findInside(parent: Node) {
      if (this.find === undefined) {
         return;
      }
      filterEach(
         this.find,
         f =>
            f.pos === undefined &&
            parent.nodeType == HtmlNodeType.Element &&
            parent.contains(f.node),
         f => {
            f.pos = this.currentPos;
         }
      );
   }

   findAround(parent: Node, content: Element, before: boolean) {
      if (this.find === undefined || parent === content) {
         return;
      }
      filterEach(
         this.find,
         f =>
            f.pos === undefined &&
            parent.nodeType == HtmlNodeType.Element &&
            parent.contains(f.node),
         f => {
            const pos = content.compareDocumentPosition(f.node);
            if (pos & (before ? 2 : 4)) {
               f.pos = this.currentPos;
            }
         }
      );
   }

   findInText(textNode: Node) {
      if (this.find === undefined) {
         return;
      }

      const text = textNode.nodeValue;
      const textLength = text === null ? 0 : text.length;

      filterEach(
         this.find,
         f => f.node === textNode,
         f => {
            f.pos = this.currentPos - textLength - f.offset;
         }
      );
   }

   /**
    * Determines whether the given [context string](#ParseRule.context) matches
    * this context.
    */
   matches(context: string): boolean {
      if (context.indexOf('|') > -1) {
         return context.split(/\s*\|\s*/).some(this.matches, this);
      }

      const parts = context.split('/');
      const option = this.options.context;
      const useRoot =
         !this.isOpen &&
         (option === undefined || option.parent.type == this.nodes[0].type);
      const minDepth =
         -(option !== undefined ? option.depth + 1 : 0) + (useRoot ? 0 : 1);

      const match = (i: number, depth: number) => {
         for (; i >= 0; i--) {
            const part = parts[i];

            if (part == '') {
               if (i == parts.length - 1 || i == 0) {
                  continue;
               }
               for (; depth >= minDepth; depth--) {
                  if (match(i - 1, depth)) {
                     return true;
                  }
               }
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
               ) {
                  return false;
               }
               depth--;
            }
         }
         return true;
      };
      return match(parts.length - 1, this.openElementCount);
   }

   /** Method name retained for ProseMirror compatibility */
   matchesContext = this.matches;

   textblockFromContext(): NodeType | null {
      let context: Position | undefined = this.options.context;

      const valid = (t: NodeType | undefined): t is NodeType =>
         t !== undefined && t.isTextblock && t.defaultAttrs !== null;

      if (context !== undefined) {
         for (let d = context.depth; d >= 0; d--) {
            const node: EditorNode = context.node(d);
            const match = node.contentMatchAt(context.indexAfter(d));

            if (valid(match.defaultType)) {
               return match.defaultType;
            }
         }
      }

      const types = this.parser.schema.nodes;

      for (let name in types) {
         const type = types[name];

         if (valid(type)) {
            return type;
         }
      }
      return null;
   }
}
