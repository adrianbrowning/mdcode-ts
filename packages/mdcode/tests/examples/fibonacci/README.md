# fibonacci

> An example of how to use mdcode

In this example, the examples consist of 4 code blocks each. Of course, any markdown text can be included between individual code blocks.

**JavaScript**
<!--<script type="text/markdown">
```js file=fibonacci.js outline=true
// #region signature
    // #endregion
    // #region zero
    // #endregion
    // #region one
    // #endregion

    // #region regular
// #endregion

module.exports = fibonacci
```
</script>-->

```js file=fibonacci.js region=signature
function fibonacci(n) {
```

```js file=fibonacci.js region=zero
    if (n < 1) {
        return 0
    }
```

```js file=fibonacci.js region=one
    if (n == 1) {
        return 1
    }
```

```js file=fibonacci.js region=regular
    return fibonacci(n - 1) + fibonacci(n - 2)
}
```

<!--<script type="text/markdown">
```js file=fibonacci.test.js
const assert = require("node:assert");
const test = require("node:test");
const fibonacci = require("./fibonacci");

const testvect = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181];

test("fibonacci with test vector", (t) => {
    for (var i = 0; i < testvect.length; i++) {
        assert.equal(fibonacci(i), testvect[i]);
    }
});
```
</script>-->
