import { ContentMatch } from '../match';

export function expectSameMatch(
   match: ContentMatch | undefined,
   pm_match: any
): void {
   expect(match).toBeDefined();

   if (match === undefined) {
      return;
   }
   let recurseCount = 0;

   const compareMatch = (m1: ContentMatch, m2: any) => {
      expect(m1.edgeCount).toBe(m2.edgeCount);
      expect(m1.validEnd).toBe(m2.validEnd);

      if (m1.defaultType !== undefined) {
         expect(m1.defaultType.name).toBe(m2.defaultType.name);
      } else {
         expect(m2.defaultType).toBeUndefined();
      }

      expect(m1.next.size()).toBe(m2.next.length / 2);

      m1.next.each((node, m, index) => {
         const pm_node = m2.next[index * 2];
         const pm_m = m2.next[index * 2 + 1];

         expect(node.name).toBe(pm_node.name);

         if (recurseCount < 25) {
            compareMatch(m, pm_m);
         }
         recurseCount++;
      });
   };

   compareMatch(match, pm_match);
}
