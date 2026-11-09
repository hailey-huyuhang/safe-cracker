"""Part 1: crack a 10-digit combination safe using a "sound tool".

The sound tool, when fed a guess, reports how many positions of the guess
match the actual combination.  ``crack_safe`` identifies the combination
and reports how many times the tool was used and how long it took.

The algorithm:

1. Probe ``dddddddddd`` for d = 0..8 to learn how many times each digit
   occurs (the count for 9 is implied; the loop stops early once all 10
   positions are accounted for).
2. Pick the most frequent digit ``b`` as a baseline.  The all-``b`` guess
   has a known score (its count), so changing a single position i to a
   digit d moves the score by exactly:
       +1  if position i is d,
       -1  if position i is b,
        0  otherwise  (both b and d are eliminated for that position).
   Candidates for a position are restricted to digits whose remaining
   multiset count is still positive, and are probed most-frequent first.

The only change from the submitted Part 1 code is the optional ``on_guess``
callback, which lets the web service record every probe for display.
"""

import time
from typing import Callable, Optional

GuessHook = Optional[Callable[[str, int], None]]


def make_sound_tool(actual: str, on_guess: GuessHook = None):
    counter = [0]

    def sound_tool(guess: str) -> int:
        counter[0] += 1
        score = sum(1 for a, g in zip(actual, guess) if a == g)
        if on_guess is not None:
            on_guess(guess, score)
        return score

    return sound_tool, counter


def crack_safe(actual_combination: str, on_guess: GuessHook = None):
    """ function which identifies the actual 10 digit combination of the safe

    Returns:
        1. int: number of attempts (times the sound tool was used)
        2. float: seconds it took to crack the safe
    """
    if len(actual_combination) != 10 or not actual_combination.isdigit():
        raise ValueError("combination must be exactly 10 digits")

    start = time.perf_counter()
    L = len(actual_combination)
    tool, counter = make_sound_tool(actual_combination, on_guess)

    counts = [0] * 10
    total = 0
    for d in range(9):
        if total == L:
            break
        counts[d] = tool(str(d) * L)
        total += counts[d]
    counts[9] = L - sum(counts[:9])

    b = max(range(10), key=lambda d: counts[d])
    base_score = counts[b]
    remaining = counts[:]
    answer = [None] * L

    for i in range(L):
        cands = [d for d in range(10) if remaining[d] > 0]
        while len(cands) > 1:
            probes = [d for d in cands if d != b]
            d = max(probes, key=lambda x: remaining[x])
            guess = [str(b)] * L
            guess[i] = str(d)
            delta = tool(''.join(guess)) - base_score
            if delta == 1:
                cands = [d]
            elif delta == -1:
                cands = [b]
            else:
                cands = [x for x in cands if x != d and x != b]
        answer[i] = cands[0]
        remaining[cands[0]] -= 1

    result = ''.join(map(str, answer))
    assert tool(result) == L
    return counter[0], time.perf_counter() - start
