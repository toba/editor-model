/**
 * For node types where all attrs have a default value (or which don't have any
 * attributes), build up a single reusable default attribute object, and use it
 * for all nodes that don't specify specific attributes.
 */
export function defaultAttrs(attrs: Attribute<any>[]) {
   let defaults = Object.create(null);
   for (let attrName in attrs) {
      let attr = attrs[attrName];
      if (!attr.hasDefault) {
         return null;
      }
      defaults[attrName] = attr.default;
   }
   return defaults;
}

function computeAttrs(attrs: AttributeMap, value: string) {
   let built = Object.create(null);

   for (let name in attrs) {
      let given = value && value[name];
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

export function initAttrs(attrs?: Attribute<any>[]): AttributeMap {
   const result = Object.create(null);
   if (attrs) {
      for (let name in attrs) {
         result[name] = new Attribute(attrs[name]);
      }
   }
   return result;
}

export interface AttributeOptions<T> {
   default: T;
}

export type AttributeMap = { [key: string]: Attribute<any> };

export class Attribute<T> {
   hasDefault: boolean;
   default: T;

   constructor(options: AttributeOptions<T>) {
      this.hasDefault = Object.prototype.hasOwnProperty.call(
         options,
         'default'
      );
      this.default = options.default;
   }

   get isRequired() {
      return !this.hasDefault;
   }
}
