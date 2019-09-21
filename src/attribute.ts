import { is } from '@toba/tools';

export type AttributeValue = string | number | null;

/**
 * Attribute values keyed to their name.
 */
export type Attributes = { [key: string]: AttributeValue };

/**
 * Map of attribute names and optional default values.
 */
export type AttributeMap = { [key: string]: AttributeDefault<string> };

/**
 * Used to [define](#model.NodeSpec.attrs) attributes on nodes or marks.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L447
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
      if (!attr.exists) {
         return null;
      }
      defaults[name] = attr.value;
   }
   return defaults;
}

/**
 * Compute attribute key/values from an `AttributeMap`.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L22
 */
export function computeAttrs(
   attrs: AttributeMap,
   values: Attributes = {}
): Attributes {
   const built: Attributes = {};

   for (let name in attrs) {
      let given: AttributeValue | undefined = values[name];

      if (!is.value<string>(given)) {
         // no given value so try to use default value
         let attr = attrs[name];

         if (attr.exists) {
            given = attr.value!;
         } else {
            throw new RangeError('No value supplied for attribute ' + name);
         }
      }
      built[name] = given;
   }
   return built;
}

/**
 * Create `Attribute` objects from `AttributeSpec`s.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L36
 */
export function initAttrs(attrs?: {
   [key: string]: AttributeSpec<any>;
}): AttributeMap {
   const result: AttributeMap = {};

   if (attrs !== undefined) {
      for (let name in attrs) {
         result[name] = new AttributeDefault(attrs[name]);
      }
   }
   return result;
}

/**
 * Default attribute value.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L218
 */
export class AttributeDefault<T> {
   exists: boolean;
   value: T | undefined;

   constructor(options: AttributeSpec<T>) {
      this.value = options.default;
      this.exists = this.value !== undefined;
   }

   /**
    * Attributes that have no default must be provided whenever a node or mark
    * of a type that has them is created.
    */
   get isRequired() {
      return !this.exists;
   }
}
