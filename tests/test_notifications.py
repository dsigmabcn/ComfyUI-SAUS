"""The end-of-generation notice: a breadcrumb always, a chime only on request.

Two things this pins, because both are easy to get subtly wrong:

* the hook is ComfyUI's ``execution_success`` - sent once per finished prompt - and not
  the progress bar reaching its maximum, which a two-pass graph (base, then a refiner or
  an upscale) hits twice;
* the sound is **off by default** and read from the same ``SausMenuPref`` key the
  Settings pane writes, so an app tab the shell never talked to still honours it.

Runs under pytest or directly (``python tests/test_notifications.py``).
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / 'web' / 'core' / 'js' / 'common'
NOTIFY_JS = CORE / 'scripts' / 'notifications.js'
HANDLER_JS = CORE / 'components' / 'messageHandler.js'
PROGRESS_JS = CORE / 'components' / 'progressbar.js'
SETTINGS_JS = CORE / 'components' / 'settings.js'
SHELL_JS = ROOT / 'web' / 'saus_browser' / 'js' / 'main.js'
NOTICES_CSS = ROOT / 'web' / 'core' / 'css' / 'notices.css'
SHELL_CSS = ROOT / 'web' / 'saus_browser' / 'css' / 'styles.css'
MAIN_CSS = ROOT / 'web' / 'core' / 'css' / 'main.css'


def test_the_sound_is_off_until_asked_for():
    settings = SETTINGS_JS.read_text(encoding='utf-8')
    notify = NOTIFY_JS.read_text(encoding='utf-8')

    assert 'playSoundOnComplete: false' in settings, \
        'the Settings default has to be off - a fresh install stays quiet'
    assert 'new PreferencesManager({ playSoundOnComplete: false })' in notify, \
        'and the app page reads the same key with the same default'
    assert "get('playSoundOnComplete') === true" in notify, \
        'only an explicit true plays; a missing key must not chime'
    assert 'if (completionSoundEnabled()) playCompletionChime();' in notify, \
        'the breadcrumb is unconditional, the chime is not'
    assert 'preferences().reload();' in notify, \
        'and the preference is read fresh: the switch can be flipped while the page is open'


def test_the_notice_hangs_off_the_end_of_the_prompt():
    handler = HANDLER_JS.read_text(encoding='utf-8')
    progress = PROGRESS_JS.read_text(encoding='utf-8')

    assert "case 'execution_success':" in handler and 'handleExecutionSuccess()' in handler, \
        'the end-of-prompt message is the hook'
    assert 'announceGenerationComplete()' in handler, \
        'the app hands the news to the shell rather than drawing it itself'
    assert 'notifyGenerationComplete' not in progress, \
        'not hung off progress: value === max happens once per sampler pass'


def test_the_breadcrumb_is_styled_where_both_documents_load_it():
    """The shell renders the notice, and the shell does **not** load main.css.

    A copy of these rules in main.css alone left the shell appending an unstyled div to its
    body: no notice where the user could see it, and the occasional stray scrollbar. The
    rules live in their own file and both stylesheets import it - main.css for the app
    pages, the shell's styles.css for the shell.
    """
    notices = NOTICES_CSS.read_text(encoding='utf-8')
    main = MAIN_CSS.read_text(encoding='utf-8')
    shell_styles = SHELL_CSS.read_text(encoding='utf-8')
    notify = NOTIFY_JS.read_text(encoding='utf-8')

    assert '#saus-notices' in notices and '.saus-toast' in notices, \
        'the notice needs a home and a look'
    assert "url('/core/css/notices.css')" in main, 'the app pages have to reach it'
    assert "url('/core/css/notices.css')" in shell_styles, \
        'and so does the shell - it is the document that shows it now'
    assert "setAttribute('role', 'status')" in notify, \
        'and a screen reader should announce it too'
    assert 'top: 20px;' in notices and 'right: 20px;' in notices, \
        'the notice sits where the other breadcrumbs sit'
    assert "classList.add('show')" in notify and 'toast-success' in notify, \
        "and borrows the Settings toast's card, classes and reveal"
    assert 'setTimeout(() => toast.remove(), 500)' in notify, \
        'with a removal backstop: no transition means no transitionend, and it would stay'
    assert 'setTimeout(() => toast.remove(), 500)' in SETTINGS_JS.read_text(encoding='utf-8'), \
        'the Settings toast had exactly the same hole'


def test_the_switch_and_its_handler_exist():
    settings = SETTINGS_JS.read_text(encoding='utf-8')

    assert 'id="play-sound-on-complete"' in settings
    assert 'Play sound when generation is finished' in settings, 'the label asked for'
    assert 'setPlaySoundOnComplete(soundSwitch.checked)' in settings, \
        'the switch has to persist through the setter, not poke localStorage itself'
    assert "set('playSoundOnComplete', on)" in settings


def test_the_shell_is_what_shows_and_plays():
    """An app is an iframe, so a notice drawn inside it dies when tabs are switched."""
    notify = NOTIFY_JS.read_text(encoding='utf-8')
    shell = SHELL_JS.read_text(encoding='utf-8')

    assert 'window.parent.postMessage' in notify and 'window.location.origin' in notify, \
        'the app posts to the shell, to this origin only'
    assert 'notifyGenerationComplete(message);' in notify, \
        'and still shows it itself when there is no shell (a standalone app page)'
    assert 'listenForGenerationComplete()' in shell, \
        'the shell registers the listener: it outlives the tabs, so it is what shows it'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)}/{len(tests)} notification tests passed')


if __name__ == '__main__':
    main()
