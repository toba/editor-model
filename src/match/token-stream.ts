import { NodeType } from '../node/type';
import { SimpleMap } from '../types';

export const enum TokenType {
   /**
    * One token or another
    * @example (token|other)
    */
   Choice = 'choice',
   Name = 'name',
   /**
    * Token may or may not occur at position
    * @example token?
    */
   Optional = 'opt',
   /**
    * Token must occur one time and may occur more at position
    * @example token+
    */
   Plus = 'plus',
   /**
    * Preceding token must occur a range of times
    * @example token{2,8}
    */
   Range = 'range',
   Sequence = 'seq',
   /**
    * Zero or more of the preceding token
    * @example token*
    */
   Star = 'star'
}

export interface Expression {
   type: TokenType;
   min?: number;
   max?: number;
   value?: NodeType;
   expr?: Expression;
   exprs?: Expression[];
}

export class TokenStream {
   /** Regular Expression-like pattern */
   pattern: string;
   nodeTypes: SimpleMap<NodeType>;
   /** Pattern split on whitespace */
   tokens: string[];
   /** Position of current token */
   pos: number;
   inline: boolean | null;

   /**
    * @param pattern Regular Expression-like pattern
    */
   constructor(pattern: string, nodeTypes: SimpleMap<NodeType>) {
      this.pattern = pattern;
      this.nodeTypes = nodeTypes;
      this.inline = null;
      this.pos = 0;
      this.tokens = pattern.split(/\s*(?=\b|\W|$)/);

      // remove empty strings from start and end

      if (this.tokens[this.tokens.length - 1] == '') {
         this.tokens.pop();
      }
      if (this.tokens[0] == '') {
         this.tokens.unshift();
      }
   }

   get next(): string | undefined {
      return this.tokens[this.pos];
   }

   eat = (token: string): number | boolean =>
      this.next == token && (this.pos++ || true);

   /**
    * Throw `SyntaxError` with standard information.
    */
   throw(msg: string): never {
      throw new SyntaxError(
         msg + " (in content expression '" + this.pattern + "')"
      );
   }
}

export function parseExprSubscript(stream: TokenStream): Expression {
   let expr = parseExprAtom(stream);
   for (;;) {
      if (stream.eat('+')) {
         expr = { type: TokenType.Plus, expr };
      } else if (stream.eat('*')) {
         expr = { type: TokenType.Star, expr };
      } else if (stream.eat('?')) {
         expr = { type: TokenType.Optional, expr };
      } else if (stream.eat('{')) {
         expr = parseExprRange(stream, expr);
      } else {
         break;
      }
   }
   return expr;
}

export function parseExprSeq(stream: TokenStream): Expression {
   const exprs: Expression[] = [];

   do {
      exprs.push(parseExprSubscript(stream));
   } while (stream.next && stream.next != ')' && stream.next != '|');

   return exprs.length == 1 ? exprs[0] : { type: TokenType.Sequence, exprs };
}

/**
 * Create expression from stream. If all tokens are parsable then `stream.next`
 * will be `undefined` when done.
 */
export function parseExpr(stream: TokenStream) {
   const exprs: Expression[] = [];
   do {
      exprs.push(parseExprSeq(stream));
   } while (stream.eat('|'));

   return exprs.length == 1 ? exprs[0] : { type: TokenType.Choice, exprs };
}

export function parseNum(stream: TokenStream): number {
   const next = stream.next;

   if (next === undefined || /\D/.test(next)) {
      return stream.throw("Expected number, got '" + next + "'");
   }
   const result = Number(next);
   stream.pos++;

   return result;
}

export function parseExprRange(
   stream: TokenStream,
   expr?: Expression
): Expression {
   const min = parseNum(stream);
   let max = min;

   if (stream.eat(',')) {
      if (stream.next != '}') {
         max = parseNum(stream);
      } else {
         max = -1;
      }
   }
   if (!stream.eat('}')) {
      stream.throw('Unclosed braced range');
   }
   return { type: TokenType.Range, min, max, expr };
}

/**
 * Find `NodeType`s with the given name or in a group matching the name.
 */
export function resolveName(stream: TokenStream, name: string): NodeType[] {
   const types = stream.nodeTypes;
   let type: NodeType | undefined = types[name];

   if (type !== undefined) {
      return [type];
   }
   const result: NodeType[] = [];

   for (let typeName in types) {
      type = types[typeName];
      if (type.groups.includes(name)) {
         result.push(type);
      }
   }
   if (result.length == 0) {
      stream.throw("No node type or group '" + name + "' found");
   }
   return result;
}

export function parseExprAtom(stream: TokenStream): Expression {
   if (stream.eat('(')) {
      const expr = parseExpr(stream);

      if (!stream.eat(')')) {
         stream.throw('Missing closing paren');
      }
      return expr;
   } else if (stream.next !== undefined && !/\W/.test(stream.next)) {
      const exprs: Expression[] = resolveName(stream, stream.next).map(
         (type: NodeType) => {
            if (stream.inline === null) {
               stream.inline = type.isInline;
            } else if (stream.inline !== type.isInline) {
               stream.throw('Mixing inline and block content');
            }
            return { type: TokenType.Name, value: type };
         }
      );
      stream.pos++;

      return exprs.length == 1 ? exprs[0] : { type: TokenType.Choice, exprs };
   } else {
      stream.throw("Unexpected token '" + stream.next + "'");
      // this return is here only to make TypeScript happy since it can't tell
      // that stream.err() will always throw an error
      return { type: TokenType.Choice };
   }
}
