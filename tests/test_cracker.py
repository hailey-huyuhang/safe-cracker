import random

import pytest

from backend.cracker import crack_safe


def crack_with_trace(combination):
    trace = []
    attempts, time_taken = crack_safe(
        combination, lambda guess, matches: trace.append((guess, matches))
    )
    return attempts, time_taken, trace


@pytest.mark.parametrize(
    "combination",
    [
        "0000000000",
        "9999999999",
        "0123456789",
        "9876543210",
        "0800666666",
        "5555555550",
        "0000000009",
        "1212121212",
    ],
)
def test_cracks_edge_cases(combination):
    attempts, time_taken, trace = crack_with_trace(combination)
    assert trace[-1] == (combination, 10)
    assert attempts == len(trace)
    assert time_taken >= 0


def test_cracks_random_combinations():
    rng = random.Random(2024)
    for _ in range(300):
        combination = "".join(rng.choices("0123456789", k=10))
        attempts, _, trace = crack_with_trace(combination)
        assert trace[-1] == (combination, 10), combination
        assert attempts == len(trace) <= 60


def test_every_probe_is_a_valid_combination():
    _, _, trace = crack_with_trace("4827163950")
    assert all(len(guess) == 10 and guess.isdigit() for guess, _ in trace)
    assert all(0 <= matches <= 10 for _, matches in trace)


def test_hook_does_not_change_the_result():
    attempts_plain, _ = crack_safe("3141592653")
    attempts_hooked, _, _ = crack_with_trace("3141592653")
    assert attempts_plain == attempts_hooked


@pytest.mark.parametrize("bad", ["123", "12345678901", "12345abcde", ""])
def test_rejects_invalid_input(bad):
    with pytest.raises(ValueError):
        crack_safe(bad)
