"""The architecture data: variants bind real registry files, no legacy shape left."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'web' / 'saus_browser' / 'data'
APPS = ROOT / 'web' / 'apps'
ARCHITECTURES = DATA / 'architectures.json'
MODELS = DATA / 'models.json'

# Retired with the models_data.json -> models.json migration (the client ignores them).
LEGACY_KEYS = ('components', 'base_settings', 'turbo_settings')


def _load():
    architectures = json.loads(ARCHITECTURES.read_text(encoding='utf-8'))
    registry = json.loads(MODELS.read_text(encoding='utf-8'))['models']
    return architectures, registry


def _file_names(entry):
    """A model entry is either a file name or `{file: ...}`."""
    return entry if isinstance(entry, str) else (entry or {}).get('file')


def test_no_architecture_keeps_the_legacy_shape():
    """A legacy key is inert at runtime, so its return is a silent regression."""
    architectures, _ = _load()
    offenders = [f'{name}: {key}' for name, arch in architectures.items()
                 for key in LEGACY_KEYS if key in arch]
    assert not offenders, (
        'architectures.json has the retired keys back (the client ignores them): '
        + ', '.join(offenders)
    )


def test_every_named_model_is_in_the_registry():
    """A file the registry does not know cannot be bound to a node or downloaded."""
    architectures, registry = _load()
    missing = []
    for name, arch in architectures.items():
        for group in arch.get('models') or []:
            for entry in group.get('files') or []:
                file = _file_names(entry)
                if file and file not in registry:
                    missing.append(f'{name}/{group.get("id")}: {file}')
        for vid, variant in (arch.get('variants') or {}).items():
            picked = list((variant.get('pick') or {}).values()) + list(variant.get('loras') or [])
            missing += [f'{name}/{vid}: {f}' for f in picked if f not in registry]
    assert not missing, (
        'these models are not in models.json, so the variant would bind nothing: '
        + '; '.join(missing)
    )


def test_a_variant_always_has_model_groups_to_bind():
    """Variant buttons are built from `models`; without groups they bind nothing."""
    architectures, _ = _load()
    broken = [name for name, arch in architectures.items()
              if arch.get('variants') and not arch.get('models')]
    assert not broken, (
        'these architectures offer variants but carry no model groups: '
        + ', '.join(broken)
    )


def test_an_hd_turbo_variant_switches_the_sigma_source():
    """The Qwen pairs differ by a toggle, not by the graph: one switch picks the schedule."""
    architectures, _ = _load()
    for url in ('qwen-image-2-1-text-to-image', 'qwen-image-2-1-image-edit', 'qwen-image-2-1-edit'):
        config = json.loads((APPS / url / 'appConfig.json').read_text(encoding='utf-8'))
        graph = json.loads((APPS / url / 'wf.json').read_text(encoding='utf-8'))

        toggles = {t['label'].lower(): t for t in config.get('toggles') or []}
        assert 'enable manual sigmas' in toggles, f'{url} has no manual-sigmas toggle'
        switch = graph[toggles['enable manual sigmas']['nodePath'].split('.')[0]]
        assert switch['class_type'] == 'ComfySwitchNode', f'{url}: the toggle must drive a switch'
        assert graph[switch['inputs']['on_false'][0]]['class_type'] == 'BasicScheduler', \
            f'{url}: off (HD) takes the simple scheduler'
        assert graph[switch['inputs']['on_true'][0]]['class_type'] == 'ManualSigmas', \
            f'{url}: on (Turbo) takes the manual schedule'

        variants = architectures[config['metadata']['architecture']]['variants']
        assert variants['BASE']['settings']['enable manual sigmas'] is False, \
            f'{url}: HD leaves it off'
        assert variants['TURBO']['settings']['enable manual sigmas'] is True, \
            f'{url}: Turbo turns it on'
        assert variants['BASE']['settings']['steps'] == '25', f'{url}: HD is 25 steps'
        assert variants['TURBO']['settings']['steps'] == '8', f'{url}: Turbo reads 8'

        # The stepper ships that same number, so the app and the variant agree.
        step_stepper = next(s for s in config['steppers'] if s['label'] == 'Steps')
        assert str(step_stepper['defValue']) == variants['BASE']['settings']['steps'], \
            f'{url}: the Steps box and the HD variant disagree'


def test_the_prompt_box_drives_both_prompt_branches():
    """One string node holds the prompt; the raw *and* the enhancer branch read it.

    These graphs route the prompt through a `ComfySwitchNode` (raw prompt, or the
    `TextGenerate` rewrite). A box bound to one of those two branches is silently
    ignored by the other one, so the app runs a baked-in demo prompt instead of what
    the user typed - which is exactly how the Turbo templates' demo prompt survived
    into the apps.
    """
    for url in ('qwen-image-2-1-text-to-image', 'qwen-image-2-1-image-edit',
                'qwen-image-2-1-edit'):
        config = json.loads((APPS / url / 'appConfig.json').read_text(encoding='utf-8'))
        graph = json.loads((APPS / url / 'wf.json').read_text(encoding='utf-8'))

        prompt = config['prompts'][0]
        node_id, _, input_name = prompt['nodePath'].partition('.inputs.')
        node = graph[node_id]
        assert node['class_type'] == 'PrimitiveStringMultiline', \
            f'{url}: the prompt box must write a plain string node, not {node["class_type"]}'
        assert input_name == 'value', f'{url}: {prompt["nodePath"]} is not a widget write'
        assert node['inputs']['value'] == prompt['default'], \
            f'{url}: the graph ships a different prompt than the app config'

        readers = {graph[nid]['class_type'] + '.' + key
                   for nid, n in graph.items() for key, value in n['inputs'].items()
                   if isinstance(value, list) and list(value) == [node_id, 0]}
        assert 'ComfySwitchNode.on_false' in readers, \
            f'{url}: the raw-prompt branch must read the box'
        assert 'TextGenerate.prompt' in readers, \
            f'{url}: the prompt enhancer must read the box, not a baked-in demo prompt'


def test_no_registry_entry_is_unreachable():
    """A registered file that nothing needs is a download nobody can use.

    "Needed" is the rule the Model Manager's Unused chip applies: an app's
    `metadata.models`, its architecture's model groups, or a variant's pick / LoRA.
    """
    architectures, registry = _load()

    used = set()
    for app_file in APPS.rglob('appConfig.json'):
        metadata = json.loads(app_file.read_text(encoding='utf-8')).get('metadata') or {}
        used.update(metadata.get('models') or [])
        arch = architectures.get(metadata.get('architecture')) or {}
        for group in arch.get('models') or []:
            for entry in group.get('files') or []:
                used.add(_file_names(entry))
        for variant in (arch.get('variants') or {}).values():
            used.update((variant.get('pick') or {}).values())
            used.update(variant.get('loras') or [])

    orphans = sorted(set(registry) - used)
    assert not orphans, (
        'registry entries no app and no architecture needs - drop them with '
        "tools/registry.py remove-model: " + ', '.join(orphans)
    )


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)} architecture-data tests passed')


if __name__ == '__main__':
    main()
