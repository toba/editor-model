import { StepMap, Mappable } from './step-map';
import { EditorNode } from '../node';
import { Slice, SliceJSON } from '../node/slice';
import { ReplaceError } from '../location/replace';
import { Schema } from '../schema';
import { Mark, MarkJSON } from '../mark';

export interface StepJSON {
   stepType: string;
   mark?: MarkJSON;
   slice?: SliceJSON;
   structure?: boolean;
   insert?: number;
   gapFrom?: number;
   gapTo?: number;
   from: number;
   to: number;
}

const stepsByID: { [key: string]: typeof BaseStep } = Object.create(null);

export interface Step {
   /**
    * Applies this step to the given document, returning a result object that
    * either indicates failure, if the step can not be applied to this document,
    * or indicates success by containing a transformed document.
    */
   apply(doc: EditorNode): StepResult;

   /**
    * Get the step map that represents the changes made by this step, and which
    * can be used to transform between positions in the old and the new
    * document.
    */
   getMap(): StepMap;

   /**
    * Create an inverted version of this step. Needs the document as it was
    * before the step as argument.
    */
   invert(doc: EditorNode): Step;

   /**
    * Map this step through a mappable thing, returning either a version of that
    * step with its positions adjusted, or `null` if the step was entirely
    * deleted by the mapping.
    */
   map(mapping: Mappable): this | null;

   /**
    * Try to merge this step with another one, to be applied directly after it.
    * Returns the merged step when possible or `null` if the steps can't be
    * merged.
    */
   merge(other: this): this | null;

   /**
    * Create a JSON-serializeable representation of this step. When defining
    * this for a custom subclass, make sure the result object includes the step
    * type's [JSON id](#transform.Step^jsonID) under the `stepType` property.
    */
   toJSON(): StepJSON;
}

/**
 * A step object represents an atomic change. It generally applies only to the
 * document it was created for, since the positions stored in it will only make
 * sense for that document.
 *
 * New steps are defined by creating classes that extend `Step`, overriding
 * the `apply`, `invert`, `map`, `getMap` and `fromJSON` methods, and
 * registering your class with a unique JSON-serialization identifier using
 * [`Step.jsonID`](#transform.Step^jsonID).
 */
export abstract class BaseStep implements Step {
   from: number;
   to: number;
   mark: Mark;
   jsonID: string;

   /**
    * Applies this step to the given document, returning a result object that
    * either indicates failure, if the step can not be applied to this document,
    * or indicates success by containing a transformed document.
    */
   abstract apply(doc: EditorNode): StepResult;

   /**
    * Get the step map that represents the changes made by this step, and which
    * can be used to transform between positions in the old and the new
    * document.
    */
   getMap = (): StepMap => StepMap.empty;

   /**
    * Create an inverted version of this step. Needs the document as it was
    * before the step as argument.
    */
   abstract invert(doc: EditorNode): Step;

   /**
    * Map this step through a mappable thing, returning either a version of that
    * step with its positions adjusted, or `null` if the step was entirely
    * deleted by the mapping.
    */
   abstract map(mapping: Mappable): this | null;

   /**
    * Try to merge this step with another one, to be applied directly after it.
    * Returns the merged step when possible, `null` if the steps can't be
    * merged.
    */
   abstract merge(other: this): this | null;

   /**
    * Create a JSON-serializeable representation of this step. When defining
    * this for a custom subclass, make sure the result object includes the step
    * type's [JSON id](#transform.Step^jsonID) under the `stepType` property.
    */
   abstract toJSON(): StepJSON;

   /**
    * Deserialize a step from its JSON representation. Will call through to the
    * step class' own implementation of this method.
    */
   static fromJSON(schema: Schema, json: StepJSON): BaseStep {
      if (!json || !json.stepType) {
         throw new RangeError('Invalid input for Step.fromJSON');
      }
      let type = stepsByID[json.stepType];

      if (!type) {
         throw new RangeError(`No step type ${json.stepType} defined`);
      }
      return type.fromJSON(schema, json);
   }

   /**
    * To be able to serialize steps to JSON, each step needs a string ID to
    * attach to its JSON representation. Use this method to register an ID for
    * your step classes. Try to pick something that's unlikely to clash with
    * steps from other modules.
    */
   static register<S extends typeof BaseStep>(id: string, subclass: S) {
      if (id in stepsByID) {
         throw new RangeError('Duplicate use of step JSON ID ' + id);
      }
      stepsByID[id] = subclass;
      subclass.prototype.jsonID = id;
      return subclass;
   }
}

/**
 * The result of [applying](#transform.Step.apply) a step. Contains either a new
 * document or a failure value.
 */
export class StepResult {
   /** Transformed document */
   doc?: EditorNode;
   /** Information about failed step */
   failed?: string;

   constructor(doc?: EditorNode, failed?: string) {
      this.doc = doc;
      this.failed = failed;
   }

   /** Create a successful step result. */
   static ok = (doc: EditorNode): StepResult => new StepResult(doc);

   /** Create a failed step result. */
   static fail = (message?: string) => new StepResult(undefined, message);

   /**
    * Call `EditorNode.replace` with the given arguments. Create a successful
    * result if it succeeds, and a failed one if it throws a `ReplaceError`.
    */
   static fromReplace(
      doc: EditorNode,
      from: number,
      to: number,
      slice: Slice
   ): StepResult {
      try {
         return StepResult.ok(doc.replace(from, to, slice));
      } catch (e) {
         if (e instanceof ReplaceError) {
            return StepResult.fail(e.message);
         }
         throw e;
      }
   }
}
