import { showSpinner, hideSpinner, escapeHtml } from '../utils.js';
import { getMediaDrag, endMediaDrag } from '/core/js/common/scripts/appDrag.js';
import {
  filterByKind, acceptForKind, thumbnailUrlForPath,
} from '/core/js/common/scripts/mediaKinds.js';

export { filterByKind, acceptForKind };

/**
 * A compressed preview URL for a file in ComfyUI's `input/`. The picker used to point
 * every 120 px tile at the full-size original through `/view`, so opening it on a
 * folder of 4000x3000 photos downloaded all of them at full size.
 */
function thumbnailUrl(name, size = 256) {
  return thumbnailUrlForPath(`input/${name}`, size);
}

/**
 * Extensions this control never uploads: they mirror `BLOCKED_UPLOAD_EXTENSIONS`
 * in `saus/constants.py`, because everything here goes to ComfyUI's own
 * `/upload/image`, which screens nothing (the File Manager's upload handler is a
 * different route and enforces the list server-side).
 * `tests/test_media_drag.py` fails if the two lists drift apart.
 */
const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  'py', 'pyc', 'pyo', 'pyw', 'pyd', 'so', 'dll', 'dylib', 'exe', 'msi',
  'bat', 'cmd', 'com', 'scr', 'sh', 'bash', 'zsh', 'ksh', 'csh', 'ps1',
  'psm1', 'vbs', 'vbe', 'js', 'mjs', 'cjs', 'jar', 'class', 'php', 'pl',
  'rb', 'lua', 'htaccess', 'service', 'desktop',
]);

/**
 * True when a filename must not be uploaded.
 *
 * Same *extension* rule as the server's `allowed_file()`: the text after the last dot,
 * lower-cased. No extension at all is fine, an empty name is left to ComfyUI.
 */
export function isBlockedUploadName(filename) {
  const name = (filename || '').trim();
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return BLOCKED_UPLOAD_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export default class ImageLoader {
  static DEFAULT_CONFIG = {
    allowedFileType: 'video',
    defaultImageSrc: '/core/media/ui/drop_image_rect_no_border_trans.webp',
    showIndicator: false,
  };

  constructor(containerId, config = {}, onImageLoaded = null) {
    this.containerId = containerId;
    this.config = { ...ImageLoader.DEFAULT_CONFIG, ...config };
    this.onImageLoaded = onImageLoaded;
    this.imageDropArea = null;
    this.init();
  }

  init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.error(`Container with ID ${this.containerId} not found.`);
      return;
    }

    if (this.imageDropArea) {
      this.destroy();
    }

    this.imageDropArea = document.createElement('div');
    this.imageDropArea.classList.add('image-loader');

    // The button now acts as the title and browse trigger.
    this.browseButton = document.createElement('button');
    // The File Manager's folder glyph rather than an emoji: the two sit in the same
    // window, inches apart.
    this.browseButton.innerHTML =
      `<i class="fas fa-folder"></i> ${escapeHtml(this.config.label || 'Browse')}`;
    this.browseButton.classList.add('image-loader-title');
    this.browseButton.style.width = '100%';
    this.browseButton.style.cursor = 'pointer';
    this.browseButton.style.fontSize = '1em';
    this.browseButton.style.margin = '0';
    this.browseButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openBrowseModal();
    });
    this.container.appendChild(this.browseButton);

    // The empty state is a Font Awesome glyph, like the File Manager's - the old
    // dashed PNG drew its own frame *inside* the card and fought the panel styling.
    // The first real load replaces this element with an <img> or <video>.
    this.imgElement = document.createElement('i');
    this.imgElement.className = (this.config.placeholderIcon || 'fas fa-image')
      + ' image-loader-placeholder';

    this.imageDropArea.appendChild(this.imgElement);
    this.container.appendChild(this.imageDropArea);

    // The whole rectangle opens the picker on a single click. Only the small header
    // button used to, which is why the drop area read as decoration - the picker is
    // what "load an input" means here, and a drag still works on top of it.
    this.imageDropArea.setAttribute('role', 'button');
    this.imageDropArea.setAttribute('tabindex', '0');
    this.imageDropArea.setAttribute('aria-label', `Choose ${this.kindNoun()}`);
    this.imageDropArea.title = `Click to choose ${this.kindNoun()}, or drop one here`;

    this.fileInputElement = document.createElement('input');
    this.fileInputElement.type = 'file';
    // The OS dialog filters as well as the picker (the list is also filtered by
    // `filterByKind`, since `accept` is only a hint the user can override).
    this.fileInputElement.accept = acceptForKind(this.config.allowedFileType);
    this.fileInputElement.style.display = 'none';

    this.container.appendChild(this.fileInputElement);


    this.setupEventListeners();
  }

  destroy() {
    if (this.imageDropArea) {
      this.removeEventListeners();
      this.imageDropArea.remove();
      this.imageDropArea = null;
      this.imgElement = null;
      if (this.fileInputElement) {
        this.fileInputElement.remove();
        this.fileInputElement = null;
      }
      if (this.browseButton) {
        this.browseButton.remove();
      }
    }
  }

  setElementStyles(element) {
    Object.assign(element.style, {
      maxWidth: '100%',
      maxHeight: '100%',
      width: 'auto',
      height: 'auto',
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      objectFit: 'contain',
    });
  }

  setupEventListeners() {
    this.handleDragEnter = (e) => this.onDragEnter(e);
    this.handleDragOver = (e) => this.onDragOver(e);
    this.handleDragLeave = (e) => this.onDragLeave(e);
    this.handleDrop = (e) => this.onDrop(e);

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
      this.imageDropArea.addEventListener(eventName, this.preventDefaults, false);
    });

    this.imageDropArea.addEventListener('dragenter', this.handleDragEnter, false);
    this.imageDropArea.addEventListener('dragover', this.handleDragOver, false);
    this.imageDropArea.addEventListener('dragleave', this.handleDragLeave, false);
    this.imageDropArea.addEventListener('drop', this.handleDrop, false);

    // A click (or Enter/Space) opens the picker. There is no separate double click any
    // more: the file dialog it used to open is a button inside the picker, so a double
    // click cannot open two things at once.
    this.handleClick = (e) => this.onClick(e);
    this.imageDropArea.addEventListener('click', this.handleClick, false);
    this.handleKeyDown = (e) => this.onKeyDown(e);
    this.imageDropArea.addEventListener('keydown', this.handleKeyDown, false);

    this.handleFileInputChange = (e) => this.onFileInputChange(e);
    this.fileInputElement.addEventListener('change', this.handleFileInputChange, false);
  }

  removeEventListeners() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
      this.imageDropArea.removeEventListener(eventName, this.preventDefaults, false);
    });

    this.imageDropArea.removeEventListener('dragenter', this.handleDragEnter, false);
    this.imageDropArea.removeEventListener('dragover', this.handleDragOver, false);
    this.imageDropArea.removeEventListener('dragleave', this.handleDragLeave, false);
    this.imageDropArea.removeEventListener('drop', this.handleDrop, false);

    this.imageDropArea.removeEventListener('click', this.handleClick, false);
    this.imageDropArea.removeEventListener('keydown', this.handleKeyDown, false);

    if (this.fileInputElement) {
      this.fileInputElement.removeEventListener('change', this.handleFileInputChange, false);
    }
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  onDragEnter(e) {
    this.imageDropArea.classList.add('highlight');
  }

  onDragOver(e) {
    this.imageDropArea.classList.add('highlight');
  }

  onDragLeave(e) {
    this.imageDropArea.classList.remove('highlight');
  }

  onDrop(e) {
    this.imageDropArea.classList.remove('highlight');

    // A file dragged in from SAUS itself (the Recent panel, the File Manager) is
    // already on the server, so it is *referenced* rather than uploaded again.
    const dragged = getMediaDrag(e.dataTransfer);
    if (dragged) {
      this.useExistingMedia(dragged);
      return;
    }

    const file = e.dataTransfer.files[0];
    if (file) {
      this.handleFile(file);
    }
  }

  /** Points this loader at a file SAUS already has: anything not in `input/` is
   *  copied there first, then the workflow is written like an upload writes it. */
  async useExistingMedia(payload) {
    if (!payload || !payload.filename) return;

    let name;
    try {
      name = await this.ensureInputFile(payload);
    } catch (error) {
      this.showErrorMessage(`Could not use that file: ${error.message}`);
      return;
    }

    const src = `/view?filename=${encodeURIComponent(name.split('/').pop())}`
        + (name.includes('/') ? `&subfolder=${encodeURIComponent(name.split('/').slice(0, -1).join('/'))}` : '')
        + '&type=input';

    // The media is displayed *and* handed on: the component's callback writes the
    // filename into the graph (`updateWorkflow(... nodePath, name)`).
    this.displayMedia({ type: this.guessMimeType(name) }, src);
    if (typeof this.onImageLoaded === 'function') {
      this.onImageLoaded(src, { name });
    }
    endMediaDrag();
  }

  /**
   * The file's name inside ComfyUI's `input/`, which is all `LoadImage` /
   * `LoadVideo` read: the bytes go to ComfyUI's `/upload/image` and not to the File
   * Manager's move endpoint, which refuses `input/` as a root (the first version's
   * HTTP 403). A file already in `input/` needs nothing. Blocked extensions are
   * refused before anything is uploaded (see `BLOCKED_UPLOAD_EXTENSIONS`).
   */
  async ensureInputFile(payload) {
    if (isBlockedUploadName(payload.filename)) {
      throw new Error(`${payload.filename}: this file type cannot be uploaded`);
    }

    if (payload.type === 'input') {
      return payload.subfolder ? `${payload.subfolder}/${payload.filename}` : payload.filename;
    }

    const source = `/view?filename=${encodeURIComponent(payload.filename)}`
      + (payload.subfolder ? `&subfolder=${encodeURIComponent(payload.subfolder)}` : '')
      + `&type=${encodeURIComponent(payload.type)}`;

    const media = await fetch(source);
    if (!media.ok) throw new Error(`HTTP ${media.status}`);
    const blob = await media.blob();

    const form = new FormData();
    form.append('image', blob, payload.filename);
    // No `overwrite`: a name clash makes ComfyUI save a copy, never clobber an input.
    const response = await fetch('/upload/image', { method: 'POST', body: form });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const saved = await response.json();
    return saved.subfolder ? `${saved.subfolder}/${saved.name}` : saved.name;
  }

  /** "an image" / "a video" / "an audio file", for titles, labels and tooltips. */
  kindNoun() {
    const kind = this.config.allowedFileType || 'image';
    if (kind === 'video') return 'a video';
    if (kind === 'audio') return 'an audio file';
    return 'an image';
  }

  /** The rectangle is one big button for the picker (the header button is separate). */
  onClick(e) {
    if (e.target === this.browseButton || this.browseButton.contains(e.target)) return;
    this.openBrowseModal();
  }

  onKeyDown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    this.openBrowseModal();
  }

  /** The OS file dialog, offered from inside the picker. */
  openFileDialog() {
    this.fileInputElement.click();
  }

  onFileInputChange(e) {
    const file = e.target.files[0];
    if (file) {
      this.handleFile(file);
    }
    e.target.value = '';
  }

  async handleFile(file) {
    // Before `showSpinner()`: a refusal here must not leave the spinner running.
    if (isBlockedUploadName(file.name)) {
      this.showErrorMessage(`Unsupported file type: scripts and executables cannot be uploaded.`);
      return;
    }

    showSpinner();

    try {
      const localSrc = URL.createObjectURL(file);
      this.displayMedia(file, localSrc);
      const result = await this.uploadFile(file);
      this.handleUploadSuccess(localSrc, result);
    } catch (error) {
      this.handleUploadError(error);
    } finally {
      hideSpinner();
    }
  }

  showErrorMessage(message) {
    console.error(message);
    alert(message);
  }

  /*displayMedia(file, src) {
    if (file.type.startsWith('image/')) {
      this.displayImage(src);
    } else if (file.type.startsWith('video/')) {
      this.displayVideo(src);
    }
  }*/
  displayMedia(file, src) {
    const safeImages = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'];
    const safeVideos = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska'];

    if (safeImages.includes(file.type)) {
      this.displayImage(src);
    } else if (safeVideos.includes(file.type)) {
      this.displayVideo(src);
    } else {
      console.error("Untrusted or unsupported file type:", file.type);
      // Optionally revoke the URL if you don't use it
      if (src && src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
    }
  }


  displayImage(src) {
    if (!(this.imgElement instanceof HTMLImageElement)) {
      const newImgElement = document.createElement('img');
      this.setElementStyles(newImgElement);
      this.imageDropArea.replaceChild(newImgElement, this.imgElement);
      this.imgElement = newImgElement;
    }
    this.imgElement.onload = () => {
      if (src && src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
    };
    this.imgElement.src = src;
    this.imgElement.alt = 'Loaded Image';
  }

  displayVideo(src) {
    if (!(this.imgElement instanceof HTMLVideoElement)) {
      const videoElement = document.createElement('video');
      videoElement.controls = true;
      videoElement.autoplay = true;
      this.setElementStyles(videoElement);
      this.imageDropArea.replaceChild(videoElement, this.imgElement);
      this.imgElement = videoElement;
    }
  // Use onloadedmetadata for video elements
    this.imgElement.onloadedmetadata = () => {
      if (src && src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
    };
    this.imgElement.onerror = () => {
      if (src && src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
    };
    this.imgElement.src = src;

  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch('/upload/image', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.message || 'Upload failed');
    }

    return response.json();
  }

  handleUploadSuccess(localSrc, result) {
    if (typeof this.onImageLoaded === 'function') {
      this.onImageLoaded(localSrc, result);
    }
  }

  handleUploadError(error) {
    console.error('Error during upload', error);
    this.showErrorMessage(`Error during upload: ${error.message}`);
  }

  async openBrowseModal() {
    showSpinner();
    try {
      const response = await fetch('/saus/api/files/input');
      if (!response.ok) throw new Error('Failed to fetch input files');
      const files = await response.json();
      // Only what this node can load: a LoadVideo input was offered every picture in
      // `input/`, and choosing one wrote a name the graph could not read.
      this.createModalUI(filterByKind(files, this.config.allowedFileType));
    } catch (error) {
      console.error(error);
      alert('Error loading input files: ' + error.message);
    } finally {
      hideSpinner();
    }
  }

  createModalUI(files) {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.8)', zIndex: '10000', display: 'flex',
      justifyContent: 'center', alignItems: 'center'
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
      backgroundColor: 'var(--color-background-secondary)',
      border: '1px solid var(--color-border)',
      width: '80%', maxWidth: '900px', maxHeight: '80%',
      display: 'flex', flexDirection: 'column', padding: '10px',
      boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '10px', borderBottom: '1px dashed var(--color-border)', paddingBottom: '5px'
    });
    header.innerHTML =
      `<h3 style="margin:0; color:var(--color-primary-text)">Select ${this.kindNoun()}</h3>`;

    // The file dialog lives here now: a double click on the rectangle used to open it,
    // which is also what a single click now does (the picker), so it moved inside.
    const uploadBtn = document.createElement('button');
    uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload';
    uploadBtn.className = 'image-loader-upload-btn';
    Object.assign(uploadBtn.style, {
      marginLeft: 'auto', marginRight: '10px', cursor: 'pointer', padding: '4px 10px'
    });
    uploadBtn.onclick = () => this.openFileDialog();
    header.appendChild(uploadBtn);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    Object.assign(closeBtn.style, {
      background: 'transparent', border: 'none', color: 'var(--color-primary-text)',
      fontSize: '24px', cursor: 'pointer'
    });
    closeBtn.onclick = () => document.body.removeChild(overlay);
    header.appendChild(closeBtn);

    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
      gap: '10px', overflowY: 'auto', padding: '10px', flex: '1'
    });
    grid.classList.add('custom-scrollbar');

    files.forEach(filename => {
      const item = document.createElement('div');
      Object.assign(item.style, {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        cursor: 'pointer', padding: '5px', border: '1px solid transparent',
        borderRadius: '4px', transition: 'background 0.2s'
      });
      item.onmouseover = () => item.style.backgroundColor = 'var(--color-background-pattern)';
      item.onmouseout = () => item.style.backgroundColor = 'transparent';
      item.onclick = () => {
        this.selectExistingFile(filename);
        document.body.removeChild(overlay);
      };

      const isVideo = this.guessMimeType(filename).startsWith('video/');
      // Pictures come through the server's thumbnail endpoint (a 120 px tile of a
      // full-size photo is what made the picker slow); a video keeps a real <video>
      // - muted, and only its metadata - because there is nothing to resize.
      const mediaUrl = isVideo
        ? `/view?filename=${encodeURIComponent(filename)}&type=input`
        : thumbnailUrl(filename);

      let mediaEl;
      if (isVideo) {
        mediaEl = document.createElement('video');
        mediaEl.src = mediaUrl;
        mediaEl.muted = true;
        mediaEl.preload = 'metadata';
      } else {
        mediaEl = document.createElement('img');
        mediaEl.src = mediaUrl;
        mediaEl.loading = 'lazy';
        mediaEl.alt = filename;
      }
      Object.assign(mediaEl.style, {
        width: '100px', height: '100px', objectFit: 'cover',
        border: '1px solid var(--color-border)', marginBottom: '5px'
      });

      const label = document.createElement('span');
      label.textContent = filename;
      Object.assign(label.style, {
        fontSize: '12px', color: 'var(--color-primary-text)',
        textAlign: 'center', wordBreak: 'break-all'
      });

      item.appendChild(mediaEl);
      item.appendChild(label);
      grid.appendChild(item);
    });

    if (!files.length) {
      // An empty grid looks broken: say which folder was empty and what it was filtered to.
      const empty = document.createElement('p');
      empty.className = 'image-loader-empty';
      empty.textContent = `No ${this.config.allowedFileType || 'image'} files in input/ yet.`;
      Object.assign(empty.style, {
        margin: '20px', color: 'var(--color-primary-text)', opacity: '0.7'
      });
      grid.appendChild(empty);
    }

    modal.appendChild(header);
    modal.appendChild(grid);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  selectExistingFile(filename) {
    const url = `/view?filename=${encodeURIComponent(filename)}&type=input`;
    const mimeType = this.guessMimeType(filename);
    this.displayMedia({ type: mimeType }, url);
    this.handleUploadSuccess(url, { name: filename });
  }

  guessMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'jpg') return 'image/jpeg';
    if (['png', 'jpeg', 'webp', 'avif', 'bmp', 'gif'].includes(ext)) return 'image/' + ext;
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'mkv') return 'video/x-matroska';
    if (['mp4', 'webm', 'ogg'].includes(ext)) return 'video/' + ext;
    return 'application/octet-stream';
  }
}
