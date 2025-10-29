# factorial

> An example of how to use mdcode

In this example, the code blocks only contain one region (named `function`). The test code required for testing is in invisible code blocks.

**JavaScript**
<!--<script type="text/markdown">
```js file=factorial.test.js outline=true
const assert = require("node:assert")
const test = require("node:test")

// #region function
// #endregion

const testvect = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800]

test("factorial with test vector", (t) => {
    for (var i = 0; i < testvect.length; i++) {
        assert.equal(factorial(i), testvect[i])
    }
})
```
</script>-->

```js file=factorial.test.js region=function
function factorial(n) {
    if (n > 1) {
        return n * factorial(n - 1)
    }

    return 1
}
```
