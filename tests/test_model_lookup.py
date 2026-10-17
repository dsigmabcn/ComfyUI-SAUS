"""Where models live: SAUS finds a model by file name in *any* ComfyUI folder."""

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from saus.model_scan import (  # noqa: E402
    candidate_folder_types,
    match_folder_names,
    normalise_folder_name,
)
from saus import model_lookup  # noqa: E402


class FakeFolderPaths:
    """Stand-in for ComfyUI's folder_paths module."""

    def __init__(self, dirs, listings):
        self._dirs = dirs
        self._listings = listings
        self.folder_names_and_paths = {name: (dirs.get(name, []), set()) for name in dirs}

    def map_legacy(self, name):
        return {"unet": "diffusion_models", "clip": "text_encoders"}.get(name, name)

    def get_filename_list(self, name):
        return list(self._listings.get(name, []))

    def get_folder_paths(self, name):
        return [str(p) for p in self._dirs.get(name, [])]


def _tree():
    root = Path(tempfile.mkdtemp(prefix='saus-models-'))
    for relative in (
        'unet/flux-dev.safetensors',
        'diffusion_models/flux2-klein.safetensors',
        'loras/sdxl/style.safetensors',
        'clip/t5xxl.safetensors',
        'checkpoints/sd15.safetensors',
        # ComfyUI registers these in the same folder table, but they are code /
        # data: SAUS must never search them or write a download into them.
        'custom_nodes/Some-Node/evil.py',
        'datasets/data.csv',
    ):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('x')
    return root


def _install_fake(root):
    dirs = {
        'diffusion_models': [root / 'unet', root / 'diffusion_models'],
        'loras': [root / 'loras'],
        'text_encoders': [root / 'text_encoders', root / 'clip'],
        'checkpoints': [root / 'checkpoints'],
        'vae': [root / 'vae'],
        'custom_nodes': [root / 'custom_nodes'],
        'datasets': [root / 'datasets'],
    }
    listings = {
        'diffusion_models': ['flux-dev.safetensors', 'flux2-klein.safetensors'],
        'loras': ['sdxl/style.safetensors'],
        'text_encoders': ['t5xxl.safetensors'],
        'checkpoints': ['sd15.safetensors'],
        'vae': [],
        'custom_nodes': ['Some-Node/evil.py'],
        'datasets': ['data.csv'],
    }
    model_lookup.folder_paths = FakeFolderPaths(dirs, listings)


def test_candidate_order_type_then_hint_then_known():
    got = candidate_folder_types('Diffusion model', '/diffusion_models/', ['loras', 'vae'])
    assert got[0] == 'diffusion_models'
    assert got[1:] == ['loras', 'vae']

    got = candidate_folder_types('LORA', 'loras/sdxl', ['loras'])
    assert got == ['loras']            # override + de-duplication

    got = candidate_folder_types('', '', ['checkpoints'])
    assert got == ['checkpoints']      # unknown type -> known folders last


def test_match_prefers_exact_then_suffix_and_normalises_slashes():
    listing = ['sub/model.safetensors', 'model.safetensors', 'other.bin']
    assert match_folder_names(listing, 'model.safetensors') == 'model.safetensors'
    assert match_folder_names(['sub\\model.safetensors'], 'model.safetensors') == 'sub/model.safetensors'
    assert match_folder_names(['a/b.safetensors'], 'c.safetensors') == ''
    assert match_folder_names([], 'x.safetensors') == ''
    assert match_folder_names(['x.safetensors'], '') == ''


def test_finds_diffusion_model_in_unet_folder():
    _install_fake(_tree())
    hit = model_lookup.find_model('flux-dev.safetensors', 'Diffusion model', '/diffusion_models/')
    assert hit and hit['folder_type'] == 'diffusion_models'
    assert hit['relative_name'] == 'flux-dev.safetensors'
    assert hit['path'].is_file()


def test_finds_model_in_the_other_alias_folder():
    _install_fake(_tree())
    hit = model_lookup.find_model('flux2-klein.safetensors', 'Diffusion model')
    assert hit and hit['path'].name == 'flux2-klein.safetensors'
    assert 'diffusion_models' in str(hit['path'])


def test_finds_lora_inside_a_subfolder():
    _install_fake(_tree())
    hit = model_lookup.find_model('style.safetensors', 'LORA', '/loras/')
    assert hit and hit['relative_name'] == 'sdxl/style.safetensors'


def test_finds_text_encoder_in_the_clip_alias_directory():
    _install_fake(_tree())
    hit = model_lookup.find_model('t5xxl.safetensors', 'TEXT ENCODER')
    assert hit and hit['path'].parent.name == 'clip'


def test_unknown_type_still_found_via_fallback():
    _install_fake(_tree())
    hit = model_lookup.find_model('sd15.safetensors', '', '')
    assert hit and hit['folder_type'] == 'checkpoints'


def test_respects_the_hint_first():
    _install_fake(_tree())
    # A bogus hint must not stop the search.
    hit = model_lookup.find_model('sd15.safetensors', 'VAE', 'nonexistent_folder')
    assert hit and hit['folder_type'] == 'checkpoints'


def test_missing_model_returns_none():
    _install_fake(_tree())
    assert model_lookup.find_model('nope.safetensors', 'Diffusion model') is None
    assert model_lookup.find_model('', 'Diffusion model') is None


def test_destination_and_delete_safety():
    root = _tree()
    _install_fake(root)
    hit = model_lookup.find_model('flux-dev.safetensors', 'Diffusion model')
    assert model_lookup.resolves_inside(hit['path'], hit['directories'])
    assert not model_lookup.resolves_inside(Path('/etc/passwd'), hit['directories'])
    assert model_lookup.destination_for('Diffusion model').name in ('unet', 'diffusion_models')


def test_code_folders_are_never_searched():
    """custom_nodes / datasets hold code and data, not models."""
    _install_fake(_tree())
    for filename, hint in (('evil.py', 'custom_nodes'),
                           ('evil.py', ''),
                           ('data.csv', 'datasets'),
                           ('data.csv', '')):
        assert model_lookup.find_model(filename, '', hint) is None, \
            f'{filename!r} ({hint!r}) must never be found in a model folder'


def test_a_hostile_hint_cannot_aim_the_destination():
    """A request's model_path hint must not redirect a download into code."""
    _install_fake(_tree())
    for hint in ('custom_nodes', 'custom_nodes/Some-Node', 'datasets'):
        dest = model_lookup.destination_for('', hint)
        assert dest is not None, 'a model destination must still be found'
        assert 'custom_nodes' not in dest.parts, f'{hint!r} chose custom_nodes'
        assert 'datasets' not in dest.parts, f'{hint!r} chose datasets'


def test_the_allowlist_excludes_code_folders():
    from saus.model_scan import MODEL_FOLDER_TYPES
    assert 'custom_nodes' not in MODEL_FOLDER_TYPES
    assert 'datasets' not in MODEL_FOLDER_TYPES
    for name in ('checkpoints', 'loras', 'diffusion_models', 'vae', 'text_encoders'):
        assert name in MODEL_FOLDER_TYPES, f'{name!r} must stay a model folder type'


def test_model_folder_directories_excludes_code_folders():
    _install_fake(_tree())
    text = [str(d) for d in model_lookup.model_folder_directories()]
    assert text, 'model directories must be reported'
    assert all('custom_nodes' not in part for part in text)
    assert all('datasets' not in part for part in text)


def test_a_folder_name_is_parsed_the_same_however_it_is_written():
    """The registry writes the same folder as 'unet', '/unet/' and 'unet/x'."""
    for written, wanted in (('unet', 'unet'), ('/unet/', 'unet'), ('unet/', 'unet'),
                            ('/unet', 'unet'), ('/UNET/', 'unet'),
                            ('loras/sdxl', 'loras'), ('/loras/sdxl/', 'loras'),
                            # Only the registry's own aliases live here; ComfyUI's
                            # (unet/clip) are applied later by folder_paths.map_legacy.
                            ('lora', 'loras'), ('clip', 'clip'),
                            ('', ''), (None, ''), ('/', ''), ('  ', '')):
        assert normalise_folder_name(written) == wanted, \
            f'{written!r} must normalise to {wanted!r}'


def test_a_slash_wrapped_hint_keeps_its_priority():
    """A hint written '/unet/' has to steer the search like 'unet' does."""
    known = ['checkpoints', 'loras']
    for hint in ('/upscale_models/', 'upscale_models'):
        got = candidate_folder_types('', hint, known)
        assert got[0] == 'upscale_models', f'{hint!r} was ignored: {got}'


def test_a_hint_is_parsed_the_same_with_or_without_slashes():
    known = ['checkpoints', 'diffusion_models', 'unet', 'loras']
    expected = candidate_folder_types('Diffusion model', 'unet', known)
    for hint in ('/unet/', 'unet/', '/unet'):
        assert candidate_folder_types('Diffusion model', hint, known) == expected, \
            f'{hint!r} must be read exactly like "unet"'


def test_the_alias_mapping_does_not_duplicate_a_folder_type():
    """unet -> diffusion_models collides with the model's own folder type."""
    _install_fake(_tree())
    got = model_lookup.model_folder_candidates('Diffusion model', 'unet')
    assert got == list(dict.fromkeys(got)), f'a folder type is listed twice: {got}'
    assert got[0] == 'diffusion_models', f'the alias must still lead: {got}'


def test_the_hint_chooses_the_registered_directory_of_that_name():
    """A folder type covers several directories, so the hint has to pick one."""
    root = _tree()
    _install_fake(root)

    assert model_lookup.destination_for('Diffusion model', 'diffusion_models') == root / 'diffusion_models'
    assert model_lookup.destination_for('Diffusion model', '/diffusion_models/') == root / 'diffusion_models'
    assert model_lookup.destination_for('Diffusion model', 'unet') == root / 'unet'
    # The hint chooses among the *leading* folder type's directories. A hint
    # naming a folder type of its own that the model's type does not lead with is
    # contradictory metadata, and falls back rather than aiming somewhere odd.
    assert model_lookup.destination_for('Diffusion model', 'loras') == root / 'unet'

    # Still only ever a directory ComfyUI registered: a hint naming a folder that
    # is not a model folder (or no known folder at all) falls back, it never
    # aims the path.
    assert model_lookup.destination_for('Diffusion model', 'nonexistent_folder') == root / 'unet'
    # No hint at all keeps the old answer: the first registered directory.
    assert model_lookup.destination_for('Diffusion model') == root / 'unet'
    # A LoRA's sub-path still resolves to the loras folder, not to a sub-folder
    # of it: only the first segment names a folder type.
    assert model_lookup.destination_for('LORA', 'loras/sdxl') == root / 'loras'


if __name__ == '__main__':
    failures = 0
    for name, fn in sorted(list(globals().items())):
        if name.startswith('test_') and callable(fn):
            try:
                fn()
                print('  OK   ' + name)
            except AssertionError as exc:
                failures += 1
                print('  FAIL ' + name + ' -> ' + repr(exc))
    print('%s' % ('ALL PASSED' if not failures else '%d FAILED' % failures))
    sys.exit(1 if failures else 0)
