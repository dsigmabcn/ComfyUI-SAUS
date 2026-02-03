import os
import re
import base64
import json
import hashlib
import urllib.parse
from pathlib import Path
import secrets
from itertools import cycle
import stat

from .constants import (
    SAUS_APPS_PATH, DATA_DIR, ALLOWED_EXTENSIONS, logger, SAUSMSG,
    PREVIEWS_REGISTRY_DIR, PREVIEWS_IMAGES_DIR, FILE_REGISTRY_DIR, FILE_IMAGES_DIR
)

def ensure_data_folders():
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        PREVIEWS_REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
        PREVIEWS_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        FILE_REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
        FILE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.error(f"{SAUSMSG}: Could not create data dirs: {e}")

def pathToKey(model_path: str) -> str:
    return model_path.replace('\\', '/')

def find_app_path(SAUS_url: str) -> Path:
    p = SAUS_APPS_PATH / SAUS_url
    if p.exists() and p.is_dir():
        return p
    for p in SAUS_APPS_PATH.rglob(SAUS_url):
        if p.is_dir() and p.name == SAUS_url:
            return p
    return None

def get_filename_only(model_path: str) -> str:
    fwd = pathToKey(model_path)
    return os.path.basename(fwd)

def get_preview_id(model_path: str) -> str:
    filename = get_filename_only(model_path)
    h = hashlib.sha1(filename.encode('utf-8')).hexdigest()
    return h[:16]

def get_preview_paths(preview_id: str):
    sub1 = preview_id[0]
    sub2 = preview_id[:2]
    registry_json = PREVIEWS_REGISTRY_DIR / sub1 / sub2 / f"{preview_id}.json"
    image_folder = PREVIEWS_IMAGES_DIR / sub1 / sub2 / preview_id
    return registry_json, image_folder

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def remove_readonly(func, path, excinfo):
    os.chmod(path, stat.S_IWRITE)
    func(path)

def extract_filename_from_response(resp, url):
    for key, value in resp.headers.items():
        if 'content-disposition' in key.lower():
            match = re.search(r'filename="?([^"]+)"?', value)
            if match:
                return match.group(1)
    parsed_url = urllib.parse.urlparse(url)
    return os.path.basename(parsed_url.path)

def get_or_create_key():
    ensure_data_folders()
    key_file = DATA_DIR / ".secret.key"
    if not key_file.exists():
        key = secrets.token_bytes(32)
        with open(key_file, 'wb') as f:
            f.write(key)
    
    with open(key_file, 'rb') as f:
        return f.read()

def encrypt_value(plain_text):
    if not plain_text: return ""
    try:
        key = get_or_create_key()
        encrypted = bytes(a ^ b for a, b in zip(plain_text.encode('utf-8'), cycle(key)))
        return "ENC:" + base64.b64encode(encrypted).decode('utf-8')
    except Exception as e:
        logger.error(f"{SAUSMSG}: Encryption failed: {e}")
        return plain_text

def decrypt_value(encrypted_text):
    if not encrypted_text or not isinstance(encrypted_text, str): return ""
    if not encrypted_text.startswith("ENC:"):
        return encrypted_text
    
    try:
        raw_b64 = encrypted_text[4:]
        key = get_or_create_key()
        encrypted_bytes = base64.b64decode(raw_b64)
        decrypted = bytes(a ^ b for a, b in zip(encrypted_bytes, cycle(key)))
        return decrypted.decode('utf-8')
    except Exception as e:
        logger.error(f"{SAUSMSG}: Decryption failed: {e}")
        return ""