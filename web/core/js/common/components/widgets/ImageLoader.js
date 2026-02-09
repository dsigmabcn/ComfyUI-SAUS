import { showSpinner, hideSpinner } from '../utils.js';

export default class ImageLoader {
  static DEFAULT_CONFIG = {
    allowedFileType: 'video',
    defaultImageSrc: '/core/media/ui/drop_image_rect_no_border_trans.png',
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
    this.browseButton.innerHTML = `📂 ${this.config.label || 'Browse'}`;
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

    this.imgElement = document.createElement('img');
    this.imgElement.src = this.config.defaultImageSrc;
    this.setElementStyles(this.imgElement);

    this.imageDropArea.appendChild(this.imgElement);
    this.container.appendChild(this.imageDropArea);

    this.fileInputElement = document.createElement('input');
    this.fileInputElement.type = 'file';
    // this.fileInputElement.accept = `${this.config.allowedFileType}/*`;
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

    this.handleDoubleClick = (e) => this.onDoubleClick(e);
    this.imageDropArea.addEventListener('dblclick', this.handleDoubleClick, false);

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

    this.imageDropArea.removeEventListener('dblclick', this.handleDoubleClick, false);

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
    const file = e.dataTransfer.files[0];
    if (file) {
      this.handleFile(file);
    }
  }

  onDoubleClick(e) {
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
    // if (!this.isFileTypeAllowed(file)) {
    //   this.showErrorMessage(`Unsupported file type. Please select a ${this.config.allowedFileType} file.`);
    //   return;
    // }

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

  // isFileTypeAllowed(file) {
  //   return file.type.startsWith(`${this.config.allowedFileType}/`);
  // }

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
    const safeImages = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const safeVideos = ['video/mp4', 'video/webm', 'video/ogg'];

    if (safeImages.includes(file.type)) {
      this.displayImage(src);
    } else if (safeVideos.includes(file.type)) {
      this.displayVideo(src);
    } else {
      console.error("Untrusted or unsupported file type:", file.type);
      // Optionally revoke the URL if you don't use it
      URL.revokeObjectURL(src);
    }
  }


  displayImage(src) {
    if (!(this.imgElement instanceof HTMLImageElement)) {
      const newImgElement = document.createElement('img');
      this.setElementStyles(newImgElement);
      this.imageDropArea.replaceChild(newImgElement, this.imgElement);
      this.imgElement = newImgElement;
    }
    this.imgElement.onload = () => URL.revokeObjectURL(src);
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
    this.imgElement.onloadedmetadata = () => URL.revokeObjectURL(src);
    this.imgElement.onerror = () => URL.revokeObjectURL(src);
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
      this.createModalUI(files);
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
    header.innerHTML = '<h3 style="margin:0; color:var(--color-primary-text)">Select Input File</h3>';

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

      const mediaUrl = `/view?filename=${encodeURIComponent(filename)}&type=input`;
      const isVideo = this.guessMimeType(filename).startsWith('video/');

      let mediaEl;
      if (isVideo) {
        mediaEl = document.createElement('video');
        mediaEl.src = mediaUrl;
        mediaEl.muted = true;
      } else {
        mediaEl = document.createElement('img');
        mediaEl.src = mediaUrl;
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
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(ext)) return 'image/' + ext;
    if (['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext)) return 'video/' + ext;
    return 'application/octet-stream';
  }
}
