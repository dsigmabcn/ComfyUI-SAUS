"""Standalone tests for :mod:`saus.model_scan`."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from saus import model_scan as ms  # noqa: E402


def test_split_name():
    assert ms.split_name("FLUX/flux1-dev.safetensors") == ("flux1-dev.safetensors", "FLUX")
    assert ms.split_name("ae.safetensors") == ("ae.safetensors", "")
    assert ms.split_name("a\\b\\c.safetensors") == ("c.safetensors", "a/b")


def test_target_dir():
    assert ms.target_dir("diffusion_models", "FLUX") == "/diffusion_models/FLUX/"
    assert ms.target_dir("vae", "") == "/vae/"


def test_looks_like_model():
    assert ms.looks_like_model("x.safetensors")
    assert ms.looks_like_model("x.GGUF")
    assert not ms.looks_like_model("note.txt")


def test_parse_model_links_markdown():
    text = ("## Model Links\n"
            "- [repo](https://huggingface.co/Comfy-Org/Qwen-Image-2.1)\n"
            "- [a.safetensors](https://huggingface.co/x/resolve/main/diffusion_models/a.safetensors)\n")
    cat = ms.parse_model_links(text)
    assert cat["a.safetensors"]["url"].endswith("/a.safetensors")
    assert cat["a.safetensors"]["directory"] == "diffusion_models"


def test_parse_model_links_tree_plain_and_emoji():
    plain = ("models/\n"
             "\u251c\u2500\u2500 diffusion_models/\n"
             "\u2502   \u251c\u2500\u2500 a.safetensors\n"
             "\u2514\u2500\u2500 vae/\n"
             "    \u2514\u2500\u2500 b_vae.safetensors\n")
    cat = ms.parse_model_links(plain)
    assert cat["a.safetensors"]["directory"] == "diffusion_models"
    assert cat["b_vae.safetensors"]["directory"] == "vae"

    emoji = ("\U0001F4C2 models/\n"
             "\u251c\u2500\u2500 \U0001F4C2 loras/\n"
             "\u2502   \u251c\u2500\u2500 l.safetensors\n")
    assert ms.parse_model_links(emoji)["l.safetensors"]["directory"] == "loras"


def test_scan_api_workflow():
    wf = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "FLUX/flux1-dev.safetensors"}},
        "13": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "DualCLIPLoader", "inputs": {"clip_name1": "t5xxl.safetensors", "clip_name2": "clip_l.safetensors"}},
        "9": {"class_type": "KSampler", "inputs": {"steps": 20}},
    }
    res = ms.scan(wf, api=True)
    names = {m["filename"] for m in res["models"]}
    assert names == {"flux1-dev.safetensors", "ae.safetensors", "t5xxl.safetensors", "clip_l.safetensors"}
    flux = next(m for m in res["models"] if m["filename"] == "flux1-dev.safetensors")
    assert flux["type"] == "Diffusion model"
    assert flux["target"] == "/diffusion_models/FLUX/"


def test_scan_ui_workflow_subgraphs():
    ui = {
        "nodes": [
            {"id": 1, "type": "MarkdownNote", "widgets_values": [
                "- [a.safetensors](https://huggingface.co/x/resolve/main/diffusion_models/a.safetensors)"]},
            {"id": 2, "type": "UNETLoader", "widgets_values": ["a.safetensors", "default"]},
            {"id": 3, "type": "Group", "definitions": {"subgraphs": [
                {"id": "sub-1", "nodes": [
                    {"id": 10, "type": "VAELoader", "widgets_values": ["vae.safetensors"]},
                ]},
            ]}},
        ],
    }
    res = ms.scan(ui)
    names = {m["filename"] for m in res["models"]}
    assert names == {"a.safetensors", "vae.safetensors"}
    a = next(m for m in res["models"] if m["filename"] == "a.safetensors")
    assert a["url"].endswith("/a.safetensors")  # URL came from the note (subgraph-aware)
    assert a["type"] == "Diffusion model"


def _run_all():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for test in tests:
        test()
        print(f"  ok  {test.__name__}")
    print(f"{len(tests)} passed")


if __name__ == "__main__":
    _run_all()
