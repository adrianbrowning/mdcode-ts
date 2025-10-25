# strings.py - Python string utilities

# Content outside region should not be extracted
VOWELS = "aeiouAEIOU"

# #region reverse
def reverse_string(s):
    return s[::-1]
# #endregion reverse

# More functions outside the region
def is_palindrome(s):
    return s == s[::-1]

def count_vowels(s):
    return sum(1 for char in s if char in VOWELS)
