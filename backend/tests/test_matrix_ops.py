import numpy as np

from app.preprocessing import matrix as mx


def _sym():
    m = np.arange(9, dtype=float).reshape(3, 3)
    np.fill_diagonal(m, 0.0)
    return m


def test_insert_then_remove_is_identity():
    base = _sym()
    row = np.array([10.0, 11.0, 12.0])
    col = np.array([20.0, 21.0, 22.0])
    grown = mx.insert_node(base, 1, row, col)
    assert grown.shape == (4, 4)
    assert grown[1, 1] == 0.0
    assert list(grown[1, :]) == [10.0, 0.0, 11.0, 12.0]
    assert list(grown[:, 1]) == [20.0, 0.0, 21.0, 22.0]
    assert np.allclose(mx.remove_node(grown, 1), base)


def test_replace_node_sets_row_and_col():
    base = _sym()
    out = mx.replace_node(base, 0, np.array([9.0, 5.0, 6.0]), np.array([9.0, 7.0, 8.0]))
    assert out[0, 0] == 0.0
    assert list(out[0, :]) == [0.0, 5.0, 6.0]
    assert list(out[:, 0]) == [0.0, 7.0, 8.0]
