import assert from "node:assert";
import { describe, it } from "node:test";

import { outline } from "../../mdcode/src/outline.ts";

describe("outline", () => {
  describe("basic region removal", () => {
    it("should remove content between region markers in JavaScript", () => {
      const source = `function hello() {
  console.log('before');
  // #region test
  console.log('inside region');
  console.log('more inside');
  // #endregion
  console.log('after');
}`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `function hello() {
  console.log('before');
  // #region test
  // #endregion
  console.log('after');
}`);
    });

    it("should remove content between region markers in Python", () => {
      const source = `def hello():
    print('before')
    ## #region test
    print('inside region')
    print('more inside')
    ## #endregion
    print('after')`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `def hello():
    print('before')
    ## #region test
    ## #endregion
    print('after')`);
    });

    it("should remove content between region markers in SQL", () => {
      const source = `SELECT * FROM users
WHERE status = 'active'
-- #region complicated_logic
AND age > 18
AND country = 'US'
-- #endregion
ORDER BY name;`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `SELECT * FROM users
WHERE status = 'active'
-- #region complicated_logic
-- #endregion
ORDER BY name;`);
    });
  });

  describe("multiple regions", () => {
    it("should handle multiple regions in the same file", () => {
      const source = `// #region first
content1
// #endregion
middle
// #region second
content2
// #endregion
end`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `// #region first
// #endregion
middle
// #region second
// #endregion
end`);
    });

    it("should handle multiple regions with different indentation", () => {
      const source = `function outer() {
  // #region outer_region
  const x = 1;
  // #endregion

  function inner() {
    // #region inner_region
    const y = 2;
    // #endregion
  }
}`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `function outer() {
  // #region outer_region
  // #endregion

  function inner() {
    // #region inner_region
    // #endregion
  }
}`);
    });
  });

  describe("no regions found", () => {
    it("should return original content when no regions exist", () => {
      const source = `function hello() {
  console.log('no regions here');
}`;

      const result = outline(source);

      assert.strictEqual(result.found, false);
      assert.strictEqual(result.content, source);
    });

    it("should return found=false for empty content", () => {
      const result = outline("");

      assert.strictEqual(result.found, false);
      assert.strictEqual(result.content, "");
    });
  });

  describe("error handling", () => {
    it("should throw error when region start has no matching endregion", () => {
      const source = `// #region test
content
// missing endregion`;

      assert.throws(() => outline(source), /Mismatched region markers/);
    });

    it("should throw error when multiple regions are missing endregion", () => {
      const source = `// #region first
content1
// #region second
content2`;

      assert.throws(() => outline(source), /Mismatched region markers/);
    });

    it("should throw error when endregion comes before region start", () => {
      const source = `// #endregion
content
// #region test`;

      assert.throws(() => outline(source), /Invalid region nesting/);
    });
  });

  describe("different comment styles", () => {
    it("should handle double slash comments", () => {
      const source = `// #region test
content
// #endregion`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `// #region test
// #endregion`);
    });

    it("should handle hash comments", () => {
      const source = `## #region test
content
## #endregion`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `## #region test
## #endregion`);
    });

    it("should handle dash comments", () => {
      const source = `-- #region test
content
-- #endregion`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `-- #region test
-- #endregion`);
    });

    it("should handle block comment start style", () => {
      const source = `/* #region test
content
/* #endregion`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `/* #region test
/* #endregion`);
    });

    it("should handle exclamation comments", () => {
      const source = `!! #region test
content
!! #endregion`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `!! #region test
!! #endregion`);
    });
  });

  describe("region with whitespace variations", () => {
    it("should handle regions with extra spaces", () => {
      const source = `//   #region   test
content
//   #endregion`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `//   #region   test
//   #endregion`);
    });

    it("should handle regions with tabs", () => {
      const source = `//\t#region test
content
//\t#endregion`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `//\t#region test
//\t#endregion`);
    });

    it("should preserve leading indentation", () => {
      const source = `    // #region test
    content line
    // #endregion`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `    // #region test
    // #endregion`);
    });
  });

  describe("region names", () => {
    it("should handle region names with underscores", () => {
      const source = `// #region test_name
content
// #endregion`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `// #region test_name
// #endregion`);
    });

    it("should handle region names with numbers", () => {
      const source = `// #region test123
content
// #endregion`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `// #region test123
// #endregion`);
    });
  });

  describe("real-world examples", () => {
    it("should handle a complete JavaScript function", () => {
      const source = `export function processData(input: string): string {
  // Validate input
  if (!input) {
    throw new Error('Input required');
  }

  // #region complex_processing
  const tokens = input.split(' ');
  const filtered = tokens.filter(t => t.length > 3);
  const mapped = filtered.map(t => t.toUpperCase());
  const result = mapped.join('-');
  // #endregion

  return result;
}`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `export function processData(input: string): string {
  // Validate input
  if (!input) {
    throw new Error('Input required');
  }

  // #region complex_processing
  // #endregion

  return result;
}`);
    });

    it("should handle a Python class with multiple regions", () => {
      const source = `class Calculator:
    def __init__(self):
        self.result = 0

    def add(self, x, y):
        ## #region validation
        if not isinstance(x, (int, float)):
            raise TypeError('x must be numeric')
        if not isinstance(y, (int, float)):
            raise TypeError('y must be numeric')
        ## #endregion

        ## #region calculation
        self.result = x + y
        ## #endregion

        return self.result`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `class Calculator:
    def __init__(self):
        self.result = 0

    def add(self, x, y):
        ## #region validation
        ## #endregion

        ## #region calculation
        ## #endregion

        return self.result`);
    });

    it("should handle SQL with complex query", () => {
      const source = `SELECT
    u.id,
    u.name,
    -- #region aggregations
    COUNT(o.id) as order_count,
    SUM(o.total) as total_spent,
    AVG(o.total) as avg_order
    -- #endregion
FROM users u
-- #region joins
LEFT JOIN orders o ON u.id = o.user_id
LEFT JOIN order_items oi ON o.id = oi.order_id
-- #endregion
WHERE u.status = 'active'
GROUP BY u.id, u.name;`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `SELECT
    u.id,
    u.name,
    -- #region aggregations
    -- #endregion
FROM users u
-- #region joins
-- #endregion
WHERE u.status = 'active'
GROUP BY u.id, u.name;`);
    });
  });

  describe("edge cases", () => {
    it("should handle empty regions", () => {
      const source = `before
// #region empty
// #endregion
after`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `before
// #region empty
// #endregion
after`);
    });

    it("should handle regions with only whitespace", () => {
      const source = `before
// #region whitespace


// #endregion
after`;

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, `before
// #region whitespace
// #endregion
after`);
    });

    it("should handle Windows line endings (CRLF)", () => {
      const source = "before\r\n// #region test\r\ncontent\r\n// #endregion\r\nafter";

      const result = outline(source);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.content, "before\r\n// #region test\r\n// #endregion\r\nafter");
    });

    it("should handle mixed line endings", () => {
      const source = "before\n// #region test\r\ncontent\n// #endregion\r\nafter";

      const result = outline(source);

      assert.strictEqual(result.found, true);
      // The mixed line endings should be preserved
      assert.strictEqual(result.content, "before\n// #region test\r\n// #endregion\r\nafter");
    });
  });
});
