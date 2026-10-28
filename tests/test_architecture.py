"""Where a constant lives: shared in `constants.py`, a single reader's with its owner."""

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAUS = ROOT / 'saus'
CONSTANTS = SAUS / 'constants.py'

CONSTANT_RE = re.compile(r'^[A-Z][A-Z0-9_]*$')


def _module_constants(path):
    """The top-level ALL_CAPS names a module assigns."""
    tree = ast.parse(path.read_text(encoding='utf-8'))
    names = set()
    for node in tree.body:
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets = [node.target]
        else:
            continue
        for target in targets:
            if isinstance(target, ast.Name) and CONSTANT_RE.match(target.id):
                names.add(target.id)
    return names


def _sources():
    """{path: source} for the root entry file, every `saus/` module and the suites."""
    paths = [ROOT / '__init__.py']
    paths += sorted(SAUS.glob('*.py'))
    paths += sorted((ROOT / 'tests').glob('*.py'))
    return {p: p.read_text(encoding='utf-8') for p in paths if p.exists()}


def _mentions(source, name):
    return len(re.findall(r'\b%s\b' % re.escape(name), source))


def test_no_name_is_defined_in_constants_and_never_read():
    """A dead entry in constants.py is a stale leftover - delete it."""
    sources = _sources()
    dead = []
    for name in sorted(_module_constants(CONSTANTS)):
        # One occurrence is the definition itself; a second one is a reader.
        if sum(_mentions(src, name) for src in sources.values()) < 2:
            dead.append(name)

    assert not dead, (
        'constants.py defines name(s) nothing reads: %s - delete them, or move them '
        'to whoever should own them' % ', '.join(dead)
    )


def test_a_module_local_constant_is_not_read_by_another_module():
    """Two modules reading one constant means it was never made shared deliberately."""
    sources = _sources()
    offenders = []

    for path in sorted(SAUS.glob('*.py')):
        if path.name in ('constants.py', '__init__.py'):
            continue
        for name in sorted(_module_constants(path)):
            readers = sorted(
                other.name for other, text in sources.items()
                if other.parent == SAUS
                and other.name not in (path.name, 'constants.py')
                and _mentions(text, name)
            )
            if readers:
                offenders.append(f'{path.name}:{name} read by {", ".join(readers)}')

    assert not offenders, (
        'a module-local constant is read by another module - make it shared on '
        'purpose (constants.py) or move it to its owner:\n  ' + '\n  '.join(offenders)
    )


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)} architecture tests passed')


if __name__ == '__main__':
    main()
