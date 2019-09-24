// https://jsperf.com/toba-array
// setup

const size = 10000;
const values = new Array(size);
let sum = 0;
let i = 0;

for (i = 0; i < size; i++) {
   values[i] = Math.random();
}

function add(n) {
   sum += n;
}

function forEach(list, fn) {
   const length = list.length;
   for (i = 0; i < length; i++) {
      fn(list[i]);
   }
}

// scenario 1: basic

for (i = 0; i < values.length; i++) {
   sum += values[i];
}

// scenario 2: built-in

values.forEach(add);

// scenario 3: custom

forEach(values, add);
