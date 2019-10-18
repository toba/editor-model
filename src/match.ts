import { DuoList, makeDuoList } from '@toba/tools';
import { Fragment } from './fragment';
import { EditorNode } from './node';
import { NodeType } from './node-type';
import { nfa, nfaToDFA } from './finite-automata';
import { TokenStream, parseExpr, Expression } from './token-stream';
import { SimpleMap } from './types';

interface NodeEdge {
   type: NodeType;
   next: ContentMatch;
}

interface ActiveMatch {
   match: ContentMatch;
   type: NodeType | null;
   via: ActiveMatch | null;
}

/**
 * Represent a match state of a node type's [content expression](#model.NodeSpec.content),
 * and can be used to find out whether further content matches here, and whether a given
 * position is a valid end of the node.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/content.js
 */
export class ContentMatch {
   /** Whether this match state represents a valid end of the node */
   validEnd: boolean;
   next: DuoList<NodeType, ContentMatch>;
   wrapCache: DuoList<NodeType, NodeType[]>;

   /**
    * @param validEnd Whether match state represents a valid end of the node
    */
   constructor(validEnd: boolean) {
      this.validEnd = validEnd;
      this.next = makeDuoList();
      this.wrapCache = makeDuoList();
   }

   /**
    * @param pattern Regular Expression-type pattern
    */
   static parse(pattern: string, nodeTypes: SimpleMap<NodeType>): ContentMatch {
      const stream = new TokenStream(pattern, nodeTypes);

      if (stream.next === undefined) {
         return ContentMatch.empty;
      }
      const expr: Expression = parseExpr(stream);

      if (stream.next !== undefined) {
         // expression parser should have consumed all stream tokens
         stream.err('Unexpected trailing text');
      }
      const match: ContentMatch = nfaToDFA(nfa(expr));

      checkForDeadEnds(match, stream);

      return match;
   }

   /**
    * Match a node type, returning a match after that node if successful.
    */
   matchType(type: NodeType): ContentMatch | undefined {
      const found = this.next.find(t => t === type);
      return found === undefined ? found : found[1];
   }

   /**
    * Try to match a fragment. Returns the resulting match when successful.
    */
   matchFragment(
      frag: Fragment,
      start = 0,
      end = frag.childCount
   ): ContentMatch | undefined {
      let match: ContentMatch | undefined = this;

      for (let i = start; match !== undefined && i < end; i++) {
         match = match.matchType(frag.child(i).type);
      }
      return match;
   }

   get inlineContent(): boolean {
      const first = this.next.item(0);
      return first !== undefined ? first[0].isInline : false;
   }

   /**
    * First `NodeType` at this match position that can be generated.
    */
   get defaultType(): NodeType | undefined {
      const found = this.next.find(t => !(t.isText || t.hasRequiredAttrs()));
      return found !== undefined ? found[0] : found;
   }

   compatible(other?: ContentMatch): boolean {
      if (other === undefined) {
         return false;
      }
      for (let i = 0; i < this.next.size(); i++) {
         for (let j = 0; j < other.next.size(); j++) {
            if (this.next.item(i)![0] === other.next.item(j)![0]) {
               // same NodeType
               return true;
            }
         }
      }
      return false;
   }

   /**
    * Try to match the given fragment, and if that fails, see if it can be made
    * to match by inserting nodes in front of it. When successful, return a
    * fragment of inserted nodes (which may be empty if nothing had to be
    * inserted). When `toEnd` is true, only return a fragment if the resulting
    * match goes to the end of the content expression.
    */
   fillBefore(
      after: Fragment,
      toEnd = false,
      startIndex = 0
   ): Fragment | undefined {
      /** Matches that have already been processed */
      let seen: ContentMatch[] = [this];

      function search(
         searchMatch: ContentMatch,
         types: NodeType[]
      ): Fragment | undefined {
         let finished: ContentMatch | undefined = searchMatch.matchFragment(
            after,
            startIndex
         );
         if (finished !== undefined && (!toEnd || finished.validEnd)) {
            const nodes = types
               .map(t => t.createAndFill())
               .filter(n => n !== null) as EditorNode[];

            return Fragment.from(nodes);
         }

         for (let i = 0; i < searchMatch.next.size(); i++) {
            const [type, match] = searchMatch.next.item(i)!;

            if (
               !(type.isText || type.hasRequiredAttrs()) &&
               !seen.includes(match)
            ) {
               seen.push(match);
               const found = search(match, types.concat(type));

               if (found !== undefined) {
                  return found;
               }
            }
         }
      }
      return search(this, []);
   }

   /**
    * Find a set of wrapping node types that would allow a node of the given
    * type to appear at this position. The result may be empty (when it fits
    * directly) and will be null when no such wrapping exists.
    */
   findWrapping(target: NodeType): NodeType[] | undefined {
      for (let i = 0; i < this.wrapCache.size(); i++) {
         const [type, wrapTypes] = this.wrapCache.item(i)!;

         if (type === target) {
            return wrapTypes;
         }
      }
      const computed = this.computeWrapping(target);

      if (computed !== undefined) {
         this.wrapCache.push(target, computed);
      }
      return computed;
   }

   computeWrapping(target: NodeType): NodeType[] | undefined {
      /** Names of `NodeType`s that have already been processed */
      const seen = Object.create(null) as SimpleMap<boolean>;
      const active: ActiveMatch[] = [{ match: this, type: null, via: null }];

      while (active.length) {
         const current: ActiveMatch = active.shift()!;
         const match: ContentMatch = current.match;

         if (match.matchType(target) !== null) {
            const result: NodeType[] = [];

            for (let obj = current; obj.type; obj = obj.via!) {
               result.push(obj.type);
            }
            return result.reverse();
         }

         match.next.each((type, m) => {
            if (
               !type.isLeaf &&
               !type.hasRequiredAttrs() &&
               !(type.name in seen) &&
               type.contentMatch !== undefined &&
               (current.type === null || m.validEnd)
            ) {
               active.push({ match: type.contentMatch, type, via: current });
               seen[type.name] = true;
            }
         });
      }
      return undefined;
   }

   /**
    * The number of outgoing edges this node has in the finite automaton that
    * describes the content expression.
    */
   get edgeCount(): number {
      return this.next.size();
   }

   /**
    * Get the `n`th outgoing edge from this node in the finite automaton that
    * describes the content expression.
    */
   edge(n: number): NodeEdge {
      let i = n << 1;

      if (i > this.next.size()) {
         throw new RangeError(`There's no ${n}th edge in this content match`);
      }
      const [type, next] = this.next.item(i)!;

      return { type, next };
   }

   toString(): string {
      /** Matches that have been scanned */
      const seen: ContentMatch[] = [];

      function scan(match: ContentMatch) {
         seen.push(match);
         match.next.each((_, m) => {
            if (!seen.includes(m)) {
               scan(m);
            }
         });
      }
      scan(this);

      return seen
         .map((m, i) => {
            let out = i + (m.validEnd ? '*' : ' ') + ' ';

            m.next.each((type, match) => {
               out += (i ? ', ' : '') + type.name + '->' + seen.indexOf(match);
            });

            return out;
         })
         .join('\n');
   }

   static empty = new ContentMatch(true);
}

function checkForDeadEnds(rootMatch: ContentMatch, stream: TokenStream) {
   for (let i = 0, work = [rootMatch]; i < work.length; i++) {
      const state: ContentMatch = work[i];
      const types: string[] = [];
      let deadEnd: boolean = !state.validEnd;

      state.next.each((type, match) => {
         types.push(type.name);

         if (deadEnd && !(type.isText || type.hasRequiredAttrs())) {
            deadEnd = false;
         }
         if (work.indexOf(match) == -1) {
            work.push(match);
         }
      });

      if (deadEnd)
         stream.err(
            'Only non-generatable nodes (' +
               types.join(', ') +
               ') in a required position'
         );
   }
}
