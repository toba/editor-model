import { is } from '@toba/tools';

export type ValueMap = { [key: string]: any };
export type AttributeMap = { [key: string]: Attribute<any> };

/**
 * Used to [define](#model.NodeSpec.attrs) attributes on nodes or marks.
 */
export interface AttributeSpec<T> {
   /**
    * The default value for this attribute, to use when no explicit value is
    * provided. Attributes that have no default must be provided whenever a node
    * or mark of a type that has them is created.
    */
   default?: T;
}

/**
 * For node types where all attrs have a default value (or which don't have any
 * attributes), build up a single reusable default attribute object, and use it
 * for all nodes that don't specify specific attributes.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L12
 */
export function defaultAttrs(
   attrs: AttributeMap
): { [key: string]: any } | null {
   const defaults: { [key: string]: any } = {};

   for (let name in attrs) {
      const attr = attrs[name];
      if (!attr.hasDefault) {
         return null;
      }
      defaults[name] = attr.default;
   }
   return defaults;
}

/**
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L22
 */
export function computeAttrs(
   attrs: AttributeMap,
   value?: ValueMap | null
): { [key: string]: any } {
   const built: { [key: string]: any } = {};

   for (let name in attrs) {
      let given = is.value<ValueMap>(value) ? value[name] : undefined;

      if (given === undefined) {
         let attr = attrs[name];

         if (attr.hasDefault) {
            given = attr.default;
         } else {
            throw new RangeError('No value supplied for attribute ' + name);
         }
      }
      built[name] = given;
   }
   return built;
}

/**
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L36
 */
export function initAttrs(attrs?: {
   [key: string]: AttributeSpec<any>;
}): AttributeMap {
   const result: AttributeMap = {};

   if (attrs !== undefined) {
      for (let name in attrs) {
         result[name] = new Attribute(attrs[name]);
      }
   }
   return result;
}

/**
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L218
 */
export class Attribute<T> {
   hasDefault: boolean;
   default: T | undefined;

   constructor(options: AttributeSpec<T>) {
      this.default = options.default;
      this.hasDefault = this.default !== undefined;
   }

   get isRequired() {
      return !this.hasDefault;
   }
}
