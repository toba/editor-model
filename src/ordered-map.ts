import { is } from '@toba/tools';

/**
 * Kinds of data that can be parsed by `OrderedMap`.
 */
type CompatibleData<T> = OrderedMap<T> | { [key: string]: T };

/**
 * Persistent data structure representing an ordered mapping from strings to
 * values, with some convenient update methods.
 *
 * @see https://github.com/marijnh/orderedmap/blob/master/index.js
 */
export class OrderedMap<T> {
   private readonly values: T[];
   private readonly keys: string[];

   constructor(keys: (string | [string, T])[], values?: T[]) {
      if (values !== undefined && is.text(keys[0])) {
         this.keys = keys as string[];
         this.values = values;
      } else {
         this.keys = [];
         this.values = [];

         keys.forEach(key => {
            const pair = key as [string, T];
            this.keys.push(pair[0]);
            this.values.push(pair[1]);
         });
      }
   }

   /**
    * Copy key-value pairs.
    */
   private copy = (): [string[], T[]] => [
      this.keys.slice(),
      this.values.slice()
   ];

   find = (key: string): number => this.keys.indexOf(key);

   /**
    * Retrieve the value stored under `key`, or return undefined when no such
    * key exists.
    */
   get(key: string): T | undefined {
      const index = this.find(key);
      return index == -1 ? undefined : this.values[index];
   }

   /**
    * Whether key exists in map.
    */
   has = (key: string): boolean => this.find(key) >= 0;

   /**
    * Create a new map by replacing the value of `key` with a new value, or
    * adding a binding to the end of the map. If `newKey` is given, the key of
    * the binding will be replaced with that key.
    */
   update(key: string, value: T, newKey?: string): OrderedMap<T> {
      const map: OrderedMap<T> =
         newKey !== undefined && newKey != key ? this.remove(newKey) : this;
      const index = map.find(key);
      const [keys, values] = this.copy();

      if (index == -1) {
         keys.push(newKey || key);
         values.push(value);
      } else {
         values[index] = value;
         if (newKey) {
            keys[index] = newKey;
         }
      }
      return new OrderedMap<T>(keys, values);
   }

   /**
    * Return a map with the given key removed, if it existed.
    */
   remove(key: string): OrderedMap<T> {
      const index = this.find(key);
      return index == -1
         ? this
         : new OrderedMap<T>(
              this.keys.splice(index, 1),
              this.values.splice(index, 1)
           );
   }

   /**
    * Add a new key to the start of the map.
    */
   addToStart = (key: string, value: T): OrderedMap<T> => {
      const [keys, values] = this.copy();
      keys.unshift(key);
      values.unshift(value);
      return new OrderedMap(keys, values);
   };

   /**
    * Add a new key to the end of the map.
    */
   addToEnd(key: string, value: T): OrderedMap<T> {
      const [keys, values] = this.copy();
      keys.push(key);
      values.push(value);
      return new OrderedMap(keys, values);
   }

   /**
    * Add a key after the given key. If `place` is not found, the new key is
    * added to the end.
    */
   addBefore(place: string, key: string, value: T): OrderedMap<T> {
      const without = this.remove(key);
      const index = without.find(place);

      if (index == -1) {
         return without.addToEnd(key, value);
      }

      const [keys, values] = without.copy();

      keys.splice(index, 0, key);
      values.splice(index, 0, value);

      return new OrderedMap<T>(keys, values);
   }

   /**
    * Call the given function for each key/value pair in the map, in order.
    */
   forEach(fn: (key: string, value: T) => void) {
      this.keys.forEach((key, i) => fn(key, this.values[i]));
   }

   /**
    * Convert to an object with the same keys but values transformed to type
    * with given function.
    */
   map<M>(fn: (key: string, value: T) => M): { [key: string]: M } {
      const out: { [key: string]: M } = {};

      this.keys.forEach((key, i) => {
         out[key] = fn(key, this.values[i]);
      });

      return out;
   }

   /**
    * Create a new map by prepending the keys in this map that don't appear in
    * `map` before the keys in `map`.
    */
   prepend(map: CompatibleData<T>): OrderedMap<T> {
      const before = OrderedMap.from(map).subtract(this);

      return before.size == 0
         ? this
         : new OrderedMap<T>(
              before.keys.concat(this.keys),
              before.values.concat(this.values)
           );
   }

   /**
    * Append unique keys with values to this map.
    */
   append(map: CompatibleData<T>): OrderedMap<T> {
      const after = OrderedMap.from(map).subtract(this);

      return after.size == 0
         ? this
         : new OrderedMap<T>(
              this.keys.concat(after.keys),
              this.values.concat(after.values)
           );
   }

   /**
    * Create a map containing all the keys in this map that don't appear in
    * `map`.
    */
   subtract(map: CompatibleData<T>): OrderedMap<T> {
      const remove = OrderedMap.from(map);
      let copy: OrderedMap<T> = this;

      remove.forEach(key => {
         copy = copy.remove(key);
      });

      return copy;
   }

   /**
    * The amount of keys in this map.
    */
   get size(): number {
      return this.keys.length;
   }

   /**
    * Return a map with the given content. If `null`, create an empty map. If
    * given an ordered map, return that map itself. If given an object, create
    * a map from the object's properties.
    */
   static from<U>(source: CompatibleData<U>): OrderedMap<U> {
      if (source instanceof OrderedMap) {
         return source;
      }
      const keys: string[] = [];
      const values: U[] = [];

      for (let key in source) {
         keys.push(key);
         values.push(source[key]);
      }
      return new OrderedMap<U>(keys, values);
   }
}
